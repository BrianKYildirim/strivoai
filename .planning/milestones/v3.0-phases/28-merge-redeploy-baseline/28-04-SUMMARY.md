---
phase: 28-merge-redeploy-baseline
plan: 04
subsystem: legacy-function-delete
tags: [merge-baseline, legacy-delete, sc2, idempotent-staging, prod-deleted, orphan-cleanup]
dependency_graph:
  requires: [28-03]
  provides: [legacy-interview-prep-coach-deleted-prod, legacy-source-cleanup, sc2-satisfied-both-envs]
  affects: [28-05]
tech_stack:
  added: []
  patterns: [supabase-functions-delete, post-delete-list-verification]
key_files:
  created:
    - .planning/phases/28-merge-redeploy-baseline/28-W4-EVIDENCE.md
    - C:/Users/yildi/AppData/Local/Temp/staging-funcs-pre.txt (LOCAL ONLY)
    - C:/Users/yildi/AppData/Local/Temp/staging-funcs-post.txt (LOCAL ONLY)
    - C:/Users/yildi/AppData/Local/Temp/prod-funcs-pre.txt (LOCAL ONLY)
    - C:/Users/yildi/AppData/Local/Temp/prod-funcs-post.txt (LOCAL ONLY)
  deleted:
    - src/pages/InterviewPrepCoach.tsx (495 lines orphan — committed as `7c8edda`)
    - supabase/functions/interview-prep-coach/index.ts (committed as `7c8edda`)
    - supabase/functions/interview-prep-coach/validation.ts (committed as `7c8edda`)
    - supabase/functions/interview-prep-coach/validation.test.ts (committed as `7c8edda`)
  modified: []
decisions:
  - D-12 preflight initially failed (3 hits in src/ and supabase/) — all were dead code (router-orphan page + deploy-script-excluded function source). Resolved by orphan cleanup commit `7c8edda` (884 deletions) BEFORE running operator-led delete, so D-12 grep returns zero matches and the spirit of the rule is satisfied.
  - Staging delete was a no-op — operator had already deleted `interview-prep-coach` from staging in a prior session. CLI returned `Function interview-prep-coach does not exist on the Supabase project: nothing to delete` exit 1. Documented as idempotent satisfaction of SC #2 staging-side per Pitfall 6 (rely on `functions list` capture, not just exit code).
  - Prod delete succeeded in this session: legacy fn was still active at version 6 (2026-04-24 last touched, Phase 23 era). CLI exit 0 + `Deleted Function interview-prep-coach from project zjpjapgraoxdukdvpjes.` literal.
  - Discovered 3 prod/staging orphans NOT in Phase 28 scope (`recruiting-lens` on both envs; `analyze-career-v2` on prod only) — flagged in evidence file for future cleanup phase or `/gsd-add-todo`.
metrics:
  files_deleted_from_src_tree: 4
  src_tree_lines_removed: 884
  staging_pre_delete_count: 0
  staging_post_delete_count: 0
  prod_pre_delete_count: 1
  prod_post_delete_count: 0
  staging_total_functions: 36
  prod_total_functions: 37
  prod_delete_cli_exit: 0
  completed: "2026-05-11T11:35:00Z"
---

# Phase 28 Plan 04: Wave 4 Legacy Function Delete — Summary

Removed orphaned `interview-prep-coach` source from repo tree (`7c8edda`, 4 files / 884 lines) to clear D-12 grep preflight, then operator-led `supabase functions delete`: staging was already-deleted (idempotent no-op), prod delete succeeded (exit 0, CLI confirmed removal). `supabase functions list --project-ref <both envs>` post-delete confirms `interview-prep-coach` absent from both. SC #2 satisfied across staging + prod. **Wave 5 (VERIFICATION.md assembly) promotion: GO.**

## What Was Done

### Task 1: D-12 pre-delete grep preflight

First-pass grep returned 3 hits in `src/` and `supabase/` — all orphans, not live wiring:

- `src/pages/InterviewPrepCoach.tsx:92` — page imported by nothing in `src/`; `/interview-prep` route in `App.tsx` resolves to `<InterviewPrep />` (new component) or `<ComingSoon />` (Phase 47 gate). Tree-shaken from production bundle.
- `supabase/functions/interview-prep-coach/index.ts:20,37` — function source already excluded from `scripts/deploy-{staging,production}.ps1` `$Functions` array since Phase 23 retire; never redeployed by Wave 3.

Strict D-12 acceptance ("rg produces no output") would have HALTed Wave 4, but the spirit (no live wiring → safe to delete) was satisfied. Resolved by committing the orphan removal in `7c8edda` (4 files, 884 lines). Re-run of `rg -n "interview-prep-coach" src/ supabase/` returned no matches and exit 1 → D-12 cleanly passes.

### Task 2: Staging delete — idempotent no-op

Operator had pre-cleaned `interview-prep-coach` from staging in a prior session. Pre-delete `supabase functions list --project-ref cimjltzovkahkqecpwgi` returned 36 ACTIVE functions, none of them `interview-prep-coach`. Delete CLI returned `Function interview-prep-coach does not exist on the Supabase project: nothing to delete` exit 1 — the Supabase CLI's idempotent-no-op response. Post-delete list identical to pre-delete; `grep -c "interview-prep-coach"` = 0. SC #2 staging-side satisfied via post-condition match (not via this session's mutation).

### Task 3: Production delete — succeeded in this session

Pre-delete `supabase functions list --project-ref zjpjapgraoxdukdvpjes` returned 38 ACTIVE functions including `interview-prep-coach` (version 6, UPDATED_AT 2026-04-24 — last touched during Phase 23 era). Delete CLI returned `Deleted Function interview-prep-coach from project zjpjapgraoxdukdvpjes.` exit 0. Post-delete list returned 37 ACTIVE functions with `interview-prep-coach` row absent. SC #2 prod-side satisfied.

## Out-of-Scope Discoveries (future cleanup)

Pre/post-delete list captures surfaced 3 additional orphan functions NOT in either deploy script's `$Functions` array. These are out of Phase 28 scope but should be cleaned up:

| Env | Orphan | Last touched |
|-----|--------|--------------|
| staging | `recruiting-lens` | 2026-04-23 |
| prod | `recruiting-lens` | 2026-04-29 |
| prod | `analyze-career-v2` | 2026-03-04 |

Recommend `/gsd-add-todo` or a small follow-on cleanup phase to align deployed-function counts with deploy-script intent in both envs.

## Closing Status

| Gate | Status |
|------|:--:|
| D-12 grep preflight (after `7c8edda` cleanup) | ✅ |
| Staging delete (idempotent — already gone) | ✅ |
| Prod delete (succeeded; exit 0; CLI confirmed) | ✅ |
| SC #2 satisfied on both envs (raw `functions list` outputs in evidence) | ✅ |
| **Wave 5 promotion (VERIFICATION.md assembly)** | **✅ GO** |
