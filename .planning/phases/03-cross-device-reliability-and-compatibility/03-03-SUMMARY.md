---
phase: 03-cross-device-reliability-and-compatibility
plan: 03
subsystem: testing
tags: [playwright, e2e, cross-browser, webkit, firefox, mobile-emulation, verify-baseline, msedge]

# Dependency graph
requires:
  - phase: 01-foundation (v4.0 Phase 01/05/09 test infrastructure)
    provides: "playwright.config.ts, e2e/auth.setup.ts storageState, e2e/global-setup.ts seeding, the seven-layer verify:baseline gate"
provides:
  - "5-project Playwright device matrix (chromium, firefox, webkit, mobile-webkit/iPhone 14, mobile-chromium/Pixel 7) sharing one chromium setup run"
  - "Two opt-in real-browser channel projects (edge/msedge, chrome-real/chrome) behind STRIVO_REAL_CHANNELS=1"
  - "The @xdev tag convention + per-project grep mechanism that keeps the matrix affordable"
  - "e2e/cross-device/matrix-smoke.spec.ts — the seed spec proving the lane executes on all 5 projects and can go red"
  - "npm run test:e2e:xdev convenience lane"
  - "A measured wall-clock delta for the matrix recorded in TESTING-STRATEGY.md"
affects: [03-05 discovery specs, 03-04, XTEST-03 regression tests, XTEST-04 manual pass, any later plan adding an @xdev spec]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-project Playwright `grep` restricting added engines to a tagged subset"
    - "Opt-in real-browser `channel:` projects gated on a strict `=== '1'` env read so absence means not-run, never red"
    - "Mandatory mutation proof for any lane whose failure mode is silent vacuity"

key-files:
  created:
    - e2e/cross-device/matrix-smoke.spec.ts
  modified:
    - playwright.config.ts
    - package.json
    - TESTING-STRATEGY.md

key-decisions:
  - "The @xdev RegExp is declared ONCE at module scope in playwright.config.ts and shared by every filtered project, so the tag cannot drift between projects"
  - "test:e2e:xdev is deliberately NOT inserted into verify:baseline — the existing test:e2e step already runs every project, and a second lane would double cost and invite drift (the VER-01 failure mode)"
  - "The seed spec asserts structural properties only (non-empty #root, no horizontal overflow) — no timing assertion can enter the matrix, because a flaky blocking gate is a bypassed blocking gate"
  - "Real-channel projects use `process.env.STRIVO_REAL_CHANNELS === '1'` strict equality (fail-closed), so a host without Edge gets 'not run' rather than a launch throw"
  - "playwright.prod.config.ts is left byte-identical — 5 projects there would 5x real Merit spend and destroy its one-job/one-charge evidence"

patterns-established:
  - "Anti-vacuity rule: every future @xdev spec must be proven able to FAIL by mutation on every project, never merely observed green"
  - "Budget remedy: if the subset exceeds +3 min, cut tests from the subset and record the residual — never drop a project"
  - "Admission rule: a spec joins @xdev only if it asserts something engine-, viewport-, DPR- or input-modality-dependent"

requirements-completed: [XTEST-01, XTEST-02]

# Metrics
duration: 42min
completed: 2026-07-28
---

# Phase 03 Plan 03: Cross-Device Playwright Matrix Summary

**Five-project Playwright matrix (chromium + firefox + webkit + iPhone 14 + Pixel 7) sharing one chromium `setup` storageState, restricted to an `@xdev` tagged subset by per-project `grep`, riding inside the existing `verify:baseline` → `test:e2e` step for a measured +5.6 s.**

## Performance

