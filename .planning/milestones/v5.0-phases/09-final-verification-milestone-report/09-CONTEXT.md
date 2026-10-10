# Phase 9: Final Verification & Milestone Report - Context

**Gathered:** 2026-07-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 9 proves the entire v5.0 milestone green end-to-end and produces the mandated evidence report. It delivers four things and nothing else:

1. **VER-01** — an extended, blocking `verify:baseline` gate that covers lint, type-check, unit, integration, Edge Function, database, browser E2E, security tests, and the production build, plus real deployment validation.
2. **VER-02** — consolidated scenario coverage for the 23-scenario matrix across the five migrated AI features.
3. **VER-04** — real-account Free-tier and Elite-tier verification on production, with no real user data exposed anywhere.
4. **VER-05** — the 14-item evidence-based final milestone report, every claim backed by test output, database evidence, deployment evidence, or a reproducible manual record.

**Also in scope (decided in discussion, not obvious from the roadmap text):** the staged production activation of the shared analysis lifecycle. The lifecycle currently ships DORMANT on production — `ANALYSIS_LIFECYCLE_ENABLED` and all five per-feature flags default OFF, so production still runs the legacy paths. Verifying a dormant production would prove nothing about the milestone's actual value, so Phase 9 flips the flags on production behind an operator gate and the real-account pass doubles as the activation soak.

**Not in scope:** new features, new AI surfaces, Interview Prep re-enablement, `MERIT_SYSTEM_ENABLED` activation on production, or any behavior change to a feature that is not required to make a VER-* criterion true.

</domain>

<decisions>
## Implementation Decisions

### Flag posture and production activation

