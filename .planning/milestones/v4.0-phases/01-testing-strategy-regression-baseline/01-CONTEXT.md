# Phase 1: Testing Strategy & Regression Baseline - Context

**Gathered:** 2026-06-09
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase stands up the **testing & regression safety net** for the v4.0 Codebase Hardening milestone — the spine every later cleanup/refactor phase re-runs to prove **zero functional change**. It delivers:

1. A documented layered testing-strategy doc (unit / integration / contract / E2E split, ownership, coverage targets) across the existing vitest / deno / promptfoo layers (TEST-01).
2. Playwright installed + green for the 3 critical browser flows: **auth/session persistence, resume analysis end-to-end, Stripe checkout (test mode)** (TEST-04).
3. A deterministic frontend vitest suite — the flaky `OutcomeOverdueBanner` mock gap fixed (TEST-02).
4. A captured, re-runnable regression baseline that reports pass/fail (TEST-06) and retained/extended promptfoo adversarial coverage (TEST-07).
5. A documented, runnable "verify zero functional change before merge" gate (NFR-01).

**NOT in this phase:** No product behavior changes (hard milestone constraint). Deep edge-function/edge-case/tier-gating coverage expansion and full CI/deploy-gating wiring are **Phase 5** (TEST-03/05/08). No dead-code removal, dependency bumps, env changes, or DB work (later phases). This phase only builds the net and the gate.

</domain>

<decisions>
## Implementation Decisions

### Regression Baseline Form (TEST-06 / NFR-01 — the spine)
- **D-01:** The regression baseline **IS the full test suite passing green at a tagged pre-cleanup commit** (proposed tag: `v4.0-baseline`) — vitest + deno + promptfoo + Playwright. Later phases re-run the suite; any *new* red is a regression. Chosen over golden-master output snapshots (too brittle vs. non-deterministic AI text/timestamps) and over standalone contract/shape assertions (those are welcome as test content but not the baseline mechanism itself).
- **D-02:** **AI calls are stubbed at the boundary** with recorded fixtures — the baseline and E2E never call real Claude. Behavior under test = our own parse / merge / JSON-repair / tier-gating / routing / persistence logic, not Anthropic's wording. Rationale: deterministic, $0 to re-run on every phase, no overload/timeout flakiness. (Real-AI validation is intentionally NOT part of the per-phase gate.)

### Playwright E2E Boundary (TEST-04)
- **D-03:** Playwright drives a **local dev/preview build** (e.g. `vite preview` on localhost:8080), not staging. Chosen for determinism, $0 cost, offline/CI-friendliness, and because it must run green on *every* cleanup phase. (Staging runs were considered and rejected as the per-phase gate; a staging smoke is not required by this phase.)
- **D-04:** External-dependency realism for the non-AI flows: **real Supabase test project** (genuine login, session refresh, persistence) + **real Stripe test mode** (test keys + test cards like `4242…`). Only **Anthropic is stubbed**. Rationale: the entire point of the auth + checkout flows is to prove that plumbing actually works end-to-end; mocking it would test only the UI shell.

### Coverage Targets & Merge-Gate Strictness (TEST-01 / NFR-01)
- **D-05:** Coverage philosophy = **critical-path-required, global advisory**. REQUIRED (must stay covered + green): the 3 E2E flows + merit/tier-gating + auth + per-feature analyze contracts. Global line/branch % is **tracked and reported, not a hard blocker**. Chosen over hard numeric thresholds (would force low-value tests on a large brownfield suite and could stall cleanup phases) and over pure-advisory (lets coverage silently erode during cleanup).
- **D-06:** The zero-functional-change merge gate (NFR-01) is **BLOCKING**: a red baseline re-run means the cleanup/refactor change does NOT merge until it's green or the diff is explicitly justified. The gate must have teeth.
- **D-07:** **Flaky tests are quarantined, never used to weaken the gate.** This makes the TEST-02 `OutcomeOverdueBanner` fix a hard prerequisite — a blocking gate is only trustworthy once the suite is deterministic. A documented quarantine mechanism handles any residual flakiness without bypassing the gate. (Supersedes the earlier interim guidance to "not block GSD regression gates on the OutcomeOverdueBanner flakiness" — that flakiness is now fixed at the source in this phase.)

