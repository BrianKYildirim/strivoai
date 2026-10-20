---
id: 260716-qtt
slug: fix-extract-catchup-fk-violation-loop-cl
date: 2026-07-17
status: complete
commit: 9741f5f3
preview_applied: true
production_applied: true
---

# Summary: Stop the extract-catchup FK violation loop

## Outcome

Fixed the ~770 failed-inserts/day loop on prod, plus a latent head-of-line defect that had
silently killed the catchup safety net for the newest rows. Applied and verified on
PREVIEW. **Not applied to production** — awaiting operator.

## Root cause (two distinct bugs, both confirmed against prod)

`extract_catchup_nightly` (cron job 6, actually `*/15`) → `extract-analysis-structure` →
`runCatchup` retried the same 8 rows forever:

- **6 rows** — user deleted. `analysis_results` was the ONLY user-owned table with no FK to
  `auth.users` (it had no FK constraints at all); every sibling cascades. Rows outlived
  their user, so version backfill violated `*_user_id_fkey`.
- **2 rows** — user alive, resume deleted (`user_exists: true, resume_exists: false`).
  `source_reference` is untyped text with no FK, so a user cascade cannot cover this.

6 + 2 = the batch of 8 observed every 15 minutes in the postgres logs.

`admin-delete-user` was NOT the culprit (it deletes `analysis_results` explicitly). The
originating deletion path cannot be identified retroactively — `profiles` cascades, so it
leaves no trace. The FK fixes it structurally regardless of origin.

**Retention angle:** `run_lifecycle_sweep` only sets `archive_path` when a version row
EXISTS, and only deletes rows with `archive_path IS NOT NULL AND raw_response IS NULL`. An
orphan can never have a version row, so it was never archived and never deleted — deleted
users' raw AI blobs lived on prod forever, outside the retention policy. The purge is a
retention/privacy fix, not just log hygiene.

**Second defect (more serious):** `runCatchup` scanned the oldest 50 rows by `created_at`
with no "not yet extracted" filter. Already-extracted rows were fetched then skipped in
app code, permanently occupying the window. With 84 eligible rows on prod, ranks 51-84 were
invisible to catchup forever. No user impact yet (0 legitimate rows starved at planning
time), but any future extraction failure past rank 50 would never be repaired.

## Changes (commit 9741f5f3, 8 files)

| File | Change |
|---|---|
| `20260717010000_analysis_results_user_fk_cascade.sql` (+rollback) | Purge orphans, then `analysis_results_user_id_fkey → auth.users ON DELETE CASCADE` |
| `20260717010001_get_pending_extractions.sql` (+rollback) | `SECURITY DEFINER` RPC returning only un-extracted rows; `service_role` EXECUTE only; `p_limit` clamped to [1,200] |
| `extract-analysis-structure/index.ts` | `runCatchup` now calls `.rpc('get_pending_extractions', { p_limit: 50 })` |
| `extract-analysis-structure/extract-resume.ts` | Verify resume still exists; skip with `reason: 'resume_deleted'` instead of throwing |
| `__tests__/extract-resume.test.ts` | New `resume_deleted` regression test |
| `deno.json` | Wire the three extract-analysis-structure test files into `test:ci` — they existed but were absent from the explicit file list, so they never gated (1345 → 1356) |

## Preview verification (applied + verified 2026-07-17)

Preview independently reproduced the bug: 238 rows, **40 orphans**, no FK — created by
`e2e/onboarding-flow.spec.ts:72`, which deletes the auth user and nothing else. This
confirms the orphaning mechanism directly.

All 11 checks passed after applying both migrations:

| Check | Expected | Actual |
|---|---|---|
| orphans remaining | 0 | **0** |
| rows deleted | 40 | **40** |
| FK `confdeltype` | `c` (cascade) | **c** |
| RPC `service_role` EXECUTE | true | **true** |
| RPC `authenticated` EXECUTE | false | **false** |
| RPC `anon` EXECUTE | false | **false** |
| RPC returns already-extracted rows? | 0 | **0** |
| RPC returns `recruiting_lens`? | 0 | **0** |
| `p_limit` clamp (asked 9999) | ≤ 200 | **2** |
| old scan window (oldest 50, unfiltered) | 50 incl. done | **50** |
| RPC pending window | only real work | **2** |

The last two are the head-of-line fix: the old scan burned all 50 slots on mostly-done
rows; the RPC returns the 2 rows that actually need work.

**Cascade proven end-to-end** in a rolled-back transaction — the exact operation that used
to orphan rows (delete the auth user only):

| Step | Result |
|---|---|
| rows before user delete | 1 |
| rows after user delete (cascade) | **0** |
| orphans created | **0** |

No residue left on preview (probe user and row both 0; total 198 = 238 − 40).

## Gates

| Gate | Result |
|---|---|
| `npm run lint` | PASS — 0 errors, 159 warnings (pre-existing) |
| `npm run type-check` | PASS |
| `npm run test` | PASS — 659 tests / 98 files |
| `npm run test:edge` | PASS — 1356 passed, 0 failed, 12 ignored (was 1345) |
| `npm run build` | PASS |

## Production — APPLIED AND VERIFIED (operator, 2026-07-17)

Operator ran `supabase db push` + deployed the edge function. All three migrations landed
(`20260717000000` admin exemption, `20260717010000` FK cascade, `20260717010001` RPC).

Post-apply state on prod (`zjpjapgraoxdukdvpjes`):

| Check | Expected | Actual |
|---|---|---|
| orphans remaining | 0 | **0** |
| `analysis_results` total | 81 (111 − 30) | **82** (81 + 1 new live-user analysis) |
| live users' rows | untouched | **82** |
| FK `confdeltype` | `c` (cascade) | **c** |
| RPC exists | true | **true** |
| RPC `service_role` EXECUTE | true | **true** |
| RPC `authenticated` / `anon` EXECUTE | false | **false / false** |
| admin exemption guard intact | true | **true** |

**The loop is dead — proven by the log timeline, not by inference:**

| Time | Event | Result |
|---|---|---|
| `…266209` | cron run, extract fn **v100** | 13 FK errors, 8958ms |
| `…266478` | migrations applied | FK + RPC created |
| `…267104` | cron run, extract fn **v102** | **200, ZERO FK errors**, 3933ms |

Runtime also more than halved (8958ms → 3933ms) — the RPC returns only genuinely pending
rows instead of 50 mostly-finished ones.

The two `resume_deleted` rows (`ce3da6a7…`, `4e35ac10…`) remain present and unextracted,
as designed: they are permanently unextractable (resume gone) and are now SKIPPED rather
than retried forever.

A `permission denied for function get_pending_extractions` appears in the postgres log at
`…267121` — that is the read-only MCP role running a verification query, NOT the edge
function (which uses `service_role` and succeeded). It is the lockdown working as intended.

## Follow-ups

- `e2e/onboarding-flow.spec.ts:72` deletes only the auth user, orphaning preview rows.
  Task 1's FK fixes this structurally; no test change strictly needed.
- `test:ci` runs with `--no-check`; type-checking `extract-resume.ts` directly surfaces 10
  pre-existing `QueryBuilderLike` type errors. Untouched — but these files are unprotected
  by Deno type checking.
- 14 non-orphan `analysis_results` rows disappeared mid-investigation (125 → 111), almost
  certainly the 90d `run_lifecycle_sweep` terminal delete. Unrelated; noted only.
