import { TASK_STATES } from './constants.mjs';
import { VerifierGate } from './verifier_gate.mjs';
import { SeoPageExecutor } from './executors/seo_page_executor.mjs';
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

      // 2. Mark RUNNING
      this.ledger.transition(taskId, TASK_STATES.RUNNING, {
        actor: this.workerId,
        reason: `ActiveTaskConsumer picked up task from ledger`,
        fencingToken: task.fencingToken
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
      this.ledger.heartbeat(taskId, this.workerId);

      // 4. Execute Work
      const executionResult = await handler(task);
      const latencyMs = Date.now() - startTime;

      // 5. Verification Gate
      this.ledger.transition(taskId, TASK_STATES.VERIFYING, {
        actor: 'quality-gate',
        reason: 'Validating execution output integrity'
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

      // 6. Mark DONE
      const completedTask = this.ledger.transition(taskId, TASK_STATES.DONE, {
        actor: this.workerId,
        reason: 'Task executed to completion and verified by Quality Gate',
        output: executionResult,
        evidence: { executionLatencyMs: latencyMs, workerId: this.workerId }
      });

      const logEntry = {
        taskId,
        actionType,
        latencyMs,
        completedAt: new Date().toISOString()
      };
      this.executionHistory.unshift(logEntry);
      if (this.executionHistory.length > 100) this.executionHistory.pop();

      console.log(`[ActiveTaskConsumer] Completed task '${taskId}' in ${latencyMs}ms.`);
      this.isProcessing = false;
      return completedTask;
    } catch (err) {
      console.error(`[ActiveTaskConsumer] Error processing task: ${err.message}`);
      if (activeTaskId && this.ledger.getTask(activeTaskId)) {
        const blocked = err.code === 'ACTION_EXECUTOR_NOT_CONFIGURED';
        this.ledger.transition(activeTaskId, blocked ? TASK_STATES.BLOCKED : TASK_STATES.FAILED, {
          actor: this.workerId,
          reason: err.message,
          evidence: { errorCode: err.code || 'EXECUTION_FAILED', workerId: this.workerId }
        });
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
