# Phase 9 - Staging Activation (09-10)

**Plan:** 09-10
**Target:** PREVIEW / STAGING / TEST = the ONE non-prod Supabase project `cimjltzovkahkqecpwgi`
**Production (`zjpjapgraoxdukdvpjes`): NOT TOUCHED BY THIS PLAN.** Zero deploys, zero secret writes,
zero mutations. See section 6 for the (deliberate) limit on what Claude could even read on prod.

> **AGGREGATES, NAMES, IDs AND STATUS CODES ONLY.** No secret values, no raw model transcripts, no
> real-user data. The 09-02 PII guard (`src/test/security/phase9-pii-guard.test.ts`) scans this
> directory and fails the gate if an identifier lands here. ASCII only.

---

## 0. Headline

Three things this run established that the plan did not anticipate:

1. **The extended gate has real teeth — proven by an abort, not by an assertion.** The FIRST
   `deploy.ps1 -Env staging` run **aborted at `verify:baseline` before `supabase link`**, because the
   VER-02 anti-drift assertion caught a registry cell whose mapped test had been renamed by commit
   `3ad99602`. No project was linked; no function was deployed. A gate that has been *observed*
   stopping a deploy is stronger evidence than a gate that has only ever been observed passing.
2. **`MERIT_SYSTEM_ENABLED` was ALREADY `true` on preview before this plan ran** (set 2026-07-14
   14:34 UTC, i.e. during the recent Career-Compass quick task — **not** by Claude). Step D was
   therefore a *confirmation*, not a flip. Production remains untouched and out of scope (D-03).
3. **The prod apex+www CORS "re-proof" is NOT PERFORMABLE ON STAGING**, and reporting it as a green
   staging check would have been vacuous. `strivoai.net` / `www.strivoai.net` are correctly **not**
   in the preview project's `ALLOWED_ORIGINS` — preview is not served from those origins. The
   staging-correct assertion (with a positive control) is recorded in section 2 instead.

---

## 1. Task 1 - The real staged deploy (D-08 / VER-01 deployment validation)

| Field | Value |
|---|---|
| Command | `.\scripts\deploy.ps1 -Env staging` |
| Escape hatches used | **NONE.** Neither `-SkipVerify` nor `-SkipRemoteDbLane` was passed. |
| Run 1 (2026-07-14) | **ABORTED AT THE GATE** - `verify:baseline FAILED -- aborting deploy (no functions linked or deployed)`. Vitest lane red: `ver02-matrix.test.ts` anti-drift. Fixed in commit `1eace606`. |
| Run 2 (2026-07-14) | **GREEN -> linked -> deployed.** |
| Linked project ref | **`cimjltzovkahkqecpwgi`** (PREVIEW). Not prod. |
| Functions deployed | **38** |
| Repo commit deployed | `1eace606` |

### 1.1 The gate-GREEN line PRECEDES the `supabase link` line

This ordering **is** the VER-01 deployment-validation proof: `deploy.ps1` runs the seven-layer
`verify:baseline` as a HARD precondition, so a deploy that *reaches* `link` cannot have a red gate
behind it. Verbatim, consecutive lines from the run-2 console:

```text
verify:baseline GREEN -- proceeding to link + deploy.
Deploying env 'staging' -> Supabase project ref 'cimjltzovkahkqecpwgi'...
Finished supabase link.
```

And the run-1 counter-example, which proves the gate is not decorative:

```text
Test Files  1 failed | 97 passed (98)
C:\Projects\strive-ai-hired\scripts\deploy.ps1 : verify:baseline FAILED -- aborting deploy
(no functions linked or deployed).
```

### 1.2 The 38 deployed functions

`chat-agent`, `process-scheduled-emails`, `admin-delete-user`, `analyze-skills-gap`, `ocr-pdf`,
`send-feature-email`, `analyze-resume`, `send-strivo-email`, `analyze-career`,
`notify-admin-activity`, `test-email`, `notify-upgrade-approved`, `notify-upgrade-request`,
`send-credits-exhausted-email`, `compare-jobs`, `grade-linkedin`, `send-notification-email`,
`send-welcome-email`, `submit-resume-analysis-job`, `get-analysis-job-status`,
`process-resume-analysis-job`, `submit-career-analysis-job`, `process-career-analysis-job`,
`keep-warm`, `create-checkout-session`, `create-payment-intent`, `create-stripe-portal`,
`extract-analysis-structure`, `reap-stale-analysis-runs`, `stripe-webhook`,
`stripe-webhook-handler`, `reset-subscription-merits`, `admin-merit-metrics`,
`check-merit-alerts`, `interview-prep-analyze`, `interview-prep-evaluate`,
`lifecycle-archive-writer`, `recruiting-lens`.

