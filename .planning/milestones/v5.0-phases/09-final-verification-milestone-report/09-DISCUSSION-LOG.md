# Phase 9: Final Verification & Milestone Report - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-10
**Phase:** 9-final-verification-milestone-report
**Areas discussed:** Flag posture under test, Gate composition (VER-01), Scenario matrix (VER-02), Real-account evidence (VER-04)

---

## Flag posture under test

### Q1 — Does Phase 9 activate the lifecycle on production?

| Option | Description | Selected |
|--------|-------------|----------|
| Activate prod in Phase 9 | Verify staging-ON, then flip master + five feature flags on prod behind an operator gate, with soak + rollback | ✓ |
| Staging-ON only; defer prod | Fully verify staging, verify prod dormant, document activation as a post-milestone follow-up | |
| Verify both postures, decide after | Run the matrix against staging-ON and prod-dormant, decide activation separately | |

**User's choice:** Activate prod in Phase 9.
**Notes:** Rationale accepted — the milestone's value only reaches users if production actually runs the lifecycle. Production currently runs legacy paths (all lifecycle flags default OFF; Phase 6 shipped dormant).

### Q2 — How should the flags be flipped?

| Option | Description | Selected |
|--------|-------------|----------|
| Staged, ascending blast radius | Master ON, then recruiting_lens → linkedin → onboarding → resume → career_compass, soak between each | ✓ |
| All five at once, single soak | Faster, but regressions are harder to attribute to a feature | |
| N/A — not activating prod | — | |

**User's choice:** Staged, ascending blast radius.
**Notes:** Mirrors the design intent of the two-level gate in `analysis-flags.ts`.

### Q3 — Is `MERIT_SYSTEM_ENABLED` in scope?

| Option | Description | Selected |
|--------|-------------|----------|
| Out of scope — stays false | Verify merit behavior through the existing path; leave the global gate alone | |
| In scope — verify with it ON in staging | Prove the submit-time deduction path in staging; prod stays false; report as activation-readiness | ✓ |
| In scope — activate on prod too | Widens blast radius well beyond the four VER requirements | |

**User's choice:** In scope — verify ON in staging only.
**Notes:** Production stays `false`. Context: it is a GLOBAL gate across 10+ AI functions; setting it true on prod during Phase 6 flipped platform-wide behavior and was reverted.

### Q4 — Abort/rollback trigger for production activation?

| Option | Description | Selected |
|--------|-------------|----------|
| Any merit or hang anomaly | Master-off abort on double-charge, missing refund, stuck run, new error class, or user-visible regression | |
| Error-rate threshold only | Numeric threshold from staging baselines | |
| You decide | Planner derives criteria from the failure taxonomy and Phase 3/6 soak precedents | ✓ |

**User's choice:** You decide.
**Notes:** Resolved as D-04 in CONTEXT.md — effectively the first option, derived from `analysis-error-taxonomy.ts` and the Phase 3/6 precedents.

---

## Gate composition (VER-01)

### Q1 — How do lint / type-check / build enter the gate?

| Option | Description | Selected |
|--------|-------------|----------|
| Extend `verify:baseline` | Fold them directly into the gate; strengthens the deploy.ps1 precondition | ✓ |
| New `verify:milestone` superset | Keep the deploy gate fast; run the stronger checks once for evidence | |
| Both | Extend the baseline AND add a milestone superset | |

**User's choice:** Extend `verify:baseline`.

### Q2 — How to satisfy the database-test requirement given the offline Deno lane?

| Option | Description | Selected |
|--------|-------------|----------|
| Remote lane against preview, off the blocking gate | Operator-gated evidence run; keeps the gate hermetic and fast | |
| Fold the remote lane into the blocking gate | Strongest guarantee; every deploy depends on preview Supabase being reachable | ✓ |
| Count migrations + RLS advisors as the DB evidence | No new test lane | |

**User's choice:** Fold the remote lane into the blocking gate.
**Notes:** Flagged back to the user during discussion — this makes every deploy depend on the preview project (`cimjltzovkahkqecpwgi`), which was paused for all of v4.0. Captured in CONTEXT.md D-06 as a hard constraint: the gate must fail loudly, never silently skip or auto-degrade to the offline lane.

### Q3 — Role of the promptfoo adversarial suites?

| Option | Description | Selected |
|--------|-------------|----------|
| Run once as evidence, stay off the gate | Capture as security/AI-exposure evidence; they cost real API calls and are non-deterministic | ✓ |
| Skip them entirely | Rely on the Phase 2 security record | |
| Fold them into the gate | Highest assurance; makes every deploy cost money | |

**User's choice:** Run once as evidence, stay off the gate.

### Q4 — What counts as deployment validation?

| Option | Description | Selected |
|--------|-------------|----------|
| Real staged deploy + post-deploy smoke | `deploy.ps1 -Env staging`, then CORS re-proof + one live analysis per feature + edge-log check; same against prod during activation | ✓ |
| Deploy-script dry run only | Prove the path without shipping | |
| You decide | — | |

