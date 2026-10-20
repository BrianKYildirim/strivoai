---
id: 260419-hku
slug: haiku-only-model-routing
description: Ensure ONLY Haiku 4.5 is used across ALL features on ALL tiers
date: 2026-04-19
status: complete
---

# Quick Task 260419-hku — Haiku-only model routing

## Goal

Every AI feature (Resume Analysis, Career Compass, LinkedIn Grader, Recruiting Lens, Interview Prep Coach, Skills Gap, Compare Jobs, Chat Agent, OCR, PDF parse) on every tier (Free, Pro, Elite) must resolve to `claude-haiku-4-5-20251001` via `getModel()` / env-var defaults.

## Investigation summary

Only one code path resolved to a non-Haiku model: `analyze-resume` (and any future feature without a `FEATURE_MODEL_OVERRIDES` entry) for Pro/Elite tiers fell back to `DEFAULT_PRO_ELITE_MODEL = 'claude-sonnet-4-5-20250929'` in `supabase/functions/_shared/tier-config.ts`.

All other edge functions already hard-defaulted to Haiku 4.5 via `Deno.env.get('ANTHROPIC_MODEL_TEXT') || 'claude-haiku-4-5-20251001'` or direct hardcoded Haiku IDs.

## Tasks

1. `supabase/functions/_shared/tier-config.ts`
   - Point `DEFAULT_PRO_ELITE_MODEL` at `FREE_MODEL` so Pro/Elite defaults resolve to Haiku.
   - Empty `FEATURE_MODEL_OVERRIDES` (no longer needed — all tiers already land on Haiku via `TIER_MODELS`). Kept as a hook for future divergence.
   - Update surrounding comments.
2. `supabase/functions/_shared/tier-config.test.ts`
   - Replace D-11 tests that asserted Pro/Elite default ≠ Haiku with Haiku-only assertions covering all `(tier, feature)` combinations.
   - Update FEATURE_MODEL_OVERRIDES assertion (now empty).

## Verify

- `deno test --no-check supabase/functions/_shared/tier-config.test.ts` — 21/21 pass.
- Grep for any remaining `claude-sonnet`/`claude-opus` refs in `src/` and `supabase/` — none.

## Done

- All `getModel(tier, feature)` calls return `claude-haiku-4-5-20251001`.
- All edge-function env-var defaults already point at Haiku 4.5.
- Env vars (`ANTHROPIC_MODEL_TEXT`, `ANTHROPIC_MODEL_FALLBACK`) remain operational knobs — unset in deployment to keep Haiku-only.
