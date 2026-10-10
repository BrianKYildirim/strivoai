---
status: testing
phase: 05-linkedin-grader-frontend
source:
  - 05-01-SUMMARY.md
  - 05-02-SUMMARY.md
  - 05-03-SUMMARY.md
  - 05-04-SUMMARY.md
  - 05-05-SUMMARY.md
  - 05-06-SUMMARY.md
started: 2026-04-13T19:21:47Z
updated: 2026-04-13T19:21:47Z
---

## Current Test

number: 1
name: Cold Start Smoke Test
expected: |
  Kill any running dev server. Start the app from scratch (`npm run dev`)
  and deploy/run the grade-linkedin edge function fresh. Navigate to
  /linkedin-grader as a signed-in Pro/Elite user. The page loads without
  console errors, entitlement helper text resolves (not stuck on "Checking
  eligibility…"), and a basic scan submit reaches the edge function.
awaiting: user response

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running dev server. Start the app from scratch (`npm run dev`) and deploy/run the grade-linkedin edge function fresh. Navigate to /linkedin-grader as a signed-in Pro/Elite user. The page loads without console errors, entitlement helper text resolves (not stuck on "Checking eligibility…"), and a basic scan submit reaches the edge function.
result: [pending]

### 2. Score Hero renders v3.0 rawScore
expected: After a successful scan, the score hero circle, large numeric, tier badge, and headline copy all reflect `rawScore` (0–100). The animated stroke dashoffset reaches the correct final value and the confetti triggers when the score earns it. No "undefined" or NaN anywhere in the hero.
result: [pending]

### 3. Section Breakdown grid
expected: Four section cards render — Headline, Experience, Skills & Endorsements, Profile Completeness — each with its score/maxScore, status icon, progress bar, and numbered feedback bullets (up to 4 per section). No empty cards, no legacy "detailedFeedback" or "scoreDrivers" text leaking through.
result: [pending]

### 4. "What's Working For You" block
expected: Between the score hero and Key Strengths, a "What's Working For You" block renders with subheading "Standout elements recruiters notice first". 2–4 cards appear in a responsive grid, each with a Sparkles icon, "From your profile:" label, and a blockquote containing the full prose insight. If profileInsights is empty, the whole block is hidden (no empty heading).
result: [pending]

### 5. "Paste-Ready Rewrites" block
expected: Between Section Breakdown and Top Fixes, a "Paste-Ready Rewrites" block renders with subheading "Drop these straight into your profile". Exactly 4 rewrite cards show; rewrite #1 is highlighted as "Top Priority" with a Star icon and primary background. Every card has a Copy button — clicking it copies the rewrite to clipboard and fires a "Copied to clipboard!" toast.
result: [pending]

### 6. Top Fixes — Ready-to-Paste Improvements
expected: The existing "Ready-to-Paste Improvements" block still renders below the Rewrites block. Each fix card shows the title, rationale, and "Suggested fix:" label (not "Suggested rewrite:"). The Copy button on each fix copies `fix.suggestedFix` and fires the toast.
result: [pending]

### 7. Entitlement helper text under Analyze button
expected: Below the Analyze button, a small helper line renders with `aria-live="polite"`. On mount it briefly shows "Checking eligibility…", then resolves to either "Free scan available this billing cycle" (emerald, bold) for a Pro/Elite user with 0 scans this cycle, or "This will use 1 AI credit" (muted) otherwise. The Analyze button is NOT disabled while loading.
result: [pending]

### 8. Free-scan bypass — first scan of the cycle
expected: As a Pro/Elite user with 0 `linkedin_grades` rows in the current billing cycle, submitting a scan succeeds WITHOUT decrementing AI credits. Edge-function logs show `linkedin-free-scan-bypass`. A second scan in the same cycle DOES consume a credit and the helper text flips from "Free scan available…" to "This will use 1 AI credit".
result: [pending]

### 9. Cached result hydration + legacy cache rejection
expected: Reloading /linkedin-grader after a recent v3.0 scan re-hydrates the full result view from cache (no re-scan). A user whose most recent cached row is a pre-v3.0 shape (missing `rawScore` / `sectionBreakdown`) sees the input form instead — the stale row is rejected silently, no crash, no weird half-render.
result: [pending]

### 10. Comparison Modal — LinkedIn v3.0 branch
expected: After a scan, opening "Compare to Previous" in the LinkedIn grader shows the modal with score delta driven by `rawScore`, criteria rows sourced from `sectionBreakdown` (name + score/maxScore %), key strengths from `keyStrengths`, and improvement items from `topFixes` titles. A previous legacy pre-v3.0 row does NOT appear in the dropdown.
result: [pending]

### 11. Resume Comparison Modal regression
expected: On `/results/:id` for a resume analysis, opening "Compare to Previous" still renders exactly as it did before Phase 5 — criteria, strengths, improvements, and score delta pulled from the resume `grading_data`. No LinkedIn fields leak in, no crashes, no visual regression.
result: [pending]

## Summary

total: 11
passed: 0
issues: 0
pending: 11
skipped: 0

## Gaps

[none yet]
