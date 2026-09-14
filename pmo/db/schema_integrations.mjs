export const schemaIntegrations = `
CREATE TABLE IF NOT EXISTS evidence (
 id TEXT PRIMARY KEY, project_id TEXT, entity_type TEXT, entity_id TEXT, kind TEXT NOT NULL, uri TEXT, sha256 TEXT,
 metadata_json TEXT, created_by TEXT, created_at TEXT NOT NULL, FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS webhook_events (
 id TEXT PRIMARY KEY, provider TEXT NOT NULL, external_id TEXT, event_type TEXT, payload_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'RECEIVED',
 error TEXT, received_at TEXT NOT NULL, processed_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_dedupe ON webhook_events(provider, external_id) WHERE external_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS outbox (
 id TEXT PRIMARY KEY, project_id TEXT, channel TEXT NOT NULL, destination TEXT NOT NULL, template_key TEXT, payload_json TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING', attempt_count INTEGER NOT NULL DEFAULT 0, available_at TEXT NOT NULL, locked_at TEXT, sent_at TEXT,
 last_error TEXT, idempotency_key TEXT UNIQUE, created_at TEXT NOT NULL,
 FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox(status, available_at);
CREATE TABLE IF NOT EXISTS automation_runs (
 id TEXT PRIMARY KEY, project_id TEXT, adapter TEXT NOT NULL, action TEXT NOT NULL, status TEXT NOT NULL, input_json TEXT,
 output_json TEXT, started_at TEXT NOT NULL, finished_at TEXT, error TEXT, FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL
);
`;
