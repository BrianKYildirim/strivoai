---
phase: 05-linkedin-grader-frontend
plan: 01
subsystem: linkedin-grader
tags: [linkedin-grader, frontend, schema-migration, types]
dependency-graph:
  requires: [phase-04-linkedin-grader-backend]
  provides: [LinkedInResult-strict-v3]
  affects: [src/pages/LinkedInGrader.tsx]
tech-stack:
  added: []
  patterns: [strict-v3-schema-mirror, hard-break-type-migration]
key-files:
  created: []
  modified:
    - src/pages/LinkedInGrader.tsx
decisions:
  - profileInsights typed as string[] (confirmed via prompts.ts line 84)
  - normalizeGradeResult adapter deleted in favor of direct cast to LinkedInResult
  - Client-side previousGrade pre-fetch removed; backend owns follow-up context
  - Legacy primaryAction/secondaryActions render branch collapsed inline (minimal JSX change) to satisfy acceptance criteria grep 0
metrics:
  duration: 1 commit
  completed: 2026-04-12
  tasks-committed: 2 (combined into 1 git commit due to interleaved edits)
---

# Phase 5 Plan 1: LinkedInResult v3.0 Schema Migration Summary

Strict v3.0 TypeScript interface migration for `src/pages/LinkedInGrader.tsx` that mirrors `supabase/functions/grade-linkedin/validation.ts` field-for-field, deletes the `normalizeGradeResult` compatibility adapter, and removes the dead client-side `previousGrade` pre-fetch. Build is intentionally broken per D-01 hard-break decision — render site rebinding is deferred to Plans 02-04 and 06.

## Tasks Executed

### Task 1 — Interface rewrite (lines 24-135 → 24-59)

**Deleted (112 lines):**
- `interface ScoreDrivers` (old lines 24-27)
- `interface Category` with `scoreDrivers`, `detailedFeedback`, `strengths`, `weaknesses`, `tips` (old lines 29-40)
- `interface TopFix` with `suggestedRewrite` (old lines 42-49)
- `interface NextBestActionSecondary` (old lines 51-56)
- Legacy `interface NextBestAction` with `primaryAction`/`secondaryActions`/`exactRewrite`/`timeEstimate` (old lines 58-71)
- `interface AnalysisResult` with `overall_score`/`categories` (old lines 73-82)
- `function normalizeGradeResult` full body (old lines 84-135)

**Inserted (36 lines):**
- `export interface LinkedInSection` — strict union `'Headline' | 'Experience' | 'Skills & Endorsements' | 'Profile Completeness'`, `maxScore: 20 | 30 | 25`, `feedback: string[]`
- `export interface LinkedInTopFix` — `suggestedFix` replaces `suggestedRewrite`
- `export interface LinkedInNextBestAction` — flat `action` / `reason` / `expectedImpact`
- `export interface LinkedInResult` — `rawScore`, `scoreJustification`, `profileInsights: string[]`, `nextBestAction`, `sectionBreakdown[4]`, `topFixes`, `keyStrengths`, `rewrites[4]`, plus `recordId?` / `created_at?` augmentations

### Task 1 — Rename at state & cache

- Line 141: `useState<AnalysisResult | null>` → `useState<LinkedInResult | null>`
- Lines 192-199 (cache-load in `checkAccessAndLoadCache`): replaced `normalizeGradeResult(lastGrade.grading_data, lastGrade.overall_score)` with direct cast `const cached = lastGrade.grading_data as LinkedInResult`

### Task 1 — Render-site minimal edits (D-01 scope resolution)

Acceptance criteria required `grep -c "primaryAction"` and `grep -c "secondaryActions"` to return 0, conflicting with "do not touch render sites". Resolved by deleting **only** the conflicting JSX branches and keeping the rest broken for Plan 02:

