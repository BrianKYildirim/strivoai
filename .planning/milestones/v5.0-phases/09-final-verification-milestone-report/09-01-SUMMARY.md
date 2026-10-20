---
phase: 09-final-verification-milestone-report
plan: 01
subsystem: testing / verification
tags: [ver-02, coverage-registry, d-12, anti-drift, vitest, static-guard]
requires:
  - Phase 3/4/5/6 test estate (idempotency-repeated-run, runtime-validation-convergence,
    refund-boundary, classifier, useAnalysisRun, CareerCompass.recovery)
provides:
  - The D-12 machine-enforced VER-02 coverage registry (125 cells) as an executable vitest guard
  - The machine-generated RED gap list — the authoritative work order for plans 09-05 / 09-06 / 09-07
  - The five ambiguous-cell decisions (S-06, S-07, S-16, S-22, D-11 fault-injection path)
  - Residual finding for VER-05 report item 14 (no upload byte-size guard)
  - Deferred item D9-01 (type-check already RED on chart.tsx) — blocks plan 09-04
affects:
  - 09-05 (7 gap cells), 09-06 (31 gap cells), 09-07 (5 gap cells), 09-08 (must turn assertion 4 GREEN)
  - 09-04 (D9-01 type-check blocker), 09-12 (report item 14 residual)
tech-stack:
  added: []
  patterns:
    - "Static-source guard: node:fs readFileSync from process.cwd(), auto-discovered by vitest
       (src/**/*.test.ts) — no allowlist, cannot be dropped from the gate. Modeled on
       src/test/security/security-audit-docs.test.ts"
    - "Explicit literal registry table, NOT a directory walk — an auto-discovered registry cannot
       tell you what is MISSING (the no-paddle-live-surface.test.ts idiom)"
    - "Verbatim test-NAME substring match as the anti-drift primitive (works uniformly across
       Deno / vitest / Playwright because it asserts against source text, not runner introspection)"
key-files:
  created:
    - src/test/coverage/ver02-matrix.test.ts
    - .planning/phases/09-final-verification-milestone-report/09-COVERAGE-AUDIT.md
    - .planning/phases/09-final-verification-milestone-report/deferred-items.md
  modified: []
decisions:
  - "S-06 corrupted PDF: map the shared _shared/document-quality + document-extraction rejection
     tests rather than author per-feature corrupted-PDF fixtures (D-09: do not rebuild coverage)"
  - "S-07 large PDF: WAIVER on all five cells — no upload byte-size guard exists in the PRODUCT
     (grep-verified). A verification phase must not paper over a product gap by re-labelling the
     per-tier CHARACTER cap as the answer. Carried to VER-05 report item 14"
  - "S-16 x recruiting_lens: satisfied by the 403 elite_required tier gate + the withMerits wiring
     assertion + the shared gateway's own 402; no Elite-with-zero-merits test"
  - "S-22: the __tests__/ history-persistence copies are LIVE, the bare {feature}/ copies are DEAD.
     Plan 09-07 executes the deletion; 09-01 only records the disposition"
  - "D-11: Path A (deterministic). NO source change to supabase/functions/_shared/anthropic.ts — a
     verification phase must not add a branch to a production code path"
  - "S-02/03/04/21 registry rule: a cell is covered iff (shared-substrate test) AND (per-feature
     wiring assertion). Only Career Compass passes today"
metrics:
  duration: ~35min
  tasks: 2
  files: 3
  completed: 2026-07-11
---

# Phase 9 Plan 01: VER-02 Coverage Registry Summary

**The 23-scenario x 5-feature VER-02 matrix now exists as an executable vitest guard whose first RED run is the authoritative, machine-generated gap list — 43 uncovered cells, 5 justified waivers, 77 mapped to live tests.**

## What Was Built

`src/test/coverage/ver02-matrix.test.ts` — the D-12 coverage registry. 25 scenario rows (ROADMAP's 23,
with its bundled "first / second / five-consecutive" split into S-01a/b/c so five-consecutive cannot
silently vanish) x the 5 migrated features (D-10) = **125 cells, every one enumerated**.

Each cell is `test` | `waiver` | `gap`:

- **`test`** — must map to a test file that exists AND whose **verbatim name** appears in that file's
  source right now. This is the load-bearing assertion (T-09-01-A). `existsSync(file)` alone would let a
  rename silently un-cover a cell and produce a milestone report claiming coverage it does not have.
- **`waiver`** — an explicit accept with a reason + approver (D-11: "there are no silent gaps").
- **`gap`** — **fails the suite by design.** It exists so the machine, not a human transcription,
  enumerates the remaining work.

Four assertions plus a scope guard. Assertions 1-3 and the scope guard are **GREEN**. Assertion 4
(`zero cells remain unclosed gaps`) is **RED** — intentionally, and it returns GREEN in plan 09-08.

`09-COVERAGE-AUDIT.md` records the five ambiguous-cell decisions and carries the verbatim RED output.

## Key Decisions

**D-11 → Path A (no `anthropic.ts` change).** RESEARCH proved the Anthropic seam can force a *status*
(`MERIT_TEST_FORCE_REFUNDABLE_ERROR=408|429`, staging-gated) but **cannot force a malformed SUCCESS
body** — so "invalid model JSON" and "truncated output" are not live-injectable. Path B (an
`AI_FORCE_BAD_BODY` selector) would add a new branch to a production code path that sits on *every* live
AI request, inside a phase whose whole purpose is to prove the milestone unchanged. Declined. The
behaviour under test is a property of `validateModelOutput`, and the deterministic
`runtime-validation-convergence.test.ts` tests call it at exactly that seam.