- **D-01 — Phase 9 activates the lifecycle on production.** Verify the lifecycle-ON posture on staging first, then flip `ANALYSIS_LIFECYCLE_ENABLED` plus the five per-feature flags on production behind an operator gate. Rationale: the milestone's value (merit-safety, persistence, refresh recovery, structured errors) only reaches users if production actually runs the lifecycle. Closing v5.0 with prod on legacy paths would ship the milestone as dead code.
- **D-02 — Staged rollout in ascending blast radius.** Master flag ON, then one feature at a time in the order the migrations shipped: `recruiting_lens` → `linkedin` → `onboarding` → `resume` → `career_compass`. Each flip gets a soak window and a merit-ledger check before the next. This mirrors the design intent of the two-level gate documented in `supabase/functions/_shared/analysis-flags.ts`.
- **D-03 — `MERIT_SYSTEM_ENABLED` is verified ON in staging only; production stays `false`.** Turning it on in staging proves the Phase-13 submit-time merit-deduction path end-to-end and produces activation-readiness evidence for the report. It is a GLOBAL gate across 10+ AI functions — setting it true on production in Phase 6 flipped platform-wide behavior and had to be reverted, so its production activation remains a separate milestone-level decision.
- **D-04 — Abort/rollback criteria (Claude's discretion, resolved).** Abort any production flip and set the master flag OFF immediately on: (a) any merit-ledger anomaly — a double-charge, a missing refund on a failed run, or a settle without a saved result; (b) any run stuck non-terminal past the reaper window; (c) any new 4xx/5xx error class in edge logs that was not present in the pre-flip baseline; (d) any user-visible regression in output quality or latency. Master-off is instant and restores the legacy paths byte-identically, which is exactly what the dormancy design bought.

### Gate composition (VER-01)

- **D-05 — Extend `verify:baseline` itself with lint + type-check + build.** These are fast and deterministic, and folding them in genuinely strengthens the `deploy.ps1` pre-deploy gate rather than producing a one-off report artifact. VER-01 requires the gate be extended, not replaced. Current gate is `test && test:edge && test:e2e`.
- **D-06 — Fold the remote database lane into the blocking gate.** Run the Deno edge suite against the preview Supabase project (`DENO_TEST_SUPABASE_REMOTE=1`) as part of `verify:baseline`, not as a side evidence run. This satisfies VER-01's database-test requirement with real DB evidence on every deploy.
  - **Constraint the planner MUST address:** this makes every deploy depend on the preview project (`cimjltzovkahkqecpwgi`) being reachable and unpaused. It was paused for all of v4.0. The gate must **fail loudly** when preview is unreachable — never silently skip, never auto-degrade to the offline lane. If an escape hatch is needed it must be explicit, opt-in, and loud, following the `-SkipVerify` precedent in `scripts/deploy.ps1`.
- **D-07 — Adversarial promptfoo suites run once as evidence, stay OFF the gate.** Execute all `test:adversarial:*` suites during Phase 9 and capture the results as the security / AI-prompt-exposure evidence for the report. They cost real Anthropic calls and are non-deterministic, so they must not gate deploys.
- **D-08 — Deployment validation is a real staged deploy plus post-deploy smoke.** Run `scripts/deploy.ps1 -Env staging` (which itself gates on `verify:baseline`), then smoke: apex + www CORS re-proof, one live analysis per feature, edge-log check. Repeat against production as part of the activation. The deploy is the activation vehicle, not a separate ceremony.

### Scenario matrix (VER-02)

- **D-09 — Audit-first; close only genuine gaps.** Map all 23 scenarios against each feature using the tests Phases 4/5/6 already wrote (152 Deno test files, 87 vitest files, 4 Playwright specs), publish the traceability matrix, then write tests only where a cell is genuinely uncovered. Do not rebuild coverage that already exists.
- **D-10 — Matrix scope is the five migrated features:** Resume Analysis, Onboarding, LinkedIn Grader, Recruiting Lens, Career Compass. Excludes Interview Prep (Coming Soon, explicitly out of v5.0 scope), Skills Gap, and Compare Jobs.
- **D-11 — Fault-inject what is faultable; explicitly justify the rest.** Provider timeout, provider rate-limiting, invalid model JSON, and truncated output are all fault-injectable at the Anthropic client seam — automate them. Two-tab concurrency is testable in Playwright with two browser contexts. Anything genuinely impractical gets an explicit accept-with-justification entry in the registry. There are no silent gaps.
- **D-12 — The matrix is machine-enforced, not a document.** Build a coverage registry (scenario × feature → test file/name) with a test that fails if any cell is neither mapped to a live test nor carries an explicit justified waiver, and fold it into `verify:baseline`. A markdown matrix would drift the moment a test is renamed.

### Real-account verification (VER-04)

- **D-13 — Dedicated Free + Elite test accounts on production, post-activation.** Two purpose-created accounts exercised on production after each staged flag flip. VER-04 and the activation soak become the same evidence, and it proves the real user path rather than a staging approximation. Real user accounts are never touched.
- **D-14 — Evidence schema: `run_id` + merit-ledger delta + redacted screenshot.** For each run capture the `analysis_runs` row id and its terminal state, the merit-ledger delta (proving charged-exactly-once, refunded-on-failure), and a PII-redacted screenshot. Stored under the phase directory and cited from the report. Claims must be machine-verifiable, not prose assertions.
- **D-15 — PII protection is enforced, not intended.** All resume and LinkedIn inputs come from the existing synthetic fixtures in `scripts/test-resumes/`. Add a guard test that scans phase artifacts and fixtures for real-user markers (email addresses, production user UUIDs), modeled on the doc/secret-leak guards Phase 2 already established.

### Final report (VER-05)

- **D-16 — The report covers Phases 1–9 including the inserted 08.1 / 08.2 / 08.3**, and Phase 9 reconciles the roadmap checkbox drift (08.2's five plan checkboxes are unchecked in `ROADMAP.md` despite all five SUMMARY files existing; Phases 1 and 8 are likewise unchecked in the phase list while marked Complete in the progress table). An evidence report that contradicts the roadmap is not evidence.
- **D-17 — All 14 mandated report items are addressed**, each claim backed by test output, database evidence, deployment evidence, or a reproducible manual verification record. The per-phase VERIFICATION / VALIDATION / SECURITY artifacts are the primary source material; fresh runs supply the rest.

### Claude's Discretion

- **Rollback trigger definition** — resolved above as D-04, derived from the lifecycle's own failure taxonomy (`_shared/analysis-error-taxonomy.ts`) and the Phase 3/6 soak precedents.
- **Soak duration per flag flip** and the numeric definition of "green" for the post-flip edge-log check — planner to derive from the Phase 6 live-smoke precedent.
- **Report file location and internal structure** — planner's choice, but it lives under the phase directory and every one of the 14 items is individually addressable.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and roadmap
- `.planning/REQUIREMENTS.md` — VER-01, VER-02, VER-04, VER-05 full text (lines 68–72); traceability table (lines 146–150). VER-03 is already Complete (Phase 4).
- `.planning/ROADMAP.md` §"Phase 9: Final Verification & Milestone Report" — the four success criteria, including the 23-scenario list and the 14 mandated report items.

### Flag posture and lifecycle (D-01..D-04)
- `supabase/functions/_shared/analysis-flags.ts` — the two-level dormancy gate: `ANALYSIS_LIFECYCLE_ENABLED` master switch plus `ANALYSIS_LIFECYCLE_<FEATURE>` per-feature flags; fail-closed exact-lowercase-`'true'` semantics; request-time reads (the fix for the career-compass 95% hang).
- `supabase/functions/_shared/analysis-lifecycle.ts` — the ordered executor whose behavior the activation soak must confirm in production.
- `supabase/functions/_shared/analysis-lifecycle.dormancy.test.ts` — the dormancy static-source guard; activation must not break it.
- `supabase/functions/_shared/analysis-error-taxonomy.ts` — the 13 failure codes that define what a "new error class" means for the D-04 abort criteria.
- `supabase/functions/_shared/merit-gateway.ts` — the `MERIT_SYSTEM_ENABLED` global gate (D-03).
- `src/config/feature-flags.ts` — the frontend `VITE_FEATURE_ANALYSIS_LIFECYCLE` counterpart.

### Gate and testing (D-05..D-08)
- `TESTING-STRATEGY.md` (repo root) — the layered testing model, the `verify:baseline` blocking-gate contract, coverage philosophy, and the quarantine register.
- `package.json` §scripts — the current gate is `verify:baseline = test && test:edge && test:e2e`; `test:edge` currently forces `DENO_TEST_SUPABASE_REMOTE=0`. D-05 and D-06 both change this file.
- `scripts/deploy.ps1` — runs `verify:baseline` as a HARD precondition before `supabase link`; the `-SkipVerify` switch is the precedent for any escape hatch. Keep pure ASCII (Windows PowerShell 5.1 reads these as cp1252).
- `supabase/functions/deno.json` — the `test:ci` task; new guards register here.
- `docs/ENVIRONMENT.md` — the authoritative per-name env matrix (names, not values) for every flag the activation touches.

### Prior-phase evidence (source material for the report, D-16/D-17)
- `.planning/phases/01-cross-origin-error-contract-foundation/01-VERIFICATION.md`
- `.planning/phases/02-security-audit-remediation/02-VERIFICATION.md`, `02-SECURITY.md`, `SECURITY-AUDIT.md`, `SECURITY-RECORD.md`
- `.planning/phases/03-shared-analysis-lifecycle-substrate/03-VERIFICATION.md`
- `.planning/phases/04-feature-migration-a-recruiting-lens-linkedin-grader/04-VERIFICATION.md`
- `.planning/phases/05-feature-migration-b-resume-analysis-onboarding/05-VERIFICATION.md`, `05-VALIDATION.md`
- `.planning/phases/06-feature-migration-c-career-compass/06-VERIFICATION.md`, `06-VALIDATION.md`
- `.planning/phases/07-dashboard-intelligence/07-VERIFICATION.md`, `07-VALIDATION.md`
- `.planning/phases/08-paddle-retirement/08-VERIFICATION.md`, `08-PADDLE-PREVIEW-MIGRATION-EVIDENCE.md`
- `.planning/phases/08.1-update-linkedin-grader-to-score-only-headline-about-experien/08.1-VERIFICATION.md`
- `.planning/phases/08.3-linkedin-grader-rubric-update/08.3-VERIFICATION.md`, `08.3-UAT.md`, `08.3-SECURITY.md`, `08.3-VALIDATION.md`
- **Gap:** `.planning/phases/08.2-.../` has five SUMMARY files but NO verification artifact. The planner must decide whether Phase 9 backfills one or records it as a justified exception in the report.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`scripts/test-resumes/`** — existing synthetic resume fixtures. These are the only permitted inputs for the real-account pass (D-15).
- **Phase 2's doc/secret-leak guards** — the pattern to model the PII guard test on (D-15).
- **`useAnalysisRun` hook + `get-analysis-run-status` endpoint** — the recovery surface the refresh / navigate-away / two-tab scenarios exercise.
- **The Anthropic client seam (`_shared/anthropic.ts`)** — the injection point for provider timeout / rate-limit / invalid-JSON / truncation fault scenarios (D-11).
- **`analysis_runs` table + merit ledger** — the evidence source for D-14; every claim in the report cites rows here.

### Established Patterns
- **Operator-gated waves.** Phases 2, 5, 6, 7, 8 all used operator-gated final waves for anything touching production. Phase 9's activation and real-account passes follow the same pattern — and per standing guidance, operator checkpoints marked `autonomous: false` must PAUSE for a human even though auto-mode is on. Never auto-approve a production flag flip.
- **Fold-in discipline.** Every v5.0 phase folded its new tests into `verify:baseline`. Phase 9 is the phase that finally makes the gate match VER-01's full list.
- **Dormancy fall-through.** Every migrated feature keeps a byte-identical legacy path behind the flag — this is what makes D-04's master-off rollback safe and instant.

### Integration Points
- `package.json` scripts (gate composition) → `scripts/deploy.ps1` (which enforces the gate) → Supabase edge secrets (which carry the flags).
- The new coverage registry test registers in `supabase/functions/deno.json` `test:ci` (or the vitest suite, planner's call) so it runs inside the gate.

</code_context>

<specifics>
## Specific Ideas

- The activation soak and the VER-04 real-account pass are deliberately the **same** activity — flip a feature flag, immediately exercise it with the Free and Elite test accounts, capture `run_id` + merit delta + screenshot, then move to the next feature. This avoids doing the manual work twice and makes the activation evidence and the VER-04 evidence identical artifacts.
- "An evidence report that contradicts the roadmap is not evidence" — the roadmap drift reconciliation is part of the deliverable, not a housekeeping afterthought.

</specifics>

<deferred>
## Deferred Ideas

- **`MERIT_SYSTEM_ENABLED` production activation** — verified ON in staging during Phase 9 (D-03) and reported as activation-readiness evidence, but the production flip is deliberately NOT part of v5.0. It is a global gate across 10+ AI functions and warrants its own milestone-level decision with its own blast-radius analysis.
- **Interview Prep Coach re-enable (IP-RE-01)** — already explicitly out of v5.0 scope; stays gated behind "Coming Soon". Excluded from the VER-02 matrix (D-10).
- **Skills Gap and Compare Jobs scenario coverage** — not lifecycle-migrated, so outside the VER-02 matrix (D-10).
- **v5.x deferrals carried from research** — Elite cross-analysis depth weight tuning, role/job-specific Profile Alignment layer, LinkedIn rubric weight calibration against a labeled profile set, longitudinal trend views. Already on the roadmap backlog; the report's "remaining risks + follow-ups" item should reference them rather than re-litigate them.

</deferred>

---

*Phase: 9-final-verification-milestone-report*
*Context gathered: 2026-07-10*
