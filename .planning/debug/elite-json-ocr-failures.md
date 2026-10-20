---
status: resolved
resolution: operator-confirmed completed & shipped; closed at v4.0 milestone close 2026-06-25
trigger: "Elite resume analysis fails with JSON parsing after parallel calls; Free tier rejects the same PDF as unreadable OCR."
created: 2026-06-07T01:05:00.8061609-07:00
updated: 2026-06-25
---

# Debug Session: elite-json-ocr-failures

## Current Focus

- hypothesis: Elite summary JSON is being truncated at the output token ceiling, and the current repair/merge path cannot recover it.
- test: Reproduce with a fenced, nested summary JSON string truncated mid-value; inspect whether `repairTruncatedJSON` strips fences and closes strings/arrays/objects correctly.
- expecting: Existing test or ad hoc parse fails, matching production. A fix should make the parser salvage safely or trigger a smaller deterministic summary retry before merit refund.
- next_action: Inspect `supabase/functions/_shared/json-repair.ts`, `supabase/functions/_shared/result-merger.ts`, and `supabase/functions/_shared/resume-prompts.ts`; add a focused regression before editing production logic.
- reasoning_checkpoint: Do not treat Anthropic provider status OK as success here. The output reached `maxTokens`, so truncation is the root signal.
- tdd_checkpoint: Add Deno regression tests before or alongside fix.

## Symptoms

- Expected behavior: Elite resume analysis should complete and produce merged analysis when OCR produced 4784 characters of resume text.
- Actual behavior: Elite analysis refunds merits because merge fails parsing the `summary` JSON. Free tier rejects the PDF as unreadable.
- Error messages: `stream-error: Merge failed: summary: JSON parse failed`.
- Timeline: Observed in Supabase logs on 2026-06-07 around 07:55-07:56 UTC.
- Reproduction: Upload/analyze the affected one-page PDF resume as Elite and Free. Elite reaches analysis merge and fails; Free rejects after OCR/extraction.

## Evidence

- timestamp: 2026-06-07T07:55:11.675Z
  source: Supabase logs supplied by user
  observation: `request-start` for `analyze-resume`, `tier=elite`, `resumeTextLen=4784`, `resumeId=d6ce1fb6-3ad8-4fba-997c-3be3c7f437a0`, `userId=284e5e1d-bbfd-4193-9576-80a56cfda20b`.

- timestamp: 2026-06-07T07:55:11.923Z
  source: Supabase logs supplied by user
  observation: Merit transaction deducted 3 subscription merits for `resume_analysis`.

- timestamp: 2026-06-07T07:56:06.658Z
  source: Supabase logs supplied by user
  observation: Merit refund reason includes `stream-error: Merge failed: summary: JSON parse failed`.

- timestamp: 2026-06-07T07:56:06.658Z
  source: Supabase logs supplied by user
  observation: Raw failed JSON begins with a fenced JSON block and ends mid-string inside `executiveSummary.keyStrengths`.

- timestamp: 2026-06-07T07:56:06.658Z
  source: Supabase logs supplied by user
  observation: `summary` Anthropic call returned OK with `out=6000` and `maxTokens=6000`, which is a token-ceiling truncation signature.

- timestamp: 2026-06-07T07:56:06.658Z
  source: Supabase logs supplied by user
  observation: `criteria-1`, `criteria-2`, and `elite-extras` also hit configured max token ceilings exactly: 5000, 5000, and 4000.

- timestamp: 2026-06-07T07:54:57.544Z
  source: Supabase logs supplied by user
  observation: OCR path logs `Processing 1 page(s) for OCR`, `Page 1 extracted 4784 characters`, and `Total OCR extracted: 4784 characters`.

- timestamp: 2026-06-07T01:05:00.8061609-07:00
  source: targeted repo search
  observation: `CALL_CONFIGS` in `supabase/functions/analyze-resume/index.ts` sets Elite summary `maxTokensElite: 6000`, criteria calls `5000`, elite extras `4000`.

- timestamp: 2026-06-07T01:05:00.8061609-07:00
  source: targeted repo search
  observation: `parseAndValidateCall` in `supabase/functions/_shared/result-merger.ts` calls `repairTruncatedJSON(rawText.trim())` then `JSON.parse`.