**User's choice:** Real staged deploy + post-deploy smoke.
**Notes:** The deploy is the activation vehicle, not a separate ceremony.

---

## Scenario matrix (VER-02)

### Q1 — How should the coverage be built?

| Option | Description | Selected |
|--------|-------------|----------|
| Audit-first, close only real gaps | Map 23 scenarios × feature against existing tests; write only genuinely uncovered cells | ✓ |
| New consolidated cross-feature suite | Purpose-built suite regardless of existing coverage; duplicates a lot | |
| Audit-first + one consolidated driver | Both | |

**User's choice:** Audit-first, close only real gaps.

### Q2 — Which features are in the matrix?

| Option | Description | Selected |
|--------|-------------|----------|
| The five migrated features | Resume, Onboarding, LinkedIn, Recruiting Lens, Career Compass | ✓ |
| Five migrated + Dashboard Intelligence | Dashboard makes no AI calls on load; most scenarios don't apply | |
| Every AI feature in the repo | Includes Skills Gap, Compare Jobs, Interview Prep — beyond the migration's reach | |

**User's choice:** The five migrated features.

### Q3 — How to handle hard-to-automate scenarios?

| Option | Description | Selected |
|--------|-------------|----------|
| Automate what is faultable, justify the rest | Fault-inject at the Anthropic seam; two-tab via Playwright contexts; explicit waivers for the remainder | ✓ |
| Close every cell, no exceptions | All 23 × 5 cells automated however awkward | |
| Automate the cheap cells, manual-verify the rest | Reproducible manual record for the awkward ones | |

**User's choice:** Automate what is faultable, justify the rest.
**Notes:** No silent gaps — anything not automated carries an explicit justified waiver.

### Q4 — Machine-enforced or a document?

| Option | Description | Selected |
|--------|-------------|----------|
| Machine-checked registry in the gate | Registry test fails if a cell has neither a mapped test nor a justified waiver | ✓ |
| Markdown traceability doc | Drifts the moment a test is renamed | |
| You decide | — | |

**User's choice:** Machine-checked registry in the gate.

---

## Real-account evidence (VER-04)

### Q1 — Which accounts, which environment?

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated test accounts on prod, post-activation | VER-04 and the activation soak become the same evidence; proves the real user path | ✓ |
| Dedicated test accounts on staging only | Prod activation soak becomes separate, lighter evidence | |
| Both — staging rehearsal then prod | Most thorough; roughly double the manual effort | |

**User's choice:** Dedicated test accounts on prod, post-activation.

### Q2 — Evidence capture format?

| Option | Description | Selected |
|--------|-------------|----------|
| `run_id` + merit ledger + redacted screenshots | Machine-verifiable claims: run row + terminal state, merit delta, PII-redacted screenshot | ✓ |
| Database evidence only, no screenshots | Avoids redaction risk; loses visual proof of correct render | |
| You decide | — | |

**User's choice:** `run_id` + merit ledger + redacted screenshots.

### Q3 — How is the no-real-user-data rule enforced?

| Option | Description | Selected |
|--------|-------------|----------|
| Synthetic inputs only + a repo guard | Fixtures from `scripts/test-resumes/`; guard test scans artifacts for real-user markers | ✓ |
| Synthetic inputs + manual review checklist | No automated guard | |
| You decide | — | |

**User's choice:** Synthetic inputs only + a repo guard.
**Notes:** Modeled on the doc/secret-leak guards Phase 2 established.

### Q4 — Does the report reconcile the inserted phases and roadmap drift?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — reconcile drift, cover all phases | Report covers 1–9 incl. 08.1/08.2/08.3; Phase 9 fixes the roadmap checkbox drift | ✓ |
| Cover inserted phases, leave drift to milestone audit | — | |
| Only the 9 planned phases | Treat inserted work as out-of-band | |

**User's choice:** Yes — reconcile drift, cover all phases.
**Notes:** Drift found during scouting: 08.2's five plan checkboxes are unchecked in ROADMAP.md despite all five SUMMARY files existing; Phases 1 and 8 are unchecked in the phase list while marked Complete in the progress table. Also noted: 08.2 has no VERIFICATION artifact at all.

---

## Claude's Discretion

- Abort/rollback trigger definition for the production activation (Q4 of flag posture) — resolved as CONTEXT.md D-04.
- Soak duration per flag flip and the numeric definition of "green" for the post-flip edge-log check.
- Final report file location and internal structure (constrained: lives under the phase dir, all 14 mandated items individually addressable).

## Deferred Ideas

- `MERIT_SYSTEM_ENABLED` production activation — staging-verified in Phase 9, but the prod flip is its own milestone-level decision.
- Interview Prep Coach re-enable (IP-RE-01) — already out of v5.0 scope.
- Skills Gap and Compare Jobs scenario coverage — not lifecycle-migrated, outside the VER-02 matrix.
- v5.x research deferrals (Elite cross-analysis depth tuning, role-specific Profile Alignment, LinkedIn rubric calibration against a labeled set, longitudinal trends) — already on the roadmap backlog; the report references them under "remaining risks + follow-ups".
