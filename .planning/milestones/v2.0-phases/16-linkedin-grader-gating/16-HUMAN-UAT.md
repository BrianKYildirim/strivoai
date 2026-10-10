---
status: partial
phase: 16-linkedin-grader-gating
source: [16-VERIFICATION.md]
started: 2026-04-17T15:45:00Z
updated: 2026-04-17T15:45:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Pro/Elite Free-Scan End-to-End
expected: With MERIT_SYSTEM_ENABLED=true, Pro user with free_linkedin_scan_used=false submits LinkedIn profile; receives full Pro output (profileInsights + feedback arrays); merit balance unchanged; free_linkedin_scan_used flips to true. Second request deducts 2 Merits.
result: [pending]

### 2. Free User Free-Tier Output Shape
expected: With MERIT_SYSTEM_ENABLED=true, Free user submits LinkedIn profile; receives rawScore, scoreJustification, keyStrengths, nextBestAction, exactly 1 topFixes entry; no profileInsights key; sectionBreakdown has name/score/maxScore/status but no feedback arrays.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
