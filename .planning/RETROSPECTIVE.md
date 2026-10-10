# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v3.0 — Analysis Persistence, Merit Fixes, Pricing UX & Feature Output Parity

**Shipped:** 2026-06-09
**Phases:** 15 | **Plans:** 79 | **Tasks:** 125

### What Was Built

* Merit economy reliability improvements across Free monthly replenishment, optimistic deductions, refunds, idempotency, and Stripe shop reconciliation.
* Pricing, checkout, billing, and Celebrations UI fixes aligned to Strivo's design system.
* Cross-feature context selectors, LinkedIn auto-pull, history persistence parity, and explicit analysis routing.
* Active feature output/cache parity across Resume Analysis, LinkedIn Grader, Career Compass, and Recruiting Lens.
* Lean-intelligence database foundation across profile context, structured versions, recommendations, applications/outcomes, benchmarks, storage refs, and lifecycle archival.
* Production Interview Prep safety gate plus Phase 51 parser-first document extraction direction.

### What Worked

* Audit-first closure prevented stale Phase 41 and Phase 50 bookkeeping from blocking the product milestone incorrectly.
* Operator smoke attestations paired with validation artifacts gave enough evidence to close manual-only gaps without pretending they were automated.
* Consolidating related feature-output phases into Phase 37 kept the release coherent and easier to verify.

### What Was Inefficient

* Several planning files drifted from implementation reality, especially requirement checkboxes and roadmap progress rows.
* Some quick/debug artifacts lacked closure metadata, which made milestone close noisier than the actual product risk warranted.
* Phase 50 became obsolete quickly after Phase 51 redefined the extraction architecture, leaving historical verification noise.

### Patterns Established

* Deferred requirements should be removed from active traceability and preserved in a future-scope note, not left as failed milestone requirements.
* Retired or replaced phases need explicit historical status in ROADMAP, STATE, audit, and validation artifacts.
* Source-backed manual smoke rows should name the operator attestation date and the exact artifact closed.

### Key Lessons

1. Keep active requirement counts aligned with product scope before running closeout; stale traceability creates false blockers.
2. Archive historical implementation paths as soon as they are replaced to avoid revalidating obsolete architecture.
3. When production safety gates intentionally hide a feature, future re-enable requirements need their own milestone rather than lingering in the current one.

### Cost Observations

* Model mix: not measured in planning artifacts.
* Sessions: multiple long-running GSD sessions across v3.0.
* Notable: Phase 51's parser-first extraction policy is the main cost-control follow-up, reducing unnecessary premium OCR calls while preserving Elite fallback quality.

---

## Milestone: v4.0 — Codebase Hardening

**Shipped:** 2026-06-25
**Phases:** 10 | **Plans:** 53 | **Tasks:** 106

### What Was Built

* A layered testing safety net (vitest + deno + Playwright) with a blocking `verify:baseline` regression gate wired into CI and `deploy.ps1`, anchored at the `v4.0-baseline` tag; deno edge coverage grew 284 → 704.
* Repository hygiene + an evidence-backed cross-domain audit catalog (dead code, deps, env, DB, perf) gated by a first-class KEEP-LIST; dead-code removals and obsolete-path retirements with lint + type-check clean.
* Dependency hygiene: 9 major-version bumps + vuln remediation (npm audit 32 → 20, 0 critical), reproducible lockfiles, each behind a rollback path.
* Environment + runtime reliability: canonical `docs/ENVIRONMENT.md` + fail-closed validation; inline error taxonomy + auth re-throw guards with safe structured logging.
* Database + performance hardening: 15 reversible migrations dropped the security advisor 73 → 15 (RLS least-privilege, EXECUTE revokes, security_invoker views, search_path pins) + Phase-9 perf migrations and behavior-preserving refactors, latency measured no-regression.

### What Worked

