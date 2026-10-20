---
status: partial
phase: 04-dead-code-refactor-cleanup
source: [04-VERIFICATION.md, 04-REVIEW.md]
started: 2026-06-14
updated: 2026-06-14
---

## Current Test

[awaiting human testing]

## Tests

### 1. /skills-gap-analysis renders after the Navbar D-11 fix
expected: Logged in as a Pro/Elite user, navigating to `/skills-gap-analysis` loads the page with NO runtime `ReferenceError` (the page previously referenced an unimported `Navbar`). The page renders inside the dashboard layout (AppSidebar) and shows NO stray marketing top-nav bar. The 3 stray `<Navbar/>` lines were removed in commit `b1ca32a` (acknowledged behavior change); there is no e2e coverage for this route.
result: [pending]

### 2. Upload paywall modal shows correct values (WR-01 acknowledged fix)
expected: When the out-of-merits / paywall modal is triggered from the button at `src/pages/Upload.tsx:330` (the affected handler), the modal renders the default `{feature:'Analysis', cost:0, balance:0}` values — NOT `undefined`. This was a latent display bug fixed by the `onClick={() => triggerPaywall()}` wrap in commit `cc55ee9` (recorded as an acknowledged behavior change in RESIDUAL-REGISTER.md). No e2e covers the modal's rendered values.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
