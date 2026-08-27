import { TASK_STATES, TASK_ROLES, TASK_PERMISSIONS, DEFAULT_DIRECTOR_CONFIG } from './constants.mjs';
import { TaskLedger } from './task_ledger.mjs';
import { TaskLedgerDb } from './task_ledger_db.mjs';
import { CircuitBreaker } from './circuit_breaker.mjs';
import { ProviderRouter } from './providers/provider_router.mjs';
import { VerifierGate } from './verifier_gate.mjs';
import { SentryWatcher } from './sentry_watcher.mjs';
import { PersistentDedup } from './persistent_dedup.mjs';
import { QuorumEngine } from './quorum_engine.mjs';
import { ActiveTaskConsumer } from './active_task_consumer.mjs';
import { SharedCaseBus } from './shared_case_bus.mjs';
import { SeoPageExecutor } from './executors/seo_page_executor.mjs';

export class IronDirector {
  constructor({
    ledger = null,
    circuitBreaker = new CircuitBreaker(),
    providerRouter = null,
    config = DEFAULT_DIRECTOR_CONFIG,
    telegramNotifier = null
  } = {}) {
    this.ledger = ledger || new TaskLedgerDb();
    this.circuitBreaker = circuitBreaker;
    this.providerRouter = providerRouter || new ProviderRouter({ circuitBreaker: this.circuitBreaker });
    this.config = { ...DEFAULT_DIRECTOR_CONFIG, ...config };
    this.telegramNotifier = telegramNotifier;
    this.reconcileTimer = null;

    // 1. Persistent Dedup Engine (Disk-backed SHA-256)
    this.dedup = new PersistentDedup();

    // 2. Strict Quorum Engine (Zero fake consensus)
    this.quorumEngine = new QuorumEngine({ minLiveProviders: 2 });

    const seoExecutor = new SeoPageExecutor();

    // 3. Evidence-gated task consumer (unconfigured mutations fail closed)
    this.consumer = new ActiveTaskConsumer({
      ledger: this.ledger,
      pollIntervalMs: 3000,
      workerId: 'hermes-worker-primary',
      executors: {
        SEO_OPPORTUNITY_OPTIMIZE: async (task) => {
          const keyword = task.input?.keyword || task.title?.replace(/^.*:\s*/, '') || 'jasa-laser-cutting-custom';
          const result = await seoExecutor.execute({
            taskId: task.id,
            keyword,
            intent: task.input?.intent || 'commercial',
            cluster: task.input?.cluster || 'stainless',
            targetUrl: task.input?.targetUrl || null,
            gscEvidence: task.input?.gscEvidence || null
          });
          return {
            actionType: 'SEO_OPPORTUNITY_OPTIMIZE',
            status: 'VERIFIED',
            nextState: TASK_STATES.ARTIFACT_READY,
            externalEffect: 'LOCAL_DRAFT_CREATED',
            evidence: [{
              kind: 'SEO_PAGE_ARTIFACT',
              filePath: result.filePath,
              artifactHash: result.artifactHash,
              git: result.git,
              wordCount: result.wordCount,
              verifiedAt: new Date().toISOString()
            }]
          };
        }
      }
    });

    // 4. Shared Case Bus (Single-Pass Multi-Brain Assembly)
    this.caseBus = new SharedCaseBus({
      ledger: this.ledger,
      dedup: this.dedup,
      quorumEngine: this.quorumEngine,
      geminiProvider: this.providerRouter?.providers?.get ? this.providerRouter.providers.get('gemini') : null,
      claudeProvider: this.providerRouter?.providers?.get ? this.providerRouter.providers.get('claude') : null,
      codexProvider: this.providerRouter?.providers?.get ? this.providerRouter.providers.get('openrouter') : null,
      telegramNotifier: this.telegramNotifier
    });

    // 5. Sentry Watcher (24/7 Incident Monitor)
    this.sentry = new SentryWatcher({ ledger: this.ledger, circuitBreaker: this.circuitBreaker });

    // Wire Sentry alerts directly into the Shared Case Bus
    this.sentry.on('sentry_alert', async (event) => {
      try {
        await this.caseBus.processIncident(event);
      } catch (err) {
        console.error(`[IronDirector] Case Bus auto-process error: ${err.message}`);
      }
    });
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
    const registration = this.ledger.createTask({
      title,
      role,
      owner,
      permissions,
      input,
      idempotencyKey,
      maxAttempts: this.config.maxRetriesPerModel
    });
    const task = registration.task;
    const isDuplicate = registration.isDuplicate ?? registration.created === false;

    if (isDuplicate && (task.state === TASK_STATES.DONE || task.state === TASK_STATES.RUNNING)) {
      console.log(`[IronDirector] Idempotency Hit: Returning active/completed task '${task.id}' [${task.state}]`);
      return task;
    }

    const taskId = task.id;

    // 2. Claim Lease
    const leasedTask = this.ledger.claimTask(taskId, owner);
    const fencingToken = leasedTask?.fencingToken ?? null;

    // 3. Mark RUNNING
    this.ledger.transition(taskId, TASK_STATES.RUNNING, {
      actor: owner,
      reason: `Execution started by ${owner}`,
      fencingToken
    });

    let currentProvider = preferredProvider;
    let handoffs = 0;
    let resultArtifact = null;

    // 4. Execution & Multi-Model Handoff Loop
    while (handoffs <= this.config.maxHandoffs) {
      try {
        const currentTask = this.ledger.getTask(taskId);
        if (currentTask?.state === TASK_STATES.HANDOFF || currentTask?.state === TASK_STATES.RETRYING) {
          this.ledger.transition(taskId, TASK_STATES.RUNNING, {
            actor: owner,
            reason: 'Resuming execution after provider handoff',
            fencingToken
          });
        }
        this.ledger.heartbeat(taskId, owner, fencingToken === null ? undefined : {
          fencingToken,
          leaseTtlMs: this.config.heartbeatTimeoutMs
        });

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
          evidence: { routeTrail: res.routeTrail, latencyMs: res.latencyMs },
          fencingToken
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
          activeProvider: res.provider,
          fencingToken
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
            evidence: { error: errMsg, failedProvider: currentProvider },
            fencingToken
          });
          currentProvider = null; // Let router pick next available
        } else {
          // Exhausted all handoffs -> Escalate
          const escalatedTask = this.ledger.transition(taskId, TASK_STATES.ESCALATED, {
            actor: 'director',
            reason: `Task exhausted all ${this.config.maxHandoffs} handoffs. Final error: ${errMsg}`,
            evidence: { finalError: errMsg },
            fencingToken
          });

          // Trigger Sentry pipeline alert
          this.sentry.reportPipelineFailure({
            pipelineName: task.title,
            error: errMsg,
            runId: taskId
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
    const stalledEvents = this.sentry.scanStalledWorkers(this.config.heartbeatTimeoutMs);
    if (typeof this.ledger.recoverExpiredLeases === 'function') {
      const recovered = this.ledger.recoverExpiredLeases();
      return {
        reconciledCount: recovered.length,
        stalledEventsCount: stalledEvents.length,
        tasks: recovered.map(task => task.id)
      };
    }
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
    return {
      reconciledCount: stuck.length,
      stalledEventsCount: stalledEvents.length,
      tasks: stuck.map(t => t.id)
    };
  }

  startDaemon() {
    // 1. Start Reconciler sweep
    if (!this.reconcileTimer) {
      this.reconcileTimer = setInterval(() => {
        this.reconcile();
      }, this.config.reconciliationIntervalMs);
    }
    // 2. Start Active Task Consumer
    this.consumer.start();
    console.log(`[IronDirector] Daemon active with Sentry, Quorum Engine & Active Consumer.`);
  }

  stopDaemon() {
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer);
      this.reconcileTimer = null;
    }
    this.consumer.stop();
  }

  getTelemetry() {
    const allTasks = this.ledger.listTasks({ limit: 500 });
    const counts = {};
    for (const s of Object.values(TASK_STATES)) counts[s] = 0;
    for (const t of allTasks) {
      counts[t.state] = (counts[t.state] || 0) + 1;
    }

    const recentCases = this.caseBus.listCases({ limit: 10 });
    const totalCostIdr = recentCases.reduce((acc, c) => acc + (c.budget?.totalCostIdr || 0), 0);
    const totalTokens = recentCases.reduce((acc, c) => acc + (c.budget?.totalTokensUsed || 0), 0);

    return {
      status: 'ONLINE',
      uptimeSeconds: Math.round(process.uptime()),
      taskCounts: counts,
      recentTasks: allTasks.slice(0, 15),
      recentCases,
      costAccounting: {
        totalCostIdr: Math.round(totalCostIdr * 100) / 100,
        totalTokens
      },
      providers: this.providerRouter.getTelemetry()
    };
  }
}
