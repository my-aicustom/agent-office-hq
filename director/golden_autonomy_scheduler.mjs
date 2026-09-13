import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import { CLASSIFICATIONS, DATA_STATUSES, RECOMMENDATIONS } from '../agents/nadia/constants.mjs';

const DEFAULT_RUNS_PATH = path.resolve('data/director/autonomy_runs.json');
const ELIGIBLE_CLASSIFICATIONS = new Set([
  CLASSIFICATIONS.HIGH_PRIORITY,
  CLASSIFICATIONS.SEO_EXPERIMENT,
  CLASSIFICATIONS.SUPPORTING_CONTENT
]);

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function evidenceFingerprint(opportunity) {
  const source = JSON.stringify({
    opportunityId: opportunity.id,
    recommendation: opportunity.recommendation,
    score: opportunity.opportunityScore,
    gsc: {
      status: opportunity.gsc?.status,
      fetchedAt: opportunity.gsc?.fetchedAt,
      dateRange: opportunity.gsc?.dateRange,
      impressions: opportunity.gsc?.impressions,
      clicks: opportunity.gsc?.clicks,
      position: opportunity.gsc?.position,
      rankingUrls: opportunity.gsc?.rankingUrls
    }
  });
  return crypto.createHash('sha256').update(source).digest('hex');
}

async function readRuns(filePath) {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
    return Array.isArray(parsed.records) ? parsed.records : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function appendRun(filePath, run) {
  const records = await readRuns(filePath);
  records.push(run);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify({
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    records: records.slice(-200)
  }, null, 2), { encoding: 'utf8', flag: 'wx' });
  await fs.rename(tempPath, filePath);
}

export function evaluateAutonomyOpportunity(opportunity, {
  minScore = 50,
  minImpressions = 10,
  minimumPosition = 4,
  maximumPosition = 20,
  cachedEvidenceMaxAgeMs = 24 * 60 * 60 * 1000,
  nowMs = Date.now()
} = {}) {
  const reasons = [];
  const gscStatus = opportunity?.gsc?.status;
  const position = Number(opportunity?.gsc?.position);
  const impressions = Number(opportunity?.gsc?.impressions || 0);

  if (!ELIGIBLE_CLASSIFICATIONS.has(opportunity?.classification)) reasons.push('CLASSIFICATION_NOT_ELIGIBLE');
  if (Number(opportunity?.opportunityScore || 0) < minScore) reasons.push('SCORE_BELOW_THRESHOLD');
  if (opportunity?.recommendation !== RECOMMENDATIONS.CREATE_SUPPORTING_CONTENT) {
    reasons.push('EXECUTOR_RECOMMENDATION_MISMATCH');
  }
  if (![DATA_STATUSES.LIVE, DATA_STATUSES.CACHED].includes(gscStatus)) reasons.push('GSC_EVIDENCE_NOT_TRUSTED');
  if (gscStatus === DATA_STATUSES.CACHED) {
    const fetchedAtMs = Date.parse(opportunity?.gsc?.fetchedAt || '');
    if (!Number.isFinite(fetchedAtMs) || nowMs - fetchedAtMs > cachedEvidenceMaxAgeMs) reasons.push('GSC_CACHE_STALE');
  }
  if (!Number.isFinite(position) || position < minimumPosition || position > maximumPosition) reasons.push('POSITION_OUTSIDE_TARGET_RANGE');
  if (impressions < minImpressions) reasons.push('IMPRESSIONS_BELOW_THRESHOLD');

  return { eligible: reasons.length === 0, reasons };
}

export class GoldenAutonomyScheduler {
  constructor({
    nadiaAgent,
    caseBus,
    ledger,
    enabled = process.env.GOLDEN_AUTONOMY_ENABLED === 'true',
    intervalMs = positiveNumber(process.env.GOLDEN_AUTONOMY_INTERVAL_MS, 6 * 60 * 60 * 1000),
    runOnStart = process.env.GOLDEN_AUTONOMY_RUN_ON_START === 'true',
    maxDispatchesPerRun = positiveNumber(process.env.GOLDEN_AUTONOMY_MAX_DISPATCHES, 1),
    minScore = positiveNumber(process.env.GOLDEN_AUTONOMY_MIN_SCORE, 50),
    minImpressions = positiveNumber(process.env.GOLDEN_AUTONOMY_MIN_IMPRESSIONS, 10),
    maxDailyDispatches = positiveNumber(process.env.GOLDEN_AUTONOMY_MAX_DAILY_DISPATCHES, 2),
    runsPath = process.env.GOLDEN_AUTONOMY_RUNS_PATH || DEFAULT_RUNS_PATH,
    now = () => new Date(),
    logger = console
  } = {}) {
    this.nadiaAgent = nadiaAgent;
    this.caseBus = caseBus;
    this.ledger = ledger;
    this.enabled = Boolean(enabled);
    this.intervalMs = intervalMs;
    this.runOnStart = Boolean(runOnStart);
    this.maxDispatchesPerRun = Math.max(1, Math.min(5, Math.floor(maxDispatchesPerRun)));
    this.maxDailyDispatches = Math.max(1, Math.min(20, Math.floor(maxDailyDispatches)));
    this.minScore = minScore;
    this.minImpressions = minImpressions;
    this.runsPath = path.resolve(runsPath);
    this.now = now;
    this.logger = logger;
    this.timer = null;
    this.running = false;
    this.lastRun = null;
  }

  _hasUnresolvedTask(opportunityId) {
    if (!this.ledger || typeof this.ledger.listTasks !== 'function') return false;
    const resolved = new Set(['DONE', 'FAILED']);
    return this.ledger.listTasks({ limit: 500 }).some(task =>
      task.input?.metadata?.opportunityId === opportunityId && !resolved.has(task.state)
    );
  }

