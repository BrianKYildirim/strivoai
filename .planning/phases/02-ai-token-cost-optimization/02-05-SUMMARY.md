---
phase: 02-ai-token-cost-optimization
plan: 05
subsystem: edge-functions
tags: [token-budget, max-tokens, anthropic, boot-invariants, telemetry]

requires:
  - phase: 02-01
    provides: "Operator-approved TEMP diagnostic cap table and production measurement prerequisites"
  - phase: 02-03
    provides: "Per-call telemetry labels for Resume Analysis and Career Compass"
  - phase: 02-04
    provides: "Per-call telemetry labels for LinkedIn Grader and Recruiting Lens"
provides:
  - "Operator-approved TEMP output ceilings across the SC-12 table and locked snapshot"
  - "Lockstep per-call budgets for Resume Analysis, Career Compass, and Recruiting Lens"
  - "Derived 12000-token LinkedIn Grader paid-tier ceiling with corrected runtime documentation"
  - "Legacy maxTokens tracker superseded for the four Phase 02 features; Interview Prep remains open"
affects: [02-06-production-measurement, 02-09-final-cap-implementation, edge-function-deploy]

tech-stack:
  added: []
  patterns:
    - "Central tier ceilings, per-call allocations, and source-probe replicas move in one lockstep change"
    - "Every temporary cap cell is mechanically discoverable through a TEMP Phase 02 marker"

key-files:
  created:
    - .planning/phases/02-ai-token-cost-optimization/02-05-SUMMARY.md
  modified:
    - src/config/pricing-config.ts
    - src/config/pricing-config.snapshot.ts
    - src/config/__tests__/sc12-snapshot.test.ts
    - supabase/functions/analyze-resume/index.ts
    - supabase/functions/analyze-resume/index.test.ts
    - supabase/functions/analyze-career/index.ts
    - supabase/functions/analyze-career/index.test.ts
    - supabase/functions/analyze-career/__tests__/token-budget.test.ts
    - supabase/functions/recruiting-lens/index.ts
    - supabase/functions/grade-linkedin/index.ts
    - .planning/maxtoken-tuning/TRACKER.md

key-decisions:
  - "Applied the operator-locked 02-PREREQS Section B table verbatim; no cap was narrowed or substituted"
  - "Kept Interview Prep Coach output ceilings byte-identical and left its tuning tracker item open"
  - "No Vercel redeploy is needed for cap delivery because src has no runtime maxTokensOutput consumer outside config; the affected Edge Functions must be deployed for 02-06"

patterns-established:
  - "Run scripts/check-edge-boot.mjs after every token-budget lockstep change because source-probe tests cannot detect module-load throws"
  - "Plan 02-09 replaces TEMP markers directly with approved measured values or pre-TEMP values in one commit"

requirements-completed: [TOK-03]

duration: 46min
completed: 2026-07-21
---

# Phase 02 Plan 05: TEMP Diagnostic Token Ceilings Summary

**The approved temporary diagnostic ceilings now load cleanly across all 38 Edge Functions, with every central cap, per-call budget, test replica, and tracker surface reconciled for the 21-run production study.**

## Performance

- **Duration:** 46 min (including recovery audit and full baseline)
- **Started:** 2026-07-21T21:44:01Z
- **Completed:** 2026-07-21T22:29:38Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Raised the temporary tier ceilings to Free 30000 and Pro/Elite 100000 aggregate sums while preserving Interview Prep values.
- Raised Resume Analysis to 8000/8000/8000/6000, Career Compass to 9000/6000/4000, Recruiting Lens to 9000 x 3, and LinkedIn paid tiers to their derived 12000 ceiling.
- Proved every production module evaluates without a boot-time invariant throw and all four focused function trees pass 548 tests.
- Closed the stale four-feature tuning mini-milestone under Phase 02 while leaving Interview Prep Coach open.

## Task Commits

Each task was committed atomically:

1. **Task 1: Apply TEMP ceilings to the SC-12 central table, snapshot and test** - `5866628c`
2. **Task 2: Apply TEMP per-call budgets to CALL_CONFIGS and test replicas** - `df2d8a57`
3. **Task 3: Close out TRACKER.md and prove the deploy gate** - `539bbfbe`

**Plan metadata:** committed with this summary after all production/task commits.

## Files Created/Modified

