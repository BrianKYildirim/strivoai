# Phase 31: Optimistic UI + Refund Verification - Research

**Researched:** 2026-05-19
**Domain:** React Query optimistic updates + Supabase Edge Function fault-injection verification (Deno staging tests)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (D-01..D-16 — verbatim)

**Optimistic deduct hook API + async UX**
- **D-01:** `useMerits` exposes `optimisticDeduct(cost: number): { rollback: () => void; commit: () => void }`. The hook captures the pre-deduct balance into a per-call snapshot and writes `total = previous - cost` via `queryClient.setQueryData(['merit-balance', userId], …)`. Each invocation gets its own snapshot — **per-submit scoping**, not a hook-level ref — so concurrent submits across features don't trample each other.
- **D-02:** **Settle model = snapshot + manual rollback.** On success the caller calls `commit()` which invalidates `merit-balance` to sync to the authoritative DB value. On error the caller calls `rollback()` which restores the snapshot **and** invalidates. NFR-03 (<2 s restore) is trivially met because rollback is synchronous (no DB round-trip).
- **D-03:** Optimistic deduct **fires immediately on click** — before any `canAfford` re-check or network call. If the server rejects with 402 INSUFFICIENT_MERITS, the caller invokes `rollback()` and shows the upgrade modal. The current `canAfford` precheck stays as a UX guard, but does NOT gate the optimistic update.
- **D-04:** **Async workers use the same hook.** Submit → `optimisticDeduct(cost)` captures the snapshot; the page **holds the snapshot across the poll loop**. On poll-detected terminal status: success → `commit()`, failure → `rollback()`. Sync and async paths share one optimistic contract.

**Cache-hit ↔ optimistic interaction**
- **D-05:** **Always invalidate on settle — authoritative refetch is the source of truth.** Phase 29 D-15 makes cache hits bypass server-side deduction. The client doesn't try to detect cache hits; `commit()` invalidates `merit-balance` and the refetch returns the correct value. No `cache_hit` flag on the envelope; no inline balance return.
- **D-06:** **No visible signal during the "wiggle" window.** `get_merit_balance` is a single indexed RPC; the refetch typically returns in <300 ms (NFR-03 budgets 2 s). No pulse, no skeleton, no badge.
- **D-07:** **Invalidate fires on response received, not after result renders.** As soon as the fetch promise resolves (before parsing the analysis result), `commit()` invalidates `merit-balance`.

**Failure-mode toast taxonomy (NFR-04)**
- **D-08:** **Taxonomy axis = error class, single shared message set across all 5 features.** Not per-feature, not interpolated. Loses the feature noun in favor of one source of truth and zero drift risk.
- **D-09:** **Strings live in `src/lib/merit-error-messages.ts`** as a single module exporting `getMeritErrorMessage(errorCode | httpStatus): { title, description }`. Imported by all 5 feature pages and the async poll loops. No per-page override hook.
- **D-10:** **Toasts explicitly mention refund status on refundable paths.** Refundable errors say "No charge" (deduct never settled — server-side refund fired) or "Merits refunded" (deduct happened and `refund_merits` ran). Non-refundable errors (4xx, parse failures, sanitizer rejections) do NOT mention merits.
- **D-11:** **In-scope failure modes:** Refundable AI errors (5xx, 529, 408, AbortError, network — each distinct message); Insufficient merits (402, "resets on {date}"); Rate-limit (429 pooled `ai-analyses-all`, "try again in {N}s. No charge."); Validation/4xx (non-refundable, must NOT promise refund).

**Refund verification methodology**
- **D-12:** **Fault injection via `MERIT_TEST_FORCE_REFUNDABLE_ERROR` env in `_shared/anthropic.ts`.** When set (to `true`, `529`, `408`, etc.), `invokeAnthropicText` returns `{ ok: false, status: 529, error: 'forced-overload' }` (or the specified status) without calling Anthropic. One toggle, all 7 paths covered.
- **D-13:** **Safety gate = staging-only by host check.** Code reads `Deno.env.get('SUPABASE_URL')` and ignores the flag unless the host matches the known staging host (or a `STRIVO_ENV=staging` sentinel). Production deploy ships the path inert.
- **D-14:** **Evidence surface = Deno tests against staging**, mirroring Phase 29's `TEST-02` pattern: `DENO_TEST_SUPABASE_REMOTE=1` + `MERIT_TEST_USER_ID`. Seed balance → set flag → call endpoint → assert balance restored. Recorded in `31-VERIFICATION.md`. No Vitest hook test required for refund proof; Vitest stays for `optimisticDeduct` rollback unit tests if planning surfaces a need.
- **D-15:** **Test structure = one gateway-level test + 7 thin per-path smoke tests.** Gateway test exhaustively covers `withMerits` + `refundMeritsForJob` across every refundable error class AND the MER-06 idempotency replay. Each of the 7 endpoints gets one thin smoke test confirming wiring.
- **D-16:** **MER-06 idempotency replay test = Deno test calling `refund_merits` RPC twice.** Seed a `merit_transactions` row → call twice → assert first returns `refunded`, second returns `already_refunded` with no balance mutation. Tests SQL invariant at `migrations/20260415000000_merit_rpcs.sql:185-193` directly.

