# Phase 5: Deep Test Coverage Expansion - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-14
**Phase:** 5-deep-test-coverage-expansion
**Areas discussed:** Coverage breadth & priority, Adversarial scope & cost, CI / deploy-gating teeth, Behavior-pinning policy

***

## Coverage breadth & priority

### Q1 — Prioritization principle

| Option             | Description                                                                                 | Selected |
| ------------------ | ------------------------------------------------------------------------------------------- | -------- |
| Risk-prioritized   | Business-critical + Phases 6/8/9 surfaces + merit/auth/tier core first; tail as time allows | ✓        |
| Exhaustive all-40  | Every edge function gets handler + failure-path coverage                                    |          |
| Live-features-only | Only active prod AI + merit/auth/tier core; skip gated-off + email/notify                   |          |

### Q2 — Test depth for priority analyze functions

| Option                           | Description                                                                                           | Selected |
| -------------------------------- | ----------------------------------------------------------------------------------------------------- | -------- |
| Handler-level via AI\_TEST\_MODE | Real Requests, Anthropic stubbed; assert auth/merit/tier/parse/merge/persist + error/failure branches | ✓        |
| Pure-logic units only            | Isolated parse/merge/repair/variant-selection; no handler invocation                                  |          |
| Mixed by tier                    | Handler-level for resume/career + core; pure-logic for the rest                                       |          |

### Q3 — Which surfaces ALSO make the must-cover cut (multiSelect)

| Option                            | Description                                                                           | Selected |
| --------------------------------- | ------------------------------------------------------------------------------------- | -------- |
| Other live AI features            | grade-linkedin, recruiting-lens, analyze-skills-gap, compare-jobs, chat-agent         | ✓        |
| Async job workers                 | submit/process resume & career jobs + get-analysis-job-status                         | ✓        |
| Shared extraction/merge utils     | document-extraction, ocr-pdf, result-merger, recruiting-lens-merger, prompt-sanitizer | ✓        |
| Gated-off Interview Prep handlers | interview-prep-analyze / -evaluate                                                    | ✓        |

**User's choice:** Risk-prioritized; handler-level via AI\_TEST\_MODE; ALL four opt-in groups in the must-cover set.
**Notes:** Operator opted everything in — phase is intentionally broad, ordered risk-first. Deferred tail = email/notify senders, admin/keep-warm/test-email/legacy paddle, lifecycle-archive-writer, extract-analysis-structure.

***

## Adversarial scope & cost

### Q1 — Which active AI features get prompt-injection coverage

| Option                        | Description                                                     | Selected |
| ----------------------------- | --------------------------------------------------------------- | -------- |
| High-risk user-text ingesters | analyze-resume, analyze-career, grade-linkedin, recruiting-lens | ✓        |
| All live AI features          | Above four + analyze-skills-gap, compare-jobs, chat-agent       |          |
| Keep current + harden one     | Only deepen the existing interview-prep-analyze suite           |          |

### Q2 — Adversarial coverage structure

| Option               | Description                                                                                        | Selected |
| -------------------- | -------------------------------------------------------------------------------------------------- | -------- |
| Two layers           | Deterministic \$0 prompt-sanitizer units ON the gate + real-AI promptfoo OFF the gate for the four | ✓        |
| promptfoo only       | Just extend real-AI suites; rely on existing single sanitizer test                                 |          |
| Sanitizer-units only | Deterministic units on the gate; defer real-AI promptfoo                                           |          |

**User's choice:** High-risk four; two-layer structure.
**Notes:** promptfoo stays off the per-PR gate (real Anthropic cost) per Phase 1 D-09. Deterministic sanitizer layer is the gate signal; promptfoo is the scheduled spot-check.

***

## CI / deploy-gating teeth

### Q1 — How far to push deploy-gating

| Option                            | Description                                                                                               | Selected |
| --------------------------------- | --------------------------------------------------------------------------------------------------------- | -------- |
| Gate the deploy scripts           | verify:baseline as hard precondition in deploy-staging/production.ps1 (+ CI); red blocks an actual deploy | ✓        |
| Extend PR gate only               | Broaden PR gate; leave deploys ungated                                                                    |          |
| Gate deploys + live-Supabase lane | Both gate deploys AND add a non-blocking live-Supabase CI lane                                            |          |

### Q2 — Canonical documented command-set shape

| Option                           | Description                                                                                          | Selected |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- | -------- |
| One gate, grow it                | verify:baseline stays THE single gate; new deno tests added to test:ci allowlist; promptfoo separate | ✓        |
| Two-tier: baseline + verify:full | Add a heavier verify:full (promptfoo + live-Supabase) for pre-prod                                   |          |
| You decide                       | Planner picks consistent with above                                                                  |          |

**User's choice:** Gate the deploy scripts; one gate, grow it.
**Notes:** Document operator branch-protection enablement (required-status-check). Live-Supabase CI lane considered and deferred. Full command reference documented in TESTING-STRATEGY.md.

***

## Behavior-pinning policy

### Q1 — Policy when a new test reveals a suspected latent bug

| Option                             | Description                                                                                                                       | Selected |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Pin-and-log, escalate critical     | Default characterize current behavior + log to register; escalate to checkpoint only for business-critical/security-boundary bugs | ✓        |
| Always surface as deviation        | Strict Phase 4 D-11: any suspected bug stops & escalates                                                                          |          |
| Always pin (pure characterization) | Always assert current behavior; never escalate mid-phase                                                                          |          |

**User's choice:** Pin-and-log by default, escalate critical (resume/career/merit/auth/billing or security boundary).
**Notes:** Test-writing phase, not a fix phase; escalation (when triggered) follows Phase 4 D-11 (never silently change, never paper over).

***

## Claude's Discretion

* **Coverage reporting** (operator declined to deep-dive): global coverage stays advisory (Phase 1 D-05) — no hard numeric threshold; planner may wire a cheap report artifact if low-cost, not required.
* **Env-specific depth / Phase 5↔7 boundary** (operator declined to deep-dive): Phase 5 tests current env-dependent behavior (CORS allow-list, fail-closed secret validation, AI\_TEST\_MODE branch); Phase 7 owns config consolidation. No double-coverage.
* Plan/commit slicing, AI\_TEST\_MODE fixture mechanism, deno test-file layout, and suspected-behavior register format left to research + planning.

## Deferred Ideas

* Frontend vitest expansion (was Phase 1 TEST-02 — shipped).
* Real-AI promptfoo for analyze-skills-gap / compare-jobs / chat-agent (deterministic sanitizer layer still covers them on the gate).
* Low-risk tail handler tests (email/notify/admin/keep-warm/legacy-paddle/lifecycle-archive/extract-analysis-structure) — time-permitting / future pass.
* Live-Supabase CI lane — deferred in favor of deploy-script gating.
* Env-var consolidation + canonical .env.example — Phase 7.
* Hard numeric coverage threshold — explicitly not adopted.
* Fixing latent bugs surfaced by tests — /gsd-debug / future pass (Phase 5 pins-and-logs or escalates).

