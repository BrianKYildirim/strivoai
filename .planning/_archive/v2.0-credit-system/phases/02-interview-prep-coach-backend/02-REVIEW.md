---
phase: 02-interview-prep-coach-backend
reviewed: 2026-04-11T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - supabase/functions/_shared/usage-checker.ts
  - supabase/functions/interview-prep-coach/index.ts
  - supabase/functions/interview-prep-coach/validation.ts
  - supabase/functions/interview-prep-coach/validation.test.ts
  - supabase/migrations/20260411000000_add_interview_prep_analysis_type.sql
  - supabase/migrations/20260411000001_add_interview_prep_ai_action_type.sql
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-04-11T00:00:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

The interview-prep-coach edge function, its validation module, supporting tests, and database migrations are generally well-structured and follow existing project patterns. The shared `usage-checker.ts` is clean and consistent with the rest of the codebase. The migrations correctly extend both the `analysis_results` check constraint and the `ai_action_type` ENUM. No security vulnerabilities or data-loss risks were found.

Four warnings require attention before shipping:

1. The rate-limit config sets `free: 0`, which silently blocks every free-tier user before usage is checked — this is likely an intent issue rather than a policy decision, and conflicts with the credit system that governs free access.
2. `checkAndRecordUsage` is called **after** `checkRateLimit`, meaning a successfully rate-limited request still debits a credit on retry. The debit should only happen once the request is fully allowed.
3. `parseAiResponse` propagates uncaught `JSON.parse` exceptions on the retry path when `repairTruncatedJSON` produces output that is still invalid — the error will bubble to the outer catch and emit a generic 500 with the raw parse error message leaked to the client.
4. The validation logic does not verify that each question's `difficulty` field is one of the three allowed enum values (`entry`, `mid`, `senior`), so an AI hallucination of an invalid value passes through to the client.

---

## Warnings

### WR-01: `free: 0` rate limit silently blocks all free-tier users permanently

**File:** `supabase/functions/interview-prep-coach/index.ts:38`
**Issue:** The rate-limit config uses `{ free: 0, pro: 15, elite: 30 }`. The `getTierLimit` helper in `rate-limiter.ts` returns `0` for free users, meaning `checkRateLimit` will always return `allowed: false` for the free tier before `checkAndRecordUsage` is even reached. This differs from every other function in the codebase (all use `free: 5`) and from project tier limits (Free tier has a credit allowance for all actions). If this is intentional gating, it should be enforced via a tier-access guard, not a rate limit of zero — because rate-limit rejections produce a "try again in N seconds" message, confusing users who simply aren't entitled to the feature.
**Fix:** If the feature is Pro/Elite-only, use a tier-access guard before the rate-limit check:
```typescript
if (userContext.tier === 'free') {
  return new Response(
    JSON.stringify({ error: 'Interview Prep Coach requires a Pro or Elite subscription.' }),
    { status: 403, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
  );
}
// Then apply rate limits only for paying tiers:
const rl = await checkRateLimit(userContext.userId, userContext.tier, {
  key: 'interview-prep-coach',
  limits: { free: 0, pro: 15, elite: 30 },
});
```
If the feature should be available to free users with credit limits, set `free: 5` (or another positive number) to match the pattern used by all other functions.

---

### WR-02: `checkAndRecordUsage` debits a credit before the rate-limit check can block the request on retry

**File:** `supabase/functions/interview-prep-coach/index.ts:67`
**Issue:** The ordering is: (1) rate-limit check → allowed, (2) parse body, (3) `checkAndRecordUsage` (debit credit), (4) call AI. This ordering is correct for the happy path. However, when AI validation fails and the **retry path** is taken (lines 179-205), `invokeAnthropicText` is called a second time without re-checking the rate limit or usage credits. A user who exhausts credits mid-session could get a second AI call billed against an already-depleted account.

More concretely: the credit debit at line 67 happens before the first AI call succeeds or fails. If the AI call itself hits an unretriable error (lines 136-154) and a `Response` is returned, the credit has already been consumed with no useful output delivered.
**Fix:** Restructure so the credit debit only occurs after the first AI call returns a non-error response, or accept the current behavior as "attempt costs a credit" (which is the pattern used by other functions) and document it explicitly. For the retry, no additional credit should be consumed — the current code is already correct in that respect (it only calls `checkAndRecordUsage` once).

The real issue is the AI error → credit-already-consumed case. If that is acceptable, add a comment explaining the intent. If not, move `checkAndRecordUsage` to after the AI response is confirmed to be parseable.

---

### WR-03: Uncaught `JSON.parse` exception leaks internal error text to the client

