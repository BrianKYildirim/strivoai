---
slug: interview-prep-json-parse-failed
status: resolved
resolution: operator-confirmed completed & shipped; closed at v4.0 milestone close 2026-06-25
trigger: Phase 23 wave 3 testing — Interview Prep (analyze/evaluate variant) on preview returns 502 "JSON parse failed on first attempt" and triggers MeritRefundable
created: 2026-04-22
updated: 2026-06-25
---

# Debug Session: interview-prep-json-parse-failed

## Symptoms

- **Expected:** Interview Prep analyze/evaluate request succeeds, returns validated JSON payload, merits deducted.
- **Actual:** Request reaches AI call, but JSON parse of first AI response fails. `MeritRefundable(502, 'JSON parse failed on first attempt')` thrown at `supabase/functions/interview-prep-analyze/index.ts:310` (deployed line number; source currently 361).
- **Error:** `JSON parse failed on first attempt` — `MeritRefundable` propagating through `withMerits` → `Server.handler`.
- **Timeline:** Discovered during Phase 23 execution, wave 3 complete. First observation on preview environment.
- **Reproduction:** Run Interview Prep on preview, variant=elite, with resume PDF (OCR fallback path), job description present.

## Environment

- **Env:** preview
- **fn:** interview-prep-analyze
- **reqId:** 8b00ec53
- **userId:** f4677b0a-5929-4c39-b94a-6e35556bffec
- **tier/variant:** elite / elite
- **model:** claude-haiku-4-5-20251001
- **maxTokens (main call):** 10000
- **timeoutMs:** 80000
- **jdLen:** 3286
- **resumeLen:** 1829 (OCR fallback — text extraction failed first)
- **duration (field):** 15

## Relevant Log Slice

```
05:53:03.716  auth-success  userId=f4677b0a...
05:53:03.716  request-start jdLen=3286 hasRoleTitle=true hasCompany=true hasBackground=false duration=15
              Text extraction failed, attempting OCR with vision model...
              Sending PDF to Claude for OCR...
05:53:11.433  resume-extracted resumeLen=1829
              [PERF] anthropic claude-haiku-4-5-20251001 — OK in 6.86s | TTFB=6.86s | in=2109 out=404 | maxTokens=6000   <-- OCR call
              OCR extraction successful, length: 1829
05:53:11.620  merit-transaction deducted=5 remaining=125
05:53:11.620  ai-call-start model=haiku-4-5 variant=elite maxTokens=10000 timeoutMs=80000 attempt=1
05:53:49.425  unhandled-error "JSON parse failed on first attempt"  (~37.8s after ai-call-start)
```

## Observations (pre-investigation)

- Main AI call duration ~37.8s (05:53:11.620 → 05:53:49.425). No PERF log for main call printed before error — suggests either invoke returned ok=true then parseAiResponse threw, OR the `[PERF]` log line was not captured in the slice.
- Retry path (`temperature: 0.2`) not reached — error comes from the *first* attempt parse (line 361 in source).
- The `withMerits` gateway correctly caught the `MeritRefundable` — refund should have occurred. Need to verify merits were actually refunded.
- No raw AI response body logged on parse failure. This is the key visibility gap.

## Current Focus

```yaml
hypothesis: Diagnostic gap is the real blocker — the empty `catch {}` at source line 360 discards the underlying parse error, so we cannot see whether the failure is (a) preamble/markdown not stripped, (b) truncation at max_tokens=10000, or (c) structurally invalid output (e.g. mid-string control chars the repair helper cannot salvage). The observability fix must land first; only then can the next reproduction surface the true root cause.
test: Deploy a minimal, reversible diagnostic patch that logs `err.message`, `stop_reason`, `output_tokens`, `textLen`, and bounded head/tail snippets of `firstAi.text` BEFORE throwing `MeritRefundable`. Mirror on retry. Reproduce wave-3 flow; inspect new log.
expecting: One of: preamble string ("Here is your JSON:"), truncation marker (stop_reason=max_tokens + output_tokens≈10000), or clearly invalid structure in the snippet.
next_action: User to confirm applying the observability patch below (Proposed Fix section). Once deployed, re-run Phase 23 wave 3 to capture the diagnostic log and resume the debug session with `/gsd-debug continue interview-prep-json-parse-failed`.
reasoning_checkpoint: ""
tdd_checkpoint: ""
```

## Evidence

- timestamp: 2026-04-22T05:53:49.425Z | source: supabase logs | detail: unhandled-error from interview-prep-analyze; stack shows MeritRefundable thrown at index.ts:310 (deployed) / source line 361. Source snippet:
  ```ts
  let parsed: unknown;
  try {
    parsed = parseAiResponse(firstAi.text);
  } catch {
    throw new MeritRefundable(502, 'JSON parse failed on first attempt');
  }
  ```
  The `catch` swallows the underlying parse error — no diagnostic of *why* parse failed.

