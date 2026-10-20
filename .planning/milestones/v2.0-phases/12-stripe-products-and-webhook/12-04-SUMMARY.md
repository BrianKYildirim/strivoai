---
phase: 12-stripe-products-and-webhook
plan: 04
subsystem: payments
tags: [stripe, deno, edge-functions, checkout, merit-shop, rate-limiting, back-compat, tdd]

# Dependency graph
requires:
  - phase: 07-stripe-migration-backend
    provides: create-checkout-session/index.ts (Phase 07 subscription handler), _shared/rate-limiter.ts (checkRateLimit + createRateLimitResponse), _shared/stripe-client.ts, _shared/auth.ts (requireAuth)
  - phase: 12-stripe-products-and-webhook
    provides: _shared/shop-pack-resolver.ts (Plan 01) — isPackSize, resolveShopPriceId, type PackSize
provides:
  - create-checkout-session/index.ts — extended with discriminated CheckoutBody union supporting both subscription and Merit Shop one-time payments, with Phase 07 back-compat preserved byte-equivalent for bare {tier, interval} bodies
  - create-checkout-session/index.test.ts — extended from 12 to 18 Deno.test blocks; new coverage spans back-compat, payment happy path with Pitfall-9 metadata mirroring, invalid pack_size, missing shop env, shop-specific rate limit, and unrecognized body shape
affects: 12-05-stripe-webhook-handler (consumer of session.metadata.user_id and payment_intent_data.metadata.user_id for Merit crediting), 13-merit-enforcement-and-feature-flag, 20-merit-ux-shop-pricing-and-streak-ui (frontend caller of /create-checkout-session payment branch)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Discriminated mode union with normalizeBody() that accepts BOTH the new {mode:'subscription'|'payment'} shape AND the legacy bare {tier, interval} shape. Back-compat path is byte-equivalent — no Phase 07 caller has to change."
    - "Two-stage rate limiting: shared entry-point limit (per-tier 10/30/60/h) runs for every request; shop-specific limit (10/h flat across all tiers) runs ONLY when body.mode === 'payment'. Both calls go through the injected rateLimitFn so unit tests can dispatch on cfg.key."
    - "Pitfall 9: shop sessions write user_id and pack_size to BOTH session.metadata AND payment_intent_data.metadata so the future webhook handler can credit Merits via either checkout.session.completed or payment_intent.succeeded without losing correlation."
    - "Lazy customer creation runs BEFORE the mode branch so subscription and payment sessions share the same customer record (no D-21 duplication risk)."
    - "Test env hygiene: shop tests use a dedicated clearMeritEnv() helper paired with try/finally so STRIPE_PRICE_MERIT_* variables never leak between Deno.test blocks (which run in the same process)."

key-files:
  created: []
  modified:
    - supabase/functions/create-checkout-session/index.ts
    - supabase/functions/create-checkout-session/index.test.ts

key-decisions:
  - "normalizeBody() treats the bare {tier, interval} body (no `mode` field) as mode:'subscription' explicitly so the Phase 07 contract stays byte-equivalent and any in-flight frontend code keeps working through the cutover. The acceptance test `subscription-back-compat-no-mode-field` proves the back-compat path still produces a subscription-mode Stripe session with the right metadata."
  - "Shop rate limit (SHOP-12) runs as a SECOND checkRateLimit call keyed `create-checkout-session-shop`, not as a replacement for the entry-point limit. Rationale: the shared entry-point limit still protects against general abuse from any caller; the shop-specific limit is an additional cap that prevents pack-purchase abuse from any tier (free/pro/elite all 10/h)."
  - "Shop priceId is resolved via resolveShopPriceId(pack_size) from the Plan 01 helper (env STRIPE_PRICE_MERIT_<3|10|25|50>). Missing env returns 500 price_not_configured, mirroring the subscription branch's STR-12 fail-closed behavior."
  - "isPackSize() is checked BEFORE customer creation so an invalid pack_size short-circuits with 400 invalid_pack_size and never touches Stripe or the profiles table."
  - "Both metadata channels (session.metadata and payment_intent_data.metadata) carry the SAME {user_id, pack_size} payload, with pack_size stringified per Stripe's metadata-only-strings constraint."
  - "Logging line for shop sessions emits mode:'payment' and pack_size so log searches can filter shop vs. subscription paths cleanly without parsing metadata."

