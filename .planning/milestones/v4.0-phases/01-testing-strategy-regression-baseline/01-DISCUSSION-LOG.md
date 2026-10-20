# Phase 1: Testing Strategy & Regression Baseline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-09
**Phase:** 1-testing-strategy-regression-baseline
**Areas discussed:** Baseline form, E2E boundary, Coverage & gate, CI wiring scope

---

## Baseline form

### Q1 — What should the regression baseline fundamentally BE?

| Option | Description | Selected |
|--------|-------------|----------|
| Green suite at a tag | Full vitest + deno + promptfoo + Playwright suite passing at a tagged pre-cleanup commit; re-run later, new red = regression | ✓ |
| Golden-master snapshots | Freeze actual feature outputs (API JSON, DOM, AI responses), diff byte-for-byte; brittle vs. non-deterministic AI | |
| Contract/shape assertions | Assert observable contracts only (status codes, schema shape, tier-gating, routing) | |

**User's choice:** Green suite at a tag.
**Notes:** Cheapest, most maintainable, fits the existing ~185-file suite; behavior asserted by the tests themselves.

### Q2 — How should the baseline treat live AI calls?

| Option | Description | Selected |
|--------|-------------|----------|
| Stub AI at the boundary | Mock Anthropic with recorded fixtures; deterministic, $0, re-runnable; tests our parse/merge/gate/route logic | ✓ |
| Assert shape only on real calls | Hit real Claude, assert structural contracts with tolerance; slower, costs money, can flake | |
| Hybrid: stub for regression, real in a separate smoke | Stubbed gate + separate manual real-AI smoke | |

**User's choice:** Stub AI at the boundary.
**Notes:** Behavior under test = our logic, not Anthropic wording. Real-AI validation intentionally excluded from the per-phase gate.

---

## E2E boundary

### Q1 — Where should the 3 Playwright flows run?

| Option | Description | Selected |
|--------|-------------|----------|
| Local dev + stubbed backend | Drive localhost (vite preview); deterministic, $0, CI-friendly; best for a per-phase gate | ✓ |
| Against staging | Hit deployed staging; most production-like but slow, network-dependent, drift-prone | |
| Split: local gate + staging smoke | Local gate + separate manual staging smoke | |

**User's choice:** Local dev + stubbed backend.

### Q2 — How real should the non-AI external deps be?

| Option | Description | Selected |
|--------|-------------|----------|
| Real Supabase test project + real Stripe test mode | Real login/session/refresh + Stripe test cards; only Anthropic stubbed | ✓ |
| Mock everything external | Stub Supabase + Stripe too; fastest but proves only the UI shell | |

**User's choice:** Real Supabase test project + real Stripe test mode.
**Notes:** The point of the auth + checkout flows is proving the plumbing works; only Anthropic is stubbed.

---

## Coverage & gate

### Q1 — Coverage-target philosophy (TEST-01)?

| Option | Description | Selected |
|--------|-------------|----------|
| Critical-path-required, global advisory | Named critical surfaces required+green; global % tracked but not blocking | ✓ |
| Hard numeric thresholds | Global coverage floor enforced as merge blocker; risks low-value tests on brownfield | |
| Pure advisory | Track/report only; nothing blocks; coverage can erode | |

**User's choice:** Critical-path-required, global advisory.
**Notes:** Required = auth, resume analysis, checkout, merit/tier-gating, analyze contracts.

### Q2 — Should the zero-functional-change merge gate (NFR-01) be blocking or advisory?

| Option | Description | Selected |
|--------|-------------|----------|
| Blocking — red = stop | Red baseline = no merge until green/justified; flaky tests quarantined | ✓ |
| Advisory — surface, don't block | Reports pass/fail; operator judgment decides; weaker for a zero-change milestone | |

**User's choice:** Blocking — red = stop.
**Notes:** Makes the TEST-02 OutcomeOverdueBanner fix a prerequisite; quarantine handles residual flakiness.

---

## CI wiring scope

### Q1 — How far should Phase 1 take gate automation (TEST-08 is Phase 5)?

| Option | Description | Selected |
|--------|-------------|----------|
| Runnable command + script now, CI in Phase 5 | One local wrapper command + strategy doc; full CI deferred | |
| Wire a GitHub Action this phase too | Pull part of TEST-08 forward: PR gate now so Phases 2–4 PRs auto-checked | ✓ |
| Local command only, no wrapper script | Documented manual sequence; lightest but error-prone | |

**User's choice:** Wire a GitHub Action this phase too.
**Notes:** Phase 1 ships BOTH the runnable wrapper AND the PR gate; Phase 5 extends CI (full suite wiring, deploy gating).

### Q2 — What runs in the per-PR gate (cost/secrets)?

| Option | Description | Selected |
|--------|-------------|----------|
| Full gate incl. Playwright; promptfoo scheduled | Per PR: vitest + deno + Playwright (stubbed AI, real Supabase/Stripe test secrets); promptfoo scheduled/by-label | ✓ |
| Everything on every PR | All layers incl. promptfoo each PR; max coverage but per-PR Anthropic cost + slowest | |
| Fast layers on PR, Playwright nightly | Only vitest + deno per PR; Playwright + promptfoo nightly; cheapest but E2E regressions surface late | |

**User's choice:** Full gate incl. Playwright; promptfoo scheduled.
**Notes:** Secrets in GitHub: SUPABASE_TEST_*, STRIPE_TEST_*. promptfoo kept off per-PR to contain Anthropic cost.

---

## Claude's Discretion

- Exact baseline tag name, wrapper script name/shape, Playwright project/dir layout, AI-fixture-recording mechanism, and the GitHub Action YAML structure — left to research + planning, consistent with the locked decisions.

## Deferred Ideas

- Full CI/deploy-gating buildout + deep coverage expansion → Phase 5 (TEST-03/05/08).
- Real-AI smoke run (live Anthropic path) — excluded from the per-phase gate; optional separate run if ever wanted.
- Performance before/after measurement (`scripts/validate-performance.mjs`) → Phase 9 (PERF-04).