### Claude's Discretion (planner / executor)
- Where the optimistic snapshot is stored (component state vs closure returned by `optimisticDeduct()` vs React Query mutation context). D-01 fixes the API surface + per-submit scoping; planner picks the cleanest impl across 5 pages + 2 poll loops.
- Exact toast copy strings — must satisfy D-10 + NFR-04. Planner drafts; user reviews in plan-review. (UI-SPEC table is the binding draft.)
- Whether `merit-error-messages.ts` returns sonner-flavored `{ title, description }` or a richer record with an `action`. Planner picks based on existing patterns.
- Test fixture user provisioning — reuse Phase 29 `MERIT_TEST_USER_ID` or seed a phase-31 user.
- Exact staging-host detection pattern in D-13 (substring match, env sentinel, or both) that won't false-negative on URL rotation.

### Deferred Ideas (OUT OF SCOPE)
- Per-feature toast copy with feature-noun interpolation (rejected per D-08).
- `cache_hit` flag on response envelope + immediate client rollback (rejected per D-05).
- Inline balance in every analyze response (rejected — schema churn).
- Pulse/skeleton signal during in-flight optimistic deduct (rejected per D-06).
- Per-page override hook for toast copy (rejected per D-09).
- 7 per-path exhaustive tests (rejected in favor of 1 gateway + 7 smoke per D-15).
- Gateway-level MER-06 integration test (rejected — SQL is load-bearing per D-16).
- `INTERNAL_JOB_SECRET`-gated fault injection (rejected in favor of host detection per D-13).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MER-03 | Optimistic merit deduct on click; restore authoritative value on failure/refund | `useMerits.ts:88-91` (`useInvalidateMerits` seam) + React Query `setQueryData` over `['merit-balance', userId]` is the existing optimistic seam. Pattern documented below. |
| MER-05 | Refund-on-failure fires for all refundable error classes across 5 sync + 2 async paths | Gateway already implements this (`merit-gateway.ts:240-269` sync, `refundMeritsForJob:281` async). Both workers already call it (`process-career-analysis-job/index.ts:187-206, 235-255`). Phase 31 adds fault-injection + Deno proof. |
| MER-06 | Replaying same `merit_transaction_id` → `already_refunded`, no balance mutation | SQL guard at `20260415000000_merit_rpcs.sql:185-193` confirmed present. Test pattern mirrors existing `merit-idempotency.test.ts`. |
| NFR-03 | Balance restores to authoritative value within 2 s on failure | `rollback()` is synchronous `setQueryData` (no DB round-trip) → trivially <2 s. `commit()` refetch via `get_merit_balance` indexed RPC <300 ms observed. |
| NFR-04 | Specific error-class-keyed toasts; never "Something went wrong" | New `src/lib/merit-error-messages.ts`; UI-SPEC §Copywriting Contract is the binding draft. Refund taxonomy keyed off `isRefundableAnthropicError` (`merit-gateway.ts:51`). |
</phase_requirements>

## Summary

Phase 31 is a **wiring + verification** phase, not a build phase. Every piece of refund infrastructure already exists and is already wired: the gateway's `withMerits` (sync) and `refundMeritsForJob` (async) own all refund control flow, both async workers already call `refundMeritsForJob` before flipping a job to `failed`, and the SQL `refund_merits` idempotency guard is already in place. The frontend `useMerits` hook already exposes the exact React Query seam (`setQueryData` over `['merit-balance', userId]`) that `optimisticDeduct` needs.

The two genuinely new artifacts are: (1) `optimisticDeduct(cost)` added to `useMerits.ts` returning `{ rollback, commit }`, wired into 5 sync pages + 2 async poll loops; and (2) `src/lib/merit-error-messages.ts`, a single error-class→`{title,description}` map. The verification half adds a fault-injection branch to `anthropic.ts` (gated to staging) plus one gateway-level Deno test + 7 thin per-path smoke tests + the MER-06 SQL replay test, all run against staging using the existing Phase 29 `DENO_TEST_SUPABASE_REMOTE=1` harness.

**Critical pre-existing-code finding:** `anthropic.ts` already contains a two-key fault-injection mechanism (`AI_TEST_MODE` + `AI_FORCE_FAILURE` → returns `{ ok: false, status: 529, error: 'forced-failure' }`, lines 528-537 and 700-708 for the stream variant). D-12's `MERIT_TEST_FORCE_REFUNDABLE_ERROR` is a near-duplicate that adds (a) configurable status codes (529/408/etc) and (b) the D-13 staging-host gate. The planner must decide whether to extend the existing branch or add a parallel one — see Open Question 1.

**Primary recommendation:** Store the optimistic snapshot in the **closure returned by `optimisticDeduct()`** (not component state, not RQ mutation context). It is the only option that satisfies D-01 per-submit scoping with zero per-page state plumbing, reads identically across all 7 paths, and survives an async poll loop by being held in a single `const` for the loop's lifetime.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Optimistic balance decrement on click | Frontend (React Query cache) | — | Pure client UX; `setQueryData` mutation is client-only by design (D-01) |
| Authoritative balance reconcile | API/DB (`get_merit_balance` RPC) | Frontend (invalidate→refetch) | DB is source of truth; client only triggers refetch (D-05) |
| Merit deduct + refund control flow | API/Backend (`withMerits`) | — | Gateway owns this per Phase 13 D-03; Phase 31 does NOT modify it |
| Async refund on job failure | API/Backend (`refundMeritsForJob`) | — | Workers can't double-deduct; gateway-owned refund surface |
| Refund idempotency | Database (`refund_merits` SQL) | — | Constraint owned by SQL per D-16, not the gateway |
| Fault injection | API/Backend (`anthropic.ts`) | — | Single chokepoint all 7 paths funnel through |
| Error-class toast copy | Frontend (`merit-error-messages.ts`) | — | Pure presentation; one shared module (D-08/D-09) |

