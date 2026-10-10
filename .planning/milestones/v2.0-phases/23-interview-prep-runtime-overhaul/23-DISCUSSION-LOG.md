# Phase 23: interview-prep-runtime-overhaul - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 23-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-20
**Phase:** 23-interview-prep-runtime-overhaul
**Areas discussed:** Schema migration strategy, 9-section output generation, Intake form UX, Frontend rewrite treatment

---

## Schema migration strategy

| Option | Description | Selected |
|--------|-------------|----------|
| New additive migration | New timestamped migration (e.g., 20260420…) that ALTERs tables — Phase 19 file untouched, reversible, forward-only. | |
| Amend Phase 19 migration in place | Edit 20260418000000_interview_prep_tables.sql directly to include new columns & CHECK. Requires re-run against DB. | ✓ |
| New migration that DROPs + recreates | Fresh migration drops + recreates all three tables. Loses any existing rows. | |

**User's choice:** Amend Phase 19 migration in place
**Notes:** User confirmed no prod data would be lost; simplifies the migration story to a single canonical file per feature.

| Option | Description | Selected |
|--------|-------------|----------|
| Add 'elite_taste' as 3rd CHECK value | `tier IN ('pro','elite','elite_taste')`. Single source of truth for quiz type. | ✓ |
| Keep tier 2-value + add is_taste_quiz bool | Splits quiz-type signal across two columns. | |
| Rename tier → session_kind | Broader values, but breaks existing readers/writers. | |

**User's choice:** Add 'elite_taste' as 3rd value

| Option | Description | Selected |
|--------|-------------|----------|
| text[] array | Native Postgres array — simple, queryable, readable. | ✓ |
| jsonb | Flexible but overkill for a flat string list. | |
| Comma-separated text | Fragile; bad for SQL parsing. | |

**User's choice:** text[] array

| Option | Description | Selected |
|--------|-------------|----------|
| Required NOT NULL / optional NULLABLE | Honors Runtime §3 optionality; readiness_score NULLABLE until computed. | ✓ |
| All nullable with defaults | Weakens "no silent drops" enforcement. | |
| All NOT NULL with safe defaults | Defaults lie about what user entered. | |

**User's choice:** Required fields NOT NULL, optional fields NULLABLE

| Option | Description | Selected |
|--------|-------------|----------|
| smallint + CHECK (0..100), NULLABLE | Smallest type, bounded, nullable until evaluation writes. | ✓ |
| integer, no CHECK | Allows out-of-range values through. | |
| numeric(5,2) for decimals | Runtime §9 uses integer bands (55/70/85). | |

**User's choice:** smallint + CHECK (0..100), NULLABLE

---

## 9-section output generation

| Option | Description | Selected |
|--------|-------------|----------|
| Single call returns all 9 sections | One Anthropic call; simplest, cheapest, one refund path; json-repair mitigates truncation. | ✓ |
| Parallel 2-call merge | Coaching call + practice call, merged. Two refund paths. | |
| Chained: analyze → practice → synthesize | 3 calls; most grounded but likely blows 80s budget. | |

**User's choice:** Single call returns all 9 sections

| Option | Description | Selected |
|--------|-------------|----------|
| Generation returns questions only; evaluate scores them | Preserves Phase 19 D-03/D-05 batch model. | ✓ |
| Generation pre-fills ideal STAR answers (for Pro only) | Clarification: Pro already does this in flashcards; Elite is questions-only. | |
| Merge generation + evaluation | Breaks Phase 19 D-03 and doubles wait. | |

**User's choice:** Generation returns questions only; evaluate scores them

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse _shared/json-repair.ts + strict schema validation | Proven utility + Zod validator; 502 + refund on repair failure. | ✓ |
| Tight max_tokens + graceful partial render | Violates Runtime §14 quality bar. | |
| Retry once with temp 0 on parse failure | Adds worst-case latency. | |

**User's choice:** Reuse _shared/json-repair.ts + strict schema validation

| Option | Description | Selected |
|--------|-------------|----------|
| Shared base + tier branches via loadPromptVariant | One system prompt + 3 tier-specific user-prompt builders. | ✓ |
| Three fully separate prompts | Duplicates global-principles scaffold. | |
| Single prompt with tier tokens | Branching inside prompt text is hard to reason about. | |

**User's choice:** Shared base + tier branches