---

## 2. Task 1 - Post-deploy CORS matrix (report item 4)

### 2.1 What the plan asked for, and why it cannot be answered on staging

The plan asked for an **apex + www** re-proof (`strivoai.net`, `www.strivoai.net`). Run against the
preview project, **every** origin returned no ACAO - apex, www AND evil alike.

Recording that as "evil fails closed - PASS" would have been **exactly the vacuous check this phase
keeps catching**: a no-ACAO response is indistinguishable from a completely broken CORS layer. A
check that returns the same answer for the origin you want allowed and the origin you want blocked
is not a check.

So the first thing established was a **POSITIVE CONTROL**: an origin that DOES get an ACAO echo on
preview. `http://localhost:8080` does. CORS is therefore functional on staging, and the prod apex /
www are simply **not in the preview project's `ALLOWED_ORIGINS`** - which is correct: the preview
project is not served from the production domains.

> **The apex+www re-proof is a PRODUCTION assertion.** It has been proven against prod before
> (04-06, 05-03) and belongs to plan **09-11**, not here. It is NOT claimed as proven on staging.

### 2.2 The staging-correct matrix (with positive control)

Live, post-deploy, against `https://cimjltzovkahkqecpwgi.supabase.co/functions/v1`:

| Function | Origin | Method | HTTP | ACAO | Vary |
|---|---|---|---|---|---|
| `recruiting-lens` | `http://localhost:8080` (allowlisted) | OPTIONS | 200 | `http://localhost:8080` | `Accept-Encoding, Origin` |
| `recruiting-lens` | `http://localhost:8080` (allowlisted) | POST (no auth) | **400** | **`http://localhost:8080`** | `Accept-Encoding, Origin` |
| `recruiting-lens` | `https://strivoai.net` | OPTIONS | 200 | (none) | `Accept-Encoding, Origin` |
| `recruiting-lens` | `https://www.strivoai.net` | OPTIONS | 200 | (none) | `Accept-Encoding, Origin` |
| `recruiting-lens` | `https://evil.example.com` | OPTIONS / POST | 200 / 400 | **(none)** | `Accept-Encoding, Origin` |
| `grade-linkedin` | `http://localhost:8080` (allowlisted) | OPTIONS | 200 | `http://localhost:8080` | `Accept-Encoding, Origin` |
| `grade-linkedin` | `http://localhost:8080` (allowlisted) | POST (no auth) | **401** | **`http://localhost:8080`** | `Accept-Encoding, Origin` |
| `grade-linkedin` | `https://strivoai.net` / `www` | OPTIONS / POST | 200 / 401 | (none) | `Accept-Encoding, Origin` |
| `grade-linkedin` | `https://evil.example.com` | OPTIONS / POST | 200 / 401 | **(none)** | `Accept-Encoding, Origin` |
| `analyze-resume` | `http://localhost:8080` (allowlisted) | POST (no auth) | **400** | **`http://localhost:8080`** | `Accept-Encoding, Origin` |
| `analyze-resume` | `https://evil.example.com` | OPTIONS / POST | 200 / 400 | **(none)** | `Accept-Encoding, Origin` |
| `analyze-career` | `http://localhost:8080` (allowlisted) | POST (no auth) | **401** | **`http://localhost:8080`** | `Accept-Encoding, Origin` |
| `analyze-career` | `https://evil.example.com` | OPTIONS / POST | 200 / 401 | **(none)** | `Accept-Encoding, Origin` |

**The four invariants that matter, all GREEN on staging:**

1. **ACAO survives the error path.** The allowlisted origin still gets its ACAO echoed on a **401 /
   400**, not just on the 200 preflight. (This is CORS-02, the original defect: a browser that
   cannot read the error body cannot show a structured error.)
2. **`Vary: Origin` on every response**, success and failure alike.
3. **Unapproved origins fail closed** - no ACAO for `evil.example.com`. (Also, correctly, none for
   the prod origins, which preview does not serve.)
4. **Never `*`.** The echo is always the exact request origin.

---

## 3. Steps A-C - Lifecycle activation on staging (D-01)

### 3.1 A zero-leak, typo-proof way to read a flag's EXACT value

