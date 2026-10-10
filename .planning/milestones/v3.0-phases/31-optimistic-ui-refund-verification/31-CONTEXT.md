# Phase 31: Optimistic UI + Refund Verification - Context

**Gathered:** 2026-05-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver two halves of one feature:

1. **Optimistic UI (MER-03, NFR-03):** Add `optimisticDeduct(cost)` to `useMerits.ts` so the merit balance decrements on click before the AI response returns; on failure or refund, the balance restores to the authoritative server value within 2 s.
2. **Refund verification (MER-05, MER-06):** Prove that refund-on-failure fires for refundable errors (5xx, 529, 408, AbortError, network, timeout) across **all 5 sync paths** (`analyze-resume`, `analyze-career`, `grade-linkedin`, `recruiting-lens`, `interview-prep-analyze`) **AND both async workers** (`process-resume-analysis-job`, `process-career-analysis-job`) post-Phase-28 merge. Prove replaying the same `merit_transaction_id` returns `already_refunded` with no balance mutation.
3. **Specific failure-mode toasts (NFR-04):** Replace generic "Something went wrong" copy with operationally useful, error-class-keyed messages across the same 7 paths.

**Out of scope for Phase 31:**
- Building new refund infrastructure — `refund_merits` RPC and `refundMeritsForJob` already exist; this phase wires + verifies.
- Cache-hit short-circuit logic (Phase 29 / feature phases 37–41 own the precheck_cache callbacks themselves).
- Shop purchase race (Phase 32).
- Pricing/checkout UI (Phase 33).
- Per-feature output trim or output schema changes (Phases 37–41).

</domain>

<decisions>
## Implementation Decisions

### Optimistic deduct hook API + async UX

- **D-01:** `useMerits` exposes `optimisticDeduct(cost: number): { rollback: () => void; commit: () => void }`. The hook captures the pre-deduct balance into a per-call snapshot and writes `total = previous - cost` via `queryClient.setQueryData(['merit-balance', userId], …)`. Each invocation gets its own snapshot — **per-submit scoping**, not a hook-level ref — so concurrent submits across features (e.g. resume + LinkedIn at once) don't trample each other.
- **D-02:** **Settle model = snapshot + manual rollback.** On success the caller calls `commit()` which invalidates `merit-balance` to sync to the authoritative DB value. On error the caller calls `rollback()` which restores the snapshot **and** invalidates. NFR-03 (<2 s restore) is trivially met because rollback is synchronous (no DB round-trip).
- **D-03:** Optimistic deduct **fires immediately on click** — before any `canAfford` re-check or network call. If the server rejects with 402 INSUFFICIENT_MERITS, the caller invokes `rollback()` and shows the upgrade modal. The current `canAfford` precheck in feature pages stays as a UX guard, but it does NOT gate the optimistic update.
- **D-04:** **Async workers use the same hook.** Submit → `optimisticDeduct(cost)` captures the snapshot; the page **holds the snapshot across the poll loop**. On poll-detected terminal status: success → `commit()`, failure → `rollback()`. Sync and async paths share one optimistic contract — no separate "async optimistic" hook.

### Cache-hit ↔ optimistic interaction

- **D-05:** **Always invalidate on settle — authoritative refetch is the source of truth.** Phase 29 D-15 makes cache hits bypass server-side deduction. The client doesn't try to detect cache hits; `commit()` invalidates `merit-balance` and the refetch returns the correct value (deducted on a fresh call, unchanged on a cache hit). No `cache_hit` flag on the response envelope; no inline balance return.
- **D-06:** **No visible signal during the "wiggle" window.** `get_merit_balance` is a single indexed RPC; the refetch typically returns in <300 ms (NFR-03 budgets 2 s). The brief "balance snaps back" on cache hit is acceptable. No pulse, no skeleton, no badge.
- **D-07:** **Invalidate fires on response received, not after result renders.** As soon as the fetch promise resolves (before parsing the analysis result), `commit()` invalidates `merit-balance`. Balance correction runs in parallel with result rendering. Tightest NFR-03 timer.

### Failure-mode toast taxonomy (NFR-04)

