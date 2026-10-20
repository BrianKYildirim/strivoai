---
phase: 17-career-compass-gating
plan: 03
subsystem: frontend
tags: [tier-gating, career-compass, locked-section, locked-list-item, free-tier]
dependency_graph:
  requires: [14-tier-prompts-and-locked-section-primitive]
  provides: [career-compass-frontend-tier-gating]
  affects: [src/pages/CareerCompass.tsx]
tech_stack:
  added: []
  patterns: [tier-conditional-rendering, defensive-rendering, locked-section-pattern]
key_files:
  modified:
    - src/pages/CareerCompass.tsx
decisions:
  - Used named imports for LockedSection and LockedListItem (they use named exports, not default)
  - Applied tier gating to both single-role and multi-role readiness paths
  - Added LockedListItem in Fields tab for consistency with top-level career fields display
  - Wrapped skill gaps in roles tab with LockedSection instead of hiding entirely
metrics:
  duration: ~11min
  completed: 2026-04-17
---

# Phase 17 Plan 03: Career Compass Frontend Tier-Gating Summary

Add defensive tier-aware rendering to CareerCompass.tsx with LockedSection and LockedListItem placeholders for Free users where server-shaped output omits data.

## Changes Made

### Task 1: Add LockedSection and LockedListItem imports and Free-tier lock placeholders

**Commit:** pending (see note below)
**Files modified:** `src/pages/CareerCompass.tsx`

1. **Imports added** (line 50-51): `{ LockedSection }` from `@/components/LockedSection` and `{ LockedListItem }` from `@/components/LockedListItem`. Used named imports (Rule 1 auto-fix: components use named exports, not default exports as plan template suggested).

2. **Career Fields section** (~line 1102): After the existing `careerFields` map in the top-level display, added LockedListItem placeholders for positions 2-5 when `subscriptionTier === 'free'` and fewer than 5 fields are present.

3. **Surprise Fits section** (~line 1157): After the existing `surpriseFits` map, added LockedListItem placeholders for positions 2-4 when `subscriptionTier === 'free'` and fewer than 4 surprise fits are present.

4. **Readiness tab - Multi-Role** (~line 1379-1482): Wrapped strengths/gaps/skillAssessments detail rendering in `(subscriptionTier === 'pro' || subscriptionTier === 'elite')` guard. Added LockedSection with title "Skill Assessments" and teaser for Free users.

5. **Readiness tab - Single Role** (~line 1554-1654): Same treatment as multi-role: wrapped detail sections in tier check, added LockedSection for Free users. Scorebox (overallScore, targetRole, readinessVerdict) always renders regardless of tier.

6. **Roles tab - Skill Gaps** (~line 1835-1873): Wrapped existing `skillGaps` rendering in Pro/Elite tier check. Added LockedSection with title "Skill Gap Analysis" for Free users.

7. **Roadmap tab - Role-specific** (~line 1950): After role-specific roadmap steps map, added LockedListItem placeholders for phases 3-5 when `subscriptionTier === 'free'` and fewer than 5 steps present.

8. **Fields tab** (~line 1775-1789): Added LockedListItem placeholders for career fields 2-5 in the detailed Fields tab view, matching the top-level career fields pattern.

### Verification Results

- `npm run build:dev` (vite build --mode development): **PASSED** (built in 5.02s)
- ESLint: 18 pre-existing `@typescript-eslint/no-explicit-any` errors only, zero new errors from changes
- Import checks: Both `LockedSection` and `LockedListItem` imports present
- LockedSection count: 3 instances (multi-role Skill Assessments, single-role Skill Assessments, Skill Gap Analysis)
- LockedListItem count: 4 instances (career fields top, surprise fits, career fields tab, roadmap phases)
- Exact teaser text verified: "Pro unlocks detailed skill-by-skill breakdown with industry benchmarks."
- Exact teaser text verified: "Pro unlocks actionable skill gaps and qualification steps for each role."
- No LockedSection for compensationIntelligence or smartApplicationStrategy (elite-only tabs remain conditionally rendered)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed import style for LockedSection and LockedListItem**
- **Found during:** Task 1 Step 1
- **Issue:** Plan specified `import LockedSection from '@/components/LockedSection'` (default import) but both components use named exports (`export const LockedSection`)
- **Fix:** Used named imports: `import { LockedSection } from '@/components/LockedSection'`
- **Files modified:** src/pages/CareerCompass.tsx

**2. [Rule 2 - Missing functionality] Added LockedListItem to Fields tab**
- **Found during:** Task 1 Step 7 (defensive rendering review)
- **Issue:** Plan did not explicitly mention the Fields tab (`TabsContent value="fields"`) for LockedListItem, but UI-SPEC section "Free Tier Result Sections" specifies "Remaining field slots use `<LockedListItem>` as above"
- **Fix:** Added LockedListItem placeholders for career fields 2-5 inside the Fields tab
- **Files modified:** src/pages/CareerCompass.tsx

**3. [Rule 2 - Missing functionality] Added tier-gating to multi-role readiness path**
- **Found during:** Task 1 Step 4 review
- **Issue:** Plan mentions wrapping "the existing skillAssessments rendering" but there are two rendering paths: single-role and multi-role comparison. Both needed gating.
- **Fix:** Applied identical tier-gating pattern to multi-role readiness display (strengths, gaps, skillAssessments wrapped in Pro/Elite check, LockedSection for Free)
- **Files modified:** src/pages/CareerCompass.tsx

## Known Stubs

None. All LockedSection and LockedListItem components are fully wired with correct props, teasers, and tier requirements.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes introduced. All changes are client-side conditional rendering of existing Phase 14 components.

## Self-Check: PENDING

Note: Git commit operations were persistently blocked by the permission system during execution. The code changes are complete and verified (build passes, all acceptance criteria met), but commits could not be created. The worktree has unstaged modifications to `src/pages/CareerCompass.tsx` ready for commit.
