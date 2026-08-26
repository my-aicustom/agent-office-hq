// Iron Director — Master Autonomous Swarm Director (Hermes Director)
// 24/7 Supervisor, Task Ledger Guardian, Heartbeat Reconciler & Self-Healing Engine.

import { TASK_STATES, TASK_ROLES, TASK_PERMISSIONS, DEFAULT_DIRECTOR_CONFIG } from './constants.mjs';
import { TaskLedger } from './task_ledger.mjs';
import { CircuitBreaker } from './circuit_breaker.mjs';
import { ProviderRouter } from './providers/provider_router.mjs';
import { VerifierGate } from './verifier_gate.mjs';

export class IronDirector {
  constructor({
    ledger = new TaskLedger(),
    circuitBreaker = new CircuitBreaker(),
    providerRouter = null,
    config = DEFAULT_DIRECTOR_CONFIG,
    telegramNotifier = null
  } = {}) {
    this.ledger = ledger;
    this.circuitBreaker = circuitBreaker;
    this.providerRouter = providerRouter || new ProviderRouter({ circuitBreaker: this.circuitBreaker });
    this.config = { ...DEFAULT_DIRECTOR_CONFIG, ...config };
    this.telegramNotifier = telegramNotifier;
    this.reconcileTimer = null;
  }

  /**
   * Dispatches a job through the Iron Director lifecycle with guaranteed idempotency and self-healing.
   */
  async dispatch({
    title,
    role = TASK_ROLES.SCOUT,
    owner = 'unassigned',
    permissions = [TASK_PERMISSIONS.READ],
    input = {},
    idempotencyKey = null,
    systemPrompt = '',
    userPrompt = '',
    verificationRules = {},
    artifactType = 'json',
    preferredProvider = null
  } = {}) {
    // 1. Task Ledger Registration & Idempotency Gate
    const { task, isDuplicate } = this.ledger.createTask({
      title,
      role,
      owner,
      permissions,
      input,
      idempotencyKey,
      maxAttempts: this.config.maxRetriesPerModel
    });

    if (isDuplicate && (task.state === TASK_STATES.DONE || task.state === TASK_STATES.RUNNING)) {
      console.log(`[IronDirector] Idempotency Hit: Returning active/completed task '${task.id}' [${task.state}]`);
      return task;
    }

    const taskId = task.id;

    // 2. Claim Lease
    this.ledger.claimTask(taskId, owner);

    // 3. Mark RUNNING
    this.ledger.transition(taskId, TASK_STATES.RUNNING, {
      actor: owner,
      reason: `Execution started by ${owner}`
    });

    let currentProvider = preferredProvider;
    let handoffs = 0;
    let resultArtifact = null;

    // 4. Execution & Multi-Model Handoff Loop
    while (handoffs <= this.config.maxHandoffs) {
      try {
        this.ledger.heartbeat(taskId, owner);

        const prompt = userPrompt || (typeof input === 'string' ? input : JSON.stringify(input));
        const res = await this.providerRouter.execute({
          role,
          system: systemPrompt,
          user: prompt,
          preferredProvider: currentProvider,
          jsonMode: artifactType === 'json'
        });

        currentProvider = res.provider;
        let parsed = res.text;

        if (artifactType === 'json') {
          const match = res.text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
          const clean = match ? match[1] : res.text.trim();
          parsed = JSON.parse(clean);
        }

        // 5. Verifier & Quality Gate
        this.ledger.transition(taskId, TASK_STATES.VERIFYING, {
          actor: 'quality-gate',
          reason: 'Checking output against deterministic quality gate',
          activeProvider: res.provider,
          evidence: { routeTrail: res.routeTrail, latencyMs: res.latencyMs }
        });

        const verification = VerifierGate.verifyArtifact(parsed, {
          type: artifactType,
          rules: verificationRules
        });

        if (!verification.passed) {
          throw new Error(`Verification Gate Failed: ${verification.errors.join('; ')}`);
        }

        // 6. Quality Gate Passed -> Mark DONE
        resultArtifact = parsed;
        const completedTask = this.ledger.transition(taskId, TASK_STATES.DONE, {
          actor: 'director',
          reason: 'Quality gate verified successfully',
          output: resultArtifact,
          activeProvider: res.provider
        });

        console.log(`[IronDirector] Task '${taskId}' completed successfully via provider '${res.provider}'.`);
        return completedTask;
      } catch (execErr) {
        handoffs += 1;
        const errMsg = execErr.message || String(execErr);
        console.warn(`[IronDirector] Task '${taskId}' encountered error (handoff ${handoffs}): ${errMsg}`);

        if (handoffs <= this.config.maxHandoffs) {
          // Hand off to next model preserving evidence
          this.ledger.transition(taskId, TASK_STATES.HANDOFF, {
            actor: 'director',
            reason: `Failover handoff ${handoffs} triggered: ${errMsg}`,
            evidence: { error: errMsg, failedProvider: currentProvider }
          });
          // Swap preferred provider to next candidate
          currentProvider = null; // Let router pick next available
        } else {
          // Exhausted all handoffs -> Escalate
          const escalatedTask = this.ledger.transition(taskId, TASK_STATES.ESCALATED, {
            actor: 'director',
            reason: `Task exhausted all ${this.config.maxHandoffs} handoffs. Final error: ${errMsg}`,
            evidence: { finalError: errMsg }
          });

          if (this.telegramNotifier) {
            this.telegramNotifier(`🚨 <b>IRON DIRECTOR ALERT: Task Escalated</b>\nTask: ${task.title}\nID: ${task.id}\nError: ${errMsg}`).catch(() => {});
          }

          return escalatedTask;
        }
      }
    }
  }

  /**
   * Reconciles abandoned or stalled tasks that lost their heartbeat.
   */
  reconcile() {
    const stuck = this.ledger.getStuckTasks(this.config.heartbeatTimeoutMs);
    for (const t of stuck) {
      console.warn(`[IronDirector] Reconciler: Detected stalled task '${t.id}' (state: ${t.state}, owner: ${t.owner}). Recovering...`);
      try {
        this.ledger.transition(t.id, TASK_STATES.RETRYING, {
          actor: 'reconciler',
          reason: `Heartbeat timed out (> ${this.config.heartbeatTimeoutMs}ms). Re-queueing for recovery.`
        });
      } catch (e) {
        console.error(`[IronDirector] Failed to recover task '${t.id}': ${e.message}`);
      }
    }
    return { reconciledCount: stuck.length, tasks: stuck.map(t => t.id) };
  }

  startDaemon() {
    if (this.reconcileTimer) return;
    this.reconcileTimer = setInterval(() => {
      this.reconcile();
    }, this.config.reconciliationIntervalMs);
    console.log(`[IronDirector] Daemon active. Reconciling every ${this.config.reconciliationIntervalMs / 1000}s.`);
  }

  stopDaemon() {
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer);
      this.reconcileTimer = null;
    }
  }

  getTelemetry() {
    const allTasks = this.ledger.listTasks({ limit: 500 });
    const counts = {};
    for (const s of Object.values(TASK_STATES)) counts[s] = 0;
    for (const t of allTasks) {
      counts[t.state] = (counts[t.state] || 0) + 1;
    }

    return {
      status: 'ONLINE',
      uptimeSeconds: Math.round(process.uptime()),
      taskCounts: counts,
      recentTasks: allTasks.slice(0, 15),
      providers: this.providerRouter.getTelemetry()
    };
  }
}
