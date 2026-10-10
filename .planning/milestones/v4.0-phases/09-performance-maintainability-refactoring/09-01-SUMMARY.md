---
phase: 09-performance-maintainability-refactoring
plan: 01
subsystem: api
tags: [deno, supabase-edge, analyze-resume, result-merger, refactor, perf]

# Dependency graph
requires:
  - phase: 03-cross-domain-inventory-audit
    provides: "PERF-HOTSPOTS.md H4 anchor — the analyze-resume cross-boundary double-parse, the only safe-candidate hotspot"
  - phase: 01-testing-strategy-regression-baseline
    provides: "verify:baseline (vitest + offline-deno + Playwright) — the zero-functional-change proof gate that replaces git-diff-empty"
provides:
  - "H4 double-parse eliminated in analyze-resume: each successful call's raw buffer is parsed exactly once on the merge path"
  - "mergeValidated(parsed, tier) merger entry — pre-parsed counterpart to mergeAndValidateResults, reusing the shared post-parse tail verbatim"
  - "mergeParsedTail() internal helper — the byte-identical concatenate/spread/fold/fillDefaults/applyTierShape tail shared by both merger entries"
  - "ParallelCallResult now carries the validated parsed data the retry loop already computed (instead of discarding it)"
affects: [09-04-PERF-04-measurement, analyze-resume, result-merger]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Carry-the-already-computed-parse: a retry/validation loop that parses-to-decide now forwards the parsed result instead of re-parsing downstream"
    - "Extract-shared-tail: two entry points (raw-text + pre-parsed) converge on one post-parse merge tail, keeping the merged-schema contract single-sourced"

key-files:
  created: []
  modified:
    - "supabase/functions/_shared/result-merger.ts (added mergeParsedTail + mergeValidated; mergeAndValidateResults refactored to delegate; parseAndValidateCall body untouched)"
    - "supabase/functions/analyze-resume/index.ts (ParallelCallResult.parsed plumbing; 2 merge consumers routed to mergeValidated; import swap)"

key-decisions:
  - "Plan re-anchor: the 'free-single path' is NOT a double-parse site — executeFreeAnalysis explicitly bypasses executeParallelCalls + mergeAndValidateResults and single-parses; only the 2 parallel merge consumers (stream-merit, queue/merit) were routed. Free-single left untouched (like recruiting-lens)."
  - "mergeAndValidateResults KEPT (not deleted) as the raw-text entry so its 40 deno units and any other caller stay valid; mergeValidated is purely additive."
  - "Salvage-tolerant optional folds preserved by carrying parsed:null for HTTP-ok-but-invalid calls; the merge consumer drops null-data optionals (rewrites/elite-extras) and surfaces a null-data mandatory call as a merge failure — identical outcome (MeritRefundable 500 + refund) to the prior raw-text re-parse."

patterns-established:
  - "Pattern 1: forward the parse, don't repeat it — ParallelCallResult.parsed carries the retry loop's parseAndValidateCall output to the merge boundary"
  - "Pattern 2: shared post-parse tail (mergeParsedTail) keeps the merged grading_data contract byte-identical across the raw-text and pre-parsed entry points"

requirements-completed: [PERF-02]

# Metrics
duration: 9min
completed: 2026-06-25
---

# Phase 9 Plan 01: H4 Double-Parse Dedup (analyze-resume) Summary

**Eliminated the analyze-resume cross-boundary double-parse — each parallel call's raw buffer now hits `parseAndValidateCall` once (in the retry loop) and the validated data is carried to a new `mergeValidated` entry instead of re-fed as raw text to the merger; the merged grading_data schema is byte-identical and proven by test:edge (704) + verify:baseline green.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-06-25T06:20:04Z
- **Completed:** 2026-06-25T06:29:05Z
- **Tasks:** 2 (Task 1 confirm/design — no edits; Task 2 apply + prove)
- **Files modified:** 2

