# PMO Security and Autonomy

The PMO reuses HQ authentication for private APIs. WA ingress has an independent secret and dedupe ledger. AI autonomy defaults to SUPERVISED. High/critical-risk mutations and spend above `PMO_MAX_AUTO_SPEND` require human control.

Secrets are environment-only. Outbound actions are queued and retryable. Approval records are explicit. Evidence can carry SHA-256 hashes. Iron Director should receive project context but must not silently overwrite canonical business state.
