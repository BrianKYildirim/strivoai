# Phase 18: recruiting-lens-gating - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 18-recruiting-lens-gating
**Areas discussed:** Pro output shaping, Auto-resume detection, Pro locked-field UI, Elite dashboard save

---

## Pro Output Shaping

| Option | Description | Selected |
|--------|-------------|----------|
| Prompt + shaper | Two-layer defense: Pro prompt variant instructs model to produce only Pro-allowed fields, plus server-side applyTierShape strips anything that leaks. Matches Phase 15 pattern. | x |
| Prompt-only | Pro prompt variant tells the model exactly what to produce. No server-side stripping. Simpler but a prompt regression could leak Elite fields. | |
| Shaper-only | Both Pro and Elite get the same full prompt. Server-side shaper strips Elite-only fields. Wastes tokens generating content Pro can't see. | |

**User's choice:** Prompt + shaper (Recommended)
**Notes:** Consistent with Phase 15's defense-in-depth pattern.

### Follow-up: Prompt variant structure

| Option | Description | Selected |
|--------|-------------|----------|
| Conditional sections | Keep existing 3 call suffixes but add tier-conditional blocks. Less code duplication. | x |
| Separate Pro suffixes | Write distinct Pro/Elite suffix functions. More explicit but doubles prompt code. | |

**User's choice:** Conditional sections (Recommended)
**Notes:** Extends the existing `buildCall3Suffix(isElite)` pattern.

---

## Auto-Resume Detection

| Option | Description | Selected |
|--------|-------------|----------|
| Most recent analysis_results | Query analysis_results WHERE analysis_type='resume_analysis' ORDER BY created_at DESC LIMIT 1. Most reliable source — text is already parsed. | x |
| Most recent resumes table row | Query resumes table for latest uploaded file. Would need re-extraction from storage. | |
| Both with fallback | Try analysis_results first, fall back to resumes table. Covers users who uploaded but never analyzed. | |

**User's choice:** Most recent analysis_results (Recommended)
**Notes:** Cleanest source, already parsed and validated.

### Follow-up: Frontend vs backend detection

| Option | Description | Selected |
|--------|-------------|----------|
| Frontend query | RecruitingLens.tsx queries analysis_results on mount, pre-fills textarea. User can edit or replace. | x |
| Backend on analysis start | Edge function auto-fetches resume if none provided. Changes API contract, removes user review. | |

**User's choice:** Frontend query (Recommended)
**Notes:** User retains full control to edit or replace before submission.

---

## Pro Locked-Field UI

| Option | Description | Selected |
|--------|-------------|----------|
| Inline LockedSection per field | Use <LockedSection> inside each gap card for howItShowsUp and fixPriority. Reuses Phase 14 primitive. | x |
| Blurred text placeholder | Show field labels with blurred placeholder text, lock icon, and Elite badge. Custom styling needed. | |
| Hide locked fields entirely | Don't render howItShowsUp and fixPriority. Simplest but no upgrade motivation. | |

**User's choice:** Inline LockedSection per field (Recommended)
**Notes:** Consistent visual language, no new component needed.

### Follow-up: Omitted top-level sections

| Option | Description | Selected |
|--------|-------------|----------|
| Show LockedSection placeholders | Individual <LockedSection> for each omitted section. Maximizes upgrade visibility. | x |
| Hide entirely | Don't render anything for omitted sections. Cleaner but users don't know what they're missing. | |
| Single summary lock | One <LockedSection> at the bottom covering all omitted sections. Less visual noise. | |

**User's choice:** Show LockedSection placeholders (Recommended)
**Notes:** Maximizes upgrade conversion by showing what Pro users are missing.

---

## Elite Dashboard Save

| Option | Description | Selected |
|--------|-------------|----------|
| Existing analysis_results | Current save to analysis_results is sufficient. Dashboard presentation is Phase 20's scope. | x |
| New dashboard section near saved jobs | Dedicated 'Job Match Analysis' section. Requires dashboard layout changes overlapping Phase 20. | |
| Link from saved jobs | 'View Analysis' link on saved job cards if analysis exists. Requires job-to-analysis linking. | |

**User's choice:** Existing analysis_results (Recommended)
**Notes:** No new table or section needed in Phase 18.

---

## Claude's Discretion

- Exact PRO_ALLOWED_FIELDS list derivation from spec
- Whether tier shaper is standalone function or parameter to existing merge function
- Teaser text copy for each LockedSection placeholder
- How frontend detects total gap/edit count for LockedListItem
- Resume text extraction from analysis_results.raw_response shape

## Deferred Ideas

None — discussion stayed within phase scope.
