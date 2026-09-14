export const schemaQuality = `
CREATE TABLE IF NOT EXISTS qc_inspections (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, production_job_id TEXT, type TEXT NOT NULL DEFAULT 'FINAL', status TEXT NOT NULL DEFAULT 'PENDING',
 inspector TEXT, inspected_at TEXT, score REAL, notes TEXT, photos_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
 FOREIGN KEY(production_job_id) REFERENCES production_jobs(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS qc_items (
 id TEXT PRIMARY KEY, inspection_id TEXT NOT NULL, item_key TEXT NOT NULL, label TEXT NOT NULL, required INTEGER NOT NULL DEFAULT 1,
 status TEXT NOT NULL DEFAULT 'PENDING', note TEXT, evidence_json TEXT, FOREIGN KEY(inspection_id) REFERENCES qc_inspections(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_qc_project ON qc_inspections(project_id, status);
`;
