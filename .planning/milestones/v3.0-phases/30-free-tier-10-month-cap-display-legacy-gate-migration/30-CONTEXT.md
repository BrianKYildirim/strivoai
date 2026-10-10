# Phase 30: Free Tier 10/Month + Cap Display + Legacy Gate Migration - Context

**Gathered:** 2026-05-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Reconcile production Free-tier reality (5 lifetime, no reset) with v3.0 spec (10 monthly replenishing), simplify the header merit-balance display so users see a single `total / cap` value, and remove duplicate `can_perform_ai_action` gating so the merit gateway (Phase 29 substrate) is the single decision point for all AI-feature access.

**Phase 30 delivers:**

1. **DB:** `auto_provision_user_merits` trigger grants 10 subscription merits (was 5) with `subscription_reset_date = next anniversary of profile.created_at`. (MER-01)
2. **DB:** Backfill existing Free users to `subscription_balance = GREATEST(10, subscription_balance)` with `lifetime_granted += delta`; backfill `subscription_reset_date` to next anniversary of `profile.created_at`. (MER-01)
3. **DB:** Drop `free_tier_noop` short-circuit in `reset_subscription_merits` RPC; add free arm that SETS `subscription_balance = 10` (does not add). `reset-subscription-merits` edge function expands cron filter to include `'free'`. (MER-02, MER-09)
4. **Frontend:** `MeritBalanceHeaderV2` trigger renders single value `{subscription+shop} / {cap}` (e.g. `78 / 75`). Bonus chip removed from trigger; popover body retains the subscription/shop breakdown. `isLow` / `isZero` computed on `total = subscription + shop`. (MER-11 — amended per D-17)
5. **Frontend:** `usePaywallGuard` and `useTierAccess` migrated off `can_perform_ai_action` RPC; both consume `useMerits` / `get_merit_balance`. (MER-12)
6. **Backend:** Rip `analyze-resume/index.ts` legacy branch (lines 743+) gated by `MERIT_SYSTEM_ENABLED`. Remove `readMeritFlag` / `MERIT_SYSTEM_ENABLED` from `merit-gateway.ts`. Update `test-07.test.ts` Test 4 + delete/rewrite `legacy-unchanged.test.ts`. (MER-12, extended scope)
7. **Docs:** Update `REQUIREMENTS.md` MER-11 wording + `ROADMAP.md` Phase 30 Success Criteria #3 to drop "bonus chip retained" language (per D-17). Update `PROJECT.md` "Current State" + `STATE.md` "Accumulated Context" so Free-tier description reflects the new 10-monthly-replenishing reality.

**Out of scope for Phase 30:**
- Optimistic UI deduct (Phase 31, MER-03)
- Refund verification (Phase 31, MER-05/06)
- Above-cap shop credit / Stripe race (Phase 32, MER-07/08)
- Webhook idempotency regression (Phase 32, MER-10)
- Pricing/billing page UI (Phase 33)
- Dropping `can_perform_ai_action` SQL function (deferred — see Deferred Ideas)
- Dropping `usage_tracking` table (deferred — interim step per MER-12 wording)

</domain>

<decisions>
## Implementation Decisions

### Free signup + backfill (MER-01)

- **D-01:** `auto_provision_user_merits` trigger inserts new Free users with `subscription_balance = 10`, `shop_balance = 0`, `lifetime_granted = 10`, `subscription_reset_date = (now() at the time of insert) + interval matching next anniversary of created_at` (effectively `now() + interval '1 month'` for fresh signups since `created_at = now()`). Signup-grant ledger row written with `amount = 10`, `balance_type = 'grant'`, `source = 'signup-grant'`.
- **D-02:** Backfill existing Free users with **set-to-10-if-currently-below**: `UPDATE user_merits SET subscription_balance = GREATEST(10, subscription_balance), lifetime_granted = lifetime_granted + (GREATEST(10, subscription_balance) - subscription_balance), subscription_reset_date = <next anniversary>, updated_at = now() WHERE user_id IN (SELECT id FROM profiles WHERE subscription_tier = 'free')`. Heavy users who burned their 5 → land at 10. Untouched users at 5 → land at 10. No one falls behind; no windfall above the new cap.
- **D-03:** Ledger row written per backfilled user: `INSERT INTO merit_transactions (user_id, amount, balance_type, source, ...) VALUES (uid, delta, 'grant', 'phase-30-free-backfill', ...)` where `delta = (new_balance - old_balance)`. Preserves the MER-12 reconciliation invariant (`balance_sum = transactions_sum`, drift = 0) verified by `reconcile_merit_balance`. Users where delta=0 still get an audit marker with `amount = 0` (mirrors `phase-12-backfill` convention) so the cohort is queryable.
- **D-04:** First `subscription_reset_date` = **next occurrence of `profile.created_at`'s day-of-month**, even if <30 days away. Strict anniversary semantics; matches subscription-billing-style "your renewal day" UX; spreads cron load naturally across the calendar month. Edge case (created 15th, backfill ships 16th → first reset ~30 days away, fine). Edge case (created 17th, backfill ships 16th → first reset tomorrow → set-to-10 no-op on next cron tick → acceptable because backfill already gave them 10).
- **D-05:** Day-of-month overflow handling: if `created_at` day-of-month is 29/30/31 and the next reset month is shorter (Feb), clamp to last day of target month (Feb 28/29). Implemented via `date_trunc('month', target) + interval '1 month' - interval '1 day'` pattern OR using `make_date` with a try/clamp. Planner picks the SQL idiom that reads cleanest.

