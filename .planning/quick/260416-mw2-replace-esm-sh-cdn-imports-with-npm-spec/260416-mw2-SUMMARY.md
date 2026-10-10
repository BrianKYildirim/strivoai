---
phase: quick
plan: 260416-mw2
subsystem: supabase-functions
tags: [imports, deno, npm-specifiers, cdn-removal]
dependency-graph:
  requires: []
  provides: [deterministic-deploys]
  affects: [supabase-functions]
tech-stack:
  added: []
  patterns: [npm-specifiers-over-cdn]
key-files:
  modified:
    - supabase/functions/_shared/supabase-client.ts
    - supabase/functions/_shared/stripe-client.ts
    - supabase/functions/_shared/merit-gateway.raw.test.ts
    - supabase/functions/_tests/merit_rls_test.ts
    - supabase/functions/notify-upgrade-request/index.ts
    - supabase/functions/test-email/index.ts
    - supabase/functions/create-stripe-portal/index.ts
    - supabase/functions/create-checkout-session/index.ts
    - supabase/functions/stripe-webhook/index.ts
    - supabase/functions/stripe-webhook-handler/index.ts
decisions: []
metrics:
  duration: 81s
  completed: "2026-04-16T23:32:42Z"
---

# Quick Task 260416-mw2: Replace esm.sh CDN imports with npm: specifiers Summary

Replaced all `https://esm.sh/...` CDN URL imports with Deno-native `npm:` specifiers across 10 Supabase Edge Function files, eliminating transient CDN 522 errors that block deployments.

## Changes Made

### Task 1: Replace all esm.sh imports with npm: specifiers

11 import specifier replacements across 10 files:

**@supabase/supabase-js@2 (5 files):**
- `_shared/supabase-client.ts`: static import
- `notify-upgrade-request/index.ts`: static import
- `test-email/index.ts`: static import
- `_tests/merit_rls_test.ts`: static import
- `_shared/merit-gateway.raw.test.ts`: dynamic import

**stripe@14 (5 files + 1 comment):**
- `_shared/stripe-client.ts`: static import + SDK pin comment
- `create-stripe-portal/index.ts`: type import
- `create-checkout-session/index.ts`: type import
- `stripe-webhook/index.ts`: static import
- `stripe-webhook-handler/index.ts`: static import

All `?target=denonext` query parameters stripped (not needed with `npm:` specifiers).

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | a533c03 | fix(260416-mw2): replace esm.sh CDN imports with npm: specifiers |

## Verification

- `grep -r "esm\.sh" supabase/functions/` returns zero results: PASS
- `npm run build` succeeds (frontend unaffected): PASS
- No file deletions, no untracked files

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

All 10 modified files exist. Commit a533c03 verified in git log.
