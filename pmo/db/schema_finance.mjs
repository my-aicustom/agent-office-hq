export const schemaFinance = `
CREATE TABLE IF NOT EXISTS payments (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL, amount REAL NOT NULL DEFAULT 0,
 due_date TEXT, paid_at TEXT, method TEXT, reference TEXT, note TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_payments_project ON payments(project_id, status, due_date);
CREATE TABLE IF NOT EXISTS budgets (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, category TEXT NOT NULL, planned REAL NOT NULL DEFAULT 0, committed REAL NOT NULL DEFAULT 0,
 actual REAL NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, UNIQUE(project_id, category),
 FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS cost_entries (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, category TEXT NOT NULL, amount REAL NOT NULL, vendor TEXT, reference TEXT,
 incurred_at TEXT NOT NULL, note TEXT, metadata_json TEXT, created_at TEXT NOT NULL,
 FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_cost_project ON cost_entries(project_id, incurred_at DESC);
`;
