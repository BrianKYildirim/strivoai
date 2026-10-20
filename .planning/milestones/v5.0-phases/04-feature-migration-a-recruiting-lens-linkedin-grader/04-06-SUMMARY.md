---
phase: 04-feature-migration-a-recruiting-lens-linkedin-grader
plan: 06
subsystem: testing
tags: [deno, vitest, promptfoo, zod, cors, idempotency, linkedin-grader, recruiting-lens, ver-03]

# Dependency graph
requires:
  - phase: 04-02
    provides: LINKEDIN_SECTIONS / normalizeFromSections / LINKEDIN_SCORE_BANDS / scoreBand / linkedInSemanticCheck (scoring core)
  - phase: 04-03
    provides: 11-section evidence-anchored prompt with zero numeric calibration anchors + no follow-up re-injection
  - phase: 04-04
    provides: grade-linkedin lifecycle migration (stable sha256 idempotency identity, save-throw refund boundary, dormancy split)
  - phase: 04-05
    provides: LinkedIn results-UI D-05 teaser removal + attemptNonce/run_id refresh recovery
  - phase: 04-01
    provides: recruitingLensOutputSchema (byte-preserve validator) + recruiting-lens lifecycle migration
  - phase: 03
    provides: deriveIdempotencyKey, analysis-lifecycle executor, validateModelOutput, dormancy guard
  - phase: 01
    provides: withCors / jsonError CORS-by-construction primitives + ALLOWED_ORIGINS allowlist
provides:
  - "VER-03 deterministic four-band distribution proof (realistic per-section fixtures, no ~52 pileup, D-01 context-aware-max not floored)"
  - "FEAT-03 aggregate fixed-source guard (fails-closed on prompt anchors / prior_grade_id / schema default / LOCKED_FIXES_PLACEHOLDERS + runtime malformed-output -> typed error)"
  - "FEAT-04 repeated-run/idempotency + executor refund-boundary proof (one deduction / new run / save-throw refund+retryable / no post-save settle)"
  - "FEAT-06 CORS status matrix (both origins x 200/401/402/403/429/500 + Pitfall-7 thrown-401) + Recruiting Lens byte-preserve deep-equal"
  - "Non-blocking live promptfoo VER-03 distribution eval (preview Haiku) via test:adversarial:linkedin-distribution"
  - "All new deterministic guards registered in deno.json test:ci (Pitfall 12 closed)"
