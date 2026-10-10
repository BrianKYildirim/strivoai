---
phase: 06-dependency-hygiene
plan: 06
subsystem: infra
tags: [lockfile, npm, deno, npm-ci, reproducible-install, dependency-hygiene, supply-chain]

# Dependency graph
requires:
  - phase: 06-01..06-05
    provides: the final package.json (DEP-02 removals + DEP-03 major/minor bumps + DEP-04 vuln fixes + ws/react-day-picker overrides) that this plan relocks against
provides:
  - root deno.lock regenerated to mirror the FINAL package.json (npm-spec mirror via deno install --lockfile-only)
  - package-lock.json confirmed already in sync (npm install = "up to date"; reconciled by the Wave 1-5 bump installs)
  - reproducible-install proof (rm -rf node_modules && npm ci exit 0 + clean-install deterministic gate green)
  - D-04 deferred Deno edge consolidation registered in RESIDUAL-REGISTER.md (documented/gated, not dropped)
  - finalized 06-DEP-CHANGES.md bump ledger (every row has status + revert SHA)
  - REQUIREMENTS.md DEP-02/03/04/05 + NFR-02 marked Complete
affects: [phase-08-database, phase-09-performance, future-deno-edge-consolidation, future-promptfoo-bump]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "npm ci on a cleared node_modules as the DEP-05 reproducibility + integrity proof (hard-fails on package.json/package-lock.json drift)"
    - "deno install --lockfile-only regenerates the ROOT deno.lock from package.json (no root deno.json); the EDGE supabase/functions/deno.lock stays absent by design (deno.json lock:false)"
    - "lockfile regen STRICTLY LAST (Pitfall 6) — a mid-stream relock would be invalidated by a later bump"

key-files:
  created:
    - .planning/phases/06-dependency-hygiene/06-06-SUMMARY.md
  modified:
    - deno.lock
    - .planning/audit/RESIDUAL-REGISTER.md
    - .planning/phases/06-dependency-hygiene/06-DEP-CHANGES.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "package-lock.json was already in sync from the Wave 1-5 bump installs (npm install reported 'up to date') — only the root deno.lock needed regeneration; this is a valid 'already reconciled' outcome, not a missed step."
  - "Recorded the HONEST current numbers (deno 699/0/11, NOT the stale plan-text 698; Playwright = 1 known env-red, NOT '5+1skip') — the plan frontmatter baseline was stale on both."
  - "First Playwright run showed a transient auth-session cold-start load-timeout (dashboard fully rendered + authenticated per the error-context snapshot) — a slow-load flake, not a code/auth failure; confirmed GREEN on the immediate re-run. Documented honestly rather than suppressed."
  - "D-04 Deno edge consolidation DEFERRED (not dropped): offline --no-check doesn't exercise an http/server API change; only per-function staging deploy-smoke proves safety; blast radius disproportionate to a currency win; closer to Phase 9."

patterns-established:
  - "Pattern: the DEP-05 closing gate proves reproducibility via npm ci (not a fresh npm install) — npm ci is deterministic + integrity-hashed + fails on lock drift."
  - "Pattern: edge deno.lock stays absent (D-04); only root deno.lock + package-lock.json are the DEP-05 reproducibility surface."

requirements-completed: [DEP-05, NFR-02]

# Metrics
duration: 31min
completed: 2026-06-20
---

# Phase 6 Plan 6: DEP-05 Lockfile Reconcile + Reproducibility Proof Summary

**Root `deno.lock` regenerated to mirror the final post-Waves-1-5 `package.json`, `package-lock.json` confirmed already in sync, and reproducibility PROVEN by a clean `rm -rf node_modules && npm ci` (exit 0) + clean-install deterministic gate (build 0 / vitest 457 / deno 699-0-11) — closing DEP-02/03/04/05 + NFR-02.**

## Performance

- **Duration:** ~31 min
- **Started:** 2026-06-20T19:37Z (session resume)
- **Completed:** 2026-06-20T20:08Z
- **Tasks:** 2
- **Files modified:** 4 (deno.lock + 3 .planning docs) + 1 created (this SUMMARY)

## Accomplishments

