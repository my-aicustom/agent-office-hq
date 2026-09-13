// Iron Director — Persistent Security Store (SQLite WAL)
// Handles persistent rate limiting, session token revocation (blacklist), and immutable audit logs.

import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export class SecurityStore {
  constructor({ dbPath = null } = {}) {
    this.dbPath = dbPath || path.resolve('data/director/security.db');
    if (this.dbPath !== ':memory:') {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new DatabaseSync(this.dbPath);
    this._initSchema();
  }

  _initSchema() {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;

      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        actor TEXT NOT NULL,
        ip TEXT NOT NULL,
        action TEXT NOT NULL,
        target TEXT,
        status TEXT NOT NULL,
        details TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs (timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs (action);

      CREATE TABLE IF NOT EXISTS revoked_tokens (
        token_hash TEXT PRIMARY KEY,
        revoked_at TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_revoked_expires ON revoked_tokens (expires_at);

      CREATE TABLE IF NOT EXISTS login_rate_limits (
        ip TEXT PRIMARY KEY,
        failures INTEGER NOT NULL DEFAULT 0,
        first_failure_at INTEGER NOT NULL,
        locked_until INTEGER NOT NULL DEFAULT 0
      );
    `);
  }

  // ==========================================
  // AUDIT LOGGING
  // ==========================================
  logAudit({ actor = 'unknown', ip = 'unknown', action, target = null, status = 'SUCCESS', details = null }) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO audit_logs (timestamp, actor, ip, action, target, status, details)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const detailsStr = details && typeof details === 'object' ? JSON.stringify(details) : (details ? String(details) : null);
      stmt.run(new Date().toISOString(), actor, ip, action, target, status, detailsStr);
    } catch (err) {
      console.error(`[SecurityStore] Failed to write audit log: ${err.message}`);
    }
  }

  getAuditLogs({ limit = 50, action = null, actor = null } = {}) {
    try {
      let query = 'SELECT * FROM audit_logs';
      const conditions = [];
      const params = [];

      if (action) {
        conditions.push('action = ?');
        params.push(action);
      }
      if (actor) {
        conditions.push('actor = ?');
        params.push(actor);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      query += ' ORDER BY id DESC LIMIT ?';
      params.push(limit);

      const stmt = this.db.prepare(query);
      return stmt.all(...params);
    } catch (err) {
      console.error(`[SecurityStore] Failed to query audit logs: ${err.message}`);
      return [];
    }
  }

  // ==========================================
  // TOKEN REVOCATION (BLACKLIST)
  // ==========================================
  static hashToken(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
  }

  revokeToken(token, expiresAtMs) {
    if (!token) return;
    const tokenHash = SecurityStore.hashToken(token);
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO revoked_tokens (token_hash, revoked_at, expires_at)
        VALUES (?, ?, ?)
      `);
      stmt.run(tokenHash, new Date().toISOString(), expiresAtMs || (Date.now() + 24 * 60 * 60 * 1000));
    } catch (err) {
      console.error(`[SecurityStore] Failed to revoke token: ${err.message}`);
    }
  }

  isTokenRevoked(token) {
    if (!token) return true;
    const tokenHash = SecurityStore.hashToken(token);
    try {
      const stmt = this.db.prepare('SELECT token_hash FROM revoked_tokens WHERE token_hash = ?');
      const row = stmt.get(tokenHash);
      return Boolean(row);
    } catch (err) {
      console.error(`[SecurityStore] Failed to check token revocation: ${err.message}`);
      return false;
    }
  }

  cleanupExpiredRevocations(nowMs = Date.now()) {
    try {
      const stmt = this.db.prepare('DELETE FROM revoked_tokens WHERE expires_at <= ?');
      stmt.run(nowMs);
    } catch {}
  }

  // ==========================================
  // PERSISTENT RATE LIMITING
  // ==========================================
  isIpBlocked(ip, { maxFailures = 5, lockDurationMs = 5 * 60 * 1000, nowMs = Date.now() } = {}) {
    try {
      const stmt = this.db.prepare('SELECT failures, first_failure_at, locked_until FROM login_rate_limits WHERE ip = ?');
      const row = stmt.get(ip);
      if (!row) return false;

      if (row.locked_until && row.locked_until > nowMs) {
        return true;
      }

      // Check if window has elapsed
      if (nowMs - row.first_failure_at > lockDurationMs && row.locked_until <= nowMs) {
        // Window expired, reset
        this.clearLoginFailures(ip);
        return false;
      }

      return row.failures >= maxFailures;
    } catch (err) {
      console.error(`[SecurityStore] Error checking IP rate limit: ${err.message}`);
      return false;
    }
  }

  recordLoginFailure(ip, { maxFailures = 5, lockDurationMs = 5 * 60 * 1000, nowMs = Date.now() } = {}) {
    try {
      const selectStmt = this.db.prepare('SELECT failures, first_failure_at FROM login_rate_limits WHERE ip = ?');
      const row = selectStmt.get(ip);

      if (!row || (nowMs - row.first_failure_at > lockDurationMs)) {
        // First failure in this window
        const insertStmt = this.db.prepare(`
          INSERT OR REPLACE INTO login_rate_limits (ip, failures, first_failure_at, locked_until)
          VALUES (?, 1, ?, 0)
        `);
        insertStmt.run(ip, nowMs);
      } else {
        const newFailures = row.failures + 1;
        const lockedUntil = newFailures >= maxFailures ? nowMs + lockDurationMs : 0;
        const updateStmt = this.db.prepare(`
          UPDATE login_rate_limits
          SET failures = ?, locked_until = ?
          WHERE ip = ?
        `);
        updateStmt.run(newFailures, lockedUntil, ip);
      }
    } catch (err) {
      console.error(`[SecurityStore] Failed to record login failure: ${err.message}`);
    }
  }

  clearLoginFailures(ip) {
    try {
      const stmt = this.db.prepare('DELETE FROM login_rate_limits WHERE ip = ?');
      stmt.run(ip);
    } catch (err) {
      console.error(`[SecurityStore] Failed to clear login failures: ${err.message}`);
    }
  }

  close() {
    try {
      this.db.close();
    } catch {}
  }
}
