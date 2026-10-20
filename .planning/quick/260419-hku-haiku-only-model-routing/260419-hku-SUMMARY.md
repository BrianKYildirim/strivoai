---
id: 260419-hku
slug: haiku-only-model-routing
description: Ensure ONLY Haiku 4.5 is used across ALL features on ALL tiers
date: 2026-04-19
status: complete
---

# Quick Task 260419-hku — Summary

## Changes

- `supabase/functions/_shared/tier-config.ts`
  - `DEFAULT_PRO_ELITE_MODEL` now aliases `FREE_MODEL` (`claude-haiku-4-5-20251001`).
  - `FEATURE_MODEL_OVERRIDES` is now `{}` — the per-feature Haiku overrides for career/linkedin/recruiting are unnecessary once every tier defaults to Haiku.
  - Comments updated to document platform-wide Haiku-only routing.
- `supabase/functions/_shared/tier-config.test.ts`
  - Removed D-11 tests that asserted Pro/Elite default ≠ Haiku.
  - Added Haiku-only coverage across all `(tier, feature)` combinations and `DEFAULT_PRO_ELITE_MODEL === FREE_MODEL`.
  - Updated FEATURE_MODEL_OVERRIDES assertion to check the empty state.

## Verification

- `cd supabase/functions && deno test --no-check _shared/tier-config.test.ts`
  - 21 passed / 0 failed.
- Grep for `claude-sonnet`, `claude-opus`, or `claude-3-*` in `src/` + `supabase/` — no remaining non-Haiku model references in application code.
- All edge functions with env fallbacks (`ANTHROPIC_MODEL_TEXT`) already default to `claude-haiku-4-5-20251001`.

## Notes

- Env vars `ANTHROPIC_MODEL_TEXT` and `ANTHROPIC_MODEL_FALLBACK` remain as operational knobs. Keep them unset (or set to Haiku) in every deployment to preserve platform-wide Haiku-only routing.
- Free tier model routing remains hard-locked through the `if (tier === 'free') return FREE_MODEL;` path in `getModel()` (D-13).
