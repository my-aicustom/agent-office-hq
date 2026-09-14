import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import { clusterSearchTerms } from '../agents/nadia/clustering.mjs';
import { calculateBusinessRelevance, classifyIntent } from '../agents/nadia/intent.mjs';
import { buildOpportunity } from '../agents/nadia/opportunity.mjs';
import { calculateOpportunityScore } from '../agents/nadia/scoring.mjs';
import { SearchConsoleProvider } from '../tools/search_console.mjs';

test('intent classification covers common laser queries', () => {
  assert.equal(classifyIntent('jasa laser cutting stainless'), 'TRANSACTIONAL');
  assert.equal(classifyIntent('harga laser cutting'), 'COMMERCIAL');
  assert.equal(classifyIntent('inspirasi pagar laser cutting'), 'INFORMATIONAL');
  assert.equal(classifyIntent('lowongan operator laser'), 'IRRELEVANT');
  assert.equal(classifyIntent('jual mesin fiber laser'), 'IRRELEVANT');
});

test('business relevance rules match documented calibration examples', () => {
  assert.equal(calculateBusinessRelevance('jasa laser cutting stainless'), 100);
  assert.equal(calculateBusinessRelevance('harga laser cutting'), 95);
  assert.equal(calculateBusinessRelevance('inspirasi pagar laser cutting'), 65);
  assert.equal(calculateBusinessRelevance('file dxf gratis'), 45);
  assert.equal(calculateBusinessRelevance('harga mesin fiber laser bekas'), 15);
  assert.equal(calculateBusinessRelevance('lowongan operator laser'), 0);
});

test('clustering groups lexical stainless variants', () => {
  const items = [
    'jasa laser cutting stainless',
    'laser cutting stainless steel',
    'jasa potong stainless'
  ].map(searchTerm => ({ searchTerm, businessRelevance: calculateBusinessRelevance(searchTerm), clicks: 1, cost: 1 }));
  const clusters = clusterSearchTerms(items);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].items.length, 3);
});

test('high commercial evidence and near-page-one GSC produces high score without conversions', () => {
  const result = calculateOpportunityScore({
    intent: 'COMMERCIAL',
    businessRelevance: 96,
    ads: { clicks: 38, cost: 930000, avgCpc: 24473, conversions: 0 },
    gsc: { impressions: 1250, position: 12.4 }
  });
  assert.ok(result.score >= 85, `expected >=85, got ${result.score}`);
  assert.equal(result.classification, 'HIGH_PRIORITY');
});

test('irrelevant employment demand is discarded even with traffic', () => {
  const result = calculateOpportunityScore({
    intent: 'IRRELEVANT',
    businessRelevance: 0,
    ads: { clicks: 100, cost: 2000000, avgCpc: 30000, conversions: 10 },
    gsc: { impressions: 10000, position: 8 }
  });
  assert.equal(result.classification, 'DISCARD');
  assert.ok(result.score <= 29);
});

test('cached GSC preserves all ranking pages and detects cannibalization', async () => {
  const previousCredential = process.env.GSC_SERVICE_ACCOUNT_JSON;
  delete process.env.GSC_SERVICE_ACCOUNT_JSON;
  try {
    const provider = new SearchConsoleProvider({
      cachedSnapshot: {
        lastAuditTimestamp: '2026-08-21T00:00:00.000Z',
        queries: {
          'jasa laser cutting stainless': {
            clicks: 12,
            impressions: 300,
            ctr: 0.04,
            position: 14,
            checkedAt: '2026-08-21T00:00:00.000Z',
            rankingUrls: [
              { url: 'https://example.com/page-a', clicks: 7, impressions: 180, ctr: 0.0389, position: 11.2 },
              { url: 'https://example.com/page-b', clicks: 5, impressions: 120, ctr: 0.0417, position: 17.8 }
            ]
          }
        }
      }
    });
    const gsc = await provider.loadCluster(['jasa laser cutting stainless']);
    assert.equal(gsc.status, 'CACHED');
    assert.equal(gsc.fetchedAt, '2026-08-21T00:00:00.000Z');
    assert.equal(gsc.rankingUrls.length, 2);
    const item = {
      searchTerm: 'jasa laser cutting stainless',
      campaign: 'manual',
      clicks: 20,
      impressions: 0,
      cost: 500000,
      avgCpc: 25000,
      conversions: 0,
      conversionValue: 0,
      businessRelevance: 100,
      intent: 'TRANSACTIONAL',
      source: 'google_ads_search_terms_manual',
      status: 'MANUAL',
      fetchedAt: '2026-08-21T00:00:00.000Z'
    };
    const opportunity = buildOpportunity({ cluster: 'Jasa Laser Cutting Stainless', primaryKeyword: item.searchTerm, supportingQueries: [], items: [item] }, gsc);
    assert.equal(opportunity.cannibalization, true);
    assert.equal(opportunity.recommendation, 'MERGE_CANNIBALIZATION');
  } finally {
    if (previousCredential == null) delete process.env.GSC_SERVICE_ACCOUNT_JSON;
    else process.env.GSC_SERVICE_ACCOUNT_JSON = previousCredential;
  }
});

