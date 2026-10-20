---
phase: 07-environment-variable-audit-organization
plan: 03
subsystem: infra
tags: [env-vars, secrets, supabase, vercel, github-actions, security-audit, separation]

# Dependency graph
requires:
  - phase: 03-cross-domain-inventory-audit
    provides: "ENV-INVENTORY.md (ENV-01) name set + buckets the matrix rows were pre-seeded from"
  - phase: 07-environment-variable-audit-organization
    provides: "07-01 ENV-02/ENV-03 (.env.example + docs/ENVIRONMENT.md + ENV-02 un-set list scaffold); 07-03 Task 1 scaffold (afd1ad65)"
provides:
  - "ENV-04 cross-surface separation audit: a FILLED 5-surface reconciliation matrix (prod/preview Supabase, GitHub Actions, Vercel prod/preview) from the operator names-only pass"
  - "Headline verdict: NO classic cross-environment leakage; findings are misplaced/orphaned/missing-required, not leakage"
  - "10-item operator fix list (names only) + clean confirmations (OLLAMA_* + RAPIDAPI_KEY absent all surfaces; GitHub Actions clean)"
  - "ENV-02 Operator Un-Set List extended with the ENV-04 live-pass additions (names only)"
affects: [07-04-NFR-03-doc-reconcile, phase-08-database-cleanup, phase-07.1-runtime-reliability]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Operator-gated names-only live audit (D-06/D-07): operator runs the 4 listing commands, agent reconciles + classifies, agent mutates NO live store"
    - "Cross-surface reconciliation matrix as the ENV-04 separation artifact (5 surface columns, present/absent cells, per-row finding class)"

key-files:
  created:
    - ".planning/phases/07-environment-variable-audit-organization/07-03-SUMMARY.md"
  modified:
    - ".planning/audit/ENV-SEPARATION.md"
    - ".planning/audit/RESIDUAL-REGISTER.md"

key-decisions:
  - "Headline ENV-04 verdict: NO classic cross-environment leakage (no prod-live secret in any test/CI/preview surface; GitHub Actions = exactly the 5 TEST-project gate secrets). All findings are misplaced/orphaned/missing-required, NOT leakage."
  - "Highest-attention finding: AI_TEST_MODE set on prod Supabase (test seam read by _shared/anthropic.ts; stubs all AI when value is 'true') — verify-then-unset (item 1 of fix list)."
  - "Vercel Production env holds ~20 names but the Vite SPA reads ONLY 4 VITE_* names; the ~16 Supabase->Vercel integration-injected unprefixed/privileged names are NOT browser-exposed (Vite bundles only VITE_*) — a blast-radius finding, not active client exposure."
  - "No live store mutated by the agent (D-07) — the phase closes on the documented audit + operator fix list."

patterns-established:
  - "ENV-04 separation audit pattern: topology -> 4 operator names-only commands -> filled 5-surface matrix -> taxonomy classification -> operator fix list, all secret-free (names only)."

requirements-completed: [ENV-04]

# Metrics
duration: 12min
completed: 2026-06-23
---

# Phase 07 Plan 03: ENV-04 Cross-Surface Separation Audit Summary

**Filled the 5-surface env reconciliation matrix from the operator's names-only listings: NO classic cross-environment leakage, but AI_TEST_MODE is misplaced on prod Supabase and a cluster of Supabase->Vercel integration-injected privileged secrets sits (non-browser-exposed) in the Vercel frontend host — emitted as a 10-item operator fix list, no live store mutated.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-23
- **Completed:** 2026-06-23
- **Tasks:** 2 (Task 1 scaffold pre-committed afd1ad65; Task 2 checkpoint reconciliation this session)
- **Files modified:** 3 (ENV-SEPARATION.md filled, RESIDUAL-REGISTER.md appended, SUMMARY.md created)

## Accomplishments

