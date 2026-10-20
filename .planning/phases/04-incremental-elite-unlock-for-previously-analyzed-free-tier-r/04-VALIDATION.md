---
phase: 04
slug: incremental-elite-unlock-for-previously-analyzed-free-tier-resumes
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-30
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for incremental feedback during execution.

## Test Infrastructure

| Property | Value |
|---|---|
| **Frameworks** | Vitest 4.1.9, Deno 2 test, Playwright 1.61, remote Supabase Deno tests |
| **Config files** | `vite.config.ts`, `supabase/functions/deno.json`, `playwright.config.ts` |
| **Quick frontend command** | `npm test -- --run src/hooks/__tests__/useEliteRerun.test.ts src/pages/__tests__/Results.tier-reconciliation.test.tsx` |
| **Quick backend command** | `cd supabase/functions; deno test --allow-all --no-check _shared/resume-elite-unlock.test.ts analyze-resume/__tests__/incremental-elite-unlock.test.ts` |
| **Full suite command** | `npm run verify:baseline` |
| **Estimated focused runtime** | Under 60 seconds on a warm local install |

## Sampling Rate

- **After every implementation task:** Run the closest focused Vitest or Deno
  command from the verification map.
- **After every plan wave:** Run all Phase 04 frontend and backend focused tests.
- **Before `$gsd-verify-work`:** `npm run verify:baseline` must be green, with the
  preview-remote database test enabled.
- **Max feedback latency:** 60 seconds for focused tests; longer baseline and
  remote suites run only at wave/final gates.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure behavior | Test type | Automated command | File exists | Status |
|---|---:|---:|---|---|---|---|---|---|---|
| 04-01-T1 | 04-01 | 1 | AC-01, AC-02 | T-04-03 | Patch cannot assign Free-owned fields | Deno unit | `cd supabase/functions; deno test --allow-all --no-check _shared/resume-elite-unlock.test.ts` | No — created by 04-01 | pending |
| 04-03-T1 | 04-03 | 2 | AC-05, AC-07, AC-09 | T-04-01, T-04-04, T-04-05 | Eligibility and failures are fail-closed | Deno contract | `cd supabase/functions; deno test --allow-all --no-check analyze-resume/__tests__/incremental-elite-unlock.test.ts` | No — created by 04-03 | pending |
| 04-02-T2/T3 | 04-02 | 1 | AC-03, AC-04, AC-06 | T-04-05, T-04-07, T-04-08 | Atomic persist, replay, and usage linkage | Remote Deno | `npm run test:edge:remote` | Harness exists; case added then preview-pushed by 04-02 | pending |
| 04-03-T2 | 04-03 | 2 | AC-01, AC-02, AC-06 | T-04-03, T-04-06, T-04-09 | Conditional prompts and telemetry expose no content | Deno contract | `cd supabase/functions; deno test --allow-all --no-check analyze-resume/__tests__/incremental-elite-unlock.test.ts _shared/telemetry-coverage.test.ts` | Partial — cases added by 04-03 | pending |
| 04-04-T1 | 04-04 | 3 | AC-03, AC-04 | T-04-05 | Same-row unlock and stable request identity | Vitest | `npm test -- --run src/hooks/__tests__/useEliteRerun.test.ts` | Existing file; contract replaced by 04-04 | pending |
| 04-04-T2 | 04-04 | 3 | AC-03, AC-08 | T-04-04 | Merged tier reveals paid sections; changed upload stays full path | Vitest | `npm test -- --run src/pages/__tests__/Results.tier-reconciliation.test.tsx src/pages/__tests__/Results.stream-tier-carry.test.tsx` | Existing files; cases extended by 04-04 | pending |
| 04-04-T3/T4 | 04-04 | 3 | AC-01–AC-09 | T-04-01–T-04-09 | All local and preview gates pass | Full regression + preview smoke | `npm run verify:baseline` | Baseline exists; preview evidence is operator-gated | pending |

## Wave 0 Requirements

- [ ] `supabase/functions/_shared/resume-elite-unlock.test.ts` — immutable
  projection, missing-section detector, allowlisted merge, and idempotency.
- [ ] `supabase/functions/analyze-resume/__tests__/incremental-elite-unlock.test.ts`
  — eligibility, prompts, lifecycle, failure, and telemetry contract.
- [ ] Add an incremental-unlock case to the existing remote history/persistence
  suite or a focused remote test included by `test:remote`.
- [ ] Replace clone-based assertions in
  `src/hooks/__tests__/useEliteRerun.test.ts` with same-row unlock assertions.
- [ ] Extend Results tier reconciliation tests for the persisted merged result.

No new test framework installation is required.

## Manual-Only Verifications

| Behavior | Requirement | Why manual | Test instructions |
|---|---|---|---|
| CTA/loading copy and visual continuity on the Results page | AC-03 | Visual quality is not fully represented by DOM assertions | In preview, open a Free-analyzed resume as an Elite user, trigger unlock, confirm the existing Free content does not flicker or change, and confirm the full layout appears after completion. |
| Production remains untouched | AC-07 | Requires operator/environment evidence | Verify deployment output names the preview project. Do not apply production until the exact operator signal `apply production`. |

## Validation Sign-Off

- [x] All anticipated implementation tasks have an automated verification path
  or a Wave 0 dependency.
- [x] Sampling continuity is defined with no three-task gap.
- [x] Wave 0 identifies every missing focused test artifact.
- [x] Commands use run mode, not watch mode.
- [x] Focused feedback target is under 60 seconds.
- [x] `nyquist_compliant: true` is set in frontmatter.

**Approval:** Phase plans created on 2026-07-30; `04-UI-SPEC.md` is approved. Execution evidence remains pending.
