# Phase 2: Security Audit & Remediation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-01
**Phase:** 2-security-audit-remediation
**Areas discussed:** Remediation threshold, Cross-phase ownership, v4.0 residual inheritance, Evidence bar, Cross-phase boundary

---

## Area selection

The operator was presented four gray areas (each with a recommended default) and asked which to
discuss vs. lock-as-recommended. **All four selected for discussion.** In each, the operator chose
the most-thorough / leave-nothing-deferred option, overriding the (more scope-disciplined)
recommendation.

---

## Remediation threshold (findings below critical/high)

| Option | Description | Selected |
|--------|-------------|----------|
| Crit/high + cheap mediums (recommended) | Fix all critical/high + low-effort mediums; log remaining medium/low to residual register | |
| Critical/high only | Remediate only mandated critical/high; all medium/low → tracked residual | |
| Everything crit/high/medium | Fix critical, high, AND all medium in-phase; defer only low | ✓ |

**User's choice:** Everything crit/high/medium.
**Notes:** Only *low* severity becomes tracked residual. Accepts larger blast radius + slower phase
for minimal deferred security debt. → CONTEXT D-01.

---

## Cross-phase finding ownership

| Option | Description | Selected |
|--------|-------------|----------|
| Classify + hand off, fix-here only if live-crit (recommended) | Log with owning-phase pointer + carried regression obligation; owning phase fixes | |
| Remediate everything here | Phase 2 fixes all confirmed findings itself, even in areas a later phase rewrites | ✓ |
| Hand off all overlap, no exceptions | Never pre-fix overlap; always defer to owning phase | |

**User's choice:** Remediate everything here.
**Notes:** Prompted the follow-up boundary question below (how literal for the 3 architectural items).
→ CONTEXT D-02.

---

## v4.0 residual inheritance

| Option | Description | Selected |
|--------|-------------|----------|
| Fold in env/isolation, re-affirm rest (recommended) | Pull still-open env fix-list into SEC-12; re-affirm promptfoo residue + 15 advisors | |
| Full re-audit of all residuals | Re-open + re-examine everything (env fix-list, promptfoo subtree, all 15 advisors) from scratch | ✓ |
| Scope strictly to net-new | Treat all v4.0 residuals as closed; audit only new issues | |

**User's choice:** Full re-audit of all residuals.
**Notes:** Nothing assumed-closed; accepts re-litigating settled v4.0 decisions. → CONTEXT D-04.

---

## Evidence bar

| Option | Description | Selected |
|--------|-------------|----------|
| Test where feasible; documented repro otherwise (recommended) | Regression test for code findings; documented operator-verification for config/secret findings | |
| Automated guard for EVERY high-risk finding | Even config/secret findings get an automated config-drift/assertion guard | ✓ |
| Scan re-run counts as evidence | Re-running advisors / npm audit / audit grep showing clearance is sufficient | |

**User's choice:** Automated guard for every high-risk finding.
**Notes:** Config/secret/isolation findings get a config-drift/assertion test (cf. `cors-audit.test.ts`
precedent), all folded into `verify:baseline`. → CONTEXT D-05.

---

## Cross-phase boundary (follow-up to Ownership)

Because "remediate everything here" collides with the roadmap for 3 large architectural items owned
by later phases (Merit idempotency → Ph3, refund-after-save → Ph3/4, Paddle webhook → Ph8), a
follow-up was asked to pin the size.

| Option | Description | Selected |
|--------|-------------|----------|
| Targeted security fix now; later phase keeps its rewrite (recommended) | Minimal correct security fix now (key-forwarding / log-not-throw / webhook hardening); Ph3/4/8 keep full scope on top | ✓ |
| Pull the full architectural fix into Phase 2 | Phase 2 builds the complete lifecycle/idempotency architecture; later phases shrink | |
| These 3 defer to their owning phase | Log with owning-phase pointers; fix in Ph3/4/8 | |

**User's choice:** Targeted security fix now; later phase keeps its rewrite.
**Notes:** Reconciles "remediate everything here" with roadmap coherence — no finding deferred, but
Phase 2 does not absorb Phase 3's lifecycle build. → CONTEXT D-03.

---

## Claude's Discretion

- Exact per-domain audit methodology + tooling mix (Supabase advisors, `npm audit`, static grep,
  per-domain subagents, manual review) — provided all 17 domains covered + severity-classified.
- Phase structure / plan split (the ROADMAP 02-01..02-04 sketch is a starting point, not binding).
- Precise form of each config-drift/assertion guard (following the `cors-audit.test.ts` precedent).
- Authoritative set of "active" Edge Functions + frontend surfaces to audit.
- Severity rubric (impact × exploitability), stated in the security record.

## Deferred Ideas

- Full lifecycle/idempotency architecture (LIFE-01..09) → Phase 3.
- LinkedIn deterministic scoring + broader grade-linkedin rework (FEAT-03/04, VER-03) → Phase 4.
- Paddle removal (PADL-01..04) → Phase 8.
- Low-severity findings → residual register.
- Framework-major dependency upgrades (React 19 / Tailwind 4 / zod 4 / TS 6 / react-router 7) →
  out of v5.0 scope.
