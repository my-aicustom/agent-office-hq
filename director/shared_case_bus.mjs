// Iron Director — Shared Case Bus & Quorum Supervisor
// Replaces fragile group chats with a single-pass, identity-pinned, durable case bus.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { CasePacket } from './case_packet.mjs';
import { PersistentDedup } from './persistent_dedup.mjs';
import { QuorumEngine, QUORUM_STATES } from './quorum_engine.mjs';
import { VerifierGate } from './verifier_gate.mjs';
import { TASK_ROLES, TASK_PERMISSIONS } from './constants.mjs';

const CASES_DIR = path.resolve('data/director/cases');
const EXECUTABLE_ACTIONS = new Set([
  'FAILOVER_BLOG_PUBLISH',
  'APPLY_AD_NEGATIVES',
  'SEO_OPPORTUNITY_OPTIMIZE',
  'HTTP_HEALTH_CHECK'
]);

const VOTE_RESPONSE_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    decision: { type: 'string', enum: ['APPROVE', 'REJECT', 'ESCALATE'] },
    actionType: { type: 'string' },
    rationale: { type: 'string' },
    risks: { type: 'array', items: { type: 'string' }, maxItems: 10 },
    acceptanceCriteria: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 10 }
  },
  required: ['decision', 'actionType', 'rationale', 'risks', 'acceptanceCriteria']
});

function proposedActionFor(event = {}) {
  const requested = String(event.metadata?.requestedActionType || '').toUpperCase();
  return EXECUTABLE_ACTIONS.has(requested) ? requested : 'MANUAL_REVIEW';
}

function parseStructuredVote(text, requiredActionType) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const vote = JSON.parse(fenced ? fenced[1] : raw);
  const normalized = {
    decision: String(vote.decision || '').toUpperCase(),
    actionType: String(vote.actionType || '').toUpperCase(),
    rationale: String(vote.rationale || '').trim(),
    risks: Array.isArray(vote.risks) ? vote.risks.map(String) : [],
    acceptanceCriteria: Array.isArray(vote.acceptanceCriteria)
      ? vote.acceptanceCriteria.map(String).filter(Boolean)
      : []
  };
  if (!['APPROVE', 'REJECT', 'ESCALATE'].includes(normalized.decision)) {
    throw new Error(`Structured vote has invalid decision '${normalized.decision || 'EMPTY'}'.`);
  }
  if (normalized.actionType !== requiredActionType) {
    throw new Error(`Structured vote action '${normalized.actionType || 'EMPTY'}' does not match '${requiredActionType}'.`);
  }
  if (!normalized.rationale) throw new Error('Structured vote rationale is empty.');
  if (normalized.acceptanceCriteria.length === 0) throw new Error('Structured vote acceptance criteria are empty.');
  return normalized;
}

function votePrompt(event, proposedActionType) {
  return (
    `Event title: ${event.title}\n` +
    `Event error: ${event.error || 'N/A'}\n` +
    `Metadata: ${JSON.stringify(event.metadata || {})}\n` +
    `Proposed action: ${proposedActionType}\n\n` +
    'Independently assess this exact action. Return JSON only with: ' +
    'decision (APPROVE, REJECT, or ESCALATE), actionType, rationale, risks (array), ' +
    'acceptanceCriteria (non-empty array). Never claim an external action already happened.'
  );
}

export class SharedCaseBus {
  constructor({
    ledger = null,
    dedup = new PersistentDedup(),
    quorumEngine = new QuorumEngine({ minLiveProviders: 2 }),
    geminiProvider = null,
    claudeProvider = null,
    codexProvider = null,
    telegramNotifier = null
  } = {}) {
    this.ledger = ledger;
    this.dedup = dedup;
    this.quorumEngine = quorumEngine;
    this.geminiProvider = geminiProvider;
    this.claudeProvider = claudeProvider;
    this.codexProvider = codexProvider;
    this.telegramNotifier = telegramNotifier;

    this._ensureDir();
  }

  _ensureDir() {
    try {
      fs.mkdirSync(CASES_DIR, { recursive: true });
    } catch {}
  }

