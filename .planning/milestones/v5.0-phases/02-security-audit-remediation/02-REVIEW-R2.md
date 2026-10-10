---
phase: 02-security-audit-remediation
reviewed: 2026-07-02T00:00:00Z
depth: standard
mode: re-review
files_reviewed: 9
files_reviewed_list:
  - supabase/functions/analyze-resume/index.ts
  - supabase/functions/analyze-career/index.ts
  - supabase/functions/_shared/merit-gateway.ts
  - supabase/functions/paddle-webhook/index.ts
  - supabase/functions/analyze-resume/refund-after-save.test.ts
  - supabase/functions/analyze-career/refund-after-save.test.ts
  - supabase/functions/_shared/merit-gateway.replay-refund.test.ts
  - supabase/functions/_shared/sanitizer-coverage.test.ts
  - supabase/functions/paddle-webhook/replay-window.test.ts
findings:
  critical: 0
  warning: 2
  info: 0
  total: 2
status: issues_found
---

# Phase 02: Code Review Report (R2 — Remediation Re-Review)

**Reviewed:** 2026-07-02T00:00:00Z
**Depth:** standard
**Mode:** re-review — confirm prior findings resolved + check for new regressions
**Files Reviewed:** 9
**Status:** issues\_found

## Summary

All eight prior findings from `02-REVIEW.md` are **RESOLVED** at current HEAD. The fixes applied across the remediation wave are correctly implemented, and no critical or blocking regressions were introduced. Two **Warning**-level issues are surfaced: one is an incomplete coverage gap left by the WR-02 fix (unsanitized `existingAnalysis` fields in the `handleMultiRoleComparison` prompt path), and one is a pre-existing PII-in-logs pattern in paddle-webhook happy-path `console.log` statements that the WR-04 fix did not address.

---

## Prior Findings Status

### CR-01 — RESOLVED

**analyze-resume `completeAndRecordSuccess` post-save MeritRefundable throw**

The post-save usage-write failure branch at `analyze-resume/index.ts:114-120` now logs-and-continues (`console.error('[completeAndRecordSuccess] usage write failed:', ...)`) and falls through to `return analysisId`. It does NOT throw `MeritRefundable` after the durable save.

Pre-save throws are byte-preserved:
- `resumes.update` failure → `throw new MeritRefundable(500, 'Could not save resume analysis.')` at line 98.
- `persistResumeAnalysis` insert failure → `throw new MeritRefundable(500, 'Could not save resume analysis history.')` at `persistResumeAnalysis` line 61.

The `analyze-resume/refund-after-save.test.ts` static-source guard confirms all four assertions (post-save message absent, log-line present, both pre-save throws present).

### CR-02 — RESOLVED

**analyze-career `persistCareerResultAndRecordUsage` post-save MeritRefundable throw**

The post-save usage-write failure branch at `analyze-career/index.ts:338-345` now logs-and-continues (`params.log.error('usage-tracking-insert-failed', ...)`) and falls through to `return data.id`. No `MeritRefundable` is thrown after the `analysis_results` row is durable and the fire-and-forget email has fired.

The pre-save insert-failure throw (`throw new MeritRefundable(500, 'Could not save career analysis history.')` at line 329) is byte-preserved.

Both `withMerits` call sites (free/short-circuit at line 1072, parallel fan-out at line 1283) route through `persistCareerResultAndRecordUsage` and are covered by the fix.

The `analyze-career/refund-after-save.test.ts` static-source guard confirms all three assertions.

### WR-01 — RESOLVED

**merit-gateway catch: refund suppressed on idempotency replay**

`merit-gateway.ts:279` guards the `refund_merits` RPC call with `if (refundable && !alreadyDeducted)`. An explicit `else if (refundable && alreadyDeducted)` branch at line 294 logs `merit-replay-callback-failed-no-refund` and does NOT call `refund_merits`, preserving the original deduction. `alreadyDeducted` is still derived from `(data as any).already_deducted === true` (line 259). The `merit-gateway.replay-refund.test.ts` static-source guard confirms all assertions.

### WR-02 — RESOLVED (with one residual gap — see WR-01 new finding below)

**analyze-career `compareRoles` sanitized before prompt interpolation**

