# Migration Strategy

This patch intentionally uses Node 22 native SQLite to avoid adding runtime dependencies. It is suitable for the current single-HQ deployment. When multi-user concurrency or horizontal scaling becomes necessary, preserve service interfaces and migrate persistence to PostgreSQL.

n8n workflow state must not become the database. WA Gateway sessions must not become customer/project state. Existing Iron Director task ledger remains separate from PMO business truth and references PMO project/task ids when executing autonomous work.