### Free monthly reset behavior (MER-02, MER-09)

- **D-06:** Drop the `IF p_tier = 'free' THEN RETURN ... 'free_tier_noop'` short-circuit at `supabase/migrations/20260415000000_merit_rpcs.sql:382-385`. Add a `'free'` arm to the tier→cap CASE: `WHEN 'free' THEN 10`. Same SET-not-add semantics as Pro/Elite (MER-09 — user at 10/10 who triggers replenishment receives no additional merits, balance set to 10).
- **D-07:** `reset-subscription-merits` edge function (`supabase/functions/reset-subscription-merits/index.ts:70`) expands cron filter from `IN ('pro','elite')` to `IN ('free','pro','elite')`. Same `BATCH_SIZE = 1000`, same 15-min cron cadence (`*/15 * * * *`). No new pg_cron job — Free reuses the existing `reset-subscription-merits-sweep` schedule. If Free volume eventually requires throttling, that's a future-phase concern.
- **D-08:** `addOneMonthIso` from `_shared/date-utils.ts` continues to advance `subscription_reset_date` by one month per tick. Verify it handles the same day-of-month overflow edge case as D-05; if not, fix in the same migration. Planner reads `date-utils.ts` to confirm.

### Cap display (MER-11 — overrides spec wording per D-17)

- **D-09:** `MeritBalanceHeaderV2` trigger label renders **single value** `{subscription + shop} / {cap}` with no bonus chip. Examples: Pro 75 sub + 3 shop → `78 / 75 merits`; Free 8 sub + 0 shop → `8 / 10 merits`; Pro 0 sub + 3 shop → `3 / 75 merits`. Trigger button is monolithic — no conditional chip rendering branches.
- **D-10:** Popover body keeps the existing subscription/shop breakdown (`Monthly (this cycle)`, `Top-up (never expire)`, `Total available`, reset date, quick links). Bonus visibility lives entirely in the popover, not the trigger.
- **D-11:** `useMerits.isLow` and `useMerits.isZero` redefined to operate on `total = subscription + shop`, not `subscription` alone. `isLow := cap > 0 && total / cap <= 0.2`; `isZero := total <= 0`. Reasoning: the displayed value is `total/cap`, so warning state must match the displayed number. Existing `MeritBalanceHeaderV2` low/zero color rules (destructive/amber) stay structurally — they now correctly trigger when the displayed value is depleted.
- **D-12:** `aria-label` updates to single-value semantics: `Merit balance: {total} of {cap} merits` (drop the `, plus {shop} bonus top-up merits` clause since chip is gone). Screen-reader users get the same primary information as sighted users.

### Legacy gate migration (MER-12 + extended scope)