**File:** `supabase/functions/interview-prep-coach/index.ts:158-170`
**Issue:** `parseAiResponse` calls `repairTruncatedJSON` and then immediately calls `JSON.parse` without a try-catch. If `repairTruncatedJSON` returns text that is still not valid JSON (which is explicitly possible — the utility makes best-effort repairs), `JSON.parse` will throw a `SyntaxError`. This bubbles through `parseAiResponse`, through the call at line 173 or 196, and is caught by the outer catch at line 214. The catch block returns the raw `error.message` as the response body, which may expose the partial AI-generated content in the error text:
```typescript
const errorMessage = error instanceof Error ? error.message : 'Internal server error';
// errorMessage could be: "Unexpected token 'k' at position 1234" — benign
// but error.message from Deno/V8 may include the token context from the JSON string
```
**Fix:** Wrap the fallback `JSON.parse` in its own try-catch inside `parseAiResponse` and return a sentinel or throw a typed error:
```typescript
function parseAiResponse(rawText: string): { questions: unknown[] } | null {
  let text = rawText.trim();
  if (text.startsWith('```json')) {
    text = text.replace(/^```json\s*/, '').replace(/```\s*$/, '');
  } else if (text.startsWith('```')) {
    text = text.replace(/^```\s*/, '').replace(/```\s*$/, '');
  }
  try {
    return JSON.parse(text);
  } catch {
    try {
      const repaired = repairTruncatedJSON(text);
      return JSON.parse(repaired);
    } catch {
      return null; // caller handles null as a parse failure
    }
  }
}
```
Then check for `null` at the call sites and return a safe 500.

---

### WR-04: Validation does not check `difficulty` field values

**File:** `supabase/functions/interview-prep-coach/validation.ts:43-65`
**Issue:** `validateInterviewQuestions` checks that `difficulty` is present (line 44-46, via `REQUIRED_FIELDS`) but does not validate that its value is one of `'entry' | 'mid' | 'senior'`. An AI model returning `"difficulty": "junior"` or `"difficulty": ""` would pass validation and be served to the client, where the frontend may display garbage or break rendering logic that branch-conditions on these values.
**Fix:** Add a value check in the per-question loop:
```typescript
const VALID_DIFFICULTIES = ['entry', 'mid', 'senior'];
const VALID_CATEGORIES = ['behavioral', 'technical', 'situational', 'culture_fit', 'leadership'];

// Inside the per-question loop:
if (!VALID_DIFFICULTIES.includes(q.difficulty as string)) {
  return { valid: false, error: `Question ${q.id ?? '?'}: invalid difficulty "${q.difficulty}"` };
}
if (!VALID_CATEGORIES.includes(q.category as string)) {
  return { valid: false, error: `Question ${q.id ?? '?'}: invalid category "${q.category}"` };
}
```
Note: `category` values are implicitly validated by the distribution check (an unrecognized category will fail `EXPECTED_DISTRIBUTION`), but explicit validation here provides clearer error messages.

---

## Info

### IN-01: `usage-checker.ts` uses status 429 for usage-limit responses, inconsistent with project error-handling docs

**File:** `supabase/functions/_shared/usage-checker.ts:86`
**Issue:** `createUsageLimitResponse` returns HTTP 429, but the project's CLAUDE.md error-handling notes state "usage limit errors trigger 402/429 responses" — and the frontend `AiCreditsContext.markCreditsDepletedFromError()` checks specifically for 402 to trigger the upgrade modal. Using 429 for usage exhaustion (as opposed to rate limiting) means the frontend's 402-detection branch may never fire for this function, leaving users without the upgrade prompt.

This is pre-existing behavior in `usage-checker.ts` and used consistently across all functions, so the fix belongs in `usage-checker.ts`, not the new function. It is flagged here because the new function inherits this behavior.
**Fix:** Confirm whether the frontend upgrade modal triggers on 429 as well as 402. If not, change `createUsageLimitResponse` to return status 402 to match the documented behavior. This is a shared-file change affecting all functions.

---

### IN-02: Redundant condition for truncation logging

**File:** `supabase/functions/interview-prep-coach/index.ts:59-64`
**Issue:** The truncation condition is evaluated twice: once to set `truncatedJD` (line 59-61) and once to log (line 62-64). This is harmless but slightly inconsistent — if the condition ever changes, both branches need updating.
**Fix:** Use a single conditional:
```typescript
const truncatedJD = jobDescription.slice(0, 12000);
if (jobDescription.length > 12000) {
  log.info('input-truncated', { original: jobDescription.length, truncated: 12000 });
}
```

---

### IN-03: Test suite missing coverage for empty `tips`/`redFlags` arrays and invalid `difficulty`

**File:** `supabase/functions/interview-prep-coach/validation.test.ts`
**Issue:** The test file covers the main happy path and several failure modes, but does not test:
- Empty `tips: []` or `redFlags: []` arrays (currently pass validation; may or may not be acceptable)
- Invalid `difficulty` value (would pass current validation but should not once WR-04 is fixed)
- `starOutline` present but missing a sub-field (e.g., missing `result`)

These gaps mean the retry logic improvements and future validation hardening won't have regression coverage.
**Fix:** Add test cases:
```typescript
Deno.test('question with missing starOutline sub-field returns valid: false', () => {
  const response = makeValidResponse();
  const q = response.questions[0] as Record<string, unknown>;
  const star = { ...(q.starOutline as object) };
  delete (star as Record<string, unknown>).result;
  q.starOutline = star;
  const result = validateInterviewQuestions(response);
  assertEquals(result.valid, false);
  assertEquals(result.error!.includes('result'), true);
});
```

---

_Reviewed: 2026-04-11T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
