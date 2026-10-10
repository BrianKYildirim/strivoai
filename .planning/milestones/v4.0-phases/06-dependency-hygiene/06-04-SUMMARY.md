---
phase: 06-dependency-hygiene
plan: 04
subsystem: infra
tags: [npm, dependencies, radix-ui, stripe, supabase, react-query, vitest, playwright, framer-motion, react-hook-form]

# Dependency graph
requires:
  - phase: 06-03
    provides: "the react-day-picker date-fns overrides shim (31e92d37) that lets every `npm install` reconcile with 0 lock prune; the contained-major surface this plan layers minors on top of"
  - phase: 06-02
    provides: "date-fns@4 / recharts@3 behavioral majors (the date-fns@4 root that the 06-03 shim resolves the v8 react-day-picker peer against)"
provides:
  - "All outstanding minor/patch non-major point releases taken as 4 grouped-by-theme commits (D-07): radix / build-tooling / @stripe / supabase+react-query"
  - "Each batch an independent `git revert` unit + a 06-DEP-CHANGES.md ledger row with its revert SHA"
  - "Playwright 1.61 Chromium 1228 headless-shell binary installed (the bump's matching browser)"
affects: [06-05, 06-06, dependency-hygiene, dep-04-vuln-fixes, dep-05-lockfile-reconcile]

# Tech tracking
tech-stack:
  added: []  # no NEW package names — all bumps are point releases on already-present packages
  patterns: ["grouped-by-theme minor/patch commits (D-07); business-critical (@stripe / @supabase) surfaces isolated as their own revert units; deterministic-gate-only gating under the degraded-E2E carve-out (DI-06-03-01)"]

key-files:
  created:
    - ".planning/phases/06-dependency-hygiene/06-04-SUMMARY.md"
  modified:
    - "package.json (radix + build-tooling + @stripe + supabase/query point releases)"
    - "package-lock.json (reconciled by the per-batch installs)"
    - ".planning/phases/06-dependency-hygiene/06-DEP-CHANGES.md (4 new ledger rows)"
    - ".planning/phases/06-dependency-hygiene/deferred-items.md (DI-06-04-01 Stripe E2E env-defer)"

key-decisions:
  - "Installed every package at its LIVE `npm outdated` `wanted` non-major target re-read at HEAD — never a hardcoded version or @latest (targets drifted per RESEARCH)"
  - "next-themes NOT taken: its `^0.3.0` caret caps `wanted` at 0.3.0==current (latest 0.4.6 is a 0.x minor-major out of range); recorded as a no-op, not a bump"
  - "pdfjs-dist held at ^5.7.284 (5.x); 6.0.227 deliberately NOT taken (couples to a react-pdf major, out of scope)"
  - "@stripe batch: deterministic-gated + Stripe-checkout E2E DEFERRED to TEST-env restoration (DI-06-04-01) — not claimed green; the @supabase batch's auth-persistence E2E (auth-session.spec.ts) IS green and cited as its auth-path proof"
  - "ws override left at 8.20.1 (the supabase bump did not move it; ws is Plan 06-05's job); @tailwindcss/typography not re-added"

patterns-established:
  - "Pattern: business-critical payment/auth minor batches are each their own isolated grouped commit (independent revert unit) even when the bumps are non-major point releases"
  - "Pattern: a Playwright version bump requires installing its matching browser binary (npx playwright install chromium) — the binary download is part of the bump, not a code change"

requirements-completed: [DEP-03, NFR-02]

# Metrics
duration: 45min
completed: 2026-06-20
---

# Phase 6 Plan 4: Minor/Patch Grouped Bumps Summary

**All outstanding non-major point releases taken as 4 grouped-by-theme commits (radix / build-tooling / @stripe / supabase+react-query), each at its live `npm outdated` `wanted` target, each an independent revert unit + ledger row — pdfjs-dist held at 5.x, no deferred-framework major pulled, ws override untouched.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-06-20T16:07Z (approx)
- **Completed:** 2026-06-20T16:52Z
- **Tasks:** 2 (Task 1 = radix + build-tooling batches; Task 2 = @stripe + supabase/query batches)
- **Files modified:** package.json + package-lock.json (4 grouped commits) + 2 planning docs

## Accomplishments

