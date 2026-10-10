---
phase: 14
plan: 02
status: complete
started: 2026-04-16
completed: 2026-04-16
---

## Summary

Shipped the shared tier-prompt loader and STRIVO_GLOBAL_AI_PRINCIPLES constant. The loader provides a single audit-point for "which prompt variant does tier X see?" — Free variants are returned verbatim (no principles prefix, preserving cost ceiling), while Pro and Elite variants get STRIVO_GLOBAL_AI_PRINCIPLES auto-prepended.

## Key Files

### Created
- `supabase/functions/_shared/global-ai-principles.ts` — Exported `STRIVO_GLOBAL_AI_PRINCIPLES` string constant extracted from DOCX source
- `supabase/functions/_shared/tier-prompts.ts` — `loadPromptVariant(feature, tier, params)` + `registerFeaturePrompts()` registry + `Tier`/`FeatureKey`/`PromptVariantBuilder` types
- `supabase/functions/_shared/tier-prompts.test.ts` — 7 Deno tests covering GATE-01..04 invariants

### Modified
- `scripts/run-edge-tests.ps1` — Registered tier-prompts.test.ts in runner

## Requirements Completed
- GATE-01: Single shared loader keyed on (feature, tier)
- GATE-02: Loader throws for unregistered features
- GATE-03: Loader supports omission semantics (Free never gets principles)
- GATE-04: Auto-prepend enforcement for Pro/Elite, cost-trim for Free

## Deviations
None.

## Self-Check: PASSED
