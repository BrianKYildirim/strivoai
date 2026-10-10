---
slug: 20260705-cron-edge-fn-401-auth
type: quick
status: in-progress
created: 2026-07-05
---

# Fix persistent 401s on cron-invoked edge functions (keep-warm, extract-analysis-structure, reaper)

## Problem

`keep-warm` and `extract-analysis-structure` return 401 in **both** preview and
production, unchanged after aligning `INTERNAL_JOB_SECRET` across the Vault + the
Supabase secrets list and redeploying + waiting a day.

## Root cause (evidence-backed — see SUMMARY.md for the full trace)

The 401s are **application-level**, not the platform gateway. Both functions are
deployed `verify_jwt: false` (gateway open; confirmed via the Management API), and
the failing requests show multi-second `execution_time_ms` (the function boots and
runs before rejecting). They fail for **two unrelated reasons**, neither fixed by
aligning the edge secret:

1. **keep-warm** — code calls `requireAuth({ type: 'user' })`, demanding a Supabase
   **user JWT**. It never reads `INTERNAL_JOB_SECRET`. Its only caller, the
   `keep-warm-ping` pg_cron job, sends **no auth header at all** -> guaranteed 401
   (`missing-bearer`) on every ping.
2. **extract-analysis-structure** — code calls `requireAuth({ type: 'internal' })`.
   The post-analysis webhook path (analyze-resume/grade-linkedin) passes the **edge**
   `INTERNAL_JOB_SECRET` on both sides and works. The **pg_cron catchup** path sends
   the secret from **Vault** (`internal_job_secret`), which must equal the edge
   secret. The Vault entry exists but its value != the edge value -> `secret-mismatch`
   (401). Aligning the *edge* secret across envs can't fix a *Vault*-vs-edge mismatch.

Bonus (same family): **reap-stale-analysis-runs** also 401s — but at the **gateway**
(`verify_jwt: true`; never wired into `config.toml`/`deploy.ps1`). Its JWT-less cron
POST is rejected before the function runs. Currently inert, but a latent failure.

(`get-analysis-run-status` is `verify_jwt: true` too, but that is CORRECT — it is a
browser-facing owner-scoped endpoint that receives a real user JWT. Left untouched.)

## Plan

Repo changes (this task):
- **keep-warm** -> internal auth (`type: 'internal'`), mirroring extract-catchup/reaper.
- New migration re-schedules `keep-warm-ping` to send `x-internal-job-secret` from Vault.
- **config.toml** + **deploy.ps1** -> add `reap-stale-analysis-runs` so its gateway opens.
- Update `cors-audit.test.ts` (keep-warm reclassified user -> internal; count 21 -> 20).

Operator actions (NOT repo — see SUMMARY.md runbook):
- Make Vault `internal_job_secret` **byte-identical** to edge `INTERNAL_JOB_SECRET` on
  preview AND prod (fixes extract, and is the prerequisite for keep-warm + reaper).
- Apply the keep-warm cron migration per-env (preview host committed; swap to prod host).
- Redeploy via `scripts/deploy.ps1` (verify:baseline gate) — preview first, then prod.

## Verification

- `deno test _shared/cors-audit.test.ts` green (20 user fns).
- Post-deploy: cron `net.http_post` to each function returns 200 (not 401); check
  edge-function logs / `net._http_response`.
