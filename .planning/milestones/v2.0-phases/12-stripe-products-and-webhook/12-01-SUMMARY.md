---
phase: 12-stripe-products-and-webhook
plan: 01
subsystem: testing
tags: [stripe, deno, testing, tdd, webhook, merit-shop, edge-functions]

# Dependency graph
requires:
  - phase: 07-stripe-migration-backend
    provides: stripe-webhook/price-resolver.ts, stripe-webhook/index.test.ts (structural template for new handler), _shared/test-helpers/stripe-signature.ts + stripe-fixtures.ts
provides:
  - _shared/price-resolver.ts — promoted resolveTier / resolvePriceId helpers importable from any edge function (D-06 duplication, Phase 07 original untouched)
  - _shared/shop-pack-resolver.ts + unit test — bidirectional PackSize ⇔ STRIPE_PRICE_MERIT_{3,10,25,50} resolver with fail-closed semantics (9/9 green)
  - _shared/test-helpers/stripe-fixtures.ts — extended with makeCheckoutSessionCompletedEvent and makeInvoicePaymentSucceededEvent factories carrying full Stripe.Event envelope fields
  - stripe-webhook-handler/index.test.ts — 15 red test scaffolds including TEST-08 duplicate-event-no-double-credit
  - reset-subscription-merits/index.test.ts — 4 red test scaffolds for the pg_cron-invoked batch handler
  - scripts/run-edge-tests.ps1 — green main suite augmented with shop-pack-resolver test, red Phase 12 scaffolds isolated in a non-aborting section
affects: 12-02-checkout-session-extension, 12-03-provisioning-scripts, 12-04-migration-and-backfill, 12-05-stripe-webhook-handler, 12-06-reset-subscription-merits

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-pattern resolver in _shared/: fail-open (price-resolver.ts returns 'free') vs. fail-closed (shop-pack-resolver.ts returns null). Rationale: subscription tier has a safe default; shop pack size does not."
    - "Red test scaffolds use `const { fn } = await import('./index.ts')` inside each Deno.test block so Module-not-found is the visible red signal until downstream plans create the index.ts files."
    - "Two-stage runner: main deno test call stays strict ($ErrorActionPreference = Stop), Phase 12 red scaffolds run in a nested try/finally that temporarily relaxes $ErrorActionPreference to Continue so the red output is captured without aborting the overall runner."

key-files:
  created:
    - supabase/functions/_shared/price-resolver.ts
    - supabase/functions/_shared/shop-pack-resolver.ts
    - supabase/functions/_shared/shop-pack-resolver.test.ts
    - supabase/functions/stripe-webhook-handler/index.test.ts
    - supabase/functions/reset-subscription-merits/index.test.ts
  modified:
    - supabase/functions/_shared/test-helpers/stripe-fixtures.ts
    - scripts/run-edge-tests.ps1

key-decisions:
  - "Promoted price-resolver is a byte-compatible COPY, not a move. Phase 07 stripe-webhook/price-resolver.ts stays untouched per 12-CONTEXT D-06 (removed in Phase 21 cleanup). The only diff from the original is the logger import path (../_shared/logger.ts → ./logger.ts) since the new file is a sibling of logger.ts in _shared/."
  - "shop-pack-resolver fails CLOSED (returns null) on unknown price IDs, unlike price-resolver which fails OPEN to the 'free' tier. There is no sensible default pack size, so callers must surface the null explicitly."
  - "Red scaffolds use dynamic await import('./index.ts') inside each Deno.test block rather than top-level import so the test NAMES appear in runner output even though the imports fail. This locks in test coverage contracts for Plans 05/06."
  - "Runner split into two deno invocations rather than a single monolithic call: the green main suite (now including shop-pack-resolver.test.ts) runs strict, then a Phase 12 block runs with $ErrorActionPreference temporarily relaxed to Continue. Removes the need for developers to grep through a mixed pass/fail output."

patterns-established:
  - "_shared/ resolvers read Deno.env on every call (no module-level caching) so Deno.test blocks can mutate env state between cases without needing a module reset hook."
  - "Stripe fixture factories emit the full Stripe.Event envelope (id, object, api_version, created, livemode, type, data.object). crypto.randomUUID().slice(0,8) is used for suffix generation in new factories, matching the existing randomEventId() spirit while aligning with the plan action's explicit guidance."
  - "Red test scaffold commits land with the `test(...)` commit type so the plan-level TDD gate sequence (test → feat → refactor) stays inspectable in git log."

