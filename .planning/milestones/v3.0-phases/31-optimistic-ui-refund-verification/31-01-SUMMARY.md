---
phase: 31-optimistic-ui-refund-verification
plan: 01
subsystem: merit-client-primitives
tags: [merits, optimistic-ui, react-query, toast-taxonomy, tdd]
requires: []
provides:
  - "useMerits().optimisticDeduct(cost) → { rollback, commit }"
  - "getMeritErrorMessage(codeOrStatus, ctx?) → { title, description }"
affects:
  - src/hooks/useMerits.ts
  - src/lib/merit-error-messages.ts
tech-stack:
  added: []
  patterns:
    - "Closure-captured per-submit snapshot for React Query optimistic writes"
    - "Flat pure named-export module + lookup table for toast copy taxonomy"
key-files:
  created:
    - src/lib/merit-error-messages.ts
    - src/lib/merit-error-messages.test.ts
  modified:
    - src/hooks/useMerits.ts
decisions:
  - "Refundable AI errors (5xx/529/408/network) use 'Merits were refunded' wording; 'No charge' reserved for 429 (D-10 reconciliation, supersedes UI-SPEC draft)"
  - "optimisticDeduct snapshot is closure-captured per submit, not a hook-level ref (D-01)"
metrics:
  duration: ~10m
  completed: 2026-05-19
requirements: [MER-03, NFR-03, NFR-04]
---

# Phase 31 Plan 01: Merit Client Primitives Summary

Built the two net-new client contracts every downstream wiring site consumes: the `optimisticDeduct` API on `useMerits` (closure-captured per-submit snapshot, nested cache shape) and the shared `getMeritErrorMessage` toast taxonomy (7 error classes, refund-accurate copy, never generic).

## What Was Built

### Task 1 — `optimisticDeduct` on `useMerits` (commit b82044d)
- Added `optimisticDeduct(cost): { rollback, commit }` to the `MeritBalance` interface and the returned object.
- Brought `queryClient` into the hook via the already-imported `useQueryClient()`.
- Snapshot captured per-submit in a closure (`previous = getQueryData(key)`), not a hook-level ref (D-01) — concurrent submits each own their rollback target.
- Cache write preserves the nested `{ balance, tier }` shape: `setQueryData(key, { ...previous, balance: { ...previous.balance, total: prevTotal - cost } })` — avoids Pitfall 1 (a flat `{ total }` write would display 0 since the derived read pulls from `balance.total`).
- `rollback()` restores the snapshot synchronously (NFR-03, no DB round-trip) then `invalidateQueries`; `commit()` calls only `invalidateQueries` (authoritative refetch, D-02/D-05/D-07).
- `useInvalidateMerits` left unchanged; existing consumers ignore the additive field.

### Task 2 — `merit-error-messages.ts` taxonomy + Vitest (commits 5dacbaf RED, 9b819dd GREEN)
- New `getMeritErrorMessage(codeOrStatus: number | string, ctx?: { resetDate?; retryAfterSec? }): { title; description? }` — sole named export, flat function + lookup table (no class, no hook).
- Reconciled D-10 copy for all 7 classes: 5xx server error, 529 busy, 408 timeout, network/AbortError connection-lost (all say "Merits were refunded"); 402 out-of-Merits (interpolates resetDate or date-less fallback); 429 rate cap ("No charge", interpolates seconds); 4xx validation (mentions none of merit/refund/charge).
- Unmapped refundable AI errors default to the 5xx message; any other unmapped key/status falls back to the non-generic validation message. Never returns "Something went wrong" (NFR-04).
- 11 Vitest cases cover every behavior assertion including the refund-mention rule and the no-generic-copy rule.

## Deviations from Plan

None — plan executed exactly as written.

## Copy Decision (surface to plan review)
Per the plan's instruction, the reconciled D-10 strings supersede the UI-SPEC draft "no charge" wording on the AI-error rows: forced-refundable AI errors (5xx/529/408/network) say "your Merits were refunded", and "No charge" is reserved exclusively for the 429 rate-limit case.

## Verification
- `npx eslint src/hooks/useMerits.ts src/lib/merit-error-messages.ts src/lib/merit-error-messages.test.ts` → exit 0 (clean).
- `npm run test -- src/lib/merit-error-messages.test.ts` → 11/11 passed.
- Repo-wide `npm run lint` reports 803 pre-existing errors in unrelated files (supabase functions, tailwind.config.ts) — out of scope per scope boundary; none in this plan's files.

## TDD Gate Compliance
Task 2 followed RED → GREEN: failing test committed (5dacbaf) before implementation (9b819dd). No REFACTOR commit needed.

## Self-Check: PASSED
- FOUND: src/hooks/useMerits.ts
- FOUND: src/lib/merit-error-messages.ts
- FOUND: src/lib/merit-error-messages.test.ts
- Commits b82044d, 5dacbaf, 9b819dd present in git log.
