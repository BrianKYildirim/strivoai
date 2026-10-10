# Phase 9 - Pre-Flip Production Baseline (D-04 criteria (c) and (d))

**Plan:** 09-03 (Task 3)
**Target:** production `zjpjapgraoxdukdvpjes` (strivoai)
**Status:** CAPTURED (read-only, VERIFIED). Awaiting operator approval.

| Field | Value |
|---|---|
| **Capture timestamp (UTC)** | **2026-07-11 ~09:20** |
| **Capture window** | last **24 hours** of prod edge-function logs + full `public.analysis_jobs` table |
| **Master flag state at capture** | `ANALYSIS_LIFECYCLE_ENABLED` = **OFF** (confirmed - production is running the LEGACY paths) |
| **Operator approval** | **approved** (2026-07-15; recorded in `09-ACTIVATION-PRECONDITIONS.md` s8 gate) |

---

> # THIS CAPTURE IS ONE-SHOT AND NON-REPRODUCIBLE.
>
> Once `ANALYSIS_LIFECYCLE_ENABLED` is on, the pre-flip state of production **can never be observed
> again**. D-04 criterion (c) ("any new 4xx/5xx error class not present in the pre-flip baseline") and
> criterion (d) (latency regression) would become **permanently unevaluable for this milestone**.

> **AGGREGATES ONLY.** No raw log lines, no user ids, no emails, no resume text, no auth uids, no
> secrets. Everything below is counts, status codes, and durations. The 09-02 PII guard
> (`src/test/security/phase9-pii-guard.test.ts`) scans this directory and fails the gate if an
> identifier lands here.

---

## Step 1 - Pre-flip status-class band, per function (the D-04 (c) + (d) baseline)

**Source:** production edge-function logs, last 24h. **VERIFIED.**

These are the **known pre-flip classes**. A status class appearing after a flip that is NOT in this
table, or a material worsening of a rate here, is the D-04 (c) abort signal.

| Function | Observed status codes | Observed latency | Notes |
|---|---|---|---|
| `analyze-resume` | **200** | 3.2 - 4.3 s | clean |
| `analyze-career` | **200**, **400**, **429** | - | **4xx already occurs pre-flip.** `400` and `429` are KNOWN classes - NOT new post-flip. |
| `grade-linkedin` | **200** | **57.7 s** | **pre-existing latency outlier - see below** |
| `recruiting-lens` | (no invocations in window) | - | **no baseline band** - see the gap note below |
| `submit-career-analysis-job` | **202** | - | async submit path |
| `process-career-analysis-job` | **200** | 2.2 - 5.7 s | internal worker |
| `get-analysis-job-status` | **200** | 0.7 - 1.6 s | poller |
| `ocr-pdf` | **200** | - | |
| `extract-analysis-structure` | **200** | 1.8 - 9.4 s | cron jobid 6 |
| `create-checkout-session` | **401** | - | **KNOWN pre-flip 401** (unauthenticated hits) - not new |
| `send-notification-email` | **401** | - | **KNOWN pre-flip 401** - not new |

**Three things the 09-11 soak MUST carry forward from this table:**

1. **`analyze-career` already emits `400` and `429` pre-flip.** Seeing them after a flip is **not** an
   abort - they are in the baseline. Only a *rate* regression is.
2. **`create-checkout-session` and `send-notification-email` already emit `401` pre-flip.** Also not
   new. Do not abort on them.
3. **`grade-linkedin` at 57.7 s is a PRE-EXISTING latency outlier**, recorded here so it is not
   misattributed to the lifecycle. If LinkedIn looks slow after its flip, **57.7 s is the number to
   compare against** - not the 3-5 s the other functions run at. Carried to VER-05 item 14.

**Coverage gap - `recruiting-lens` has NO pre-flip band.** It had no invocations in the capture
window, so there is nothing to compare its post-flip status classes against. It is **flip #1** in the
D-02 order (lowest blast radius). Mitigation for 09-11: treat *any* non-2xx on `recruiting-lens` after
its flip as suspect and investigate before proceeding to flip #2, rather than waving it through
against an absent baseline.

---

## Step 2 - Taxonomy-code histogram: **EMPTY, and that is the CORRECT result**

```sql
select coalesce(failure_code, '(null)') as failure_code, count(*) as occurrences
from public.analysis_jobs
group by failure_code
order by occurrences desc;
```

**VERIFIED RESULT: no taxonomy codes present. The pre-flip "known classes" set is EMPTY.**

This is **not** a failed capture. Production runs the **legacy** paths, and the legacy paths **do not
write taxonomy codes** - only the lifecycle does. An empty histogram is exactly what a correct
pre-flip capture of a dormant lifecycle looks like.

**Consequence for D-04 (c) - read this before the soak, or the criterion is unusable:**

Because the known-classes set is empty, a naive reading would make **every** taxonomy code appearing
post-flip "new", tripping the abort on the very first structured error. That is not the intent. D-04
(c) is therefore evaluated as:

1. **Any `UNKNOWN_ANALYSIS_ERROR` -> ABORT**, unconditionally. It is the fail-closed bucket; its
   presence means a failure mode escaped the taxonomy. No baseline comparison needed.
2. **Per-function status-class regression vs the Step 1 band -> ABORT.** Step 1 is the real
   like-for-like baseline, because it *is* populated by the legacy paths.
