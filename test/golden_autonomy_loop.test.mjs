import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { GoldenAutonomyScheduler, evaluateAutonomyOpportunity } from '../director/golden_autonomy_scheduler.mjs';
import { PrLifecycleMonitor } from '../director/pr_lifecycle_monitor.mjs';
import { TaskLedgerDb } from '../director/task_ledger_db.mjs';
import { TASK_STATES } from '../director/constants.mjs';
import { CLASSIFICATIONS, DATA_STATUSES, RECOMMENDATIONS } from '../agents/nadia/constants.mjs';

function opportunity(overrides = {}) {
  return {
    id: 'SEO-OPP-GOLDEN01',
    cluster: 'quality-control',
    primaryKeyword: 'checklist serah terima hasil laser cutting',
    supportingQueries: ['checklist inspeksi laser cutting'],
    intent: 'INFORMATIONAL',
    businessRelevance: 85,
    classification: CLASSIFICATIONS.SUPPORTING_CONTENT,
    recommendation: RECOMMENDATIONS.CREATE_SUPPORTING_CONTENT,
    opportunityScore: 65,
    existingUrl: 'https://tepatlaser.com/jasa-laser-cutting/',
    gsc: {
      status: DATA_STATUSES.LIVE,
      fetchedAt: '2026-08-29T00:00:00.000Z',
      position: 8.2,
      impressions: 120,
      clicks: 4,
      rankingUrls: [{ url: 'https://tepatlaser.com/jasa-laser-cutting/', impressions: 120, position: 8.2 }],
      dateRange: { startDate: '2026-07-28', endDate: '2026-08-26' }
    },
    ...overrides
  };
}

function createAwaitingReviewTask(ledger) {
  const { task } = ledger.createTask({
    title: 'Golden loop lifecycle proof',
    input: {
      actionType: 'SEO_OPPORTUNITY_OPTIMIZE',
      metadata: { keyword: 'checklist serah terima hasil laser cutting' }
    },
    idempotencyKey: 'golden-lifecycle-proof'
  });
  const claimed = ledger.claimNextQueuedTask({ workerId: 'test-worker', leaseTtlMs: 60_000 });
  ledger.transition(task.id, TASK_STATES.RUNNING, { actor: 'test-worker', fencingToken: claimed.fencingToken });
  ledger.transition(task.id, TASK_STATES.VERIFYING, { actor: 'quality-gate', fencingToken: claimed.fencingToken });
  return ledger.transition(task.id, TASK_STATES.AWAITING_REVIEW, {
    actor: 'test-worker',
    fencingToken: claimed.fencingToken,
    output: {
      actionType: 'SEO_OPPORTUNITY_OPTIMIZE',
      status: 'VERIFIED',
      evidence: [{
        kind: 'DRAFT_PULL_REQUEST',
        repository: 'heriscaleup/tepatlaser',
        prNumber: 42,
        prUrl: 'https://github.com/heriscaleup/tepatlaser/pull/42',
        commitSha: 'a'.repeat(40),
        targetPath: 'src/content/blog/checklist-serah-terima-hasil-laser-cutting.md',
        draft: true
      }]
    }
  });
}

test('autonomy eligibility fails closed on manual GSC or executor mismatch', () => {
  assert.equal(evaluateAutonomyOpportunity(opportunity()).eligible, true);
  const manual = evaluateAutonomyOpportunity(opportunity({ gsc: { ...opportunity().gsc, status: DATA_STATUSES.MANUAL } }));
  assert.equal(manual.eligible, false);
  assert.ok(manual.reasons.includes('GSC_EVIDENCE_NOT_TRUSTED'));
  const mismatch = evaluateAutonomyOpportunity(opportunity({ recommendation: RECOMMENDATIONS.OPTIMIZE_EXISTING }));
  assert.equal(mismatch.eligible, false);
  assert.ok(mismatch.reasons.includes('EXECUTOR_RECOMMENDATION_MISMATCH'));
});

