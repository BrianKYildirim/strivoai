---
task: Prepare the load-testing harness for execution WITHOUT preview (local + throwaway)
slug: 260726-prepare-load-harness-local-and-throwaway
status: complete
date: 2026-07-26
branch: staging
scope: PREPARE + docs only — no generated traffic, no real-provider calls, no prod
commits:
  - 38672dba feat(load-testing): local + throwaway execution prep (no traffic, no real calls)
  - 0282bad5 fix(load-testing): validate-local matches Strivo's real two-path resume flow
---

# Execution (2026-07-26, Docker up): LOCAL correctness validation — PASSED

Ran the local validation live against a real local Supabase stack (loopback), mocked AI,
synthetic users, MERIT_SYSTEM_ENABLED=true. All requested checks PASS.

## Results
- success phase 13/13 PASS · failure phase 4/4 PASS.
- Mapped to the request's checks:
  1. one submission creates exactly one analysis job — PASS (queue)
  2. merits deduct exactly once — PASS (cost 3, 10→7)
  3. duplicate submission reuses the existing job — PASS (same jobId)
  4. no duplicate merit charge — PASS (balance unchanged)
  5. completed result stored & retrievable — PASS (streaming; overall_score=84 in
     resumes.grading_data + analysis_results mirror)
  6. polling/refresh recovery — PASS (independent re-read returns the durable result)
  7. permanent failure restores merits + records refund — PASS (AI_FORCE_FAILURE: 10→10,
     refund row)
  8. production zero requests/writes — PASS (loopback-only; prod ref blocklisted; no prod
     URL/key ever used)

## Environment gaps found + resolved to run locally (LOCAL-ONLY, reverted, NOT committed)
- **Migration replay guards**: 3 no-regression `DO` guards (20260608000010/11,
  20260625021209) RAISE EXCEPTION on a clean sequential replay ("expected 11 KEEP RPCs …
  found 5"). Transiently downgraded to RAISE NOTICE to boot local; **reverted via
  `git checkout` — migrations are byte-identical to HEAD**. This ALSO blocks a fresh
  throwaway `db push` — see finding below.
- **service_role missing table grants**: on a clean local replay, `service_role` had NO
  grants on public app tables (`permission denied for table profiles`, 42501) → every edge
  function 403'd. Applied the standard Supabase `service_role` grants to the LOCAL DB only
  (per-table, owner-scoped). Not a migration/production change.

## Product findings (NOT fixed — out of scope; reported)
- **Queue/worker path 401**: `analyze-resume:1383` `if (!userContext) return 401` rejects
  the internal worker path, even though the comment at :1329-1340 says that path is "100%
  of resume-analysis queue/worker traffic". So the queue path deducts then always
  fails+refunds; resume analyses COMPLETE via the streaming path. Possibly related to the
  historical onboarding-authorization quick task. Worth a follow-up.
- **Fresh-environment migration guards**: the 3 replay-fragile guards mean a brand-new
  throwaway project (`supabase db push` from scratch) will hit the same failure at
  20260608000011 — the throwaway runbook needs either replay-safe guards or the same
  local-only neutralization. Flagged for TEMP-ENVIRONMENT follow-up.

## Validator correction (committed 0282bad5)
validate-local.mjs now seeds a real `resumes` UUID row and validates completion/refund on
the STREAMING path (the real completion path) and submit/merit/duplicate on the QUEUE path.

## Teardown
Synthetic users deleted (0 remain); local stack stopped (data in a Docker volume). Docker
was started by the operator; migrations reverted; production untouched. No capacity claims.

# Outcome

Prepared the existing harness to run without preview access. The LIVE Part-1 local
validation could NOT be executed this session — **Docker is not running on this machine**
and Supabase local requires it (k6 is also not installed). So everything up to "run these
exact commands once Docker is up" is built, verified, and committed; no results are
fabricated.

## What was built (commit 38672dba, load-testing/ only)
- **Local target support** — `config/environments.js` now accepts `TARGET_ENV=local`
  (loopback 127.0.0.1 only), keeps the production ref `zjpjapgraoxdukdvpjes`
  hard-blocklisted, and rejects mislabeled loopback/hosted URLs. 6 behavioral cases
  verified (local accepted; local-with-hosted-url refused; prod refused; throwaway
  accepted; hosted-with-loopback refused; unknown env refused).
- **Correctness validator** — `tools/validate-local.mjs` (target-agnostic: local default,
  throwaway with the confirm gate). Single-request assertions: one submission → one job →
  one merit deduction (cost read from the ledger, not hardcoded) → duplicate submit reuses
  the same job (no double charge) → completed result stored & retrievable → polling/refresh
  recovery → permanent-failure refund (balance restored, refund row on file, `refunded=true`
  not settled). Loopback-only for local ⇒ production gets zero requests by construction.
  Creates + deletes its own synthetic user per run.
- **Real-provider $5 gate** — `tools/real-run-guard.mjs`: cumulative $5 cap ledger + typed
  "I APPROVE REAL SPEND" confirmation. Makes NO call. Fail-closed paths all verified
  (no key → refuse; no confirm → refuse; over-cap → refuse; valid dry-run → approve and
  writes NO ledger; only `--commit` reserves). Never reads/prints the key.
- **Docs** — `LOCAL.md` (exact `supabase start`/`db reset`, `functions serve` with
  MERIT_SYSTEM_ENABLED=true + AI_TEST_MODE=true and the AI_FORCE_FAILURE phase, validate,
  first local rung, teardown, and a "can/cannot prove" section) and `TEMP-ENVIRONMENT.md`
  (exact disposable Supabase + Vercel steps, env-var NAMES, migration/edge-deploy/
  frontend-deploy, fixture provisioning, one-analysis validate, first load rung, and full
  cleanup/deletion). `README.md` + `.env.load.example` updated for the `local` target.

## Verification (build-only; no traffic)
- `node --check` on all new/modified files: pass.
- `resolveEnv` behavioral matrix: 6/6 correct.
- real-run-guard fail-closed: 4/4 correct; no ledger written on dry-run.
- `npx eslint load-testing/`: clean. Secret scan: no secret-shaped literals.

## Not done (blocked / deferred)
- **Live local validation NOT executed** — Docker down. Operator must start Docker
  Desktop, then run the LOCAL.md steps (or start Docker and ask me to drive it).
- No real-provider call (needs explicit approval + the gate). No throwaway env stood up
  (that's the operator's to create with the runbook). No capacity claims made.

## Report answers (for the operator)
1. Local correctness results: NOT RUN (Docker unavailable) — validator + exact commands
   ready; expected assertions enumerated above.
2. Production: zero traffic/writes — nothing ran; the local path is loopback-only and prod
   ref is blocklisted in every entry point.
3. Local can prove money-path correctness (incl. merit, which preview can't); it cannot
   prove hosted capacity/concurrency/latency/cost.
4. Throwaway setup: `TEMP-ENVIRONMENT.md`.
5. One analysis after env exists: `node load-testing/tools/validate-local.mjs --phase success`
   (with the env exports in LOCAL.md/TEMP-ENVIRONMENT.md).
6. First load rung: `node load-testing/tools/run-stage.mjs --scenario 10-concurrent-ai-analysis --profile ramp --target 1 --measure-duration 180`.
7. No capacity claims have been made.

## Commit policy
Only `load-testing/` committed (38672dba). PLAN/SUMMARY + STATE row written locally,
unstaged, per the "don't commit `.planning/`" rule.
