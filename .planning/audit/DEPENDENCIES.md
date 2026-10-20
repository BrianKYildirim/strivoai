# DEP-01 — Dependency Inventory (frontend npm + Deno edge imports)

**Phase:** 03 — Cross-Domain Inventory & Audit
**Plan:** 03-03 (DEP-01)
**Run date:** 2026-06-13
**Branch / HEAD at run:** `staging` @ `0c656a0`
**Tooling (npx-driven / built-in, zero new devDeps — D-01):**
`npm outdated --json` (current/wanted/latest — D-02 one-time online registry lookup), `npm audit --json` (vuln signal), `npm ls`/`npm outdated`'s `dependent` field (consumers), `npx --yes knip --reporter json` (the unused/unlisted **dependency** leg), and `rg` over `supabase/functions/**` (the Deno inline-import enumeration, since the repo has NO central import map — `deno.json` `"imports": {}`, `"lock": false`). Re-runnable via `npm run audit:deps` + the `rg` blocks below.
**Scope:** Records package **names / versions / counts / consumers / advisory IDs** only — **never a token or secret value** (the ENV-INVENTORY no-values rule applies here too). **Read-only:** no dependency added/removed/bumped; `package.json`, `package-lock.json`, and `deno.lock` are byte-identical to HEAD (confirmed clean — see Re-Assertion). This is the inventory **Phase 6 (DEP-02 unused removal, DEP-03 bumps, DEP-04 vuln remediation, DEP-05 lockfile reconciliation)** acts on; nothing is acted on here.

---

## Verdict / Summary

