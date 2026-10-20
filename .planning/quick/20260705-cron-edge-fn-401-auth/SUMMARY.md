---
slug: 20260705-cron-edge-fn-401-auth
type: quick
status: complete
created: 2026-07-05
completed: 2026-07-05
---

# SUMMARY — Fix persistent 401s on cron-invoked edge functions

## OUTCOME — RESOLVED ✅ (operator-verified 2026-07-05)

After the operator ran the runbook (Vault↔edge secret realignment + keep-warm cron
migration + redeploy), **all three functions return 200 across all environments**.
keep-warm, extract-analysis-structure, and reap-stale-analysis-runs are healthy;
the 401s are gone.

## What the 401s actually were

`INTERNAL_JOB_SECRET` alignment was never going to fix this. Evidence gathered live
(preview `cimjltzovkahkqecpwgi` + prod `zjpjapgraoxdukdvpjes`):

| Function | Deployed `verify_jwt` | Where the 401 comes from | Root cause |
|----------|----------------------|--------------------------|------------|
| `keep-warm` | **false** (gateway open) | function code | `requireAuth({type:'user'})` — demands a user JWT; the `keep-warm-ping` cron sends **no auth header**. Never reads `INTERNAL_JOB_SECRET`. |
| `extract-analysis-structure` | **false** (gateway open) | function code | `requireAuth({type:'internal'})` — the pg_cron catchup path sends the secret from **Vault** `internal_job_secret`, which != the **edge** `INTERNAL_JOB_SECRET`. (The post-analysis webhook path uses the edge secret on both sides and works.) |
| `reap-stale-analysis-runs` | **true** (gateway blocks) | platform gateway | never added to `config.toml`/`deploy.ps1`, so it kept the default `verify_jwt=true`; the JWT-less cron POST is rejected before the function runs. |

Confirming facts:
- Deployed `verify_jwt` read from the Supabase Management API (`list_edge_functions`).
- The 401 request logs show multi-second `execution_time_ms` for keep-warm/extract —
  the function boots and runs before returning 401 (not an instant gateway reject).
- Vault `internal_job_secret` **exists** in both projects (preview since 2026-05-26,
  prod since 2026-07-02) — so extract's failure is a value mismatch, not a missing/
  misnamed secret.
- Live crons already point at their own hosts (the old preview-host drift is resolved):
  preview keep-warm-ping/extract_catchup -> preview host; prod -> prod host.

## Repo changes (committed)

1. `supabase/functions/keep-warm/index.ts` — `type: 'user'` -> `type: 'internal'`
   (withCors + handleOptionsRequest + requireAuth + corsHeaders), plus a rationale
   comment. keep-warm is a scheduler-only endpoint; CORS drops to `{}` (no browser).
2. `supabase/migrations/20260705000001_keep_warm_internal_auth_cron.sql` — NEW.
   Idempotently re-schedules `keep-warm-ping` to send `x-internal-job-secret` from
   Vault (mirrors 20260525000003 / 20260702000003). Preview host committed; operator
   swaps to prod host. **Apply per-env via SQL editor, not `db push`.**
3. `supabase/config.toml` — added `[functions.reap-stale-analysis-runs] verify_jwt=false`.
4. `scripts/deploy.ps1` — added `reap-stale-analysis-runs` to the deploy list (it was
   never deployed by the canonical script).
5. `supabase/functions/_shared/cors-audit.test.ts` — keep-warm reclassified user ->
   internal: removed from the user set, count 21 -> 20. Suite green (61 tests pass).

## OPERATOR RUNBOOK (required — these are NOT in the repo)

Do these in order, **preview first, then prod**. Claude is read-only on prod and does
not handle raw secret values.

### Step 1 — Make Vault `internal_job_secret` == edge `INTERNAL_JOB_SECRET` (fixes extract + enables keep-warm + reaper)

Pick ONE canonical secret value per environment. Then set BOTH stores to that exact
value (no trailing newline/space, no wrapping quotes):

- **Edge secret** (what the functions read via `Deno.env`):
  `supabase secrets set INTERNAL_JOB_SECRET=<value>` (against the correct project ref).
- **Vault secret** (what the crons read), update in place so the name stays `internal_job_secret`:
  ```sql
  SELECT vault.update_secret(
    (SELECT id FROM vault.secrets WHERE name = 'internal_job_secret'),
    '<value>',                 -- byte-identical to the edge value above
    'internal_job_secret'
  );
  ```
  (If no row exists yet on an env: `SELECT vault.create_secret('<value>', 'internal_job_secret');`)

> The single most common cause here is a stale Vault value: the edge secret was rotated
> but the Vault entry was not (preview's Vault `internal_job_secret` has not been updated
> since 2026-05-26). Re-set both from one source of truth.

### Step 2 — Apply the keep-warm cron migration (adds the auth header)

Run `supabase/migrations/20260705000001_keep_warm_internal_auth_cron.sql` in the SQL
editor of EACH environment. On **prod**, swap the URL host to
`https://zjpjapgraoxdukdvpjes.supabase.co/...` before running (per the migration's
HOST caveat). It is idempotent (unschedules any prior `keep-warm-ping` first).

### Step 3 — Redeploy the functions

`./scripts/deploy.ps1 -Env staging` then, after preview verification, `-Env production`.
This redeploys keep-warm (now internal auth) and reap-stale-analysis-runs (now
`--no-verify-jwt` -> gateway opens). The `verify:baseline` gate runs first.

### Step 4 — Verify (per env)

Manually fire each cron body and confirm 200, or wait one tick and read the logs:
```sql
-- keep-warm (expect 200)
SELECT net.http_post(
  url := 'https://<PROJECT>.supabase.co/functions/v1/keep-warm',
  headers := jsonb_build_object('Content-Type','application/json',
    'x-internal-job-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_job_secret' LIMIT 1)),
  body := '{}'::jsonb);
-- then inspect the response:
SELECT id, status_code, content FROM net._http_response ORDER BY created DESC LIMIT 5;
```
Repeat for `extract-analysis-structure` (body `{"invocation_source":"pg_cron_catchup"}`)
and `reap-stale-analysis-runs` (body `{"invocation_source":"pg_cron_reaper"}`). Edge
logs should flip from `401` to `200`.

## Follow-ups / notes (out of scope, flagged)

- `get-analysis-run-status` and `process-recruiting-lens-job` are also absent from
  `deploy.ps1`'s function list — they are deployed out-of-band. `get-analysis-run-status`
  is `verify_jwt=true` **intentionally** (browser-facing, receives a user JWT); leave it.
  Consider adding both to the canonical deploy list in a later cleanup.
- STATE.md line ~187 still records the old "prod cron host drift OWED" item; live state
  shows both prod crons now target the prod host, so that item is effectively resolved.
