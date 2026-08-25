// Pulls Maya's real activity log from the tepatlaser repo (public, so a
// plain unauthenticated fetch of the raw file is enough — no cross-service
// auth needed). This is the bridge between the agentic publisher that
// actually runs in heriscaleup/tepatlaser and this dashboard's visualization.

const STATUS_URL = process.env.MAYA_STATUS_URL
  || 'https://raw.githubusercontent.com/heriscaleup/tepatlaser/main/data/maya-status.json';
const RANKINGS_URL = process.env.MAYA_RANKINGS_URL
  || 'https://raw.githubusercontent.com/heriscaleup/tepatlaser/main/data/rankings/history.json';

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
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

  try {
    const result = await fetchJson(STATUS_URL);
    status = result.notFound ? { schemaVersion: 1, updatedAt: null, runs: [] } : result.data;
  } catch (error) {
    errors.push(`maya-status.json: ${error.message}`);
  }

  try {
    const result = await fetchJson(RANKINGS_URL);
    rankings = result.notFound ? { schemaVersion: 1, snapshots: [] } : result.data;
  } catch (error) {
    errors.push(`rankings/history.json: ${error.message}`);
  }

  return { status, rankings, syncedAt, errors };
}