**S-07 → waiver, not a fudge.** There is no upload byte-size guard anywhere in the product. The tempting
move was to map the per-tier `getMaxInputChars` character cap and call the cell green — but a character
cap truncates *after* extraction and does not stop a 200 MB PDF being read, parsed and OCR'd. Waived with
an explicit reason, and the finding is handed to **VER-05 report item 14 (remaining risks)**. A test phase
that launders a product gap into a green cell is worse than no test phase.

**The ⚠️ rule.** RESEARCH flagged S-02/03/04/21 as covered only by feature-agnostic substrate tests
(`useAnalysisRun.test.ts`) — which prove the substrate, not that each *feature is wired to it*. Adopted:
covered iff (substrate test) AND (per-feature wiring assertion). Career Compass is the only feature that
passes, so 16 cells became gaps owned by 09-06 (four `*.recovery.test.tsx` files). This is the single
highest-value judgment call in the plan: it converts a comfortable ⚠️ into honest work.

## The RED Gap List (the deliverable)

| Owner | Cells | Work |
|---|---|---|
| **09-05** | 7 | Recruiting Lens column holes (S-01a/b, S-08, S-12, S-13, S-19) — RCL is the **thinnest column and the first flag flipped** (D-02). Plus `grade-linkedin/__tests__/cors-matrix.test.ts` (S-23). |
| **09-06** | 31 | S-01c five-consecutive (5), S-09 replacement upload (5), S-20 two-tab Playwright (5), the wiring quartet S-02/03/04/21 x 4 features (16). |
| **09-07** | 5 | S-22 History — the dead lane (five `__tests__/history-persistence.test.ts` files are remote-gated AND off the `test:ci` allowlist: they run in **no lane at all**). |
| **waived** | 5 | S-07 large PDF. |

77 of 125 cells map to live tests today.

## Deviations from Plan

### Auto-fixed / corrected during execution

**1. [Rule 1 - Bug] RESEARCH.md's grid misattributed two LinkedIn test names**
- **Found during:** Task 2 (seeding the registry from the real files rather than the transcription)
- **Issue:** RESEARCH.md mapped `FEAT-02: garbage (non-JSON) output → MODEL_INVALID_RESPONSE` and
  `... → MODEL_OUTPUT_TRUNCATED` to `grade-linkedin/__tests__/runtime-validation-convergence.test.ts`.
  **Those names do not exist in that file.** Had the registry been transcribed rather than verified, the
  first run would have gone RED on assertion 3 for the wrong reason.
- **Fix:** mapped LinkedIn's real coverage — `04-GAP-01: garbage model output → TYPED error through the
  runtime seam (no 200-with-body)` (same file) and `fixed-source: truncated/clipped model output → typed
  MODEL_OUTPUT_TRUNCATED (never repaired-and-accepted)` (`grade-linkedin/__tests__/fixed-source-guard.test.ts`).
  LinkedIn S-12/S-13 are **covered**, not gaps.
- **Commit:** `6a5f43d1`

**2. [Rule 1 - Bug] RESEARCH.md quoted the refund-boundary test names without their `refund-boundary: ` prefix**
- **Fix:** registry uses the on-disk names. This is precisely the drift class D-12 exists to kill, and the
  machine caught it on the first run — the mechanism validated itself before it was even asked to.
- **Commit:** `6a5f43d1`

**3. Gap count differs from the plan's seed estimate (43, not the ~34 implied)**
- The plan's seed clusters were all confirmed. The delta is the S-02/03/04/21 wiring quartet resolving to
  16 cells (4 scenarios x 4 features) rather than "four per-feature wiring cells." Not a scope change —
  the same four `*.recovery.test.tsx` files close all 16.

### Out of scope (logged, NOT fixed)

**D9-01 — `npm run type-check` is ALREADY RED.** Every error is in `src/components/ui/chart.tsx`
(shadcn wrapper vs. recharts v3 typings); **zero** in any Phase-9 file. This is pre-existing on
`staging` and unrelated to this plan (SCOPE BOUNDARY). **It will block plan 09-04**, which D-05 requires
to fold `type-check` into `verify:baseline`. Logged in
`.planning/phases/09-final-verification-milestone-report/deferred-items.md`.

## Verification

- `npx vitest run src/test/coverage/ver02-matrix.test.ts` → **1 failed | 4 passed (5)**. The single
  failure is assertion 4, enumerating all 43 gap cells with their owning plan. Assertions 1 (no silent
  omission), 2 (files exist), 3 (names verbatim) and the 25x5 scope guard PASS.
- **Anti-drift proven RED-before-GREEN** (Phase-2/4 precedent): appended `ZZZ` to one mapped test name →
  assertion 3 went RED naming the 5 affected cells and the file. Reverted; back to a single failure.
- `npx eslint src/test/coverage/ver02-matrix.test.ts` → clean.
- `git diff --stat package.json` → empty. **No new npm dependency.**

## Expected Gate State

**`npm run test` (and therefore `verify:baseline`) is now RED, intentionally.** This test is
auto-discovered by vitest, so the D-12 gap list is *in* the gate — which is the entire point: the gap
cannot be ignored, and it cannot be dropped from an allowlist. It returns GREEN in plan **09-08**.
**Do not weaken assertion 4 to green the gate.** No deploy should run until 09-08 closes it.

## Commits

| Commit | Task | What |
|---|---|---|
| `44bfaa5f` | 1 | `docs(09-01): record the five VER-02 ambiguous-cell decisions (D-09/D-11)` |
| `6a5f43d1` | 2 | `test(09-01): add the D-12 machine-enforced VER-02 coverage registry (RED on gaps)` |

## Self-Check: PASSED

All created files verified on disk; both task commits verified in `git log`.