- **Duration:** ~42 min
- **Started:** 2026-07-28T09:52Z
- **Completed:** 2026-07-28T10:34Z
- **Tasks:** 3
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- **The core XTEST-01 gap is closed.** `playwright.config.ts` went from 2 projects (`setup` + `chromium`) to 6 — every cross-engine defect in this codebase was previously invisible to the blocking gate by construction. Firefox, WebKit, emulated iPhone 14 (WebKit, DPR 3) and emulated Pixel 7 (Chromium, DPR 2.625) now execute against the same local `vite preview` build.
- **The matrix is proven non-vacuous.** The seed spec was mutation-tested: with the overflow assertion inverted, `npx playwright test --grep @xdev` reported **exactly 5 failures — one per project** (`chromium`, `firefox`, `webkit`, `mobile-webkit`, `mobile-chromium`). Restored: **6 passed** (5 projects + `setup`). A green four-project-zero-test matrix — the 09-09 rot in a new costume — is structurally ruled out.
- **The cost is measured, not estimated, and tiny.** Two timed runs each: before (pre-plan project set) **83.3 s / 82.3 s** → mean **82.8 s**; after (full matrix) **87.9 s / 88.9 s** → mean **88.4 s**. **Delta +5.6 s** against a **≤ +3 min (180 s)** budget — ~97% headroom. Nothing was cut from the subset.
- **Real Edge became automatable (D-28) without any host being able to go red.** `edge` (`channel: 'msedge'`) and `chrome-real` (`channel: 'chrome'`) are appended only under `STRIVO_REAL_CHANNELS=1`; with it unset, `--list` enumerates exactly `setup, chromium, firefox, webkit, mobile-webkit, mobile-chromium` and Playwright reports project `edge` as *not found*. With it set, `edge` resolves.
- **XTEST-02 holds with zero gate-composition change.** `verify:baseline` is byte-identical and still ends `... && test:e2e && build`; `test:e2e` (`playwright test`) already runs every registered project. `test:e2e:xdev` exists purely as a convenience/Windows-channel lane and is NOT on the gate.

## Task Commits

1. **Task 1: Register the five projects plus opt-in real-browser channels** — `2d275627` (feat)
2. **Task 2: Seed @xdev spec, mutation proof, and verify:baseline wiring** — `e85ee240` (test)
3. **Task 3: Measure the wall-clock delta and document the @xdev convention** — `3e9ba34e` (docs)

## Files Created/Modified

- `playwright.config.ts` — +79 lines. Module-scope `const XDEV = /@xdev/`; `firefox` / `webkit` / `mobile-webkit` / `mobile-chromium` projects each with `grep: XDEV`, `dependencies: ['setup']` and `storageState: '.auth/user.json'`; conditional spread of `edge` + `chrome-real` under `STRIVO_REAL_CHANNELS === '1'`. A block comment above `projects` records D-01/D-02/D-28/D-03 so the *why* travels with the code. `fullyParallel`, `retries`, `timeout`, `webServer`, `globalSetup`, the `dotenv({ override: !CI })` block and `use.baseURL` are untouched.
- `e2e/cross-device/matrix-smoke.spec.ts` — NEW, 63 lines. `test.describe('cross-device matrix smoke @xdev')` with one test: navigate `/`, assert `#root` is attached and non-empty, assert `scrollWidth <= clientWidth + 1` at the project's own default viewport. `testInfo.project.name` is pushed as an annotation so the report enumerates which projects ran. No `waitForTimeout`, no retry, no `test.slow()`, no hardcoded credential/URL/key.
- `package.json` — exactly **one** added line: `"test:e2e:xdev": "playwright test --grep @xdev"`. No dependency added, removed, bumped or reordered; `package-lock.json` untouched.
- `TESTING-STRATEGY.md` — +129/-3. New "Cross-device matrix — the `@xdev` subset" section (project table, channel table, tag convention, admission rule, budget remedy, wiring, measured wall-clock table, the anti-vacuity rule + mutation result, and the explicit `playwright.prod.config.ts` exclusion). Header `Last updated` re-dated, the Browser-E2E layer row corrected, and two rows added to the quick-command reference.

## Decisions Made

- **Literal `'.auth/user.json'` in each project rather than a shared constant.** The plan's acceptance criterion counts that literal to prove all non-setup projects share the one setup run; a constant would have defeated the check. 7 occurrences (5 default + 2 opt-in) = the number of non-setup projects defined in the file.
- **The "before" wall-clock was measured as `--project=setup --project=chromium` on the current tree**, which reproduces the pre-plan project set exactly (chromium was unfiltered and is byte-identical), rather than by stashing or checking out the prior commit. This respects the "no destructive git" constraint and holds every other variable (same machine, same session, same build) constant, so the delta isolates the matrix.
- **`toBeAttached()` + `not.toBeEmpty()` on `#root` rather than a text/role assertion.** A white screen from a module-eval throw or a failed dynamic import leaves `#root` attached but empty — that is the exact symptom class this phase exists to catch, and it is engine-independent.

## Deviations from Plan

None — plan executed exactly as written. No deviation rule was invoked; no source file outside the plan's four declared files was touched.

## Issues Encountered

**1. Firefox and WebKit browser binaries were absent on the macOS host.** Only Chromium builds were in `~/Library/Caches/ms-playwright`, so the matrix could not have run. Resolved with `npx playwright install firefox webkit` — a local toolchain download only. **No repo file changed**: `@playwright/test` was already 1.61.0 in `package.json`, and no lockfile was rewritten. Worth flagging for CI and for the operator's Windows host: the matrix requires the firefox + webkit binaries to be installed there too, or those projects will fail at launch.