- **Lockfile reconcile (strictly last, Pitfall 6 honored):** confirmed all of Waves 1-5 (06-01..06-05) committed + clean tree, then `npm install` reconciled `package-lock.json` (result: **"up to date"** — already in sync from the prior-wave bump installs; `git diff package.json` + `git diff package-lock.json` BOTH empty) and `deno install --lockfile-only` regenerated the **root** `deno.lock` (995 ins / 1376 del) to mirror the final `package.json`.
- **Stale-spec drift cleaned from deno.lock:** the regenerated lock drops the pre-Phase-6 specifiers (the removed `@tailwindcss/typography`, the old `@hookform/resolvers@3`, `@supabase/supabase-js@2.106.1`, `@types/node@22`) and adds the Wave 2-4 targets (`@hookform/resolvers@5.4.0`, `@stripe@6.6.0/9.8.0`, `@supabase@2.108.2`, radix point releases, `@playwright/test@1.61.0`). The 4 DEP-02 removed deps (`html2canvas`/`jspdf`/`react-markdown`/`@tailwindcss/typography`) verified ABSENT (0 specifier entries each).
- **No deferred-framework major leaked:** `npm outdated` confirms react 18.3.1 / react-dom 18.3.1 / react-router-dom 6.30.4 / zod 3.25.76 / tailwindcss 3.4.19 / typescript 5.9.3 / tailwind-merge 2.6.1 / lucide-react 0.462.0 / react-day-picker 8.10.1 / react-resizable-panels 2.1.9 / pdfjs-dist 5.7.284 all stay on the deferred major.
- **Reproducibility PROVEN (DEP-05/D-08):** `rm -rf node_modules && npm ci` **SUCCEEDED (exit 0)** — `npm ci` hard-fails if `package.json`/`package-lock.json` are out of sync, so a green `npm ci` is the integrity + reproducibility proof; on the clean install the deterministic gate was green (**build 0 / vitest 457 / deno 699/0/11**) and Playwright = the **1 known env-red only** (`stripe-checkout.spec.ts:56`, no new red).
- **Edge `deno.lock` stays absent (D-04):** confirmed `supabase/functions/deno.lock` does NOT exist (`deno.json` has `"lock": false`); no edge lock created or touched.
- **D-04 deferred Deno edge consolidation REGISTERED** (documented/gated, not dropped) in RESIDUAL-REGISTER.md; the bump ledger finalized (DEP-05 row flipped `pending → taken`); REQUIREMENTS.md DEP-02/03/04/05 + NFR-02 marked Complete.

## Task Commits

Each task was committed atomically:

1. **Task 1: Reconcile lockfiles + prove reproducibility (npm ci + clean-install gate)** - `b0f543a5` (chore) — reconciled root `deno.lock` (package-lock already in sync), proved `npm ci` + deterministic gate green, confirmed no framework leak + edge lock absent.
2. **Task 2: Register D-04 deferred Deno consolidation + finalize ledger + close REQUIREMENTS** - `cbe62743` (docs) — appended the deferred edge consolidation to RESIDUAL-REGISTER, flipped the DEP-05 ledger row to taken, marked DEP-02/03/04/05 + NFR-02 Complete.

**Plan metadata:** (this SUMMARY + STATE advance committed separately as the final metadata commit)

## Files Created/Modified

- `deno.lock` - regenerated root npm-spec mirror lock (`deno install --lockfile-only`), now mirrors the final package.json
- `.planning/audit/RESIDUAL-REGISTER.md` - appended "DEP-05 Deferred — Deno Edge Consolidation (Phase 06, D-04)" section (std-version unification + zod import-style normalization across 27+ live fns; deploy-smoke rationale + clearance criterion; edge deno.lock absent by design)
- `.planning/phases/06-dependency-hygiene/06-DEP-CHANGES.md` - DEP-05 row flipped `pending → taken` with reproducibility evidence + revert SHA `b0f543a5`; added "Ledger finalized" close-out note
- `.planning/REQUIREMENTS.md` - DEP-02/03/04/05 + NFR-02 ticked `[x]` and Traceability rows set Complete; footer "Last updated" bumped
- `.planning/phases/06-dependency-hygiene/06-06-SUMMARY.md` - this summary

## Decisions Made