- **Group A — radix batch (`75defe8f`):** 27 `@radix-ui/*` packages bumped to their live `wanted` non-major targets in one grouped commit.
- **Group B — build-tooling/misc-runtime batch (`fd83f905`):** `@vitejs/plugin-react-swc` 4.3.1, `vitest` 4.1.9, `@playwright/test` 1.61.0, `autoprefixer` 10.5.0, `framer-motion` 12.40.0, `react-hook-form` 7.80.0, `pdfjs-dist` 5.7.284 (stays ^5), `supabase` CLI 2.107.0. (`next-themes` had no in-range non-major bump — not taken.)
- **Group C — @stripe batch (`f46d44a0`):** `@stripe/react-stripe-js` 6.6.0, `@stripe/stripe-js` 9.8.0 — isolated payment-path revert unit; Stripe-checkout E2E env-deferred (DI-06-04-01).
- **Group D — supabase+query batch (`409333fe`):** `@supabase/supabase-js` 2.108.2, `@tanstack/react-query` 5.101.0 — isolated auth-path revert unit; auth-persistence E2E (auth-session.spec.ts) GREEN.
- Deterministic gate (build exit 0 / vitest 457 / deno 699-0-11) green after EACH of the 4 commits.
- End-of-wave full Playwright run: no new/3rd red; the single failure is the documented stripe-checkout reconcile env-red; **resume-analysis actually healed to GREEN** this run; `auth-session.spec.ts` GREEN.
- Installed the Playwright 1.61 Chromium 1228 headless-shell binary (the bump's matching browser).

## Task Commits

Each grouped batch committed atomically (staging ONLY package.json + package-lock.json — never `-A`/`.`/`-f`):

1. **Group A — radix batch** - `75defe8f` (chore)
2. **Group B — build-tooling batch** - `fd83f905` (chore)
3. **Group C — @stripe batch** - `f46d44a0` (chore)
4. **Group D — supabase+react-query batch** - `409333fe` (chore)

**Plan metadata:** (final docs commit — SUMMARY + ledger + deferred-items + STATE + ROADMAP)

## Live `wanted` targets taken per batch

Re-read via `npm outdated --json` at HEAD `0b9b4d75` before installing (targets drifted from RESEARCH):

| Batch | Packages → `wanted` |
| ----- | ------------------- |
| **A radix** | 27 `@radix-ui/*` point releases (e.g. react-accordion 1.2.14, react-dialog 1.1.17, react-avatar 1.2.0, react-context-menu 2.3.1, react-radio-group 1.4.1, react-select 2.3.1, react-slider 1.4.1, react-slot 1.3.0, react-switch 1.3.1, react-toast 1.2.17, react-tooltip 1.2.10, …) |
| **B build-tooling** | @vitejs/plugin-react-swc 4.3.1 · vitest 4.1.9 · @playwright/test 1.61.0 · autoprefixer 10.5.0 · framer-motion 12.40.0 · react-hook-form 7.80.0 · pdfjs-dist 5.7.284 (^5) · supabase 2.107.0 |
| **C @stripe** | @stripe/react-stripe-js 6.6.0 · @stripe/stripe-js 9.8.0 |
| **D supabase+query** | @supabase/supabase-js 2.108.2 · @tanstack/react-query 5.101.0 |

**next-themes:** `wanted=0.3.0==current` (the `^0.3.0` caret caps it; `latest=0.4.6` is a 0.x minor-major out of range) → **no in-range non-major bump; not taken** (recorded as no-op, not `@latest`).

## Guardrails confirmed (post-wave)

- **pdfjs-dist stays ^5.7.284** — `latest=6.0.227` NOT taken (couples to react-pdf major).
- **No deferred-framework major pulled** — final `npm outdated` shows `current` unchanged for react 18.3.1, react-dom 18.3.1, tailwindcss 3.4.19, zod 3.25.76, typescript 5.9.3, react-router-dom 6.30.3, react-resizable-panels 2.1.9, react-day-picker 8.10.1, lucide-react 0.462.0, tailwind-merge 2.6.1.
- **ws override unchanged at 8.20.1** — the @supabase/supabase-js bump did not move the resolved `ws` (lock shows ws@8.20.1 only); ws override is Plan 06-05's job.
- **@tailwindcss/typography not re-added** (absent in package.json — removed in 06-01).
- **Lock integrity preserved** after every batch — `@esbuild/*` (incl. linux-x64), `react-is` (3), `@testing-library/dom` (2) all intact; no critical prune (the shim from 06-03 held).

## Stripe + auth E2E evidence (degraded-E2E gate, DI-06-03-01)

The TEST Supabase project being paused makes 2 specs pre-existing env-reds. Per the operator-approved degraded gate, each batch gated on the deterministic layers; the full Playwright ran ONCE at end-of-wave:

- **auth-session.spec.ts (auth-persistence):** **GREEN** — cited as the Group D supabase batch's auth-path proof.
- **stripe-checkout.spec.ts `:26` (clientSecret round-trip + EmbeddedCheckout iframe):** GREEN this run.
- **stripe-checkout.spec.ts `:56` (post-checkout `?checkout=complete` reconcile):** the single failure — exactly the documented stripe-checkout env-red. The @stripe batch's live Stripe-checkout proof is **DEFERRED to TEST-env restoration (DI-06-04-01)**, NOT claimed green.
- **resume-analysis.spec.ts `:25`:** **GREEN** this run (one of the 2 documented env-reds healed — strictly better than baseline).
- **No new/3rd red appeared** → no batch introduced an E2E regression.

## Decisions Made

- Install each package at its live `wanted` non-major target re-read at HEAD (RESEARCH DRIFT table). next-themes not taken (no in-range bump). pdfjs-dist held at 5.x. See frontmatter key-decisions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed the Playwright 1.61 Chromium headless-shell binary**
- **Found during:** End-of-wave full Playwright run (after Group B bumped `@playwright/test` 1.60.0 → 1.61.0)
- **Issue:** Playwright 1.61 expects `chromium_headless_shell-1228`; only older shells (1169/1217/1224) were installed → `auth.setup.ts` failed at `browserType.launch` with "Executable doesn't exist". This is the bump's matching-browser requirement, not a code regression (per project memory: dependency-install plans need the browser binary).
- **Fix:** `npx playwright install chromium` (cleared a stale `__dirlock` left by an interrupted background spawn first). Binary `chromium_headless_shell-1228/.../chrome-headless-shell.exe` now present.
- **Files modified:** none in-repo (browser cache under `~/AppData/Local/ms-playwright/`, outside the repo)
- **Verification:** Re-ran `npm run test:e2e` → auth.setup + auth-session + resume-analysis + stripe `:26` all green; only the known stripe `:56` env-red remains; no new red.
- **Committed in:** N/A (no repo file change — browser cache only)

**2. [Plan-scoped defer] next-themes has no in-range non-major bump**
- **Found during:** Task 1 (Group B build-tooling batch construction)
- **Issue:** RESEARCH listed `next-themes 0.3.0 → 0.4.6`, but at HEAD `npm outdated` reports `wanted=0.3.0` (== current) — the `^0.3.0` caret caps the range, and 0.4.6 is a 0.x minor-major (out of the non-major / `wanted` rule). Taking 0.4.6 would be an `@latest`-style out-of-range bump, which the constraints forbid.
- **Fix:** Left next-themes at 0.3.0; recorded as a no-op in the Group B ledger row and commit body.
- **Verification:** `npm outdated` confirms next-themes `wanted==current`; no change to package.json.
- **Committed in:** N/A (no change)

---

**Total deviations:** 2 (1 blocking auto-fix = Playwright browser binary; 1 plan-scoped defer = next-themes out-of-range).
**Impact on plan:** No scope creep. The Playwright binary install is the mechanical consequence of the in-scope `@playwright/test` bump; the next-themes defer correctly honors the "live `wanted`, never `@latest`" constraint. All 4 grouped commits landed exactly as planned.

## Issues Encountered

- **Background `npm install` / `npx` spawns produced no effect on this host** — two attempts to run installs in the background completed with empty output and no package.json change; foreground runs worked correctly. One background spawn left a stale `ms-playwright/__dirlock` that blocked the Chromium install until removed. Resolved by running all installs foreground and clearing the stale lock.
- **End-of-wave Playwright showed 1 env-red, not the documented 2** — `resume-analysis.spec.ts` healed to green (TEST env partially reachable this run). This is strictly better than the DI-06-03-01 baseline; the surviving failure is exactly the documented stripe-checkout reconcile env-red, no new red. Within the degraded gate.

## User Setup Required

None - no external service configuration required by this plan. (The Stripe-checkout E2E proof is gated on the operator re-provisioning the shared TEST Supabase project — tracked as DI-06-04-01, not a blocker for this plan.)

## Next Phase Readiness

- All minor/patch point releases are now current; the remaining outdated entries are the intentionally-deferred framework majors + pdfjs-dist@6 (out of scope).
- **Wave 3 (06-05, DEP-04):** must re-measure the npm-audit vuln surface at execute time (34 vulns at this HEAD: 1 low / 14 moderate / 19 high — re-run `npm run audit:deps`); take vite / react-router-dom direct patches + the **ws override** operator decision (still 8.20.1 here) + the measured promptfoo bump.
- **Wave 4 (06-06, DEP-05):** lockfile reconcile (`npm install` relock + `deno install --lockfile-only`) + `npm ci` reproducibility proof runs strictly last and flips the DEP-05 placeholder ledger row to taken.

## Self-Check: PASSED

- `06-04-SUMMARY.md` — FOUND
- Commit `75defe8f` (radix) — FOUND
- Commit `fd83f905` (build-tooling) — FOUND
- Commit `f46d44a0` (@stripe) — FOUND
- Commit `409333fe` (supabase+query) — FOUND

---
*Phase: 06-dependency-hygiene*
*Completed: 2026-06-20*
