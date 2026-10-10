# Phase 9 - Production Activation Runbook (09-11)

**Plan:** 09-11
**Target:** PRODUCTION `zjpjapgraoxdukdvpjes` (strivoai)
**Preconditions:** ALL gate items in `09-ACTIVATION-PRECONDITIONS.md` s8 are checked (2026-07-15).
**Companion:** `09-REAL-ACCOUNT-EVIDENCE.md` (the VER-04 per-run evidence sheet - same activity, D-13).

> **AGGREGATES, NAMES, IDs, STATUS CODES ONLY.** No secret values, no raw model transcripts, no
> real-user data. The 09-02 PII guard scans this directory and fails the gate if an identifier lands
> here. Use ONLY `scripts/test-resumes/` synthetic fixtures. ASCII only.

---

## 0. What is being done, and the two facts that shape it

The lifecycle ships DORMANT on prod (all six `ANALYSIS_LIFECYCLE_*` flags OFF -> legacy paths). This
runbook flips them ON **one at a time, in ascending blast radius (D-02)**, each with a >=30-minute
soak and a merit-ledger check before the next. Flip a flag, immediately exercise it with the Free and
Elite test accounts, capture `run_id` + terminal state + merit delta + redacted screenshot, move on.

Two facts differ from the plan's original assumptions and MUST frame every money check below:

1. **`MERIT_SYSTEM_ENABLED` is ON on production and that is intended** (D-03 as originally written was
   falsified; the ledger shows merits live since 2026-05-21). So lifecycle runs on prod DO reserve and
   settle merits: a healthy completed run has `merit_settled = true` and **exactly one** debit. The
   money-path abort criteria are therefore LIVE and meaningful on every flip - not inert.
2. **Both money-path fixes are already deployed to prod.** D9-02 (recruiting-lens post-save refundable
   throw -> log-and-continue) and D9-08 (the reaper releases lifecycle runs by `idempotency_key`, and
   the lifecycle now persists `merit_transaction_id` leaving `reserving_merits`). D9-06 (the
   `linkedin_grading` job_type) is live on prod - constraint re-verified read-only 2026-07-15.

---

## 1. Roles and the exact-value contract

| Actor | May do |
|---|---|
| **OPERATOR (you)** | `supabase secrets set` on prod; run analyses on the Free + Elite accounts; capture screenshots. |
| **CLAUDE (me)** | READ-ONLY `select` against prod + read edge logs, to run the confirmation + soak queries and interpret them. NEVER a prod mutation. |

Every flag value is the **exact lowercase string `true`** - NOT `True`, `TRUE`, `1`, `yes`, or `on`.
`analysis-flags.ts` is fail-closed and exact-lowercase-only BY DESIGN (T-09-11-E): a case-variant
means nothing activates and the soak silently measures the LEGACY path. After each `set`, the
POSITIVE CONFIRMATION query (s3) is what proves the flip actually took - never trust "the command said
OK". Optionally digest-verify with `supabase secrets list` against
`sha256('true') = b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b`.

---

## 2. The shared query library (I run all of these read-only)

### 2.1 POSITIVE lifecycle confirmation - run AFTER each flip, BEFORE the soak clock starts

```sql
select id, feature, state, idempotency_key, merit_settled, refunded, created_at, state_updated_at
from public.analysis_jobs
where created_at > :flip_time
order by created_at desc
limit 10;
```

PASS = the just-run analysis appears with a **non-null `state`** AND a **non-null `idempotency_key`**.
FAIL (null state/key) -> STOP: case-variant typo, the feature did not activate. Fix and re-confirm.
Do NOT start the soak clock until this passes.

### 2.2 Non-vacuity guard - run FIRST, every soak, before trusting any zero below

```sql
select
  count(*) filter (where aj.state is not null)           as lifecycle_runs,
  count(*) filter (where mt.idempotency_key is not null)  as runs_joined_to_a_debit
from public.analysis_jobs aj
left join public.merit_transactions mt
  on mt.idempotency_key = aj.idempotency_key and mt.amount < 0
where aj.created_at > now() - interval '24 hours';
```

If `lifecycle_runs > 0` but `runs_joined_to_a_debit = 0`, the (a2)/(a3)/(a4) `exists`-gated checks are
BLIND - STOP and diagnose the join before reading any count as a pass.

### 2.3 Money-path anomaly set (a1-a4) - D9-07-corrected, keys on `idempotency_key`

```sql
-- (a1) a run both settled AND refunded (flags live on analysis_jobs; DB constraint should forbid).
select count(*) as a1_settled_and_refunded
from public.analysis_jobs
where merit_settled and refunded;

-- (a2) a completed run whose merit was charged but never settled.
select count(*) as a2_completed_unsettled
from public.analysis_jobs aj
where aj.state = 'completed' and not aj.merit_settled
  and exists (select 1 from public.merit_transactions mt
              where mt.idempotency_key = aj.idempotency_key and mt.amount < 0);

-- (a3) a failed/refunded run charged and never released, past the reaper window.
select count(*) as a3_failed_unreleased
from public.analysis_jobs aj
where aj.state in ('failed', 'refunded') and not aj.refunded and not aj.merit_settled
  and aj.state_updated_at < now() - interval '20 minutes'
  and exists (select 1 from public.merit_transactions mt
              where mt.idempotency_key = aj.idempotency_key and mt.amount < 0);

-- (a4) the double-charge detector: no idempotency_key may carry more than one debit.
-- The `idempotency_key is not null` guard is REQUIRED (legacy NULL keys collapse into a phantom 1).
select count(*) as a4_double_charged_runs
from (
  select mt.idempotency_key
  from public.merit_transactions mt
  where mt.amount < 0 and mt.source = 'feature-deduct' and mt.idempotency_key is not null
  group by mt.idempotency_key
  having count(*) > 1
) dup;
```