- `src/config/pricing-config.ts` - TEMP central output ceilings and recomputed tier-sum documentation.
- `src/config/pricing-config.snapshot.ts` - Lockstep SC-12 replica and 30000/100000/100000 tier sums.
- `src/config/__tests__/sc12-snapshot.test.ts` - Reconciled tier-sum test title and assertions.
- `supabase/functions/analyze-resume/index.ts` - Paid per-call split 8000/8000/8000/6000 with GATE-09 still satisfied.
- `supabase/functions/analyze-resume/index.test.ts` - Lockstep allocation replica, sums, failure thresholds, and clamp checks.
- `supabase/functions/analyze-career/index.ts` - Free 9000 and paid 9000/6000/4000 splits with unchanged brevity targets.
- `supabase/functions/analyze-career/index.test.ts` - Lockstep allocation replica and updated CC-05 expectations.
- `supabase/functions/analyze-career/__tests__/token-budget.test.ts` - Central cap and base-free tripwire updated to the TEMP values.
- `supabase/functions/recruiting-lens/index.ts` - Three paid calls raised from 5000 to 9000 each.
- `supabase/functions/grade-linkedin/index.ts` - Corrected derived-cap documentation for 12000 across active tiers.
- `.planning/maxtoken-tuning/TRACKER.md` - Four features superseded by Phase 02; Interview Prep remains open.

## Lockstep Blast-Radius Audit

| Row | Result |
| --- | --- |
| Resume Free | Central ceiling remains 9000; vestigial replica sum remains 5000; real Free call derives 9000; GATE-09 is 9000 < 15000 |
| Resume Pro/Elite | Central ceiling and active four-call sum both 30000; all four production and replica cells marked TEMP |
| Career Free | Central ceiling, `base.maxTokensFree`, both replicas, and token-budget tripwire all 9000 |
| Career Pro/Elite | Central ceiling and 9000+6000+4000 call sum both 19000; brevity checks remain 2200x1.8 <= 9000 and 4500x1.8 <= 19000 |
| LinkedIn | Single derived call reads 12000 for Free/Pro/Elite; stale 5000/8000 documentation removed |
| Recruiting Lens | Central ceiling and 9000x3 call sum both 27000; grep confirmed no budget replica exists outside `index.ts` |
| Interview Prep | Byte-identical across the Task 1 commit: Free 0, Pro 12000, Elite 12000 |

## Verification

| Check | Result |
| --- | --- |
| `npx vitest run src/config/__tests__/sc12-snapshot.test.ts` | **5 passed / 0 failed** |
| `rg maxTokensOutput src/ --glob '!src/config/**'` | **No runtime frontend consumers**; no Vercel redeploy required for the cap change |
| `node scripts/check-edge-boot.mjs` | **38/38 Edge Functions evaluated cleanly** after pointing PATH at the installed `deno.exe` |
| `deno test analyze-resume/ analyze-career/ recruiting-lens/ grade-linkedin/ --no-check --allow-all` | **548 passed / 0 failed** |
| `npm run verify:baseline` | **PASS (exit 0)**: lint and type-check green; Vitest 742/742; offline Edge 1368 passed / 0 failed / 12 ignored; remote preview 8/8; Playwright 9 passed / 2 quarantined; production build green |
| TEMP marker audit | All changed central/source/test-replica budget cells are mechanically discoverable for Plan 02-09 |
| `git diff --check` | Clean before each task commit |

## Decisions Made

- Followed the locked operator approval exactly. Temporary ceilings are measurement guardrails, not cost targets.
- Preserved the existing Career brevity targets and both Free single-call prompt constants; prompt-shape tuning is outside this plan.
- A5 found no runtime frontend reads of `maxTokensOutput` outside `src/config`, so Plan 02-06 needs the affected Edge Function deployment but not a Vercel frontend redeploy for these caps.

## Deviations from Plan

None - the recovered partial Task 2 was audited, corrected where its comments/test title were stale, and completed within the declared lockstep scope.

## Issues Encountered

- The first `node scripts/check-edge-boot.mjs` attempt reported 38 spawn failures because Node could not resolve the Windows `deno.cmd` shim (`spawn deno ENOENT`). The installed `C:\Users\yildi\AppData\Roaming\npm\node_modules\deno\deno.exe` directory was prepended to `PATH`; the unchanged gate then passed all 38 modules. This was a local command-resolution issue, not a module boot failure.
- The baseline emitted existing non-blocking lint, Tailwind ambiguity, and bundle-size warnings. Every baseline leg completed and the command exited 0.

## User Setup Required

None for this plan. Plan 02-06 owns the operator-controlled production deployment and measurement accounts already documented in `02-PREREQS.md`.

## Next Phase Readiness

- Ready for Plan 02-06 to deploy the affected Edge Functions and run the 21 approved production analyses.
- The temporary values must not be treated as final. Plan 02-09 owns the measured right-sizing edit using the TEMP markers.
- No remaining blocker from Plan 02-05.

## Self-Check: PASSED

All claimed files exist, all three task commits are present, Task 1 preserves Interview Prep byte-for-byte, Task 2 passes both the real module-loader gate and the four focused Deno trees, Task 3 passes the complete deployment baseline, and the only untracked file remains the explicitly excluded `.gitkeep`.

---
*Phase: 02-ai-token-cost-optimization*
*Completed: 2026-07-21*
