---
phase: 5
slug: feature-migration-b-resume-analysis-onboarding
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-05
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `05-RESEARCH.md` §"Validation Architecture" + §"Test / Verification Surface".
> Extends (does not replace) the v4.0 `verify:baseline` gate — a green baseline only proves
> pre-existing behavior; every new FEAT-01/FEAT-02 guard is mandatory (Pitfall 12).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Deno (`deno test`) for edge/`_shared`; Vitest for frontend; Playwright for E2E |
| **Config file** | `supabase/functions/deno.json` (`test:ci` allowlist); `vitest.config.*`; `playwright.config.*` |
| **Quick run command** | `npm run test:edge` (offline deno) — the primary gate for this phase's edge guards |
| **Full suite command** | `npm run verify:baseline` (`test` + `test:edge` + `test:e2e`) |
| **Estimated runtime** | deno `test:ci` ~ minutes; full `verify:baseline` longer (E2E secret-gated) |

Existing infrastructure covers all phase requirements — this phase is **code + two flag flips + a
live CORS re-proof** (no new framework, no new DB migration; the Phase-3 ledger + CAS RPCs +
partial-UNIQUE active index are feature-agnostic and already shipped/verified on prod).

---

## Sampling Rate

- **After every task commit:** Run `npm run test:edge` (offline deno — the new FEAT-01/FEAT-02 guards live here).
- **After every plan wave:** Run `npm run verify:baseline` (deno + vitest + Playwright).
- **Before `/gsd:verify-work`:** Full `verify:baseline` green (Playwright leg is E2E-secret-gated — pre-existing deferred P03-E2E-SECRETS, not a regression).
- **Max feedback latency:** offline deno gate on each commit; full suite per wave.

---

## Per-Task Verification Map

> Seeded from the research's provable axes. The concrete `{N}-{plan}-{task}` rows are populated by
> the planner/executor once PLAN.md tasks exist; each task must map to one axis + guard below.

| Axis (→ Success Criterion) | Requirement | Threat Ref | Secure/Correct Behavior | Test Type | Automated Command | Deterministic |
|----------------------------|-------------|------------|--------------------------|-----------|-------------------|---------------|
| Onboarding hang resolved (SC-1) | FEAT-01 | — | Upload→signedURL→resumes-insert→extraction order preserved; slow run persisted + recovered on refresh/nav; genuine failure → specific terminal state; no dup analyses/charges | integration + unit | `npm run test:edge` (+ vitest `useAnalysisRun`) | offline (identity/order) + live (recovery) |
| Free-tier correctness (D-07) | FEAT-01 | — | FREE_MODEL Haiku 4.5, getTimeout('free')=50s, FREE_SINGLE_CALL_MAX_TOKENS=5000, single-call + quality-floor retry, analyze-resume endpoint | unit (static) | `npm run test:edge` | offline |
| Preserve-exactly (SC-2) | FEAT-02 | — | Free/Pro/Elite SUCCESS output byte-identical; SSE partial-render + progress stages unchanged; triple-write targets unchanged | unit (byte-preserve golden fixtures) | `npm run test:edge` | offline |
| Streaming persistent record, no latency regression (D-01) | FEAT-02 | — | run row at stream start; reserve-with-key before first byte; settle-on-saved; mid-stream overload → retryable_failed | unit (ordering) + live latency smoke | `npm run test:edge` (+ staging first-byte delta) | offline (ordering) + live (latency) |
| Idempotency / exactly-once (D-03 / LIFE-05) | FEAT-01, FEAT-02 | T-05-IDEMP | same-attempt (stream vs worker) → same key → 1 charge/run/History; deliberate re-run → new key; N-parallel → 1 | unit + concurrency | `npm run test:edge` | offline |
| No-masking validation (D-10 / LIFE-07) | FEAT-02 | — | invalid/truncated/empty → typed terminal + refund; currently-valid success never rejected | unit (fail + byte-preserve pass) | `npm run test:edge` | offline |
| Merit safety (LIFE-04) | FEAT-01, FEAT-02 | T-05-MERIT | refund exactly once pre-saving; settle only on durable save; `NOT(merit_settled AND refunded)` | unit (refund-boundary) | `npm run test:edge` | offline |
| Duplicate-submission disabled (D-11) | FEAT-02 | T-05-DUP | partial-UNIQUE active index → 1 run; frontend submit-lock | unit + vitest | `npm run test:edge` (+ vitest) | offline |
| CORS apex+www (D-12 / CORS-02) | FEAT-02 | T-05-CORS | apex+www succeed on analyze-resume; preflight + failure headers correct; unapproved fail-closed | unit (matrix) + live prod re-proof | `npm run test:edge` (+ live curl) | offline + live |

*Status legend: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements — deno `test:ci`, vitest, and Playwright are
  already wired into `verify:baseline`. No framework install needed.
- New deno guard files (mirroring Phase-4 `grade-linkedin/__tests__/*` + `recruiting-lens/__tests__/*`)
  are created by the plan tasks and registered in `supabase/functions/deno.json` `test:ci`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Refresh-during-analysis + navigate-away-and-return recovers the live run | FEAT-01 | Needs realtime + a real in-flight run (preview `cimjltzovkahkqecpwgi` unpaused) | Start an onboarding/resume analysis, refresh + navigate away/back; the run re-attaches and the delayed result displays. **Operator smoke — `autonomous:false`, do not auto-approve.** |
| Provider timeout / rate-limit → `retryable_failed` + Retry offered | FEAT-01, FEAT-02 | Requires provider fault injection | Force a 429/timeout; assert the run rests in `retryable_failed` and the UI offers Retry (not a silent hang). |
| Live apex+www CORS re-proof on production (`zjpjapgraoxdukdvpjes`) | FEAT-02 / CORS-02 | Live prod read-only check (D-12) | OPTIONS + no-auth POST for `strivoai.net` and `www.strivoai.net` echo ACAO + `Vary`; `evil.example.com` fail-closed. Read-only, no migration. |
| First-byte latency no-regression on the streaming wrapper | FEAT-02 / D-01 | Requires staging measurement (Open Q4) | Compare pre/post first-byte delta on staging; the ~5 pre-first-byte RPCs must not materially regress latency. |
| Flag-flip soak (Onboarding first, then Resume) | FEAT-01, FEAT-02 | Operator-gated staged rollout | Deploy dormant; flip `ANALYSIS_LIFECYCLE_ONBOARDING` (+ master + VITE flag), soak; then `ANALYSIS_LIFECYCLE_RESUME`. Redeploy/restart required (module-scope cold-start flag reads). |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency acceptable (offline deno gate per commit)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
