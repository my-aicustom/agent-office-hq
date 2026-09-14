export const schemaProjects = `
CREATE TABLE IF NOT EXISTS projects (
 id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, title TEXT NOT NULL, stage TEXT NOT NULL,
 client_name TEXT, client_phone TEXT, client_email TEXT, site_address TEXT, source TEXT, scope TEXT,
 material_spec TEXT, finish_spec TEXT, estimated_value REAL NOT NULL DEFAULT 0, quoted_value REAL NOT NULL DEFAULT 0,
 contract_value REAL NOT NULL DEFAULT 0, deposit_required REAL NOT NULL DEFAULT 0, deposit_paid REAL NOT NULL DEFAULT 0,
 owner TEXT, priority TEXT NOT NULL DEFAULT 'NORMAL', start_date TEXT, due_date TEXT, won_at TEXT, closed_at TEXT,
 metadata_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_stage ON projects(stage, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_client_phone ON projects(client_phone);
CREATE INDEX IF NOT EXISTS idx_projects_due_date ON projects(due_date);
`;
