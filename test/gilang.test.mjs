import assert from 'node:assert/strict';
import test from 'node:test';

import { GilangAgent, gilangAgent } from '../agents/gilang/agent.mjs';
import {
  DeploymentTracker,
  buildSitemapXml,
  validateStaticBuild,
  verifySitemapUrls
} from '../agents/gilang/build_runner.mjs';
import { CloudflarePurgeClient } from '../agents/gilang/cloudflare_purge.mjs';
import { DEPLOY_STATUSES, GILANG_IDENTITY, TARGET_ENVIRONMENTS } from '../agents/gilang/constants.mjs';

// ---- validateStaticBuild ----------------------------------------------------

test('validateStaticBuild passes when every required file is present in the manifest', () => {
  const result = validateStaticBuild({
    files: ['index.html', 'style.css', 'app.js', 'server.mjs', 'extra.js'],
    requiredFiles: ['index.html', 'style.css', 'app.js', 'server.mjs']
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.missingFiles, []);
  assert.equal(result.checkedFiles, 5);
  assert.ok(typeof result.checkedAt === 'string' && result.checkedAt.length > 0);
});

test('validateStaticBuild reports missing required files', () => {
  const result = validateStaticBuild({
    files: ['index.html', 'app.js'],
    requiredFiles: ['index.html', 'style.css', 'app.js', 'server.mjs']
  });
  assert.equal(result.valid, false);
  assert.deepEqual(result.missingFiles, ['style.css', 'server.mjs']);
});

test('validateStaticBuild defaults to the standard TepatLaser required file set', () => {
  const result = validateStaticBuild({ files: [] });
  assert.equal(result.valid, false);
  assert.equal(result.requiredFiles, 4);
  assert.ok(result.missingFiles.includes('index.html'));
});

// ---- verifySitemapUrls -------------------------------------------------------

test('verifySitemapUrls accepts a clean set of absolute https urls', () => {
  const result = verifySitemapUrls(['https://tepatlaser.com/', 'https://tepatlaser.com/services'], {
    baseUrl: 'https://tepatlaser.com'
  });
  assert.equal(result.valid, true);
  assert.equal(result.totalUrls, 2);
  assert.equal(result.uniqueUrls, 2);
  assert.deepEqual(result.invalidUrls, []);
  assert.deepEqual(result.duplicates, []);
});

test('verifySitemapUrls flags non-https and malformed urls as invalid', () => {
  const result = verifySitemapUrls(['http://tepatlaser.com/', 'not-a-url', 'https://tepatlaser.com/ok']);
  assert.equal(result.valid, false);
  assert.deepEqual(result.invalidUrls, ['http://tepatlaser.com/', 'not-a-url']);
});

test('verifySitemapUrls flags urls outside the configured baseUrl', () => {
  const result = verifySitemapUrls(['https://tepatlaser.com/', 'https://evil.example.com/'], {
    baseUrl: 'https://tepatlaser.com'
  });
  assert.equal(result.valid, false);
  assert.deepEqual(result.invalidUrls, ['https://evil.example.com/']);
});

test('verifySitemapUrls flags duplicate urls', () => {
  const result = verifySitemapUrls(['https://tepatlaser.com/', 'https://tepatlaser.com/']);
  assert.equal(result.valid, false);
  assert.equal(result.totalUrls, 2);
  assert.equal(result.uniqueUrls, 1);
  assert.deepEqual(result.duplicates, ['https://tepatlaser.com/']);
});

test('verifySitemapUrls treats an empty url list as invalid', () => {
  const result = verifySitemapUrls([]);
  assert.equal(result.valid, false);
  assert.equal(result.totalUrls, 0);
});

// ---- buildSitemapXml ----------------------------------------------------------

test('buildSitemapXml renders a standard sitemap.xml document', () => {
  const xml = buildSitemapXml(['https://tepatlaser.com/', 'https://tepatlaser.com/services']);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));
  assert.ok(xml.includes('<url><loc>https://tepatlaser.com/</loc></url>'));
  assert.ok(xml.includes('<url><loc>https://tepatlaser.com/services</loc></url>'));
});

// ---- DeploymentTracker ---------------------------------------------------------

test('DeploymentTracker.startDeploy creates a PENDING record and rejects unknown environments', () => {
  const tracker = new DeploymentTracker();
  const deployment = tracker.startDeploy({ environment: TARGET_ENVIRONMENTS.STAGING });
  assert.equal(deployment.status, DEPLOY_STATUSES.PENDING);
  assert.equal(deployment.environment, TARGET_ENVIRONMENTS.STAGING);
  assert.ok(deployment.id.startsWith('DEPLOY-'));

  assert.throws(() => tracker.startDeploy({ environment: 'NOT_REAL' }), { code: 'VALIDATION_ERROR' });
});