## Standard Stack

This phase introduces **zero new dependencies**. Everything uses installed libraries.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @tanstack/react-query | 5.83.0 [VERIFIED: package.json] | Optimistic cache update + invalidate | Already the merit-balance store; `setQueryData`/`invalidateQueries` are the canonical optimistic primitives |
| sonner | 1.7.4 [VERIFIED: package.json] | Toast rendering | Established `toast.error(title, { description })` pattern across all 5 pages |
| Deno std assert | 0.224.0 [VERIFIED: merit-idempotency.test.ts:46] | Staging Deno test assertions | The exact version used by the existing idempotency test |
| @supabase/supabase-js | 2 (npm: in Deno tests) [VERIFIED: merit-idempotency.test.ts:78] | Service-role client for staging seed/read | Matches existing test harness |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | 3.25.76 [VERIFIED: package.json] | (existing) form validation | Only relevant for the 4xx/validation toast class — no new schemas needed |

**Installation:** None required.

## Architecture Patterns

### System Architecture Diagram

```
                          ┌─────────────── FRONTEND (5 sync pages + 2 async poll loops) ───────────────┐
                          │                                                                            │
  user click ─────────────▶ optimisticDeduct(cost) ──▶ snapshot = previous balance (closure-captured) │
                          │         │                   setQueryData(['merit-balance',uid], total-cost)│
                          │         │                                                                  │
                          │         ▼                                                                  │
                          │   invokeWithTimeout / stream / submit-job ──────────┐                      │
                          └──────────────────────────────────────────────────────┼──────────────────┘
                                                                                 │
                          ┌──────────────────── EDGE FUNCTION ────────────────────▼─────────────┐
                          │  withMerits(ctx, feature, fn)                                        │
                          │   1. rate-limit (pooled 60/hr 'ai-analyses-all')                     │
                          │   2. check_and_deduct_merits RPC  ──▶ transactionId                  │
                          │   3. fn(txId): invokeAnthropicText(...)                              │
                          │         │                                                            │
                          │         ├── [MERIT_TEST_FORCE_REFUNDABLE_ERROR + staging host]       │
                          │         │     └─▶ { ok:false, status:529 } (no Anthropic call)       │
                          │         │                                                            │
                          │   4. throw MeritRefundable(status,msg) on !r.ok                      │
                          │   5. classify → refund_merits RPC → re-throw                         │
                          └──────────────────────────────────┬──────────────────────────────────┘
                                                             │ refund_merits(uid, txId)
                          ┌──────────────────── DATABASE ─────▼──────────────────┐
                          │  idempotency guard: if refund row exists for          │
                          │  deduction_id → return {error:'already_refunded'}     │
                          │  else write mirror rows + restore buckets             │
                          └───────────────────────────────────────────────────────┘

  ASYNC path: submit-*-job → worker picks up → invokeAnthropicText fails →
              refundMeritsForJob(uid, merit_transaction_id, reason) → refund_merits RPC
              → worker sets job status='failed' → poll loop detects 'failed' → rollback()

  On settle (success OR failure): commit()/rollback() → invalidateQueries(['merit-balance'])
              → get_merit_balance refetch → authoritative value (<300 ms)
```

### Recommended Project Structure
```
src/
├── hooks/useMerits.ts          # ADD optimisticDeduct(cost) → { rollback, commit }
├── lib/merit-error-messages.ts # NEW: getMeritErrorMessage(code|status) → { title, description }
└── pages/
    ├── Upload.tsx              # sync — streaming path (Results page), submit at handleUpload
    ├── CareerCompass.tsx       # ASYNC — poll loop 546-621
    ├── LinkedInGrader.tsx      # sync — invokeWithTimeout
    ├── RecruitingLens.tsx      # sync — invokeWithTimeout
    └── InterviewPrep.tsx       # sync — invokeWithTimeout (uses a withMerits-style result wrapper, 274-285)
supabase/functions/
├── _shared/anthropic.ts        # ADD MERIT_TEST_FORCE_REFUNDABLE_ERROR branch (staging-gated)
└── _shared/
    ├── merit-gateway.refund.test.ts  # NEW gateway-level exhaustive test (D-15)
    └── merit-refund-idempotency.test.ts # NEW MER-06 replay test (D-16) — or extend merit-idempotency.test.ts
```

### Pattern 1: Closure-captured optimistic snapshot (RECOMMENDED for D-01)
**What:** `optimisticDeduct` captures the current cache value in a local `const`, writes the decremented value, and returns `{ rollback, commit }` closures that close over that captured value.
**When to use:** All 5 sync pages + both async poll loops.
**Why this over component state / RQ mutation context:**
- **Per-submit scoping (D-01) is automatic** — each call to `optimisticDeduct` creates a fresh closure; concurrent submits each hold their own `previous`. Component state would need an array/map keyed by submit-id; RQ mutation context only scopes within one `useMutation` instance (none of these pages use `useMutation`).
- **Survives the async poll loop (D-04)** — the page holds `const { rollback, commit } = optimisticDeduct(cost)` in a single variable for the loop's lifetime and calls the right one on terminal status. No state churn across ~60 poll iterations.
- **Reads identically across all 7 paths** — three lines: deduct, then `commit()` or `rollback()`.

