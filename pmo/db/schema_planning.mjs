export const schemaPlanning = `
CREATE TABLE IF NOT EXISTS milestones (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'OPEN', due_date TEXT,
 weight REAL NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS tasks (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, milestone_id TEXT, parent_task_id TEXT, title TEXT NOT NULL, description TEXT,
 status TEXT NOT NULL DEFAULT 'TODO', priority TEXT NOT NULL DEFAULT 'NORMAL', owner_type TEXT, owner_id TEXT, due_date TEXT,
 estimated_hours REAL NOT NULL DEFAULT 0, actual_hours REAL NOT NULL DEFAULT 0, progress REAL NOT NULL DEFAULT 0,
 autonomy_level TEXT, metadata_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
 FOREIGN KEY(milestone_id) REFERENCES milestones(id) ON DELETE SET NULL,
 FOREIGN KEY(parent_task_id) REFERENCES tasks(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id, status, due_date);
CREATE TABLE IF NOT EXISTS task_dependencies (
 task_id TEXT NOT NULL, depends_on_task_id TEXT NOT NULL, dependency_type TEXT NOT NULL DEFAULT 'FINISH_TO_START',
 created_at TEXT NOT NULL, PRIMARY KEY(task_id, depends_on_task_id),
 FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
 FOREIGN KEY(depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
`;
