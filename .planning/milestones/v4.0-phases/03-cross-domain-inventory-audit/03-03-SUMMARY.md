---
phase: 03-cross-domain-inventory-audit
plan: 03
subsystem: audit
tags: [dependencies, npm-outdated, npm-audit, knip, deno-imports, std-drift, vuln-inventory, three-tier-classification, keep-list-gate, dep-01]

# Dependency graph
requires:
  - phase: 03-cross-domain-inventory-audit
    plan: 01
    provides: "audit:deps script (run-deps.mjs) + tuned knip.json + .planning/audit scaffold (INDEX pre-listed DEPENDENCIES.md row + KEEP-LIST gate)"
provides:
  - "DEPENDENCIES.md (DEP-01): full dependency inventory — frontend npm (current/latest/consumers/vuln/unused) + Deno inline-import surface (8 production specifiers, no import map), three-tier classified (4 safe / ~17 needs-investigation / 0 unsafe), every safe row inline-citing its 4 D-06 signals"
  - "Phase-6 actionable handoffs: ~26 major-bump DEP-03 candidates, the 9-vuln DEP-04 list (5 mod/4 high, cheapest = promptfoo->0.120.19), 4 confirmed-safe DEP-02 unused (html2canvas/jspdf/react-markdown/@tailwindcss/typography), the std multi-version drift + zod import-style split (DEP-03/DEP-05), and the root-deno.lock-mirror DEP-05 note"
  - "Neutralized the T-3-05 false-unused trap: 14 knip-'unused' deps are shadcn ui/** consumers in the knip-ignored tree + supabase is a deploy-CLI binary in .ps1 -> all demoted to needs-investigation, never removed"
affects: [phase-6-dependency-hygiene-DEP-02, phase-6-dependency-hygiene-DEP-03, phase-6-dependency-hygiene-DEP-04, phase-6-dependency-hygiene-DEP-05]

# Tech tracking
tech-stack:
  added: []  # zero new deps — npm outdated/audit built-in, knip via npx --yes, rg built-in (D-01)
  patterns:
    - "Three-tier dependency classification under the D-06 conservative bar: a knip-'unused' dep earns safe ONLY when knip-unused + no-dynamic-ref (rg ZERO) + no-non-src-consumer + not-KEEP-LIST all concur, inline-cited per row"
    - "knip-blind-spot neutralization: a dep whose ONLY consumer is the knip-ignored src/components/ui/** shadcn tree (or a non-JS .ps1 CLI) is needs-investigation, never safe — removing it would break a live UI primitive / deploy tooling (T-3-05)"
    - "Deno inline-import enumeration must catch side-effect imports (import \"...\"; with no `from`) — the naive from-grep misses the xhr@0.1.0 polyfill (11 fns) and paddle-webhook's timing_safe_equal crypto import"

key-files:
  created:
    - .planning/audit/DEPENDENCIES.md
  modified: []  # read-only over package.json + supabase/functions/ — zero product-code / lockfile change

key-decisions:
  - "Only 4 of 20 knip-flagged deps earned safe (html2canvas, jspdf, react-markdown, @tailwindcss/typography) — the other 16 were demoted: 14 are shadcn ui/** consumers in the knip-ignored tree, supabase is a live deploy CLI in scripts/*.ps1, react-pdf's consumer (PDFHighlighter.tsx) may itself be dead (DEAD-CODE.md owns that)"
  - "dotenv is the lone knip 'unlisted' finding -> classified needs-investigation as a DEP-05 DECLARE (it IS used by playwright.config.ts but absent from package.json), explicitly NOT a removal"
  - "All 8 Deno production specifiers kept never-safe: every consumer is a deployed/cron/webhook edge function (KEEP-LIST Class 3, no-importer is meaningless) and paddle-webhook (the std@0.224.0 timing_safe_equal consumer) is KEEP-LIST Class 2"
  - "Recorded the std drift as BROADER than research's 0.168+0.224 estimate: prod pins 0.168.0 (27 fns) + 0.190.0 (4 fns) + 0.224.0 (2 fns); tests add 0.208.0 + 0.224.0 -> 4+ std minors co-exist"
  - "Recorded a zod import-style split (esm.sh/zod@3.25.76 in interviewPrep.ts vs npm:zod@3.25 in handler.ts) as a DEP-03 normalization finding"
  - "Recorded the root-level deno.lock (389KB) as a generated package.json mirror (lists even the unused trio) — NOT a real consumer; Phase 6 DEP-05 must regenerate it alongside package-lock.json"

