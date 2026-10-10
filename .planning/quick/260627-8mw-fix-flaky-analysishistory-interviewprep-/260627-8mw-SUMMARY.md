---
phase: quick-260627-8mw
plan: 01
subsystem: testing
tags: [test-flake, vitest, feature-flag, interview-prep, NYQ-02, R-03]
requires: []
provides:
  - "Flake-free AnalysisHistory interview-prep gating test (static import, no module reset)"
affects:
  - src/pages/__tests__/AnalysisHistory.interviewPrep.test.tsx
tech-stack:
  added: []
  patterns:
    - "Stub VITE_* env before render; rely on call-time flag read instead of vi.resetModules()+dynamic import"
key-files:
  created: []
  modified:
    - src/pages/__tests__/AnalysisHistory.interviewPrep.test.tsx
decisions:
  - "Removed vi.resetModules() + per-test dynamic await import() — isInterviewPrepEnabled() reads import.meta.env at call time, so a pre-render vi.stubEnv fully controls the flag without re-evaluating the page module graph."
metrics:
  duration: 1min
  completed: 2026-06-27
---

# Quick Task 260627-8mw: De-flake AnalysisHistory interviewPrep test Summary

Eliminated the carried-over v4.0 vitest flake (NYQ-02 / R-03) in
`AnalysisHistory.interviewPrep.test.tsx` by switching from a per-test
`vi.resetModules()` + dynamic `await import('@/pages/AnalysisHistory')` to a single
static default import. The dynamic re-import re-evaluated the page's full module graph
(lucide-react, date-fns, every UI component, re-running each `vi.mock` factory) on every
test, which under fork-pool CPU contention occasionally exceeded vitest's 5000ms TEST
timeout. Root cause removed (not masked by a longer timeout or a retry).

## What Changed

Four surgical edits, test-file-only — no production code touched:

1. Added a static `import AnalysisHistory from '@/pages/AnalysisHistory';` alongside the
   existing import group. The hoisted `vi.mock('@/lib/supabaseClient', ...)` and
   `vi.mock('react-router-dom', ...)` factories still apply (vi.mock hoists above all
   imports), so the supabase fixture chain and the `useNavigate` stub remain in effect.
2. Rewrote `renderHistory()` to be synchronous and render the statically-imported
   component; deleted the `const mod = await import(...)` lines and the stale
   "Import AFTER env stub" comment. Both call sites changed from
   `await renderHistory()` to `renderHistory()`.
3. Removed `vi.resetModules()` and the now-empty `beforeEach(() => { ... })` block, and
   dropped `beforeEach` from the `vitest` import (no unused import left).
4. Kept `vi.stubEnv('VITE_FEATURE_INTERVIEW_PREP', ...)` as the first line of each `it(...)`
   and kept `afterEach(() => { vi.unstubAllEnvs(); })` so flag state never leaks.

The two `it(...)` assertion bodies are unchanged: OFF hides interview-prep rows while
resume analysis + career compass stay visible; ON shows all three.

Net diff: 1 file changed, 5 insertions(+), 11 deletions(-).

## Why It Works

`isInterviewPrepEnabled()` (src/config/feature-flags.ts:25) reads
`import.meta.env.VITE_FEATURE_INTERVIEW_PREP === 'true'` at CALL time during render, not
at module-load time. Therefore `vi.stubEnv(...)` set before `render()` already controls
the flag for that render. The module reset + dynamic re-import was pure overhead.

## Verification Results

All commands run on branch `staging` against the live working tree (node_modules present).

1. Targeted test x3 in isolation — all green, no 5000ms timeout:
   - `npx vitest run src/pages/__tests__/AnalysisHistory.interviewPrep.test.tsx`
   - RUN 1: Test Files 1 passed (1), Tests 2 passed (2), Duration 4.40s
   - RUN 2: Test Files 1 passed (1), Tests 2 passed (2), Duration 4.12s
   - RUN 3: Test Files 1 passed (1), Tests 2 passed (2), Duration 4.56s

2. Broader slice — no suite-level regression:
   - `npx vitest run src/pages`
   - Result: Test Files 24 passed (24), Tests 142 passed (142), Duration 18.13s

3. Lint:
   - `npm run lint`
   - Result: 157 problems (0 errors, 157 warnings). All warnings are pre-existing and in
     unrelated files (Upload.tsx, tailwind.config.ts, etc.); none in the test file. The
     dropped `beforeEach` import left no unused-import error. Clean (0 errors).

4. Diff scope:
   - `git diff --name-only` → ONLY
     `src/pages/__tests__/AnalysisHistory.interviewPrep.test.tsx`.

## Deviations from Plan

None - plan executed exactly as written.

## Authentication Gates

None.

## Commits

- 5559f7d9: test(quick-260627-8mw-01): de-flake AnalysisHistory interviewPrep test

## Follow-ups

- NYQ-02 / R-03 (flaky `AnalysisHistory.interviewPrep` test) in the v4.0 deferred backlog
  can now be marked closed.

## Self-Check: PASSED

- FOUND: src/pages/__tests__/AnalysisHistory.interviewPrep.test.tsx
- FOUND commit: 5559f7d9
- Static import present; `vi.resetModules()` absent; dynamic `await import(...)` absent.