All four must be **0**. On prod (MERIT ON) a completed run legitimately settles, so (a2) has no
false-positive caveat here - an unsettled charged completed run is a real anomaly.

### 2.4 Stuck non-terminal (D-04 b) - NULL-safe form

```sql
select count(*) as stuck_non_terminal
from public.analysis_jobs
where (state is null or state not in ('completed', 'failed', 'refunded'))
  and state_updated_at < now() - interval '20 minutes';
```

Must be **0**. (A `retryable_failed` row between 20 and 25 min is not yet an abort - that sweep's
worst case is ~25 min; re-check once.)

### 2.5 Double-row submit + new-error-class (D-04 c) + per-run ledger

```sql
-- exactly one row per submit; one debit per run; refund iff failed. Scope to the soak window.
select aj.id, aj.feature, aj.state, aj.merit_settled, aj.refunded, aj.failure_code,
       (select count(*) from public.merit_transactions mt
        where mt.idempotency_key = aj.idempotency_key and mt.amount < 0) as debits
from public.analysis_jobs aj
where aj.created_at >= :flip_time
order by aj.created_at;

-- D-04(c): ANY UNKNOWN_ANALYSIS_ERROR in the window -> unconditional ABORT.
select failure_code, count(*)
from public.analysis_jobs
where created_at >= :flip_time and failure_code is not null
group by failure_code;
```

### 2.6 Reaper health - edge logs, NOT net._http_response

Reaper health is read from **edge-function logs** (`status_code = 200`, ~4.4-5.8 s), never from
`cron.job_run_details` (vacuous - queues on 401) nor `net._http_response` (still ~5 s phantom
timeouts unless 6b/6d fully drained). Query in `09-ACTIVATION-PRECONDITIONS.md` s3.

---

## 3. The five green criteria (evaluated at the end of EACH soak)

1. **Zero rows stuck non-terminal > 20 min** (2.4).
2. **Exactly-one-debit per run AND refund-iff-failed** (2.3 a-set + 2.5 per-run), with the
   non-vacuity guard (2.2) proven live first.
3. **Zero `merit_settled AND refunded`** (2.3 a1) and **zero double-charged keys** (2.3 a4).
4. **Zero new error classes vs `09-PREFLIP-BASELINE.md`**; ANY `UNKNOWN_ANALYSIS_ERROR` -> abort (2.5).
5. **p95 latency within the pre-flip band** (`09-PREFLIP-BASELINE.md`).

All five green -> proceed to the next flip. ANY red -> ABORT (s5).

---

## 4. The six flip blocks (EXACT D-02 order)

For every block: (1) you `set` the one secret; (2) you note `flip_time` and run ONE analysis of that
feature; (3) I run 2.1 and confirm the lifecycle is live BEFORE the clock starts; (4) you exercise it
with BOTH the Free and Elite account across resume-only and resume+LinkedIn states; (5) soak >= 30
min; (6) I run the five green criteria; (7) proceed or abort. `MERIT_SYSTEM_ENABLED` is re-confirmed
ON at each block (it is the prod-intended posture).

### Flip 0 - master switch

```bash
supabase secrets set ANALYSIS_LIFECYCLE_ENABLED=true --project-ref zjpjapgraoxdukdvpjes
```

Master-only changes nothing user-visible (every feature flag still OFF). No soak; proceed to Flip 1.
Leave this ON for the whole rollout.

### Flip 1 - Recruiting Lens (Elite-gated)

```bash
supabase secrets set ANALYSIS_LIFECYCLE_RECRUITING_LENS=true --project-ref zjpjapgraoxdukdvpjes
```

- Confirm (2.1) -> exercise Elite (real grade) + Free (**expect `403 elite_required`** - record the
  403 as the correct outcome, not a failure) -> soak >= 30 min -> five green criteria.
- D9-02 note: this is the feature whose post-save refundable throw was the money bug; its fix is
  deployed. Watch (a1) and (a4) especially.

### Flip 2 - LinkedIn Grader

```bash
supabase secrets set ANALYSIS_LIFECYCLE_LINKEDIN=true --project-ref zjpjapgraoxdukdvpjes
```

- **Pre-check (I run, read-only):** the prod `analysis_jobs_job_type_check` includes `linkedin_grading`
  (VERIFIED 2026-07-15 - D9-06 live on prod). If somehow absent -> STOP, do not flip.
