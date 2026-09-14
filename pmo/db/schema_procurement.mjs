export const schemaProcurement = `
CREATE TABLE IF NOT EXISTS suppliers (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT, email TEXT, address TEXT, category TEXT, rating REAL NOT NULL DEFAULT 0,
 active INTEGER NOT NULL DEFAULT 1, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS materials (
 id TEXT PRIMARY KEY, sku TEXT UNIQUE, name TEXT NOT NULL, category TEXT, unit TEXT NOT NULL DEFAULT 'pcs', default_supplier_id TEXT,
 standard_cost REAL NOT NULL DEFAULT 0, min_stock REAL NOT NULL DEFAULT 0, current_stock REAL NOT NULL DEFAULT 0, metadata_json TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(default_supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS purchase_requests (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, code TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'DRAFT', requested_by TEXT,
 needed_by TEXT, note TEXT, total_estimate REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS purchase_request_items (
 id TEXT PRIMARY KEY, request_id TEXT NOT NULL, material_id TEXT, description TEXT NOT NULL, qty REAL NOT NULL DEFAULT 1,
 unit TEXT NOT NULL DEFAULT 'pcs', target_unit_cost REAL NOT NULL DEFAULT 0, actual_unit_cost REAL NOT NULL DEFAULT 0,
 supplier_id TEXT, status TEXT NOT NULL DEFAULT 'PENDING', FOREIGN KEY(request_id) REFERENCES purchase_requests(id) ON DELETE CASCADE,
 FOREIGN KEY(material_id) REFERENCES materials(id) ON DELETE SET NULL, FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS purchase_orders (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, request_id TEXT, supplier_id TEXT, po_no TEXT UNIQUE NOT NULL,
 status TEXT NOT NULL DEFAULT 'DRAFT', subtotal REAL NOT NULL DEFAULT 0, tax REAL NOT NULL DEFAULT 0, shipping REAL NOT NULL DEFAULT 0,
 grand_total REAL NOT NULL DEFAULT 0, ordered_at TEXT, expected_at TEXT, received_at TEXT, note TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE, FOREIGN KEY(request_id) REFERENCES purchase_requests(id) ON DELETE SET NULL,
 FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
);
`;
