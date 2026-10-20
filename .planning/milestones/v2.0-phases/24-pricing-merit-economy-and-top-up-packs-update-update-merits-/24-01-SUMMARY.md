---
phase: 24-pricing-merit-economy-and-top-up-packs-update-update-merits-
plan: 01
subsystem: config
tags: [config, tokens, merits, pricing, foundation]
requirements:
  - BUDGET-01
  - ECON-01
dependency_graph:
  requires: []
  provides:
    - "src/config/pricing-config.ts (canonical Phase 24 source of truth)"
    - "src/config/pricing-config.snapshot.ts (D-19 SC-12 pinned literal)"
    - "src/config/__tests__/sc12-snapshot.test.ts (CI drift guard)"
    - "Types: Tier, FeatureKey, PackCatalogEntry"
    - "Constants: MERITS_PER_MONTH, MERIT_COST_PER_FEATURE, PRICING, maxTokensOutput, maxTokensInput, maxCharactersInput, PACK_CATALOG"
    - "Accessors: getMaxOutput, getMaxInputTokens, getMaxInputChars, getMeritCost"
  affects:
    - "All Phase 24 Wave 2+ plans (02-07) will import from this module"
tech_stack:
  added: []
  patterns:
    - "Record<Tier, ...> Table-as-Record pattern (analog: supabase/functions/_shared/tier-config.ts)"
    - "Pinned snapshot literal + deep-equal test for D-19 drift detection"
    - "Zero-dep pure module pattern — safe for dual import from Vite @/ and Deno relative"
key_files:
  created:
    - src/config/pricing-config.ts
    - src/config/pricing-config.snapshot.ts
    - src/config/__tests__/sc12-snapshot.test.ts
  modified: []
decisions:
  - "Use canonical SC-12 FeatureKey names (resumeAnalysis/careerCompass/recruitingLens/linkedinGrader/interviewPrepCoach) — NOT the short names (resume/career/linkedin/recruiting/interview) used by tier-config.ts; a mapping constant will be introduced in plan 03."
  - "Pin SC-12 values as an independent literal in pricing-config.snapshot.ts; deep-equal guard in sc12-snapshot.test.ts fails CI on any drift (D-19 lock)."
  - "Use PRICING in CENTS to match Stripe API conventions (899 = $8.99, 8999 = $89.99, etc.)."
  - "Zero edge-layer / React dependencies — module is pure constants + pure functions so it can safely be imported by both Deno edge functions and the Vite frontend without side effects."
metrics:
  duration: "~5 minutes"
  completed: "2026-04-22"
  tasks: 2
  files_created: 3
  files_modified: 0
---

# Phase 24 Plan 01: Pricing Config Foundation Summary

**One-liner:** Landed the single dual-imported TS source of truth for every Phase 24 numeric value (merit caps, per-tier costs, subscription pricing, SC-12 token/char budgets, pack catalog) with a pinned D-19 CI snapshot guard.

## Scope

This plan establishes the CONTRACT every downstream Phase 24 plan (02-07) depends on. It introduces the canonical `pricing-config.ts` module with six tables and four typed accessors, and pins the SC-12 token-budget tables verbatim via an independent snapshot literal + vitest deep-equal guard. Any future drift from ROADMAP.md §SC-12 fails CI.

## Deliverables

### 1. `src/config/pricing-config.ts` (new, 114 lines)

Exports:

- **Types**: `Tier` (`'free' | 'pro' | 'elite'`), `FeatureKey` (5 canonical names), `PackCatalogEntry`
- **SC-1 constants**: `MERITS_PER_MONTH`, `MERIT_COST_PER_FEATURE`
- **SC-1/SC-4 constants**: `PRICING` (in CENTS; pro 899/8999, elite 1699/16999)
- **SC-12 verbatim tables**: `maxTokensOutput`, `maxTokensInput`, `maxCharactersInput`
- **SC-6 constant**: `PACK_CATALOG` (4 entries; `pack_25` carries `isBestValue: true`)
- **Typed accessors**: `getMaxOutput`, `getMaxInputTokens`, `getMaxInputChars`, `getMeritCost`

Zero React / Supabase / Deno imports — safe to dual-import.

### 2. `src/config/pricing-config.snapshot.ts` (new, 44 lines)

Independent literal copy of SC-12 tables + `tierSums` (Free 11500 / Pro 52000 / Elite 72000). Uses `satisfies Record<FeatureKey, Record<Tier, ...>>` to assert shape compliance against the canonical types without widening.

### 3. `src/config/__tests__/sc12-snapshot.test.ts` (new, 52 lines)

Five vitest assertions:

1. `maxTokensOutput` deep-equals `SC12_SNAPSHOT.maxTokensOutput`
2. `maxTokensInput` deep-equals snapshot
3. `maxCharactersInput` deep-equals snapshot
4. Tier sums for `maxTokensOutput` reconcile to 11500 / 52000 / 72000
5. 4:1 char:token invariant holds on every non-null row (with symmetric-null check for locked rows)

## Verification

### Build

```
$ npm run build -- --mode development
✓ built in 2.60s
```

### Test

```
$ npm test -- --run src/config/__tests__/sc12-snapshot.test.ts
 ✓ src/config/__tests__/sc12-snapshot.test.ts (5 tests) 4ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
```

### Acceptance grep checks (all pass)