- Confirm (2.1) -> exercise Free + Elite -> soak >= 30 min -> five green criteria. Pre-D9-06 this
  feature 500'd on 100% of requests; the green re-smoke on staging (09-10 s7b) is what makes this safe.

### Flip 3 - Onboarding

> **DEVIATION D9-10 (runbook sequencing correction, 2026-07-16).** The FIRST prod onboarding
> attempt (edge flag set 21:19 UTC, run 21:52 UTC) returned `analyze-resume 200 ~49s` but wrote
> ZERO `analysis_jobs` rows -> it ran the LEGACY streaming path, so the onboarding edge flag was
> never reached. Root cause: onboarding is a FRONTEND-routed feature. `src/pages/Onboarding.tsx`
> only sends the `origin:'onboarding'` discriminator when `isAnalysisLifecycleEnabled()` (i.e.
> the BUILD-time `VITE_FEATURE_ANALYSIS_LIFECYCLE`) is `true`; otherwise it takes the legacy
> fire-and-forget branch and the backend `analyze-resume` never enters `runAnalysisLifecycle`
> (`analyze-resume` L1165 gates on `rawBody.origin === 'onboarding'`). Flips 1-2 were unaffected
> because Recruiting Lens + LinkedIn are BACKEND-decided (edge flag only).
>
> **Consequence:** the Vercel `VITE_FEATURE_ANALYSIS_LIFECYCLE` flip + prod frontend REDEPLOY must
> precede Flips 3 (Onboarding) and 4 (Resume) - NOT follow all six edge flips as originally
> sequenced in s4. The frontend flag is global (onboarding + resume routing on at once), but the
> BACKEND per-feature flags still gate execution: with `ONBOARDING=true` and `RESUME`/`CAREER_COMPASS`
> still off, a resume/career run sends the lifecycle signal but the backend falls through to the
> byte-identical legacy path. Execution-level blast radius stays one-feature-at-a-time.

> **DEVIATION D9-11 (frontend crash exposed by the flag, FIXED, 2026-07-16).** After the Vercel flag
> flip, onboarding DID route through the lifecycle - backend run `3c01d645` reached `completed`,
> `merit_settled`, one debit, no refund: the money path is healthy and onboarding is BACKEND-confirmed.
> But the Results page black-screened on `cannot add 'postgres_changes' callbacks ... after subscribe()`.
> Root cause: `useAnalysisRun` is a plain hook mounted on BOTH Onboarding and Results; the handoff runs
> two instances that recover the same run_id and both opened the bare `analysis-run-<runId>` topic, so
> supabase-js handed the second the already-subscribed channel and its `.on()` threw (no error boundary
> -> black screen). This was latent because 09-10 confirmed onboarding via DB rows, never by driving the
> onboarding->results UI on a deployed lifecycle build. **Operator rolled the lifecycle-enabled BUILD
> back and redeployed to protect users.** CORRECTION (D9-12, 2026-07-17): this line previously read
> "rolled the Vercel flag back to `false`". That was WRONG and it misled the D9-12 re-flip. Only the
> DEPLOYMENT was reverted; the Vercel Production env var `VITE_FEATURE_ANALYSIS_LIFECYCLE` was never
> changed and remained `"true"` throughout. Verify flag state with `vercel env pull`, never by
> inferring it from a dashboard timestamp. Fix landed: unique per-instance channel topic + regression test
> (commit `ebbce9a3`); pre-existing baseline red reconciled (`41fa98c3`). Full unit suite green (659).
>
> **Re-enable requires deploying the FIXED build first.** Do not re-flip `VITE_FEATURE_ANALYSIS_LIFECYCLE`
> until the build containing `ebbce9a3` is the one live on prod.

**Prerequisite (do BEFORE the edge flip below):** deploy the fixed frontend (containing `ebbce9a3`) to
Vercel **Production**, THEN set `VITE_FEATURE_ANALYSIS_LIFECYCLE=true` and **redeploy**. Hard-refresh
before re-running so the redeployed bundle is served. Re-verify the onboarding->results view renders
(no black screen) BEFORE starting the soak.

> **DEVIATION D9-12 (Flip 3 re-enabled unintentionally; outcome GREEN, 2026-07-17).** A GitHub/Vercel
> integration outage blocked every git-triggered deploy, so the fixed build was shipped via
> `vercel --prod` (CLI direct upload, no GitHub involvement) at 23:37 UTC. This was intended as a
> no-op "deploy the fix with the flag still OFF" step. It was NOT a no-op: Claude asserted the flag
> was `false` by INFERRING it from a "2h ago" dashboard timestamp instead of reading the value. The
> var was actually `"true"` (see the D9-11 correction above), so the CLI build baked the lifecycle ON
> and aliased it to www.strivoai.net. With edge `ANALYSIS_LIFECYCLE_ONBOARDING` already true since
> 22:05, this constituted Flip 3 - executed without the operator gate the runbook requires.
>
> **Mitigating facts:** the deployed build was the FIXED one (live bundle verified to contain
> `analysis-run-${t}-${++FZ}`, the unique-topic fix); prod traffic is ~1 user; zero runs occurred
> between the deploy and the operator's verification. Exposure window carried no user impact.
>
> **Process lesson (binding):** NEVER infer a flag/secret's VALUE from a modification timestamp. Read
> it (`vercel env pull`). A step asserted to be a no-op must have its no-op precondition VERIFIED, not
> assumed - the whole safety argument rests on that precondition.
>
> **Outcome:** the operator verified the render immediately; onboarding->results rendered with NO
> black screen, confirming the D9-11 fix on a live lifecycle build - the exact evidence Flip 3 needed.
> Flip 3 is recorded GREEN on its merits below, with `flip_time` = the deploy that actually enabled it.

