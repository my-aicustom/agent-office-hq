// Unit tests for Iron Director Autonomous Supervisor Architecture

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

import { TASK_STATES, TASK_ROLES, CIRCUIT_STATE } from '../director/constants.mjs';
import { TaskStateMachine } from '../director/state_machine.mjs';
import { CircuitBreaker } from '../director/circuit_breaker.mjs';
import { TaskLedger } from '../director/task_ledger.mjs';
import { VerifierGate } from '../director/verifier_gate.mjs';
import { ProviderRouter } from '../director/providers/provider_router.mjs';
import { IronDirector } from '../director/iron_director.mjs';

const TEST_LEDGER_PATH = path.resolve('data/test-director/test_ledger.json');

function cleanupTestLedger() {
  try {
    if (fs.existsSync(TEST_LEDGER_PATH)) {
      fs.unlinkSync(TEST_LEDGER_PATH);
    }
  } catch {}
}

test('TaskStateMachine allows valid transitions and rejects illegal ones', () => {
  assert.equal(TaskStateMachine.canTransition(TASK_STATES.PROPOSED, TASK_STATES.QUEUED), true);
  assert.equal(TaskStateMachine.canTransition(TASK_STATES.QUEUED, TASK_STATES.CLAIMED), true);
  assert.equal(TaskStateMachine.canTransition(TASK_STATES.CLAIMED, TASK_STATES.RUNNING), true);
  assert.equal(TaskStateMachine.canTransition(TASK_STATES.RUNNING, TASK_STATES.VERIFYING), true);
  assert.equal(TaskStateMachine.canTransition(TASK_STATES.VERIFYING, TASK_STATES.DONE), true);

  // Illegal transitions
  assert.equal(TaskStateMachine.canTransition(TASK_STATES.PROPOSED, TASK_STATES.DONE), false);
  assert.equal(TaskStateMachine.canTransition(TASK_STATES.QUEUED, TASK_STATES.DONE), false);
  assert.equal(TaskStateMachine.canTransition(TASK_STATES.DONE, TASK_STATES.RUNNING), false);

  const initialTask = {
    id: 'test-1',
    state: TASK_STATES.QUEUED,
    history: []
  };

  const updated = TaskStateMachine.transition(initialTask, TASK_STATES.CLAIMED, {
    actor: 'budi',
    reason: 'Claimed by worker'
  });

  assert.equal(updated.state, TASK_STATES.CLAIMED);
  assert.equal(updated.history.length, 1);
  assert.equal(updated.history[0].actor, 'budi');

  assert.throws(() => {
    TaskStateMachine.transition(updated, TASK_STATES.DONE);
  }, /Illegal state transition/);
});

test('CircuitBreaker trips to OPEN after threshold failures and probes in HALF_OPEN', () => {
  const cb = new CircuitBreaker({ threshold: 3, cooldownMs: 100 });
  assert.equal(cb.canExecute('gemini'), true);

  cb.recordFailure('gemini', new Error('503 Service Unavailable'));
  cb.recordFailure('gemini', new Error('503 Service Unavailable'));
  assert.equal(cb.canExecute('gemini'), true); // 2 failures, still closed

  cb.recordFailure('gemini', new Error('429 Rate Limit Exceeded'));
  // 3rd failure -> trips to OPEN
  assert.equal(cb.canExecute('gemini'), false);

  const snap = cb.getSnapshot();
  assert.equal(snap.gemini.state, CIRCUIT_STATE.OPEN);
  assert.equal(snap.gemini.failureCount, 3);

  // After cooldown elapsed -> should allow probe in HALF_OPEN
  const p = cb._getProviderState('gemini');
  p.trippedAt = Date.now() - 150; // force cooldown past

  assert.equal(cb.canExecute('gemini'), true);
  assert.equal(p.state, CIRCUIT_STATE.HALF_OPEN);

  // Success in HALF_OPEN resets circuit to CLOSED
  cb.recordSuccess('gemini');
  assert.equal(p.state, CIRCUIT_STATE.CLOSED);
  assert.equal(p.failureCount, 0);
});

