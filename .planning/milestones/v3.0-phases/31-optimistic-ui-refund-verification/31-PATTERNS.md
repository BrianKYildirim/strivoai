# Phase 31: Optimistic UI + Refund Verification - Pattern Map

**Mapped:** 2026-05-19
**Files analyzed:** 13 (2 new src, 1 modified src hook, 1 modified edge shared, 5 modified pages, 2 new edge tests, 1 new src test, runner registration)
**Analogs found:** 13 / 13 (every touched file has an in-repo analog)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/hooks/useMerits.ts` (MODIFY) | hook | request-response (RQ cache) | self — `useInvalidateMerits` (lines 88-91) + `queryFn` shape (32-60) | exact (same file) |
| `src/lib/merit-error-messages.ts` (NEW) | utility (string-table lookup) | transform (code/status → `{title,description}`) | `src/lib/analysisHelpers.ts`, `src/lib/utils.ts` (pure named-export modules) | role-match |
| `supabase/functions/_shared/anthropic.ts` (MODIFY) | service (AI client) | request-response w/ fault-injection branch | self — `AI_FORCE_FAILURE` branch (528-537 sync, 700-708 stream) | exact (same file, twin branch) |
| `src/pages/Upload.tsx` (MODIFY) | page | request-response (streaming hand-off) | self error block (295-331); peers below | exact-ish |
| `src/pages/CareerCompass.tsx` (MODIFY) | page | event-driven (async poll loop) | self poll loop (555-624) | exact (only async poll analog) |
| `src/pages/LinkedInGrader.tsx` (MODIFY) | page | request-response | self catch (427-433) + RecruitingLens | exact |
| `src/pages/RecruitingLens.tsx` (MODIFY) | page | request-response (result-wrapper) | self settle block (435-455) | exact |
| `src/pages/InterviewPrep.tsx` (MODIFY) | page | request-response (result-wrapper) | self settle block (274-286) | exact |
| `supabase/functions/_shared/merit-gateway.refund.test.ts` (NEW) | test (Deno staging integration) | batch (provision→inject→assert) | `_shared/merit-idempotency.test.ts` (full harness) | exact pattern |
| `supabase/functions/_shared/merit-refund-idempotency.test.ts` (NEW) | test (Deno staging integration) | batch (RPC replay) | `_shared/merit-idempotency.test.ts` Test 1 (204-286) | exact pattern |
| `scripts/run-edge-tests.ps1` (MODIFY) | config (runner registration) | n/a | self (lines 18-50, explicit file list) | exact |
| `src/lib/merit-error-messages.test.ts` (NEW, NFR-04) | test (Vitest pure-fn) | unit | `src/hooks/__tests__/useMerits.test.ts` (vitest+mock) | role-match |
| `src/hooks/useMerits.test.tsx` (NEW, OPTIONAL D-14) | test (Vitest hook) | unit | `src/hooks/__tests__/useMerits.test.ts` (renderHook + QueryClientProvider) | exact pattern |

> **Do NOT modify:** `supabase/functions/_shared/merit-gateway.ts` and `supabase/migrations/20260415000000_merit_rpcs.sql` — verification targets only (CONTEXT D-15/D-16).

## Pattern Assignments

### `src/hooks/useMerits.ts` (hook, RQ cache mutation) — ADD `optimisticDeduct`

**Analog:** self. The `useInvalidateMerits` helper and the `queryFn` return shape are the two load-bearing seams.

**Query-shape seam — MUST mirror exactly** (`useMerits.ts:32-63`). `total` is read from `data.balance.total`, NOT a flat field. `optimisticDeduct` must `setQueryData` the **nested** `{ balance, tier }` shape:
```typescript
// queryFn return (lines 48-51):
return {
  balance: balanceRes.data,   // <- row from get_merit_balance RPC; total lives at balance.total
  tier: (...)  as Tier,
};
// derived read (line 58-60):
const balance = (data as { balance?: Record<string, number | string | null> } | undefined)?.balance ?? null;
const total = (balance?.total as number | undefined) ?? 0;
```
> Pitfall 1 (RESEARCH): a flat `setQueryData({ total })` makes `total` read 0. Snapshot the whole value, spread, mutate only `balance.total`.

**Invalidate seam to reuse for `commit()`/`rollback()`** (`useMerits.ts:88-91`):
```typescript
export function useInvalidateMerits() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['merit-balance'] });
}
```

**Recommended new export** (closure-captured snapshot per D-01 / RESEARCH Pattern 1). `useMerits()` must gain access to `queryClient` (via `useQueryClient()`) and already has `userId` in state:
```typescript
const optimisticDeduct = (cost: number) => {
  const key = ['merit-balance', userId] as const;
  const previous = queryClient.getQueryData(key);            // full snapshot {balance,tier}
  const prevTotal = (previous as any)?.balance?.total;
  if (typeof prevTotal === 'number') {
    queryClient.setQueryData(key, {
      ...(previous as object),
      balance: { ...(previous as any).balance, total: prevTotal - cost },
    });
  }
  return {
    rollback: () => { queryClient.setQueryData(key, previous); queryClient.invalidateQueries({ queryKey: ['merit-balance'] }); },
    commit:   () => { queryClient.invalidateQueries({ queryKey: ['merit-balance'] }); },
  };
};
```
> Backwards-compatible — add to the returned object; existing consumers (`DashboardHome`, `LowBalanceWarning`, `MeritCostPreview`, `Navbar`) ignore the new field. Extend the `MeritBalance` interface (lines 6-17) with `optimisticDeduct`.

---

### `src/lib/merit-error-messages.ts` (utility, transform) — NEW

**Analog:** `src/lib/analysisHelpers.ts` / `src/lib/utils.ts` — flat pure named-export modules (no class, no hook). Keep it a single function + table per CLAUDE.md ("single helper, not a framework").

**Toast shape to emit** must match the universal sonner call across all 5 pages: `toast.error(title, { description })`. So the return record should be `{ title: string; description?: string }` (planner may add an optional `action` per discretion).

**Refund taxonomy axis** keys off the same classification as `isRefundableAnthropicError` (`merit-gateway.ts:51`): 5xx, 529, 408, AbortError, network/timeout → refundable; 402 insufficient, 429 rate-limit, 4xx/validation → non-refundable. Per D-10, refundable AI-error rows say "Merits refunded" (deduct settled then refunded — see RESEARCH Pattern 3 table), rate-limit/cache-bypass say "no charge", non-refundable 4xx must NOT mention merits.

**Suggested signature** (D-09): `export function getMeritErrorMessage(codeOrStatus: number | string, ctx?: { resetDate?: string; retryAfterSec?: number }): { title: string; description?: string }`.

---

### `supabase/functions/_shared/anthropic.ts` (service) — ADD fault-injection branch

**Analog:** the existing `AI_FORCE_FAILURE` two-key branch — **TWO insertion points** (sync + streaming twin must both be updated, Pitfall 2).

**Sync entry** (`anthropic.ts:527-537`):
```typescript
export async function invokeAnthropicText(params: AnthropicInvokeParams): Promise<AnthropicInvokeResult> {
  if (
    (Deno.env.get('AI_TEST_MODE') || '').toLowerCase() === 'true' &&
    (Deno.env.get('AI_FORCE_FAILURE') || '').toLowerCase() === 'true'
  ) {
    return { ok: false, status: 529, error: 'forced-failure' };
  }
```

**Streaming twin** (`anthropic.ts:697-708`):
```typescript
export async function* streamAnthropicText(params: AnthropicInvokeParams): AsyncGenerator<StreamChunk> {
  if (
    (Deno.env.get('AI_TEST_MODE') || '').toLowerCase() === 'true' &&
    (Deno.env.get('AI_FORCE_FAILURE') || '').toLowerCase() === 'true'
  ) {
    yield { type: 'error', status: 529, message: 'forced-failure' };
    return;
  }
```

**New branch to add** (D-12/D-13, parallel to — not replacing — `AI_FORCE_FAILURE`; leave the old one untouched, it's referenced by `anthropic.test.ts`). Add a module-scope helper and call it at the top of BOTH functions:
```typescript
const STAGING_HOST = 'cimjltzovkahkqecpwgi'; // staging project ref (scripts/deploy-staging.ps1)
function refundableErrorOverride(): { status: number; error: string } | null {
  const flag = (Deno.env.get('MERIT_TEST_FORCE_REFUNDABLE_ERROR') ?? '').trim();
  if (!flag) return null;
  const url = Deno.env.get('SUPABASE_URL') ?? '';                       // D-13 staging gate
  const isStaging = url.includes(STAGING_HOST) || (Deno.env.get('STRIVO_ENV') ?? '') === 'staging';
  if (!isStaging) return null;
  const status = /^\d{3}$/.test(flag) ? Number(flag) : 529;             // 'true' → 529 default
  return { status, error: 'forced-refundable-error' };
}
```
> Module-scope env-read convention matches `MERIT_SYSTEM_ENABLED` in `merit-gateway.ts:27-28`. Sync: `const f = refundableErrorOverride(); if (f) return { ok: false, status: f.status, error: f.error };`. Stream: `if (f) { yield { type:'error', status:f.status, message:f.error }; return; }`.
> **A4 verify first:** grep each of the 4 non-resume sync `index.ts` for `withMerits(` AND `invokeAnthropicText(`/`streamAnthropicText(` to confirm the chokepoint actually reaches them before relying on the single toggle.

---

### Feature pages — `optimisticDeduct` wiring + `getMeritErrorMessage` swap

All 5 share the same edit recipe: `const settle = useMerits().optimisticDeduct(cost)` at submit; `settle.commit()` on success; `settle.rollback()` + `toast.error(getMeritErrorMessage(...))` on error. Keep the existing `openModal` for 402 (D-03). Per-path current state below.

#### `src/pages/Upload.tsx` (page, streaming hand-off) — TRICKIEST

Current error block (`Upload.tsx:295-331`) uses a manual string-match cascade (`isCreditsError`/`isNetworkError`) + `openModal` for 402 + generic `toast.error(errorMsg)`. Replace the cascade with `getMeritErrorMessage`; keep `openModal`.
```typescript
// Upload.tsx:304-327 — the string-match cascade to REPLACE:
const isCreditsError = lowerError.includes('payment') || lowerError.includes('402') || lowerError.includes('credit');
const isNetworkError = lowerError.includes('network') || ... || lowerError.includes('500');
if (isCreditsError) { openModal({ feature: 'Resume Analysis', cost: meritCost, balance: total }); }
else if (isNetworkError) { toast.error("Connection Error", { description: ... }); }
else { toast.error(errorMsg); }
```
> **Streaming caveat (Open Q2):** the analysis runs on the **Results page** via `useResumeStream` after a sessionStorage hand-off + navigate (`Upload.tsx:280-294`). Recommendation: fire `optimisticDeduct` inside `useResumeStream` start (single-page lifecycle on Results), settle on stream-complete/stream-error — avoid threading the snapshot across navigation. Flag for explicit planning.

#### `src/pages/CareerCompass.tsx` (page, async poll loop) — D-04 snapshot held across loop

Poll loop terminal branches (`CareerCompass.tsx:555-624`). Capture `const settle = optimisticDeduct(cost)` ONCE before `submit-*-job`, hold across the loop, then:
- `completed` (line 560) → `settle.commit()` (the existing `invalidateMerits()` at 563 becomes part of commit)
- `failed` (572) / poll-timeout (624) / outer `catch` (628) → `settle.rollback()` + route AI-error toast through `getMeritErrorMessage`
Existing bespoke branches (`missing_prior_analyses`, `linkedin_prior_missing`, `rate_limit_exceeded`, `usage_limit`, `isInfrastructureFailure`) stay; only the generic `toast.error(errorMessage)` (615) routes through the new helper.
> Pitfall 4: do NOT call `optimisticDeduct` inside the loop; one `const` before the loop.

#### `src/pages/LinkedInGrader.tsx` (page) — single catch (`427-433`)
```typescript
} catch (error) {
  const message = error instanceof Error ? error.message : 'Failed to analyze profile';
  toast.error(message);          // <- wrap message through getMeritErrorMessage(status); add settle.rollback()
}
```

#### `src/pages/RecruitingLens.tsx` (page, result-wrapper) — settle block (`435-455`)
```typescript
if (result.success && result.data) { ...; invalidateMerits(); ...; }   // -> settle.commit()
else if (result.error) { toast.error(result.error); ... }              // -> settle.rollback() + getMeritErrorMessage
```

#### `src/pages/InterviewPrep.tsx` (page, result-wrapper) — settle block (`274-286`)
```typescript
if (result.success && result.data) { ...; invalidateMerits(); refreshPaywall(); return; }  // -> settle.commit()
const message = mapServerError((result as ...).data ?? null, new Error(result.error ?? ""));
toast.error(message);                                                                       // -> replace mapServerError with getMeritErrorMessage; settle.rollback()
```

---

### `supabase/functions/_shared/merit-gateway.refund.test.ts` (NEW, D-15) + `merit-refund-idempotency.test.ts` (NEW, D-16)

**Analog:** `supabase/functions/_shared/merit-idempotency.test.ts` — the proven staging harness. Copy verbatim:

**Gate + assert imports** (`merit-idempotency.test.ts:46-48`):
```typescript
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
const GATED = () => Deno.env.get("DENO_TEST_SUPABASE_REMOTE") === "1";
```

**Fresh service-role client** (`78-89`):
```typescript
async function freshClient() {
  const { createClient } = await import("npm:@supabase/supabase-js@2");
  const url = Deno.env.get("SUPABASE_URL"); const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set ...");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
```

**Provision / teardown / readBalance** (`98-184`) — reuse `provisionTestUser(startingBalance)` (Admin API + seed `user_merits`, randomly-suffixed `@strivo-test.invalid` email), `teardownTestUser` (CASCADE delete), `readBalance` (sum subscription+shop). This is RESEARCH "Don't Hand-Roll" #5.

**Per-test skip-guard + try/finally teardown** (`206-286`):
```typescript
Deno.test("...", async () => {
  if (!GATED()) { console.log("[...] SKIP — set DENO_TEST_SUPABASE_REMOTE=1 ..."); return; }
  const userId = await provisionTestUser(STARTING_BALANCE);
  try { /* inject + assert exact balance equality (not deltas) */ } finally { await teardownTestUser(userId); }
});
```

**Refund test (D-15):** for each refundable class (500, 529, 408, AbortError→408, network/timeout): seed 100 → set `MERIT_TEST_FORCE_REFUNDABLE_ERROR=<status>` → call endpoint → **assert forced error returned FIRST** (Pitfall 3 guard against vacuous pass) → `assertEquals(readBalance, 100)`. Plus 7 thin per-path smoke tests (one forced-error each) confirming each endpoint wires the gateway.

**Idempotency replay (D-16):** mirror Test 1 (`204-286`) but call `refund_merits(p_user_id, p_transaction_id)` twice on a seeded `feature-deduct` `merit_transactions` row: first → `refunded` + balance restored; second → `error === 'already_refunded'` + balance UNCHANGED (`assertEquals` exact equality). SQL invariant at `migrations/20260415000000_merit_rpcs.sql:185-193`.

**Always-on skip-guard self-check** (`381-391`) — copy the bottom test so default unit runs don't fail.

**MUST register both files** in `scripts/run-edge-tests.ps1` — see Shared Patterns below; otherwise they don't run (RESEARCH Wave 0 gap).

---

### `src/lib/merit-error-messages.test.ts` (NEW, NFR-04) + optional `useMerits.test.tsx` (D-14)

**Analog:** `src/hooks/__tests__/useMerits.test.ts` — Vitest + `vi.mock('@/lib/supabaseClient', ...)` + `renderHook` + `QueryClientProvider` wrapper.

**Vitest mock + render pattern** (`useMerits.test.ts:25-60`):
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
vi.mock('@/lib/supabaseClient', () => ({ supabase: { auth: { getUser: ..., onAuthStateChange: ... }, rpc: ..., from: ... } }));
function makeWrapper() { const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }); ... }
```
> `merit-error-messages.test.ts` is the cheaper, higher-value one (pure function, no mock needed) — assert `getMeritErrorMessage` returns the right `{title,description}` per class and that refundable rows mention refund / 4xx rows do not. The `optimisticDeduct` hook test is OPTIONAL per D-14 (refund proof lives in Deno staging tests, not Vitest).

---

## Shared Patterns

### Sonner toast call shape
**Source:** every feature page — `toast.error(title, { description })` (e.g. `Upload.tsx:323-325`, `CareerCompass.tsx:611-613`).
**Apply to:** `merit-error-messages.ts` return shape and all 5 page error blocks.

### React Query optimistic update
**Source:** `useMerits.ts:88-91` (`invalidateQueries(['merit-balance'])`) + `queryFn` nested `{balance,tier}` shape (48-51).
**Apply to:** `optimisticDeduct` (`setQueryData` decrement + `getQueryData` snapshot) and all 7 settle sites.

### Staging Deno test harness (gate + provision + teardown)
**Source:** `merit-idempotency.test.ts` — `GATED()`, `freshClient`, `provisionTestUser`, `teardownTestUser`, `readBalance`, per-test skip + always-on skip-guard.
**Apply to:** both new refund test files. Run via `.\scripts\run-edge-tests.ps1` with `DENO_TEST_SUPABASE_REMOTE=1` + staging creds + `MERIT_TEST_FORCE_REFUNDABLE_ERROR` set on the staging fn env.

### Edge-test runner registration
**Source:** `scripts/run-edge-tests.ps1:18-50` — explicit backtick-continued file list ending `--no-check`.
**Apply to:** append `_shared/merit-gateway.refund.test.ts` and `_shared/merit-refund-idempotency.test.ts` to the list (between line 33 `merit-idempotency.test.ts` and the closing). Without this they silently never run.

### Env-gated module-scope flag read
**Source:** `merit-gateway.ts:27-28` (`MERIT_SYSTEM_ENABLED`); `anthropic.ts:532-537` (`AI_TEST_MODE`+`AI_FORCE_FAILURE`).
**Apply to:** the new `MERIT_TEST_FORCE_REFUNDABLE_ERROR` + staging-host gate in `anthropic.ts`.

## No Analog Found

None. Every file Phase 31 touches has a direct in-repo analog — this is a wiring + verification phase, not a greenfield build (RESEARCH Summary).

## Metadata

**Analog search scope:** `src/hooks/`, `src/lib/`, `src/pages/`, `supabase/functions/_shared/`, `scripts/`
**Files scanned (read for excerpts):** `useMerits.ts`, `anthropic.ts` (3 ranges), `merit-idempotency.test.ts`, `Upload.tsx`, `InterviewPrep.tsx`, `RecruitingLens.tsx`, `LinkedInGrader.tsx`, `CareerCompass.tsx`, `useMerits.test.ts`, `run-edge-tests.ps1`
**Pattern extraction date:** 2026-05-19
