---
phase: 03-cross-domain-inventory-audit
plan: 02
subsystem: audit
tags: [dead-code, knip, deno-info, reachability, three-tier-classification, keep-list-gate, d-08, ollama, interview-prep-coach, clean-01]

# Dependency graph
requires:
  - phase: 03-cross-domain-inventory-audit
    plan: 01
    provides: "tuned knip.json + deno-reachability.mjs runner + audit:* scripts + .planning/audit scaffold (INDEX + KEEP-LIST gate)"
provides:
  - "DEAD-CODE.md (CLEAN-01): evidence-backed React-knip + Deno-reachability dead-code catalog, three-tier classified (5 safe / 23 needs-investigation / 0 unsafe), every safe row inline-citing its four concurring signals (D-06)"
  - "5 confirmed-safe removal targets for Phase 4 (React: HowItWorks.tsx, MinimalHero.tsx, NavLink.tsx; Deno _shared: errors.ts, handler.ts)"
  - "D-08 re-verification with current-HEAD evidence: Ollama parser-first routing (needs-investigation) + interview-prep-coach absence (Phase-4 candidate, pending operator deployment check)"
affects: [phase-4-cleanup-CLEAN-02, phase-4-cleanup-CLEAN-03, phase-4-cleanup-CLEAN-04, phase-4-cleanup-CLEAN-06]

# Tech tracking
tech-stack:
  added: []  # zero new deps — knip via npx --yes; deno info / rg built-ins (D-01)
  patterns:
    - "Three-tier dead-code classification with the D-06 conservative bar: safe ONLY when static-dead + no-dynamic-ref + no-external-caller + not-gated all concur, inline-cited per row"
    - "KEEP-LIST (D-07) applied as a gate AFTER every static pass — gated-but-live surfaces (Interview Prep, Paddle, cron/webhook, dynamic keys, lock primitives) forced to never-safe"
    - "Name-collision + live-test trap detection: an entrypoint-unreachable module is NOT safe if it has a dedicated test or name-collides with a live symbol (resolve-tier.ts vs price-resolver.resolveTier)"

key-files:
  created:
    - .planning/audit/DEAD-CODE.md
  modified: []  # read-only over src/ + supabase/functions/ — zero product-code change

key-decisions:
  - "Only 5 of 28 candidates earned safe — the conservative bar deliberately demoted 18 React + 3 Deno candidates to needs-investigation rather than risk a false-positive that becomes a broken prod path in Phase 4"
  - "resolve-tier.ts kept OUT of safe: it is entrypoint-unreachable but (a) name-collides with the LIVE price-resolver.resolveTier and (b) has its own 5-test deno suite — both block a clean safe"
  - "The two test-helpers/stripe-* modules are needs-investigation not safe: entrypoint-unreachable (correct — tests aren't entrypoints) but LIVE test infra in verify:baseline; removing them breaks the suite"
  - "Whole Interview-Prep dead cluster (InterviewQuiz + Flashcards + StreakDisplay + QuizResults + 4 leaves + InterviewPrepInput) → needs-investigation: superseded by the live QuizRunner path but inside KEEP-LIST Class 1 gated surface; Phase 4 must confirm no flag re-activates the old quiz"
  - "AuthCallback.tsx + ResumeBuilder.tsx → needs-investigation not safe: pages can be reached by redirect/navigate STRING rather than import (the dynamic-reference trap), so a no-importer reading is insufficient"
  - "D-08 Ollama → needs-investigation: parser-first routing recorded with line anchors, but fallback live-ness is unknowable without prod logs / OLLAMA_BASE_URL presence — removal is unproven-dead until Phase 4 checks live evidence"

patterns-established:
  - "Pattern: per-candidate non-test/non-self rg sweep as the no-dynamic-ref + no-static-importer signal feeding the D-06 bar"
  - "Pattern: disambiguate same-named files before a dead verdict (components/HowItWorks.tsx vs the routed pages/HowItWorks.tsx)"
  - "Pattern: marked-operator step for deployed-but-no-source detection (supabase functions list with operator-supplied refs) inside an otherwise-autonomous audit"

requirements-completed: [CLEAN-01]

# Metrics
duration: 9min
completed: 2026-06-13
---

# Phase 03 Plan 02: DEAD-CODE.md (CLEAN-01) Summary

**Evidence-backed dead-code / unused-export catalog covering the React app (knip 6.16.1) and the Deno edge functions (`deno info --json` reachability union over 38 entrypoints), three-tier classified under the D-06 conservative bar — 5 safe, 23 needs-investigation, 0 unsafe — with every safe row inline-citing its four concurring signals, the KEEP-LIST gate applied after every pass, and both D-08 named targets (Ollama path, retired interview-prep-coach) re-verified with current-HEAD evidence; zero product-code change.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-06-13T23:53:02Z
- **Completed:** 2026-06-13T~00:02Z (next day UTC)
- **Tasks:** 2
- **Files:** 1 created (`.planning/audit/DEAD-CODE.md`); zero `src/`/`supabase/functions/` change