test('GoldenAutonomyScheduler analyzes evidence and dispatches one durable case', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-scheduler-'));
  const calls = [];
  const scheduler = new GoldenAutonomyScheduler({
    enabled: true,
    runsPath: path.join(root, 'runs.json'),
    now: () => new Date('2026-08-29T01:00:00.000Z'),
    ledger: { listTasks: () => [] },
    nadiaAgent: {
      analyze: async () => ({ run: { runId: 'NADIA-PROOF' }, opportunities: [opportunity()] }),
      createTask: async id => ({ taskId: `PROPOSAL-${id}` })
    },
    caseBus: {
      processIncident: async event => {
        calls.push(event);
        return { caseId: 'case-proof', dispatchedTaskId: 'task-proof', quorum: { status: 'QUORUM_MET' } };
      }
    }
  });
  try {
    const run = await scheduler.runOnce();
    assert.equal(run.status, 'DISPATCHED');
    assert.equal(run.dispatchedCount, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].metadata.requestedActionType, 'SEO_OPPORTUNITY_OPTIMIZE');
    assert.equal(calls[0].metadata.opportunityId, 'SEO-OPP-GOLDEN01');
    assert.match(calls[0].metadata.evidenceFingerprint, /^[a-f0-9]{64}$/);
    const persisted = JSON.parse(fs.readFileSync(path.join(root, 'runs.json'), 'utf8'));
    assert.equal(persisted.records[0].dispatchedCount, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('GoldenAutonomyScheduler does not duplicate an unresolved opportunity task', async () => {
  let caseCalls = 0;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-dedup-'));
  const scheduler = new GoldenAutonomyScheduler({
    enabled: true,
    runsPath: path.join(root, 'runs.json'),
    now: () => new Date('2026-08-29T01:00:00.000Z'),
    ledger: { listTasks: () => [{ state: TASK_STATES.AWAITING_REVIEW, input: { metadata: { opportunityId: 'SEO-OPP-GOLDEN01' } } }] },
    nadiaAgent: {
      analyze: async () => ({ run: { runId: 'NADIA-PROOF' }, opportunities: [opportunity()] }),
      createTask: async () => { throw new Error('must not create duplicate'); }
    },
    caseBus: { processIncident: async () => { caseCalls += 1; } }
  });
  try {
    const run = await scheduler.runOnce();
    assert.equal(run.dispatchedCount, 0);
    assert.equal(caseCalls, 0);
    assert.ok(run.skipped[0].reasons.includes('UNRESOLVED_TASK_EXISTS'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('PrLifecycleMonitor requires merge, successful checks, and production read-back before DONE', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-lifecycle-'));
  const ledger = new TaskLedgerDb({ dbPath: path.join(root, 'ledger.db') });
  const task = createAwaitingReviewTask(ledger);
  const fetchFn = async url => {
    const value = String(url);
    if (value.includes('/pulls/42')) return { ok: true, json: async () => ({ state: 'closed', merged_at: '2026-08-29T01:00:00Z', merge_commit_sha: 'b'.repeat(40) }) };
    if (value.includes('/check-runs')) return { ok: true, json: async () => ({ check_runs: [{ name: 'SEO Draft PR Gate', status: 'completed', conclusion: 'success', html_url: 'https://github.test/check' }] }) };
    return { ok: true, status: 200, text: async () => '<html><h1>Checklist serah terima hasil laser cutting</h1></html>' };
  };
  const monitor = new PrLifecycleMonitor({ ledger, enabled: true, githubToken: 'test-only', fetchFn });
  try {
    const mergedSweep = await monitor.runOnce();
    assert.equal(mergedSweep.advanced, 1);
    assert.equal(ledger.getTask(task.id).state, TASK_STATES.DEPLOYED);
    const productionSweep = await monitor.runOnce();
    assert.equal(productionSweep.advanced, 1);
    const completed = ledger.getTask(task.id);
    assert.equal(completed.state, TASK_STATES.DONE);
    assert.ok(completed.output.evidence.some(item => item.kind === 'PRODUCTION_HTTP_VERIFICATION' && item.verified));
  } finally {
    ledger.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('PrLifecycleMonitor blocks a PR closed without merge', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-closed-pr-'));
  const ledger = new TaskLedgerDb({ dbPath: path.join(root, 'ledger.db') });
  const task = createAwaitingReviewTask(ledger);
  const monitor = new PrLifecycleMonitor({
    ledger,
    enabled: true,
    githubToken: 'test-only',
    fetchFn: async () => ({ ok: true, json: async () => ({ state: 'closed', merged_at: null }) })
  });
  try {
    await monitor.runOnce();
    assert.equal(ledger.getTask(task.id).state, TASK_STATES.BLOCKED);
  } finally {
    ledger.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