- **Filled the cross-surface reconciliation matrix** in `.planning/audit/ENV-SEPARATION.md` (sub-sections 3a-3f) across the five surfaces (`prod-Supabase` `zjpjapgraoxdukdvpjes`, `preview-Supabase` `cimjltzovkahkqecpwgi`, GitHub Actions, Vercel-prod, Vercel-preview) from the operator's four names-only listings (run 2026-06-23). Added a **new sub-section 3g** for the ~19 live-store names the operator pass surfaced that were not pre-seeded.
- **Headline verdict = NO classic cross-environment leakage:** no Stripe LIVE secret and no prod project-ref found in any test/CI/preview surface; GitHub Actions holds exactly the 5 TEST-project gate secrets (`SUPABASE_TEST_URL` / `SUPABASE_TEST_ANON_KEY` / `SUPABASE_TEST_SERVICE_ROLE_KEY` / `STRIPE_TEST_PUBLISHABLE_KEY` / `E2E_TEST_PASSWORD`, each consumed by `regression-gate.yml:63-71`). All findings are misplaced / orphaned / missing-required, not leakage.
- **Emitted a 10-item operator fix list** (names only) + a clean-confirmations (negative-findings) block, and **extended the ENV-02 Operator Un-Set List** in `RESIDUAL-REGISTER.md` with the ENV-04 live-pass additions.
- **No live store mutated (D-07);** zero `src`/`supabase/functions` diff; secret-grep guard ZERO over both edited files.

## Task Commits

1. **Task 1: Author the ENV-04 topology + 4-surface command scaffold + reconciliation matrix template** — `afd1ad65` (docs) — PRE-COMMITTED in a prior session.
2. **Task 2: Operator runs the 4 listing commands (names only); agent reconciles the matrix + emits the fix list** — this session (reconciliation transcribed into ENV-SEPARATION.md + RESIDUAL-REGISTER.md).

**Plan metadata commit:** see the docs(07-03) reconcile commit below + the tracking commit.

## Files Created/Modified

- `.planning/audit/ENV-SEPARATION.md` — Verdict/Status table updated to COMPLETE (run date 2026-06-23); Section 3 matrix FILLED (3a production edge secrets, 3b Stripe price IDs, 3c OCR fallbacks, 3d CI/E2E secrets, 3e frontend `VITE_*`, 3f orphan candidates) + NEW 3g (live-store names not pre-seeded); Section 5 operator fix list (10 items + clean confirmations) transcribed.
- `.planning/audit/RESIDUAL-REGISTER.md` — ENV-02 Operator Un-Set List extended with an "ENV-04 (Plan 07-03) live-pass additions" sub-block (names only): `AI_TEST_MODE` (prod, verify-then-unset), `GOOGLE_GEMINI_API_KEY` (prod, orphaned), `AI_PROVIDER` (prod, orphaned), `SERVICE_ROLE_KEY` bare (preview, orphaned/redundant), plus the Vercel-Production integration-injected prune (operator action) and the OLLAMA_* / RAPIDAPI_KEY clean confirmations.
- `.planning/phases/07-environment-variable-audit-organization/07-03-SUMMARY.md` — this summary.

## Decisions Made