## Accomplishments

- **React knip pass captured + classified:** 23 dead-FILE candidates. 3 earned `safe` (`components/HowItWorks.tsx`, `components/MinimalHero.tsx`, `components/NavLink.tsx`) — each with all four signals concurring and inline-cited. The other 18 → `needs-investigation`. Unused-EXPORT/TYPE rows on ~13 live files listed separately (all `needs-investigation` — an unused export is not a dead file). Dependency legs deliberately deferred to DEP-01 (03-03).
- **Deno reachability pass captured + classified:** 36/41 `_shared` modules reachable; 5 dead candidates. 2 → `safe` (`_shared/errors.ts`, `_shared/handler.ts` — zero references anywhere, no sibling test). 3 → `needs-investigation` (`resolve-tier.ts` name-collision + live test, and the two `test-helpers/stripe-*` live test-infra).
- **D-06 conservative bar enforced:** only 5 of 28 candidates are `safe`. Multiple false-positives were neutralized rather than waved through: the `components/HowItWorks.tsx` vs routed `pages/HowItWorks.tsx` disambiguation; the `resolve-tier.ts` ↔ live `price-resolver.resolveTier()` name collision; the entire Interview-Prep cluster (superseded by the live `QuizRunner` path but inside KEEP-LIST Class 1); the `AuthCallback.tsx`/`ResumeBuilder.tsx` redirect-string trap.
- **D-08.a Ollama re-verified:** `_shared/document-extraction.ts` routing recorded with line anchors — `pdf_parser` first (L55–84), Ollama the first fallback `invoke` (L92–97) ahead of mistral/textract, claude_ocr last (tier-gated). `ollama-client.ts` is correctly reachable (imported by document-extraction + ocr-pdf), so it is NOT in the dead list. Verdict `needs-investigation` (fallback live-ness needs prod logs / `OLLAMA_BASE_URL` presence).
- **D-08.b interview-prep-coach re-verified:** no source dir, no `config.toml` block, zero references anywhere in `supabase/`. The look-alike LIVE pair (`interview-prep-analyze` L82 + `interview-prep-evaluate` L85) confirmed present (KEEP-LIST Class 1, never-`safe`). Recorded the MARKED OPERATOR `supabase functions list --project-ref <ref>` deployment-confirmation step (refs operator-supplied; not run autonomously).
- **KEEP-LIST gate proven:** no Interview-Prep/`-analyze`/`-evaluate`, Paddle, cron/webhook, dynamic-key, or lock-primitive class appears on any `safe` row (grep-verified).

## Task Commits

1. **Task 1 (run knip + deno-info passes, dynamic/external-caller sweeps, D-08 re-verification) + Task 2 (write DEAD-CODE.md)** — `43292e5` (docs). Per the plan, Task 1 is read-only evidence-gathering captured directly into the Task-2 catalog; both committed as one specific-file commit.

**Plan metadata (this SUMMARY + STATE + ROADMAP):** committed separately as the plan-close `docs` commit.

## Files Created/Modified

- `.planning/audit/DEAD-CODE.md` — CLEAN-01 catalog: header (HEAD `2c407ca`, tooling, read-only scope) + verdict table (5 safe / 23 needs-investigation / 0 unsafe) + commands-run (knip, deno-reachability, Pattern-4 rg, config.toml external-caller) + React dead-FILE table (24 rows incl. a disambiguation note) + React unused-EXPORT/TYPE table + Deno `_shared` reachability table + the D-08 Ollama/interview-prep-coach subsection + re-assertion block + KEEP-LIST/Phase-4 cross-references.

## Decisions Made

- **Demote-not-wave-through on any doubt.** The 18 React + 3 Deno `needs-investigation` verdicts each have a concrete blocking signal (gated-feature membership, name collision, live test, redirect-string risk, generated-types ambiguity). The plan's threat model treats a false `safe` as the live ASVS-L1 threat (broken prod path in Phase 4), so doubt resolves to `needs-investigation`, never `safe`.
- **`resolve-tier.ts` is NOT safe** despite being entrypoint-unreachable — it name-collides with the live `price-resolver.resolveTier()` and carries its own 5-test deno suite; either fact alone forbids a clean `safe`.
- **Test-infra (`test-helpers/stripe-*`) is needs-investigation, not dead.** "Unreachable from a deployed entrypoint" is the EXPECTED state for a test helper; it is live infra inside `verify:baseline`.
- **Ollama stays `needs-investigation`.** Recording the routing order is evidence; proving the fallback is never taken in prod is a Phase-4 live-log/operator task.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Corrected the D-08 Ollama file path**
- **Found during:** Task 1 (reading the Ollama routing for D-08 evidence).
- **Issue:** The plan/`read_first` pointed at `supabase/functions/document-extraction.ts`; that path does not exist. The actual module is `supabase/functions/_shared/document-extraction.ts` (with `_shared/ollama-client.ts`).
- **Fix:** Located the real path via `rg --files`, read it, and recorded the routing with corrected line anchors (pdf_parser L55–84; ollama fallback L92–97). No code changed — read-only correction of the audit reference.
- **Files modified:** none (catalog records the corrected path).
- **Committed in:** `43292e5`.

