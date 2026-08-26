// Iron Director — Persistent Deduplication Engine
// Guarantees incident deduplication survives server restarts using disk-persisted SHA-256 fingerprints.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DEFAULT_DEDUP_PATH = path.resolve('data/director/sentry_dedup.json');

export class PersistentDedup {
  constructor({ filePath = DEFAULT_DEDUP_PATH, defaultTtlMs = 3600_000 } = {}) {
    this.filePath = filePath;
    this.defaultTtlMs = defaultTtlMs;
    this.cache = new Map(); // fingerprint -> record
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const data = JSON.parse(raw);
        if (data && typeof data.records === 'object') {
          for (const [fp, rec] of Object.entries(data.records)) {
            this.cache.set(fp, rec);
          }
        }
      }
    } catch (err) {
      console.warn(`[PersistentDedup] Warning loading dedup records from ${this.filePath}: ${err.message}`);
    }
  }

  _persist() {
    try {
      const dir = path.dirname(this.filePath);
      fs.mkdirSync(dir, { recursive: true });
      const payload = {
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        records: Object.fromEntries(this.cache.entries())
      };
      const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf8');
      fs.renameSync(tempPath, this.filePath);
    } catch (err) {
      console.error(`[PersistentDedup] Failed to persist dedup records: ${err.message}`);
    }
  }

  /**
   * Generates a deterministic SHA-256 fingerprint for an incident or opportunity.
   */
  static generateFingerprint({ type = '', source = '', targetOrError = '' } = {}) {
    const normType = String(type).trim().toUpperCase();
    const normSource = String(source).trim().toLowerCase();
    // Normalize error/target string (strip timestamps and line numbers for canonical matching)
    const normTarget = String(targetOrError)
      .trim()
      .toLowerCase()
      .replace(/\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}[\w.:+-]*/g, '') // remove ISO timestamps
      .replace(/:\d+:\d+/g, ''); // remove line:col numbers

    const canonical = `${normType}::${normSource}::${normTarget}`;
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  /**
   * Checks if fingerprint has been seen within TTL window.
   */
  isDeduplicated(fingerprint, { ttlMs = this.defaultTtlMs, metadata = {} } = {}) {
    const now = Date.now();
    const existing = this.cache.get(fingerprint);

    if (existing) {
      const elapsed = now - new Date(existing.lastSeenAt).getTime();
      if (elapsed < (existing.ttlMs || ttlMs)) {
        existing.count += 1;
        existing.lastSeenAt = new Date(now).toISOString();
        this._persist();
        return true;
      }
    }

    // New or expired record
    const record = {
      fingerprint,
      firstSeenAt: new Date(now).toISOString(),
      lastSeenAt: new Date(now).toISOString(),
      count: 1,
      ttlMs,
      metadata
    };

    this.cache.set(fingerprint, record);
    this._persist();
    return false;
  }

  getRecord(fingerprint) {
    return this.cache.get(fingerprint) || null;
  }

  clear() {
    this.cache.clear();
    this._persist();
  }
}
