# Phase 8: Paddle Retirement - Context

**Gathered:** 2026-07-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Retire legacy Paddle safely after a verified subscription-expiration gate. The phase must first prove no remaining Paddle-backed subscription can be revoked, extended, or misclassified by removal. If the gate is clear, remove Paddle-specific application behavior, deployed webhook surface, Paddle-only database structures, live env/config instructions, stale generated types, obsolete tests, and user/admin-facing copy. If the gate is not clear, do not perform destructive removal; complete safe preparatory work and document the exact blocker.

This phase is not a billing redesign. Stripe remains the live billing path, provider-neutral subscription access state remains intact, and Stripe subscription, access, and Merit behavior must not regress.

</domain>

<decisions>
## Implementation Decisions

### Expiration Gate Evidence
- **D-01:** Destructive Paddle removal requires both a fresh prod app-state read and authoritative Paddle dashboard/export evidence. App records alone or Paddle evidence alone is not sufficient.
- **D-02:** The prod read must be re-run at execution time. Prior planning evidence that reported 0 in-flight Paddle subscriptions is useful context, but it is stale for destructive work.
- **D-03:** If prod app records and Paddle evidence disagree, stop and document the discrepancy as a blocker. Do not choose one source and remove anyway.
- **D-04:** Planning artifacts may preserve counts, redacted identifiers, query/export provenance, timestamps, and operator-provided evidence summaries. Do not commit raw exports, secrets, raw webhook payloads, or customer PII.

### Removal vs Safe-Prep Boundary
- **D-05:** If the gate is clear, perform full Paddle retirement in this phase rather than leaving inert compatibility stubs.
- **D-06:** Remove the legacy `paddle-webhook` deployed function/config surface entirely when the gate is clear. Do not keep a public 410 shim for Paddle.
- **D-07:** Drop Paddle-only DB structures with reversible migration and rollback SQL: `profiles.paddle_customer_id`, `profiles.paddle_subscription_id`, `profiles.paddle_price_id`, and `paddle_webhook_events`.
- **D-08:** Regenerate and include Supabase generated types after schema changes so stale `paddle_*` fields and `paddle_webhook_events` do not remain in the typed app surface.
- **D-09:** If the gate is not clear, prepare but do not apply destructive cleanup: draft migration and rollback, update safe user-facing copy where possible, keep the webhook fail-closed, and document the exact blocker.

### Billing History Preservation
- **D-10:** Preserve provider-neutral billing/access facts only. `subscription_tier`, `subscription_status`, and `current_period_end` remain on `profiles`; raw Paddle identifiers and webhook payloads do not remain in live app DB after retirement.
- **D-11:** Do not preserve `paddle_webhook_events.payload` in repo or live DB. If legal/accounting support requires raw historical Paddle material, the operator may retain an external archive outside the repo.
- **D-12:** The migration/verification plan must prove user access classification is unchanged before and after dropping Paddle fields. Check all tiers, not paid users only.

### User-Facing Copy Cleanup
- **D-13:** Update all user/admin-facing Paddle copy in scope: refund/legal page text, notification/admin email templates, profile/billing language, live env docs, and operational docs.
- **D-14:** Replace Paddle refund language with Strivo support plus current payment-processor-neutral wording. Do not overclaim Stripe-specific refund handling unless separately verified by legal/operator.
- **D-15:** Remove obsolete Paddle webhook tests with the function. Add replacement negative guards that assert no live Paddle endpoint/config/reference remains.
- **D-16:** Documentation may keep Paddle in historical/audit context only. Live env/config instructions such as setting `PADDLE_WEBHOOK_SECRET` should be removed once retired.
- **D-17:** Remove Paddle defaults everywhere, including legacy/admin-only templates such as `payment_method || "Paddle"`.

### Verification & Rollback Standard
- **D-18:** Phase completion requires a full preview-to-prod operator ceremony: apply/verify in preview, operator applies prod, then this agent performs prod read-only verification.
- **D-19:** Rollback artifacts must include rollback SQL, redeploy instructions for restored function/config if needed, and notes for reversing generated Supabase type updates.
- **D-20:** Billing smoke checks are mandatory after cleanup: Stripe subscription paths, customer portal/current access behavior, tier access, and Merit behavior must remain correct.
- **D-21:** Add a negative-reference sweep that fails on live Paddle references, with allowlisted historical/audit/archive paths only.
- **D-22:** Update `verify:baseline` or edge test allowlists: remove obsolete `paddle-webhook` tests and add negative guards for no live Paddle endpoint/config/reference.

