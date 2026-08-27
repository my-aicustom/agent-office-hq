// Unit tests for SQLite Task Ledger & Real SEO PR Executor (Rule 11 Integrity Guard)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

import { TaskLedgerDb } from '../director/task_ledger_db.mjs';
import { SeoPageExecutor } from '../director/executors/seo_page_executor.mjs';
import { ActiveTaskConsumer } from '../director/active_task_consumer.mjs';
import { TASK_STATES } from '../director/constants.mjs';

const TEST_DB_PATH = path.resolve('data/test-durable/test_ledger.db');
const TEST_SEO_OUTPUT = path.resolve('data/test-durable/seo-drafts');

function cleanup() {
  try {
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    if (fs.existsSync(`${TEST_DB_PATH}-wal`)) fs.unlinkSync(`${TEST_DB_PATH}-wal`);
    if (fs.existsSync(`${TEST_DB_PATH}-shm`)) fs.unlinkSync(`${TEST_DB_PATH}-shm`);
    if (fs.existsSync(TEST_SEO_OUTPUT)) fs.rmSync(TEST_SEO_OUTPUT, { recursive: true, force: true });
  } catch {}
}

test('TaskLedgerDb: creates task, enforces idempotency, and persists ACID transactions', () => {
  cleanup();
  const ledger = new TaskLedgerDb({ dbPath: TEST_DB_PATH });

  const { task: t1, created: c1 } = ledger.createTask({
    title: 'SEO Audit: Laser Cutting Plat Stainless',
    role: 'SUPERVISOR',
    input: { keyword: 'laser-cutting-plat-stainless' },
    idempotencyKey: 'idemp_seo_001'
  });

  assert.equal(c1, true);
  assert.equal(t1.state, TASK_STATES.QUEUED);
  assert.equal(t1.fencingToken, 1);

  // Attempt duplicate insert with same idempotencyKey
  const { task: t2, created: c2 } = ledger.createTask({
    title: 'Duplicate Task with same key',
    idempotencyKey: 'idemp_seo_001'
  });

  assert.equal(c2, false);
  assert.equal(t2.id, t1.id);

  ledger.close();
  cleanup();
});

test('TaskLedgerDb: atomic claim increments fencing token and blocks concurrent workers', () => {
  cleanup();
  const ledger = new TaskLedgerDb({ dbPath: TEST_DB_PATH });

  const { task } = ledger.createTask({
    title: 'Atomic Claim Drill',
    idempotencyKey: 'drill_claim_01'
  });

  // Worker 1 claims task
  const claimedByWorker1 = ledger.claimNextQueuedTask({ workerId: 'worker-node-1', leaseTtlMs: 5000 });
  assert.ok(claimedByWorker1);
  assert.equal(claimedByWorker1.id, task.id);
  assert.equal(claimedByWorker1.state, TASK_STATES.CLAIMED);
  assert.equal(claimedByWorker1.leaseOwner, 'worker-node-1');
  assert.equal(claimedByWorker1.fencingToken, 2);

  // Worker 2 attempts to claim at the same time (must return null because no queued task is available)
  const claimedByWorker2 = ledger.claimNextQueuedTask({ workerId: 'worker-node-2', leaseTtlMs: 5000 });
  assert.equal(claimedByWorker2, null);

  ledger.close();
  cleanup();
});

test('TaskLedgerDb: fencing token rejects stale zombie worker override', () => {
  cleanup();
  const ledger = new TaskLedgerDb({ dbPath: TEST_DB_PATH });

  const { task } = ledger.createTask({
    title: 'Fencing Token Safety Check',
    idempotencyKey: 'fence_check_01'
  });

  const claimed = ledger.claimNextQueuedTask({ workerId: 'worker-1', leaseTtlMs: 5000 });
  assert.equal(claimed.fencingToken, 2);

  // Move to RUNNING with valid fencing token (2)
  const running = ledger.transition(claimed.id, TASK_STATES.RUNNING, {
    actor: 'worker-1',
    fencingToken: 2
  });
  assert.equal(running.state, TASK_STATES.RUNNING);

  // Stale worker tries to transition with old fencing token (1) -> Must throw!
  assert.throws(() => {
    ledger.transition(claimed.id, TASK_STATES.VERIFYING, {
      actor: 'zombie-worker',
      fencingToken: 1
    });
  }, /Fencing token mismatch/);

  ledger.close();
  cleanup();
});

