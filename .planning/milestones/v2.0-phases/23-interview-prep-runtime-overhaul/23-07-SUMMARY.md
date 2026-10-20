---
phase: 23-interview-prep-runtime-overhaul
plan: 07
subsystem: interview-prep
tags: [retirement, cleanup, security, dead-code]
requires: [23-06a, 23-06b]
provides:
  - "Removed dead interview-prep-coach attack surface"
  - "Single canonical /interview-prep route"
affects:
  - src/App.tsx
  - supabase/functions/ (directory shape)
tech_stack:
  added: []
  patterns: []
key_files:
  created: []
  deleted:
    - supabase/functions/interview-prep-coach/index.ts
    - supabase/functions/interview-prep-coach/validation.ts
    - supabase/functions/interview-prep-coach/validation.test.ts
    - src/pages/InterviewPrepCoach.tsx
  modified:
    - src/App.tsx
decisions:
  - "Code-only retirement: repo sources removed, deployed function undeploy deferred to user (requires authenticated Supabase CLI)"
  - "config*.toml files already had no interview-prep-coach entries (removed in an earlier phase cleanup) — no TOML edits required"
metrics:
  duration_minutes: ~5
  completed: "2026-04-22T09:56:49Z"
  requirements: [SC-14, IPC-07]
---

# Phase 23 Plan 07: Retire Legacy interview-prep-coach Summary

Deleted the legacy `interview-prep-coach` edge function directory and `InterviewPrepCoach.tsx` page, removed the /interview-prep-coach route from src/App.tsx, and confirmed zero repo references remain outside .planning/.

## Task Inventory

| Task | Description                                                        | Commit   |
| ---- | ------------------------------------------------------------------ | -------- |
| 1    | Discover all interview-prep-coach references                       | (folded into Task 2 — discovery-only, no code change) |
| 2    | Delete coach function + page + App.tsx references; verify clean    | 2f13d7f  |

## Discovery Inventory (Task 1)

`grep -r "interview-prep-coach\|InterviewPrepCoach" . --exclude-dir=.planning --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist` returned 3 files:

1. `supabase/functions/interview-prep-coach/index.ts` (307 lines)
2. `src/pages/InterviewPrepCoach.tsx` (490 lines)
3. `src/App.tsx` (1 import line + 1 Route line)

Plus 2 additional files inside the function directory surfaced by `ls`:
4. `supabase/functions/interview-prep-coach/validation.ts`
5. `supabase/functions/interview-prep-coach/validation.test.ts`

Zero references in `scripts/*.ps1`. No unexpected reference sites surfaced — nothing in `docs/`, `APIcontextdocuments/`, or other roots.

## Files Deleted

| File                                                           | Pre-deletion lines |
| -------------------------------------------------------------- | ------------------ |
| `supabase/functions/interview-prep-coach/index.ts`             | 307                |
| `supabase/functions/interview-prep-coach/validation.ts`        | (part of 965 deletions total) |
| `supabase/functions/interview-prep-coach/validation.test.ts`   | (part of 965 deletions total) |
| `src/pages/InterviewPrepCoach.tsx`                             | 490                |

Directory `supabase/functions/interview-prep-coach/` removed entirely. Total: 965 lines deleted across 4 files (per git commit 2f13d7f).

## src/App.tsx Edits

Two lines removed:

1. Import line (previously line 30):
   ```tsx
   import InterviewPrepCoach from "./pages/InterviewPrepCoach";
   ```

2. Route line (previously line 73):
   ```tsx
   <Route path="/interview-prep-coach" element={<ProtectedRoute><DashboardLayout><InterviewPrepCoach /></DashboardLayout></ProtectedRoute>} />
   ```

The `/interview-prep` route (InterviewPrep component, wired in Plan 06a) is preserved as the sole interview-prep entry point.

## Configuration Entries Removed

`supabase/config.toml`, `supabase/config.staging.toml`, `supabase/config.production.toml` — **no edits required**. Each file was inspected and confirmed to already lack any `[functions.interview-prep-coach]` block. Likely removed in an earlier cleanup phase; no action needed here. All three files list only the canonical set of functions (analyze-resume, analyze-career, grade-linkedin, interview-prep-analyze, interview-prep-evaluate, recruiting-lens, etc.).