async function startServer({ port, dataDir }) {
  const env = {
    ...process.env,
    PORT: String(port),
    HQ_PASSWORD: 'nadia-test-password',
    HQ_AUTH_SECRET: 'nadia-test-auth-secret',
    NADIA_DATA_DIR: dataDir,
    NODE_ENV: 'test'
  };
  delete env.GSC_SERVICE_ACCOUNT_JSON;
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: path.resolve('.'),
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdout.resume();
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await delay(100);
    if (child.exitCode !== null) throw new Error(`server exited early: ${child.exitCode} ${stderr}`);
    try {
      if ((await fetch(`${base}/`)).status === 200) return { child, exited, base };
    } catch {}
  }
  child.kill('SIGTERM');
  throw new Error('server did not become ready');
}

async function stopServer(server) {
  server.child.kill('SIGTERM');
  await Promise.race([server.exited, delay(3000)]);
}

async function authenticate(base) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'nadia-test-password' })
  });
  assert.equal(response.status, 200);
  return (await response.json()).token;
}

test('authenticated Nadia API persists analysis and proposed tasks across restart', async () => {
  const dataDir = path.resolve('data', `nadia-test-${process.pid}`);
  await fs.rm(dataDir, { recursive: true, force: true });
  let first;
  let second;
  try {
    first = await startServer({ port: 39510, dataDir });
    const unauthorizedRoutes = [
      '/api/agents/nadia/status',
      '/api/agents/nadia/opportunities',
      '/api/agents/nadia/analyze',
      '/api/agents/nadia/tasks'
    ];
    for (const route of unauthorizedRoutes) {
      const response = await fetch(`${first.base}${route}`, { method: route.endsWith('status') || route.endsWith('opportunities') ? 'GET' : 'POST' });
      assert.equal(response.status, 401, `${route} should require authentication`);
    }

    const token = await authenticate(first.base);
    const headers = { authorization: `Bearer ${token}` };
    const analysisResponse = await fetch(`${first.base}/api/agents/nadia/analyze`, {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: '{}'
    });
    assert.equal(analysisResponse.status, 200);
    const analysis = await analysisResponse.json();
    assert.equal(analysis.status, 'success');
    assert.ok(analysis.opportunities.length >= 5);
    assert.equal(analysis.run.sources.find(item => item.source === 'google_ads_search_terms_manual').status, 'MANUAL');
    const gscSource = analysis.run.sources.find(item => item.source === 'google_search_console');
    assert.ok(['UNAVAILABLE', 'CACHED', 'LIVE'].includes(gscSource.status));
    for (const opportunity of analysis.opportunities) {
      for (const block of [opportunity.ads, opportunity.gsc]) {
        assert.equal(typeof block.source, 'string');
        assert.equal(typeof block.status, 'string');
        assert.equal(typeof block.fetchedAt, 'string');
      }
      const derivedEvidence = opportunity.evidence.find(item => item.type === 'DERIVED_ANALYSIS');
      assert.equal(derivedEvidence.source, 'nadia_rule_engine_v1');
      assert.equal(derivedEvidence.status, 'DERIVED');
      assert.equal(typeof derivedEvidence.fetchedAt, 'string');
      assert.equal(opportunity.existingPageStatus, 'UNKNOWN');
      assert.equal(opportunity.existingPageFound, null);
      assert.notEqual(opportunity.recommendation, 'CREATE_NEW_PAGE');
      assert.equal(typeof opportunity.scoreExplanation.businessRelevance.points, 'number');
    }

    const taskOpportunity = analysis.opportunities.find(item => item.classification !== 'DISCARD');
    assert.ok(taskOpportunity);
    const taskResponse = await fetch(`${first.base}/api/agents/nadia/tasks`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ opportunityId: taskOpportunity.id })
    });
    assert.equal(taskResponse.status, 201);
    const task = (await taskResponse.json()).task;
    assert.equal(task.status, 'PROPOSED');
    assert.equal(task.assignedTo, 'maya');

    const countBeforeRestart = analysis.opportunities.length;
    await stopServer(first);
    first = null;

    second = await startServer({ port: 39511, dataDir });
    const secondToken = await authenticate(second.base);
    const persistedResponse = await fetch(`${second.base}/api/agents/nadia/opportunities`, { headers: { authorization: `Bearer ${secondToken}` } });
    assert.equal(persistedResponse.status, 200);
    assert.equal((await persistedResponse.json()).count, countBeforeRestart);

    for (const route of ['/', '/index.html', '/style.css', '/app.js']) {
      assert.equal((await fetch(`${second.base}${route}`)).status, 200);
    }
    const verifyResponse = await fetch(`${second.base}/api/auth/verify`, { headers: { authorization: `Bearer ${secondToken}` } });
    assert.equal(verifyResponse.status, 200);
    const gscResponse = await fetch(`${second.base}/api/serp-audit`, { headers: { authorization: `Bearer ${secondToken}` } });
    assert.equal(gscResponse.status, 200);
  } finally {
    if (first) await stopServer(first);
    if (second) await stopServer(second);
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});