  async runOnce() {
    if (!this.enabled) return { status: 'DISABLED', dispatchedCount: 0 };
    if (this.running) return { status: 'SKIPPED_ALREADY_RUNNING', dispatchedCount: 0 };
    if (!this.nadiaAgent || !this.caseBus) throw new Error('Golden autonomy scheduler dependencies are not configured.');

    this.running = true;
    const startedAt = this.now().toISOString();
    const run = {
      runId: `AUTONOMY-${startedAt.replace(/[-:.TZ]/g, '').slice(0, 14)}-${crypto.randomBytes(3).toString('hex')}`,
      startedAt,
      finishedAt: null,
      status: 'RUNNING',
      analysisRunId: null,
      opportunitiesEvaluated: 0,
      eligibleCount: 0,
      dispatchedCount: 0,
      skipped: [],
      dispatches: [],
      error: null
    };

    try {
      const analysis = await this.nadiaAgent.analyze();
      run.analysisRunId = analysis.run?.runId || null;
      const opportunities = Array.isArray(analysis.opportunities) ? analysis.opportunities : [];
      run.opportunitiesEvaluated = opportunities.length;

      const eligible = [];
      for (const opportunity of opportunities) {
        const decision = evaluateAutonomyOpportunity(opportunity, {
          minScore: this.minScore,
          minImpressions: this.minImpressions,
          nowMs: this.now().getTime()
        });
        if (!decision.eligible) {
          run.skipped.push({ opportunityId: opportunity.id, reasons: decision.reasons });
          continue;
        }
        if (this._hasUnresolvedTask(opportunity.id)) {
          run.skipped.push({ opportunityId: opportunity.id, reasons: ['UNRESOLVED_TASK_EXISTS'] });
          continue;
        }
        eligible.push(opportunity);
      }

      run.eligibleCount = eligible.length;

      // Check daily rate cap to prevent runaway autonomous PR creation
      const pastRuns = await readRuns(this.runsPath);
      const dayAgoMs = this.now().getTime() - 24 * 60 * 60 * 1000;
      const dailyDispatches = pastRuns.reduce((sum, r) => {
        const runTime = Date.parse(r.startedAt);
        if (Number.isFinite(runTime) && runTime >= dayAgoMs) {
          return sum + (Number(r.dispatchedCount) || 0);
        }
        return sum;
      }, 0);

      const remainingDailyQuota = Math.max(0, this.maxDailyDispatches - dailyDispatches);
      if (remainingDailyQuota === 0) {
        this.logger.warn(`[GoldenAutonomy] Daily dispatch limit reached (${dailyDispatches}/${this.maxDailyDispatches}). Throttling to prevent repository flooding.`);
        run.status = 'DAILY_CAP_REACHED';
        run.finishedAt = this.now().toISOString();
        await appendRun(this.runsPath, run);
        this.running = false;
        this.lastRun = run;
        return run;
      }

      const allowedThisRun = Math.min(this.maxDispatchesPerRun, remainingDailyQuota);
      for (const opportunity of eligible.slice(0, allowedThisRun)) {
        const proposal = await this.nadiaAgent.createTask(opportunity.id);
        const fingerprint = evidenceFingerprint(opportunity);
        const casePacket = await this.caseBus.processIncident({
          type: 'OPPORTUNITY:SEO_GOLDEN_LOOP',
          severity: 'OPPORTUNITY',
          source: 'nadia_autonomy_scheduler',
          title: `SEO Opportunity: ${opportunity.primaryKeyword}`,
          error: null,
          metadata: {
            requestedActionType: 'SEO_OPPORTUNITY_OPTIMIZE',
            opportunityId: opportunity.id,
            proposalTaskId: proposal.taskId,
            evidenceFingerprint: fingerprint,
            keyword: opportunity.primaryKeyword,
            intent: opportunity.intent,
            cluster: opportunity.cluster,
            targetUrl: opportunity.existingUrl,
            recommendation: opportunity.recommendation,
            gscEvidence: opportunity.gsc
          }
        });
        run.dispatches.push({
          opportunityId: opportunity.id,
          caseId: casePacket?.caseId || null,
          taskId: casePacket?.dispatchedTaskId || null,
          quorumStatus: casePacket?.quorum?.status || (casePacket?.deduplicated ? 'DEDUPLICATED' : 'UNKNOWN')
        });
        if (casePacket?.dispatchedTaskId) run.dispatchedCount += 1;
      }

      run.status = run.dispatchedCount > 0 ? 'DISPATCHED' : 'NO_ELIGIBLE_DISPATCH';
    } catch (error) {
      run.status = 'FAILED';
      run.error = error.message || String(error);
      this.logger.error(`[GoldenAutonomyScheduler] Run failed: ${run.error}`);
    } finally {
      run.finishedAt = this.now().toISOString();
      this.lastRun = run;
      this.running = false;
      await appendRun(this.runsPath, run).catch(error => {
        this.logger.error(`[GoldenAutonomyScheduler] Could not persist run evidence: ${error.message}`);
      });
    }
    return run;
  }

  start() {
    if (!this.enabled || this.timer) return false;
    if (this.runOnStart) this.runOnce().catch(error => this.logger.error(error));
    this.timer = setInterval(() => {
      this.runOnce().catch(error => this.logger.error(error));
    }, this.intervalMs);
    this.logger.log(`[GoldenAutonomyScheduler] Enabled; interval=${this.intervalMs}ms runOnStart=${this.runOnStart}.`);
    return true;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  getStatus() {
    return {
      enabled: this.enabled,
      running: this.running,
      intervalMs: this.intervalMs,
      runOnStart: this.runOnStart,
      lastRun: this.lastRun
    };
  }
}