- **D-13:** `usePaywallGuard.ts:51` rewritten to consume `useMerits()` instead of `supabase.rpc('can_perform_ai_action')`. New return shape: `canAnalyze` ← `useMerits().total > 0` AND `tier` resolved via existing profile fetch (or via `useMerits().tier` which already does this). `analysisCount` and `limit` derived from `useMerits` (`limit = cap`, `analysisCount = cap - subscription` for Free or proxy via ledger); `resetDate ← useMerits().resetDate`; `isLifetimeLimit ← false` (no tier has lifetime limits post-MER-01). Hook signature stays the same so call-sites (Upload.tsx, RecruitingLens.tsx, InterviewPrep.tsx) need no edits.
- **D-14:** `useTierAccess.ts:71-73` rewritten similarly. `realTier` ← `useMerits().tier`; `canUseCredits` ← `useMerits().total > 0`; `usageInfo` derived from `useMerits`. Admin tier test override (`AdminTierTestContext`) preserved verbatim — the `getEffectiveTier`/`isAdmin`/`testTier` logic at lines 96-115 stays. Hook signature stays the same so PricingTable, Dashboard, Shop, and useFeatureGate need no edits.
- **D-15:** Rip the analyze-resume legacy branch (`supabase/functions/analyze-resume/index.ts:743-781+`) and the `MERIT_SYSTEM_ENABLED` env-var gating at the D-06 branch guard (`if (MERIT_SYSTEM_ENABLED && userContext)`). The merit path becomes unconditional. Remove `readMeritFlag` export and `MERIT_SYSTEM_ENABLED` constant from `supabase/functions/_shared/merit-gateway.ts`. Also remove the `createUsageLimitResponse` helper if it has no remaining callers (planner greps and decides).
- **D-16:** Update tests: `supabase/functions/analyze-resume/test-07.test.ts` Test 4 (`MERIT_SYSTEM_ENABLED=false -> legacy path`) is replaced by a positive assertion that the merit path is unconditional (e.g. assert source contains `withMerits(` and does NOT contain `MERIT_SYSTEM_ENABLED`). `supabase/functions/analyze-resume/legacy-unchanged.test.ts` deleted (its premise no longer holds). `supabase/functions/analyze-resume/test-07.test.ts` Tests 1/2/3 (sync flow, retry refund, idempotent refund) preserved — they exercise the merit path, not the legacy path.

### Spec amendment for MER-11 (recorded in CONTEXT.md so the conflict isn't accidental)

- **D-17:** This phase **overrides** the "bonus chip retained as a secondary indicator" wording in `REQUIREMENTS.md` MER-11 and `ROADMAP.md` Phase 30 Success Criteria #3. The bonus chip is dropped from the header trigger entirely (per D-09). Planner MUST include a doc-update plan that edits both files to remove the contradictory wording, alongside the implementation work. Commit message for the doc-edit plan: `docs(30): amend MER-11 wording — drop bonus chip from header trigger`.

### Claude's Discretion

- Migration filenames/numbering. Phase 29's pattern of one concern per migration (`*_merit_free_signup_grant.sql`, `*_merit_free_backfill.sql`, `*_merit_free_arm_reset_rpc.sql`) is the established convention; planner can collapse if cohesion warrants. NFR-01 (rollback per migration) preserved either way.
- Whether to write a Deno test or a pgTAP test for the free backfill (no pgTAP runner in CI yet per Phase 29 note — Deno test against seeded fixtures is the safe default).
- Whether the `useTierAccess` `TIER_LIMITS` constant (which currently lists `free: 3, pro: 100, elite: 300` — stale numbers!) gets corrected in this phase or deleted entirely since `MERITS_PER_MONTH` in `pricing-config.ts` is the new source of truth. Recommendation: delete `TIER_LIMITS` and have `useTierAccess` read from `MERITS_PER_MONTH` directly. Planner picks.
- Exact `usageInfo.used` / `analysisCount` derivation in the hook rewrites. Options: `cap - subscription` (proxy), aggregate `merit_transactions` where `source = 'feature-deduct'` within current cycle (accurate but adds a query), or drop the field if no caller reads it (grep first). Planner picks.
- Whether `useMerits` query staleTime (currently 5000ms) needs adjustment now that two more hooks depend on it. Recommendation: leave alone; React Query coalesces.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements + roadmap (source of truth — with D-17 amendment scope)
- `.planning/REQUIREMENTS.md` — full v3.0 spec; Phase 30 owns MER-01, MER-02, MER-09, MER-11, MER-12. **MER-11 wording amended this phase per D-17 — see implementation plan.**
- `.planning/ROADMAP.md` Phase 30 row + Success Criteria — phase scope + dependencies (depends on Phase 28; blocks Phases 31, 32, 33). **SC #3 wording amended this phase per D-17.**
- `.planning/PROJECT.md` "Current State" — Free-tier description currently says 5 lifetime; must be updated to 10 monthly replenishing post-Phase 30.
- `.planning/STATE.md` "Accumulated Context" — likewise must be updated for v3.0 Free reality.