**Example:**
```typescript
// Source: pattern derived from existing useMerits.ts:88-91 + RQ 5 docs
// Inside useMerits(), with access to queryClient + userId:
const optimisticDeduct = (cost: number) => {
  const key = ['merit-balance', userId] as const;
  const previous = queryClient.getQueryData<MeritQueryShape>(key); // full snapshot
  // write decremented total into the SAME shape the queryFn returns
  if (previous?.balance) {
    queryClient.setQueryData(key, {
      ...previous,
      balance: { ...previous.balance, total: (previous.balance.total as number) - cost },
    });
  }
  return {
    rollback: () => {
      queryClient.setQueryData(key, previous);            // synchronous restore (NFR-03)
      queryClient.invalidateQueries({ queryKey: ['merit-balance'] }); // + authoritative refetch
    },
    commit: () => {
      queryClient.invalidateQueries({ queryKey: ['merit-balance'] }); // D-05/D-07
    },
  };
};
```
> **Snapshot-shape caveat (HIGH importance):** the `queryFn` (useMerits.ts:34-52) returns `{ balance: <rpc row>, tier }`, and `total` is read from `balance.total` (line 60). `setQueryData` MUST write the same nested shape, NOT a flat `{ total }`. A flat write would make `total` read `undefined → 0`. The planner must mirror the queryFn return shape exactly.

### Pattern 2: Fault injection at the single Anthropic chokepoint (D-12)
**What:** A module-scope env read + early-return in `invokeAnthropicText` (and its streaming twin) that short-circuits to a refundable error shape.
**When to use:** Staging verification only.
**Example (mirrors existing AI_FORCE_FAILURE branch, anthropic.ts:528-537):**
```typescript
// Source: existing pattern at supabase/functions/_shared/anthropic.ts:532-537
const STAGING_HOST = 'cimjltzovkahkqecpwgi'; // staging project ref (deploy-staging.ps1)
function refundableErrorOverride(): { status: number; error: string } | null {
  const flag = (Deno.env.get('MERIT_TEST_FORCE_REFUNDABLE_ERROR') ?? '').trim();
  if (!flag) return null;
  // D-13 staging gate: ignore unless host matches staging OR explicit sentinel
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const isStaging = url.includes(STAGING_HOST) || (Deno.env.get('STRIVO_ENV') ?? '') === 'staging';
  if (!isStaging) return null;
  const status = /^\d{3}$/.test(flag) ? Number(flag) : 529; // 'true' → 529 default
  return { status, error: 'forced-refundable-error' };
}
// at top of invokeAnthropicText():
const forced = refundableErrorOverride();
if (forced) return { ok: false, status: forced.status, error: forced.error };
```

### Pattern 3: Refund-status wording resolution per path (D-10)
**What:** D-10 says refundable errors say either "no charge" (deduct never settled) or "Merits refunded" (deduct happened, `refund_merits` ran). The planner must classify each of the 7 paths.
**Per-path classification (HIGH confidence — derived from gateway control flow):**

| Path | Deduct timing | On forced refundable error | Correct phrase |
|------|---------------|----------------------------|----------------|
| analyze-resume (sync, streaming) | `check_and_deduct_merits` BEFORE `fn` runs | `withMerits` catches, fires `refund_merits`, re-throws | **"Merits refunded"** |
| analyze-career (sync) | same | same | **"Merits refunded"** |
| grade-linkedin (sync) | same | same | **"Merits refunded"** |
| recruiting-lens (sync) | same | same | **"Merits refunded"** |
| interview-prep-analyze (sync) | same | same | **"Merits refunded"** |
| process-resume-analysis-job (async) | deduct at submit time (`merit_transaction_id` on job row) | `refundMeritsForJob` before status='failed' | **"Merits refunded"** |
| process-career-analysis-job (async) | same | same | **"Merits refunded"** |

> **Finding:** ALL 7 paths deduct-then-refund (the deduct settles in the DB before the Anthropic call, then a refund row is written). None are "never-settle" in the forced-error scenario. The "no charge" phrasing in the UI-SPEC table applies to the **cache-hit bypass** (Phase 29 D-15, no deduction ever) and the **rate-limit 429** case (rate-limit runs BEFORE deduct in `withMerits:193-196`, so no deduction). The 402 insufficient-merits case also never deducts. So: refundable AI errors (5xx/529/408/network) → "Merits refunded"; rate-limit/cache-bypass → "no charge". The planner should reconcile the UI-SPEC draft strings (which currently all say "no charge") against this — the AI-error rows are technically "Merits refunded." **This is a copy decision the user reviews in plan-review.**

### Pattern 4: Per-path error surfacing today (concrete wiring map for NFR-04)
How each path currently reaches its catch/error block — the integration point for `getMeritErrorMessage`:

| Path | File:lines | Current error handling | Wiring point |
|------|-----------|------------------------|--------------|
| Upload (resume) | Upload.tsx:295-331 | manual string-match (`isCreditsError`/`isNetworkError`), `openModal` for 402, generic `toast.error(errorMsg)` else | Replace string-match cascade with `getMeritErrorMessage`; keep `openModal` for 402 |
| CareerCompass (async) | CareerCompass.tsx:572-624 | poll `status==='failed'`; bespoke handling for `missing_prior`, `rate_limit_exceeded`, `usage_limit`, `isInfrastructureFailure` | Add `rollback()` on failed/timeout, `commit()` on completed (560-569); route AI-error toast through `getMeritErrorMessage` |
| LinkedInGrader | LinkedInGrader.tsx:427-430 | single `catch`, `toast.error(message)` | Wrap in `getMeritErrorMessage(status)` |
| RecruitingLens | RecruitingLens.tsx:441-452 | `invalidateMerits()` on success; `toast.error(result.error)` on error | Route error through `getMeritErrorMessage` |
| InterviewPrep | InterviewPrep.tsx:274-285 | result-wrapper (`result.success`); `mapServerError(...)` + `toast.error(message)` | Replace `mapServerError` mapping with `getMeritErrorMessage` |

> **Note on Upload.tsx streaming:** resume analysis runs on the **Results page** via `useResumeStream` (sessionStorage hand-off, Upload.tsx:281-294). The optimistic deduct fires at `handleUpload` click on Upload.tsx, but the success/failure settle happens on the Results page after the stream resolves. The planner must thread the snapshot/commit/rollback across the Upload→Results navigation, OR fire `optimisticDeduct` on the Results page when the stream starts. **This is the trickiest of the 7 wirings — flag for explicit planning.** Recommend firing `optimisticDeduct` inside `useResumeStream` start (single-page lifecycle) rather than crossing the navigation boundary.

### Anti-Patterns to Avoid
- **Flat `setQueryData({ total })`:** breaks the nested `{ balance, tier }` shape — see Pattern 1 caveat.
- **Hook-level `useRef` snapshot:** violates D-01 per-submit scoping; concurrent resume+LinkedIn submits would clobber one snapshot.
- **Detecting cache hits client-side:** explicitly rejected (D-05). Always invalidate; let the refetch be authoritative.
- **Adding an in-flight pulse/skeleton:** rejected (D-06); checker must not flag its absence.
- **Modifying `withMerits` or `refundMeritsForJob`:** out of scope — Phase 31 verifies, never changes the gateway.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Optimistic cache mutation | Custom balance state + manual subscriptions | `queryClient.setQueryData` + `invalidateQueries` | Already the merit-balance store; RQ handles re-render fanout |
| Refund control flow | Per-feature refund calls | Existing `withMerits` / `refundMeritsForJob` | Gateway is single source of refund truth (Phase 13 D-03) |
| Refund idempotency | App-level dedup of refund attempts | `refund_merits` SQL guard (already present) | Concurrency-safe row lock + existence check at the DB |
| Refundable-error classification | New error taxonomy | `isRefundableAnthropicError` (merit-gateway.ts:51) | Already the canonical 5xx/529/408/network classifier; key toasts off the same axis |
| Staging test fixture provisioning | New seed harness | `provisionTestUser`/`teardownTestUser` (merit-idempotency.test.ts:98-149) | Admin-API user create + CASCADE teardown already proven |
| Fault injection | New global mock layer | Env-gated early-return in `anthropic.ts` (existing `AI_FORCE_FAILURE` pattern) | Single chokepoint; pattern already exists and is unit-tested |

**Key insight:** This phase's value is proving the existing machinery works end-to-end, not building machinery. The biggest risk is *re-implementing* refund logic the gateway already owns.

## Runtime State Inventory

> Phase 31 is primarily code/test additions, but it sets a staging env var. Inventory below.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `merit_transactions` rows seeded by D-16 replay test; `user_merits` seeded balance for D-14/15 tests | Test-fixture only; `teardownTestUser` CASCADE-deletes (merit-idempotency.test.ts:141-149). Reuse pattern. |
| Live service config | `MERIT_TEST_FORCE_REFUNDABLE_ERROR` env var must be SET on the staging Supabase function env during the test run, then UNSET | D-13 host-gate ships the code inert in prod, but the operator must remember to unset the flag on staging post-test. Document in operator checklist (like 29-10-SUMMARY Step 4). |
| OS-registered state | None | None — no scheduled tasks/process names involved. |
| Secrets/env vars | Reuses Phase 29 `MERIT_TEST_USER_ID`, `DENO_TEST_SUPABASE_REMOTE`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (all operator-supplied). New: `MERIT_TEST_FORCE_REFUNDABLE_ERROR` (staging function env). | Add new var to operator checklist. No code rename — pure addition. |
| Build artifacts | New test files must be registered in `scripts/run-edge-tests.ps1` (the runner lists each file explicitly, lines 18-50) | Append `_shared/merit-gateway.refund.test.ts` and the MER-06 test to the runner. Otherwise they won't run in the suite. |

**The canonical question — after every file is updated, what runtime state remains?** The `MERIT_TEST_FORCE_REFUNDABLE_ERROR` staging function-env var, if left set, would force-fail every staging analysis. The D-13 host-gate prevents prod impact but NOT staging impact. Operator MUST unset it post-verification.

## Common Pitfalls

### Pitfall 1: setQueryData shape mismatch
**What goes wrong:** Writing `{ total: x }` instead of `{ balance: {...}, tier }` makes the balance read as 0.
**Why it happens:** The displayed `total` is derived from `data.balance.total` (useMerits.ts:58-60), not a top-level field.
**How to avoid:** Snapshot the whole query value, spread it, mutate only `balance.total`. See Pattern 1.
**Warning signs:** Balance flashes to 0 on click instead of decrementing by `cost`.

