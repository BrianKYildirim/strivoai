# Phase 4: LinkedIn Grader — Backend - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-11
**Phase:** 04-linkedin-grader-backend
**Areas discussed:** Scoring architecture migration, Output schema & rewrites, Follow-up analysis behavior, Caching & DB storage strategy

---

## Scoring Architecture Migration

### Q1: How to restructure from 12-criteria to 4-section?

| Option | Description | Selected |
|--------|-------------|----------|
| Fold into section feedback | Sub-criteria become feedback points within parent section, one score per section | ✓ |
| Sub-scores visible but not in schema | Internal sub-criteria for calibration, only 4 scores in output | |
| You decide | Claude determines best prompt structure | |

**User's choice:** Fold into section feedback
**Notes:** Each section gets one score, sub-factors appear as specific feedback points

### Q2: Retry logic — spec says 3 attempts with exponential backoff

| Option | Description | Selected |
|--------|-------------|----------|
| Retry all failures | Any Anthropic API error triggers up to 3 retries with 1s/2s/3s backoff | ✓ |
| Retry only transient errors | Retry 529/500 only, not 400/401 | |
| Follow spec exactly | 3 attempts for any failure, no error type distinction | |

**User's choice:** Retry all failures
**Notes:** Differs from Phase 2 IPC approach (fail-fast) because the v3.0 spec explicitly requires retries

### Q3: Score calibration guardrails

| Option | Description | Selected |
|--------|-------------|----------|
| Adapt caps to 4-section model | Translate old caps (e.g., no About caps at 50) to new sections | |
| No caps, trust the rubric | 4-section architecture should naturally differentiate | |
| You decide | Claude determines if guardrails improve output | ✓ |

**User's choice:** You decide
**Notes:** Claude's discretion on calibration caps

---

## Output Schema & Rewrites

### Q4: Where should paste-ready rewrites live in schema?

| Option | Description | Selected |
|--------|-------------|----------|
| Top-level rewrites array | Separate from topFixes, clear separation of paste-ready vs advice | ✓ |
| Embedded in topFixes | Each fix includes optional rewrite field | |
| You decide | Claude determines cleanest structure | |

**User's choice:** Top-level rewrites array
**Notes:** First element always headline rewrite. Zero placeholders.

### Q5: How structured should feedback points be?

| Option | Description | Selected |
|--------|-------------|----------|
| String array | Each point is natural prose including quote, analysis, recruiter impact | ✓ |
| Structured objects | { quote, analysis, recruiterImpact } per point | |
| You decide | Claude picks best format for LLM output quality | |

**User's choice:** String array
**Notes:** Simpler prompt, more LLM flexibility

### Q6: Should profileInsights be required for weak profiles?

| Option | Description | Selected |
|--------|-------------|----------|
| Always required | Even weak profiles get 2-4 insights | ✓ |
| Conditional | Required only above a score threshold | |
| You decide | Claude determines | |

**User's choice:** Always required
**Notes:** Prevents purely negative responses

---

## Follow-up Analysis Behavior

### Q7: How much previous context to pass for follow-up analysis?

| Option | Description | Selected |
|--------|-------------|----------|
| Pass previous full response | Entire previous grading JSON for section-by-section comparison | ✓ |
| Pass summary only | Previous score + section scores + topFixes text | |
| You decide | Claude determines balance | |

**User's choice:** Pass previous full response
**Notes:** More tokens but much better diff detection

### Q8: Who fetches the previous grade?

| Option | Description | Selected |
|--------|-------------|----------|
| Backend fetches | Edge function queries linkedin_grades for most recent grade | ✓ |
| Frontend sends | Frontend passes previous result in request body | |
| You decide | Claude picks based on existing patterns | |

**User's choice:** Backend fetches
**Notes:** Single source of truth

### Q9: Should score reflect improvement delta or current state only?

| Option | Description | Selected |
|--------|-------------|----------|
| Score reflects current state only | Honest assessment, improvements acknowledged in feedback text | ✓ |
| Score includes encouragement bonus | Small bump for genuine improvements | |

**User's choice:** Score reflects current state only
**Notes:** Improvement acknowledgment in feedback/insights, never score inflation

---

## Caching & DB Storage Strategy

### Q10: Caching behavior for v3.0?

| Option | Description | Selected |
|--------|-------------|----------|
| Remove caching entirely | Every request runs fresh analysis | |
| Cache with version tag | Tag grades with schema version, only return same-version hits | |
| You decide | Claude determines best approach | ✓ |

**User's choice:** You decide
**Notes:** Claude's discretion on caching strategy

### Q11: DB storage schema changes?

| Option | Description | Selected |
|--------|-------------|----------|
| Keep current structure | Fix duplicate insert, store v3.0 JSON in grading_data | |
| Add queryable columns | Add schema_version and section_scores for indexed queries | |
| You decide | Claude determines if schema changes are warranted | ✓ |

**User's choice:** You decide
**Notes:** Claude's discretion on DB schema

### Q12: Auth — block all unauthenticated or allow read-only?

| Option | Description | Selected |
|--------|-------------|----------|
| Block all unauthenticated | Every call requires JWT via requireAuth | ✓ |
| Auth for grading, public for viewing | Optional ID param to fetch saved grade without auth | |
| You decide | Claude determines based on existing patterns | |

**User's choice:** Block all unauthenticated
**Notes:** Viewing saved results happens through Supabase client with RLS, not this edge function

---

## Claude's Discretion

- Calibration caps/guardrails in prompt (D-03)
- Caching strategy (D-10)
- DB schema changes (D-11)
- Prompt wording, temperature, token tuning
- JSON repair strategy
- Internal error message formatting

## Deferred Ideas

None — discussion stayed within phase scope