requirements-completed:
  - TEST-08
  - BACK-05
  - NFR-06

# Metrics
duration: 8min 47sec
completed: 2026-04-15
---

# Phase 12 Plan 01: Wave 1 Shared Helpers and Red Test Scaffolds Summary

**Promoted price-resolver to _shared/, added fail-closed shop-pack-resolver with 9/9 green unit test, extended Stripe fixture factories for checkout.session.completed and invoice.payment_succeeded, and wired 19 red test scaffolds (15 stripe-webhook-handler + 4 reset-subscription-merits) into the edge-test runner as the Wave 2 TDD red gate.**

## Performance

- **Duration:** 8min 47sec
- **Started:** 2026-04-15T21:33:15Z
- **Completed:** 2026-04-15T21:42:02Z
- **Tasks:** 3 / 3
- **Files modified:** 7 (5 created, 2 modified)

## Accomplishments

- **_shared/price-resolver.ts** is now importable from any edge function. Phase 07 `stripe-webhook/price-resolver.ts` remains byte-identical per CONTEXT D-06 — the duplication is intentional until Phase 21 cleanup.
- **_shared/shop-pack-resolver.ts** exports bidirectional `resolvePackSize` ⇔ `resolveShopPriceId` helpers for the 4 Merit Shop pack sizes (3/10/25/50). Fails closed (returns null) on unknown IDs, with a warn log emission for observability. 9/9 unit tests green.
- **_shared/test-helpers/stripe-fixtures.ts** gained two new factory functions: `makeCheckoutSessionCompletedEvent` (mode-discriminated subscription vs. payment mode) and `makeInvoicePaymentSucceededEvent` (monthly vs. yearly interval via `lines.data[0].price.recurring.interval`). Both emit the full Stripe.Event envelope — existing Phase 07 tests remain green (32/32 across 3 suites).
- **stripe-webhook-handler/index.test.ts** registers 15 red test scaffolds including the load-bearing TEST-08 `test-08-duplicate-event-no-double-credit` block. Each block dynamically imports `./index.ts` so Module-not-found is the red signal until Plan 05 creates the handler.
- **reset-subscription-merits/index.test.ts** registers 4 red test scaffolds covering internal-secret auth, batch processing, empty-queue, and RPC-error observability.
- **scripts/run-edge-tests.ps1** now runs the new `_shared/shop-pack-resolver.test.ts` in the green main suite and isolates the Phase 12 red scaffolds in a non-aborting nested block so CI still surfaces the red output without killing the runner mid-flight.

## Task Commits

Each task was committed atomically in TDD order where applicable:

1. **Task 1 (RED): Promote price-resolver + failing shop-pack-resolver test** — `0cf8e4d` (test)
2. **Task 1 (GREEN): Implement shop-pack-resolver** — `0a5040a` (feat) — 9/9 tests green
3. **Task 2: Phase 12 Stripe fixture factories** — `09565f8` (feat) — deno check clean
4. **Task 3: Red test scaffolds + runner registration** — `e5fcfb5` (test) — 19 scaffolds red, main suite green

_No plan-metadata commit here: worktree execution mode defers orchestrator-owned SUMMARY/STATE/ROADMAP commits to the wave finalizer._

## Files Created/Modified