### Pitfall 2: Duplicate fault-injection branch divergence
**What goes wrong:** Adding `MERIT_TEST_FORCE_REFUNDABLE_ERROR` as a second branch while `AI_FORCE_FAILURE` still exists; two flags with subtly different semantics confuse operators.
**Why it happens:** `AI_FORCE_FAILURE` (anthropic.ts:532-537) already does almost the same thing (hardcoded 529).
**How to avoid:** Planner decides: extend the existing branch to read status from the new var, or document both clearly. Either way, the streaming twin (`streamAnthropicText:702-708`) must also be updated — resume analysis streams.
**Warning signs:** Sync paths force-fail but streaming resume analysis doesn't (or vice versa).

### Pitfall 3: Staging host false-negative on URL rotation (D-13 risk)
**What goes wrong:** Hardcoding the full staging URL; if the project ref rotates, the gate silently disables fault injection and tests pass vacuously (no error injected → success → "refund verified" is a false positive).
**Why it happens:** Over-specific matching.
**How to avoid:** Match on the project-ref substring `cimjltzovkahkqecpwgi` (stable, in `deploy-staging.ps1`) AND support the `STRIVO_ENV=staging` sentinel as a rotation-proof fallback. Belt-and-suspenders per the discretion note. Add a test assertion that the flag actually injected (assert the endpoint returned a refundable error before asserting the refund).
**Warning signs:** Refund test passes but balance was never deducted (because no error fired).

### Pitfall 4: Async poll-loop snapshot not held across iterations
**What goes wrong:** Calling `optimisticDeduct` inside the poll loop instead of once before it; or losing the closure when the loop re-renders.
**Why it happens:** Misreading D-04.
**How to avoid:** `const settle = optimisticDeduct(cost)` ONCE before `submit-*-job`; call `settle.commit()` at the `completed` branch (CareerCompass.tsx:560), `settle.rollback()` at `failed` (572) and at poll-timeout (624) and the outer `catch` (628).
**Warning signs:** Balance not restored when an async job fails after the deduct.

### Pitfall 5: Test counts a refund that the idempotency guard absorbed
**What goes wrong:** The D-15 gateway test forces an error, the refund fires, but a retry path fires `refund_merits` a second time → `already_refunded` → and the test mis-asserts a double-restore.
**Why it happens:** Refund row mirroring + idempotency interaction.
**How to avoid:** D-16 test asserts balance == seed after BOTH calls (single restore). Mirror the existing `merit-idempotency.test.ts` assertion style (assert exact balance equality, not deltas).

## Code Examples

### Gateway-level exhaustive refund test skeleton (D-15)
```typescript
// Source: structure mirrors merit-idempotency.test.ts:46-202 (proven harness)
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
const GATED = () => Deno.env.get("DENO_TEST_SUPABASE_REMOTE") === "1";

// For EACH refundable class: 500, 529, 408, AbortError(→408), network/timeout:
//   1. provisionTestUser(seed=100)
//   2. set MERIT_TEST_FORCE_REFUNDABLE_ERROR=<status>
//   3. call the endpoint (or invoke withMerits with a fn that throws MeritRefundable)
//   4. assert endpoint returned the forced error (guards Pitfall 3)
//   5. assertEquals(readBalance(uid), 100)  // refunded back to seed
//   6. teardownTestUser(uid)
// Plus MER-06 replay leg: call refund_merits twice, assert second → already_refunded.
```

