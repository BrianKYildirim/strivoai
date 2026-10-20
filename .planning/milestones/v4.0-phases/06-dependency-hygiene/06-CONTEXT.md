# Phase 6: Dependency Hygiene - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase makes the **dependency surface clean and reproducible** without changing any production behavior. It delivers five requirements (DEP-02, DEP-03, DEP-04, DEP-05, NFR-02) by acting on the **Phase 3 `DEPENDENCIES.md` inventory**:

1. **DEP-02** — Remove confirmed-unused dependencies, verified against a clean build + passing tests.
2. **DEP-03** — Update outdated dependencies *including major-version bumps*, each applied behind passing validation + tests before merge.
3. **DEP-04** — Remediate known-risky/vulnerable dependencies (`npm audit`), **or** document them with an explicit accepted-risk rationale.
4. **DEP-05** — Make `package-lock.json` + `deno.lock` consistent and reproducible after all changes.
5. **NFR-02** — Each risky change (every major bump) is individually validated with tests **and** a documented rollback path before merge.

**Governing constraint (unchanged): zero functional change.** Every change re-runs the Phase 1 `verify:baseline` gate (vitest + offline deno `test:ci` + Playwright) as its proof of no behavior drift. The scope decisions below (which majors to take vs defer, how far the Deno side goes) are all calibrated to *what the validation net can actually prove safe* under that constraint.

**NOT in this phase:** env-var consolidation / canonical `.env.example` (Phase 7); DB removals / RLS changes (Phase 8); performance + before/after latency refactors (Phase 9); any new product capability (brownfield hardening milestone). The framework-grade major migrations are explicitly **deferred** (see `<deferred>`).

</domain>

<decisions>
## Implementation Decisions

### Major-version bump scope (DEP-03)

