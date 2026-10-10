---
status: resolved
trigger: "Elite Career Compass returns incomplete output on ~2 of 3 production runs (D9-16 / D9-17 / D9-18 are ONE investigation)"
created: 2026-07-17
updated: 2026-07-17
---

# Elite Career Compass — output-incomplete on ~2 of 3 prod runs

## Symptoms

**Expected:** Elite Career Compass returns a complete report containing all of
CAREER_REQUIRED_SECTIONS.

**Actual:** `analyze-career` rejects its own model output for Elite with
`output-incomplete`, missing `["Surprise Fits","Fields","Roles","Roadmap"]`.
User sees "Analysis hit a server error". Free tier is UNAFFECTED.

**Errors:** `output-incomplete`; run row stamped
`failure_code='FILE_EXTRACTION_FAILED'` at `failure_stage='generating'` (D9-17)
even though extraction succeeded.

**Timeline:** PRE-EXISTING and flag-independent. Phase-9 lifecycle activation
did not cause it — it exposed it. Live on the LEGACY path serving 100% of users.

**Reproduction:** Elite/admin account, resume 3677 chars + LinkedIn PDF 1915
chars. INTERMITTENT — ~2 of 3 runs.

## Evidence

- timestamp: 2026-07-17 07:30 UTC — lifecycle ON — FAIL (run ed2c7975, refunded)
- timestamp: 2026-07-17 07:36 UTC — lifecycle OFF — PASS (full quality, 63.7s)
- timestamp: 2026-07-17 07:40 UTC — lifecycle OFF — FAIL (run ee3134ae, refunded)
  => 2 of 3 fail regardless of the flag. Failure is INTERMITTENT.
- timestamp: 2026-07-17 07:40 UTC — SMOKING GUN log:
  - `json-repair-applied originalLen=28905 repairedLen=6509` (77% discarded)
  - `[PERF] claude-haiku-4-5 OK in 70.10s in=4513 out=8124 maxTokens=10000`
  - tail200 ends `"...5-year earnings potential: $1.6M-$2.1M."` — no closing brace
- Money is NOT at risk: run charged then refunded correctly on both paths
  (verified on real prod failures 07:31:56 and 07:41:17 UTC).

## Lead Hypothesis (UNPROVEN — verify before acting)

1. Model was NOT token-capped (out=8124 < maxTokens=10000), so stop_reason is not
   'max_tokens', so `isTruncatedResponse` (analyze-career L277-278) returns false.
   A structurally-incomplete-but-UNCAPPED response is reachable and invisible to
   that detector.
2. Response still ends mid-structure => JSON.parse fails.
3. `repairTruncatedJSON` does what its own L271 comment predicts: closes braces
   and returns a parseable stub — 28905 -> 6509 chars — silently discarding 77%
   of the report including the four rejected sections.

## Questions to Answer, In Order

1. WHY does the model emit ~29k chars of structurally-incomplete JSON while under
   its token cap? What is stop_reason on a failing run? If it IS max_tokens, then
   maxTokens=10000 in the PERF line DISAGREES with CAREER_CALL_CONFIGS' Elite
   base=8000 / elite-extras=2000 — reconcile which cap actually applied and to
   which of Elite's TWO calls. Elite is the only tier making two calls; Free makes
   one and passes.
2. Should `isTruncatedResponse` judge STRUCTURAL completeness rather than
   stop_reason alone?
3. Should `repairTruncatedJSON` ever return a stub that silently drops 77% of a
   report rather than failing loudly? Its own comment says the stub behaviour is a
   known hazard.
4. D9-17: `incompleteOutputResponse` appears not to stamp a matching failure_code,
   so the row keeps an outer handler's `FILE_EXTRACTION_FAILED`. This misdirects
   the next responder to the PDF/OCR layer AND corrupts the D-04(c) error-class
   histogram the activation abort criteria read.

## Out of Scope / Do Not Do

- The completeness gate is NOT the bug. It is the only component working correctly
  — it refused to save a mutilated report and present it as real (D-17). Do NOT
  "fix" this by loosening CAREER_REQUIRED_SECTIONS.
- Do NOT re-flip ANALYSIS_LIFECYCLE_CAREER_COMPASS until Elite is healthy on
  LEGACY first.

## Methodology Warning

The failure is INTERMITTENT. Any A/B needs REPEATS IN BOTH ARMS. A single pass in
one arm proves nothing — that exact error produced the retracted D9-16 claim.

## Constraints

