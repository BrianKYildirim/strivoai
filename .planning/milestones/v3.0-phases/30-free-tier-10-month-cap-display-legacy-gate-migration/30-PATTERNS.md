# Phase 30: Free Tier 10/Month + Cap Display + Legacy Gate Migration — Pattern Map

**Mapped:** 2026-05-17
**Files analyzed:** 14 (3 new migrations, 1 edge fn + test, 1 component + test, 3 hooks, 1 edge fn body edit, 2 test deletions/rewrites, 4 docs)
**Analogs found:** 12 / 14 strong matches; 2 doc-only edits have no code analog (planner uses RESEARCH.md guidance)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/migrations/<new>_merit_free_signup_grant.sql` | migration (trigger update) | event-driven (INSERT trigger) | `supabase/migrations/20260414000000_merit_ledger_foundation.sql:115-139` | exact (same trigger function) |
| `supabase/migrations/<new>_merit_free_backfill.sql` | migration (backfill) | batch | `supabase/migrations/20260415000001_phase_12_stripe_products_webhook.sql:141-215` | exact (Phase 12 backfill convention) |
| `supabase/migrations/<new>_merit_free_arm_reset_rpc.sql` | migration (RPC replace) | request-response (RPC) | `supabase/migrations/20260415000000_merit_rpcs.sql:367-428` | exact (same RPC, CASE arm edit) |
| `supabase/functions/reset-subscription-merits/index.ts` (line 70) | edge function (one-line edit) | batch (cron sweep) | self — current implementation | exact (one-token change) |
| `supabase/functions/reset-subscription-merits/index.test.ts` (extend) | test | batch | self — `batch-due-users` Deno test at line 150 | exact (extend pattern) |
| `supabase/functions/analyze-resume/index.ts` (lines 13, 18, 376-781) | edge function (legacy branch rip) | request-response | self (merit branch lines 376-741) | exact (collapse to merit-only) |
| `supabase/functions/_shared/merit-gateway.ts` (lines 27-33) | shared utility (delete flag) | config | self | exact |
| `supabase/functions/analyze-resume/test-07.test.ts:444-491` | test (rewrite Test 4) | request-response | `legacy-unchanged.test.ts` (inverse — assert absence) | role-match |
| `supabase/functions/analyze-resume/legacy-unchanged.test.ts` | test (DELETE) | — | — | n/a (deletion) |
| `supabase/functions/analyze-resume/merit-branch.test.ts` | test (rewrite or DELETE) | — | — | role-match (rewrite to positive assertion) |
| `src/components/topup/MeritBalanceHeaderV2.tsx` (lines 42-62) | component (trigger JSX rewrite) | request-response (hook consumer) | self (popover body unchanged) | exact |
| `src/components/topup/MeritBalanceHeaderV2.test.tsx` (T1/T2/T4/T5) | test | component-mount | self (existing T6/T7 stay) | exact |
| `src/hooks/useMerits.ts` (line 73) | hook (isLow math) | request-response | self | exact (one-line edit) |
| `src/hooks/usePaywallGuard.ts` (full rewrite) | hook | request-response | `src/hooks/useMerits.ts` (canonical merit consumer) | role-match |
| `src/hooks/useTierAccess.ts` (full rewrite) | hook | request-response | `src/hooks/useMerits.ts` + existing admin-tier preservation | role-match |
| `.planning/REQUIREMENTS.md` (MER-11) | doc | — | — | n/a (doc edit) |
| `.planning/ROADMAP.md` (Phase 30 SC #3) | doc | — | — | n/a (doc edit) |
| `.planning/PROJECT.md` (Current State) | doc | — | — | n/a (doc edit) |
| `.planning/STATE.md` (Accumulated Context) | doc | — | — | n/a (doc edit) |

## Pattern Assignments

### Migration #1 — Free signup grant trigger (D-01)

**Analog:** `supabase/migrations/20260414000000_merit_ledger_foundation.sql:115-139`

**Trigger function body to replace** (current state, lines 115-133):

```sql
CREATE OR REPLACE FUNCTION public.auto_provision_user_merits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_merits
    (user_id, subscription_balance, shop_balance, lifetime_granted,
     subscription_reset_date, free_linkedin_scan_used)
  VALUES (NEW.id, 5, 0, 5, NULL, false)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.merit_transactions
    (user_id, amount, balance_type, source, feature, metadata)
  VALUES (NEW.id, 5, 'grant', 'signup-grant', NULL, '{}'::jsonb);

  RETURN NEW;
