export const schemaMeta = `
CREATE TABLE IF NOT EXISTS pmo_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT NOT NULL, entity_id TEXT, action TEXT NOT NULL,
 actor_type TEXT NOT NULL, actor_id TEXT, before_json TEXT, after_json TEXT, metadata_json TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity_type, entity_id, id DESC);
CREATE TABLE IF NOT EXISTS activity_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT, event_type TEXT NOT NULL, title TEXT NOT NULL, body TEXT,
 actor TEXT, payload_json TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_project ON activity_events(project_id, id DESC);
`;