- READ-ONLY on production (zjpjapgraoxdukdvpjes).
- Reproduce on preview (cimjltzovkahkqecpwgi) with AI_TEST_MODE=false to get real
  model output — and RESTORE AI_TEST_MODE=true afterward. A prior session left it
  off and flaked the blocking gate (see deferred-items.md).

## Fix Requirements

- Any fix must land with a regression test exercising a real ~29k-char incomplete
  response. This bug survived a green verify:baseline precisely because fixtures
  never produce one.
- Reconcile the token-cap discrepancy early: maxTokens=10000 in the PERF line
  matches neither Elite call config, suggesting something upstream.

## Reference Trail

- `.planning/phases/09-final-verification-milestone-report/deferred-items.md`
- `.planning/phases/09-final-verification-milestone-report/09-PROD-ACTIVATION.md` §10-§11

## Current Focus

status: FIX LANDED + verify:baseline GREEN. Nothing in flight.
next_action: none — redeploy `analyze-career` + `_shared` to ship. Q4 DEFERRED
(see "Q4 — deferred, with corrected mechanism" below).

### Previous focus (fix cycle, now complete)

hypothesis: CONFIRMED (mechanism) — `repairTruncatedJSON`'s fence regex
(json-repair.ts L19) is unanchored + lazy, so any second ``` after the opening
fence silently truncates the document to a prefix, which is then brace-closed
into a PARSEABLE stub. 28905 -> 6509. The four rejected sections are exactly the
ones that live after the cut.
test: deterministic unit-level probe of repairTruncatedJSON against 4 shapes of
~26-29k Elite-shaped input (see Evidence 2026-07-17 probe).
expecting: only the inner-fence shape can produce a ~77% drop that still parses.
next_action: OPERATOR DECISION — the exact model text (which ``` placement)
determines the correct extraction strategy, and json-repair.ts is shared by
analyze-resume / grade-linkedin / interview-prep / recruiting-lens. See
"Fix Options" below.

## Evidence (appended 2026-07-17)

- checked: `maxTokens=10000` reconciliation (Q1 — the explicit priority).
  found: THERE ARE THREE CALL SITES, not two. The failing prod run is NOT on the
  `CAREER_CALL_CONFIGS` two-call path at all.
    - L1543 `executeCareerParallelCalls` -> base 8000 + elite-extras 2000 (the
      lifecycle/worker path).
    - L1322 pro/elite short-circuit -> `Math.min(getMaxOutput(...), 8000)` = 8000.
    - L1991 + L2112 LEGACY SINGLE CALL -> `getMaxOutput('careerCompass','elite')`
      = **10000**, asking Elite for the ENTIRE document in ONE call.
  implication: `maxTokens=10000` matches neither Elite call config because the
  failing path is the third one. The premise "Elite makes two calls" does NOT hold
  for the failing path. The Free-vs-Elite asymmetry is NOT 1-call-vs-2 — both Free
  and Elite run the same L2112 single call; they differ in SKELETON SIZE.

- checked: is `raw`/`stop_reason` plumbed through `invokeWithRetry`?
  found: YES. ai-retry.ts L138 returns `lastResult` unchanged; anthropic.ts L737
  returns `raw: data` (full response). No `stop_sequences` are ever sent.
  implication: `isTruncatedResponse` DOES see the real stop_reason. The
  "raw is dropped by the retry wrapper" hypothesis is ELIMINATED.

- checked: was the model token-capped? out=8124 vs clampedMaxTokens=10000.
  found: NOT capped (81% of budget). stop_reason is therefore not 'max_tokens',
  so `isTruncatedResponse` returning false is CORRECT, not a miss.
  implication: the model was never the thing that truncated the report. OUR CODE
  truncated it, AFTER the model returned.