END;
$$;
```

**Phase 30 replacement (per D-01):**
- Change `5, 0, 5, NULL, false` → `10, 0, 10, (now() + interval '1 month'), false`
- Change `(NEW.id, 5, 'grant', 'signup-grant'...)` → `(NEW.id, 10, 'grant', 'signup-grant'...)`
- Keep `CREATE OR REPLACE` (preserves grants + trigger binding — see Pitfall: do NOT DROP + CREATE).
- Do NOT re-issue the `CREATE TRIGGER on_profile_created_provision_merits` block — the trigger binding survives function replacement.

**Rollback block (NFR-01):** restore the body verbatim from `20260414000000_merit_ledger_foundation.sql:115-139` in a `-- rollback:` comment at the bottom of the migration.

---

### Migration #2 — Free backfill with drift verification (D-02, D-03)

**Analog:** `supabase/migrations/20260415000001_phase_12_stripe_products_webhook.sql:141-215` (Phase 12 backfill convention, including the `phase-12-backfill` audit-marker pattern and `RAISE NOTICE / RAISE EXCEPTION` posture).

**Source literal for ledger rows** (per CONTEXT.md §Specifics): `phase-30-free-backfill` — mirrors `phase-12-backfill` convention.

**Reconciliation drift check pattern** to use at end of DO-block (analog: `reconcile_merit_balance` formula at `migrations/20260415000000_merit_rpcs.sql:436-462`):

```sql
-- drift = (subscription_balance + shop_balance) - SUM(merit_transactions.amount) per user
-- MUST be 0 for every backfilled user. RAISE EXCEPTION rolls back whole tx.
DO $verify$
DECLARE
  v_drift_count integer;
BEGIN
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
$verify$;
```

**Phase 12 audit-marker (amount=0) precedent** (lines 192-206 — apply to delta=0 backfill rows):

```sql
INSERT INTO public.merit_transactions(user_id, amount, balance_type, source, feature, metadata)
VALUES (
  r.user_id,
  0,
  'grant',
  'phase-12-backfill',     -- Phase 30 swaps for 'phase-30-free-backfill'
  NULL,
  jsonb_build_object(
    'tier',     r.subscription_tier,
    'migration','<new migration filename>',
    -- include 'prev_balance', 'new_balance' per RESEARCH.md Pattern 2
    'expected_credit', 0
  )
);
```

**Phase 30-specific UPDATE shape** (RESEARCH.md §Pattern 2 — bulk single-tx UPDATE; planner picks anniversary-date SQL idiom):

```sql
UPDATE public.user_merits um
SET subscription_balance = GREATEST(10, um.subscription_balance),
    lifetime_granted     = um.lifetime_granted
                         + (GREATEST(10, um.subscription_balance) - um.subscription_balance),
    subscription_reset_date = <next anniversary of profile.created_at; clamp day per D-05>,
    updated_at = now()
FROM public.profiles p
WHERE p.id = um.user_id AND p.subscription_tier = 'free';
```

**Anniversary clamping SQL idiom** (mirror `addOneMonthIso` semantics from `supabase/functions/_shared/date-utils.ts:12-21`):

```sql
-- Pattern: pick last-day-of-target-month when source day overflows.
-- "Last day of next month" idiom (cleanest):
(date_trunc('month', target_date) + interval '1 month - 1 day')::timestamptz
-- OR: make_date(y, m, LEAST(target_day, days_in_target_month))
```

---

### Migration #3 — `reset_subscription_merits` Free arm (D-06, MER-02, MER-09)

**Analog:** `supabase/migrations/20260415000000_merit_rpcs.sql:367-428` (the RPC current body).

**Current state to modify** (lines 382-392):

```sql
-- 2. Free no-op (D-14).         <-- DELETE this block (D-06)
IF p_tier = 'free' THEN
  RETURN jsonb_build_object('success', true, 'skipped', 'free_tier_noop');
END IF;

-- 3. Resolve target balance (D-14).
v_new_balance := CASE p_tier
                   WHEN 'pro'   THEN 75       <-- ADD: WHEN 'free' THEN 10
                   WHEN 'elite' THEN 150
                   ELSE NULL
                 END;
```

**Phase 30 replacement (per D-06):**

```sql
v_new_balance := CASE p_tier
                   WHEN 'free'  THEN 10
                   WHEN 'pro'   THEN 75
                   WHEN 'elite' THEN 150
                   ELSE NULL
                 END;