* **Safety-net-first + audit-before-action sequencing** — the regression baseline (Phase 1) and the KEEP-LIST (Phase 3) made the destructive phases provably safe: cross-phase integration PASS, 5/5 business-critical flows intact at close.
* **Preview→prod hard gate with operator-applied prod** caught two real bugs before they hit production (a self-aborting `linkedin_grades` verification assertion; a silent-no-op `REVOKE ... FROM anon` that left a blanket `PUBLIC` grant intact).
* **`verify:baseline` as a shared spine** every phase re-ran; the deterministic signal cleanly separated real regressions from AI-call wall-clock noise.
* **"Document-as-gated rather than force"** discipline (DB-03 = 0 removals on low-traffic prod; `usage_tracking` GATED with named blockers) avoided destructive mistakes when disuse signals were unreliable.

### What Was Inefficient

* **The v3.0 traceability-drift lesson recurred** — 17 requirement rows stayed "Pending"/`[ ]` after their phases verified complete; the milestone audit had to reconcile them. The prior lesson was never operationalized into phase-close.
* **Open-register hygiene noise at close** — 5 already-shipped debug sessions still carried non-terminal status, and 13 completed quick-tasks false-positived as "missing" purely from an old `<slug>-SUMMARY.md` filename convention vs the scanner's bare `SUMMARY.md`.
* **Nyquist VALIDATION sign-off lagged** — Phases 04/05 verified but their VALIDATION.md stayed `nyquist_compliant: false` (draft), surfacing as close-time gaps.
* **A flaky frontend test on the baseline spine** (`AnalysisHistory.interviewPrep`) intermittently reddened `verify:baseline` — undermining the very artifact meant to prove zero change.

### Patterns Established

* **Zero-functional-change proof model evolves with the work:** "git diff empty" while phases are non-mutating (1-8), shifting to "behavior preserved despite edits" (verify:baseline green + before/after measurement) once a phase must edit code (Phase 9).
* **KEEP-LIST as a first-class, enumerated gate** every removal phase consults — "gated-but-live is NEVER safe."
* **Every DB change ships forward+rollback and rides a preview→prod gate**, operator-applied to prod, Claude read-only on prod.
* **Conservative dead-code bar:** "safe" only when ≥4 independent signals agree; everything else demoted to needs-investigation.

### Key Lessons

1. Operationalize traceability updates at phase-close — don't defer checkbox/status flips to the milestone audit (this is the second milestone in a row the drift recurred).
2. A flake on the regression spine poisons the whole zero-change proof; quarantine or fix it immediately rather than carrying it across phases.
3. Finalize VALIDATION.md (Nyquist) at execution sign-off, not "later" — a draft-forever validation artifact becomes a close-time gap.
4. Standardize quick-task/debug artifact naming + closure metadata so `audit-open` at close is signal, not noise (naming false-positives cost real triage time).

### Cost Observations

* Model mix: not measured in planning artifacts; heavy use of parallel sub-agent verification (integration checker, per-phase verifiers).
* Sessions: multiple GSD sessions with frequent operator-gated checkpoints (`autonomous: false`) for all DB/prod and risky-dependency work.
* Notable: PERF-04 deliberately measured the deterministic/cache-hit path (p95 76.78 ms) rather than AI-call wall-clock, because AI variance (~35–56 s) swamps the few-ms refactor delta — recorded honestly as "no claimable end-to-end gain within noise" instead of overclaiming.

---

## Milestone: v5.0 — Platform Trust, Reliability & Intelligence

**Shipped:** 2026-07-19
**Phases:** 9 (+3 INSERTED) | **Plans:** 67 | **Tasks:** 132

### What Was Built

