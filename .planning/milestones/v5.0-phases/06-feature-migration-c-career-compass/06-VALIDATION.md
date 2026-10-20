---
phase: 6
slug: feature-migration-c-career-compass
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-06
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `06-RESEARCH.md` §"Validation Architecture" + the FEAT-05 / VER-02 scenario matrix.
> Extends (does not replace) the `verify:baseline` gate — a green baseline only proves
> pre-existing behavior; every new Career Compass guard is mandatory (Pitfall 12). Career is a
> **preserve-exactly migration + one repair** (the 180s poll-cap hang), so byte-preserve success
> proofs and new failure/idempotency/recovery guards are equally load-bearing.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Deno (`deno test`) for edge/`_shared`; Vitest for frontend; Playwright for E2E |
| **Config file** | `supabase/functions/deno.json` (`test:ci` allowlist); `vitest.config.*`; `playwright.config.*` |
| **Quick run command** | `npm run test:edge` (offline deno) — the primary gate for this phase's edge guards |
| **Full suite command** | `npm run verify:baseline` (`test` + `test:edge` + `test:e2e`) |
| **Estimated runtime** | deno `test:ci` ~ minutes; full `verify:baseline` longer (E2E secret-gated) |

Existing infrastructure covers all phase requirements — this phase is **code + two flag flips
(`ANALYSIS_LIFECYCLE_CAREER_COMPASS`, `ANALYSIS_LIFECYCLE_ENABLED`) + a live CORS re-proof**. Per
research, **no new DB migration/index/grant is required** — the Phase-3 ledger
(`20260702000001_analysis_lifecycle_ledger.sql`), CAS RPCs, partial-UNIQUE active index, and the
`CHECK(NOT(merit_settled AND refunded))` all already shipped. Advisor floor 15 must not increase.

---

## Sampling Rate

- **After every task commit:** Run `npm run test:edge` (offline deno)
- **After every plan wave:** Run `npm run verify:baseline`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** deno quick run (minutes)

---

## Must-Stay-Green (byte-preserve proof — existing guards)

All existing Career guards in `deno.json test:ci` must stay green (they prove the migration did not
regress currently-valid behavior):
`analyze-career/{index,cache,failure-branches,history-persistence,paid-output-validation,phase22-contract,refund-after-save}.test.ts`,
`submit-career-analysis-job/job-contract.test.ts`,
`process-career-analysis-job/__tests__/refund-on-failure.test.ts`, `_shared/career-shape.test.ts`;
frontend vitest `CareerCompass.phase22.test.ts` + `__tests__/CareerCompass.prior-selectors.test.ts`.

---

## Per-Task Verification Map (new guards — mandatory, mirror Phase 5's guard set)

