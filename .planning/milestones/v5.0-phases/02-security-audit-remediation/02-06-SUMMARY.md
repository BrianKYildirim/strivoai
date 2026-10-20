---
phase: 02-security-audit-remediation
plan: 06
subsystem: payments
tags: [paddle, webhook, hmac, replay-window, deno, security, timingSafeEqual]

# Dependency graph
requires:
  - phase: 02-03
    provides: "Fix 3 disposition — paddle-webhook confirmed MEDIUM (no replay-window + 500 config-leak), routed to 02-06; Stripe idempotency preserve baseline"
  - phase: 02-05
    provides: "Money-path remediation pattern (RED->GREEN guard + operator money-path gate) + suite baseline (801/0/11)"
provides:
  - "paddle-webhook timestamp replay-window bound (MAX_WEBHOOK_AGE_SECONDS=300) on top of preserved event_id dedup"
  - "Non-leaky missing-secret (webhook_not_configured) + invalid-signature response bodies; reason code to log only"
  - "Runtime replay-window guard (pure HMAC+timestamp, isolation-safe) folded into verify:baseline (SEC-14)"
  - "Phase-8 gate input: 0 in-flight Paddle subscriptions on prod (clean-removal signal)"
affects: ["08-paddle-retirement", "02-08-final-security-record"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "auth.ts discipline extended to webhook errors: generic body to caller, reason code to structured log only (no env-name / config disclosure)"
    - "Authenticated-timestamp replay-window: |now - ts| bound on the HMAC-signed ts, layered on top of event_id idempotency dedup"
    - "Isolation-safe runtime guard: pure HMAC+timestamp asserts + static-source negative asserts (no DB-touching handler import)"

key-files:
  created:
    - "supabase/functions/paddle-webhook/replay-window.test.ts"
  modified:
    - "supabase/functions/paddle-webhook/index.ts"
    - "supabase/functions/deno.json"

key-decisions:
  - "Harden-in-place (not remove): Paddle removal stays deferred to Phase 8's verified expiration gate; this plan closes only the replay + config-leak branches byte-preservingly."
  - "Operator-confirmed 0 in-flight Paddle subs on prod + secret unset -> endpoint inert today; hardening is defensive for a possible secret restore while subs expire."
  - "ts freshness sourced from the authenticated signature ts (part of the HMAC-signed ${ts}:${payload}), so a stale-but-signed event is a genuine replay; NaN/stale -> 401 generic."

patterns-established:
  - "Webhook error hygiene: never name the env var / config state in the response body; move detail to console.error reason code."
  - "Replay-window + idempotency-dedup are complementary: the bound blocks stale-signed replays whose event_id was never recorded; the dedup blocks captured identical events."

requirements-completed: [SEC-13, SEC-14]

# Metrics
duration: 12min
completed: 2026-07-01
---

# Phase 2 Plan 06: Paddle Webhook Replay-Window + Non-Leaky Error Hardening Summary

**Paddle webhook hardened in place (Fix 3): a 300s authenticated-timestamp replay-window on top of the preserved event_id dedup, plus non-leaky missing-secret / invalid-signature bodies — proven RED->GREEN by an isolation-safe runtime guard folded into verify:baseline, with Paddle left intact for Phase 8's expiration gate.**

## Performance

- **Duration:** ~12 min (code + guard); operator gate approved same day
- **Started:** 2026-07-01 (Wave 4)
- **Completed:** 2026-07-01
- **Tasks:** 2 (1 auto code+guard, 1 operator checkpoint)
- **Files modified:** 3

## Accomplishments

- **Replay-window (T-02-03 closed):** added `MAX_WEBHOOK_AGE_SECONDS = 300` and a `Math.abs(nowSeconds - tsSeconds) > bound` check (plus `!Number.isFinite(tsSeconds)` NaN guard) after a successful signature verify. The `ts` is sourced from the authenticated signature (`ts=` component of the HMAC-signed `${ts}:${payload}`), so a stale-but-correctly-signed event is rejected as a replay with a generic `401`. Layers on top of the unchanged `event_id` dedup.
- **Non-leaky errors (T-02-06 closed):** the missing-secret `500` body no longer names `PADDLE_WEBHOOK_SECRET` — replaced with generic `{ error: "webhook_not_configured" }`; the invalid-signature `401` body dropped its `"Webhook signature verification failed"` detail. Both reason codes moved to `console.error("[paddle-webhook] ...")` (auth.ts discipline: reason code to log, generic body to caller).
- **Byte-preservation held:** HMAC-over-`${ts}:${payload}`, `timingSafeEqual`, the `event_id` dedup, and the `type:'webhook'` CORS-less (`{}`) contract are byte-identical. Paddle is NOT removed — Phase 8 owns the removal behind its verified expiration gate.
- **Guard in verify:baseline (SEC-14):** `paddle-webhook/replay-window.test.ts` (7 Deno.test cases — pure HMAC+timestamp + static-source negative asserts, no DB-touching handler import) proves stale-ts rejected / fresh-ts accepted / boundary (at-bound accepted, +1s rejected) / missing-secret non-leaky / invalid-signature detail-free / KEEP-mechanics preserved. Appended to `deno.json` `test:ci`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Replay-window + non-leaky error responses (+ runtime guard)** - `44c7579d` (fix)
2. **Task 2: Operator confirms in-flight Paddle subs + approves harden-in-place** - checkpoint (no code; operator sign-off 2026-07-01)

**Plan metadata:** docs commit (this SUMMARY + STATE + ROADMAP)

## Files Created/Modified

- `supabase/functions/paddle-webhook/index.ts` - Added `MAX_WEBHOOK_AGE_SECONDS=300` replay-window (stale/NaN ts -> generic 401); made missing-secret (`webhook_not_configured`) + invalid-signature bodies generic with reason code to log only; HMAC / timingSafeEqual / event_id dedup / CORS-less contract byte-identical.
- `supabase/functions/paddle-webhook/replay-window.test.ts` - Runtime guard (7 cases): stale-rejected / fresh-accepted / boundary / missing-secret-non-leaky / invalid-signature-detail-free / KEEP-mechanics. Isolation-safe (pure HMAC+timestamp; static-source negative asserts modeled on `cors-audit.test.ts`).
- `supabase/functions/deno.json` - Appended the replay-window guard path to `test:ci` (after the 02-05 guards) so it runs inside `verify:baseline`.

## Decisions Made

- **Harden-in-place vs. remove:** operator-gated because the decision depends on live billing reality. Removal stays deferred to Phase 8's expiration gate; this plan closes only the replay + config-leak branches without touching the signing/dedup mechanics.
- **Defensive posture confirmed:** operator verified 0 in-flight Paddle subscriptions on prod (no `profiles` row with an active future-dated Paddle `current_period_end`) and the secret is unset on prod, so the endpoint is inert today. The hardening keeps the path safe if the secret is ever restored while any residual sub expires.
- **ts freshness from the authenticated signature:** using the HMAC-signed `ts` (not a body field) means a stale-but-signed payload is a genuine replay, correctly rejected.

## SEC-13 Evidence

- **RED->GREEN captured:** against unmodified source the guard failed 1/7 (no replay-window; missing-secret body named `PADDLE_WEBHOOK_SECRET`); after the fix 7/7 pass. The "vulnerable behavior no longer possible" evidence applies to the replay and config-leak branches (per the threat register's byte-preservation note).
- **Full suite:** 808 passed / 0 failed / 11 ignored. Sibling `stripe-webhook` idempotency tests 24/24 — no perturbation of the insert-first idempotency siblings.
- **Live reality:** endpoint is currently fail-closed (secret unset on prod) with 0 in-flight Paddle subs -> defensive hardening. Operator approved (Task 2, 2026-07-01): "approved — no in-flight Paddle subs (defensive hardening)".

## Deviations from Plan

None - plan executed exactly as written.

## Authentication / Operator Gates

- **Task 2 (checkpoint:human-verify, blocking):** operator confirmed the in-flight-subscription reality and approved the harden-in-place direction. Outcome: 0/18 profiles carry an active future-dated Paddle subscription; secret unset; approval granted. Normal operator-gated flow, not a deviation.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. (Prod secret remains intentionally unset; no action owed by this plan.)

## Next Phase Readiness

- **Phase 8 (Paddle Retirement) gate input:** 0 in-flight Paddle subscriptions on prod is a clean-removal signal for Phase 8's expiration gate. Combined with the unset prod secret, the endpoint is inert; removal-vs-safe-prep can proceed once Phase 8 re-verifies the expiration state at that time.
- **02-07 next (Wave 5):** SEC-07 prompt-sanitizer coverage (high-traffic ingesters) + SEC-04 XSS-sink regression guard — independent of this plan.
- **02-08 (Wave 6):** the SEC-15 final security record will fold this Fix 3 remediation (evidence: replay rejected, config not leaked) into the phase closure record.

## Self-Check: PASSED

- 02-06-SUMMARY.md present
- Task 1 commit `44c7579d` present in history
- Guard `paddle-webhook/replay-window.test.ts` exists
- Guard registered on `deno.json` `test:ci` line

_Note: full suite not re-run at closure (per continuation instructions); Task-1 commit already captured 808 passed / 0 failed / 11 ignored._

---
*Phase: 02-security-audit-remediation*
*Completed: 2026-07-01*
