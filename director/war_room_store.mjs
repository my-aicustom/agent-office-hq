// Iron Director — War Room Session Store
// Persists round-table council deliberations and resolution logs.

import fs from 'fs';
import path from 'path';

const DEFAULT_STORE_PATH = path.resolve('data/director/war_room_sessions.json');

export class WarRoomStore {
  constructor({ filePath = DEFAULT_STORE_PATH } = {}) {
    this.filePath = filePath;
    this.sessions = new Map();
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.sessions)) {
          for (const s of data.sessions) {
            this.sessions.set(s.id, s);
          }
        }
      }
    } catch (err) {
      console.warn(`[WarRoomStore] Warning loading sessions from ${this.filePath}: ${err.message}`);
    }
  }

  _persist() {
    try {
      const dir = path.dirname(this.filePath);
      fs.mkdirSync(dir, { recursive: true });
      const payload = {
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        sessions: Array.from(this.sessions.values())
      };
      const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf8');
      fs.renameSync(tempPath, this.filePath);
    } catch (err) {
      console.error(`[WarRoomStore] Failed to persist sessions: ${err.message}`);
    }
  }

  saveSession(session) {
    if (!session || !session.id) return;
    this.sessions.set(session.id, session);
    this._persist();
  }

  getSession(id) {
    return this.sessions.get(id) || null;
  }

  listSessions({ limit = 50, state = null } = {}) {
    let list = Array.from(this.sessions.values());
    if (state) list = list.filter(s => s.state === state);
    return list
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }
}
