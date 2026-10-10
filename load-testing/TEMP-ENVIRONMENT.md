# Disposable throwaway environment — exact setup (no preview access needed)

Because the existing preview Supabase/Vercel projects are unavailable, this creates a NEW,
disposable, production-EQUIVALENT environment you or your cofounder can stand up from
scratch and delete afterward. Synthetic data only. **Never point any of this at
production** (`zjpjapgraoxdukdvpjes`) — the harness refuses that ref.

> No generated traffic is part of THIS task. The load-rung command at the end is for you
> to run later, one gated rung at a time, after validation passes.

Assumes: Supabase CLI ≥ 2.109, Node ≥ 22, the `staging` branch checked out, and (for the
load rung) k6 installed.

---

## A. New throwaway Supabase project (dashboard)

1. https://supabase.com/dashboard → **New project**.
   - Name: `strivo-loadtest-throwaway`
   - Database password: generate a strong one (store in your password manager, NOT in git).
   - Region: closest to you. Plan: Free is fine for correctness; Pro if you want realistic
     pooler/compute headroom.
2. When it finishes, collect from the dashboard:
   - **Project ref** (Settings → General) — call it `<NEW_REF>`.
   - **API URL** `https://<NEW_REF>.supabase.co` and **anon** + **service_role** keys
     (Settings → API).
   - **DB connection string** (Settings → Database → Connection string → URI) — `<NEW_DB_URL>`.

## B. Link + apply current migrations

```bash
supabase link --project-ref <NEW_REF>      # enter the DB password when prompted
supabase db push                            # applies ALL supabase/migrations/ to the new project
supabase migration list --linked            # verify every migration shows as applied
```

## C. Edge Function secrets (NAMES — set real values in the dashboard/CLI, never commit)

The platform auto-injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_DB_URL` into deployed functions. Set only the extras:

```bash
supabase secrets set --project-ref <NEW_REF> \
  MERIT_SYSTEM_ENABLED=true \
  AI_TEST_MODE=true \
  INTERNAL_JOB_SECRET=<generate-a-random-string> \
  APP_URL=https://<your-vercel-deployment-url> \
  ALLOWED_ORIGINS=https://<your-vercel-deployment-url>
# Optional email/Stripe are NOT required to load-test the analysis path. If a function
# needs them to boot, set placeholders. For CAPPED REAL provider runs only:
#   supabase secrets set --project-ref <NEW_REF> AI_TEST_MODE=false ANTHROPIC_API_KEY=<test-key>
```

Required-name summary:

| Name | Value for load-test | Notes |
|---|---|---|
| `MERIT_SYSTEM_ENABLED` | `true` | exercises merit charge/refund/idempotency |
| `AI_TEST_MODE` | `true` (mock) / `false` (capped real) | mock for volume |
| `INTERNAL_JOB_SECRET` | random string | worker→worker auth |
| `APP_URL` / `ALLOWED_ORIGINS` | your Vercel URL | fail-closed CORS |
| `ANTHROPIC_API_KEY` | only for real runs | value never printed/committed |
| (auto) `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_DB_URL` | injected | do not set by hand |

## D. Deploy Edge Functions

```bash
# The analysis money path + its dependencies (enough for the harness):
supabase functions deploy --project-ref <NEW_REF> \
  analyze-resume submit-resume-analysis-job process-resume-analysis-job \
  get-analysis-job-status get-analysis-run-status ocr-pdf validate-document \
  grade-linkedin extract-analysis-structure
# (or deploy everything: `supabase functions deploy --project-ref <NEW_REF>`)
```

## E. Frontend on a NEW temporary Vercel project (CLI)

```bash
npm i -g vercel            # or use `npx vercel`
vercel login
vercel link                # create a NEW project, e.g. strivo-loadtest-fe (do NOT reuse prod)

# Frontend env (NAMES; set real values via CLI or dashboard, never commit):
vercel env add VITE_SUPABASE_URL              # https://<NEW_REF>.supabase.co
vercel env add VITE_SUPABASE_ANON_KEY         # new anon key
vercel env add VITE_SUPABASE_PUBLISHABLE_KEY  # same new anon key
vercel env add VITE_STRIPE_PUBLISHABLE_KEY    # pk_test_placeholder (payments not under test)

vercel deploy --prod       # prints the deployment URL
# Put that URL back into APP_URL / ALLOWED_ORIGINS from step C:
supabase secrets set --project-ref <NEW_REF> APP_URL=https://<url> ALLOWED_ORIGINS=https://<url>
```

Manual alternative (no Vercel project): `npm run build` then serve `dist/` anywhere, or
`vercel deploy --prebuilt`. The frontend is optional for API-level load testing.

## F. Provision synthetic users + fixtures

```bash
export SUPABASE_URL=https://<NEW_REF>.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=<new service_role key>
export LOADTEST_PASSWORD=<a fresh test password>
node load-testing/fixtures/generate-fixtures.mjs --count 200 --provision
# (workload 7 DB writes) apply the isolated scratch table:
psql "<NEW_DB_URL>" -f load-testing/tools/sql/load_test_scratch.sql
```

## G. Validate correctness on the throwaway env (one analysis)

```bash
export TARGET_ENV=throwaway CONFIRM_TARGET=<NEW_REF>
export SUPABASE_URL=https://<NEW_REF>.supabase.co
export SUPABASE_ANON_KEY=<new anon key>
export SUPABASE_SERVICE_ROLE_KEY=<new service_role key>
export LOADTEST_PASSWORD=<test password>
node load-testing/tools/validate-local.mjs --phase success
# then, after redeploying functions with AI_FORCE_FAILURE=true:
node load-testing/tools/validate-local.mjs --phase failure --timeout 240
```

## H. First LOAD-TEST rung (only after G passes; one gated rung, mocked AI)

```bash
export SUPABASE_DB_URL="<NEW_DB_URL>"        # enables the queue/invariant side-channel
node load-testing/tools/run-stage.mjs \
  --scenario 10-concurrent-ai-analysis --profile ramp --target 1 --measure-duration 180
# run-stage runs preflight, ONE rung, and the Supabase side-channel; it will NOT auto-escalate.
```

Real-provider calibration (capped) is gated separately:

```bash
ANTHROPIC_API_KEY=<test-key> node load-testing/tools/real-run-guard.mjs \
  --analyses 3 --tier free --confirm "I APPROVE REAL SPEND" --commit
```

## I. Cleanup / delete everything

```bash
# 1) synthetic data
node load-testing/tools/cleanup.mjs --domain loadtest.strivio.invalid --yes
psql "<NEW_DB_URL>" -c 'DROP TABLE IF EXISTS public.load_test_scratch;'
# 2) Vercel: remove the throwaway project
vercel remove strivo-loadtest-fe --yes       # or delete it in the Vercel dashboard
# 3) Supabase: delete the throwaway project
#    Dashboard → the project → Settings → General → Danger Zone → Delete project
# 4) unlink locally so you don't accidentally target it later
supabase link --project-ref <your-normal-ref-or-skip>
```

## Required env-variable NAMES (quick reference)

- Backend (Supabase secrets): `MERIT_SYSTEM_ENABLED`, `AI_TEST_MODE`, `INTERNAL_JOB_SECRET`,
  `APP_URL`, `ALLOWED_ORIGINS`, `ANTHROPIC_API_KEY` (real runs only). Auto-injected:
  `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`.
- Frontend (Vercel): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`.
- Harness (shell, per run): `TARGET_ENV`, `CONFIRM_TARGET`, `SUPABASE_URL`,
  `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LOADTEST_PASSWORD`, `SUPABASE_DB_URL`.