- checked: deterministic probe of `repairTruncatedJSON` with ~26.5k Elite-shaped
  inputs (scratchpad/probe.mjs), 4 shapes:
  found:
    A. no fence, unterminated tail (pure structural truncation)
       -> 26488 -> 26491 chars, LOSSLESS, parses, all 11 keys, missing NONE.
    B. opening ```json fence, unterminated tail
       -> 26496 -> 26491, LOSSLESS, parses, all 11 keys, missing NONE.
    C. opening fence + a SECOND ``` mid-document
       -> 26501 -> 5106 (**80.7% dropped**), PARSES CLEANLY, 5 keys,
          missing exactly: careerFields, surpriseFits, roles, roadmap.
    D. no opening fence, inner ``` only -> 19.3% dropped, does NOT parse.
  implication: **A and B prove structural truncation alone CANNOT cause the
  reported drop — repair handles it losslessly.** Shape C is the ONLY shape that
  reproduces all three prod signatures at once (~77-80% loss, still parses, and
  the SAME four missing sections as prod). The fence regex is the only
  length-destroying operation in the function.

- checked: Q4 — does `incompleteOutputResponse` (L321-359) stamp a failure_code?
  found: NO. It logs `output-incomplete` and returns a 422 body with
  `error:'incomplete_output'`, but writes NOTHING to the run row's failure_code.
  implication: CONFIRMED — the row keeps the outer handler's
  `FILE_EXTRACTION_FAILED`, misdirecting the next responder to the PDF/OCR layer
  and corrupting the D-04(c) error-class histogram. Q4 is a REAL, separable defect.

## Answers to the Four Questions

1. The model did NOT emit structurally-incomplete JSON under its cap in the way
   assumed. It was uncapped (8124/10000) and stopped naturally. The ~29k buffer is
   not pure JSON — it is fenced JSON plus at least one further ``` (the tail200
   `"...5-year earnings potential: $1.6M-$2.1M."` with no closing brace reads as
   trailing PROSE, not a JSON value). maxTokens=10000 came from the LEGACY
   SINGLE-CALL site (L1991/L2112), not from CAREER_CALL_CONFIGS.
2. `isTruncatedResponse` is NOT the cause of THIS failure (the response genuinely
   was not max_tokens-truncated). It is still a latent gap: it cannot see
   structural incompleteness. But loosening it would NOT have caught this bug.
3. YES — and this is the ROOT CAUSE. Its own L271 comment predicted exactly this.
4. YES — confirmed defect, see Evidence above. Separable from the root cause.

## Eliminated

- hypothesis: `invokeWithRetry` strips `raw`, blinding `isTruncatedResponse`.
  evidence: ai-retry.ts L138 returns `lastResult` unchanged; anthropic.ts L737
  sets `raw: data`. Plumbing is intact.
  timestamp: 2026-07-17
- hypothesis: the model was token-capped and stop_reason was 'max_tokens'.
  evidence: out=8124 < clampedMaxTokens=10000; no stop_sequences are sent.
  timestamp: 2026-07-17
- hypothesis: plain structural truncation is enough to trigger the 77% drop.
  evidence: probe shapes A and B — repair is LOSSLESS on both (26488->26491,
  26496->26491), all sections retained.
  timestamp: 2026-07-17

## Fix Options (NOT YET APPLIED — operator decision)

