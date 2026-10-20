---
phase: 37-feature-output-parity-ux-cache-resume-linkedin-career-compas
plan: 01
subsystem: resume-analysis
tags: [resume-analysis, output-parity, cache, tests]
key-files:
  created:
    - src/pages/__tests__/Results.priority-output.test.tsx
    - supabase/functions/analyze-resume/cache.test.ts
    - supabase/functions/analyze-resume/prompts.test.ts
  modified:
    - src/pages/Results.tsx
    - supabase/functions/analyze-resume/index.ts
requirements-completed: [RES-01, RES-02, RES-03, RES-04, CACHE-04]
completed: 2026-05-22
---

# Phase 37 Plan 01: Resume Analysis Output + Cache Summary

Removed the obsolete Resume Analysis `Priority Actions` section and wired exact-input cache support through the existing Phase 29 `analysis_cache` and `withMerits` precheck contract.

## Commits

| Commit | Description |
| --- | --- |
| `095d02f` | Remove Resume `Priority Actions`, add CACHE-04 wiring, and add focused regression tests |

## What Changed

- `Results.tsx` no longer derives `quickActions` or renders `Priority Actions`; old payloads with `priorityActions`/`quickActions` are ignored.
- `Priority Improvements` remains the active improvement section.
- `analyze-resume` computes a cache key from user, tier, variant, normalized resume text hash, target role, target industry, previous score, and previous suggestions.
- Cache reads happen through `withMerits` `precheck_cache`; hits return the cached result without Anthropic or merit deduction.
- Cache writes happen only after `completeAndRecordSuccess` finishes resume persistence, `analysis_results` persistence, and linked usage write.
- Cached `raw_response.metadata.analysis_id` stores the persisted analysis id needed by the cache-hit Activity History usage row.

## Verification

| Check | Result |
| --- | --- |
| `rg -n "Priority Actions|quickActions|priorityActions" src/pages/Results.tsx` | PASS: no matches |
| `npm.cmd run test -- Results.priority-output` | PASS: 2 tests |
| `deno.cmd test --allow-read --allow-env --allow-net supabase/functions/analyze-resume/cache.test.ts supabase/functions/analyze-resume/prompts.test.ts` | PASS: 4 tests |
| `deno.cmd check supabase/functions/analyze-resume/index.ts` | PASS |
| `npx eslint src/pages/Results.tsx` | BLOCKED by pre-existing `no-explicit-any` errors and one existing hook dependency warning in `Results.tsx` |

## Manual QA Path

Pending operator/browser QA:

- Free Resume Analysis result: confirm no `Priority Actions` and `Priority Improvements` remains visible.
- Pro/Elite Resume Analysis result: confirm full result still renders and `Priority Improvements` remains visible.
- Old persisted result with obsolete `priorityActions`/`quickActions`: confirm no orphan heading appears.
- Second identical paid analysis: confirm cached response, no merit deduction, and Activity History entry links to the original analysis id.

## Deviations from Plan

- `analysis_cache` has no standalone `analysis_id` column. The implementation stores the persisted id at `raw_response.metadata.analysis_id` so `withMerits` cache-hit usage can still link Activity History to the original analysis.
- The focused frontend regression is source-level because `Results.tsx` is a route-heavy page with substantial existing mocking overhead. The direct contract still guards against reintroducing the removed strings/data flow.

## Self-Check: PASSED
