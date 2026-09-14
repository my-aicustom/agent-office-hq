export const schemaCommercial = `
CREATE TABLE IF NOT EXISTS estimates (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'DRAFT',
 material_cost REAL NOT NULL DEFAULT 0, labor_cost REAL NOT NULL DEFAULT 0, machine_cost REAL NOT NULL DEFAULT 0,
 transport_cost REAL NOT NULL DEFAULT 0, overhead_cost REAL NOT NULL DEFAULT 0, contingency REAL NOT NULL DEFAULT 0,
 markup_percent REAL NOT NULL DEFAULT 0, tax_percent REAL NOT NULL DEFAULT 0, total_cost REAL NOT NULL DEFAULT 0,
 sell_price REAL NOT NULL DEFAULT 0, margin_amount REAL NOT NULL DEFAULT 0, margin_percent REAL NOT NULL DEFAULT 0,
 notes TEXT, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS estimate_items (
 id TEXT PRIMARY KEY, estimate_id TEXT NOT NULL, category TEXT NOT NULL, description TEXT NOT NULL, qty REAL NOT NULL DEFAULT 1,
 unit TEXT NOT NULL DEFAULT 'pcs', unit_cost REAL NOT NULL DEFAULT 0, waste_percent REAL NOT NULL DEFAULT 0,
 total_cost REAL NOT NULL DEFAULT 0, supplier TEXT, metadata_json TEXT,
 FOREIGN KEY(estimate_id) REFERENCES estimates(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS quotes (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, estimate_id TEXT, quote_no TEXT UNIQUE NOT NULL, version INTEGER NOT NULL DEFAULT 1,
 status TEXT NOT NULL DEFAULT 'DRAFT', subtotal REAL NOT NULL DEFAULT 0, discount REAL NOT NULL DEFAULT 0, tax REAL NOT NULL DEFAULT 0,
 grand_total REAL NOT NULL DEFAULT 0, valid_until TEXT, terms TEXT, customer_note TEXT, sent_at TEXT, approved_at TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE, FOREIGN KEY(estimate_id) REFERENCES estimates(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS quote_items (
 id TEXT PRIMARY KEY, quote_id TEXT NOT NULL, description TEXT NOT NULL, qty REAL NOT NULL DEFAULT 1, unit TEXT NOT NULL DEFAULT 'pcs',
 unit_price REAL NOT NULL DEFAULT 0, total REAL NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0,
 FOREIGN KEY(quote_id) REFERENCES quotes(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS change_orders (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, code TEXT NOT NULL, title TEXT NOT NULL, description TEXT, status TEXT NOT NULL DEFAULT 'DRAFT',
 amount_delta REAL NOT NULL DEFAULT 0, days_delta INTEGER NOT NULL DEFAULT 0, requested_by TEXT, approved_by TEXT, approved_at TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);
`;
