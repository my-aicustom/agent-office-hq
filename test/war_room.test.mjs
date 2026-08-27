// Unit tests for Event-Driven Sentry Watcher & 4-Brain War Room Council

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SentryWatcher, SENTRY_EVENT_TYPES } from '../director/sentry_watcher.mjs';
import { WarRoomCouncil } from '../director/war_room_council.mjs';

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

test('Legacy WarRoomCouncil fails closed instead of fabricating consensus', async () => {
  const council = new WarRoomCouncil();
  await assert.rejects(
    council.convene({ title: 'Do not fabricate a council' }),
    error => error.code === 'LEGACY_WAR_ROOM_DISABLED'
  );
});
