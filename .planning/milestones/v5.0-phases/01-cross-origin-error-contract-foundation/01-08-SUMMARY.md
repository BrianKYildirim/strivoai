---
phase: 01-cross-origin-error-contract-foundation
plan: 08
subsystem: infra
tags: [cors, supabase-edge-functions, deploy, allowlist, preflight]

# Dependency graph
requires:
  - phase: 01-07
    provides: "Green deno+vitest baseline (cors.test.ts + cors-audit.test.ts) gating the deploy"
  - phase: 01-01
    provides: "Request-aware _shared/cors.ts (ALLOWED_ORIGINS allowlist, origin reflection, withCors/jsonError)"
  - phase: 01-02..01-06
    provides: "All 21 user Edge Functions wrapped in withCors"
provides:
  - "ALLOWED_ORIGINS live on staging (cimjltzovkahkqecpwgi) and production (zjpjapgraoxdukdvpjes)"
  - "All Edge Functions redeployed per environment so the rewritten _shared/cors.ts ships (bundled per-function)"
  - "Verified apex + www reach every production-observed function; www.strivoai.net outage closed (CORS-06)"
affects: [security-audit, analysis-lifecycle, all-edge-functions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-environment ALLOWED_ORIGINS edge secret (names-not-values); prod = tightest set (apex + approved www only, no wildcard/preview)"
    - "Full-fleet redeploy required after shared-module change (cors.ts bundled per-function at deploy)"

key-files:
  created:
    - ".planning/phases/01-cross-origin-error-contract-foundation/01-08-SUMMARY.md"
  modified: []

key-decisions:
  - "Staging allowlist = 'https://strivoai-git-preview-brians-projects.vercel.app,http://localhost:8080' (operator-supplied preview alias; RESEARCH Open Question #1 resolved)"
  - "Production allowlist = 'https://strivoai.net,https://www.strivoai.net' (CONTEXT decision #1 — tightest set, no preview, no wildcard)"
  - "All functions redeployed on both environments via scripts/deploy.ps1 (verify:baseline HARD gate ran first)"

patterns-established:
  - "Operator-gated live-config plan: Claude read-only on prod; operator sets secrets + runs deploys; Claude drives read-only preflight/CORS verification and presents evidence"

requirements-completed: [CORS-02, CORS-06]

# Metrics
duration: operator-paced (multi-checkpoint)
completed: 2026-07-01
---

# Phase 01 / Plan 08: ALLOWED_ORIGINS live-config + apex/www verification

**Env-driven `ALLOWED_ORIGINS` allowlist configured and verified live on staging then production — apex + www now reach every production-observed Edge Function with correct preflight and CORS-on-401; the `www.strivoai.net` outage is closed.**

## Performance

- **Duration:** operator-paced (4 blocking checkpoints)
- **Completed:** 2026-07-01T13:16:57Z
- **Tasks:** 4/4 (all `checkpoint:human-action` / `human-verify`)
- **Files modified:** 0 source files (live-config + verification plan; `files_modified: []`)

## Accomplishments
- **Staging configured** (`cimjltzovkahkqecpwgi`): `ALLOWED_ORIGINS="https://strivoai-git-preview-brians-projects.vercel.app,http://localhost:8080"`, all functions redeployed via `scripts/deploy.ps1 -Env staging` (verify:baseline gate passed).
- **Production configured** (`zjpjapgraoxdukdvpjes`): `ALLOWED_ORIGINS="https://strivoai.net,https://www.strivoai.net"`, all functions redeployed via `scripts/deploy.ps1 -Env production` (verify:baseline gate passed).
- **Verified apex + www** reach all four production-observed functions (analyze-resume, analyze-career, grade-linkedin, recruiting-lens); the confirmed `www.strivoai.net` outage is gone (CORS-06).
- **Fail-closed proven** on both environments: disallowed origins and unlisted subdomains receive no `Access-Control-Allow-Origin`.

## Task Commits

No source commits — all four tasks are operator checkpoints (secret-set + deploy on live environments, then verification). Only this SUMMARY.md is committed as the plan artifact.

1. **Task 1 (human-action):** Operator set staging `ALLOWED_ORIGINS` + redeployed all functions — "staging-configured"
2. **Task 2 (human-verify):** Staging allowlist verified (approved/disallowed + CORS-on-401) — "staging-verified"
3. **Task 3 (human-action):** Operator set production `ALLOWED_ORIGINS` + redeployed all functions — "prod-configured"
4. **Task 4 (human-verify):** Production apex + www verified across four functions + real-browser smoke — "prod-verified"

## Verification Evidence

**Staging (`cimjltzovkahkqecpwgi.supabase.co/functions/v1`):**
- Approved preview-alias preflight → `Access-Control-Allow-Origin: https://strivoai-git-preview-brians-projects.vercel.app` + `Vary: … Origin` on all 4 functions (HTTP 200).
- Approved `http://localhost:8080` preflight → `ACAO: http://localhost:8080` + `Vary: Origin`.
- Disallowed `https://evil.example` → **no ACAO** on all 4 (fail-closed).
- CORS-on-401 (invalid bearer, approved origin) → `HTTP 401` + `ACAO: <alias>` + body `{"error":"Unauthorized"}`.

**Production (`zjpjapgraoxdukdvpjes.supabase.co/functions/v1`):**
- Apex `https://strivoai.net` preflight → `ACAO: https://strivoai.net` + `Vary: Origin` on all 4 (HTTP 200).
- **www `https://www.strivoai.net` preflight → `ACAO: https://www.strivoai.net` + `Vary: Origin` on all 4** (the must-fix — outage closed).
- Disallowed `https://evil.example` → **no ACAO** on all 4 (fail-closed).
- Subdomain guard `https://app.strivoai.net` → **no ACAO** (exact apex+www only, no wildcard leak → threat T-01-08-01 mitigated).
- CORS-on-401 (invalid bearer, www origin) → `HTTP 401` + `ACAO: https://www.strivoai.net` + body `{"error":"Unauthorized"}`.
- Real-browser smoke on `https://www.strivoai.net`: Resume Analysis, Career Compass, LinkedIn Grader, Recruiting Lens no longer throw "Failed to fetch" / opaque CORS errors (operator-confirmed).

## Decisions Made
- Production allowlist kept to the **tightest set** (apex + approved www only) — no preview alias, no wildcard — per CONTEXT decision #1 and threat T-01-08-01.
- Staging preview alias resolved to `https://strivoai-git-preview-brians-projects.vercel.app` (RESEARCH Open Question #1).

## Deviations from Plan

None - plan executed exactly as written. Claude drove the read-only preflight/CORS verification curls to assist; the operator performed all secret-set/deploy actions and gave sign-off on each checkpoint (operator-checkpoint override honored — no auto-approval of prod secret application or the apex/www smoke).

## Issues Encountered
None.

## User Setup Required
None remaining — `ALLOWED_ORIGINS` is now set on both environments and all functions are redeployed. Future new/changed Edge Functions must be redeployed to inherit the bundled `_shared/cors.ts`; the `cors-audit.test.ts` drift guard (01-07) blocks reintroduction of hardcoded CORS.

## Next Phase Readiness
- Phase 1 goal achieved: apex + www reach every active Edge Function; structured errors render with CORS; single env-driven allowlist; production config verified.
- Ready for Phase 2 (Security Audit & Remediation).

---
*Phase: 01-cross-origin-error-contract-foundation*
*Completed: 2026-07-01*
