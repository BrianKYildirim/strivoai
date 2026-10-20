# 06-DEP-CHANGES — Phase 6 Dependency Bump Ledger (NFR-02)

**Phase:** 06 — Dependency Hygiene
**Created by:** Plan 06-01 (Wave 1 — DEP-02 removals + `dotenv` declare)
**Created:** 2026-06-20
**Branch / HEAD at creation:** `staging`

---

## Purpose

This is the **NFR-02 bump ledger** (D-07): the single per-change record of every dependency mutation in
Phase 6, with its validation evidence and its **rollback unit** (the commit SHA that `git revert <sha>` backs
out cleanly). It is the concrete "each risky change is individually validated **and** has a documented rollback
path before merge" artifact.

**Append-only across waves.** Plan 06-01 seeds it with the Wave-1 rows (the 4 DEP-02 removals + the `dotenv`
declare + the DEP-05 lockfile placeholder). Later waves **append** their own rows in the same schema:

- **Wave 2** (Plans 06-02..06-04) — the contained-major bumps (behavioral majors with smoke; mechanical/devDep
  majors; the grouped minor/patch batches).
- **Wave 3** (Plan 06-05) — the DEP-04 vuln fixes (`vite`, `react-router-dom`, the `ws`-override operator
  decision, the measured `promptfoo` bump) + the formally-accepted dev-only residue rows.
- **Wave 4** (Plan 06-06) — the DEP-05 lockfile reconcile (`package-lock.json` + root `deno.lock`) + the
  `npm ci` reproducibility proof; this flips the `pending` DEP-05 placeholder row below to `taken`.

`Status` ∈ {`taken` / `deferred` / `accepted-risk` / `pending`}. The `deferred` and `accepted-risk` rows
cross-reference the append-only `.planning/audit/RESIDUAL-REGISTER.md` (the deferred DEP-03 majors + frameworks,
and the DEP-04 dev-only accepted residue). No secret value is ever written here — version identifiers and
advisory IDs only.

---

## Ledger