* Centralized CORS + error-contract foundation across all 21 active Edge Functions (env-driven `ALLOWED_ORIGINS`, `withCors`/`jsonError`), closing the confirmed `www.strivoai.net` production outage.
* A full 17-domain security audit closing deferred SEC-01..10 plus 4 HIGH money-path/IDOR remediations (Merit idempotency forwarding, refund-after-save across three functions, an analyze-resume IDOR, Paddle webhook replay-window), each locked by a RED→GREEN guard, advisor floor held at 15.
* One shared persistent idempotent Merit-safe 11-state analysis lifecycle (CAS RPCs, settle-on-saved, refund-exactly-once, transient-only retry, strict no-masking validation, error taxonomy, `useAnalysisRun` recovery) wiring the previously-unwired 4-arg idempotent Merit RPC end-to-end; all five AI features migrated onto it in ascending blast radius; Onboarding hang killed; LinkedIn rebuilt to deterministic server-computed evidence-backed scoring.
* Dashboard intelligence (Recruiter First Impression + Profile Alignment) derived only from stored data, with Progress & Achievements deleted and protected areas untouched.
* Paddle fully retired (repo + preview + prod schema/function/env/types) behind a permanent no-live-surface guard.
* A seven-layer `verify:baseline` gate + machine-enforced 125/125 VER-02 coverage registry + production Free+Elite real-account pass + 14-item evidence report.

### What Worked

