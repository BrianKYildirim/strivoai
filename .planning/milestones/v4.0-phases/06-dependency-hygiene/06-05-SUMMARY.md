---
phase: 06-dependency-hygiene
plan: 05
subsystem: infra
tags: [dependencies, security, npm-audit, vite, react-router-dom, ws, supabase-realtime, promptfoo, vulnerability-remediation, DEP-04]

# Dependency graph
requires:
  - phase: 03-cross-domain-inventory
    provides: DEPENDENCIES.md (DEP-01 vuln inventory) — the 9-vuln baseline + the DEP-04 candidate set
  - phase: 06-04
    provides: the Wave-4 grouped minor/patch lock at HEAD 2c0817c6 (ws still 8.20.1; the supabase-js bump did not move it)
provides:
  - "vite ^8.0.8 → ^8.0.16 — cleared the direct build-tool HIGH GHSA-fx2h-pf6j-xcff + moderate GHSA-v6wh-96g9-6wx3"
  - "react-router-dom ^6.30.1 → ^6.30.4 — cleared the only production-runtime advisory GHSA-2j2x-hqr9-3h42 (stays in 6.x; 7.x deferred)"
  - "ws override 8.20.1 → ^8.21.0 — cleared the production-path HIGH GHSA-96hv-2xvq-fx4p + the cascading engine.io/engine.io-client/socket.io-adapter HIGHs the old pin forced onto @supabase/realtime-js"
  - "npm audit surface 32 → 20 (1 low / 13 moderate / 6 high / 0 critical); all 20 remaining = dev-only promptfoo subtree, formally accepted"
  - "DEP-04 Accepted-Risk Residue table in RESIDUAL-REGISTER.md (20 dev-only rows, off-gate/dev-only/zero-prod rationale + clearance criteria)"
