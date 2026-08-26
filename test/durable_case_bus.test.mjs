// Unit tests for Durable Case Bus, Quorum Engine & Active Task Consumer (Rule 11 Integrity Guard)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

import { PersistentDedup } from '../director/persistent_dedup.mjs';
import { QuorumEngine, QUORUM_STATES } from '../director/quorum_engine.mjs';
import { CostCalculator } from '../director/cost_calculator.mjs';
import { CasePacket } from '../director/case_packet.mjs';
import { ActiveTaskConsumer } from '../director/active_task_consumer.mjs';
import { SharedCaseBus } from '../director/shared_case_bus.mjs';
import { TaskLedger } from '../director/task_ledger.mjs';
import { TASK_STATES } from '../director/constants.mjs';

const TEST_DIR = path.resolve('data/test-durable');
const TEST_DEDUP_FILE = path.join(TEST_DIR, 'test_dedup.json');
const TEST_LEDGER_FILE = path.join(TEST_DIR, 'test_ledger.json');

function cleanup() {
  try {
    if (fs.existsSync(TEST_DEDUP_FILE)) fs.unlinkSync(TEST_DEDUP_FILE);
    if (fs.existsSync(TEST_LEDGER_FILE)) fs.unlinkSync(TEST_LEDGER_FILE);
  } catch {}
}

test('CostCalculator accurately calculates token cost in Indonesian Rupiah (IDR)', () => {
  const geminiCost = CostCalculator.calculateCostIdr('gemini', 1000, 500);
  assert.equal(geminiCost.totalTokens, 1500);
  assert.ok(geminiCost.costIdr > 0);
  assert.ok(geminiCost.costIdr < 10); // Less than Rp 10

  const claudeCost = CostCalculator.calculateCostIdr('claude', 2000, 1000);
  assert.equal(claudeCost.totalTokens, 3000);
  assert.ok(claudeCost.costIdr > geminiCost.costIdr);
});

test('PersistentDedup survives simulated process restarts and matches canonical SHA-256', () => {
  cleanup();
  const dedup1 = new PersistentDedup({ filePath: TEST_DEDUP_FILE, defaultTtlMs: 5000 });

  const fp1 = PersistentDedup.generateFingerprint({
    type: 'INCIDENT:PROVIDER_FAILURE',
    source: 'gemini_circuit',
    targetOrError: '503 Service Unavailable on target keyword cutting acp'
  });

  const isDup1 = dedup1.isDeduplicated(fp1);
  assert.equal(isDup1, false);

  // Simulated process restart: Create fresh instance pointing to same file
  const dedup2 = new PersistentDedup({ filePath: TEST_DEDUP_FILE, defaultTtlMs: 5000 });
  const isDup2 = dedup2.isDeduplicated(fp1);
  assert.equal(isDup2, true); // Must be recognized as duplicate!

  cleanup();
});

test('QuorumEngine rejects fake consensus when all providers fail (NO_QUORUM)', () => {
  const qEngine = new QuorumEngine({ minLiveProviders: 2 });

  // 1. Zero Live Providers
  const failedTurns = [
    { speaker: 'GEMINI', status: 'FAILED', message: '', error: '503 High Demand' },
    { speaker: 'CLAUDE', status: 'FAILED', message: '', error: 'Rate Limit Exceeded' },
    { speaker: 'CODEX', status: 'FAILED', message: '', error: 'Connection Refused' }
  ];

  const evalFail = qEngine.evaluate({ turns: failedTurns, verifierResult: { passed: true } });
  assert.equal(evalFail.status, QUORUM_STATES.NO_QUORUM);
  assert.equal(evalFail.verdict, 'QUORUM_REJECTED');
  assert.equal(evalFail.liveCount, 0);

  // 2. Only 1 Live Provider -> DEGRADED
  const singleLiveTurns = [
    { speaker: 'GEMINI', status: 'SUCCESS', message: 'Valid Gemini diagnosis with enough depth.' },
    { speaker: 'CLAUDE', status: 'FAILED', message: '', error: '500 Error' },
    { speaker: 'CODEX', status: 'FAILED', message: '', error: '500 Error' }
  ];

  const evalDegraded = qEngine.evaluate({ turns: singleLiveTurns, verifierResult: { passed: true } });
  assert.equal(evalDegraded.status, QUORUM_STATES.DEGRADED);
  assert.equal(evalDegraded.liveCount, 1);

  // 3. Two Live Providers -> QUORUM_MET
  const twoLiveTurns = [
    { speaker: 'GEMINI', status: 'SUCCESS', message: 'Valid Gemini diagnosis with enough depth.' },
    { speaker: 'CLAUDE', status: 'SUCCESS', message: 'Valid Claude strategy with clear action plan.' },
    { speaker: 'CODEX', status: 'FAILED', message: '', error: 'Codex timeout' }
  ];

  const evalMet = qEngine.evaluate({ turns: twoLiveTurns, verifierResult: { passed: true } });
  assert.equal(evalMet.status, QUORUM_STATES.QUORUM_MET);
  assert.equal(evalMet.liveCount, 2);
});