### CI Wiring Scope (Phase 1 ↔ Phase 5 boundary)
- **D-08:** Phase 1 **pulls part of TEST-08 forward**: it ships BOTH (a) a single runnable wrapper command/script (e.g. `npm run verify:baseline`) that runs the whole gate on demand locally, AND (b) a **blocking GitHub Action PR gate** so cleanup PRs in Phases 2–4 are auto-checked. Phase 5 (TEST-08) still owns the *full* CI/deploy-gating buildout (full suite wiring, deploy gating where feasible) — Phase 1 establishes the gate, Phase 5 extends it. This is a scope pull-forward, not a new capability.
- **D-09:** **Per-PR gate composition:** every PR runs **vitest + deno + Playwright** (3 flows, stubbed AI, using `SUPABASE_TEST_*` / `STRIPE_TEST_*` secrets stored in GitHub). **promptfoo adversarial runs scheduled or via a label — NOT on every PR** — because it calls real Anthropic and incurs per-run cost. Balances safety vs. CI cost/noise.

### Claude's Discretion
- Exact baseline tag name, the wrapper script name/shape, the Playwright project/dir layout, fixture-recording mechanism, and the GitHub Action YAML structure are left to research + planning, consistent with the decisions above.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements (locked)
- `.planning/ROADMAP.md` §"Phase 1: Testing Strategy & Regression Baseline" — phase goal, depends-on, 5 success criteria.
- `.planning/REQUIREMENTS.md` §"Production-Ready Testing Model (TEST)" + §"Cross-Cutting Guardrails (NFR)" — TEST-01, TEST-02, TEST-04, TEST-06, TEST-07, NFR-01 (this phase's requirements) and the governing zero-functional-change constraint.
- `.planning/PROJECT.md` §"Current Milestone: v4.0" — milestone goal, hard constraint (zero functional change), git scope, risk appetite.
- `.planning/STATE.md` §"Accumulated Context" / "Carried-Forward Cleanup Targets" — note that gated-but-live surfaces (Interview Prep behind `VITE_FEATURE_INTERVIEW_PREP`) must NOT be treated as dead by later phases; relevant context for what the baseline must keep green.

### Existing test infrastructure (the layers this phase documents + extends)
- `vitest.config.ts` — root vitest config (jsdom, `setupFiles: ./src/test-setup.ts`, globals; includes `src/**/*.test.{ts,tsx}` + `supabase/functions/_shared/__tests__/*.test.ts`; excludes 5 deno-only files).
- `src/test-setup.ts` — vitest/jsdom setup.
- `scripts/run-edge-tests.ps1` — Deno edge-function test runner (PowerShell; ~100 deno test files across `supabase/functions/`).
- `supabase/functions/interview-prep-analyze/__tests__/fixtures/injection/promptfooconfig.yaml` — existing promptfoo adversarial config (`npm run test:adversarial`); the TEST-07 surface to retain/extend.
- `package.json` scripts — `test` (`vitest run`), `test:watch`, `test:adversarial` (promptfoo). Note: `@playwright/test` is NOT yet a dependency; `playwright` CLI/browsers available via the `playwright-cli` skill.
- `.github/workflows/vercel-preview.yml`, `.github/workflows/vercel-production-manual.yml` — existing CI (deploy only, no test gating); the integration point the new PR-gate workflow sits alongside.

### ⚠ Stale map — verify before trusting
- `.planning/codebase/TESTING.md` (dated 2026-04-11) is **badly out of date** — it claims "no frontend test framework" and "zero tests in src/". Reality: ~85 frontend vitest files + ~100 deno edge-function tests + a promptfoo config already exist. Treat it as historical, not current. (Other `.planning/codebase/*.md` maps may also predate recent work.)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **vitest harness** (`vitest.config.ts` + `src/test-setup.ts`): already wired for React + jsdom + `@` alias. New FE/critical-path tests extend this, no new runner needed.
- **~85 frontend `*.test.tsx/.test.ts` files** under `src/` (components, hooks, pages) — substantial existing coverage of merit/tier/pricing/career-compass/interview-prep surfaces to build the baseline on, not start from scratch.
- **~100 deno edge-function tests** under `supabase/functions/` (`_shared/`, per-feature `__tests__/`, `_tests/`) — already cover auth, cors, merit-gateway, tier-config, cache, history-persistence, refund-on-failure, etc.
- **promptfoo injection config** (`supabase/functions/interview-prep-analyze/__tests__/fixtures/injection/promptfooconfig.yaml`) — extend for TEST-07.
- **Anthropic client boundary** (`supabase/functions/_shared/anthropic.ts`) — the natural seam for the D-02 AI-stub.

### Established Patterns
- Deno tests use console-capture + direct `new Request()` construction; pure-utility focus, no external service mocks (per existing `_shared/*.test.ts`).
- Fallible ops use discriminated unions (`{ ok: true … } | { ok: false; error }`); structured logging via `_shared/logger.ts`; `requireAuth`/`requireInternalOrUserAuth` guard every endpoint — tests should assert these contracts.

### Integration Points
- **New Playwright surface:** no `playwright.config.ts` or `e2e/` dir exists — this is greenfield. Targets local `vite preview` (D-03).
- **New GitHub Action:** sits alongside the two existing Vercel workflows; needs `SUPABASE_TEST_*` / `STRIPE_TEST_*` repo secrets (D-09).
- **Wrapper command:** new `verify:baseline`-style npm script orchestrating vitest + deno + Playwright (+ promptfoo on schedule/label) (D-08).

</code_context>

## Open Questions for Research

The planner should treat these as research targets, not user decisions:

- **AI-stub mechanism (D-02):** how to stub Anthropic at the boundary when edge functions run against a real Supabase test project — options: a `TEST_MODE` env in the edge functions returning recorded fixtures, running `supabase functions serve` locally, or Playwright network interception. Pick the approach that keeps the 3 flows deterministic while exercising the real Supabase/Stripe path.
- **Cross-platform deno tests in CI (D-09):** the deno suite currently runs via `scripts/run-edge-tests.ps1` (PowerShell); GitHub runners are Linux. Need a cross-platform `deno test` invocation (and confirm which deno-only files the vitest exclude-list maps to).
- **Flaky-test quarantine (D-07):** mechanism for fixing `OutcomeOverdueBanner` (`src/components/applications/OutcomeOverdueBanner.tsx`, surfaced via `src/pages/Dashboard.tsx`) and a documented quarantine pattern for any residual flakiness so the blocking gate stays trustworthy.
- **Playwright auth/session/checkout fixtures:** how to seed a Supabase test-project user + Stripe test-mode customer reproducibly for the 3 flows.

<specifics>
## Specific Ideas

- Proposed baseline anchor: a git tag (e.g. `v4.0-baseline`) at the pre-cleanup commit so any phase can `git checkout`-compare and re-run.
- Stripe checkout E2E uses the standard test card `4242 4242 4242 4242` against real test-mode keys.
- The wrapper command should be the single thing an operator/CI runs to "verify zero functional change" — one command, whole gate.

</specifics>

<deferred>
## Deferred Ideas

- **Full CI/deploy-gating buildout + deep coverage expansion** → Phase 5 (TEST-03/05/08). Phase 1 establishes the PR gate; Phase 5 extends it.
- **Real-AI smoke run** (validating the live Anthropic path) — explicitly excluded from the per-phase gate (D-02); could be a separate manual/scheduled run if ever wanted, but not in this phase.
- **Performance before/after measurement** (`scripts/validate-performance.mjs`) → Phase 9 (PERF-04), not part of the regression-correctness baseline.

None of the above is scope creep — discussion stayed within Phase 1's testing-net boundary.

</deferred>

---

*Phase: 1-testing-strategy-regression-baseline*
*Context gathered: 2026-06-09*