3. **A non-`UNKNOWN` taxonomy code appearing post-flip is EXPECTED and is not, alone, an abort.**
   These codes are the lifecycle's *structured replacements* for what were previously generic 500s.
   Seeing `MODEL_TIMEOUT` instead of an opaque 500 is the milestone **working**.

The 13 codes, for reference when reading the post-flip histogram: `INPUT_MISSING`, `FILE_NOT_FOUND`,
`FILE_EXTRACTION_FAILED`, `PROFILE_PARSE_FAILED`, `MERIT_RESERVATION_FAILED`, `MODEL_TIMEOUT`,
`MODEL_RATE_LIMITED`, `MODEL_INVALID_RESPONSE`, `MODEL_OUTPUT_TRUNCATED`, `SCHEMA_VALIDATION_FAILED`,
`DATABASE_SAVE_FAILED`, `MERIT_SETTLEMENT_FAILED`, `UNKNOWN_ANALYSIS_ERROR`.

---

## Step 3 - Latency band (D-04 (d))

Recorded from the observed prod ranges (aggregates only):

| Function | Observed band | Use as |
|---|---|---|
| `analyze-resume` | 3.2 - 4.3 s | regression ceiling |
| `grade-linkedin` | ~57.7 s | **pre-existing outlier** - the comparison point for LinkedIn, NOT the 3-5 s norm |
| `process-career-analysis-job` | 2.2 - 5.7 s | regression ceiling |
| `get-analysis-job-status` | 0.7 - 1.6 s | poller; sensitive to lifecycle polling changes |
| `extract-analysis-structure` | 1.8 - 9.4 s | cron path |
| `reap-stale-analysis-runs` | 4.4 - 5.8 s | see the pg_net timeout finding, `09-ACTIVATION-PRECONDITIONS.md` s3 |

**D-04 (d)** is measured against these bands. A material p95 regression for any function after a flip
is an abort.

---

## Step 4 - `analysis_jobs` state distribution (pre-flip)

```sql
select coalesce(state, '(null)') as state, count(*) as rows
from public.analysis_jobs
group by state
order by rows desc;
```

**VERIFIED RESULT - exactly ONE row:**

| `state` | Rows |
|---|---|
| **`NULL`** | **57** |

Oldest row `2026-03-19`, newest `2026-07-11 08:21`.

**This is the expected dormant pattern.** Production runs the legacy paths; only the lifecycle writes
the `state` column, so every one of the 57 rows has `state IS NULL`. If `state` were populated here,
the lifecycle would already be partly active on production and the premise of the staged activation
would be wrong. It is not. Good.

---

## Step 5 - Stuck non-terminal rows: **the 0 is REAL but PROVES NOTHING pre-flip**

The obvious query:

```sql
-- NAIVE FORM - returns 0, but the 0 is an ARTEFACT. Do not bank a green on this.
select count(*) as stuck_non_terminal
from public.analysis_jobs
where state not in ('completed', 'failed', 'refunded')
  and state_updated_at < now() - interval '20 minutes';
```

**VERIFIED RESULT: `0`.**

> ## WARNING: this 0 is VACUOUS. It is 0 BY CONSTRUCTION, not by health.
>
> All 57 rows have `state IS NULL` (Step 4). In SQL, `NULL NOT IN ('completed','failed','refunded')`
> evaluates to **NULL**, not TRUE - so the `WHERE` clause **excludes every single row**. This query
> would return `0` **even if every run on production were stuck.**
>
> **It is a real 0. It is not evidence of anything.** Do not record it as a passed safety check.

**What actually gives us D-04 (b) enforcement** is not this query but the **verified-healthy reaper**:
`reap_stale_analysis_runs` (jobid 10) is prod-targeted and returning HTTP 200 every 15 minutes (see
`09-ACTIVATION-PRECONDITIONS.md` sections 0 and 3). That is the real evidence, and it holds.

**NULL-safe form - this is what 09-11 MUST use post-flip:**

```sql
-- NULL-SAFE. Use this one during the soak. Counts legacy NULL-state rows too.
select count(*) as stuck_non_terminal
from public.analysis_jobs
where (state is null or state not in ('completed', 'failed', 'refunded'))
  and state_updated_at < now() - interval '20 minutes';
```

The stuck-row check becomes **meaningful** only once the lifecycle is on and actually writing `state`.
Pre-flip it is definitionally inert. Post-flip it is the primary D-04 (b) signal.

- [x] Naive form returns 0 - **recorded, and explicitly NOT counted as evidence.**
- [x] NULL-safe form handed to 09-11 as the real check.
- [x] D-04 (b) enforcement rests on the **verified-healthy reaper**, which is confirmed working.

---

## Sign-off

- [x] Capture timestamp + window recorded.
- [x] Step 1 status-class band recorded for the live AI functions, with the `recruiting-lens` gap, the
      `analyze-career` 400/429 known classes, and the `grade-linkedin` 57.7 s outlier called out.
- [x] Step 2 taxonomy histogram recorded - **empty is the correct pre-flip result**, and D-04 (c) is
      operationalized so it cannot be tripped vacuously.
- [x] Step 3 latency bands recorded.
- [x] Step 4 state distribution recorded (57 rows, all `state IS NULL` - the dormant pattern).
- [x] Step 5 stuck-row count recorded **with its vacuity stated**, plus the NULL-safe form for 09-11.
- [x] Zero raw log lines, zero user identifiers, zero secrets.
- [x] **Operator approved** (2026-07-15; recorded in `09-ACTIVATION-PRECONDITIONS.md` s8 gate checklist).

*Aggregates only, by contract. ASCII only.*
