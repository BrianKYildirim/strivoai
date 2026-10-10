---
phase: 29
plan: 07
subsystem: frontend
tags: [phase-29, frontend, hook, idempotency, mer-04]
requires: []
provides:
  - "src/hooks/useIdempotencyKey — { key: string; regenerate: () => string }"
affects:
  - "Phase 31 consumers will import this hook to send `idempotency_key` in analyze-flow request bodies"
tech_stack:
  added: []
  patterns:
    - "React useState lazy initializer (one-shot UUID generation at mount)"
    - "React useCallback with empty deps (stable function identity across renders)"
    - "Vitest renderHook + act (state-mutation test pattern)"
key_files:
  created:
    - "src/hooks/useIdempotencyKey.ts"
    - "src/hooks/useIdempotencyKey.test.ts"
  modified: []
decisions:
  - "Adopted the useState-based shape from 29-PATTERNS.md over the useRef variant in 29-RESEARCH.md — matches useCreatePaymentIntent.ts, easier to test with renderHook + act."
  - "No console.log in regenerate() — keep the hook silent during legitimate use."
  - "regenerate() returns the new UUID synchronously (the planner spec) so callers can use the value in the same tick they trigger a new submit."
metrics:
  duration: "~6 min"
  completed: "2026-05-12"
  tasks: 1
  commits: 2
  files_created: 2
  files_modified: 0
  tests_added: 5
  tests_passing: 5
---

# Phase 29 Plan 07: useIdempotencyKey Hook Summary

Shipped the frontend half of MER-04: a tiny React hook that emits a stable RFC 4122 v4 UUID per user-initiated submit, with an explicit `regenerate()` call to roll a new key for each new click. Helper-hook only — per-feature wiring lands in Phase 31.

## Hook Contract

```ts
export function useIdempotencyKey(): {
  key: string;
  regenerate: () => string;
};
```

- **Initial render**: `key` is a fresh `crypto.randomUUID()` (jsdom and all supported browsers provide it natively).
- **Re-render without `regenerate()`**: same `key` is returned (D-09 — retries of the SAME logical submit reuse the UUID).
- **`regenerate()`**: rolls a new UUID, updates internal `useState`, and returns the new value synchronously so the caller can use it in the same tick that initiates a new submit.

Function identity for `regenerate` is stable across renders (`useCallback` with empty deps), so passing it down through props or effect deps will not trigger spurious re-renders or effect re-runs.

## Files

| File                                  | Purpose                                                                                              |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/hooks/useIdempotencyKey.ts`      | Named export `useIdempotencyKey`; ~22 lines of body code + JSDoc explaining MER-04 / D-09 contract.  |
| `src/hooks/useIdempotencyKey.test.ts` | Five Vitest cases covering the full hook contract.                                                   |

## Test Cases (Vitest)

| # | Behavior                                                                                  |
| - | ----------------------------------------------------------------------------------------- |
| T1 | First render returns a `key` matching the RFC 4122 v4 regex `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`. |
| T2 | Two `rerender()` calls without `regenerate()` keep `result.current.key` identical (D-09 retry reuse). |
| T3 | `act(() => result.current.regenerate())` rolls a NEW UUID that still matches v4 shape.    |
| T4 | `regenerate()`'s return value equals the post-update `result.current.key` (sync return). |
| T5 | Two independent `renderHook` invocations produce two different keys (no shared state).    |

Result: `npx vitest run useIdempotencyKey` → **5 passed, 0 failures, ~54 ms test time**.

## D-09 Contract Enforcement

The hook *structurally* enforces D-09 (Phase 29 CONTEXT decision):

- **Same submit, multiple network attempts** → caller keeps calling with `key` unchanged → server-side dedup (Plan 29-04 partial UNIQUE index on `merit_transactions`) drops the duplicate.
- **New user click** → caller MUST call `regenerate()` first (Phase 31 wiring) → fresh UUID → server treats as a new transaction.

Anything that does *not* call `regenerate()` (re-renders, parent state updates, prop changes) keeps the same UUID — which is exactly what we want for "retry of the same submit."

## Threat Model Coverage

Both threats in the plan's threat register are `accept`-disposition (no mitigation owed by this hook):

| Threat ID         | Disposition | Why no code change                                                                                                                                 |
| ----------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-29-CLIENT-UUID  | accept      | 122-bit v4 entropy; cross-user replay is structurally impossible because the Plan 29-04 RPC row-locks `user_merits` by `p_user_id`.                |
| T-29-NO-PERSIST   | accept      | Page refresh during in-flight = a new submit per D-09; persisting UUIDs across refreshes would over-couple "retry" with "new submit" semantics.    |

No `<threat_flag>` rows — the hook introduces no new surface; it's a pure client-side primitive.

## Deviations from Plan

None — plan executed exactly as written. TDD RED → GREEN cycle:

| Phase | Commit    | What                                                                       |
| ----- | --------- | -------------------------------------------------------------------------- |
| RED   | `c1216aa` | `test(29-07): add failing tests for useIdempotencyKey hook` — import fails (hook absent). |
| GREEN | `8231a8e` | `feat(29-07): implement useIdempotencyKey hook (MER-04 frontend)` — all 5 cases pass. |

No REFACTOR pass needed — the hook is already at its minimal correct shape (~7 lines of executable body).

## Deferred Consumer Wiring (Phase 31)

Phase 29 ships the primitive only. Phase 31 (Optimistic UI) will:

1. Call `const { key, regenerate } = useIdempotencyKey()` in each of the 5 analyze flows (Resume Analysis, Career Compass, Interview Prep, LinkedIn Grader, Recruiting Lens).
2. Call `regenerate()` at the start of every new-click handler (button onClick / form onSubmit).
3. Pass `idempotency_key: key` in the request body (D-10) when invoking the backend RPC / edge function.

Phase 29 deliberately ships *no* consumers — keeping this plan a one-file primitive lets it land independently of Phase 31's UI scope.

## Acceptance Criteria

- [x] `src/hooks/useIdempotencyKey.ts` exists.
- [x] Contains `export function useIdempotencyKey` (named export only — no `export default`).
- [x] Contains `crypto.randomUUID()`.
- [x] Imports `useState` and `useCallback` from `'react'`.
- [x] `src/hooks/useIdempotencyKey.test.ts` exists.
- [x] Contains ≥5 `it(` blocks inside `describe('useIdempotencyKey'`.
- [x] Contains the UUID v4 regex starting with `/^[0-9a-f]{8}-`.
- [x] Imports `renderHook` and `act` from `'@testing-library/react'`.
- [x] `npx vitest run useIdempotencyKey` exits 0 with 5 passing tests, 0 failures.
- [x] ESLint clean on both new files.

## Commits

| Hash      | Type | Message                                                                |
| --------- | ---- | ---------------------------------------------------------------------- |
| `c1216aa` | test | `test(29-07): add failing tests for useIdempotencyKey hook`            |
| `8231a8e` | feat | `feat(29-07): implement useIdempotencyKey hook (MER-04 frontend)`      |

## Self-Check: PASSED

- FOUND: `src/hooks/useIdempotencyKey.ts`
- FOUND: `src/hooks/useIdempotencyKey.test.ts`
- FOUND: commit `c1216aa` (RED)
- FOUND: commit `8231a8e` (GREEN)
- FOUND: 5/5 Vitest cases passing
- FOUND: ESLint clean on both files
