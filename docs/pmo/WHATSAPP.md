# WhatsApp Gateway Integration

Inbound endpoint: `POST /webhooks/pmo/whatsapp` with `X-WA-Webhook-Secret`.

The adapter accepts common fields (`id/messageId`, `from/phone/sender/remoteJid`, `text/body`). Incoming messages are deduplicated by external id, linked to an existing project by normalized phone when possible, otherwise placed in the PMO inbox for triage.

Outbound messages go through the durable `outbox` table. A project can queue plain text or a named customer template. The worker retries failures and never treats the WA gateway as canonical state.
