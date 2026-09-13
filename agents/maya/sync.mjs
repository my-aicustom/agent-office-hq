import fs from 'fs';
import path from 'path';

const STATUS_URL = process.env.MAYA_STATUS_URL
  || 'https://raw.githubusercontent.com/my-aicustom/tepatlaser/main/data/maya-status.json';
const RANKINGS_URL = process.env.MAYA_RANKINGS_URL
  || 'https://raw.githubusercontent.com/my-aicustom/tepatlaser/main/data/rankings/history.json';

const LOCAL_STATUS_PATH = path.resolve('D:/code/tepatlaser/data/maya-status.json');
const LOCAL_RANKINGS_PATH = path.resolve('D:/code/tepatlaser/data/rankings/history.json');

async function fetchJson(url) {
  const headers = { 'Cache-Control': 'no-cache' };
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers['Authorization'] = `token ${token}`;
  }
  const res = await fetch(url, { headers });
  if (res.status === 404) {
    return { data: null, notFound: true };
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  return { data: await res.json(), notFound: false };
}

/**
 * @returns {Promise<{ status: object|null, rankings: object|null, syncedAt: string, errors: string[] }>}
 */
export async function fetchMayaSource() {
  const syncedAt = new Date().toISOString();
  const errors = [];
  let status = null;
  let rankings = null;

  // 1. Try local repository first if available
  if (fs.existsSync(LOCAL_STATUS_PATH)) {
    try {
      const raw = fs.readFileSync(LOCAL_STATUS_PATH, 'utf8');
      status = JSON.parse(raw);
    } catch (e) {
      errors.push(`local maya-status.json: ${e.message}`);
    }
  }

  if (fs.existsSync(LOCAL_RANKINGS_PATH)) {
    try {
      const raw = fs.readFileSync(LOCAL_RANKINGS_PATH, 'utf8');
      rankings = JSON.parse(raw);
    } catch (e) {
      errors.push(`local rankings/history.json: ${e.message}`);
    }
  }

  // 2. Fallback to remote if not found locally
  if (!status) {
    try {
      const result = await fetchJson(STATUS_URL);
      if (result.notFound) {
        errors.push(`maya-status.json: HTTP 404 (verify MAYA_STATUS_URL or GITHUB_TOKEN if private repo)`);
        status = { schemaVersion: 1, updatedAt: null, runs: [] };
      } else {
        status = result.data;
      }
    } catch (error) {
      errors.push(`maya-status.json: ${error.message}`);
    }
  }

  if (!rankings) {
    try {
      const result = await fetchJson(RANKINGS_URL);
      if (result.notFound) {
        errors.push(`rankings/history.json: HTTP 404 (verify MAYA_RANKINGS_URL or GITHUB_TOKEN if private repo)`);
        rankings = { schemaVersion: 1, snapshots: [] };
      } else {
        rankings = result.data;
      }
    } catch (error) {
      errors.push(`rankings/history.json: ${error.message}`);
    }
  }

  return { status, rankings, syncedAt, errors };
}
