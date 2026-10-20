---
phase: 09-final-verification-milestone-report
plan: 08
subsystem: testing / gate composition + VER-02 registry
tags: [VER-02, D-11, D-12, fold-in, deno-lane, test-remote, coverage-registry, pitfall-12]

# Dependency graph
requires:
  - phase: 09-final-verification-milestone-report
    plan: 01
    provides: src/test/coverage/ver02-matrix.test.ts — the intentionally-RED registry this plan greens
  - phase: 09-final-verification-milestone-report
    plan: 05
    provides: 4 RCL/LinkedIn Deno suites (75 tests) closing 7 gap cells
  - phase: 09-final-verification-milestone-report
    plan: 06
    provides: 4 recovery specs + 2 Deno guards + the two-tab E2E, closing 31 gap cells
  - phase: 09-final-verification-milestone-report
    plan: 07
    provides: the fail-loud remote lane + 4 history-persistence suites, closing 5 gap cells
provides:
  - "supabase/functions/deno.json — test:ci grew by 11 files (+129 tests); NEW test:remote task, preflight FIRST"
  - "src/test/coverage/ver02-matrix.test.ts — GREEN. 125/125 cells: 120 live tests + 5 justified waivers, 0 gaps"
  - "Registry assertion 5 (T-09-08-C): every mapped supabase/functions test must be registered in a deno.json lane"
  - "Registry cell.param: parameterized suites pin the parameter literal, not just the template title"
  - "D9-05: 32 further Deno test files run in NO lane (dead-lane class is bigger than the 5 history files)"
