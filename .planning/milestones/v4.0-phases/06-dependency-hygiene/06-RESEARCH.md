# Phase 6: Dependency Hygiene - Research

**Researched:** 2026-06-19
**Researched at HEAD:** `7a8560eb` (branch `staging`) — lockfiles confirmed byte-clean (no install/bump performed by this research pass)
**Domain:** npm/Deno dependency hygiene under a hard ZERO-FUNCTIONAL-CHANGE constraint (DEP-02/03/04/05 + NFR-02)
**Confidence:** HIGH (all HEAD-state numbers are freshly re-run command output; changelog/coupling classifications are HIGH where verified against official docs + repo consumer sweeps, MEDIUM where only one source)

> **READ THIS FIRST — the inventory drifted, loudly, since 2026-06-13.** The vuln picture is the big one: `npm audit` now reports **28 vulns (1 low / 16 moderate / 11 high)**, up from the inventory's 9 (5 mod / 4 high). The `promptfoo` "easy non-major win" assumed by D-03 is **no longer a simple non-major fix** in npm's eyes, AND a brand-new **HIGH on `vite`** (a *direct production build dep*) and a **HIGH on `ws`** (caused by the deferred `overrides:{"ws":"8.20.1"}` pin) have appeared. Several DEP-03 "mechanical contained majors" turned out to be **coupled to deferred frameworks** (`tailwind-merge`→Tailwind v4) or to carry **removed-runtime-surface** (`lucide-react` removed the `Linkedin` brand icon the app renders; `react-day-picker` 8→10 needs a shadcn `calendar.tsx` rewrite). Each drift is flagged inline with **⚠️ DRIFT**.

---

<user_constraints>
## User Constraints (from CONTEXT.md — D-01..D-08 are LOCKED, binding)

### Locked Decisions

- **D-01: Risk-tiered majors — take CONTAINED, defer FRAMEWORK-GRADE.** Take the contained majors (each individually gated). DEFER the migration-grade framework majors: React 18→19 (+ coupled `react-dom`, `@types/react`, `@types/react-dom`, `@testing-library/react` 14→16), Tailwind 3→4, Zod 3→4, TypeScript 5→6, and react-router-dom 6→7 (its DEP-04 advisory is taken as an *in-6.x* patch instead, D-03).
- **D-02: Contained-major validation rule — take all, smoke the behavioral ones.** Behavioral-surface majors (recharts 2→3, date-fns 3→4, react-day-picker 8→10, lucide-react 0→1) get a targeted manual smoke ON TOP of `verify:baseline`. Mechanical/devDep majors ride `verify:baseline` alone. The researcher/planner applies this per-package against each changelog — **DEFER a contained major instead if its changelog flags breaking runtime/visual behavior with no codemod.** Coupling caveat: confirm `@hookform/resolvers` 3→5 still supports zod 3.x before taking it (zod 4 deferred).
- **D-03: Fix the easy wins, formally accept the dev-only residue.** (a) react-router-dom — take the in-6.x patch closing GHSA-2j2x-hqr9-3h42; (b) promptfoo 0.120.13→0.120.19; (c) any clean `npm audit fix` that does not force a major. Then FORMALLY ACCEPT the remaining dev-only transitive highs (axios/esbuild/tsx/ibm-cloud-sdk-core under promptfoo) — dev/test-only, OFF the `verify:baseline` gate (D-09), zero production-runtime exposure.
- **D-04: Lockfile-reconcile is the DEP-05 core; defer the cross-function consolidation.** Regenerate root `deno.lock` + `package-lock.json` for reproducibility after all changes. On the edge side, take only low-risk/necessary changes and DEFER the std-version unification + zod import-style normalization across the 27+ live functions (behavior-risky on payment/AI/webhook paths, weakly validated offline). Record as a documented/gated finding.
- **D-05: `dotenv` is a DEP-05 *declare*, not a DEP-02 remove.** knip reports `dotenv` "unlisted" because `playwright.config.ts` imports it but it's absent from `package.json`. Add it to `devDependencies` — do not treat it as unused.
- **D-06: DEP-02 removal set = the 4 confirmed-safe, re-verified at HEAD.** Remove `html2canvas`, `jspdf`, `react-markdown`, `@tailwindcss/typography`. The 15 knip "unused" findings are KEEP-LIST false-positives (never removed). `react-pdf` STAYS (live consumer `src/lib/pdf-worker.ts`); `pdfjs-dist` STAYS (live via `pdf-extractor.worker.ts`). Researcher re-runs `npm run audit:deps` + knip at HEAD before any removal.
- **D-07: Atomic-per-major commits + a bump ledger.** Each major (or coupled set) is its own commit with `verify:baseline` green recorded (+ targeted smoke for behavioral majors). Commit SHA is the rollback unit (`git revert <sha>`). A phase bump ledger (e.g. `06-DEP-CHANGES.md`) records per row: package, from→to, validation evidence, revert SHA, status. Minor+patch bumps batched into grouped commits.
- **D-08: Reproducible-install verification (DEP-05).** After all changes, prove lockfile reproducibility via a clean-install check (clear `node_modules` → `npm ci`; root `deno.lock` regenerated alongside).

### Claude's Discretion

- Exact plan/commit slicing, the bump-ledger filename + format, the per-package contained-vs-defer classification mechanics, the precise in-6.x `react-router-dom` target, the reproducible-install command form, and whether `@hookform/resolvers` 3→5 stays contained after the zod-3 peer check — all left to research + planning.

### Deferred Ideas (OUT OF SCOPE)

- Framework-grade major migrations — React 18→19 (+ react-dom, @types/react, @types/react-dom, @testing-library/react 14→16), Tailwind 3→4, Zod 3→4, TypeScript 5→6, react-router-dom 6→7.
- Deno `std`-version unification + zod import-style normalization across the 27+ live edge functions (+ optional central import map).
- Dev-only transitive vuln highs (axios/esbuild/tsx/ibm-cloud-sdk-core under promptfoo) — formally accepted-with-rationale this phase; a future promptfoo-major bump that clears them is a separate scheduled task.
- **`ws` override pin (8.20.1)** — *CONTEXT said "left as-is."* ⚠️ **This deferral is now in tension with a new HIGH advisory (see Pitfall 1) — the planner must make an explicit call.** This research does NOT override D-01..D-08; it surfaces the new fact for the planner/operator.
</user_constraints>

---

## Summary

The four locked DEP-02 removal candidates (`html2canvas`, `jspdf`, `react-markdown`, `@tailwindcss/typography`) are **re-confirmed zero-reference and safe at HEAD `7a8560eb`** — the knip output is byte-identical to the 2026-06-13 inventory (18 unused deps + 2 unused devDeps + 1 unlisted `dotenv`), and `react-pdf`/`pdfjs-dist` both still have live consumers. DEP-02 is the clean, cheap, drift-free part of the phase.

