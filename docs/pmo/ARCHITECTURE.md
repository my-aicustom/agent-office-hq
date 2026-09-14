# Contractor PMO Architecture

The PMO is a business-domain layer above Iron Director. PostgreSQL can replace the embedded SQLite database later without changing domain semantics.

`WhatsApp / UI / n8n -> PMO HTTP -> domain services -> canonical PMO DB -> outbox/integrations`

Iron Director remains the autonomous execution kernel. The PMO owns project truth, commercial state, approval state, delivery status, finance, risks, and evidence. n8n and WhatsApp are adapters, never the source of truth.

## Bounded domains
Projects & planning; survey; estimating & quotation; procurement; workshop production; QC; installation & handover; finance; governance; communications; evidence & automation.
