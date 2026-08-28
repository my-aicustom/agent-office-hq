import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { SeoDraftPrExecutor } from '../director/executors/seo_draft_pr_executor.mjs';

function createHarness({ draft = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-pr-executor-'));
  const keyPath = path.join(root, 'key');
  const knownHostsPath = path.join(root, 'known_hosts');
  fs.writeFileSync(keyPath, 'test-only');
  fs.writeFileSync(knownHostsPath, 'github.test ssh-ed25519 test-only');
  const commands = [];
  let workspace;
  let targetPath;
  const commitSha = 'a'.repeat(40);

  const execFn = (command, args, options = {}) => {
    commands.push({ command, args, options });
    if (command !== 'git') return '';
    if (args[0] === 'clone') {
      workspace = args.at(-1);
      fs.mkdirSync(path.join(workspace, 'src/content/blog'), { recursive: true });
      fs.writeFileSync(path.join(workspace, 'src/content/blog/existing.md'), '---\nprimaryKeyword: "existing keyword"\n---\n');
    }
    if (args[0] === 'diff') {
      const names = fs.readdirSync(path.join(workspace, 'src/content/blog')).filter(name => name !== 'existing.md');
      targetPath = `src/content/blog/${names[0]}`;
      return targetPath;
    }
    if (args[0] === 'rev-parse') return commitSha;
    return '';
  };

  const fetchFn = async url => {
    if (String(url).endsWith('/files')) {
      return { ok: true, json: async () => [{ filename: targetPath }] };
    }
    const branch = commands.find(item => item.args[0] === 'checkout')?.args[2];
    return {
      ok: true,
      json: async () => [{
        number: 42,
        html_url: 'https://github.com/heriscaleup/tepatlaser/pull/42',
        url: 'https://api.github.com/repos/heriscaleup/tepatlaser/pulls/42',
        draft,
        head: { sha: commitSha },
        base: { ref: 'main' },
        branch
      }]
    };
  };

  const executor = new SeoDraftPrExecutor({
    repositoryUrl: 'git@github.com:heriscaleup/tepatlaser.git',
    repositorySlug: 'heriscaleup/tepatlaser',
    workRoot: path.join(root, 'work'),
    sshKeyPath: keyPath,
    knownHostsPath,
    execFn,
    fetchFn,
    pollIntervalMs: 1,
    pollTimeoutMs: 50
  });
  return { root, executor, commands };
}

test('SeoDraftPrExecutor creates one allowlisted artifact and accepts only matching Draft PR evidence', async () => {
  const harness = createHarness();
  try {
    const result = await harness.executor.execute({
      taskId: 'task-proof-001',
      keyword: 'checklist serah terima hasil laser cutting',
      intent: 'informational',
      cluster: 'quality-control'
    });

    assert.equal(result.action, 'SEO_DRAFT_PR_CREATED');
    assert.equal(result.pullRequest.draft, true);
    assert.equal(result.pullRequest.number, 42);
    assert.equal(result.commitSha, 'a'.repeat(40));
    assert.match(result.targetPath, /^src\/content\/blog\/[^/]+\.md$/);
    assert.equal(result.artifactHash.length, 64);
    assert.ok(harness.commands.some(item => item.args[0] === 'push' && item.args.includes(result.branchName)));
    assert.ok(harness.commands.some(item => item.args.includes('user.name=Ddos-spec')));
    assert.ok(harness.commands.some(item => item.args.includes('user.email=setgraph69@gmail.com')));
  } finally {
    fs.rmSync(harness.root, { recursive: true, force: true });
  }
});

test('SeoDraftPrExecutor rejects a non-draft pull request', async () => {
  const harness = createHarness({ draft: false });
  try {
    await assert.rejects(
      harness.executor.execute({ taskId: 'task-proof-002', keyword: 'checklist inspeksi komponen laser cutting' }),
      /refuses a non-draft/i
    );
  } finally {
    fs.rmSync(harness.root, { recursive: true, force: true });
  }
});

test('SeoDraftPrExecutor fails closed when SSH configuration is absent', async () => {
  const executor = new SeoDraftPrExecutor({
    repositoryUrl: 'git@github.com:heriscaleup/tepatlaser.git',
    repositorySlug: 'heriscaleup/tepatlaser',
    sshKeyPath: '',
    knownHostsPath: ''
  });
  await assert.rejects(executor.execute({ taskId: 'task-proof-003', keyword: 'audit file laser cutting produksi' }), /not configured/i);
});
