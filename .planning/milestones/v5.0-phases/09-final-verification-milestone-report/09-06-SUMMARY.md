---
phase: 09-final-verification-milestone-report
plan: 06
subsystem: testing / VER-02 scenario coverage
tags: [VER-02, S-01c, S-02, S-03, S-04, S-09, S-20, S-21, coverage, e2e, idempotency]
requires:
  - 09-01 (the ver02-matrix registry + the shared-substrate coverage rule)
provides:
  - Per-feature recovery-wiring proof for resume / onboarding / linkedin / recruiting_lens (S-02/03/04/21)
  - S-01c five-consecutive coverage for all five features
  - S-09 replacement-upload coverage for all five features
  - S-20 two-tab cross-context coverage (blocking half; recovery half quarantined + registered)
affects:
  - 09-08 (maps these test names verbatim into the registry; MUST read "Registry mapping" below)
  - 09-04 (owns D9-03 + D9-04, both logged to deferred-items.md)
tech-stack:
  added: []
  patterns:
    - Static source-contract page-wiring guards (CareerCompass.recovery.test.tsx pattern)
    - Per-run unique synthetic PDF fixture generation for E2E (defeats Upload's file_hash dedup)
    - Node-side service-role test-state reset (merit balance + rate-limit counter) for E2E determinism
key-files:
  created:
    - src/pages/__tests__/Upload.recovery.test.tsx
    - src/pages/__tests__/Onboarding.recovery.test.tsx
    - src/pages/__tests__/LinkedInGrader.recovery.test.tsx
    - src/pages/__tests__/RecruitingLens.recovery.test.tsx
    - supabase/functions/_shared/__tests__/consecutive-runs.test.ts
    - supabase/functions/_shared/__tests__/replacement-upload.test.ts
    - e2e/two-tab-concurrency.spec.ts
    - e2e/fixtures/make-unique-resume.ts
  modified:
    - TESTING-STRATEGY.md (quarantine register: 2 rows)
    - vitest.config.ts (Deno-only exclude allowlist)
    - .planning/phases/09-final-verification-milestone-report/deferred-items.md (D9-03, D9-04)
decisions:
  - S-20's cross-context run_id recovery is environment-gated (lifecycle dormant in E2E), NOT flaky — quarantined with owner + expiry rather than faked green
  - Two E2E flake sources (merit exhaustion, 5/hour rate limit) fixed AT SOURCE, not quarantined
  - career_compass IS a document-ingesting feature → covered by S-09, no waiver needed
metrics:
  duration: ~95min
  tasks: 3
  files: 11
  completed: 2026-07-11
---

# Phase 9 Plan 06: VER-02 Gap Closure (S-01c / S-02 / S-03 / S-04 / S-09 / S-20 / S-21) Summary

Closed 31 of the 43 machine-generated matrix gaps: four per-feature recovery-wiring specs (converting 16 shared-substrate cells into per-feature proof), two deterministic Deno guards covering the five-consecutive and replacement-upload scenarios that had **zero** repo-wide coverage, and the first genuine multi-context Playwright spec in the repo.

## What Shipped

| Task | Artifact | Tests | Result |
|---|---|---|---|
| 1 | 4x `src/pages/__tests__/*.recovery.test.tsx` | 20 | green |
| 2 | `_shared/__tests__/consecutive-runs.test.ts` + `replacement-upload.test.ts` | 41 | green |
| 3 | `e2e/two-tab-concurrency.spec.ts` + `fixtures/make-unique-resume.ts` | 1 blocking + 1 quarantined | green 3x |

Verification: vitest `579 passed / 1 failed` (the failure is the intentionally-RED `ver02-matrix` gap assertion, which 09-08 closes); Deno guards `41 passed / 0 failed`; full Playwright suite green **3 consecutive times** (`7 passed / 2 skipped`).

## Registry mapping (09-08 reads this — names are VERBATIM `it()` / `Deno.test()` inner text)

**S-02 / S-03 / S-04 / S-21** — per-feature wiring (pair each with the existing `useAnalysisRun.test.ts` substrate cells, exactly as the `career_compass` column already does):

| Cell | File | Verbatim name |
|---|---|---|
| S-03, S-04 x resume | `src/pages/__tests__/Upload.recovery.test.tsx` | `resume: calls startRun(event.run_id) so a refresh/navigation re-attaches to the live run` |
| S-02 x resume | same | `resume: engages a submit-lock (isLocked \|\| isAnalysisRunActive) to block a duplicate concurrent submit` |
| S-21 x resume | same | `resume: preserves the last successful result so a later failure never clears it` |
| S-03, S-04 x onboarding | `src/pages/__tests__/Onboarding.recovery.test.tsx` | `onboarding: calls startRun(data.run_id) before navigating so a refresh/navigation re-attaches to the live run` |
| S-02 x onboarding | same | `onboarding: mints ONE attemptNonce per deliberate submit and disables the button while loading (a duplicate click cannot mint a second run)` |
| S-21 x onboarding | same | `onboarding: preserves the last successful result so a later failure never clears it` |
| S-03, S-04 x linkedin | `src/pages/__tests__/LinkedInGrader.recovery.test.tsx` | `linkedin: calls startRun(run_id) so a refresh/navigation re-attaches to the live run` |
| S-02 x linkedin | same | `linkedin: mints ONE attemptNonce per deliberate grade and disables submit while loading (a duplicate click cannot double-charge)` |
| S-21 x linkedin | same | `linkedin: a failed grade never clears the previously rendered result (no setResult(null) on the failure path)` |
| S-03, S-04 x recruiting_lens | `src/pages/__tests__/RecruitingLens.recovery.test.tsx` | `recruiting_lens: calls startRun(run_id) so a refresh/navigation re-attaches to the live run` |
| S-02 x recruiting_lens | same | `recruiting_lens: engages the useAnalysisGuard in-flight lock and disables submit while isAnalyzing (a duplicate click cannot start a second run)` |
| S-21 x recruiting_lens | same | `recruiting_lens: a failed analysis never clears the previously rendered result (restored from sessionStorage, not cleared on failure)` |

Each file also carries a `...: imports + initializes useAnalysisRun...` assertion and a `...: the lifecycle wiring is gated on isAnalysisLifecycleEnabled() (dormancy preserved)` assertion (LinkedIn/RCL word the gate as living in the hook — see "Honest deviations" below).

**S-01c** — `supabase/functions/_shared/__tests__/consecutive-runs.test.ts`, parameterized; substitute `{feature}` with `resume` / `onboarding` / `linkedin` / `recruiting_lens` / `career_compass`:
- `S-01c ({feature}): five consecutive runs derive FIVE DISTINCT keys (no collision)`
- `S-01c ({feature}): five consecutive runs produce EXACTLY five debits (no dedup, no double-charge)`
- `S-01c ({feature}): run N+1's key is unaffected by run N's SAVED state (Pitfall 8, across a sequence)`
- `S-01c ({feature}): an accidental resubmit INSIDE the sequence re-charges nothing (same nonce -> replay)`
- plus `S-01c (cross-feature): the same content + same nonce keys SEPARATELY per feature namespace`

**S-09** — `supabase/functions/_shared/__tests__/replacement-upload.test.ts`, same five features:
- `S-09 ({feature}): a REPLACEMENT upload derives a DIFFERENT inputIdentity -> a DIFFERENT key`
- `S-09 ({feature}): the replacement cannot resolve to the ORIGINAL run (no stale result served)`
- `S-09 ({feature}): the DOCUMENT is load-bearing — new content alone re-keys, even on the SAME nonce`
- `S-09 ({feature}): SENSITIVITY CONTROL — the SAME document on the SAME nonce re-derives the SAME key (S-01a)`

**S-20** — `e2e/two-tab-concurrency.spec.ts`:
- BLOCKING (runs today): `one submit with TWO live tabs open creates EXACTLY ONE analysis and AT MOST ONE merit debit`
- QUARANTINED (see below — **do NOT map a cell to this as if covered**): `QUARANTINE: tab B recovers tab A's SAME run_id and the run carries exactly ONE merit debit`

> **09-08 decision required on S-20.** The blocking assertion genuinely proves the no-double-charge invariant across two real browser contexts and is the correct mapping for the five S-20 cells. The *recovery* half cannot run until the lifecycle is activated. Map S-20 to the blocking test; if you want the recovery half counted, it must wait for activation (09-09..09-11) — mapping a `test.skip` as "covered" would be exactly the coverage theatre D-11 forbids.

## `career_compass` S-09 disposition (required by the plan)

**It IS a document-ingesting feature — covered as a full member, NOT waived.** Its `inputIdentity` is built from the document CONTENTS:

- `submit-career-analysis-job/index.ts:146-154` — `buildCareerInputIdentity({ userId, tier, resumeText, linkedinText, linkedinUrl, compareRoles, allowResumeOnly })`
- `analyze-career/index.ts:988-1001` — the direct path mirrors it via `buildCareerCacheKey({ ..., resumeText, linkedinText, ... })`

`resumeText` / `linkedinText` are the uploaded documents' extracted text, so replacing either document changes the identity and therefore the key — exactly like the other four features. No waiver owed.

## Findings

### F1 (product behaviour, not a bug) — Upload de-duplicates on `file_hash`

`src/pages/Upload.tsx` looks up `resumes?file_hash=eq.<sha>&grading_data=not.is.null` and, on a hit, **skips the analysis entirely** and navigates to the existing result. Correct (that is scenario S-08: reused input → reuse prior analysis, no second charge) — but it has a sharp consequence for E2E, below.

### F2 (MEDIUM, logged as D9-03) — `e2e/resume-analysis.spec.ts` currently passes VACUOUSLY

Because of F1, the static `e2e/fixtures/test-resume.pdf` (already analyzed by the seeded user on **2026-06-11**) now always hits the dedup path. Verified against the TEST project across four consecutive runs: the spec completes in **~3.2s** (a real AI_TEST_MODE analysis takes ~19s), creates **zero** `resumes` rows, and renders its "resume screening report" assertion from the **June 11** analysis. The blocking gate is green while the flow the spec is named for has not executed since June. Not fixed here (SCOPE BOUNDARY — it belongs to the VER-01 gate work); the fix is built and proven: point it at `e2e/fixtures/make-unique-resume.ts`. **Owner: 09-04.**

### F3 (LOW-MED, logged as D9-04) — the E2E user's Merits are a finite shared resource

A real analysis costs 3 Merits; the seeded user has 10. After a few gate runs the balance hits 0, Upload's button goes `disabled`, and any merit-spending spec fails with "element is not enabled". Reset per-run inside this spec; the right home is `global-setup.ts`. **Owner: 09-04.**

## Deviations from Plan

### Honest deviations (the plan's assumptions vs. the real source)

**1. The four pages are NOT wired identically — assertions follow the real mechanism, not a template.** The plan assumed all four pages carry the same four facts in the same shape. They do not, so each spec asserts the wiring that actually exists:
- **Resume**'s recovery surface spans THREE files: `Upload.tsx` (lock + nonce), `useResumeStream.ts` (the `startRun(event.run_id)` call off the `complete` SSE event), `Results.tsx` (`run.enabled && run.isFailed && !resume?.grading_data` — the preserve-previous gate). Asserting only against `Upload.tsx` would have missed `startRun` entirely.
- **LinkedIn / Recruiting Lens** do not import `isAnalysisLifecycleEnabled` at all — they rely on the hook's own fail-closed gate (`startRun` no-ops while the flag is off). That is legitimate gating, so the dormancy assertion targets `useAnalysisRun.ts` where the gate actually lives, rather than demanding a redundant page-level import.
- **RCL**'s dup-lock is `useAnalysisGuard` (an in-flight ref lock that rejects a second concurrent call outright), not `AnalysisLockContext`.

**2. [Rule 3 - Blocking] `vitest.config.ts` exclude list extended.** `vitest.config.ts` *includes* `supabase/functions/_shared/__tests__/*.test.ts`, so the two new Deno-only guards were collected by vitest and failed to load (`https://deno.land` imports). Added them to the existing Deno-only exclude allowlist in that same directory — the config's established mechanism for exactly this case. Commit `5fbd3d70`. (`supabase/functions/deno.json` was NOT touched — 09-08 owns registration.)

**3. E2E realities the plan did not anticipate (all fixed AT SOURCE, none quarantined):**
- Auth state is `.auth/user.json`, not `e2e/.auth/user.json`; Playwright drives a local `vite preview` against the Supabase **TEST** project, not staging.
- The spec must submit a **unique** document or it silently tests the dedup path (F1/F2) → added `e2e/fixtures/make-unique-resume.ts`.
- Merit exhaustion (F3) and the `analyze-resume` **5-per-hour** free-tier rate limit (`index.ts:1115-1120`) both turn the spec into a time-bomb flake in a blocking gate. Both are now reset per-run via Node-side service-role writes (the `global-setup.ts` precedent, which already resets Stripe state each run). TESTING-STRATEGY's rule is explicit that flakiness is fixed at source, not quarantined — so it was.
- `admin_set_user_merits` is NOT usable from a service-role caller ("Access denied. Admin role required."); the merit seed is a direct `user_merits` write, matching how `global-setup.ts` seeds `profiles` / `resumes`.

### S-20 quarantine (the one thing that could not be made green honestly)

The cross-context **run_id recovery** assertion cannot execute in the E2E environment: `VITE_FEATURE_ANALYSIS_LIFECYCLE` is absent from the E2E build env, so `isAnalysisLifecycleEnabled()` is false, `useAnalysisRun` is inert, `startRun` no-ops, and **no run_id is ever persisted for tab B to recover**. `MERIT_SYSTEM_ENABLED` is likewise dormant (D-03), so no debit rows are written. This is **not flakiness and not a determinism failure** — it is the dormant posture the milestone deliberately ships until activation.

Rather than weaken the assertion, fake it green, or silently `.skip` it, the test is written out **in full** (it is the real T-09-06-A proof) and QUARANTINED with owner + expiry in `TESTING-STRATEGY.md`'s register — which also gained a row for the pre-existing (previously unregistered) Stripe card-submit quarantine. Un-skip at lifecycle activation (D-01/D-02, plans 09-09..09-11).

The blocking half still has real teeth and runs on every gate: **one submit + two live browser contexts ⇒ exactly ONE analysis, AT MOST ONE debit**, proven non-vacuous (each run durably lands exactly one new analyzed `resumes` row — observed scores 75/80/83/85 across runs).

## Task Commits

| Task | Commit | Description |
|---|---|---|
| 1 | `e5e7bf9c` | Four per-feature recovery-wiring specs (20 tests) |
| 2 | `78ceca21` | S-01c + S-09 Deno guards (41 tests) |
| 3 | `3ef4e925` | Two-tab concurrency E2E + unique synthetic fixture + quarantine register + deferred items |
| — | `5fbd3d70` | Rule-3 fix: vitest Deno-only exclude |

## Mutation proof (acceptance criterion)

Removing `if (runId) analysisRun.startRun(runId);` from `src/pages/LinkedInGrader.tsx` turned `linkedin: calls startRun(run_id) so a refresh/navigation re-attaches to the live run` **RED** (1 failed / 4 passed); reverted, `git diff --stat` clean. The assertions are load-bearing, not decorative.

## Scope discipline

`git diff --stat` across `src/pages/{Upload,Onboarding,LinkedInGrader,RecruitingLens,CareerCompass}.tsx` and `supabase/functions/deno.json` is **EMPTY** for this plan's four commits. No product source or handler was modified; no edge function was deployed; no production flag was flipped.

## Self-Check: PASSED

All 9 claimed artifacts exist on disk; all 5 claimed commits exist in git; working tree clean.
