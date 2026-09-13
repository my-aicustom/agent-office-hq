import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchMayaSource } from '../agents/maya/sync.mjs';

test('fetchMayaSource falls back gracefully and surfaces errors when remote is 404', async () => {
  const origStatusUrl = process.env.MAYA_STATUS_URL;
  const origRankingsUrl = process.env.MAYA_RANKINGS_URL;
  const origGithubToken = process.env.GITHUB_TOKEN;

  try {
    // Point to non-existent endpoint to simulate 404
    process.env.MAYA_STATUS_URL = 'https://httpbin.org/status/404';
    process.env.MAYA_RANKINGS_URL = 'https://httpbin.org/status/404';
    delete process.env.GITHUB_TOKEN;

    const result = await fetchMayaSource();
    assert.ok(result.syncedAt);
    assert.ok(Array.isArray(result.errors));
    // If local files exist, status will be parsed locally; otherwise errors include 404
    if (result.errors.length > 0) {
      assert.match(result.errors.join(' '), /404/);
    }
  } finally {
    if (origStatusUrl) process.env.MAYA_STATUS_URL = origStatusUrl;
    else delete process.env.MAYA_STATUS_URL;

    if (origRankingsUrl) process.env.MAYA_RANKINGS_URL = origRankingsUrl;
    else delete process.env.MAYA_RANKINGS_URL;

    if (origGithubToken) process.env.GITHUB_TOKEN = origGithubToken;
    else delete process.env.GITHUB_TOKEN;
  }
});
