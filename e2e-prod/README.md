# Production smoke test (`e2e-prod/`)

Automated Playwright suite that drives the **live production site** with existing
disposable test accounts.

> Deliberately isolated from `e2e/`. `npm run test:e2e` and the blocking
> `verify:baseline` gate use `playwright.config.ts` (`testDir: ./e2e`) and never
> collect these specs.

## Run

```bash
export PROD_FREE_EMAIL=...      PROD_FREE_PASSWORD=...
export PROD_ELITE_EMAIL=...     PROD_ELITE_PASSWORD=...
# optional, defaults to https://strivoai.net
export PROD_BASE_URL=https://strivoai.net

npm run test:e2e:prod
```

Credentials may instead live in a gitignored `.env.prod-smoke.local`. Without all
four variables the suite **skips all 17 tests** rather than half-running against
production.

## Safety invariants

| Invariant | Where |
|---|---|
| `retries: 0` — a retry would run a second real analysis and double-charge | `playwright.prod.config.ts` |
| `workers: 1` — serial, so job/charge attribution is unambiguous; nowhere near load traffic | `playwright.prod.config.ts` |
| No service-role key is read anywhere | `helpers/env.ts` |
| Stripe confirm/submit endpoints are network-blocked | `06-checkout-dialogs.spec.ts` → `blockStripeSubmission()` |
| No card details are ever entered | `06-checkout-dialogs.spec.ts` |
| Screenshots only on failure, always masked | `helpers/observe.ts` |
| Credentials/JWTs/Stripe keys/emails redacted from every log and artifact | `helpers/redact.ts` |
| Reports land in gitignored `test-results/` | `playwright.prod.config.ts` |

## What it costs

Flows 2–5 drive **real analyses on real accounts and spend real merits** — that
is the only way to prove the one-job/one-charge invariant end to end. Each spec
runs exactly one analysis. Approximate spend per full run: one resume analysis,
one LinkedIn grading, one or two Career Compass runs, one Recruiting Lens.

**No real payment is ever made.** Flow 6 opens the checkout dialogs, asserts
immediacy and single-session behaviour, then stops and closes.

## Coverage

| Spec | Covers |
|---|---|
| `01-auth-dashboard` | sign-in (both tiers), dashboard, merit balance renders, onboarding not a trap, history recovery |
| `02-resume-analysis` | one click → one job → one charge; 3 rapid clicks → 1 submission; refresh + navigation recovery re-trigger nothing |
| `03-linkedin-grader` | one grading, one charge, duplicate-click guard |
| `04-career-compass` | fresh-upload path; **stored-resume path = the `INPUT_MISSING` repro**, asserts refund-on-failure |
| `05-recruiting-lens` | one analysis, one charge, duplicate-click guard |
| `06-checkout-dialogs` | Upgrade + Buy-merits dialogs open < 2s; 3 rapid clicks → exactly 1 `create-checkout-session`; stops before payment |
| `07-access-control` | Elite gets Elite; Free gated cleanly; **neither tier can see or reach `/admin/usage`** |

Every spec additionally asserts **no raw technical error** is visible
(`TypeError`, `PGRST`, `violates row-level security`, `Edge Function returned`,
stack traces, …) — see `RAW_ERROR_SIGNATURES` in `helpers/observe.ts`.

## Test-data cleanup — read this

The suite is **append-only by necessity**. Without a service-role key (correctly
withheld), the rows a run creates cannot be deleted:

- `analysis_jobs`, `analysis_results`, `merit_transactions`, `linkedin_grades`,
  `resume_versions` are **service-role-write / user-read** under RLS. A browser
  session cannot delete them.
- `merit_transactions` is a financial audit log — deleting it would destroy the
  very evidence this suite exists to produce.

What that means in practice: each run leaves a handful of completed analyses and
merit transactions on the disposable accounts. That is normal user-shaped data on
throwaway accounts, not pollution of real user records. Uploaded resumes are the
same fixture each time, so storage does not grow unboundedly.

If you want a genuine reset, do it out of band on the disposable accounts — not
from this suite.

## Verifying the results against the database

Playwright proves what the *user* sees. Pair it with read-only SQL to prove what
the *system* recorded. After a run:

```sql
-- one job + one charge per attempt, for runs in the last hour
select feature, count(*) jobs,
       count(*) filter (where state='completed') completed,
       count(*) filter (where refunded)          refunded
from analysis_jobs
where created_at > now() - interval '1 hour'
group by 1;

-- no duplicate idempotency keys
select idempotency_key, count(*) from analysis_jobs
where created_at > now() - interval '1 hour' and idempotency_key is not null
group by 1 having count(*) > 1;

-- charges vs refunds
select source, feature, count(*), sum(amount) from merit_transactions
where created_at > now() - interval '1 hour' group by 1,2;

-- admin set must be unchanged (exactly one row)
select count(*) from user_roles where role='admin';
```