- timestamp: 2026-04-22 investigation | source: code read — `supabase/functions/interview-prep-analyze/index.ts:68-81` | detail: `parseAiResponse` already chains `repairTruncatedJSON` (strip markdown fences + preamble + unterminated strings + control-char escape + brace stack close). Fixture tests at `__tests__/analyze.truncated-json-repair.test.ts` prove the chain survives mid-value + mid-array truncation. So whatever failed here is NOT a shape the existing repair handles — which makes capturing the text essential.

- timestamp: 2026-04-22 investigation | source: code read — `supabase/functions/_shared/anthropic.ts:20-22,660-682` | detail: `AnthropicInvokeResult.raw` is the full Anthropic JSON. `raw.stop_reason` and `raw.usage.output_tokens` are available to the caller but currently unused by `interview-prep-analyze`. The `[PERF] ... OK` line is always printed on a successful HTTP response, before `return { ok: true, ... }`. Since no "no text content" branch fired (we'd see status=502 "returned no text content", not a parse failure), the PERF line *must* have been emitted — it was either truncated from the log slice or scrolled out.

- timestamp: 2026-04-22 investigation | source: code read — sibling functions | detail: `analyze-resume/index.ts:273,524,682` already include `(parseErr as Error).message` in their MeritRefundable messages; `_shared/result-merger.ts:264` goes further and includes a 200-char text snippet. `interview-prep-analyze` is the outlier — identical observability pattern not yet applied.

## Eliminated

- "OCR failure corrupted resumeText." — OCR call returned `out=404` tokens and logged `OCR extraction successful, length: 1829`. Resume text made it into the prompt intact.
- "Fetch failure / timeout / upstream 5xx." — If invokeAnthropicText had returned `ok: false`, the error thrown at line 353 (`new MeritRefundable(firstAi.status, firstAi.error)`) would surface the upstream status/text, not a JSON-parse message.
- "The retry path threw." — Retry is only entered when `needsRetry` is true after validation; line 361 throws before validation runs. Retry never executed.

## Proposed Fix (observability-first, reversible)

**File:** `supabase/functions/interview-prep-analyze/index.ts`

Replace the empty catch at source line 358-362 with:

```ts
let parsed: unknown;
try {
  parsed = parseAiResponse(firstAi.text);
} catch (parseErr) {
  const errMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
  const raw = (firstAi as { raw?: { stop_reason?: string; usage?: { output_tokens?: number } } }).raw;
  log.error('first-parse-failed', {
    err: errMsg,
    stopReason: raw?.stop_reason,
    outputTokens: raw?.usage?.output_tokens,
    maxTokens,
    textLen: firstAi.text.length,
    textHead: firstAi.text.slice(0, 800),
    textTail: firstAi.text.slice(-400),
  });
  throw new MeritRefundable(502, `JSON parse failed on first attempt: ${errMsg}`);
}
```

Mirror the same shape on the retry branch (source line 402-406), logging as `retry-parse-failed` with `retryAi` and including the error message in the MeritRefundable.

**Why this is the right first move**
- Zero behavioral change on the happy path.
- Preserves merit-refund semantics (still throws `MeritRefundable`).
- Matches the `analyze-resume` and `result-merger` pattern already in production — no new abstraction.
- Bounded output: ~1.2KB of AI text + structured fields; no user PII leakage beyond what the model itself chose to echo.
- Unlocks the next reproduction — the log will show whether we face preamble, truncation, or bad structure. That determines the real fix:
  - If `stop_reason === "max_tokens"` and `output_tokens ≈ 10000` → raise cap or shorten prompt/schema.
  - If `textHead` contains prose/markdown → strengthen preamble stripping or reinforce "return ONLY JSON" in the system prompt.
  - If `textHead` contains raw control chars / invalid escapes → extend `repairTruncatedJSON` or sanitize before parse.

## Resolution

- root_cause: **not yet determined** — blocked on observability. The swallowed parse error prevents discrimination between truncation, preamble, and structural invalidity. Proposed fix adds the missing diagnostic log.
- fix: **not yet applied.** Awaiting user confirmation to land the observability patch described above. After the patch deploys and reproduces, session will resume to identify and land the true root-cause fix.
- verification: After patch deploys, re-run Phase 23 wave-3 Interview Prep with the same inputs (elite tier, OCR-fallback resume, jdLen≈3286). New `first-parse-failed` log should appear in Supabase logs with `err`, `stopReason`, `outputTokens`, `textHead`, `textTail`. Continue debug session with `/gsd-debug continue interview-prep-json-parse-failed`.
- files_changed: (pending)