**D9-12 evidence notes (read before interpreting the ledger for this window):**

1. **`merit_transaction_id` is a RESERVATION id, not an FK into `merit_transactions`.** There is no
   FK (`pg_constraint` confirms none on `analysis_jobs`). Joining `analysis_jobs.merit_transaction_id`
   to `merit_transactions.id` returns all-NULL for EVERY lifecycle run ever - including flips 1-2,
   which were independently confirmed green. Such a join is a QUERY ARTIFACT, not a ledger anomaly.
   Claude raised a false anomaly on exactly this join before checking the schema.
2. **A `signup-grant` is `amount > 0` but is NOT a refund.** Filter refunds by `source`, not by sign.
3. **Account deletion orphans runs but cascades the ledger.** Confirmed live FK chain:
   `profiles.id -> auth.users(id) ON DELETE CASCADE`; `merit_transactions.user_id -> profiles(id)
   ON DELETE CASCADE`; `user_merits.user_id -> profiles(id) ON DELETE CASCADE`; `analysis_jobs` has
   NO FK. Operator deleted a Google test account at ~23:49 UTC and re-signed-up with the same
   address. Its two runs (`773984ef`, `f440b70a`) survive as ORPHANS with `user_id` 69586487 (no
   `auth.users` row, no profile) while their debits were cascade-deleted. "Completed + settled with
   no debit" for those two rows is FULLY EXPLAINED by the deletion - not a revenue leak. See
   `deferred-items.md` (orphaned-analysis_jobs-on-user-deletion) for the integrity/PII follow-up.
4. **A 404 from `get-analysis-run-status` is BY DESIGN.** `useAnalysisRun` (L88-98) treats
   404 -> `FILE_NOT_FOUND` as the authoritative signal to clear a stale tracked `run_id`. The 404 in
   the D9-12 console trace is page-load recovery correctly discarding a leftover run. Not an error class.

```bash
supabase secrets set ANALYSIS_LIFECYCLE_ONBOARDING=true --project-ref zjpjapgraoxdukdvpjes
```

Confirm (2.1) -> exercise Free + Elite -> soak >= 30 min -> five green criteria.

### Flip 4 - Resume (streaming SSE)

```bash
supabase secrets set ANALYSIS_LIFECYCLE_RESUME=true --project-ref zjpjapgraoxdukdvpjes
```

Confirm (2.1) -> exercise Free + Elite, resume-only AND resume+LinkedIn states -> soak >= 30 min ->
five green criteria. (Resume is the highest-traffic surface; this is the largest blast radius, hence
second-to-last.)

### Flip 5 - Career Compass (async submit/poll)

```bash
supabase secrets set ANALYSIS_LIFECYCLE_CAREER_COMPASS=true --project-ref zjpjapgraoxdukdvpjes
```

Confirm (2.1) -> exercise Free + Elite -> soak >= 30 min -> five green criteria. Career Compass goes
through the async submit path, so poll its transitions (`generating` -> ... -> `completed`) and confirm
the legacy `status` dual-write tracks.

---

## 5. ABORT - flip master OFF immediately on ANY red

```bash
supabase secrets set ANALYSIS_LIFECYCLE_ENABLED=false --project-ref zjpjapgraoxdukdvpjes
```

Instant (read at REQUEST time, no redeploy) and restores every legacy path byte-identically. Then:
1. Confirm the legacy path serves one live analysis per affected feature.
2. Run the (a1-a4) ledger queries; the reaper releases any stranded reservation within ~25 min -
   verify it drains to 0.
3. Record trigger + evidence + timestamps in this file. Do NOT re-flip until the cause is understood.
4. Do NOT touch `MERIT_SYSTEM_ENABLED` during an abort - it stays ON (prod-intended).

Abort triggers (D-04): merit-ledger anomaly (double-charge / missing refund on a failed run / settle
without a saved result); a run stuck non-terminal > ~20 min; any `UNKNOWN_ANALYSIS_ERROR` or a
per-function HTTP status-class regression vs the pre-flip baseline; a user-visible quality/latency
regression vs the p50/p95 band.

---

## 6. Recorded flips (operator fills as we go)

