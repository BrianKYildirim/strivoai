---
phase: 47-interview-prep-prod-gate-elite-differentiation
plan: "01"
subsystem: frontend-ui-primitives
tags:
  - phase-47
  - interview-prep
  - production-gate
  - coming-soon
  - design-tokens
  - tdd
requirements:
  - IPC-PROD-PRIMITIVES
dependency_graph:
  requires:
    - "src/lib/utils.ts (cn helper)"
    - "src/components/ui/card.tsx (Card, CardContent)"
    - "src/components/ui/button.tsx (Button, asChild slot)"
    - "react-router-dom (Link)"
    - "lucide-react (GraduationCap icon)"
  provides:
    - "ComingSoonBadge — inline 'Coming Soon' tag for nav, dashboard tile, pricing bullet surfaces"
    - "ComingSoon — full-page /interview-prep route fallback (default export)"
  affects: []
tech_stack:
  added: []
  patterns:
    - "Semantic design tokens (text-foreground, text-muted-foreground, bg-background, bg-muted, border-border) — no literal palette colors"
    - "Flag-agnostic display primitives — consumers decide when to render (D-03)"
    - "React Testing Library + vitest + jsdom (consistent with existing src/**/*.test.tsx convention)"
key_files:
  created:
    - "src/components/ComingSoonBadge.tsx"
    - "src/components/__tests__/ComingSoonBadge.test.tsx"
    - "src/pages/ComingSoon.tsx"
    - "src/pages/__tests__/ComingSoon.test.tsx"
  modified: []
decisions:
  - "Split badge vs page into two primitives — keeps badge tiny (~15 LOC) and page rich (Card, CTA, icon)"
  - "Use shadcn primitives (Card, Button) as building blocks instead of reinventing pixels"
  - "Page omits re-enable timing copy (no 'Q3 2026', 'next month') so operator can flip the flag without copy churn (D-15)"
  - "Badge carries its own aria-label so screen readers don't lose context when used WITHOUT a tooltip (D-01 wraps it in a tooltip on nav but Wave 2 owns wrapping)"
metrics:
  duration_minutes: 7
  completed_date: "2026-05-11"
  tasks_completed: 2
  files_created: 4
  files_modified: 0
  tests_added: 9
---

# Phase 47 Plan 01: Coming Soon Primitives Summary

Built the two flag-agnostic visual primitives — `<ComingSoonBadge />` (inline tag) and `<ComingSoon />` (full-page fallback) — that every Wave 2 Interview Prep surface gate will consume.

## One-liner

Two reusable React primitives + 9 vitest DOM assertions, all built on shadcn building blocks with semantic design tokens, intentionally with no `feature-flags.ts` dependency so consumers (nav, sidebar, dashboard tile, pricing bullet, route fallback) decide WHEN to render.

## Completed Tasks

| Task | Name                                        | Commit    | Files                                                                                          |
| ---- | ------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------- |
| 1    | Build `<ComingSoonBadge />` inline primitive | `e830c94` | `src/components/ComingSoonBadge.tsx`, `src/components/__tests__/ComingSoonBadge.test.tsx`     |
| 2    | Build `<ComingSoon />` full-page fallback   | `103c470` | `src/pages/ComingSoon.tsx`, `src/pages/__tests__/ComingSoon.test.tsx` (+ JSDoc fix on Task 1) |

## Verification Results

| Gate                                                                                                  | Result                                       |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `npx vitest run src/components/__tests__/ComingSoonBadge.test.tsx src/pages/__tests__/ComingSoon.test.tsx` | 9/9 tests pass                              |
| `npx tsc --noEmit`                                                                                    | clean (no errors)                            |
| `npx eslint <4 new files>`                                                                            | clean (no warnings)                          |
| Grep `isInterviewPrepEnabled` against the four new files                                              | 0 matches (primitives are flag-agnostic)    |

## Key Files

### Created