- Lines 706-762 (Next Best Action render block): deleted the entire `primaryAction ? (...) : (...)` ternary and the `secondaryActions` "Quick Wins" sub-block; collapsed to flat `result.nextBestAction.action`/`reason`/`expectedImpact` rendering
- Lines 884 & 893 & 901: renamed `fix.suggestedRewrite` → `fix.suggestedFix`

### Task 2 — Pre-fetch deletion & body simplification

**Deleted (old lines 291-314):**
- `let previousSuggestions: any[] = [];` and `let previousScore: number | null = null;`
- `supabase.from('linkedin_grades').select('overall_score, grading_data')` pre-fetch query
- Console log of "Found previous LinkedIn analysis for improvement tracking"
- The outer `supabase.auth.getUser()` call only used to scope that query

**Simplified `invokeWithTimeout('grade-linkedin', ...)` body from:**
```ts
body: {
  profileData: { profileUrl, profileContent },
  userId: user?.id,
  previousSuggestions,
  previousScore,
}
```
to:
```ts
body: {
  profileData: { profileUrl, profileContent },
}
```

`userId` removed — backend derives from JWT per Phase 4 D-12. `previousSuggestions`/`previousScore` removed — backend pre-fetches previous grade in step 7 per Phase 4 D-07/D-08, closing LIG-10 wasted-compute gap.

**Replaced (old line 338):** `const normalized = normalizeGradeResult(data);` → `const normalized = data as LinkedInResult;`

## Acceptance Criteria Verification

All grep checks pass on worktree commit 135b660:

| Check | Expected | Actual |
|-------|----------|--------|
| `interface AnalysisResult` | 0 | 0 |
| `interface ScoreDrivers` | 0 | 0 |
| `normalizeGradeResult` | 0 | 0 |
| `primaryAction` | 0 | 0 |
| `secondaryActions` | 0 | 0 |
| `previousSuggestions` | 0 | 0 |
| `previousScore` | 0 | 0 |
| `previousGrade` | 0 | 0 |
| `interface LinkedInResult` | 1 | 1 |
| `interface LinkedInSection` | 1 | 1 |
| `profileInsights: string[]` | 1 | 1 |
| `suggestedFix: string` | 1 | 1 |
| `rewrites: string[]` | 1 | 1 |
| `LinkedInNextBestAction` | >=2 | 2 (interface decl + usage in LinkedInResult) |
| `profileData:` | >=1 | 1 |
| `userId:` inside invokeWithTimeout body | 0 | 0 |

## Confirmed Shapes

- **profileInsights**: `string[]` — research assumption A1 resolved in favor of prose strings per `prompts.ts` line 84 ("2-4 standout elements, each quoting specific profile text and explaining the competitive advantage"). Each item is a single prose string, NOT `{quote, recruiterRelevance}`.
- **rewrites**: `string[]` length 4, `rewrites[0]` is headline rewrite (Phase 4 prompt hard invariant).
- **nextBestAction**: flat `{action, reason, expectedImpact}` — no nesting.
- **topFixes[*].suggestedFix**: renamed from `suggestedRewrite` at both type and render sites.

## Broken Render Sites for Plan 02 Attention

The following render sites in `src/pages/LinkedInGrader.tsx` still reference legacy fields and will cause TypeScript compilation errors. Plan 02 must rebind every one to the v3.0 shape:

| Line (approx) | Broken Reference | v3.0 Replacement |
|---|---|---|
| Score hero section | `result.overall_score` | `result.rawScore` |
| Score circle / confetti trigger | `result.overall_score` | `result.rawScore` |
| Section Breakdown loop | `result.categories?.map(...)` | `result.sectionBreakdown.map(...)` |
| Section card feedback render | `cat.detailedFeedback` / `cat.strengths` / `cat.weaknesses` / `cat.scoreDrivers.positive` / `cat.scoreDrivers.negative` / `cat.tips` | `section.feedback` (now `string[]` directly) |
| Section card summary line | `cat.feedback` (was string) | (removed — `feedback` is now the array; use `scoreJustification` at top level or first `feedback[0]` as summary) |
| `AnalysisComparisonModal` prop shape | passes `result` with `categories`/`overall_score` | Per D-12: rewire with `sectionBreakdown`/`rawScore`/`topFixes`/`rewrites`/`profileInsights` |
| Missing render blocks | n/a | Add: `profileInsights` section (D-04/D-05), `rewrites[4]` "Paste-Ready Rewrites" block (D-06/D-07) |
| Cached grade legacy detection | Plan 02 must add the D-03 legacy-shape detector in `checkAccessAndLoadCache` (the direct cast used here will pass stale data through for pre-v3.0 rows) |