**2. Four pre-existing `chromium` spec failures, environmental and out of scope.** `npm run test:e2e` exits non-zero on this machine: `resume-analysis`, `onboarding-flow`, `onboarding-analysis-failure` and `two-tab-concurrency` all time out waiting for `/results/`. Cause is the documented `AI_TEST_MODE` precondition — that secret is set **transiently during CI only** (TESTING-STRATEGY.md § Secrets), so a local run drives a live Anthropic call that times out. Two proofs this is not a matrix regression: (a) the identical four failures occur with the pre-plan project set (`--project=setup --project=chromium`), and (b) all five matrix projects and all six `@xdev` results are green in the same runs. Per the scope boundary, this was **not** "fixed" — the chromium project's config is byte-identical to HEAD-before-this-plan. The plan's acceptance criterion "`npm run test:e2e` exits 0" is therefore satisfied *for everything this plan owns* and blocked only by that ambient environment condition; it will exit 0 in CI where `AI_TEST_MODE` is set.

## Verification Evidence

| Check | Result |
| ----- | ------ |
| `npx playwright test --list` parses; enumerates the 5 projects | ✅ `setup, chromium, firefox, webkit, mobile-webkit, mobile-chromium` |
| `edge` / `chrome-real` absent with `STRIVO_REAL_CHANNELS` unset | ✅ `Error: Project(s) "edge" not found` |
| `edge` present with `STRIVO_REAL_CHANNELS=1` | ✅ resolves and lists |
| `rg -n "channel:\s*'msedge'" playwright.config.ts` | ✅ exactly 1 match, inside the `=== '1'` conditional |
| `rg -c "storageState: '.auth/user.json'"` | ✅ 7 (= non-setup projects) |
| `git diff --stat playwright.prod.config.ts` | ✅ empty |
| `npm run type-check` | ✅ exit 0 |
| `npm run lint` | ✅ 0 errors (151 pre-existing warnings) |
| `npx playwright test --grep @xdev` | ✅ 6 passed / 28.5 s — one per project + setup |
| Mutation proof (assertion inverted) | ✅ exactly 5 failed, one per project; restored → green |
| `verify:baseline` chain unmodified | ✅ still `... && test:e2e && build`, no `test:e2e:xdev` |
| `.planning/STATE.md` / `.planning/ROADMAP.md` | ✅ untouched |
| Phase 02 owned files | ✅ zero touched |

## User Setup Required

None for the gate itself. Two operator notes:

- **Windows host / CI:** run `npx playwright install firefox webkit` once, or the four added projects fail at launch.
- **Real channels (D-28):** on the Windows host, `STRIVO_REAL_CHANNELS=1 npm run test:e2e:xdev` runs genuine Edge and Chrome. This is what moves Edge out of XTEST-04's manual-only set — the manual pass can drop it once that run is recorded.

## Next Phase Readiness

- **Plan 03-05 (discovery specs) is unblocked** — the observation apparatus D-22 depends on exists and is proven failable. New specs join the subset by putting `@xdev` in the describe title; nothing in `playwright.config.ts` needs to change again.
- **Headroom is large but finite.** +5.6 s of a 180 s budget was spent on one test × 4 projects. 03-05's per-width overflow sweep (8 widths × N surfaces) multiplies by 5, so it should re-measure and record its own delta in the same TESTING-STRATEGY.md table.
- **Carried concern:** `npm run test:e2e` cannot go green on a developer machine while `AI_TEST_MODE` is unset on the preview project. That predates this plan and is not this plan's to fix, but it does mean local `verify:baseline` is currently red at layer 6 for reasons unrelated to any change under review.
- **Untouched by design:** `playwright.prod.config.ts`, `.planning/STATE.md`, `.planning/ROADMAP.md`, and every Phase 02 file. Nothing was pushed.

## Self-Check: PASSED

All 5 declared files exist on disk. All 4 commit hashes resolve in `git log --all`. `git diff d5e4fe83..HEAD --name-only` over `.planning/STATE.md`, `.planning/ROADMAP.md` and `.planning/phases/02-ai-token-cost-optimization/` returns **0 paths** — the shared tracking files and the in-flight Phase 02 tree are byte-identical to their state at dispatch. Working tree clean; nothing pushed; still on `staging`.

---
*Phase: 03-cross-device-reliability-and-compatibility*
*Completed: 2026-07-28*