* `src/components/ComingSoonBadge.tsx` (33 lines) — `<span>` with `aria-label="Interview Prep is coming soon"`, `size?: 'sm' \| 'md'`, optional `className` merged via `cn()`. Uses `text-muted-foreground` + `bg-muted` + `border-border` semantic tokens. Default export name: `ComingSoonBadge`.
* `src/components/__tests__/ComingSoonBadge.test.tsx` — 5 assertions: label text, aria-label, semantic tokens, className passthrough, size variant differentiation.
* `src/pages/ComingSoon.tsx` (39 lines) — Default export `ComingSoon`. Centered Card with GraduationCap icon (lucide-react), h1 "Interview Prep is coming soon", neutral 2-sentence body, `<Button variant="outline" asChild>` wrapping `<Link to="/dashboard">Back to dashboard</Link>`.
* `src/pages/__tests__/ComingSoon.test.tsx` — 4 assertions: h1 matches `/interview prep.*coming soon/i`, link target `/dashboard`, semantic-token presence, absence of specific timing copy.

### Modified

None (clean greenfield plan).

## Decisions Made

1. **Split into two primitives** — `<ComingSoonBadge />` for inline use, `<ComingSoon />` for the page. Reasoning: keeps badge tiny so it can drop into Tailwind flex rows; keeps page rich without forcing every consumer to instantiate icons + cards.
2. **Page uses lucide-react `GraduationCap`** — matches the educational/coaching aesthetic of Interview Prep. Not inventing a new icon (per CONTEXT lines 74).
3. **No re-enable date in copy** — operator can flip `VITE_FEATURE_INTERVIEW_PREP=true` in Vercel Production scope without coordinating a copy change (D-15).
4. **Badge owns its own aria-label** — when Wave 2 wraps the badge in a tooltip (D-01 nav case), the tooltip provides hover context; the aria-label provides screen-reader context for cases where the badge appears WITHOUT a tooltip (dashboard tile corner, pricing bullet). Belt-and-braces a11y.
5. **No `feature-flags.ts` dependency** — primitives are flag-agnostic by design (D-03). Plan 47-02 introduces the helper; plans 47-03..47-05 wire the surfaces; this plan only produces the visual primitives.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Verification gate compliance] Stripped `isInterviewPrepEnabled` identifier from ComingSoonBadge JSDoc**

- **Found during:** Task 2 verification (running plan's grep gate after Task 1 commit)
- **Issue:** The original JSDoc on `ComingSoonBadge.tsx` referenced `isInterviewPrepEnabled()` by name in prose. The plan's `<verification>` section says "Grep `isInterviewPrepEnabled` against the four new files returns zero matches (primitives are flag-agnostic)." That gate is satisfied behaviorally (no import, no runtime use) but failed literally (the identifier was in the comment).
- **Fix:** Replaced the literal identifier in the JSDoc with descriptive prose ("the Interview Prep feature flag"). No behavior change; semantic-tokens, props, and test surface untouched.
- **Files modified:** `src/components/ComingSoonBadge.tsx`
- **Commit:** Folded into Task 2 commit `103c470` (the fix was discovered during Task 2 verification, so amending Task 1 would have rewritten history mid-plan).

## Authentication Gates

None — pure frontend primitive work, no auth surface touched.

## Out of Scope (Confirmed Honored)

- No actual conditional rendering — Wave 2's job.
- `<LockedSection>`, `<ProFeatureBlur>`, `<ProFeatureGate>`, `<BlurredLockCard>` untouched (paywall primitives, not feature-deferral primitives).
- No global navbar / sidebar / dashboard tile / pricing surface mutations — Wave 2 plans (47-03 / 47-04 / 47-05).
- No telemetry on Coming Soon views.

## Rollback

Trivial: `git revert 103c470 e830c94` removes both commits. No downstream consumer exists until Wave 2 lands.

## Self-Check: PASSED

- FOUND: `src/components/ComingSoonBadge.tsx`
- FOUND: `src/components/__tests__/ComingSoonBadge.test.tsx`
- FOUND: `src/pages/ComingSoon.tsx`
- FOUND: `src/pages/__tests__/ComingSoon.test.tsx`
- FOUND: commit `e830c94` (Task 1 — ComingSoonBadge)
- FOUND: commit `103c470` (Task 2 — ComingSoon + JSDoc fix)
- Verified: `npx vitest run` 9/9 pass after final state
- Verified: `npx tsc --noEmit` clean after final state
- Verified: `npx eslint <new files>` clean after final state
- Verified: `isInterviewPrepEnabled` grep returns 0 matches across the four new files (final state)
