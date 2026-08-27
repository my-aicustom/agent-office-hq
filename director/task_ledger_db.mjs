// Iron Director — SQLite Durable Task Ledger (ACID, Atomic Leasing & Fencing Tokens)
// Rule 11 Compliant: Prevents race conditions, dual-worker split-brain, and data loss on crash.

import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { TASK_STATES, TASK_ROLES, TASK_PERMISSIONS } from './constants.mjs';
import { TaskStateMachine } from './state_machine.mjs';

export class TaskLedgerDb {
  constructor({ dbPath = null } = {}) {
    this.dbPath = dbPath || path.resolve('data/director/ledger.db');
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new DatabaseSync(this.dbPath);
    this._initSchema();
  }

  _initSchema() {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      PRAGMA busy_timeout = 5000;

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        role TEXT NOT NULL,
        state TEXT NOT NULL,
        owner TEXT,
        idempotency_key TEXT UNIQUE,
        fencing_token INTEGER DEFAULT 1,
        lease_owner TEXT,
        lease_expires_at INTEGER DEFAULT 0,
        permissions TEXT,
        input TEXT,
        output TEXT,
        evidence TEXT,
        history TEXT,
        claimed_at TEXT,
        completed_at TEXT,
        failed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_state ON tasks(state);
      CREATE INDEX IF NOT EXISTS idx_tasks_idempotency ON tasks(idempotency_key);
      CREATE INDEX IF NOT EXISTS idx_tasks_lease ON tasks(state, lease_expires_at);

      CREATE TABLE IF NOT EXISTS task_events (
        event_id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        from_state TEXT,
        to_state TEXT NOT NULL,
        actor TEXT NOT NULL,
        reason TEXT,
        evidence TEXT,
        fencing_token INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id, event_id);
    `);
  }

  _transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  _insertEvent(taskId, entry, fencingToken) {
    this.db.prepare(`
      INSERT INTO task_events (
        task_id, timestamp, from_state, to_state, actor, reason, evidence, fencing_token
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      taskId,
      entry.timestamp,
      entry.fromState || null,
      entry.toState,
      entry.actor,
      entry.reason || '',
      entry.evidence ? JSON.stringify(entry.evidence) : null,
      fencingToken
    );
  }