The DEP-03 contained-major picture changed materially after applying the D-02 changelog gate against the live repo consumer surfaces. Three "contained" majors must **flip to DEFER** because their changelogs flag breaking runtime/visual behavior the validation net cannot prove safe (the D-02 escape hatch): **lucide-react 0→1** (removes the `Linkedin` brand icon the app renders in 6 files, incl. the business-critical LinkedIn Grader); **react-day-picker 8→10** (a 2-major jump that rewrites the shadcn `calendar.tsx` API — `IconLeft`/`IconRight` removed, classNames renamed); and **tailwind-merge 2→3** (drops Tailwind v3 support, *requires* the deferred Tailwind v4). The takeable contained set is the rest: recharts 2→3, date-fns 3→4 (both low-risk on this repo's actual usage), the dev/devDep mechanicals (jsdom, @types/node, globals, eslint-tooling), and the React-18-compatible UI bumps (@hookform/resolvers 5 [zod-3 peer confirmed compatible], react-helmet-async 3, sonner 2, vaul 1, react-resizable-panels 4, @vercel/analytics 2, @vercel/speed-insights 2).

DEP-04 is where the inventory is most stale. The vuln total went from **9 → 28**. The good news: `react-router-dom`'s fix is now a clean in-6.x `6.30.4`, and a brand-new HIGH on **`vite`** has a clean in-8.x `8.0.16` patch (a direct production build dep — take it). The complications: (1) the `ws` HIGH is *caused by* the `overrides:{"ws":"8.20.1"}` pin CONTEXT deferred — that pin now forces a vulnerable `ws` across the tree including production `@supabase/realtime-js`; (2) `npm audit fix` (non-force) pulls a large rolldown/wasm binding tree from promptfoo's subtree, confirming D-03's "don't broad-fix" rationale; (3) the dev-only transitive highs expanded well beyond axios/esbuild/tsx (now also `form-data`, `hono`, `protobufjs`, `undici`, `engine.io*`, `socket.io-adapter`, `js-yaml`, `dompurify`, `@opentelemetry/*`) — all still under promptfoo, all off-gate, all dev-only.

DEP-05 mechanics are confirmed and Windows-correct: regenerate `package-lock.json` via the bump installs themselves, regenerate root `deno.lock` via **`deno install --lockfile-only`** (deno 2.7.1 present; no root `deno.json`, so deno reads `package.json` directly), then prove reproducibility with `rm -rf node_modules && npm ci`. The Deno edge consolidation stays deferred per D-04.

**Primary recommendation:** Slice the phase into 4 waves — (1) DEP-02 removals + `dotenv` declare (cheap, drift-free, clears noise); (2) contained-major bumps atomic-per-major/coupled-set (with the 3 DEFER flips recorded to the residual register, not planned); (3) DEP-04 vuln fixes (vite + react-router-dom direct patches; promptfoo bump; the `ws`-override operator decision; formal accept of the dev-only residue); (4) DEP-05 lockfile reconcile + `npm ci` reproducibility proof as the closing gate. Lockfile regen MUST come last.

---

## DEP-02 — Unused-dependency removal (D-06): RE-CONFIRMED at HEAD, no drift

**Verdict: the removal set is unchanged and SAFE. Zero drift from 2026-06-13.**

### Re-run evidence (HEAD `7a8560eb`)

`npx --yes knip --reporter json` at HEAD returns **identical** sets to the inventory:
- **18 unused `dependencies`**, **2 unused `devDependencies`** (`@tailwindcss/typography`, `supabase`), **1 unlisted** (`dotenv`).
- The 15 KEEP-LIST false-positives are unchanged (14 shadcn `ui/**` consumers in the knip-`ignore`d tree + `supabase` deploy-CLI in `.ps1`).

The 4 removal candidates re-pass the zero-reference gate at HEAD (`rg` over `src` + `supabase` + `scripts` + `e2e` + root config files):

| Removal candidate | knip | Zero-ref sweep at HEAD | Verdict |
|---|---|---|---|
| `html2canvas` | unused | ZERO refs in any code/config file | **SAFE — remove** |
| `jspdf` | unused | ZERO refs (`jspdf`/`jsPDF`) anywhere | **SAFE — remove** |
| `react-markdown` | unused | ZERO refs (`react-markdown`/`ReactMarkdown`) anywhere | **SAFE — remove** |
| `@tailwindcss/typography` (devDep) | unused | NOT in `tailwind.config.ts` plugins (only `tailwindcss-animate`); ZERO refs anywhere | **SAFE — remove** |

### react-pdf / pdfjs-dist STAY (live consumers re-confirmed)

- `react-pdf` → live importer `src/lib/pdf-worker.ts` (re-confirmed at HEAD).
- `pdfjs-dist` → live importers `src/lib/pdf-worker.ts` + `src/lib/pdf-extractor.worker.ts` (+ 3 test files). The PDFHighlighter.tsx caveat is moot (removed Phase 4); the worker imports are independent.

### `dotenv` (D-05): declare, do not remove

knip still flags `dotenv` "unlisted" (imported by `playwright.config.ts`). It currently resolves **transitively at `17.4.2`** via `promptfoo`. Per D-05, add `"dotenv"` to `devDependencies` (pin to the resolved major `^17.4.2`, or the latest stable at plan time). This is a DEP-05 *declare*, not a DEP-02 remove.

### Exact verification commands the DEP-02 task will use

```bash
# 1. knip unused/unlisted leg (banner-prefixed JSON; strip to first {"issues")
npx --yes knip --reporter json
# 2. zero-reference confirmation for the 4 removal candidates (must return NOTHING)
rg -ni "html2canvas|jspdf|jsPDF|react-markdown|ReactMarkdown" src supabase scripts e2e *.ts *.js *.cjs *.mjs
rg -n  "typography" tailwind.config.ts          # must NOT appear in plugins
# 3. live-consumer re-confirm for the STAYs
rg -l "react-pdf" src          # → src/lib/pdf-worker.ts
rg -l "pdfjs-dist" src         # → pdf-worker.ts + pdf-extractor.worker.ts (+ tests)
# 4. removal verified against a clean build + passing tests (DEP-02 success criterion)
npm run build && npm run verify:baseline
```

---

## DEP-03 — Per-major contained-vs-defer classification (D-01/D-02 applied to CURRENT versions)

Current installed → latest target from `npm outdated --json` at HEAD. **Behavioral** = D-02 manual smoke on top of `verify:baseline`. **Mechanical/devDep** = ride `verify:baseline` alone. **DEFER** = D-02 escape hatch fired (breaking runtime/visual w/ no codemod) or coupled to a deferred framework.

### ⚠️ DRIFT in the version targets since 2026-06-13

| Package | Inventory latest (06-13) | **HEAD latest (06-19)** | Note |
|---|---|---|---|
| `@types/node` | 25.9.3 | **26.0.0** | now a ×4-major jump |
| `lucide-react` | 1.18.0 | **1.21.0** | still a 0→1 major |
| `react-router-dom` | 7.17.0 | **7.18.0** | deferred anyway |
| `eslint-plugin-react-refresh` | 0.5.2 | **0.5.3** | |
| `typescript-eslint` | 8.61.0 | **8.61.1** | |
| `supabase` (CLI) | 2.106.0 | **2.107.0** | KEEP (false-pos) |
| many radix point releases | — | **shifted up** | batch as grouped minor commit |

### TAKE — Behavioral-surface contained majors (smoke required, D-02)

| Package | from → to | Consumers (smoke surface) | Changelog breaking note | Take/Defer | Conf |
|---|---|---|---|---|---|
| **recharts** | 2.15.4 → 3.8.1 | `ScoreProgressChart.tsx`, `EliteScoreHistory.tsx`, `ui/chart.tsx` (live via Dashboard) | v3 rewrote internal state; removed `recharts-scale`/`react-smooth` deps, `activeIndex`, `alwaysShow`, `isFront`, `ResponsiveContainer ref.current.current`. **Repo uses NONE of these removed internals** (verified — only public `AreaChart`/`LineChart`/`XAxis`/`Tooltip`/`ResponsiveContainer`/`CartesianGrid`/`ReferenceLine`). | **TAKE** | HIGH |
| **date-fns** | 3.6.0 → 4.4.0 | 9 files; all top-level `format`/`isToday`/`isYesterday`/`differenceInDays` | v4 is ESM-first + adds TZ support; **no runtime breaking changes for standard usage** — only internal-type generics. Repo usage is unaffected. | **TAKE** | HIGH |

**Smoke for recharts:** load Dashboard → score-progress / elite-score-history charts render (axes, line/area, tooltip on hover).
**Smoke for date-fns:** load AnalysisHistory / CareerCompass / AdminUsage → dates render correctly (no `Invalid Date`, correct "Today"/"Yesterday" labels).

### ⚠️ DEFER — Behavioral majors where the D-02 escape hatch FIRES (record to residual register, do NOT plan)

| Package | from → to | Why DEFER (D-02 escape hatch) | Conf |
|---|---|---|---|
| **lucide-react** | 0.462.0 → 1.21.0 | **v1 REMOVES brand icons, including `Linkedin`.** The repo imports the lucide `Linkedin` component in **6 files** (`FeatureCards.tsx`, `LinkedInGrader.tsx`, `RecruitingLensTutorialModal.tsx`, `HowItWorksFeatureCards.tsx`, `Celebrations.tsx`, `Profile.tsx`) — incl. the **business-critical LinkedIn Grader**. v1 also drops UMD and flips icons to `aria-hidden` by default (decorative). This is a breaking *runtime/visual* change with **no clean codemod** for the removed brand icon (requires hand-supplying an SVG or alternate icon). 95 total lucide-importing files = high blast radius. Per D-02, **DEFER** (or a future task that takes v1 + replaces `Linkedin` with a custom SVG). | HIGH |
| **react-day-picker** | 8.10.1 → 10.0.1 | A 2-major jump. v9 rewrote the API the shadcn `ui/calendar.tsx` consumes: **`IconLeft`/`IconRight` removed** (replaced by a single orientation-aware `Chevron`), classNames keys renamed, `date-fns` moved peer→dep. The current `ui/calendar.tsx` uses the **v8** `IconLeft`/`IconRight` + v8 classNames → it would not compile/render without a rewrite of this KEEP-LIST `ui/**` parity file. **De-risk note:** `ui/calendar.tsx` has **ZERO live consumers** (no app surface renders `<Calendar/>`; all `Calendar`/`CalendarDays` matches in app code are the lucide icon) — so there is *no live surface a smoke could even validate*, which strengthens the DEFER under D-02 (changelog flags breaking behavior + no codemod + nothing to prove-safe). | HIGH |
| **tailwind-merge** | 2.6.1 → 3.6.0 | **v3 drops Tailwind CSS v3 support and REQUIRES Tailwind CSS v4.** Tailwind 3→4 is explicitly deferred (D-01, framework-grade). tailwind-merge 2→3 is therefore **coupled to a deferred framework** → must move with the Tailwind v4 migration milestone, not here. (`cn()` is used everywhere — broad blast radius if taken against Tailwind 3.) | HIGH |

> **These 3 DEFERs append to `RESIDUAL-REGISTER.md`** as documented-outdated (not dropped), alongside the D-01 deferred frameworks and the D-04 deferred Deno consolidation. Row format under DEP-05/residual section below.

### TAKE — Mechanical / devDep contained majors (ride `verify:baseline` alone, D-02)

| Package | from → to | Surface | Breaking note | Take | Conf |
|---|---|---|---|---|---|
| **@hookform/resolvers** | 3.10.0 → 5.4.0 | `zodResolver` in 3 dialogs (`ReportOutcomeDialog`, `AddApplicationDialog`, IntakeForm) | v5 peer = `react-hook-form: ^7.55.0` only (repo has 7.72.1 ✓). The `/zod` resolver path uses the **Standard Schema** spec, which requires **zod ≥ 3.25.0** — repo is on **zod 3.25.76 ✓**. **Coupling caveat RESOLVED: resolvers v5 supports zod 3.x (3.25+).** Confirm `npm run type-check` + the 3 dialog forms still validate. | **TAKE** | HIGH |
| **jsdom** | 24.1.3 → 29.1.1 | devDep — vitest DOM env | ×5-major; mechanical test-env bump; vitest 4 supports it. Verified only by `npm test` green. | **TAKE** | MEDIUM |
| **@types/node** | 22.19.17 → 26.0.0 | devDep — type defs | ×4-major; type-only; verified by `npm run type-check` + `npm test`. Aligns roughly with Node 22 runtime (types ≥ runtime is fine). | **TAKE** | MEDIUM |
| **globals** | 15.15.0 → 17.6.0 | devDep — eslint globals | ×2-major; mechanical; verified by `npm run lint` exit 0. | **TAKE** | MEDIUM |
| **react-helmet-async** | 2.0.5 → 3.0.0 | `App.tsx` + 5 pages (document head) | v3 peer `react: ^16 || ^17 || ^18 || ^19` (React 18 ✓). Maintenance bump. Verified by `npm test` + build. | **TAKE** | MEDIUM |
| **sonner** | 1.7.4 → 2.0.7 | `toast()` in 26+ files + `<Sonner/>` Toaster in `App.tsx` | v2 removed deprecated props; `toast()` API stable. Treat as behavioral-LITE: a quick toast-fires smoke is cheap insurance (e.g. trigger any toast on an action). | **TAKE** | MEDIUM |
| **vaul** | 0.9.9 → 1.1.2 | `ui/drawer.tsx` — **ZERO live consumers** | 0→1 major; primitive compiles but nothing renders it → only build/type risk. Ride baseline. | **TAKE** | MEDIUM |
| **react-resizable-panels** | 2.1.9 → 4.11.2 | `ui/resizable.tsx` — **ZERO live consumers** | ×2-major; primitive compiles but nothing renders it → only build/type risk. Ride baseline. | **TAKE** | MEDIUM |
| **@vercel/analytics** | 1.6.1 → 2.0.1 | `App.tsx` | v2 peer `react: ^18 || ^19` (✓). Mechanical. | **TAKE** | HIGH |
| **@vercel/speed-insights** | 1.3.1 → 2.0.0 | `App.tsx` | v2 peer `react: ^18 || ^19` (✓). Mechanical. | **TAKE** | HIGH |
| **eslint** | 9.39.4 → 10.5.0 | devDep — lint | Contained tooling major. Move as a **coupled eslint-tooling set** (see below). Verified by `npm run lint` exit 0 against the Phase-4 D-12 tracked baseline (0 err / ~122 warn). | **TAKE (set)** | MEDIUM |
| **eslint-plugin-react-hooks** | 5.2.0 → 7.1.1 | devDep — lint | ×2-major; peer allows `eslint ^10` ✓. Part of the eslint-tooling set. | **TAKE (set)** | MEDIUM |
| **eslint-plugin-react-refresh** | 0.4.26 → 0.5.3 | devDep — lint | 0.x minor-ish; part of the eslint set. | **TAKE (set)** | MEDIUM |

> **eslint-tooling coupling:** `eslint` 10 + `eslint-plugin-react-hooks` 7 + `eslint-plugin-react-refresh` 0.5 + (the already-minor) `typescript-eslint` 8.61.1 + `globals` 17 should move as **one coupled commit** (the flat-config plugins must agree on the eslint major). Validate with `npm run lint` exit 0 — the Phase-4 D-12 config scope (ignores `.claude/**`, `supabase/functions/**`, generated `types.ts`) and tracked warn-baselines must still hold (do not introduce new errors or purge the tracked `any` baseline).

### Minor + patch bumps (batch into grouped commits, D-07)

All radix `@radix-ui/*` point releases (e.g. `react-accordion` 1.2.12→1.2.14, `react-select` 2.2.6→2.3.1, etc.), `@stripe/react-stripe-js` 6.2.0→6.6.0, `@stripe/stripe-js` 9.2.0→9.8.0, `@supabase/supabase-js` 2.103.0→2.108.2, `@tanstack/react-query` 5.97.0→5.101.0, `react-hook-form` 7.72.1→7.80.0, `framer-motion` 12.38.0→12.40.0, `next-themes` 0.3.0→0.4.6, `autoprefixer` 10.4.27→10.5.0, `@vitejs/plugin-react-swc` 4.3.0→4.3.1, `vitest` 4.1.6→4.1.9, `@playwright/test` 1.60.0→1.61.0, `@tailwindcss/typography` (being REMOVED), `supabase` CLI 2.100.1→2.107.0, `pdfjs-dist` 5.6.205→5.7.284 (stay in 5.x; **do NOT take 6.0** — it's a major coupled to react-pdf's peer). Group these by theme (radix batch / stripe batch / supabase+query batch / build-tooling batch).

> ⚠️ **Stripe/Supabase caution (business-critical):** `@stripe/*` and `@supabase/supabase-js` touch the payment + auth paths. Even as minors, keep them in their own small grouped commit with E2E Stripe-checkout + auth-persistence flows green (they're in `verify:baseline`). Per CLAUDE.md, extra care on anything on Resume Analysis / Career Compass / payment paths.

### Confirm the deferred framework majors STAY deferred (do NOT plan)

React 18.3.1→19.2.7 (+ react-dom, @types/react 18→19, @types/react-dom 18→19, @testing-library/react 14→16), tailwindcss 3.4.19→4.3.1, zod 3.25.76→4.4.3, typescript 5.9.3→6.0.3, react-router-dom 6.30.3→7.18.0 — **all remain DEFERRED (D-01).** They are documented-outdated in the residual register, not dropped. (Note: `@hookform/resolvers` 5 and `tailwind-merge` 3 are the two places where a deferred framework leaks into "contained" classification — resolvers-5 is SAFE because zod-3.25 satisfies it; tailwind-merge-3 is NOT safe and must defer with Tailwind.)

---

## DEP-04 — Vulnerability remediation (D-03): EXACT targets at HEAD — ⚠️ HEAVY DRIFT

> **⚠️ DRIFT — the single most important thing for the planner.** `npm audit --json` at HEAD `7a8560eb`:
> **`{ info:0, low:1, moderate:16, high:11, critical:0, total:28 }`** — up from the inventory's `{ moderate:5, high:4, total:9 }`. New advisories landed across the promptfoo dev-subtree AND on two *direct* deps (`vite`, and `ws` via the override pin).

### (a) Production-runtime advisory — `react-router-dom` → take in-6.x `6.30.4`

- Advisory: **GHSA-2j2x-hqr9-3h42** (open-redirect via `//`-leading protocol-relative URL), via `react-router`.
- Vulnerable range: `react-router 6.7.0 – <6.30.4`. **Fix = `react-router-dom@6.30.4`** (npm `wanted` is `6.30.4`; advisory range is `<6.30.4`). `fixAvailable: true`, **stays in 6.x** (the 7.x major remains deferred per D-01).
- Surface: 86 files import `react-router-dom`; the patch is a point release with **no API change**. Validation: `verify:baseline` (E2E auth/session flow exercises routing).

### (b) ⚠️ NEW production-build advisory — `vite` → take in-8.x `8.0.16` (NOT in the inventory)

- `vite` is now a **DIRECT, HIGH** advisory at HEAD: **GHSA-fx2h-pf6j-xcff** (`server.fs.deny` bypass on Windows alternate paths, HIGH) + **GHSA-v6wh-96g9-6wx3** (launch-editor NTLMv2 hash disclosure via UNC path on Windows, moderate). Vulnerable range `8.0.0 – <=8.0.15`.
- **Fix = `vite@8.0.16`** (clean in-8.x patch; `npm outdated` wanted/latest both `8.0.16`; `fixAvailable: true`). This is a dev-server advisory (build tool), but `vite` is a declared production-build dependency — **take it** (it's a free, non-major direct-dep patch). Validation: `npm run build` + `verify:baseline`.

### (c) ⚠️ NEW — `ws` HIGH is CAUSED BY the deferred `overrides:{"ws":"8.20.1"}` pin (operator decision needed)

- `ws` is now **HIGH**: **GHSA-96hv-2xvq-fx4p** (memory-exhaustion DoS), vulnerable range `8.0.0 – <8.21.0`. The repo's `overrides:{"ws":"8.20.1"}` **forces the entire tree to the vulnerable `8.20.1`**, cascading HIGH/MODERATE effects into `engine.io`, `engine.io-client`, `socket.io-adapter`.
- **Consumers of `ws@8.20.1`:** production `@supabase/supabase-js → @supabase/realtime-js` (the realtime websocket — a *production* path), plus dev-only `promptfoo` (socket.io/openai/ink/jsdom).
- **The tension:** CONTEXT D-deferred list says "`ws` override pin — left as-is (not in scope to revisit)." That deferral was made when `8.20.1` was *not* flagged. It now *is*. **Recommendation:** the cheapest safe fix is **bump the override pin to `"ws":"^8.21.0"`** (or remove the pin entirely and let npm dedupe to a patched 8.x) — a one-line `package.json` change that clears the production-path HIGH + the cascading engine.io/socket.io effects. Because this touches a production realtime path, gate it on `verify:baseline` + a manual smoke that realtime-dependent UI still works (or confirm realtime is not actively used). **This is an operator/planner call — surface it explicitly; do not silently override D's deferral.** If the operator chooses to keep the pin, the `ws`/engine.io/socket.io highs join the formally-accepted residue (with the rationale that realtime websocket DoS requires an attacker-controlled peer).

### (d) promptfoo cluster — ⚠️ the "easy non-major win" is no longer simple

- **Inventory assumption (D-03):** `promptfoo 0.120.13 → 0.120.19` is a non-major patch clearing 3 moderates.
- **HEAD reality:** `npm audit` reports `promptfoo`'s `fixAvailable` as **`0.120.5` with `isSemVerMajor: true`** — because promptfoo's `latest` dist-tag is now **`0.121.17`** and, being a 0.x package, npm treats *any* minor bump as semver-major. **`0.120.19` still exists** (verified on the registry) and is within the same `0.120.x` line.
- **What `0.120.19` actually clears is now uncertain** — the moderate advisories on `@azure/msal-node`/`uuid` and the larger `@opentelemetry/*` cluster may need a newer promptfoo than `0.120.19`. **The planner's promptfoo task must, at plan/execute time, run `npm install promptfoo@0.120.19 --save-dev` in a throwaway and re-run `npm audit` to measure what it actually clears** before committing. Do not assume it clears the original 3 — re-measure.
- **Critical guardrail:** `npm audit fix` (non-force) was dry-run at HEAD and pulls in a **large `@rolldown/binding-*` + `@emnapi`/`@napi-rs` wasm tree** (promptfoo's deep transitive churn). This **confirms D-03's "do not broad-fix"** decision — a blanket `npm audit fix` (let alone `--force`) would churn/risk the dev toolchain for a dev-only-exposure win. **Take only the targeted direct-dep fixes (`vite`, `react-router-dom`, the `ws` override) + the measured `promptfoo` bump; never run `npm audit fix --force`.**

### (e) FORMALLY ACCEPT — dev-only transitive residue (off-gate, dev-only, zero prod exposure)

The inventory listed `axios`/`esbuild`/`tsx`/`ibm-cloud-sdk-core`. At HEAD the dev-only residue is **larger** (all under `promptfoo`'s subtree, all off the `verify:baseline` gate per D-09, all zero production-runtime exposure — promptfoo is adversarial-eval tooling run scheduled/by-label, never on the per-PR gate or in the shipped bundle):

| Package | Severity | Source advisory(s) | Why ACCEPT |
|---|---|---|---|
| `axios` | HIGH | GHSA-pjwm-pj3p-43mv, -hfxv-24rg-xrqf, -777c-7fjr-54vf, -p92q-9vqr-4j8v, -j5f8-grm9-p9fc, -35jp-ww65-95wh, -898c-q2cr-xwhg, -654m-c8p4-x5fp | dev-only via `ibm-cloud-sdk-core`←`promptfoo` |
| `ibm-cloud-sdk-core` | HIGH | via axios + form-data | dev-only via `promptfoo` |
| `form-data` | HIGH | GHSA-hmw2-7cc7-3qxx (CRLF injection) | dev-only via `ibm-cloud-sdk-core`←`promptfoo` |
| `hono` | HIGH | GHSA-88fw-hqm2-52qc (+4 mod) | dev-only via `promptfoo` |
| `protobufjs` | HIGH | GHSA-wcpc-wj8m-hjx6, -94rc-8x27-4472, -f38q-mgvj-vph7 | dev-only via `promptfoo` |
| `undici` | HIGH | GHSA-vmh5-mc38-953g, -vxpw-j846-p89q, -hm92-r4w5-c3mj (+mod/low) | dev-only via `promptfoo` |
| `engine.io` / `engine.io-client` / `socket.io-adapter` | HIGH | via `ws` | dev-only via `promptfoo` (also caused by the ws pin — see (c)) |
| `esbuild` | **LOW** (was HIGH) | GHSA-g7r4-m6w7-qqqr (Win dev-server file read) | dev-only via `tsx`; severity dropped to LOW at HEAD |
| `@opentelemetry/*` (8 pkgs) | MODERATE | GHSA-8988-4f7v-96qf (W3C Baggage unbounded alloc) | dev-only via `promptfoo` |
| `js-yaml` | MODERATE | GHSA-h67p-54hq-rp68 (merge-key DoS) | dev-only via `promptfoo` |
| `dompurify` | MODERATE/LOW | multiple IN_PLACE/hook-pollution advisories | dev-only via `promptfoo` |
| `@azure/msal-node` / `uuid` | MODERATE | GHSA-w5hq-g745-h8pq | dev-only via `promptfoo`; may clear with the measured promptfoo bump |

### RESIDUAL-REGISTER.md row format for the accepted-risk residue

The register uses a **field-table per item** (R-01 style) for individual residuals and **flat summary tables** for grouped kept-by-signal items. For the DEP-04 accepted-risk residue, append a new section in the flat-table style consistent with the existing "Kept-by-Signal" tables, e.g.:

```markdown
## DEP-04 Accepted-Risk Residue (Phase 06, D-03 — dev-only transitive vulns, OFF the verify:baseline gate)

| Package | Severity | Advisory(s) | Subtree (dev-only) | Accept rationale | Clearance criterion |
| ------- | -------- | ----------- | ------------------ | ---------------- | ------------------- |
| axios | HIGH | GHSA-pjwm-pj3p-43mv (+7) | ibm-cloud-sdk-core ← promptfoo | dev/test-only adversarial-eval tooling; OFF verify:baseline (D-09); zero prod-runtime exposure; not in shipped bundle | a future promptfoo-major bump that clears the subtree (separate scheduled task) |
| ... (one row per accepted package above) ... |
```

Each row records: package, severity, advisory IDs, dev-only subtree, accept rationale (off-gate / dev-only / zero-prod-exposure), and the clearance criterion (future promptfoo-major bump). **No secret/value is ever written** (advisory IDs only).

---

## DEP-05 — Lockfile reproducibility (D-04 / D-08): exact Windows-correct commands

### Root `deno.lock` mechanics (confirmed at HEAD)

- The root `deno.lock` is **lockfile version 5**, **389 KB**, with `version / specifiers / npm / remote / workspace` top-level keys; `workspace.packageJson.dependencies` mirrors `package.json` as `npm:` specs (1391 npm entries). It **lists the 3 removal candidates** (`html2canvas@1.4.1`, `jspdf@4.2.1`, `react-markdown@10.1.0_...`, `@tailwindcss/typography@0.5.19_...`) — a generated snapshot, **not** evidence of a real consumer.
- There is **NO root `deno.json`/`deno.jsonc`** — so deno discovers `package.json` directly and locks the npm graph. `deno 2.7.1` is present on the host.
- **Regeneration command (verified flag exists in deno 2.7.1): `deno install --lockfile-only`** — installs/updates **only** `./deno.lock` from `package.json` without mutating config. (`deno install --help` confirms `--lockfile-only`.)

> Note: the **edge** `supabase/functions/deno.lock` does NOT exist (`deno.json` has `"lock": false`, `"imports": {}`). DEP-05 only regenerates the **root** `deno.lock` + `package-lock.json`. The edge std/zod consolidation stays deferred (D-04).

### Exact command sequence (run from repo root; PowerShell-primary, Bash-safe)

```bash
# (a) REGENERATE both lockfiles after all DEP-02/DEP-03/DEP-04 changes are committed
#     package-lock.json is regenerated by the bump installs themselves; to force a clean,
#     consistent relock of the npm tree:
npm install                      # reconciles package-lock.json to the final package.json
#     root deno.lock (npm-spec mirror) — regenerate from the final package.json:
deno install --lockfile-only     # rewrites ./deno.lock (no config mutation)

# (b) PROVE reproducibility via a clean install (D-08)
#     PowerShell:                Remove-Item -Recurse -Force node_modules
#     Bash:
rm -rf node_modules
npm ci                           # deterministic install strictly from package-lock.json
npm run verify:baseline          # prove the clean install is green
```

- **`npm ci`** is the reproducibility proof: it fails if `package.json` and `package-lock.json` are out of sync, and installs strictly from the lockfile — exactly the D-08 "deterministic install" check.
- After regen, assert both lockfiles are committed and consistent:
  ```bash
  git status --porcelain package.json package-lock.json deno.lock   # only the intended deltas
  ```
- **Windows note:** all of the above are node/deno binaries, not shell chains — safe under cmd.exe-backed `npm run`. Do not chain with `&&`/`;` inside a single `npm` script string (Phase-3 03-01 lesson); if scripting, use the node-orchestrator pattern like `run-deps.mjs`.

### Deferred (D-04) — append to RESIDUAL-REGISTER.md, do NOT plan

The Deno edge consolidation stays deferred: std-version unification (prod pins `std@0.168.0` ×27 / `0.190.0` ×4 / `0.224.0` ×2; tests add `0.208.0`) + zod import-style normalization (`https://esm.sh/zod@3.25.76` vs `npm:zod@3.25`) across the 27+ live functions + optional central `deno.json` import map. **Rationale (record verbatim-equivalent):** offline `deno test:ci` runs `--no-check` and does not exercise an `http/server` API change — the only real proof a Deno bump is safe is deploying each of the 27+ live payment/AI/webhook functions to staging and smoking them; that blast radius on business-critical paths is out of proportion to a currency win and conflicts with zero-functional-change. Closer to Phase 9 maintainability.

---

## NFR-02 — Validation + rollback mechanics (D-07): exact gate, ledger schema, smoke

### The `verify:baseline` invocation + expected last-green baseline

```bash
npm run verify:baseline
# = npm run test (vitest, jsdom) && npm run test:edge (offline deno test:ci) && npm run test:e2e (Playwright)
```

- It chains **fail-fast (`&&`)** exactly three layers; **promptfoo / `test:adversarial*` are NOT on it** (D-09 — source-asserted negative invariant).
- **Expected last-green baseline (Phase-5 close, the numbers each bump must re-prove):**
  - **vitest: 457 passed** (79 files)
  - **deno offline `test:ci`: 698 passed | 0 failed | 11 ignored**
  - **Playwright: 5 passed + 1 quarantine-skip**
- A *new* red = a regression that blocks the commit. The same command is the **deploy gate** (`scripts/deploy.ps1` runs it as a HARD precondition before `supabase link`) — but Phase-6 work is npm/lockfile only; no edge deploy is needed unless the operator takes the `ws`-override (a production realtime path) and wants a realtime smoke.

### Atomic-per-major commit discipline (D-07)

- **Each contained major (or coupled set) = its own commit**, with `verify:baseline` green recorded in the commit/ledger. The **commit SHA is the rollback unit** → `git revert <sha>` cleanly backs out one bump.
- **Coupled sets that move together as ONE commit:** the eslint-tooling set (eslint 10 + react-hooks 7 + react-refresh 0.5 + typescript-eslint 8.61.1 + globals 17); the @vercel pair (analytics 2 + speed-insights 2 — both touch `App.tsx`).
- **Minor + patch bumps** batched into grouped commits by theme (radix batch, stripe batch, supabase+query batch, build-tooling batch).
- Follow `CONTRIBUTING.md` Conventional Commits. Stage **specific paths** only (`package.json`, `package-lock.json`, `deno.lock`, any edited `ui/**`/source) — **never `git add -A`/`.`/`-f`** (CLAUDE.md + project memory). `.planning/` IS tracked; commit the ledger normally.

### Bump-ledger schema (recommended filename: `06-DEP-CHANGES.md`)

CONTEXT suggests `06-DEP-CHANGES.md`; recommend that exact name, placed at `.planning/phases/06-dependency-hygiene/06-DEP-CHANGES.md`. One row per change:

| Package | From → To | Type | Validation evidence | Smoke (behavioral only) | Revert SHA | Status |
|---|---|---|---|---|---|---|
| html2canvas | 1.4.1 → (removed) | DEP-02 remove | build + baseline green (457 / 698 / 5+1) | — | `<sha>` | taken |
| recharts | 2.15.4 → 3.8.1 | DEP-03 behavioral | baseline green | Dashboard charts render | `<sha>` | taken |
| lucide-react | 0.462.0 → 1.21.0 | DEP-03 behavioral | — | — | — | **deferred (Linkedin icon removed)** |
| vite | 8.0.8 → 8.0.16 | DEP-04 high (direct) | build + baseline green | — | `<sha>` | taken |
| axios (transitive) | — | DEP-04 high | — | — | — | **accepted-risk (dev-only)** |
| package-lock + deno.lock | regenerated | DEP-05 | `npm ci` clean-install green | — | `<sha>` | taken |

`Status` ∈ {taken / deferred / accepted-risk}. The `deferred` and `accepted-risk` rows cross-reference the RESIDUAL-REGISTER.md append.

### Targeted manual-smoke checklist (behavioral-surface majors, D-02)

| Major taken | Smoke (eyeball the consumer surface) |
|---|---|
| **recharts 2→3** | Load **Dashboard** → `ScoreProgressChart` (free tier) / `EliteScoreHistory` (elite tier) render: axes, line/area, tooltip on hover, `ReferenceLine`. No console errors. |
| **date-fns 3→4** | Load **AnalysisHistory** / **CareerCompass** / **AdminUsage** → dates render correctly; "Today"/"Yesterday" labels correct; no `Invalid Date`. |
| **sonner 2** (behavioral-lite) | Trigger any toast (e.g. a copy action / a form submit) → toast appears + auto-dismisses; `<Sonner/>` Toaster still mounts in `App.tsx`. |
| *(react-day-picker / lucide — DEFERRED, no smoke)* | n/a — not taken this phase. |

---

## Plan-Slicing Guidance (for the planner)

Recommend **4 waves**, each wave's commits individually `verify:baseline`-gated, with lockfile regen strictly last.

### Wave 1 — DEP-02 removals + `dotenv` declare (cheapest, drift-free, clears noise)
- **Plan 06-01 (DEP-02):** remove `html2canvas`, `jspdf`, `react-markdown`, `@tailwindcss/typography` from `package.json` (one commit or a small batch); `npm install` to update lockfile; `npm run build && npm run verify:baseline`. Add `dotenv` to `devDependencies` (D-05). Knip re-run shows the 4 gone, the 15 false-positives unchanged.
- No ordering dependency on later waves.

### Wave 2 — Contained-major bumps (atomic-per-major / coupled-set, D-07)
- **Plan 06-02 (behavioral majors):** recharts 2→3 (smoke), date-fns 3→4 (smoke) — two atomic commits.
- **Plan 06-03 (mechanical/devDep majors):** @hookform/resolvers 5 (zod-3 peer OK), react-helmet-async 3, sonner 2, vaul 1, react-resizable-panels 4, @vercel pair, jsdom 29, @types/node 26, globals 17 — atomic-per-major (or sensible small batches for the zero-live-consumer primitives). The eslint-tooling **coupled set** is one commit.
- **Plan 06-04 (minor/patch grouped):** radix batch / stripe batch / supabase+query batch / build-tooling batch — grouped commits.
- **Record to RESIDUAL-REGISTER.md (no plan):** the 3 DEFER flips (lucide-react 0→1, react-day-picker 8→10, tailwind-merge 2→3) + the D-01 deferred frameworks. **Ordering note:** resolvers-5 has NO ordering dependency on zod (3.25 already satisfies it); tailwind-merge MUST NOT be taken (coupled to deferred Tailwind v4).

### Wave 3 — DEP-04 vuln fixes
- **Plan 06-05 (DEP-04):** (a) `vite@8.0.16` (direct HIGH, in-8.x) — commit; (b) `react-router-dom@6.30.4` (direct moderate, in-6.x) — commit; (c) the **`ws`-override operator decision** (bump pin to `^8.21.0` / remove pin, OR accept-with-rationale) — surface as an explicit checkpoint, since it touches the production realtime path and revisits a D-deferred item; (d) measure-then-bump `promptfoo@0.120.19` (re-run `npm audit` to see what it actually clears); (e) formally ACCEPT the dev-only residue → append to RESIDUAL-REGISTER.md. **Never `npm audit fix --force`.**

### Wave 4 — DEP-05 lockfile reconcile + reproducibility proof (the closing gate)
- **Plan 06-06 (DEP-05):** after ALL of Waves 1-3 are committed, `npm install` (relock package-lock) + `deno install --lockfile-only` (relock root deno.lock); then the clean-install proof: `rm -rf node_modules && npm ci && npm run verify:baseline`. Commit both lockfiles. Append the deferred Deno consolidation (D-04) to the residual register. Update REQUIREMENTS.md DEP-02/03/04/05 + NFR-02 to satisfied.

### Hard ordering dependencies
1. **Lockfile regen (Wave 4) MUST be last** — it must mirror the *final* `package.json` after every removal/bump.
2. **`@hookform/resolvers` 5 ↔ zod 3.25** — no ordering issue (peer already satisfied); take freely in Wave 2.
3. **`tailwind-merge` 3 ↔ Tailwind v4** — coupled; tailwind-merge does NOT move this phase (defer).
4. **`pdfjs-dist` 5.x ↔ react-pdf peer** — stay in 5.x; do not take pdfjs-dist 6.0 (couples to a react-pdf major not in scope).
5. **`ws` override ↔ production realtime** — if changed, gate on baseline + realtime smoke (operator call).

---

## Common Pitfalls

### Pitfall 1: The `ws` override pin now *causes* a HIGH advisory on a production path
**What goes wrong:** `overrides:{"ws":"8.20.1"}` forces the whole tree (incl. production `@supabase/realtime-js`) onto the vulnerable `ws@8.20.1` (GHSA-96hv-2xvq-fx4p, `<8.21.0`). CONTEXT deferred "revisiting the ws pin" before this advisory existed.
**How to avoid:** surface it as an explicit operator checkpoint; the one-line fix is `"ws":"^8.21.0"` (or remove the pin). Do not silently keep OR silently change a `<deferred>` item — make the planner/operator decide.
**Warning sign:** `npm ls ws` shows every consumer "deduped/overridden" to `8.20.1`; `npm audit` lists `ws` HIGH + engine.io/socket.io-adapter effects.

### Pitfall 2: Assuming `promptfoo@0.120.19` is a trivial 3-moderate clear
**What goes wrong:** npm's `fixAvailable` now points to `0.120.5 isSemVerMajor:true` (because promptfoo `latest` is `0.121.17` and it's a 0.x package). The original 3-moderate target may need a newer promptfoo than `0.120.19`, and a new `@opentelemetry/*` cluster appeared.
**How to avoid:** the promptfoo task must `npm install promptfoo@0.120.19` in a throwaway and re-run `npm audit` to measure the actual delta before committing.
**Warning sign:** audit shows promptfoo moderates persisting after the bump.

### Pitfall 3: Running `npm audit fix` (let alone `--force`) to chase zero
**What goes wrong:** non-force `npm audit fix` pulls a large `@rolldown/binding-*` + wasm tree from promptfoo's subtree — churns the dev toolchain for a dev-only-exposure win. `--force` would bump promptfoo across a 0.x "major."
**How to avoid:** take only targeted direct-dep fixes + the measured promptfoo bump. The dev-only residue is *formally accepted* (D-03), not force-fixed.
**Warning sign:** an `npm audit fix` diff adding rolldown/napi/emnapi packages.

### Pitfall 4: Treating lucide-react 0→1 or react-day-picker 8→10 as "mechanical icon/calendar bumps"
**What goes wrong:** lucide v1 **removes** the `Linkedin` brand icon (rendered in 6 files incl. LinkedIn Grader); react-day-picker v9 rewrites the `ui/calendar.tsx` API (`IconLeft`/`IconRight` gone). Both break compile/render with no codemod.
**How to avoid:** DEFER both per the D-02 escape hatch; record to residual register. (react-day-picker is doubly safe to defer — its `ui/calendar.tsx` has zero live consumers anyway.)
**Warning sign:** `import { ... Linkedin ... } from "lucide-react"`; `IconLeft`/`IconRight` in `ui/calendar.tsx`.

### Pitfall 5: tailwind-merge 3 against Tailwind 3
**What goes wrong:** tailwind-merge v3 drops Tailwind v3 support and requires v4 — taking it with the deferred Tailwind v3 would silently mis-merge `cn()` classes app-wide.
**How to avoid:** defer tailwind-merge with Tailwind v4.

### Pitfall 6: Lockfile regen before all bumps are committed
**What goes wrong:** regenerating `deno.lock`/`package-lock.json` mid-stream produces an inconsistent lock that a later bump invalidates; `npm ci` then fails.
**How to avoid:** Wave 4 (DEP-05) is strictly last; one final `npm install` + `deno install --lockfile-only` + `npm ci` proof.

### Pitfall 7: Knip JSON parsing on Windows
**What goes wrong:** `knip --reporter json` prefixes a human banner (`◇ injected env ... { debug: true }`) before the JSON; a naive `indexOf('{')` lands on the banner's brace.
**How to avoid:** slice from the literal `{"issues"` marker (the DEP-02 verification commands above already account for this).

---

## State of the Art (what changed since the 2026-06-13 inventory)

| Inventory claim (06-13) | HEAD reality (06-19) | Impact |
|---|---|---|
| 9 vulns (5 mod / 4 high) | **28 vulns (1 low / 16 mod / 11 high)** | DEP-04 scope materially larger; re-baseline the accepted residue |
| promptfoo→0.120.19 = easy non-major, clears 3 mod | npm `fixAvailable` = 0.120.5 **MAJOR** (0.x); 0.120.19 exists but clearance uncertain | measure-then-bump |
| only `react-router-dom` is a prod-runtime advisory | **`vite` is now a direct HIGH**; `ws`(prod realtime) HIGH via the override pin | two more direct-dep fixes to weigh |
| dev-only highs = axios/esbuild/tsx/ibm-cloud-sdk-core | residue expanded: + form-data, hono, protobufjs, undici, engine.io*, socket.io-adapter, js-yaml, dompurify, @opentelemetry/* (esbuild dropped HIGH→LOW) | larger accepted-risk table |
| @types/node latest 25.9.3 | **26.0.0** | ×4-major (still mechanical devDep) |
| lucide-react latest 1.18.0; "high blast radius" | **1.21.0**; confirmed removes the rendered `Linkedin` icon | flip to DEFER |
| react-day-picker = contained major | confirmed needs `ui/calendar.tsx` rewrite (zero live consumers) | flip to DEFER |
| tailwind-merge = contained major | confirmed requires Tailwind v4 | flip to DEFER (coupled) |

**Deprecated/outdated to avoid:** do not take `pdfjs-dist` 6.0 (couples to a react-pdf major out of scope); do not take any of the 5 deferred frameworks; do not take `tailwind-merge` 3, `lucide-react` 1, `react-day-picker` 10 this phase.

---

## Open Questions

1. **The `ws` override (production realtime path) — keep, bump-pin, or remove?**
   - What we know: `overrides:{"ws":"8.20.1"}` forces a HIGH (`<8.21.0`) across the tree including production `@supabase/realtime-js`. The one-line fix is `^8.21.0` or removing the pin.
   - What's unclear: why the pin was originally set to `8.20.1` (the `overrides` exists for a reason — possibly to dedupe a transitive conflict); whether realtime is actively used in the app.
   - Recommendation: **operator/planner checkpoint** in Wave 3. Default lean = bump pin to `^8.21.0`, gate on `verify:baseline` (+ realtime smoke if realtime is live). If kept, add ws/engine.io/socket.io to the accepted-risk residue with rationale. Do NOT decide silently — it revisits a `<deferred>` item.

2. **What does `promptfoo@0.120.19` actually clear at HEAD?**
   - What we know: 0.120.19 exists; the inventory assumed it clears 3 moderates; a new `@opentelemetry/*` cluster appeared.
   - What's unclear: whether 0.120.19 (vs a newer 0.120.x/0.121.x) is needed to clear the msal/uuid/otel moderates.
   - Recommendation: measure-then-bump (throwaway install + `npm audit` re-read) before the commit. If 0.120.19 under-delivers, the residue grows; that's acceptable (all dev-only, off-gate).

3. **Does `@hookform/resolvers` 5 change the `zodResolver` call signature in the 3 dialogs?**
   - What we know: v5 supports zod 3.25+ via Standard Schema; peer only requires react-hook-form ^7.55.
   - What's unclear: whether any of the 3 dialogs pass resolver options that changed shape in v5.
   - Recommendation: `npm run type-check` + load each form (ReportOutcome, AddApplication, IntakeForm) after the bump; the existing vitest dialog tests + type-check should catch a signature break. Confidence it's clean: HIGH.

---

## Sources

### Primary (HIGH confidence — freshly re-run at HEAD `7a8560eb`)
- `npm outdated --json` (full current→latest table) — run 2026-06-19
- `npm audit --json` (28 vulns; per-package fix targets, advisory IDs/URLs) — run 2026-06-19
- `npx --yes knip --reporter json` (18+2 unused, 1 unlisted — byte-identical to inventory) — run 2026-06-19
- `rg` consumer sweeps over `src`/`supabase`/`scripts`/`e2e` (DEP-02 zero-ref; lucide `Linkedin`; recharts/date-fns/calendar/sonner/vaul/resizable surfaces) — run 2026-06-19
- `npm view <pkg> peerDependencies/dist-tags` for @hookform/resolvers 5, @vercel 2, react-helmet-async 3, eslint-plugin-react-hooks 7, promptfoo, vite — 2026-06-19
- `deno install --help` / `deno --version` (2.7.1; `--lockfile-only` confirmed) — 2026-06-19
- `deno.lock` structure parse (v5, 1391 npm entries, workspace mirror) — 2026-06-19
- `.planning/audit/DEPENDENCIES.md` (the 03-03 authoritative inventory), `KEEP-LIST.md`, `RESIDUAL-REGISTER.md`, `06-CONTEXT.md`, `TESTING-STRATEGY.md`, `REQUIREMENTS.md`, `STATE.md`, `supabase/functions/deno.json`, `knip.json`, `scripts/audit/run-deps.mjs`

### Secondary (MEDIUM — official docs, single-source)
- recharts 3.0 migration guide (github.com/recharts/recharts/wiki/3.0-migration-guide)
- date-fns v4 release notes (blog.date-fns.org/v40-with-time-zone-support, deepwiki migration)
- react-day-picker v9 release + v10 upgrading (daypicker.dev/upgrading; shadcn-ui/ui issues #4366/#5417)
- lucide-react v1 migration (lucide.dev/guide/react/migration — brand-icon removals incl. Linkedin)
- tailwind-merge v3 (github releases — requires Tailwind v4)
- @hookform/resolvers v5 + zod 3.25 Standard-Schema compatibility (react-hook-form/resolvers releases + issue #811)
- deno install --lockfile-only (docs.deno.com)

---

## Metadata

**Confidence breakdown:**
- DEP-02 removal set: **HIGH** — re-run knip + zero-ref sweeps at HEAD; byte-identical to inventory.
- DEP-03 take/defer classification: **HIGH** for the 3 DEFER flips and the resolvers/zod + @vercel/helmet React-18 peers (verified peers + repo consumer evidence); **MEDIUM** for the mechanical devDep majors (changelog-light, validated by `verify:baseline` rather than per-package docs).
- DEP-04 targets: **HIGH** — exact advisory IDs/ranges/fix versions from fresh `npm audit --json`; the promptfoo-version uncertainty is explicitly flagged as a measure-then-bump.
- DEP-05 mechanics: **HIGH** — `deno install --lockfile-only` confirmed in deno 2.7.1; deno.lock structure parsed directly.
- NFR-02 gate/ledger: **HIGH** — `verify:baseline` composition + last-green baseline from TESTING-STRATEGY.md + STATE.md.

**Research date:** 2026-06-19
**Valid until:** ~2026-06-26 (7 days — fast-moving: the npm advisory surface and promptfoo/transitive versions drifted hard in the 6 days since the 06-13 inventory; the planner should re-run `npm run audit:deps` at plan/execute time and re-confirm the promptfoo + ws targets).
