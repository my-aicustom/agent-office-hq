# Production Runbook

1. Apply the patch and run `npm run test:pmo` plus the repository's normal test suite.
2. Set PMO and WA/n8n environment variables.
3. Start the app and verify `/healthz` and `/api/pmo/integrations/health`.
4. Seed only in a development environment.
5. Send a signed WA test message and confirm it appears in Inbox.
6. Promote it to a project, schedule survey, build RAB/quote, record DP, create procurement/workshop/QC/installation records.
7. Confirm hard gates reject skipped DP/QC/handover states.
8. Back up `data/pmo/pmo.db` before production upgrades while SQLite is canonical.
