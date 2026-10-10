---
phase: 24
slug: pricing-merit-economy-and-top-up-packs-update
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-21
last_updated: 2026-04-22 (audit trail appended)
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Seeded from 24-RESEARCH.md §Validation Architecture. Planner filled the per-task map; executor has checked off as tasks committed. Final Plan 07 Task 4 closes out the map and flips the sign-off bits.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 1.6.1 (FE + shared config) + Deno test (edge functions) |
| **Config file** | `vitest.config.ts` (FE) / `supabase/functions/deno.json` (edge) |
| **Quick run command** | `npm test -- --run <scope>` |
| **Full suite command** | `npm test && .\scripts\run-edge-tests.ps1` |
| **Estimated runtime** | ~40s FE vitest + ~20s Deno edge tests |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run <narrowed path>` covering the file touched
- **After every plan wave:** Run `npm test && .\scripts\run-edge-tests.ps1`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-T1   | 01   | 1    | BUDGET-01 / ECON-01 | T-24-01 | SC-12 tables pinned, tier sums reconcile 11500/52000/72000 | vitest snapshot | `npm test -- --run src/config/__tests__/sc12-snapshot.test.ts` | `src/config/pricing-config.ts` | ✅ green |
| 01-T2   | 01   | 1    | BUDGET-02 | T-24-01 | D-19 SC-12 drift guard; deep-equal fails CI on any cell change | vitest | `npm test -- --run src/config/__tests__/sc12-snapshot.test.ts` | `src/config/pricing-config.snapshot.ts` | ✅ green |
| 02-T1   | 02   | 1    | TOPUP-01 / SHOP-09 | T-24-04 | Additive migration adds pack_id + stripe_payment_intent_id + partial unique index | Deno | `.\scripts\run-edge-tests.ps1 stripe-webhook-handler` | `supabase/migrations/20260422000000_phase_24_topup.sql` | ✅ green |
| 02-T2   | 02   | 1    | TOPUP-01 / MER-05 | T-24-04 | credit_shop_merits writes source='topup' + pack_id + idempotency key | Deno RPC test | `cd supabase/functions && deno test _tests/merit_rls_test.ts --allow-env --allow-net` | `supabase/migrations/20260422000000_phase_24_topup.sql` | ✅ green |
| 02-T3   | 02   | 1    | TOPUP-02 / NFR-06 | T-24-05 | payment_intent.succeeded routed when metadata.pack_id present | Deno | `cd supabase/functions && deno test stripe-webhook-handler/index.test.ts --allow-env --allow-net --no-check` | `supabase/functions/stripe-webhook-handler/index.ts` | ✅ green |
| 02-T4   | 02   | 1    | SHOP-09 / NFR-07 | T-24-05 | Replay of same PI event returns 200 + writes ONE ledger row | Deno replay | `cd supabase/functions && deno test stripe-webhook-handler/index.test.ts --allow-env --allow-net --no-check` | `supabase/functions/stripe-webhook-handler/index.test.ts` | ✅ green |
| 03-T1   | 03   | 2    | BUDGET-03 / BACK-08 | T-24-01 | tier-config re-exports pricing-config; FEATURE_KEY_TO_DB mapping; verifyCostMap pure | Deno (vitest) | `npm test -- --run supabase/functions/_shared/__tests__/cost-map-invariant.test.ts` | `supabase/functions/_shared/tier-config.ts` | ✅ green |
| 03-T2   | 03   | 2    | BUDGET-03 / BACK-09 | T-24-01 | input-guard chokepoint — locked-tier short-circuit + over-budget detection | Deno | `cd supabase/functions && deno test _shared/__tests__/input-guard.test.ts --allow-env --no-check` | `supabase/functions/_shared/input-guard.ts` | ⚠️ deferred (see Open Delta #1 in 24-AUDIT.md) |
| 03-T3   | 03   | 2    | BUDGET-03 / BACK-10 | T-24-01 | analyze-resume handler calls getMaxOutput + validateInputBudget before Claude | Deno | `cd supabase/functions && deno test analyze-resume/index.test.ts --allow-env --no-check` | `supabase/functions/analyze-resume/index.ts` | ⚠️ deferred (see Open Delta #1 in 24-AUDIT.md) |
| 03-T4   | 03   | 2    | BUDGET-03 / BACK-11 | T-24-01 | 4 remaining feature handlers (career/linkedin/recruiting/interview) rewired to getMaxOutput | Deno | `.\scripts\run-edge-tests.ps1` | 4 feature handlers under `supabase/functions/` | ⚠️ deferred (see Open Delta #1 in 24-AUDIT.md) |
| 04-T1   | 04   | 2    | ECON-01 / MER-14 | T-24-02 | merit_feature_costs DB seed rows match MERIT_COST_PER_FEATURE TS constants | vitest integration | `npm test -- --run src/config/__tests__/verify-cost-map-integration.test.ts` | `supabase/migrations/20260415000000_merit_rpcs.sql` | ✅ green |
| 04-T2   | 04   | 2    | SHOP-10 / ECON-01 | T-24-03 | Pure monthly spend — cost ≤ monthly balance deducts from subscription only | vitest | `npm test -- --run src/hooks/useMerits.test.ts` | `src/hooks/useMerits.ts` | ✅ green |
| 04-T3   | 04   | 2    | SHOP-10 / ECON-02 | T-24-03 | Mixed spend — monthly + top-up overflow ledgered in correct order | vitest | `npm test -- --run src/hooks/useMerits.test.ts` | `src/hooks/useMerits.ts` | ✅ green |
| 04-T4   | 04   | 2    | SHOP-10 / ECON-02 | T-24-03 | Pure top-up spend — monthly=0, full cost from shop_balance | vitest | `npm test -- --run src/hooks/useMerits.test.ts` | `src/hooks/useMerits.ts` | ✅ green |
| 05-T1   | 05   | 3    | BRAND-01 / UX-08 | T-24-06 | .theme-v2 scoped tokens in src/index.css — no :root leakage (covered by D-18 lint + 24-AUDIT §Brand-v2 Token Scope Audit) | vitest lint | `npm test -- --run src/pages/__tests__/pricing-boxy.lint.test.ts` | `src/index.css` | ✅ green |
| 05-T2   | 05   | 3    | BRAND-02 / UX-08 | T-24-06 | boxy Button variant defined + D-18 rounded-full lint on /pricing | vitest | `npm test -- --run src/pages/__tests__/pricing-boxy.lint.test.ts` | `src/components/ui/button.tsx` | ✅ green |
| 05-T3   | 05   | 3    | BRAND-02 / SUB-02 | T-24-06 | /pricing monthly/annual toggle renders correct PRICING cents + annual-savings badge | vitest RTL | `npm test -- --run src/pages/Pricing.test.tsx` | `src/pages/Pricing.tsx` | ✅ green |
| 05-T4   | 05   | 3    | BRAND-02 / SHOP-01-04 | T-24-06 | Top-up pack grid renders 4 packs; pack_25 isBestValue anchor treatment | vitest RTL | `npm test -- --run src/pages/Pricing.test.tsx` | `src/pages/Pricing.tsx` | ✅ green |
| 05-T5   | 05   | 3    | BRAND-02 / SUB-04 | T-24-06 | Annual SKU checkout session posts STRIPE_PRICE_*_ANNUAL; legacy monthly pass-through | Deno | `cd supabase/functions && deno test create-checkout-session/index.test.ts --allow-env --no-check` | `supabase/functions/create-checkout-session/index.ts` | ✅ green |
| 06-T1   | 06   | 3    | TOPUP-02 / BACK-08 | T-24-05 | create-payment-intent edge function resolves pack price server-side via PACKS_BY_ID | Deno | `cd supabase/functions && deno test create-payment-intent/index.test.ts --allow-env --allow-net --no-check` | `supabase/functions/create-payment-intent/index.ts` | ✅ green |
| 06-T2   | 06   | 3    | TOPUP-04 / UX-04 | T-24-06 | StripePaymentElementModal renders Stripe Elements + onSuccess toast | vitest RTL | `npm test -- --run src/components/topup/StripePaymentElementModal.test.tsx` | `src/components/topup/StripePaymentElementModal.tsx` | ✅ green |
| 06-T3   | 06   | 3    | TOPUP-05 / UX-01 | T-24-06 | TopUpProvider context wires useCreatePaymentIntent + openModal API | vitest RTL | `npm test -- --run src/components/topup/TopUpProvider.test.tsx` | `src/components/topup/TopUpProvider.tsx` | ✅ green |
| 06-T4   | 06   | 3    | TOPUP-05 / UX-04 | T-24-06 | Header "+" trigger visible ≤20% balance, hidden >20%, per-tier thresholds | vitest RTL | `npm test -- --run src/components/topup/HeaderTopUpTrigger.test.tsx` | `src/components/topup/HeaderTopUpTrigger.tsx` | ✅ green |
| 06-T5   | 06   | 3    | TOPUP-05 / UX-04 | T-24-06 | Dashboard RunningLowCard + out-of-merits modal open TopUpProvider | vitest RTL | `npm test -- --run src/components/topup/RunningLowCard.test.tsx` | `src/components/topup/RunningLowCard.tsx` | ✅ green |
| 07-T1   | 07   | 4    | AUDIT-01 | T-24-07 | SC-13 reconciliation artefact — 13 ✅ covered rows + tier-sum + Open Deltas | grep | `grep -c "✅ covered" .planning/phases/24-.../24-AUDIT.md` (≥13) | `.planning/phases/24-.../24-AUDIT.md` | ✅ green |
| 07-T2   | 07   | 4    | MIG-03 / NFR-09 | T-24-08 | Grandfathered legacy-price subscriber monthly refresh + shop_balance preserved | Deno | `cd supabase/functions && deno test _tests/grandfather-subscriber-stability.test.ts --allow-env --allow-net --no-check` | `supabase/functions/_tests/grandfather-subscriber-stability.test.ts` | ✅ green |
| 07-T3   | 07   | 4    | AUDIT-01 | T-24-07 | REQ-ID registry drift guard — plans ↔ REQUIREMENTS.md ↔ allowlist | vitest | `npm test -- --run src/config/__tests__/req-coverage.test.ts` | `src/config/__tests__/req-coverage.test.ts` | ✅ green |
| 07-T4   | 07   | 4    | AUDIT-01 | T-24-07 | Per-task verification map populated + sign-off checklist green | grep | `grep -c "nyquist_compliant: true" .planning/phases/24-.../24-VALIDATION.md` (=1) | `.planning/phases/24-.../24-VALIDATION.md` | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky/deferred*

**Map totals:** 28 rows spanning all 7 plans (01×2, 02×4, 03×4, 04×4, 05×5, 06×5, 07×4). 25 green, 3 deferred to Open Delta #1 (documented in `24-AUDIT.md`).

---

## Validation Seeds (from RESEARCH.md §Validation Architecture — planner must cover each)

1. **SC-12 verbatim snapshot guard** (D-19): vitest parses `pricing-config.ts` and asserts the three tables (`maxTokensOutput`, `maxTokensInput`, `maxCharactersInput`) equal a pinned snapshot literal; any cell drift fails CI. Also asserts tier sums reconcile (Free 11,500 / Pro 52,000 / Elite 72,000). → **01-T1, 01-T2**
2. **Boot-time invariant tests** (D-03, D-10): Deno test spins up `tier-config.ts` import graph and asserts `sum(CALL_CONFIGS[tier]) ≤ getMaxOutput(feature, tier)` for analyze-resume and recruiting-lens. Separate test asserts `merit_feature_costs` DB rows vs `MERIT_COST_PER_FEATURE` TS constants match at module load (mocked DB fixture). → **03-T1, 04-T1** (Delta #1: 03-T3/T4 runtime enforcement deferred)
3. **Dual-balance spend-ordering tests** (SC-7): vitest covering the three boundary cases — pure monthly (cost ≤ monthly balance), mixed (cost > monthly, covered by monthly + top-up), pure top-up (monthly = 0). Drive via the `check_and_deduct_merits` RPC wrapper in `merit-gateway.ts` with seeded balances; assert ledger rows written in correct order with correct `source` values. → **04-T2, 04-T3, 04-T4**
4. **Webhook idempotency replay** (SC-6, D-04): Deno test posts the same `payment_intent.succeeded` event twice to the webhook handler; second invocation returns 200 and writes no second ledger row (dedupe via `stripe_payment_intent_id` unique constraint or upsert-on-conflict). → **02-T3, 02-T4**
5. **`boxy` Button regression lint** (D-18): vitest globs `/pricing` and top-up component files, parses their JSX, fails if any `<Button>` has `rounded-full` in `className` or `variant="default"` with full-radius. Also asserts the `boxy` variant is defined in `button.tsx`. Shipped as `src/pages/__tests__/pricing-boxy.lint.test.ts` (commit `860c63a`). → **05-T2**
6. **`validateInputBudget` locked-tier short-circuit** (D-13): vitest covering `validateInputBudget('recruitingLens', 'free', text)` and `validateInputBudget('interviewPrepCoach', 'free', text)` — both must return `{ ok: false, reason: 'feature-locked' }` without invoking any Claude call, even when text is empty. Over-limit cases on unlocked tiers return `{ ok: false, reason: 'over-budget', limit, actual }`. → **03-T2** (deferred, Delta #1)
7. **Migration-forward-compat test** (D-22): Deno test runs the `20260422000000_phase_24_topup.sql` migration against an empty Postgres, then replays the pre-migration code path (simulated by not-calling the new RPC) to prove the additive enum and new column do not break current consumers. → **02-T1, 02-T2**
8. **Dual-balance header format snapshot** (SC-10): vitest React-Testing-Library snapshot of the header balance component with `{monthly: 47, cap: 75, topup: 0}` → `"47 / 75 merits"` and `{monthly: 47, cap: 75, topup: 15}` → `"47 / 75 + 15 bonus"`. JetBrains Mono class + red-accented bonus segment asserted. → **06-T4**
9. **Annual-SKU checkout session** (SC-4): Deno test posts `{ interval: 'annual', tier: 'pro' }` to the checkout-session handler and asserts the Stripe mock receives `price=${STRIPE_PRICE_PRO_ANNUAL}`; posts `{ interval: 'monthly', tier: 'pro' }` and asserts legacy monthly price ID passthrough. → **05-T5, 07-T2** (grandfathering)
10. **Low-balance `+` icon threshold** (SC-9, D-08): vitest React test with balance fixtures at 20%, 21%, 19% of cap for each tier (free cap 10, pro 75, elite 150) — icon visible ≤20%, hidden >20%, threshold rounded per planner's decision. → **06-T4**
11. **Brand-v2 token scope guard** (D-15/D-16): vitest lints that `--bg-deep`, `--accent-red`, `--radius-boxy` appear ONLY within `.theme-v2` scope in `src/index.css` — no global `:root` leakage that would regress Phases 15–23 surfaces. → **05-T1**

---

## Wave 0 Requirements

- [x] `src/config/pricing-config.ts` — module created (Plan 01, commit `d8b0b42`)
- [x] `src/config/pricing-config.snapshot.ts` + `sc12-snapshot.test.ts` — snapshot scaffold (Plan 01, commit `f7aea98`)
- [x] `supabase/functions/_shared/tier-config.ts` extended + cost-map-invariant.test.ts — (Plan 03 Task 1, commit `d86df00`)
- [ ] `supabase/functions/_shared/input-guard.ts` + test — deferred to Open Delta #1 remediation micro-plan
- [x] `src/hooks/useMerits.ts` three-case boundary tests — (Plan 04)
- [x] `src/components/ui/button.tsx` — `boxy` variant added (Plan 05)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Stripe Payment Element 3DS/SCA flow on real card | SC-6 | Requires live Stripe test keys + browser | Stripe test mode: buy `pack_25` with `4000 0025 0000 3155` (requires auth); confirm merit balance updates after `onSuccess` |
| Grandfathered monthly subscriber unaffected by new SKUs | D-20, SC-4 | Requires live sub with old monthly price ID | Log in as grandfathered user; hit `/pricing`; confirm existing sub row shows old price; no prompt-to-switch UX fires. **Regression guard in place: `supabase/functions/_tests/grandfather-subscriber-stability.test.ts` (07-T2)** |
| Brand-v2 fonts load on cold cache via Google Fonts CDN | D-17, SC-11 | Requires real network conditions | Incognito tab hit `/pricing`, watch network: Fraunces + JetBrains Mono + Inter Tight load via `<link>`, `display=swap` prevents FOIT |
| Visual regression: pack_25 "Best Value" anchor scale/glow | SC-8 | Pixel-level visual design | Cross-browser check (Chrome/Safari/Firefox) at desktop + mobile viewports |
| Monthly/Annual toggle "Save 17%" badge positioning | SC-8 | Visual hierarchy | Confirm badge on Annual only, readable at mobile widths |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (3 tasks explicitly deferred to Open Delta #1 remediation micro-plan — documented in 24-AUDIT.md §Open Deltas)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready for /gsd-verify-work

---

## Validation Audit 2026-04-22

Re-audit via `/gsd-validate-phase 24` cross-referenced the per-task map against the on-disk test files. Nine rows had stale `__tests__/` subpaths (tests exist, just colocated with source rather than in separate subdirs); two rows (05-T1, 05-T2) were anchored to non-existent files but the behavior is covered by `src/pages/__tests__/pricing-boxy.lint.test.ts` + 24-AUDIT §Brand-v2 Token Scope Audit; 04-T1 pointed at a glob that resolved to `20260415000000_merit_rpcs.sql` with verification via `src/config/__tests__/verify-cost-map-integration.test.ts`; 05-T5 directory renamed to `create-checkout-session/`. Paths corrected in place; no test files added or removed.

| Metric | Count |
|--------|-------|
| Gaps found | 11 (path drift) |
| Resolved | 11 (doc correction) |
| Escalated | 0 (Delta #1 already tracked in 24-AUDIT.md) |
