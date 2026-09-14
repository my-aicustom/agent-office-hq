# Canonical Data Model

Project is the aggregate root. Related records include contacts/messages, milestones/tasks/dependencies, site surveys, estimates/items, quotes/items, change orders, payments/budgets/costs, suppliers/materials/purchase requests/orders, production jobs/steps, QC inspections/items, installations/handovers/warranty, risks/issues/decisions/approvals, evidence, webhook events, outbox and automation runs.

Every operational mutation should be attributable and recoverable. Activity is optimized for humans; audit events are optimized for accountability.
