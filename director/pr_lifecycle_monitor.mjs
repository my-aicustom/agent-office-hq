import crypto from 'crypto';

import { TASK_STATES } from './constants.mjs';

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function draftPrEvidence(task) {
  return task?.output?.evidence?.find(item => item?.kind === 'DRAFT_PULL_REQUEST') || null;
}

function productionUrlFor(evidence, baseUrl) {
  const match = String(evidence?.targetPath || '').match(/^src\/content\/blog\/([^/]+)\.md$/);
  if (!match) return null;
  return new URL(`/blog/${match[1]}/`, baseUrl).toString();
}

export class PrLifecycleMonitor {
  constructor({
    ledger,
    enabled = process.env.PR_LIFECYCLE_MONITOR_ENABLED === 'true',
    githubToken = process.env.SEO_TARGET_GITHUB_API_TOKEN || process.env.GITHUB_TOKEN,
    productionBaseUrl = process.env.SEO_PRODUCTION_BASE_URL || 'https://tepatlaser.com',
    intervalMs = positiveNumber(process.env.PR_LIFECYCLE_MONITOR_INTERVAL_MS, 5 * 60 * 1000),
    fetchFn = globalThis.fetch,
    logger = console
  } = {}) {
    this.ledger = ledger;
    this.enabled = Boolean(enabled);
    this.githubToken = githubToken;
    this.productionBaseUrl = productionBaseUrl;
    this.intervalMs = intervalMs;
    this.fetchFn = fetchFn;
    this.logger = logger;
    this.timer = null;
    this.running = false;
    this.lastSweep = null;
  }

  async _githubJson(pathname) {
    if (!this.githubToken) throw new Error('SEO_TARGET_GITHUB_API_TOKEN is not configured.');
    const response = await this.fetchFn(`https://api.github.com${pathname}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.githubToken}`,
        'User-Agent': 'agent-office-hq-lifecycle-monitor',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`GitHub API ${pathname} returned HTTP ${response.status}.`);
    return body;
  }

  async _verifyChecks(repository, sha) {
    const result = await this._githubJson(`/repos/${repository}/commits/${sha}/check-runs?per_page=100`);
    const checks = Array.isArray(result.check_runs) ? result.check_runs : [];

    // Security Gate: Any failing or cancelled check run (including CodeQL) MUST block verification
    const failingChecks = checks.filter(check =>
      ['failure', 'cancelled', 'timed_out', 'action_required'].includes(String(check.conclusion || '').toLowerCase())
    );
    if (failingChecks.length > 0) {
      return {
        verified: false,
        reason: `CI/Security checks failed: ${failingChecks.map(c => c.name).join(', ')}`,
        checks: checks.map(check => ({ name: check.name, status: check.status, conclusion: check.conclusion, url: check.html_url }))
      };
    }

    const required = checks.filter(check => !String(check.name || '').startsWith('CodeQL'));
    return {
      verified: required.length > 0 && required.every(check => check.status === 'completed' && check.conclusion === 'success'),
      checks: required.map(check => ({ name: check.name, status: check.status, conclusion: check.conclusion, url: check.html_url }))
    };
  }

  async _advanceAwaitingReview(task) {
    const evidence = draftPrEvidence(task);
    if (!evidence?.repository || !evidence?.prNumber || !evidence?.commitSha) return null;
    const pr = await this._githubJson(`/repos/${evidence.repository}/pulls/${evidence.prNumber}`);

    if (pr.state === 'closed' && !pr.merged_at) {
      return this.ledger.transition(task.id, TASK_STATES.BLOCKED, {
        actor: 'pr-lifecycle-monitor',
        reason: `Draft PR #${evidence.prNumber} was closed without merge.`,
        evidence: { kind: 'PULL_REQUEST_CLOSED', prUrl: evidence.prUrl, verifiedAt: new Date().toISOString() }
      });
    }
    if (!pr.merged_at || !pr.merge_commit_sha) return null;

    const checkResult = await this._verifyChecks(evidence.repository, pr.merge_commit_sha);
    if (!checkResult.verified) return null;
    const productionUrl = productionUrlFor(evidence, this.productionBaseUrl);
    if (!productionUrl) {
      return this.ledger.transition(task.id, TASK_STATES.BLOCKED, {
        actor: 'pr-lifecycle-monitor',
        reason: 'Merged PR target path cannot be mapped to an allowlisted production URL.',
        evidence: { kind: 'UNMAPPABLE_PRODUCTION_PATH', targetPath: evidence.targetPath }
      });
    }

    const mergedEvidence = {
      kind: 'MERGED_PULL_REQUEST',
      repository: evidence.repository,
      prNumber: evidence.prNumber,
      prUrl: evidence.prUrl,
      mergeCommitSha: pr.merge_commit_sha,
      mergedAt: pr.merged_at,
      checks: checkResult.checks,
      productionUrl,
      verifiedAt: new Date().toISOString()
    };
    return this.ledger.transition(task.id, TASK_STATES.DEPLOYED, {
      actor: 'pr-lifecycle-monitor',
      reason: 'Human-reviewed PR merged and required GitHub checks passed; production read-back pending.',
      output: {
        ...task.output,
        evidence: [...(task.output?.evidence || []), mergedEvidence]
      },
      evidence: mergedEvidence
    });
  }

