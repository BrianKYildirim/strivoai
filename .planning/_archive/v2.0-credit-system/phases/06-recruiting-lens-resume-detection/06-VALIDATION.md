---
phase: 06
slug: recruiting-lens-resume-detection
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-12
---

# Phase 06 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Strategy follows RESEARCH.md Option A: lint + build as automated gates, explicit manual smoke tests for the three data states. No frontend test framework exists in this repo, so introducing vitest for a ~20-line bug fix is disproportionate.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None for frontend (`src/**/*.tsx`). Deno tests exist for `supabase/functions/_shared/*` but do not cover this phase. |
| **Config file** | `eslint.config.js` (lint), `tsconfig.app.json` (build typecheck) |
| **Quick run command** | `npm run lint` |
| **Full suite command** | `npm run build && npm run lint` |
| **Estimated runtime** | ~20s lint, ~25s build |

---

## Sampling Rate

- **After every task commit:** Run `npm run lint`
- **After every plan wave:** Run `npm run build && npm run lint`
- **Before `/gsd-verify-work`:** Full suite green AND all three manual smoke states executed and documented below
- **Max feedback latency:** ~45s (build + lint)

---

## Per-Task Verification Map

> Task IDs populated after planner completes. Template row:

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | RCL-01 | — | RLS `auth.uid()=user_id` on both tables (already enforced) | lint+build | `npm run lint && npm run build` | ✅ | ⬜ pending |
| 06-01-02 | 01 | 2 | RCL-01 | Info Disclosure via stale `source_reference` | Defensive `.eq('user_id', user.id)` on filename lookup | manual smoke | See Manual-Only Verifications below | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] **No wave-0 tooling needed** — lint + build already wired via `package.json` scripts.
- [x] Manual smoke repro steps documented below (this file).

*Rationale: adding vitest + @testing-library/react for a single bug fix would create a precedent obligation across `src/pages/*` (currently zero files tested). Out of scope.*

---

## Manual-Only Verifications

All three states MUST be executed once against a real Supabase project (staging) before `/gsd-verify-work`. Record the result + any `[RecruitingLens]` console log output in a comment on the verification commit.

| # | Behavior | Requirement | Why Manual | Test Instructions |
|---|----------|-------------|------------|-------------------|
| 1 | **Primary path hit** — user with `resumes.grading_data IS NOT NULL` sees success card, filename, `Analyze Match` enabled | RCL-01 | No frontend test harness | 1. Log in as Pro/Elite (or use `useAdminTierTest` override). 2. Ensure you have completed a resume analysis via `/upload` → `/results` in the current account. 3. Navigate `/recruiting-lens`. 4. Verify: green success card, filename visible (truncated at 32 chars if long), `hasAnalyzedResume === true`, `Analyze Match` button enabled, NO `[RecruitingLens] Using analysis_results fallback path` log. |
| 2 | **Fallback path hit** — legacy MinimalHero user with only `analysis_results` row sees success card + fallback log | RCL-01 | Requires seeded DB state | 1. In staging Supabase SQL editor, for test user: confirm `SELECT grading_data FROM resumes WHERE user_id=…` returns all NULL, AND `SELECT raw_response FROM analysis_results WHERE user_id=… AND analysis_type='resume_analysis'` returns at least one row. 2. If no such user exists, seed by: (a) temporarily nulling `resumes.grading_data` for a test user, (b) inserting one `analysis_results` row with `analysis_type='resume_analysis'`, valid `raw_response`, `source_reference` = resume id. 3. Log in as that user, navigate `/recruiting-lens`. 4. Verify: success card renders, filename populates (via `source_reference` lookup), `[RecruitingLens] Using analysis_results fallback path` log appears in browser console. 5. Restore any nulled data after test. |
| 3 | **Empty state** — user with zero `resumes.grading_data` and zero `analysis_results` sees blocker card unchanged | RCL-01 | No frontend test harness | 1. Create a brand-new Pro test account (or delete analyses for an existing one). 2. Navigate `/recruiting-lens`. 3. Verify: blocker card `AlertCircle` + "No resume analysis found" + "Analyze My Resume" button; clicking the button routes to `/onboarding`; `Analyze Match` disabled. |
| 4 | **RLS isolation** (implicit, checked at DB layer) | RCL-01 | Enforced by Supabase RLS policies already audited in migrations | Verified during research: `supabase/migrations/20251129_create_all_tables.sql:105-128` (resumes) and `supabase/migrations/20251222223116_…sql:17-26` (analysis_results) both enforce `auth.uid() = user_id` on SELECT. No action needed per-phase; re-verify only if migrations change. |

---

## Automated Gates (always run)

| Gate | Command | What it catches |
|------|---------|-----------------|
| TypeScript strict | `npm run build` | Shape mismatches on `grading_data` / `raw_response`, missing nullability guards |
| ESLint | `npm run lint` | Unused vars, hook deps, style violations |

---

## Validation Sign-Off

- [ ] Plan tasks include `<automated>` lint+build verification in acceptance criteria where touching `.tsx` files
- [ ] All three manual smoke states (primary / fallback / empty) executed in staging before `/gsd-verify-work`
- [ ] Console log verified: `[RecruitingLens] Using analysis_results fallback path` fires on state #2 and does NOT fire on state #1
- [ ] `npm run build` passes (TypeScript clean)
- [ ] `npm run lint` passes
- [ ] No watch-mode flags in any commands
- [ ] `nyquist_compliant: true` confirmed after execution

**Approval:** pending