> **Frontend npm:** 60 declared deps (47 `dependencies` + 13 `devDependencies` after the Stripe additions). **59 packages outdated** vs latest (`npm outdated`), of which **~26 are major-version bumps** (DEP-03 candidates incl. React 18→19, Tailwind 3→4, Zod 3→4, ESLint 9→10, lucide-react 0→1, recharts 2→3, react-router-dom 6→7). **9 vulnerabilities** (`npm audit`: **5 moderate / 4 high / 0 critical**), all in the dev/test transitive tree (`promptfoo`→`axios`/`esbuild`/`tsx`, `react-router-dom`) — DEP-04. **knip flags 18 `dependencies` + 2 `devDependencies` "unused" + 1 unlisted (`dotenv`)** — but the KEEP-LIST gate demotes **15 of the 20** to `needs-investigation` (14 are consumed only by the knip-`ignore`d `src/components/ui/**` shadcn primitives; `supabase` is a deploy-CLI binary used in `scripts/*.ps1` that knip can't scan). Only **4 earn `safe`** (`html2canvas`, `jspdf`, `react-markdown`, `@tailwindcss/typography` — zero code refs, all 4 D-06 signals concurring).
>
> **Deno edge imports:** 8 distinct production remote/npm specifiers across ~40 functions, NO import map. **Multi-version `std` drift recorded as a DEP-01 finding:** production code pins **`std@0.168.0` (27 fns)**, **`std@0.190.0` (4 notify/email fns)**, and **`std@0.224.0` (2 — `_shared/auth.ts` + `paddle-webhook`)**; the test tree adds **`std@0.208.0`** and **`std@0.224.0`** — so **four+ `std` minor versions co-exist** (broader than the research's "0.168 + 0.224" estimate). A **zod import-style split** also exists: prod uses both `https://esm.sh/zod@3.25.76` (`interviewPrep.ts`) and `npm:zod@3.25` (`handler.ts`). All Deno specifiers are LIVE (every consumer is a deployed/cron/webhook edge function) → **none `safe`**; the drift consolidation is a Phase-6 DEP-03 task.
>
> **Three-tier totals:** **4 `safe`** (frontend unused) / **~17 `needs-investigation`** (knip false-positives + transitive vulns + std/zod drift + react-pdf-via-dead-file) / **0 `unsafe`-but-the Paddle/gated Deno specifiers are KEEP-LIST-gated never-`safe`**. **No dependency is removed or bumped by this plan.**

---

## Commands Run (each read-only; results are counts/classifications, never values)

### 1. Frontend current / wanted / latest (D-02 online registry lookup)

```bash
npm outdated --json          # wired as the first leg of `npm run audit:deps`
```

**Result:** 59 packages outdated. Full current→latest captured in the **Frontend npm table** below. Lockfile untouched (read-only).

### 2. Frontend vulnerability signal → Phase 6 DEP-04

```bash
npm audit --json             # second leg of `npm run audit:deps`
```

**Result — `metadata.vulnerabilities`:** `{ info: 0, low: 0, moderate: 5, high: 4, critical: 0, total: 9 }`. Advisory chains captured in the **Vulnerability findings** section.

### 3. Consumers (who depends on each package)

The `dependent` field of `npm outdated --json` resolves every outdated row to the root project `strive-ai-hired` (all are **direct** declared deps — there are no outdated *transitive-only* rows surfaced by `outdated`). Transitive consumers for the **vuln** chain come from `npm audit`'s `via`/`effects`/`nodes` (recorded per-advisory below). Frontend runtime consumers (which `src/` file imports each dep) come from the `rg`-over-`src` cross-check in Command 5.

### 4. Frontend unused / unlisted dependency leg (knip)

```bash
npx --yes knip --reporter json     # the dependencies / unlisted sections only (dead-FILE leg lives in DEAD-CODE.md / 03-02)
```

**Result:** `dependencies` (unused): **18**. `devDependencies` (unused): **2** (`@tailwindcss/typography`, `supabase`). `unlisted`: **1** (`dotenv` ← `playwright.config.ts`). `unresolved`/`binaries`: 0. Every row gated against KEEP-LIST + a real-importer `rg` sweep in Command 5.

### 5. KEEP-LIST gate + real-importer sweep for every knip-"unused" dep

```bash
# For each knip-unused dep, find its REAL importer incl. the knip-ignored shadcn ui/** tree:
for dep in <each>; do rg -l "from ['\"]$dep" src; done
# Zero-import confirmation for the true-unused trio (require / import() / string / any ref):
rg -ni "html2canvas|jspdf|react-markdown|jsPDF|ReactMarkdown" src        # → ZERO in src/
# supabase devDep used as a CLI binary (knip can't scan .ps1/.mjs):
rg -n "supabase " scripts                                                # → deploy.ps1, cutover-production.ps1, phase21-runbook.ps1, …
# dotenv genuinely used but undeclared (transitive only):
rg -n "dotenv" playwright.config.ts e2e ; rg -n "\"dotenv\"" package.json # → used; NOT declared
```

**Result:** 14 of 18 unused `dependencies` resolve to a `src/components/ui/**` importer (the shadcn primitives knip is configured to `ignore`, so it cannot see them as consumers → **false positives**). `react-pdf` resolves to `src/components/PDFHighlighter.tsx` (a non-`ui/**` file). `html2canvas` / `jspdf` / `react-markdown` resolve to **nothing** in `src/` (true unused). `supabase` resolves to `scripts/*.ps1` CLI usage. `dotenv` is genuinely imported by `playwright.config.ts` but absent from `package.json` (a DEP-05 unlisted finding, not unused).

### 6. Deno inline-import enumeration (no central import map)

```bash
# Every remote / npm / jsr import + its version pin across edge functions (from-imports AND side-effect imports):
rg -No "(from |import )['\"](https://[^'\"]+|npm:[^'\"]+|jsr:[^'\"]+)['\"]" supabase/functions \
   -g '!*.test.ts' -g '!**/__tests__/**' -g '!**/_tests/**' -r '$2' | sort | uniq -c
# std-version drift across the WHOLE tree (prod + tests):
rg -No "deno\.land/std@[0-9.]+" supabase/functions | sort -u
```

**Result:** 8 distinct **production** specifiers (table below). The naive `from "..."` grep alone **misses side-effect imports** (`import "...";` with no `from`) — corrected here to also catch the `xhr@0.1.0` polyfill (11 AI fns) and the `paddle-webhook` `timing_safe_equal` crypto import. Production `std` pins: `0.168.0` (×27), `0.190.0` (×4), `0.224.0` (×2). Test tree adds `0.208.0` and `0.224.0`.

---

## Frontend npm — Outdated / Consumers / Risk (DEP-01 → Phase 6 DEP-03)

`Major?` = latest is a major-version bump over current (DEP-03 risk). `Class` = three-tier. Consumers: all rows are **direct** project deps (`dependent: strive-ai-hired`); the runtime-import note is the `src/` consumer where load-bearing.

| Package | Current | Latest | Major? | Consumer / note | Class |
|---------|---------|--------|--------|-----------------|-------|
| @eslint/js | 9.39.4 | 10.0.1 | **major** | devDep — `eslint.config.js` | needs-investigation (DEP-03) |
| @hookform/resolvers | 3.10.0 | 5.4.0 | **major (×2)** | forms (`react-hook-form` + zod) | needs-investigation (DEP-03) |
| @radix-ui/react-accordion | 1.2.12 | 1.2.13 | minor | `ui/accordion.tsx` | needs-investigation (point bump) |
| @radix-ui/react-alert-dialog | 1.1.15 | 1.1.16 | minor | `ui/alert-dialog.tsx` | needs-investigation |
| @radix-ui/react-aspect-ratio | 1.1.8 | 1.1.9 | minor | `ui/aspect-ratio.tsx` | needs-investigation |
| @radix-ui/react-avatar | 1.1.11 | 1.1.12 | minor | `ui/avatar.tsx` | needs-investigation |
| @radix-ui/react-checkbox | 1.3.3 | 1.3.4 | minor | `ui/checkbox.tsx` | needs-investigation |
| @radix-ui/react-collapsible | 1.1.12 | 1.1.13 | minor | `ui/collapsible.tsx` | needs-investigation |
| @radix-ui/react-context-menu | 2.2.16 | 2.3.0 | minor | `ui/context-menu.tsx` | needs-investigation |
| @radix-ui/react-dialog | 1.1.15 | 1.1.16 | minor | `ui/dialog.tsx` | needs-investigation |
| @radix-ui/react-dropdown-menu | 2.1.16 | 2.1.17 | minor | `ui/dropdown-menu.tsx` | needs-investigation |
| @radix-ui/react-hover-card | 1.1.15 | 1.1.16 | minor | `ui/hover-card.tsx` | needs-investigation |
| @radix-ui/react-label | 2.1.8 | 2.1.9 | minor | `ui/label.tsx` | needs-investigation |
| @radix-ui/react-menubar | 1.1.16 | 1.1.17 | minor | `ui/menubar.tsx` | needs-investigation |
| @radix-ui/react-navigation-menu | 1.2.14 | 1.2.15 | minor | `ui/navigation-menu.tsx` | needs-investigation |
| @radix-ui/react-popover | 1.1.15 | 1.1.16 | minor | `ui/popover.tsx` | needs-investigation |
| @radix-ui/react-progress | 1.1.8 | 1.1.9 | minor | `ui/progress.tsx` | needs-investigation |
| @radix-ui/react-radio-group | 1.3.8 | 1.4.0 | minor | `ui/radio-group.tsx` | needs-investigation |
| @radix-ui/react-scroll-area | 1.2.10 | 1.2.11 | minor | `ui/scroll-area.tsx` | needs-investigation |
| @radix-ui/react-select | 2.2.6 | 2.3.0 | minor | `ui/select.tsx` | needs-investigation |
| @radix-ui/react-separator | 1.1.8 | 1.1.9 | minor | `ui/separator.tsx` | needs-investigation |
| @radix-ui/react-slider | 1.3.6 | 1.4.0 | minor | `ui/slider.tsx` | needs-investigation |
| @radix-ui/react-slot | 1.2.4 | 1.2.5 | minor | `ui/*` (cva slot) | needs-investigation |
| @radix-ui/react-switch | 1.2.6 | 1.3.0 | minor | `ui/switch.tsx` | needs-investigation |
| @radix-ui/react-tabs | 1.1.13 | 1.1.14 | minor | `ui/tabs.tsx` | needs-investigation |
| @radix-ui/react-toast | 1.2.15 | 1.2.16 | minor | `ui/toast.tsx` | needs-investigation |
| @radix-ui/react-toggle | 1.1.10 | 1.1.11 | minor | `ui/toggle.tsx` | needs-investigation |
| @radix-ui/react-toggle-group | 1.1.11 | 1.1.12 | minor | `ui/toggle-group.tsx` | needs-investigation |
| @radix-ui/react-tooltip | 1.2.8 | 1.2.9 | minor | `ui/tooltip.tsx` | needs-investigation |
| @stripe/react-stripe-js | 6.2.0 | 6.6.0 | minor | Stripe checkout (`StripeCheckoutWrapper`) | needs-investigation |
| @stripe/stripe-js | 9.2.0 | 9.8.0 | minor | Stripe checkout | needs-investigation |
| @supabase/supabase-js | 2.103.0 | 2.108.1 | minor | `integrations/supabase/client.ts` (core) | needs-investigation |
| @tailwindcss/typography | 0.5.19 | 0.5.20 | minor | **knip-unused devDep** (see safe row below) | safe (unused) |
| @tanstack/react-query | 5.97.0 | 5.101.0 | minor | server-state (`useQuery`) | needs-investigation |
| @testing-library/react | 14.3.1 | 16.3.2 | **major (×2)** | devDep — vitest tests | needs-investigation (DEP-03; React-19-coupled) |
| @types/node | 22.19.17 | 25.9.3 | **major (×3)** | devDep — type defs | needs-investigation (DEP-03) |
| @types/react | 18.3.28 | 19.2.17 | **major** | devDep — React-18-coupled | needs-investigation (DEP-03; gated on React 18→19) |
| @types/react-dom | 18.3.7 | 19.2.3 | **major** | devDep — React-18-coupled | needs-investigation (DEP-03; gated on React 18→19) |
| @vercel/analytics | 1.6.1 | 2.0.1 | **major** | `App.tsx` analytics | needs-investigation (DEP-03) |
| @vercel/speed-insights | 1.3.1 | 2.0.0 | **major** | `App.tsx` perf | needs-investigation (DEP-03) |
| @vitejs/plugin-react-swc | 4.3.0 | 4.3.1 | minor | devDep — `vite.config.ts` | needs-investigation |
| autoprefixer | 10.4.27 | 10.5.0 | minor | devDep — `postcss.config.js` | needs-investigation |
| date-fns | 3.6.0 | 4.4.0 | **major** | date utils | needs-investigation (DEP-03) |
| eslint | 9.39.4 | 10.5.0 | **major** | devDep — lint | needs-investigation (DEP-03) |
| eslint-plugin-react-hooks | 5.2.0 | 7.1.1 | **major (×2)** | devDep — lint | needs-investigation (DEP-03) |
| eslint-plugin-react-refresh | 0.4.26 | 0.5.2 | minor (0.x) | devDep — lint | needs-investigation |
| framer-motion | 12.38.0 | 12.40.0 | minor | animation | needs-investigation |
| globals | 15.15.0 | 17.6.0 | **major (×2)** | devDep — eslint globals | needs-investigation (DEP-03) |
| jsdom | 24.1.3 | 29.1.1 | **major (×5)** | devDep — vitest DOM env | needs-investigation (DEP-03) |
| lucide-react | 0.462.0 | 1.18.0 | **major** | icon library (broad) | needs-investigation (DEP-03; high blast radius) |
| next-themes | 0.3.0 | 0.4.6 | minor (0.x) | theme switching | needs-investigation |
| pdfjs-dist | 5.6.205 | 6.0.227 | **major** | PDF worker (`react-pdf` peer) | needs-investigation (DEP-03; coupled w/ react-pdf) |
| promptfoo | 0.120.13 | 0.120.19 | patch | devDep — adversarial eval | needs-investigation (the audit `fixAvailable` for 3 vulns) |
| react | 18.3.1 | 19.2.7 | **major** | core UI framework | needs-investigation (DEP-03; milestone-level, gates @types/react etc.) |
| react-day-picker | 8.10.1 | 10.0.1 | **major (×2)** | `ui/calendar.tsx` | needs-investigation (DEP-03) |
| react-dom | 18.3.1 | 19.2.7 | **major** | core | needs-investigation (DEP-03; pair w/ react) |
| react-helmet-async | 2.0.5 | 3.0.0 | **major** | document head | needs-investigation (DEP-03) |
| react-hook-form | 7.72.1 | 7.79.0 | minor | forms | needs-investigation |
| react-resizable-panels | 2.1.9 | 4.11.2 | **major (×2)** | `ui/resizable.tsx` | needs-investigation (DEP-03) |
| react-router-dom | 6.30.3 | 7.17.0 | **major** | routing (broad) | needs-investigation (DEP-03; **also a DEP-04 vuln**, see below) |
| recharts | 2.15.4 | 3.8.1 | **major** | charts | needs-investigation (DEP-03) |
| sonner | 1.7.4 | 2.0.7 | **major** | toasts | needs-investigation (DEP-03) |
| supabase | 2.100.1 | 2.106.0 | minor | **knip-unused devDep** but LIVE deploy CLI (`scripts/*.ps1`) | needs-investigation (KEEP — knip blind to `.ps1`) |
| tailwind-merge | 2.6.1 | 3.6.0 | **major** | `cn()` util (broad) | needs-investigation (DEP-03) |
| tailwindcss | 3.4.19 | 4.3.1 | **major** | CSS framework (milestone) | needs-investigation (DEP-03; v4 is a config rewrite) |
| typescript | 5.9.3 | 6.0.3 | **major** | compiler | needs-investigation (DEP-03) |
| typescript-eslint | 8.58.1 | 8.61.0 | minor | devDep — lint | needs-investigation |
| vaul | 0.9.9 | 1.1.2 | **major** | `ui/drawer.tsx` | needs-investigation (DEP-03) |
| vite | 8.0.8 | 8.0.16 | patch | devDep — build/dev | needs-investigation |
| vitest | 4.1.6 | 4.1.8 | patch | devDep — tests | needs-investigation |
| zod | 3.25.76 | 4.4.3 | **major** | validation (broad; also Deno-side) | needs-investigation (DEP-03; cross-layer — see Deno table) |

> **Not in the outdated list (already latest / no newer):** `class-variance-authority`, `clsx`, `cobe`, `input-otp`, `tailwindcss-animate`, `react-pdf`, `@types/canvas-confetti`, `canvas-confetti`, `cross-env`, `@playwright/test`, `postcss`, and the remaining at-latest deps — all current, none are DEP-03 candidates. (`react-pdf` is current at 10.2.0 but is a knip-unused candidate — see DEP-02 table.)

### DEP-02 — Unused / unlisted dependency candidates (knip leg, KEEP-LIST-gated)

| Dependency | knip verdict | Real importer (Command 5 sweep) | Class |
|------------|--------------|----------------------------------|-------|
| `html2canvas` | unused | **ZERO** code refs in `src/` (or any code file); only `deno.lock`/CLAUDE.md prose | **safe** (signals: knip-unused + no-dynamic-ref `rg` ZERO + no-non-src-consumer + not-KEEP-LIST) |
| `jspdf` | unused | **ZERO** code refs (`jsPDF`/`jspdf`) in `src/` | **safe** (signals: knip-unused + no-dynamic-ref ZERO + no-consumer + not-KEEP-LIST) |
| `react-markdown` | unused | **ZERO** code refs (`react-markdown`/`ReactMarkdown`) in `src/` | **safe** (signals: knip-unused + no-dynamic-ref ZERO + no-consumer + not-KEEP-LIST) |
| `@tailwindcss/typography` (devDep) | unused | not in `tailwind.config.ts` plugins (`plugins: [require("tailwindcss-animate")]` only); the `react-markdown` prose companion | **safe** (signals: knip-unused + not in tailwind plugins + react-markdown-companion-also-safe + not-KEEP-LIST) |
| `@radix-ui/react-accordion` | unused | `src/components/ui/accordion.tsx` (knip-`ignore`d tree) | needs-investigation (knip blind spot — consumer is in the `ignore`d `ui/**`) |
| `@radix-ui/react-aspect-ratio` | unused | `src/components/ui/aspect-ratio.tsx` | needs-investigation (knip blind spot) |
| `@radix-ui/react-context-menu` | unused | `src/components/ui/context-menu.tsx` | needs-investigation (knip blind spot) |
| `@radix-ui/react-hover-card` | unused | `src/components/ui/hover-card.tsx` | needs-investigation (knip blind spot) |
| `@radix-ui/react-menubar` | unused | `src/components/ui/menubar.tsx` | needs-investigation (knip blind spot) |
| `@radix-ui/react-radio-group` | unused | `src/components/ui/radio-group.tsx` | needs-investigation (knip blind spot) |
| `@radix-ui/react-switch` | unused | `src/components/ui/switch.tsx` | needs-investigation (knip blind spot) |
| `@radix-ui/react-toggle` | unused | `src/components/ui/toggle.tsx` + `toggle-group.tsx` | needs-investigation (knip blind spot) |
| `@radix-ui/react-toggle-group` | unused | `src/components/ui/toggle-group.tsx` | needs-investigation (knip blind spot) |
| `cmdk` | unused | `src/components/ui/command.tsx` | needs-investigation (knip blind spot) |
| `embla-carousel-react` | unused | `src/components/ui/carousel.tsx` | needs-investigation (knip blind spot) |
| `react-day-picker` | unused | `src/components/ui/calendar.tsx` | needs-investigation (knip blind spot) |
| `react-resizable-panels` | unused | `src/components/ui/resizable.tsx` | needs-investigation (knip blind spot) |
| `vaul` | unused | `src/components/ui/drawer.tsx` | needs-investigation (knip blind spot) |
| `react-pdf` | unused | `src/components/PDFHighlighter.tsx` (non-`ui/**`; but the importing file may itself be dead — cross-ref DEAD-CODE.md) | needs-investigation (transitively dead via a possibly-dead file; resolve PDFHighlighter's fate first) |
| `supabase` (devDep) | unused | LIVE deploy CLI binary in `scripts/deploy.ps1`, `cutover-production.ps1`, `phase21-runbook.ps1` (knip cannot scan `.ps1`) | needs-investigation (KEEP — knip blind to non-JS scripts) |
| `dotenv` | **unlisted** | imported by `playwright.config.ts` (`dotenv.config({ path: '.env.test.local' })`) but absent from `package.json` (transitive-only via another dep) | needs-investigation (**DEP-05 unlisted** — declare it, do not remove) |

> **The knip "unused dependency" trap, neutralized (T-3-05 / D-06):** 14 of the 18 `dependencies` knip calls unused are consumed **only** by `src/components/ui/**`, which `knip.json` deliberately `ignore`s (shadcn primitives export many unused variants — Pitfall 1). knip therefore can't see those importers and reports the dep unused. **Removing any of them in Phase 6 would break a live UI primitive** → all 14 are `needs-investigation`, never `safe`. Likewise `supabase` (deploy CLI, used in `.ps1` knip can't read) and `react-pdf` (consumer is a non-`ui` file whose own liveness is a DEAD-CODE.md question). Only the 4 with **zero code references anywhere** clear the conservative bar to `safe`.

### Vulnerability findings (`npm audit` — DEP-04, handed to Phase 6)

**9 total: 5 moderate / 4 high / 0 critical.** All are in the **dev/test transitive tree** (no production runtime dep is directly vulnerable except `react-router-dom`, which has a `fixAvailable` non-major patch). Advisory IDs recorded; no token/value anywhere.

| Package | Severity | Direct? | Vulnerable range | Advisory(s) | Fix path |
|---------|----------|---------|------------------|-------------|----------|
| `react-router-dom` | moderate | direct | 6.6.3-pre.0 – 6.30.3 | via `react-router` GHSA-2j2x-hqr9-3h42 (open-redirect via `//`-leading protocol-relative URL) | `fixAvailable: true` (patch within 6.x or the 7.x major) |
| `react-router` | moderate | (transitive of above) | 6.7.0 – 6.30.3 | GHSA-2j2x-hqr9-3h42 | bump `react-router-dom` |
| `axios` | **high** | transitive (← `ibm-cloud-sdk-core` ← `promptfoo`) | 1.0.0 – 1.15.2 | GHSA-pjwm-pj3p-43mv (NO_PROXY bypass), GHSA-hfxv-24rg-xrqf (ReDoS), GHSA-777c-7fjr-54vf (DoS), GHSA-p92q-9vqr-4j8v + GHSA-j5f8-grm9-p9fc (Proxy-Auth leak), GHSA-35jp-ww65-95wh (MITM via proto-pollution), GHSA-898c-q2cr-xwhg, GHSA-654m-c8p4-x5fp | `fixAvailable: true` |
| `esbuild` | **high** | transitive (← `tsx`) | 0.17.0 – 0.28.0 | GHSA-gv7w-rqvm-qjhr (RCE via NPM_CONFIG_REGISTRY in Deno path), GHSA-g7r4-m6w7-qqqr (Win dev-server file read) | `fixAvailable: true` |
| `ibm-cloud-sdk-core` | **high** | transitive | (ranges per audit) | via `axios` | `fixAvailable: true` |
| `tsx` | **high** | transitive (← `esbuild`) | 3.13.0 – 4.21.1 | via `esbuild` | `fixAvailable: true` |
| `@azure/msal-node` | moderate | transitive (← `promptfoo`; via `uuid`) | <=5.1.4 | via `uuid` GHSA-w5hq-g745-h8pq | `fixAvailable: promptfoo@0.120.19` (non-major) |
| `uuid` | moderate | transitive | <11.1.1 | GHSA-w5hq-g745-h8pq (missing buffer bounds check v3/v5/v6) | `fixAvailable: promptfoo@0.120.19` |
| `promptfoo` | moderate | direct (devDep) | 0.119.2 – 0.120.14 | via `@azure/msal-node` | `fixAvailable: promptfoo@0.120.19` (non-major patch — easiest DEP-04 win, also clears `@azure/msal-node`+`uuid`) |

> **DEP-04 handoff note for Phase 6:** the cheapest remediation cluster is `promptfoo` 0.120.13→0.120.19 (clears 3 moderate: `promptfoo`/`@azure/msal-node`/`uuid`). The `axios`/`esbuild`/`tsx`/`ibm-cloud-sdk-core` highs are all transitive under `promptfoo`'s sub-tree and dev-only (adversarial-eval tooling, off the per-PR `verify:baseline` gate — D-09) — no production runtime exposure, but still remediate via `npm audit fix` / the `promptfoo` bump. `react-router-dom` is the only **production-runtime** advisory; its non-major fix should be taken with care (it is also a DEP-03 6→7 major candidate — prefer the in-6.x patch for DEP-04 and treat the 7.x major separately).

---

## Deno edge imports — Inline-import inventory (no central import map)

`deno.json` has `"imports": {}` and `"lock": false` (verified), so every edge function inlines its remote/npm/jsr specifiers. All 8 production specifiers are LIVE (each consumer is a deployed / cron / webhook / internal-job edge function — KEEP-LIST Class 3) → **none `safe`**; the version drift is the DEP-03 finding.

| Specifier (production) | Version pin | Consuming function(s) | Latest / note | Class |
|------------------------|-------------|------------------------|---------------|-------|
| `https://deno.land/std@0.168.0/http/server.ts` | std 0.168.0 | **27 fns**: analyze-resume, analyze-career, analyze-skills-gap, recruiting-lens, grade-linkedin, chat-agent, compare-jobs, ocr-pdf, extract-analysis-structure, interview-prep-analyze, interview-prep-evaluate, keep-warm, lifecycle-archive-writer, check-merit-alerts, admin-merit-metrics, admin-delete-user, get-analysis-job-status, submit-resume-analysis-job, submit-career-analysis-job, process-resume-analysis-job, process-career-analysis-job, process-scheduled-emails, send-credits-exhausted-email, send-feature-email, send-strivo-email, send-welcome-email, test-email | std latest ≈ 0.224.x line (now JSR `@std/http`); **DEP-03 std-drift consolidation** | needs-investigation (LIVE; consolidate version in Phase 6) |
| `https://deno.land/std@0.190.0/http/server.ts` | std 0.190.0 | **4 fns**: notify-admin-activity, notify-upgrade-approved, notify-upgrade-request, send-notification-email | newer than 0.168 but still old; **drift** | needs-investigation (LIVE; part of std consolidation) |
| `https://deno.land/std@0.224.0/crypto/timing_safe_equal.ts` | std 0.224.0 | **2**: `_shared/auth.ts` (LIVE — all-functions auth), `paddle-webhook/index.ts` (**KEEP-LIST Class 2, gated remnant**) | newest std in tree | needs-investigation (LIVE; `paddle-webhook` consumer is **never-`safe`** per KEEP-LIST) |
| `https://deno.land/x/xhr@0.1.0/mod.ts` | xhr 0.1.0 (side-effect polyfill) | **11 AI fns**: analyze-resume, analyze-career, analyze-skills-gap, recruiting-lens, chat-agent, compare-jobs, ocr-pdf, interview-prep-analyze, interview-prep-evaluate, lifecycle-archive-writer, admin-delete-user | XMLHttpRequest polyfill for the Anthropic/Deno path; pinned 0.1.0 | needs-investigation (LIVE side-effect import; verify still needed under current Deno before any change) |
| `https://esm.sh/zod@3.25.76` | zod 3.25.76 (esm.sh) | `_shared/types/interviewPrep.ts` | **zod import-style split** vs the `npm:zod@3.25` below; npm latest zod 4.4.3 | needs-investigation (LIVE; reconcile zod style + version w/ frontend zod in DEP-03) |
| `npm:zod@3.25` | zod 3.25 (npm spec) | `_shared/handler.ts` | the OTHER zod import style (npm: vs esm.sh) | needs-investigation (LIVE; same zod-consolidation finding) |
| `npm:stripe@14` | stripe 14 | **5**: `_shared/stripe-client.ts`, create-checkout-session, create-payment-intent, create-stripe-portal, stripe-webhook-handler | stripe SDK 14.x (npm latest is far newer) | needs-investigation (LIVE payments path; bump carefully w/ webhook signature compat) |
| `npm:@supabase/supabase-js@2` | supabase-js 2 | **4 prod**: `_shared/supabase-client.ts`, `_shared/archive-reader.ts`, notify-upgrade-request, test-email (+ several `_tests/`) | matches frontend `@supabase/supabase-js` 2.x | needs-investigation (LIVE; align with frontend supabase-js bump) |

### Deno DEP-01 risk findings (handed to Phase 6 — DEP-03)

1. **`std` multi-version drift (broader than estimated).** Production code co-pins **`std@0.168.0` (27 fns)**, **`std@0.190.0` (4 fns)**, and **`std@0.224.0` (2 fns)**; the **test tree** adds **`std@0.208.0`** (`resume-prompts-builders.test.ts`) and **`std@0.224.0`** (plus a few `std@0.168.0` `testing/asserts.ts` legacy imports). So **4+ distinct `std` minor versions are live across the repo** — each `deno info` graph pulls multiple `std` copies. Consolidation (ideally to one `std` pin, or the JSR `@std/*` line, via a central `deno.json` import map) is a **Phase-6 DEP-03 / DEP-05** task. *Recorded, not changed.*
2. **`zod` import-style split.** Two different zod import mechanisms coexist in prod edge code: `https://esm.sh/zod@3.25.76` (`interviewPrep.ts`) and `npm:zod@3.25` (`handler.ts`). Both resolve to zod 3.25 but via different registries — a normalization (single style/version, and alignment with the frontend `zod@3.25.76`) is a DEP-03 finding. *Recorded, not changed.*
3. **No `deno.lock` for edge functions (`"lock": false`) + no import map (`"imports": {}`).** Pins live inline per-function, so a bump must be applied at every call site (or a `deno.json` import map introduced first). This is the structural reason DEP-05 lockfile reconciliation is non-trivial on the Deno side. *Recorded.*
4. **Lockfile note for DEP-05:** there IS a **root-level `deno.lock`** (389 KB) that mirrors the entire `package.json` dependency set as `npm:` specs (it lists ALL deps incl. the unused `html2canvas`/`jspdf`/`react-markdown`). It is a generated snapshot, **not** evidence of a real consumer for those three. Phase-6 DEP-02 removals + DEP-03 bumps must regenerate this root `deno.lock` alongside `package-lock.json`. *Recorded; left byte-identical here.*

---

## Re-Assertion Block (reproducible by Phases 6 / future audits)

Run from repo root; npx-driven / built-in, zero new deps. Non-zero exits from `npm outdated`/`npm audit` are the **expected inventory signal** (D-02), not errors.

```bash
# 1. Frontend current/wanted/latest + vuln signal (both legs; both exit non-zero by design)
npm run audit:deps            # → node scripts/audit/run-deps.mjs (npm outdated --json ; npm audit --json)

# 2. Frontend unused/unlisted DEPENDENCY leg (the dependencies/unlisted sections)
npx --yes knip --reporter json

# 3. KEEP-LIST gate / real-importer sweep for any knip-"unused" dep (incl. the ignored ui/** tree)
rg -l "from ['\"]<dep>" src
rg -ni "html2canvas|jspdf|react-markdown" src            # → ZERO confirms the 3 true-unused

# 4. Deno inline-import enumeration (from-imports AND side-effect imports) + std drift
rg -No "(from |import )['\"](https://[^'\"]+|npm:[^'\"]+|jsr:[^'\"]+)['\"]" supabase/functions \
   -g '!*.test.ts' -g '!**/__tests__/**' -g '!**/_tests/**' -r '$2' | sort | uniq -c
rg -No "deno\.land/std@[0-9.]+" supabase/functions | sort -u
```

**PowerShell equivalent for the Deno enumeration (primary shell is pwsh):**

```powershell
rg -No "(from |import )['""](https://[^'""]+|npm:[^'""]+|jsr:[^'""]+)['""]" supabase/functions `
   -g '!*.test.ts' -g '!**/__tests__/**' -g '!**/_tests/**' -r '$2' | Sort-Object -Unique
```

**Lockfile / read-only assertion (must stay clean):**

```bash
git status --porcelain package-lock.json deno.lock supabase/functions/deno.lock package.json   # → empty
git diff --stat fa4ccb6..HEAD -- src supabase/functions                                          # → empty (zero functional change)
```

Verified at run time: all three lockfile/`package.json` checks returned **empty** (no lockfile mutated by any inventory pass); HEAD `0c656a0`.

---

## Cross-References

- **[`KEEP-LIST.md`](./KEEP-LIST.md)** — the mandatory `safe`-classification gate. Applied here: **Class 2** (Paddle `paddle-webhook` is the `std@0.224.0/timing_safe_equal` consumer → never-`safe`); **Class 3** (every Deno edge-function specifier is webhook/cron/invoke-reached, not import-reached → "no importer" is meaningless → never-`safe` on that basis); the knip "unused dependency" false-positive class (shadcn `ui/**` consumers in the `ignore`d tree, `supabase` deploy-CLI in `.ps1`) is the dependency-domain analog of the keep-list rationale — demoted to `needs-investigation`.
- **[`DEAD-CODE.md`](./DEAD-CODE.md)** (03-02, CLEAN-01) — `react-pdf`'s liveness hinges on whether `PDFHighlighter.tsx` is a dead file there; resolve that before treating `react-pdf` as removable.
- **[`INDEX.md`](./INDEX.md)** — catalog entry point; DEPENDENCIES.md row was pre-listed (this plan did NOT edit INDEX.md).
- **Phase 6 (DEP-02 / DEP-03 / DEP-04 / DEP-05)** — the consumer of this catalog: DEP-02 acts on the 4 `safe` unused (+ resolves the 15 `needs-investigation` knip false-positives), DEP-03 takes the ~26 major-bump candidates + the std/zod Deno consolidation, DEP-04 takes the 9-vuln list (cheapest: `promptfoo`→0.120.19), DEP-05 reconciles `package-lock.json` + root `deno.lock` and (optionally) introduces a Deno import map.
- **`.planning/phases/03-cross-domain-inventory-audit/03-RESEARCH.md`** — §"Frontend dependency inventory", §"Deno dependency inventory", §"Domain-Specific Verified Findings → Dependencies" (the seed leads this plan verified + extended).

*This file records package names, versions, counts, consumers, and advisory IDs only — no token or secret value is pasted anywhere in it.*