### Codebase intel (current state)
- `.planning/codebase/ARCHITECTURE.md` — merit system layout, cap display, tier access posture.
- `.planning/codebase/CONVENTIONS.md` — naming + migration patterns Phase 30 follows.
- `.planning/codebase/STRUCTURE.md` — where the affected files sit.

### Carry-forward from prior phases
- `.planning/phases/29-foundation-infrastructure/29-CONTEXT.md` D-01..D-16 — merit gateway is the single decision point; `withMerits` is the only call from feature code; service-role-only writes; one-concern-per-migration with rollback (NFR-01). Phase 30 honors all of these.
- `.planning/phases/28-merge-redeploy-baseline/28-CONTEXT.md` — Phase 28 shipped 2026-05-11; `by/env-fixes` merged, clean prod/staging baseline. Phase 30 builds on this.

### DB substrate to modify
- `supabase/migrations/20260414000000_merit_ledger_foundation.sql:115-151` — `auto_provision_user_merits` trigger + initial backfill (hardcodes `5, 0, 5, NULL, false`). Phase 30 ships a new migration that updates the trigger function and runs a second backfill for `subscription_balance` + `lifetime_granted` + `subscription_reset_date`.
- `supabase/migrations/20260415000000_merit_rpcs.sql:382-385` — `free_tier_noop` short-circuit in `reset_subscription_merits`. Phase 30 ships a new migration that replaces this RPC (CREATE OR REPLACE) with a free arm.
- `supabase/migrations/20260415000001_phase_12_stripe_products_webhook.sql:115-139` — existing `reset-subscription-merits-sweep` pg_cron job. Phase 30 reuses this schedule (no new cron job).
- `supabase/migrations/20260416000000_merit_enforcement_observability.sql` — observability layer; verify Free-arm reset rows are not flagged as anomalies.

### Backend code to modify
- `supabase/functions/reset-subscription-merits/index.ts:70` — `IN ('pro','elite')` filter expands to include `'free'`. `supabase/functions/reset-subscription-merits/index.test.ts` — add Free-tier test case.
- `supabase/functions/analyze-resume/index.ts:743+` — legacy branch to delete. Verify by grep that nothing else in the function references `can_perform_ai_action` or `createUsageLimitResponse` after deletion.
- `supabase/functions/_shared/merit-gateway.ts` — `readMeritFlag` export + `MERIT_SYSTEM_ENABLED` constant deleted. Verify no other callers via `grep -rn 'MERIT_SYSTEM_ENABLED\|readMeritFlag' supabase/`.
- `supabase/functions/_shared/date-utils.ts` — `addOneMonthIso`; verify day-of-month overflow handling matches D-05.
- `supabase/functions/analyze-resume/test-07.test.ts:445-491` (Test 4) — replace with merit-only assertions.
- `supabase/functions/analyze-resume/legacy-unchanged.test.ts` — delete.

### Frontend code to modify
- `src/components/topup/MeritBalanceHeaderV2.tsx:42-62` — trigger label rewrite per D-09.
- `src/components/topup/MeritBalanceHeaderV2.test.tsx` — update snapshot / assertions.
- `src/hooks/useMerits.ts:60-86` — `isLow` / `isZero` redefined per D-11; signature unchanged.
- `src/hooks/usePaywallGuard.ts:51` — full rewrite per D-13.
- `src/hooks/useTierAccess.ts:71-73` — full rewrite per D-14; `TIER_LIMITS:39-43` per Claude's discretion.
- `src/config/pricing-config.ts:31-33` — `MERITS_PER_MONTH` already has `free: 10` (no change). New source of truth for caps.

### Reusable substrate (do NOT modify)
- `supabase/functions/_shared/merit-gateway.ts` `withMerits` — only the `MERIT_SYSTEM_ENABLED` flag goes away; gateway contract unchanged.
- `supabase/functions/_shared/auth.ts` — `requireAuth` / `requireInternalOrUserAuth` — unchanged.
- `src/contexts/AdminTierTestContext.tsx` — admin tier override — unchanged; hook rewrites preserve `getEffectiveTier` integration.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`useMerits` hook** (`src/hooks/useMerits.ts`): single source of truth for balance/cap/tier post-rewrite. `MERITS_PER_MONTH[tier]` already has Free at 10. `usePaywallGuard` and `useTierAccess` both consume it post-D-13/D-14.
- **`reset_subscription_merits` RPC** (`supabase/migrations/20260415000000_merit_rpcs.sql:367-424`): SET-not-add semantics, lock-then-update pattern, ledger-row-with-delta. Free arm reuses this exact shape — just add a CASE branch.
- **`reset-subscription-merits` edge function + pg_cron job** (`supabase/migrations/20260415000001_phase_12_stripe_products_webhook.sql:115-139`): Phase 30 reuses both; only the SQL filter at edge function line 70 changes.
- **`auto_provision_user_merits` trigger** (`supabase/migrations/20260414000000_merit_ledger_foundation.sql:115-139`): pattern for granting + ledger-row in one transaction. Phase 30 updates the constants inside.
- **`reconcile_merit_balance` RPC** (`supabase/migrations/20260415000000_merit_rpcs.sql:436+`): drift-checker. Phase 30 backfill MUST result in drift=0 for every backfilled user. CI/test should assert this.

