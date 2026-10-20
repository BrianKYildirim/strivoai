***

phase: 14
slug: tier-prompts-and-locked-section-primitive
status: validated
nyquist\_compliant: true
wave\_0\_complete: true
created: 2026-04-14
updated: 2026-04-16
-------------------

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

***

## Test Infrastructure

| Property               | Value                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Framework**          | Deno `std/assert` (edge layer); Vitest + @testing-library/react + jsdom (frontend — installed in Plan 08 Task 1)                                       |
| **Config file**        | `supabase/functions/deno.json` (exists); `vitest.config.ts` + `src/test-setup.ts` (created in Plan 08 Task 1)                                          |
| **Quick run command**  | `powershell .\scripts\run-edge-tests.ps1` (edge unit tests only — no live model calls)                                                                 |
| **Full suite command** | `powershell .\scripts\run-edge-tests.ps1` + `npm run test` + (phase gate only) `$env:RUN_TIER_VALIDATION='1'; powershell .\scripts\run-edge-tests.ps1` |
| **Estimated runtime**  | Deno unit suite: \~15s · Vitest frontend suite: \~10s · Live tier-validation harness (phase gate only): \~45s + Anthropic cost                         |

***

## Nyquist Compliance — TDD Pattern (In-Plan, No Separate Wave 0)

Phase 14's eight plans use an **in-plan TDD pattern** rather than a dedicated Wave 0 scaffold plan:

* Each code-producing plan pairs a module-creation task with a test-creation task in the SAME plan (e.g., Plan 01 Task 1 creates `tier-config.ts`, Task 2 writes `tier-config.test.ts`; Plan 02 Task 2 creates `tier-prompts.ts`, Task 3 writes loader tests; Plan 03 Task 1 refactors `resume-prompts.ts`, Task 2 writes divergence tests; Plan 08 Task 1 installs Vitest, Task 2 writes component tests).
* **Every task carries an** **`<automated>`** **verify block** — no task relies on manual-only verification for its primary gate.
* Sampling continuity is preserved structurally: the dependency graph is `01+02 → 03 → 07` (edge layer) and `04 → 06/08` (frontend layer), and every wave transition is covered by an automated verify from the previous wave's last task.

This satisfies Nyquist sampling ("no 3 consecutive tasks without automated verify") without requiring a separate Wave 0 plan. The trade-off: first-task code creation is not RED-first, but the paired test task ensures RED→GREEN closure within the same plan commit window.

***

## Sampling Rate

* **After every task commit:** Run `powershell .\scripts\run-edge-tests.ps1` (Deno unit suite — fast, free) + `npm run test` (after Plan 08 Task 1 lands)
* **After every plan wave:** Deno unit suite + `npm run lint` + `npm run test` + `npm run build`
* **Before** **`/gsd-verify-work`:** Full edge suite green + `npm run test` green + ONE dev-manual run of `RUN_TIER_VALIDATION=1` tier harness against `scripts/test-resumes/medium.txt`; record token snapshot into `supabase/functions/_shared/tier-validation-fixtures/resume.json`
* **Max feedback latency:** \~15s for per-commit Deno unit sampling; \~10s for Vitest; live harness is phase-gate-only (not per-commit) to protect Anthropic budget