affects: [phase-05-feature-migration-b, phase-06-career-compass, phase-07-dashboard, phase-09-final-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Static-source fixed-source guard (comment-stripped grep) as the fails-closed regression lock for removed anti-patterns"
    - "Runtime status-class CORS matrix over withCors/jsonError proving origin-reflected ACAO + Vary on every exit"
    - "zod byte-preserve deep-equal (validated output === input) as the D-06 no-field-loss lock"
    - "Frontend source-grep removal proofs mirror the backend fixed-source-guard posture"

key-files:
  created:
    - supabase/functions/grade-linkedin/__tests__/distribution.test.ts
    - supabase/functions/grade-linkedin/__tests__/fixed-source-guard.test.ts
    - supabase/functions/grade-linkedin/__tests__/idempotency-repeated-run.test.ts
    - supabase/functions/recruiting-lens/__tests__/cors-matrix.test.ts
    - supabase/functions/recruiting-lens/__tests__/byte-preserve.test.ts
    - supabase/functions/grade-linkedin/__tests__/fixtures/injection/promptfooconfig.linkedin-distribution.yaml
  modified:
    - supabase/functions/deno.json
    - package.json
    - src/pages/LinkedInGrader.phase22.test.ts
    - src/pages/__tests__/LinkedInGrader.output-parity.test.tsx

key-decisions:
  - "The dormancy guard needed no edit — 04-04 already split recruiting-lens/grade-linkedin into MIGRATED_ENTRYPOINTS (flag-gated) while keeping un-migrated entrypoints asserted dormant."
  - "The apex+www live CORS re-proof (D-06) is a PROD concern — preview's allowlist is preview/localhost only, so the orchestrator re-proved against prod (zjpjapgraoxdukdvpjes)."
  - "Two stale 04-05 frontend teaser tests reconciled to prove D-05 removal (Rule 1) — 04-05 ran only tsc+lint so it missed them."

patterns-established:
  - "Pattern: an unregistered guard is a silent gap — every new .test.ts appended to the explicit deno.json test:ci allowlist (Pitfall 12 / T-04-20)."
  - "Pattern: the live promptfoo differentiation eval is NON-blocking (off verify:baseline / off the PR gate) — real-AI, costed, operator/scheduled-run only."

requirements-completed: [FEAT-03, FEAT-04, FEAT-06, VER-03]

# Metrics
duration: 16min
completed: 2026-07-02
---

# Phase 04 Plan 06: Verification Fold-In (Recruiting Lens + LinkedIn Grader) Summary

**Folded VER-03 / FEAT-03 / FEAT-04 / FEAT-06 proof obligations into the blocking offline gate (5 new deterministic Deno suites, +66 tests, deno test:ci 1009/0/12) plus a non-blocking live promptfoo distribution eval, and re-proved the Recruiting Lens apex+www CORS path live on production.**

## Performance

- **Duration:** 16 min (execution; excludes operator checkpoint turnaround)
- **Started:** 2026-07-02T21:57:50Z
- **Completed:** 2026-07-02T22:14:23Z
- **Tasks:** 4 (3 auto + 1 blocking operator checkpoint, resolved)
- **Files modified:** 10 (6 created, 4 modified)

## Accomplishments
- **VER-03 (offline):** four realistic uneven-per-section fixtures land in four distinct recalibrated bands (weak/average/strong/exceptional), none inside the 48-58 ~52-cluster window, inter-band gap >= 10; a strong senior IC with Projects `applicable:false` is NOT floored (D-01 context-aware max).
- **FEAT-03 fixed-source guard:** fails-closed on any reintroduced prompt calibration anchor / `followUp` re-injection / `prior_grade_id` in the key / schema `.default`/placeholder score / `LOCKED_FIXES_PLACEHOLDERS`; and proves a truncated/empty/garbage/total-mismatched model output flows through `validateModelOutput` to a TYPED error — never a 200-with-body, never a fabricated score.
- **FEAT-04:** same `attemptNonce` -> one deduction, fresh nonce -> new run (History preserved), stable `inputIdentity` survives a save mutation (Pitfall 8), and the executor save-throw -> refund + `retryable_failed` + no settle (with no refund reachable past the point of no return).
- **FEAT-06:** a runtime CORS matrix proves both `strivoai.net` and `www.strivoai.net` carry origin-reflected `Access-Control-Allow-Origin` + `Vary: Origin` across 200/401/402/403/429/500 (handler return + `jsonError`), including a 401 thrown by auth (Pitfall 7); byte-preserve deep-equals full Elite, the REAL Pro tier-shaped subset, a minimal passing sample, and passthrough extras (D-06 no field loss).
- **Registration + live layer:** all five new suites + the 04-01 `recruiting-lens/schema.test.ts` registered in `deno.json` test:ci; a non-blocking `test:adversarial:linkedin-distribution` promptfoo preview eval added (NOT in `verify:baseline`).

## Task Commits

Each task was committed atomically:

1. **Task 1: VER-03 distribution + FEAT-03 fixed-source guard + FEAT-04 idempotency** - `ee9729cd` (test)
2. **Task 2: FEAT-06 CORS status matrix + Recruiting Lens byte-preserve** - `2a9981b9` (test)
3. **Task 3: dormancy-guard confirm + test:ci registration + non-blocking promptfoo distribution eval** - `06c0abc1` (chore)
4. **Task 4 (checkpoint reconciliation): reconcile stale LinkedIn teaser gates to D-05 removal proof** - `c45f0edf` (test)

**Plan metadata:** (final docs commit — this SUMMARY + STATE.md)

## Files Created/Modified
- `supabase/functions/grade-linkedin/__tests__/distribution.test.ts` - VER-03 four-band spread + D-01 context-aware-max proof (deterministic).
- `supabase/functions/grade-linkedin/__tests__/fixed-source-guard.test.ts` - FEAT-03 aggregate static + runtime fails-closed guard.
- `supabase/functions/grade-linkedin/__tests__/idempotency-repeated-run.test.ts` - FEAT-04 one-deduction/new-run + executor refund-boundary contract.
- `supabase/functions/recruiting-lens/__tests__/cors-matrix.test.ts` - FEAT-06 both-origin status-class CORS matrix (+ Pitfall 7).
- `supabase/functions/recruiting-lens/__tests__/byte-preserve.test.ts` - D-06 deep-equal no-field-loss guard.
- `supabase/functions/grade-linkedin/__tests__/fixtures/injection/promptfooconfig.linkedin-distribution.yaml` - live preview-Haiku VER-03 differentiation eval (off-gate).
- `supabase/functions/deno.json` - appended 6 test files to the test:ci allowlist.
- `package.json` - added non-blocking `test:adversarial:linkedin-distribution` script.
- `src/pages/LinkedInGrader.phase22.test.ts` - SC-2 block flipped to a D-05 teaser-removal proof (SC-1/SC-3 unchanged).
- `src/pages/__tests__/LinkedInGrader.output-parity.test.tsx` - two teaser tests flipped to full-fix-list parity (other 3 unchanged).

## Decisions Made
- **Dormancy guard already correct:** 04-04 pre-split the migrated features into `MIGRATED_ENTRYPOINTS` (flag-gated) while keeping analyze-resume/analyze-career + the resume/career job workers asserted dormant, so Task 3's guard-fix step was a confirmed no-op.
- **apex+www CORS re-proof is a prod concern:** preview's allowlist is preview/localhost, so the live D-06 re-proof ran against production; the deterministic cors-matrix locks the code path offline.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reconciled two stale 04-05 frontend teaser tests to the D-05 removal contract**
- **Found during:** Task 4 (operator checkpoint — the vitest leg of `verify:baseline` was RED, 9 failures across 2 files)
- **Issue:** 04-05 removed the LinkedIn free-tier teaser per D-05 (Free now sees the full 11-section output + complete fix list; no `LOCKED_FIXES_PLACEHOLDERS`, no `BlurredLockCard`, no free slice) but ran only tsc+lint, so `LinkedInGrader.phase22.test.ts` (SC-2, 7 tests) and `LinkedInGrader.output-parity.test.tsx` (2 tests) still asserted the OLD teaser behavior and failed.
- **Fix:** Flipped the SC-2 block to a removal proof (`.not.toContain('LOCKED_FIXES_PLACEHOLDERS' / 'BlurredLockCard' / 'Headline Refinement #2'`; fixes render via `result.topFixes.map`, no `isFreeGated ? 1` slice) and rewrote the two output-parity tests to assert the full fix list renders to all tiers. SC-1/SC-3 and the other 3 parity tests kept byte-identical. Test-file reconciliation only — no product code touched (mirrors the backend `fixed-source-guard.test.ts` posture: it now fails-closed if the teaser is reintroduced).
- **Files modified:** src/pages/LinkedInGrader.phase22.test.ts, src/pages/__tests__/LinkedInGrader.output-parity.test.tsx
- **Verification:** `npm run test` -> vitest 495/0 green (SC-2 went 7 -> 4 tests, netting the expected count).
- **Committed in:** `c45f0edf`

---

**Total deviations:** 1 auto-fixed (1 Rule-1 stale-test reconciliation of an already-approved, already-verified 04-05 behavior change)
**Impact on plan:** No scope creep — a pre-existing stale-test gap surfaced only because 04-06 is the plan that runs the full gate; product behavior unchanged.

## Issues Encountered
- The blocking operator checkpoint could not be fully automated locally (no deployed-preview access, no test JWT, and the Supabase prod read-only MCP is operator-side, not in this executor's Bash toolset). The orchestrator resolved it — see Checkpoint Results below.

## Checkpoint Results (proven by orchestrator; recorded, not re-run)
- **Live CORS re-proof (D-06) — PASS on PRODUCTION (`zjpjapgraoxdukdvpjes`):** OPTIONS from `https://strivoai.net` and `https://www.strivoai.net` -> 200 with ACAO reflected for the sent origin + `Vary: Origin` + `Allow-Methods: GET, POST, OPTIONS`; POST no-auth (both origins) -> 400 WITH ACAO reflected (errors carry CORS); non-allowlisted `https://evil.example.com` -> NO ACAO (fail-closed). Preview does not reflect prod origins by design.
- **Prod score-default inspection (FEAT-03) — CLEAN (read-only, no migration):** `public.analysis_results.primary_score` = integer, DEFAULT NULL, nullable YES; `public.linkedin_grades.overall_score` = integer, DEFAULT NULL, NOT NULL (no default — the app must supply the server-computed normalized total; no DB default can surface a fabricated score).
- **verify:baseline legs:** deno leg green (1009/0/12); vitest leg now green (495/0 after the Rule-1 reconciliation); Playwright leg remains E2E-secret-gated (pre-existing deferred `P03-E2E-SECRETS`, not a regression).

## User Setup Required
None - no external service configuration required. Feature-flag flips (`ANALYSIS_LIFECYCLE_ENABLED` + per-feature + `VITE_FEATURE_ANALYSIS_LIFECYCLE`) remain a deliberate post-checkpoint operator action; the code ships dormant-capable with legacy fall-through.

## Next Phase Readiness
- Phase 4 verification is complete: VER-03 four-band spread proven deterministically + live-eval-ready, FEAT-03 fixed-source guard fails-closed, FEAT-04 idempotency/refund proven, FEAT-06 CORS re-proved for apex+www and byte-preserve held; all guards registered, deno+vitest green, advisor floor not increased (no DB change).
- Ready for Phase 5 (Feature Migration B — Resume Analysis + Onboarding). The dormancy guard still asserts analyze-resume/analyze-career + the resume/career job workers unwired until Phase 5/6.

---
*Phase: 04-feature-migration-a-recruiting-lens-linkedin-grader*
*Completed: 2026-07-02*

## Self-Check: PASSED

- All 6 created files present on disk + SUMMARY.md.
- All 4 task commits present in git history (ee9729cd, 2a9981b9, 06c0abc1, c45f0edf).
- deno.json test:ci registration + package.json non-blocking script confirmed.
- Offline gate green: deno test:ci 1009/0/12; vitest 495/0.
