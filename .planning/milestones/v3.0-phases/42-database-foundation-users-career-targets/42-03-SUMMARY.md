---
phase: 42-database-foundation-users-career-targets
plan: 03
subsystem: database
tags: [supabase, postgres, rls, migrations, versioning]
requires:
  - plan: 42-01
    provides: users and career_targets foundation
  - plan: 42-02
    provides: frontend target cutover
provides:
  - Phase 42 Layer 2 structured versioning migration
  - resume_versions, resume_sections, resume_bullets, linkedin_versions, and scores tables
  - auth_owns_version SECURITY DEFINER helper
  - Service-role-write-only RLS model for all five tables
  - Regenerated Supabase TypeScript types for Layer 2
  - DB-VER-02 SPEC amendment for per-user Option A reconciliation
affects: [phase-42-layer-2, versioning, structured-scores, rls]
tech-stack:
  added: []
  patterns:
    - Atomic Supabase migration with final DO $$ verification block
    - SELECT-own RLS with child-table parent joins
    - Polymorphic scores RLS via SECURITY DEFINER ownership helper
key-files:
  created:
    - supabase/migrations/20260525000002_phase42_layer2_versioning_tables.sql
    - .planning/phases/42-database-foundation-users-career-targets/42-03-SUMMARY.md
  modified:
    - src/integrations/supabase/types.ts
    - .planning/phases/42-database-foundation-users-career-targets/42-SPEC.md
key-decisions:
  - "Used Option A reconciliation for LinkedIn versioning: linkedin_versions is a per-user re-grade-history layer over existing per-user linkedin_grades rows."
  - "Kept all five Layer 2 tables service-role-write-only; authenticated clients only receive SELECT-own policies."
  - "Verified resume_sections as 7 columns because the required created_at column is part of the table contract."
requirements-completed: [DB-VER-01, DB-VER-02, DB-VER-04, DB-SEC-01, DB-BUL-01, DB-SCR-01]
duration: 52m
completed: 2026-05-26
---

# Phase 42 Plan 03: Layer 2 Versioning Schema Summary

**Shipped the structured versioning database layer and applied it to the linked Supabase project.**

## Accomplishments

- Added `20260525000002_phase42_layer2_versioning_tables.sql` with five new tables: `resume_versions`, `resume_sections`, `resume_bullets`, `linkedin_versions`, and `scores`.
- Added SELECT-only RLS policies for all five tables; no authenticated INSERT/UPDATE/DELETE policies were created.
- Added `public.auth_owns_version(uuid, text)` as a SECURITY DEFINER helper for polymorphic `scores` ownership checks.
- Added required indexes for version lookup, source analysis lookup, child table joins, and score lookup.
- Amended DB-VER-02 in `42-SPEC.md` to reflect live per-user LinkedIn semantics with Option A reconciliation.
- Applied the migration to the linked Supabase project and regenerated `src/integrations/supabase/types.ts`.

## Task Commits

1. **Tasks 1-2: L2 migration + SPEC amendment** - `e0cc124` (`feat(42-03): add layer 2 versioning migration`)
2. **Task 3: Push migration + regenerate types** - `b0624e2` (`chore(42-03): regenerate Supabase types for versioning`)

**Plan metadata:** recorded in the follow-up docs close-out commit.

## Verification

- `supabase db push` passed and emitted `Phase 42 Layer 2 versioning verification passed`.
- The migration verification block asserted all five tables, RLS enabled, one SELECT policy per table, zero write policies, expected column counts, the SECURITY DEFINER helper, and all seven indexes.
- `supabase db query --linked --output json "SELECT count(*) ... pg_policies ... cmd='SELECT';"` returned `policy_count: 5`.
- `rg -n "resume_versions|resume_sections|resume_bullets|linkedin_versions|scores|auth_owns_version" src/integrations/supabase/types.ts` confirmed regenerated types include the new tables and helper.
- `npm run build` passed.
- `npx eslint src/integrations/supabase/types.ts` passed.

## Full-Suite Status

- `npm run lint` still fails on pre-existing repo-wide lint debt: 560 problems, including `.claude/worktrees` files, existing `any` usage, Supabase function lint debt, and unrelated page warnings/errors.
- `npm run test` still fails outside this plan: 9 failed files, 72 passed files, 8 failed tests, 440 passed tests. Remaining failures match the prior run: Phase 24 requirements coverage, unrelated LinkedIn/Recruiting Lens/BlurredLockCard/Navbar expectations, HTTPS imports in Supabase function tests, and the pre-existing `ThemeToggle` localStorage crash.
- `gsd-sdk query requirements.mark-complete DB-VER-01 DB-VER-02 DB-VER-04 DB-SEC-01 DB-BUL-01 DB-SCR-01` returned all six IDs as `not_found`; roadmap and state were still advanced.

## Deviations from Plan

- The migration verification asserts `resume_sections` has 7 columns, not 6, because the plan also required `created_at`; using 6 would make the migration fail its own table contract.
- Direct linked SQL verification for table/function counts was partially blocked after Supabase returned pooler `ECIRCUITBREAKER` from too many temporary-role authentication failures. The migration verification block and generated types still verified those objects.

## User Setup Required

None. The Layer 2 migration was applied to the linked Supabase project and the generated frontend types were committed.

## Next Phase Readiness

Plan 42-04 can build the async extraction worker against the live Layer 2 schema and regenerated types.

---
*Phase: 42-database-foundation-users-career-targets*
*Completed: 2026-05-26*
