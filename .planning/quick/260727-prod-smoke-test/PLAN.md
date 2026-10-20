# Production Smoke Test — Operator-Driven, Claude-Verified

**Target:** https://strivoai.net (PROD, Stripe LIVE mode)
**Date:** 2026-07-27
**Method:** Operator drives the browser. Claude verifies each step read-only against prod DB/logs.
**Constraints honoured:** no service-role credentials requested, no load traffic generated.

---

## Pre-flight baseline (captured 2026-07-27, read-only)

| Invariant | Result | Evidence |
|---|---|---|
| Duplicate jobs per idempotency key | **0** | `analysis_jobs` grouped by `idempotency_key` |
| Duplicate merit tx per idempotency key | **0** | `merit_transactions` grouped by `idempotency_key` |
| Terminal failures left unrefunded | **0** | `state='failed' AND feature IS NOT NULL AND refunded=false` |
| Negative merit balances | **0** | `user_merits` |
| Admin role rows | **1** — `strivolife@gmail.com` only | `user_roles` (table summary says 0 — stale planner stat; real count is 1) |
| Migrations applied | through `20260726140000` | `supabase_migrations.schema_migrations` |
| Stale `retrying` jobs (>1h) | **4** (resume_analysis, 07-24→07-25) | all `refunded=true`, `attempts=0`, `available_at` in past |

**Null `idempotency_key` rows (160) are benign** — refunds, signup grants, subscription
resets, backfills, and pre-rollout deducts. Every `feature-deduct` since 2026-07-15 carries a key.

### Open items the baseline already flags

1. **4 resume_analysis jobs stuck in `retrying` forever** — `attempts=0`, `available_at` in
   the past, never re-claimed. Consistent with the pre-fix queue/worker 401
   (fixed on staging in `d4bb5adf`, 2026-07-26). **Unverified whether that edge-function fix is
   deployed to prod** — migrations are current, but edge functions deploy separately.
   → Flow 2R below is the decisive test.
2. **career_compass `INPUT_MISSING` × 9** (2026-07-23 → 07-25), all from synthetic QA account
   `ydtyf@web-library.net`. Payload contains BOTH `resumeFilePath` and `linkedinPdfContent`,
   yet the run fails at `failure_stage='generating'` with `last_http_status=null`.
   Inputs present but reported missing → suspected stale storage object. → Flow 4.

---

## Accounts to use (already exist on prod)

| Role | Email | Tier | Balance |
|---|---|---|---|
| Free (existing) | `vvfwu@web-library.net` | free | 10 |
| Free (low balance) | `ydtyf@web-library.net` | free | 1 |
| Elite (existing) | `fhefv@web-library.net` | elite | 150 |
| Admin | `strivolife@gmail.com` | — | admin role |
| Free (NEW) | create a fresh disposable address | — | for onboarding |

---

## Protocol

For each flow: perform the steps, then tell me **"flow N done"**. I run the verification
query and return PASS/FAIL before you proceed. Do not batch flows — per-step verification is
what makes the charge/job counts unambiguous.

Record for every screen: did any **raw technical error** appear (stack trace, `TypeError`,
`null`, HTTP status code, Supabase/Postgres error text, function name)? User-facing copy
must be plain-language.

---

### Flow 1 — Onboarding (new Free account)

1. Sign up with a fresh disposable email.
2. Complete onboarding, upload a resume, trigger the first analysis. **Single click.**
3. Note: time to first feedback, whether the button disables on click.

**I verify:** exactly 1 signup grant, exactly 1 job, exactly 1 deduct, profile + user_merits row created.

---

### Flow 2 — Resume Analysis, Free tier (single click)

Account: `vvfwu@web-library.net` (balance 10).

1. `/upload` → upload resume → click Analyze **once**.
2. Wait for the result to render fully.

**I verify:** 1 job row, `state='completed'`, exactly 1 `feature-deduct` for `resume_analysis`,
balance decreased by exactly the feature cost, 0 refunds.

---

### Flow 2R — Queue path completion (decisive for the 4 stuck jobs)

Same account, immediately after Flow 2.

1. Run a second resume analysis. If the UI ever shows "queued"/"still working", let it run to completion.