- timestamp: 2026-06-07T01:05:00.8061609-07:00
  source: targeted repo search
  observation: Generic unreadable PDF message exists in `supabase/functions/ocr-pdf/index.ts` and frontend OCR invoke error path in `src/lib/document-extraction.ts`.

## Eliminated

- hypothesis: Anthropic provider request failed outright.
  reason: Logs show all parallel calls returned `OK`; failure happened during merge parse.

- hypothesis: Elite failed because OCR returned no text.
  reason: Request-start shows `resumeTextLen=4784`; OCR logs show 4784 extracted characters.

## Suspected Root Causes

1. Elite summary prompt/schema is too verbose for `maxTokens=6000`, especially with personalization mandates and structured arrays. The model hits the ceiling and returns incomplete JSON.
2. Criteria prompts may be wasting output tokens because logs show unknown fields stripped from wrong calls:
   - `rewriteSuggestions` stripped from `criteria-1`.
   - `eliteInsights` stripped from `criteria-1` and `criteria-2`.
3. `repairTruncatedJSON` may not handle markdown-fenced JSON plus deep truncation robustly enough for this path.
4. Free PDF rejection likely comes from Phase 51 document quality or policy path after OCR, not from OCR extraction itself.

## Candidate Fix Directions

- Add a parser regression for the production-shaped failure:
  - input starts with ```json
  - contains nested `executiveSummary.keyStrengths`
  - truncates mid-string
  - expected behavior should be explicit: either repair to parseable JSON with defaults or trigger a smaller retry path.
- Prefer prompt/schema reduction over simply raising token limits if SC-12 token budget tests are locked.
- Ensure `summary` call only asks for fields accepted by the summary merger and avoids Elite extras if a separate `elite-extras` call exists.
- Add a summary retry path only when parse failure coincides with likely truncation (`out == maxTokens` is available in logs, but check whether `invokeAnthropicText` exposes enough metadata; if not, use heuristic on unterminated JSON/fence).
- For Free OCR rejection, inspect `assessDocumentQuality` thresholds and accepted metadata flow; a 4784-character one-page resume should not fail solely because it lacks resume-specific keywords after Phase 51's generic gate.

## Code Pointers

- `supabase/functions/analyze-resume/index.ts`
  - `CALL_CONFIGS` around line 281.
  - `FREE_SINGLE_CALL_MAX_TOKENS` around line 295.
  - Free single-call parse/retry path around lines 474-537.
  - Streaming parallel path around lines 750-828.
  - Non-streaming parallel path around lines 888-950.
- `supabase/functions/_shared/result-merger.ts`
  - `parseAndValidateCall` around line 252.
  - `mergeAndValidateResults` around line 402.
- `supabase/functions/_shared/json-repair.ts`
  - `repairTruncatedJSON` starts around line 14.
- `supabase/functions/_shared/resume-prompts.ts`
  - `buildCallSuffix` and summary/elite prompt construction.
- `supabase/functions/_shared/document-quality.ts`
  - OCR/document-likeness quality floor.
- `supabase/functions/ocr-pdf/index.ts`
  - Generic unreadable message around line 259.
- `src/lib/document-extraction.ts`
  - OCR frontend invoke/error handling around lines 145-169.

## Verification Plan

Run after implementing fixes:

```powershell
deno.cmd test --no-check --allow-env --allow-read --config supabase/functions/deno.json supabase/functions/_shared/json-repair.test.ts supabase/functions/_shared/result-merger.test.ts supabase/functions/_shared/document-quality.test.ts
```

```powershell
npm.cmd test -- src/pages/__tests__/document-extraction-primary.test.ts src/pages/__tests__/document-extraction-secondary.test.ts
```

```powershell
npm.cmd run build
```

Optional live QA after deploy:

- Elite affected PDF completes analysis or takes a deterministic retry/fallback, not a JSON parse refund.
- Free affected PDF either extracts and analyzes normally or rejects for a clear, accurate quality reason.
- Reupload of the same accepted document still reuses accepted extraction text from Phase 51.

## Constraints

- Do not modify `.gitignore`.
- Do not commit `.planning/` artifacts.
- Use GSD workflow before code edits.
- Prefer `apply_patch` for manual edits.
- If PowerShell sandbox exits with `-1073741502`, rerun important commands with escalation.
- Prefer `deno.cmd` and `npm.cmd`.