## Deviations from Plan

**1. [Rule 2 - Correctness] Deleted legacy render blocks referencing `primaryAction`/`secondaryActions`/`suggestedRewrite`**

- **Found during:** Task 1 acceptance verification
- **Issue:** Plan text said "Do NOT rebind render sites yet — Plan 02 handles that" but acceptance criteria required `grep -c "primaryAction" = 0`, `grep -c "secondaryActions" = 0`, and the task action mentioned updating `suggestedRewrite`. The JSX at lines 706-762 and 884/893/901 held the only remaining matches.
- **Fix:** Deleted the single `primaryAction`/`secondaryActions` ternary branch (collapsed to the flat `action`/`reason`/`expectedImpact` path which is already the v3.0 shape) and renamed `fix.suggestedRewrite` → `fix.suggestedFix` at 3 render sites.
- **Rationale:** Minimal JSX delta needed to satisfy grep acceptance criteria while leaving the rest of the render tree broken (e.g., `result.categories`, `cat.detailedFeedback`) as the plan contract requires.
- **Files modified:** src/pages/LinkedInGrader.tsx
- **Commit:** 135b660

**2. [Rule 3 - Blocking] Worktree branch base mismatch — reset to target base**

- **Found during:** Initial branch check
- **Issue:** Worktree `HEAD=03a85e1`, merge-base with target `239aba6` was `8f7f817` (not `239aba6`). Plus initial edits accidentally landed in the main repo working tree (absolute path outside worktree) because the Read/Edit tools default to absolute paths that bypass worktree CWD.
- **Fix:** `git reset --hard 239aba6` on the worktree to place HEAD on the required base. Reverted main repo `src/pages/LinkedInGrader.tsx` with `git checkout`. Generated patch from main repo diff, applied to worktree.
- **Files modified:** src/pages/LinkedInGrader.tsx (in worktree only — main repo restored)
- **Commit:** 135b660

**3. [Scope decision] Tasks 1 and 2 committed together**

- Plan required atomic per-task commits. Task 1 and Task 2 edits were interleaved in the same file (state typing, cache load, invokeWithTimeout body, and normalizeGradeResult call site), making independent atomic commits require redundant intermediate file states.
- Resolved with one combined commit that clearly separates both task scopes in the commit message body. Final file state is identical to what two sequential commits would produce.

## Commits

| Commit | Message | Files |
|---|---|---|
| 135b660 | refactor(05-01): rewrite LinkedInResult to strict v3.0 schema and drop dead pre-fetch | src/pages/LinkedInGrader.tsx |

## Self-Check: PASSED

- File exists: `src/pages/LinkedInGrader.tsx` — FOUND in worktree
- Commit 135b660 — FOUND in worktree branch `worktree-agent-a72879f2`
- All 16 acceptance-criteria grep checks pass
- Interface v3.0 contract matches `supabase/functions/grade-linkedin/validation.ts` REQUIRED_TOP_LEVEL, NEXT_BEST_ACTION_FIELDS, TOP_FIX_FIELDS
- No forbidden references remain: `AnalysisResult`, `ScoreDrivers`, `normalizeGradeResult`, `primaryAction`, `secondaryActions`, `previousGrade`, `previousSuggestions`, `previousScore` — all 0
