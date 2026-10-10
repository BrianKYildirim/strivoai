# Phase 21 Cutover Notes -- Operator Safety Net

> Closes audit concerns #1, #2, and the "Operational rollback caveat (Concern G)"
> entry from `.planning/v2.0-MILESTONE-AUDIT.md`. Authored as part of Phase 27.
>
> Cross-references:
> - Canonical evidence: `.planning/phases/21-integration-validation-and-cutover/21-CUTOVER-LOG.md`
> - Audit findings: `.planning/v2.0-MILESTONE-AUDIT.md` Section "Top cross-phase concerns" (#1, #2) and "Operational rollback caveat (Concern G)"
> - Operator runbook: `scripts/phase21-runbook.ps1` (Stages D1-Preflip, D2-Flip, D4-Finalize)
> - 410-Gone shim source: `supabase/functions/stripe-webhook/index.ts`
> - Active handler source: `supabase/functions/stripe-webhook-handler/index.ts`

## 1. Legacy Webhook Risk

The Stripe production dashboard's webhook endpoint URL is the single config that
decides whether merit grants and tier syncs land. Two `stripe-webhook` deployments
coexist in `supabase/functions/`: the active handler at `stripe-webhook-handler/`
and the legacy directory at `stripe-webhook/`. Phase 27 SC-1 replaces the legacy
`index.ts` with a 410-Gone shim that emits a `legacy_endpoint_hit` warn log per
misrouted request. If `legacy_endpoint_hit` fires post-cutover: (a) check the
Stripe dashboard immediately and update the URL to end in
`/functions/v1/stripe-webhook-handler`; (b) every misroute the dashboard delivered
while the URL was wrong returned HTTP 410 -- Stripe will retry per its own
delivery policy, so the merit grants land once the URL is corrected; (c) capture
the timestamps of the warn lines in the next phase retrospective. The shim is
intentionally noisy so a single misroute is impossible to miss.

## 2. Interview Prep Rollback Caveat

Phase 23 rebuilt `interview-prep-analyze` as merit-only by design. The function
contains a defensive guard at `supabase/functions/interview-prep-analyze/index.ts`
lines 295-312: when `MERIT_SYSTEM_ENABLED` is false (or unset), the handler
returns HTTP 503 with body `{ error: 'merit_system_required', message: ... }`.
Calling `Invoke-MeritFlagRollback` therefore intentionally bricks
`interview-prep-analyze` until a hotfix lands. The Gate D2 ack
(`ACK INTERVIEW PREP ROLLBACK BRICKS 503`) acknowledges this trade-off BEFORE
the operator types `FLIP PROD`, so the rollback path's behavior is not a
surprise during an emergency. If a rollback IS triggered post-flip, the
operator should immediately raise a Phase 21.1 gap-closure plan to either
short-term re-enable merit on `interview-prep-analyze` or restore a
legacy-credit fallback. The ack is logged to `21-CUTOVER-LOG.md` so the
post-incident review has a typed audit trail.

## 3. Stripe URL Pin

The production Stripe dashboard webhook endpoint URL MUST end in
`/functions/v1/stripe-webhook-handler` -- not `/functions/v1/stripe-webhook`.
Gate D1 enforces this with a typed `STRIPE URL VERIFIED` ack at the top of
`Stage-D1-Preflip` (immediately after `Ensure-Cutover-Log` creates the
evidence file, before any read-only state inspection runs against
production). If the URL is wrong: DO NOT FLIP. Update the Stripe dashboard
endpoint, wait 30 seconds for the dashboard to settle, then restart Gate D1
from the top. The 410 shim makes the wrong-URL condition observable both at
the Stripe delivery dashboard (HTTP 410 in the response code column) and in
Supabase logs (`legacy_endpoint_hit` warn). Treat any post-flip 410 as a
sev-2 alarm even if no merit-transaction has yet landed.

## 4. Phase 25 Dependency

The legacy `interview-prep-coach` Supabase function is stale and should be
deleted from BOTH staging (project ref `cimjltzovkahkqecpwgi`) and production
(project ref `zjpjapgraoxdukdvpjes`) once Phase 23's `interview-prep-analyze`
overhaul is live. Roadmap Section "Phase 25" SC-9 owns the deletion. Phase 27
SC-4 adds a runbook reminder at Gate D4-Finalize (HOLD outcome only --
rollback paths skip the reminder per design) so whichever phase ships first
deploys the operator forcing-function. The Gate D4 ack
(`ACK INTERVIEW PREP COACH DELETE`) accepts overlap with Phase 25 SC-9: the
operator may type the ack having already run the delete, OR confirm Phase 25
will run it. CRITICAL: do NOT delete `interview-prep-analyze` (the active
handler) -- only `interview-prep-coach`. Confusing the two would break the
live tier-aware Interview Prep flow that Phase 23 just shipped.