```

**Preserve verbatim:** the `FOR UPDATE` lock (line 379-380), the `UPDATE public.user_merits` block (lines 400-405), the ledger INSERT (lines 408-416), the GRANT block (lines 426-428).

**Re-issue GRANT block** (idempotent, defensive):

```sql
REVOKE ALL ON FUNCTION public.reset_subscription_merits(uuid, text, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.reset_subscription_merits(uuid, text, timestamptz)
  TO authenticated, service_role;
```

---

### `supabase/functions/reset-subscription-merits/index.ts:70` (D-07)

**Analog:** self — one-token edit on existing line 70.

**Current** (line 70):

```typescript
.in("profiles.subscription_tier", ["pro", "elite"])
```

**Replace with:**

```typescript
.in("profiles.subscription_tier", ["free", "pro", "elite"])
```

**Type widening required** (line 84): `subscription_tier: "pro" | "elite"` → `subscription_tier: "free" | "pro" | "elite"`.

**Nothing else changes:** `BATCH_SIZE = 1000` (line 32), the auth wrapping (lines 54-62), the RPC dispatch loop (lines 80-103), the JSON response shape (lines 105-118) all preserved.

---

### `supabase/functions/reset-subscription-merits/index.test.ts` (extend)

**Analog:** existing `batch-due-users` test at lines 150-216 — fake-row factory + RPC-call-shape assertion pattern.

**Pattern to copy** (lines 76-110 — `createFakeSupabase` builder):

```typescript
function createFakeSupabase(opts: FakeSupabaseOpts = {}) {
  // single-object query builder whose chained methods all return `this`
  // until .limit() resolves to the final {data,error} promise
  function buildQuery() {
    const q: Record<string, unknown> = {};
    q.select = (_cols: string) => q;
    q.lte = (_col: string, _val: string) => q;
    q.in = (_col: string, _vals: string[]) => q;
    q.limit = (_n: number) => Promise.resolve(
      opts.selectError ? { data: null, error: opts.selectError } : { data: dueRows, error: null }
    );
    return q;
  }
  ...
}
```

**New Deno test to add** (mirrors `batch-due-users` shape):

```typescript
Deno.test("free-tier-reset-arm", async () => {
  setTestEnv();
  try {
    const dueRows: FakeRow[] = [
      { user_id: "free-user-1", subscription_reset_date: "2026-04-15T00:00:00.000Z",
        profiles: { subscription_tier: "free" } },
    ];
    const fakeSupabase = createFakeSupabase({ dueRows });
    const req = new Request("https://test/reset-subscription-merits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invocation_source: "pg_cron" }),
    });
    const res = await handleResetSubscriptionMerits(req, {
      supabase: fakeSupabase,
      requireAuth: passingRequireAuth,
    });
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.processed, 1);
    assertEquals(fakeSupabase.rpcCalls[0].args.p_tier, "free");
    assertEquals(fakeSupabase.rpcCalls[0].args.p_next_reset_date, "2026-05-15T00:00:00.000Z");
  } finally { clearEnv(); }
});
```

**Update the `FakeRow.profiles.subscription_tier` type** from `"pro" | "elite"` → `"free" | "pro" | "elite"` (line 61).

---

### `src/components/topup/MeritBalanceHeaderV2.tsx:42-62` (D-09, D-12, MER-11)

**Analog:** self — surgical JSX edit. Popover body (lines 64-103) untouched.

**Current state** (lines 42-62):

```tsx
<Popover>
  <PopoverTrigger asChild>
    <button
      type="button"
      className={`flex items-center gap-2 px-2 py-1 rounded-[--radius-boxy] hover:bg-white/5 transition-colors ${triggerStateClass}`}
      aria-label={`Merit balance: ${subscription} of ${cap} monthly merits${hasBonus ? `, plus ${shop} bonus top-up merits` : ''}`}
    >
      <Gem className="h-4 w-4 text-[--accent-red]" />
      <span className="font-mono text-sm font-medium text-foreground">
        {subscription} / {cap}
      </span>
      {!hasBonus && (
        <span className="text-xs text-muted-foreground">merits</span>
      )}
      {hasBonus && (
        <span className="font-mono text-xs font-medium text-[--accent-red]">
          + {shop} bonus
        </span>
      )}
    </button>
  </PopoverTrigger>
  ...