| Package | From → To | Type | Validation evidence | Smoke (behavioral only) | Revert SHA | Status |
| ------- | --------- | ---- | ------------------- | ----------------------- | ---------- | ------ |
| html2canvas | 1.4.1 → (removed) | DEP-02 remove | HEAD re-confirm zero-ref (knip + `rg` over src/supabase/scripts/e2e/root-config); build exit 0; verify:baseline green (vitest 457 / deno 699/0/11 / Playwright 5+1skip) | — | `77ca5410` | taken |
| jspdf | 4.2.1 → (removed) | DEP-02 remove | HEAD re-confirm zero-ref (`jspdf`/`jsPDF`); build exit 0; verify:baseline green (457 / 699/0/11 / 5+1) | — | `77ca5410` | taken |
| react-markdown | 10.1.0 → (removed) | DEP-02 remove | HEAD re-confirm zero-ref (`react-markdown`/`ReactMarkdown`); build exit 0; verify:baseline green (457 / 699/0/11 / 5+1) | — | `77ca5410` | taken |
| @tailwindcss/typography | 0.5.x → (removed) | DEP-02 remove (devDep) | HEAD re-confirm NOT in `tailwind.config.ts` plugins (`tailwindcss-animate` only); build exit 0; verify:baseline green (457 / 699/0/11 / 5+1) | — | `77ca5410` | taken |
| dotenv | (transitive 17.4.2) → ^17.4.2 (declared) | DEP-05 declare (devDep, D-05) | knip no longer reports `dotenv` "unlisted"; deduped to the existing integrity-hashed 17.4.2 (no new download); build exit 0; verify:baseline green (457 / 699/0/11 / 5+1) | — | `77ca5410` | taken |
| package-lock.json + deno.lock | — → reconciled (root deno.lock regenerated; package-lock already in sync) | DEP-05 lockfile reconcile (D-04/D-08) | **Plan 06-06 (Wave 4, strictly last; Pitfall 6).** `npm install` = **"up to date"** (package-lock.json was already in sync from the Wave 1-5 bump installs — `git diff package.json` + `git diff package-lock.json` BOTH empty); `deno install --lockfile-only` regenerated the **root** `deno.lock` to mirror the final `package.json` (995 ins / 1376 del — drops the stale pre-Phase-6 specifiers incl. the removed `@tailwindcss/typography`, the old `@hookform/resolvers@3`, `@supabase/supabase-js@2.106.1`, `@types/node@22`; adds `@hookform/resolvers@5.4.0`, `@stripe@6.6.0/9.8.0`, `@supabase@2.108.2`, radix point releases). **No deferred-framework major leaked** (`npm outdated`: react 18.3.1 / react-dom 18.3.1 / react-router-dom 6.30.4 / zod 3.25.76 / tailwindcss 3.4.19 / typescript 5.9.3 / tailwind-merge 2.6.1 / lucide-react 0.462.0 / react-day-picker 8.10.1 / react-resizable-panels 2.1.9 / pdfjs-dist 5.7.284 all stay on the deferred major). **Reproducibility PROVEN (D-08):** `rm -rf node_modules && npm ci` **SUCCEEDED (exit 0)** — `npm ci` hard-fails if package.json/package-lock.json are out of sync, so a green `npm ci` is the integrity + reproducibility proof; clean-install deterministic gate green (**build 0 / vitest 457 / deno 699-0-11**). **Edge `supabase/functions/deno.lock` stays ABSENT** (D-04, `deno.json` lock:false). Only `deno.lock` staged. | **Playwright (clean install, single confirm) = the 1 known env-red only.** Run twice on the cold clean install: the second run = **4 passed / 1 skipped / 1 failed** — the sole failure is `stripe-checkout.spec.ts:56` (`?checkout=complete` reconcile, the documented paused-TEST env-red DI-06-03-01/DI-06-04-01/DI-06-05-01); auth-session + resume-analysis + stripe `:26` all GREEN, **no new/3rd red**. (The first run showed a transient `auth-session.spec.ts:18` cold-start `page.goto('/dashboard')` 120s load-event timeout — the error-context page snapshot showed the dashboard FULLY rendered + authenticated, i.e. a slow-load flake on the heavy page after a fresh `npm ci`+build, NOT an auth/code failure; it recovered GREEN on the immediate re-run. Lockfile reconcile touched ONLY `deno.lock` — zero source/npm-tree change — so it cannot have caused an E2E regression.) | `b0f543a5` | taken |
| recharts | ^2.15.4 → ^3.8.1 | DEP-03 behavioral major | re-grep 3 consumers (ScoreProgressChart/EliteScoreHistory/ui/chart.tsx) → ZERO removed v3 internals (activeIndex/alwaysShow/isFront/recharts-scale/react-smooth/`.current.current`); public API only (AreaChart/LineChart/XAxis/YAxis/Tooltip/ResponsiveContainer/CartesianGrid/ReferenceLine/Area/Line/Legend); build exit 0; verify:baseline green (vitest 457 / deno 699/0/11 / Playwright 5+1skip) | PASS — Dashboard charts render w/ axes/line-area/tooltip/ReferenceLine — operator PASS 2026-06-20 | `7c4fca0b` | taken |
| date-fns | ^3.6.0 → ^4.4.0 | DEP-03 behavioral major | re-grep 9 consumers (AdminUsage/AnalysisHistory/CareerCompass/EliteScoreHistory/AnalysisComparisonModal/ScoreProgressChart/PriorLinkedInSelector/PriorAnalysisSelector/topup/MeritBalanceHeaderV2) → top-level named imports ONLY (format/isToday/isYesterday/differenceInDays); ZERO date-fns/fp, date-fns-tz, or subpath imports anywhere in src; build exit 0; verify:baseline green (vitest 457 / deno 699/0/11 / Playwright 5+1skip) | PASS — AnalysisHistory/CareerCompass/AdminUsage dates + Today/Yesterday correct, no Invalid Date — operator PASS 2026-06-20 | `6199439b` | taken |
| react-day-picker date-fns peer (overrides shim) | overrides += `"react-day-picker": { "date-fns": "$date-fns" }` | DEP-03 install-unblock (Option A, operator-approved; NOT a react-day-picker bump — stays v8) | resolves the deferred react-day-picker@8 `date-fns` peer (`^2.28 \|\| ^3`) to root `date-fns@4` so `npm install <pkg>` stops ERESOLVE-erroring; **0 lock prune** confirmed (`git diff package-lock.json` EMPTY; lock counts unchanged vs pristine `8d46c3cb`: 1423 entries / 26 `@esbuild/*` / `react-is`=1 / `@testing-library/dom`=1; `@esbuild/linux-x64` present); `npm install @hookform/resolvers@5 --dry-run` → no ERESOLVE, "changed 1 package"; build exit 0; deterministic gate green (vitest 457 / deno 699/0/11) | — | `31e92d37` | taken |
| @hookform/resolvers | ^3.10.0 → ^5.4.0 | DEP-03 mechanical/UI major | peer re-confirmed `npm view @hookform/resolvers@5.4.0 peerDependencies` = `{ react-hook-form: ^7.55.0 }` ONLY (repo 7.72.1 ✓); zod 3.25.76 satisfies the `/zod` Standard-Schema path (no zod-4); 3 zodResolver consumers (AddApplicationDialog/ReportOutcomeDialog/IntakeForm). v5 input/output `Resolver<>` split caused 4 NEW dialog `tsc` errors (the 2 dialogs with zod `.default()` fields) → **auto-fixed in scope (Rule 3)** by typing `useForm<z.input<schema>, unknown, z.output<schema>>` (type-only, 0 runtime change); IntakeForm clean (no defaults). After fix `tsc` = 0 NEW errors (only the 10 pre-existing recharts@3 errors remain — DI-06-03-03, out of scope). build exit 0; vitest 457; deno 699/0/11; lock 0-prune (1423/26/1/1) | PASS — all 3 zodResolver dialogs (AddApplicationDialog/ReportOutcomeDialog/IntakeForm) validate: invalid field blocked (zod error displays), valid field submits — operator PASS 2026-06-20 | `7ded036a` | taken |
| react-helmet-async | ^2.0.5 → ^3.0.0 | DEP-03 mechanical/UI major | peer re-confirmed `react: ^16.6 \|\| ^17 \|\| ^18 \|\| ^19` (React 18 ✓); consumer `App.tsx` `<HelmetProvider>` + 5 pages; build exit 0; vitest 457; deno 699/0/11; lock 0-prune (1423/26/1/1) | — | `df323d7a` | taken |
| sonner | ^1.7.4 → ^2.0.7 | DEP-03 mechanical/UI major (behavioral-lite) | peer re-confirmed `react: ^18 \|\| ^19` (✓); `toast()` call sites (26+ files) + `<Sonner/>` Toaster in `App.tsx`; v2 dropped deprecated props, `toast()` API stable; build exit 0; vitest 457; deno 699/0/11; lock 0-prune (1423/26/1/1) | PASS — toast fires + auto-dismisses, `<Sonner/>` Toaster mounts (no console error) — operator PASS 2026-06-20 | `950dc072` | taken |
| vaul | ^0.9.9 → ^1.1.2 | DEP-03 mechanical/UI major | peer re-confirmed `react: …^18…` (✓); consumer `ui/drawer.tsx` has **ZERO live consumers** (nothing renders `<Drawer/>`) → build/type-risk only; build exit 0; vitest 457; deno 699/0/11; lock 0-prune (1423/26/1/1) | — | `13140a92` | taken |
| react-resizable-panels | ^2.1.9 → ^4.11.2 → **reverted to ^2.1.9** | DEP-03 mechanical/UI major — **DEFERRED** (taken `b1edf22a`, reverted `5f59ac4f`) | v4 is a **breaking API overhaul** of the shadcn `ui/resizable.tsx` parity surface: `PanelGroup`→`Group`, `PanelResizeHandle`→`Separator`, prop model reworked (`direction`→`orientation`, `defaultLayout`, imperative refs). `vite build`/vitest/deno passed (the file has ZERO live consumers, transpile-only) so the break slipped the deterministic gate, but `npm run type-check` surfaced **5 TS2339 errors** in `ui/resizable.tsx` (`Property 'PanelGroup'/'PanelResizeHandle' does not exist`). A faithful v4 take requires re-vendoring the shadcn calendar-style parity rewrite (non-mechanical), so — exactly like react-day-picker@10 — **DEFER** (zero live consumers ⇒ nothing to prove-safe; not worth a hand-rolled non-canonical parity file). Reverted to ^2.1.9; type-check back to the 10 pre-existing recharts errors (0 resizable). See RESIDUAL-REGISTER.md. | — | `5f59ac4f` | deferred |
| @vercel/analytics + @vercel/speed-insights (COUPLED PAIR — one commit) | analytics ^1.6.1 → ^2.0.1; speed-insights ^1.3.1 → ^2.0.0 | DEP-03 mechanical/UI major (coupled — both touch `App.tsx`) | peers re-confirmed `react: ^18 \|\| ^19` (✓) for both; consumers `App.tsx` `<Analytics/>` + `<SpeedInsights/>`; moved as ONE coupled commit; build exit 0; vitest 457; deno 699/0/11; lock 0-prune (1423/26/1/1) | — | `8c103d9a` | taken |
| jsdom | ^24.1.3 → ^29.1.1 | DEP-03 devDep major (vitest DOM env) | ×5-major test-env bump; verified by `npm test` (jsdom is the vitest DOM env); lock change is jsdom-internal subtree only (net +25 entries; the single removed entry `rrweb-cssom` is jsdom's swapped CSS-parser dep) — **NO critical prune** (@esbuild ×26 incl. linux-x64, react-is, @testing-library/dom all intact); build exit 0; vitest 457; deno 699/0/11 | — | `72851a71` | taken |
| @types/node | ^22.16.5 → ^26.0.0 | DEP-03 devDep major (type-only) | ×4-major type-defs bump; verified by `npm run type-check` (adds **0 new errors** — `tsc` stays at exactly the 10 pre-existing recharts errors, 0 non-recharts) + `npm test`; types ≥ Node-22 runtime is fine; build exit 0; vitest 457; deno 699/0/11; lock 0-prune (critical @esbuild/react-is/@testing-library/dom intact) | — | `e5981d45` | taken |
| eslint-tooling COUPLED SET (one commit) | eslint ^9.32→^10.5.0; eslint-plugin-react-hooks ^5.2→^7.1.1; eslint-plugin-react-refresh ^0.4→^0.5.3; typescript-eslint ^8.38→^8.61.1; globals ^15.15→^17.6.0 | DEP-03 devDep major (coupled — flat-config plugins must agree on the eslint major) | flat-config plugins moved as ONE commit. `npm run lint` exit **0** against the Phase-4 D-12 scope (ignores `.claude/**`, `supabase/functions/**`, generated `types.ts` — INTACT). **react-hooks 5→7 expanded `recommended` 2→16 rules** (new React-Compiler rules fired as 30 errors on pre-existing code) → per the **D-12 tracked-baseline mechanism** the 12 newly-enabled rules are downgraded `error`→`warn` in `eslint.config.js` (`rules-of-hooks` KEPT `error`; ZERO source edited — `git diff src/` empty). Lint total 122→155 problems (0 err / 155 warn); `no-explicit-any` stays **99 (unpurged)**. lock change = eslint-internal subtree only (NO critical prune: @esbuild ×26, react-is, @testing-library/dom intact); build exit 0; vitest 457; deno 699/0/11; type-check unchanged (10 recharts). See RESIDUAL-REGISTER.md "NEW tracked warn-baselines". | — | `1848f728` | taken |
| **GROUP A — radix batch (one grouped commit)** | 27 `@radix-ui/*` point releases to live `wanted` non-major (react-accordion 1.2.12→1.2.14, react-alert-dialog 1.1.15→1.1.17, react-aspect-ratio 1.1.8→1.1.10, react-avatar 1.1.11→1.2.0, react-checkbox 1.3.3→1.3.5, react-collapsible 1.1.12→1.1.14, react-context-menu 2.2.16→2.3.1, react-dialog 1.1.15→1.1.17, react-dropdown-menu 2.1.16→2.1.18, react-hover-card 1.1.15→1.1.17, react-label 2.1.8→2.1.10, react-menubar 1.1.16→1.1.18, react-navigation-menu 1.2.14→1.2.16, react-popover 1.1.15→1.1.17, react-progress 1.1.8→1.1.10, react-radio-group 1.3.8→1.4.1, react-scroll-area 1.2.10→1.2.12, react-select 2.2.6→2.3.1, react-separator 1.1.8→1.1.10, react-slider 1.3.6→1.4.1, react-slot 1.2.4→1.3.0, react-switch 1.2.6→1.3.1, react-tabs 1.1.13→1.1.15, react-toast 1.2.15→1.2.17, react-toggle 1.1.10→1.1.12, react-toggle-group 1.1.11→1.1.13, react-tooltip 1.2.8→1.2.10) | DEP-03 minor/patch grouped (D-07 radix theme) | targets re-read from live `npm outdated --json` at HEAD `0b9b4d75` (never hardcoded/@latest); deterministic gate green (build exit 0 / vitest 457 / deno 699-0-11); lock integrity preserved (esbuild incl. linux-x64 / react-is=3 / @testing-library/dom=2 intact, total 1472→1457 radix-internal dedup); only package.json+package-lock.json staged; no deferred-framework major pulled | — | `75defe8f` | taken |
| **GROUP B — build-tooling batch (one grouped commit)** | @vitejs/plugin-react-swc 4.3.0→4.3.1; vitest 4.1.6→4.1.9; @playwright/test 1.60.0→1.61.0; autoprefixer 10.4.27→10.5.0; framer-motion 12.38.0→12.40.0; react-hook-form 7.72.1→7.80.0; pdfjs-dist 5.6.205→**5.7.284 (stays ^5)**; supabase CLI 2.100.1→2.107.0. **next-themes NOT taken** (`wanted=0.3.0==current`; latest 0.4.6 out of `^0.3.0` range — no in-range non-major bump) | DEP-03 minor/patch grouped (D-07 build-tooling theme) | live `wanted` targets at HEAD; deterministic gate green (build exit 0 / vitest 457 on bumped vitest 4.1.9 / deno 699-0-11); **@playwright/test 1.61 required installing Chromium 1228 headless-shell** (`npx playwright install chromium` — Rule 3 blocking auto-fix, browser-cache only, no repo file); pdfjs-dist held at 5.x (6.0.227 NOT taken — react-pdf coupling); lock integrity preserved; only package.json+package-lock.json staged | — | `fd83f905` | taken |
| **GROUP C — @stripe batch (one isolated grouped commit, payment path)** | @stripe/react-stripe-js 6.2.0→6.6.0; @stripe/stripe-js 9.2.0→9.8.0 | DEP-03 minor/patch grouped (D-07 stripe theme — business-critical, isolated revert unit) | live `wanted` targets at HEAD; deterministic gate green (build exit 0 / vitest 457 / deno 699-0-11); lock integrity preserved; only package.json+package-lock.json staged; no deferred major | **Stripe-checkout E2E = env-deferred (DI-06-04-01)** — TEST Supabase project paused; live clientSecret/iframe/`?checkout=complete` reconcile proof deferred to TEST-env restoration, NOT claimed green. (End-of-wave Playwright: stripe `:26` clientSecret/iframe GREEN, stripe `:56` reconcile = the documented env-red, no new red.) | `f46d44a0` | taken |
| **GROUP D — supabase+react-query batch (one isolated grouped commit, auth path)** | @supabase/supabase-js 2.103.0→2.108.2; @tanstack/react-query 5.97.0→5.101.0 | DEP-03 minor/patch grouped (D-07 supabase+query theme — business-critical, isolated revert unit) | live `wanted` targets at HEAD; **resolved `ws` UNCHANGED at 8.20.1** (the supabase bump did not move ws — lock shows ws@8.20.1 only; ws override is Plan 06-05's job); deterministic gate green (build exit 0 / vitest 457 / deno 699-0-11); lock integrity preserved; only package.json+package-lock.json staged; no deferred major | **auth-persistence E2E (`auth-session.spec.ts`) GREEN** (end-of-wave Playwright) — the auth-path proof for this batch | `409333fe` | taken |

> **End-of-wave E2E confirmation (Plan 06-03, after ALL Task 0/1/2 bumps landed, before the Task-3
> operator smoke):** a SINGLE full `npm run test:e2e` (Playwright) was run once all bumps were committed.
> Result: **3 passed / 1 skipped / 2 failed** — and the 2 failures are EXACTLY the 2 pre-existing
> env/infra-reds logged in `deferred-items.md` DI-06-03-01 (`resume-analysis.spec.ts:25` upload-timeout +
> `stripe-checkout.spec.ts:56` post-checkout reconcile, both gated on the shared TEST Supabase project
> being unavailable). **NO 3rd / new E2E red appeared** → no bump introduced an E2E regression. The
> per-bump deterministic gate (build exit 0 / vitest 457 / deno 699-0-11; + type-check no-new for
> resolvers@5 + @types/node@26; + lint exit 0 for the eslint set) was green for EVERY commit above; this
> single end-of-wave Playwright run is the DI-06-03-01 degraded-E2E-gate confirmation.
>
> **Baseline note (Wave 1):** the last-green `verify:baseline` Phase-5-close numbers were vitest 457 /
> deno 698/0/11 / Playwright 5+1skip. At this Plan 06-01 run the deno count is **699/0/11** — a pre-existing +1
> from the Phase-5 code-review follow-up commits (`fa78d30e` WR-04, `197689d5` WR-05, `e307f4e6` WR-06) that
> landed after the 698 baseline snapshot was recorded; it is **not** caused by this npm-only change (Plan 06-01
> touched only `package.json` + `package-lock.json`; zero `supabase/` / Deno files changed — confirmed via
> `git status -- supabase/` empty). Zero functional change holds.
>
| **vite** | ^8.0.8 → ^8.0.16 | DEP-04 HIGH (direct, in-8.x) | re-ran `npm audit --json` at HEAD `2c0817c6` FIRST — confirmed the advisory still present (vite HIGH, range `8.0.0-8.0.15`); installed `vite@8.0.16` (`npm install -D`); **vite entry now GONE from npm audit** → GHSA-fx2h-pf6j-xcff (HIGH, `server.fs.deny` bypass on Win alt paths) **+** GHSA-v6wh-96g9-6wx3 (moderate, launch-editor NTLMv2 hash disclosure via UNC) BOTH cleared; build exit 0 (vite IS the build tool — bump kept it green); vitest 457; deno 699/0/11; high count 17→16. Only package.json+package-lock.json staged. | — (build tool; no UI smoke) | `3659e04f` | taken |
| **react-router-dom** | ^6.30.1 → ^6.30.4 | DEP-04 moderate (direct prod-runtime, in-6.x) | re-confirmed present at HEAD (react-router moderate, range `<6.30.4`); installed `react-router-dom@6.30.4` (plain `npm install`, react-day-picker overrides shim `31e92d37` kept it clean); resolved **6.30.4 (stays 6.x — 7.x NOT pulled, `npm ls react-router-dom` = 6.30.4)**; **react-router + react-router-dom entries now GONE from npm audit** → GHSA-2j2x-hqr9-3h42 (open-redirect via //-leading protocol-relative URL) cleared; build exit 0; vitest 457; deno 699/0/11; moderate count 14→12. Only package.json+package-lock.json staged. | **auth-session E2E (`auth-session.spec.ts:18`) GREEN** — session persists across a full page reload, NO /auth redirect (the routing/auth proof for this routing-lib bump); full Playwright = 4 pass / 1 skip / 1 env-red (only stripe `:56` reconcile, DI-06-03-01/DI-06-04-01 — NO new/3rd red) | `cb2821e2` | taken |

| **ws (override)** | overrides `"ws": "8.20.1"` → `"ws": "^8.21.0"` | DEP-04 HIGH (prod realtime path — OPERATOR-DECIDED) | the old pin was FORCING the vulnerable `ws` tree-wide incl. production `@supabase/realtime-js`; bumped the override, `npm install` re-resolved; **`npm ls ws --all` = whole tree deduped to `ws@8.21.0`, ZERO `8.20.1` remaining** (every consumer "overridden to ^8.21.0"); `@supabase/realtime-js@2.108.2` confirmed on the `@supabase/supabase-js@2.108.2` production path; **ws entry GONE from npm audit** → GHSA-96hv-2xvq-fx4p (memory-exhaustion DoS) cleared **+ the cascading `engine.io` / `engine.io-client` / `socket.io-adapter` HIGHs the old pin caused are ALL GONE**; high count 16→6; react-day-picker overrides shim kept intact; build exit 0; vitest 457; deno 699/0/11. Only package.json+package-lock.json staged. **PROD realtime path → operator realtime smoke (Task 3) = ACCEPT (polling-backstop).** | **operator ACCEPT 2026-06-20 (polling-backstop)** — the LIVE realtime websocket smoke is **env-deferred** (the shared TEST Supabase project `cimjltzovkahkqecpwgi` is paused — same paused-TEST root cause as the env-red E2E items DI-06-03-01 / DI-06-04-01; see **DI-06-05-01**). The `ws` override is **accepted as low-risk on the realtime axis** because: (1) the app uses exactly ONE realtime channel — `Results.tsx:409` `.channel('resume-updates-${id}').on('postgres_changes', UPDATE on `resumes`).subscribe()` (the resume-analysis completion-detection path) — which is **polling-backstopped** (one-time fetch + `get-analysis-job-status` poll + a 5s fallback DB poll), so even a realtime-socket failure degrades to polling rather than breaking the flow; and (2) `ws` `8.20.1 → 8.21.0` is a **stable in-8.x security patch** (a single minor, no `ws` API surface change). Full Playwright after the bump = 4 pass / 1 skip / 1 env-red (only stripe `:56`, no new red); auth-session GREEN. On a future FAIL the one-line override is `git revert 3b887498` and the ws/engine.io HIGHs move to the accepted-risk residue. | `3b887498` | taken |
| **promptfoo** | 0.120.13 → (MEASURED 0.120.19, **NOT taken**) | DEP-04 dev-moderate (measure-then-bump, D-03 / Pitfall 2) | throwaway `npm install promptfoo@0.120.19 --save-dev` + `npm audit` re-measured, then **DISCARDED** (`git checkout package.json package-lock.json`). MEASURED delta: cleared only 3 (`@azure/msal-node`, `hono`, `uuid`) **but ESCALATED `protobufjs` HIGH→a NEW CRITICAL** (pulls protobufjs into the `8.0.0–8.5.0` arbitrary-code-execution range, GHSA-xq3m-2v4x-88gg + prototype-injection cluster). Per D-03 that is NOT a clean moderate-clear (churns the dev tree into a worse class) → **DISCARDED, residue grows** (the explicitly-acceptable dev-only/off-gate outcome). `git diff package-lock.json` showed ZERO rolldown/napi/emnapi wasm churn either way. **`npm audit fix --force` NEVER run.** promptfoo stays `0.120.13`. | — | — (not committed) | measured—not taken |
| **DEP-04 dev-only transitive residue (20 pkgs)** | — (formally accepted, not bumped) | DEP-04 accepted-risk (D-03 / D-09 off-gate) | the 20 remaining `npm audit` packages — axios / ibm-cloud-sdk-core / form-data / hono / protobufjs / undici (HIGH) + @opentelemetry/* ×8 / js-yaml / @azure/msal-node / uuid / promptfoo (MODERATE) + esbuild (LOW) — are **ALL in the dev-only promptfoo subtree**, OFF `verify:baseline` (D-09), zero prod-runtime exposure, never in the shipped bundle. FORMALLY ACCEPTED with per-package severity + advisory IDs + clearance criterion (future promptfoo-major bump) in `RESIDUAL-REGISTER.md` §"DEP-04 Accepted-Risk Residue". Audit surface 32→20 after the 3 direct/prod fixes (0 critical). | — | — (accepted; see RESIDUAL-REGISTER.md) | accepted-risk |

> **End-of-Task-1 E2E confirmation (Plan 06-05, after the vite + react-router-dom direct-advisory fixes landed):**
> a SINGLE full `npm run test:e2e` (Playwright, Chromium 1228 already installed) was run after the
> `react-router-dom@6.30.4` commit (the routing-lib bump is the one whose E2E proof is `auth-session`). Result:
> **4 passed / 1 skipped / 1 failed** — `auth.setup` + **`auth-session.spec.ts:18` (session-persists-no-/auth-redirect)
> GREEN** (the react-router-dom routing/auth proof) + `resume-analysis.spec.ts:25` GREEN + `stripe-checkout.spec.ts:26`
> (clientSecret/iframe) GREEN; the **single failure is `stripe-checkout.spec.ts:56`** (post-checkout
> `?checkout=complete` reconcile) — EXACTLY the documented env-red (DI-06-03-01 / DI-06-04-01, gated on the paused
> shared TEST Supabase project). **NO 3rd / new E2E red appeared** → neither direct-advisory fix introduced an E2E
> regression. The per-fix deterministic gate (build exit 0 / vitest 457 / deno 699-0-11) was green for BOTH commits.
>
> **End-of-wave E2E confirmation (Plan 06-04, after ALL 4 grouped commits A/B/C/D landed):** a SINGLE
> full `npm run test:e2e` (Playwright) was run once all 4 batches were committed. The `@playwright/test`
> 1.60→1.61 bump (Group B) first required installing its matching Chromium 1228 headless-shell
> (`npx playwright install chromium` — Rule 3 blocking auto-fix, browser-cache only). Result on the
> re-run: **4 passed / 1 skipped / 1 failed** — `auth.setup` + **`auth-session.spec.ts` (auth-persistence) GREEN**
> + `resume-analysis.spec.ts:25` **GREEN** (one of the 2 documented DI-06-03-01 env-reds HEALED this run —
> strictly better than baseline) + `stripe-checkout.spec.ts:26` (clientSecret/iframe) GREEN; the **single
> failure is `stripe-checkout.spec.ts:56`** (post-checkout `?checkout=complete` reconcile) — EXACTLY the
> documented stripe-checkout env-red (DI-06-03-01 / DI-06-04-01), gated on the paused shared TEST Supabase
> project. **NO 3rd / new E2E red appeared** → no batch introduced an E2E regression. The per-batch
> deterministic gate (build exit 0 / vitest 457 / deno 699-0-11) was green for EVERY commit above. The
> @supabase batch's auth-path proof is the GREEN `auth-session.spec.ts`; the @stripe batch's live
> Stripe-checkout proof is **env-deferred (DI-06-04-01)**, not claimed green.

### Ledger finalized (Plan 06-06, Wave 4 close, 2026-06-20)

This ledger is **COMPLETE** as of Plan 06-06. Every row carries a `Status` ∈ {`taken` / `deferred` /
`accepted-risk` / `measured—not taken`}, and **every `taken` row carries its revert SHA** (the `git revert <sha>`
rollback unit, NFR-02). The final DEP-05 lockfile-reconcile row was flipped `pending → taken` with its
`npm ci` reproducibility evidence + revert SHA `b0f543a5`. Cross-cutting close-out facts:

- **Reproducibility (DEP-05/D-08):** a clean `rm -rf node_modules && npm ci` succeeds (lock in sync, integrity-hashed
  install strictly from `package-lock.json`); the root `deno.lock` mirrors the final `package.json`; the edge
  `supabase/functions/deno.lock` stays absent by design (D-04). Clean-install deterministic gate green
  (build 0 / vitest 457 / deno 699-0-11); Playwright = the 1 documented env-red only (no new red).
- **No deferred-framework major leaked** by the relock (`npm outdated` confirms react 18 / react-router-dom 6.30.4 /
  zod 3.25.76 / tailwindcss 3 / typescript 5 / tailwind-merge 2 / lucide-react 0.462 / react-day-picker 8 /
  react-resizable-panels 2 / pdfjs-dist 5 all unchanged).
- **Deferred rows** (react-resizable-panels 2→4, and the DEP-03/framework majors + the **D-04 Deno edge
  consolidation**) cross-reference `RESIDUAL-REGISTER.md`; **accepted-risk rows** (the 20-pkg dev-only promptfoo
  vuln residue) cross-reference its DEP-04 Accepted-Risk table. The DEP-05 reconcile introduced **zero new package**.

This closes **DEP-02 / DEP-03 / DEP-04 / DEP-05 + NFR-02** for Phase 6 (REQUIREMENTS.md marked Complete).

### Wave-1 removal commit — single rollback unit

All four DEP-02 removals + the `dotenv` declare landed in **one atomic commit `77ca5410`**
(`chore(06-01): remove 4 unused deps + declare dotenv (DEP-02/D-05)`). `git revert 77ca5410` cleanly restores
all four removed packages and un-declares `dotenv` in a single operation. `package-lock.json` was reconciled by
`npm install` in the same commit (97 packages removed, 155 added/deduped, 1420 audited). The root `deno.lock`
was **deliberately left untouched** here (its authoritative regen + `npm ci` integrity proof is Wave 4 /
Plan 06-06 — regenerating it mid-stream would produce a lock a later wave invalidates, Pitfall 6).

---

## Cross-References

- **[`.planning/audit/RESIDUAL-REGISTER.md`](../../audit/RESIDUAL-REGISTER.md)** — the append-only register
  carrying the `deferred` DEP-03 majors (lucide-react / react-day-picker / tailwind-merge) + the D-01 deferred
  framework majors (this plan's Task 2 append), and (Wave 3) the DEP-04 dev-only accepted-risk residue.
- **[`06-RESEARCH.md`](./06-RESEARCH.md)** §"NFR-02 — Validation + rollback mechanics (D-07)" — the ledger
  schema + the last-green baseline + the behavioral-smoke checklist this ledger's Wave-2 rows will carry.
- **[`06-CONTEXT.md`](./06-CONTEXT.md)** §D-07 — the atomic-per-major-commit + bump-ledger decision.

*This file records package names, version identifiers, validation evidence, and commit SHAs only — no secret value is pasted anywhere in it.*