patterns-established:
  - "Test-side rate-limit dispatcher: a test-only checkRateLimit fake that switches on cfg.key (allow entry-point key, deny shop-specific key) cleanly proves the second rate-limit call is wired without needing global state. This pattern is reusable for any future endpoint that adds a second rate-limit gate behind a body discriminator."
  - "Per-test env mutation with try/finally + clearMeritEnv() prevents Deno.env state from leaking between tests in the same process. Shop tests that need a specific STRIPE_PRICE_MERIT_<N> set it inside the try block and clear it (along with the base setTestEnv keys) in finally."
  - "TDD task pair (handler edit + test extension) maintained as two atomic commits with `feat(...)` for source and `test(...)` for tests, matching the plan-level TDD gate sequence. Existing 12 tests stayed green throughout, proving the back-compat invariant from the source side before the new tests landed."

requirements-completed:
  - SUB-05
  - SUB-06
  - SHOP-12
  - BACK-04

# Metrics
duration: 4min 2sec
completed: 2026-04-15
---

# Phase 12 Plan 04: Create-Checkout-Session Mode Discriminator Summary

**Discriminated `mode` switch on the create-checkout-session edge function so a single endpoint creates both Stripe subscription Checkout Sessions and Merit Shop one-time payment sessions, with Phase 07 back-compat preserved byte-equivalent and a second SHOP-12 rate limit guarding the payment branch.**

## Performance

- **Duration:** 4 min 2 sec
- **Started:** 2026-04-15T21:49:44Z
- **Completed:** 2026-04-15T21:53:46Z
- **Tasks:** 2 (both `tdd="true"`)
- **Files modified:** 2

## Accomplishments

- BACK-04: single create-checkout-session function now creates both subscription and Merit Shop Checkout Sessions, routed by a new `mode` field on the request body.
- SUB-05/SUB-06: Phase 07 subscription path preserved byte-equivalent. All 12 pre-existing Phase 07 tests stay green; the bare `{tier, interval}` body shape (no `mode` field) is explicitly tested as a back-compat case.
- SHOP-12: shop-specific rate limit (10/hour flat across all tiers) lands as a second `checkRateLimit` call keyed `create-checkout-session-shop`, scoped to the payment branch only.
- Pitfall 9: shop sessions set BOTH `session.metadata.user_id` AND `payment_intent_data.metadata.user_id` so Plan 12-05's webhook handler will be able to credit Merits via either `checkout.session.completed` or `payment_intent.succeeded` without losing correlation.
- Test coverage went from 12 → 18 Deno.test blocks (6 new), all green. Coverage spans: back-compat, payment happy path with metadata mirroring assertion, invalid pack_size, missing shop env, shop-specific rate limit, and unrecognized body shape.

## Task Commits

Each task was committed atomically, in the plan order:

1. **Task 1: Extend create-checkout-session handler with discriminated mode** — `5e093e6` (feat) — handler edit (+157 / -39 lines on `index.ts`). Adds the `CheckoutBody` discriminated union, `normalizeBody()`, the second SHOP-12 rate-limit call, mode-branched session creation, and the `payment_intent_data.metadata` mirror per Pitfall 9. `deno check` clean. All 12 pre-existing Phase 07 tests still pass against the modified handler, proving the back-compat invariant from the source side.
2. **Task 2: Extend create-checkout-session tests with payment-mode cases** — `6a8a624` (test) — test extension (+282 / -3 lines on `index.test.ts`). Adds 6 new `Deno.test` blocks, a `MERIT_KEYS` const, and a `clearMeritEnv()` helper. Each shop-related test mutates `STRIPE_PRICE_MERIT_*` inside a `try` block and clears it in `finally`. `deno check` clean; 18/18 tests pass.

_Plan-level TDD gate sequence in git log: feat → test (Task 1's source change is verified by Task 2's tests in addition to the preserved Phase 07 suite). Both commits use the `--no-verify` flag per parallel-executor protocol to avoid pre-commit hook contention with other Wave 2 worktrees._

## Files Created/Modified

- `supabase/functions/create-checkout-session/index.ts` — Modified. Header docstring updated to document the discriminated union, the SHOP-12 second rate limit, and Pitfall 9. New imports from `_shared/shop-pack-resolver.ts` (`isPackSize`, `resolveShopPriceId`, `type PackSize`). New `CheckoutBody` union type and `normalizeBody()` helper that accepts both the new `{mode}` shape and the legacy bare `{tier, interval}` shape. Handler body restructured: first rate limit unchanged, body normalized via `normalizeBody()`, validation branched by mode, second rate limit + pack validation in payment branch, lazy customer creation runs once before the session-creation branch, session creation branched into subscription (unchanged Phase 07 shape) and payment (new shop shape with mirrored `payment_intent_data.metadata`).
- `supabase/functions/create-checkout-session/index.test.ts` — Modified. Header docstring updated to mention Phase 12 Plan 04. 6 new `Deno.test` blocks appended after the existing `STR-12: malicious priceId in body is ignored` test. Shared `MERIT_25`/`MERIT_50` constants and a `clearMeritEnv()` helper added to clear all 4 `STRIPE_PRICE_MERIT_*` env vars between shop tests.

