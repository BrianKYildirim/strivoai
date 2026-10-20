---
phase: 02-security-audit-remediation
plan: 05
subsystem: payments
tags: [security-audit, billing-integrity, merit-gateway, idempotency, grade-linkedin, refund-after-save, deno, verify-baseline]

# Dependency graph
requires:
  - phase: 02-03
    provides: the two confirmed HIGH billing findings (Fix 1 merit-gateway non-idempotent deduct; Fix 2 grade-linkedin 3 post-save refund-after-save sites) + pre-save-throw byte-preserve KEEP call
  - phase: 02-01
    provides: severity rubric (block-on-high) + verify:baseline SEC-14 fold-in convention
provides:
  - "Fix 1 (SEC-13): merit-gateway.ts withMerits forwards an OPTIONAL per-request p_idempotency_key to the 4-arg check_and_deduct_merits RPC so a repeated key deducts exactly once (the non-idempotent gateway behavior is no longer possible); post-success transaction log null-safe on the already_deducted replay branch"
  - "Fix 2 (SEC-13): grade-linkedin all three post-save usage-write failure branches log-and-continue to the durable success response (no MeritRefundable/500 after storeAndNotify) — an already-saved+emailed analysis is never refunded or 500'd; the pre-save throw is byte-identical"
  - "Two regression guards folded into verify:baseline (SEC-14): _shared/merit-gateway.idempotency-forward.test.ts (static + gated-remote twin) + grade-linkedin/refund-after-save.test.ts (static), both RED->GREEN"
  - "Additive Phase-3-compatible seam: MeritGatewayContext.idempotencyKey? is capability-only; Phase 3 (03-02, LIFE-05) EXTENDS by deriving+threading the key per-feature, it does not replace this field"