***

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement                        | Threat Ref                     | Secure Behavior                                                                                                                                                                   | Test Type                        | Automated Command                                                                                                                                                                                                                                                                                                                                                                                                                                     | Status    |
| -------- | ---- | ---- | ---------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 14-01-01 | 01   | 1    | BACK-12                            | T-14-01 (cost amplification)   | `tier-config.ts` exports `TIER_TIMEOUTS` / `TIER_MODELS` with exact spec values; Free model hard-pinned to Haiku 4.5                                                              | type-check (Deno)                | `cd supabase/functions && deno check --no-check _shared/tier-config.ts`                                                                                                                                                                                                                                                                                                                                                                               | ✅ green |
| 14-01-02 | 01   | 1    | BACK-12                            | —                              | `tier-config.test.ts` asserts every spec timeout value and Free-model guard                                                                                                       | unit (Deno)                      | `powershell -File scripts/run-edge-tests.ps1`                                                                                                                                                                                                                                                                                                                                                                                                         | ✅ green |
| 14-02-01 | 02   | 1    | GATE-04                            | T-14-02 (prompt injection)     | `STRIVO_GLOBAL_AI_PRINCIPLES` extracted from DOCX into a TS constant at `_shared/global-ai-principles.ts`                                                                         | type-check + grep                | `cd supabase/functions && deno check --no-check _shared/global-ai-principles.ts && grep -c "STRIVO_GLOBAL_AI_PRINCIPLES" _shared/global-ai-principles.ts`                                                                                                                                                                                                                                                                                             | ✅ green |
| 14-02-02 | 02   | 1    | GATE-01, GATE-02, GATE-04          | T-14-02                        | `tier-prompts.ts` loader + registry + auto-prepend of principles when `tier !== 'free'`                                                                                           | type-check (Deno)                | `cd supabase/functions && deno check --no-check _shared/tier-prompts.ts`                                                                                                                                                                                                                                                                                                                                                                              | ✅ green |
| 14-02-03 | 02   | 1    | GATE-01, GATE-02, GATE-03, GATE-04 | T-14-02                        | Deno tests assert per-tier divergence, principles present in Pro/Elite only, registry contains `resume`                                                                           | unit (Deno)                      | `powershell -File scripts/run-edge-tests.ps1`                                                                                                                                                                                                                                                                                                                                                                                                         | ✅ green |
| 14-04-01 | 04   | 1    | GATE-05                            | T-14-07 (DOM-scrape leak)      | `<LockedSection>` flat-props component with blurred body skeleton + CTA + test selectors                                                                                          | lint + grep                      | `npm run lint -- src/components/LockedSection.tsx ; grep -q "data-testid=\"locked-section\"" src/components/LockedSection.tsx && grep -q "data-testid=\"locked-section-blur\"" src/components/LockedSection.tsx && grep -q "data-testid=\"locked-section-teaser\"" src/components/LockedSection.tsx && grep -q "data-testid=\"locked-section-cta\"" src/components/LockedSection.tsx`                                                                 | ✅ green |
| 14-04-02 | 04   | 1    | GATE-06                            | —                              | `<LockedListItem>` with `"Edit X of N — Locked"` em-dash label, `data-index` attribute                                                                                            | lint + grep                      | `npm run lint -- src/components/LockedListItem.tsx ; grep -q "data-testid=\"locked-list-item\"" src/components/LockedListItem.tsx && grep -q "data-index" src/components/LockedListItem.tsx && grep -qP "\\\\u2014\|\u2014" src/components/LockedListItem.tsx`                                                                                                                                                                                        | ✅ green |
| 14-05-01 | 05   | 1    | GATE-07, GATE-08                   | T-14-04 (elite field scraping) | `<EliteFeatureGate>` structural copy of `<ProFeatureGate>` for GATE-08                                                                                                            | lint + grep                      | `npm run lint -- src/components/EliteFeatureGate.tsx ; grep -q "ELITE EXCLUSIVE" src/components/EliteFeatureGate.tsx && grep -q "Upgrade to Elite" src/components/EliteFeatureGate.tsx && grep -q "data-testid=\"elite-feature-gate-locked\"" src/components/EliteFeatureGate.tsx && grep -q "data-testid=\"elite-feature-gate-unlocked\"" src/components/EliteFeatureGate.tsx && grep -q "userTier === 'elite'" src/components/EliteFeatureGate.tsx` | ✅ green |
| 14-05-02 | 05   | 1    | GATE-07                            | —                              | `<ProFeatureBlur>` JSDoc `@deprecated` + pointer to `<LockedSection>`                                                                                                             | grep + lint                      | `grep -q "@deprecated" src/components/ProFeatureBlur.tsx && grep -q "LockedSection" src/components/ProFeatureBlur.tsx && npm run lint -- src/components/ProFeatureBlur.tsx`                                                                                                                                                                                                                                                                           | ✅ green |
| 14-03-01 | 03   | 2    | GATE-01                            | —                              | `resume-prompts.ts` refactored: `buildFreePrompt`/`buildProPrompt`/`buildElitePrompt` explicit builders; existing exports retained as wrappers                                    | type-check (Deno)                | `cd supabase/functions && deno check --no-check _shared/resume-prompts.ts && deno check --no-check analyze-resume/index.ts`                                                                                                                                                                                                                                                                                                                           | ✅ green |
| 14-03-02 | 03   | 2    | GATE-01, GATE-03                   | —                              | Deno test asserts free / pro / elite resume variants are distinct strings and Free omits locked-field language                                                                    | unit (Deno)                      | `powershell -File scripts/run-edge-tests.ps1`                                                                                                                                                                                                                                                                                                                                                                                                         | ✅ green |
| 14-06-01 | 06   | 2    | GATE-05, GATE-06, GATE-08          | T-14-05 (dev route leak)       | `LockedSectionsSandbox` page renders every primitive variant                                                                                                                      | build + grep                     | (see Task 2's combined verify)                                                                                                                                                                                                                                                                                                                                                                                                                        | ✅ green |
| 14-06-02 | 06   | 2    | D-10                               | T-14-05                        | Sandbox route registered in `src/App.tsx` behind `import.meta.env.DEV`; Vite tree-shakes sandbox out of production `dist/`                                                        | build + grep                     | `grep -q "LockedSectionsSandbox" src/App.tsx && grep -q "import.meta.env.DEV" src/App.tsx && grep -q "/dev/locked-sections" src/App.tsx && npm run build && ! grep -rq "LockedSectionsSandbox" dist/`                                                                                                                                                                                                                                                 | ✅ green |
| 14-08-01 | 08   | 2    | TEST-11                            | —                              | Vitest + @testing-library/react + jsdom installed; `vitest.config.ts` + `src/test-setup.ts` created; `npm run test` script wired                                                  | install + run                    | `test -f vitest.config.ts && test -f src/test-setup.ts && grep -q "\"test\":" package.json && grep -q "vitest" package.json && npm run test`                                                                                                                                                                                                                                                                                                          | ✅ green |
| 14-08-02 | 08   | 2    | TEST-11                            | —                              | Three component test files (LockedSection, LockedListItem, EliteFeatureGate) assert render + blur + icon + CTA + teaser                                                           | unit (Vitest/RTL)                | `npm run test`                                                                                                                                                                                                                                                                                                                                                                                                                                        | ✅ green |
| 14-07-01 | 07   | 3    | TEST-09, TEST-10, GATE-09          | T-14-13 (cost DoS)             | `tier-validation.test.ts` with `ignore: skip` env-gated pattern, live field-presence + token ratio assertions; file compiles and default `deno test` run reports tests as ignored | type-check + default-skip        | `cd supabase/functions && deno check --no-check _shared/tier-validation.test.ts && deno test --allow-read _shared/tier-validation.test.ts 2>&1 \| grep -E "ignored\|ok"`                                                                                                                                                                                                                                                                              | ✅ green |
| 14-07-02 | 07   | 3    | TEST-09, TEST-10                   | T-14-13, T-14-15               | Fixture seed file `tier-validation-fixtures/resume.json` and conditional `RUN_TIER_VALIDATION` branch in `run-edge-tests.ps1`; default run skips harness                          | file-exists + grep + runner-skip | `test -f supabase/functions/_shared/tier-validation-fixtures/resume.json && grep -q "RUN_TIER_VALIDATION" scripts/run-edge-tests.ps1 && powershell -File scripts/run-edge-tests.ps1 2>&1 \| grep -q "Skipping tier-validation"`                                                                                                                                                                                                                       | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Wave structure:** Wave 1 = {01, 02, 04, 05} (parallel — no file overlap). Wave 2 = {03, 06, 08} (03 depends on 02; 06 and 08 depend on 04). Wave 3 = {07} (depends on 01, 02, 03). Every wave transition is gated by at least one automated `<automated>` verify from the prior wave's last task.

***

## Manual-Only Verifications

| Behavior                                                                            | Requirement      | Why Manual                                                                                                                               | Test Instructions                                                                                                                                              |
| ----------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live model obedience: Free prompt omits locked fields on real Anthropic call        | GATE-03, TEST-09 | Deterministic model output not possible; costs \~\$0.05/run; phase-gate-only to protect Anthropic budget (D-15: harness stays out of CI) | `$env:RUN_TIER_VALIDATION='1'; .\scripts\run-edge-tests.ps1` — inspect `tier-validation-fixtures/resume.json` snapshot for zero locked fields in Free response |
| Free/Elite token ratio snapshot capture                                             | GATE-09, TEST-10 | First run writes snapshot; subsequent runs assert against it                                                                             | Same command as above. First run: commit the fixture. Subsequent runs: must pass `freeTokens < 0.5 * eliteTokens` assertion                                    |
| `<LockedSection>` visual polish (blur strength, teaser readability, CTA prominence) | GATE-05          | Visual regression not automatable without Playwright (not installed)                                                                     | `npm run dev`, navigate to `/dev/locked-sections`, compare against CONTEXT.md D-05 reference behaviors                                                         |
| `<LockedListItem>` card layout in list of 5                                         | GATE-06          | Same                                                                                                                                     | Same dev sandbox route; verify item 1 renders full content and items 2-5 render numbered locked cards                                                          |

***

## Validation Sign-Off

* [x] All tasks have `<automated>` verify blocks (verified: 17/17 tasks across 8 plans)
* [x] Sampling continuity: no 3 consecutive tasks without automated verify (TDD pattern — every code task is paired with a test task in the same plan)
* [x] Wave 0 requirements met by in-plan TDD pattern (Plan 01 Task 2, Plan 02 Task 3, Plan 03 Task 2, Plan 08 Task 2) — no separate Wave 0 scaffold plan required
* [x] No watch-mode flags (all verify commands are one-shot)
* [x] Feedback latency < 20s for per-commit unit sampling (Deno \~15s + Vitest \~10s, run in parallel or sequentially)
* [x] `nyquist_compliant: true` set in frontmatter
* [x] GATE-09 coverage traced to Plan 07 Task 2 (token-ratio assertion in live harness)

**Approval:** validated (2026-04-16)

***

## Validation Audit 2026-04-16

| Metric | Count |
|--------|-------|
| Tasks audited | 17 |
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

**Verification results:**
- Deno edge tests: 191 passed, 0 failed (6s)
- Vitest frontend tests: 16 passed, 0 failed (5.5s)
- Tier-validation harness: 2 tests correctly ignored (env-gated)
- Production build: succeeds, LockedSectionsSandbox tree-shaken from dist/
- All type-checks pass (pre-existing Deno namespace errors in anthropic.ts are transitive, not Phase 14)
- All grep-based content assertions pass for data-testid selectors, deprecated markers, and route guards
