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
      PRAGMA synchronous = NORMAL;
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
    `);
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

    const created = this.getTask(taskId);
    return { task: created, created: true };
  }

  getTask(id) {
    if (!id) return null;
    const row = this.db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id);
    return this._hydrate(row);
  }

  /**
   * Updates worker heartbeat and extends lease expiry.
   */
  heartbeat(taskId, workerId, leaseTtlMs = 60000) {
    const nowMs = Date.now();
    const leaseExpiresAt = nowMs + leaseTtlMs;
    const nowIso = new Date(nowMs).toISOString();
    const stmt = this.db.prepare(`
      UPDATE tasks SET
        lease_expires_at = ?,
        updated_at = ?
      WHERE id = ? AND (lease_owner = ? OR owner = ?)
    `);
    const res = stmt.run(leaseExpiresAt, nowIso, taskId, workerId, workerId);
    return res.changes > 0;
  }

  /**
   * Claims a specific task ID with lease lock.
   */
  claimTask(taskId, workerId, leaseTtlMs = 60000) {
    const nowMs = Date.now();
    const leaseExpiresAt = nowMs + leaseTtlMs;
    const nowIso = new Date(nowMs).toISOString();
    const current = this.getTask(taskId);
    if (!current) return null;
    const newFencingToken = current.fencingToken + 1;
    const stmt = this.db.prepare(`
      UPDATE tasks SET
        state = 'CLAIMED',
        lease_owner = ?,
        lease_expires_at = ?,
        fencing_token = ?,
        owner = ?,
        updated_at = ?
      WHERE id = ? AND (state = 'QUEUED' OR (state = 'CLAIMED' AND lease_expires_at < ?))
    `);
    const res = stmt.run(workerId, leaseExpiresAt, newFencingToken, workerId, nowIso, taskId, nowMs);
    if (res.changes === 0) return null;
    return this.getTask(taskId);
  }

  /**
   * Atomically claims the next available queued task or expired lease.
   */
  claimNextQueuedTask({ workerId, leaseTtlMs = 60000 }) {
    if (!workerId) throw new Error('workerId is required to claim a task.');
    const nowMs = Date.now();
    const leaseExpiresAt = nowMs + leaseTtlMs;
    const nowIso = new Date(nowMs).toISOString();

    // Step 1: Find candidate
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
    const updatedHistory = [...candidate.history, historyEntry];

    // Step 2: Atomic update with conditional state
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
      WHERE id = ? AND (state = 'QUEUED' OR (state = 'CLAIMED' AND lease_expires_at < ?))
    `);

    const result = updateStmt.run(
      workerId,
      leaseExpiresAt,
      newFencingToken,
      workerId,
      JSON.stringify(updatedHistory),
      nowIso,
      nowIso,
      candidate.id,
      nowMs
    );

    if (result.changes === 0) {
      // Race condition lost to another worker
      return null;
    }

    return this.getTask(candidate.id);
  }

  /**
   * Deterministic transition with fencing token protection.
   */
  transition(taskId, nextState, { actor = 'system', reason = '', output = null, evidence = null, fencingToken = null } = {}) {
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

    const updatedHistory = [...current.history, historyEntry];
    const newOutput = output ? JSON.stringify(output) : (current.output ? JSON.stringify(current.output) : null);
    const newEvidence = evidence ? JSON.stringify(evidence) : (current.evidence ? JSON.stringify(current.evidence) : null);

    let completedAt = current.completedAt;
    let failedAt = current.failedAt;
    if (nextState === TASK_STATES.DONE && !completedAt) completedAt = nowIso;
    if (nextState === TASK_STATES.FAILED && !failedAt) failedAt = nowIso;

    const stmt = this.db.prepare(`
      UPDATE tasks SET
        state = ?,
        output = ?,
        evidence = ?,
        history = ?,
        completed_at = ?,
        failed_at = ?,
        updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      nextState,
      newOutput,
      newEvidence,
      JSON.stringify(updatedHistory),
      completedAt,
      failedAt,
      nowIso,
      taskId
    );

    return this.getTask(taskId);
  }

  /**
   * Recovers tasks that have exceeded lease expiry while in active states.
   */
  recoverExpiredLeases() {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    const expiredRows = this.db.prepare(`
      SELECT * FROM tasks
      WHERE state IN ('CLAIMED', 'RUNNING') AND lease_expires_at > 0 AND lease_expires_at < ?
    `).all(nowMs);

    const recovered = [];

    for (const row of expiredRows) {
      const task = this._hydrate(row);
      const historyEntry = {
        timestamp: nowIso,
        fromState: task.state,
        toState: TASK_STATES.QUEUED,
        actor: 'lease-reconciler',
        reason: `Worker lease expired (last owner: ${task.leaseOwner || 'unknown'}). Re-queuing task.`,
        evidence: { expiredAt: task.leaseExpiresAt, nowMs }
      };

      const updatedHistory = [...task.history, historyEntry];
      this.db.prepare(`
        UPDATE tasks SET
          state = 'QUEUED',
          lease_owner = NULL,
          lease_expires_at = 0,
          history = ?,
          updated_at = ?
        WHERE id = ?
      `).run(JSON.stringify(updatedHistory), nowIso, task.id);

      recovered.push(this.getTask(task.id));
    }

    return recovered;
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

  close() {
    try {
      this.db.close();
    } catch {}
  }
}