**2. [Rule 1 - Bug avoided] Caught the `resolve-tier.ts` / `price-resolver.resolveTier` name collision before it became a false `safe`**
- **Found during:** Task 1 (external-caller sweep for the Deno dead candidates).
- **Issue:** `resolve-tier.ts` was an entrypoint-unreachable candidate that, on a naive reading, looked `safe`. The `resolveTier` grep revealed the LIVE consumer is the DISTINCT `price-resolver.ts` `resolveTier()`, and `resolve-tier.ts` has its own dedicated deno test.
- **Fix:** Classified `resolve-tier.ts` `needs-investigation` with the collision + live-test evidence inline, preventing a Phase-4 removal that would have deleted a tested module / confused the two resolvers.
- **Files modified:** none (classification call).
- **Committed in:** `43292e5`.

No Rule-4 (architectural) escalations. No authentication gates. No checkpoints (fully autonomous plan).

**Total deviations:** 2 (1 blocking path-fix, 1 false-positive caught) — both are audit-classification corrections; neither touches `src/` or `supabase/functions/`.

## Issues Encountered

- The plan's named Ollama path was stale (`document-extraction.ts` → actually `_shared/document-extraction.ts`); resolved by file-search (deviation 1).
- The hardest classification judgment was the Interview-Prep cluster: knip shows zero importers, but the gate (Class 1) forbids `safe` for a gated-feature surface. Resolved by tracing the live path (`InterviewPrep.tsx → QuizRunner`) and recording the cluster as superseded-within-gated → `needs-investigation`, with the removal-as-one-unit + flag-confirmation note for Phase 4.

## User Setup Required

- **Operator deployment check (D-08.b), required before Phase 4 removes `interview-prep-coach`:**
  ```bash
  npx supabase functions list --project-ref <PROD_REF>
  npx supabase functions list --project-ref <STAGING_REF>
  ```
  A function listed with no repo dir = the deployed-orphan to delete. Refs are operator-supplied (RESEARCH Open Question 2); not run autonomously.
- **Ollama live-ness (D-08.a):** Phase 4 needs live extraction-log evidence / confirmation of whether `OLLAMA_BASE_URL` is set in prod before retiring the Ollama branch.

## Next Phase Readiness

- Phase 4 (CLEAN-02/03/04/06) has 5 confirmed-`safe` removal targets it can act on immediately (React: `HowItWorks.tsx`, `MinimalHero.tsx`, `NavLink.tsx`; Deno: `_shared/errors.ts`, `_shared/handler.ts`), each with inline-cited signals.
- The 23 `needs-investigation` rows are queued with their exact blocking signal, so Phase 4 resolves each (flag confirmation, redirect-string check, live-log evidence, operator deployment check) BEFORE any removal.
- The other Wave-2 catalogs (03-03..03-06) are unaffected — this plan wrote ONLY `DEAD-CODE.md` and never edited INDEX.md (pre-listed rows) or KEEP-LIST.md.
- No blockers.

## Self-Check: PASSED

- `.planning/audit/DEAD-CODE.md` exists on disk (verified `test -f` → exit 0).
- 5 rows tagged `**safe**`, all 5 carry an inline `(signals: ...)` four-signal citation (grep-verified).
- Exact KEEP-LIST tokens `interview-prep-analyze` and `LockedSection` appear on NO `safe` row (grep-verified — the earlier match was the `errors.ts` "not-gated" negation text, not a keep-class verdict).
- D-08 strings present: `document-extraction` (4×), `supabase functions list` (4×), `needs-investigation` (48×), `KEEP-LIST` (23×), `CLEAN-03` (6×).
- Commit `43292e5` exists in `git log`; `git show --stat HEAD` listed ONLY `.planning/audit/DEAD-CODE.md` (zero src/functions change).
- Zero functional change: `git diff --stat fa4ccb6..HEAD -- src supabase/functions` empty; `deno.lock` / `package-lock.json` byte-identical (read-only passes left the working tree clean).

---
*Phase: 03-cross-domain-inventory-audit*
*Completed: 2026-06-13*
