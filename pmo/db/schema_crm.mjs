export const schemaCrm = `
CREATE TABLE IF NOT EXISTS contacts (
 id TEXT PRIMARY KEY, project_id TEXT, name TEXT NOT NULL, phone TEXT, email TEXT, role TEXT, company TEXT, notes TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE TABLE IF NOT EXISTS messages (
 id TEXT PRIMARY KEY, project_id TEXT, direction TEXT NOT NULL, channel TEXT NOT NULL, phone TEXT, external_id TEXT,
 text TEXT, status TEXT NOT NULL, payload_json TEXT, occurred_at TEXT NOT NULL, created_at TEXT NOT NULL,
 FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_external_id ON messages(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project_id, occurred_at DESC);
CREATE TABLE IF NOT EXISTS inbox_items (
 id TEXT PRIMARY KEY, message_id TEXT UNIQUE, phone TEXT, contact_name TEXT, classification TEXT, confidence REAL,
 status TEXT NOT NULL DEFAULT 'NEW', assigned_to TEXT, project_id TEXT, summary TEXT, extracted_json TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE, FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_inbox_status ON inbox_items(status, created_at DESC);
`;