```

**Phase 30 replacement** (per D-09 / D-12 / UI-SPEC §Typography "two-weight contract"):

```tsx
<Popover>
  <PopoverTrigger asChild>
    <button
      type="button"
      className={`flex items-center gap-2 px-2 py-1 rounded-[--radius-boxy] hover:bg-white/5 transition-colors ${triggerStateClass}`}
      aria-label={`Merit balance: ${subscription + shop} of ${cap} merits`}
    >
      <Gem className="h-4 w-4 text-[--accent-red]" />
      <span className="font-mono text-sm font-semibold text-foreground">
        {subscription + shop} / {cap}
      </span>
      <span className="text-xs text-muted-foreground">merits</span>
    </button>
  </PopoverTrigger>
  {/* PopoverContent (lines 64-103) preserved verbatim — D-10 */}
```

**Delete:**
- `const hasBonus = shop > 0;` at line 32 (no longer referenced).
- Both conditional `{!hasBonus && ...}` / `{hasBonus && ...}` chip branches.

**Preserve verbatim:** `triggerStateClass` ladder (lines 36-40), `<Gem />` icon, `<PopoverContent>` body (lines 64-103), early-return Skeleton (line 30).

**Typography note** (UI-SPEC §Typography): `font-medium` → `font-semibold` on the digits span to honor the two-weight contract (400/600 only).

---

### `src/components/topup/MeritBalanceHeaderV2.test.tsx`

**Analog:** self — existing test file structure with mock `useMerits`.

**Tests to rewrite (T1, T2, T4, T5):**

| Test | Current Behavior | Phase 30 Replacement |
|------|------------------|----------------------|
| T1 | `47/75 + shop=0 → "47 / 75" + "merits"` | `47/75 + shop=0 → "47 / 75" + "merits"` (unchanged display; assertion same) |
| T2 | `47/75 + shop=15 → "47 / 75" + "+ 15 bonus"` | `47/75 + shop=15 → "62 / 75" + "merits"` (chip removed, total includes shop) |
| T4 | `0/75 + shop=0 → "0 / 75" + "merits"` | unchanged display assertion |
| T5 | numeric span has `font-mono` | also assert `font-semibold` (UI-SPEC two-weight contract) |

**Tests to preserve verbatim:** T3 (Skeleton when isLoading), T6 (amber when isLow), T7 (destructive when isZero). The state-derivation logic is mock-driven and unaffected by JSX edits.

**Mock fixture pattern to reuse** (lines 21-42 — `setMerits` helper):

```typescript
function setMerits(opts: { subscription: number; shop: number; cap: number; ... }) {
  useMeritsMock.mockReturnValue({
    total: opts.subscription + opts.shop,    // ← already returning total; matches D-11
    subscription: opts.subscription,
    shop: opts.shop,
    cap: opts.cap,
    tier: 'pro',
    resetDate: opts.resetDate ?? null,
    isLow: opts.isLow ?? false,
    isZero: opts.isZero ?? opts.subscription + opts.shop <= 0,
    isLoading: opts.isLoading ?? false,
    canAfford: () => true,
  });
}
```

---

### `src/hooks/useMerits.ts` (D-11, MER-11)

**Analog:** self — one-line math edit at line 73.

**Current** (lines 66-83):

```typescript
// D-08: low when subscription balance is at or under 20% of the tier cap.
// (shop balance excluded — top-up is a separate affordance; the Plus icon
// nudge targets subscription refill, not paid top-ups.)
// WR-03: zero-subscription users must also qualify as "low" ...
const isLow = cap > 0 && subscription / cap <= 0.2;

return {
  total,
  subscription,
  shop,
  cap,
  tier,
  resetDate,
  isLow,
  isZero: total <= 0,    // ← already correct (operates on total)
  ...
};
```

**Phase 30 replacement** (per D-11):

```typescript
// D-11: low when TOTAL (subscription + shop) is at or under 20% of cap.
// Reasoning: the displayed value in MeritBalanceHeaderV2 is total/cap, so the
// warning state must match the displayed ratio.
const isLow = cap > 0 && total / cap <= 0.2;
```

**Preserve verbatim:** `queryKey: ['merit-balance', userId]` (line 33 — cache key MUST NOT drift per Pitfall 3), `staleTime: 5_000` (line 54), `refetchOnWindowFocus: true`, `enabled: !!userId`, all return-shape keys, `canAfford` implementation. The `useInvalidateMerits` helper (line 89) untouched.

**Update the doc comment** (lines 66-72) to reflect total-based semantics and supersede the prior `subscription`-only reasoning.

---

### `src/hooks/usePaywallGuard.ts` (D-13, MER-12) — full rewrite

**Analog:** `src/hooks/useMerits.ts` (canonical merit consumer pattern) + existing `useAdminTierTest` integration on line 17.

**Current shape to preserve** (interface from lines 6-14):

```typescript
interface PaywallStatus {
  canAnalyze: boolean;
  tier: string;
  analysisCount: number;
  limit: number;
  resetDate: string | null;
  isLifetimeLimit: boolean;
  loading: boolean;
}
// Return: { ...status, modalProps, openModal, triggerPaywall, refresh }
```

**Anti-pattern to remove** (lines 29-104 — replace entirely):

```typescript
useEffect(() => { checkPaywallStatus(); }, []);
const checkPaywallStatus = async (): Promise<PaywallStatus> => {
  const { data: { user } } = await supabase.auth.getUser();
  ...
  const { data, error } = await supabase.rpc('can_perform_ai_action', { p_user_id: user.id });
  ...
  setStatus(nextStatus);
  return nextStatus;
};
```

**Phase 30 replacement** (per RESEARCH.md Pattern 6):

```typescript
import { useMerits } from '@/hooks/useMerits';
import { useAdminTierTest } from '@/contexts/AdminTierTestContext';
import { useOutOfMeritsModal } from './useOutOfMeritsModal';

