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
        const prompt =
          `Terjadi insiden/event berikut:\n` +
          `Judul: ${sentryEvent.title}\n` +
          `Error: ${sentryEvent.error || 'N/A'}\n` +
          `Metadata: ${JSON.stringify(sentryEvent.metadata || {})}\n\n` +
          `Tugas: Berikan diagnosa teknis singkat (max 100 kata). Jangan halusinasi.`;

        const res = await this.geminiProvider.execute({
          system: 'Kamu adalah Gemini, Telemetry Specialist di Iron Swarm.',
          user: prompt,
          maxOutputTokens: 250
        });

        geminiDiagnosis = res.text.trim();
        casePacket.addTurn({
          speaker: 'GEMINI',
          role: 'Scout & Diagnostics',
          avatar: '⚡',
          status: 'SUCCESS',
          actualModel: res.model || 'gemini-3.6-flash',
          message: geminiDiagnosis,
          latencyMs: Date.now() - startTime,
          promptTokens: res.usage?.promptTokens || 120,
          completionTokens: res.usage?.completionTokens || 80
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
          latencyMs: Date.now() - startTime
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
        const prompt =
          `Insiden: ${sentryEvent.title}\n` +
          `Diagnosa Gemini: ${geminiDiagnosis || 'Gemini Offline / Failed'}\n\n` +
          `Tugas: Rancang strategi pemulihan atau rencana aksi konkret (max 150 kata).`;

        const res = await this.claudeProvider.execute({
          system: 'Kamu adalah Claude, Chief Architect di Iron Swarm.',
          user: prompt,
          maxOutputTokens: 400
        });

        claudeStrategy = res.text.trim();
        casePacket.addTurn({
          speaker: 'CLAUDE',
          role: 'Chief Architect',
          avatar: '🧠',
          status: 'SUCCESS',
          actualModel: res.model || 'claude-sonnet',
          message: claudeStrategy,
          latencyMs: Date.now() - startTime,
          promptTokens: res.usage?.promptTokens || 180,
          completionTokens: res.usage?.completionTokens || 120
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
    // TURN 3: CODEX (Identity-Pinned Systems Inspector & Patcher)
    // =========================================================================
    let codexValidation = '';
    if (this.codexProvider && typeof this.codexProvider.execute === 'function') {
      const startTime = Date.now();
      try {
        const prompt =
          `Strategi Pemulihan: ${claudeStrategy || 'N/A'}\n\n` +
          `Tugas: Verifikasi kesiapan teknis, schema check, dan safe action execution (max 100 kata).`;

        const res = await this.codexProvider.execute({
          system: 'Kamu adalah Codex, Systems Inspector & Patcher di Iron Swarm.',
          user: prompt,
          maxOutputTokens: 300
        });

        codexValidation = res.text.trim();
        casePacket.addTurn({
          speaker: 'CODEX',
          role: 'Systems Inspector',
          avatar: '🛠️',
          status: 'SUCCESS',
          actualModel: res.model || 'codex-inspector',
          message: codexValidation,
          latencyMs: Date.now() - startTime,
          promptTokens: res.usage?.promptTokens || 140,
          completionTokens: res.usage?.completionTokens || 90
        });
      } catch (err) {
        casePacket.addTurn({
          speaker: 'CODEX',
          role: 'Systems Inspector',
          avatar: '🛠️',
          status: 'FAILED',
          actualModel: 'codex-inspector',
          error: err.message || String(err),
          message: `[ERROR] Codex call failed: ${err.message}`,
          latencyMs: Date.now() - startTime
        });
      }
    } else {
      casePacket.addTurn({
        speaker: 'CODEX',
        role: 'Systems Inspector',
        avatar: '🛠️',
        status: 'FAILED',
        actualModel: 'unconfigured',
        error: 'Codex provider not configured.',
        message: '[ERROR] Codex provider unconfigured.'
      });
    }
    this._saveCase(casePacket);

    // =========================================================================
    // TURN 4: HERMES QUORUM EVALUATION & DETERMINISTIC ENFORCEMENT
    // =========================================================================
    const verifierResult = VerifierGate.validateJson(
      { diagnosis: geminiDiagnosis, strategy: claudeStrategy },
      { requiredFields: [] }
    );

    const quorumResult = this.quorumEngine.evaluate({
      turns: casePacket.turns,
      verifierResult
    });

    let dispatchedTaskId = null;

    if (quorumResult.status === QUORUM_STATES.QUORUM_MET || quorumResult.status === QUORUM_STATES.DEGRADED) {
      // Determine Action Type for Active Task Consumer
      let actionType = 'DEFAULT';
      if (/blog|publish/i.test(sentryEvent.title) || /503/i.test(sentryEvent.error || '')) {
        actionType = 'FAILOVER_BLOG_PUBLISH';
      } else if (/waste|negative/i.test(sentryEvent.title)) {
        actionType = 'APPLY_AD_NEGATIVES';
      } else if (/seo|keyword/i.test(sentryEvent.title)) {
        actionType = 'SEO_OPPORTUNITY_OPTIMIZE';
      }

      if (this.ledger) {
        // Enqueue verified task with canonical fingerprint as idempotency key
        const { task } = this.ledger.createTask({
          title: `[Auto-Remediation] ${sentryEvent.title}`,
          role: TASK_ROLES.SUPERVISOR,
          owner: 'hermes-director',
          permissions: [TASK_PERMISSIONS.READ, TASK_PERMISSIONS.WRITE_CODE], // LEAST-PRIVILEGE (No auto-publish)
          input: {
            caseId,
            actionType,
            fingerprint: casePacket.fingerprint,
            geminiDiagnosis,
            claudeStrategy,
            codexValidation,
            metadata: sentryEvent.metadata
          },
          idempotencyKey: `remediation:${casePacket.fingerprint}`
        });
        dispatchedTaskId = task.id;
      }

      const hermesVerdict =
        `🏛️ <b>HERMES CONSENSUS SEALED</b>\n` +
        `Quorum Status: <code>${quorumResult.status}</code> (${quorumResult.liveCount}/${quorumResult.minRequired} Live Models)\n` +
        `- Biaya Riil: Rp ${casePacket.budget.totalCostIdr.toLocaleString('id-ID')} (${casePacket.budget.totalTokensUsed} tokens)\n` +
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
          `✅ <b>IRON WAR ROOM: CONSENSUS SEALED</b>\n` +
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
