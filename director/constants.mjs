// Iron Director — Autonomous AI Swarm Supervisor Core Constants
// Grounded in deterministic state transitions, strict RBAC, and circuit-breaker telemetry.

export const TASK_STATES = Object.freeze({
  PROPOSED: 'PROPOSED',       // Discovered / created, awaiting queue
  QUEUED: 'QUEUED',           // Validated, placed in ledger queue
  CLAIMED: 'CLAIMED',         // Acquired by a worker/subagent with active lease
  RUNNING: 'RUNNING',         // Active execution in progress
  VERIFYING: 'VERIFYING',     // Quality gate & deterministic checks
  DONE: 'DONE',               // Verified passed & committed/completed
  RETRYING: 'RETRYING',       // Transient error, backoff active
  HANDOFF: 'HANDOFF',         // Primary model failed, transferred to backup
  BLOCKED: 'BLOCKED',         // Requires external fix or all providers down
  ESCALATED: 'ESCALATED',     // Alert sent to human / Bos Telegram
  FAILED: 'FAILED'            // Terminal failure after exhaustive handoffs
});

export const TASK_ROLES = Object.freeze({
  SUPERVISOR: 'hermes-director', // Dispatcher, state guardian, heartbeat monitor
  SCOUT: 'gemini-worker',        // Fast triage, SERP clustering, rapid diagnosis
  REASONER: 'claude-worker',     // Deep reasoning, technical copy, complex refactors
  INSPECTOR: 'codex-worker',     // AST inspection, patch generation, test review
  VERIFIER: 'quality-gate'       // Deterministic code/schema/build gatekeeper
});

export const TASK_PERMISSIONS = Object.freeze({
  READ: 'READ',
  WRITE_CODE: 'WRITE_CODE',
  DEPLOY: 'DEPLOY',
  PUBLISH: 'PUBLISH',
  ADS_MUTATION: 'ADS_MUTATION'
});

export const CIRCUIT_STATE = Object.freeze({
  CLOSED: 'CLOSED',       // Normal operation, all traffic allowed
  HALF_OPEN: 'HALF_OPEN', // Trial probe after cooldown
  OPEN: 'OPEN'            // Tripped, traffic diverted to backup provider
});

export const FAILURE_CLASSIFICATION = Object.freeze({
  TRANSIENT_PROVIDER_FAILURE: 'TRANSIENT_PROVIDER_FAILURE', // 429, 503, timeout, high demand
  BAD_REQUEST_FAILURE: 'BAD_REQUEST_FAILURE',               // 400 invalid prompt/payload
  VERIFICATION_FAILURE: 'VERIFICATION_FAILURE',             // Failed AST, schema, or test
  SYSTEM_ERROR: 'SYSTEM_ERROR'                              // Disk, network, or process crash
});

export const DEFAULT_DIRECTOR_CONFIG = Object.freeze({
  heartbeatTimeoutMs: 120_000,      // 2 minutes without heartbeat = stuck worker
  maxRetriesPerModel: 3,            // Max retry before cross-model handoff
  reconciliationIntervalMs: 30_000, // Reconcile stuck tasks every 30s
  circuitBreakerThreshold: 3,       // 3 consecutive 5xx/429 = trip circuit
  circuitBreakerCooldownMs: 60_000, // 60s before half-open probe
  maxHandoffs: 3                    // Max transfers across models
});