- **D-08:** **Taxonomy axis = error class, single shared message set across all 5 features.** Not per-feature, not interpolated. The 5 features share one identical set of toasts keyed off the merit-gateway refund taxonomy. Loses the feature noun ("your resume analysis") in favor of one source of truth and zero drift risk.
- **D-09:** **Strings live in `src/lib/merit-error-messages.ts`** as a single module exporting `getMeritErrorMessage(errorCode | httpStatus): { title, description }`. Imported by all 5 feature pages and the async poll loops. No per-page override hook — keep the API surface minimal.
- **D-10:** **Toasts explicitly mention refund status on refundable paths.** Refundable errors say "No charge" (when the deduct never settled — e.g. server-side refund fired) or "Merits refunded" (when the deduct happened and `refund_merits` ran). Non-refundable errors (4xx, parse failures, prompt-sanitizer rejections) do NOT mention merits.
- **D-11:** **In-scope failure modes for Phase 31's toast set:**
  - Refundable AI errors: 5xx, 529 (overload), 408 (timeout), AbortError, network errors — each gets a distinct message.
  - Insufficient merits (402) — specific copy ("You're out of Merits — resets on {date}") instead of generic upgrade-modal trigger.
  - Rate-limit (429 from pooled 60/hr `ai-analyses-all`) — "Hit the analysis rate cap — try again in {N}s. No charge."
  - Validation / 4xx client errors (Zod failures, sanitizer rejections, bad inputs) — non-refundable; message must NOT promise a refund.

### Refund verification methodology

- **D-12:** **Fault injection via `MERIT_TEST_FORCE_REFUNDABLE_ERROR` env in `_shared/anthropic.ts`.** When set (to `true`, `529`, `408`, etc.), `invokeAnthropicText` returns `{ ok: false, status: 529, error: 'forced-overload' }` (or the specified status) without calling Anthropic. One toggle, all 7 paths covered (5 sync + 2 async). Reuses the Phase 29 staging-test pattern.
- **D-13:** **Safety gate = staging-only by host check.** Code reads `Deno.env.get('SUPABASE_URL')` and ignores `MERIT_TEST_FORCE_REFUNDABLE_ERROR` unless the host matches the known staging host (or a `STRIVO_ENV=staging` sentinel). Production deploy can ship the code path inert. Defense-in-depth — eliminates "we left a flag set in prod" risk.
- **D-14:** **Evidence surface = Deno tests against staging**, mirroring Phase 29's `TEST-02` pattern: `DENO_TEST_SUPABASE_REMOTE=1` + `MERIT_TEST_USER_ID` against the staging project. Seed balance → set `MERIT_TEST_FORCE_REFUNDABLE_ERROR=529` → call endpoint → assert balance restored to seed. Recorded in `31-VERIFICATION.md` rows. No Vitest hook test required for refund proof; Vitest stays for `optimisticDeduct` rollback unit tests if planning surfaces a need.
- **D-15:** **Test structure = one gateway-level test + 7 thin per-path smoke tests.** Gateway test exhaustively covers `withMerits` + `refundMeritsForJob` refund behavior across every refundable error class (5xx, 529, 408, AbortError, network/timeout) AND the MER-06 idempotency replay. Each of the 7 endpoints gets one thin smoke test confirming it wires the gateway correctly (one forced-error case each). The gateway is the single source of refund truth — divergence is the only per-path risk worth catching.
- **D-16:** **MER-06 idempotency replay test = Deno test calling `refund_merits` RPC twice.** Seed a `merit_transactions` row → call `refund_merits(p_transaction_id)` twice → assert first returns `refunded`, second returns `already_refunded` with no balance mutation. Tests the SQL invariant at `migrations/20260415000000_merit_rpcs.sql:185-193` directly. No gateway-integration variant needed — the constraint is owned by SQL, not by the gateway.

### Claude's Discretion (planner / executor)

- Whether the optimistic-deduct snapshot is stored in component state, a closure returned by `optimisticDeduct()`, or React Query mutation context. D-01 specifies the API surface (`{ rollback, commit }`) and per-submit scoping; the planner picks the implementation that reads cleanest across 5 feature pages + 2 async poll loops.
- Exact toast copy strings (titles + descriptions) for each error class — must satisfy D-10 (refund mention on refundable paths) and NFR-04 (operationally useful, no generic "Something went wrong"). Planner drafts; user reviews during plan-review.
- Whether `merit-error-messages.ts` returns sonner-flavored shapes (`{ title, description }`) or a richer record that includes an `action` (e.g. retry button). Planner picks based on existing toast patterns.
- Test fixture user provisioning — reuse the Phase 29 `MERIT_TEST_USER_ID` env, or seed a phase-31-specific test user? Planner picks.
- The exact staging-host detection pattern in D-13 (substring match on URL, env sentinel, or both). Planner picks the safest pattern that won't false-negative when the staging URL is rotated.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements + roadmap (source of truth)
- `.planning/REQUIREMENTS.md` §"MER-03", §"MER-05", §"MER-06", §"NFR-03", §"NFR-04" — full requirement text and acceptance criteria for the 5 IDs Phase 31 owns
- `.planning/ROADMAP.md` Phase 31 section (lines 156–169) — phase scope, dependencies (28, 29, 30), success criteria
- `.planning/PROJECT.md` Current Milestone section — v3.0 goals