### MER-06 idempotency replay test (D-16)
```typescript
// Source: refund_merits guard at 20260415000000_merit_rpcs.sql:185-193
// 1. seed user_merits + a feature-deduct merit_transactions row with known deduction_id
// 2. const first  = await client.rpc('refund_merits',{p_user_id, p_transaction_id});
//    assert first has no 'already_refunded' error; balance restored by deducted amount
// 3. const second = await client.rpc('refund_merits',{p_user_id, p_transaction_id});
//    assertEquals(second.error, 'already_refunded');
// 4. assertEquals(readBalance(uid), balanceAfterFirstRefund); // ZERO mutation on replay
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-page string-match error handling (Upload.tsx:305-313) | Centralized `getMeritErrorMessage` keyed off error class | Phase 31 | Removes drift; single source of copy (D-08/D-09) |
| `invalidateMerits()` only (no optimistic decrement) | `optimisticDeduct` → immediate decrement + settle | Phase 31 | Balance feels instant; NFR-03 reconcile |
| `AI_FORCE_FAILURE` (hardcoded 529, no host gate) | `MERIT_TEST_FORCE_REFUNDABLE_ERROR` (configurable status + staging host gate) | Phase 31 | Configurable refundable-error classes; prod-safe |

**Deprecated/outdated:** none removed; `AI_FORCE_FAILURE` may remain (planner decides — see Open Question 1).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `get_merit_balance` refetch returns <300 ms (NFR-03 budget 2 s) | NFR-03 support | Low — Phase 29 NFR-02 probe targets <100 ms for the indexed cache RPC; balance RPC is comparable. If slower, still within 2 s budget. |
| A2 | All 7 forced-error paths deduct-then-refund (not never-settle) | Pattern 3 | Medium — drives D-10 "Merits refunded" vs "no charge" copy. Verified against `withMerits` flow (deduct at step 2, fn at step 4) and async worker (deduct at submit). If a path short-circuits before deduct under forced error, copy would be "no charge" for that path. |
| A3 | Staging project ref `cimjltzovkahkqecpwgi` is stable enough to match on | D-13 / Pitfall 3 | Low — it's hardcoded in `deploy-staging.ps1`. Mitigated by also supporting `STRIVO_ENV=staging` sentinel. |
| A4 | `interview-prep-analyze` and `recruiting-lens`/`grade-linkedin` all route through `withMerits` + `invokeAnthropicText` (so fault injection reaches them) | D-12 coverage | Medium — confirmed for analyze-resume (merit-branch.test.ts). NOT individually verified for the other 4 sync edge functions in this session. Planner/executor MUST grep each function's `index.ts` for `withMerits(` and `invokeAnthropicText(` to confirm the chokepoint applies before relying on the single-toggle claim. |

## Open Questions

1. **Extend `AI_FORCE_FAILURE` or add a parallel `MERIT_TEST_FORCE_REFUNDABLE_ERROR`?**
   - What we know: `AI_FORCE_FAILURE` already returns `{ok:false,status:529}` (anthropic.ts:532-537) but is hardcoded to 529, has no status configurability, and uses a different two-key gate (`AI_TEST_MODE`+`AI_FORCE_FAILURE`).
   - What's unclear: D-12 names a NEW var. Reusing the old one risks confusing semantics; adding a new one risks two overlapping flags.
   - Recommendation: Add `MERIT_TEST_FORCE_REFUNDABLE_ERROR` as specified (D-12 is explicit), gate it with the D-13 host check, and update BOTH `invokeAnthropicText` AND `streamAnthropicText`. Leave `AI_FORCE_FAILURE` untouched (it's referenced by `anthropic.test.ts`). Document the distinction in a code comment.

2. **Where does the resume-analysis (streaming) optimistic deduct fire and settle?**
   - What we know: deduct should fire on click (Upload.tsx handleUpload), but the stream runs on the Results page after navigation (sessionStorage hand-off).
   - What's unclear: whether to thread the snapshot across navigation or fire on Results-page mount.
   - Recommendation: fire `optimisticDeduct` inside `useResumeStream` start (single-page lifecycle on Results), settle on stream-complete/stream-error. Avoids cross-navigation snapshot threading. Planner confirms when reading `useResumeStream.ts`.

3. **Reuse Phase 29 `MERIT_TEST_USER_ID` or seed a fresh phase-31 user?**
   - What we know: `merit-idempotency.test.ts` already provisions+tears down a fresh randomly-suffixed user per test (no reliance on a fixed `MERIT_TEST_USER_ID`).
   - Recommendation: Use the **provision-fresh-per-test** pattern (proven, self-cleaning, no shared-state contamination across the 1 gateway + 7 smoke tests). Treat `MERIT_TEST_USER_ID` as optional. This is cleaner than a shared seeded user whose balance the tests would have to reset between cases.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Deno | Staging Deno tests | ✓ (project requirement) | 2+ | — |
| Supabase staging project | D-14/15/16 tests | operator-supplied | ref `cimjltzovkahkqecpwgi` | none — tests are `autonomous:false`, gated like Phase 29 |
| `SUPABASE_SERVICE_ROLE_KEY` (staging) | seed/read/teardown | operator-supplied | — | none |
| `MERIT_TEST_FORCE_REFUNDABLE_ERROR` | fault injection | NEW — operator sets on staging fn env | — | none |
| `DENO_TEST_SUPABASE_REMOTE=1` | gate opt-in | operator-supplied | — | tests skip (self-checking skip-guard) |

**Missing dependencies with no fallback:** Staging credentials — by design operator-supplied (matches Phase 29 `autonomous:false` checkpoint posture). The executor authors tests + the fault-injection branch; the operator runs the gated suite against staging and pastes evidence into `31-VERIFICATION.md`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (edge) | Deno test (std assert 0.224.0) — `scripts/run-edge-tests.ps1` |
| Framework (frontend) | Vitest 4.1.6 [VERIFIED: package.json] — optional for `optimisticDeduct` unit tests (D-14) |
| Config file | `supabase/functions/deno.json` (Deno); `vite.config.ts`/vitest (frontend) |
| Quick run command | `deno test --allow-all _shared/merit-gateway.refund.test.ts --no-check` |
| Full suite command | `.\scripts\run-edge-tests.ps1` (gated tests need `DENO_TEST_SUPABASE_REMOTE=1` + staging creds) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MER-05 | Refund fires for every refundable class across gateway | integration (staging) | `deno test --allow-all _shared/merit-gateway.refund.test.ts` | ❌ Wave 0 |
| MER-05 | Each of 7 endpoints wires gateway correctly (1 forced-error smoke each) | integration (staging) | per-path smoke in same/sibling test file | ❌ Wave 0 |
| MER-06 | refund_merits replay → already_refunded, no mutation | integration (staging) | `deno test --allow-all _shared/merit-refund-idempotency.test.ts` | ❌ Wave 0 (mirror merit-idempotency.test.ts) |
| MER-03/NFR-03 | optimisticDeduct decrements then restores | unit (Vitest) | `npm run test` (optional per D-14) | ❌ Wave 0 if planner opts in |
| NFR-04 | getMeritErrorMessage returns correct {title,description} per class | unit (Vitest) | `npm run test` | ❌ Wave 0 (pure-function, cheap to test) |

### Sampling Rate
- **Per task commit:** `npm run lint` + (if frontend) `npm run test`; (if edge) `deno test <touched file> --no-check`.
- **Per wave merge:** `.\scripts\run-edge-tests.ps1` (local, non-gated subset) + `npm run test`.
- **Phase gate:** Operator runs the gated staging suite (`DENO_TEST_SUPABASE_REMOTE=1`, fault-injection flag set) → paste evidence into `31-VERIFICATION.md` → `/gsd-verify-work 31`.

### Wave 0 Gaps
- [ ] `supabase/functions/_shared/merit-gateway.refund.test.ts` — covers MER-05 (gateway exhaustive + 7 smoke)
- [ ] `supabase/functions/_shared/merit-refund-idempotency.test.ts` — covers MER-06 (or extend merit-idempotency.test.ts)
- [ ] Register both new test files in `scripts/run-edge-tests.ps1` (lines 18-50) — else they don't run
- [ ] `src/lib/merit-error-messages.test.ts` (Vitest) — NFR-04 pure-function coverage
- [ ] (optional, D-14) `src/hooks/useMerits.test.tsx` — optimisticDeduct rollback/commit unit test
- [ ] `MERIT_TEST_FORCE_REFUNDABLE_ERROR` must be added to the operator env-var checklist + an UNSET step post-verification

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No new auth surface; tests use Admin API service-role (existing pattern) |
| V4 Access Control | yes | Fault-injection flag is staging-host-gated (D-13) so it cannot be triggered in prod — defense-in-depth |
| V5 Input Validation | partial | 4xx/validation toast class is presentation-only; no new input parsing |
| V6 Cryptography | no | No crypto changes |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Fault-injection flag left enabled in prod → force-fail all analyses | Denial of Service | D-13 host gate ships path inert in prod; var read returns null unless host matches staging |
| Fault-injection flag left set on STAGING after test → staging outage | DoS (staging) | Operator checklist UNSET step (Runtime State Inventory) |
| False-positive refund verification (no error actually injected) | Tampering (test integrity) | Pitfall 3 mitigation: assert the endpoint returned the forced error BEFORE asserting refund |

## Sources

### Primary (HIGH confidence)
- `src/hooks/useMerits.ts` (read in full) — query shape, `setQueryData` seam, `useInvalidateMerits`
- `supabase/functions/_shared/merit-gateway.ts` (read in full) — `withMerits`, `refundMeritsForJob`, `isRefundableAnthropicError`, deduct/refund control flow
- `supabase/functions/_shared/anthropic.ts` (read in full) — existing `AI_FORCE_FAILURE` two-key pattern (lines 528-537, 700-708), `invokeAnthropicText` + `streamAnthropicText` chokepoints
- `supabase/migrations/20260415000000_merit_rpcs.sql:165-219` — `refund_merits` idempotency guard
- `supabase/functions/_shared/merit-idempotency.test.ts` (read in full) — proven staging-test harness (provision/teardown/readBalance/GATED)
- `supabase/functions/analyze-resume/merit-branch.test.ts` — gateway-wiring assertion style
- `supabase/functions/_shared/anthropic.test.ts` — compound-gate unit-test style
- `src/pages/{Upload,CareerCompass,LinkedInGrader,RecruitingLens,InterviewPrep}.tsx` — per-path error/toast wiring (cited line ranges in Pattern 4)
- `supabase/functions/process-career-analysis-job/index.ts:5,187-255` — async worker refund wiring (mirror for process-resume-analysis-job)
- `scripts/run-edge-tests.ps1` — test runner registration; `scripts/deploy-staging.ps1` — staging ref `cimjltzovkahkqecpwgi`
- `.planning/phases/29-foundation-infrastructure/29-10-SUMMARY.md` — operator-checkpoint pattern, `DENO_TEST_SUPABASE_REMOTE` plumbing
- `.planning/config.json` — `nyquist_validation: true`, `commit_docs: false`

### Secondary (MEDIUM confidence)
- TanStack React Query 5 optimistic-update conventions (`setQueryData` + `invalidateQueries`) — matches in-repo `useInvalidateMerits` usage.

### Tertiary (LOW confidence)
- None. All claims grounded in read source files.

## Project Constraints (from CLAUDE.md)
- Preserve existing TypeScript/React patterns; no unnecessary abstractions (single helper, not a framework — `merit-error-messages.ts` stays a flat function).
- Use sonner `toast.error(title, { description })` — confirmed the universal pattern across all 5 pages.
- Semantic design tokens, not hardcoded colors (error toasts use `--destructive`; no new tokens per UI-SPEC).
- `apply_patch`/focused edits over rewrites; small reversible changes.
- GSD workflow: file edits go through the phase execution flow.
- Do NOT modify the merit gateway (out of scope — verify only).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new deps, all verified in package.json.
- Architecture (optimistic + refund flow): HIGH — read every load-bearing source file end to end.
- Per-path wiring: HIGH for the 5 sync pages + 2 workers (cited exact lines); MEDIUM on confirming all 4 non-resume sync edge functions route through `invokeAnthropicText` (A4 — executor must grep each).
- Pitfalls: HIGH — derived from actual code shapes (query shape, gate semantics, poll loop).

**Research date:** 2026-05-19
**Valid until:** 2026-06-18 (30 days — stable internal codebase; re-verify if gateway or useMerits changes land first)

## RESEARCH COMPLETE