| Option | Description | Selected |
|--------|-------------|----------|
| Prompt-level instruction + post-generation validator | Explicit prompt + case-insensitive substring scan; retry on miss. | ✓ |
| Prompt instruction only | Fails SC-9 verifier if model drops field. | |
| Server composes references post-hoc | Violates honest-voice principle. | |

**User's choice:** Prompt-level instruction + post-generation validator

---

## Intake form UX

| Option | Description | Selected |
|--------|-------------|----------|
| Single page, grouped sections | Matches existing Resume Analysis / Career Compass patterns. | ✓ |
| Multi-step stepper (3 steps) | Friction for return users; complicates aggregation. | |
| Progressive disclosure | Buries required enum fields. | |

**User's choice:** Single page, grouped sections

| Option | Description | Selected |
|--------|-------------|----------|
| job_description required | >=40 chars. | ✓ |
| interview_type required | NOT NULL enum. | ✓ |
| difficulty / duration / format required | NOT NULL enums. | ✓ |
| question_categories required | >=1 selected. | ✓ |

**User's choice:** All four (multiSelect)

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — sensible defaults pre-selected | behavioral / mid / 30 / written. One-click path after paste-JD. | ✓ |
| No — all four empty, user must pick | More friction for repeat users. | |
| Defaults for difficulty/duration/format only | Middle ground. | |

**User's choice:** Yes — sensible defaults pre-selected

| Option | Description | Selected |
|--------|-------------|----------|
| Live counter + color shift + server reject | Matches Runtime §13.4 exactly. | ✓ |
| Hard input cap at 500 chars | Silent paste truncation. | |
| Server-only validation | Worst UX for batch quiz. | |

**User's choice:** Live counter + color shift + server reject

---

## Frontend rewrite treatment

| Option | Description | Selected |
|--------|-------------|----------|
| Full rewrite, preserve visual design system | Mock is too far from Runtime §10 shape; rebuild around real hooks + new types. | ✓ |
| Surgical wiring: keep renderers, replace data source | Adapter layer required; renderers don't match 9-section shape. | |
| Split into sub-pages then rewrite | More commits; doubles the work. | |

**User's choice:** Full rewrite, preserve visual design system

| Option | Description | Selected |
|--------|-------------|----------|
| Colocated in src/types/interviewPrep.ts, shared by frontend + edge functions | Single source of truth; Zod drives server validation + TS typing. | ✓ |
| Duplicate types in edge function + frontend | Drift guaranteed. | |
| Frontend-only type, trust server at runtime | Loses §10 as enforceable contract. | |

**User's choice:** Colocated in src/types/interviewPrep.ts, shared by frontend + edge functions

| Option | Description | Selected |
|--------|-------------|----------|
| useReducer with explicit status union | Matches Runtime §13 state diagram 1:1; eliminates impossible states. | ✓ |
| Multiple useState hooks | Prone to impossible combinations. | |
| TanStack Query state + view component switch | Awkward for quiz-active client-only state. | |

**User's choice:** useReducer with explicit status union

| Option | Description | Selected |
|--------|-------------|----------|
| Standalone component in components/interviewPrep/StreakDisplay.tsx | Dashboard can embed; matches Phase 20 D-08. | ✓ |
| Embedded inline in InterviewPrep page only | Dashboard would have to duplicate logic later. | |

**User's choice:** Standalone component

---

## Claude's Discretion

- Retry/refund policy when the "no silent drops" validator fails on the retry attempt (D-11) — planner refines.
- Zod schema field casing (snake_case vs camelCase) for the 9 sections.
- Exact Anthropic temperature setting.
- Partial indexes for daily-cap count and monthly-quota queries — planner decides based on expected query volume.
- RLS policy adjustments for the new columns (service-role-only-write / user-read-own pattern from Phase 19).

## Deferred Ideas

- Voice-audio capture, dedicated quiz history page, flashcard spaced repetition, resume-incomplete quiz UI, LinkedIn input — all Runtime §15 v1 out-of-scope.
- Auto-save draft of intake form — not required by Runtime.
- Word counter on JD textarea — not required by §13.4.
- "Clear form" affordance — not required by Runtime.
- Multi-step stepper / progressive-disclosure intake — rejected in favor of single-page grouped.
- Surgical wiring of existing InterviewPrep.tsx — rejected in favor of full rewrite.