| Scenario (FEAT-05 / VER-02) | Seam | Test Type | Status |
|---|---|---|---|
| Idempotency: duplicate-click / two tabs → 1 run + 1 deduction; deliberate new run (fresh nonce) → new run | Deno `analyze-career/__tests__/idempotency-repeated-run.test.ts` (model on analyze-resume's) | Deterministic guard | ⬜ pending |
| Pitfall-8 stable identity (resubmit unchanged input → same key; save-mutated field never in key) | Deno idempotency guard | Deterministic guard | ⬜ pending |
| Executor refund boundary (refund only pre-saving; none after `saving→completed`) | Deno `_shared/analysis-lifecycle.refund-boundary.test.ts` (registered) + career-save guard | Deterministic guard | ⬜ pending |
| Validation convergence: valid Free/Pro/Elite → typed success; invalid/truncated/empty/all-zero core → typed `AnalysisErrorCode` (never fabricated) | Deno `analyze-career/__tests__/runtime-validation-convergence.test.ts` | Deterministic guard | ⬜ pending |
| Elite-extras non-fatal: missing/failed `compensationIntelligence` → still valid core (no fail/refund) | Deno validation-convergence guard | Deterministic guard | ⬜ pending |
| Byte-preserve success (Free/Pro/Elite deep-equal flag-ON vs legacy) | Deno `analyze-career/__tests__/byte-preserve.test.ts` | Deterministic guard | ⬜ pending |
| apex+www CORS status matrix (200/401/412) + evil origin fail-closed | Deno `analyze-career/__tests__/cors-matrix.test.ts` | Deterministic guard | ⬜ pending |
| Worker↔executor two-writer reconciliation (flag ON → worker defers status/refund; no double-refund) | Deno worker guard (new; model on streaming-wrapper-ordering) | Deterministic guard | ⬜ pending |
| Input-matrix: resume-only (`allowResumeOnly`) / Free both-priors 412 / Pro-Elite `linkedin_prior_missing` 412 → no charge | Deno gate guard + `submit-career-analysis-job/job-contract.test.ts` | Deterministic guard | ⬜ pending |
| create_or_recover replaces WR-04 (N parallel submits → 1 row) | Deno submit guard (gated-remote twin skip-by-default) | Deterministic (+ gated remote) | ⬜ pending |
| Refresh / navigation recovery; submit-lock; preserve-previous-success; History `?id=` hydration | vitest `CareerCompass.*.test.ts` (run_id recovery + `useAnalysisRun.isActive` lock) | Deterministic (vitest) | ⬜ pending |
| Large-result safety (roleRoadmaps 3×5, careerFields, compensationIntelligence persist + rehydrate intact) | vitest hydration + Deno persist guard | Deterministic guard | ⬜ pending |
| First / second / five-consecutive; provider timeout/rate-limit auto-retry; DB save failure → retryable_failed | Deno failure-branches + `analysis-lifecycle.classifier.test.ts` (exists) | Deterministic guard | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements* — Deno + Vitest + Playwright are all
installed and wired into `verify:baseline`. No framework install needed. New guard suites are
authored during their owning plan's wave and **appended to `supabase/functions/deno.json` `test:ci`**
(Pitfall 12) as they land. `test:adversarial:career` (promptfoo) stays OFF the blocking gate.

---

## Manual-Only Verifications (operator-gated live smokes — `autonomous: false`)

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live apex+www CORS re-proof on prod (incl. 401/412 responses) | FEAT-05 (SC-3 CORS) | Real cross-origin behavior only observable against deployed prod (`strivoai.net` + `www.strivoai.net`) | Curl/browser both origins against `analyze-career` + `submit-career-analysis-job`; confirm ACAO echoes origin, evil origin fail-closed |
| Flag-flip soak + Merit reserve/settle/release/refund on a real account | FEAT-05 (SC-3 settle-on-saved) | Requires real Merit ledger + billing state; not safe to automate | Flip `ANALYSIS_LIFECYCLE_CAREER_COMPASS` on preview first, run a real Career analysis, confirm exactly-once deduction + settle-after-save; force a failure, confirm refund-exactly-once |
| Real Free + Elite account: resume-only + resume+LinkedIn end-to-end (VER-04) | FEAT-05 (SC-1/SC-2) | End-to-end product-correctness across tiers needs live accounts + real priors | Run both tiers through both input states; confirm product-correct output + persistence + History `?id=` round-trip |
| Refresh/navigation recovery on a genuinely slow live run (poll-cap repair proof, D-04) | FEAT-05 (SC-2) | The 180s-hang repair is only provable against a real slow run | Start a slow Career run, refresh mid-run + navigate away/back, confirm `run_id` recovery resumes (no fabricated success, no endless spinner) |

Honor operator checkpoints for any live/DB-touching smoke (MEMORY: honor-operator-checkpoints-over-automode).
Operator-gated preview→prod for any DB/RLS/realtime/grant touch (none expected this phase).

---

## Validation Sign-Off

- [ ] All new-guard tasks have a deterministic `<automated>` verify (or a documented operator-gated live smoke)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] New Deno suites appended to `deno.json` `test:ci` allowlist as they land (Pitfall 12)
- [ ] Existing Career guards stay green (byte-preserve proof)
- [ ] No watch-mode flags
- [ ] `nyquist_compliant: true` set in frontmatter after plan-checker confirms coverage

**Approval:** pending
