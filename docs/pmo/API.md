# PMO API Surface

All `/api/pmo/*` routes reuse the existing HQ bearer session.

Key routes: `/api/pmo/dashboard`, `/api/pmo/projects`, `/api/pmo/projects/:id/transition`, project milestones/tasks/surveys/estimates/quotes/payments/costs/purchase-requests/production-jobs/qc/installations/handovers/risks/issues/decisions/approvals/evidence, `/api/pmo/inbox`, `/api/pmo/search`, `/api/pmo/projects/:id/report`, `/api/pmo/integrations/health`.

Mutations return JSON and fail closed with explicit status codes. Public WA ingress is the only unauthenticated PMO route and requires its own webhook secret.
