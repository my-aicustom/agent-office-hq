// Unit tests for Event-Driven Sentry Watcher & 4-Brain War Room Council

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

import { SentryWatcher, SENTRY_EVENT_TYPES } from '../director/sentry_watcher.mjs';
import { WarRoomCouncil } from '../director/war_room_council.mjs';
import { WarRoomStore } from '../director/war_room_store.mjs';
import { TaskLedger } from '../director/task_ledger.mjs';
import { TASK_STATES } from '../director/constants.mjs';

const TEST_WARROOM_STORE = path.resolve('data/test-director/test_war_room.json');
const TEST_LEDGER_PATH = path.resolve('data/test-director/test_war_room_ledger.json');

function cleanup() {
  try {
    if (fs.existsSync(TEST_WARROOM_STORE)) fs.unlinkSync(TEST_WARROOM_STORE);
    if (fs.existsSync(TEST_LEDGER_PATH)) fs.unlinkSync(TEST_LEDGER_PATH);
  } catch {}
}

test('SentryWatcher captures pipeline failures and deduplicates repeated alerts', () => {
  const sentry = new SentryWatcher({ dedupTtlMs: 1000 });
  const captured = [];
  sentry.on('sentry_alert', e => captured.push(e));

  const e1 = sentry.reportPipelineFailure({
    pipelineName: 'Autonomous Daily Blog Publisher',
    error: 'Gemini API error: 503 high demand',
    runId: 'run-991'
  });

  assert.ok(e1);
  assert.equal(e1.type, SENTRY_EVENT_TYPES.INCIDENT_PIPELINE_ERROR);
  assert.equal(e1.severity, 'CRITICAL');
  assert.equal(captured.length, 1);

  // Duplicate within TTL should return null and not emit
  const e2 = sentry.reportPipelineFailure({
    pipelineName: 'Autonomous Daily Blog Publisher',
    error: 'Gemini API error: 503 high demand',
    runId: 'run-991'
  });
  assert.equal(e2, null);
  assert.equal(captured.length, 1);
});

test('SentryWatcher captures ranking opportunities and ad waste spikes', () => {
  const sentry = new SentryWatcher();
  const captured = [];
  sentry.on('sentry_alert', e => captured.push(e));

  sentry.reportRankingOpportunity({
    keyword: 'cutting acp',
    position: 7.2,
    impressions: 20,
    targetPage: '/fasad-acp/'
  });

  sentry.reportAdWaste({
    wastedCount: 17,
    estimatedSavingsRupiah: 1500000,
    sampleTerms: ['loker operator laser']
  });

  assert.equal(captured.length, 2);
  assert.equal(captured[0].type, SENTRY_EVENT_TYPES.OPPORTUNITY_KEYWORD_PAGE_ONE);
  assert.equal(captured[1].type, SENTRY_EVENT_TYPES.OPPORTUNITY_AD_WASTE_SPIKE);
});

test('WarRoomCouncil auto-convenes 4 AI specialists and seals consensus', async () => {
  cleanup();
  const ledger = new TaskLedger({ filePath: TEST_LEDGER_PATH });
  const store = new WarRoomStore({ filePath: TEST_WARROOM_STORE });

  let notifyCalled = false;
  const mockNotifier = async () => {
    notifyCalled = true;
  };

  const council = new WarRoomCouncil({
    ledger,
    store,
    telegramNotifier: mockNotifier
  });

  const session = await council.convene({
    title: 'Autonomous Daily Blog Publisher Failed (503 Demand Spike)',
    type: SENTRY_EVENT_TYPES.INCIDENT_PIPELINE_ERROR,
    severity: 'CRITICAL',
    source: 'github_actions',
    error: 'Gemini API 503 Spike on target keyword cutting acp'
  });

  assert.ok(session.id.startsWith('warroom-'));
  assert.equal(session.state, 'RESOLVED');
  assert.equal(session.transcript.length, 4);

  // Turn 1: Gemini
  assert.equal(session.transcript[0].speaker, 'GEMINI');
  assert.ok(session.transcript[0].message.length > 0);

  // Turn 2: Claude
  assert.equal(session.transcript[1].speaker, 'CLAUDE');
  assert.ok(session.transcript[1].message.length > 0);

  // Turn 3: Codex
  assert.equal(session.transcript[2].speaker, 'CODEX');
  assert.ok(session.transcript[2].message.length > 0);

  // Turn 4: Hermes
  assert.equal(session.transcript[3].speaker, 'HERMES');
  assert.ok(session.transcript[3].message.includes('CONSENSUS SEALED'));

  // Dispatched Task in Ledger
  assert.ok(session.dispatchedTaskId);
  const taskInLedger = ledger.getTask(session.dispatchedTaskId);
  assert.ok(taskInLedger);
  assert.equal(taskInLedger.state, TASK_STATES.QUEUED);
  assert.equal(taskInLedger.owner, 'hermes-director');
  assert.ok(taskInLedger.input.geminiDiagnosis);

  // Persistence check
  const loaded = store.getSession(session.id);
  assert.equal(loaded.id, session.id);
  assert.equal(notifyCalled, true);

  cleanup();
});