export function usePaywallGuard() {
  const { getEffectiveTier } = useAdminTierTest();
  const { total, subscription, cap, tier, resetDate, isLoading } = useMerits();
  const { openModal, modalProps } = useOutOfMeritsModal();

  const status: PaywallStatus = {
    canAnalyze: total > 0,
    tier: getEffectiveTier(tier),
    analysisCount: Math.max(0, cap - subscription),   // proxy (Open Q 2); planner may swap
    limit: cap,
    resetDate,
    isLifetimeLimit: false,                            // permanently false post-MER-01
    loading: isLoading,
  };

  const refresh = async () => status;                  // useMerits owns invalidation
  const triggerPaywall = (args?: { feature: string; cost: number; balance: number }) =>
    openModal(args ?? { feature: 'Analysis', cost: 0, balance: 0 });

  return { ...status, modalProps, openModal, triggerPaywall, refresh };
}
```

**Critical:** keep the return-shape keys exactly (`canAnalyze`, `tier`, `analysisCount`, `limit`, `resetDate`, `isLifetimeLimit`, `loading`, `modalProps`, `openModal`, `triggerPaywall`, `refresh`) so call-sites in Upload.tsx, RecruitingLens.tsx, InterviewPrep.tsx, etc. need zero edits.

**Anonymous-user degradation** (existing behavior at lines 36-47): when `userId === null`, `useMerits` returns `isLoading: false` and `total = 0` → `canAnalyze: false`, `tier: 'free'`, `loading: false`. This naturally falls out of the new implementation; no special handling needed.

---

### `src/hooks/useTierAccess.ts` (D-14, MER-12) — full rewrite

**Analog:** `src/hooks/useMerits.ts` (canonical merit consumer) + existing `AdminTierTestContext` integration on lines 51, 96-115.

**Current return shape to preserve** (lines 15-26):

```typescript
interface TierAccess {
  tier: string;
  loading: boolean;
  canAccessFeature: (feature: FeatureType) => boolean;
  canUseCredits: boolean;
  usageInfo: { used: number; limit: number; isLifetime: boolean; resetDate: string | null } | null;
}
```

**`TIER_FEATURES` constant (lines 29-36):** preserve verbatim — it owns the gate matrix.

**`TIER_LIMITS` constant (lines 39-43):** DELETE per Claude's Discretion. Stale values (`free: 3, pro: 100, elite: 300`); replace caller reads with `MERITS_PER_MONTH[testTier]` from `src/config/pricing-config.ts:31-35` (already has `{ free: 10, pro: 75, elite: 150 }`).

**Admin testTier preservation pattern to keep verbatim** (lines 96-115):

```typescript
if (isAdmin && testTier) {
  const testLimit = TIER_LIMITS[testTier] || 3;        // ← swap to MERITS_PER_MONTH[testTier]
  setCanUseCredits(true);                              // ← admin always allowed
  setUsageInfo({
    used: result.current_usage,                        // ← swap to (testLimit - subscription) proxy
    limit: testLimit,
    isLifetime: false,
    resetDate: result.reset_date,
  });
} else {
  setCanUseCredits(result.allowed);                    // ← swap to total > 0
  setUsageInfo({
    used: result.current_usage,
    limit: result.limit,
    isLifetime: result.is_lifetime_limit,
    resetDate: result.reset_date,
  });
}
```

**Phase 30 replacement** (per RESEARCH.md Pattern 7):

```typescript
import { useMerits } from '@/hooks/useMerits';
import { useAdminTierTest } from '@/contexts/AdminTierTestContext';
import { MERITS_PER_MONTH } from '@/config/pricing-config';