## Decisions Made

See key-decisions in frontmatter. The most important runtime invariant: `normalizeBody()` normalizes the bare `{tier, interval}` body (no explicit `mode`) into `{mode: 'subscription', tier, interval}` so the Phase 07 contract stays byte-equivalent. The new test `subscription-back-compat-no-mode-field` asserts this directly by sending a Phase-07-shaped body with no `mode` field and asserting that the resulting Stripe session has `mode === 'subscription'` with the right priceId and metadata.

A second runtime decision worth flagging: `isPackSize(body.pack_size)` is checked BEFORE the lazy customer creation block. Without this ordering, an invalid pack_size from a brand-new user (with no `stripe_customer_id` yet) would still create a Stripe customer record, leaving an orphan. The chosen ordering keeps the failure path cheap and side-effect-free.

## Deviations from Plan

None — plan executed exactly as written. The `<action>` block in Task 1 specified line numbers from the Phase 07 file (lines 91-98, 101-112, 120-145, 147-156); those reference points stayed accurate, so the only adjustment was minor: the plan said to add the body union "after `type SupabaseLike = any;`" but the cleanest reading order was to insert it before `CreateCheckoutSessionDeps` (which references nothing the union depends on). This is positioning only, not behavior — both placements are correctly type-checked by `deno check`.

The plan's Task 1 acceptance criterion 6 ("grep `mode: \"subscription\"` still present (back-compat)") is satisfied with 4 occurrences (the type definition, the normalizer return, the runtime branch check, and the Stripe session creation). The plan's Task 2 acceptance criteria are all met with 6 new test blocks all green.

## Issues Encountered

None. `deno check` passed on the first attempt for both the handler edit and the test extension. The 12 pre-existing Phase 07 tests stayed green throughout, which was the early signal that the back-compat path was working. The 6 new tests all passed on the first run with no fix-up cycles.

## User Setup Required

None — no external service configuration required at the plan level. The new `STRIPE_PRICE_MERIT_<3|10|25|50>` env vars are needed in Supabase secrets before the payment branch can resolve a real shop priceId in production, but those are provisioned by Plan 12-03 (provisioning scripts) and configured before Plan 12-05 (webhook handler) deploys. No user action is required for this plan to land — the unit tests use injected fakes and a per-test env helper.

## Next Phase Readiness

- **For Plan 12-05 (stripe-webhook-handler):** Both metadata channels (`session.metadata.user_id` and `payment_intent_data.metadata.user_id`) are now populated on every shop session, so the webhook handler can correlate `checkout.session.completed` and `payment_intent.succeeded` events to the user without depending on `client_reference_id` alone. The shop-mode session also sets `client_reference_id: ctx.userId` as a third correlation hop, matching the subscription branch.
- **For Plan 20 (merit-ux-shop-pricing-and-streak-ui):** Frontend can call `POST /create-checkout-session` with `{mode: 'payment', pack_size: 25}` (or 3/10/50) to get back `{url, id}`. The `cancel_url` for shop sessions points to `/shop?canceled=1` so the user lands back on the shop page (subscription `cancel_url` continues to point to `/pricing?canceled=1`).
- **For frontend in flight during cutover:** Existing callers sending `{tier, interval}` (no `mode` field) keep working unchanged — the test `subscription-back-compat-no-mode-field` is the regression guard. There is no urgency to update frontend caller shapes before this lands.
- **For other Wave 2 plans:** This plan touches only the create-checkout-session function and its test file; there is no overlap with the webhook handler, the migration, or the provisioning scripts that other Wave 2 worktrees own.

## Self-Check

Verification commands run after the SUMMARY.md was drafted:

- `[ -f supabase/functions/create-checkout-session/index.ts ] && echo FOUND` — FOUND
- `[ -f supabase/functions/create-checkout-session/index.test.ts ] && echo FOUND` — FOUND
- `git log --oneline | grep 5e093e6` — FOUND (`feat(12-04): extend create-checkout-session with discriminated mode for shop`)
- `git log --oneline | grep 6a8a624` — FOUND (`test(12-04): cover create-checkout-session payment mode + back-compat`)
- `deno check supabase/functions/create-checkout-session/index.ts` — clean
- `deno check supabase/functions/create-checkout-session/index.test.ts` — clean
- `deno test --allow-env --allow-read --allow-net --no-check supabase/functions/create-checkout-session/index.test.ts` — 18 passed | 0 failed

## Self-Check: PASSED

---
*Phase: 12-stripe-products-and-webhook*
*Completed: 2026-04-15*
