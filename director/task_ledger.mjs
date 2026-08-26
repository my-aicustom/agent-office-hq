// Iron Director — Task Ledger (The Single Source of Truth)
// Provides atomic persistence, strict idempotency guards, and live heartbeat leasing.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { TASK_STATES, TASK_ROLES, TASK_PERMISSIONS, DEFAULT_DIRECTOR_CONFIG } from './constants.mjs';
import { TaskStateMachine } from './state_machine.mjs';

const DEFAULT_LEDGER_PATH = path.resolve('data/director/task_ledger.json');

export class TaskLedger {
  constructor({
    filePath = DEFAULT_LEDGER_PATH,
    heartbeatTimeoutMs = DEFAULT_DIRECTOR_CONFIG.heartbeatTimeoutMs
  } = {}) {
    this.filePath = filePath;
    this.heartbeatTimeoutMs = heartbeatTimeoutMs;
    this.tasks = new Map();
    this.idempotencyIndex = new Map();
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.tasks)) {
          for (const t of data.tasks) {
            this.tasks.set(t.id, t);
            if (t.idempotencyKey) {
              this.idempotencyIndex.set(t.idempotencyKey, t.id);
            }
          }
        }
      }
    } catch (err) {
      console.warn(`[TaskLedger] Warning reading ledger from ${this.filePath}: ${err.message}`);
    }
  }

  _persist() {
    try {
      const dir = path.dirname(this.filePath);
      fs.mkdirSync(dir, { recursive: true });
      const payload = {
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        tasks: Array.from(this.tasks.values())
      };
      // Atomic write via temp file
      const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf8');
      fs.renameSync(tempPath, this.filePath);
    } catch (err) {
      console.error(`[TaskLedger] Failed to persist ledger: ${err.message}`);
    }
  }

  /**
   * Generates a deterministic idempotency key from payload if none provided.
   */
  static generateIdempotencyKey(type, payload) {
    const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return crypto.createHash('sha256').update(`${type}:${serialized}`).digest('hex');
  }

  /**
   * Creates or returns an existing idempotent task.
   */
  createTask({
    title,
    role = TASK_ROLES.SCOUT,
    owner = 'unassigned',
    permissions = [TASK_PERMISSIONS.READ],
    input = {},
    idempotencyKey = null,
    maxAttempts = DEFAULT_DIRECTOR_CONFIG.maxRetriesPerModel
  } = {}) {
    if (!title) throw new Error('Task must have a title.');

    const finalKey = idempotencyKey || TaskLedger.generateIdempotencyKey(title, input);

    // Idempotency Check: if identical active/completed task already exists, return it
    if (this.idempotencyIndex.has(finalKey)) {
      const existingId = this.idempotencyIndex.get(finalKey);
      const existing = this.tasks.get(existingId);
      if (existing) {
        return { task: existing, isDuplicate: true };
      }
    }

    const now = new Date().toISOString();
    const id = `task-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

    const task = {
      id,
      idempotencyKey: finalKey,
      title,
      role,
      owner,
      permissions,
      state: TASK_STATES.QUEUED,
      input: input ? JSON.parse(JSON.stringify(input)) : {},
      output: null,
      evidence: [],
      activeProvider: null,
      attempts: 0,
      maxAttempts,
      handoffCount: 0,
      lastHeartbeat: now,
      createdAt: now,
      updatedAt: now,
      claimedAt: null,
      completedAt: null,
      failedAt: null,
      history: [
        {
          timestamp: now,
          fromState: null,
          toState: TASK_STATES.QUEUED,
          actor: 'director',
          reason: 'Initial task creation into ledger',
          evidence: null
        }
      ]
    };

    this.tasks.set(id, task);
    this.idempotencyIndex.set(finalKey, id);
    this._persist();

    return { task, isDuplicate: false };
  }

  getTask(id) {
    return this.tasks.get(id) || null;
  }

  getTaskByIdempotencyKey(key) {
    const id = this.idempotencyIndex.get(key);
    return id ? this.tasks.get(id) || null : null;
  }

  /**
   * Claims a task for a specific worker with active lease.
   */
  claimTask(id, workerId) {
    const task = this.getTask(id);
    if (!task) throw new Error(`Task '${id}' not found.`);

    if (task.state !== TASK_STATES.QUEUED && task.state !== TASK_STATES.RETRYING && task.state !== TASK_STATES.HANDOFF) {
      throw new Error(`Cannot claim task '${id}' in state [${task.state}].`);
    }

    const now = new Date().toISOString();
    let updated = TaskStateMachine.transition(task, TASK_STATES.CLAIMED, {
      actor: workerId,
      reason: `Worker lease acquired by ${workerId}`
    });

    updated.owner = workerId;
    updated.lastHeartbeat = now;
    updated.attempts += 1;

    this.tasks.set(id, updated);
    this._persist();
    return updated;
  }

  /**
   * Updates worker heartbeat to prevent task being marked as abandoned.
   */
  heartbeat(id, workerId) {
    const task = this.getTask(id);
    if (!task) return false;

    task.lastHeartbeat = new Date().toISOString();
    if (workerId && task.owner !== workerId) {
      task.owner = workerId;
    }
    this.tasks.set(id, task);
    // Don't persist on every single tick to save I/O; periodic persistence is fine
    return true;
  }

  /**
   * Transitions task state with validation and audit logging.
   */
  transition(id, nextState, context = {}) {
    const task = this.getTask(id);
    if (!task) throw new Error(`Task '${id}' not found in ledger.`);

    const updated = TaskStateMachine.transition(task, nextState, context);
    if (context.output !== undefined) updated.output = context.output;
    if (context.evidence) updated.evidence.push(context.evidence);
    if (context.activeProvider) updated.activeProvider = context.activeProvider;

    this.tasks.set(id, updated);
    this._persist();
    return updated;
  }

  /**
   * Lists tasks with optional state/role filtering.
   */
  listTasks({ state = null, role = null, owner = null, limit = 50 } = {}) {
    let list = Array.from(this.tasks.values());

    if (state) list = list.filter(t => t.state === state);
    if (role) list = list.filter(t => t.role === role);
    if (owner) list = list.filter(t => t.owner === owner);

    return list
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, limit);
  }

  /**
   * Finds tasks that have stalled without heartbeat.
   */
  getStuckTasks(timeoutMs = this.heartbeatTimeoutMs) {
    const now = Date.now();
    const activeStates = [TASK_STATES.CLAIMED, TASK_STATES.RUNNING, TASK_STATES.VERIFYING];

    return Array.from(this.tasks.values()).filter(t => {
      if (!activeStates.includes(t.state)) return false;
      const last = new Date(t.lastHeartbeat || t.updatedAt).getTime();
      return now - last >= timeoutMs;
    });
  }

  flush() {
    this._persist();
  }
}