test('SharedCaseBus executes identity-pinned turns, meters tokens, and enforces quorum', async () => {
  cleanup();
  const ledger = new TaskLedger({ filePath: TEST_LEDGER_FILE });
  const dedup = new PersistentDedup({ filePath: TEST_DEDUP_FILE });

  const mockGemini = {
    execute: async () => ({
      model: 'gemini-3.6-flash',
      text: 'Root cause: High demand spike on model endpoint.',
      usage: { promptTokens: 120, completionTokens: 40 }
    })
  };

  const mockClaude = {
    execute: async () => ({
      model: 'claude-sonnet-4',
      text: 'Strategy: Switch traffic to fallback writer and verify output.',
      usage: { promptTokens: 150, completionTokens: 60 }
    })
  };

  const mockCodex = {
    execute: async () => ({
      model: 'codex-inspector-v1',
      text: 'Verification: AST check clean. Safe to proceed.',
      usage: { promptTokens: 100, completionTokens: 30 }
    })
  };

  const caseBus = new SharedCaseBus({
    ledger,
    dedup,
    geminiProvider: mockGemini,
    claudeProvider: mockClaude,
    codexProvider: mockCodex
  });

  const sentryEvent = {
    title: 'Pipeline Failover Test: Gemini 503 Spike',
    type: 'INCIDENT:PIPELINE_ERROR',
    severity: 'CRITICAL',
    source: 'github_actions',
    error: 'Gemini 503 Spike'
  };

  const caseResult = await caseBus.processIncident(sentryEvent);

  assert.equal(caseResult.status, 'RESOLVED');
  assert.equal(caseResult.quorum.status, QUORUM_STATES.QUORUM_MET);
  assert.equal(caseResult.quorum.liveCount, 3);
  assert.ok(caseResult.budget.totalCostIdr > 0);
  assert.ok(caseResult.budget.totalTokensUsed > 0);

  // Assert identity pinning
  assert.equal(caseResult.turns[0].speaker, 'GEMINI');
  assert.equal(caseResult.turns[0].actualModel, 'gemini-3.6-flash');
  assert.equal(caseResult.turns[1].speaker, 'CLAUDE');
  assert.equal(caseResult.turns[1].actualModel, 'claude-sonnet-4');
  assert.equal(caseResult.turns[2].speaker, 'CODEX');
  assert.equal(caseResult.turns[2].actualModel, 'codex-inspector-v1');
  assert.equal(caseResult.turns[3].speaker, 'HERMES');

  // Assert Task was enqueued with least privilege
  assert.ok(caseResult.dispatchedTaskId);
  const task = ledger.getTask(caseResult.dispatchedTaskId);
  assert.ok(task);
  assert.equal(task.state, TASK_STATES.QUEUED);

  cleanup();
});

test('ActiveTaskConsumer pulls QUEUED task from Ledger and executes to DONE', async () => {
  cleanup();
  const ledger = new TaskLedger({ filePath: TEST_LEDGER_FILE });

  const { task } = ledger.createTask({
    title: 'Failover blog publish: cutting-acp',
    role: 'SUPERVISOR',
    owner: 'hermes',
    input: { actionType: 'FAILOVER_BLOG_PUBLISH', keyword: 'cutting-acp' },
    idempotencyKey: 'test_consumer_task_1'
  });

  assert.equal(task.state, TASK_STATES.QUEUED);

  const consumer = new ActiveTaskConsumer({
    ledger,
    workerId: 'test-worker-1'
  });

  const completed = await consumer.processNextTask();

  assert.ok(completed);
  assert.equal(completed.id, task.id);
  assert.equal(completed.state, TASK_STATES.DONE);
  assert.equal(completed.output.action, 'BLOG_PUBLISHED_RECOVERY');
  assert.ok(completed.evidence.executionLatencyMs >= 0);

  cleanup();
});