`supabase secrets list` returns, per secret, a **SHA-256 digest of the value** - not the value. For a
flag whose entire domain is a handful of short known strings, that digest is a **known-plaintext
check**: it proves the exact byte content without ever disclosing (or even fetching) a value.

```text
sha256('true')  = b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b
sha256('false') = fcbcf165908dd18a9e49f7ff27810176db8e9f63b4352213741664245224f8aa
sha256('True')  = 3cbc87c7681f34db4617feaa2c8801931bc5e42d8d0f560e756dd4cd92885f18
sha256('1')     = 6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b
```

This directly discharges threat **T-09-10-B**: `analysis-flags.ts` accepts the EXACT lowercase string
`'true'` and nothing else, so a `True` / `1` / `yes` typo silently leaves the feature OFF and the
smoke would then measure the LEGACY path. Rather than trust that the `secrets set` command did what
was intended, **every flag below is verified against `sha256('true')` after the fact.** A case-variant
typo produces a visibly different digest and cannot pass.

### 3.2 Pre-existing posture (read BEFORE any change by this plan)

| Secret (preview) | Digest verdict | Set at |
|---|---|---|
| `ANALYSIS_LIFECYCLE_ENABLED` | `'false'` -> **OFF** | 2026-07-08 |
| `ANALYSIS_LIFECYCLE_CAREER_COMPASS` | `'false'` -> **OFF** | 2026-07-08 |
| `ANALYSIS_LIFECYCLE_RECRUITING_LENS` | **ABSENT** -> OFF | - |
| `ANALYSIS_LIFECYCLE_LINKEDIN` | **ABSENT** -> OFF | - |
| `ANALYSIS_LIFECYCLE_ONBOARDING` | **ABSENT** -> OFF | - |
| `ANALYSIS_LIFECYCLE_RESUME` | **ABSENT** -> OFF | - |
| `MERIT_SYSTEM_ENABLED` | **exact-lowercase `'true'` -> ON** | **2026-07-14 14:34** |

> ### Finding: `MERIT_SYSTEM_ENABLED` was ALREADY ON on preview before this plan started.
>
> It was set on 2026-07-14 at 14:34 UTC - during the recent Career-Compass quick task, which needed
> the merit path live on staging. **Claude did not set it, and did not need to.** Step D is therefore
> recorded as a **CONFIRMATION** of an existing operator-made posture, not as a new flip.
>
> Note this also means preview has been sitting in the **`MERIT=true` + lifecycle-OFF** state - the
> exact "middle row" of the D9-02 blast-radius table. That was the dangerous cell **before** commit
> `3ad99602` fixed the recruiting-lens post-save refundable throw. It is fixed, so the state is now
> benign; but it is worth stating that preview spent time in it.

### 3.3 Step A - the six lifecycle flags set to exact-lowercase `true` on preview

```bash
supabase secrets set \
  ANALYSIS_LIFECYCLE_ENABLED=true \
  ANALYSIS_LIFECYCLE_RECRUITING_LENS=true \
  ANALYSIS_LIFECYCLE_LINKEDIN=true \
  ANALYSIS_LIFECYCLE_ONBOARDING=true \
  ANALYSIS_LIFECYCLE_RESUME=true \
  ANALYSIS_LIFECYCLE_CAREER_COMPASS=true \
  --project-ref cimjltzovkahkqecpwgi        # <- explicit PREVIEW ref on every call (T-09-10-A)
```

Result: `{"project_ref":"cimjltzovkahkqecpwgi","count":6,...}`.

**Post-set digest verification** (not "the command said OK" - the actual stored bytes):

| Secret | Digest verdict |
|---|---|
| `ANALYSIS_LIFECYCLE_ENABLED` | exact-lowercase `true` -> **ON** |
| `ANALYSIS_LIFECYCLE_RECRUITING_LENS` | exact-lowercase `true` -> **ON** |
| `ANALYSIS_LIFECYCLE_LINKEDIN` | exact-lowercase `true` -> **ON** |
| `ANALYSIS_LIFECYCLE_ONBOARDING` | exact-lowercase `true` -> **ON** |
| `ANALYSIS_LIFECYCLE_RESUME` | exact-lowercase `true` -> **ON** |
| `ANALYSIS_LIFECYCLE_CAREER_COMPASS` | exact-lowercase `true` -> **ON** |
| `MERIT_SYSTEM_ENABLED` | exact-lowercase `true` -> **ON** (pre-existing, see 3.2) |

**7/7 verified as exact-lowercase `true`.** No case-variant typo is possible past this check.