test('DeploymentTracker.updateStatus transitions a deployment and rejects unknown status/id', () => {
  const tracker = new DeploymentTracker();
  const deployment = tracker.startDeploy({ environment: TARGET_ENVIRONMENTS.PRODUCTION });

  const updated = tracker.updateStatus(deployment.id, DEPLOY_STATUSES.LIVE);
  assert.equal(updated.status, DEPLOY_STATUSES.LIVE);
  assert.equal(updated.id, deployment.id);

  assert.throws(() => tracker.updateStatus(deployment.id, 'BOGUS_STATUS'), { code: 'VALIDATION_ERROR' });
  assert.throws(() => tracker.updateStatus('DEPLOY-MISSING', DEPLOY_STATUSES.LIVE), { code: 'DEPLOY_NOT_FOUND' });
});

test('DeploymentTracker.getLogs filters by environment and sorts newest first', () => {
  const tracker = new DeploymentTracker();
  const first = tracker.startDeploy({ environment: TARGET_ENVIRONMENTS.STAGING });
  const second = tracker.startDeploy({ environment: TARGET_ENVIRONMENTS.PRODUCTION });
  const third = tracker.startDeploy({ environment: TARGET_ENVIRONMENTS.STAGING });

  const stagingLogs = tracker.getLogs({ environment: TARGET_ENVIRONMENTS.STAGING });
  assert.equal(stagingLogs.length, 2);
  assert.ok(stagingLogs.every((d) => d.environment === TARGET_ENVIRONMENTS.STAGING));

  const allLogs = tracker.getLogs();
  assert.equal(allLogs.length, 3);
  assert.ok(new Set(allLogs.map((d) => d.id)).size === 3);
  assert.ok([first.id, second.id, third.id].includes(allLogs[0].id));
});

test('DeploymentTracker.getLatest returns null when there is no deployment history', () => {
  const tracker = new DeploymentTracker();
  assert.equal(tracker.getLatest(), null);
});

// ---- CloudflarePurgeClient ------------------------------------------------------

test('CloudflarePurgeClient falls back to a mocked purge when unconfigured', async () => {
  const client = new CloudflarePurgeClient({ apiToken: null, zoneId: null });
  assert.equal(client.isConfigured(), false);

  const explanation = await client.explain();
  assert.equal(explanation.status, 'UNAVAILABLE');
  assert.ok(explanation.error.includes('GILANG_CLOUDFLARE_API_TOKEN'));

  const result = await client.purgeUrls(['https://tepatlaser.com/']);
  assert.equal(result.purged, true);
  assert.equal(result.mocked, true);
  assert.equal(result.error, null);
  assert.deepEqual(result.urls, ['https://tepatlaser.com/']);
});

test('CloudflarePurgeClient forms a specific-files purge payload when urls are given', async () => {
  const client = new CloudflarePurgeClient({ apiToken: null, zoneId: null });
  const result = await client.purgeUrls(['https://tepatlaser.com/a', 'https://tepatlaser.com/b']);
  assert.deepEqual(result.payload, { files: ['https://tepatlaser.com/a', 'https://tepatlaser.com/b'] });
});

test('CloudflarePurgeClient forms a purge_everything payload when no urls are given', async () => {
  const client = new CloudflarePurgeClient({ apiToken: null, zoneId: null });
  const result = await client.purgeUrls([]);
  assert.deepEqual(result.payload, { purge_everything: true });
});

test('CloudflarePurgeClient calls the real Cloudflare API when configured and reports success', async (t) => {
  const client = new CloudflarePurgeClient({ apiToken: 'test-token', zoneId: 'zone-123' });
  assert.equal(client.isConfigured(), true);

  let capturedUrl = null;
  let capturedOptions = null;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return { ok: true, json: async () => ({ success: true }) };
  });

  const result = await client.purgeUrls(['https://tepatlaser.com/']);
  assert.equal(result.purged, true);
  assert.equal(result.mocked, false);
  assert.equal(result.error, null);
  assert.equal(capturedUrl, 'https://api.cloudflare.com/client/v4/zones/zone-123/purge_cache');
  assert.equal(capturedOptions.headers.Authorization, 'Bearer test-token');
  assert.deepEqual(JSON.parse(capturedOptions.body), { files: ['https://tepatlaser.com/'] });
});

test('CloudflarePurgeClient reports Cloudflare API errors without throwing', async (t) => {
  const client = new CloudflarePurgeClient({ apiToken: 'test-token', zoneId: 'zone-123' });
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: false,
    status: 403,
    json: async () => ({ success: false, errors: [{ message: 'Invalid token' }] })
  }));

  const result = await client.purgeUrls(['https://tepatlaser.com/']);
  assert.equal(result.purged, false);
  assert.ok(result.error.includes('Invalid token'));
});

test('CloudflarePurgeClient reports network failures without throwing', async (t) => {
  const client = new CloudflarePurgeClient({ apiToken: 'test-token', zoneId: 'zone-123' });
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('network down');
  });

  const result = await client.purgeUrls(['https://tepatlaser.com/']);
  assert.equal(result.purged, false);
  assert.equal(result.mocked, false);
  assert.equal(result.error, 'network down');
});