### Carry-forward locked decisions
- `.planning/phases/29-foundation-infrastructure/29-CONTEXT.md` D-04 (`precheck_cache` callback contract), D-08 (cache-write failures swallowed silently), D-09–D-12 (idempotency key UUID per submit, MER-04 partial UNIQUE index), D-13–D-16 (cache-hit Activity History contract, D-15: cache hits bypass deduction server-side)
- `.planning/phases/28-merge-redeploy-baseline/28-CONTEXT.md` — Phase 28 merge baseline; the `by/env-fixes` branch landed and async-worker refund wiring is now in main staging
- v2.0 Phase 13 D-01..D-12 — merit gateway design contract; inline at `supabase/functions/_shared/merit-gateway.ts:1-19`

### Reusable substrate (existing code Phase 31 wires + verifies)
- `supabase/functions/_shared/merit-gateway.ts` — `withMerits` (line 115), `MeritRefundable` (line 73), `isRefundableAnthropicError` (line 51), `refundMeritsForJob` (line 281). Phase 31 does NOT modify the gateway; it adds test coverage and verifies wiring.
- `supabase/functions/_shared/anthropic.ts` — `invokeAnthropicText` entry point. **Phase 31 adds the `MERIT_TEST_FORCE_REFUNDABLE_ERROR` fault-injection branch here** (D-12, D-13).
- `supabase/migrations/20260415000000_merit_rpcs.sql:185-193` — `refund_merits` idempotency guard (`already_refunded` return path). MER-06 test target.
- `src/hooks/useMerits.ts` — current shape (1–93). **Phase 31 adds `optimisticDeduct(cost)` returning `{ rollback, commit }`** per D-01.
- `src/lib/supabaseClient.ts` — Supabase client singleton.

### Feature-page integration points (5 sync paths Phase 31 wires)
- `src/pages/Upload.tsx` — resume analysis entry
- `src/pages/CareerCompass.tsx` — career analysis entry
- `src/pages/LinkedInGrader.tsx` — LinkedIn grading entry
- `src/pages/RecruitingLens.tsx` — recruiting lens entry
- `src/pages/InterviewPrep.tsx` — interview prep entry

### Edge function paths under verification (5 sync + 2 async)
- `supabase/functions/analyze-resume/`
- `supabase/functions/analyze-career/`
- `supabase/functions/grade-linkedin/`
- `supabase/functions/recruiting-lens/`
- `supabase/functions/interview-prep-analyze/`
- `supabase/functions/process-resume-analysis-job/` (async)
- `supabase/functions/process-career-analysis-job/` (async)

### Test infrastructure
- `scripts/run-edge-tests.ps1` — Deno test runner with `DENO_TEST_SUPABASE_REMOTE=1` plumbing
- `.planning/phases/29-foundation-infrastructure/29-10-SUMMARY.md` §"Checkpoint: Operator Action Required" — staging test pattern Phase 31 reuses for `MERIT_TEST_USER_ID` provisioning and operator deploy steps

### Codebase intel
- `.planning/codebase/ARCHITECTURE.md` §"Merit system" (if present) — current sync/async flow shapes
- `CLAUDE.md` §"Stack", §"Reliability Priorities" — toast and error-handling conventions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`useMerits.ts`** (`src/hooks/useMerits.ts:19-87`): existing hook exposes `{ total, subscription, shop, cap, tier, resetDate, isLow, isZero, isLoading, canAfford }` via React Query (`queryKey: ['merit-balance', userId]`, `staleTime: 5_000`). Phase 31 adds `optimisticDeduct(cost)` returning `{ rollback, commit }` — the `setQueryData(['merit-balance', userId], …)` seam is the natural integration point.
- **`useInvalidateMerits()`** (`useMerits.ts:89-92`): already returns a function that invalidates `['merit-balance']`. `commit()` and `rollback()` reuse this.
- **`merit-gateway.ts` `withMerits`** (`supabase/functions/_shared/merit-gateway.ts:115`): owns deduct + refund control flow per Phase 13 D-03. Phase 31 only verifies behavior; no signature change.
- **`refundMeritsForJob`** (`merit-gateway.ts:281`): async-worker refund path. Both `process-resume-analysis-job` and `process-career-analysis-job` already call this; Phase 31 verifies under forced-error injection.
- **`isRefundableAnthropicError`** (`merit-gateway.ts:51`): the canonical refund taxonomy — 5xx, 529, 408, AbortError, network/timeout. `merit-error-messages.ts` keys off the same classification for D-08 / D-11.
- **`refund_merits` RPC** (`migrations/20260415000000_merit_rpcs.sql:185-193`): idempotency guard already in place — MER-06 test target, no code change.