- `supabase/functions/_shared/price-resolver.ts` — byte-compatible copy of `stripe-webhook/price-resolver.ts` with logger import path rewritten for the new location; exports `resolveTier`, `resolvePriceId`, `buildPriceMap`.
- `supabase/functions/_shared/shop-pack-resolver.ts` — NEW. `PackSize` union (3 | 10 | 25 | 50), `PACK_SIZES` readonly tuple, `isPackSize` type guard, `buildShopPackMap`, `resolvePackSize`, `resolveShopPriceId`.
- `supabase/functions/_shared/shop-pack-resolver.test.ts` — NEW. 9 Deno.test blocks covering symmetry, unknown IDs, null/undefined/empty handling, missing env vars, buildShopPackMap filtering, and isPackSize.
- `supabase/functions/_shared/test-helpers/stripe-fixtures.ts` — MODIFIED. Added `STRIPE_API_VERSION` constant, `shortId()` + `nowUnix()` helpers, `CheckoutSessionMode`, `CheckoutPackSize`, `CheckoutSessionCompletedParams`, `makeCheckoutSessionCompletedEvent`, `InvoicePaymentSucceededParams`, `makeInvoicePaymentSucceededEvent`. Existing exports preserved unchanged.
- `supabase/functions/stripe-webhook-handler/index.test.ts` — NEW. 15 red Deno.test blocks with full test-env harness (STRIPE_PRICE_* + STRIPE_PRICE_MERIT_* env setup).
- `supabase/functions/reset-subscription-merits/index.test.ts` — NEW. 4 red Deno.test blocks with internal-secret env harness.
- `scripts/run-edge-tests.ps1` — MODIFIED. Added `_shared/shop-pack-resolver.test.ts` to main (green) suite; appended a Phase 12 red-scaffold block that runs with `$ErrorActionPreference = Continue` so red output is captured but does not abort the runner. Reverted em-dash characters to ASCII dashes in the comment block to avoid a Windows PowerShell 5.1 encoding parse error.

## Decisions Made

- **Promoted helper is a COPY, not a move.** Phase 12 CONTEXT D-06 explicitly mandates the Phase 07 handler stays byte-identical until Phase 21 cleanup. The new `_shared/price-resolver.ts` is a verbatim copy with only the logger import path rewritten (sibling `./logger.ts` instead of `../_shared/logger.ts`).
- **Fail-closed for shop packs vs. fail-open for subscription tiers.** Subscription pricing falls back to the 'free' tier on unknown IDs because that is a safe default. Shop pack sizes have no safe default — an unknown ID could credit any number of Merits, so the resolver returns `null` and the caller must surface the error explicitly.
- **Red scaffold pattern: dynamic import inside each Deno.test block.** Each test does `const { handleStripeWebhook } = await import('./index.ts')` rather than a top-level import so every test block is individually visible in the runner output even though all 15 (or 4) imports fail identically. Locks in test-name contracts that Plans 05/06 cannot accidentally weaken.
- **Runner split into two deno invocations.** A single deno call with both red and green files would either abort mid-flight or silently swallow errors. Splitting the call lets the main suite stay strict while the red scaffolds emit their red signal in a clearly labeled section. The runner prints `Phase 12 red scaffolds FAILED as expected (exit 1).` at the tail so CI logs are self-explanatory.
- **crypto.randomUUID() for new fixture suffixes.** The plan action mandated `crypto.randomUUID().slice(0,8)` for the new Phase 12 factories. Existing factories (makeSubscriptionCreatedEvent, etc.) still use `Math.random().toString(36)` — that difference is intentional and confined to the new Phase 12 additions to avoid churning the Phase 07 test surface.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] PowerShell 5.1 parse error on em-dash characters in run-edge-tests.ps1 comments**

- **Found during:** Task 3 (run-edge-tests.ps1 verification)
- **Issue:** The initial edit used Unicode em-dash characters (U+2014) in the comment block (`"-- Phase 12 red scaffolds --"` and `"implement the handlers — this..."`). The file is UTF-8 without a BOM and PowerShell 5.1 (the shipped Windows default) treats that as the system code page (Windows-1252), then misreads the multi-byte em-dash as a token terminator around character 80. The parser errored out with `The string is missing the terminator: "` at line 54 before any deno invocation.
- **Fix:** Replaced the em-dashes with ASCII `--` in the comment block and the inline string literal. Kept the structural PowerShell logic (two-stage deno invocation with temporarily relaxed $ErrorActionPreference) unchanged.
- **Files modified:** `scripts/run-edge-tests.ps1`
- **Verification:** `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-edge-tests.ps1` now executes cleanly end-to-end: main suite prints `All edge function tests passed.`, Phase 12 block prints `running 4 tests from ./reset-subscription-merits/index.test.ts` and `running 15 tests from ./stripe-webhook-handler/index.test.ts`, followed by `Phase 12 red scaffolds FAILED as expected (exit 1).`
- **Committed in:** `e5fcfb5` (Task 3 commit — single commit includes both the scaffolds and the fix because the parse error only surfaced during in-task verification)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The em-dash replacement is a cosmetic adjustment. All plan-level success criteria and acceptance criteria still hold. No architectural or scope change.

