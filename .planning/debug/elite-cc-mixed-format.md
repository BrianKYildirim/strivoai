---
status: verifying
trigger: "Elite Career Compass still returns incomplete_output after the lossless JSON repair deployment; production shape probe shows mixed JSON plus Markdown output"
created: 2026-07-17
updated: 2026-07-17
---

# Elite Career Compass — mixed JSON/Markdown model output

## Prior Session

Continues `.planning/debug/resolved/elite-cc-output-incomplete.md`.
That session correctly fixed the shared lazy-fence truncation defect and added a
loss guard. New production evidence proves a second, downstream issue remains.

## Symptoms

**Expected:** The legacy Elite `analyze-career` call returns one complete JSON
object containing all paid Career Compass sections.

**Actual:** Claude returns a small fenced JSON object followed by about 20 KB of
Markdown. The loss guard correctly refuses to treat the first JSON block as the
whole report and returns terminal `422 incomplete_output`.

**Reproduction:** Elite Career Compass on the live legacy single-call path with
real AI. The observed run used Claude Haiku 4.5, 3,706 input tokens, 8,095 output
tokens, and a 10,000-token cap.

## Evidence

- timestamp: 2026-07-17T10:12:23Z
  - `responseLen=26639`; `stop_reason` was not `max_tokens` (8,095/10,000).
  - `fenceCount=14`; every fence is outside a JSON string.
  - First top-level JSON object starts at byte 8 and balances at byte 6,101.
  - `trailingAfterJson=20537`; the tail is Markdown career guidance.
  - Candidate lengths are `[26631,26568,26639,6094]`; only the short first
    fenced block repairs/parses, so the checked repair reports 77% loss.

## Current Focus

hypothesis: CONFIRMED — this is not structural truncation and not a parser-extraction fork. The model closes a partial JSON object and then emits the remaining report as Markdown despite the prompt's `Return ONLY valid JSON` instruction.
test: Implement Anthropic structured outputs on the live legacy Career Compass call, then prove the wire contract, tier schemas, parser defenses, and broader Career Compass behavior locally.
expecting: A constrained JSON output contract prevents Markdown/fences and requires the paid sections before the model may end the object; parser changes remain unnecessary.
next_action: Deploy the three-envelope build to preview, run repeated real-AI Elite analyses, and confirm core, growth, and extras all compile and the merged result contains every paid section. Production deployment remains an explicit operator decision.

## Local Fix

- Added opt-in `outputSchema` support to `_shared/anthropic.ts`; callers that omit
  it retain the exact existing request shape.
- Added a closed Free schema plus smaller closed Elite core/growth/extras schemas in
  `_shared/career-output-schema.ts`. Every declared object property is required
  and `additionalProperties` is false; neither Elite call can close before its
  assigned paid sections are present.
- Enabled the split tier schemas on both paid `analyze-career` execution paths.
- Kept the lossless repair, lossy-repair guard, and semantic/completeness gates
  unchanged as defense in depth.

## Local Verification

- Focused Anthropic/schema/repair tests: **47 passed, 0 failed**.
- Broader Career Compass validation and merger slice: **127 passed, 0 failed**.
- `deno check` passed for the new schema, shared Anthropic wrapper, and
  `analyze-career/index.ts`.
- Production frontend build passed (the first managed-sandbox attempt hit
  Windows `spawn EPERM`; the identical approved retry completed successfully).
- `git diff --check` passed.
- Full `npm run test:edge` currently stops during its pre-test `deno task check`
  on seven unrelated type errors in existing dirty work under
  `extract-analysis-structure/*` and `grade-linkedin/index.ts`. The targeted
  files above type-check cleanly; this debug does not alter those unrelated
  modules.

## Deployment Status

- No preview deployment, production deployment, or live AI call was performed.
- The bug is **fixed and verified locally**, but this debug remains open until a
  real deployed Elite response confirms the generation contract end to end.

## 2026-07-17 Provider Grammar Follow-up

- The first deployed all-in-one Elite schema was rejected before generation with
  Anthropic HTTP 400: `The compiled grammar is too large`.
- Root cause is confirmed as provider grammar complexity, not model support,
  request shape, parsing, truncation, or prompt-only noncompliance.
- Split Elite constrained generation into parallel `base` (8,000 tokens) and
  `elite-extras` (2,000 tokens) calls. The two smaller closed schemas are merged
  before tier shaping, semantic validation, completeness validation, and save.
- The base schema is 3,667 serialized bytes / 56 properties; the extras schema is
  1,535 bytes / 25 properties. The rejected all-in-one schema had 81 properties.
- Focused Career Compass/schema/repair verification: **88 passed, 0 failed**.
- Full Edge suite: **1,371 passed, 0 failed, 12 ignored**.
- Repository-wide `deno task check`: **passed**, including the seven prior type
  errors in `extract-analysis-structure` and `grade-linkedin`.
- No deployment or live Anthropic call was performed for this follow-up.

## 2026-07-17 Base-Grammar Follow-up

- New deployed evidence at 12:49 UTC isolates the remaining failure: the
  2,000-token extras call compiled and generated 874 tokens in 11.85s, while the
  larger base schema was rejected with the same HTTP 400 in 0.21s. This proves
  the failure is schema compilation, not generation length or the total token cap.
- Replaced the rejected 56-property base envelope with required parallel core,
  growth, and extras envelopes. Their measured sizes are:
  - core: 26 total properties / 1,725 serialized bytes / 4,500-token cap
  - growth: 28 total properties / 1,887 serialized bytes / 3,500-token cap
  - extras: 25 total properties / 1,535 serialized bytes / 2,000-token cap
- The total paid ceiling remains 10,000 tokens. Free remains a single 4,800-token
  call and does not invoke paid growth or extras.
- All three paid calls run in parallel under the existing request deadline. Every
  envelope is required, checked for truncation/lossy repair, parsed, and merged
  before tier shaping, semantic validation, completeness validation, or save.
- Focused schema/Career Compass suite: **58 passed, 0 failed**.
- Full Edge suite: **1,372 passed, 0 failed, 12 ignored**.
- Repository-wide `deno task check`: **passed**.
- No preview deployment, production deployment, or live Anthropic call was
  performed for this follow-up.

## Root-Cause Boundary

- The lossless fence repair remains correct and must stay.
- The loss guard remains correct and prevented a partial paid report from saving.
- The completeness gate remains correct and must not be loosened.
- Parsing trailing Markdown into product fields is out of scope: it would create a
  second, lossy interpretation contract and could fabricate or mis-map guidance.

## Candidate Fixes

1. **Anthropic structured outputs (recommended):** add an opt-in
   `output_config.format` JSON Schema to the shared Anthropic request and enable it
   for the legacy Career Compass call. Claude Haiku 4.5 supports constrained JSON
   output. Mark the paid core sections required; keep existing semantic and
   completeness validators after parsing.
2. **Assistant prefill (`{`):** supported by the current wrapper and model, but it
   only biases formatting. It does not guarantee the model cannot close the object
   early and append Markdown again.
3. **Route legacy generation through the existing parallel base/extras calls:**
   broader control-flow change; still prompt-only unless combined with structured
   outputs.

## Constraints

- Production remains read-only except for an explicitly approved deployment.
- Do not loosen `CAREER_REQUIRED_SECTIONS`.
- Do not parse or merge Markdown into the saved JSON result.
- Preserve unrelated uncommitted work in `analyze-career` and shared modules.
- Any implementation needs a regression for the request-level output constraint
  plus the existing 26K mixed/fenced loss fixtures.