  async _verifyProduction(task) {
    const merged = task?.output?.evidence?.find(item => item?.kind === 'MERGED_PULL_REQUEST');
    if (!merged?.productionUrl) return null;
    const response = await this.fetchFn(merged.productionUrl, {
      headers: { Accept: 'text/html', 'User-Agent': 'agent-office-hq-production-verifier' }
    });
    const body = await response.text();
    if (!response.ok || !body.trim()) return null;

    const keyword = String(task.input?.metadata?.keyword || task.input?.keyword || '').trim().toLowerCase();
    if (keyword && !body.toLowerCase().includes(keyword)) return null;
    const verification = {
      kind: 'PRODUCTION_HTTP_VERIFICATION',
      verified: true,
      targetUrl: merged.productionUrl,
      httpStatus: response.status,
      bodySha256: crypto.createHash('sha256').update(body).digest('hex'),
      mergeCommitSha: merged.mergeCommitSha,
      verifiedAt: new Date().toISOString()
    };
    return this.ledger.transition(task.id, TASK_STATES.DONE, {
      actor: 'pr-lifecycle-monitor',
      reason: 'Production page returned verified HTTP evidence after reviewed merge and successful CI.',
      output: {
        ...task.output,
        status: 'VERIFIED',
        evidence: [...(task.output?.evidence || []), verification]
      },
      evidence: verification
    });
  }

  async runOnce() {
    if (!this.enabled) return { status: 'DISABLED', checked: 0, advanced: 0 };
    if (this.running) return { status: 'SKIPPED_ALREADY_RUNNING', checked: 0, advanced: 0 };
    if (!this.ledger) throw new Error('PR lifecycle monitor ledger is not configured.');
    if (!this.githubToken) return { status: 'BLOCKED_MISSING_GITHUB_TOKEN', checked: 0, advanced: 0 };

    this.running = true;
    const result = { status: 'SUCCESS', checked: 0, advanced: 0, errors: [], finishedAt: null };
    try {
      const awaiting = this.ledger.listTasks({ state: TASK_STATES.AWAITING_REVIEW, limit: 100 });
      const deployed = this.ledger.listTasks({ state: TASK_STATES.DEPLOYED, limit: 100 });
      for (const task of awaiting) {
        result.checked += 1;
        try {
          if (await this._advanceAwaitingReview(task)) result.advanced += 1;
        } catch (error) {
          result.errors.push({ taskId: task.id, message: error.message });
        }
      }
      for (const originalTask of deployed) {
        result.checked += 1;
        try {
          const task = this.ledger.getTask(originalTask.id);
          if (task?.state === TASK_STATES.DEPLOYED && await this._verifyProduction(task)) result.advanced += 1;
        } catch (error) {
          result.errors.push({ taskId: originalTask.id, message: error.message });
        }
      }
      if (result.errors.length > 0) result.status = 'DEGRADED';
    } finally {
      result.finishedAt = new Date().toISOString();
      this.lastSweep = result;
      this.running = false;
    }
    return result;
  }

  start() {
    if (!this.enabled || this.timer) return false;
    this.timer = setInterval(() => {
      this.runOnce().catch(error => this.logger.error(`[PrLifecycleMonitor] Sweep failed: ${error.message}`));
    }, this.intervalMs);
    this.logger.log(`[PrLifecycleMonitor] Enabled; interval=${this.intervalMs}ms.`);
    return true;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  getStatus() {
    return {
      enabled: this.enabled,
      configured: Boolean(this.githubToken),
      running: this.running,
      intervalMs: this.intervalMs,
      lastSweep: this.lastSweep
    };
  }
}