### 3.4 Step C - POSITIVE lifecycle confirmation (the anti-vacuity gate)

One real Recruiting Lens analysis, then
`select id, feature, state, idempotency_key, merit_settled, refunded from public.analysis_jobs order by created_at desc limit 5;`

The result carries **its own negative control** - the rows immediately below the new one are pre-flip
legacy rows from the same table:

| `id` | `feature` | `state` | `idempotency_key` | `merit_settled` |
|---|---|---|---|---|
| **`bc1284c2-0d89-4b77-8e4c-52c78401ad4b`** | **`recruiting_lens`** | **`completed`** | **non-null, 64-char** | **true** |
| `5acfba92-...` (2026-07-13, pre-flip) | NULL | **NULL** | **NULL** | false |
| `47b0eefc-...` (2026-07-13, pre-flip) | NULL | **NULL** | **NULL** | false |
| `45bcdafb-...` (2026-07-13, pre-flip) | NULL | **NULL** | **NULL** | false |

**PASS.** The new row has a non-null `state` AND a non-null `idempotency_key`; every pre-flip row in
the same table has both NULL. The lifecycle is demonstrably executing, and the legacy path is
demonstrably what it replaced. This is not a 200 that "looks right" - it is a state machine that ran.

**Soak clock started only after this line.** (Pitfall 8.)

---

## 4. Steps E-F - Per-feature smoke + merit ledger

All inputs are `scripts/test-resumes/` synthetic fixtures (D-15), made unique per run with a UUID
marker so nothing can silently hit a cache/dedup path (the D9-03 lesson).

### 4.1 Step E - the five features

| Feature | run_id (`analysis_jobs.id`) | HTTP | Terminal `state` | `merit_settled` | `refunded` | Merit delta |
|---|---|---|---|---|---|---|
| **Recruiting Lens** | `bc1284c2-0d89-4b77-8e4c-52c78401ad4b` | 200 (34.7s) | `completed` | true | false | **-8, exactly one debit** |
| **LinkedIn** | **NONE - no row was ever created** | **500** (1.6s) | **n/a** | n/a | n/a | **none (not charged)** |
| **Onboarding** | `c45a14e1-97c8-4d51-8b57-49700e493d09` | 200 (45.1s) | `completed` | true | false | **-3, exactly one debit** |
| **Resume (streaming SSE)** | `2873d745-259b-4364-b07c-ed9b21f0d55d` | 200 (109.3s) | `completed` | true | false | **-3, exactly one debit** |
| **Career Compass** (async) | `4ec0fd15-7df4-438c-8f53-0e8109ab2bdb` | 202 -> worker | `completed` | true | false | **-3, exactly one debit** |

Career Compass was polled through its real transitions: `generating` -> ... -> `completed` (~70s), with
the legacy `status` dual-write tracking correctly (`processing` -> `completed`).

> ## 4.2 LINKEDIN IS BROKEN BY THE FLIP. See D9-06 (section 4.4). This is a P0 blocker for 09-11.

### 4.3 Step F - the financial invariants

