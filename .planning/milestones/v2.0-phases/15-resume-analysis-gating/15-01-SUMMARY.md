---
phase: 15-resume-analysis-gating
plan: 01
subsystem: result-merger
tags: [tier-shaping, whitelist, defense-in-depth]
dependency_graph:
  requires: []
  provides: [applyTierShape, tier-whitelists]
  affects: [supabase/functions/_shared/result-merger.ts]
tech_stack:
  added: []
  patterns: [whitelist-based-field-stripping, tier-aware-output-shaping]
key_files:
  created: []
  modified:
    - supabase/functions/_shared/result-merger.ts
    - supabase/functions/_shared/result-merger.test.ts
decisions:
  - "D-15: Whitelist-based applyTierShape is the single exit point for all tier shaping"
  - "D-12: Defense-in-depth — strips Pro/Elite fields from Free output regardless of AI model behavior"
  - "D-14: Free tier C2-C11 stripped to {id, label, weight, score} only; C1 keeps full feedback"
  - "D-13: priorityImprovements capped per tier (free=1, pro=5, elite=7) inside applyTierShape"
self_check: PASSED
---

## Summary

Added tier-aware output shaping to the result merger — the defense-in-depth enforcement layer that deterministically strips Pro/Elite fields from Free output regardless of what the AI model returns.

## What was built

1. **Tier whitelists** (`FREE_ALLOWED_FIELDS`, `PRO_ALLOWED_FIELDS`, `ELITE_ALLOWED_FIELDS`) — per-tier field sets controlling which keys survive in the merged output.

2. **`applyTierShape()` function** — exported from result-merger.ts. Strips keys not in whitelist, caps `priorityImprovements` per tier (1/5/7), and strips feedback detail from C2-C11 for Free tier. Mutates merged object in place.

3. **Updated `mergeAndValidateResults` signature** — changed from `isElite: boolean` to `tier: 'free' | 'pro' | 'elite'`. All internal references updated.

4. **Elite-extras support** — added `'elite-extras'` to ALLOWED_FIELDS and optional fold-in of elite-extras call result in the merge pipeline.

5. **8 new unit tests** — covering `applyTierShape` for all 3 tiers (field stripping, improvement capping, criterion feedback shaping, idempotency) plus `mergeAndValidateResults` signature test.

6. **12 existing tests updated** — all `mergeAndValidateResults(rawResults, false)` calls changed to `mergeAndValidateResults(rawResults, 'free')` and `true` to `'elite'`.

## Commits

- `7279997` feat(15-01): add applyTierShape and tier whitelists to result-merger
- `af3e725` test(15-01): add applyTierShape unit tests and update existing tests to tier string

## Deviations

None — implementation matches plan exactly.

## Self-Check: PASSED

- [x] `applyTierShape` exported from result-merger.ts
- [x] FREE/PRO/ELITE_ALLOWED_FIELDS whitelists defined
- [x] `mergeAndValidateResults` accepts tier string
- [x] `applyTierShape` called inside `mergeAndValidateResults` after `fillDefaults`
- [x] 8 new unit tests pass
- [x] All existing tests pass with updated signature
