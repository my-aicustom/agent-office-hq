export const schemaGovernance = `
CREATE TABLE IF NOT EXISTS risks (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT, probability REAL NOT NULL DEFAULT 0.5,
 impact REAL NOT NULL DEFAULT 0.5, severity TEXT NOT NULL DEFAULT 'MEDIUM', status TEXT NOT NULL DEFAULT 'OPEN', owner TEXT,
 mitigation TEXT, contingency TEXT, due_date TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS issues (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT, severity TEXT NOT NULL DEFAULT 'MEDIUM',
 status TEXT NOT NULL DEFAULT 'OPEN', owner TEXT, due_date TEXT, resolution TEXT, resolved_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS decisions (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL, context TEXT, options_json TEXT, decision TEXT, rationale TEXT,
 status TEXT NOT NULL DEFAULT 'OPEN', requested_from TEXT, decided_by TEXT, due_date TEXT, decided_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS approvals (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', amount REAL,
 subject TEXT, payload_json TEXT, requested_by TEXT, requested_from TEXT, decided_by TEXT, decision_note TEXT,
 created_at TEXT NOT NULL, decided_at TEXT, FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_approvals_pending ON approvals(status, created_at DESC);
`;