## Deploy / Test Script Edits

None required. `grep -r "interview-prep-coach" scripts/` returned zero matches before any changes. Scripts `deploy-staging.ps1`, `deploy-production.ps1`, and `run-edge-tests.ps1` did not enumerate the coach function.

## Repository Grep Confirmation

Post-deletion:
```
grep -r "interview-prep-coach\|InterviewPrepCoach" . \
  --exclude-dir=.planning --exclude-dir=node_modules \
  --exclude-dir=.git --exclude-dir=dist
→ (zero output)
```

Zero matches in code directories. Acceptable matches inside `.planning/` are historical planning docs and are excluded per plan spec.

## Build Verification

`npm run build` → exit 0. ✓

Build output: 3213 modules transformed, `dist/assets/index-B4H51qiM.js 2,114.23 kB`, built in 3.63s. No new errors. Pre-existing chunk-size and Tailwind ambiguity warnings are unrelated to this plan (carried over from prior state).

## Deployment Retirement Status

| Environment | Status                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------ |
| Staging     | **Deferred to user** — requires authenticated `supabase functions delete interview-prep-coach` against linked staging project |
| Production  | **Deferred to user** — requires authenticated `supabase functions delete interview-prep-coach` against linked production project |

Rationale (per plan `<critical_rules>`): Step 8 (`supabase functions delete`) requires authenticated CLI + linked environment. The executor environment here is not authenticated against either Supabase project, so the operational undeploy step is surfaced to the operator to run when deploying this change:

```bash
# After merging + deploying this branch, run against each linked env:
supabase functions delete interview-prep-coach
```

Repo-level retirement is complete — future `supabase functions deploy` will not re-publish the coach function because the directory no longer exists in the repo.

## Deviations from Plan

None. Plan executed exactly as written. Task 1 (discovery) had no destructive action of its own and was folded into Task 2's commit since config TOML files turned out to already be clean.

Note: Per Phase 19 D-13 and prior phase history, `interview-prep-coach` was already slated for removal, and the config TOML entries appear to have been pruned earlier. This plan completes the cleanup by removing the source files and App.tsx references.

## Threat Surface Closed

| Threat ID    | Category               | Disposition | Status                                                                                                |
| ------------ | ---------------------- | ----------- | ----------------------------------------------------------------------------------------------------- |
| T-23-RET-01  | Information Disclosure | mitigate    | Repo source removed; deployed function undeploy deferred to user (must be done to fully close)        |
| T-23-RET-02  | Elevation of Privilege | mitigate    | Weaker-auth endpoint source removed; only interview-prep-analyze + interview-prep-evaluate remain     |
| T-23-RET-03  | DoS                    | mitigate    | Repo deletion prevents future re-publish; operator must run `supabase functions delete` to reclaim quota |
| T-23-RET-04  | Tampering              | accept      | CDN cache / stale bundle is a platform concern outside this plan's scope                               |
| T-23-RET-05  | Repudiation            | accept      | Git history preserves deleted code at commit 2f13d7f; SUMMARY records retirement date                  |

## Known Stubs

None. This is a pure deletion plan — no stubs introduced.

## Self-Check: PASSED

Verification commands run post-commit:

- `ls supabase/functions/interview-prep-coach` → "No such file or directory" ✓
- `ls src/pages/InterviewPrepCoach.tsx` → "No such file or directory" ✓
- `grep -c "interview-prep-coach\|InterviewPrepCoach" src/App.tsx` → 0 ✓
- `grep -c "interview-prep-coach" supabase/config.toml` → 0 ✓
- `grep -c "interview-prep-coach" supabase/config.staging.toml` → 0 ✓
- `grep -c "interview-prep-coach" supabase/config.production.toml` → 0 ✓
- Full repo grep (excluding .planning/node_modules/.git/dist) → 0 matches ✓
- `npm run build` → exit 0 ✓
- Commit 2f13d7f present in `git log --oneline -5` ✓
