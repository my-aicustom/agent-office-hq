import { TASK_STATES } from './constants.mjs';
import { VerifierGate } from './verifier_gate.mjs';
import crypto from 'crypto';

const MUTATING_ACTIONS = [
  'FAILOVER_BLOG_PUBLISH',
  'APPLY_AD_NEGATIVES',
  'SEO_OPPORTUNITY_OPTIMIZE'
];

export class ActiveTaskConsumer {
  constructor({
    ledger = null,
    pollIntervalMs = 3000,
    workerId = 'iron-consumer-1',
    executors = {},
    fetchFn = globalThis.fetch
  } = {}) {
    this.ledger = ledger;
    this.pollIntervalMs = pollIntervalMs;
    this.workerId = workerId;
    this.executors = executors;
    this.fetchFn = fetchFn;
    this.handlers = new Map();
    this.timer = null;
    this.isProcessing = false;
    this.executionHistory = [];

    // Register built-in default handlers
    this._registerDefaultHandlers();
  }

  _registerDefaultHandlers() {
    for (const actionType of MUTATING_ACTIONS) {
      const customExecutor = this.executors[actionType];
      if (typeof customExecutor === 'function') this.registerHandler(actionType, customExecutor);
    }

    // Built-in read-only field executor. It produces independently checkable HTTP evidence.
    this.registerHandler('HTTP_HEALTH_CHECK', async (task) => {
      const targetUrl = task.input?.metadata?.targetUrl || task.input?.targetUrl;
      const url = new URL(targetUrl);
      if (url.protocol !== 'https:') {
        const error = new Error('HTTP_HEALTH_CHECK only permits https targets.');
        error.code = 'UNSAFE_TARGET';
        throw error;
      }

      const startedAt = new Date().toISOString();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      let response;
      try {
        response = await this.fetchFn(url, {
          method: 'GET',
          headers: { Accept: 'application/json, text/plain;q=0.9, */*;q=0.1' },
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeout);
      }
      const body = (await response.text()).slice(0, 65_536);
      if (!response.ok) {
        const error = new Error(`Health target returned HTTP ${response.status}.`);
        error.code = 'EXTERNAL_VERIFICATION_FAILED';
        throw error;
      }

      return {
        actionType: 'HTTP_HEALTH_CHECK',
        status: 'VERIFIED',
        externalEffect: 'READ_ONLY',
        evidence: [{
          kind: 'HTTP_RESPONSE',
          targetUrl: url.toString(),
          httpStatus: response.status,
          bodySha256: crypto.createHash('sha256').update(body).digest('hex'),
          startedAt,
          verifiedAt: new Date().toISOString()
        }]
      };
    });
  }

  registerHandler(actionType, fn) {
    this.handlers.set(actionType, fn);
  }

  /**
   * Drains and processes one QUEUED task atomically.
   */
  async processNextTask() {
    if (!this.ledger || this.isProcessing) return null;
    this.isProcessing = true;
    let activeTaskId = null;
    let activeFencingToken = null;

    try {
      let task = null;
      if (typeof this.ledger.claimNextQueuedTask === 'function') {
        task = this.ledger.claimNextQueuedTask({ workerId: this.workerId, leaseTtlMs: 60000 });
        if (!task) {
          this.isProcessing = false;
          return null;
        }
      } else {
        const queuedTasks = this.ledger.listTasks({ state: TASK_STATES.QUEUED, limit: 1 });
        if (queuedTasks.length === 0) {
          this.isProcessing = false;
          return null;
        }
        task = queuedTasks[0];
        if (typeof this.ledger.claimTask === 'function') {
          this.ledger.claimTask(task.id, this.workerId);
        }
      }

      const taskId = task.id;
      activeTaskId = taskId;
      activeFencingToken = task.fencingToken;

      // 2. Mark RUNNING
      this.ledger.transition(taskId, TASK_STATES.RUNNING, {
        actor: this.workerId,
        reason: `ActiveTaskConsumer picked up task from ledger`,
        fencingToken: activeFencingToken
      });

      // 3. Determine handler
      const actionType = task.input?.actionType || 'DEFAULT';
      const handler = this.handlers.get(actionType);
      if (!handler) {
        const error = new Error(`No real executor configured for action '${actionType}'.`);
        error.code = 'ACTION_EXECUTOR_NOT_CONFIGURED';
        throw error;
      }

      const startTime = Date.now();
      const leaseTtlMs = 60000;
      if (typeof this.ledger.heartbeat === 'function') {
        const heartbeatAccepted = this.ledger.heartbeat(taskId, this.workerId, {
          fencingToken: activeFencingToken,
          leaseTtlMs
        });
        if (!heartbeatAccepted) {
          throw new Error(`Worker lease was lost before execution for task '${taskId}'.`);
        }
      }

      // 4. Execute Work
      let heartbeatTimer = null;
      if (typeof this.ledger.heartbeat === 'function') {
        heartbeatTimer = setInterval(() => {
          try {
            this.ledger.heartbeat(taskId, this.workerId, {
              fencingToken: activeFencingToken,
              leaseTtlMs
            });
          } catch {}
        }, Math.floor(leaseTtlMs / 3));
      }
      let executionResult;
      try {
        executionResult = await handler(task);
      } finally {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
      }
      const latencyMs = Date.now() - startTime;

      // 5. Verification Gate
      this.ledger.transition(taskId, TASK_STATES.VERIFYING, {
        actor: 'quality-gate',
        reason: 'Validating execution output integrity',
        fencingToken: activeFencingToken
      });

      const verification = VerifierGate.verifyArtifact(executionResult, {
        type: 'json',
        rules: {
          requiredFields: ['actionType', 'status', 'evidence'],
          arrayBounds: { evidence: { min: 1, max: 20 } }
        }
      });
      if (executionResult?.status !== 'VERIFIED') {
        verification.passed = false;
        verification.errors.push("Execution status must be 'VERIFIED'.");
      }
      if (!verification.passed) {
        throw new Error(`Task output failed quality gate: ${verification.errors.join('; ')}`);
      }

      const nextState = executionResult?.nextState || TASK_STATES.DONE;
      const allowedPostVerificationStates = new Set([
        TASK_STATES.ARTIFACT_READY,
        TASK_STATES.PR_OPEN,
        TASK_STATES.AWAITING_REVIEW,
        TASK_STATES.DEPLOYED,
        TASK_STATES.DONE
      ]);
      if (!allowedPostVerificationStates.has(nextState)) {
        throw new Error(`Executor requested unsupported post-verification state '${nextState}'.`);
      }
      if (MUTATING_ACTIONS.includes(actionType) && nextState === TASK_STATES.DONE) {
        const productionEvidence = executionResult.evidence.some(item =>
          item?.kind === 'PRODUCTION_HTTP_VERIFICATION'
          && item?.verified === true
          && Number(item?.httpStatus) >= 200
          && Number(item?.httpStatus) < 300
        );
        if (!productionEvidence) {
          throw new Error(`Mutating action '${actionType}' cannot become DONE without verified production HTTP evidence.`);
        }
      }

      // 6. Advance only to the evidence-backed lifecycle state.
      const completedTask = this.ledger.transition(taskId, nextState, {
        actor: this.workerId,
        reason: nextState === TASK_STATES.DONE
          ? 'Task executed to completion and verified by Quality Gate'
          : `Executor produced verified evidence for lifecycle state ${nextState}`,
        output: executionResult,
        evidence: { executionLatencyMs: latencyMs, workerId: this.workerId },
        fencingToken: activeFencingToken
      });

      const logEntry = {
        taskId,
        actionType,
        latencyMs,
        completedAt: new Date().toISOString()
      };
      this.executionHistory.unshift(logEntry);
      if (this.executionHistory.length > 100) this.executionHistory.pop();

      console.log(`[ActiveTaskConsumer] Advanced task '${taskId}' to '${nextState}' in ${latencyMs}ms.`);
      this.isProcessing = false;
      return completedTask;
    } catch (err) {
      console.error(`[ActiveTaskConsumer] Error processing task: ${err.message}`);
      const currentTask = activeTaskId ? this.ledger.getTask(activeTaskId) : null;
      if (currentTask && currentTask.fencingToken === activeFencingToken) {
        const blocked = err.code === 'ACTION_EXECUTOR_NOT_CONFIGURED';
        try {
          this.ledger.transition(activeTaskId, blocked ? TASK_STATES.BLOCKED : TASK_STATES.FAILED, {
            actor: this.workerId,
            reason: err.message,
            evidence: { errorCode: err.code || 'EXECUTION_FAILED', workerId: this.workerId },
            fencingToken: activeFencingToken
          });
        } catch (transitionError) {
          console.error(`[ActiveTaskConsumer] Could not record failure for '${activeTaskId}': ${transitionError.message}`);
        }
        this.isProcessing = false;
        return this.ledger.getTask(activeTaskId);
      }
      this.isProcessing = false;
      return null;
    }
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.processNextTask().catch(() => {});
    }, this.pollIntervalMs);
    console.log(`[ActiveTaskConsumer] Worker '${this.workerId}' active. Polling queue every ${this.pollIntervalMs}ms.`);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
