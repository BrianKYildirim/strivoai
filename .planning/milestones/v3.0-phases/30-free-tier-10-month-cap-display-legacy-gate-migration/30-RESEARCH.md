# Phase 30: Free Tier 10/Month + Cap Display + Legacy Gate Migration — Research

**Researched:** 2026-05-16
**Domain:** Supabase Postgres migration + Deno edge function + React/TypeScript hook refactor
**Confidence:** HIGH (codebase fully grepped; conventions verified against Phase 10/12/29; one CONTEXT-vs-reality scope conflict surfaced)

## Summary

Phase 30 is a coordinated four-surface change: (1) DB substrate to make Free tier 10-monthly-replenishing instead of 5-lifetime, (2) one edge-function-filter expansion + cron reuse, (3) one frontend trigger UI rewrite to single-value `total/cap`, (4) two hook rewrites and one legacy-branch deletion to make the merit gateway the single decision point. Every modified surface has a well-established pattern from Phase 10, 12, or 29 to mirror — there is no greenfield design work. `addOneMonthIso` already implements D-05 clamping correctly (verified via existing Deno tests). `reset_subscription_merits` RPC already has the right SET-not-add shape; the only edit is replacing the `free_tier_noop` short-circuit with a CASE arm.

**The single material conflict** between CONTEXT.md scope and current code state: D-15 directs removing `MERIT_SYSTEM_ENABLED` / `readMeritFlag` from `_shared/merit-gateway.ts`, but 8 other edge functions still import the constant. Phase 30 either (a) expands scope to delete the flag everywhere, or (b) keeps the constant in the gateway and only rips it from `analyze-resume`. This must be resolved before planning.

**Primary recommendation:** Plan three DB migrations (signup trigger update, free backfill, free arm in reset RPC) following Phase 29's one-concern-per-migration convention; one edge function patch with new Deno test; one frontend trigger surgery + two hook rewrites that hold signatures stable; and one doc-amendment plan. Resolve the `MERIT_SYSTEM_ENABLED` blast-radius question first.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** `auto_provision_user_merits` trigger inserts new Free users with `subscription_balance = 10`, `shop_balance = 0`, `lifetime_granted = 10`, `subscription_reset_date = now() + 1 month` (effectively the next anniversary of `created_at`). Signup-grant ledger row written with `amount = 10`, `balance_type = 'grant'`, `source = 'signup-grant'`.

**D-02:** Backfill existing Free users with **set-to-10-if-currently-below**: `UPDATE user_merits SET subscription_balance = GREATEST(10, subscription_balance), lifetime_granted = lifetime_granted + (GREATEST(10, subscription_balance) - subscription_balance), subscription_reset_date = <next anniversary>, updated_at = now() WHERE user_id IN (SELECT id FROM profiles WHERE subscription_tier = 'free')`.

**D-03:** Per-backfilled-user ledger row: `INSERT INTO merit_transactions (user_id, amount, balance_type, source, ...) VALUES (uid, delta, 'grant', 'phase-30-free-backfill', ...)`. Users with delta=0 still get an audit marker `amount = 0`. Reconciliation invariant (`balance_sum = transactions_sum`, drift = 0) preserved.

**D-04:** First `subscription_reset_date` = next occurrence of `profile.created_at`'s day-of-month.

**D-05:** Day-of-month overflow clamps to last day of target month (Feb 28/29 for created-on-29/30/31).

**D-06:** Drop `free_tier_noop` short-circuit at `migrations/20260415000000_merit_rpcs.sql:382-385`. Add `WHEN 'free' THEN 10` to the tier→cap CASE. SET-not-add semantics.

**D-07:** `reset-subscription-merits` edge function filter expands from `IN ('pro','elite')` to `IN ('free','pro','elite')`. Same `BATCH_SIZE = 1000`, same 15-min cron. No new pg_cron job.

**D-08:** `addOneMonthIso` continues to advance `subscription_reset_date` by one month per tick; verify day-of-month overflow handling (already correct — see §Pitfall 1 below).

**D-09:** `MeritBalanceHeaderV2` trigger renders single value `{subscription + shop} / {cap}` with **no bonus chip**.

**D-10:** Popover body keeps existing breakdown (Monthly/Top-up/Total/reset date/quick links).

**D-11:** `useMerits.isLow` and `isZero` redefined to operate on `total = subscription + shop`. `isLow := cap > 0 && total / cap <= 0.2`. `isZero := total <= 0`.

**D-12:** `aria-label` becomes `Merit balance: {total} of {cap} merits` (drop `, plus {shop} bonus top-up merits`).

**D-13:** `usePaywallGuard.ts:51` rewritten to consume `useMerits()`. Public signature unchanged: `canAnalyze`, `tier`, `analysisCount`, `limit`, `resetDate`, `isLifetimeLimit`, `loading`, `modalProps`, `openModal`, `triggerPaywall`, `refresh`. `isLifetimeLimit` permanently `false` post-MER-01.

**D-14:** `useTierAccess.ts:71-73` rewritten to consume `useMerits()`. Public signature unchanged: `tier`, `loading`, `canAccessFeature`, `canUseCredits`, `usageInfo`. `AdminTierTestContext` integration at lines 96-115 preserved verbatim.

**D-15:** Rip analyze-resume legacy branch (`supabase/functions/analyze-resume/index.ts:743-781+`) and the `MERIT_SYSTEM_ENABLED` env-var gate at line 378 (`if (MERIT_SYSTEM_ENABLED && userContext)`). Merit path becomes unconditional. Remove `readMeritFlag` export and `MERIT_SYSTEM_ENABLED` constant from `_shared/merit-gateway.ts`. Also remove `createUsageLimitResponse` helper if no remaining callers (planner greps and decides).

**D-16:** Replace test-07.test.ts Test 4 with positive merit-only assertions. Delete `legacy-unchanged.test.ts`. Preserve test-07 Tests 1/2/3 (sync flow, retry refund, idempotent refund).

**D-17:** This phase overrides "bonus chip retained as a secondary indicator" wording in `REQUIREMENTS.md` MER-11 and `ROADMAP.md` Phase 30 SC #3. Doc-edit plan with commit message `docs(30): amend MER-11 wording — drop bonus chip from header trigger`.

### Claude's Discretion

- Migration filenames/numbering — Phase 29's one-concern-per-migration is established; planner can collapse if cohesion warrants. NFR-01 (rollback per migration) preserved.
- Deno test vs pgTAP for Free backfill — Deno is the safe default (no pgTAP runner in CI).
- `TIER_LIMITS` constant in `useTierAccess.ts:39-43`: delete entirely (recommended — `MERITS_PER_MONTH` from `pricing-config.ts` is source of truth) or correct in-place.
- `usageInfo.used` / `analysisCount` derivation in hook rewrites: options are `cap - subscription` (proxy), aggregate `merit_transactions WHERE source = 'feature-deduct'` in current cycle, or drop the field if no caller reads it. Planner picks after greppping callers.
- `useMerits` staleTime (currently 5000ms) — leave alone.

### Deferred Ideas (OUT OF SCOPE)

