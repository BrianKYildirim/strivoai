# Phase 9 - Activation Preconditions (HARD gate before the first production flag flip)

**Plan:** 09-03 (Task 1)
**Target:** production `zjpjapgraoxdukdvpjes` (strivoai)
**Inspection:** VERIFIED read-only against production, 2026-07-11 ~09:20 UTC
**Status:** Inspection COMPLETE. Awaiting operator to APPLY the three SQL blocks in section 6.
**Consumed by:** plan 09-11 (production activation soak).

---

## 0. Headline: the plan's central premise was WRONG, in our favour

This plan was written on the belief that the production reaper posts to the **preview** host and
therefore that D-04 criterion (b) had no enforcement on production. **That is not true.**

> ### VERIFIED: `reap_stale_analysis_runs` (jobid 10) ALREADY targets PROD and is ALREADY SUCCEEDING.
>
> Prod edge-function logs show the reaper returning **HTTP 200 on every recent invocation**
> (execution time 4376 / 4888 / 5825 ms). The preview URL committed in
> `20260702000003_reap_stale_analysis_runs_cron.sql:50` **never reached the live prod cron**.
>
> **D-04 criterion (b) HAS enforcement on production. No reaper remediation is needed.**

The inspection did, however, surface **three real defects** the plan did not anticipate - one drifted
cron job, one systemic pg_net timeout that would have poisoned the 09-11 soak's health signal, and
one cron job that has **never fired in its life**. All three are written up below with
operator-approved SQL.

---

## 1. Q1 - cron.job on production (VERIFIED 2026-07-11)

```sql
select
  jobid, jobname, schedule, active,
  case
    when command like '%zjpjapgraoxdukdvpjes.supabase.co%' then 'PROD (correct)'
    when command like '%cimjltzovkahkqecpwgi.supabase.co%' then 'PREVIEW (DRIFT - must fix)'
    when command like '%http%'                             then 'OTHER HOST (inspect)'
    else 'no http_post (local SQL job)'
  end as target_host_class
from cron.job
order by jobid;
```

OPERATOR RESPONSE: OUTPUT to first SQL query on prod database:
| jobid | jobname                         | schedule     | active | target_host_class            |
| ----- | ------------------------------- | ------------ | ------ | ---------------------------- |
| 4     | cleanup-rate-limit-counters     | 0 * * * *    | true   | no http_post (local SQL job) |
| 5     | reset-subscription-merits-sweep | */15 * * * * | true   | OTHER HOST (inspect)         |
| 6     | extract_catchup_nightly         | */15 * * * * | true   | PROD (correct)               |
| 7     | benchmarks_nightly              | 0 3 * * *    | true   | no http_post (local SQL job) |
| 8     | lifecycle_sweep_nightly         | 0 4 * * *    | true   | no http_post (local SQL job) |
| 10    | reap_stale_analysis_runs        | */15 * * * * | true   | PROD (correct)               |
| 11    | keep-warm-ping                  | */5 * * * *  | true   | PREVIEW (DRIFT - must fix)   |

**VERIFIED RESULT:**

| jobid | jobname | schedule | active | Target |
|---|---|---|---|---|
| 4 | `cleanup-rate-limit-counters` | `0 * * * *` | t | local SQL job |
| 5 | `reset-subscription-merits-sweep` | `*/15 * * * *` | t | URL from `current_setting('app.functions_base_url')` - **see Finding 3: NEVER FIRES** |
| 6 | `extract_catchup_nightly` | `*/15 * * * *` | t | **PROD (correct)** `/functions/v1/extract-analysis-structure` |
| 7 | `benchmarks_nightly` | `0 3 * * *` | t | local SQL job |
| 8 | `lifecycle_sweep_nightly` | `0 4 * * *` | t | local SQL job |
| 10 | **`reap_stale_analysis_runs`** | `*/15 * * * *` | t | **PROD (correct)** `/functions/v1/reap-stale-analysis-runs` |
| 11 | `keep-warm-ping` | `*/5 * * * *` | t | **PREVIEW (DRIFT - must fix)** `cimjltzovkahkqecpwgi` `/functions/v1/keep-warm` |

**Reconciliation against STATE.md.** The carried Phase-2 item **SEC-02-08-CRON** claimed *two*
drifted jobs (`keep-warm-ping` **and** `extract_catchup_nightly`). Only **one** is still drifted:
**jobid 11 `keep-warm-ping`**. Jobid 6 `extract_catchup_nightly` already points at prod and needs
**no** change. Jobs 6 and 10 are correct - **do not touch their hosts.**

---

## 2. Q2 - `cron.job_run_details` is VACUOUS (conclusion unchanged)

```sql
select jobid, status, return_message, start_time
from cron.job_run_details order by start_time desc limit 30;
```

OPERATOR RESPONSE to 2nd SQL query on prod database:

| jobid | status    | return_message                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | start_time                    |
| ----- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| 11    | succeeded | 1 row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 2026-07-12 16:50:00.472022+00 |
| 10    | succeeded | 1 row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 2026-07-12 16:45:00.564185+00 |
| 6     | succeeded | 1 row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 2026-07-12 16:45:00.562401+00 |
| 5     | failed    | ERROR:  null value in column "url" of relation "http_request_queue" violates not-null constraint
DETAIL:  Failing row contains (13326, POST, null, {"Content-Type": "application/json", "x-internal-job-secret": nu..., \x7b22696e766f636174696f6e5f736f75726365223a202270675f63726f6e22..., 5000).
CONTEXT:  SQL statement "insert into net.http_request_queue(method, url, headers, body, timeout_milliseconds)
    values (
        'POST',
        net._encode_url_with_params_array(url, params_array),
        headers,
        convert_to(body::text, 'UTF8'),
        timeout_milliseconds
    )
    returning id"
PL/pgSQL function net.http_post(text,jsonb,jsonb,jsonb,integer) line 37 at SQL statement
 | 2026-07-12 16:45:00.554698+00 |
| 11    | succeeded | 1 row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 2026-07-12 16:45:00.551368+00 |
| 11    | succeeded | 1 row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 2026-07-12 16:40:00.099983+00 |
| 11    | succeeded | 1 row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 2026-07-12 16:35:00.493896+00 |
| 5     | failed    | ERROR:  null value in column "url" of relation "http_request_queue" violates not-null constraint
DETAIL:  Failing row contains (13321, POST, null, {"Content-Type": "application/json", "x-internal-job-secret": nu..., \x7b22696e766f636174696f6e5f736f75726365223a202270675f63726f6e22..., 5000).
CONTEXT:  SQL statement "insert into net.http_request_queue(method, url, headers, body, timeout_milliseconds)
    values (
        'POST',
        net._encode_url_with_params_array(url, params_array),
        headers,
        convert_to(body::text, 'UTF8'),
        timeout_milliseconds
    )
    returning id"
PL/pgSQL function net.http_post(text,jsonb,jsonb,jsonb,integer) line 37 at SQL statement
 | 2026-07-12 16:30:00.186418+00 |
| 6     | succeeded | 1 row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 2026-07-12 16:30:00.185709+00 |
| 11    | succeeded | 1 row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 2026-07-12 16:30:00.177146+00 |
| 10    | succeeded | 1 row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 2026-07-12 16:30:00.170933+00 |
| 11    | succeeded | 1 row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 2026-07-12 16:25:00.468049+00 |
| 11    | succeeded | 1 row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 2026-07-12 16:20:00.077812+00 |
| 10    | succeeded | 1 row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 2026-07-12 16:15:00.621186+00 |
| 5     | failed    | ERROR:  null value in column "url" of relation "http_request_queue" violates not-null constraint
DETAIL:  Failing row contains (13312, POST, null, {"Content-Type": "application/json", "x-internal-job-secret": nu..., \x7b22696e766f636174696f6e5f736f75726365223a202270675f63726f6e22..., 5000).
CONTEXT:  SQL statement "insert into net.http_request_queue(method, url, headers, body, timeout_milliseconds)
    values (
        'POST',
        net._encode_url_with_params_array(url, params_array),
        headers,
        convert_to(body::text, 'UTF8'),
        timeout_milliseconds
    )
    returning id"
PL/pgSQL function net.http_post(text,jsonb,jsonb,jsonb,integer) line 37 at SQL statement
 | 2026-07-12 16:15:00.620568+00 |
| 6     | succeeded | 1 row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 2026-07-12 16:15:00.618839+00 |
| 11    | succeeded | 1 row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 2026-07-12 16:15:00.61812+00  |
| 11    | succeeded | 1 row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 2026-07-12 16:10:00.08228+00  |
| 11    | succeeded | 1 row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 2026-07-12 16:05:00.523437+00 |
| 5     | failed    | ERROR:  null value in column "url" of relation "http_request_queue" violates not-null constraint
DETAIL:  Failing row contains (13308, POST, null, {"Content-Type": "application/json", "x-internal-job-secret": nu..., \x7b22696e766f636174696f6e5f736f75726365223a202270675f63726f6e22..., 5000).
CONTEXT:  SQL statement "insert into net.http_request_queue(method, url, headers, body, timeout_milliseconds)
    values (
        'POST',
        net._encode_url_with_params_array(url, params_array),
        headers,
        convert_to(body::text, 'UTF8'),
        timeout_milliseconds
    )
    returning id"
PL/pgSQL function net.http_post(text,jsonb,jsonb,jsonb,integer) line 37 at SQL statement
 | 2026-07-12 16:00:00.183152+00 |
| 4     | succeeded | DELETE 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 2026-07-12 16:00:00.181813+00 |
| 10    | succeeded | 1 row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 2026-07-12 16:00:00.172599+00 |
| 6     | succeeded | 1 row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 2026-07-12 16:00:00.164786+00 |
| 11    | succeeded | 1 row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 2026-07-12 16:00:00.160374+00 |
| 11    | succeeded | 1 row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 2026-07-12 15:55:00.493458+00 |
| 11    | succeeded | 1 row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 2026-07-12 15:50:00.442803+00 |
| 10    | succeeded | 1 row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 2026-07-12 15:45:00.404296+00 |
| 11    | succeeded | 1 row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 2026-07-12 15:45:00.368038+00 |
| 5     | failed    | ERROR:  null value in column "url" of relation "http_request_queue" violates not-null constraint
DETAIL:  Failing row contains (13300, POST, null, {"Content-Type": "application/json", "x-internal-job-secret": nu..., \x7b22696e766f636174696f6e5f736f75726365223a202270675f63726f6e22..., 5000).
CONTEXT:  SQL statement "insert into net.http_request_queue(method, url, headers, body, timeout_milliseconds)
    values (
        'POST',
        net._encode_url_with_params_array(url, params_array),
        headers,
        convert_to(body::text, 'UTF8'),
        timeout_milliseconds
    )
    returning id"
PL/pgSQL function net.http_post(text,jsonb,jsonb,jsonb,integer) line 37 at SQL statement
 | 2026-07-12 15:45:00.303716+00 |
| 6     | succeeded | 1 row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 2026-07-12 15:45:00.296038+00 |

`status = 'succeeded'` here means only that the SQL statement **queued** the request. `net.http_post`
is **asynchronous**: a 401 at the edge gateway still records `succeeded`. This was the failure class
diagnosed in quick task `20260705-cron-edge-fn-401-auth`. **Never use this table as a health signal.**

---

## 3. Q3 - `net._http_response` is ALSO unusable (CORRECTED - and not for the reason first assumed)

I originally proposed `net._http_response.status_code` as the authoritative reaper health check.
**The production data proves that is wrong too**, though not because of a 401.

**VERIFIED, last 24h on prod:**

| `status_code` | Responses | Note |
|---|---|---|
| `200` | 76 | genuine successes |
| `NULL` | 44 | every one carries `error_msg = "Timeout of 5000 ms reached"` |

Every NULL lands on a `:00 / :15 / :30 / :45` tick - **exactly the two `*/15` jobs** (6 and 10).

> ### Root cause: pg_net's client-side default timeout is **5000 ms**. The reaper's real execution time is **4376-5825 ms**.
>
> The edge function **completes and returns 200** - the edge logs prove it - but **pg_net has already
> hung up**. `net._http_response` records a **phantom timeout for a request that actually succeeded.**

**Consequences:**

1. **`net._http_response` CANNOT serve as the reaper health signal.** It reports failure for a
   healthy function. Had the 09-11 soak leaned on it, the operator would have seen a wall of 5 s
   timeouts and aborted a working activation.
2. **The authoritative signal is the EDGE-FUNCTION LOGS** (`status_code = 200`) - which is what
   verified the reaper healthy above.
3. This is fixable, and SQL block **6b** fixes it: raising the pg_net timeout makes
   `net._http_response` a *usable* signal for 09-11 instead of noise.

**Reaper health-check query for 09-11 (Logs Explorer, NOT `net._http_response`):**

```sql
-- Supabase Dashboard -> Logs -> Logs Explorer (production).
select
  cast(floor(resp.status_code / 100) as int64) as status_class,
  count(*)                                      as invocations
from function_edge_logs
  cross join unnest(metadata)   as m
  cross join unnest(m.request)  as req
  cross join unnest(m.response) as resp
where regexp_extract(req.url, r'/functions/v1/([^/?]+)') = 'reap-stale-analysis-runs'
group by status_class
order by status_class;
```

---

## 4. Finding 3 (NEW, not in the plan) - jobid 5 has NEVER FIRED

`reset-subscription-merits-sweep` (jobid 5, `*/15 * * * *`, `active = t`) builds its URL as:

```text
current_setting('app.functions_base_url', true) || '/reset-subscription-merits'
```

**VERIFIED: `app.functions_base_url` is NOT SET on production** - not at database level, not at role
level (checked against `pg_db_role_setting`). With the `missing_ok => true` second argument,
`current_setting` returns **NULL**, the concatenated URL is **NULL**, and **`net.http_post` has never
actually posted anything.** The job is a silent no-op and always has been.

**Arithmetic confirmation.** Prod emits exactly **20 HTTP responses/hour**:
`4` (extract, `*/15`) + `4` (reaper, `*/15`) + `12` (keep-warm, `*/5`) = **20**.
**Jobid 5 contributes ZERO.**

**Why nobody noticed:** `MERIT_SYSTEM_ENABLED = false` on production, so nothing depends on the
subscription-merit reset today. **But this is precisely the job the merit system depends on when it
IS enabled.** A future `MERIT_SYSTEM_ENABLED` activation would silently fail to reset subscription
merits - users would never get their monthly allocation back.

- **Severity:** latent, currently inert. **Not** a v5.0 blocker (D-03 keeps `MERIT_SYSTEM_ENABLED`
  off on prod).
- **Disposition:** VERIFIED latent defect -> **VER-05 report item 14** (remaining risks / follow-ups).
- **Fix:** SQL block **6c** (operator-approved, recommended).

---

## 5. `INTERNAL_JOB_SECRET` parity - CONFIRMED, no value disclosed

The reaper authenticates with `type:'internal'` (`requireAuth` -> `timingSafeEqual` on
`x-internal-job-secret`) and requires `verify_jwt = false` (already set, `supabase/config.toml:47-48`).
The secret lives in two stores that must be byte-identical:

| Store | Name | Read by |
|---|---|---|
| Supabase edge secrets (prod) | `INTERNAL_JOB_SECRET` | `_shared/auth.ts` (`Deno.env.get`) |
| Postgres Vault (prod) | `internal_job_secret` | the pg_cron job body |

> **VERIFIED by construction:** the reaper is returning **HTTP 200** on prod. **A mismatched secret
> cannot produce a 200** - it would yield a 401. The live 200s ARE the parity evidence.

No digest comparison is needed and **no value is disclosed anywhere**. Never paste
`INTERNAL_JOB_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, or any Vault value into this document, a commit,
or a chat message.

- [x] **Parity confirmed** (evidenced by live 200s from an internal-auth-only endpoint).

---

## 6. Operator SQL - **OPERATOR APPLIES. CLAUDE APPLIES NOTHING.**

Claude is READ-ONLY on production (CLAUDE.md access policy). All three blocks are operator-approved.

### 6a. REQUIRED - re-point `keep-warm-ping` (jobid 11) to the prod host

**Why:** jobid 11 is the last remaining preview-host drift on production. Applying this closes the
open MEDIUM item **SEC-02-08-CRON** carried out of Phase 2. Jobs **6 and 10 need NO host change** -
they already target prod. This block is a surgical host-substring rewrite: it preserves the schedule,
any Vault secret reference, the body, and every other byte verbatim; it embeds no `jobid` literal in
the command body; and it is idempotent (a no-op once nothing is drifted).

```sql
-- PRODUCTION (zjpjapgraoxdukdvpjes). Re-point the drifted cron job preview -> prod.
-- Matches ONLY commands still containing the preview host, so jobs 6 and 10 are untouched.
DO $$
DECLARE
  j     record;
  fixed int := 0;
BEGIN
  FOR j IN
    SELECT jobid, jobname, command
    FROM cron.job
    WHERE command LIKE '%cimjltzovkahkqecpwgi.supabase.co%'
  LOOP
    PERFORM cron.alter_job(
      job_id  => j.jobid,
      command => replace(
        j.command,
        'cimjltzovkahkqecpwgi.supabase.co',
        'zjpjapgraoxdukdvpjes.supabase.co'
      )
    );
    fixed := fixed + 1;
    RAISE NOTICE 'Re-pointed cron job % (%) preview -> prod', j.jobid, j.jobname;
  END LOOP;

  RAISE NOTICE 'Re-pointed % cron job(s). Expected: 1 (jobid 11 keep-warm-ping).', fixed;
END
$$;
```

**Post-change verification** (expect **zero** rows):

```sql
select jobid, jobname
from cron.job
where command like '%cimjltzovkahkqecpwgi.supabase.co%';
```

**Rollback:** re-run 6a with the hosts reversed. No DDL, no data migration.

---

### 6b. RECOMMENDED - raise the pg_net timeout to 30000 ms on jobids 6 and 10

**Why:** pg_net's 5000 ms default is shorter than the reaper's real 4.4-5.8 s execution time, so
`net._http_response` records phantom timeouts for requests that actually returned 200 (section 3).
Raising it makes `net._http_response` a **usable health signal for the 09-11 soak** instead of a wall
of false alarms. This changes only the client-side wait - not the schedule, the host, or the Vault
reference.

```sql
-- PRODUCTION. Add an explicit 30 s pg_net timeout to the two */15 http jobs (6, 10).
-- Idempotent: only rewrites commands that do not already set timeout_milliseconds.
DO $$
DECLARE
  j     record;
  fixed int := 0;
BEGIN
  FOR j IN
    SELECT jobid, jobname, command
    FROM cron.job
    WHERE jobid IN (6, 10)
      AND command LIKE '%net.http_post%'
      AND command NOT LIKE '%timeout_milliseconds%'
  LOOP
    PERFORM cron.alter_job(
      job_id  => j.jobid,
      -- Append the timeout arg inside the net.http_post(...) call, anchored on its closing ');'.
      command => regexp_replace(
        j.command,
        '\)\s*;\s*$',
        ', timeout_milliseconds := 30000);',
        'n'
      )
    );
    fixed := fixed + 1;
    RAISE NOTICE 'Raised pg_net timeout to 30000 ms on cron job % (%)', j.jobid, j.jobname;
  END LOOP;

  RAISE NOTICE 'Updated % job(s). Expected: 2 (jobids 6, 10).', fixed;
END
$$;
```

> **Operator - read before applying.** Run
> `select jobid, jobname, command from cron.job where jobid in (6, 10);`
> and eyeball that each `command` ends with `);` so the `regexp_replace` anchors correctly. If a
> command's shape differs, add the `timeout_milliseconds := 30000` argument by hand rather than
> forcing the regex - it is a single argument added inside the existing `net.http_post(...)` call.

OPERATOR Response to select jobid, jobname, command from cron.job where jobid in (6, 10);

| jobid | jobname                  | command                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6     | extract_catchup_nightly  | 
SELECT net.http_post(
    url := 'https://zjpjapgraoxdukdvpjes.supabase.co/functions/v1/extract-analysis-structure',
    headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-job-secret', (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'internal_job_secret'
            LIMIT 1
        )
    ),
body := '{"invocation_source":"pg_cron_catchup"}'::jsonb
, timeout_milliseconds := 30000); |
| 10    | reap_stale_analysis_runs | 
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
    , timeout_milliseconds := 30000);                         |

**Post-change verification** - after one `*/15` tick, the phantom timeouts should stop:

```sql
select
  coalesce(status_code::text, 'NULL (timeout)') as status,
  count(*)                                       as responses
from net._http_response
where created > now() - interval '30 minutes'
group by 1
order by 1;
```

Expect `200`s and **no** `NULL (timeout)` rows from the `*/15` ticks.

OPERATOR RESPONSE: Output to above SQL
| status         | responses |
| -------------- | --------- |
| 200            | 5         |
| NULL (timeout) | 5         |


**Rollback:** `cron.alter_job` the command back, removing the `timeout_milliseconds` argument.

---

### 6c. RECOMMENDED - fix jobid 5 (`reset-subscription-merits-sweep`), which has never fired

**Why:** the job concatenates `current_setting('app.functions_base_url', true) || '/reset-subscription-merits'`,
and that GUC is unset on prod, so the URL is NULL and the job is a silent no-op (Finding 3). Inert
today (`MERIT_SYSTEM_ENABLED = false`), but load-bearing whenever the merit system is enabled.

**The GUC must NOT have a trailing slash** - the job appends `'/reset-subscription-merits'` itself.

> ## !! 6c AS ORIGINALLY WRITTEN IS IMPOSSIBLE - SUPERSEDED BY 6c-REVISED BELOW !!
>
> The operator attempted it and got:
> `ERROR: 42501: permission denied to set parameter "app.functions_base_url"`
>
> On Supabase the `postgres` role is **not a superuser**, so it cannot `ALTER DATABASE ... SET`
> a custom GUC. **This block can never succeed.** Do not retry it.

```sql
-- SUPERSEDED - DO NOT RUN. Fails with 42501 permission denied on Supabase.
-- alter database postgres
--   set app.functions_base_url = 'https://zjpjapgraoxdukdvpjes.supabase.co/functions/v1';
```

### 6c-REVISED. REQUIRED-ish - rewrite jobid 5 to match the pattern jobs 6 and 10 already use

**The GUC was never the right fix.** Read-only inspection of jobid 5's command (booleans only - the
raw command is never printed, it carries a header block) established:

| Property | jobid 5 | jobids 6 & 10 |
|---|---|---|
| URL source | `current_setting('app.functions_base_url', true)` | **hardcoded prod URL literal** |
| Secret source | `current_setting('app.internal_job_secret', true)` | **`vault.decrypted_secrets`** |
| References `vault.decrypted_secrets` | **NO** | YES |

> ### Jobid 5 depends on TWO `app.*` GUCs. **Neither is set. Neither CAN be set** (42501).
>
> So the URL resolves to NULL **and** the `x-internal-job-secret` header resolves to NULL - visible
> in the operator's own Q2 output: `Failing row contains (13326, POST, null, {... "x-internal-job-secret": nu...)`.
>
> **This job has been structurally incapable of working since the day it was written.** It is not
> drift and it is not a regression: it has never once fired. Even had the URL resolved, the null
> secret would have produced a 401.

The fix is to make jobid 5 look like its two working siblings. This block substitutes both
`current_setting(...)` expressions in place - it never prints the command, preserves the schedule,
body, and every other byte, and is idempotent (a no-op once neither GUC expression remains).

```sql
-- PRODUCTION (zjpjapgraoxdukdvpjes). Rewrite jobid 5 to hardcode the prod URL and to read the
-- internal job secret from the Vault, exactly as jobids 6 and 10 already do.
-- Idempotent: the WHERE clause stops matching once the rewrite has been applied.
DO $$
DECLARE
  j     record;
  fixed int := 0;
BEGIN
  FOR j IN
    SELECT jobid, jobname, command
    FROM cron.job
    WHERE jobid = 5
      AND command LIKE '%current_setting(%'
  LOOP
    PERFORM cron.alter_job(
      job_id  => j.jobid,
      command => replace(
                   replace(
                     j.command,
                     'current_setting(''app.functions_base_url'', true)',
                     '''https://zjpjapgraoxdukdvpjes.supabase.co/functions/v1'''
                   ),
                   'current_setting(''app.internal_job_secret'', true)',
                   '(select decrypted_secret from vault.decrypted_secrets'
                   || ' where name = ''internal_job_secret'' limit 1)'
                 )
    );
    fixed := fixed + 1;
    RAISE NOTICE 'Rewrote cron job % (%): GUCs -> literal URL + Vault secret', j.jobid, j.jobname;
  END LOOP;

  RAISE NOTICE 'Rewrote % job(s). Expected: 1 (jobid 5).', fixed;
END
$$;
```

**Post-change verification.** First confirm both GUC expressions are gone (expect `f` / `t`):

```sql
select
  (command like '%current_setting(%')        as still_uses_guc,   -- expect false
  (command like '%vault.decrypted_secrets%') as uses_vault        -- expect true
from cron.job where jobid = 5;
```

Then, within 15 minutes, jobid 5 should stop erroring and produce its **first-ever** HTTP response
(the `null value in column "url"` failures must cease):

```sql
select status, count(*) as runs, max(start_time) as most_recent
from cron.job_run_details
where jobid = 5 and start_time > now() - interval '20 minutes'
group by status;
```

Expect `succeeded`, and **zero** `failed` rows. Hourly `net._http_response` volume should rise
from 20/hr to 24/hr.

**Rollback:** `cron.alter_job` the command back to the `current_setting(...)` form - i.e. restore the
current never-fires behaviour. There is nothing to lose by applying this.

---

### 6d. OPTIONAL - give `keep-warm-ping` (jobid 11) an explicit pg_net timeout

**Why:** 6a re-pointed jobid 11 at prod, but it carries **no** `timeout_milliseconds`, so it inherits
pg_net's 5000 ms default. A prod cold start can exceed that, producing the same phantom-timeout rows
in `net._http_response` that 6b just eliminated for jobs 6 and 10. Cosmetic, but it keeps the 09-11
health signal clean.

```sql
-- PRODUCTION. Same shape as 6b, applied to jobid 11.
DO $$
DECLARE
  j record;
BEGIN
  FOR j IN
    SELECT jobid, jobname, command
    FROM cron.job
    WHERE jobid = 11
      AND command LIKE '%net.http_post%'
      AND command NOT LIKE '%timeout_milliseconds%'
  LOOP
    PERFORM cron.alter_job(
      job_id  => j.jobid,
      command => regexp_replace(j.command, '\)\s*;\s*$', ', timeout_milliseconds := 30000);', 'n')
    );
    RAISE NOTICE 'Raised pg_net timeout to 30000 ms on cron job % (%)', j.jobid, j.jobname;
  END LOOP;
END
$$;
```

> **Operator - read before applying.** `ALTER DATABASE ... SET` applies to **new sessions only**. The
> pg_cron background worker may need to reconnect before the next tick picks it up. Confirm the job's
> exact command shape first with `select command from cron.job where jobid = 5;` and confirm the GUC
> resolves with `select current_setting('app.functions_base_url', true);`

**Post-change verification** - within 15 minutes, jobid 5 should produce its first-ever response.
Hourly response volume should rise from **20/hr to 24/hr** (jobid 5 adds 4 x `*/15`):

```sql
select
  coalesce(status_code::text, 'NULL (timeout/err)') as status,
  count(*)                                           as responses,
  max(created)                                       as most_recent
from net._http_response
where created > now() - interval '20 minutes'
group by 1
order by 1;
```

OPERATOR RESPONSE:
| status             | responses | most_recent                   |
| ------------------ | --------- | ----------------------------- |
| 200                | 4         | 2026-07-12 17:00:00.747183+00 |
| NULL (timeout/err) | 4         | 2026-07-12 17:00:00.747183+00 |

**Rollback:** `alter database postgres reset app.functions_base_url;` (restores the current
never-fires behaviour).

---

## 7. D-04 abort / rollback runbook

### 7.1 The master-off rollback

**Rollback = set `ANALYSIS_LIFECYCLE_ENABLED` to anything other than the exact lowercase string
`true`** (or unset it).

```bash
supabase secrets set ANALYSIS_LIFECYCLE_ENABLED=false --project-ref zjpjapgraoxdukdvpjes
```

- `isAnalysisFeatureEnabled()` reads env at **REQUEST time** (`_shared/analysis-flags.ts:92-94`), so
  master-off takes effect on the **next request** - no redeploy, no cold-start wait.
- The flag-OFF path is **byte-identical** to the legacy implementation, guarded by
  `_shared/analysis-lifecycle.dormancy.test.ts` and the per-feature `byte-preserve.test.ts` files.
- **Exact-lowercase-`true` semantics cut both ways:** `false`, `False`, `0`, `''`, or unset are all
  OFF. There is no way to accidentally fail to roll back.
- `VITE_FEATURE_ANALYSIS_LIFECYCLE` is **build-time** and does NOT flip with the edge secrets. It
  gates only the `useAnalysisRun` recovery surface, which is inert without a `run_id`. **The edge
  master-off alone is a complete rollback** - do not wait on a Vercel redeploy to stop the bleeding.
- **Do NOT touch `MERIT_SYSTEM_ENABLED` during an abort.** It stays `false` on production (D-03).

### 7.2 Abort criteria - flip master OFF immediately on any of these

**(a) Merit-ledger anomaly.** Double-charge, missing refund on a failed run, or a settle without a
saved result. Every count must be 0.

> ## !! D9-07 - THE ORIGINAL (a2)/(a3) QUERIES WERE DISARMED. USE THE CORRECTED SET BELOW. !!
>
> The original queries filtered on `merit_transaction_id is not null`. **`runAnalysisLifecycle`
> never writes that column** - it links the ledger by **`idempotency_key`**. So the filter silently
> excluded the lifecycle runs the soak exists to watch.
>
> **VERIFIED on preview (2026-07-14):** of **35** lifecycle rows (`state is not null`), **25 have a
> NULL `merit_transaction_id`** - while **all 35 carry an `idempotency_key`**. The four
> *synchronous* features - **including Recruiting Lens, which is flip #1** - were invisible to both
> queries. They would have returned a reassuring **0** during the production soak *regardless of
> what went wrong*.
>
> A safety net that cannot report a failure is not a safety net. Found by the 09-10 staging soak.

**Ledger shape (VERIFIED on preview).** `public.merit_transactions` carries `idempotency_key`
(text), `amount` (integer; **negative = debit**), `source` (`'feature-deduct'` for an analysis
charge) and `feature`. The join to a run is
`merit_transactions.idempotency_key = analysis_jobs.idempotency_key`, and a healthy run has
**exactly one** debit row. Confirmed: 35 lifecycle runs -> 35 debits, 35 distinct keys, zero
duplicates.

```sql
-- (a1) A run both settled AND refunded. Flags live on analysis_jobs; unchanged and still correct.
select count(*) as a1_settled_and_refunded
from public.analysis_jobs
where merit_settled and refunded;

-- (a2) CORRECTED: a completed run whose merit was charged but never settled.
-- Joins on idempotency_key (the link the lifecycle actually writes), NOT merit_transaction_id.
select count(*) as a2_completed_unsettled
from public.analysis_jobs aj
where aj.state = 'completed'
  and not aj.merit_settled
  and exists (
    select 1 from public.merit_transactions mt
    where mt.idempotency_key = aj.idempotency_key
      and mt.amount < 0
  );

-- (a3) CORRECTED: a failed/refunded run that was charged and never released, past the reaper window.
select count(*) as a3_failed_unreleased
from public.analysis_jobs aj
where aj.state in ('failed', 'refunded')
  and not aj.refunded
  and not aj.merit_settled
  and aj.state_updated_at < now() - interval '20 minutes'
  and exists (
    select 1 from public.merit_transactions mt
    where mt.idempotency_key = aj.idempotency_key
      and mt.amount < 0
  );

-- (a4) NEW - the actual DOUBLE-CHARGE detector, and the one the original set never had.
-- The invariant is per-run, not per-user: no idempotency_key may carry more than one debit.
-- (A per-user debit count is NOT an invariant - a user may legitimately run several analyses.)
--
-- NOTE the `idempotency_key is not null` guard, and do NOT remove it. Without it, every LEGACY
-- debit (113 of them on preview) has a NULL key, they all collapse into a single `GROUP BY NULL`
-- bucket, and the query reports a phantom "double-charged run" that no drill-down can find
-- (`x IN (subquery)` never matches NULL). Verified: with the guard, 0; without it, a false 1.
select count(*) as a4_double_charged_runs
from (
  select mt.idempotency_key
  from public.merit_transactions mt
  where mt.amount < 0
    and mt.source = 'feature-deduct'
    and mt.idempotency_key is not null   -- <-- REQUIRED. See note above.
  group by mt.idempotency_key
  having count(*) > 1
) dup;
```

**VERIFIED on preview (2026-07-14), running the corrected set:**

| Query | Result | Reading |
|---|---|---|
| a1 settled AND refunded | **0** | clean |
| a2 completed but unsettled | **0** | clean |
| a3 failed, charged, never released | **2** | **DEFECT - see D9-08** |
| a4 double-charged runs | **0** | clean (a phantom `1` before the NULL guard) |
| non-vacuity: runs joined to a debit | **35** | the join is LIVE - a zero above means something |

The old queries returned **0 for all of these.** The corrected set found a real defect on its first run.

---

### D9-08 (HIGH, money) - the reaper never releases a lifecycle run's merits

`a3 = 2` is not test noise. Two Career Compass runs (2026-07-08) sit `state = 'failed'`,
`merit_settled = false`, `refunded = false`, each carrying **one debit**. Their merits were taken
and never given back.

**Root cause - the same one as D9-07, now in the safety net itself.**
`reap-stale-analysis-runs/index.ts:200`:

```ts
const hasMerit = !!row.merit_transaction_id;   // lifecycle runs: ALWAYS false
...
if (hasMerit) patch.refunded = true;           // therefore: NEVER taken
```

**`runAnalysisLifecycle` never writes `merit_transaction_id`** - it links the ledger by
`idempotency_key`. So `hasMerit` is `false` for **every lifecycle run**, the reaper terminalizes it
to `failed`, and the reservation is **never released**. The function's own header promises it
releases "any stranded Merit reservation EXACTLY ONCE"; for lifecycle runs it releases **exactly
zero**.

- **Impact on v5.0 production: LATENT.** `MERIT_SYSTEM_ENABLED = false` on prod (D-03), so lifecycle
  runs never reserve merits and there is nothing to strand. **Not a blocker for the 09-11 flip.**
- **Impact the moment merits are enabled: a live money leak.** Every stuck lifecycle run silently
  eats the user's merits, and D-04's abort criteria - before this fix - could not have seen it.
- **Fix:** the reaper must release by `idempotency_key`, not `merit_transaction_id` (or the
  lifecycle must populate `merit_transaction_id`). Deliberately NOT patched here: it is not a v5.0
  blocker, and this is a verification phase. **It MUST be fixed before `MERIT_SYSTEM_ENABLED` is
  ever turned on in production.**
- Carried to **VER-05 report item 14** as a HIGH-severity residual.

**Non-vacuity guard - run this FIRST, every time.** (a2)/(a3)/(a4) are `exists`-gated, so they all
return a comforting 0 if the join simply matches nothing. Before trusting a zero, prove the join is
live:

```sql
select
  count(*) filter (where aj.state is not null)                          as lifecycle_runs,
  count(*) filter (where mt.idempotency_key is not null)                as runs_joined_to_a_debit
from public.analysis_jobs aj
left join public.merit_transactions mt
  on mt.idempotency_key = aj.idempotency_key and mt.amount < 0
where aj.created_at > now() - interval '24 hours';
```

If `lifecycle_runs > 0` but `runs_joined_to_a_debit = 0`, **the abort queries are blind again** -
STOP and diagnose the join before reading any of the counts above as a pass.

**(b) A run stuck non-terminal past the reaper window.**

Reaper worst case = per-state `maxAge` + the 15-minute cron cadence:

| State | `maxAge` | Reaper target | Worst-case terminalize |
|---|---|---|---|
| `created` | 60s | `failed` | ~16 min |
| `validating_inputs` | 60s | `failed` | ~16 min |
| `reserving_merits` | 120s | `failed` | ~17 min |
| `extracting_data` | 300s | `retryable_failed` | **~20 min** |
| `generating` | 300s | `retryable_failed` | **~20 min** |
| `validating_output` | 120s | `failed` | ~17 min |
| `saving` | 120s | `failed` | ~17 min |
| `retryable_failed` | 600s | `failed` | ~25 min |

> **Operational definition of D-04 (b):** *any `public.analysis_jobs` row still in a non-terminal
> state more than **20 minutes** after its `state_updated_at`.* (A row in `retryable_failed` between
> 20 and 25 minutes is not yet an abort - that sweep's worst case is ~25 min.)

The **11 states**: `created`, `validating_inputs`, `reserving_merits`, `extracting_data`,
`generating`, `validating_output`, `saving`, `completed`, `retryable_failed`, `failed`, `refunded`.
The **3 terminal states**: **`completed`, `failed`, `refunded`.**

**Use the NULL-SAFE form.** The naive `where state not in (...)` silently EXCLUDES legacy
`state IS NULL` rows and returns a false 0 (see `09-PREFLIP-BASELINE.md` step 5):

```sql
select count(*) as stuck_non_terminal
from public.analysis_jobs
where (state is null or state not in ('completed', 'failed', 'refunded'))
  and state_updated_at < now() - interval '20 minutes';
```

OPERATOR RESPONSE:
| stuck_non_terminal |
| ------------------ |
| 0                  |

**(c) A new error class not present in the pre-flip baseline.**

Vocabulary = the **13-code taxonomy** in `_shared/analysis-error-taxonomy.ts`: `INPUT_MISSING`,
`FILE_NOT_FOUND`, `FILE_EXTRACTION_FAILED`, `PROFILE_PARSE_FAILED`, `MERIT_RESERVATION_FAILED`,
`MODEL_TIMEOUT`, `MODEL_RATE_LIMITED`, `MODEL_INVALID_RESPONSE`, `MODEL_OUTPUT_TRUNCATED`,
`SCHEMA_VALIDATION_FAILED`, `DATABASE_SAVE_FAILED`, `MERIT_SETTLEMENT_FAILED`,
`UNKNOWN_ANALYSIS_ERROR`.

**VERIFIED: the pre-flip taxonomy histogram is EMPTY** (legacy paths write no taxonomy codes). Taken
naively that would make every post-flip code "new" and trip the abort on the first structured error.
So D-04 (c) is evaluated as:

1. **Any `UNKNOWN_ANALYSIS_ERROR` -> ABORT**, unconditionally. It is the fail-closed bucket; its
   presence means a failure escaped the taxonomy. No baseline comparison needed.
2. **Per-function HTTP status-class regression vs the pre-flip band -> ABORT.** The status-class
   histogram in `09-PREFLIP-BASELINE.md` is populated by the legacy paths and is the true
   like-for-like comparison.
3. **A non-`UNKNOWN` taxonomy code appearing post-flip is EXPECTED and is not, alone, an abort** -
   those codes are the lifecycle's structured replacements for what were previously generic 500s.
   Seeing `MODEL_TIMEOUT` instead of an opaque 500 is the milestone **working**.

**(d) User-visible regression in output quality or latency.** Compare against the p50/p95 band in
`09-PREFLIP-BASELINE.md`.

### 7.3 Abort procedure

1. `supabase secrets set ANALYSIS_LIFECYCLE_ENABLED=false --project-ref zjpjapgraoxdukdvpjes`
   (instant; next request).
2. Confirm the legacy path is serving (one live analysis per affected feature).
3. Run the (a) merit-ledger queries - any stranded reservation is released by the reaper within
   ~25 min; verify it drains to 0.
4. Record the trigger, the evidence, and the timestamps in the phase directory. Do **not** re-flip
   until the cause is understood.

---

## 8. Gate checklist - 09-11 is blocked until ALL are checked

- [x] **Q1** run on prod (VERIFIED 2026-07-11). Only jobid 11 is drifted; the reaper is prod-targeted.
- [x] **Reaper health** confirmed via **edge-function logs** (HTTP 200, 4.4-5.8 s) - NOT via
      `cron.job_run_details` (vacuous) and NOT via `net._http_response` (phantom 5 s timeouts).
- [x] **`INTERNAL_JOB_SECRET` <-> Vault parity** confirmed by construction (live 200s). No value disclosed.
- [x] **D-04 criterion (b) HAS enforcement on production.** The reaper works.
- [x] **SQL block 6a applied by the OPERATOR** (REQUIRED). VERIFIED read-only 2026-07-12: jobid 11
      `keep-warm-ping` now targets `zjpjapgraoxdukdvpjes`; **zero** rows match the preview host.
      **SEC-02-08-CRON is CLOSED.**
- [x] **SQL block 6b applied by the OPERATOR** (RECOMMENDED). VERIFIED: jobids 6 and 10 both carry
      `timeout_milliseconds := 30000`; the reaper's phantom 5 s timeouts have stopped.
- [x] **SQL block 6c-REVISED applied by the OPERATOR.** VERIFIED read-only 2026-07-15: jobid 5
      no longer references any `app.*` GUC (`still_uses_guc = false`) and now reads the Vault
      (`uses_vault = true`). Jobid 5 fired **succeeded, 0 failed** at 05:00 UTC - its **first-ever**
      successful run; the `null value in column "url"` failures have ceased. R-09-03-A CLOSED.
- [x] **SQL block 6d applied by the OPERATOR** (OPTIONAL - explicit pg_net timeout for jobid 11).
      Post-change `net._http_response` (last 20 min) is **all `200`, zero NULL/timeout** rows.
- [x] Post-change verification queries pasted back for 6c-REVISED / 6d.
- [x] `09-PREFLIP-BASELINE.md` approved by the operator (2026-07-15).
- [x] `docs/ENVIRONMENT.md` documents all seven lifecycle flags. Commit `06cd2f32`.
- [x] **No production SQL was applied by Claude.** Read-only inspection only.

---

## 9. Residual items carried to VER-05 report item 14

| # | Item | Status |
|---|------|--------|
| R-09-03-A | **jobid 5 `reset-subscription-merits-sweep` had NEVER FIRED** - `app.functions_base_url` unset on prod, so the URL resolved to NULL. Load-bearing whenever the merit system is enabled. | **CLOSED 2026-07-15.** 6c-REVISED applied: jobid 5 now reads the hardcoded prod URL + Vault secret and fires `succeeded` (0 failed); first-ever successful run at 05:00 UTC. |
| R-09-03-B | **pg_net's 5000 ms default timeout < the reaper's 4.4-5.8 s execution time** - `net._http_response` records phantom timeouts for successful requests, making it useless as a health signal for any long-running cron-invoked function. | VERIFIED. Fix proposed (6b). |
| R-09-03-C | **Migration `20260702000003` carries the PREVIEW host in its committed body.** The live prod cron is correct, so this is latent - but re-applying that migration to prod would INTRODUCE the very drift its own header warns about. | Recorded. Repo-hygiene follow-up. |
| R-09-03-D | **Real PII in git history** (09-02, T-09-02-B) - the real LinkedIn profile remains recoverable from commit `21925c88`. HEAD is clean (synthetic fixture). | **Operator decision: purge DEFERRED to a post-phase decision.** A history rewrite (`git filter-repo` / BFG + force-push) is not being done mid-phase. Carried to VER-05 item 14. |

---

*Zero secret values appear in this document by contract. Only names, hosts, status codes, and aggregate counts. ASCII only.*
