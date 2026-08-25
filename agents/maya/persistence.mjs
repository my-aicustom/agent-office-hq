// Local cache for Maya's real-world status, synced from the tepatlaser repo
// (see sync.mjs). Mirrors agents/nadia/persistence.mjs's atomic-write,
// flat-JSON-file pattern — no database needed for this either.

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const DEFAULT_DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'maya');

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw new Error(`Maya persistence read failed for ${path.basename(filePath)}: ${error.message}`);
  }
}

async function atomicWrite(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(payload, null, 2), { encoding: 'utf8', flag: 'wx' });
  await fs.rename(tempPath, filePath);
}

export class MayaPersistence {
  constructor(dataDir = process.env.MAYA_DATA_DIR || DEFAULT_DATA_DIR) {
    this.dataDir = path.resolve(dataDir);
    this.paths = {
      status: path.join(this.dataDir, 'status.json'),
      rankings: path.join(this.dataDir, 'rankings.json')
    };
  }

  readStatus() {
    return readJson(this.paths.status, { schemaVersion: 1, updatedAt: null, runs: [], syncedAt: null, syncError: null });
  }

  writeStatus(status) {
    return atomicWrite(this.paths.status, status);
  }

  readRankings() {
    return readJson(this.paths.rankings, { schemaVersion: 1, snapshots: [], syncedAt: null, syncError: null });
  }

  writeRankings(rankings) {
    return atomicWrite(this.paths.rankings, rankings);
  }
}