**I verify:** the job reaches `state='completed'` and is **not** left in `retrying`.
A job that lands in `retrying` with `attempts=0` and stays there = the worker fix is **not deployed to prod** → launch blocker.

---

### Flow 3 — Duplicate clicks do not duplicate work

Account: `fhefv@web-library.net` (Elite, 150).

1. Upload a resume. **Double-click Analyze rapidly (2–3 clicks within ~1s).**
2. Then open a **second tab** on the same account and start the same analysis again.

**I verify:** exactly **1** job and exactly **1** deduct across both tabs. >1 of either = blocker.

---

### Flow 4 — Career Compass (targeted INPUT_MISSING repro)

Account: `ydtyf@web-library.net` — the account that produced all 9 failures.

1. Run Career Compass with a **freshly uploaded** resume.
2. Then run it again **reusing the previously stored resume** (do not re-upload).

Step 2 is the suspected repro: a stale `resumeFilePath` pointing at a deleted storage object.

**I verify:** which variant fails, `failure_code`, `failure_stage`, and whether a refund fired.

---

### Flow 5 — LinkedIn Grader

Account: `fhefv@web-library.net`. Single click, one grading run.

**I verify:** 1 `linkedin_grading` deduct, `linkedin_grades` row written, no duplicates.

---

### Flow 6 — Recruiting Lens

Account: `fhefv@web-library.net`. Single click.

**I verify:** 1 `recruiting_lens` deduct, job completed, no duplicates.

---

### Flow 7 — Refresh recovers results

1. Start any analysis. **Mid-run, hard-refresh (Cmd+Shift+R).**
2. Then navigate away to `/dashboard` and back to the result.

**I verify:** no second job, no second charge, result retrievable. The refresh must not
re-trigger work.

---

### Flow 8 — Dashboard

Load `/dashboard` and `/history` on both a Free and an Elite account.

**I verify:** rendered figures reconcile with `analysis_results` / `merit_transactions`.
Checking for fabricated or fixture-shaped values.

---

### Flow 9 — Permanent failure refunds

Induce a **permanent** (non-retryable) failure — the cleanest lever is an invalid/corrupt
upload, e.g. rename a `.txt` or a truncated file to `.pdf` and submit it.

**I verify:** merit balance returns to its pre-attempt value, a `feature-refund` row exists,
job `refunded=true`, and the user sees plain-language copy — not a raw parser error.

> Note: the narrow refund taxonomy (`merit-gateway.ts`) auto-refunds only 5xx/529/408/network.
> A 4xx parse failure is **deliberately not** auto-refunded by that path — this flow checks
> whether the lifecycle layer refunds it instead. A charged-but-failed permanent error is a blocker.

---

### Flow 10 — Merit purchase (⚠️ LIVE Stripe — real money)

Account: `vvfwu@web-library.net`.

1. Click the top-up trigger. **Start a stopwatch on click.** Record ms until the Stripe
   checkout surface is visible.
2. Also click the **same pack twice quickly** — the recent fix (`beebb381`) should yield one session.
3. Complete the smallest merit pack.

**I verify:** exactly 1 `stripe_webhook_events` row, exactly 1 shop credit, balance increased
once, no double charge.

---

### Flow 11 — Elite upgrade (⚠️ LIVE Stripe — real money)

Use a **fresh Free account** (not an existing Elite one).

1. `/pricing` → Elite. Record checkout open latency. Complete payment.
2. After redirect, confirm the tier reflects Elite and merits are granted.
3. **Then navigate directly to `/admin/usage`.**

**I verify:** `subscription_tier='elite'`, merits granted once, exactly 1 webhook event,
and **no `user_roles` row created** — an upgrade must never confer admin.

---

### Flow 12 — Admin panel remains admin-only

1. While signed in as the newly-upgraded Elite account, hit `/admin/usage` directly.
2. Sign in as `strivolife@gmail.com`, hit `/admin/usage`.

**Expected:** Elite is denied; operator is allowed.

**I verify:** `user_roles` still contains exactly 1 admin row.

---

## Reporting

Final output: PASS/FAIL per flow, with only genuine launch blockers escalated.
Cosmetic issues recorded separately as non-blocking.