* **D-01: Risk-tiered majors — take CONTAINED, defer FRAMEWORK-GRADE.** Take the ~17 contained majors this phase (each individually gated). **DEFER** the migration-grade framework majors as documented/gated for a dedicated future migration milestone: **React 18→19** (+ its coupled set `react-dom`, `@types/react`, `@types/react-dom`, `@testing-library/react` 14→16), **Tailwind 3→4** (config-system rewrite), **Zod 3→4** (cross-layer — frontend + Deno edge), **TypeScript 5→6**, and **react-router-dom 6→7** (its DEP-04 advisory is taken as an *in-6.x* patch instead — see D-03). Rationale: these are *migrations, not bumps* — they conflict head-on with the v4.0 zero-functional-change constraint, and the `verify:baseline` net (unit suite + 3 E2E flows) cannot *prove* no behavior change across them. Chosen over **all-majors** (regression risk + balloons the phase) and **security/blocking-only** (under-delivers DEP-03's "including major-version bumps").

* **D-02: Contained-major validation rule — take all, smoke the behavioral ones.** All contained majors are taken, split by validation treatment:
  * **Behavioral-surface majors** — **recharts 2→3** (charts), **date-fns 3→4** (date formatting / TZ semantics), **react-day-picker 8→10** (calendar; a 2-major jump), **lucide-react 0→1** (icons) — each gets a **targeted manual smoke** of its consumer surface (chart renders, dates format correctly, calendar picks, icons render) **ON TOP of** `verify:baseline`.
  * **Mechanical / devDep majors** — e.g. `jsdom` 24→29, `@types/node` 22→25, `globals` 15→17, `@hookform/resolvers` 3→5, `react-helmet-async` 2→3, `react-resizable-panels` 2→4, `tailwind-merge` 2→3, `sonner` 1→2, `vaul` 0→1, `@vercel/analytics`+`@vercel/speed-insights`, eslint-tooling — ride `verify:baseline` alone.
  * The planner/researcher applies this classification per-package against each changelog (DEFER a contained major instead if its changelog flags breaking *runtime/visual* behavior with no codemod). **Coupling caveat:** `@hookform/resolvers` 3→5 sits with `react-hook-form` + zod — since zod 4 is deferred (D-01), confirm resolvers v5 still supports zod 3.x before taking it.

### Vulnerability remediation (DEP-04)

* **D-03: Fix the easy wins, formally accept the dev-only residue.** Remediate the non-breaking, high-value items: (a) **react-router-dom** — take the **in-6.x** patch closing GHSA-2j2x-hqr9-3h42 (the *only* production-runtime advisory; the 6→7 major stays deferred per D-01); (b) **promptfoo 0.120.13→0.120.19** (non-major; clears 3 moderate — promptfoo / `@azure/msal-node` / `uuid`); (c) any clean `npm audit fix` that does not force a major. Then **FORMALLY ACCEPT** the remaining dev-only transitive **highs** (`axios` / `esbuild` / `tsx` / `ibm-cloud-sdk-core`, all under promptfoo's subtree) with a documented accepted-risk rationale — they are dev/test-only, **OFF the `verify:baseline` gate** (Phase 1 D-09), with **zero production-runtime exposure**. DEP-04 explicitly permits documented accepted-risk. Chosen over **force-fix-to-zero** (`npm audit fix --force` would churn/risk the promptfoo dev toolchain for a dev-only-exposure win) and **prod-only** (needlessly leaves the 3 cheap-clearable moderates on the books).

### Deno / edge dependency scope (DEP-03 Deno side + DEP-05)

* **D-04: Lockfile-reconcile is the DEP-05 core; defer the cross-function consolidation.** The DEP-05 deliverable is regenerating the **root `deno.lock`** (389 KB npm-spec mirror of `package.json`) **+ `package-lock.json`** so they are consistent and produce reproducible installs after all DEP-02/DEP-03 changes. On the **edge side**, take only low-risk / necessary changes and **DEFER** the std-version unification (prod pins `std@0.168.0` ×27 / `0.190.0` ×4 / `0.224.0` ×2, tests add `0.208.0`) and the zod import-style normalization (`esm.sh/zod` vs `npm:zod`) across the 27+ live functions — recorded as a documented/gated finding. **Rationale:** the offline `deno test:ci` runs `--no-check` and does **not** exercise an `http/server` API change — the only real proof a Deno bump is safe is deploying each of the 27+ live payment/AI/webhook functions to staging and smoking them; that validation cost + blast radius on business-critical paths is out of proportion to a currency win and conflicts with zero-functional-change. The consolidation is closer to Phase 9 maintainability. Chosen over **full-consolidation-now** (high blast radius, weak net) and **import-map-only** (still requires a per-function deploy-smoke for the std pin).

* **D-05: `dotenv` is a DEP-05 *declare*, not a DEP-02 remove.** knip reports `dotenv` "unlisted" because `playwright.config.ts` imports it but it is absent from `package.json` (resolved transitively today). Add it to `devDependencies` (declare it) — do **not** treat it as unused.

### Unused-dependency removal (DEP-02)

* **D-06: DEP-02 removal set = the 4 confirmed-safe, re-verified at HEAD.** Remove **`html2canvas`**, **`jspdf`**, **`react-markdown`**, **`@tailwindcss/typography`** — the only four with zero code references anywhere (all four KEEP-LIST signals concurring). The 15 knip "unused" findings are **KEEP-LIST false-positives** and are **never removed**: 14 are shadcn `src/components/ui/**` consumers in the knip-ignored tree; `supabase` is the deploy-CLI used in `scripts/*.ps1` (knip can't scan `.ps1`). **`react-pdf` STAYS** — re-confirmed at HEAD it has a live consumer `src/lib/pdf-worker.ts` (the audit's "via possibly-dead PDFHighlighter.tsx" caveat is moot: `PDFHighlighter.tsx` was removed in Phase 4 (04-05) but `pdf-worker.ts` independently imports `react-pdf`; `pdfjs-dist` is also live via `pdf-extractor.worker.ts`). **The researcher re-runs `npm run audit:deps` + knip at HEAD before any removal** to confirm the set hasn't drifted since the 2026-06-13 inventory. Removal verified against a clean build + passing tests (DEP-02 success criterion).

### Validation & rollback (NFR-02)

* **D-07: Atomic-per-major commits + a bump ledger.** Each major (or a coupled set that must move together) is its **own commit** with `verify:baseline` **green recorded** (+ the targeted smoke for behavioral majors per D-02). The **commit SHA is the rollback unit** (`git revert <sha>`). A phase **bump ledger** (e.g. `06-DEP-CHANGES.md`, exact name/format planner's call) records per row: package, from→to version, validation evidence (baseline result + smoke note), revert SHA, and status (taken / deferred / accepted-risk). Minor + patch bumps (radix point releases, etc.) are batched into grouped commits. This is the concrete NFR-02 "individually validated + documented rollback path." Chosen over **batched-by-theme** (loses per-package revert granularity) and **planner-decides** (operator wanted the atomic-per-major discipline locked).

* **D-08: Reproducible-install verification (DEP-05).** After all changes, prove lockfile reproducibility via a clean-install check (clear `node_modules` → `npm ci` from the regenerated `package-lock.json`; root `deno.lock` regenerated alongside). The lockfiles must be consistent and produce a deterministic install. Exact command form left to the planner.

### Claude's Discretion

* Exact plan/commit slicing, the bump-ledger filename + format, the per-package contained-vs-defer classification mechanics (researcher applies the D-01/D-02 rule against each changelog), the precise in-6.x `react-router-dom` target version, the reproducible-install command form, and whether `@hookform/resolvers` 3→5 stays contained after the zod-3 peer check — all left to research + planning, consistent with the decisions above.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements (locked)

* `.planning/ROADMAP.md` §"Phase 6: Dependency Hygiene" — goal, depends-on (Phase 3, Phase 5), the 5 success criteria.
* `.planning/REQUIREMENTS.md` — **DEP-02 / DEP-03 / DEP-04 / DEP-05** + **NFR-02**, and the governing zero-functional-change constraint.
* `.planning/PROJECT.md` §"Current Milestone: v4.0" — hard constraint (zero functional change), risk appetite (execute-everything-in-milestone; each risky change behind validation + tests + rollback), brownfield-no-new-features.

### The dependency inventory this phase acts on (PRIMARY — read first)

* `.planning/audit/DEPENDENCIES.md` (03-03, DEP-01) — **THE authoritative input.** The 60 frontend deps / 59 outdated / ~26-major table, the 9-vuln advisory chains (5 mod / 4 high), the DEP-02 knip-vs-KEEP-LIST unused table (4 `safe`), the 8 Deno specifiers + std/zod drift findings, and the explicit per-requirement Phase-6 handoff notes. Re-runnable via `npm run audit:deps` + the documented `rg` blocks (the researcher re-runs at HEAD per D-06).
* `.planning/audit/KEEP-LIST.md` — the mandatory `safe`-classification gate (Class 2 Paddle never-safe; Class 3 invoke-reached edge fns; the knip shadcn-`ui/**` false-positive class). Applied to every removal.
* `.planning/audit/RESIDUAL-REGISTER.md` — the **append-only deferred / accepted-risk register pattern** (R-01 MinimalHero; the CLEAN-06 tracked lint baselines). The DEP-04 accepted-risk residue (D-03), the deferred Deno consolidation (D-04), and the deferred frameworks (D-01) **append here in the same style**.
* `.planning/audit/INDEX.md` — audit catalog entry point.

### The validation net every change re-runs (locked upstream — do not re-litigate)

* `TESTING-STRATEGY.md` (repo root) — `verify:baseline` composition (vitest + offline deno `test:ci` + Playwright), the **D-09 promptfoo-off-the-gate** rule (why the dev-tree vulns carry no prod exposure), the quarantine register, and the deploy-gate wiring.
* `supabase/functions/deno.json` — the offline `test:ci` allowlist **and** `"imports": {}` / `"lock": false` (the structural reason the Deno side has no import map — the basis for D-04; `--no-check` means an `http/server` bump is *not* caught offline).
* `scripts/deploy.ps1` — now **hard-gates on `verify:baseline`** before `supabase link` (Phase 5, 05-07); the deploy path + gate any edge-side change must clear. Keep **pure-ASCII** (Win PowerShell 5.1 cp1252 — see project memory).
* `.github/workflows/regression-gate.yml` — the PR gate (Required status check on `main` + `staging`).
* `.planning/phases/01-testing-strategy-regression-baseline/01-CONTEXT.md` — D-09 (per-PR gate composition + promptfoo off-gate), D-05/D-06. Locked.
* `.planning/phases/05-deep-test-coverage-expansion/05-CONTEXT.md` — the coverage Phase 5 added to the surfaces Phase 6 touches; D-06 deploy-gate, D-08 suspected-behavior register.

### Key dependency files (the act-on surfaces)

* `package.json` — 60 declared deps + `overrides: { "ws": "8.20.1" }`; the DEP-02 removals + DEP-03 bumps + `dotenv`-declare land here.
* `package-lock.json` (820 KB) + root `deno.lock` (389 KB, npm-spec mirror of `package.json`) — both regenerated for DEP-05 reproducibility (D-04 / D-08).
* `knip.json` — the unused-dep config (`ignore`s `src/components/ui/**` — the false-positive root cause behind D-06).
* `scripts/audit/run-deps.mjs` — the `npm run audit:deps` orchestrator (npm outdated --json ; npm audit --json) — the re-runnable inventory refresh.

### Repo conventions & policy

* `CONTRIBUTING.md` (repo root) — Conventional Commits + atomic-commit conventions (relevant to D-07 atomic-per-major).
* `CLAUDE.md` — git rules (never `git add -f` / `-A`; `.planning/` IS tracked — stage specific paths), reliability priorities (Resume Analysis / Career Compass business-critical → extra care on any dep touching their path).

**No external ADRs/specs govern this phase** — the binding inputs are `DEPENDENCIES.md` + the scope docs + the upstream testing locks; all implementation decisions are captured in `<decisions>`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

* **`npm run audit:deps`** (`scripts/audit/run-deps.mjs` → `npm outdated --json` ; `npm audit --json`) — the re-runnable inventory refresh; researcher re-runs at HEAD to confirm the DEP-02/DEP-03/DEP-04 sets haven't drifted since 2026-06-13 (D-06).
* **`npx --yes knip --reporter json`** — the unused-dependency leg (KEEP-LIST-gated; `ui/**` ignored → false positives).
* **`verify:baseline`** (vitest + offline deno + Playwright) — the per-bump gate; last green at Phase 5 close (vitest 457, deno 698/0/11, Playwright 5+1skip).
* **`scripts/deploy.ps1`** `verify:baseline` precondition — the deploy gate any edge-side change must clear before `supabase link`.
* **`.planning/audit/RESIDUAL-REGISTER.md`** — the append-only register the accepted-risk (D-03) + deferred items (D-01, D-04) extend.

### Established Patterns

* **Atomic commits + a phase ledger/register** (Phase 3/4 audit-catalog + RESIDUAL-REGISTER style) — D-07's bump ledger mirrors this.
* **KEEP-LIST gate before any removal** — demote-on-doubt; the 15 knip false-positives stay (D-06).
* **Audit scripts as node orchestrators** (`run-deps.mjs`), NOT `&&`/`;` chains — npm runs scripts via cmd.exe on Windows where `;` is not a separator and `&&` aborts on a non-zero issue-exit (Phase 3 03-01 lesson).
* **Deno offline allowlist, never recursion; `--no-check`** — so an `http/server` API change is NOT caught offline (the D-04 rationale; edge changes need a real deploy-smoke).
* **Pure-ASCII `.ps1` scripts** — Win PowerShell 5.1 reads them as cp1252; non-ASCII breaks parsing (project memory; broke + fixed in 05-07).

### Integration Points

* **`package.json` / `package-lock.json` / root `deno.lock`** — the DEP-02/03/05 act-on files (D-04/D-06/D-08).
* **`supabase/functions/deno.json` + the 27+ live edge functions** — the deferred-consolidation surface (D-04); any edge change taken needs a staging deploy-smoke.
* **`scripts/deploy.ps1` + `regression-gate.yml`** — the gates each change clears (D-07).
* **Canonical prod Supabase ref `zjpjapgraoxdukdvpjes`** (test/staging ref `cimjltzovkahkqecpwgi`) — if any edge-side change is taken and needs a deploy-smoke, that is the prod ref (operator-confirmed in Phase 4; Phase 8 owes a formal re-confirmation).

</code_context>

<specifics>
## Specific Ideas

* The central tension the operator resolved: v4.0's **"execute-everything-in-milestone"** risk appetite vs the **"zero functional change"** governing constraint collide hardest on framework majors. The operator drew the line at *migration-grade* (React / Tailwind / Zod / TS / react-router-7) — defer those, take everything contained.
* **Validation is asymmetric.** Frontend bumps are well-covered by `verify:baseline`; Deno/edge bumps are NOT (offline `--no-check`) — that asymmetry is *why* the edge consolidation is deferred (D-04) and any edge change taken needs a staging deploy-smoke.
* The accepted-risk residue (DEP-04 dev-only highs, D-03) and the deferred frameworks (D-01) + deferred Deno consolidation (D-04) all land in the **`RESIDUAL-REGISTER.md`-style** register so Phase 8 / a future migration milestone inherits them without re-discovery.
* "Behavioral smoke" (D-02) = a quick manual check of the *consumer surface* of recharts/date-fns/react-day-picker/lucide, since those four can change visual/behavioral output in ways the unit + E2E net won't necessarily flag.

</specifics>

<deferred>
## Deferred Ideas

* **Framework-grade major migrations** — React 18→19 (+ `react-dom`, `@types/react`, `@types/react-dom`, `@testing-library/react` 14→16), Tailwind 3→4, Zod 3→4, TypeScript 5→6, react-router-dom 6→7 — deferred to a dedicated migration milestone, documented/gated in the residual register. (Not scope creep: DEP-03 says "including major-version bumps," but the operator scoped *which* majors this phase takes under the zero-functional-change constraint; the rest are documented-outdated, not dropped.)
* **Deno `std`-version unification + zod import-style normalization** across the 27+ live edge functions (+ optional central `deno.json` import map) — deferred as a documented/gated finding (behavior-risky on live payment/AI/webhook paths, weakly validated offline; closer to Phase 9 maintainability).
* **Dev-only transitive vuln highs** (`axios` / `esbuild` / `tsx` / `ibm-cloud-sdk-core` under promptfoo) — formally accepted-with-rationale this phase (off-gate, dev-only, zero prod-runtime exposure); a future promptfoo-major bump that clears them is a separate scheduled task.
* **`ws` override pin (8.20.1)** — left as-is (existing `overrides` pin, not in scope to revisit this phase).

None of the above is scope creep — discussion stayed within Phase 6's dependency-hygiene boundary; the deferrals are scoping decisions about *which* dependency changes are provably safe under zero-functional-change, not new capabilities.

</deferred>

---

*Phase: 6-dependency-hygiene*
*Context gathered: 2026-06-19*
