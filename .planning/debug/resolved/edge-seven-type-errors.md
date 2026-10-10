---
status: resolved
trigger: "fix the 7 type errors"
created: 2026-07-17
updated: 2026-07-17
---

# Edge seven type errors

## Symptoms

**Expected:** `npm run test:edge` completes its `deno task check` preflight and
continues into the Edge Function tests.

**Actual:** Type checking stops before tests with seven diagnostics across
`extract-analysis-structure/*` and `grade-linkedin/index.ts`.

**Known diagnostics:**

- `extract-linkedin.ts:133`: `parsed_summary` is not assignable to database JSON.
- `extract-recruiting-lens.ts:106`: `source_analysis_results_id` is rejected by
  the generated table type.
- `extract-recruiting-lens.ts:202`: a string value is inferred as `never`.
- `extract-resume.ts:198`: `parsed_summary` is not assignable to database JSON.
- `extract-resume.ts:228`: `Record<string, unknown>` is not assignable to JSON.
- `grade-linkedin/index.ts:639`: `Record<string, unknown>` is not assignable to
  `JsonObject`.
- `grade-linkedin/index.ts:690`: the same `JsonObject` incompatibility.

**Timeline:** Surfaced after the current uncommitted database generic/type work
made the full Edge check stricter.

**Reproduction:** Run `npm.cmd run test:edge` or the repository's Deno check
task from the workspace root.

## Current Focus

hypothesis: CONFIRMED — the generated database generic exposed JSON values widened to `unknown`, a LinkedIn helper return type broader than its validated value, and a real missing `job_descriptions.source_analysis_results_id` database column.
test: Normalize JSON at database boundaries, preserve the validated LinkedIn JSON object type, add the missing nullable FK/idempotency index and synchronized generated types, then run focused and complete gates.
expecting: All seven diagnostics disappear without changing serialized AI payloads; Recruiting Lens idempotency becomes valid at runtime once the migration is applied.
next_action: Apply `20260717020000_add_job_descriptions_analysis_source.sql` before deploying `extract-analysis-structure`; no deployment or remote database mutation was performed in this debug.

## Evidence

- timestamp: 2026-07-17T11:35:00-07:00
  - `npm.cmd run test:edge` reproduced exactly seven TypeScript diagnostics.
- timestamp: 2026-07-17T11:41:00-07:00
  - Targeted `deno check` passed for `extract-analysis-structure/index.ts` and
    `grade-linkedin/index.ts` after the fix.
  - Focused extractor and LinkedIn validation slice: 45 passed, 0 failed.
- timestamp: 2026-07-17T11:52:00-07:00
  - Full Edge gate: 1368 passed, 0 failed, 12 environment-gated tests ignored.
  - Frontend `npm.cmd run type-check`: passed.
  - `git diff --check`: passed.

## Eliminated

## Resolution

root_cause:
  Generated `SupabaseClient<Database>` typing correctly revealed three stale
  contracts: JSONB payloads widened to `Record<string, unknown>`, a validated
  LinkedIn result returned under that broad type, and Recruiting Lens code using
  a source-analysis column omitted from the actual `job_descriptions` schema.
fix:
  Added one JSON serialization-boundary normalizer for extractor JSONB writes;
  retained `JsonObject` through the tiered LinkedIn helper; added the missing
  nullable analysis FK plus partial unique idempotency index; synchronized both
  generated database type files; reconciled the stale Merit static assertion.
verification:
  Seven diagnostics reduced to zero. Full Deno check and Edge gate pass; focused
  tests pass; frontend type-check and diff hygiene pass.
files_changed:
  `extract-analysis-structure/types.ts`, `extract-linkedin.ts`, `extract-resume.ts`,
  `grade-linkedin/index.ts`, both generated database type files, Recruiting Lens
  extractor test, Merit forwarding static test, and migration
  `20260717020000_add_job_descriptions_analysis_source.sql`.
