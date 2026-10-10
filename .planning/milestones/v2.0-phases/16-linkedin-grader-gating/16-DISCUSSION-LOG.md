# Phase 16: linkedin-grader-gating - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 16-linkedin-grader-gating
**Areas discussed:** Free output shaping, Model routing, Free-scan migration, Prompt variant design

---

## Free Output Shaping

| Option | Description | Selected |
|--------|-------------|----------|
| Defense-in-depth | Prompt instructs model to omit locked fields + server-side stripLinkedInFreeTier() strips Pro fields from parsed JSON. Matches Phase 15's applyTierShape philosophy. | ✓ |
| Prompt-only | Free prompt variant doesn't ask for Pro fields. No server-side strip. Simpler but prompt regression could leak. | |
| Shared applyTierShape | Extract Phase 15's applyTierShape into a generic utility for all features. More reusable but heavier refactor. | |

**User's choice:** Defense-in-depth
**Notes:** None — user selected recommended approach immediately.

### Follow-up: Strip function location

| Option | Description | Selected |
|--------|-------------|----------|
| grade-linkedin/index.ts | Inline in the handler as final step before response. LinkedIn has no merger pipeline. | ✓ |
| grade-linkedin/validation.ts | Next to validateLinkedInGrade since both operate on parsed output. | |
| You decide | Claude picks during planning. | |

**User's choice:** grade-linkedin/index.ts
**Notes:** None.

---

## Model Routing

| Option | Description | Selected |
|--------|-------------|----------|
| Keep Haiku for all tiers | Add linkedin to FEATURE_MODEL_OVERRIDES in tier-config.ts. LinkedIn is a structured scoring task, Pro/Elite identical — no justification for Sonnet cost. | ✓ |
| Sonnet for Pro/Elite | Let tier-config defaults route Pro/Elite to Sonnet. Richer feedback quality but more expensive. | |
| You decide | Claude picks based on cost analysis. | |

**User's choice:** Keep Haiku for all tiers
**Notes:** None.

---

## Free-Scan Migration

### Decision 1: Legacy path behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Keep v1.0 row-counting | Legacy path keeps entitlement.ts row-counting unchanged. Merit path uses free_linkedin_scan_used flag. Clean separation. | ✓ |
| Switch both paths to flag | Both paths check free_linkedin_scan_used. Simpler mental model but couples legacy to Merit tables. | |
| You decide | Claude picks based on risk analysis. | |

**User's choice:** Keep v1.0 row-counting
**Notes:** None.

### Decision 2: resolve-tier.ts extraction

| Option | Description | Selected |
|--------|-------------|----------|
| Extract now | Phase 15 deferred to "first phase that duplicates." Phase 16 is that phase. Extract resolveTier() into _shared/resolve-tier.ts. | ✓ |
| Keep inline | Copy Phase 15's inline pattern. Defer extraction further. | |
| You decide | Claude decides during planning. | |

**User's choice:** Extract now
**Notes:** None.

---

## Prompt Variant Design

### Decision 1: Variant count

| Option | Description | Selected |
|--------|-------------|----------|
| 3 variants, elite reuses pro | Register 3 builders: FREE, PRO, ELITE = PRO (same reference). Loader gets 3 entries per contract. | ✓ |
| 2 variants with alias | Build FREE and PAID only. Register elite as alias to pro builder. | |
| You decide | Claude picks the cleanest pattern. | |

**User's choice:** 3 variants, elite reuses pro
**Notes:** None.

### Decision 2: Prompt file location

| Option | Description | Selected |
|--------|-------------|----------|
| Evolve grade-linkedin/prompts.ts | Keep variants in the feature's own prompts.ts. Export builders and register with Phase 14 loader. Current buildSystemPrompt becomes Pro builder. | ✓ |
| New _shared/linkedin-prompts.ts | Move to _shared following resume-prompts.ts pattern. | |
| You decide | Claude picks during planning. | |

**User's choice:** Evolve grade-linkedin/prompts.ts
**Notes:** None.

---

## Claude's Discretion

- Exact fields in stripLinkedInFreeTier whitelist (planner cross-references LIG-01/LIG-02)
- Whether buildUserMessage needs tier-aware modifications
- Whether free-scan flag flip uses .update() or .rpc()
- Whether Phase 15 refactor is a separate plan or folded into Phase 16
- Exact resolveTier() return type
- Module registration approach (self-register at import vs. explicit call)

## Deferred Ideas

- Frontend LinkedInGrader.tsx changes for LockedSection rendering — Phase 20
- TEST-09/TEST-10 in CI — deferred from Phase 14
- Legacy path refactoring to use prompt-loading + tier-shaping — Phase 21
