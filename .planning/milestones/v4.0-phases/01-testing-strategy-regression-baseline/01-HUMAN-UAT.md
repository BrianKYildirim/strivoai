---
status: partial
phase: 01-testing-strategy-regression-baseline
source: [01-VERIFICATION.md]
started: 2026-06-10
updated: 2026-06-10
---

## Current Test

[awaiting human action — operator activation of the regression gate]

## Tests

### 1. Push v4.0-baseline tag (and staging commits) to origin
expected: `git ls-remote --tags origin` includes `v4.0-baseline`; the phase-01 commits (through `fa4ccb6` + the doc commits) are on origin/staging
command: `git push origin staging && git push origin v4.0-baseline`
result: [pending]

### 2. Regression Gate runs GREEN on CI
expected: open a throwaway PR (or `workflow_dispatch`) → the `Regression Gate` / `gate` job completes green end-to-end (vitest 468/0, deno 284/0, Playwright 3 flows + reconcile); the run logs show the preview build resolved the TEST-project `VITE_SUPABASE_URL`, not production
result: [pending]

### 3. Mark "Regression Gate" a Required status check on main + staging (D-06 teeth)
expected: GitHub → Settings → Branches → branch protection for `main` and `staging` requires the `Regression Gate` check before merge — only enabled after test 2 is green (a Required-but-red check blocks every PR)
result: [pending]

### 4. (Recommended) Reset test-profile Stripe ids in e2e/global-setup.ts
expected: `e2e/global-setup.ts` clears `stripe_customer_id`/`stripe_subscription_id` on the seeded TEST profile before each run, so a stale customer can never re-break Flow 3 for the phases (2–9) that re-run this baseline
result: ✅ DONE — global-setup step 2 upsert now nulls both Stripe ids each run; verify:baseline re-run green with the reset active (Flow 3 lazily re-creates a fresh customer). Commit pending below.

## Summary

total: 4
passed: 1
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