affects: [06-06, dependency-hygiene, lockfile-reconcile, promptfoo-major-followup, TEST-env-restoration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Measure-then-bump for security fixes: install a candidate in a throwaway, re-run npm audit, KEEP only on a clean clear; DISCARD on a worse-class escalation (never npm audit fix --force)"
    - "Polling-backstop acceptance: a production realtime override is accepted as low-risk when the sole consumer degrades to polling on socket failure + the bump is an in-major security patch"
    - "Env-deferred live smoke: a live external-env smoke is deferred (with documented rationale + clearance criterion) rather than blocking the phase on a paused TEST project"

key-files:
  created:
    - .planning/phases/06-dependency-hygiene/06-05-SUMMARY.md
  modified:
    - package.json
    - package-lock.json
    - .planning/audit/RESIDUAL-REGISTER.md
    - .planning/phases/06-dependency-hygiene/06-DEP-CHANGES.md
    - .planning/phases/06-dependency-hygiene/deferred-items.md

key-decisions:
  - "ws override 8.20.1 → ^8.21.0 taken (OPERATOR-DECIDED) on the production @supabase/realtime-js path; live realtime websocket smoke env-deferred (paused TEST project) and the override ACCEPTED as low-risk via the Results.tsx:409 polling-backstop (DI-06-05-01)"
  - "react-router-dom advisory taken as the in-6.x 6.30.4 patch (NOT the 6→7 major — deferred); vite advisory taken as the in-8.x 8.0.16 patch"
  - "promptfoo MEASURED-then-DISCARDED: 0.120.19 cleared only 3 pkgs but ESCALATED protobufjs HIGH→a NEW CRITICAL → discarded, residue grows (the acceptable dev-only/off-gate outcome); npm audit fix --force NEVER run"
  - "the 20 remaining dev-only transitive vulns (all promptfoo subtree) FORMALLY ACCEPTED off-gate (D-09) with per-package advisory IDs + clearance = a future promptfoo-major bump"

patterns-established:
  - "Per-advisory clearance proof: re-run npm audit after each fix and confirm the SPECIFIC GHSA is gone (not just a count drop), recorded in the NFR-02 ledger with the advisory ID + revert SHA"
  - "Accepted-risk residue is auditable, not hidden: every accepted dev-only vuln gets a register row (severity, advisory IDs only, subtree, rationale, clearance criterion) cross-referenced from the bump ledger"

requirements-completed: [DEP-04, NFR-02]

# Metrics
duration: ~95min
completed: 2026-06-20
---

# Phase 06 Plan 05: DEP-04 Vulnerability Remediation Summary

**Cleared all 3 direct/production security advisories (vite 8.0.16, react-router-dom 6.30.4, ws override ^8.21.0) dropping npm audit 32→20, with the production-realtime ws override accepted via polling-backstop (live smoke env-deferred) and the dev-only promptfoo residue formally accepted off-gate.**

## Performance

- **Duration:** ~95 min (Tasks 1+2 execution + the post-decision closeout)
- **Started:** 2026-06-20 (DEP-04 fixes)
- **Completed:** 2026-06-20 (operator ACCEPT on Task 3 → closeout)
- **Tasks:** 3 (Task 1 + Task 2 auto; Task 3 checkpoint:human-verify → operator ACCEPT)
- **Files modified:** 5 (package.json, package-lock.json, RESIDUAL-REGISTER.md, 06-DEP-CHANGES.md, deferred-items.md) + 1 created (this SUMMARY)

## Accomplishments

- **vite ^8.0.8 → ^8.0.16** (`3659e04f`): re-confirmed the advisory present at HEAD `2c0817c6` first, then bumped. The vite entry is GONE from `npm audit` → **GHSA-fx2h-pf6j-xcff** (HIGH — `server.fs.deny` bypass on Windows alt paths) **+ GHSA-v6wh-96g9-6wx3** (moderate — launch-editor NTLMv2 hash disclosure via UNC) BOTH cleared. vite IS the build tool, so `npm run build` stayed exit 0. high 17→16.
- **react-router-dom ^6.30.1 → ^6.30.4** (`cb2821e2`): cleared **GHSA-2j2x-hqr9-3h42** (open-redirect via `//`-leading protocol-relative URL) — the only production-runtime advisory. Resolved **6.30.4 (STAYS 6.x** — `npm ls react-router-dom` = 6.30.4, the 6→7 major remains deferred in RESIDUAL-REGISTER). react-router + react-router-dom GONE from audit. moderate 14→12. E2E proof: `auth-session.spec.ts:18` GREEN (session persists across a full reload, no `/auth` redirect — the routing-lib proof).
- **ws override 8.20.1 → ^8.21.0** (`3b887498`, OPERATOR-DECIDED): the old pin was forcing the vulnerable `ws` tree-wide including the production `@supabase/realtime-js`. After the bump, **`npm ls ws --all` = whole tree deduped to `ws@8.21.0`, ZERO `8.20.1` remaining** (every consumer "overridden to ^8.21.0"); `@supabase/realtime-js@2.108.2` confirmed on the `@supabase/supabase-js@2.108.2` production path. ws GONE from audit → **GHSA-96hv-2xvq-fx4p** (memory-exhaustion DoS) cleared **+ the cascading `engine.io` / `engine.io-client` / `socket.io-adapter` HIGHs** the old pin caused are ALL GONE. **high 16→6.**
- **npm audit 32 → 20** (1 low / 13 moderate / 6 high / **0 critical**) — all 20 remaining are the dev-only promptfoo subtree, formally accepted.
- **promptfoo MEASURED-then-DISCARDED**: a throwaway `npm install promptfoo@0.120.19 --save-dev` + `npm audit` re-measure cleared only 3 pkgs (`@azure/msal-node`, `hono`, `uuid`) but **ESCALATED `protobufjs` from HIGH to a NEW CRITICAL** (the `8.0.0–8.5.0` arbitrary-code-execution range — GHSA-xq3m-2v4x-88gg + prototype-injection cluster). Per D-03 that is NOT a clean moderate-clear → **DISCARDED** (`git checkout package.json package-lock.json`; promptfoo stays `0.120.13`; residue grows — the acceptable dev-only/off-gate outcome). `git diff package-lock.json` showed ZERO rolldown/napi/emnapi churn either way. **`npm audit fix --force` NEVER run.**
- **Dev-only residue formally ACCEPTED** (`e5aaec8c`): the DEP-04 Accepted-Risk Residue flat table appended to RESIDUAL-REGISTER.md — 20 rows (axios/ibm-cloud-sdk-core/form-data/hono/protobufjs/undici HIGH + @opentelemetry/* ×8 / js-yaml / @azure/msal-node / uuid / promptfoo MODERATE + esbuild LOW), each with severity + advisory IDs ONLY + dev-only promptfoo subtree + off-gate (D-09)/dev-only/zero-prod rationale + clearance = a future promptfoo-major bump.

## Task Commits

Tasks were committed atomically (each fix is its own `git revert` unit per NFR-02):

1. **Task 1a: vite 8.0.x → 8.0.16** — `3659e04f` (fix)
2. **Task 1b: react-router-dom 6.30.x → 6.30.4** — `cb2821e2` (fix)
3. **Task 1 ledger rows (vite + react-router-dom)** — `5b6d2c43` (docs)
4. **Task 2a: ws override 8.20.1 → ^8.21.0** — `3b887498` (fix)
5. **Task 2c: formally accept dev-only transitive vuln residue** — `e5aaec8c` (docs)
   - _(Task 2b promptfoo = MEASURED-then-DISCARDED — no commit; the throwaway was reset via `git checkout`.)_
6. **Tasks 1+2 done, PAUSED at Task 3** — `e62e1de4` (docs/state)

**Task 3 (checkpoint:human-verify):** OPERATOR DECISION = ACCEPT polling-backstop (live realtime websocket smoke env-deferred — paused TEST project). Recorded in this closeout.

**Plan closeout (this session):** ledger ws-smoke flip + DI-06-05-01 + this SUMMARY + STATE/ROADMAP — committed below.

## Files Created/Modified

- `package.json` — vite ^8.0.16 + react-router-dom ^6.30.4 + overrides.ws ^8.21.0 (react-day-picker date-fns shim intact; promptfoo UNCHANGED at 0.120.13)
- `package-lock.json` — reconciled for the 3 fixes (ws tree deduped to 8.21.0; no critical prune)
- `.planning/audit/RESIDUAL-REGISTER.md` — DEP-04 Accepted-Risk Residue table (20 dev-only rows) + audit 32→20 snapshot
- `.planning/phases/06-dependency-hygiene/06-DEP-CHANGES.md` — DEP-04 ledger rows (vite/react-router-dom/ws taken; promptfoo measured—not taken; residue accepted-risk); ws smoke note flipped PENDING → operator ACCEPT 2026-06-20 (polling-backstop)
- `.planning/phases/06-dependency-hygiene/deferred-items.md` — DI-06-05-01 appended (live realtime smoke env-deferred)
- `.planning/phases/06-dependency-hygiene/06-05-SUMMARY.md` — this file

## Decisions Made

- **ws override taken on the production realtime path, accepted via polling-backstop.** The `ws` 8.20.1→8.21.0 bump touches the production `@supabase/realtime-js` websocket, so Task 3 called for a LIVE realtime smoke. That live check is **env-deferred** (the shared TEST Supabase project `cimjltzovkahkqecpwgi` is paused — the same root cause as DI-06-03-01/DI-06-04-01). The operator **ACCEPTED** the override as low-risk on the realtime axis because: the app uses exactly ONE realtime channel (`src/pages/Results.tsx:409`, resume-completion detection) which is **polling-backstopped** (one-time fetch + `get-analysis-job-status` poll + 5s fallback DB poll — so a socket failure degrades to polling, not a broken flow), and `ws` 8.20→8.21 is a stable in-8.x security patch (single minor, no API change). Logged as **DI-06-05-01** with clearance = TEST-env restoration.
- **react-router-dom + vite taken as in-major patches, not the deferred majors.** react-router-dom @6.30.4 (NOT 6→7) and vite @8.0.16 (NOT a vite-major) — each clears its advisory while staying in-range; the 6→7 react-router migration stays deferred (RESIDUAL-REGISTER).
- **promptfoo measure-then-bump → DISCARD; never `--force`.** Measured 0.120.19, saw it ESCALATE protobufjs HIGH→CRITICAL (a worse class), discarded the throwaway; the residue grows (acceptable dev-only/off-gate). `npm audit fix --force` was never run (Pitfall 3 guardrail).
- **the 20 remaining dev-only highs/moderates FORMALLY ACCEPTED off-gate.** All are the promptfoo adversarial-eval subtree (D-09 — promptfoo is off the `verify:baseline` gate, never in the shipped bundle, zero prod-runtime exposure); auditable in RESIDUAL-REGISTER with advisory IDs + clearance criteria, not hidden.

## Deviations from Plan

### Auto-fixed Issues

None requiring Rule 1/2/3 source auto-fixes — this is a dependency-version-only plan (package.json/package-lock.json + planning docs). The two notable plan-prescribed branch points both resolved as the plan anticipated:

**1. [Plan-prescribed branch — measure-then-bump] promptfoo NOT taken**
- **Found during:** Task 2b (measure-then-bump promptfoo)
- **Issue:** The plan said "commit only if it cleanly clears moderates without churning the dev tree." The measured 0.120.19 cleared 3 pkgs but ESCALATED protobufjs HIGH→a NEW CRITICAL.
- **Fix:** DISCARDED the throwaway (`git checkout package.json package-lock.json`); promptfoo stays 0.120.13; residue grows (the plan's explicit acceptable-outcome). `npm audit fix --force` never run.
- **Files modified:** none committed (throwaway reset).
- **Verification:** `git diff package-lock.json` clean after reset; promptfoo still 0.120.13 in package.json.
- **Committed in:** n/a (not committed by design).

---

**Total deviations:** 0 source auto-fixes. The plan executed as written; the promptfoo measure-then-DISCARD is a plan-prescribed branch, not an unplanned deviation.
**Impact on plan:** None — zero functional change (no source touched; only dependency versions + planning docs).

## Issues Encountered

- **Task 3 live realtime smoke could not run against a live env** — the shared TEST Supabase project is paused (same paused-TEST root cause as DI-06-03-01/DI-06-04-01). Resolved by the operator decision to ACCEPT the override on the polling-backstop rationale and defer the live smoke to TEST-env restoration (DI-06-05-01), rather than block the phase on an external, operator-owned env.

## Validation Evidence

- **Deterministic gate green per fix:** `npm run build` exit 0 / vitest **457** / deno offline `test:ci` **699 / 0 / 11** after EACH of the 3 fixes.
- **Playwright (after react-router-dom AND after ws):** 4 passed / 1 skipped / 1 failed — the single failure is ONLY `stripe-checkout.spec.ts:56` (the documented env-red DI-06-03-01 / DI-06-04-01); `auth-session.spec.ts` GREEN, `resume-analysis.spec.ts` GREEN, NO new/3rd red.
- **Per-advisory clearance (not just a count drop):** vite/react-router/react-router-dom/ws + the engine.io/socket.io-adapter cascade all GONE from `npm audit` after their respective fixes; high 17→16→16→6; audit surface **32→20** (0 critical).

## User Setup Required

None — no external service configuration introduced by this plan. (The live realtime websocket smoke owed under DI-06-05-01 is an operator re-run against a restored TEST Supabase project, tracked in deferred-items.md.)

## Next Phase Readiness

- **DEP-04 satisfied:** all production/build advisories remediated with exact in-range fixes (each advisory re-confirmed cleared); the ws production-path HIGH closed + accepted via polling-backstop; promptfoo measured-not-assumed; dev-only residue explicitly accepted. NFR-02 honored — each fix is an atomic `git revert` unit with its SHA in the ledger.
- **Ready for 06-06 (Wave 4, DEP-05 lockfile reconcile):** the strictly-last plan that regenerates `package-lock.json` + root `deno.lock` and runs the `npm ci` reproducibility proof — this flips the pending DEP-05 placeholder ledger row to taken. The overrides shim's portable lock (ws ^8.21.0 + react-day-picker date-fns shim) is what 06-06 must integrity-prove on a clean install.
- **Carry-forward:** DI-06-05-01 (live realtime smoke env-deferred), DI-06-03-01/DI-06-04-01 (env-red E2E), DI-06-03-03 (10 recharts@3 tsc errors, off-gate), and the 4 deferred DEP-03 majors — all in deferred-items.md / RESIDUAL-REGISTER.md, none blocking 06-06.

## Self-Check: PASSED

- File `06-05-SUMMARY.md` — FOUND on disk.
- Commits FOUND in git: `3659e04f` (vite), `cb2821e2` (react-router-dom), `3b887498` (ws override), `e5aaec8c` (residue accept), `33ace46d` (SUMMARY + ws ACCEPT + DI-06-05-01).
- package.json verified intact: vite `^8.0.16`, react-router-dom `^6.30.4` (6.x), overrides.ws `^8.21.0`, react-day-picker date-fns shim present, promptfoo UNCHANGED `0.120.13`.
- No package.json / package-lock.json / source change introduced by this closeout (docs-only: SUMMARY + ledger + deferred-items + STATE + ROADMAP).

---
*Phase: 06-dependency-hygiene*
*Completed: 2026-06-20*