  _saveCase(casePacket) {
    try {
      const filePath = path.join(CASES_DIR, `${casePacket.caseId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(casePacket.toJSON(), null, 2), 'utf8');
    } catch (err) {
      console.error(`[SharedCaseBus] Failed to save case '${casePacket.caseId}': ${err.message}`);
    }
  }

  getCase(caseId) {
    try {
      const filePath = path.join(CASES_DIR, `${caseId}.json`);
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    } catch {}
    return null;
  }

  listCases({ limit = 50, status = null } = {}) {
    try {
      const files = fs.readdirSync(CASES_DIR).filter(f => f.endsWith('.json'));
      const list = [];
      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(CASES_DIR, file), 'utf8');
          const data = JSON.parse(raw);
          if (!status || data.status === status) {
            list.push(data);
          }
        } catch {}
      }
      return list
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, limit);
    } catch {
      return [];
    }
  }

  /**
   * Processes an incident or opportunity through the Single-Pass Assembly Line.
   */
  async processIncident(sentryEvent) {
    const proposedActionType = proposedActionFor(sentryEvent);
    const caseId = `case-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const casePacket = new CasePacket({
      caseId,
      title: sentryEvent.title,
      type: sentryEvent.type,
      severity: sentryEvent.severity || 'HIGH',
      source: sentryEvent.source || 'sentry',
      rawError: sentryEvent.error || null,
      metadata: sentryEvent.metadata || {}
    });

    // 1. Persistent Deduplication Check (Survives Server Restarts)
    if (this.dedup.isDeduplicated(casePacket.fingerprint, { metadata: sentryEvent.metadata })) {
      console.log(`[SharedCaseBus] Incident Fingerprint '${casePacket.fingerprint.slice(0, 12)}' deduplicated. Skipping redundant council.`);
      return { deduplicated: true, fingerprint: casePacket.fingerprint };
    }

    console.log(`\n📦 [CASE CREATED] ID: ${caseId} | Title: "${sentryEvent.title}"`);
    this._saveCase(casePacket);

    // =========================================================================
    // TURN 1: GEMINI (Identity-Pinned Scout & Diagnostics)
    // =========================================================================
    let geminiDiagnosis = '';
    if (this.geminiProvider && typeof this.geminiProvider.execute === 'function') {
      const startTime = Date.now();
      try {
        const prompt = votePrompt(sentryEvent, proposedActionType);

        const res = await this.geminiProvider.execute({
          system: 'Kamu adalah Gemini, Telemetry Specialist di Iron Swarm.',
          user: prompt,
          jsonMode: true,
          jsonSchema: VOTE_RESPONSE_SCHEMA,
          maxOutputTokens: 1000
        });

        const vote = parseStructuredVote(res.text, proposedActionType);
        geminiDiagnosis = vote.rationale;
        casePacket.addTurn({
          speaker: 'GEMINI',
          role: 'Scout & Diagnostics',
          avatar: '⚡',
          status: 'SUCCESS',
          actualModel: res.model || 'gemini-3.6-flash',
          message: vote.rationale,
          latencyMs: Date.now() - startTime,
          promptTokens: res.usage?.promptTokens ?? 0,
          completionTokens: res.usage?.completionTokens ?? 0,
          providerKey: res.provider || 'gemini',
          outboundEvidence: res.outboundEvidence || null,
          vote
        });
      } catch (err) {
        // RECORD ACTUAL FAILURE - NO FAKE CANNED STRINGS!
        casePacket.addTurn({
          speaker: 'GEMINI',
          role: 'Scout & Diagnostics',
          avatar: '⚡',
          status: 'FAILED',
          actualModel: 'gemini-3.6-flash',
          error: err.message || String(err),
          message: `[ERROR] Gemini call failed: ${err.message}`,
          latencyMs: Date.now() - startTime,
          promptTokens: err.usage?.promptTokens ?? 0,
          completionTokens: err.usage?.completionTokens ?? 0,
          outboundEvidence: err.outboundEvidence || null
        });
      }
    } else {
      casePacket.addTurn({
        speaker: 'GEMINI',
        role: 'Scout & Diagnostics',
        avatar: '⚡',
        status: 'FAILED',
        actualModel: 'unconfigured',
        error: 'Gemini provider not configured.',
        message: '[ERROR] Gemini provider unconfigured.'
      });
    }
    this._saveCase(casePacket);

    // =========================================================================
    // TURN 2: CLAUDE (Identity-Pinned Chief Architect & Strategist)
    // =========================================================================
    let claudeStrategy = '';
    if (this.claudeProvider && typeof this.claudeProvider.execute === 'function') {
      const startTime = Date.now();
      try {
        const prompt = votePrompt(sentryEvent, proposedActionType);

        const res = await this.claudeProvider.execute({
          system: 'Kamu adalah Claude, Chief Architect di Iron Swarm.',
          user: prompt,
          maxOutputTokens: 400
        });

        const vote = parseStructuredVote(res.text, proposedActionType);
        claudeStrategy = vote.rationale;
        casePacket.addTurn({
          speaker: 'CLAUDE',
          role: 'Chief Architect',
          avatar: '🧠',
          status: 'SUCCESS',
          actualModel: res.model || 'claude-sonnet',
          message: vote.rationale,
          latencyMs: Date.now() - startTime,
          promptTokens: res.usage?.promptTokens ?? 0,
          completionTokens: res.usage?.completionTokens ?? 0,
          providerKey: res.provider || 'claude',
          outboundEvidence: res.outboundEvidence || null,
          vote
        });
      } catch (err) {
        casePacket.addTurn({
          speaker: 'CLAUDE',
          role: 'Chief Architect',
          avatar: '🧠',
          status: 'FAILED',
          actualModel: 'claude-sonnet',
          error: err.message || String(err),
          message: `[ERROR] Claude call failed: ${err.message}`,
          latencyMs: Date.now() - startTime
        });
      }
    } else {
      casePacket.addTurn({
        speaker: 'CLAUDE',
        role: 'Chief Architect',
        avatar: '🧠',
        status: 'FAILED',
        actualModel: 'unconfigured',
        error: 'Claude provider not configured.',
        message: '[ERROR] Claude provider unconfigured.'
      });
    }
    this._saveCase(casePacket);

    // =========================================================================
    // TURN 3: OPENROUTER MODEL (Identity-Pinned Independent Reviewer)
    // =========================================================================
    let codexValidation = '';
    if (this.codexProvider && typeof this.codexProvider.execute === 'function') {
      const startTime = Date.now();
      try {
        const prompt = votePrompt(sentryEvent, proposedActionType);

        const res = await this.codexProvider.execute({
          system: 'You are an OpenRouter-hosted model acting as an independent systems reviewer.',
          user: prompt,
          jsonMode: true,
          maxOutputTokens: 300
        });

        const vote = parseStructuredVote(res.text, proposedActionType);
        codexValidation = vote.rationale;
        casePacket.addTurn({
          speaker: 'OPENROUTER',
          role: 'Model Router Reviewer',
          avatar: '🛠️',
          status: 'SUCCESS',
          actualModel: res.model || 'codex-inspector',
          message: vote.rationale,
          latencyMs: Date.now() - startTime,
          promptTokens: res.usage?.promptTokens ?? 0,
          completionTokens: res.usage?.completionTokens ?? 0,
          providerKey: res.provider || 'openrouter',
          outboundEvidence: res.outboundEvidence || null,
          vote
        });
      } catch (err) {
        casePacket.addTurn({
          speaker: 'OPENROUTER',
          role: 'Model Router Reviewer',
          avatar: '🛠️',
          status: 'FAILED',
          actualModel: this.codexProvider?.model || 'openrouter-unavailable',
          error: err.message || String(err),
          message: `[ERROR] OpenRouter call failed: ${err.message}`,
          latencyMs: Date.now() - startTime
        });
      }
    } else {
      casePacket.addTurn({
        speaker: 'OPENROUTER',
        role: 'Model Router Reviewer',
        avatar: '🛠️',
        status: 'FAILED',
        actualModel: 'unconfigured',
        error: 'OpenRouter provider not configured.',
        message: '[ERROR] OpenRouter provider unconfigured.'
      });
    }
    this._saveCase(casePacket);

    // =========================================================================
    // TURN 4: HERMES QUORUM EVALUATION & DETERMINISTIC ENFORCEMENT
    // =========================================================================
    const verifierResult = VerifierGate.validateCaseVotes(casePacket.turns, {
      requiredActionType: proposedActionType,
      minApprovals: this.quorumEngine.minLiveProviders
    });

    const quorumResult = this.quorumEngine.evaluate({
      turns: casePacket.turns,
      verifierResult
    });

    let dispatchedTaskId = null;

    if (quorumResult.status === QUORUM_STATES.QUORUM_MET) {
      const actionType = proposedActionType;

      if (this.ledger && EXECUTABLE_ACTIONS.has(actionType)) {
        // Enqueue verified task with canonical fingerprint as idempotency key
        const permissionsByAction = {
          HTTP_HEALTH_CHECK: [TASK_PERMISSIONS.READ],
          FAILOVER_BLOG_PUBLISH: [TASK_PERMISSIONS.READ, TASK_PERMISSIONS.WRITE_CODE, TASK_PERMISSIONS.DEPLOY, TASK_PERMISSIONS.PUBLISH],
          APPLY_AD_NEGATIVES: [TASK_PERMISSIONS.READ, TASK_PERMISSIONS.ADS_MUTATION],
          SEO_OPPORTUNITY_OPTIMIZE: [TASK_PERMISSIONS.READ, TASK_PERMISSIONS.WRITE_CODE]
        };
        const providerVotes = casePacket.turns
          .filter(turn => turn.vote)
          .map(turn => ({ providerKey: turn.providerKey, actualModel: turn.actualModel, vote: turn.vote }));
        const acceptanceCriteria = [...new Set(providerVotes.flatMap(item => item.vote.acceptanceCriteria || []))];
        const { task } = this.ledger.createTask({
          title: `[Auto-Remediation] ${sentryEvent.title}`,
          role: TASK_ROLES.SUPERVISOR,
          owner: 'hermes-director',
          permissions: permissionsByAction[actionType],
          input: {
            caseId,
            actionType,
            fingerprint: casePacket.fingerprint,
            geminiDiagnosis,
            claudeStrategy,
            codexValidation,
            providerVotes,
            acceptanceCriteria,
            metadata: sentryEvent.metadata
          },
          idempotencyKey: `remediation:${casePacket.fingerprint}`
        });
        dispatchedTaskId = task.id;
      }

      const hermesVerdict =
        `🏛️ <b>HERMES VERIFIED ACTION DECISION</b>\n` +
        `Quorum Status: <code>${quorumResult.status}</code> (${quorumResult.liveCount}/${quorumResult.minRequired} Live Models)\n` +
        `- Estimasi biaya: Rp ${casePacket.budget.totalCostIdr.toLocaleString('id-ID')} (${casePacket.budget.totalTokensUsed} tokens)\n` +
        `- Task Ledger ID: <code>${dispatchedTaskId || 'N/A'}</code> (Action: ${dispatchedTaskId ? 'Auto-Enqueued to Consumer' : 'None'})`;

      casePacket.addTurn({
        speaker: 'HERMES',
        role: 'Swarm Director',
        avatar: '🏛️',
        status: 'SUCCESS',
        actualModel: 'hermes-deterministic-v1',
        message: hermesVerdict
      });

      casePacket.seal(quorumResult, dispatchedTaskId);
      this._saveCase(casePacket);

      if (this.telegramNotifier) {
        this.telegramNotifier(
          `✅ <b>IRON WAR ROOM: VERIFIED ACTION DECISION</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `📌 <b>Case:</b> ${sentryEvent.title}\n` +
          `💰 <b>Biaya:</b> Rp ${casePacket.budget.totalCostIdr.toLocaleString('id-ID')} (${casePacket.budget.totalTokensUsed} tokens)\n` +
          `⚙️ <b>Task Enqueued:</b> ${dispatchedTaskId}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
        ).catch(() => {});
      }
    } else {
      // ZERO QUORUM / HARD REJECTION
      const hermesVerdict =
        `🚨 <b>HERMES QUORUM REJECTED (FAIL-FAST)</b>\n` +
        `Alasan: ${quorumResult.reason}\n` +
        `Semua provider gagal atau verifier ditolak. Auto-heal dibatalkan untuk mencegah kerusakan sistem.`;

      casePacket.addTurn({
        speaker: 'HERMES',
        role: 'Swarm Director',
        avatar: '🏛️',
        status: 'FAILED',
        actualModel: 'hermes-deterministic-v1',
        message: hermesVerdict,
        error: quorumResult.reason
      });

      casePacket.seal(quorumResult, null);
      this._saveCase(casePacket);

      if (this.telegramNotifier) {
        this.telegramNotifier(
          `🚨 <b>IRON WAR ROOM: NO QUORUM ALERT</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `📌 <b>Case:</b> ${sentryEvent.title}\n` +
          `❌ <b>Alasan:</b> ${quorumResult.reason}\n` +
          `🛡️ <i>Auto-heal ditahan. Butuh intervensi teknis.</i>`
        ).catch(() => {});
      }
    }

    return casePacket.toJSON();
  }
}