- `DROP FUNCTION public.can_perform_ai_action(uuid)` (~30 days clean prod telemetry first).
- `DROP TABLE usage_tracking` (interim step per MER-12 wording).
- Free-tier cron throttling (current 15-min cadence + 1000 batch fine for current volume).
- `TIER_LIMITS` cleanup if planner leaves it in place — mark for Phase 31.
- Anniversary edge case Feb 29 created-on UX shift (acceptable per D-05).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MER-01 | Free tier 5→10 monthly replenishing; signup grants 10; backfill existing Free users to 10 | §Standard Stack (migration #1 + #2); §Code Examples §1 + §2 |
| MER-02 | Free monthly reset cron — `subscription_balance` reset to 10 on anniversary | §Standard Stack (migration #3); §Code Examples §3 (RPC arm + edge filter) |
| MER-09 | Free at 10/10 triggering replenishment receives no additional merits | §Code Examples §3 — `reset_subscription_merits` is SET not ADD; CASE arm inherits this |
| MER-11 | Cap UI displays `{total} / {cap}` where total = subscription + shop, can exceed cap | §Code Examples §4 (`MeritBalanceHeaderV2` rewrite); §Code Examples §5 (`useMerits` isLow/isZero) |
| MER-12 | `usePaywallGuard` + `useTierAccess` migrate off `can_perform_ai_action`; merit gateway becomes single decision point | §Code Examples §6 + §7 (hook rewrites); §Code Examples §8 (analyze-resume legacy branch deletion) |

## Project Constraints (from CLAUDE.md)

- Prefer small, reversible changes over broad rewrites.
- Avoid adding unnecessary abstractions when a single helper suffices.
- Preserve existing TypeScript / React patterns.
- `.planning/` is tracked; never `git add -f` or `git add .`/`-A`.
- All migrations idempotent + rollback documented (NFR-01).
- Edge functions preserve CORS / rate limiting / sanitization / JWT (NFR-05).
- Hook signatures must not break call-sites in the same phase (avoid touching every caller).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Signup grant (10 merits) | Database (trigger) | — | Trigger is the only place that fires on `profiles` INSERT; preserves the Phase 10 D-08 pattern (one-tx grant + ledger). |
| Backfill existing Free users | Database (one-shot DO-block) | — | Single transaction or single migration backfill mirrors Phase 12 D-12 pattern; nowhere else has a clean "iterate over all users" mechanism. |
| Free monthly reset (compute) | Database RPC (`reset_subscription_merits`) | — | RPC owns the SET-not-add + lock + ledger pattern; one tier-CASE arm suffices. |
| Free monthly reset (sweep / cron tick) | Edge function (`reset-subscription-merits`) | Database (pg_cron) | Existing cron + edge worker pattern; only the SQL filter expands. |
| Single-value cap display | Frontend (`MeritBalanceHeaderV2.tsx`) | — | Pure presentation; `useMerits` already exposes `subscription`, `shop`, `cap`, `total`. |
| Paywall + tier-access decisions | Frontend (`useMerits` consumer hooks) | Edge functions (merit gateway via `withMerits`) | Frontend hooks gate UI; backend gateway gates execution. Phase 30 unifies the frontend on `useMerits` so the backend gateway is the single authoritative path. |
| Legacy gate removal | Edge function (`analyze-resume`) + shared gateway (`merit-gateway.ts`) | — | Code path purely in edge layer; no DB or UI consequence. |
| Doc amendment (MER-11 + SC #3) | `.planning/` markdown | — | Doc-only change; separate commit for reviewability per D-17. |

## Standard Stack

### Core (zero new dependencies — this phase uses what's already shipped)

| Library / Tool | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Supabase Postgres | active project | DB substrate for `user_merits`, `merit_transactions`, `profiles` | Already the substrate; this phase only writes a migration set. [VERIFIED: existing migrations] |
| pg_cron | already enabled | 15-min `reset-subscription-merits-sweep` schedule | Reused — no new job. [VERIFIED: `migrations/20260415000001:115-139`] |
| Deno (Supabase Edge Function runtime) | Deno 2+ | `reset-subscription-merits/index.ts` + tests | Existing runtime; only test addition. [VERIFIED: deno.json present] |
| Vitest 1.6.1 | already installed | Frontend hook + component tests | Existing test framework. [VERIFIED: package.json] |
| `@testing-library/react` 14.3.1 | already installed | Hook test rendering | Already used in `MeritBalanceHeaderV2.test.tsx`. [VERIFIED: package.json] |
| `@tanstack/react-query` 5.83.0 | already installed | `useMerits` query cache shared across 3 hooks | Already in `useMerits.ts:32`. [VERIFIED: package.json] |

### Existing helpers being consumed (do NOT modify)

- `MERITS_PER_MONTH` from `src/config/pricing-config.ts:31-35` — already has `{ free: 10, pro: 75, elite: 150 }`. New source of truth for caps. **NOTE:** elite is 150, not 300 (TIER_LIMITS stale value). [VERIFIED: read `pricing-config.ts`]
- `useMerits` from `src/hooks/useMerits.ts` — query key `['merit-balance', userId]`, staleTime 5000ms, returns `{ total, subscription, shop, cap, tier, resetDate, isLow, isZero, isLoading, canAfford }`. [VERIFIED: read `useMerits.ts`]
- `useAdminTierTest` from `src/contexts/AdminTierTestContext.tsx` — `getEffectiveTier`, `isAdmin`, `testTier`. Preserve verbatim in both hook rewrites. [CITED: CONTEXT D-13/D-14]
- `addOneMonthIso` from `supabase/functions/_shared/date-utils.ts` — already clamps day-of-month overflow correctly. [VERIFIED: `date-utils.test.ts` covers Jan 31 → Feb 28, leap year → Feb 29, Mar 31 → Apr 30]
- `reset_subscription_merits` from `migrations/20260415000000_merit_rpcs.sql:367-424` — SET-not-add, locks row, writes ledger row with delta. [VERIFIED: read source]
- `reconcile_merit_balance` from `migrations/20260415000000_merit_rpcs.sql:436-462` — returns `drift = (subscription_balance + shop_balance) - SUM(merit_transactions.amount)`. Must equal 0 for every Free user post-backfill. [VERIFIED: read source]

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Single CREATE OR REPLACE trigger function (D-01) | DROP + CREATE | DROP cascades to dependent objects and forces re-GRANT of permissions; CREATE OR REPLACE preserves grants and is idempotent. **Use CREATE OR REPLACE.** |
| Single-tx UPDATE of all Free users (D-02) | Batched UPDATE in 1000-row chunks | Free tier is the largest cohort but every row touched here also writes one `merit_transactions` row. If row count is small enough that `UPDATE ... FROM (SELECT ... LIMIT N OFFSET) UPDATE`-style batching is unnecessary, a single tx is simpler. **Recommend single tx** with a verification DO-block that RAISE EXCEPTIONs if drift != 0 post-backfill; planner reconsiders if staging row count >50K. (See §Pitfall 4 below.) |
| Three separate migrations (signup trigger / backfill / RPC arm) | One combined migration | Phase 29 set the "one concern per migration" convention to keep rollback granular. **Three migrations** matches NFR-01 expectations. |
| Delete `TIER_LIMITS` constant | Correct it to `{ free: 10, pro: 75, elite: 150 }` | Deletion has zero downstream callers per `useTierAccess.ts` (only line 97 reads it for admin testTier display). Replacing the read with `MERITS_PER_MONTH[testTier]` removes a divergent source of truth. **Recommend delete.** |
| Add a deferred `DROP FUNCTION can_perform_ai_action` | Leave for ~30 days clean telemetry | Deferred per CONTEXT.md `Deferred Ideas`. **No action this phase.** |

**Installation:** No new packages.

## Architecture Patterns

### System Architecture Diagram

```
Free signup
   │
   ▼
profiles INSERT ─► auto_provision_user_merits trigger ─► user_merits row (10/0/10, reset=now+1mo)
                                                       └► merit_transactions (signup-grant, +10)

pg_cron (*/15 min) ─► reset-subscription-merits edge function
                          │
                          ▼
                      SELECT user_merits WHERE reset_date <= now() AND tier IN (free,pro,elite)
                          │
                          ▼
                      reset_subscription_merits RPC (per user)
                          │
                          ├─► UPDATE user_merits SET subscription_balance = 10 (Free) / 75 (Pro) / 150 (Elite)
                          └─► INSERT merit_transactions (subscription-reset, +delta)

Browser
   │
   ▼
Frontend feature page ─► useMerits ──► get_merit_balance RPC
                            │            │
                            ▼            ▼
                  usePaywallGuard / useTierAccess (cache-coalesced read)
                            │
                            ▼
                  canAnalyze, tier, usageInfo, isLow, isZero
                            │
                            ▼
                  MeritBalanceHeaderV2 trigger → "{subscription+shop} / {cap}"

Browser submit
   │
   ▼
analyze-resume edge function ─► withMerits (gateway, unconditional)
                                 │
                                 ├─► check_and_deduct_merits RPC
                                 ├─► invokeAnthropicText
                                 ├─► merge + validate
                                 └─► return / refund on MeritRefundable
```

### Component Responsibilities

| File | Phase 30 change | Phase 30 NON-change |
|------|----------------|----------------------|
| `supabase/migrations/<new>_merit_free_signup_grant.sql` | NEW — `CREATE OR REPLACE` trigger function; constants 5→10; reset_date `now() + interval '1 month'`; ledger amount 5→10 | — |
| `supabase/migrations/<new>_merit_free_backfill.sql` | NEW — one-shot `UPDATE user_merits ... WHERE tier='free'` + `INSERT merit_transactions` ledger; verification DO-block asserts drift=0 | — |
| `supabase/migrations/<new>_merit_free_arm_reset_rpc.sql` | NEW — `CREATE OR REPLACE` `reset_subscription_merits`; drop `free_tier_noop`; add `WHEN 'free' THEN 10` | Rest of function body unchanged |
| `supabase/functions/reset-subscription-merits/index.ts:70` | One line: `.in("profiles.subscription_tier", ["free","pro","elite"])` | Everything else (auth, batch size, cron) |
| `supabase/functions/reset-subscription-merits/index.test.ts` | Add Free-tier test case | Existing tests preserved |
| `supabase/functions/analyze-resume/index.ts` | Delete `MERIT_SYSTEM_ENABLED` import, line-18 logger, line-378 branch guard, lines 743-781+ legacy path | withMerits flow, merge+validate, prompt build all preserved |
| `supabase/functions/_shared/merit-gateway.ts` | Delete `MERIT_SYSTEM_ENABLED` constant + `readMeritFlag` export | `withMerits`, `MeritRefundable`, `isRefundableAnthropicError`, `refundMeritsForJob`, response helpers all preserved |
| `supabase/functions/analyze-resume/test-07.test.ts:445-491` | Replace Test 4 body with merit-only positive assertions | Tests 1/2/3 preserved |
| `supabase/functions/analyze-resume/legacy-unchanged.test.ts` | DELETE entire file | — |
| `supabase/functions/analyze-resume/merit-branch.test.ts` | UPDATE — Test asserts `MERIT_SYSTEM_ENABLED` import existed in legacy state; rewrite to assert merit-gateway import is unconditional, or delete | — |
| `src/components/topup/MeritBalanceHeaderV2.tsx:42-62` | Trigger JSX rewrite (single span, no bonus chip, new aria-label) | Popover body (lines 64-103), state styling logic, isLow/isZero gating preserved |
| `src/components/topup/MeritBalanceHeaderV2.test.tsx` | Rewrite T1 + T2 + T4 + T5 assertions for `{total} / {cap}`; T3/T6/T7 preserved | T3 Skeleton, T6 amber, T7 destructive tests intact (state derivation already mock-driven) |
| `src/hooks/useMerits.ts:60-86` | `isLow` numerator: `subscription/cap` → `total/cap`. `isZero` stays as `total <= 0` (already correct). | Public signature, queryKey, staleTime unchanged |
| `src/hooks/usePaywallGuard.ts:51` | Replace `supabase.rpc('can_perform_ai_action')` with consumption of `useMerits()`. Build `PaywallStatus` from balance + tier + cap + resetDate. `isLifetimeLimit: false`. | Public return shape unchanged |
| `src/hooks/useTierAccess.ts:71-73` | Replace `supabase.rpc('can_perform_ai_action')` with `useMerits()`. Set realTier from `useMerits().tier`. Build `usageInfo` from balance + cap. Delete `TIER_LIMITS` constant. Replace line 97 read with `MERITS_PER_MONTH[testTier]`. | Public return shape, AdminTierTest integration (lines 96-115) preserved |
| `.planning/REQUIREMENTS.md` MER-11 | Drop "Bonus chip retained as secondary indicator." | Rest of MER-11 wording |
| `.planning/ROADMAP.md` Phase 30 SC #3 | Drop "with the bonus chip retained as a secondary indicator." | Rest of SC #3 |
| `.planning/PROJECT.md` Current State | Free-tier description: "5 lifetime" → "10 monthly replenishing" | Rest |
| `.planning/STATE.md` Accumulated Context | Same Free-tier description update | Rest |

### Pattern 1: CREATE OR REPLACE trigger function

**What:** Replace an existing trigger function body in-place. Preserves grants, dependent objects, and trigger bindings.

**When to use:** Updating `auto_provision_user_merits` body (D-01).

**Example:**

```sql
-- Source: existing pattern at supabase/migrations/20260414000000_merit_ledger_foundation.sql:115-133
CREATE OR REPLACE FUNCTION public.auto_provision_user_merits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_merits
    (user_id, subscription_balance, shop_balance, lifetime_granted,
     subscription_reset_date, free_linkedin_scan_used)
  VALUES (NEW.id, 10, 0, 10, (now() + interval '1 month'), false)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.merit_transactions
    (user_id, amount, balance_type, source, feature, metadata)
  VALUES (NEW.id, 10, 'grant', 'signup-grant', NULL, '{}'::jsonb);

  RETURN NEW;
END;
$$;
-- Existing trigger binding (on_profile_created_provision_merits) survives the
-- function replacement — no DROP TRIGGER needed.
```

### Pattern 2: One-shot UPDATE + ledger backfill with drift verification

**What:** UPDATE + INSERT inside a single migration, with a `DO $$ ... RAISE EXCEPTION $$` verification block that rolls back the whole migration if drift != 0.

**When to use:** Free backfill (D-02 + D-03).

**Example:**

```sql
-- Source: pattern from migrations/20260415000001_phase_12_stripe_products_webhook.sql:152-215
-- (Phase 12 used a per-row loop because it called an RPC; Phase 30 can use a single
--  UPDATE because the math is pure SQL.)
DO $backfill$
DECLARE
  v_drift_count integer;
BEGIN
  -- (a) Snapshot old balances into a temp table so we can compute deltas for ledger.
  CREATE TEMP TABLE _phase30_snapshot ON COMMIT DROP AS
  SELECT um.user_id, um.subscription_balance AS old_balance
  FROM public.user_merits um
  JOIN public.profiles p ON p.id = um.user_id
  WHERE p.subscription_tier = 'free';

  -- (b) Bulk UPDATE — single tx, no batching needed unless Free cohort > 50K.
  UPDATE public.user_merits um
  SET subscription_balance = GREATEST(10, um.subscription_balance),
      lifetime_granted     = um.lifetime_granted
                             + (GREATEST(10, um.subscription_balance) - um.subscription_balance),
      subscription_reset_date = (
        -- Strict anniversary semantics with day-of-month clamp.
        -- Uses make_date pattern via date_trunc + interval arithmetic.
        date_trunc('day', (
          SELECT make_date(
            EXTRACT(YEAR FROM now())::int + CASE WHEN now()::date > make_date(
              EXTRACT(YEAR FROM now())::int,
              EXTRACT(MONTH FROM now())::int,
              LEAST(EXTRACT(DAY FROM p.created_at)::int,
                    EXTRACT(DAY FROM (date_trunc('month', now()) + interval '1 month - 1 day'))::int)
            ) THEN 0 ELSE 0 END,
            EXTRACT(MONTH FROM now())::int,
            LEAST(EXTRACT(DAY FROM p.created_at)::int, 28) -- conservative clamp; refine in planning
          ) + CASE WHEN now()::date >= make_date(...) THEN interval '1 month' ELSE interval '0' END
        ))
      ),
      updated_at = now()
  FROM public.profiles p
  WHERE p.id = um.user_id AND p.subscription_tier = 'free';

  -- (c) Ledger rows — one per Free user. Delta = (new - old). amount=0 audit marker
  --     for users already at >= 10 (mirrors phase-12-backfill convention).
  INSERT INTO public.merit_transactions
    (user_id, amount, balance_type, source, feature, metadata)
  SELECT
    um.user_id,
    (um.subscription_balance - s.old_balance) AS amount,
    'grant',
    'phase-30-free-backfill',
    NULL,
    jsonb_build_object('prev_balance', s.old_balance, 'new_balance', um.subscription_balance)
  FROM _phase30_snapshot s
  JOIN public.user_merits um ON um.user_id = s.user_id;

  -- (d) Verification: drift MUST be 0 for every backfilled user.
  SELECT COUNT(*) INTO v_drift_count
  FROM public.user_merits um
  JOIN public.profiles p ON p.id = um.user_id
  WHERE p.subscription_tier = 'free'
    AND (um.subscription_balance + um.shop_balance) <> (
      SELECT COALESCE(SUM(mt.amount), 0)
      FROM public.merit_transactions mt
      WHERE mt.user_id = um.user_id
    );

  IF v_drift_count > 0 THEN
    RAISE EXCEPTION 'Phase 30 backfill drift detected: % users with non-zero drift', v_drift_count;
  END IF;

  RAISE NOTICE 'Phase 30 Free backfill complete; drift verified zero';
END
$backfill$;
```

**Planner note:** the anniversary-date SQL above is illustrative; the planner picks the cleanest idiom (likely a small SQL helper function or inline expression). The verification DO-block is non-negotiable per NFR-01.

### Pattern 3: Tier-CASE arm in `reset_subscription_merits`

**What:** Add one CASE arm; drop the early-return short-circuit.

**Example:**

```sql
-- Source: existing pattern at migrations/20260415000000_merit_rpcs.sql:382-405
CREATE OR REPLACE FUNCTION public.reset_subscription_merits(p_user_id uuid, p_tier text, p_next_reset_date timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER          -- D-15-equivalent guarantee from Phase 11; preserve verbatim
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_balance integer;
  v_old_balance integer;
  v_delta       integer;
BEGIN
  SELECT subscription_balance INTO v_old_balance
    FROM public.user_merits WHERE user_id = p_user_id FOR UPDATE;

  -- Phase 30 D-06: drop free_tier_noop short-circuit; add 'free' arm.
  v_new_balance := CASE p_tier
                     WHEN 'free'  THEN 10
                     WHEN 'pro'   THEN 75
                     WHEN 'elite' THEN 150
                     ELSE NULL
                   END;
  IF v_new_balance IS NULL THEN
    RETURN jsonb_build_object('error', 'invalid_tier');
  END IF;

  v_delta := v_new_balance - v_old_balance;

  UPDATE public.user_merits
    SET subscription_balance    = v_new_balance,
        free_linkedin_scan_used = false,
        subscription_reset_date = p_next_reset_date,
        updated_at              = now()
    WHERE user_id = p_user_id;

  INSERT INTO public.merit_transactions
    (user_id, amount, balance_type, source, feature, metadata)
  VALUES
    (p_user_id, v_delta, 'grant', 'subscription-reset', NULL,
     jsonb_build_object('reset_for_tier', p_tier, 'prev_balance', v_old_balance,
                        'next_reset_date', p_next_reset_date));

  RETURN jsonb_build_object('success', true, 'subscription_balance', v_new_balance, 'delta', v_delta);
END;
$$;
-- GRANTs preserved from existing migration; no new REVOKE/GRANT needed because
-- CREATE OR REPLACE keeps them.
```

Re-issue the `REVOKE ALL ... GRANT EXECUTE ...` block to be safe (idempotent).

### Pattern 4: Single-value cap display

**What:** Replace conditional bonus-chip render with a single `total / cap` span.

**Example:**

```tsx
// Source: rewrite of src/components/topup/MeritBalanceHeaderV2.tsx:42-62
// (D-09 / D-12)
return (
  <Popover>
    <PopoverTrigger asChild>
      <button
        type="button"
        className={`flex items-center gap-2 px-2 py-1 rounded-[--radius-boxy] hover:bg-white/5 transition-colors ${triggerStateClass}`}
        aria-label={`Merit balance: ${subscription + shop} of ${cap} merits`}
      >
        <Gem className="h-4 w-4 text-[--accent-red]" />
        <span className="font-mono text-sm font-medium text-foreground">
          {subscription + shop} / {cap}
        </span>
        <span className="text-xs text-muted-foreground">merits</span>
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" sideOffset={8} className="w-72 p-4">
      {/* Body unchanged — preserves Monthly/Top-up/Total/reset date/quick links */}
      ...
    </PopoverContent>
  </Popover>
);
```

### Pattern 5: `useMerits` isLow / isZero on total

```ts
// Source: src/hooks/useMerits.ts:73 rewrite (D-11)
const total = subscription + shop;
const isLow  = cap > 0 && total / cap <= 0.2;
const isZero = total <= 0;
```

### Pattern 6: `usePaywallGuard` rewrite

```ts
// Source: src/hooks/usePaywallGuard.ts:1-122 rewrite (D-13)
import { useEffect, useState } from 'react';
import { useMerits } from '@/hooks/useMerits';
import { useAdminTierTest } from '@/contexts/AdminTierTestContext';
import { useOutOfMeritsModal } from './useOutOfMeritsModal';

interface PaywallStatus {
  canAnalyze: boolean;
  tier: string;
  analysisCount: number;
  limit: number;
  resetDate: string | null;
  isLifetimeLimit: boolean;   // permanently false post-MER-01
  loading: boolean;
}

export function usePaywallGuard() {
  const { getEffectiveTier } = useAdminTierTest();
  const { total, subscription, cap, tier, resetDate, isLoading } = useMerits();
  const { openModal, modalProps } = useOutOfMeritsModal();

  const status: PaywallStatus = {
    canAnalyze: total > 0,
    tier: getEffectiveTier(tier),
    analysisCount: Math.max(0, cap - subscription),   // proxy; planner may swap for ledger-aggregate
    limit: cap,
    resetDate,
    isLifetimeLimit: false,
    loading: isLoading,
  };

  const refresh = async () => status;     // useMerits owns invalidation via React Query

  const triggerPaywall = (args?: { feature: string; cost: number; balance: number }) => {
    openModal(args ?? { feature: 'Analysis', cost: 0, balance: 0 });
  };

  return { ...status, modalProps, openModal, triggerPaywall, refresh };
}
```

### Pattern 7: `useTierAccess` rewrite preserving admin testTier

```ts
// Source: src/hooks/useTierAccess.ts:45-137 rewrite (D-14)
import { useMerits } from '@/hooks/useMerits';
import { useAdminTierTest } from '@/contexts/AdminTierTestContext';
import { MERITS_PER_MONTH } from '@/config/pricing-config';

export function useTierAccess(): TierAccess {
  const { total, subscription, cap, tier: realTier, resetDate, isLoading } = useMerits();
  const { isAdmin, testTier, getEffectiveTier } = useAdminTierTest();
  const tier = getEffectiveTier(realTier);

  // Admin-test override preserves QA tier-switcher (existing posture, lines 96-115).
  const effectiveLimit = (isAdmin && testTier)
    ? (MERITS_PER_MONTH[testTier as 'free'|'pro'|'elite'] ?? 0)
    : cap;
  const effectiveCanUseCredits = (isAdmin && testTier) ? true : (total > 0);

  return {
    tier,
    loading: isLoading,
    canAccessFeature: (feature: FeatureType) =>
      (TIER_FEATURES[tier] || TIER_FEATURES.free).includes(feature),
    canUseCredits: effectiveCanUseCredits,
    usageInfo: {
      used: Math.max(0, effectiveLimit - subscription),
      limit: effectiveLimit,
      isLifetime: false,
      resetDate,
    },
  };
}
// useFeatureGate unchanged — it consumes useTierAccess return shape only.
```

### Pattern 8: Unconditional merit path in `analyze-resume`

```ts
// Source: rewrite of supabase/functions/analyze-resume/index.ts:376-781 collapse
// (D-15)
//
// BEFORE (line 376-741):
//   === Phase 13 branch (D-06) ===
//   if (MERIT_SYSTEM_ENABLED && userContext) {
//     const meritCtx = ...; const gated = await withMerits(...); return gated.value;
//   }
//   === Legacy path (unchanged) ===
//   const { data: checkResult } = await supabase.rpc('can_perform_ai_action', ...);
//   if (!result.allowed) return createUsageLimitResponse(...);
//   ... rest of legacy path ...
//
// AFTER:
//   if (!userContext) {
//     return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, ... });
//   }
//   const meritCtx = { userId: userContext.userId, tier: resolvedTier, corsType: 'user' as const };
//   const gated = await withMerits(meritCtx, 'resume_analysis', async (_txId) => {
//     ...existing merit-path body lines 380-738 unchanged...
//   });
//   if (!gated.ok) return gated.response;
//   return gated.value;
//
// Imports removed: { createUsageLimitResponse }, MERIT_SYSTEM_ENABLED.
// Module-scope log call at line 18 removed.
// `usageUserId`, `checkResult` variables removed (only used in legacy path).
```

### Anti-Patterns to Avoid

- **DROP + CREATE a trigger function instead of CREATE OR REPLACE.** Loses grants; forces re-binding; breaks Phase 10 D-08 idempotency contract. Use CREATE OR REPLACE.
- **Per-row UPDATE loop in backfill.** A single bulk UPDATE is faster and atomic; only switch to batched loop if staging-side row count testing shows >50K Free users (unlikely).
- **Touching `useMerits` return shape.** Three hooks now consume it; signature drift would force edits to `MeritBalanceHeaderV2`, `usePaywallGuard`, `useTierAccess`, plus 14 call-sites. Hold the shape.
- **Removing `can_perform_ai_action` SQL function.** Deferred. Operator scripts may still call it. Wait 30 days.
- **Removing `usage_tracking` table.** MER-12 calls itself an interim step; full deletion is a separate phase.
- **Inlining `import.meta.env.VITE_*` in hook rewrites.** Phase 30 doesn't introduce env flags; this is a Phase 47 pattern that doesn't belong here.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Day-of-month overflow | A custom JS `addOneMonth` | `addOneMonthIso` from `_shared/date-utils.ts` | Already correct (verified by 5 Deno tests covering Jan 31, leap year, Mar 31). Re-using = zero divergence risk. |
| SET-not-add semantics for free arm | A separate Free-only RPC | Add CASE arm to `reset_subscription_merits` | RPC already locks the row, writes ledger row with delta, returns success/error shape. Mirroring the pattern is 5 lines. |
| Cron job for Free users | New `cron.schedule('free-tier-reset', ...)` | Reuse `reset-subscription-merits-sweep` 15-min schedule | Existing job already calls the edge function; only the SQL filter expands. No new infra. |
| Frontend balance fetch in `usePaywallGuard` / `useTierAccess` | Direct `supabase.rpc('get_merit_balance')` per hook | `useMerits()` consumption | React Query coalesces three subscribers to one round-trip (Phase 29 `staleTime: 5_000`). |
| Tier cap source-of-truth | TIER_LIMITS constant duplicate | `MERITS_PER_MONTH` from `pricing-config.ts` | `MERITS_PER_MONTH` is the v2.0 Phase 24 SC-12 locked source; TIER_LIMITS is stale. |
| Merit-flag boolean infrastructure | Keep `MERIT_SYSTEM_ENABLED` "in case" | Delete unconditionally | The flag was a MIG-05 dual-write scaffold; v3.0 has only the merit path. Keeping a dead flag invites resurrection. |

**Key insight:** Every behavioral change in Phase 30 has a one-pattern-deep existing analog from Phase 10, 11, 12, 13, 21, 24, or 29. The work is mechanical mirroring, not design.

## Runtime State Inventory

This phase IS a rename/refactor (free-tier semantics: lifetime → monthly replenishing; legacy gate → merit gateway). Audit:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `user_merits` rows for existing Free users — `subscription_balance` 0-5, `subscription_reset_date` NULL, `lifetime_granted` 5. ~all current Free users.  `merit_transactions` rows with `source IN ('phase-10-backfill', 'signup-grant')` reflecting amount=5 grants. | **Data migration:** Phase 30 backfill UPDATE + ledger INSERT (per D-02/D-03). Old `phase-10-backfill` rows preserved (audit history); new `phase-30-free-backfill` rows added. |
| Live service config | `reset-subscription-merits-sweep` pg_cron job at `*/15 * * * *` — schedule body has no tier filter; filter lives in edge function. **Confirmed via `migrations/20260415000001:124-138`**. | **None.** Cron body untouched; only edge function filter expands. |
| OS-registered state | No Windows Task Scheduler / launchd / pm2 entries for this phase's scope. Supabase pg_cron is DB-internal. | None — verified by absence of OS-level scheduler references in repo. |
| Secrets / env vars | `MERIT_SYSTEM_ENABLED` env var — read at module load in `merit-gateway.ts:27-28`. **9 edge functions** import it (analyze-resume, analyze-skills-gap, analyze-career, recruiting-lens, grade-linkedin, compare-jobs, interview-prep-analyze, submit-resume-analysis-job, submit-career-analysis-job). | **Code edit + Supabase secret unset.** Phase 30 deletes the constant + all imports; the secret can stay set (harmless) but should be unset post-deploy to reduce confusion. **See §Open Question 1 for the scope conflict.** |
| Build artifacts / installed packages | No npm package or Deno cache implications. No pip / egg-info equivalents. | None. |

**Open follow-up:** `can_perform_ai_action` SQL function lives in 4 migrations (`20251222220418`, `20251223172718`, `20251227112504`, `20260123003842`, `20260331000000`) and is also called from `paddle-webhook/index.ts:254` (comment, no live call) and `stripe-webhook-handler/index.ts:314` (comment). Function stays in DB per `Deferred Ideas`; no Phase 30 action.

## Common Pitfalls

### Pitfall 1: Day-of-month overflow miscalculation

**What goes wrong:** Computing "next anniversary of Jan 31" naively returns Mar 3 (Feb has 28/29 days; `setUTCMonth` overflows).

**Why it happens:** `Date.prototype.setUTCMonth(month + 1)` does NOT clamp; it lets the day-component flow into the following month.

**How to avoid:** Reuse `addOneMonthIso` in `_shared/date-utils.ts:12-21`. Verified to clamp correctly by `date-utils.test.ts` (5 cases including Jan 31 → Feb 28, leap year → Feb 29, Mar 31 → Apr 30).

**Warning signs:** "Why is my Feb 28 reset showing as Mar 3?" in staging logs. Diff between trigger D-04 logic (SQL) and cron D-08 logic (TS) — both must agree on clamping.

**Phase 30 action:** Use `addOneMonthIso` in TS where possible. For SQL, mirror its semantics — `make_date(year, month, LEAST(target_day, days_in_target_month))` or `date_trunc('month', target_date) + interval '1 month - 1 day'` (the "last day of next month" idiom). Add a SQL-side day-of-month overflow test to the backfill verification DO-block: insert a fixture profile with `created_at = '2024-01-31'`, run backfill, assert `subscription_reset_date` lands on Feb 28/29 (depending on year).

### Pitfall 2: Reconciliation drift after backfill

**What goes wrong:** Backfill UPDATEs `subscription_balance` from 5 → 10 but forgets to INSERT a matching `merit_transactions` row with `amount = 5`. `reconcile_merit_balance` then shows drift=5 forever.

**Why it happens:** It's tempting to skip the ledger insert when the math feels obvious. Phase 10 hit exactly this trap; Phase 12 set the convention to always INSERT an audit-marker row (amount=0 ok if delta=0).

**How to avoid:** D-03 mandates a `merit_transactions` row per backfilled user with `amount = delta`. Include drift-check verification DO-block at end of backfill migration (RAISE EXCEPTION if any Free user has nonzero drift).

**Warning signs:** Drift > 0 from `reconcile_merit_balance` for any Free user post-migration. Test failure in proposed Deno test (see §Validation Architecture).

### Pitfall 3: `useMerits` cache key drift breaking hook fan-out

**What goes wrong:** Changing `useMerits` queryKey from `['merit-balance', userId]` to e.g. `['merit-balance', userId, tier]` invalidates the cache-coalescing benefit; three hooks now hit `get_merit_balance` separately.

**Why it happens:** During hook rewrites, a refactor "improves" the cache key without realizing it's shared.

**How to avoid:** Hold `['merit-balance', userId]` exactly. Three hooks subscribe; React Query coalesces. Phase 30 does NOT touch the queryKey, staleTime, or queryFn — only the derived `isLow` / `isZero` math.

**Warning signs:** Three round-trips to `get_merit_balance` per page render in Network tab.

### Pitfall 4: Long-tx lock on `user_merits` UPDATE if Free cohort is large

**What goes wrong:** A single tx UPDATE of all Free user_merits rows holds a row lock for the duration of the migration. If Free is 100K+ rows, this blocks signup-triggered inserts.

**Why it happens:** Default bulk UPDATE behavior.

**How to avoid:** Phase 12 used a per-row loop because each row also fired an RPC; Phase 30 can stay single-tx because the math is pure SQL. **Acceptable up to ~50K Free users.** Above that, switch to batched UPDATE using `WHERE user_id IN (SELECT id FROM profiles WHERE tier='free' LIMIT 5000 OFFSET N)` pattern. Planner checks staging Free row count before committing the approach.

**Warning signs:** Migration takes >5 seconds on staging. Locks visible in `pg_locks` during apply.

**Mitigation:** Run the backfill migration during a low-traffic window. The signup trigger is already updated to grant 10 directly, so any signup racing the backfill gets the new constants from the trigger — not from the backfill — and the backfill's `WHERE tier='free' AND subscription_balance < 10` (implicit via GREATEST) becomes a no-op for that row.

### Pitfall 5: Removing `createUsageLimitResponse` while other functions still import it

**What goes wrong:** Grep shows `createUsageLimitResponse` is imported by **6 functions**: analyze-resume, analyze-skills-gap, analyze-career, recruiting-lens, grade-linkedin, compare-jobs (+ tests). Each still has a legacy path that calls it. Deleting the export breaks them all.

**Why it happens:** D-15 says "Also remove the `createUsageLimitResponse` helper if it has no remaining callers (planner greps and decides)." It DOES have remaining callers.

**How to avoid:** **Do NOT delete `createUsageLimitResponse` in Phase 30.** Only `analyze-resume` loses its caller; the other 5 functions still have their own legacy branches gated on `MERIT_SYSTEM_ENABLED`. Either (a) scope-expand Phase 30 to gut ALL legacy branches in all 9 functions (large surface), or (b) keep `createUsageLimitResponse` in `usage-checker.ts` and limit Phase 30 deletion to analyze-resume's import only.

**Recommendation:** Option (b). Defer cross-function legacy-branch deletion to a follow-up phase. Document the deferral in Phase 30 SUMMARY.

### Pitfall 6: `merit-branch.test.ts` was Phase 13's dual-write contract pin

**What goes wrong:** `supabase/functions/analyze-resume/merit-branch.test.ts:12-15` asserts that `MERIT_SYSTEM_ENABLED` is imported from `merit-gateway.ts`. Removing the import breaks this test. The test will fail loudly post-removal.

**How to avoid:** Either rewrite the test to assert `withMerits` is imported unconditionally (positive merit-path assertion), or delete the test entirely (its premise — dual-write — is gone). CONTEXT.md only mentions `legacy-unchanged.test.ts` deletion; `merit-branch.test.ts` is a second test file that needs the same treatment.

**Planner action:** Add `merit-branch.test.ts` to the Phase 30 plan alongside `legacy-unchanged.test.ts`. Either rewrite or delete; the planner decides.

## Code Examples

See §Architecture Patterns above (Patterns 1-8) for verified code shapes. Sources cited per pattern; all patterns derived from existing repo code rather than external docs.

## State of the Art

This phase has no "state of the art" axis — it consolidates established Strivo patterns. No external library or framework is being evaluated.

**Deprecated/outdated in this phase:**
- `MERIT_SYSTEM_ENABLED` env-var gating (Phase 13 dual-write scaffold) — removed from analyze-resume; potentially full repo (TBD per Open Question 1).
- `can_perform_ai_action` SQL function as a frontend gate — removed from `usePaywallGuard` and `useTierAccess`; function itself stays in DB (Deferred Idea).
- `usage_tracking` table as a write target for paywall decisions — frontend now reads merit substrate; table retained as audit/history surface for now (Deferred Idea).
- TIER_LIMITS constant in `useTierAccess.ts:39-43` (stale values free:3/pro:100/elite:300) — recommend delete in favor of `MERITS_PER_MONTH`.
- `merit-branch.test.ts` and `legacy-unchanged.test.ts` — premise dissolves with D-15.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Free user cohort fits in a single-tx UPDATE (<~50K rows) | §Pattern 2, §Pitfall 4 | If cohort is 100K+, single-tx may hold locks too long. Planner must check staging row count. [ASSUMED — no count probed in this research session] |
| A2 | No operator scripts or external monitors currently call `can_perform_ai_action` outside the 3 sites being rewritten | §Don't Hand-Roll, Deferred Ideas | If yes, dropping the RPC later (deferred) breaks them — but Phase 30 only stops calling, doesn't drop. Acceptable risk. [ASSUMED] |
| A3 | Removing `MERIT_SYSTEM_ENABLED` from `merit-gateway.ts` is intended to apply across all 9 importer functions (full v3.0 cleanup), not just analyze-resume | §User Constraints D-15, Open Question 1 | If wrong, plan scope balloons or shrinks. **Must resolve before planning.** [ASSUMED — CONTEXT.md is ambiguous] |
| A4 | The `_phase30_snapshot` temp table approach is acceptable inside a migration | §Pattern 2 | If the DBA prefers a CTE or persistent staging table, the planner adjusts. Either is valid. [ASSUMED stylistic preference] |
| A5 | `MeritBalanceHeaderV2.test.tsx` tests T1/T2/T4/T5 need rewrite but T3/T6/T7 stay as-is | §Architecture Patterns, Component Responsibilities | If the planner discovers other assertions reference bonus chip / sub-only, the rewrite is wider. [ASSUMED — verified by reading the test file; only T1/T2/T4/T5 reference `subscription` & `merits`/`bonus` chip explicitly] |

## Open Questions

### 1. `MERIT_SYSTEM_ENABLED` blast-radius scope

**What we know:** D-15 directs removing the constant from `_shared/merit-gateway.ts`. The constant is imported by 9 functions, all of which read it in a `if (MERIT_SYSTEM_ENABLED && userContext) { withMerits(...) } else { /* legacy can_perform_ai_action */ }` pattern. Removing the export breaks the import line in 9 files.

**What's unclear:** Does Phase 30 also rip the legacy branch in all 9 functions, or only in analyze-resume (leaving the others to a follow-up phase)?

**Recommendation:** **Resolve before planning.** Two options:
- **(a) Full v3.0 cleanup (recommended):** Phase 30 rips legacy branches in all 9 functions. Adds ~6 hours of mechanical work but eliminates a class of dead code permanently. Each function gets a parallel deletion of legacy gating + `createUsageLimitResponse` call + `checkAndRecordUsage` call where applicable.
- **(b) analyze-resume only:** Phase 30 keeps `MERIT_SYSTEM_ENABLED` in `merit-gateway.ts` (rename to `_LEGACY_MERIT_SYSTEM_ENABLED` if symbolic clarity matters) and only rips analyze-resume's branch + the test files. Defer the other 8 functions.

If the operator picks (a), expand the Phase 30 plan; if (b), edit D-15 to "remove from analyze-resume only" and leave the constant export intact. Surface this conflict in the planner's first review of the plan.

### 2. `analysisCount` / `usageInfo.used` derivation

**What we know:** Callers read `analysisCount` (Upload.tsx:410: `Used {analysisCount}/{limit} this period`) and `usageInfo.used` (Dashboard, PricingTable, Shop).

**What's unclear:** Should "used" be a proxy (`cap - subscription`), a ledger aggregate (`SELECT SUM amount FROM merit_transactions WHERE user_id = ? AND source = 'feature-deduct' AND created_at >= cycle_start`), or dropped?

**Recommendation:** Start with the proxy (`cap - subscription`) — it's deterministic, requires no extra query, and matches the v2.0 mental model. If the proxy diverges from user expectations during staging QA, switch to a ledger aggregate in a follow-up. Planner picks; either is acceptable.

### 3. Anniversary semantics for users created BEFORE backfill cutoff

**What we know:** D-04 says first reset is "next occurrence of `profile.created_at`'s day-of-month." D-05 clamps overflow.

**What's unclear:** For a user created on the 15th when backfill ships on the 16th — first reset is ~30 days away (next month's 15th). For a user created on the 17th when backfill ships on the 16th — first reset is tomorrow (this month's 17th). Both are explicitly OK per D-04 edge cases.

**Recommendation:** No action needed; the SQL idiom must produce correct dates for both. The planner picks the cleanest expression and the verification DO-block asserts a sample.

### 4. `merit-branch.test.ts` disposition

**What we know:** Test file at `supabase/functions/analyze-resume/merit-branch.test.ts` asserts the `MERIT_SYSTEM_ENABLED` import. CONTEXT.md mentions `test-07.test.ts` Test 4 + `legacy-unchanged.test.ts` but not `merit-branch.test.ts`.

**Recommendation:** Treat the same as `legacy-unchanged.test.ts` — either rewrite to assert the unconditional merit path or delete. **Add to Phase 30 plan explicitly so it's not missed.**

## Environment Availability

Phase 30 has no NEW external dependency surface — all tools already exist on the target machine and in Supabase. The audit confirms:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase CLI | Edge function deploy + migration apply | ✓ | 2.92.0 (per package.json devDependencies) | — |
| Deno | Edge function tests | ✓ (via Supabase) | 2+ | — |
| Node.js | Frontend build + Vitest | ✓ | 22+ | — |
| Vitest | Frontend hook + component tests | ✓ | 1.6.1 | — |
| pg_cron | Reused 15-min sweep | ✓ (already enabled in DB) | — | — |
| PowerShell | `deploy-staging.ps1` / `run-edge-tests.ps1` | ✓ (Windows host) | — | bash fallback for non-Win operators |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (frontend) | Vitest 1.6.1 + @testing-library/react 14.3.1 + jsdom 24.1.3 |
| Framework (edge) | Deno test (`Deno.test`) |
| Config files | `vitest.config.ts` (implicit per `vite.config.ts`), `supabase/functions/deno.json` |
| Quick run (frontend, single file) | `npx vitest run src/hooks/useMerits.test.ts` |
| Quick run (edge, single file) | `deno test --allow-all --no-check supabase/functions/analyze-resume/test-07.test.ts` |
| Full suite (frontend) | `npm test` |
| Full suite (edge) | `.\scripts\run-edge-tests.ps1` |
| Phase gate | All Vitest + Deno green; backfill migration verification DO-block passes; staging `reconcile_merit_balance` drift=0 for sample of Free users |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MER-01 (signup) | New Free user gets `subscription_balance=10`, ledger row `signup-grant` amount=10 | Deno integration | `deno test --allow-all supabase/functions/<TBD>/phase-30-signup.test.ts` | ❌ Wave 0 — new test file |
| MER-01 (backfill) | Existing Free user at sub_balance < 10 lands at 10; ledger row `phase-30-free-backfill` with delta; drift=0 | Deno integration against seeded fixtures | `deno test --allow-all supabase/functions/<TBD>/phase-30-backfill.test.ts` | ❌ Wave 0 |
| MER-02 / MER-09 (reset arm) | Free user with sub_balance < 10, reset_date <= now → reset RPC sets to 10 with delta in ledger; at 10/10 → delta=0 ledger row | Deno unit (RPC) | `deno test --allow-all supabase/functions/_shared/reset-subscription-merits.test.ts` (extend existing or new file) | ❌ Wave 0 — extend `supabase/functions/reset-subscription-merits/index.test.ts` (already present) |
| MER-02 (edge filter) | `reset-subscription-merits` edge function selects Free users when reset_date passed | Deno unit | Same file as above | ❌ Wave 0 |
| MER-11 (single-value display) | `MeritBalanceHeaderV2` renders `{sub+shop} / {cap}` for tier+balance fixtures (Pro over cap, Free underwater, fully depleted) | Vitest | `npx vitest run src/components/topup/MeritBalanceHeaderV2.test.tsx` | ✅ exists (rewrite T1/T2/T4/T5) |
| MER-11 (isLow/isZero on total) | `useMerits.isLow` true when total/cap ≤ 0.2; `isZero` true when total ≤ 0 | Vitest | `npx vitest run src/hooks/useMerits.test.ts` | ❌ Wave 0 — `useMerits.test.ts` does not exist (verified via grep) |
| MER-12 (`usePaywallGuard` no can_perform) | Hook returns sane `PaywallStatus` without calling `can_perform_ai_action` | Vitest | `npx vitest run src/hooks/usePaywallGuard.test.tsx` | ❌ Wave 0 |
| MER-12 (`useTierAccess` no can_perform) | Hook returns sane `TierAccess` without calling `can_perform_ai_action`; admin testTier override preserved | Vitest | `npx vitest run src/hooks/useTierAccess.test.tsx` | ❌ Wave 0 |
| MER-12 (analyze-resume unconditional merit path) | source contains `withMerits(` ; does NOT contain `MERIT_SYSTEM_ENABLED` or `can_perform_ai_action` | Deno source-substring test (replaces `test-07.test.ts` Test 4) | `deno test --allow-all supabase/functions/analyze-resume/test-07.test.ts` | ✅ exists (rewrite Test 4) |
| MER-12 (legacy-unchanged disposition) | Test file deleted | filesystem assertion (operator-verified) | `Test-Path supabase/functions/analyze-resume/legacy-unchanged.test.ts` returns `False` | — |
| Doc amendment | `REQUIREMENTS.md` MER-11 + `ROADMAP.md` SC #3 no longer contain "bonus chip retained" | Grep gate in plan-checker | `grep -rn 'bonus chip retained' .planning` returns empty | — |

### Sampling Rate
- **Per task commit:** Quick run of the test that targets the changed surface. E.g. backfill migration commit → run the backfill Deno test against a seeded fixture; hook rewrite commit → `npx vitest run src/hooks/<file>.test.tsx`.
- **Per wave merge:** Full Vitest suite (`npm test`) + full Deno suite (`run-edge-tests.ps1`).
- **Phase gate:** Both full suites green; staging deploy of all 3 migrations applies cleanly; `reconcile_merit_balance` for a random sample of 10 Free users post-backfill returns drift=0; manual smoke of `MeritBalanceHeaderV2` rendering for Free 8/10 + Free 0/10 + Pro 78/75 fixtures.

### Wave 0 Gaps
- [ ] `supabase/functions/analyze-resume/phase-30-signup.test.ts` — covers MER-01 signup grant. Or extend `supabase/functions/_shared/merit-gateway.test.ts` with a signup-grant integration assertion.
- [ ] `supabase/functions/<TBD>/phase-30-backfill.test.ts` — covers MER-01 backfill drift assertion. Could be a top-level migration test using `supabase db reset` + seeded fixtures.
- [ ] Extend `supabase/functions/reset-subscription-merits/index.test.ts` to cover Free-tier reset (RPC arm + edge filter).
- [ ] `src/hooks/useMerits.test.ts` — currently does NOT exist; needed for MER-11 isLow/isZero assertions.
- [ ] `src/hooks/usePaywallGuard.test.tsx` — currently does NOT exist; needed to assert the rewrite produces correct `PaywallStatus` shape and that `can_perform_ai_action` is no longer called.
- [ ] `src/hooks/useTierAccess.test.tsx` — currently does NOT exist; needed to assert rewrite + admin testTier override preservation.
- [ ] Rewrite `MeritBalanceHeaderV2.test.tsx` T1/T2/T4/T5 to match new `total / cap` format; verify T3/T6/T7 still pass.
- [ ] Rewrite `test-07.test.ts` Test 4 (positive merit-only assertion).
- [ ] Decide disposition of `merit-branch.test.ts` (rewrite or delete).
- [ ] Delete `legacy-unchanged.test.ts`.
- [ ] Migration framework: existing — no install needed.

## Sources

### Primary (HIGH confidence)
- `supabase/migrations/20260414000000_merit_ledger_foundation.sql:115-151` — trigger function current body (5/0/5/NULL/false), initial backfill, signup-grant ledger pattern.
- `supabase/migrations/20260415000000_merit_rpcs.sql:367-424` — `reset_subscription_merits` current body, SET-not-add semantics, lock pattern, ledger row.
- `supabase/migrations/20260415000000_merit_rpcs.sql:436-462` — `reconcile_merit_balance` drift formula.
- `supabase/migrations/20260415000001_phase_12_stripe_products_webhook.sql:115-215` — pg_cron sweep + `phase-12-backfill` ledger convention.
- `supabase/functions/reset-subscription-merits/index.ts:64-103` — edge function tier filter + batch size + RPC dispatch.
- `supabase/functions/_shared/date-utils.ts:12-21` + `date-utils.test.ts:1-75` — `addOneMonthIso` correctness verified (5 tests, including Jan 31 → Feb 28, leap year → Feb 29).
- `supabase/functions/_shared/merit-gateway.ts:27-33` — `MERIT_SYSTEM_ENABLED` constant + `readMeritFlag` export.
- `supabase/functions/analyze-resume/index.ts:13,18,376-781` — import, module-scope log, branch guard, legacy path.
- `supabase/functions/analyze-resume/test-07.test.ts:440-491` — Test 4 current shape.
- `supabase/functions/analyze-resume/legacy-unchanged.test.ts:1-26` — full source (3 assertions about legacy substrings).
- `supabase/functions/analyze-resume/merit-branch.test.ts` (lines 12-15) — additional test asserting `MERIT_SYSTEM_ENABLED` import; not mentioned in CONTEXT.md, surfaced in §Pitfall 6.
- `src/hooks/useMerits.ts:1-93` — full source.
- `src/hooks/usePaywallGuard.ts:1-122` — full source.
- `src/hooks/useTierAccess.ts:1-160` — full source.
- `src/components/topup/MeritBalanceHeaderV2.tsx:1-107` — full source.
- `src/components/topup/MeritBalanceHeaderV2.test.tsx:1-131` — full test source.
- `src/config/pricing-config.ts:29-35` — `MERITS_PER_MONTH` constant.
- `.planning/phases/29-foundation-infrastructure/29-CONTEXT.md` — one-concern-per-migration + NFR-01 rollback convention (referenced by CONTEXT.md carry-forward).
- `.planning/phases/30-free-tier-10-month-cap-display-legacy-gate-migration/30-CONTEXT.md` — locked decisions D-01..D-17.

### Secondary (MEDIUM confidence)
- Grep results for `MERIT_SYSTEM_ENABLED|readMeritFlag|createUsageLimitResponse|can_perform_ai_action` across `supabase/` — verified 9 importers of the flag, 6 importers of `createUsageLimitResponse`, multiple legacy migrations defining `can_perform_ai_action`.
- Grep results for `usePaywallGuard|useTierAccess` across `src/` — verified 14 files reference the hooks (call sites enumerated).

### Tertiary (LOW confidence)
- Free-user row count — not probed in this research session. Mitigation: planner checks staging count before settling on single-tx vs batched UPDATE (see Assumption A1 + Pitfall 4).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every dependency already in repo and verified by file reads.
- Architecture: HIGH — every pattern derived from existing Phase 10/11/12/13/24/29 code; cited line numbers.
- Pitfalls: HIGH — five pitfalls grounded in either current code review (Pitfalls 1, 2, 3, 5, 6) or established Strivo migration history (Pitfall 4 from Phase 12 precedent).

**Research date:** 2026-05-16
**Valid until:** 2026-06-15 (30 days — Strivo merit substrate is stable; no upstream library churn expected)