// ---- GilangAgent integration -----------------------------------------------------

test('GilangAgent.triggerBuild runs the full pipeline to LIVE for a valid build', () => {
  const agent = new GilangAgent({
    buildFiles: ['index.html', 'style.css', 'app.js', 'server.mjs'],
    sitemapUrls: ['https://tepatlaser.com/'],
    baseUrl: 'https://tepatlaser.com'
  });
  const deployment = agent.triggerBuild(TARGET_ENVIRONMENTS.PRODUCTION);
  assert.equal(deployment.status, DEPLOY_STATUSES.LIVE);
  assert.equal(deployment.environment, TARGET_ENVIRONMENTS.PRODUCTION);
  assert.equal(deployment.buildResult.valid, true);
  assert.equal(deployment.sitemapResult.valid, true);
});

test('GilangAgent.triggerBuild short-circuits to FAILED when required build files are missing', () => {
  const agent = new GilangAgent({
    buildFiles: ['index.html'],
    sitemapUrls: ['https://tepatlaser.com/'],
    baseUrl: 'https://tepatlaser.com'
  });
  const deployment = agent.triggerBuild(TARGET_ENVIRONMENTS.STAGING);
  assert.equal(deployment.status, DEPLOY_STATUSES.FAILED);
  assert.equal(deployment.buildResult.valid, false);
});

test('GilangAgent.triggerBuild short-circuits to FAILED when the sitemap is invalid', () => {
  const agent = new GilangAgent({
    buildFiles: ['index.html', 'style.css', 'app.js', 'server.mjs'],
    sitemapUrls: ['not-a-url'],
    baseUrl: 'https://tepatlaser.com'
  });
  const deployment = agent.triggerBuild(TARGET_ENVIRONMENTS.STAGING);
  assert.equal(deployment.status, DEPLOY_STATUSES.FAILED);
  assert.equal(deployment.sitemapResult.valid, false);
});

test('GilangAgent.triggerBuild rejects unknown environments', () => {
  const agent = new GilangAgent();
  assert.throws(() => agent.triggerBuild('MOON'), { code: 'VALIDATION_ERROR' });
});

test('GilangAgent.renderSitemap delegates to buildSitemapXml with the configured urls', () => {
  const agent = new GilangAgent({ sitemapUrls: ['https://tepatlaser.com/'] });
  const xml = agent.renderSitemap();
  assert.ok(xml.includes('<url><loc>https://tepatlaser.com/</loc></url>'));
});

test('GilangAgent.purgeCache delegates to the injected purge client', async () => {
  let receivedUrls = null;
  const fakePurgeClient = {
    purgeUrls: async (urls) => {
      receivedUrls = urls;
      return { purged: true, mocked: true, urls, error: null };
    },
    explain: async () => ({ status: 'UNAVAILABLE' })
  };
  const agent = new GilangAgent({ purgeClient: fakePurgeClient });
  const result = await agent.purgeCache(['https://tepatlaser.com/']);
  assert.equal(result.purged, true);
  assert.deepEqual(receivedUrls, ['https://tepatlaser.com/']);
});

test('GilangAgent.getDeployLogs and getStatus reflect deployment history', async () => {
  const agent = new GilangAgent({
    buildFiles: ['index.html', 'style.css', 'app.js', 'server.mjs'],
    sitemapUrls: ['https://tepatlaser.com/'],
    baseUrl: 'https://tepatlaser.com'
  });

  const idleStatus = await agent.getStatus();
  assert.equal(idleStatus.currentStatus, 'IDLE');
  assert.equal(idleStatus.totalDeployments, 0);
  assert.equal(idleStatus.agent.id, GILANG_IDENTITY.id);

  agent.triggerBuild(TARGET_ENVIRONMENTS.STAGING);
  agent.triggerBuild(TARGET_ENVIRONMENTS.PRODUCTION);

  const logs = agent.getDeployLogs({ environment: TARGET_ENVIRONMENTS.STAGING });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].environment, TARGET_ENVIRONMENTS.STAGING);

  const status = await agent.getStatus();
  assert.equal(status.totalDeployments, 2);
  assert.equal(status.currentStatus, DEPLOY_STATUSES.LIVE);
  assert.ok(status.latestDeployment !== null);
  assert.ok(status.cloudflarePurge !== undefined);
});

test('the exported gilangAgent singleton runs a full build/deploy cycle against real TepatLaser defaults without throwing', async () => {
  const deployment = gilangAgent.triggerBuild(TARGET_ENVIRONMENTS.PRODUCTION);
  assert.equal(deployment.status, DEPLOY_STATUSES.LIVE);

  const status = await gilangAgent.getStatus();
  assert.equal(status.agent.id, GILANG_IDENTITY.id);
  assert.ok(status.totalDeployments > 0);

  const purgeResult = await gilangAgent.purgeCache(['https://tepatlaser.com/']);
  assert.equal(purgeResult.purged, true);
});