patterns-established:
  - "Pattern: per-knip-unused-dep real-importer rg sweep INCLUDING the ignored ui/** tree, as the no-consumer signal feeding the D-06 bar (the shadcn false-positive defeater)"
  - "Pattern: split the Deno import enumeration into production (index/_shared, non-test) vs test specifiers so the std drift is attributed to live code vs test infra separately"
  - "Pattern: vuln inventory records advisory GHSA IDs + via/effects chains + fixAvailable (never a token), and flags the cheapest remediation cluster for the downstream phase"

requirements-completed: [DEP-01]

# Metrics
duration: 11min
completed: 2026-06-14
---

# Phase 03 Plan 03: DEPENDENCIES.md (DEP-01) Summary

**Full dependency inventory across the frontend npm surface (59 outdated incl. ~26 major DEP-03 candidates, 9 vulns = 5 moderate/4 high handed to DEP-04, knip's 18+2 unused/1 unlisted leg) AND the Deno edge-import surface (8 production inline specifiers, NO import map, with the std multi-version drift + zod import-style split recorded), three-tier classified under the D-06 conservative bar — 4 safe / ~17 needs-investigation / 0 unsafe — every safe row inline-citing its 4 concurring signals, the KEEP-LIST gate applied to demote 14 shadcn-ui/** + supabase-CLI knip false-positives, with zero dependency, lockfile, or product-code change.**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-06-14T~00:00Z
- **Completed:** 2026-06-14T~00:11Z
- **Tasks:** 2
- **Files:** 1 created (`.planning/audit/DEPENDENCIES.md`); zero `src/` / `supabase/functions/` / lockfile change

## Accomplishments

- **Frontend npm inventory captured + classified:** `npm outdated --json` -> 59 outdated rows (current/wanted/latest), of which **~26 are major-version bumps** (React 18->19, Tailwind 3->4, Zod 3->4, ESLint 9->10, lucide-react 0->1, recharts 2->3, react-router-dom 6->7, jsdom 24->29, etc.) — all DEP-03 candidates, every row carrying its `src/` consumer + class. The major bumps are tagged with their coupling (e.g. `@types/react`/`@types/react-dom` gated on the React 18->19 milestone).
- **9-vuln DEP-04 signal recorded** (`npm audit --json`: `{moderate:5, high:4, critical:0, total:9}`) with full GHSA advisory chains + `via`/`effects`/`fixAvailable` per package. Headline: all highs (`axios`/`esbuild`/`tsx`/`ibm-cloud-sdk-core`) are dev-only transitive under `promptfoo`; the cheapest remediation cluster (`promptfoo` 0.120.13->0.120.19) clears 3 moderates; `react-router-dom` is the only production-runtime advisory (open-redirect, non-major fix available).
- **knip unused/unlisted dep leg captured + KEEP-LIST-gated:** 18 unused `dependencies` + 2 unused `devDependencies` + 1 unlisted (`dotenv`). A per-dep real-importer `rg` sweep (incl. the knip-ignored `src/components/ui/**`) demoted **16 of 20** to `needs-investigation` (14 shadcn-ui consumers + `supabase` deploy-CLI + `react-pdf`-via-possibly-dead-file). Only **4 earned safe**: `html2canvas`, `jspdf`, `react-markdown`, `@tailwindcss/typography` — each with ZERO code references and all four D-06 signals inline-cited.
- **Deno inline-import inventory built (no import map):** 8 distinct **production** specifiers across ~40 functions, each with its version pin + consuming-function list + class. Corrected the enumeration to catch **side-effect imports** the naive `from`-grep misses — the `xhr@0.1.0` polyfill (11 AI fns) and `paddle-webhook`'s `std@0.224.0/timing_safe_equal`.
- **std drift + zod split recorded as DEP-01 risk findings:** prod `std` pins `0.168.0` (27 fns) + `0.190.0` (4 fns) + `0.224.0` (2 fns), tests add `0.208.0`/`0.224.0` — **4+ std minors co-exist** (broader than research's 0.168+0.224 estimate). zod is imported two ways in prod (`esm.sh/zod@3.25.76` vs `npm:zod@3.25`). Both labelled "handed to Phase 6 (DEP-03/DEP-05)".
- **KEEP-LIST gate proven:** all 8 Deno specifiers stay never-`safe` (Class 3 webhook/cron/invoke reachability; `paddle-webhook` is Class 2 gated); no shadcn-ui/`supabase`-CLI dep appears on a `safe` row.

## Task Commits

1. **Task 1 (npm outdated/audit + knip deps leg + KEEP-LIST/importer sweep + Deno inline-import enumeration) + Task 2 (write DEPENDENCIES.md)** — `fbc8e62` (docs). Per the plan, Task 1 is read-only evidence-gathering captured directly into the Task-2 catalog; both committed as one specific-file commit.

**Plan metadata (this SUMMARY + STATE + ROADMAP):** committed separately as the plan-close `docs` commit.

## Files Created/Modified

- `.planning/audit/DEPENDENCIES.md` — DEP-01 catalog: header (HEAD `0c656a0`, tooling, read-only/no-values scope) + verdict/summary (counts: 59 outdated, ~26 major, 9 vulns, 4 safe-unused, 8 Deno specifiers, std drift) + commands-run (npm outdated/audit, knip deps leg, KEEP-LIST/importer sweep, Deno enumeration) + Frontend npm table (~71 rows current/latest/major?/consumer/class) + DEP-02 unused/unlisted table (KEEP-LIST-gated, 4 safe inline-cited) + Vulnerability findings table (GHSA chains, DEP-04 handoff) + Deno inline-import table (8 specifiers, pins, consumers) + Deno risk findings (std drift, zod split, no-lock/no-import-map, root deno.lock note) + Re-Assertion block (audit:deps + rg, PowerShell twin, lockfile-clean assertion) + KEEP-LIST/DEAD-CODE/INDEX/Phase-6 cross-references.

## Decisions Made

- **Conservative-bar demote-on-doubt held the line at 4 safe.** The 16 demoted knip flags each carry a concrete blocking signal: 14 have their only consumer in the knip-`ignore`d `src/components/ui/**` (a knip blind spot, not real disuse — removing them breaks live UI primitives, T-3-05); `supabase` is a deploy-CLI binary knip can't see in `.ps1`; `react-pdf`'s consumer file may itself be dead (a DEAD-CODE.md question, not a dep question yet). Only the trio with literally zero code references anywhere + `@tailwindcss/typography` (its prose companion, absent from `tailwind.config.ts` plugins) cleared all four signals.
- **`dotenv` is a DECLARE, not a remove.** It is the lone knip `unlisted` finding — genuinely imported by `playwright.config.ts` but missing from `package.json` (transitive-only). Recorded as a DEP-05 "add the declaration" item, explicitly never a removal candidate.
- **All Deno specifiers stay never-`safe`.** Edge functions are reached by webhook/cron/invoke, never by an `import`, so "no importer" is meaningless (KEEP-LIST Class 3); and the `paddle-webhook` consumer of `timing_safe_equal` is a Class-2 gated remnant. The actionable Deno output is the version-drift consolidation for DEP-03, not any removal.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug avoided] Corrected the Deno enumeration to include side-effect imports (the `from`-grep blind spot)**
- **Found during:** Task 1 (Deno inline-import enumeration).
- **Issue:** The plan's `read_first` command `rg -n "from \"(https://|npm:|jsr:)" ...` matches only `from`-imports. It **misses side-effect imports** (`import "...";` with no `from`) — which would have dropped the `https://deno.land/x/xhr@0.1.0/mod.ts` polyfill (used by 11 AI edge functions) and `paddle-webhook`'s `std@0.224.0/crypto/timing_safe_equal.ts` import from the inventory entirely.
- **Fix:** Broadened the enumeration to `rg -No "(from |import )['\"](https://...|npm:...|jsr:...)['\"]"`, capturing both import forms. xhr@0.1.0 and the paddle crypto import are now in the Deno table. No code changed — read-only correction of the audit method (recorded in the Commands-run + Re-Assertion blocks so Phase 6 re-derives identically).
- **Files modified:** none (catalog records the corrected enumeration).
- **Committed in:** `fbc8e62`.

**2. [Rule 1 - Bug avoided] Caught the 14-strong shadcn `ui/**` knip false-positive before it became a false `safe`**
- **Found during:** Task 1 (KEEP-LIST gate / real-importer sweep).
- **Issue:** knip reported 18 `dependencies` unused. On a naive reading, several (radix accordion/switch/toggle/etc., cmdk, vaul, embla, react-day-picker, react-resizable-panels) looked removable. The real-importer `rg` revealed 14 of them are consumed by `src/components/ui/**` — the exact tree `knip.json` is configured to `ignore`, so knip can't see the consumer and reports the dep unused.
- **Fix:** Classified all 14 `needs-investigation` with the knip-blind-spot evidence inline, preventing a Phase-6 removal that would have broken live shadcn UI primitives. Same treatment applied to `supabase` (CLI in `.ps1`) and `react-pdf` (consumer is a non-`ui` file of uncertain liveness).
- **Files modified:** none (classification call).
- **Committed in:** `fbc8e62`.

No Rule-4 (architectural) escalations. No authentication gates. No checkpoints (fully autonomous plan).

---

**Total deviations:** 2 (both false-positive defeats: 1 enumeration-method correction, 1 shadcn-ui knip blind-spot catch) — both are audit-method/classification corrections; neither touches `src/`, `supabase/functions/`, `package.json`, or any lockfile.
**Impact on plan:** Both essential for inventory correctness (an undercount of Deno imports; a 14-dep false-`safe` that would break prod UI in Phase 6). No scope creep.

## Issues Encountered

- The knip JSON reporter prepends a non-JSON preamble line (`◇ injected env (12) ... { debug: true }`) on stdout, which broke a `JSON.parse(slice(indexOf('{')))` (it found the `{ debug: true }` brace). Resolved by slicing from `{"issues"` instead. Read-only, no artifact impact.
- The root-level `deno.lock` (389KB) initially looked like a possible consumer of the "unused" trio (`html2canvas`/`jspdf`/`react-markdown` appear in it). Investigation confirmed it is an auto-generated mirror of the full `package.json` dep set (it lists ALL deps as `npm:` specs, used vs unused alike), NOT a real importer — recorded as a DEP-05 regenerate-alongside note rather than a consumer, so the trio's `safe` verdict stands.

## User Setup Required

None - no external service configuration required. (D-02 online registry lookups for `npm outdated`/`npm audit` were autonomous public-registry reads; no credentials involved.)

## Next Phase Readiness

- **Phase 6 (DEP-02..05) has a fully actionable inventory:** DEP-02 = 4 confirmed-safe unused (`html2canvas`/`jspdf`/`react-markdown`/`@tailwindcss/typography`) + 15 `needs-investigation` knip false-positives to resolve (the shadcn-ui consumers are KEEPs once confirmed) + the `dotenv` DECLARE. DEP-03 = ~26 major-bump candidates with coupling notes + the Deno std-drift consolidation + zod-style normalization. DEP-04 = the 9-vuln list with GHSA IDs + the `promptfoo`->0.120.19 cheapest cluster. DEP-05 = `package-lock.json` + root `deno.lock` reconciliation + (optional) a Deno import map to make future bumps single-site.
- The other Wave-2 catalogs (03-04 ENV, 03-05 DB, 03-06 PERF) are unaffected — this plan wrote ONLY `DEPENDENCIES.md` and never edited INDEX.md (pre-listed row) or KEEP-LIST.md.
- No blockers.

## Self-Check: PASSED

- `.planning/audit/DEPENDENCIES.md` exists on disk (Write succeeded; `git show --stat HEAD` lists it).
- 4 rows tagged `**safe**`, all 4 carry an inline `(signals: ...)` four-signal citation (grep-verified).
- Both required tables present: a Frontend npm table (with `Current` + `Latest` columns) and a Deno inline-import table (specifier + version pin + consuming function).
- DEP-01 risk findings present: the 9-vuln summary (`5 moderate / 4 high`) and the std@0.168.0/0.190.0/0.224.0 drift + zod split, both labelled handed to Phase 6 (grep: 100× `needs-investigation`, 6× std-pin refs, 13× `KEEP-LIST`).
- Cross-References block references `KEEP-LIST.md`, `DEAD-CODE.md`, `INDEX.md`, and Phase 6.
- No secret value / token in the file (records names/versions/counts/advisory-IDs only).
- Commit `fbc8e62` exists; `git show --stat HEAD` listed ONLY `.planning/audit/DEPENDENCIES.md`; `package-lock.json`/`deno.lock`/`package.json` NOT in the commit.
- Zero functional change: `git diff --stat fa4ccb6..HEAD -- src supabase/functions package-lock.json deno.lock` empty; lockfiles byte-identical (read-only passes left the working tree clean).

---
*Phase: 03-cross-domain-inventory-audit*
*Completed: 2026-06-14*