## Task 1 Design Note (confirm the chain + the minimal Option-A dedup)

Confirmed the double-parse by reading the chain at current HEAD `28c30548` (re-anchored from research `be39c0e3`):

- **Discard site** — `analyze-resume/index.ts` `executeParallelCalls` retry loop (~:404-407): `parseAndValidateCall(result.callType, result.text, ...)` runs on every HTTP-successful call purely to decide retry, and **only `validation.ok` is kept — `validation.data` is discarded**. A SECOND `parseAndValidateCall` runs at the retry-keep decision (~:430). The function returns RAW `text`.
- **Re-parse consumers** — the merge consumers at `index.ts` ~:879-884 (stream-merit) and ~:1012-1017 (queue/merit) rebuild `rawResults` from `r.text` and call `mergeAndValidateResults`, which re-parses each of the 3 mandatory buffers (`result-merger.ts` :462-469) plus the optional `rewrites`/`elite-extras` (:487/:498) — a true cross-boundary second parse of the identical buffer.
- **Byte-identical boundary** — `parseAndValidateCall` (`result-merger.ts` :290-332): repair -> `JSON.parse` -> `normalizeAliases` -> `stripUnknownFields` -> call-type validation. **Identified as the contract boundary; scheduled for ZERO edits.** The only change is not calling it twice on the same buffer.

**Option-A dedup (the real win):**
- New `ParallelCallResult.parsed: Record<string,unknown> | null` carries the retry loop's validated data.
- New merger entry `mergeValidated(parsed, tier)` consumes the pre-parsed map and runs the existing post-parse tail.
- Consumers to route: the **2 parallel merge consumers** (stream-merit, queue/merit).

**Re-anchoring corrections vs the plan's Task 1 acceptance text:**
1. The plan named **3 consumers (merit, queue, free-single)**. The **free-single path is NOT a merge consumer** — `executeFreeAnalysis` (`index.ts` :525 + :592 comments) explicitly *"Bypasses executeParallelCalls and mergeAndValidateResults entirely"* and single-parses via direct `JSON.parse`. So there are **exactly 2** merge consumers; free-single is single-parse and out of scope (like recruiting-lens). Net consumers routed: 2.
2. `_mergeSource` is `'parallel-5'` at HEAD (set in `fillDefaults`), not `'parallel-3'` as the threat-model warning text said — no `parallel-3` regression to watch; the relevant invariant is "`_mergeSource` unchanged", which the deno unit `_mergeSource marker present` asserts (`'parallel-5'`).
3. `recruiting-lens-merger.ts` `parseCallResult` (:130-132): single-parse **confirmed** — NON-target, left byte-identical.

## Accomplishments
- Removed the redundant second parse of every successful parallel call on the resume merge path (the H4 hotspot), with the merged-schema output held byte-identical.
- Added `mergeValidated(parsed, tier)` and extracted the shared `mergeParsedTail` so the concatenate/spread/fold/fillDefaults/applyTierShape contract is single-sourced.
- Plumbed the already-computed validated `data` through `executeParallelCalls` (`ParallelCallResult.parsed`), preserving the retried-iff-invalid / kept-iff-revalidated retry semantics exactly.
- Proven zero functional change: `npm run test:edge` 704 passed / 0 failed / 11 ignored; `verify:baseline` vitest 457 passed + Playwright resume-analysis e2e green (the only red is the pre-existing env-deferred Stripe-reconcile :56, untouched by this change).

## Task Commits

1. **Task 1+2: H4 dedup (carry parsed data through + mergeValidated + route consumers)** - `274d1cfe` (refactor)

   _(Task 1 was read/design only — no file edits; its design note is captured above and the dedup edits land in the single Task-2 refactor commit.)_

**Plan metadata:** `__META_HASH__` (docs: complete plan)