export function useTierAccess(): TierAccess {
  const { total, subscription, cap, tier: realTier, resetDate, isLoading } = useMerits();
  const { isAdmin, testTier, getEffectiveTier } = useAdminTierTest();
  const tier = getEffectiveTier(realTier);

  // Admin tier-test override preserves QA tier-switcher
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
// useFeatureGate (lines 139-159) unchanged — it consumes the return shape only.
```

**Critical:** `getEffectiveTier(realTier)` must wrap `realTier` (NOT raw `tier` from `useMerits`) so the admin tier override still works.

---

### `supabase/functions/analyze-resume/index.ts` (D-15) — legacy branch rip

**Analog:** self — collapse merit branch (lines 376-741) into unconditional path; delete legacy branch (lines 743-781+).

**Imports to delete** (line 13 — keep `withMerits`, `MeritRefundable`, `refundMeritsForJob`; drop `MERIT_SYSTEM_ENABLED`):

```typescript
// BEFORE
import { MERIT_SYSTEM_ENABLED, withMerits, MeritRefundable, refundMeritsForJob } from '../_shared/merit-gateway.ts';
// AFTER
import { withMerits, MeritRefundable, refundMeritsForJob } from '../_shared/merit-gateway.ts';
```

**Also delete from imports** (line 3):

```typescript
import { createUsageLimitResponse } from '../_shared/usage-checker.ts';   // ← DELETE (only legacy caller)
```

**Pitfall 5 (RESEARCH.md):** `createUsageLimitResponse` is still imported by 5 OTHER edge functions. Do NOT delete it from `_shared/usage-checker.ts`. Only delete the import line in analyze-resume.

**Module-scope log to delete** (line 18):

```typescript
createLogger("analyze-resume").info("merit-flag", { enabled: MERIT_SYSTEM_ENABLED });
```

**Branch guard to delete** (line 378) — collapse to unconditional:

```typescript
// BEFORE
if (MERIT_SYSTEM_ENABLED && userContext) {
  const meritCtx = { userId: userContext.userId, tier: resolvedTier, corsType: 'user' as const };
  const gated = await withMerits(meritCtx, 'resume_analysis', async (_txId) => {
    ... // lines 380-738
  });
  if (!gated.ok) return gated.response;
  return gated.value;
}
// === Legacy path (unchanged — MIG-05 regression test pins this) ===
... // lines 743-781+

// AFTER
if (!userContext) {
  return new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' }
  });
}
const meritCtx = { userId: userContext.userId, tier: resolvedTier, corsType: 'user' as const };
const gated = await withMerits(meritCtx, 'resume_analysis', async (_txId) => {
  ... // lines 380-738 (merit-path body preserved verbatim)
});
if (!gated.ok) return gated.response;
return gated.value;
```

**Variables removed in cleanup:** `usageUserId` (line 747), `checkResult` (line 749), `checkError` (line 749).

**Preserve verbatim:** the merit-path body (lines 380-738) — streaming, fallback, free-single-call path, parallel-call execution, result merging.

---

### `supabase/functions/_shared/merit-gateway.ts` (D-15) — delete flag

**Current state** (lines 26-33):

```typescript
// D-05: module-scope env read, cached for the life of the worker
export const MERIT_SYSTEM_ENABLED =
  (Deno.env.get('MERIT_SYSTEM_ENABLED') ?? '').toLowerCase() === 'true';

