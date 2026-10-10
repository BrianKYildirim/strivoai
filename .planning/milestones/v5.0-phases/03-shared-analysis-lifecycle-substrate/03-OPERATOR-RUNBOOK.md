# Phase 3 — Operator DB Runbook

## ✅ PART A — PREVIEW: COMPLETE (done by Claude)

Applied to preview `cimjltzovkahkqecpwgi`:
- Repaired migration history (marked the `20260608*` twins applied — preview already had
  the equivalent `20260625*` set).
- `supabase db push` applied: `20260702000001` (ledger), `000002` (realtime),
  `000003` (reaper cron, preview host), `000004` (RPC grant lockdown corrective).
- Reaper edge function `reap-stale-analysis-runs` deployed (by operator).
- **Verified read-only:** state column + partial-UNIQUE index + both CAS RPCs present;
  RPC ACL = `{postgres, service_role}` (anon/authenticated EXECUTE revoked — IDOR closed);
  security advisor floor **14 → 14**; `analysis_jobs` in `supabase_realtime`;
  `reap_stale_analysis_runs` cron armed inert; `internal_job_secret` present on preview.

---

## ⏳ PART B — PRODUCTION (operator-only; needs your approval + a secret)

Prod project `zjpjapgraoxdukdvpjes`. Prod already has the `20260608*` set applied, so its
history must acknowledge the repo's `20260625*` twins before `db push`, exactly like
preview but mirror-image.

### 1. Link + repair history (records the 625 twins as applied — runs NO SQL)
```bash
supabase link --project-ref zjpjapgraoxdukdvpjes    # prompts for prod DB password

supabase migration repair --status applied \
  20260625003724 20260625003741 20260625003806 20260625003826 20260625003841 \
  20260625003901 20260625003918 20260625003933 20260625011235 20260625011241 \
  20260625021127 20260625021209 20260625080403 20260625080638 20260625080659
```

### 2. Confirm ONLY our 4 are pending, then push
```bash
supabase migration list        # pending (remote blank) must be exactly:
                               #   20260702000001, 000002, 000003, 000004
supabase db push               # applies those 4; each emits a pass NOTICE
```
Expected: all DO-blocks pass; security advisor floor **14 → 14** (000004 keeps the two new
RPCs off advisors 0028/0029).

### 3. Deploy the reaper function
```bash
supabase functions deploy reap-stale-analysis-runs
```

### 4. Create the internal_job_secret on prod (MISSING today — required, secret is yours)
In the Supabase dashboard → prod project → SQL Editor, using the SAME value your other
internal cron jobs use:
```sql
select vault.create_secret('YOUR_INTERNAL_JOB_SECRET_VALUE', 'internal_job_secret');
```

### 5. Repoint the reaper cron to the PROD host (db push applied the preview host)
In the prod SQL Editor:
```sql
select cron.unschedule('reap_stale_analysis_runs');
select cron.schedule(
  'reap_stale_analysis_runs',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := 'https://zjpjapgraoxdukdvpjes.supabase.co/functions/v1/reap-stale-analysis-runs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-job-secret', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'internal_job_secret' limit 1
      )
    ),
    body := '{"invocation_source":"pg_cron_reaper"}'::jsonb
  );
  $job$
);
```

### Then reply: `done`
Claude verifies prod read-only (advisor floor 14, ACL `{postgres,service_role}`, cron
present, state column present), writes `03-01-SUMMARY.md` + `03-06-SUMMARY.md`, runs the
phase verifier, and closes Phase 3 → routes to Phase 4.

---

## Note: pre-existing repo hygiene (not blocking, flag for later)
The repo carries DUPLICATE copies of the 15 Phase-2 security migrations — one `20260608*`
set (fully documented) and one `20260625*` set (terse `db diff` twins). Prod applied the
`608` set; preview applied the `625` set. Same end-state schema, but `db push` on either
env flags the other set as "pending" (hence the repair steps above). Worth de-duplicating
in a dedicated cleanup so future pushes don't need manual repair.