## Files Created/Modified
- `supabase/functions/_shared/result-merger.ts` - Added `mergeParsedTail` (the relocated post-parse merge tail) + new `mergeValidated` pre-parsed entry; refactored `mergeAndValidateResults` to build the `parsed` map (incl. optional folds) and delegate to the tail. `parseAndValidateCall` body unchanged.
- `supabase/functions/analyze-resume/index.ts` - Extended `ParallelCallResult` with `parsed`; `makeCall` defaults it null; the retry loop attaches the validated `data` it already computed (non-retried + retry-keep paths); both parallel merge consumers build a `parsed` map (dropping null-data optionals) and call `mergeValidated`; import swapped `mergeAndValidateResults` -> `mergeValidated`.

## Decisions Made
- See `key-decisions` frontmatter. In short: free-single is single-parse (out of scope, plan re-anchor); `mergeAndValidateResults` retained as the additive raw-text entry; salvage semantics preserved via `parsed:null` carry-through.

## Deviations from Plan

The code change matched the plan's Option-A intent exactly. The only departures are **read-time re-anchoring corrections**, not auto-fixes:

- **[Plan re-anchor, not a code deviation] Consumer count 3 -> 2.** The plan's Task 1 acceptance listed a "free-single path" consumer; at HEAD that path provably bypasses both `executeParallelCalls` and the merger and single-parses. Routed only the 2 genuine parallel merge consumers; free-single left untouched. No code was changed that the plan didn't authorize — this narrows scope, it does not widen it.
- No Rule 1-4 auto-fixes were triggered. No architectural changes. `recruiting-lens-merger.ts` and the `parseAndValidateCall` pipeline are byte-identical per `git diff`.

---

**Total deviations:** 0 auto-fixed. 1 plan re-anchor (consumer count, scope-narrowing).
**Impact on plan:** None negative. The dedup is applied to every real double-parse site; the merged contract is byte-identical.

## Issues Encountered
- Standalone `deno test` on `result-merger.test.ts` (with type-checking on) surfaced 54 pre-existing discriminated-union TS narrowing complaints. This is an artifact of running outside the project's `deno task test:ci` config (which uses `--no-check`, the canonical path). Ran the merger test with `--no-check` (40 passed) for the quick baseline, then the full `npm run test:edge` (704 passed) as the authoritative proof. Not a regression — the same `--no-check` posture the repo's CI uses.
- Playwright `stripe-checkout.spec.ts:56` (post-checkout reconcile) is RED — this is the **documented pre-existing env-deferred Stripe red** (STATE.md, Phase 6 close-out: "only stripe :56 reconcile = documented env-red, NO new/3rd red"). It is a frontend Stripe flow against the TEST project's env config and is unrelated to this edge-only change (working tree touches only `analyze-resume` + `result-merger`). Out of scope per the scope boundary; not fixed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- H4 (PERF-02) done for the resume path. Plan 09-04 (PERF-04 measurement) can now measure the deterministic merge path before/after to confirm no regression / quantify any gain.
- `recruiting-lens-merger.ts` confirmed single-parse and intentionally untouched — no follow-up owed there.

## Self-Check: PASSED

- FOUND: `.planning/phases/09-performance-maintainability-refactoring/09-01-SUMMARY.md`
- FOUND commit: `274d1cfe`
- FOUND: `export function mergeValidated` in `result-merger.ts` @ 274d1cfe
- FOUND: `mergeValidated(parsedResults` call sites in `analyze-resume/index.ts` @ 274d1cfe
- FOUND: `recruiting-lens-merger.ts` byte-identical (diff empty 274d1cfe^..274d1cfe)
- FOUND: `parseAndValidateCall` body (`result-merger.ts` :290-332) unchanged (no removed lines in that range)
- VERIFIED: `npm run test:edge` 704 passed / 0 failed / 11 ignored; vitest 457 passed; Playwright 4 passed / 1 skipped / 1 pre-existing env-deferred Stripe red (:56, untouched)

---
*Phase: 09-performance-maintainability-refactoring*
*Completed: 2026-06-25*
