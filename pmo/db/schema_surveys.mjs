export const schemaSurveys = `
CREATE TABLE IF NOT EXISTS surveys (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, scheduled_at TEXT, completed_at TEXT, surveyor TEXT, address TEXT,
 access_notes TEXT, measurement_notes TEXT, electrical_notes TEXT, wall_floor_notes TEXT, logistics_notes TEXT,
 measurements_json TEXT, photos_json TEXT, status TEXT NOT NULL DEFAULT 'SCHEDULED', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_surveys_project ON surveys(project_id, scheduled_at DESC);
`;