affects: [03-02 (LIFE-05 threads the idempotency key per-feature), 04-feature-migration (LinkedIn rework builds on refund-after-save fix), 02-08 (SEC-15 security record)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive optional-field capability seam: wire the gateway CAPABILITY (idempotencyKey? defaults NULL, preserving prior behavior for callers that don't yet supply a key) and prove it with a guard, defer per-feature DERIVATION+threading to the extending phase"
    - "Static-source (Class B) guard for isolation-safe money-path assertions: assert on file source (forward present, no post-save throw/500, fall-through) instead of importing the handler — avoids perturbing the offline shared Deno process / stripe-webhook idempotency siblings (Pitfall 6); gated-remote runtime twin kept skip-by-default behind DENO_TEST_SUPABASE_REMOTE=1"
    - "Post-save log-and-continue: after a durable+delivered side-effect (row saved + emailed), a downstream usage-write failure logs a reason code and falls through to the durable success return — never refunds/500s an already-delivered result"

key-files:
  created:
    - supabase/functions/_shared/merit-gateway.idempotency-forward.test.ts
    - supabase/functions/grade-linkedin/refund-after-save.test.ts
    - .planning/phases/02-security-audit-remediation/02-05-SUMMARY.md
  modified:
    - supabase/functions/_shared/merit-gateway.ts
    - supabase/functions/grade-linkedin/index.ts
    - supabase/functions/deno.json

key-decisions:
  - "Fix 1 wires the idempotency-key CAPABILITY only (optional idempotencyKey? on MeritGatewayContext + p_idempotency_key: ctx.idempotencyKey ?? null forward); NULL default preserves current non-idempotent behavior for callers that don't yet supply a key — Phase 3 (03-02, LIFE-05) EXTENDS by deriving+threading it per-feature. No live behavior change from this plan."
  - "MeritGatewayResult shape + the RUN-03 frozen success/failure wire bodies are unchanged; only the internal transaction-log block gained already_deducted null-safety (surface already_deducted; ?? null on deducted_from/remaining_balance)."
  - "Fix 2 converts all three grade-linkedin post-save usage-write FAILURE branches to log-and-continue (keep the log.error('usage-tracking-insert-failed') reason line, drop the throw/500, fall through to the saved success return); the pre-save throw ('Could not save LinkedIn grade history.') + the 4 legit pre-save AI/parse/validation refundable throws are byte-identical."
  - "Both guards are static-source (Class B) for the in-gate assertion (Pitfall 6 isolation-safety); Fix 1 additionally ships a gated-remote runtime twin (DENO_TEST_SUPABASE_REMOTE=1, skip-by-default) that drives withMerits with a repeated key and asserts exactly one deduction (the RESEARCH Fix-1 guard)."

patterns-established:
  - "Money-path fix + fail-before/pass-after guard + operator checkpoint before merge: surgical self-contained security fix, RED captured on unmodified source, GREEN after, guard folded into verify:baseline, operator signs off the live billing seam"
  - "Extend-not-replace seam handoff: a Phase-2 fix wires a capability additively so a downstream phase (03-02) extends rather than rips it out"

requirements-completed: [SEC-13, SEC-14]

# Metrics
duration: ~10min
completed: 2026-07-01
---

# Phase 2 Plan 05: Money-Path Billing-Integrity Remediation Summary

**Both confirmed HIGH billing threats closed with surgical, Phase-3-compatible fixes: (Fix 1) `withMerits` now forwards an optional per-request `p_idempotency_key` to the 4-arg `check_and_deduct_merits` RPC so a repeated key deducts exactly once, with the transaction log made null-safe on the `already_deducted` replay branch; and (Fix 2) `grade-linkedin`'s three post-save usage-write failure branches log-and-continue to the durable success response so an already-saved+emailed analysis is never refunded or reported as a 500 — each shipped with a fail-before/pass-after guard folded into `verify:baseline` and operator-approved as a live billing seam.**

## Performance

- **Duration:** ~10 min (Tasks 1-2 auto; Task 3 operator checkpoint)
- **Started:** 2026-07-01 (Task 1 source + guard)
- **Completed:** 2026-07-01 (operator money-path sign-off + plan close-out)
- **Tasks:** 3 (Tasks 1-2 auto-executed + committed; Task 3 operator `checkpoint:human-verify` APPROVED)
- **Files modified:** 3 source/config + 2 guards created + 1 summary

## Accomplishments
- **Fix 1 (T-02-01, merit-gateway.ts) — non-idempotent Merit deduct closed:** added an OPTIONAL `idempotencyKey?: string` to `MeritGatewayContext` and forward a 4th named arg `p_idempotency_key: ctx.idempotencyKey ?? null` into the existing 4-arg `check_and_deduct_merits` RPC, so a repeated key (double-click / two-tab / refresh-resubmit) deducts EXACTLY ONCE via the partial-unique index — the vulnerable non-idempotent gateway path is no longer possible. Capability-only: NULL default preserves current behavior for callers that don't yet supply a key; **no live behavior change from this plan**.
- **Fix 1 null-safe replay log:** the post-success transaction log now surfaces `already_deducted` and `?? null`-guards `deducted_from` / `remaining_balance`, so an idempotency replay (`{ success, transaction_id, already_deducted:true }`, no `deducted_from`/`remaining_balance`) never emits `undefined` in the structured log.
- **Fix 2 (T-02-02, grade-linkedin/index.ts) — refund-after-save closed at all three post-save sites:** the free-path site (~L517), the merit-path site inside `withMerits` (~L556), and the legacy non-`withMerits` site (~L826) all drop the `throw new MeritRefundable(500,...)` / `return 500` and log-and-continue (keeping the `log.error('usage-tracking-insert-failed', ...)` reason line) to the durable saved success response. An already-saved+emailed analysis is never refunded (double benefit) or reported as a hidden-success 500.
- **Byte-preserve KEEP verified:** the pre-save throw (`'Could not save LinkedIn grade history.'`) and the 4 legit pre-save AI/parse/validation refundable throws are untouched.
- **Both guards RED->GREEN, folded into verify:baseline (SEC-14):** `_shared/merit-gateway.idempotency-forward.test.ts` (static in-gate assertion + skip-by-default gated-remote runtime twin) and `grade-linkedin/refund-after-save.test.ts` (static). Both paths appended to `deno.json` `test:ci` -> `verify:baseline`. Full suite: **801 passed / 0 failed / 11 ignored**.
- **Frozen contracts intact:** `MeritGatewayResult` shape + the RUN-03 success/failure wire bodies unchanged.
- **Operator money-path sign-off (Task 3):** APPROVED — "money-path fixes safe + Phase-3-compatible" (2026-07-01).

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix 1 — forward p_idempotency_key through withMerits + null-safe already_deducted log (+ static guard + gated-remote twin, registered in deno.json)** - `4ab218c5` (fix)
2. **Task 2: Fix 2 — grade-linkedin post-save usage-write log-and-continue at all three sites (+ static guard, registered in deno.json)** - `30be9b55` (fix)
3. **Task 3: Operator money-path sign-off** - APPROVED by operator (2026-07-01), no code commit (checkpoint)

**Plan metadata:** _(this SUMMARY + STATE + ROADMAP update — see final commit)_

## Files Created/Modified
- `supabase/functions/_shared/merit-gateway.ts` - added optional `idempotencyKey?` to `MeritGatewayContext`; forward `p_idempotency_key: ctx.idempotencyKey ?? null` to the 4-arg RPC; null-safe `already_deducted` transaction log.
- `supabase/functions/grade-linkedin/index.ts` - all three post-save usage-write failure branches converted to log-and-continue -> durable success return; pre-save throw + 4 pre-save refundable throws byte-identical.
- `supabase/functions/_shared/merit-gateway.idempotency-forward.test.ts` - **created** guard: static-source assertion of the forward + `already_deducted` replay-branch handling, plus a skip-by-default (`DENO_TEST_SUPABASE_REMOTE=1`) runtime twin driving `withMerits` with a repeated key to assert exactly one deduction.
- `supabase/functions/grade-linkedin/refund-after-save.test.ts` - **created** guard: static-source assertion of pre-save-throw KEEP + no post-save `MeritRefundable`/500 + fall-through to success at all three sites.
- `supabase/functions/deno.json` - both guard paths appended to `test:ci` (`_shared/merit-gateway.idempotency-forward.test.ts` in `4ab218c5`; `grade-linkedin/refund-after-save.test.ts` in `30be9b55`) -> into `verify:baseline`.
- `.planning/phases/02-security-audit-remediation/02-05-SUMMARY.md` - this summary.

## Decisions Made
- **Capability-only Fix 1 (no live behavior change):** the gateway seam is wired additively (`idempotencyKey?` defaults NULL); per-feature key DERIVATION + frontend threading is deferred to Phase 3 (03-02, LIFE-05), which EXTENDS this field rather than replacing it. This resolves RESEARCH Open Question 1 (gateway-capability + guard now; per-feature wiring later).
- **Static-source guards for the in-gate assertion (Pitfall 6):** a handler-importing runtime test would perturb the offline shared Deno process / stripe-webhook idempotency siblings, so both in-gate guards assert on file source; Fix 1's runtime proof lives behind the skip-by-default gated-remote twin.
- **Byte-preserve pre-save throw:** only the three post-save FAILURE branches flipped to success returns; the legitimate pre-save throw + the 4 pre-save refundable throws are untouched (verified in the guard).

## Deviations from Plan

None - plan executed exactly as written. Tasks 1-2 auto-executed with fail-before/pass-after evidence captured; Task 3 was the `checkpoint:human-verify` (gate=blocking) money-path sign-off, which the operator APPROVED ("money-path fixes safe + Phase-3-compatible"). No auto-fix rules (1-4) were triggered.

## SEC-13 Evidence (fail-before / pass-after)

- **Fix 1:** the static guard was run against the UNMODIFIED `merit-gateway.ts` (RED — no `p_idempotency_key` forwarded, no `already_deducted` handling), then GREEN after the fix. `cross-env DENO_TEST_SUPABASE_REMOTE=0 deno task test:ci` confirmed no sibling perturbation.
- **Fix 2:** the static guard was run against the UNMODIFIED `grade-linkedin/index.ts` (RED — post-save `MeritRefundable`/500 still present), then GREEN after all three sites were converted. `deno task test:ci` confirmed no stripe-webhook idempotency sibling perturbation.
- **Full offline suite:** 801 passed / 0 failed / 11 ignored (both new guards included, in `verify:baseline`).
- **Operator sign-off:** money-path change APPROVED (Task 3, 2026-07-01).

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- **Wave 3 remains:** 02-06 (MEDIUM remediations — paddle-webhook replay/config-leak + RUN-03 error-message body-leak class), 02-07 (SEC-07 disposition), 02-08 (SEC-15 security record) still to run.
- **Phase 3 handoff (03-02, LIFE-05):** the idempotency-key seam is live and guarded — Phase 3 derives + threads a per-feature key through `MeritGatewayContext.idempotencyKey` to activate exactly-once deduction end-to-end (EXTENDS, does not replace).
- **Carry to Phase-2 closure (unchanged from 02-04):** the single MEDIUM operator cron re-point (prod cron jobs 1 & 6 -> prod functions host).

## Self-Check: PASSED

- FOUND commit: `4ab218c5` (Task 1 — Fix 1 + guard + deno.json)
- FOUND commit: `30be9b55` (Task 2 — Fix 2 + guard + deno.json)
- FOUND: `supabase/functions/_shared/merit-gateway.idempotency-forward.test.ts`
- FOUND: `supabase/functions/grade-linkedin/refund-after-save.test.ts`
- FOUND: both guard paths registered in `supabase/functions/deno.json` `test:ci`
- FOUND: `.planning/phases/02-security-audit-remediation/02-05-SUMMARY.md`
- Suite state (per resume context, not re-run): 801 passed / 0 failed / 11 ignored

---
*Phase: 02-security-audit-remediation*
*Completed: 2026-07-01*