* **Ship-the-substrate-dormant-then-migrate** — the shared lifecycle landed behind two-level flags with byte-identical legacy fall-through, so every feature migration was reversible and provable before any prod flip. Ascending blast radius (Recruiting Lens + LinkedIn → Resume + Onboarding → Career Compass) meant the executor was battle-tested on the smallest features first.
* **Machine-enforced coverage as an executable work order** — the VER-02 matrix (125 cells, verbatim test-name substring match) turned "are we covered?" into a RED test whose first run *was* the gap list (43 gaps), impossible to hand-wave green.
* **Staged prod flips with soaks + explicit abort criteria** caught real defects live (Career Compass Flip-5 aborted cleanly rather than shipping the Elite mixed-format bug) instead of discovering them from user reports.
* **Honest reporting of deliberate deviations** — Career Compass shipping dormant and `MERIT_SYSTEM_ENABLED` being ON (vs the plan's OFF assumption) are recorded in report item 14 with blast radius and follow-ups, not smoothed over to claim a clean sweep.

### What Was Inefficient

* **The plan's model of production diverged from live prod at multiple points**, and each gap only surfaced at the flip: LinkedIn 500'd on 100% of requests once its flag flipped because `linkedin_grading` was missing from the `analysis_jobs_job_type_check` constraint (a migration the verification phase could only *report*, not apply); the D-04 merit-anomaly abort queries were gated on a `merit_transaction_id` column the lifecycle never writes (so they'd have returned 0 during the soak regardless); and `MERIT_SYSTEM_ENABLED` was assumed OFF on prod but was ON. Flag-gated safety/monitoring machinery was trusted before it was proven to observe the paths it guarded.
* **Live-bug firefighting ran in parallel with the milestone** — several quick tasks + debug sessions (Career Compass tier-downgrade + truncation, LinkedIn first-attempt failure, extract-catchup FK loop) fixed production defects mid-flight, some overlapping the same code the phases were migrating.
* **The traceability-drift lesson recurred for the third straight milestone** — 15 requirement rows were still `[ ]`/`Pending` at 09-04 despite `status: passed` VERIFICATIONs on disk, and had to be reconciled before the report could claim 41/41. The phase-close checkbox discipline still isn't operationalized.
* **A committed real-PII fixture** (`Profile.pdf`, a real LinkedIn export) lived in git since 21925c88 under a comment falsely claiming it wasn't committed — synthetic at HEAD now, but still recoverable from history pending an operator purge.

### Patterns Established

* **Dormant-substrate-behind-flags → ascending-blast-radius migration** as the standard way to roll one shared behavior across many features without a big-bang cutover.
* **Executable coverage matrix** (scenario × feature, test-name-bound) as the authoritative, un-drop-able work order for verification phases.
* **Staged production activation** = ordered flips, ≥30-min soaks, pre-declared abort criteria, real-account evidence with run_id + merit-delta + redacted screenshots.
* **Record deliberate operational deviations in the milestone report** (dormant feature, flag state) as first-class evidence items, never as silent omissions.

### Key Lessons

1. Before a prod soak relies on a flag-gated abort/monitoring query, prove it actually observes the path it guards — a query keyed on a column the new code never writes is invisible, not safe.
2. Migrate the DB constraint (e.g. `job_type` allow-list) *before* flipping a feature that writes a new value; a verification phase reports the gap but cannot patch it, so the block lands at the worst time (flip day).
3. Verify plan assumptions about live prod flag/state at sign-off, not from the plan text — `MERIT_SYSTEM_ENABLED` was ON when the plan assumed OFF, changing the blast radius of every flip.
4. Operationalize traceability flips at phase-close — this is now three milestones (v3.0, v4.0, v5.0) where the drift had to be reconciled at audit time.
5. Standardize + verify test-fixture provenance (no real PII) at commit time; a false "not committed" comment is worse than none because it suppresses the very check that would catch it.

### Cost Observations

* Model mix: not measured in planning artifacts; heavy parallel sub-agent use (per-phase verifiers, integration checker, coverage/eval auditors) plus operator-gated live checkpoints throughout.
* Sessions: many GSD sessions across ~24 days, with `autonomous: false` operator gates on every prod flip, DB migration, and money-path change.
* Notable: the seven-layer `verify:baseline` wall-clock was measured at 393.6s (6m33s) and the cost was **accepted rather than mitigated** by dropping a lane — the remote-DB and Playwright layers were judged worth the minutes.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v2.0 | multiple | 10-27 | Monetization and Merit system established. |
| v3.0 | multiple | 28-51 | Audit-driven closure, deferred-scope reconciliation, and active-flow verification became the closeout standard. |
| v4.0 | multiple | 1-9 (reset) | Brownfield hardening under a zero-functional-change constraint; safety-net-first + audit-before-action sequencing; `verify:baseline` as the regression spine; preview→prod operator-gated DB migrations. |
| v5.0 | multiple | 1-9 (reset, +3 INSERTED) | Trust/reliability milestone: dormant shared substrate → ascending-blast-radius feature migration; executable coverage matrix as the verification work order; staged operator-gated production flips with soaks + abort criteria; deliberate operational deviations reported honestly (dormant Career Compass, `MERIT_SYSTEM_ENABLED` ON). |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v3.0 | Focused Vitest, Deno, route smoke, UAT, and operator smoke evidence | 127/127 active requirements passed by audit | Not tracked |
| v4.0 | vitest 457 / deno 704 / Playwright 5+1 skip + promptfoo adversarial; blocking `verify:baseline` gate | 42/42 requirements satisfied; security advisor 73→15; integration PASS (5/5 flows) | Net-negative (4 unused deps removed, 0 added) |
| v5.0 | seven-layer `verify:baseline` (lint, type-check, vitest, offline-deno, remote-DB, Playwright, build); machine-enforced 125/125 VER-02 coverage registry; production Free+Elite real-account pass + PII guard | 41/41 requirements satisfied; 4 HIGH security remediations; advisor floor held at 15; Paddle fully retired | No new infra/SDKs (hard constraint); Paddle surface removed |

### Top Lessons

1. Active traceability must reflect current product scope, not historical intent.
2. Manual smoke evidence is acceptable only when dated, scoped, and tied to a validation artifact.
3. Replaced architecture should be marked historical immediately to avoid future validation churn.
4. A regression baseline is only as trustworthy as its flakiest test — quarantine or fix flakes on the spine before they erode confidence in the zero-change proof.
5. Reconcile traceability checkboxes at phase-close, not at milestone-audit time — the drift recurred across v3.0, v4.0, **and v5.0** (three in a row — operationalize it).
6. Prove flag-gated abort/monitoring queries actually observe the paths they guard before trusting them in a production soak, and migrate DB constraints before flipping a feature that writes a new value.
7. Verify plan assumptions about live production flag/state at sign-off (not from the plan text), and record deliberate operational deviations in the milestone report as first-class evidence.