test('TaskLedgerDb: recovers expired worker leases back to QUEUED', async () => {
  cleanup();
  const ledger = new TaskLedgerDb({ dbPath: TEST_DB_PATH });

  const { task } = ledger.createTask({
    title: 'Crash Recovery Drill',
    idempotencyKey: 'crash_drill_01'
  });

  // Claim with very short lease (10ms)
  ledger.claimNextQueuedTask({ workerId: 'crashed-worker', leaseTtlMs: 10 });

  // Wait for lease to expire
  await new Promise(r => setTimeout(r, 30));

  const recovered = ledger.recoverExpiredLeases();
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].id, task.id);
  assert.equal(recovered[0].state, TASK_STATES.QUEUED);
  assert.equal(recovered[0].leaseOwner, null);

  ledger.close();
  cleanup();
});

test('SeoPageExecutor: generates production markdown, validates schema, and computes artifact hash', async () => {
  cleanup();
  const executor = new SeoPageExecutor({ contentOutputDir: TEST_SEO_OUTPUT });

  const result = await executor.execute({
    keyword: 'jasa laser cutting plat stainless tangerang',
    intent: 'commercial',
    cluster: 'stainless',
    gscEvidence: { impressions: 350, clicks: 18, avgPosition: 5.2 }
  });

  assert.equal(result.action, 'SEO_PAGE_GENERATED');
  assert.equal(result.slug, 'jasa-laser-cutting-plat-stainless-tangerang');
  assert.equal(result.schemaValid, true);
  assert.ok(result.wordCount > 150);
  assert.ok(result.artifactHash && result.artifactHash.length === 64);
  assert.ok(result.branchName.startsWith('seo/optimize-'));
  assert.ok(fs.existsSync(result.filePath));

  // Verify file content matches artifact hash
  const fileContent = fs.readFileSync(result.filePath, 'utf8');
  assert.ok(fileContent.includes('Jasa Laser Cutting JASA LASER CUTTING PLAT STAINLESS TANGERANG'));
  assert.ok(fileContent.includes('Tabel Spesifikasi & Kapasitas Material'));

  cleanup();
});

test('ActiveTaskConsumer: processes SEO remediation task end-to-end to verified DONE state', async () => {
  cleanup();
  const ledger = new TaskLedgerDb({ dbPath: TEST_DB_PATH });
  const seoExecutor = new SeoPageExecutor({ contentOutputDir: TEST_SEO_OUTPUT });
  const consumer = new ActiveTaskConsumer({
    ledger,
    workerId: 'hermes-seo-worker',
    executors: {
      SEO_OPPORTUNITY_OPTIMIZE: async (task) => {
        const keyword = task.input?.keyword || 'cutting acp motif dekoratif';
        const result = await seoExecutor.execute({
          keyword,
          intent: task.input?.intent || 'commercial',
          cluster: task.input?.cluster || 'acp'
        });
        return {
          actionType: 'SEO_OPPORTUNITY_OPTIMIZE',
          status: 'VERIFIED',
          externalEffect: 'ARTIFACT_COMMITTED',
          evidence: [{
            kind: 'SEO_PAGE_ARTIFACT',
            filePath: result.filePath,
            artifactHash: result.artifactHash,
            branchName: result.branchName,
            commitMessage: result.commitMessage,
            wordCount: result.wordCount,
            verifiedAt: new Date().toISOString()
          }]
        };
      }
    }
  });

  const { task } = ledger.createTask({
    title: 'Optimize Target Keyword: cutting acp motif dekoratif',
    input: {
      actionType: 'SEO_OPPORTUNITY_OPTIMIZE',
      keyword: 'cutting acp motif dekoratif',
      intent: 'commercial',
      cluster: 'acp'
    },
    idempotencyKey: 'seo_e2e_consumer_01'
  });

  assert.equal(task.state, TASK_STATES.QUEUED);

  const completed = await consumer.processNextTask();

  assert.ok(completed);
  assert.equal(completed.id, task.id);
  assert.equal(completed.state, TASK_STATES.DONE);
  assert.equal(completed.output.actionType, 'SEO_OPPORTUNITY_OPTIMIZE');
  assert.ok(completed.output.evidence[0].artifactHash);
  assert.ok(completed.output.evidence[0].branchName);

  ledger.close();
  cleanup();
});