test('TaskLedger enforces strict idempotency and persists tasks', () => {
  cleanupTestLedger();
  const ledger = new TaskLedger({ filePath: TEST_LEDGER_PATH, heartbeatTimeoutMs: 500 });

  const { task: t1, isDuplicate: d1 } = ledger.createTask({
    title: 'Publish SEO blog post: cutting acp',
    idempotencyKey: 'publish:cutting-acp:2026-08-26',
    role: TASK_ROLES.SCOUT
  });

  assert.equal(d1, false);
  assert.equal(t1.state, TASK_STATES.QUEUED);

  // Second creation with identical idempotencyKey must return existing
  const { task: t2, isDuplicate: d2 } = ledger.createTask({
    title: 'Publish SEO blog post: cutting acp',
    idempotencyKey: 'publish:cutting-acp:2026-08-26',
    role: TASK_ROLES.SCOUT
  });

  assert.equal(d2, true);
  assert.equal(t1.id, t2.id);

  // Claim and heartbeat
  const claimed = ledger.claimTask(t1.id, 'maya-worker');
  assert.equal(claimed.state, TASK_STATES.CLAIMED);
  assert.equal(claimed.owner, 'maya-worker');

  const heartbeatOk = ledger.heartbeat(t1.id, 'maya-worker');
  assert.equal(heartbeatOk, true);

  cleanupTestLedger();
});

test('VerifierGate validates schema, markdown, and JS code syntax deterministically', () => {
  const validJson = {
    title: 'Jasa Laser Cutting Bintaro',
    description: 'Panduan lengkap jasa laser cutting bintaro presisi tinggi.',
    faq: [{ question: 'Berapa lama?', answer: '1 hari' }],
    tags: ['laser', 'bintaro']
  };

  const v1 = VerifierGate.validateJson(validJson, {
    requiredFields: ['title', 'description', 'faq'],
    stringLengths: { title: { min: 5, max: 100 } },
    arrayBounds: { faq: { min: 1, max: 5 } }
  });
  assert.equal(v1.passed, true);
  assert.equal(v1.errors.length, 0);

  const invalidJson = {
    title: 'Hi',
    description: ''
  };
  const v2 = VerifierGate.validateJson(invalidJson, {
    requiredFields: ['title', 'description', 'faq'],
    stringLengths: { title: { min: 5 } }
  });
  assert.equal(v2.passed, false);
  assert.ok(v2.errors.length >= 2);

  // Markdown validation
  const sampleMd = `## Pengenalan Laser Cutting\n\nIsi artikel mendalam tentang teknologi potong presisi tinggi untuk plat besi dan stainless steel di wilayah Tangerang Selatan dan sekitarnya.\n\n## Spesifikasi Teknis\n\nData mesin fiber 12kW toleransi 0.02mm.`.repeat(10);
  const vMd = VerifierGate.validateMarkdown(sampleMd, { minWords: 50, requiredHeadings: 2 });
  assert.equal(vMd.passed, true);

  // Code syntax validation
  const validCode = 'export const add = (a, b) => a + b;';
  const vCode = VerifierGate.validateJsSyntax(validCode);
  assert.equal(vCode.passed, true);

  const invalidCode = 'const x = { broken: ;';
  const vCodeBad = VerifierGate.validateJsSyntax(invalidCode);
  assert.equal(vCodeBad.passed, false);
  assert.ok(vCodeBad.errors[0].includes('Syntax Error'));
});

test('ProviderRouter cascades to backup provider when primary fails', async () => {
  const mockGemini = {
    name: 'gemini',
    isAvailable: () => true,
    execute: async () => {
      throw new Error('503 Service Unavailable');
    },
    getMetrics: () => ({ name: 'gemini', totalCalls: 1 })
  };

  const mockClaude = {
    name: 'claude',
    isAvailable: () => true,
    execute: async () => {
      return {
        provider: 'claude',
        model: 'claude-sonnet-5',
        text: JSON.stringify({ title: 'Resilient Article', status: 'OK' }),
        latencyMs: 120
      };
    },
    getMetrics: () => ({ name: 'claude', totalCalls: 1 })
  };

  const cb = new CircuitBreaker();
  const router = new ProviderRouter({
    circuitBreaker: cb,
    geminiProvider: mockGemini,
    claudeProvider: mockClaude,
    codexProvider: { isAvailable: () => false }
  });

  const res = await router.execute({
    role: TASK_ROLES.SCOUT,
    system: 'You are an AI assistant',
    user: 'Write article'
  });

  assert.equal(res.provider, 'claude');
  assert.ok(res.text.includes('Resilient Article'));
  assert.equal(res.routeTrail.length, 2);
  assert.equal(res.routeTrail[0].provider, 'gemini');
  assert.equal(res.routeTrail[0].status, 'FAILED');
  assert.equal(res.routeTrail[1].provider, 'claude');
  assert.equal(res.routeTrail[1].status, 'SUCCESS');
});