- **NO classic cross-environment leakage** is the headline ENV-04 verdict — the audit ruled OUT leakage explicitly (no prod-live secret in test/CI/preview; GitHub Actions clean) and reframed every real finding as misplaced / orphaned / missing-required / config-divergence.
- **`AI_TEST_MODE` on prod Supabase is the highest-attention finding** (item 1): it is read by `_shared/anthropic.ts:564,570,753,761` and stubs all AI when the value is `'true'`. The operator action is to **verify the prod value is NOT `'true'`** (almost certainly fine since prod AI works) and then un-set it from prod (no legitimate prod purpose; paired `AI_FORCE_FAILURE` correctly absent in prod).
- **The Vercel frontend-host cluster is measured, not alarmist:** ~16 Supabase->Vercel integration-injected unprefixed/`NEXT_PUBLIC_`/`POSTGRES_*` names live in the Vercel Production env, but Vite bundles ONLY `VITE_*` to the client, so privileged names (`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWT_SECRET`, `POSTGRES_PASSWORD`, ...) are **NOT shipped to browsers**. The finding is blast-radius (prod credentials sitting in a third-party frontend host's store), and the recommended action is to prune the unused integration-injected vars, keeping only the 4 consumed `VITE_*` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_FEATURE_INTERVIEW_PREP`).
- **Benign config-divergence notes** (not anomalies): the merit subsystem (`MERIT_SYSTEM_ENABLED` + `STRIPE_PRICE_MERIT_3/10/25/50`) is configured preview-only (consistent, verify rollout intent); `STRIPE_PRICE_PRO_*` / `STRIPE_PRICE_PAID_*` are absent on BOTH Supabase stores (confirm PRO/PAID tiers no longer sold via env price IDs); `PADDLE_WEBHOOK_SECRET` on prod is the known gated-but-live Paddle legacy.
- **One missing-required (preview):** `VITE_FEATURE_INTERVIEW_PREP` is present on Vercel-prod but absent on Vercel-preview, so Interview Prep is hidden on preview (fail-closed per `feature-flags.ts`); design intent is preview=`true` (visible for testing) — safe either way, operator sets it on the Preview scope if desired.

## Consumer-grep evidence (re-confirmed at HEAD)

- `AI_TEST_MODE` -> `supabase/functions/_shared/anthropic.ts:564,570,753,761`.
- The 4 consumed `VITE_*` -> `src/lib/supabaseClient.ts`, `src/components/StripeCheckoutWrapper.tsx`, `src/config/feature-flags.ts`, `src/lib/perf.ts`, `src/pages/CareerCompass.tsx`, `src/hooks/useResumeStream.ts`.
- CI secrets -> `.github/workflows/regression-gate.yml:63-71`.
- `AI_PROVIDER` / `GOOGLE_GEMINI_API_KEY` -> ZERO consumer in `supabase/functions` (orphaned).
- bare `SERVICE_ROLE_KEY` -> no prod edge consumer (edge reads `SUPABASE_SERVICE_ROLE_KEY`); only a remote-deno-test-harness comment reference.

## ENV-02 Un-Set List additions (names only)

- `AI_TEST_MODE` — prod `zjpjapgraoxdukdvpjes` — verify value != `'true'`, then un-set (misplaced test seam).
- `GOOGLE_GEMINI_API_KEY` — prod — un-set (orphaned, zero code consumer).
- `AI_PROVIDER` — prod — un-set (orphaned, zero code consumer).
- `SERVICE_ROLE_KEY` (bare) — preview `cimjltzovkahkqecpwgi` — un-set pending remote-deno-test-harness confirm (orphaned/redundant).
- Vercel (Production) integration-injected prune — `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` / `SUPABASE_JWT_SECRET` / `POSTGRES_*` / `NEXT_PUBLIC_*` / unprefixed `SUPABASE_*` — remove from the frontend host (blast-radius; not browser-exposed).

## Deviations from Plan

None — plan executed exactly as written. Task 2 was a `checkpoint:human-verify` (blocking, `autonomous:false`); the operator ran the four names-only listings and the reconciliation/classification was applied verbatim. No store mutated, no code touched, no secret value recorded.

Note: a NEW sub-section **3g** ("NEW live-store names found by the operator pass") was added to ENV-SEPARATION.md to record the ~19 live names the operator surfaced that were not pre-seeded in the original 3a-3f scaffold — this is expected per the scaffold's own "operator pass adds any name found in a live store that is not listed here (a new row -> classify it)" instruction, not a deviation.

## Issues Encountered

None. Pure-ASCII discipline honored (only the document's established em-dash/arrow style retained); secret-grep guard returned ZERO over both `ENV-SEPARATION.md` and `RESIDUAL-REGISTER.md`; `git diff --stat -- src supabase/functions` EMPTY.

## User Setup Required

None for plan close-out. The 10-item operator fix list in `ENV-SEPARATION.md` Section 5 is a set of **operator-scheduled live-store actions** (verify-then-unset `AI_TEST_MODE` on prod; prune the Vercel integration-injected cluster; un-set the orphaned prod AI vars; optionally set `VITE_FEATURE_INTERVIEW_PREP` on Vercel Preview) — the agent mutates no store (D-07).

## Next Phase Readiness

- ENV-04 satisfied: staging-vs-production separation is verified explicit and correct via the filled cross-surface reconciliation matrix; all anomalies classified; operator fix list emitted; ENV-02 un-set list extended.
- Next: **07-04 (NFR-03 doc reconcile)** — Wave 2 — which will, among other things, handle the `RAPIDAPI_KEY` doc-ghost cleanup confirmed here as absent on all surfaces.

---
*Phase: 07-environment-variable-audit-organization*
*Completed: 2026-06-23*
