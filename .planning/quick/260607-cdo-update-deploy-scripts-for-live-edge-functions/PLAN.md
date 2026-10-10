---
status: complete
created: 2026-06-07
quick_id: 260607-cdo
slug: update-deploy-scripts-for-live-edge-functions
---

# Quick Plan: Update Deploy Scripts for Live Edge Functions

## Scope

Update `scripts/deploy-staging.ps1` and `scripts/deploy-production.ps1` so their default function lists include every deployable, non-dead Supabase Edge Function directory in `supabase/functions`.

## Tasks

1. Inventory deployable function directories by checking for `supabase/functions/*/index.ts`.
2. Compare deployable functions against both deploy scripts.
3. Add any missing live function names to both scripts.
4. Verify the scripts parse and the lists have zero missing/extra deployable functions.
