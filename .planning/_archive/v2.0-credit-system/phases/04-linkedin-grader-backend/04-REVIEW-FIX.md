---
phase: 04-linkedin-grader-backend
fixed_at: 2026-04-11T00:00:00Z
review_path: .planning/phases/04-linkedin-grader-backend/04-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 04: Code Review Fix Report

**Fixed at:** 2026-04-11T00:00:00Z
**Source review:** .planning/phases/04-linkedin-grader-backend/04-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6
- Fixed: 6
- Skipped: 0

## Fixed Issues

### CR-01: Usage check and record are not atomic — concurrent requests bypass credit limits

**Files modified:** `supabase/migrations/20260411000002_atomic_check_and_record_usage.sql`, `supabase/functions/_shared/usage-checker.ts`
**Commit:** df34c7a
**Applied fix:** Created a new SQL function `check_and_record_ai_usage` that wraps the existing `can_perform_ai_action` check and `record_ai_usage` insert inside a single transaction with `pg_advisory_xact_lock(hashtext(p_user_id::text))` to serialize concurrent requests per user. Updated `_shared/usage-checker.ts` to call this single atomic RPC instead of two separate calls, eliminating the TOCTOU race.

### CR-02: parseAiResponse can throw unhandled SyntaxError on retry path

**Files modified:** `supabase/functions/grade-linkedin/index.ts`
**Commit:** 57a5512
**Applied fix:** Wrapped both call sites of `parseAiResponse` (first attempt at line 182 and retry at line 224) in try-catch blocks. On first attempt, parse failure sets `parsed = null` which triggers the validation retry path. On retry attempt, parse failure returns the controlled 500 error message rather than leaking the raw SyntaxError.

### WR-01: Validation does not verify that each section name appears exactly once

**Files modified:** `supabase/functions/grade-linkedin/validation.ts`
**Commit:** 62c62ae
**Applied fix:** Added a uniqueness check after the existing name validity check. Collects section names into a Set and compares against the expected section names Set, returning a descriptive error if any expected section is missing or duplicated.

### WR-02: profileContent is not sanitized before prompt embedding

**Files modified:** `supabase/functions/grade-linkedin/index.ts`
**Commit:** 85de47f
**Applied fix:** Imported `sanitizeUserContent` from `_shared/prompt-sanitizer.ts` and applied it to `truncatedContent` after truncation but before building the user message. This is consistent with how other analysis functions handle user-supplied text.

### WR-03: followUpContext injects raw DB JSON with no size bounds

**Files modified:** `supabase/functions/grade-linkedin/index.ts`
**Commit:** 3f51562
**Applied fix:** Added a `MAX_FOLLOW_UP_CHARS = 2000` constant and applied `.slice(0, MAX_FOLLOW_UP_CHARS)` to the stringified previous grading data before it is passed to `buildUserMessage`. This prevents the follow-up context from consuming excessive tokens in the model context window.

### WR-04: Score values in sectionBreakdown not validated as numbers within [0, maxScore]

**Files modified:** `supabase/functions/grade-linkedin/validation.ts`
**Commit:** 98f55f0
**Applied fix:** Added a per-section score type and range check (step 5b) before the sum computation. Each section's score is verified to be a finite number between 0 and its `maxScore`. This catches string scores, null scores, negative values, and values exceeding the section maximum before they can corrupt the stored grade.

## Skipped Issues

None -- all findings were fixed.

---

_Fixed: 2026-04-11T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