- **package-lock.json already in sync:** the prior-wave bump installs (06-01..06-05) each ran `npm install`, so `package-lock.json` was already reconciled to the final `package.json`. This plan's `npm install` correctly reported "up to date" with an empty diff. Only the **root deno.lock** had drifted (it was last regenerated 2026-06-13, pre-Phase-6) and needed regeneration. This is the expected "already reconciled" outcome, not a missed step — and `npm ci` still independently proves the in-sync state.
- **Honest numbers over stale plan text:** the plan frontmatter claimed `verify:baseline green (457/698/5+1skip)`. Recorded the CURRENT-HEAD reality instead: deno is **699/0/11** (the pre-existing +1 from Phase-5 WR-04/05/06 follow-ups, documented since 06-01) and Playwright is **1 known env-red** (`stripe:56`, paused-TEST gated), NOT a clean 5+1skip. The DEP-05 reproducibility proof is `npm ci` succeeding + the deterministic layers green + exactly the 1 documented env-red.
- **D-04 Deno edge consolidation deferred (not dropped):** recorded with the verbatim-equivalent rationale (offline `--no-check` does not exercise an `http/server` API change; only a per-function staging deploy-smoke of the 27+ live payment/AI/webhook functions proves safety; blast radius disproportionate to a currency win; closer to Phase 9 maintainability) + a concrete clearance criterion.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Transient deno install network read error → retry**
- **Found during:** Task 1 (root deno.lock regeneration)
- **Issue:** The first `deno install --lockfile-only` aborted mid-download with `error reading a body from connection` (a transient npm-registry network read failure on `@typescript-eslint/parser`), not a lock/config error.
- **Fix:** Re-ran `deno install --lockfile-only` — completed exit 0 on the retry; the only warnings were the expected/known peer notes (react-day-picker@8→date-fns@4 satisfied by the documented overrides shim `31e92d37`; the rest dev-only promptfoo subtree peers).
- **Files modified:** deno.lock (the intended reconcile)
- **Verification:** `git diff deno.lock` shows the clean npm-spec mirror reconcile; `npm ci` later succeeded on the resulting lock.
- **Committed in:** `b0f543a5` (Task 1 commit)

**2. [Rule 3 - Blocking] Chromium 1228 headless-shell install for Playwright 1.61**
- **Found during:** Task 1 (reproducibility proof, Playwright layer)
- **Issue:** `@playwright/test` 1.61 (from Wave-4 Group B) requires the matching Chromium 1228 browser; a fresh host needs it before `npm run test:e2e`.
- **Fix:** `npx playwright install chromium` (browser-cache only, no repo file change — the documented DI-06-04-01 carry-forward).
- **Files modified:** none (browser cache)
- **Verification:** Playwright ran; the second E2E pass = 4 passed / 1 skipped / 1 known env-red.
- **Committed in:** n/a (no repo change)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking/environmental). **Impact on plan:** Neither altered package.json/source or the lock content beyond the intended reconcile. No scope creep.

## Issues Encountered

- **Transient first-run Playwright env-red (auth-session cold-start load-timeout):** the FIRST clean-install E2E run showed TWO reds — the expected `stripe-checkout.spec.ts:56` env-red PLUS `auth-session.spec.ts:18`. Investigation of the error-context page snapshot showed the dashboard **FULLY rendered and authenticated** ("Your Career OS" hero, sidebar, merit balance, resume vault) — the failure was a `page.goto('/dashboard')` that hit the 120s test timeout while "waiting until load" on the heavy page (PDF workers + many resume cards) after a cold `npm ci` + fresh build. This is a slow-load FLAKE, not an auth or code failure. The lockfile reconcile touched ONLY `deno.lock` (zero source / zero npm-tree change), so it cannot cause an E2E regression. **Confirmed transient by an immediate re-run: 4 passed / 1 skipped / 1 failed — auth-session GREEN, only the documented `stripe:56` env-red remained, no new/3rd red.** Recorded honestly rather than suppressed.

## User Setup Required

None - no external service configuration required. (The remaining `stripe-checkout.spec.ts:56` env-red clears together with DI-06-03-01 / DI-06-04-01 / DI-06-05-01 when the operator un-pauses the shared TEST Supabase project `cimjltzovkahkqecpwgi` — an env-restoration, not a code fix.)

## Next Phase Readiness

- **Phase 6 (Dependency Hygiene) COMPLETE.** All 6 plans done; DEP-02/03/04/05 + NFR-02 satisfied; lockfiles consistent + reproducible (`npm ci`-proven); the bump ledger is the complete NFR-02 rollback record (every taken change has a `git revert <sha>` unit).
- **Ready for Phase 7 (Environment Variable Audit).** No blockers from this plan.
- **Carry-forward (deferred, documented in RESIDUAL-REGISTER.md):** the D-04 Deno edge consolidation (std/zod unification across 27+ live fns; edge deno.lock stays absent) — a dedicated edge-consolidation task with per-function staging deploy-smokes, closer to Phase 9. Plus the prior 06-* carry-forwards (DI-06-03-03 recharts-v3 types; the 4 deferred DEP-03 majors; the react-hooks-v7 React-Compiler pass; the 20-pkg dev-only promptfoo vuln residue cleared by a future promptfoo-major).

## Self-Check: PASSED

- `06-06-SUMMARY.md` — FOUND
- deno.lock reconcile committed in `b0f543a5` — FOUND
- commit `b0f543a5` (Task 1) — FOUND
- commit `cbe62743` (Task 2) — FOUND
- edge `supabase/functions/deno.lock` — confirmed ABSENT (D-04, correct)

---
*Phase: 06-dependency-hygiene*
*Completed: 2026-06-20*