### Agent Discretion
- Exact SQL shape, migration sequencing, redaction format, negative-sweep implementation, and smoke-test mechanics are left to planning, as long as D-01 through D-22 hold.
- If `gsd-sdk` remains unavailable, planners should use filesystem artifacts as the source of truth and resume SDK-managed state/commit once the local shim is repaired.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and locked requirements
- `.planning/ROADMAP.md` - Phase 8 goal, success criteria, and plan sketch `08-01` through `08-03`.
- `.planning/REQUIREMENTS.md` - PADL-01 through PADL-04, including the hard gate before destructive removal.
- `.planning/STATE.md` - Current focus, canonical prod/preview refs, operator-gated DB stance, and Phase 8 Paddle gate notes.
- `.planning/PROJECT.md` - Milestone-level Paddle retirement decision and production DB gate principles.

### Environment and operator evidence
- `docs/ENVIRONMENT.md` - Current env matrix; documents `PADDLE_WEBHOOK_SECRET` as retired/unset and Stripe as the live billing surface.
- `.planning/audit/ENV-SEPARATION.md` - Prior env remediation and Paddle secret un-set evidence; re-read before planning gate evidence.
- `.planning/audit/RESIDUAL-REGISTER.md` - Residual Paddle-related items and carried cleanup notes.

### Paddle surfaces to remove if gate is clear
- `supabase/config.toml` - Deployed function registration includes `[functions.paddle-webhook]`.
- `supabase/functions/paddle-webhook/index.ts` - Legacy Paddle webhook handler, currently hardened and fail-closed when secret is unset.
- `supabase/functions/paddle-webhook/replay-window.test.ts` - Obsolete test once the function is removed; replace with negative guards.
- `supabase/migrations/20260122225033_1d494822-3e8b-4d51-bd74-993a4795241a.sql` - Introduces Paddle profile columns and `paddle_webhook_events`.
- `src/integrations/supabase/types.ts` - Generated DB types currently include Paddle fields/table; regenerate after migration.

### User/admin-facing copy
- `src/pages/Profile.tsx` - Reads Paddle profile fields into local state even though billing UI now routes to pricing.
- `src/pages/Refund.tsx` - Public refund policy still names Paddle as merchant/payment processor.
- `supabase/functions/send-notification-email/index.ts` - Admin upgrade email defaults payment method to Paddle and says payment was processed via Paddle.
- `supabase/functions/notify-upgrade-request/index.ts` - Contains Paddle payment copy in upgrade/admin messaging.
- `supabase/functions/notify-admin-activity/index.ts` - Contains payment method default copy that can surface Paddle.
- `.env.example` - Live skeleton currently documents retired Paddle secret instructions; update after retirement.

### Stripe and billing invariants
- `supabase/functions/stripe-webhook-handler/index.ts` - Live Stripe webhook handler; must remain unaffected.
- `supabase/functions/stripe-webhook/index.ts` - Existing Stripe 410 shim precedent; do not copy for Paddle unless the removal decision changes.
- `supabase/functions/create-checkout-session/index.ts` - Subscription checkout path to smoke.
- `supabase/functions/create-stripe-portal/index.ts` - Customer portal path to smoke.
- `supabase/functions/create-payment-intent/index.ts` - Merit/shop payment path if Merit shop is enabled in the target environment.
- `supabase/functions/_shared/price-resolver.ts` - Stripe price env resolution and tier catalog.
- `supabase/functions/_shared/merit-gateway.ts` - Merit deduction/refund behavior that must not regress.
- `supabase/functions/deno.json` - Edge test allowlist currently includes `paddle-webhook/replay-window.test.ts`; update gate.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `supabase/functions/stripe-webhook/index.ts` shows the existing 410-shim pattern, but the selected decision for Paddle is full removal, not shim retention.
- `docs/ENVIRONMENT.md` is the canonical live env matrix and should be updated together with `.env.example`.
- `supabase/functions/deno.json` is the central edge test gate for removing obsolete Paddle tests and adding negative guards.

### Established Patterns
- Production DB work is operator-gated: preview first, operator applies prod, this agent verifies prod read-only.
- Billing/security changes require rollback SQL and explicit verification evidence.
- Live env docs record names and consumers only, never secret values or raw identifiers.
- Historical/audit docs may keep Paddle references; live code/config/user docs should not.

### Integration Points
- Deployed function config: remove `[functions.paddle-webhook]` from `supabase/config.toml` when the gate is clear.
- DB schema: remove Paddle-only profile columns and `paddle_webhook_events`, then regenerate `src/integrations/supabase/types.ts`.
- Public/admin copy: update `src/pages/Refund.tsx` and email functions so no user/admin path presents Paddle as current processor.
- Verification: add a negative-reference sweep with allowlisted historical/audit/archive paths and billing smoke checks around Stripe/access/Merits.

</code_context>

<specifics>
## Specific Ideas

- Evidence artifacts should show counts plus redacted identifiers and provenance, not raw billing exports.
- Access preservation should be proven by comparing provider-neutral tier/status/period classification before and after preview migration.
- Negative Paddle sweeps should allow archived migrations and audit history, but fail on live app code, live env docs, active Supabase config, generated types, and current tests.

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope.

</deferred>

---

*Phase: 8-Paddle Retirement*
*Context gathered: 2026-07-09*
