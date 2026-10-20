# Phase 01 — Deferred Items (out-of-scope discoveries during execution)

Logged per the executor scope boundary: failures/issues NOT directly caused by this
phase's changes are recorded here and NOT fixed in-plan.

## From 01-07 (CORS-05 drift guard)

### D1 — Pre-existing flaky vitest: `AnalysisHistory.interviewPrep.test.tsx`
- **Discovered during:** 01-07 Task 2 (`npm test` baseline characterization).
- **Symptom:** 2 of 457 vitest tests fail in `src/pages/__tests__/AnalysisHistory.interviewPrep.test.tsx`.
  Nondeterministic failure mode — "Test timed out in 5000ms" in the full-suite run,
  "found multiple elements with text /career compass/i" when the file runs in isolation.
- **Root cause (observed):** the file's `afterEach` only calls `vi.unstubAllEnvs()`; it does
  not run React Testing Library `cleanup()`, so the second `it` can see the first test's
  still-mounted DOM (duplicate "career compass" row). Classic test-isolation defect.
- **Relationship to 01-07:** NONE. This plan changed only
  `supabase/functions/_shared/cors-audit.test.ts` (new Deno test) and
  `supabase/functions/deno.json` (test:ci registration). Neither is importable by vitest,
  so this frontend failure cannot be caused by the CORS audit work.
- **Disposition:** OUT OF SCOPE — this is the previously-documented flake
  **NYQ-02 / R-03** ("flaky `AnalysisHistory.interviewPrep` test", open) carried forward in
  STATE.md Deferred Items from the v4.0 close. Not fixed here (scope boundary + it owns a
  separate remediation track). The other 455 vitest tests pass; the full offline edge suite
  (`deno task test:ci`) is green at 791 passed / 0 failed / 11 ignored.