`handleMultiRoleComparison` (line 695-698) now builds `sanitizedRoles` via `sanitizeUserContent(String(role), 'analyze-career-multi-role', log)` for each entry, and the user prompt at line 719 interpolates `sanitizedRoles.map(...)` instead of `roles.map(...)`. The raw `roles.map((r, i) => \`${i + 1}. ${r}\`)` anti-pattern is absent (confirmed by `sanitizer-coverage.test.ts` `mustNotInclude` assertion). The sanitizer-coverage test for `analyze-career` now asserts `minSanitizeCalls: 3` (5 found) and both per-path markers (`sanitizeUserContent(resumeTrimmed, 'analyze-career'` and `sanitizeUserContent(String(role), 'analyze-career-multi-role'`).

See **WR-01 (new)** below for the residual `existingAnalysis` coverage gap on this same path.

### WR-03 — RESOLVED

**merit-gateway `transaction_id` null-guard**

`merit-gateway.ts:244-251` guards `transactionId` after the RPC success shape: `if (!transactionId)` logs `check_and_deduct_merits returned no transaction_id` and returns `genericError(500, 'merit_system_error', ctx.corsType)`, preventing `undefined` from being passed to `fn()` or `refund_merits`. The `merit-gateway.replay-refund.test.ts` static-source guard confirms both assertions.

### WR-04 — RESOLVED (no-match branch scope; see WR-02 new finding for broader log hygiene)

**paddle-webhook no-match branch: updateError logged; presence flags only in response and no-match log**

`paddle-webhook/index.ts:333-351`: `updateError` is surfaced via `console.error('[paddle-webhook] profile update failed (DB error):', updateError.message)` before the no-match 200. The no-match log at line 340 uses `hasEmail=${!!customerEmail}, hasCustomerId=${!!customerId}, hasSubscriptionId=${!!subscriptionId}` (boolean flags). The response body's `searched` object at line 344 uses `{ email: !!customerEmail, customerId: !!customerId, subscriptionId: !!subscriptionId }` (boolean flags only — no raw PII values). The `paddle-webhook/replay-window.test.ts` WR-04 assertions confirm both.

### IN-01 — RESOLVED

**paddle-webhook missing-signature body does not name the header**

The missing-signature path at `paddle-webhook/index.ts:123-131` returns `{ error: "invalid_signature" }` (the same generic body as the bad-signature path). The `paddle-signature` header name does not appear in the response body. Log at line 127 uses the reason-code-only discipline. The `replay-window.test.ts` IN-01 assertion confirms.

### IN-02 — RESOLVED

**analyze-resume `resumes.update` scoped to authenticated owner (IDOR closed)**

`analyze-resume/index.ts:90-94` chains `.eq('id', params.resumeId).eq('user_id', params.userId)`. The service-role client path is now owner-scoped: a cross-user `resumeId` matches 0 rows; a legitimate own-resume analysis still matches because `resumeId` belongs to the authenticated user. The comment at lines 87-89 documents the reasoning. The `analyze-resume/refund-after-save.test.ts` IN-02 assertion confirms both filters are present.

---

## Warnings

### WR-01 (new): `existingAnalysis` fields in `handleMultiRoleComparison` interpolated without sanitization — residual WR-02 coverage gap

**File:** `supabase/functions/analyze-career/index.ts:713-716`

**Issue:** The WR-02 fix correctly sanitized the `compareRoles` array (now `sanitizedRoles`) before prompt interpolation. However, `handleMultiRoleComparison` also interpolates three fields from `existingAnalysis` — a separate request-body parameter (`requestBody.existingAnalysis`, destructured at line 803) — directly into the LLM user prompt without calling `sanitizeUserContent`:

```typescript
const userPrompt = `User Profile Summary:
- Career DNA: ${existingAnalysis?.careerDNA || 'Not available'}
- Detected Domain: ${existingAnalysis?.detectedDomain || 'General'}
- Current Strengths: ${(existingAnalysis?.whatYouHave || []).join(', ') || 'Not specified'}
```

`existingAnalysis` is caller-supplied at the HTTP boundary. A malicious authenticated caller can craft `careerDNA`, `detectedDomain`, or `whatYouHave` with high-confidence injection phrases (e.g., "Ignore all previous instructions...") and have them reach the Anthropic prompt unsanitized. The `sanitizer-coverage.test.ts` guard does not assert coverage for these three fields — its `mustInclude` markers only check `resumeTrimmed` and `String(role)`, and its `mustNotInclude` only blocks the pre-fix `roles.map(...)` pattern. Consequently the test gives a green result while this surface remains uncovered.

Both call sites of `handleMultiRoleComparison` pass `existingAnalysis` from the raw request body: merit path at line 994 and legacy path at line 1317.

**Fix:** Sanitize each interpolated field before it enters the prompt. For string fields use `sanitizeUserContent`; for the array field sanitize each element:

```typescript
const sanitizedCareerDNA = sanitizeUserContent(
  String(existingAnalysis?.careerDNA || ''), 'analyze-career-multi-role', log
);
const sanitizedDetectedDomain = sanitizeUserContent(
  String(existingAnalysis?.detectedDomain || ''), 'analyze-career-multi-role', log
);
const sanitizedStrengths = (existingAnalysis?.whatYouHave || [])
  .map((s: unknown) => sanitizeUserContent(String(s), 'analyze-career-multi-role', log));

const userPrompt = `User Profile Summary:
- Career DNA: ${sanitizedCareerDNA || 'Not available'}
- Detected Domain: ${sanitizedDetectedDomain || 'General'}
- Current Strengths: ${sanitizedStrengths.join(', ') || 'Not specified'}
```

Also extend `sanitizer-coverage.test.ts`'s `analyze-career` entry: add `"sanitizeUserContent(String(existingAnalysis"` (or a more specific marker) to `mustInclude` and update `minSanitizeCalls` to 6.

---

### WR-02 (new): Paddle-webhook logs raw email, customerId, and subscriptionId on the happy path

**File:** `supabase/functions/paddle-webhook/index.ts:256, 284, 292, 300, 317`

**Issue:** The WR-04 fix correctly converted the no-match branch log (line 340) to boolean-flag-only output. However, five `console.log` statements on the happy path (successful extraction and update branches) still emit raw PII and internal identifiers:

- Line 256: `` `Extracted: email=${customerEmail}, customerId=${customerId}, subscriptionId=${subscriptionId}` ``
- Line 284: `` `Updating user by email: ${customerEmail}, tier: ...` ``
- Line 292: `` `Successfully updated profile for ${customerEmail}` ``
- Line 300: `` `Updating user by paddle_customer_id: ${customerId}` ``
- Line 317: `` `Updating user by paddle_subscription_id: ${subscriptionId}` ``

Supabase function logs are retained and accessible to project members. Logging raw customer email addresses (PII under GDPR/CCPA) and Paddle-internal identifiers expands the attack surface for log-based data exfiltration and increases compliance scope unnecessarily. The `replay-window.test.ts` WR-04 guard only asserts the no-match response body and the `updateError` log line; it does not assert against raw-PII log statements on the success path.

This is a pre-existing defect not introduced by the current fixes, but it was not addressed by the WR-04 remediation despite the original WR-04 requirement stating "NO raw `customerEmail`/`customerId`/`subscriptionId` in the response body or logs."

**Fix:** Replace raw-value interpolation in the happy-path logs with presence flags or truncated identifiers. For PII (email) use a presence flag or a masked form; for internal IDs use a presence flag or the first/last 4 characters:

```typescript
// Line 256 — replace:
console.log(`Extracted: email=${customerEmail}, customerId=${customerId}, subscriptionId=${subscriptionId}`);
// With:
console.log(`Extracted: hasEmail=${!!customerEmail}, hasCustomerId=${!!customerId}, hasSubscriptionId=${!!subscriptionId}`);

// Line 284 — replace:
console.log(`Updating user by email: ${customerEmail}, tier: ...`);
// With:
console.log(`Updating user by email (present), tier: ${updateData.subscription_tier}, status: ${status}`);

// Lines 292, 300, 317 — similarly replace raw values with presence flags or masked IDs.
```

Extend `replay-window.test.ts` to assert that `console.log(\`Extracted: email=${customerEmail}` is absent from the source alongside the existing WR-04 assertions.

---

_Reviewed: 2026-07-02T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard / re-review_
