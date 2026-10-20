---
phase: 07-environment-variable-audit-organization
plan: 02
subsystem: infra
tags: [env, secrets, fail-closed, security, cors, anthropic, stripe, supabase, audit]

# Dependency graph
requires:
  - phase: 03-cross-domain-inventory-audit
    provides: "ENV-INVENTORY.md (ENV-01) — authoritative 7-frontend + 57-edge env surface, required/optional classification, names-not-values discipline"
  - phase: 07-environment-variable-audit-organization (07-01)
    provides: "docs/ENVIRONMENT.md + re-created .env.example surface; RESIDUAL-REGISTER central assertRequiredEnv() defer (D-08)"
provides:
  - "ENV-05 satisfied: source-cited fail-closed coverage matrix proving all 6 critical/required secrets refuse to proceed when unset at HEAD"
  - ".planning/audit/ENV-FAILCLOSED.md — names + consumer file:line + guard behavior + verdict (no secret values)"
  - "Operator disposition recorded: APPROVED 'add nothing' — D-08 surgical-add bar (a critical secret failing OPEN) is NOT met; zero edge diff"
affects: [phase-07.1-runtime-reliability-review, phase-08-database-cleanup, env-audit, secret-handling]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fail-closed coverage matrix: NAME + consumer file:line + behavior-when-unset + verdict, re-confirmed at HEAD via rg (line numbers never trusted from research)"
    - "D-08 surgical-add bar: a guard is ADDED only if a critical secret currently fails OPEN; confirm-only matrix otherwise (no central env-guard helper — deferred)"
    - "Names-not-values discipline (T-3-07/REPO-05) extended to ENV-FAILCLOSED.md with a corrected (no -E) secret-grep guard returning ZERO"

key-files:
  created:
    - ".planning/audit/ENV-FAILCLOSED.md (committed Task 1, c7ba8a9a)"
    - ".planning/phases/07-environment-variable-audit-organization/07-02-SUMMARY.md (this file)"
  modified: []

key-decisions:
  - "Operator APPROVED 'add nothing' (2026-06-23 session) — ENV-05 closes on the coverage matrix with zero supabase/functions diff; no guard added, no existing guard weakened"
  - "All 6 critical secrets (APP_URL, ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, INTERNAL_JOB_SECRET) fail closed at HEAD; D-08 surgical-add bar not met"
  - "RESEND_API_KEY recorded documentation-only (fail-closed, degraded-email risk class, not in D-08 critical set); operator did NOT elect to treat it in-scope"
  - "No full verify:baseline re-run for this docs-only close-out — zero code changed since the green Phase-6 baseline, so the wave-level baseline is unaffected (wave run is the orchestrator's responsibility)"

patterns-established:
  - "Fail-closed coverage matrix as the ENV-05 evidence artifact (confirm + surgical-add, not a refactor)"
  - "Operator-gated checkpoint honored (autonomous:false) — disposition recorded, never auto-approved"

requirements-completed: [ENV-05]

# Metrics
duration: ~2min (checkpoint close-out; Task 1 prior session)
completed: 2026-06-23
---

# Phase 7 Plan 02: ENV-05 Fail-Closed Secret Disposition Summary

**Source-cited fail-closed coverage matrix proving all 6 critical/required secrets (APP_URL, ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, INTERNAL_JOB_SECRET) refuse to proceed when unset at HEAD — operator dispositioned "add nothing" with ZERO supabase/functions diff.**

## Performance

- **Duration:** ~2 min (checkpoint close-out this session; Task 1 matrix built/committed in a prior session)
- **Started:** 2026-06-23 (continuation at operator checkpoint)
- **Completed:** 2026-06-23
- **Tasks:** 2 (Task 1 auto — prior session; Task 2 checkpoint:human-verify — this session)
- **Files modified:** 0 product source (docs-only close-out; matrix committed in Task 1)

## Accomplishments

