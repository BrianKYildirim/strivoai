# CRON-PERF — Stagger the three `*/15` cron jobs (operator runbook)

**Target:** production `zjpjapgraoxdukdvpjes`
**Written:** 2026-07-24
**Who runs it:** operator. Claude is read-only on prod and cannot execute any step here.
**Type:** live `cron.alter_job` state change. **NOT a repo migration** — nothing in
`supabase/migrations/` changes, and re-running `deploy.ps1` will not reapply it.
**STATUS: APPLIED AND VERIFIED 2026-07-24.** Operator ran Steps 0-4; outputs are
inline below. Independently re-verified read-only by Claude — see "Outcome" section
at the end. No rollback needed.

---

## Why

Jobs 5, 6 and 10 are all `*/15`, so all three fire on the same minute, and job 11
(`keep-warm`, `*/5`) collides with them every third run. Observed at one boundary:

```
reap-stale-analysis-runs      500   24,583 ms
reset-subscription-merits     500   24,641 ms
extract-analysis-structure    200   23,574 ms
keep-warm                     200    7,407 ms
```

Functions that normally finish in 1.2-1.6 s took 20+ s at once. `pg_net` gives up at
5,000 ms, so the DB never learns the outcome (12 such timeouts in ~6 h, plus one
`{"error":"reaper_select_failed"}` 500).

Note the chosen minutes are **not multiples of 5**. That is deliberate: `keep-warm`
runs `*/5`, so any multiple-of-5 minute would still collide with it.

---

## Step 0 — Baseline (run BEFORE changing anything)

Record the current state so the after-comparison is meaningful.

```sql
-- 0a. Current schedules (screenshot / save the output)
select jobid, jobname, schedule, active
from cron.job
order by jobid;

-- 0b. Current HTTP-layer health (pg_net retains only ~6 h)
select status_code, count(*) as n, min(created) as first_seen, max(created) as last_seen
from net._http_response
where created > now() - interval '6 hours'
group by status_code
order by n desc;
```

Expect roughly: `200` majority, ~12 rows with `status_code IS NULL` (timeouts),
occasional `500`.

Output:

| status_code | n   | min                           | max                           |
| ----------- | --- | ----------------------------- | ----------------------------- |
| 200         | 131 | 2026-07-24 05:50:00.523943+00 | 2026-07-24 11:45:00.677017+00 |
| null        | 12  | 2026-07-24 06:00:00.958347+00 | 2026-07-24 11:00:00.234957+00 |
| 500         | 1   | 2026-07-24 11:00:00.234957+00 | 2026-07-24 11:00:00.234957+00 |

---

## Step 1 — Apply the stagger

Run all three together. `cron.alter_job` takes effect immediately; no restart needed.

```sql
select cron.alter_job(job_id := 5,  schedule := '2,17,32,47 * * * *');   -- reset-subscription-merits-sweep
select cron.alter_job(job_id := 6,  schedule := '7,22,37,52 * * * *');   -- extract_catchup_nightly
select cron.alter_job(job_id := 10, schedule := '12,27,42,57 * * * *');  -- reap_stale_analysis_runs
```

Leave job 11 (`keep-warm`, `*/5`) alone — it now has every multiple-of-5 minute to itself.
Leave jobs 4, 7, 8 alone — they are pure SQL and cheap.

---

## Step 2 — Confirm the change landed

```sql
select jobid, jobname, schedule, active
from cron.job
where jobid in (5, 6, 10, 11)
order by jobid;
```

Expected:

| jobid | jobname | schedule |
|---|---|---|
| 5 | reset-subscription-merits-sweep | `2,17,32,47 * * * *` |
| 6 | extract_catchup_nightly | `7,22,37,52 * * * *` |
| 10 | reap_stale_analysis_runs | `12,27,42,57 * * * *` |
| 11 | keep-warm-ping | `*/5 * * * *` |

Output:
| jobid | jobname                         | schedule            | active |
| ----- | ------------------------------- | ------------------- | ------ |
| 5     | reset-subscription-merits-sweep | 2,17,32,47 * * * *  | true   |
| 6     | extract_catchup_nightly         | 7,22,37,52 * * * *  | true   |
| 10    | reap_stale_analysis_runs        | 12,27,42,57 * * * * | true   |
| 11    | keep-warm-ping                  | */5 * * * *         | true   |

---

## Step 3 — Wait

Give it **at least 60 minutes** (4 full cycles of each job). Longer is better; 2-3 h
makes the comparison much more convincing.

---

## Step 4 — Verify it actually helped

```sql
-- 4a. HTTP outcomes since the change. Compare against the Step 0b baseline.
select status_code, count(*) as n
from net._http_response
where created > now() - interval '1 hour'
group by status_code
order by n desc;

-- 4b. Any remaining timeouts / errors, with detail
select id, status_code, left(coalesce(error_msg,''), 200) as error_msg,
       left(coalesce(content,''), 200) as content, created
from net._http_response
where created > now() - interval '1 hour'
  and (status_code is null or status_code >= 400)
order by created desc;

-- 4c. Cron layer should stay clean (this was ALREADY green - it is a
--     regression check, NOT the success signal; see the warning below)
select j.jobid, j.jobname,
       count(*) filter (where d.status = 'succeeded')  as succeeded,
       count(*) filter (where d.status <> 'succeeded') as not_succeeded
from cron.job j
left join cron.job_run_details d
  on d.jobid = j.jobid and d.start_time > now() - interval '1 hour'
group by j.jobid, j.jobname
order by j.jobid;
```