## Issues Encountered

- **Initial Write tool call landed in the main project tree, not the worktree.** When I used `C:\Projects\strive-ai-hired\supabase\functions\_shared\price-resolver.ts` as the absolute path in the first Write call, the file was created at the main repo path rather than the worktree (`.claude\worktrees\agent-a17d98b8\...`). Resolved by deleting the misplaced files from the main tree and rewriting with the full worktree-absolute path. No commits were affected because this happened before the first `git add`.
- **`deno check` against `_shared/price-resolver.ts` and `_shared/shop-pack-resolver.ts` reports "Cannot find name 'Deno'".** This is a pre-existing Deno 2 configuration issue that also affects the Phase 07 `stripe-webhook/price-resolver.ts` (5 errors) and the entire edge-functions tree (34 errors across the full suite). The project works around it by running tests with `--no-check`, which is exactly the verification command the plan specifies for Task 1. All three task verification commands pass as specified. This is out of scope for Plan 12-01 and belongs in a future housekeeping pass.

## TDD Gate Compliance

Task 1 is a TDD task (`tdd="true"` on the plan). Gate sequence verified in git log:

- RED: `0cf8e4d test(12-01): promote price-resolver to _shared/ and add failing shop-pack-resolver test`
- GREEN: `0a5040a feat(12-01): implement _shared/shop-pack-resolver for Merit Shop pack sizes`
- REFACTOR: not needed — the GREEN implementation is already in its final form (minimal, no duplication).

Task 3 is declared as `tdd="true"` but is a pure-RED scaffold task by design (Plans 05/06 will deliver the GREEN). Gate commit: `e5fcfb5 test(12-01): add red scaffolds for stripe-webhook-handler + reset-subscription-merits`. The scaffolds are intentionally RED until downstream plans land; this is correct TDD behavior for Wave 1 contract-locking.

## User Setup Required

None — no external service configuration is introduced by Plan 12-01. The new STRIPE_PRICE_MERIT_{3,10,25,50} env vars are referenced by the scaffold code but not consumed at runtime by any production edge function yet. Plans 02–06 will wire the runtime consumers and Plan 03 will document the provisioning runbook.

## Next Phase Readiness

- **Plans 02, 05, and 06 unblocked.** All Wave 1 shared helpers and test scaffolds they depend on are in place:
  - Plan 02 (checkout-session extension) can import `_shared/price-resolver.ts` and `_shared/shop-pack-resolver.ts` directly instead of rolling its own resolvers.
  - Plan 05 (stripe-webhook-handler) can create `supabase/functions/stripe-webhook-handler/index.ts` exporting `handleStripeWebhook` and turn the 15 red scaffolds green.
  - Plan 06 (reset-subscription-merits) can create `supabase/functions/reset-subscription-merits/index.ts` exporting `handleResetSubscriptionMerits` and turn the 4 red scaffolds green.
- **Deferred housekeeping:** Pre-existing `deno check` failures against files that reference `Deno.env` are not addressed by this plan. They do not affect `deno test --no-check` (the project's default test path) or `deno check` against files that do NOT reference the `Deno` global (like `stripe-fixtures.ts`, which checks clean).

## Self-Check

Verifying all claimed files exist and all claimed commits are reachable:

- `supabase/functions/_shared/price-resolver.ts` — FOUND
- `supabase/functions/_shared/shop-pack-resolver.ts` — FOUND
- `supabase/functions/_shared/shop-pack-resolver.test.ts` — FOUND
- `supabase/functions/_shared/test-helpers/stripe-fixtures.ts` — FOUND (modified)
- `supabase/functions/stripe-webhook-handler/index.test.ts` — FOUND
- `supabase/functions/reset-subscription-merits/index.test.ts` — FOUND
- `scripts/run-edge-tests.ps1` — FOUND (modified)
- Commit `0cf8e4d` — FOUND
- Commit `0a5040a` — FOUND
- Commit `09565f8` — FOUND
- Commit `e5fcfb5` — FOUND
- `stripe-webhook/price-resolver.ts` untouched vs. `45d265c` — VERIFIED (empty git diff)

## Self-Check: PASSED

---
*Phase: 12-stripe-products-and-webhook*
*Plan: 01*
*Completed: 2026-04-15*
