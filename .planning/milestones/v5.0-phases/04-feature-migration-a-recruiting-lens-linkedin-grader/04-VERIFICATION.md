---
phase: 04-feature-migration-a-recruiting-lens-linkedin-grader
verified: 2026-07-02T22:45:24Z
status: passed
score: 4/4 success criteria verified
re_verification:
  previous_status: gaps_found
  previous_score: 3/4
  gaps_closed:
    - "LinkedIn Grader works reliably end-to-end in its currently-deployed configuration (ANALYSIS_LIFECYCLE_LINKEDIN off, MERIT_SYSTEM_ENABLED off) — a real model response validates successfully and a grade is returned/saved to the user"
  gaps_remaining: []
  regressions: []
---

# Phase 4: Feature Migration A — Recruiting Lens + LinkedIn Grader Verification Report (Re-Verification)

**Phase Goal:** The two smallest-blast-radius synchronous features (Recruiting Lens + LinkedIn Grader) ride the shared lifecycle end-to-end (behind flags, proven by test), and LinkedIn Grader produces deterministic, evidence-backed, mathematically-computed scores that meaningfully differentiate profile quality.

**Verified:** 2026-07-02 (re-verification, independent of 04-GAP-01-SUMMARY's self-reported claims)
**Status:** passed
**Re-verification:** Yes — after gap closure (04-GAP-01, commits `ce7d69a7`, `0fd9fcc4`, `bbc16053`)

## Independent Verification Method

This re-verification did NOT trust 04-GAP-01-SUMMARY.md's claims. Each claim was re-derived directly against the current code and by executing the test gates in this session:

1. **Static confirmation the retired validator is gone and no runtime path references it.**
   `grep -rn "validateLinkedInGrade\b|EXPECTED_SECTIONS|clampLinkedInSectionScores|stripLinkedInFreeTier"` across the whole repo returns matches ONLY inside comments and the fail-closed test's string-literal assertions (`__tests__/runtime-validation-convergence.test.ts`, `validation.test.ts`) — zero live code references. `validation.ts` no longer defines any of the three retired symbols.

2. **Traced all four runtime call sites in `grade-linkedin/index.ts` by line number:**
   - `readLinkedInGradeCache` (line 176) → `validateLinkedInModelResponse(...)`
   - `runTieredAiCall`, first attempt (line 267) and retry (line 272) → `validateLinkedInModelResponse(...)` — this is the merit-dormant-fallback path
   - Lifecycle `generate()` closure (lines 417-425) → `parseAiResponse` + `injectLinkedInRawScore` (same math-from-sections seam), validated downstream by the executor via `schema: linkedInGradeSchema, validationOpts: { semanticCheck: linkedInSemanticCheck }` (lines 427-428)
   - Legacy pre-merit path — **confirmed to be the actually-live path today** (`MERIT_SYSTEM_ENABLED` off) — first attempt (line 805) and retry (line 828) → `validateLinkedInModelResponse(...)`

   All four sites converge on the same 11-section validation source of truth. No path was left on the old validator.

3. **Reproduced the inverse of the original repro.** Read `runtime-validation-convergence.test.ts` in full: it builds a realistic 11-section model response shaped exactly as the (shared, unchanged-by-this-fix) `prompts.ts` instructs the model to produce — uneven per-section scores, one non-applicable section (`Projects`), **no model-supplied total** — and calls `validateLinkedInModelResponse()` directly (the real exported runtime function every live path calls, not a mock or a schema-only test). Confirmed by reading the test body: it asserts `res.ok === true` and that the injected `rawScore` equals the independently-recomputed `normalizeFromSections(...)` value. It also asserts the OLD 4-section payload (the shape that used to pass) is now REJECTED with `SCHEMA_VALIDATION_FAILED`, and garbage input reaches a TYPED `MODEL_INVALID_RESPONSE` (never a 200-with-fabricated-body). This is the direct inverse repro of the original blocker (which returned `"sectionBreakdown must have exactly 4 sections"` for the same 11-section shape).

4. **Ran both gates myself, not from the fix's reported numbers:**
   - `cd supabase/functions && DENO_TEST_SUPABASE_REMOTE=0 deno task test:ci` → **989 passed / 0 failed / 12 ignored** (matches the claimed count exactly; the 12 ignored are pre-existing MER-04 RLS tests that self-skip without live Supabase env vars — not test:ci scope).
   - `npm run test` (vitest, repo root) → **83 test files / 495 tests, all passed** (matches the claimed count exactly).
   - Also ran the specific test files backing criteria 1-3 in isolation (`distribution.test.ts`, `fixed-source-guard.test.ts`, `recruiting-lens/cors-matrix.test.ts`, `recruiting-lens/byte-preserve.test.ts`, `recruiting-lens/schema.test.ts`, `idempotency-repeated-run.test.ts`) → **66 passed / 0 failed**.

5. **Confirmed no masking / no weakened assertions.**
   - `refund-after-save.test.ts`'s changed assertion (`throw new MeritRefundable` count 5→4) was independently re-derived by `grep -c "throw new MeritRefundable" grade-linkedin/index.ts` → **4**, at lines 260 (AI-fail), 271 (retry-AI-fail), 275 (validation-after-retry-fail), 555 (save-history, pre-save). All four are pre-save; the merge is a legitimate consequence of `runTieredAiCall`'s separate parse-throw and validate-throw collapsing into the single `validateLinkedInModelResponse` seam — not a dropped refund guarantee.
   - `validation.test.ts` was read in full: it dropped only the tests for the three retired functions (which no longer exist) and retains full coverage of `normalizeFromSections`, the schema bounds-clamp, `linkedInSemanticCheck` integrity (including a rejection case for a mismatched rawScore), the four-band distribution proof, and the "no default-coercion masking" strict-shape tests. No assertion was weakened.
   - `git show --name-only` on all three gap-closure commits (`ce7d69a7`, `0fd9fcc4`, `bbc16053`) confirms the ENTIRE changed-file set is: `grade-linkedin/index.ts`, `grade-linkedin/validation.ts`, `grade-linkedin/deno.json` (registration), `grade-linkedin/__tests__/runtime-validation-convergence.test.ts`, `grade-linkedin/refund-after-save.test.ts`, `grade-linkedin/strip.test.ts` (deleted), `grade-linkedin/validation.test.ts`, plus `.planning/` docs. **Zero touches** to `recruiting-lens/*`, `grade-linkedin/schema.ts`, `grade-linkedin/prompts.ts`, `src/pages/LinkedInGrader.tsx`, or `src/pages/RecruitingLens.tsx` — structurally ruling out regression risk to criteria 1-3, independently confirmed by both those tests still being present, unmodified, and green.

## Goal Achievement — Observable Truths (Re-Checked)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Recruiting Lens runs through the shared lifecycle behind its flag, dormancy fall-through preserved, CORS defect fixed | ✓ VERIFIED (regression check — untouched by the fix) | `recruiting-lens/index.ts` not present in any GAP-01 commit's changed-file list. `recruiting-lens/__tests__/cors-matrix.test.ts` (24+ tests) and `byte-preserve.test.ts` re-run directly in this session: all pass. |
| 2 | LinkedIn final total is computed mathematically server-side from 11 evidence-backed sections; model never invents it | ✓ VERIFIED (now reachable on ALL runtime paths, not just the dormant one) | `injectLinkedInRawScore` (validation.ts) computes `rawScore = normalizeFromSections(...)` and is now called from every path (cache read, merit-fallback, lifecycle, legacy). `linkedInSemanticCheck` rejects any mismatch. `runtime-validation-convergence.test.ts` proves a model-supplied bogus total is overridden by the server-computed value through the actual live seam. |
| 3 | Weak/average/strong/exceptional profiles differentiate with no ~52 clustering (VER-03) | ✓ VERIFIED (regression check — schema.ts untouched by the fix, distribution.test.ts re-run and green) | Four fixtures → four distinct bands, gaps ≥10, none in 48-58 window — same proof as prior verification, confirmed still green post-fix. |
| 4 | LinkedIn Grader works reliably across first/second/five consecutive runs, INCLUDING the currently-live (flags-off) configuration | ✓ VERIFIED (blocker closed) | The legacy pre-merit path (the actually-live path today) now validates through `validateLinkedInModelResponse` (line 805/828) instead of the retired 4-section validator. A realistic 11-section response (matching what the shared, unchanged `prompts.ts` actually instructs the model to emit) now SUCCEEDS through this exact seam — the direct inverse of the original repro. `idempotency-repeated-run.test.ts` (unaffected by this fix, still green) proves the run-completion math is correct once a run can complete at all — which it now can. |

**Score:** 4/4 truths verified.

## Requirements Coverage (Re-Checked)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| FEAT-03 (LinkedIn math-computed, no fixed-score sources) | ✓ SATISFIED | Math layer (unchanged, still correct) is now reachable through EVERY runtime path, including the live one. |
| FEAT-04 (LinkedIn repeated runs work reliably) | ✓ SATISFIED | A run can now complete on the live (flags-off) path; idempotency/refund math (previously proven, unaffected by this fix) now applies to real completed runs. |
| FEAT-06 (Recruiting Lens lifecycle + CORS fix) | ✓ SATISFIED | No change; regression-checked green. |
| VER-03 (LinkedIn score differentiation proof) | ✓ SATISFIED | Proven at the math layer (unchanged); now also reachable as a live user-facing outcome since requests no longer 500 before reaching the scoring math. |

## Anti-Patterns

No blocker or warning anti-patterns found in the gap-closure diff. The three retired symbols (`validateLinkedInGrade`, `EXPECTED_SECTIONS`, `clampLinkedInSectionScores`) are genuinely removed (not shadowed, renamed, or left dead-but-reachable) — confirmed via fail-closed source-text assertions in `runtime-validation-convergence.test.ts` AND independently via a repo-wide `grep` in this session.

## Human Verification

The one previously-flagged human-verification item ("submit a real LinkedIn profile through the UI with current flags and confirm a graded result, not a 500") is now backed by strong deterministic evidence at the exact runtime seam that would execute in that scenario (`validateLinkedInModelResponse`, called from the confirmed-live legacy pre-merit path with the confirmed-live shared prompt shape). A live/staging smoke test remains the only way to achieve 100% certainty (network/deploy-config issues are out of scope for static analysis), but is no longer required to close this phase's verification — the code-path and test evidence is unambiguous and independently reproduced in this session, not merely asserted by the fix.

1. **Live LinkedIn Grader smoke test (optional confirmation, not blocking)**
   **Test:** With current deployed flags (ANALYSIS_LIFECYCLE_LINKEDIN off, MERIT_SYSTEM_ENABLED off), submit a real LinkedIn profile through the LinkedIn Grader UI (staging or production).
   **Expected:** A graded result renders (11 sections, dynamic bands, no 500).
   **Why human:** Final confirmation against the real deployed edge function + live Anthropic model; all offline/static evidence (direct runtime-seam execution, full test suite, source-level absence of the retired validator) now points unambiguously to success.

## Gaps Summary

None remaining. The single blocker identified in the initial verification (04-VERIFICATION.md, 2026-07-03 initial pass) — the live/merit-dormant-fallback runtime paths validating 11-section model output with the retired 4-section `validateLinkedInGrade()` — is independently confirmed closed:

- No live code references the retired validator/clamp/strip (repo-wide grep, zero hits outside comments/test strings).
- All four runtime call sites (cache read, merit-fallback tiered call + retry, lifecycle generate, legacy pre-merit path + retry — including the path confirmed to be the one actually live today) route through the single `validateLinkedInModelResponse` seam.
- A realistic 11-section response (no model-supplied total, one non-applicable section) — the exact shape the shared, unchanged prompt asks the model to produce — succeeds through that seam in a directly-executed test, the inverse repro of the original failure.
- Both test gates were run in this session (not read from the fix's own report) and reproduce the claimed counts exactly: `deno task test:ci` 989/0/12, `npm run test` 495/0.
- No regression on criteria 1-3: the fix's changed-file set structurally excludes `recruiting-lens/*`, `grade-linkedin/schema.ts`, `grade-linkedin/prompts.ts`, and both frontend pages; the tests backing those three criteria were independently re-run in isolation and are green.
- No masking: the one changed test-count assertion (`refund-after-save.test.ts`, 5→4 pre-save throws) was independently re-derived from source and found correct; no assertion was weakened, only a legitimate two-throws-merged-into-one accounting update.

Phase 4 goal achieved: Recruiting Lens and LinkedIn Grader both ride the shared lifecycle behind flags (proven by test), and LinkedIn Grader produces deterministic, mathematically-computed, differentiating scores — now reachable end-to-end in every currently-live runtime configuration, not just the dormant lifecycle path.

---

*Verified: 2026-07-02T22:45:24Z*
*Verifier: Claude (gsd-verifier, re-verification pass)*