affects: [09-09, 09-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Close the loop between 'mapped' and 'executed': a coverage registry that only checks a test EXISTS and is NAMED right cannot detect a test that runs in no lane. Assertion 5 reads deno.json and asserts exact token membership."
    - "Parameterized-suite cells pin BOTH the template title and the parameter literal, so deleting a feature from a suite's FEATURES table turns that feature's cells RED (strictly stronger than a name-only check)."
    - "Map only what is PROVEN: a cell over an open defect maps the invariant where it genuinely holds plus a containment assertion that pins the ROUTING (stays true after the fix), and discloses the defect in-source."

key-files:
  created: []
  modified:
    - supabase/functions/deno.json
    - src/test/coverage/ver02-matrix.test.ts
    - .planning/phases/09-final-verification-milestone-report/09-COVERAGE-AUDIT.md
    - .planning/phases/09-final-verification-milestone-report/deferred-items.md

key-decisions:
  - "Registered the 5 history-wiring.test.ts static guards (13 assertions) beyond the plan's six-file list — 09-07 created them AFTER this plan was written and explicitly handed them off. They were in no lane; leaving them out would have been the exact T-09-08-A defect this plan exists to close."
  - "Held interview-prep-analyze/__tests__/history-persistence.test.ts OUT of test:remote with a documented reason (09-07 FINDING 2: no interview_prep AI_TEST_MODE fixture -> the function 500s). It maps to NO matrix cell (D-10). A documented hold-out, never a silent skip."
  - "S-20 mapped to the BLOCKING half of the two-tab spec only. The quarantined recovery half (test.skip) is NOT mapped anywhere — mapping a skipped test as covered is the coverage theatre D-11 forbids."
  - "S-19 x recruiting_lens mapped to real tests but disclosed in-source as NOT an unqualified pass: D9-02's post-save MeritRefundable on the LEGACY path is open. Not papered over, not waived, not fixed."
  - "Zero new waivers. The final 5 waivers are all S-07, all from the 09-01 decision. Task 3's BLOCK condition never triggered."

# Metrics
duration: ~50min
tasks: 3
files: 4
completed: 2026-07-11
---

# Phase 09 Plan 08: The Fold-In — VER-02 Closed and Machine-Enforced Summary

Wave 2 wrote 129 new Deno tests that executed in **no lane at all**; this plan put them in the gate and turned the D-12 registry from RED to GREEN by mapping real tests — 125/125 cells, 120 live tests + 5 justified waivers, zero gaps — then added the assertion that makes "a test that is not in the gate is not coverage" a machine-enforced property rather than a lesson.

## The Numbers

| Gate | Before | After |
|---|---|---|
| `deno task test:ci` | **1133** passed | **1262** passed (+129, 0 failed) |
| `deno task test:remote` | did not exist | **8** passed, 0 failed, **0 ignored** |
| `npx vitest run …/ver02-matrix.test.ts` | 4 passed / **1 FAILED** | **6 passed** / 0 failed |
| `npm run test` | 579 passed / **1 failed** | **581 passed / 0 failed** |
| VER-02 gap cells | **43** | **0** |

The +129 delta is exact and predicted (11 + 18 + 9 + 37 RCL/LinkedIn, 21 + 20 `_shared`, 13 history-wiring). A flat count would have meant the registration did not take — that is T-09-08-A, and it is the precise failure mode that produced the dead history lane.

## Task 1 — Registration

`test:ci` gained **11** files (the plan named six; see Deviation 1). `test:remote` is a **new, separate** task so the offline lane stays offline and CI's `DENO_TEST_SUPABASE_REMOTE: '0'` job keeps working unchanged. The preflight is FIRST, so a broken lane fails once, clearly.

Fail-loud proven **at the task level**, not just the file level:

| Invocation | Result |
|---|---|
| `deno task test:remote` (no env var) | **exit 1** — "must never silently degrade" |
| `DENO_TEST_SUPABASE_REMOTE=1 deno task test:remote` | **exit 0** — 8 passed, **0 ignored** |

`0 ignored` is the load-bearing number. `0 passed; N ignored` is the vacuous-green shape this lane exists to prevent.

## Task 2 — The registry, and the assertion that matters

All 43 gap cells re-mapped to the tests that actually close them. Two structural additions:

**Assertion 5 (T-09-08-C) — the loop-closer.** `deno.json` is an explicit file allowlist, not a directory walk: an unlisted Deno test runs in NO lane. Assertions 2 and 3 prove a mapped test *exists* and is *named right* — **neither proves it ever runs.** Without this, the registry could report 125/125 covered while the covering tests were dead code. It reads `deno.json` and asserts exact token membership (not substring — a substring match would let `foo.test.ts` "match" inside `foo.test.ts.bak` and re-open the hole), plus that the preflight is first (T-09-08-D).

**`cell.param` — parameterized suites.** 09-06's `consecutive-runs` / `replacement-upload` suites and the CORS origin loops use **template-literal titles** (`S-01c (${feature.label}): …`), so the per-feature instance name never appears on disk. Pinning the template alone would have let someone delete `career_compass` from a suite's `FEATURES` table while all five registry cells stayed green — a silent un-covering. A parameterized cell now pins the template **and** the parameter literal (`label: 'career_compass'`). Strictly stronger than the name-only check, never a relaxation.

### Mutation proof — the green-up did not defang anything

Four independent mutations, each reverted:

| Mutation | Result |
|---|---|
| Rename a wave-2 test title (`FEAT-06 [F1]…`) | **RED** on assertion 3 — anti-drift contract survived |
| Drop `consecutive-runs.test.ts` from `test:ci` | **RED** on assertion 5 — "mapped Deno tests that run in NO lane" |
| Delete `career_compass` from `consecutive-runs`' FEATURES table | **RED** on assertion 3 — "the parameterized suite no longer covers this feature" |
| Move the preflight out of first position in `test:remote` | **RED** on assertion 5 |

`git status` clean after all four.

## Task 3 — The waiver audit (D-11: no silent gaps)

**Five waivers. One root cause. One upstream decision. Zero invented.**

| Cell | Reason | approvedBy | Traces to | → item 14 |
|---|---|---|---|---|
| S-07 large PDF x all five features | No upload byte-size guard exists in the PRODUCT (grep-verified absent from `src/lib`, `Upload.tsx`, `document-extraction.ts`). Per-tier CHARACTER caps truncate AFTER extraction and are not a file-size guard. A **product** gap, not a test gap. | `09-01 (D-11 registry decision)` | `09-COVERAGE-AUDIT.md` § S-07 | **YES** |

**Task 3's BLOCK condition never triggered** — no waiver was needed that did not trace upstream, so no justification was invented and no operator escalation was required.

**Zero cells were downgraded from a real test to a waiver to green the phase.** Three candidates were considered and **rejected**:

- **S-09 x career_compass** — NOT waived. 09-06 verified it IS document-ingesting (`buildCareerInputIdentity` hashes `resumeText` + `linkedinText`). Full member.
- **S-20 x all 5** — NOT waived. The blocking half of the two-tab spec runs on every gate.
- **S-16 x recruiting_lens** — NOT waived (09-01): Elite `403` gate + `withMerits` routing + the shared gateway's `402`.

The gap assertion is **still present and not skipped** (`rg "kind: 'gap'"` → 0 matches; the gap *type* is deliberately retained so a future scenario can still be seeded as a loud gap).

## Handoffs honored

1. **09-07 — interview-prep held out.** `interview-prep-analyze/__tests__/history-persistence.test.ts` is **NOT** in `test:remote`. The `interview_prep` `AI_TEST_MODE` fixture does not exist, so the function 500s; registering it would turn the gate RED for a Coming-Soon feature that maps to no matrix cell (D-10). Documented in `deno.json`'s commit, in D9-05, and here — never a silent skip.
2. **09-06 — S-20 quarantine respected.** No cell maps the `test.skip`-ped recovery half. An in-source comment in the registry explains why (VITE_FEATURE_ANALYSIS_LIFECYCLE absent from the E2E build ⇒ no run_id to recover ⇒ the dormant posture the milestone ships, not flakiness).
3. **09-05 — D9-02 not papered over.** S-19 x recruiting_lens maps only what is genuinely proven and carries a prominent in-source ⚠ disclosure that it is **not an unqualified pass**.
4. **D9-01 (`type-check` RED on `chart.tsx`) — surfaced, not silently excluded.** This plan does not touch the gate composition, so it neither fixes nor hides it. It remains 09-04's blocker and is unchanged by this plan.

## Deviations from Plan

### 1. [Rule 2 — Missing critical functionality] Registered 5 files the plan did not list

- **Found during:** Task 1.
- **Issue:** The plan named six new offline files. 09-07 executed *after* the plan was written and created five `{feature}/__tests__/history-wiring.test.ts` static guards (13 assertions, rescued from deletion), explicitly handing their registration to this plan. They were in **no lane**.
- **Fix:** Registered all five in `test:ci`. Leaving them out would have been precisely the T-09-08-A defect this plan exists to close — and would have made the S-22 cells' offline half a fiction.
- **Commit:** `48329c7c`

### 2. Strengthened, not weakened: `cell.param`

The plan did not anticipate that 09-06's suites use template-literal titles. The straightforward reading ("copy the verbatim name") would have produced a registry that could not tell whether a parameterized suite still covered a given feature. Adding `param` closes that hole. Recorded because it changes the registry's type, not just its data.

### 3. Finding — D9-05: the dead-lane class is bigger than five files

Auditing `deno.json` after registration revealed **32 further** `*.test.ts` files in neither lane (`interview-prep-analyze/*` 11, `_tests/*` 7, `*/cache.test.ts`, `_shared/usage-checker.test.ts`, `extract-analysis-structure/*`, `recruiting-lens/__tests__/auth-rethrow.test.ts`, …).

**VER-02 is unaffected** — assertion 5 is GREEN, so none of the 120 test-mapped cells depends on any of them. But it is coverage of unknown value outside the matrix.

**Not fixed (SCOPE BOUNDARY).** Blind registration is the same vacuous-pass failure class this phase keeps catching: a suite that has not run in months may be asserting a retired contract — exactly what 09-07 found in the `grade_linkedin` mock. Each needs to be run and triaged before it is appended. The durable fix is to invert `deno.json` from an allowlist into a **directory walk with an explicit exclusion list** ("opt out loudly" instead of "opt in or die quietly"), which would have prevented both this and the history rot. Logged as **D9-05**, routed to report item 14.

### Auto-fixed issues

None. No production code was changed. `git diff --stat` over `src/`, `supabase/functions/**/index.ts` and `e2e/` is EMPTY across all three commits — this plan touches only `deno.json`, the registry test, and two planning docs.

## Task Commits

| Task | Commit | Description |
|---|---|---|
| 1 | `48329c7c` | Register 11 Deno suites in `test:ci` + the fail-loud `test:remote` task |
| 2 | `e3babe9a` | Close all 43 gap cells + assertion 5 (lane registration) + `cell.param` |
| 3 | `023cea3d` | GREEN final disposition in the coverage audit + D9-05 |

## Verification

- [x] `deno task test:ci` → **1262 passed, 0 failed** (BEFORE: 1133 — strictly greater, by the exact expected delta)
- [x] `DENO_TEST_SUPABASE_REMOTE=1 deno task test:remote` → **8 passed, 0 failed, 0 ignored**, exit 0
- [x] `deno task test:remote` without the env var → **exit 1**, fail-loud
- [x] `npx vitest run src/test/coverage/ver02-matrix.test.ts` → **exit 0, 6/6**
- [x] `npm run test` → **581 passed, 0 failed** (the lane 09-01 deliberately turned RED is GREEN again)
- [x] `deno.json` is valid JSON; `test:ci` is APPEND-only (the pre-existing allowlist is byte-unchanged)
- [x] `rg "kind: 'gap'"` → **0 matches**; the gap assertion is present and not skipped
- [x] Every `kind:'waiver'` cell has a non-empty `reason` AND `approvedBy` (assertion 4 enforces it)
- [x] Four mutation proofs RED, all reverted; working tree clean

## Success Criteria

**VER-02 CLOSED.** 125/125 cells mapped to a live, lane-registered test or an explicitly approved waiver. **Zero new tests exist outside a lane** — and that property is now permanently guarded by assertion 5 rather than by anyone remembering to check.

## Self-Check: PASSED

All 4 modified files exist on disk; all 3 commits (`48329c7c`, `e3babe9a`, `023cea3d`) are present in `git log`; working tree clean.
