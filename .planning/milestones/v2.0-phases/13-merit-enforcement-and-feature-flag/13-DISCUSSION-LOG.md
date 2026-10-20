# Phase 13: merit-enforcement-and-feature-flag - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-14
**Phase:** 13-merit-enforcement-and-feature-flag
**Areas discussed:** Refund trigger taxonomy, Feature flag mechanism, Rate limit integration, Observability & alert transport

---

## Refund Trigger Taxonomy

### Q1: Which failure modes should trigger an automatic Merit refund?

| Option | Description | Selected |
|--------|-------------|----------|
| Network/5xx only (narrow) | Refund on Anthropic 5xx, 429-overload, timeout, network error only. No refund on parse/validation/cancellation. Cleanest contract. | ✓ |
| Any non-2xx upstream | Refund on any Anthropic non-success including 4xx content_policy. | |
| Anything that fails to return usable output | Refund on upstream errors + parse + validation failures. User-generous, abuse risk. | |
| Upstream errors + user cancellation | Narrow refund + refund on mid-stream abort. Expensive because partial billing. | |

**User's choice:** Network/5xx only (narrow) — recommended default
**Notes:** Matches existing `_shared/anthropic.ts` overload detection. Drives D-02.

### Q2: How should refund logic be wired into each AI feature?

| Option | Description | Selected |
|--------|-------------|----------|
| Gateway owns it via try/finally | Shared `withMerits(...)` helper deducts, runs callback, auto-refunds on taxonomy errors. Features stay clean. | ✓ |
| Feature owns it explicitly | Each feature calls deduct then Anthropic then refund inline. Explicit but boilerplate. | |
| Decorator/middleware pattern | Higher-order function wrapping entire handler. Elegant but opaque for streaming. | |

**User's choice:** Gateway owns it via try/finally — recommended default
**Notes:** Drives D-03 (`withMerits` is the single failure-handling surface).

---

## Feature Flag Mechanism

### Q1: How should `MERIT_SYSTEM_ENABLED` be stored and read at runtime?

| Option | Description | Selected |
|--------|-------------|----------|
| Supabase env var | Function secret, flip requires `supabase secrets set` + restart (~30 s). Matches existing patterns. | ✓ |
| DB-backed `feature_flags` table | Runtime-flippable via SQL, no deploy. Adds DB roundtrip or cache. | |
| Env var default + DB override | Hybrid: env var baseline, DB override if present. More code paths. | |

**User's choice:** Supabase env var — recommended default
**Notes:** Drives D-05. Repo precedent: `ANTHROPIC_MODEL_TEXT`, `INTERNAL_JOB_SECRET`, `PADDLE_WEBHOOK_SECRET`.

### Q2: Where does the `MERIT_SYSTEM_ENABLED` branching happen?

| Option | Description | Selected |
|--------|-------------|----------|
| Inside each AI feature | Top-of-handler `if (MERIT_ENABLED) { gateway } else { legacy }`. Grep-friendly. Both paths testable. | ✓ |
| Inside the gateway only | Gateway internally routes to legacy. Features flag-unaware but gateway becomes a two-behavior router. | |
| Duplicate feature handlers per flag state | Two versions of each feature. Clean but 2x maintenance. | |

**User's choice:** Inside each AI feature — recommended default
**Notes:** Drives D-06. Legacy path in D-18 is provably untouched in this phase.

---

## Rate Limit Integration

### Q1: How should the 60 AI analyses/hour rate limit be scoped?

| Option | Description | Selected |
|--------|-------------|----------|
| 60/hr pooled across all features | Single counter `ai-analyses-all`. Simpler + protects Anthropic budget regardless of mix. | ✓ |
| 60/hr per feature | Each feature own bucket. Reuses rate-limiter per-feature pattern. Looser global cap. | |
| Per-feature + global 60 cap | Most defensive, two counters per call. | |

**User's choice:** 60/hr pooled across all features — recommended default
**Notes:** Drives D-08. Reuses existing `_shared/rate-limiter.ts` with a new key.

### Q2: When does the rate limit run relative to Merit check/deduction?

| Option | Description | Selected |
|--------|-------------|----------|
| Rate limit first, then Merit deduct | Fail-cheap. No ledger write on rate-limited users. | ✓ |
| Merit deduct first, then rate limit | Symmetric with AI-failure refunds but wastes writes. | |
| Parallel (one transaction) | Most correct; requires new combined RPC — scope creep into Phase 11. | |

**User's choice:** Rate limit first, then Merit deduct — recommended default
**Notes:** Drives D-09. Preserves rate-limiter's fail-open-on-DB-error semantics.

---

## Observability & Alert Transport

### Q1: Where should NFR-11 alerts fire?

| Option | Description | Selected |
|--------|-------------|----------|
| Resend email to admin | Reuse RESEND_API_KEY + `send-strivo-email`. Zero new infra. | ✓ |
| Slack webhook | Rich formatting, real-time. New dependency + workspace wiring. | |
| Supabase logs + Vercel log drain | Zero new code but requires external log tooling not confirmed in repo. | |
| Both email AND Slack | Paper trail + real-time. Double wiring + double noise. | |

**User's choice:** Resend email to admin — recommended default
**Notes:** Drives D-15. Ships a scheduled `check-merit-alerts` edge function running every 15 minutes.

### Q2: How should admin metrics (NFR-10) be exposed?

| Option | Description | Selected |
|--------|-------------|----------|
| Postgres views + one admin edge function | Live views, single `admin-merit-metrics` function returning aggregate JSON. SQL-native, no refresh job. | ✓ |
| Materialized views + refresh cron | Faster reads but adds orchestration + staleness + cron dep. | |
| Raw SQL queries in admin edge function | Flexible; couples business logic to function code. | |
| Supabase Dashboard only | Zero build cost but fails "queryable metrics" implied by NFR-10. | |

**User's choice:** Postgres views + one admin edge function — recommended default
**Notes:** Drives D-13 and D-14. Four views: `v_merits_in_circulation`, `v_feature_consumption_daily`, `v_shop_purchases_daily`, `v_conversion_funnel`. Gated by `requireInternalOrUserAuth` + admin-email allowlist.

---

## Claude's Discretion

Areas where the planner / researcher has flexibility (logged in CONTEXT.md):

- Exact helper file location (`merit-gateway.ts` vs `merits.ts`).
- `withMerits` callback return type (Response wrapper vs plain data).
- Rate-limit config threading (constant vs parameter).
- Migration file split (one vs two files).
- Cron schedule for alerts (suggested `*/15 * * * *`).
- TEST-07 fixture strategy (real mocked Anthropic 5xx vs `FORCE_AI_FAILURE` env).
- Alert email subject / tagging.

## Deferred Ideas

Captured in CONTEXT.md `<deferred>`:

- Slack/Sentry/external APM integrations
- Materialized views for admin metrics
- Runtime-flippable DB-backed feature flag
- Per-feature rate limits
- Refund taxonomy expansion (parse failures, cancellation)
- Admin UI for alert acknowledgment
- Metrics beyond NFR-10 (cohort / ARPU / churn)