- **ENV-05 satisfied via a confirm-only coverage matrix** — `.planning/audit/ENV-FAILCLOSED.md` documents each of the 6 critical/required secrets with a re-confirmed consumer `file:line`, the exact behavior when the secret is unset, and a `fail-closed` verdict.
- **Operator dispositioned "add nothing"** (2026-06-23 session) — the D-08 surgical-add bar ("a critical secret currently fails OPEN") is NOT met by code inspection, so ENV-05 closes on the matrix with **zero edge diff**. No guard was added; no existing fail-closed guard was weakened.
- **Zero-functional-change invariant proven for the plan scope** — the working-tree diff over `src` + `supabase/functions` is EMPTY, and `git diff c7ba8a9a^..HEAD -- src supabase/functions` (Task 1 commit onward) is EMPTY.
- **Names-not-values discipline upheld** — the corrected (no `-E`) secret-grep guard over `ENV-FAILCLOSED.md` returns ZERO matches.

## The 6 critical secrets — fail-closed citations (NAMES ONLY)

| # | Secret | Consumer (file:line, re-confirmed at HEAD) | Behavior when unset | Verdict |
|---|--------|--------------------------------------------|---------------------|---------|
| 1 | `APP_URL` | `supabase/functions/_shared/cors.ts:38-41` (`corsHeaders`, `type:'user'`) | `if (!rawAppUrl) throw` — refuses to build CORS headers for browser-facing functions; never emits a permissive `Access-Control-Allow-Origin` | fail-closed |
| 2 | `ANTHROPIC_API_KEY` | `supabase/functions/_shared/anthropic.ts:647-650` (non-stream) + `:802-806` (stream) | non-stream returns `{ok:false,status:500}`; stream yields `{type:'error',status:500}` — both short-circuit BEFORE any `fetch` to `api.anthropic.com` | fail-closed (both paths) |
| 3 | `SUPABASE_SERVICE_ROLE_KEY` (+`SUPABASE_URL`) | `supabase/functions/_shared/supabase-client.ts:16-20` / `:32-36` / `:43-47` | each accessor throws `... not configured`; no service client constructed, no service-role-authorized fetch issued without the key | fail-closed |
| 4 | `STRIPE_SECRET_KEY` | `supabase/functions/_shared/stripe-client.ts:23-24` (`getStripeClient`) | `if (!key) throw` — no Stripe SDK client instantiated without the secret key; every Stripe call routes through this single accessor | fail-closed |
| 5 | `STRIPE_WEBHOOK_SECRET` | `supabase/functions/stripe-webhook-handler/index.ts:114,120-123` | `if (!webhookSecret) return jsonResponse({error:'invalid_signature'},401)` — rejects the webhook; the event is never `constructEventAsync`-verified or processed | fail-closed (rejects unsigned/unverifiable webhook) |
| 6 | `INTERNAL_JOB_SECRET` | `supabase/functions/_shared/auth.ts:141-145` (internal-auth path) | `if (!expectedSecret) { log.error('secret-not-configured'); throw unauthorizedResponse() }` — throws 401 BEFORE any `timingSafeEqual`; an internal-secret request cannot authenticate when the expected secret is unset | fail-closed |

**All 6 critical/required secrets fail closed at HEAD. No critical secret fails open.**

### Documentation-only: `RESEND_API_KEY` (not in the D-08 critical set)

`RESEND_API_KEY` is required-for-8-email-functions per `ENV-INVENTORY.md` but is **not** in D-08's named critical-secret set — a missing email key is a **degraded-email risk class**, not a security-critical fail-open (no privilege bypass, no unsigned-request acceptance, no unauthenticated external mutation). Its consumers also fail closed when unset (e.g. `notify-admin-activity/index.ts:70-71` `if (!RESEND_API_KEY) throw`; the upgrade/feature/notification email functions guard the key before sending). **Operator did not elect to treat it in-scope**, so it remains documentation-only and outside the ENV-05 critical disposition.

## Task Commits

1. **Task 1: Build the ENV-05 fail-closed coverage matrix from source reads** — `c7ba8a9a` (docs) — *prior session*
   - `docs(07-02): add ENV-05 fail-closed coverage matrix (6/6 critical secrets fail-closed at HEAD)`
   - Created `.planning/audit/ENV-FAILCLOSED.md` (116 lines); zero `supabase/functions` diff.
2. **Task 2: Operator confirms ENV-05 disposition (checkpoint:human-verify, blocking)** — *this session*
   - Operator disposition received: **"approved: add nothing."** No autonomous file change to edge code; disposition recorded in this SUMMARY.

