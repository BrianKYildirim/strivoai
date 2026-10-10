# Running the harness against a LOCAL Strivo stack (correctness only)

Use this when you don't have preview access. It validates the resume-analysis money path
for **correctness** on a local Supabase stack. **It is not a capacity test** — local laptop
timings must never be reported as Strivo's hosted capacity.

> Prerequisite: **Docker Desktop must be running** (Supabase local needs it). Supabase CLI
> ≥ 2.109 and Node ≥ 22 are already present. k6 is only needed for the optional load rung.

Everything below targets loopback (`127.0.0.1`) only. The harness refuses any hosted or
production URL, so **production receives zero requests**.

## 1. Bring up local Supabase + apply current migrations

```bash
# from repo root
supabase start                 # boots the local stack (Postgres, Auth, Storage, etc.)
supabase db reset              # applies ALL current migrations (supabase/migrations/) + seed
supabase status                # prints API URL + anon key + service_role key + DB URL
```

Note the printed values (local dev keys):
- **API URL** → `http://127.0.0.1:54321`
- **anon key**, **service_role key**, **DB URL** (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`)

## 2. Serve the Edge Functions with the correct flags

Create a **git-ignored, local-only** functions env file (names below; pick any local
`INTERNAL_JOB_SECRET`). The CLI injects `SUPABASE_URL`/`SUPABASE_ANON_KEY`/
`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_DB_URL` automatically, so this file only carries the
extras:

```
# supabase/functions/.env.local   (DO NOT COMMIT)
MERIT_SYSTEM_ENABLED=true
AI_TEST_MODE=true
INTERNAL_JOB_SECRET=any-local-string-you-choose
ALLOWED_ORIGINS=http://127.0.0.1:8080
APP_URL=http://127.0.0.1:8080
# ANTHROPIC_API_KEY=   # leave UNSET for mocked volume; set only for capped real runs
```

Serve (mocked-AI, success path):

```bash
supabase functions serve --env-file supabase/functions/.env.local --no-verify-jwt
```

For the **permanent-failure** phase, stop that and re-serve with the fault injector:

```bash
# add AI_FORCE_FAILURE=true to supabase/functions/.env.local, then:
supabase functions serve --env-file supabase/functions/.env.local --no-verify-jwt
```

## 3. (Optional) Local frontend

```bash
# .env.local at repo root (DO NOT COMMIT)
#   VITE_SUPABASE_URL=http://127.0.0.1:54321
#   VITE_SUPABASE_ANON_KEY=<local anon key from `supabase status`>
#   VITE_SUPABASE_PUBLISHABLE_KEY=<same local anon key>
#   VITE_STRIPE_PUBLISHABLE_KEY=pk_test_placeholder
npm run dev        # http://localhost:8080
```

## 4. Provision synthetic users (for the k6 pool; the validator makes its own user)

```bash
export SUPABASE_URL=http://127.0.0.1:54321
export SUPABASE_SERVICE_ROLE_KEY=<local service_role key>
export LOADTEST_PASSWORD=<any local password>
node load-testing/fixtures/generate-fixtures.mjs --count 50 --provision
```

## 5. Validate correctness (very low load — this is the point of Part 1)

```bash
export SUPABASE_URL=http://127.0.0.1:54321
export SUPABASE_ANON_KEY=<local anon key>
export SUPABASE_SERVICE_ROLE_KEY=<local service_role key>
export LOADTEST_PASSWORD=<any local password>

# Success path (serve with AI_TEST_MODE=true, no fault flag):
node load-testing/tools/validate-local.mjs --phase success

# Permanent-failure/refund path (serve with AI_FORCE_FAILURE=true):
node load-testing/tools/validate-local.mjs --phase failure --timeout 240
```

The validator asserts, and prints PASS/FAIL for: one submission → one job → one merit
deduction (cost read from the ledger) → duplicate submission reuses the same job (no
double-charge) → completed result stored & retrievable → polling/refresh recovery →
permanent failure refunds correctly (balance restored, refund row on file, `refunded=true`
not settled). It deletes its synthetic user afterward.

## 6. (Optional) First LOCAL load rung — mocked AI, correctness of the path under a little concurrency

```bash
k6 run -e TARGET_ENV=local -e CONFIRM_TARGET=local \
  -e SUPABASE_URL=http://127.0.0.1:54321 -e SUPABASE_ANON_KEY=<local anon key> \
  -e LOADTEST_PASSWORD=<local password> \
  -e PROFILE=ramp -e TARGET=5 -e MODE=mock \
  load-testing/scenarios/10-concurrent-ai-analysis.js
```

(Local numbers are for path-correctness only — NOT capacity.)

## 7. Cleanup / teardown

```bash
node load-testing/tools/cleanup.mjs --domain loadtest.strivio.invalid --yes   # delete synthetic users (cascades)
supabase stop        # stop the local stack (add --no-backup to discard the local DB)
```

## What local CAN and CANNOT prove

- **CAN:** functional correctness of the money path with `MERIT_SYSTEM_ENABLED=true` —
  single-charge, duplicate-reuse, store/retrieve, polling recovery, and permanent-failure
  refund. Merit behavior that Preview cannot exercise (its flag is OFF) IS exercised here.
- **CANNOT:** hosted capacity, concurrency limits, queue/worker behavior at scale, real
  network/pooler ceilings, or real provider latency/cost. Those require the throwaway
  cloud environment (see `TEMP-ENVIRONMENT.md`).