Each debit is joined to its run on `idempotency_key` (the lifecycle's actual ledger linkage - see 4.5):

| Check | Result |
|---|---|
| Exactly ONE debit per run | **4/4 runs: `debits=1`.** No duplicate, no double-charge. |
| A refund iff the run failed | No run failed; **zero refunds**. Correct. |
| Rows with `merit_settled AND refunded` (DB constraint `analysis_jobs_settle_refund_excl`) | **0** |
| One submit producing TWO `analysis_jobs` rows (the 95%-hang signature: one keyed, one keyless) | **0** - 4 submits produced exactly 4 rows |
| D-04 (b) NULL-safe stuck non-terminal > 20 min | **0** |
| Balance arithmetic | reseeded 200 -> 192 after the -8 RCL debit; each later run reseeded and debited exactly its cost |

### 4.4 FINDING D9-06 (P0) - the LinkedIn Grader 500s on EVERY request once its flag is on

**Symptom:** `grade-linkedin` -> **HTTP 500** in **1.6s**, body
`{"error":"Failed to generate valid LinkedIn grade. Please try again.","code":"UNKNOWN_ANALYSIS_ERROR"}`.
**Zero** `analysis_jobs` rows with `feature='linkedin'` exist - the run was never even created. 1.6s
means it never reached Anthropic.

`UNKNOWN_ANALYSIS_ERROR` is the **D-04 criterion (c) UNCONDITIONAL-ABORT code** - the fail-closed
bucket, meaning a failure escaped the taxonomy.

**ROOT CAUSE (proven, not inferred).** `grade-linkedin` passes `jobType: 'linkedin_grading'` into the
lifecycle (`supabase/functions/grade-linkedin/index.ts:401`). That value is **not in the
`analysis_jobs_job_type_check` CHECK constraint.** `create_or_recover_analysis_run` INSERTs it, the
constraint rejects the row, the exception escapes classification, and the executor fail-closes.

Proven by direct INSERT probe against preview:

| `job_type` | `analysis_jobs_job_type_check` |
|---|---|
| `resume_analysis` | ALLOWED |
| `career_compass_analysis` | ALLOWED |
| `recruiting_lens` | ALLOWED |
| **`linkedin_grading`** | **REJECTED** |

The four working features map onto allowed values; **LinkedIn is the only one that does not.** This is
a plain omission: `20260409000001_add_recruiting_lens_job_type.sql` did exactly this widening for
Recruiting Lens when RCL migrated onto the lifecycle. Nobody did it for LinkedIn.

**Blast radius on production:** `linkedin` is **flip #2** in the D-02 order. Flipping it would have
made the LinkedIn Grader return 500 on **100% of requests**. Merits are NOT charged (the failure is
pre-reservation), so it is not a money-path defect - but the feature is dead.

**Fix (written, NOT applied to prod):**
`supabase/migrations/20260714000001_add_linkedin_grading_job_type.sql` - a one-value widening of the
CHECK constraint, byte-for-byte the same DROP-then-ADD idiom as the recruiting-lens precedent, with
rollback SQL in its header. Additive and re-runnable; it can invalidate no existing row.

> **NOT applied to preview either.** Preview's migration history carries a remote version
> (`20260714120000`) with no local file, so `supabase db push` refuses. Repairing migration history is
> an operator action, and a *verification* plan must not mutate it (the 09-05 precedent: report the
> finding, do not patch around it). The defect is fully proven WITHOUT applying the fix - the INSERT
> probe above is dispositive - and the causal chain is a single constraint value.

**09-11 IS BLOCKED ON THIS.** Do not flip `ANALYSIS_LIFECYCLE_LINKEDIN` on production until the
migration is applied to prod AND a LinkedIn grade is re-smoked green on staging.

### 4.5 FINDING D9-07 (HIGH) - the D-04 (a2)/(a3) abort queries are BLIND to synchronous lifecycle runs

The D-04 merit-anomaly abort queries in `09-ACTIVATION-PRECONDITIONS.md` s7.2 are both gated on
`merit_transaction_id IS NOT NULL`:

```sql
select count(*) from public.analysis_jobs
where state = 'completed' and merit_transaction_id is not null and not merit_settled;   -- (a2)
```

**But `runAnalysisLifecycle` NEVER WRITES `merit_transaction_id`.** Only the async submit paths
(`submit-career-analysis-job`, `submit-resume-analysis-job`) do. The lifecycle links a run to its
merit ledger row by **`idempotency_key`**, not by that column. Verified in source
(`_shared/analysis-lifecycle.ts`, `_shared/merit-gateway.ts`: zero writers) and in the RPC's own
INSERT column list (`20260702000001`, which does not include it).

**Live proof:** run `bc1284c2` is a `completed` recruiting_lens run carrying a **real -8 merit debit**
- and its `merit_transaction_id` is **NULL**. Both (a2) and (a3) skip it entirely.

Measured on preview:

| | rows |
|---|---|
| lifecycle rows (`idempotency_key` NOT NULL) | 12 |
| ...of those, with `merit_transaction_id` NOT NULL | 9 |
| **(a2) scope AS WRITTEN** (`state='completed' AND merit_transaction_id NOT NULL`) | **4** |
| **(a2) scope CORRECTED** (`state='completed' AND idempotency_key NOT NULL`) | **7** |

Per feature: `recruiting_lens` **0/1** rows carry the column; `career_compass` 9/11 (it goes through
the submit path, which does set it).

**Consequence:** the synchronous features - **recruiting_lens, linkedin, resume, onboarding: FOUR of
the five, including flip #1** - produce runs that criteria (a2) and (a3) **cannot see**. Those two
money-path abort checks would return 0 during the production soak no matter what went wrong on them.
This is the same "a check that cannot fail is not a check" class this phase has now caught eight
times.

**Corrected form for 09-11 - key off `idempotency_key`, which the lifecycle ALWAYS sets:**

```sql
-- (a2) a completed run whose merits were reserved but never settled.
select count(*) as a2_completed_unsettled
from public.analysis_jobs
where state = 'completed' and idempotency_key is not null and not merit_settled;

-- (a3) a failed/refunded run still holding a reservation that was neither settled nor released.
select count(*) as a3_failed_unreleased
from public.analysis_jobs
where state in ('failed', 'refunded')
  and idempotency_key is not null
  and not refunded and not merit_settled
  and state_updated_at < now() - interval '20 minutes';
```

> **Caveat 09-11 must handle:** production runs with `MERIT_SYSTEM_ENABLED=false` (D-03) reserve no
> merits at all, so a completed prod run may legitimately have `merit_settled=false`. The corrected
> (a2) must therefore be read against the prod merit posture, or joined to `merit_transactions` on
> `idempotency_key` to confirm a reservation actually exists before calling an unsettled run an
> anomaly. Do not paste it in unqualified.

Criterion **(a1)** (`merit_settled AND refunded`) and criterion **(b)** (the NULL-safe stuck-row form)
are unaffected - both were verified 0 above.

### 4.6 Observation - the four `STRIPE_PRICE_MERIT_*` IDs are ABSENT on preview

`MERIT_SYSTEM_ENABLED=true` is live on preview without them. Merit **deduction** demonstrably works
(the whole ledger above). They gate the merit **SHOP** (`_shared/shop-pack-resolver.ts` builds a
`STRIPE_PRICE_MERIT_<n>` name), so buying a merit pack on staging would fail to resolve a price. Not a
blocker for this plan; recorded so it is not mistaken for a regression later.

---

## 5. Step B - The frontend build-time flag (Vercel) - OPERATOR ACTION, NOT DONE HERE

`VITE_FEATURE_ANALYSIS_LIFECYCLE` is a **BUILD-time** Vite var. It does **not** flip with the
Supabase edge secrets, and Claude has no Vercel deploy access. Flipping it requires setting the var
on the Vercel project and **REDEPLOYING** the staging build.

**This is deliberately NOT a blocker for anything in section 3 or 4.** The frontend flag gates only
the `useAnalysisRun` *recovery surface* (`docs/ENVIRONMENT.md`, and the rollback note in
`09-ACTIVATION-PRECONDITIONS.md` s7.1). The backend lifecycle - states, idempotency, merit safety -
is gated purely by the six edge secrets and is fully exercisable without it, which is what sections 3
and 4 do (via direct authenticated edge invocation, the same wire contract the browser uses).

What the frontend flag would additionally exercise: browser-side refresh / navigate-away recovery
re-attaching to a `run_id`. Recorded as an explicit gap, not silently skipped.

---

## 6. D-03 - Production containment

**What Claude did to production in this plan: NOTHING.**

- Every `supabase secrets set` carried an explicit `--project-ref cimjltzovkahkqecpwgi`.
- Every `supabase secrets list` carried an explicit `--project-ref cimjltzovkahkqecpwgi`.
- `deploy.ps1 -Env staging` maps to `cimjltzovkahkqecpwgi` by an explicit `switch` in the script
  (`scripts/deploy.ps1:82-90`), and the run's own console line confirms the linked ref.
- No prod SQL, no prod deploy, no prod secret write.

**The one thing Claude could NOT do (and did not work around):**

The plan asked for a **names-only read of the PRODUCTION secret list**, before and after, to prove
`MERIT_SYSTEM_ENABLED` is absent/false on prod. The command
`supabase secrets list --project-ref zjpjapgraoxdukdvpjes` was **BLOCKED by the operator's own
production guard**, which read the task's "no prod secrets" limit literally.

That is the guard working correctly, and it was **not circumvented**. The consequence is honest and
must be stated rather than papered over:

> **The D-03 assertion "production `MERIT_SYSTEM_ENABLED` is absent/false" is NOT proven by this
> plan. It is carried to the operator (below) and to plan 09-11.**

The supporting (weaker) evidence that already exists: `docs/ENVIRONMENT.md` records it as unset on
both stores as of 2026-06-23, and `09-ACTIVATION-PRECONDITIONS.md` s4 independently confirms prod
cron jobid 5 (`reset-subscription-merits-sweep`) has never fired without anyone noticing - which is
only possible **because** the merit system is off on prod. That is circumstantial, not a direct read.

### OPERATOR: the one command that closes D-03

```bash
supabase secrets list --project-ref zjpjapgraoxdukdvpjes
```

Expected: `MERIT_SYSTEM_ENABLED` is **absent**, or present with digest
`fcbcf165908dd18a9e49f7ff27810176db8e9f63b4352213741664245224f8aa` (= `sha256('false')`).
If it shows `b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b` (= `sha256('true')`),
**STOP** - production has the global merit gate on, which D-03 forbids.

**Operator result:** `____`

---

## 7. Sign-off

- [x] Staged deploy run with NO escape hatches; gate GREEN precedes `supabase link`; preview ref.
- [x] Gate proven to have teeth by an observed ABORT (run 1), not only by a pass.
- [x] CORS matrix recorded with a POSITIVE CONTROL; ACAO survives the 401; evil fails closed.
- [x] apex+www re-proof correctly declared NOT PERFORMABLE on staging (it is a 09-11 prod assertion).
- [x] Step A - six lifecycle flags exact-lowercase `true` (digest-verified, 7/7).
- [x] Step C - positive lifecycle confirmation (non-null `state` + non-null `idempotency_key`).
- [x] Step D - `MERIT_SYSTEM_ENABLED` confirmed ON on preview (pre-existing; Claude did not set it).
- [x] Steps E/F - per-feature smoke + merit ledger: **4 of 5 features GREEN**, exactly one debit each,
      zero settle+refund violations, zero double-row submits, zero stuck rows.
- [ ] **LinkedIn: RED. D9-06 (P0).** Blocked pending the job_type migration.
- [x] Only `scripts/test-resumes/` synthetic fixtures used (D-15). E2E test user restored to
      `tier=free`, `merits=10` afterwards.
- [ ] Step B - Vercel build-time flag + redeploy (OPERATOR).
- [ ] Section 6 - PROD `MERIT_SYSTEM_ENABLED` names-only read (OPERATOR).
- [x] Zero secret values in this document. Zero production mutations.

---

## 7b. POST-MIGRATION ADDENDUM - flip #2 (LinkedIn) PROVEN end-to-end

**Superseded:** section 7b originally recorded LinkedIn as deliberately OFF, pending the D9-06
migration. **The migration has since been applied to PREVIEW** (by the orchestrator, via the preview
MCP; **production is NOT migrated - the operator is applying it**). This section records the
end-to-end re-smoke.

### 7b.1 Why a re-smoke was mandatory

D9-06 was found by an **INSERT probe** - a static proof that the constraint rejected the value. That
is not the same as proving a LinkedIn grade *works*. "The migration fixes it" was an **inference**.
LinkedIn is flip #2 on production, so the inference had to become evidence.

### 7b.2 The constraint, re-verified INDEPENDENTLY (and shown to still be able to reject)

Re-probed rather than taken on trust:

| `job_type` | verdict |
|---|---|
| `linkedin_grading` | **ACCEPTED** (was REJECTED before the migration) |
| `bogus_never_valid` | **REJECTED** |

The constraint was **widened, not dropped** - it still rejects a value that should never be valid. A
constraint that accepts everything would have "fixed" LinkedIn while silently destroying the guard.

### 7b.3 The live end-to-end LinkedIn grade (flip #2)

Flag flipped ON in preview and digest-verified as exact-lowercase `true`. Input: the **synthetic
"Taylor Rivera" LinkedIn profile** derived directly from
`scripts/test-resumes/generate-synthetic-linkedin-pdf.mjs` (D-15), 59 lines / 1839 chars, with a
per-run UUID marker so no cache/dedup path can be hit. `free_linkedin_scan_used` was forced `true` so
the **MERIT path** was exercised rather than the free scan.

| Evidence | Before the migration | **After** |
|---|---|---|
| HTTP | **500** | **200** |
| Latency | **1.6s** (never reached Anthropic) | **41.5s** (a real model call) |
| Response `code` | **`UNKNOWN_ANALYSIS_ERROR`** | **none** |
| `rawScore` | none | **86** |
| `sectionBreakdown` | none | **4 sections** (the 08.1/08.3 four-section rubric) |
| `analysis_jobs` rows with `job_type='linkedin_grading'` | **ZERO - never created** | **1** |
| `state` | n/a | **`completed`** (legacy `status` dual-write: `completed`) |
| `idempotency_key` | n/a | **non-null, 64-char** |
| `failure_code` | n/a | **null** |

**run_id: `5059547b-352f-427a-bd7c-9b99576d198e`**

**Merit ledger, joined ON `idempotency_key`** (per-key, not per-user):

| Check | Result |
|---|---|
| Debits for this run's key | **1 -> charged exactly once** |
| Amount | **-3**, `feature=linkedin_grading` |
| Balance | 200 -> **197** (delta exactly -3) |
| `merit_settled` / `refunded` | **true / false** |

### 7b.4 Error-class sweep - and proof it is not vacuous

| Check | Result |
|---|---|
| `linkedin_grading` rows with ANY `failure_code` | **0** |
| `linkedin_grading` rows with `UNKNOWN_ANALYSIS_ERROR` (the D-04(c) abort code) | **0** |
| State distribution | `{"completed": 1}` |

**Can this check fail?** Yes - `analysis_jobs.failure_code` is populated in practice: **6 rows** carry
one, across three distinct codes actually observed (`INPUT_MISSING`, `input_validation`,
`SCHEMA_VALIDATION_FAILED`). So a clean LinkedIn sweep is a real result, not a column nobody writes.

> **Honest nuance:** `UNKNOWN_ANALYSIS_ERROR` has **never** been persisted to `analysis_jobs` - not
> even during the D9-06 outage. That is *because* the failure was the row INSERT itself: no row
> existed to carry a failure code, so the error lived only in the HTTP response body. **A DB-only
> sweep could never have caught D9-06.** It took an actual request. This is worth carrying into 09-11:
> a soak that watches only the `failure_code` histogram is blind to any failure that happens *before*
> the run row is created.

### 7b.5 D9-07 / D9-08 corroborated on this run

The new LinkedIn row has `merit_transaction_id = **NULL**` while carrying a real -3 debit - exactly as
D9-07 predicted for a synchronous lifecycle feature. This independently re-confirms both:

- **D9-07:** D-04's original (a2)/(a3) would not have seen this run at all.
- **D9-08:** the reaper's `const hasMerit = !!row.merit_transaction_id` (`reap-stale-analysis-runs/index.ts:200`)
  would read **false** for this run, so had it stranded, its reservation would **never be released**.

### 7b.6 FINAL staging flag posture left behind

| Flag (preview `cimjltzovkahkqecpwgi`) | State |
|---|---|
| `ANALYSIS_LIFECYCLE_ENABLED` | **ON** |
| `ANALYSIS_LIFECYCLE_RECRUITING_LENS` | **ON** |
| **`ANALYSIS_LIFECYCLE_LINKEDIN`** | **ON** - flipped back on and PROVEN working |
| `ANALYSIS_LIFECYCLE_ONBOARDING` | **ON** |
| `ANALYSIS_LIFECYCLE_RESUME` | **ON** |
| `ANALYSIS_LIFECYCLE_CAREER_COMPASS` | **ON** |
| `MERIT_SYSTEM_ENABLED` | **ON** (pre-existing) |

**All seven flags are ON in staging, and all five features are now proven green.** This is the full
lifecycle-ON posture D-01 asked for.

The E2E baseline account was restored to `tier=free`, `merits=10`, `free_linkedin_scan_used=false`, so
the Playwright suite's assumptions are unchanged.

### 7b.7 What remains blocking for 09-11

**PRODUCTION IS STILL ON THE 3-VALUE CONSTRAINT.** `20260714000001` has been applied to **preview
only**. Flip #2 on production remains **HARD BLOCKED** until the operator applies it to prod. The
staging proof above is what makes that flip safe *once the migration lands* - it is not a substitute
for landing it.

---

## 8. What this changes for 09-11 (production activation)

| # | Item | Effect on 09-11 |
|---|---|---|
| **D9-06** | LinkedIn 500s on every request once its flag is on (`job_type='linkedin_grading'` violates the CHECK constraint) | **HARD BLOCK on flip #2.** Apply `20260714000001` to prod FIRST, then re-smoke LinkedIn green on staging. Flips #1/#3/#4/#5 are unaffected. |
| **D9-07** | D-04 (a2)/(a3) are blind to synchronous lifecycle runs (`merit_transaction_id` is never written by the executor) | **The soak's money-path abort criteria must be replaced** with the `idempotency_key` form in 4.5 before the first flip - otherwise flip #1 (recruiting_lens) is policed by two queries that cannot fail. |
| - | The lifecycle-ON posture itself | **PROVEN on staging** for recruiting_lens, onboarding, resume, career_compass: real state machines, real ledger rows, charged exactly once. |

**Operator decision (type "approved" or list issues):** `____`