### Established Patterns
- **One concern per migration, ISO-prefixed** (`20260YYY00000_<name>.sql`) with NFR-01 rollback block. Phase 30 follows Phase 29 D-NN convention; planner decides whether to split the trigger update, the RPC update, the backfill, and the edge-function-test update into separate migrations or collapse.
- **`source` literal naming for backfill ledger rows**: `phase-NN-backfill` (Phase 12 set the precedent at `migrations/20260415000001:198`). Phase 30 uses `phase-30-free-backfill`.
- **Admin tier override via `AdminTierTestContext`**: hooks must preserve `getEffectiveTier(real_tier)` + `isAdmin` + `testTier` integration. Don't break QA's tier-switcher.
- **Test colocation**: `*.test.ts` next to source. Deno for edge, Vitest for frontend.

### Integration Points
- **`useMerits` consumer fan-out**: post-D-13/D-14, three hooks read from the same React Query cache (`['merit-balance', userId]`). Phase 29's `staleTime: 5_000` means coalescing — no triple round-trip on a single render tree.
- **Admin context preservation**: `useTierAccess` calls `useAdminTierTest()`; rewrite must keep this call so tier-test UI keeps working in QA.
- **Anonymous user posture**: both hooks today gracefully degrade to `loading: false, canUseCredits: false` when no user. `useMerits` returns `isLoading: false` only when `userId !== null`. Rewrites must preserve degradation behavior or call-sites (Upload.tsx redirect logic) will misbehave.

</code_context>

<specifics>
## Specific Ideas

- Backfill ledger row source literal: `phase-30-free-backfill` (mirrors Phase 12's `phase-12-backfill` convention).
- Spec amendment commit message: `docs(30): amend MER-11 wording — drop bonus chip from header trigger` (separate from implementation commit so the doc edit is reviewable in isolation).
- Display examples to verify in implementation: `78 / 75 merits` (Pro over cap), `8 / 10 merits` (Free underwater), `3 / 75 merits` (Pro subscription depleted, shop covers it), `0 / 10 merits` (Free fully depleted — destructive color).

</specifics>

<deferred>
## Deferred Ideas

- **Drop `can_perform_ai_action` SQL function.** After Phase 30 kills all 3 callers (usePaywallGuard, useTierAccess, analyze-resume legacy branch), the function is dead code. Defer dropping it for ~30 days of clean prod telemetry to catch any hidden caller (operator scripts, support tooling, external monitor). Future phase: `DROP FUNCTION public.can_perform_ai_action(uuid)`.
- **Drop `usage_tracking` table.** MER-12 wording explicitly calls itself "an interim step" toward full deletion. Defer to a dedicated post-cleanup phase after all read/write call-sites are migrated.
- **Free-tier cron throttling.** Reusing the 15-min `reset-subscription-merits-sweep` schedule with `BATCH_SIZE = 1000` is fine for current Free volume. If Free user count grows past a single-batch-per-tick capacity, split into a slower-cadence Free job or raise the batch size — future-phase concern, not Phase 30.
- **`TIER_LIMITS` constant in `useTierAccess.ts:39-43` has stale numbers** (free: 3, pro: 100, elite: 300). Phase 30 deletes or corrects in passing (per Claude's Discretion); if planner chooses to leave it, mark this as a Phase 31 cleanup item.
- **Anniversary edge case: created on Feb 29.** D-05 clamping covers it but the UX is mildly weird (their "anniversary" shifts to Feb 28 in non-leap years). Acceptable; not worth a dedicated UX surface.

</deferred>

---

*Phase: 30-free-tier-10-month-cap-display-legacy-gate-migration*
*Context gathered: 2026-05-16*
