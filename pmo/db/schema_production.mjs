export const schemaProduction = `
CREATE TABLE IF NOT EXISTS production_jobs (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, code TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PLANNED',
 workstation TEXT, supervisor TEXT, planned_start TEXT, planned_finish TEXT, actual_start TEXT, actual_finish TEXT,
 progress REAL NOT NULL DEFAULT 0, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS production_steps (
 id TEXT PRIMARY KEY, job_id TEXT NOT NULL, name TEXT NOT NULL, sequence INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'TODO',
 assignee TEXT, planned_minutes REAL NOT NULL DEFAULT 0, actual_minutes REAL NOT NULL DEFAULT 0, started_at TEXT, completed_at TEXT,
 checklist_json TEXT, notes TEXT, FOREIGN KEY(job_id) REFERENCES production_jobs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_production_project ON production_jobs(project_id, status);
`;