The defect is real and code-level regardless of the exact model text. What is NOT
yet pinned is WHERE the second ``` sits (inside a string value vs. between
values), and that determines which extraction strategy is correct:
  - If inside a string -> a string-aware balanced-brace scan from the first `{`
    fixes it cleanly (fences inside strings become invisible).
  - If between values -> a balanced scan breaks too; the fix must instead pick the
    best PARSEABLE candidate among the fenced blocks / whole buffer.
A "never silently lose content" loss-guard (throw instead of returning a stub that
discards >N% of the buffer) is correct under BOTH, and directly answers Q3.

Blast radius note: `json-repair.ts` is shared by analyze-resume, grade-linkedin,
interview-prep-analyze/evaluate and recruiting-lens. A loss-guard that throws will
change behaviour for ALL of them, and on the legacy career tail a throw currently
degrades into a RETRYABLE 500 (L2195-2201) — which the L282-290 comment explicitly
warns against for a deterministic temperature-0 failure.

## Resolution

root_cause: `repairTruncatedJSON` (supabase/functions/_shared/json-repair.ts L19)
extracts fenced content with an UNANCHORED, LAZY regex:
  /```(?:json)?\s*([\s\S]*?)(?:```|$)/i
When the model wraps its JSON in a fence AND emits any further ``` later in the
buffer, the lazy capture stops at that second fence and SILENTLY DISCARDS the
entire remainder. The surviving prefix is then brace-closed into a stub that
PARSES (28905 -> 6509 chars, 77% lost), so no error is raised. The discarded
remainder is exactly Fields / Surprise Fits / Roles / Roadmap. The completeness
gate then correctly refuses the stub -> `output-incomplete`.
Elite-only because Free's smaller skeleton keeps its required sections inside the
surviving prefix; the sections Elite loses sit after the cut.
fix: TWO parts, both landed.

1. LOSSLESS EXTRACTION (`_shared/json-repair.ts`) — the lazy single-regex fence
   extraction is replaced by `fenceCandidates()`, which yields candidates in
   CONTENT-PRESERVING-FIRST order (inner fences intact -> fence markers stripped ->
   whole buffer -> old lazy block as LAST resort). `repairTruncatedJSON` returns the
   first candidate that parses after repair; if none parse it returns the LONGEST
   recovered form, never the shortest. This is correct under BOTH unresolved
   fence-placement forks, so placement never had to be pinned.

2. LOSS GUARD (`repairTruncatedJSONChecked`) — a NON-throwing, opt-in discriminated
   union `{ok:true;json} | {ok:false;error;originalLen;repairedLen}`, firing below
   MIN_RETENTION_RATIO 0.6. Non-throwing is deliberate: `llm-validation.ts` L75 and
   `analyze-resume/index.ts` L607/633/917/1485/1626 call `repairTruncatedJSON`
   OUTSIDE any try/catch, so a throw inside the shared fn would have broken
   `validateModelOutput`'s {ok:false} contract and produced bare 500s. Opting in
   keeps blast radius at exactly zero.

   `analyze-career` legacy tail consumes the checked variant and returns a TERMINAL,
   non-retryable 422 (`error:'incomplete_output'`, `retryable:false`) + a loud
   `log.error('json-repair-lossy', {...})`. This satisfies the 500-degradation
   requirement: it never reaches the L2195-2201 bare throw that degrades into a
   RETRYABLE 500, and 422 is outside the career worker's isRetryableHttpStatus set,
   matching the existing `truncatedOutputResponse` precedent directly above it.

verification:
- COUNTERFACTUAL (the point of the test): the new ~26.5k Elite-shaped inner-fence
  fixture run against `git show HEAD:...json-repair.ts` reproduces ALL THREE prod
  signatures at once — 26501 -> 5106 (**80.7% dropped**), STILL PARSES (5 keys), and
  loses EXACTLY careerFields/surpriseFits/roles/roadmap. The new assertion FAILS on
  old code and PASSES on new (26501 -> 26493, 11 keys, missing none).
- 4 new Deno regression tests in `_shared/json-repair.test.ts` (real ~26.5k corpus,
  inner-fence-inside-string fork, no-false-trip on lossless truncation, guard fires).
- Existing 20 json-repair tests unchanged and green.
- `npm run verify:baseline` GREEN end-to-end: vitest 98 files / 659 passed;
  deno test:edge 1360 passed / 0 failed / 12 ignored; test:edge:remote passed;
  Playwright 9 passed / 2 skipped (pre-existing quarantine); build OK.
- Blast radius VERIFIED not assumed: all four other consumers' suites pass, incl.
  llm-validation's MODEL_OUTPUT_TRUNCATED / MODEL_INVALID_RESPONSE cases.

files_changed:
- supabase/functions/_shared/json-repair.ts (lossless extraction + checked variant)
- supabase/functions/_shared/json-repair.test.ts (real ~26.5k regression corpus)
- supabase/functions/analyze-career/index.ts (loss guard -> terminal 422)

## Q4 — DEFERRED, with corrected mechanism

The premise in Q4 is WRONG in a way worth recording. `incompleteOutputResponse` is
not the mis-stamper; it never had access to the run row. The real source is
`_shared/analysis-lifecycle.ts` L86-91 `permanentStatusCode()`, which blanket-maps
EVERY 422 -> FILE_EXTRACTION_FAILED regardless of body.

Why that is NOT small/self-contained:
- There are exactly two 422 producers: `ocr-pdf` (where FILE_EXTRACTION_FAILED is
  CORRECT — this is why the map exists) and `analyze-career` (2 sites, both
  model-output failures, both mis-stamped). The map is right for one and wrong for
  the other, so it cannot simply be re-pointed.
- `classifyFailure` sees only `err.status`/`err.message`, never the response body's
  `error` discriminator. Fixing this properly means plumbing the body (or a typed
  `code`) into the classifier — shared code on the extract AND generate stages of
  FOUR features (analyze-resume, analyze-career, grade-linkedin, recruiting-lens)
  plus its dedicated classifier test file.
- Cheap-looking shortcuts are traps: `classifyFailure` precedence rule 1 honours a
  typed `code`, but the career failures RETURN a Response rather than throw, so
  there is no error object to type at the 422 site.

Impact is unchanged and still real (misdirects responders to the PDF/OCR layer,
corrupts the D-04(c) histogram) — it just needs its own cycle, sized against the
classifier contract rather than against `incompleteOutputResponse`.