| Flip | Secret | flip_time (UTC) | Lifecycle confirmed (2.1) | Soak start | Soak end | 5 criteria | Verdict |
|---|---|---|---|---|---|---|---|
| 0 | `ANALYSIS_LIFECYCLE_ENABLED` | 2026-07-15 06:19 | n/a (master) | n/a | n/a | n/a | ON |
| 1 | `ANALYSIS_LIFECYCLE_RECRUITING_LENS` | 2026-07-15 06:19 | YES - run `941bb986` completed, key present, -8, 1 debit | 2026-07-15 06:31 | 2026-07-15 07:01 | 5/5 (stuck 0; a1-a4 all 0; non-vacuity 1/1 live; error histogram empty; only a 200 @ ~49s, no RCL band -> "any non-2xx suspect" mitigation, none seen) | **GREEN** |
| 2 | `ANALYSIS_LIFECYCLE_LINKEDIN` | 2026-07-15 07:38 | YES - Elite `fb4d2801` + Free `41bd6bf8` both completed, keys present, -3 each, 1 debit each | 2026-07-15 07:43 | 2026-07-15 08:13+ | 5/5 (stuck 0; a1-a4 all 0; non-vacuity 3/3 live; error histogram empty; both runs ~45s, faster than the documented 57.7s grade-linkedin outlier) | **GREEN** |
| 3 | `ANALYSIS_LIFECYCLE_ONBOARDING` | edge 2026-07-16 22:05; frontend effective 2026-07-16 23:37 (D9-12 CLI deploy) | YES - UI: onboarding->results rendered, NO black screen (D9-11 fix live, bundle verified). DB: run `14d21f20` (free) completed, settled, exactly one -3 `feature-deduct`, no refund | 2026-07-16 23:51 | 2026-07-17 00:21 | 5/5 (non-vacuity 4 live runs; stuck 0; failed/failure_code 0; completed-unsettled 0; refunds-by-source 0; dup-idempotency debits 0; no new error classes - all 200 except the ONE by-design 404 stale-run clear; latency see caveat) | **GREEN (Free only - Elite NOT yet exercised; latency caveat below)** |
| 4 | `ANALYSIS_LIFECYCLE_RESUME` | 2026-07-17 05:45 | YES - `c3b2ba20` state=`completed` + key present, settled, one -3 debit (vs the 02:08 PRE-flip legacy control: -3 debit, NO lifecycle row -> controlled proof the flip took) | 2026-07-17 05:47 | 2026-07-17 06:18 | 5/5 (soak 31:01; non-vacuity 16 runs; a1-a4 all 0; stuck 0; failure_code 0; UNKNOWN_ANALYSIS_ERROR 0; resume p95 49.60s / max 49.98s inside the 43-51s live band, no cold-start outlier) | **GREEN** |
| 5 | `ANALYSIS_LIFECYCLE_CAREER_COMPASS` | 2026-07-17 07:20 | YES - `7a54e6e5` (Free) state=`completed`, key present, settled, one -3 debit, legacy `status` dual-write tracks | n/a - stopped before soak | n/a | NOT EVALUABLE: Elite fails ~2 of 3 runs on BOTH paths, flag-independent (D9-18). Free passed on the lifecycle. | **INCONCLUSIVE - flag returned to false 07:36 and STAYS false (never activate onto an unevaluable feature). NOT a lifecycle regression; D9-16's causal claim is RETRACTED - see s11.** |

---

## 7. Sign-off (checked when all six flips are green or the abort is fully recorded)

- [x] Flip 0 master ON (2026-07-15 06:19 UTC).
- [x] Flip 1 Recruiting Lens: confirmed live (run `941bb986`), >=30-min soak, five green criteria met.
- [x] Flip 2 LinkedIn: prod constraint pre-checked, confirmed live (runs `fb4d2801`, `41bd6bf8`), >=30-min soak, five green criteria met.
- [x] Flip 3 Onboarding: confirmed live (`state`+key, 4/4), >=30-min soak, five green. VER-04 coverage
      COMPLETE both tiers with DURABLE ledger evidence (Free `dda6fa21`, Elite `162eb183`). Arrived at
      via D9-12 (unintended re-enable); see D9-14 (latency/baseline defect) + D9-15 (wrong-column
      first pass, re-run verbatim, verdict held).
- [x] Flip 4 Resume: confirmed live (`c3b2ba20`), >=30-min soak (31:01), five green. VER-04 coverage
      COMPLETE both tiers across resume-only AND resume+LinkedIn, every row with a SURVIVING debit
      (no deletions this pass). The 02:08 pre-flip legacy control makes this the only flip proven
      by a before/after controlled comparison rather than by confirmation alone.
- [ ] Flip 5 Career Compass: **NOT SIGNED OFF (inconclusive)**. Free passed on the lifecycle
      (`7a54e6e5`). Elite is NOT evaluable: it fails ~2 of 3 runs on BOTH the lifecycle AND the legacy
      path (D9-18) - a PRE-EXISTING production bug this milestone did not cause and must not claim to
      have caused. `repairTruncatedJSON` mangles a 28905-char UNCAPPED response into a 6509-char stub.
      Flag stays `false` until Elite is healthy on LEGACY first. D9-16's "lifecycle broke it" claim is
      RETRACTED (n=1 per arm against an intermittent failure).
- [ ] `09-REAL-ACCOUNT-EVIDENCE.md` covers Free + Elite across resume-only + resume+LinkedIn.
- [ ] `MERIT_SYSTEM_ENABLED` re-confirmed ON at each flip (prod-intended posture).
- [ ] No production mutation by Claude - read-only confirmation/soak queries only.