/** Convenience reader for callers that need the flag as a function call. */
export function readMeritFlag(): boolean {
  return MERIT_SYSTEM_ENABLED;
}
```

**Phase 30 action:** DELETE both the constant and `readMeritFlag` export.

**Pitfall 1 (RESEARCH.md Open Question 1):** 8 OTHER edge functions still import `MERIT_SYSTEM_ENABLED`. Removing the export breaks their import lines. The planner MUST resolve scope before deletion — either:
- **(a)** Expand Phase 30 to rip legacy branches in all 9 functions (cleanest, larger surface).
- **(b)** Keep the constant export, only remove from analyze-resume (limit blast radius).

**Recommended approach** (per RESEARCH.md): (a) is the cleanest; the constant becomes dead code if (b). Surface to operator before planning.

**Preserve verbatim:** `withMerits`, `MeritRefundable`, `isRefundableAnthropicError`, `refundMeritsForJob`, `AI_POOL_LIMIT`, all response helpers (lines 35+).

---

### `supabase/functions/analyze-resume/test-07.test.ts` (D-16) — Test 4 rewrite

**Analog:** the current Test 4 at lines 444-491 (inverted — current asserts presence of legacy substrings; new asserts absence).

**Current Test 4** (lines 444-491):

```typescript
Deno.test("TEST-07/4: MERIT_SYSTEM_ENABLED=false -> legacy path, zero merit_transactions", async () => {
  const src = await Deno.readTextFile(...);
  assert(src.includes("if (MERIT_SYSTEM_ENABLED && userContext)"), ...);
  assert(src.includes("can_perform_ai_action"), ...);
  assert(src.includes("createUsageLimitResponse"), ...);
  assert(src.includes("MERIT_SYSTEM_ENABLED") && src.includes("from '../_shared/merit-gateway.ts'"), ...);
  assertEquals(typeof gateway.readMeritFlag(), "boolean", ...);
  // legacyPathIdx > meritBranchIdx
});
```

**Phase 30 replacement** (positive merit-path-only assertions):

```typescript
Deno.test("TEST-07/4: analyze-resume runs unconditional merit path", async () => {
  const src = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
  );

  // Positive: merit path active
  assert(src.includes("withMerits("), "Must call withMerits unconditionally");
  assert(src.includes("'resume_analysis'"), "Must declare feature='resume_analysis'");

  // Negative: legacy substrates removed
  assert(!src.includes("MERIT_SYSTEM_ENABLED"), "MERIT_SYSTEM_ENABLED flag must be removed");
  assert(!src.includes("can_perform_ai_action"), "Legacy can_perform_ai_action RPC must be removed");
  assert(!src.includes("createUsageLimitResponse"), "Legacy createUsageLimitResponse import must be removed");
});
```

**Preserve verbatim:** Tests 1, 2, 3 (sync flow, retry refund, idempotent refund — they exercise the merit path).

---

### `supabase/functions/analyze-resume/legacy-unchanged.test.ts` — DELETE

**Current state** (whole 26-line file, currently asserts legacy substrings present):

```typescript
Deno.test("legacy path still contains can_perform_ai_action RPC", () => { ... });
Deno.test("legacy path still contains createUsageLimitResponse helper", () => { ... });
Deno.test("legacy path still contains usageUserId variable (canary)", () => { ... });
```

**Phase 30 action:** Delete the entire file. All three premises (`can_perform_ai_action`, `createUsageLimitResponse`, `usageUserId`) dissolve with D-15.

---

### `supabase/functions/analyze-resume/merit-branch.test.ts` — rewrite or DELETE (Pitfall 6)

**Current state** (lines 12-15 — asserts `MERIT_SYSTEM_ENABLED` import):

```typescript
Deno.test("analyze-resume imports MERIT_SYSTEM_ENABLED from merit-gateway.ts", () => {
  assert(
    src.includes("MERIT_SYSTEM_ENABLED") && src.includes("from '../_shared/merit-gateway.ts'"),
    "Expected MERIT_SYSTEM_ENABLED import from '../_shared/merit-gateway.ts'",
  );
});
```

**Phase 30 action (recommended):** Rewrite to assert unconditional merit-gateway use:

```typescript
Deno.test("analyze-resume imports withMerits from merit-gateway.ts (unconditional)", () => {
  assert(
    src.includes("withMerits") && src.includes("from '../_shared/merit-gateway.ts'"),
    "Expected withMerits import from '../_shared/merit-gateway.ts'",
  );
  assert(!src.includes("MERIT_SYSTEM_ENABLED"), "MERIT_SYSTEM_ENABLED must be removed");
});
```

**Preserve verbatim:** Tests at lines 19-26 (`withMerits` call presence, `MeritRefundable` import) — both still apply.

**Alternative:** delete the file entirely; the test-07.test.ts Test 4 rewrite (above) covers the same surface.

---

## Shared Patterns

### Auth / CORS (preserve everywhere)

**Source:** `supabase/functions/_shared/auth.ts` (`requireAuth`, `requireInternalOrUserAuth`), `supabase/functions/_shared/cors.ts` (`corsHeaders`, `handleOptionsRequest`)
**Apply to:** All edge function edits — DO NOT modify auth/CORS pathways.

The `reset-subscription-merits` edge function uses internal-secret auth (line 56: `realRequireAuth(r, { type: "internal" })`); preserve verbatim.

### Migration safety (NFR-01 — apply to all 3 new migrations)

**Source:** Phase 29 one-concern-per-migration + rollback convention (referenced via CONTEXT.md carry-forward and `migrations/20260414000000_merit_ledger_foundation.sql:165-200`).

```sql
-- Filename: 20260YYY00000_<single-concern-name>.sql (ISO timestamp prefix)
-- Body: a single concern (trigger update | backfill | RPC arm) — NEVER mix
-- End-of-file `DO $$ ... RAISE EXCEPTION` verification block if data is modified
-- Rollback block as -- comments at the bottom (text form, NOT executable)
```

### Migration source-literal naming (CONTEXT.md §Specifics)

**Source:** `migrations/20260415000001_phase_12_stripe_products_webhook.sql:198`
**Apply to:** Backfill migration ledger rows.

```sql
INSERT INTO public.merit_transactions(...) VALUES (..., 'grant', 'phase-30-free-backfill', ...);
-- mirrors 'phase-12-backfill' convention
```

### React Query cache coalescing (Pitfall 3 — apply to all 3 hooks)

**Source:** `src/hooks/useMerits.ts:32-56` — single query key `['merit-balance', userId]` + `staleTime: 5_000`.
**Apply to:** `useMerits`, `usePaywallGuard`, `useTierAccess` post-rewrite.

**Critical:** Do NOT change the queryKey shape. Three hooks subscribing to the same key get one round-trip via React Query coalescing. Changing it (e.g. adding `tier` to the key) triggers three round-trips per render.

### Hook signature stability (RESEARCH.md anti-pattern + UI-SPEC §Hook contract preservation)

**Apply to:** `useMerits`, `usePaywallGuard`, `useTierAccess`.

Public return-shape keys MUST NOT drift. 14 call-sites depend on them; signature changes would force a cross-feature ripple edit outside Phase 30's scope.

### Admin tier-test preservation (D-14)

**Source:** `src/contexts/AdminTierTestContext.tsx` (consumed via `useAdminTierTest()` in `usePaywallGuard.ts:17` and `useTierAccess.ts:51`).
**Apply to:** Both hook rewrites.

```typescript
const { isAdmin, testTier, getEffectiveTier } = useAdminTierTest();
const tier = getEffectiveTier(realTier);   // ← wraps real tier, NOT raw `tier` from useMerits
```

Without wrapping, QA's tier-switcher in admin mode breaks silently.

### Test colocation + fake supabase builder

**Source:** `supabase/functions/reset-subscription-merits/index.test.ts:76-110` — single-object query-builder fake.
**Apply to:** Any new Deno test for the edge function. Reuse the `buildQuery()` helper signature so the chain `.from(...).select(...).lte(...).in(...).limit(...)` resolves consistently.

---

## No Analog Found

Files with no close match in the codebase (planner uses RESEARCH.md guidance directly):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `.planning/REQUIREMENTS.md` (MER-11 edit) | doc | — | doc edit — use D-17 commit message verbatim: `docs(30): amend MER-11 wording — drop bonus chip from header trigger` |
| `.planning/ROADMAP.md` (SC #3 edit) | doc | — | doc edit per D-17 |
| `.planning/PROJECT.md` (Current State) | doc | — | doc edit — Free-tier "5 lifetime" → "10 monthly replenishing" |
| `.planning/STATE.md` (Accumulated Context) | doc | — | doc edit — same Free-tier update |

---

## Metadata

**Analog search scope:**
- `supabase/migrations/*.sql` (Phase 10, 11, 12, 13 patterns)
- `supabase/functions/reset-subscription-merits/` (edge function + test)
- `supabase/functions/analyze-resume/` (legacy branch, test-07, legacy-unchanged, merit-branch)
- `supabase/functions/_shared/{merit-gateway,date-utils,auth,cors}.ts`
- `src/hooks/{useMerits,usePaywallGuard,useTierAccess}.ts`
- `src/components/topup/MeritBalanceHeaderV2.{tsx,test.tsx}`
- `src/config/pricing-config.ts`
- `src/contexts/AdminTierTestContext.tsx`

**Files scanned:** ~18 (all targeted reads against CONTEXT/RESEARCH file list — no broad recursion).
**Pattern extraction date:** 2026-05-17

**Cross-references:**
- CONTEXT.md D-01..D-17 (locked decisions)
- RESEARCH.md Patterns 1-8 (concrete code shapes)
- UI-SPEC.md (component visual contract)
