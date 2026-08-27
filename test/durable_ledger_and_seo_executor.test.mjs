// Unit tests for SQLite Task Ledger & Real SEO PR Executor (Rule 11 Integrity Guard)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'node:child_process';

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

test('SeoPageExecutor: draft mode generates markdown, validates schema, and reports draft status honestly', async () => {
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
  assert.equal(result.git.committed, false);
  assert.equal(result.git.reason, 'Draft mode: Git commit not requested');
  assert.ok(fs.existsSync(result.filePath));

  cleanup();
});

test('SeoPageExecutor: real git integration stages, commits, isolates a branch, and captures sha & PR evidence', async () => {
  cleanup();
  const executedCommands = [];
  const mockExec = (cmd, args) => {
    executedCommands.push({ cmd, args });
    if (cmd === 'git' && args.includes('rev-parse') && args.includes('--abbrev-ref')) return 'main';
    if (cmd === 'git' && args.includes('rev-parse')) return 'c0ffee1234567890abcdef1234567890abcdef12';
    if (cmd === 'gh' && args[0] === 'pr') return 'https://github.com/heriscaleup/agent-office-hq/pull/42';
    return '';
  };

  const executor = new SeoPageExecutor({
    contentOutputDir: TEST_SEO_OUTPUT,
    execFn: mockExec
  });

  const result = await executor.execute({
    keyword: 'jasa laser cutting akrilik presisi',
    git: {
      commit: true,
      push: true,
      createPr: true
    }
  });

  assert.equal(result.action, 'SEO_PAGE_GENERATED');
  assert.equal(result.git.committed, true);
  assert.equal(result.git.branchCreated, true);
  assert.equal(result.git.commitSha, 'c0ffee1234567890abcdef1234567890abcdef12');
  assert.equal(result.git.pushed, true);
  assert.equal(result.git.prUrl, 'https://github.com/heriscaleup/agent-office-hq/pull/42');

  // Verify the change is isolated onto its own branch, not committed onto whatever
  // branch happened to be checked out (this is the exact bug that shipped in d6c4ebb).
  assert.ok(
    executedCommands.some(c => c.cmd === 'git' && c.args[0] === 'checkout' && c.args[1] === '-B' && c.args[2] === result.git.branchName),
    'expected a git checkout -B <branchName> call to isolate the commit onto its own branch'
  );
  const checkoutBIndex = executedCommands.findIndex(c => c.cmd === 'git' && c.args[0] === 'checkout' && c.args[1] === '-B');
  const commitIndex = executedCommands.findIndex(c => c.cmd === 'git' && c.args.includes('commit'));
  assert.ok(checkoutBIndex >= 0 && checkoutBIndex < commitIndex, 'branch must be created before the commit is made');

  // Verify original branch is restored afterward instead of leaving the caller's
  // working tree switched to the generated feature branch.
  assert.ok(
    executedCommands.some(c => c.cmd === 'git' && c.args[0] === 'checkout' && c.args[1] === 'main'),
    'expected the executor to restore the original branch after committing'
  );

  assert.ok(executedCommands.some(c => c.cmd === 'git' && c.args[0] === 'add'));
  assert.ok(executedCommands.some(c => c.cmd === 'git' && c.args.includes('user.name=Ddos-spec')));
  assert.ok(executedCommands.some(c => c.cmd === 'git' && c.args.includes('user.email=setgraph69@gmail.com')));
  assert.ok(executedCommands.some(c => c.cmd === 'gh' && c.args[0] === 'pr' && c.args[1] === 'create' && c.args.includes('--base')));

  cleanup();
});

test('SeoPageExecutor: a failed push is reported honestly without hiding the real commit or losing it on main', async () => {
  cleanup();
  const mockExec = (cmd, args) => {
    if (cmd === 'git' && args.includes('rev-parse') && args.includes('--abbrev-ref')) return 'main';
    if (cmd === 'git' && args.includes('rev-parse')) return 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
    if (cmd === 'git' && args[0] === 'push') throw new Error('src refspec does not match any');
    return '';
  };

  const executor = new SeoPageExecutor({
    contentOutputDir: TEST_SEO_OUTPUT,
    execFn: mockExec
  });

  const result = await executor.execute({
    keyword: 'jasa laser cutting plat besi custom',
    git: { commit: true, push: true, createPr: false }
  });

  // A real commit exists on the isolated branch even though push failed —
  // this must never be reported as committed:false (that was the exact bug
  // in d6c4ebb: a real mutation happened but the caller was told it did not).
  assert.equal(result.git.committed, true);
  assert.equal(result.git.commitSha, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
  assert.equal(result.git.pushed, false);
  assert.match(result.git.reason, /push failed/i);

  cleanup();
});

test('SeoPageExecutor: real git repo integration isolates the commit on its own branch and never touches the original branch', async () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-git-real-'));
  const git = (args) => execFileSync('git', args, { cwd: repoDir, encoding: 'utf8' }).trim();

  try {
    git(['-c', 'init.defaultBranch=main', 'init', '-q']);
    git(['-c', 'user.name=tester', '-c', 'user.email=tester@example.com', 'commit', '--allow-empty', '-q', '-m', 'init']);

    const executor = new SeoPageExecutor({
      repoPath: repoDir,
      contentOutputDir: path.join(repoDir, 'drafts')
    });

    const result = await executor.execute({
      keyword: 'real git branch isolation probe',
      git: { commit: true, push: false, createPr: false }
    });

    assert.equal(result.git.committed, true);
    assert.equal(result.git.branchCreated, true);

    // The working tree must be back on the original branch afterward.
    assert.equal(git(['rev-parse', '--abbrev-ref', 'HEAD']), 'main');

    // main's history must NOT contain the generated SEO commit.
    const mainLog = git(['log', '--oneline', 'main']);
    assert.ok(
      !mainLog.split('\n').some((line) => line.startsWith(result.git.commitSha.slice(0, 7))),
      'the SEO commit must not have landed on main'
    );

    // The isolated feature branch must contain it.
    const branchLog = git(['log', '--oneline', result.git.branchName]);
    assert.ok(branchLog.split('\n')[0].startsWith(result.git.commitSha.slice(0, 7)));
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
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
            git: result.git,
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
  assert.ok(completed.output.evidence[0].git);

  ledger.close();
  cleanup();
});
