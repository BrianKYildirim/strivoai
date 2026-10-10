---
phase: 03-cross-device-reliability-and-compatibility
plan: 16-follow-up
subsystem: waiting-surface-ownership
tags: [xd-25, overlay, routing, lifecycle-flag]
completed: 2026-07-30
---

# Phase 03 Plan 16 Follow-up: XD-25 Waiting-Surface Ownership

XD-25 was caused by route-local ownership: Upload mounted `UniversalAnalyzing`, then
Results mounted a second instance after navigation for the same attempt. The request
guard remained correct, but the presentation lifecycle flickered.

`AnalysisWaitingHost` now lives above the routes and owns one attempt record. Upload
starts it and Results adopts it, so Upload → Results keeps one continuous overlay.
Terminal completion, recovery and cleanup retire the same record. Results forwards
lifecycle state only when the existing lifecycle feature flag is enabled; with the
default-off flag, the host renders one honest observed stream stage or the single
indeterminate fallback, never the eight-stage checklist.

No prompt, model, payload, response schema, scoring, output, Merit price/refund,
tier rule, Supabase function, migration or database behavior changed.

Validation: focused host/recovery tests passed; OT-8 passed on all five projects;
one-click/XD-25 passed on all five projects with one request, one overlay mount and
zero duplicate toasts; stale-bundle passed 21/21; the complete Playwright gate passed
297 with 36 intentional skips; Vitest passed 1,159/1,159; type-check, ESLint (0
errors), production build and `git diff --check` passed.