### Established Patterns
- **React Query optimistic updates:** existing pattern uses `queryClient.setQueryData` + `invalidateQueries` (see `useMerits.ts:89-92`). Phase 31's `optimisticDeduct` follows the same shape.
- **Staging Deno tests:** Phase 29 established `DENO_TEST_SUPABASE_REMOTE=1` + `MERIT_TEST_USER_ID` + `scripts/run-edge-tests.ps1` as the staging-test contract. Phase 31 reuses verbatim — no new test infra.
- **Sonner toasts:** `toast.error(title, { description })` is the standard pattern across feature pages (e.g. `src/pages/Upload.tsx`, `RecruitingLens.tsx`). `merit-error-messages.ts` returns shapes compatible with this call.
- **Shared edge helpers:** `_shared/*.ts` named exports (`createLogger`, `getServiceClient`, `requireAuth`). The new fault-injection branch in `anthropic.ts` reads env at module scope (same as `MERIT_SYSTEM_ENABLED` in `merit-gateway.ts:27-28`).

### Integration Points
- **`useMerits.ts`:** new `optimisticDeduct(cost)` export. Backwards-compatible — existing consumers (`DashboardHome.tsx`, `LowBalanceWarning.tsx`, `MeritCostPreview.tsx`, `Navbar.tsx`) ignore the new export.
- **5 feature pages:** each submit handler calls `const { rollback, commit } = useMerits().optimisticDeduct(cost)` before the network call, then `commit()` on success / `rollback()` on error. Per-submit snapshot scoping (D-01) means concurrent submits don't interfere.
- **2 async poll loops:** same pattern — `optimisticDeduct` on submit, snapshot held in component state across poll, `commit()` / `rollback()` on terminal poll status.
- **`_shared/anthropic.ts`:** `invokeAnthropicText` gains a module-top check for `MERIT_TEST_FORCE_REFUNDABLE_ERROR` gated by staging-host detection (D-13). Returns `{ ok: false, status, error }` short-circuit when active.
- **`src/lib/merit-error-messages.ts` (new):** single shared module. Imported by all 5 feature pages + 2 async poll loops + any new shared error-toast helper.

</code_context>

<specifics>
## Specific Ideas

### Operationally useful toast copy guidance (NFR-04)
- Refundable errors should name the cause concisely and assert the merit state: "Analysis hit a server timeout — no charge."
- Insufficient-merits message should include the reset date when available: "You're out of Merits — resets on {date}."
- Rate-limit message should include the retry window: "Hit the analysis rate cap — try again in {N}s. No charge."
- Validation errors should describe the input problem, never the system: "Your resume couldn't be parsed — please try a different file."

### Test fixture for MER-06 idempotency
- The simplest test fixture is a freshly seeded `merit_transactions` row with a known `transaction_id`. Test asserts: first `refund_merits` call returns `refunded` + decrements `user_merits`; second call returns `already_refunded` + leaves `user_merits` unchanged. No need to involve any feature path.

### Fault-injection knob shape
- Recommended env value semantics: `MERIT_TEST_FORCE_REFUNDABLE_ERROR=529` returns a 529 (overload); `=408` returns timeout; `=true` defaults to 529; unset → no fault injection. Planner can extend with comma-separated lists if a single test needs to exercise multiple paths.

</specifics>

<deferred>
## Deferred Ideas

- **Per-feature toast copy with feature-noun interpolation** — considered (axis = error-class × feature, or interpolated noun) but rejected in favor of one shared message set (D-08). Revisit if user testing shows the generic copy feels impersonal.
- **`cache_hit` flag on response envelope + immediate client rollback** — considered for cache-hit reconcile (Area 2 option b) but rejected in favor of authoritative refetch (D-05). Revisit if the 200–300 ms "wiggle" turns out to be visually objectionable.
- **Inline balance in every analyze response** — considered (Area 2 option c) but rejected. Would change 5 sync + 2 async response shapes for a small UX win. Not worth the schema churn.
- **Pulse/skeleton signal during in-flight optimistic deduct** — considered (Area 2 follow-up) and rejected per D-06. Could revisit if user testing surfaces confusion.
- **Per-page override hook for toast copy** — considered (Area 3 follow-up) and rejected per D-09. The shared module stays single-source-of-truth.
- **7 per-path exhaustive tests** — considered (Area 4 follow-up) and rejected in favor of one gateway-level test + 7 smoke tests (D-15). Revisit only if a per-path divergence bug ships.
- **Gateway-level MER-06 integration test** — considered (Area 4 follow-up option b/c) and rejected. The SQL invariant is the load-bearing piece; the gateway test would be redundant. Revisit if the gateway's idempotency-replay branch grows non-trivial logic.
- **`INTERNAL_JOB_SECRET`-gated fault injection** — considered (Area 4 safety follow-up) and rejected in favor of staging-host detection (D-13). The host check is stricter than a secret presence check.

</deferred>

---

*Phase: 31-optimistic-ui-refund-verification*
*Context gathered: 2026-05-16*
