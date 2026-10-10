# Phase 17: career-compass-gating - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 17-career-compass-gating
**Areas discussed:** Call architecture, Free output shaping, Multi-role comparison, Prompt extraction

---

## Call Architecture

| Option | Description | Selected |
|--------|-------------|----------|
| Single call (Recommended) | Keep current single-call architecture. Simpler, already works. Elite compensation prompt is just extra text in the same call. Per-tier maxTokens cap applied to the one call. | |
| Parallel fan-out | Split into base analysis + Elite compensation call (like resume's elite-extras). Isolates Elite cost, but adds merger complexity. | ✓ |

**User's choice:** Parallel fan-out
**Notes:** User chose to match the resume pattern for consistency across features.

### Follow-up: Call Split Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| 2 calls: base + elite-extras (Recommended) | Call 1: core + Pro fields (all tiers). Call 2: compensationIntelligence + smartApplicationStrategy (Elite only, conditional). Mirrors resume's pattern. | ✓ |
| 3 calls: core + pro-extras + elite-extras | Call 1: Free-level fields. Call 2: remaining Pro fields. Call 3: Elite compensation. More granular cost isolation but more merger complexity. | |
| You decide | Let the planner/researcher determine the optimal split based on token budget analysis. | |

**User's choice:** 2 calls: base + elite-extras
**Notes:** Minimal split that isolates Elite cost without excessive merger complexity.

---

## Free Output Shaping

### Shaper Location

| Option | Description | Selected |
|--------|-------------|----------|
| Extend result-merger.ts (Recommended) | Add career-specific shaping rules to the existing applyTierShape. Since we're doing parallel fan-out, Career Compass will need a merger anyway. Single enforcement point for all features. | ✓ |
| New career-output-shaper.ts | Dedicated shaper module in _shared/. Keeps career logic separate from resume's merger, but adds another module to maintain. | |
| You decide | Let the planner pick based on how the merger integration works out. | |

**User's choice:** Extend result-merger.ts
**Notes:** Consistent with Phase 15 pattern — single enforcement point.

### Enforcement Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Defense in depth (Recommended) | Both the Free prompt instructs the model to generate only Free fields, AND applyTierShape strips/slices arrays server-side. Matches Phase 15 D-11 precedent. | ✓ |
| Prompt-only | Trust the Free prompt to omit locked fields. Simpler, fewer moving parts. Relies on tier-validation harness (TEST-09) to catch regressions. | |

**User's choice:** Defense in depth
**Notes:** Same precedent as Phase 15 — a leaky prompt regression cannot reach a Free user.

---

## Multi-Role Comparison

### Merit Cost

| Option | Description | Selected |
|--------|-------------|----------|
| Same Merit cost as full analysis (Recommended) | Multi-role comparison costs the same Merits (3/2/3 Free/Pro/Elite). Already wrapped inside withMerits today. The comparison invokes an AI call. | ✓ |
| Reduced cost | Charge 1 Merit for all tiers. Requires a separate withMerits call or cost override. | |
| Free for all tiers | No Merit charge. Wrap outside withMerits. | |
| You decide | Let the planner determine based on spec analysis and cost modeling. | |

**User's choice:** Same Merit cost as full analysis
**Notes:** Consistent pricing — the comparison still invokes an AI call.

### Tier Shaping

| Option | Description | Selected |
|--------|-------------|----------|
| Same tier shaping (Recommended) | Free multi-role comparison omits Elite/Pro-only fields. Consistent — tier determines what you see everywhere. | ✓ |
| Full output for all tiers | Show full results regardless of tier since comparing against an existing analysis. | |

**User's choice:** Same tier shaping
**Notes:** Tier determines output shape consistently across all paths.

---

## Prompt Extraction

### Prompt Structure

| Option | Description | Selected |
|--------|-------------|----------|
| New career-prompts.ts (Recommended) | Create _shared/career-prompts.ts with per-tier builders. Register in Phase 14 loader. Matches resume-prompts.ts pattern. | ✓ |
| Extend inline with variant branching | Keep prompts in index.ts with if/else tier branches. Diverges from Phase 14's loader pattern. | |
| You decide | Let the planner determine the extraction approach. | |

**User's choice:** New career-prompts.ts
**Notes:** Follows Phase 14 D-01/D-02 established pattern.

### Domain Classification Location

| Option | Description | Selected |
|--------|-------------|----------|
| Stay in index.ts (Recommended) | DOMAIN_MAPPING is request-processing logic, not prompt text. Pass classification results into prompt builder via params. | ✓ |
| Move to career-prompts.ts | Co-locate domain data with prompts. Larger module but self-contained. | |
| Separate career-domains.ts | Extract into its own module. Used by both index.ts and career-prompts.ts. | |

**User's choice:** Stay in index.ts
**Notes:** Clean separation of concerns — domain classification is processing, not prompt text.

---

## Claude's Discretion

- Exact maxTokens budget split between base and elite-extras calls
- Whether to reuse/adapt executeParallelCalls from analyze-resume or build a new fan-out
- Exact FREE/PRO/ELITE allowed field lists (cross-reference CC-01/CC-02/CC-03/CC-04)
- Shape of the elite-extras prompt builder
- handleMultiRoleComparison prompt variant approach
- Retry/backoff logic preservation per-call

## Deferred Ideas

- Rich frontend Career Compass Elite presentation — Phase 20
- Extracting resolveTier() into shared module — when a third feature needs it
- Refactoring DOMAIN_MAPPING into separate module — not needed now
- Running TEST-09/10 in CI — still deferred
