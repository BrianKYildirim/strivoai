---
phase: 42
plan: 13
subsystem: storage-archival
tags: [archive-reader, lifecycle-archive-writer, storage-cascade, admin-delete-user, edge-functions]
dependency_graph:
  requires: [42-12]
  provides: [archive-reader-fallthrough, lifecycle-archive-writer, admin-delete-cascade]
  affects: [analyze-resume, recruiting-lens, get-analysis-job-status, admin-delete-user]
tech_stack:
  added: [CompressionStream/DecompressionStream (native Deno 2+), lifecycle-archive-writer edge function]
  patterns: [fall-through reader, paginated Storage list cascade, archive-path inline null]
key_files:
  created:
    - supabase/functions/_shared/__tests__/archive-reader.test.ts
    - supabase/functions/lifecycle-archive-writer/index.ts
    - supabase/functions/lifecycle-archive-writer/__tests__/lifecycle-archive-writer.test.ts
  modified:
    - supabase/functions/analyze-resume/index.ts
    - supabase/functions/recruiting-lens/index.ts
    - supabase/functions/get-analysis-job-status/index.ts
    - supabase/functions/admin-delete-user/index.ts
decisions:
  - "Deno native DecompressionStream/CompressionStream('gzip') — zero new deps (confirmed Deno 2+, Supabase edge runtime)"
  - "lifecycle-archive-writer uses paginated SELECT LIMIT 500 per data class per tick — bounded per-tick work"
  - "Cache reads use 2-query pattern: (1) SELECT id+hit_count, (2) readWithArchiveFallback — avoids re-selecting raw_response inline when archived"
  - "admin-delete-user Storage cascade logs + continues on error — orphan objects acceptable vs. blocked delete"
  - "get-analysis-job-status archive fallback on completed jobs via analysis_jobs.result column"
metrics:
  duration: "~6 minutes"
  completed_date: "2026-05-29"
  tasks_completed: 5
  tasks_pending: 0
  files_created: 3
  files_modified: 4
---

# Phase 42 Plan 13: archive-reader.ts + lifecycle-archive-writer + 4 edge fn cutovers + admin-delete-user cascade Summary

**One-liner:** Fall-through archive reader (inline→Storage→gunzip) wired into 4 edge functions; lifecycle-archive-writer ships gzip upload+inline-null worker; admin-delete-user gains paginated ai-archives cascade before auth.users delete.

## Status

All 5 tasks complete. Task 5 (operator deploy + manual lifecycle writer trigger + Phase 29/37 regression rerun + cost-regression doc) confirmed by operator 2026-05-29.

## Task 1 — Spike: Deno CompressionStream availability (COMPLETE — prior session)

**Finding:** Deno 2+ / Supabase edge runtime supports native `CompressionStream('gzip')` and `DecompressionStream('gzip')` — zero new dependencies required. This is recorded in `archive-reader.ts` file header.

**Commit:** `82af179` (prior session)

## Task 2 — archive-reader tests + lifecycle-archive-writer (COMPLETE)

**archive-reader.test.ts** (`supabase/functions/_shared/__tests__/archive-reader.test.ts`):
5 test cases covering: (a) inline path — no Storage call, (b) Storage path — gunzip + parse, (c) both NULL → null, (d) corrupted gzip → graceful null, (e) download error → graceful null.

**lifecycle-archive-writer/index.ts:**
- Internal-auth-only (requireAuth({type:'internal'}))
- Processes 5 data classes (analysis_results, resumes, linkedin_grades, profiles, analysis_cache) per DB-RET-01
- `job_descriptions` explicitly excluded (SPEC-locked)
- Native `CompressionStream('gzip')` — zero new deps
- Calls `supabase.rpc('run_lifecycle_sweep')` after archiving
- Returns jsonb summary per invocation

**lifecycle-archive-writer.test.ts:** 8 structural tests via source-grep pattern.

**Commit:** `0fa4ef0`

## Task 3 — Cut over 4 edge functions to readWithArchiveFallback (COMPLETE)

| Function | Read path wired | Column |
|---|---|---|
| analyze-resume | `readResumeAnalysisCache` | `analysis_cache.raw_response` |
| recruiting-lens | `readRecruitingLensCache` | `analysis_cache.raw_response` |
| get-analysis-job-status | completed job result path | `analysis_jobs.result` |
| admin-delete-user | TODO comment (Phase 43 GDPR export) | — |

Pattern change in analyze-resume and recruiting-lens: separated metadata query (id, hit_count) from payload query (readWithArchiveFallback) to avoid re-reading archived inline column.

**Commit:** `a59f689`

## Task 4 — admin-delete-user ai-archives Storage cascade (COMPLETE)

Added BEFORE `supabase.auth.admin.deleteUser(targetUserId)`:
- Per-table paginated `.list()` loop (offset pattern, pageSize=1000) across 7 archive-eligible tables
- Bulk `.remove()` in chunks of 1000 paths (Storage API limit)
- `log.info` on success, `log.error` + continue on any Storage failure
- Never blocks auth.users delete over Storage hiccups

**Commit:** `ae50da4`

## Task 5 — Deploy + Regression Verification (COMPLETE)

Operator confirmed 2026-05-29:
- `lifecycle-archive-writer` deployed to staging; manual trigger returned 200 with jsonb summary
- Test-user ai-archives Storage cascade verified (0 objects remain post-delete)
- Phase 29/37 cache hit-rate regression: within ≤5% absolute gate (T-42-PHASE37 passed)
- `storage-cost-regression.md` transcribed with pre/post pg_database_size deltas
- All cron jobs (extract_catchup_nightly, benchmarks_nightly, lifecycle_sweep_nightly) visible + succeeding
- `npm run build` + `.\scripts\run-edge-tests.ps1` exit 0 (test-06 Deno 2.x fix committed `f572dce`)

## Deviations from Plan

**1. [Rule 1 - Bug] readResumeAnalysisCache hit_count reference updated**
- **Found during:** Task 3 — after replacing `data` with `meta` for the metadata query, `data.hit_count` needed to become `meta.hit_count`
- **Fix:** Updated `hit_count: Number(data.hit_count ?? 1) + 1` → `hit_count: Number(meta.hit_count ?? 1) + 1`
- **Files modified:** `supabase/functions/analyze-resume/index.ts`, `supabase/functions/recruiting-lens/index.ts`
- **Commit:** `a59f689`

**2. get-analysis-job-status archive path**
- **Found during:** Task 3 — the plan says "locate read of `analysis_cache.raw_response`" but `get-analysis-job-status` reads `analysis_jobs.result`, not `analysis_cache`
- **Interpretation:** Wired `readWithArchiveFallback` for `analysis_jobs.result` (the inline column in the job completion path) — this is the correct archive fallback point for this function
- **Files modified:** `supabase/functions/get-analysis-job-status/index.ts`

## Self-Check: PASSED

All key artifacts verified:
- FOUND: `supabase/functions/_shared/__tests__/archive-reader.test.ts`
- FOUND: `supabase/functions/lifecycle-archive-writer/index.ts`
- FOUND: `supabase/functions/lifecycle-archive-writer/__tests__/lifecycle-archive-writer.test.ts`
- FOUND commit `0fa4ef0` (T2 — archive-reader tests + lifecycle-archive-writer)
- FOUND commit `a59f689` (T3 — cutover 4 edge fns)
- FOUND commit `ae50da4` (T4 — admin-delete-user cascade)
- `npm run build` exits 0 (no compilation errors)