**Plan metadata:** see the `docs(07-02): close ENV-05 ...` close-out commit (this SUMMARY) and the `docs(phase-07): update tracking after 07-02` tracking commit.

## Files Created/Modified

- `.planning/audit/ENV-FAILCLOSED.md` — ENV-05 fail-closed coverage matrix (created Task 1, `c7ba8a9a`; unchanged this session)
- `.planning/phases/07-environment-variable-audit-organization/07-02-SUMMARY.md` — this close-out summary
- **Zero product source touched** (`src` / `supabase/functions` diff EMPTY for this plan's scope).

## Decisions Made

- **Operator APPROVED "add nothing" (2026-06-23).** ENV-05 is satisfied by the coverage matrix; the D-08 surgical-add bar (a critical secret that fails OPEN) is not met, so no narrow `if (!x) throw/return` guard is added and no existing guard is weakened. Zero edge diff.
- **RESEND_API_KEY kept documentation-only** — fail-closed, degraded-email class, not a security-critical fail-open; operator did not elect to bring it in-scope.
- **No full `verify:baseline` re-run for this docs-only close-out** — since zero code changed since the green Phase-6 baseline, the wave-level baseline is unaffected; a full run would spend time with no change to validate. The wave-level baseline run remains the orchestrator's responsibility.

## Deviations from Plan

None — plan executed exactly as written. The plan's most-likely outcome ("all 6 fail closed at HEAD → operator confirms add-nothing → zero edge diff") is exactly what occurred. The conditional surgical-add branch (only triggered IF a fail-open critical secret were surfaced) was not entered.

## Zero-Functional-Change Evidence

- `git diff --stat -- supabase/functions src` (working tree) — **EMPTY** (no code touched).
- `git diff --stat c7ba8a9a^..HEAD -- src supabase/functions` (Task 1 commit onward) — **EMPTY**.
- Task 1 commit `c7ba8a9a` touched **only** `.planning/audit/ENV-FAILCLOSED.md` (1 file, 116 insertions).
- `rg -c "fail-closed" .planning/audit/ENV-FAILCLOSED.md` → **14** (>= 6, one+ per critical secret).
- `rg -c "cors\.ts|anthropic\.ts|supabase-client\.ts|stripe-client\.ts|stripe-webhook-handler|auth\.ts" .planning/audit/ENV-FAILCLOSED.md` → **9** (>= 6, every cited consumer present).
- Corrected (no `-E`) secret-grep guard over `ENV-FAILCLOSED.md` → **ZERO matches** (exit 1).

  (Note: `git diff v4.0-baseline..HEAD -- src supabase/functions` is non-empty, but every entry is cumulative Phase 2–6 cleanup history — CLEAN-02/03 dead-code removals and Phase 5/6 test-coverage additions — NOT this plan's work. The ENV-05 zero-change claim is scoped to the 07-02 plan: nothing changed since Task 1's commit.)

## Issues Encountered

None. The operator checkpoint (`autonomous:false`) was honored per the operator-checkpoint memory — paused for the disposition, never auto-approved.

## User Setup Required

None — no external service configuration required. (RESEND_API_KEY remains documentation-only; the 6 critical secrets are already provisioned in the deployed environment and verified fail-closed.)

## Next Phase Readiness

- ENV-05 closed; Phase 7 continues with Plan 3 of 4 (ENV-04 cross-surface separation audit scaffold already authored at `afd1ad65`).
- No blockers introduced. No guard added means no edge-change deploy-smoke is owed and no RESIDUAL-REGISTER deferred-smoke entry was needed (the paused TEST project `cimjltzovkahkqecpwgi` was NOT a gating factor here).

## Self-Check: PASSED

- FOUND: `.planning/audit/ENV-FAILCLOSED.md` (Task 1 artifact)
- FOUND: `.planning/phases/07-environment-variable-audit-organization/07-02-SUMMARY.md` (this file)
- FOUND: commit `c7ba8a9a` (Task 1 matrix commit)

---
*Phase: 07-environment-variable-audit-organization*
*Completed: 2026-06-23*