Output:
4A:
| status_code | n  |
| ----------- | -- |
| 200         | 23 |

4B:
Success. No rows returned

4C:
| jobid | jobname                         | succeeded | not_succeeded |
| ----- | ------------------------------- | --------- | ------------- |
| 4     | cleanup-rate-limit-counters     | 1         | 0             |
| 5     | reset-subscription-merits-sweep | 4         | 0             |
| 6     | extract_catchup_nightly         | 4         | 0             |
| 7     | benchmarks_nightly              | 0         | 0             |
| 8     | lifecycle_sweep_nightly         | 0         | 0             |
| 10    | reap_stale_analysis_runs        | 4         | 0             |
| 11    | keep-warm-ping                  | 12        | 0             |

### What success looks like

- **4a:** `status_code IS NULL` rows drop toward zero. That is the real signal.
- **4b:** returns no rows, or only isolated ones rather than one per `*/15` boundary.
- **4c:** unchanged (all succeeded).

### WARNING — do not use Step 4c as your success measure

`cron.job_run_details.status = 'succeeded'` only means the SQL **queued** the pg_net
request. pg_net is asynchronous, so a 401, a 500, or a timeout from the edge function
**still records as `succeeded`** at the cron layer. This is exactly what masked the
earlier 401 incident (quick 20260705). `net._http_response` is the authoritative
HTTP-layer view — always judge by 4a/4b.

Also: `net._http_response` retains only ~6 hours. Do not expect to look back further.

---

## Rollback

Fully reversible, no data involved:

```sql
select cron.alter_job(job_id := 5,  schedule := '*/15 * * * *');
select cron.alter_job(job_id := 6,  schedule := '*/15 * * * *');
select cron.alter_job(job_id := 10, schedule := '*/15 * * * *');
```

---

## If timeouts persist after staggering

Then the slow job is slow on its own, not merely contended. Likely
`extract-analysis-structure` (observed 23,574 ms / 5,313 ms; measured at 3,933 ms in
quick 260716-qtt, i.e. already near the 5 s cap). Options, in order of preference:

1. Raise the pg_net timeout for that one job by adding `timeout_milliseconds` to its
   `net.http_post(...)` call via `cron.alter_job(job_id := 6, command := ...)`.
   Requires rewriting the full command body — copy the existing one from Step 0a first.
2. Reduce its per-run batch size so each invocation does less work.

Attribution caveat: `net._http_response` does not record the request URL, so pinning
the timeouts to a specific function is inference from timing + edge-function logs, not
a hard join. If it matters, confirm against edge logs before acting on option 1 or 2.

---

## Outcome — RESOLVED (2026-07-24)

Operator applied Steps 1-2 between 11:45 and 12:00 UTC. Claude independently
re-verified read-only against prod at ~12:57 UTC (not merely reading the operator's
pasted output above).

### Headline

| Window | 200 | timeout (null) | 500 |
|---|---|---|---|
| Baseline, ~6 h pre-change | 131 | **12** | **1** (`reaper_select_failed`) |
| 90 min post-change | **38** | **0** | **0** |

### Volume sanity check (guards against a false "clean" result)

Expected HTTP calls per hour = job 5 (4) + job 6 (4) + job 10 (4) + job 11 keep-warm
(12) = **24/h**, so ~36 per 90 min. Observed **38**. Nothing is missing — the zero
timeouts are a genuine fix, not an artifact of fewer calls being made.

### Minute-of-hour distribution — the change is visible in the data

```
minutes 0,5,10,15,20,25       -> 1 call each   (keep-warm)
minutes 2,7,12,17,22,27       -> 1 call each   (the three staggered jobs, isolated)
minutes 30,45                 -> 5 calls each  (PRE-change collisions: 3 jobs + keep-warm)
minutes 32,37,42,47           -> 1 call each   (staggered; only fired on the 2nd pass)
```

The 90-minute window spans minutes 30-59 twice but 0-29 only once. That asymmetry
dates the cutover: collisions of 4 remained at `:30` and `:45`, then the distribution
becomes exactly one call per minute. Notably even those last two collided runs
returned 200.

### Interpretation

The contention was self-inflicted and the stagger removed it. Because no timeouts
remain, the "if timeouts persist" section below was NOT needed —
`extract-analysis-structure` was slow because it was contending, not because it is
inherently over the 5 s cap.

### Residual risk

This is live state, not a repo migration. If the project is ever rebuilt from a clean
`supabase/migrations/` history, these schedules revert to `*/15` and the contention
returns. Re-apply Step 1 in that event.
