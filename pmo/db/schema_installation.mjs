export const schemaInstallation = `
CREATE TABLE IF NOT EXISTS installations (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, scheduled_start TEXT, scheduled_end TEXT, status TEXT NOT NULL DEFAULT 'PLANNED',
 crew_lead TEXT, crew_json TEXT, vehicle TEXT, site_contact TEXT, site_phone TEXT, access_notes TEXT, completion_notes TEXT,
 started_at TEXT, completed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS handovers (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, installation_id TEXT, status TEXT NOT NULL DEFAULT 'PENDING', handed_over_at TEXT,
 customer_name TEXT, acceptance_note TEXT, punch_list_json TEXT, signature_ref TEXT, warranty_until TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
 FOREIGN KEY(installation_id) REFERENCES installations(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS warranty_cases (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, handover_id TEXT, title TEXT NOT NULL, description TEXT, status TEXT NOT NULL DEFAULT 'OPEN',
 priority TEXT NOT NULL DEFAULT 'NORMAL', reported_at TEXT NOT NULL, resolved_at TEXT, resolution TEXT,
 FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE, FOREIGN KEY(handover_id) REFERENCES handovers(id) ON DELETE SET NULL
);
`;
