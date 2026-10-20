# DEPRECATED — `stripe-webhook` is now a 410-Gone shim

The active Stripe webhook handler is `supabase/functions/stripe-webhook-handler/`.

The Stripe production dashboard endpoint URL **MUST** end in
`/functions/v1/stripe-webhook-handler` (NOT `/functions/v1/stripe-webhook`).

This function continues to deploy because Stripe traffic mis-pinned at the
legacy URL must fail loudly (HTTP 410 + structured `legacy_endpoint_hit` warn
log) instead of silently 200-ignoring. See Phase 27 SC-1.

Full background, operator runbook touchpoints, and the planted-seed for
eventual full removal of this directory live in
`.planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md`.
