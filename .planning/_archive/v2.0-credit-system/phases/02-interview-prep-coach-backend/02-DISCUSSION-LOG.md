# Phase 2: Interview Prep Coach — Backend - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-11
**Phase:** 02-interview-prep-coach-backend
**Areas discussed:** AI Model & Prompt Strategy, Tier Gating & Usage Tracking, Error Handling & Edge Cases, Response Validation

***

## AI Model & Prompt Strategy

### Model Selection

| Option                    | Description                                                                                                      | Selected |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------- |
| Claude Haiku 4.5          | Fastest, cheapest. Already spec'd for LinkedIn Grader. Good enough for structured Q\&A generation. \~\$0.01/call | ✓        |
| Claude Sonnet 4 (current) | Mid-tier. Higher quality reasoning but 5-10x cost vs Haiku. Currently hardcoded as default                       |          |
| You decide                | Let Claude pick the best cost/quality tradeoff during planning                                                   |          |

**User's choice:** Claude Haiku 4.5
**Notes:** None

### Difficulty Calibration

| Option                   | Description                                                                     | Selected |
| ------------------------ | ------------------------------------------------------------------------------- | -------- |
| Auto-detect from JD      | Prompt infers seniority from JD signals. More tailored, adds prompt complexity  | ✓        |
| Independent per question | Keep current behavior — each question gets its own difficulty tag independently |          |
| You decide               | Let Claude pick during implementation                                           |          |

**User's choice:** Auto-detect from JD
**Notes:** None

### Resume Input

| Option                   | Description                                                 | Selected |
| ------------------------ | ----------------------------------------------------------- | -------- |
| JD only                  | Keeps function simple and fast. Matches IPC-01 spec         | ✓        |
| JD + resume if available | More personalized but adds complexity, increases token cost |          |
| You decide               | Let Claude pick during implementation                       |          |

**User's choice:** JD only
**Notes:** None

***

## Tier Gating & Usage Tracking

### DB Migration Strategy

| Option              | Description                                                                          | Selected |
| ------------------- | ------------------------------------------------------------------------------------ | -------- |
| Add enum value only | Simple ALTER to add 'interview\_prep' to CHECK constraint. No existing data affected | ✓        |
| Add enum + backfill | Add enum AND retroactively fix existing rows. No reliable way to distinguish         |          |
| You decide          | Let Claude pick the migration approach                                               |          |

**User's choice:** Add enum value only
**Notes:** None

### Gating Layers

| Option             | Description                                                                        | Selected |
| ------------------ | ---------------------------------------------------------------------------------- | -------- |
| Keep both          | Rate limiter for fast-reject + usage checker for credit tracking. Defense in depth | ✓        |
| Usage checker only | Remove rate limiter tier gating. Simpler but loses fast-reject path                |          |
| You decide         | Let Claude pick the gating approach                                                |          |

**User's choice:** Keep both
**Notes:** None

***

## Error Handling & Edge Cases

### Max Job Description Length

| Option       | Description                                                  | Selected |
| ------------ | ------------------------------------------------------------ | -------- |
| 12,000 chars | Matches LinkedIn Grader's limit. Prevents runaway token cost | ✓        |
| No max limit | Let user paste anything. Risk of hitting API token limits    |          |
| You decide   | Let Claude pick a reasonable cap                             |          |

**User's choice:** 12,000 chars
**Notes:** None

### Overload Handling (529)

| Option                  | Description                                                             | Selected |
| ----------------------- | ----------------------------------------------------------------------- | -------- |
| Fail with clear message | Return 503 with clear message. No queue fallback. Keeps function simple | ✓        |
| Retry once with backoff | Wait 2-3s and retry. Higher success rate but adds latency               |          |
| You decide              | Let Claude pick the overload strategy                                   |          |

**User's choice:** Fail with clear message
**Notes:** None

***

## Response Validation

### Validation Strictness

| Option                      | Description                                                                                  | Selected |
| --------------------------- | -------------------------------------------------------------------------------------------- | -------- |
| Validate structure + counts | Check 8 questions, correct category distribution, all required fields. Return 500 if invalid | ✓        |
| Validate structure only     | Check fields but don't enforce category counts. More lenient                                 |          |
| No validation (current)     | Just parse JSON and return whatever AI gives                                                 |          |
| You decide                  | Let Claude pick the validation strictness                                                    |          |

**User's choice:** Validate structure + counts
**Notes:** None

### Retry on Validation Failure

| Option           | Description                                                                   | Selected |
| ---------------- | ----------------------------------------------------------------------------- | -------- |
| Retry once       | One automatic retry if validation fails. Adds \~2-3s but doubles success rate | ✓        |
| Fail immediately | Return 500. Don't burn extra tokens on a retry                                |          |
| You decide       | Let Claude pick the retry behavior                                            |          |

**User's choice:** Retry once
**Notes:** None

***

## Claude's Discretion

* Exact prompt wording refinements
* Temperature and max token tuning
* JSON repair strategy
* Internal error message formatting
* Prompt sanitizer (Phase 9 scope)

## Deferred Ideas

None — discussion stayed within phase scope