  _hydrate(row) {
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      role: row.role,
      state: row.state,
      owner: row.owner,
      idempotencyKey: row.idempotency_key,
      fencingToken: Number(row.fencing_token) || 1,
      leaseOwner: row.lease_owner,
      leaseExpiresAt: Number(row.lease_expires_at) || 0,
      permissions: row.permissions ? JSON.parse(row.permissions) : [TASK_PERMISSIONS.READ],
      input: row.input ? JSON.parse(row.input) : {},
      output: row.output ? JSON.parse(row.output) : null,
      evidence: row.evidence ? JSON.parse(row.evidence) : null,
      history: row.history ? JSON.parse(row.history) : [],
      claimedAt: row.claimed_at,
      completedAt: row.completed_at,
      failedAt: row.failed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  createTask({
    id = null,
    title,
    role = TASK_ROLES.SUPERVISOR,
    owner = null,
    input = {},
    permissions = [TASK_PERMISSIONS.READ, TASK_PERMISSIONS.WRITE_CODE],
    idempotencyKey = null
  }) {
    if (!title || typeof title !== 'string') {
      throw new Error('Task title is required.');
    }

    return this._transaction(() => {
      if (idempotencyKey) {
        const existingRow = this.db.prepare(`SELECT * FROM tasks WHERE idempotency_key = ?`).get(idempotencyKey);
        if (existingRow) {
          return { task: this._hydrate(existingRow), created: false };
        }
      }

      const taskId = id || `task-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      const timestamp = new Date().toISOString();
      const initialState = TASK_STATES.QUEUED;

    const initialHistory = [{
      timestamp,
      fromState: TASK_STATES.PROPOSED,
      toState: initialState,
      actor: owner || 'system',
      reason: 'Task created and queued in SQLite Durable Ledger',
      evidence: null
    }];

    const stmt = this.db.prepare(`
      INSERT INTO tasks (
        id, title, role, state, owner, idempotency_key, fencing_token,
        lease_owner, lease_expires_at, permissions, input, output, evidence,
        history, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?
      )
    `);

    stmt.run(
      taskId,
      title,
      role,
      initialState,
      owner,
      idempotencyKey || null,
      1,
      null,
      0,
      JSON.stringify(permissions),
      JSON.stringify(input || {}),
      null,
      null,
      JSON.stringify(initialHistory),
      timestamp,
      timestamp
    );

      this._insertEvent(taskId, initialHistory[0], 1);

      const created = this.getTask(taskId);
      return { task: created, created: true };
    });
  }

  getTask(id) {
    if (!id) return null;
    const row = this.db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id);
    return this._hydrate(row);
  }

  /**
   * Updates worker heartbeat and extends lease expiry.
   */
  heartbeat(taskId, workerId, { fencingToken, leaseTtlMs = 60000 } = {}) {
    if (!Number.isInteger(fencingToken) || fencingToken < 1) {
      throw new Error('A valid fencingToken is required for heartbeat.');
    }
    const nowMs = Date.now();
    const leaseExpiresAt = nowMs + leaseTtlMs;
    const nowIso = new Date(nowMs).toISOString();
    const stmt = this.db.prepare(`
      UPDATE tasks SET
        lease_expires_at = ?,
        updated_at = ?
      WHERE id = ?
        AND lease_owner = ?
        AND fencing_token = ?
        AND state IN ('CLAIMED', 'RUNNING')
    `);
    const res = stmt.run(leaseExpiresAt, nowIso, taskId, workerId, fencingToken);
    return res.changes > 0;
  }

  /**
   * Claims a specific task ID with lease lock.
   */
  claimTask(taskId, workerId, leaseTtlMs = 60000) {
    if (!workerId) throw new Error('workerId is required to claim a task.');
    return this._transaction(() => {
      const nowMs = Date.now();
      const leaseExpiresAt = nowMs + leaseTtlMs;
      const nowIso = new Date(nowMs).toISOString();
      const current = this.getTask(taskId);
      if (!current) return null;
      const newFencingToken = current.fencingToken + 1;
      const historyEntry = {
        timestamp: nowIso,
        fromState: current.state,
        toState: TASK_STATES.CLAIMED,
        actor: workerId,
        reason: current.state === TASK_STATES.CLAIMED ? 'Expired lease reclaimed by worker' : 'Task claimed by worker',
        evidence: { leaseTtlMs, fencingToken: newFencingToken }
      };
      const stmt = this.db.prepare(`
        UPDATE tasks SET
          state = 'CLAIMED',
          lease_owner = ?,
          lease_expires_at = ?,
          fencing_token = ?,
          owner = ?,
          history = ?,
          claimed_at = COALESCE(claimed_at, ?),
          updated_at = ?
        WHERE id = ?
          AND fencing_token = ?
          AND (state = 'QUEUED' OR (state = 'CLAIMED' AND lease_expires_at < ?))
      `);
      const res = stmt.run(
        workerId,
        leaseExpiresAt,
        newFencingToken,
        workerId,
        JSON.stringify([...current.history, historyEntry]),
        nowIso,
        nowIso,
        taskId,
        current.fencingToken,
        nowMs
      );
      if (res.changes === 0) return null;
      this._insertEvent(taskId, historyEntry, newFencingToken);
      return this.getTask(taskId);
    });
  }

  /**
   * Atomically claims the next available queued task or expired lease.
   */
  claimNextQueuedTask({ workerId, leaseTtlMs = 60000 }) {
    if (!workerId) throw new Error('workerId is required to claim a task.');
    return this._transaction(() => {
      const nowMs = Date.now();
      const leaseExpiresAt = nowMs + leaseTtlMs;
      const nowIso = new Date(nowMs).toISOString();
      const candidateRow = this.db.prepare(`
        SELECT * FROM tasks
        WHERE state = 'QUEUED' OR (state = 'CLAIMED' AND lease_expires_at > 0 AND lease_expires_at < ?)
        ORDER BY created_at ASC
        LIMIT 1
      `).get(nowMs);
      if (!candidateRow) return null;

      const candidate = this._hydrate(candidateRow);
      const newFencingToken = candidate.fencingToken + 1;
      const historyEntry = {
        timestamp: nowIso,
        fromState: candidate.state,
        toState: TASK_STATES.CLAIMED,
        actor: workerId,
        reason: candidate.state === TASK_STATES.CLAIMED ? 'Expired lease reclaimed by worker' : 'Task claimed by worker',
        evidence: { leaseTtlMs, fencingToken: newFencingToken }
      };
      const updateStmt = this.db.prepare(`
        UPDATE tasks SET
          state = 'CLAIMED',
          lease_owner = ?,
          lease_expires_at = ?,
          fencing_token = ?,
          owner = ?,
          history = ?,
          claimed_at = COALESCE(claimed_at, ?),
          updated_at = ?
        WHERE id = ?
          AND fencing_token = ?
          AND (state = 'QUEUED' OR (state = 'CLAIMED' AND lease_expires_at < ?))
      `);
      const result = updateStmt.run(
        workerId,
        leaseExpiresAt,
        newFencingToken,
        workerId,
        JSON.stringify([...candidate.history, historyEntry]),
        nowIso,
        nowIso,
        candidate.id,
        candidate.fencingToken,
        nowMs
      );
      if (result.changes === 0) return null;
      this._insertEvent(candidate.id, historyEntry, newFencingToken);
      return this.getTask(candidate.id);
    });
  }

  /**
   * Deterministic transition with fencing token protection.
   */
  transition(taskId, nextState, { actor = 'system', reason = '', output = null, evidence = null, fencingToken = null } = {}) {
    return this._transaction(() => {
      const current = this.getTask(taskId);
      if (!current) {
        throw new Error(`Task '${taskId}' not found in SQLite Ledger.`);
      }
      if (fencingToken !== null && fencingToken !== undefined && current.fencingToken !== fencingToken) {
        throw new Error(`Fencing token mismatch on task '${taskId}': expected ${current.fencingToken}, got ${fencingToken}. Stale worker rejected.`);
      }
      if (!TaskStateMachine.canTransition(current.state, nextState)) {
        throw new Error(`Illegal state transition: Cannot move task '${taskId}' from [${current.state}] to [${nextState}].`);
      }

      const nowIso = new Date().toISOString();
      const historyEntry = {
        timestamp: nowIso,
        fromState: current.state,
        toState: nextState,
        actor,
        reason,
        evidence: evidence ? JSON.parse(JSON.stringify(evidence)) : null
      };
      const newOutput = output ? JSON.stringify(output) : (current.output ? JSON.stringify(current.output) : null);
      const newEvidence = evidence ? JSON.stringify(evidence) : (current.evidence ? JSON.stringify(current.evidence) : null);
      const terminalStates = new Set([
        TASK_STATES.DONE,
        TASK_STATES.FAILED,
        TASK_STATES.BLOCKED,
        TASK_STATES.ESCALATED,
        TASK_STATES.ARTIFACT_READY,
        TASK_STATES.PR_OPEN,
        TASK_STATES.AWAITING_REVIEW,
        TASK_STATES.DEPLOYED
      ]);
      let completedAt = current.completedAt;
      let failedAt = current.failedAt;
      if (nextState === TASK_STATES.DONE && !completedAt) completedAt = nowIso;
      if (nextState === TASK_STATES.FAILED && !failedAt) failedAt = nowIso;

      const result = this.db.prepare(`
        UPDATE tasks SET
          state = ?,
          output = ?,
          evidence = ?,
          history = ?,
          completed_at = ?,
          failed_at = ?,
          lease_owner = CASE WHEN ? = 1 THEN NULL ELSE lease_owner END,
          lease_expires_at = CASE WHEN ? = 1 THEN 0 ELSE lease_expires_at END,
          updated_at = ?
        WHERE id = ? AND state = ? AND fencing_token = ?
      `).run(
        nextState,
        newOutput,
        newEvidence,
        JSON.stringify([...current.history, historyEntry]),
        completedAt,
        failedAt,
        terminalStates.has(nextState) ? 1 : 0,
        terminalStates.has(nextState) ? 1 : 0,
        nowIso,
        taskId,
        current.state,
        current.fencingToken
      );
      if (result.changes !== 1) {
        throw new Error(`Concurrent transition rejected for task '${taskId}'. State or fencing token changed.`);
      }
      this._insertEvent(taskId, historyEntry, current.fencingToken);
      return this.getTask(taskId);
    });
  }

  /**
   * Recovers tasks that have exceeded lease expiry while in active states.
   */
  recoverExpiredLeases() {
    return this._transaction(() => {
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const expiredRows = this.db.prepare(`
        SELECT * FROM tasks
        WHERE state IN ('CLAIMED', 'RUNNING', 'VERIFYING') AND lease_expires_at > 0 AND lease_expires_at < ?
      `).all(nowMs);
      const recovered = [];

      for (const row of expiredRows) {
        const task = this._hydrate(row);
        const nextFencingToken = task.fencingToken + 1;
        const historyEntry = {
          timestamp: nowIso,
          fromState: task.state,
          toState: TASK_STATES.QUEUED,
          actor: 'lease-reconciler',
          reason: `Worker lease expired (last owner: ${task.leaseOwner || 'unknown'}). Re-queuing task.`,
          evidence: { expiredAt: task.leaseExpiresAt, nowMs, fencingToken: nextFencingToken }
        };
        const result = this.db.prepare(`
          UPDATE tasks SET
            state = 'QUEUED',
            owner = NULL,
            lease_owner = NULL,
            lease_expires_at = 0,
            fencing_token = ?,
            history = ?,
            updated_at = ?
          WHERE id = ?
            AND state = ?
            AND fencing_token = ?
            AND lease_expires_at = ?
            AND lease_expires_at < ?
        `).run(
          nextFencingToken,
          JSON.stringify([...task.history, historyEntry]),
          nowIso,
          task.id,
          task.state,
          task.fencingToken,
          task.leaseExpiresAt,
          nowMs
        );
        if (result.changes === 1) {
          this._insertEvent(task.id, historyEntry, nextFencingToken);
          recovered.push(this.getTask(task.id));
        }
      }
      return recovered;
    });
  }

  listTasks({ limit = 50, state = null } = {}) {
    let query = `SELECT * FROM tasks`;
    const params = [];
    if (state) {
      query += ` WHERE state = ?`;
      params.push(state);
    }
    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    const rows = this.db.prepare(query).all(...params);
    return rows.map(r => this._hydrate(r));
  }

  listEvents(taskId) {
    if (!taskId) return [];
    return this.db.prepare(`
      SELECT event_id, task_id, timestamp, from_state, to_state, actor, reason, evidence, fencing_token
      FROM task_events
      WHERE task_id = ?
      ORDER BY event_id ASC
    `).all(taskId).map(row => ({
      eventId: Number(row.event_id),
      taskId: row.task_id,
      timestamp: row.timestamp,
      fromState: row.from_state,
      toState: row.to_state,
      actor: row.actor,
      reason: row.reason,
      evidence: row.evidence ? JSON.parse(row.evidence) : null,
      fencingToken: Number(row.fencing_token)
    }));
  }

  /**
   * Finds tasks that have stalled without heartbeat or lease update.
   */
  getStuckTasks(timeoutMs = 120000) {
    const nowMs = Date.now();
    const rows = this.db.prepare(`
      SELECT * FROM tasks
      WHERE state IN ('CLAIMED', 'RUNNING', 'VERIFYING')
    `).all();

    return rows.map(r => this._hydrate(r)).filter(t => {
      const last = new Date(t.updatedAt || t.claimedAt || t.createdAt).getTime();
      return nowMs - last >= timeoutMs;
    });
  }

  getCounts() {
    const rows = this.db.prepare(`SELECT state, COUNT(*) as count FROM tasks GROUP BY state`).all();
    const counts = {};
    for (const s of Object.values(TASK_STATES)) {
      counts[s] = 0;
    }
    for (const r of rows) {
      counts[r.state] = Number(r.count);
    }
    return counts;
  }

  flush() {
    // SQLite WAL mode handles persistence automatically
  }

  close() {
    try {
      this.db.close();
    } catch {}
  }
}
