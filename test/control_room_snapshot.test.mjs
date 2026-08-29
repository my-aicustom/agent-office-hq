import test from 'node:test';
import assert from 'node:assert/strict';

import { buildControlRoomSnapshot } from '../director/control_room_snapshot.mjs';

function directorFixture(overrides = {}) {
  return {
    status: 'ONLINE',
    uptimeSeconds: 900,
    taskCounts: { QUEUED: 0, CLAIMED: 0, RUNNING: 0, VERIFYING: 0, HANDOFF: 0, RETRYING: 0, AWAITING_REVIEW: 0, DEPLOYED: 0, DONE: 1, BLOCKED: 0, ESCALATED: 0 },
    costAccounting: { totalTokens: 672, totalCostIdr: 3.65 },
    providers: {
      circuits: { gemini: { state: 'CLOSED', lastSuccess: '2026-08-29T05:30:00.000Z' }, openrouter: { state: 'CLOSED' } },
      providers: [
        { name: 'gemini', available: true, metrics: { totalCalls: 1, successfulCalls: 1, failedCalls: 0, avgLatencyMs: 4500 } },
        { name: 'openrouter', available: true, metrics: { totalCalls: 1, successfulCalls: 1, failedCalls: 0, avgLatencyMs: 900 } },
        { name: 'claude', available: false, metrics: { totalCalls: 0, successfulCalls: 0, failedCalls: 0, avgLatencyMs: 0 } }
      ]
    },
    autonomy: {
      enabled: true,
      running: false,
      intervalMs: 21_600_000,
      lastRun: { status: 'NO_ELIGIBLE_DISPATCH', finishedAt: '2026-08-29T05:00:00.000Z' }
    },
    prLifecycle: {
      enabled: true,
      configured: true,
      running: false,
      lastSweep: { status: 'SUCCESS', checked: 1, advanced: 1, finishedAt: '2026-08-29T05:35:00.000Z' }
    },
    ...overrides
  };
}

test('control room reports healthy waiting as IDLE instead of pretending agents are working', () => {
  const snapshot = buildControlRoomSnapshot({
    director: directorFixture(),
    generatedAt: '2026-08-29T06:00:00.000Z'
  });
  assert.equal(snapshot.mode, 'IDLE');
  assert.equal(snapshot.scheduler.lastRun.status, 'NO_ELIGIBLE_DISPATCH');
  assert.equal(snapshot.proof.routableProviderCount, 2);
  assert.equal(snapshot.proof.verifiedProviderCount, 0);
  assert.equal(snapshot.providers.find(provider => provider.name === 'claude').status, 'UNCONFIGURED');
  assert.deepEqual(snapshot.dependencyErrors, []);
});

test('control room reports actual active work and exposes evidence links', () => {
  const task = {
    id: 'task-1',
    state: 'RUNNING',
    updatedAt: '2026-08-29T05:59:00.000Z',
    output: {
      evidence: [
        { kind: 'DRAFT_PULL_REQUEST', prNumber: 20, prUrl: 'https://github.com/example/repo/pull/20' },
        { kind: 'PRODUCTION_HTTP_VERIFICATION', targetUrl: 'https://example.com/blog/proof/' },
        { kind: 'UNTRUSTED_LINK', targetUrl: 'javascript:alert(1)' }
      ]
    }
  };
  const director = directorFixture({
    taskCounts: { ...directorFixture().taskCounts, RUNNING: 1 }
  });
  const snapshot = buildControlRoomSnapshot({
    director,
    tasks: [task],
    cases: [{
      caseId: 'case-1',
      createdAt: '2026-08-29T05:58:00.000Z',
      turns: [{ providerKey: 'gemini', status: 'SUCCESS', outboundEvidence: { verified: true, httpStatus: 200 } }]
    }],
    generatedAt: '2026-08-29T06:00:00.000Z'
  });
  assert.equal(snapshot.mode, 'WORKING');
  assert.equal(snapshot.pipeline.executing, 1);
  assert.deepEqual(snapshot.recentTasks[0].evidenceLinks.map(link => link.url), [
    'https://github.com/example/repo/pull/20',
    'https://example.com/blog/proof/'
  ]);
  assert.equal(snapshot.proof.verifiedProviderCount, 1);
});

test('control room fails closed when fewer than two outbound providers are available', () => {
  const director = directorFixture();
  director.providers.providers[1].available = false;
  const snapshot = buildControlRoomSnapshot({ director, generatedAt: '2026-08-29T06:00:00.000Z' });
  assert.equal(snapshot.mode, 'BLOCKED');
  assert.ok(snapshot.dependencyErrors.includes('LIVE_QUORUM_UNAVAILABLE'));
  assert.equal(snapshot.agents.find(agent => agent.id === 'quorum-council').status, 'BLOCKED');
});