---

*Zero secret values in this document by contract. Names, hosts, status codes, aggregate counts only. ASCII only.*

---

## 8. Flip 3 latency finding (D9-14) - the pre-flip band for `analyze-resume` is NOT comparable

**Observed, Flip 3 soak (edge logs, `analyze-resume` POST 200):**

| Run | Duration | Note |
|---|---|---|
| `773984ef` | **147.7 s** | FIRST analysis after the 23:37 CLI deploy |
| `f440b70a` | 49.5 s | |
| `14d21f20` | 49.4 s | |
| `eaf30954` | 43.6 s | +40 min later, separate session |

**Finding:** the 147.7 s run is a real 3x outlier at the edge-function level (not a DB artifact). It did
NOT recur across the three subsequent runs, which cluster at **43.6-49.5 s** - consistent with the
~45-49 s observed on flips 1-2. Best explanation: first-run-after-deploy cold start (possibly an
Anthropic retry/backoff). This is corroborated by three subsequent runs, NOT merely asserted.

**The baseline defect (matters for VER-05):** `09-PREFLIP-BASELINE.md` Step 1/Step 3 record
`analyze-resume` at **3.2 - 4.3 s** and designate that band the "regression ceiling". That band cannot
represent a real analysis - every genuine resume analysis observed on prod takes ~44-50 s. The capture
therefore measured non-analysis invocations, so **criterion 5 is unevaluable against it for the resume
path**. This is the SAME class of gap the baseline already self-reported for `recruiting-lens` ("no
pre-flip band"), now known to affect `analyze-resume` too.

**Verdict:** treated as a BASELINE CAPTURE DEFECT, not a Flip 3 latency regression. Flip 3's steady
state (43.6-49.5 s) matches the only trustworthy comparators available (flips 1-2's live runs).

**VER-05 obligation:** the milestone report must NOT cite the 3.2-4.3 s band as a satisfied latency
ceiling. Either re-capture a real per-function band from live runs, or state plainly that criterion (d)
was evaluated against live flip-1/2 comparators rather than the recorded baseline. Do not paper over it.

**Still outstanding for Flip 3 sign-off:** only the **Free** account has been exercised (onboarding,
resume-only). **Elite has NOT been exercised**, and `09-REAL-ACCOUNT-EVIDENCE.md` requires Free + Elite
across resume-only + resume+LinkedIn. Flip 3 is GREEN on its five criteria but its VER-04 real-account
evidence is INCOMPLETE.

---

## 9. D9-15 - Flip 3 criteria were FIRST evaluated with the WRONG COLUMN; re-run verbatim (verdict holds)

**What happened:** the first pass at the five green criteria (commit `8e5492ba`) was run against
`analysis_jobs.status` - the LEGACY queue column - instead of `state`, the LIFECYCLE column. It also
skipped `refunded` entirely, never ran (a1), and used an improvised non-vacuity guard that did not
join on `idempotency_key`. `analysis_jobs` carries BOTH `status` and `state`; the legacy dual-write
keeps them agreeing on the happy path, which is exactly why the wrong instrument still LOOKED green
and the error was invisible. s2.1 exists to prevent precisely this ("PASS = non-null `state` AND
non-null `idempotency_key`") and it was not followed.

**Re-run verbatim against s2.1/2.2/2.3/2.4/2.5 - the verdict HOLDS:**

| Check (canonical form) | Result |
|---|---|
| 2.1 confirmation: non-null `state` + non-null `idempotency_key` | PASS - 4/4 runs `state='completed'`, keys present, `merit_settled=true`, `refunded=false` |
| 2.3 a1 settled AND refunded | 0 |
| 2.3 a2 completed unsettled | 0 |
| 2.3 a3 failed unreleased | 0 |
| 2.3 a4 double-charged keys | 0 |
| 2.4 stuck non-terminal > 20 min | 0 |
| 2.5 `failure_code` in window | 0 |

**The finding the correct guard exposed (this is the part that matters):**

```
2.2 non-vacuity:  lifecycle_runs = 6   runs_joined_to_a_debit = 1
```

(a2)/(a3)/(a4) are `exists`-gated on the debit join. D9-13's deletion cascade destroyed the debits for
5 of the 6 runs, so for those runs **those three checks pass VACUOUSLY - they are blind**. The guard as
written only trips at `runs_joined_to_a_debit = 0`, so `1` reads as a full pass while 83% of the window
is unevaluable. **Flip 3's money-path evidence therefore rests on ONE run (`eaf30954`), not four.**

`8e5492ba` claimed "money path exact on both live-owner runs". That was TRUE when measured (both
carried exactly one -3 debit) but is NO LONGER VERIFIABLE: `14d21f20`'s owner was deleted after the
fact and its debit cascaded away. This is D9-13's forensics-destructibility hazard materializing
within the hour - the evidence for a green flip was destroyed by a routine test-account deletion.

**Actions required (do NOT let these pass into VER-05 silently):**

1. **Strengthen the 2.2 guard.** Zero-based is insufficient. Make it RATIO-based: if
   `runs_joined_to_a_debit < lifecycle_runs`, name which run_ids are unevaluable and why, rather than
   reporting a bare pass. A guard that cannot distinguish "all clean" from "mostly unmeasurable" is
   not a guard.
2. **Flip 4/5 soaks must NOT delete test accounts mid-window.** Deletion silently voids the money-path
   evidence for every run that account made. If an account must be recycled, capture the ledger rows
   FIRST.
3. **VER-05 must state the evidence strength honestly:** Flip 3 = 4 runs confirmed on the lifecycle
   (state + key + settled + not-refunded, unconditional), but exactly 1 run with surviving debit
   evidence. Do not report "4 runs, money path green".

**Verdict unchanged: Flip 3 GREEN** on the criteria as written - a1 and stuck are unconditional and
clean, 2.1 confirmation is unconditional and passed 4/4, and the one evaluable run is exact. The
weakness is in EVIDENCE DURABILITY and guard sensitivity, not in the observed behavior of the system.

---

## 10. D9-16 - Flip 5 ABORTED - **THE CAUSAL CLAIM BELOW WAS WRONG. SEE s11 (D9-18) FIRST.**

> **RETRACTED 2026-07-17 07:45.** This section concluded "the lifecycle path breaks Elite Career
> Compass" from a single ON-fail / OFF-pass pair. A THIRD run with the flag still `false` failed
> IDENTICALLY. The failure is INTERMITTENT and flag-INDEPENDENT; the 07:36 legacy success was luck,
> not a control. The lifecycle did NOT cause this. The A/B evidence below is preserved verbatim as
> the record of a wrong inference - read s11 for what is actually happening.

**Status: RED. Feature flag `ANALYSIS_LIFECYCLE_CAREER_COMPASS` returned to `false` at 07:36 UTC.**
Career Compass serves the legacy path and is verified working. Root cause NOT yet determined - this
section records the EVIDENCE, not a diagnosis. Do not re-flip until the mechanism is understood.

**Abort scope note (deliberate):** s5 says "flip MASTER off on any red". The FEATURE flag was turned
off instead, and that is the correct scope here: master-off would also revert Flips 1-4, which are
GREEN and signed off. The red is confined to one feature; the remedy was confined to the same feature.
Legacy Career Compass was re-verified working immediately after (full-quality Elite output, 63.7 s).

**The controlled A/B (this is why "the lifecycle caused it" is a FINDING, not a suspicion):**

| Lifecycle | Time (UTC) | run_id | Result | Duration |
|---|---|---|---|---|
| **ON** | 07:30:50 | `ed2c7975` | **FAILED** - `output-incomplete`, missing `Surprise Fits, Fields, Roles, Roadmap` | 66.2 s |
| **OFF** | 07:36:15 | (legacy, no run row) | **Full-quality output** | 63.7 s |

Same user, same tier (`elite`), same inputs (resume 3677 chars, LinkedIn PDF 1915 chars), same deploy,
minutes apart. The ONLY variable was the feature flag. Both runs logged
`tier-resolved ... tier=elite source=internal-db`, so this is **NOT** the RC-1 / 260713-hrd
tier-derivation hazard - that one is genuinely defused.

**Free is NOT affected.** `7a54e6e5` (Free, lifecycle ON) completed in 34.3 s with one -3 debit and the
legacy `status` dual-write tracking correctly. The break is Elite-specific.

**The strongest lead (UNPROVEN - hand this to the debug session):** Elite is the only tier that makes
TWO AI calls - `CAREER_CALL_CONFIGS` gives Elite `base` (8000 tok) + `elite-extras` (2000 tok), while
Free gets `maxTokensFree: 0` on `elite-extras` and therefore makes ONE call. So the Elite-only,
lifecycle-only failure lives in the two-call path or its merge. The missing set argues AGAINST simple
truncation: `careerDNA`, `readiness` and `skillGaps` were PRESENT while `surpriseFits`, `fields`,
`roles`, `roadmap` were missing - `skillGaps` sits late in the Elite skeleton, so a clean cut-off would
not have kept it. The failed row stored NO `result` and NO `error`, and `input_fingerprint` is NULL.

**The MONEY PATH PASSED, and this is worth stating plainly.** The failed Elite run was charged and then
REFUNDED within 66 s - `state='failed'`, `merit_settled=false`, `refunded=true`, ledger `-3
feature-deduct` 07:30:50 -> `+3 feature-refund` 07:31:56 (reason `career_incomplete_output`). This is
exactly what `5cec5c1b` ("Career Compass charged 3 Merits for a failed report and lied about
refunding") was written to fix, demonstrated on a REAL production failure rather than a fixture. Had
the flip preceded the 07:0x prod deploy, that Elite user would have eaten 3 Merits for nothing. The
deploy was load-bearing; the pre-flip deploy check earned its keep.

**Secondary finding - the failure code is LYING (fix before VER-05 cites it):** the run recorded
`failure_code='FILE_EXTRACTION_FAILED'`, `failure_stage='generating'`. Extraction plainly SUCCEEDED
(resume 3677 chars + LinkedIn 1915 chars both read and logged). The real condition was
`incomplete_output`. A model-output failure wearing a file-extraction label will send the next
responder to the wrong subsystem entirely - it cost time even in this session, where the true
condition was visible in the logs. `incompleteOutputResponse` does not appear to stamp a matching
`failure_code`. Route to the debug session with D9-16.

**Evidence-integrity note (D9-15 discipline):** a refund row carries `feature=null` and is NOT keyed by
`idempotency_key`, so a "refunds joined on idempotency_key" query returns 0 even when the refund
happened. Filter refunds by `source='feature-refund'`. The a-set in s2.3 keys debits on
`idempotency_key` and is unaffected, but any NEW refund query must not repeat this.

---

## 11. D9-18 - RETRACTION of D9-16 + the REAL root cause: `repairTruncatedJSON` destroys a complete response

**This section supersedes s10's causal claim.** Elite Career Compass is broken **on BOTH paths**. The
lifecycle is NOT implicated. Elite Career Compass is broken in PRODUCTION RIGHT NOW, on the legacy
path that 100% of users are served, independent of every flag in this runbook.

**The full Elite sample (all three runs, 2026-07-17):**

| Time | `ANALYSIS_LIFECYCLE_CAREER_COMPASS` | Result |
|---|---|---|
| 07:30 | `true` | FAILED - `output-incomplete` (`ed2c7975`, refunded) |
| 07:36 | `false` | succeeded, full quality, 63.7 s (`ca476e36`) |
| 07:40 | `false` | **FAILED - `output-incomplete`, IDENTICAL missing set** (`ee3134ae`, refunded) |

2 of 3 Elite runs FAIL regardless of the flag. The failure is INTERMITTENT and model-output-dependent.

**How the wrong conclusion happened (the methodological lesson, which is the point of writing this):**
s10 declared causation from ONE run per arm - n=1 vs n=1 - against an intermittent failure, and
labelled it "a FINDING, not a suspicion". A single success in the OFF arm cannot distinguish "the flag
fixed it" from "this run got lucky". The A/B was structurally incapable of supporting the claim it was
used for. **A controlled A/B against a non-deterministic failure requires repeats in BOTH arms.** The
operator's unprompted third run is the only reason this was caught before it reached VER-05.

**The REAL root cause (from the 07:40 log - a smoking gun, though the mechanism needs confirmation):**

```
json-repair-applied   reqId=c3e5f86f  originalLen=28905  repairedLen=6509
output-incomplete     tier=elite      missing=[Surprise Fits, Fields, Roles, Roadmap]
[PERF] claude-haiku-4-5  OK in 70.10s  in=4513  out=8124  maxTokens=10000
```

1. **The model was NOT capped:** `out=8124` against `maxTokens=10000`. So `stop_reason` is not
   `max_tokens`, and `isTruncatedResponse` (which keys EXCLUSIVELY on
   `stop_reason === 'max_tokens'`, L277-278) returns FALSE. **The truncation detector has a blind spot
   and the repair path walks straight through it.**
2. **The response nevertheless ends mid-structure:** `tail200` terminates at `...$1.6M-$2.1M.` with no
   closing brace - 28905 chars of unparseable JSON.
3. **`repairTruncatedJSON` then does the exact harm its own code comment predicts** (L271: *"would
   helpfully close the braces on the half-written JSON and hand back a parseable stub"*): it collapses
   **28905 chars -> 6509 chars, discarding 77% of the report**, including precisely the four sections
   the completeness gate then rejects. The gate is not the bug - the gate is the only thing WORKING,
   catching a mutilated report before it could be saved and shown as real.

**Why this matters more than the flip it blocked:** Career Compass is one of the two business-critical
flows named in CLAUDE.md. Elite is the PAYING tier. This is live on prod today at roughly a 2-in-3
failure rate, and it is NOT caused by anything in this milestone - the lifecycle merely happened to be
the lens that exposed it. The Free/Elite polarity (Free healthy, paid broken) is the worst possible
one.

**The money path is SOUND on both paths and that is genuinely proven now:** the legacy failure
refunded too (`-3 feature-deduct` 07:40:06 -> `+3 feature-refund` 07:41:17). Lifecycle refunded at
07:31:56. Both paths charge-then-refund correctly on a real Elite failure. Users lose nothing but
their time and the report they came for.

**Flip 5's real status: INCONCLUSIVE, not RED-because-of-the-lifecycle.** Free PASSED on the lifecycle
(`7a54e6e5`). Elite could not be EVALUATED on the lifecycle, because Elite is broken on both paths -
there is no healthy baseline to compare against. Keeping the flag `false` remains correct (never
activate onto an unevaluable feature), but the recorded REASON in s10 was wrong.

**Route to the debug session (D9-16 + D9-17 + D9-18 are ONE investigation):** why does the model emit
28905 chars of unparseable JSON while under its token cap; why does `isTruncatedResponse` only
recognise `stop_reason='max_tokens'` when a structurally-incomplete-but-uncapped response is
demonstrably reachable; and should `repairTruncatedJSON` be allowed to return a stub that silently
drops 77% of a report rather than failing loudly. Do NOT re-flip Career Compass until Elite is healthy
on the LEGACY path first.