- `rg "^export const MERITS_PER_MONTH" src/config/pricing-config.ts` → 1 match
- `rg "^export const PACK_CATALOG" src/config/pricing-config.ts` → 1 match
- `rg "free: null, pro: 8, elite: 5" src/config/pricing-config.ts` → 2 matches (recruitingLens + interviewPrepCoach)
- `rg "isBestValue: true" src/config/pricing-config.ts` → 1 match (pack_25 only)
- `rg "SC12_SNAPSHOT" src/config/pricing-config.snapshot.ts` → 1 match
- `rg "D-19 SC-12 verbatim snapshot guard" src/config/__tests__/sc12-snapshot.test.ts` → 1 match
- `rg "free: 11500, pro: 52000, elite: 72000" src/config/pricing-config.snapshot.ts` → 1 match
- `rg "expect\(chr.*\)\.toBe\(tok \* 4\)" src/config/__tests__/sc12-snapshot.test.ts` → 1 match

### Self-containment sanity check

Per the plan's output spec, Wave 2+ consumers must not exist yet:

- `rg "from '@/config/pricing-config'" src` → 0 matches (no Wave 2+ frontend consumers)
- `rg "from ['\"].*pricing-config['\"]" src` shows ONLY:
  - `src/config/pricing-config.snapshot.ts:13` (internal type import)
  - `src/config/__tests__/sc12-snapshot.test.ts:8` (test file)
  - `src/config/pricing-config.ts:5` (match is inside the docstring comment, not an actual import)

Plan 24-01 is self-contained. Wave 2+ plans can now safely consume.

## Tier-Sum Reconciliation (asserted in test 4)

| Tier  | resumeAnalysis | careerCompass | recruitingLens | linkedinGrader | interviewPrepCoach | SUM   |
| ----- | --------------:| -------------:| --------------:| --------------:| ------------------:| -----:|
| free  | 4000           | 5000          | 0              | 2500           | 0                  | 11500 |
| pro   | 8000           | 12000         | 12000          | 8000           | 12000              | 52000 |
| elite | 12000          | 16000         | 16000          | 12000          | 16000              | 72000 |

Matches ROADMAP §SC-12 locked tier totals exactly.

## 4:1 Char:Token Invariant Spot Check

| Feature / Tier                 | tokens | chars  | chars == tokens*4 |
| ------------------------------ | ------:| ------:| :---------------- |
| resumeAnalysis / free          | 3500   | 14000  | yes               |
| resumeAnalysis / pro           | 5000   | 20000  | yes               |
| resumeAnalysis / elite         | 10000  | 40000  | yes               |
| careerCompass / free           | 6000   | 24000  | yes               |
| careerCompass / elite          | 12000  | 48000  | yes               |
| recruitingLens / free          | null   | null   | both-null (locked) |
| recruitingLens / pro           | 8000   | 32000  | yes               |
| recruitingLens / elite         | 9000   | 36000  | yes               |
| linkedinGrader / free          | 3500   | 14000  | yes               |
| linkedinGrader / elite         | 3500   | 14000  | yes               |
| interviewPrepCoach / free      | null   | null   | both-null (locked) |
| interviewPrepCoach / pro       | 5850   | 23400  | yes               |
| interviewPrepCoach / elite     | 5850   | 23400  | yes               |

All 15 cells conform to D-19.

## Commits

| Task | Hash    | Message                                                                 |
| ---- | ------- | ----------------------------------------------------------------------- |
| 1    | d8b0b42 | feat(24-01): add pricing-config.ts canonical Phase 24 source of truth   |
| 2    | f7aea98 | test(24-01): add SC-12 verbatim snapshot guard (D-19)                   |

## Deviations from Plan

None — plan executed exactly as written. All SC-12 values pinned verbatim per D-19 lock.

## Threat Model Alignment

| Threat ID | Disposition | Status   | Mitigation delivered                                                                                   |
| --------- | ----------- | -------- | ------------------------------------------------------------------------------------------------------ |
| T-24-01   | mitigate    | complete | `sc12-snapshot.test.ts` fails CI on any cell drift; snapshot + ROADMAP must be updated in lockstep.    |
| T-24-02   | mitigate    | complete | Module docstring explicitly mandates server-side tier read; accessors are pure (no auth surface).      |
| T-24-03   | accept      | n/a      | Module exports only numerics + typed accessors; zero PII, zero secrets.                                |
| T-24-04   | mitigate    | complete | Module is pure constants + pure functions; zero edge-layer deps; safe to import with no side effects. |

No new threat surface introduced beyond the registered set.

## Known Stubs

None — every exported value is a concrete numeric from SC-1 / SC-4 / SC-6 / SC-12. No placeholders, no TODO markers, no empty defaults that flow to UI.

## Follow-Up for Wave 2+ Plans

1. **Plan 02** — adopt `MERITS_PER_MONTH`, `MERIT_COST_PER_FEATURE`, `PRICING` in Stripe product sync.
2. **Plan 03** — introduce mapping between existing short `FeatureKey` (`resume`, `career`, `linkedin`, `recruiting`, `interview` in `supabase/functions/_shared/tier-config.ts`) and the canonical SC-12 long names exported here.
3. **Plans 04-07** — each feature plan will import `getMaxOutput` / `getMaxInputTokens` / `getMaxInputChars` at the edge layer (via relative `../../../src/config/pricing-config.ts` import from Deno) and at the FE layer (via `@/config/pricing-config`).

## Self-Check: PASSED

- File exists: `src/config/pricing-config.ts` — FOUND
- File exists: `src/config/pricing-config.snapshot.ts` — FOUND
- File exists: `src/config/__tests__/sc12-snapshot.test.ts` — FOUND
- Commit d8b0b42 in git log — FOUND
- Commit f7aea98 in git log — FOUND
- `npm run build` — PASS (exit 0)
- `npm test -- --run src/config/__tests__/sc12-snapshot.test.ts` — PASS (5/5 green)