test('IronDirector orchestrates complete task lifecycle with self-healing handoff', async () => {
  cleanupTestLedger();
  const ledger = new TaskLedger({ filePath: TEST_LEDGER_PATH });

  const mockRouter = {
    execute: async () => ({
      provider: 'claude',
      model: 'claude-sonnet-5',
      text: JSON.stringify({
        title: 'Panduan Laser Cutting ACP Fasad',
        category: 'Fabrikasi',
        score: 95
      }),
      latencyMs: 80,
      routeTrail: [{ provider: 'claude', status: 'SUCCESS' }]
    }),
    getTelemetry: () => ({ providers: [] })
  };

  const director = new IronDirector({
    ledger,
    providerRouter: mockRouter
  });

  const completed = await director.dispatch({
    title: 'Generate ACP Article',
    role: TASK_ROLES.REASONER,
    owner: 'maya',
    input: { keyword: 'cutting acp' },
    verificationRules: {
      requiredFields: ['title', 'category', 'score']
    },
    artifactType: 'json'
  });

  assert.equal(completed.state, TASK_STATES.DONE);
  assert.equal(completed.output.title, 'Panduan Laser Cutting ACP Fasad');
  assert.equal(completed.activeProvider, 'claude');
  assert.ok(completed.history.length >= 4);

  // Test reconciler
  const t = ledger.createTask({ title: 'Stuck Task', role: TASK_ROLES.SCOUT });
  ledger.claimTask(t.task.id, 'worker-1');
  const stuckTask = ledger.getTask(t.task.id);
  stuckTask.lastHeartbeat = new Date(Date.now() - 300_000).toISOString(); // 5 mins ago

  const reconcileRes = director.reconcile();
  assert.equal(reconcileRes.reconciledCount, 1);
  assert.equal(ledger.getTask(t.task.id).state, TASK_STATES.RETRYING);

  cleanupTestLedger();
});

test('IronDirector.dispatch rejects mutating task when quorum is not met and transitions to AWAITING_REVIEW', async () => {
  cleanupTestLedger();
  const ledger = new TaskLedger({ filePath: TEST_LEDGER_PATH });

  const director = new IronDirector({
    ledger,
    providerRouter: {
      execute: async () => ({ provider: 'gemini', text: '{}', routeTrail: [] }),
      getTelemetry: () => ({ providers: [] })
    }
  });

  // caseBus is unconfigured or returns rejected quorum -> dispatch MUST fail closed
  await assert.rejects(
    async () => {
      await director.dispatch({
        title: 'Unauthorized Mutating Task',
        permissions: ['WRITE_CODE'],
        role: TASK_ROLES.SCOUT
      });
    },
    (err) => {
      assert.ok(err.message.includes('Quorum Gate Rejected'));
      return true;
    }
  );

  const tasks = ledger.listTasks({ limit: 10 });
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].state, TASK_STATES.AWAITING_REVIEW);

  cleanupTestLedger();
});

test('CircuitBreaker locks probeInFlight in HALF_OPEN preventing concurrent stampedes', () => {
  const cb = new CircuitBreaker({ threshold: 1, cooldownMs: 60_000 });
  cb.recordFailure('gemini', new Error('500 Error'));

  // Move time past cooldown to transition to HALF_OPEN
  const originalNow = Date.now;
  try {
    Date.now = () => originalNow() + 70_000;

    // First probe claims the slot
    assert.equal(cb.canExecute('gemini'), true);
    // Second concurrent call while probe is in flight MUST be blocked
    assert.equal(cb.canExecute('gemini'), false);

    // Failure frees probe and trips back to OPEN
    cb.recordFailure('gemini', new Error('Probe failed'));
    assert.equal(cb.canExecute('gemini'), false);
  } finally {
    Date.now = originalNow;
  }
});
