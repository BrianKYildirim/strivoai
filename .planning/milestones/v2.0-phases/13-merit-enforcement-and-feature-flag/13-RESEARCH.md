# Phase 13: merit-enforcement-and-feature-flag — Research

**Researched:** 2026-04-14
**Domain:** Supabase Edge Functions (Deno) — shared helper gateway, feature flag rollout, observability, alerting
**Confidence:** HIGH

## Summary

Phase 13 is the execution surface for the Merit system. Phases 10–12 built the ledger, the RPCs, and the billing plumbing; Phase 13 wires them into every AI feature, behind a `MERIT_SYSTEM_ENABLED` env flag, with an idempotent auto-refund path on Anthropic upstream failure, a pooled 60/hr rate limiter, structured transaction logging, admin-only metrics views, and a scheduled alerting function.

CONTEXT.md has 19 locked decisions (D-01..D-19) that frame the entire phase. None of them need re-litigation — this research only confirms each is implementable against the live codebase and resolves the items left to Claude's Discretion. Every critical unknown was verified against the repo directly: `_shared/rate-limiter.ts` (already supports arbitrary pooled keys), `_shared/anthropic.ts` (already returns `{ok: false, status}` classified errors), `_shared/handler.ts` (Zod-wrapped auth + rate limit), `_shared/auth.ts` (`requireInternalOrUserAuth`), `_shared/usage-checker.ts` (the legacy fallback contract), `supabase/migrations/20260310000000_add_keep_warm_cron.sql` (the pg_cron + pg_net pattern), and the existing `submit-*-job` / `process-*-job` split.

**Primary recommendation:** Ship a `_shared/merit-gateway.ts` module exposing exactly one public function `withMerits(ctx, feature, fn)` plus `readMeritFlag()`. Every gated AI feature adds a single top-of-handler `if (MERIT_SYSTEM_ENABLED)` branch that replaces the existing `checkAndRecordUsage` call and wraps the rest of the body in `withMerits`. No other feature logic changes. The migration is a single additive file (4 views + `alert_state` table + cron.schedule row). Two new edge functions (`admin-merit-metrics`, `check-merit-alerts`). TEST-07 uses an `AI_FORCE_FAILURE` env gate that forces `invokeAnthropicText` / streaming to short-circuit to `{ ok: false, status: 529, error: 'forced-failure' }` — cleanest seam to mock upstream.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01** `check-and-deduct-merits` is a **shared helper module** at `_shared/merit-gateway.ts`, imported in-process by every AI feature. NOT a cross-function HTTP hop. Optional thin `check-and-deduct-merits/index.ts` HTTP wrapper if BACK-01 is later read literally — can be added without caller changes.

**D-02** Refund trigger is NARROW: auto-refund fires ONLY on Anthropic upstream failures (5xx, 429-overload/529, network timeout, connection reset). Do NOT refund on JSON parse failures, prompt-sanitizer rejections, Zod/validation failures downstream of a successful upstream response, user-cancelled streams, or rate-limit rejections (no deduction happened).

**D-03** Gateway owns refund control flow via `withMerits(userId, feature, cost, async () => anthropicCall())`. Deduct → await callback in try/catch → classify error against D-02 taxonomy → return result OR call `refund_merits` + re-throw. Features never call `refund_merits` directly.

**D-04** Every deduction returns a `transaction_id` (from Phase 11 RPC). Gateway holds it for the full callback lifetime. Refunds via `refund_merits(transaction_id)` are idempotent by Phase 11 contract (D-02/D-08 of Phase 11).

**D-05** `MERIT_SYSTEM_ENABLED` is a Supabase function secret (env var), default `false`, read at cold start and cached in module scope. Flipping requires `supabase secrets set MERIT_SYSTEM_ENABLED=true` + function restart (~30s propagation). Matches existing env-var pattern.

**D-06** Flag branching lives INSIDE each AI feature handler, not inside the gateway. Canonical shape at the top of every gated feature:
```ts
if (MERIT_SYSTEM_ENABLED) {
  return withMerits(userId, 'resume_analysis', tierCost, async () => { /* existing body */ });
} else {
  const usage = await checkAndRecordUsage(userId, 'resume_analysis');
  if (!usage.allowed) return createUsageLimitResponse(...);
  /* existing body */
}
```

**D-07** Gated features: `analyze-resume`, `analyze-career`, `grade-linkedin`, `recruiting-lens`, `analyze-skills-gap`, `compare-jobs`, plus Interview Prep entry points when they exist. Async processors (`process-resume-analysis-job`, `process-career-analysis-job`) do NOT deduct — deduction happens at SUBMISSION time in the `submit-*-job` functions.

**D-08** NFR-05's "60 AI analyses per user per hour" is a SINGLE pooled counter across all AI features. Key = `ai-analyses-all`. Reuses `_shared/rate-limiter.ts` Postgres fixed-window, 3600s. Same 60 cap for all tiers.

**D-09** Rate limit runs BEFORE Merit deduction inside `withMerits`. Fail-open-on-DB-error preserved.

**D-10** Distinct error codes:
- `429 rate_limit_exceeded` — hit 60/hr pool
- `402 insufficient_merits` — balance too low (NEW, returned by gateway)
- `429 usage_limit_reached` — legacy path only (flag off)

**D-11** Every successful deduction and every refund logged via `createLogger('merit-gateway').info('merit-transaction', { user_id, amount, source, feature, transaction_id })`. Satisfies NFR-09.

**D-12** `merit_transactions` table is durable record; logs are ephemeral audit. Gateway does NOT log before RPC succeeds.

**D-13** NFR-10 metrics exposed via Postgres views + `admin-merit-metrics` edge function:
- `v_merits_in_circulation` — `SUM(subscription_balance + shop_balance)` from `user_merits`
- `v_feature_consumption_daily` — `merit_transactions` GROUP BY (feature, day)
- `v_shop_purchases_daily` — `merit_shop_purchases WHERE status='succeeded'` GROUP BY day
- `v_conversion_funnel` — Free→Pro / Pro→Elite from `profiles` + Phase 12 events

`admin-merit-metrics` is gated by `requireInternalOrUserAuth` + admin allowlist check. Returns a single JSON aggregate on GET.

**D-14** Views are LIVE (not materialized). Low-QPS admin-only.

**D-15** NFR-11 alerts delivered via Resend email to admin address (reuse `RESEND_API_KEY` + `send-strivo-email` pattern). New scheduled edge function `check-merit-alerts` runs every 15 min. No Slack/Sentry/external log drain this phase.

**D-16** Three alert conditions hard-coded:
1. `negative_balance` — `COUNT(*) FROM user_merits WHERE subscription_balance < 0 OR shop_balance < 0` > 0. Fires IMMEDIATELY, not debounced (should be impossible — fires = bug).
2. `ai_failure_rate_high` — trailing 1h `(refund_rows / (deduction_rows + refund_rows)) > 0.05`. Debounced: re-alert at most every 1h.
3. `shop_failure_rate_high` — trailing 1h `shop_purchases.status='failed' / total > 0.02`. Debounced similarly.

**D-17** Alert state tracked in new `alert_state (alert_name, last_fired_at, last_ok_at)` table so debounce survives cold starts. Ships in Phase 13 migration.

**D-18** While `MERIT_SYSTEM_ENABLED=false`, every feature continues calling `_shared/usage-checker.ts` unchanged. Phase 13 does NOT modify `usage-checker.ts`, `check_and_record_ai_usage` RPC, or `usage_tracking` table. Legacy path must be provably unchanged — regression test in CI.

**D-19** Mixed-state window at first flip-on is acceptable (in-flight legacy requests + new-path requests). Safe because paths count different things and cannot double-spend.

### Claude's Discretion (resolved in this research)

- **Filename/naming:** `_shared/merit-gateway.ts` (keeps grep-visibility; `merits.ts` is too generic — several files already shadow the name).
- **Callback return type:** Generic `Promise<T>` where `T` is whatever the feature returns (usually `Response`, but streaming bodies return the stream object). The gateway does not unwrap or re-serialize — it passes through. Error classification happens on thrown errors AND on `{ok: false, status}` returns from `invokeAnthropicText` (features must either throw on Anthropic failures or let the gateway inspect a return sentinel). See "withMerits contract" below for the exact type.
- **Rate-limit config threading:** Hard-coded constant inside `merit-gateway.ts`: `const AI_POOL_LIMIT: RateLimitConfig = { key: 'ai-analyses-all', limits: { free: 60, pro: 60, elite: 60 } }`. No per-call parameter; NFR-05 says 60 flat across tiers.
- **Migration file count:** SINGLE file `supabase/migrations/YYYYMMDDHHMMSS_merit_enforcement_observability.sql` (views + alert_state + cron.schedule all additive, no drops).
- **Cron schedule for `check-merit-alerts`:** `*/15 * * * *` (every 15 min). Matches D-16 debounce math (1h debounce ÷ 4 ticks = first-tick alert then 3 silent ticks).
- **Metrics breakout of `phase-10-backfill` / `phase-12-backfill` sources:** Aggregate by default (treat all `merit_transactions` equally). Backfill rows are naturally tagged via `source` column — admin metrics can add a `WHERE source NOT LIKE '%-backfill'` filter later if needed.
- **TEST-07 mock strategy:** Introduce `AI_FORCE_FAILURE=1` env var read at the top of `invokeAnthropicText` (and the streaming variant). When set, short-circuits to `{ ok: false, status: 529, error: 'forced-failure' }`. Preferred over fetch-stubbing because Deno test runners in this repo don't mock module-level fetch. See "Testing patterns" below.
- **Alert email subject prefix:** `[Strivo Alert] <alert_name>: <metric>` plain-string prefix — no Resend tags this phase.

### Deferred Ideas (OUT OF SCOPE)

- Tier-gated prompt variants (`_free.md` / `_pro.md` / `_elite.md`) — Phase 14
- `<LockedSection>` / `<ProFeatureGate>` / `<EliteFeatureGate>` UI primitives — Phase 14
- Per-feature tier output maps — Phases 15–18
- Interview Prep backend rewrite — Phase 19
- Merit balance badge / cost previews / pricing page UI — Phase 20
- Legacy `usage_tracking` deletion (MIG-04 keeps it read-only)
- Any change to Phase 11 RPCs (Phase 13 only consumes)
- Any change to Phase 12 webhook (Phase 13 only reads what it writes)
- Slack/Sentry/external APM — D-15 email-only
- Materialized views — D-14 live
- Runtime-flippable DB-backed flag — D-05 env var
- Per-feature rate limits — D-08 pooled
- Expanded refund taxonomy — D-02 narrow
- Admin UI for alert ack
- Cohort/ARPU/churn metrics — PROJECT.md defers analytics overhaul

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BACK-01 | Every AI feature routes through `check-and-deduct-merits` for tier + balance + deduction | `_shared/merit-gateway.ts` + `withMerits` wrapper (D-01/D-03) satisfies BACK-01's intent; thin HTTP wrapper available if literal reading later required |
| MER-11 | Auto-refund on AI failure | D-03 `withMerits` try/catch + `refund_merits(transaction_id)` (Phase 11 idempotent) |
| NFR-01 | Check + deduction < 100ms warm DB | Single-statement SECURITY DEFINER RPC call with `FOR UPDATE` (Phase 11 D-19); in-process import (D-01) eliminates HTTP overhead; research verifies no network hop |
| NFR-02 | Balance eventually consistent within 5s across UI | `merit_transactions` writes are synchronous; UI reads `merit_transactions` + `user_merits` via RLS SELECT policies (Phase 10 D-17); Phase 13 logs duration but owns no UI work |
| NFR-03 | Server-side only — no client Merit manipulation | Enforced by Phase 10 RLS (zero permissive write policies) + Phase 11 `GRANT EXECUTE` to service_role only; Phase 13 honors this by routing all calls through `getServiceClient()` |
| NFR-05 | 60 AI analyses/user/hour | `_shared/rate-limiter.ts` with new pooled key `ai-analyses-all` (D-08/D-09) |
| NFR-09 | Log every Merit transaction | `createLogger('merit-gateway').info('merit-transaction', {...})` (D-11) |
| NFR-10 | Admin metrics: total in circulation, per-feature/day, conversion rates | 4 views + `admin-merit-metrics` edge function (D-13) |
| NFR-11 | Alert on negative balance / 5% AI failure / 2% shop failure | `check-merit-alerts` scheduled function + `alert_state` debounce (D-15/D-16/D-17) |
| MIG-05 | `MERIT_SYSTEM_ENABLED` flag routes to legacy `usage_tracking` on false | Env var + per-handler branch (D-05/D-06/D-18) |
| TEST-07 | Integration test — AI failure refund | `AI_FORCE_FAILURE=1` env gate in `anthropic.ts` + Deno test in edge test runner asserts `merit_transactions` has deduction row + refund row + balance restored |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Merit deduction + refund | Edge Function (shared helper) | Database (RPCs) | Phase 11 RPCs are the authoritative write path; gateway wraps them in in-process callers — no client or frontend-server role |
| Rate limiting (60/hr pool) | Edge Function (shared helper) | Database (`rate_limit_counters` table) | `_shared/rate-limiter.ts` already fills this; Phase 13 only supplies a new key |
| Feature-flag routing | Edge Function (per-handler branch) | — | Module-scope env read at cold start; no DB involvement |
| Admin metrics aggregation | Database (views) | Edge Function (`admin-merit-metrics`) | Views own the SQL; edge function only serializes + auth-gates |
| Alert detection + debounce | Edge Function (`check-merit-alerts`, scheduled) | Database (`alert_state` table) | Scheduler is pg_cron → pg_net → edge function; state persists across cold starts |
| Alert delivery | Edge Function → Resend API | — | Reuses `send-strivo-email` transport |
| Legacy fallback | Edge Function (per-handler branch) | Database (legacy RPCs) | `checkAndRecordUsage` unchanged — this tier keeps its existing owner |
| Transaction logging | Edge Function (`createLogger` stdout) | Supabase log store | Ephemeral audit — durable record lives in `merit_transactions` (Phase 10) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Deno std HTTP server | `@0.168.0` | Edge function runtime | Repo-wide pin; matches all existing functions |
| `@supabase/supabase-js` | `npm:@supabase/supabase-js@2.81.1` | Service-role client + RPC calls | `_shared/supabase-client.ts` singleton already uses this |
| `zod` | `npm:zod@3.25` | Body validation for `admin-merit-metrics` | `handler.ts` contract |
| Anthropic API (raw fetch) | — | Existing `_shared/anthropic.ts` contract | TEST-07 gates at this seam |

### Supporting (existing shared utilities — import only, do NOT modify)
| File | Purpose | When to Use |
|------|---------|-------------|
| `_shared/rate-limiter.ts` | Pooled 60/hr limiter | Imported by `merit-gateway.ts` with new `RateLimitConfig` |
| `_shared/usage-checker.ts` | Legacy `usage_tracking` path | Imported by every gated feature on the false branch of D-06 — UNCHANGED |
| `_shared/anthropic.ts` | Anthropic HTTP + error classification | New `AI_FORCE_FAILURE` env gate added at top of `invokeAnthropicText` + `streamAnthropicText` for TEST-07 (single-line addition — Claude's Discretion resolved here) |
| `_shared/logger.ts` | Structured JSON logging | `createLogger('merit-gateway')`, `createLogger('admin-merit-metrics')`, `createLogger('check-merit-alerts')` |
| `_shared/auth.ts` | `requireInternalOrUserAuth` + `requireAuth('user')` | `admin-merit-metrics` uses `requireInternalOrUserAuth`; `check-merit-alerts` uses `requireAuth('internal')` via cron→pg_net header |
| `_shared/handler.ts` | `handleRequest` wrapper | Both new edge functions (`admin-merit-metrics`, `check-merit-alerts`) use this |
| `_shared/supabase-client.ts` | `getServiceClient()` singleton | All RPC calls in gateway + metrics + alerts |
| `_shared/cors.ts` | `corsHeaders` | `admin-merit-metrics` only (cron-invoked `check-merit-alerts` has no CORS) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-process `withMerits` helper (D-01) | Literal HTTP edge function `check-and-deduct-merits` | Extra network hop per AI call (~10-30ms); blown NFR-01 budget. Rejected by D-01. |
| `fetch` stubbing for TEST-07 | Module-level mock | Deno runtime doesn't support fetch module mocking cleanly; `AI_FORCE_FAILURE` env gate is the standard pattern in this repo (`AI_TEST_MODE` already exists) |
| Materialized views for metrics | Live views (D-14) | Refresh overhead + stale-read window not justified at current QPS |
| Slack webhooks for alerts | Resend email (D-15) | Deferred; email satisfies NFR-11 with zero new infra |

**Version verification:** No new npm/Deno packages added this phase — all imports are repo-internal or already-pinned. No `npm view` required.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Frontend / React client                                                │
│  (unchanged this phase — Phase 20 handles UI)                          │
└──────────────────────────────────────────┬──────────────────────────────┘
                                           │ fetch /functions/v1/<feature>
                                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Edge function: analyze-resume | analyze-career | grade-linkedin | ...  │
│                                                                         │
│  [1] requireInternalOrUserAuth(req) → userContext                       │
│  [2] Zod parse body                                                     │
│  [3] if (MERIT_SYSTEM_ENABLED)        ◄── D-05, D-06 branch             │
│           ├── withMerits(...)          ── NEW path                      │
│      else                                                               │
│           └── checkAndRecordUsage(...) ── LEGACY path (unchanged)       │
└──────────────┬────────────────────────────────┬─────────────────────────┘
               │ new path                       │ legacy path
               ▼                                ▼
┌──────────────────────────────┐   ┌────────────────────────────────────┐
│ _shared/merit-gateway.ts     │   │ _shared/usage-checker.ts           │
│                              │   │   → check_and_record_ai_usage RPC  │
│  [a] checkRateLimit(pool)    │   │   → usage_tracking table           │
│      ├─ 429 rate_limit       │   └────────────────────────────────────┘
│      │                       │
│  [b] check_and_deduct_merits │
│      ├─ 402 insufficient     │
│      ├─ 403 tier_locked      │                           ┌───────────────┐
│      └─ {tx_id, remaining}   │                           │ Scheduled:    │
│                              │                           │ pg_cron 15m   │
│  [c] log('merit-transaction',│                           │  → pg_net     │
│         deduction metadata)  │                           │  → internal   │
│                              │                           │    secret     │
│  [d] await fn()  ◄───────────┼────── Anthropic call      ▼               │
│      ├─ ok → return          │                     ┌────────────────┐   │
│      └─ D-02 error taxonomy: │                     │ check-merit-   │   │
│          5xx/529/timeout     │                     │ alerts         │   │
│          → refund_merits     │                     │ (D-15/16/17)   │   │
│          → log('refund')     │                     │                │   │
│          → re-throw          │                     │ reads:         │   │
│                              │                     │  user_merits   │   │
│  [e] return result           │                     │  merit_trans   │   │
└──────────────────────────────┘                     │  shop_purch    │   │
               │                                     │  alert_state   │   │
               │                                     │                │   │
               │                                     │ writes:        │   │
               ▼                                     │  alert_state   │   │
        Anthropic API                                │                │   │
                                                     │ sends:         │   │
                                                     │  send-strivo-  │   │
                                                     │  email         │   │
                                                     └────────────────┘   │
                                                                          │
  Admin operator (browser)                                                │
          │                                                               │
          │ GET /functions/v1/admin-merit-metrics                         │
          ▼                                                               │
  ┌────────────────────────────────────┐                                  │
  │ admin-merit-metrics edge function  │                                  │
  │  requireInternalOrUserAuth +       │                                  │
  │  admin allowlist check             │                                  │
  │  reads 4 live views                │                                  │
  │  returns { merits_in_circulation,  │                                  │
  │    feature_consumption_daily,      │                                  │
  │    shop_purchases_daily,           │                                  │
  │    conversion_funnel }             │                                  │
  └────────────────────────────────────┘                                  │
                                                                          │
  Every write → merit_transactions (Phase 10) is the durable audit ◄──────┘
```

### Component Responsibilities
| Component | File | Responsibility |
|-----------|------|----------------|
| `withMerits` helper | `supabase/functions/_shared/merit-gateway.ts` (NEW) | Rate limit + deduct + run callback + classify error + refund + log |
| `readMeritFlag` | same | Module-scope env read at cold start, cached boolean |
| Per-feature branch | `supabase/functions/{analyze-resume,analyze-career,grade-linkedin,recruiting-lens,analyze-skills-gap,compare-jobs,submit-*-job,interview-prep-coach}/index.ts` | Single `if (MERIT_SYSTEM_ENABLED)` at top of existing handler (D-06) |
| Admin metrics edge function | `supabase/functions/admin-merit-metrics/index.ts` (NEW) | GET-only; auth + allowlist; reads 4 views; returns JSON aggregate |
| Alerts edge function | `supabase/functions/check-merit-alerts/index.ts` (NEW) | Internal-secret auth (cron-invoked); evaluates 3 conditions; writes `alert_state`; emails admin via `send-strivo-email` on breach |
| Migration | `supabase/migrations/YYYYMMDDHHMMSS_merit_enforcement_observability.sql` (NEW) | 4 views + `alert_state` table + cron.schedule row for `check-merit-alerts` |
| Anthropic failure gate | `supabase/functions/_shared/anthropic.ts` (MINIMAL EDIT) | Single-line `AI_FORCE_FAILURE` env check at top of `invokeAnthropicText` + `streamAnthropicText` to enable TEST-07 |

### Recommended Project Structure
```
supabase/
├── functions/
│   ├── _shared/
│   │   ├── merit-gateway.ts         # NEW — withMerits + flag + pool limit constant
│   │   ├── rate-limiter.ts          # UNCHANGED — import only
│   │   ├── anthropic.ts             # 1-LINE EDIT — AI_FORCE_FAILURE gate
│   │   ├── usage-checker.ts         # UNCHANGED — legacy fallback
│   │   ├── logger.ts                # UNCHANGED
│   │   ├── auth.ts                  # UNCHANGED
│   │   └── handler.ts               # UNCHANGED
│   ├── admin-merit-metrics/
│   │   └── index.ts                 # NEW
│   ├── check-merit-alerts/
│   │   └── index.ts                 # NEW
│   ├── analyze-resume/index.ts      # EDIT — add D-06 branch
│   ├── analyze-career/index.ts      # EDIT
│   ├── grade-linkedin/index.ts      # EDIT
│   ├── recruiting-lens/index.ts     # EDIT
│   ├── analyze-skills-gap/index.ts  # EDIT
│   ├── compare-jobs/index.ts        # EDIT
│   ├── submit-resume-analysis-job/index.ts   # EDIT — deduct at submission
│   ├── submit-career-analysis-job/index.ts   # EDIT
│   ├── interview-prep-coach/index.ts         # EDIT
│   ├── process-resume-analysis-job/index.ts  # NO CHANGE — must not double-deduct
│   └── process-career-analysis-job/index.ts  # NO CHANGE
├── migrations/
│   └── YYYYMMDDHHMMSS_merit_enforcement_observability.sql   # NEW
└── tests/
    └── functions/                   # Deno tests for TEST-07 scenario
```

### Pattern 1: `withMerits` signature

```ts
// _shared/merit-gateway.ts
import { getServiceClient } from './supabase-client.ts';
import { checkRateLimit, createRateLimitResponse, RateLimitConfig } from './rate-limiter.ts';
import { createLogger } from './logger.ts';
import { corsHeaders, CorsType } from './cors.ts';

const log = createLogger('merit-gateway');

// D-05: module-scope env read, cached
export const MERIT_SYSTEM_ENABLED =
  (Deno.env.get('MERIT_SYSTEM_ENABLED') ?? '').toLowerCase() === 'true';

// D-08: pooled 60/hr limiter, same across tiers
const AI_POOL_LIMIT: RateLimitConfig = {
  key: 'ai-analyses-all',
  limits: { free: 60, pro: 60, elite: 60 },
};

// D-02: refundable error classification
function isRefundableAnthropicError(status: number, errText: string): boolean {
  if (status >= 500) return true;                      // 5xx
  if (status === 529) return true;                     // overloaded
  if (status === 408) return true;                     // client timeout (AbortError in _shared/anthropic.ts)
  if (/overload|timeout|ECONNRESET|network/i.test(errText)) return true;
  return false;
}

export interface MeritGatewayContext {
  userId: string;
  tier: 'free' | 'pro' | 'elite';
  corsType: CorsType;
}

export type MeritGatewayResult<T> =
  | { ok: true; value: T; transactionId: string }
  | { ok: false; response: Response };   // gateway owns 402/429 response shape

/**
 * withMerits — the single failure-handling surface for the Merit system.
 *
 *   1. rate-limit check (pooled 60/hr, key 'ai-analyses-all')
 *   2. check_and_deduct_merits RPC (Phase 11)
 *   3. log('merit-transaction', deduction)
 *   4. await fn(transactionId)
 *   5. on throw: classify → refund_merits + log('merit-refund') + re-throw
 *   6. on resolve: return value
 *
 * Feature code writes:
 *   const gated = await withMerits(ctx, 'resume_analysis', async (txId) => {
 *     const r = await invokeAnthropicText(...);
 *     if (!r.ok) throw new MeritRefundable(r.status, r.error);  // signals D-02 taxonomy
 *     return buildResponse(r);
 *   });
 *   if (!gated.ok) return gated.response;
 *   return gated.value;
 */
export async function withMerits<T>(
  ctx: MeritGatewayContext,
  feature: string,
  fn: (transactionId: string) => Promise<T>,
): Promise<MeritGatewayResult<T>> {
  // [1] rate limit
  const rl = await checkRateLimit(ctx.userId, ctx.tier, AI_POOL_LIMIT);
  if (!rl.allowed) {
    return { ok: false, response: createRateLimitResponse(rl.retryAfterSeconds, ctx.corsType) };
  }

  // [2] check_and_deduct_merits (Phase 11 RPC — tier is resolved inside the cost table per Phase 11 D-02)
  const supabase = getServiceClient();
  const t0 = Date.now();
  const { data, error } = await supabase.rpc('check_and_deduct_merits', {
    p_user_id: ctx.userId,
    p_feature: feature,
    p_tier: ctx.tier,
  });
  const rpcMs = Date.now() - t0;

  if (error || !data) {
    log.error('check_and_deduct_merits failed', { userId: ctx.userId, feature, error: error?.message });
    return { ok: false, response: genericError(500, 'merit_system_error', ctx.corsType) };
  }

  // Phase 11 return shape (per Phase 11 D-05):
  //   success:  { success: true, remaining_balance, deducted_from, transaction_id }
  //   error:    { error: 'insufficient_merits' | 'tier_locked', upgrade_required: true }
  if ((data as any).error === 'insufficient_merits') {
    return { ok: false, response: insufficientMeritsResponse(ctx.corsType) };
  }
  if ((data as any).error === 'tier_locked') {
    return { ok: false, response: tierLockedResponse(ctx.corsType) };
  }

  const transactionId: string = (data as any).transaction_id;

  // [3] transaction log (NFR-09)
  log.info('merit-transaction', {
    user_id: ctx.userId,
    feature,
    transaction_id: transactionId,
    deducted_from: (data as any).deducted_from,
    remaining_balance: (data as any).remaining_balance,
    rpc_duration_ms: rpcMs,   // NFR-01 perf tracking
  });

  // [4] run callback; classify errors per D-02
  try {
    const value = await fn(transactionId);
    return { ok: true, value, transactionId };
  } catch (err: any) {
    const refundable =
      err?.name === 'MeritRefundable' ||
      (typeof err?.status === 'number' && isRefundableAnthropicError(err.status, err?.message ?? ''));

    if (refundable) {
      const { error: refundError } = await supabase.rpc('refund_merits', {
        p_user_id: ctx.userId,
        p_transaction_id: transactionId,
      });
      if (refundError) {
        log.error('refund_merits failed', { userId: ctx.userId, transactionId, error: refundError.message });
      } else {
        log.info('merit-refund', {
          user_id: ctx.userId,
          feature,
          transaction_id: transactionId,
          reason: err?.status ?? 'unknown',
        });
      }
    } else {
      log.warn('merit-non-refundable-error', {
        user_id: ctx.userId,
        feature,
        transaction_id: transactionId,
        error: err?.message ?? String(err),
      });
    }
    throw err;  // re-throw regardless — caller decides how to respond
  }
}

export class MeritRefundable extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'MeritRefundable';
    this.status = status;
  }
}

function insufficientMeritsResponse(corsType: CorsType): Response { /* 402 */ }
function tierLockedResponse(corsType: CorsType): Response { /* 403 */ }
function genericError(status: number, code: string, corsType: CorsType): Response { /* helper */ }
```

**Key points:**
- Return type is `MeritGatewayResult<T>` not `Promise<T>` — this lets the gateway own 429/402/403 response formatting without the caller having to try/catch every path (cleaner than throwing for "soft" denials).
- Errors from the callback are thrown upward AFTER refund handling. Callers can still wrap the whole thing in a try/catch for generic 500s.
- Works for BOTH streaming and non-streaming callers: streaming functions return the `Response` containing the `ReadableStream` from inside `fn`; gateway just passes it through. Gateway never reads/consumes the stream.
- `MeritRefundable` is the explicit signal. Features that call `invokeAnthropicText` and get `{ok: false, status}` should convert that to `throw new MeritRefundable(r.status, r.error)` at the call site — keeps the gateway simple and doesn't force introspection of a zoo of error shapes.
- `rpc_duration_ms` is logged for NFR-01 observability. Perf regressions are visible without a separate monitor.

### Pattern 2: Per-feature flag branch (D-06)

```ts
// analyze-resume/index.ts — exact shape to apply at the top of the existing handler body
import { MERIT_SYSTEM_ENABLED, withMerits, MeritRefundable } from '../_shared/merit-gateway.ts';
import { checkAndRecordUsage, createUsageLimitResponse } from '../_shared/usage-checker.ts';

// ... existing imports, existing handler up to the auth/context resolution ...

const userContext = await requireInternalOrUserAuth(req);
if (!userContext) { /* internal worker path unchanged */ }

// === Phase 13 branch ===
if (MERIT_SYSTEM_ENABLED) {
  const gated = await withMerits(
    { userId: userContext.userId, tier: userContext.tier as any, corsType: 'user' },
    'resume_analysis',
    async (_txId) => {
      // Existing body lifted verbatim — no logic changes
      const r1 = await invokeAnthropicText({...});
      if (!r1.ok) throw new MeritRefundable(r1.status, r1.error);
      // ... rest of existing resume analysis body ...
      return buildFinalResponse(...);
    },
  );
  if (!gated.ok) return gated.response;
  return gated.value;
}

// === Legacy path (unchanged) ===
const usage = await checkAndRecordUsage(userContext.userId, 'resume_analysis');
if (!usage.allowed) return createUsageLimitResponse(usage.resetDate, usage.tier, corsHeaders({type: 'user'}));
// ... existing body ...
```

**Invariants:**
- The legacy `if (usageUserId) { checkAndRecordUsage(...) }` block in the existing handlers is moved INSIDE the `else` branch and left byte-identical (MIG-05 regression test requires this).
- `checkRateLimit` call at the top of existing handlers (e.g. `analyze-resume/index.ts:229`) must be REMOVED from the non-merit path only if it's per-feature (5/15/30) — the pooled 60/hr limiter inside `withMerits` is a different key and runs on the merit path only. The legacy path keeps its existing per-feature limiter. Both paths are thus rate-limited under their respective contracts.
- **Potential conflict:** if a feature has both per-feature (5/15/30) rate limit AND the pooled limiter, both still run on the merit path (per-feature runs outside `withMerits`, pooled runs inside). This is acceptable — the per-feature limit is the tighter constraint and is hit first. Do NOT delete the per-feature limiter "to simplify" — it's an additive safety net.

### Pattern 3: `submit-*-job` deduction at submission (D-07)

The async queue pattern in this repo is:
- `submit-resume-analysis-job` — user-facing, returns `{ job_id }` after queuing
- `process-resume-analysis-job` — internal worker, picks up job_id, does Anthropic work

**D-07 rule:** `withMerits` wraps submission, NOT processing. Workflow:

```ts
// submit-resume-analysis-job/index.ts
if (MERIT_SYSTEM_ENABLED) {
  const gated = await withMerits(ctx, 'resume_analysis', async (txId) => {
    const { data: job } = await supabase.from('analysis_jobs').insert({
      /* ... + metadata.merit_transaction_id = txId */
    }).select().single();
    return new Response(JSON.stringify({ job_id: job.id }), {...});
  });
  if (!gated.ok) return gated.response;
  return gated.value;
}
```

- If submission succeeds → Merit is deducted, job is queued, user waits.
- If the async processor later fails with a refundable Anthropic error → the processor cannot call `refund_merits` directly (D-03 says features don't call it). Instead, it must mark the job as `failed` with a refundable-error sentinel, and a SEPARATE reaper (or the processor itself, once it is allowed by this phase's contract update) calls `refund_merits(metadata.merit_transaction_id)`.

**OPEN QUESTION (see § Open Questions):** D-03 says "Features never call `refund_merits` directly," but async processors need some refund path. Recommended resolution: processors invoke a small refund-only helper `refundMeritsForJob(txId)` that is ALSO exported from `merit-gateway.ts`. It's not a second callsite of `refund_merits` — it's the same gateway. D-03 should be read as "no ad-hoc refund calls outside the gateway module."

### Pattern 4: Admin metrics edge function

```ts
// admin-merit-metrics/index.ts
import { handleRequest } from '../_shared/handler.ts';
import { z } from 'npm:zod@3.25';

const ADMIN_EMAILS = (Deno.env.get('ADMIN_EMAILS') ?? 'strivolife@gmail.com')
  .split(',').map(e => e.trim().toLowerCase());

Deno.serve((req) => handleRequest(req, {
  authMode: 'internal-or-user',
  schema: z.object({}).strip(),   // no body required
  corsType: 'user',
  handler: async (_body, userCtx) => {
    // Admin allowlist gate (D-13)
    if (userCtx && !ADMIN_EMAILS.includes(userCtx.email.toLowerCase())) {
      return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: {...} });
    }

    const supabase = getServiceClient();
    const [circ, feat, shop, conv] = await Promise.all([
      supabase.from('v_merits_in_circulation').select('*').single(),
      supabase.from('v_feature_consumption_daily').select('*'),
      supabase.from('v_shop_purchases_daily').select('*'),
      supabase.from('v_conversion_funnel').select('*'),
    ]);

    return new Response(JSON.stringify({
      merits_in_circulation: circ.data,
      feature_consumption_daily: feat.data,
      shop_purchases_daily: shop.data,
      conversion_funnel: conv.data,
    }), { status: 200, headers: {...} });
  },
}));
```

**Env var:** `ADMIN_EMAILS` — comma-separated list, defaults to `strivolife@gmail.com`. Matches the existing `ADMIN_EMAIL` convention (singular) in `send-notification-email/index.ts:17` and `notify-admin-activity/index.ts:24` but allows multiple admins. Add a secondary fallback to read `ADMIN_EMAIL` (singular) if `ADMIN_EMAILS` (plural) is unset, to preserve backwards compat.

**Existing admin role alternative:** `admin-delete-user/index.ts:46` uses `user_roles` table with `role='admin'`. That's a better long-term mechanism (allowlist is brittle) but would require Phase 13 to seed or verify that table. **Recommendation:** allowlist-first (fewer moving parts), with `user_roles.role='admin'` as a fallback check so future admins in the DB work without a secret update. Document this clearly.

### Pattern 5: Alerts edge function + migration

```sql
-- migration excerpt
CREATE TABLE IF NOT EXISTS public.alert_state (
  alert_name    text PRIMARY KEY,
  last_fired_at timestamptz NULL,
  last_ok_at    timestamptz NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.alert_state ENABLE ROW LEVEL SECURITY;
-- No policies; service role only (consistent with Phase 10 D-17)

-- Views (all read-only; views don't need RLS because they inherit from base tables which DO have RLS)
CREATE OR REPLACE VIEW public.v_merits_in_circulation AS
  SELECT SUM(subscription_balance + shop_balance)::bigint AS total_merits,
         SUM(subscription_balance)::bigint                AS total_subscription,
         SUM(shop_balance)::bigint                        AS total_shop,
         COUNT(*)::bigint                                 AS user_count
  FROM public.user_merits;

CREATE OR REPLACE VIEW public.v_feature_consumption_daily AS
  SELECT feature,
         date_trunc('day', created_at)::date AS day,
         SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END)::bigint AS consumed,
         SUM(CASE WHEN amount > 0 AND balance_type = 'refund' THEN amount ELSE 0 END)::bigint AS refunded,
         COUNT(*) FILTER (WHERE amount < 0)::bigint AS deduction_count,
         COUNT(*) FILTER (WHERE balance_type = 'refund')::bigint AS refund_count
  FROM public.merit_transactions
  WHERE feature IS NOT NULL
  GROUP BY feature, date_trunc('day', created_at);

CREATE OR REPLACE VIEW public.v_shop_purchases_daily AS
  SELECT date_trunc('day', created_at)::date AS day,
         pack_size,
         COUNT(*) FILTER (WHERE status = 'succeeded')::bigint AS succeeded,
         COUNT(*) FILTER (WHERE status = 'failed')::bigint    AS failed,
         SUM(CASE WHEN status = 'succeeded' THEN price_cents ELSE 0 END)::bigint AS revenue_cents
  FROM public.merit_shop_purchases
  GROUP BY date_trunc('day', created_at), pack_size;

-- v_conversion_funnel depends on Phase 12's subscription_events table shape.
-- MUST be confirmed against Phase 12's final migration (see Open Question O-1).
-- Provisional shape:
CREATE OR REPLACE VIEW public.v_conversion_funnel AS
  SELECT date_trunc('month', COALESCE(pro.created_at, elite.created_at))::date AS month,
         COUNT(DISTINCT pro.user_id)                                            AS upgraded_to_pro,
         COUNT(DISTINCT elite.user_id)                                          AS upgraded_to_elite
  FROM public.profiles p
  LEFT JOIN LATERAL (
    SELECT s.user_id, s.created_at
    FROM public.stripe_webhook_events s
    WHERE s.event_type = 'customer.subscription.created'
      AND (s.payload->>'user_id')::uuid = p.id
      AND (s.payload->>'tier') = 'pro'
    ORDER BY s.created_at LIMIT 1
  ) pro ON true
  LEFT JOIN LATERAL (
    -- same, for elite
  ) elite ON true
  GROUP BY 1;

-- cron tick (read keep-warm migration for the pattern)
SELECT cron.schedule(
  'check-merit-alerts',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url     := '<env-specific>/functions/v1/check-merit-alerts',
    headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'x-internal-job-secret', '<INTERNAL_JOB_SECRET>'
              ),
    body    := '{}'::jsonb
  );
  $$
);
```

**Per-environment cron caveat:** `keep-warm` migration doc (`20260310000000_add_keep_warm_cron.sql`) warns that cron rows are env-specific and must be run via SQL editor, not `supabase db push`. Phase 13's cron row has the same constraint. Planner MUST document this in the migration header and in the deploy runbook. Recommend a placeholder-based SQL template + a separate ops-only file per environment.

### Pattern 6: `check-merit-alerts` handler

```ts
Deno.serve((req) => handleRequest(req, {
  authMode: 'internal',
  schema: z.object({}).strip(),
  corsType: 'user',  // unused; internal handler doesn't serve browsers
  handler: async () => {
    const supabase = getServiceClient();
    const results = await Promise.all([
      evaluateNegativeBalance(supabase),     // D-16.1 — fire immediately, no debounce
      evaluateAiFailureRate(supabase),       // D-16.2 — 1h debounce
      evaluateShopFailureRate(supabase),     // D-16.3 — 1h debounce
    ]);
    return new Response(JSON.stringify({ ok: true, results }), { status: 200 });
  },
}));

async function evaluateAiFailureRate(supabase) {
  const { data } = await supabase.rpc('get_ai_failure_rate_1h');
  const rate = data?.rate ?? 0;

  if (rate > 0.05) {
    const { data: state } = await supabase.from('alert_state')
      .select('last_fired_at').eq('alert_name', 'ai_failure_rate_high').maybeSingle();

    const lastFired = state?.last_fired_at ? new Date(state.last_fired_at).getTime() : 0;
    if (Date.now() - lastFired > 60 * 60 * 1000) {   // 1h debounce
      await sendAlertEmail('ai_failure_rate_high', rate);
      await supabase.from('alert_state').upsert({
        alert_name: 'ai_failure_rate_high',
        last_fired_at: new Date().toISOString(),
      });
    }
  } else {
    // Update last_ok_at for visibility (optional but useful)
    await supabase.from('alert_state').upsert({
      alert_name: 'ai_failure_rate_high',
      last_ok_at: new Date().toISOString(),
    });
  }
}
```

**Alert delivery:** reuse `send-strivo-email` via `fetch(...)` with `x-internal-job-secret` header, following the pattern in `notify-admin-activity/index.ts:145`. Do NOT import Resend directly — keeps only one place that knows the API key.

**Helper RPCs to add in the migration:**
- `get_ai_failure_rate_1h() RETURNS (rate float, deduction_count int, refund_count int)` — pure SQL, reads `merit_transactions` and computes the ratio. Cheaper than doing it in JS.
- `get_shop_failure_rate_1h() RETURNS (rate float, succeeded int, failed int)` — same for `merit_shop_purchases`.
- Views are fine for dashboards; RPCs are fine for alerts (simpler signature for the alert function).

### Anti-Patterns to Avoid
- **Calling `refund_merits` from anywhere outside `merit-gateway.ts`** — breaks D-03; any future code calling the RPC directly is a bug. Add a CI grep check (`rg "refund_merits" supabase/functions --glob='!_shared/merit-gateway.ts'` must return zero matches outside the tests dir).
- **Deducting in `process-*-job` processors** — D-07; deduction happens at submission only. If the user cancels mid-queue or the job never runs, the Merit is still spent (documented limitation; refund path is failure-only, not cancel-only).
- **Reading `MERIT_SYSTEM_ENABLED` inside `withMerits`** — the flag is the PER-HANDLER switch (D-06), not a gateway switch. The gateway assumes it's enabled when called.
- **Logging before the RPC succeeds** (D-12) — `log.info('merit-transaction', ...)` must come AFTER the `check_and_deduct_merits` RPC returns `success: true`. Never before.
- **Materializing views** — D-14 says live. The refresh overhead on a live production migration is a footgun.
- **Deleting `usage-checker.ts`, `checkAndRecordUsage`, or the legacy `checkRateLimit('analyze-resume', ...)` calls** — D-18 forbids. The regression test must prove byte-identical legacy path.
- **Forgetting the per-environment cron row** — the keep-warm migration warns this; Phase 13 must repeat the warning and document the ops runbook step.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate limiting | New DB table, sliding window code | `_shared/rate-limiter.ts` with `key: 'ai-analyses-all'` | Existing Postgres fixed-window + fail-open semantics match D-08/D-09 exactly |
| Merit deduction RPC | Direct INSERT into `merit_transactions` | `check_and_deduct_merits` (Phase 11) via `getServiceClient().rpc(...)` | Phase 11 owns atomicity; direct writes break MER-12 reconciliation |
| Refund logic | Custom reverse-INSERT | `refund_merits(transaction_id)` (Phase 11) | Idempotent, restores exact buckets, writes companion rows |
| Auth gates | Bespoke JWT check | `requireInternalOrUserAuth`, `requireAuth('internal')` | `_shared/auth.ts` handles timing-safe secret comparison |
| Handler boilerplate | Raw `Deno.serve` | `handleRequest` from `_shared/handler.ts` | CORS + Zod + auth in one call |
| Structured logging | `console.log(JSON.stringify(...))` | `createLogger('merit-gateway').info(...)` | Consistent `{level, fn, ts, reqId}` envelope; Supabase log explorer parses it |
| Anthropic call | New fetch wrapper | `invokeAnthropicText` / `streamAnthropicText` | Already has classified error returns + `AI_TEST_MODE` fixture mode |
| Alert email delivery | Direct Resend fetch | `fetch('/functions/v1/send-strivo-email', ...)` via internal secret | Single place owns Resend key |
| Scheduled triggers | External cron service | `pg_cron` + `pg_net.http_post` | Same pattern as `keep-warm` (migration `20260310000000`) |
| Feature flag system | DB-backed flag with cache | Env var read at module scope | D-05 locked; matches `INTERNAL_JOB_SECRET` / `ANTHROPIC_MODEL_TEXT` pattern |
| Admin access control | Custom session check | `user_roles.role='admin'` (long-term) + `ADMIN_EMAILS` env var (allowlist) | `admin-delete-user` already uses the `user_roles` approach |

**Key insight:** Almost every building block for Phase 13 already exists. The phase is 80% integration glue and 20% new code. The new code is three files: `merit-gateway.ts`, `admin-merit-metrics/index.ts`, `check-merit-alerts/index.ts`, plus one migration. Every edit to an existing feature is a mechanical D-06 branch insertion.

## Runtime State Inventory

Phase 13 is a wiring phase, not a rename or migration, BUT it introduces enough runtime state to merit an inventory.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `alert_state` table ships empty; `merit_transactions` receives new rows via gateway; NO existing records need migration | Data migration: NONE. Code edit: new rows via Phase 11 RPC only. |
| Live service config | `MERIT_SYSTEM_ENABLED` env var — must be set to `false` default in BOTH staging and production secrets before any feature ships. `ADMIN_EMAILS` env var — must be set in both envs. `AI_FORCE_FAILURE` — must NOT be set in production (test-only). Cron row for `check-merit-alerts` — must be inserted per-environment via SQL editor (see keep-warm pattern). | Ops runbook additions: 3 secrets + 1 cron SQL per environment. |
| OS-registered state | None (no pm2, no systemd, no Task Scheduler in this repo) | None — verified by grep |
| Secrets/env vars | New: `MERIT_SYSTEM_ENABLED`, `ADMIN_EMAILS` (optional fallback to `ADMIN_EMAIL`). Existing reused: `ANTHROPIC_API_KEY`, `INTERNAL_JOB_SECRET`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. No secret key renames. | Set new secrets via `supabase secrets set ...` in both envs before deploy. |
| Build artifacts / installed packages | No new npm packages; no new Deno imports outside `_shared/`; no pip, no cargo, no docker. | None. |

**The canonical question:** After the migration runs and the functions are deployed, what runtime state remains with the old behavior? Answer: **the `MERIT_SYSTEM_ENABLED` flag default is `false`**, so until an operator sets it to `true` in production, the legacy path stays active. This is intentional (MIG-05) and is the canary for Phase 21 cutover.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase CLI | Function deploys + migration push | ✓ | 2.76.9 (project pinned) | — |
| Deno runtime | Edge function execution | ✓ | 2+ (project pinned) | — |
| Postgres `pg_cron` | `check-merit-alerts` scheduled trigger | ✓ | Enabled already (see `20260310000000_add_keep_warm_cron.sql`) | Manual 15-min trigger if cron fails — emit log + runbook |
| Postgres `pg_net` | pg_cron → edge function HTTP call | ✓ | Enabled already (same migration) | — |
| Resend | Alert email delivery | ✓ | `RESEND_API_KEY` set in both envs per README | `send-strivo-email` failure is non-fatal — alert is degraded but function continues |
| Anthropic API | Tested via `AI_FORCE_FAILURE` gate in tests, real calls in prod | ✓ | `ANTHROPIC_API_KEY` env var | — |
| `user_roles` table with admin rows | `admin-merit-metrics` fallback gate | ✓ | Exists (`admin-delete-user/index.ts:46` queries it) | Primary `ADMIN_EMAILS` env var allowlist; if table empty, env var is the sole gate |

**Missing dependencies with no fallback:** NONE.

**Missing dependencies with fallback:** NONE (all green).

## Common Pitfalls

### Pitfall 1: Double rate-limiting on legacy path
**What goes wrong:** A developer removes the per-feature 5/15/30 rate limit call on `analyze-resume` thinking the pooled 60/hr limiter replaces it — but the pooled limiter only runs on the merit path inside `withMerits`. Legacy path becomes unprotected.
**Why it happens:** D-08 says "single pooled counter across all AI features" and developers conflate "pooled" with "the only one."
**How to avoid:** D-06 branch keeps BOTH limiters on the merit path (per-feature runs at handler top, pooled runs inside `withMerits`). Legacy path keeps its per-feature limiter. Regression test: legacy path rejects the 6th request in an hour for a Free user on `analyze-resume`.
**Warning signs:** Feature handler diff shows removed `checkRateLimit` calls OUTSIDE the `if (MERIT_SYSTEM_ENABLED)` branch.

### Pitfall 2: Async processor double-deduction
**What goes wrong:** A worker processor (`process-resume-analysis-job`) has `withMerits` added "for consistency," causing a second deduction per job.
**Why it happens:** Copy-paste from the submit function. D-07 specifically forbids this.
**How to avoid:** Processors MUST NOT call `withMerits` or `check_and_deduct_merits`. They use `metadata.merit_transaction_id` from the job row for refund flows only. Grep check in CI: processors must not import `merit-gateway.ts` except for `refundMeritsForJob`.
**Warning signs:** PR diff on a `process-*-job/index.ts` shows `import { withMerits }`.

### Pitfall 3: Refund on non-Anthropic failures
**What goes wrong:** `JSON.parse()` fails on a 200 OK Anthropic response; the throw propagates and the gateway refunds — but Anthropic already billed the user's cost.
**Why it happens:** D-02 is narrow but the thrown error shape is generic; a naive `catch(e)` refunds on everything.
**How to avoid:** `isRefundableAnthropicError(status, msg)` in `merit-gateway.ts` only refunds on 5xx/529/408/network-pattern errors, AND `MeritRefundable` is the explicit in-band signal. Anything else (parse, validate, zod) re-throws WITHOUT refund.
**Warning signs:** `merit_transactions` shows refund rows with no matching `error: 529` log entry.

### Pitfall 4: `MERIT_SYSTEM_ENABLED` read at request time vs module scope
**What goes wrong:** Operator flips the flag with `supabase secrets set ...` but existing warm workers don't pick it up because the flag is read per-request, causing inconsistent behavior across requests until all workers restart.
**Why it happens:** If read per-request, warm workers with different cached states race. If read at module scope, the flip requires a worker restart — clean cutover.
**How to avoid:** Read at module scope (`const MERIT_SYSTEM_ENABLED = ...` at the top of `merit-gateway.ts`) — D-05 explicitly endorses this. Document the ~30s propagation window in the deploy runbook.
**Warning signs:** `/functions/v1/analyze-resume` returns mixed 402/usage_limit_reached responses after a flag flip.

### Pitfall 5: Cron row deployed via `supabase db push` instead of per-env SQL editor
**What goes wrong:** The Phase 13 migration includes a `SELECT cron.schedule(...)` with a hardcoded staging URL; pushing to production creates a cron job that calls staging.
**Why it happens:** `supabase db push` runs the migration file as-is; per-env URL substitution doesn't happen.
**How to avoid:** Follow the `keep-warm` migration convention — migration file contains tables/views/`alert_state`, but the `cron.schedule` call is in a SEPARATE per-env template SQL that operators run manually. Header comment in migration: "THIS MIGRATION DOES NOT INCLUDE CRON SCHEDULING. See `docs/phase-13-cron-setup.sql` for the per-env cron row."
**Warning signs:** Production cron fires against staging URL; staging alerts never fire.

### Pitfall 6: `v_conversion_funnel` references Phase 12 tables before Phase 12 ships
**What goes wrong:** Phase 13 migration references `stripe_webhook_events` (or whatever Phase 12 names its events table) and fails because Phase 12 hasn't deployed.
**Why it happens:** Migration timestamp ordering.
**How to avoid:** Verify Phase 12's event table name during planning (see Open Question O-1). Phase 13's migration MUST have a strictly later timestamp than Phase 12's. Confirm Phase 12 plans have shipped before running Phase 13. If Phase 12 is still in flight, the `v_conversion_funnel` view can be defined but left unpopulated (no rows) until Phase 12's webhook starts writing events.
**Warning signs:** Migration fails with `relation "stripe_webhook_events" does not exist`.

### Pitfall 7: Alert debounce false-reset after DB error
**What goes wrong:** `check-merit-alerts` runs, the `alert_state` upsert fails (transient DB error), next tick sees no state and fires again. Duplicate emails.
**Why it happens:** Upsert is treated as fire-and-forget.
**How to avoid:** Upsert the debounce state BEFORE sending the email. If upsert fails, log warn and skip the email for this tick (next tick retries). Email delivery is the side effect; state is the source of truth.
**Warning signs:** Duplicate alert emails during transient Supabase incidents.

### Pitfall 8: Test mode env var leaks into production
**What goes wrong:** `AI_FORCE_FAILURE=1` gets accidentally set in the production secret store; every AI call fails and refunds; dashboards show a 100% refund rate.
**Why it happens:** Copy-paste from staging secrets or a debug session.
**How to avoid:** The gate in `anthropic.ts` MUST additionally check `Deno.env.get('AI_TEST_MODE') === 'true'` — i.e. `AI_FORCE_FAILURE` only takes effect when `AI_TEST_MODE=true` is also set. Two-key defense. Deploy runbook explicitly forbids setting either in production.
**Warning signs:** Production `merit-gateway` logs show `reason: 'forced-failure'` entries.

## Code Examples

### Example 1: Minimal `withMerits` usage in a non-streaming feature

```ts
// analyze-career/index.ts — fragment
import { withMerits, MeritRefundable, MERIT_SYSTEM_ENABLED } from '../_shared/merit-gateway.ts';

// inside the existing handler, after auth:
if (MERIT_SYSTEM_ENABLED) {
  const gated = await withMerits(
    { userId, tier: tier as any, corsType: 'user' },
    'career_compass',
    async () => {
      const r = await invokeAnthropicText({ model, messages, maxTokens: 6000 });
      if (!r.ok) throw new MeritRefundable(r.status, r.error);
      return new Response(JSON.stringify({ analysis: JSON.parse(r.text) }), {
        status: 200,
        headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' },
      });
    },
  );
  if (!gated.ok) return gated.response;
  return gated.value;
}
// ... legacy branch below (unchanged)
```

### Example 2: Streaming feature — deduct up front, stream after

```ts
// analyze-resume/index.ts — fragment for the streaming path
if (MERIT_SYSTEM_ENABLED && body.stream === true) {
  const gated = await withMerits(
    { userId, tier: userTier as any, corsType: 'user' },
    'resume_analysis',
    async (_txId) => {
      // Stream is consumed by the client; we cannot observe Anthropic 5xx mid-stream here.
      // Pre-check via a short non-streaming probe is not viable. Accept limitation:
      // refund only fires if initial stream setup fails (400/401/5xx before first chunk).
      const stream = buildAnthropicSSEStream(...);
      return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', ...corsHeaders({ type: 'user' }) },
      });
    },
  );
  if (!gated.ok) return gated.response;
  return gated.value;
}
```

**Streaming caveat:** If Anthropic sends 200 OK and then fails mid-stream, the gateway cannot refund — the callback already returned a `Response` by then. This matches D-02's exclusion of user-cancelled streams ("partial Anthropic billing already incurred"). Document this limitation in the TEST-07 test plan: streaming failures test only pre-stream setup failures.

### Example 3: Refund path for async jobs

```ts
// process-resume-analysis-job/index.ts — fragment inside the Anthropic-error path
import { refundMeritsForJob } from '../_shared/merit-gateway.ts';  // new export

if (!anthropicResult.ok && isRefundable(anthropicResult.status)) {
  const txId = job.metadata?.merit_transaction_id;
  if (txId) {
    await refundMeritsForJob(job.user_id, txId, 'process-failure');
  }
  await supabase.from('analysis_jobs').update({ status: 'failed', ... }).eq('id', job.id);
  return new Response(...);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `checkAndRecordUsage` per feature + tier limits in `usage_tracking` | `withMerits` pre-call deduction + auto-refund + Merit ledger | Phase 13 (behind flag) / Phase 21 (cutover) | Feature authors no longer care about quotas — gateway enforces |
| Per-feature 5/15/30 rate limits only | Per-feature limits + pooled 60/hr abuse limit | Phase 13 (merit path only) | Better abuse resistance; same legitimate user experience |
| `can_perform_ai_action()` SQL function | `check_and_deduct_merits()` SECURITY DEFINER RPC | Phase 11 + Phase 13 wiring | Atomic deduction; no more TOCTOU between check and record |
| Credits exhausted email from feature handler | Credits exhausted email from feature handler (legacy) + alert on aggregate failure rates (merit) | Phase 13 | User emails unchanged; admin gets aggregate alerts via `check-merit-alerts` |

**Deprecated/outdated:**
- Direct `user_merits` writes from frontend — never was done, but Phase 10 RLS makes it impossible anyway.
- Time-window refund policies — D-10 of Phase 11 rejects; any age is refundable.
- `pg_cron` with hardcoded URLs — still necessary due to Supabase per-env URL constraints; document the limitation, don't try to fix it in Phase 13.

## Project Constraints (from CLAUDE.md)

- **No commits in `.planning/` or changes to `.gitignore`** — planner must ensure no plan/wave/task writes these locations.
- **TypeScript strict mode preserved** — all new edge function files MUST type explicitly, no `any` unless the existing codebase uses it (`supabase.rpc(...)` return types ARE `any` in this repo; OK to cast).
- **Small reversible changes** — Phase 13 honors this: every feature edit is a single `if` branch that can be reverted by removing the branch; the migration is additive-only and can be rolled forward.
- **Production reliability > experimental scaling** — D-18 legacy path preservation directly supports this.
- **No new infrastructure** — Phase 13 introduces zero new services. pg_cron, pg_net, Resend already in use.
- **`rg` for search, `apply_patch` for focused edits** — planner should specify `apply_patch` for the D-06 branch insertions.
- **VITE_ frontend flags vs backend secrets** — `MERIT_SYSTEM_ENABLED` is BACKEND only; no `VITE_MERIT_SYSTEM_ENABLED` — frontend Phase 20 decides its own UI gating.
- **529/overload detection must match `_shared/anthropic.ts`** — D-02 compliance.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Deno test runner (`deno test`) — same as Phase 10/11 edge-level tests |
| Config file | `supabase/functions/deno.json` |
| Quick run command | `deno test supabase/functions/_shared/merit-gateway.test.ts` |
| Full suite command | `.\scripts\run-edge-tests.ps1` (Windows) / `scripts/run-edge-tests.ps1` |

pgTAP tests (TEST-01/02/03) ship with Phase 11. Phase 13's tests are Deno edge-function tests.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BACK-01 | `analyze-resume` with flag on calls `check_and_deduct_merits` | unit | `deno test supabase/functions/_shared/merit-gateway.test.ts` | ❌ Wave 0 |
| MER-11 | Refund on Anthropic 529 | integration | `deno test supabase/functions/analyze-resume/merit-refund.test.ts` | ❌ Wave 0 |
| NFR-01 | Gateway RPC round-trip < 100ms | perf-assertion | `deno test supabase/functions/_shared/merit-gateway.perf.test.ts` | ❌ Wave 0 |
| NFR-05 | 61st request in hour → 429 | unit | `deno test supabase/functions/_shared/merit-gateway.rate.test.ts` | ❌ Wave 0 |
| NFR-09 | Deduction logs include all 5 fields | unit (log capture) | same as BACK-01 test | ❌ Wave 0 |
| NFR-10 | Admin metrics endpoint returns 4 aggregates | unit | `deno test supabase/functions/admin-merit-metrics/index.test.ts` | ❌ Wave 0 |
| NFR-11 | Alert evaluator fires on threshold breach | unit | `deno test supabase/functions/check-merit-alerts/index.test.ts` | ❌ Wave 0 |
| MIG-05 | Flag off → legacy path byte-identical | regression | `deno test supabase/functions/analyze-resume/legacy-unchanged.test.ts` | ❌ Wave 0 |
| TEST-07 | Deduction + refund round-trip on mocked AI failure | integration | `deno test supabase/functions/analyze-resume/test-07.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `deno test <path-to-touched-test-file>` — tight feedback loop per file.
- **Per wave merge:** `.\scripts\run-edge-tests.ps1` — full Deno suite + any pgTAP deltas.
- **Phase gate:** Full suite green before `/gsd-verify-work`. NFR-01 perf assertion must show `< 100ms p99` on 10 runs.

### Wave 0 Gaps
- [ ] `supabase/functions/_shared/merit-gateway.ts` — source file
- [ ] `supabase/functions/_shared/merit-gateway.test.ts` — unit tests for `withMerits` happy path, insufficient_merits, tier_locked, rate_limit, refund on 529, refund on 408, NO refund on parse error
- [ ] `supabase/functions/_shared/merit-gateway.perf.test.ts` — NFR-01 assertion (p99 < 100ms against warm local DB)
- [ ] `supabase/functions/_shared/merit-gateway.rate.test.ts` — pooled limiter exhaustion
- [ ] `supabase/functions/admin-merit-metrics/index.test.ts` — auth gate + view read + aggregation
- [ ] `supabase/functions/check-merit-alerts/index.test.ts` — negative balance fires immediately, AI failure rate debounced, shop failure rate debounced, DB error non-fatal
- [ ] `supabase/functions/analyze-resume/test-07.test.ts` — TEST-07 canonical: force failure via env, assert deduction + refund rows + balance restored
- [ ] `supabase/functions/analyze-resume/legacy-unchanged.test.ts` — regression: flag off → `checkAndRecordUsage` called, `withMerits` NOT called
- [ ] Update `scripts/run-edge-tests.ps1` to register new test files
- [ ] `AI_FORCE_FAILURE` env gate added to `_shared/anthropic.ts` (guarded by `AI_TEST_MODE === 'true'`)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `requireInternalOrUserAuth` + admin allowlist for `admin-merit-metrics`; `requireAuth('internal')` with timingSafeEqual for `check-merit-alerts` |
| V3 Session Management | no | Supabase Auth owns sessions; nothing new introduced |
| V4 Access Control | yes | Admin allowlist (D-13); zero permissive RLS write policies on `alert_state` (Phase 10 D-17 pattern) |
| V5 Input Validation | yes | Zod-strip body validation via `handleRequest` for both new edge functions |
| V6 Cryptography | no | No new secrets, no new signing; reuses existing `INTERNAL_JOB_SECRET` timing-safe comparison |
| V7 Error Handling & Logging | yes | `createSafeErrorResponse` from `_shared/errors.ts`; never leak RPC error messages to client |
| V10 Malicious Code | yes | `AI_FORCE_FAILURE` env gate MUST be compound with `AI_TEST_MODE=true` to prevent accidental production enablement |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Flag toggle race (per-request read) | Tampering | Module-scope env read (D-05); operator restart required for flip |
| Refund replay | Tampering | Phase 11 `refund_merits` is idempotent by `refund_of` check (D-08 of Phase 11) |
| Rate-limit bypass via direct internal worker path | Elevation of Privilege | `withMerits` is only called when `userContext !== null` (legitimate user requests); internal worker path uses its own auth and does not deduct |
| Admin metrics data leakage to non-admins | Information Disclosure | Dual gate: `requireInternalOrUserAuth` + `ADMIN_EMAILS` allowlist + (fallback) `user_roles.role='admin'` check |
| Alert email flooding | DoS | `alert_state` debounce (1h for D-16.2/D-16.3) |
| Forged alerts via leaked `INTERNAL_JOB_SECRET` | Spoofing | Secret rotation runbook; timing-safe comparison already enforced |
| User-supplied `tier` in body overriding userContext | Elevation of Privilege | `handleRequest` strips unknown fields (D-09 of handler); gateway ONLY uses `userContext.tier` from auth, never body |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase 11 `check_and_deduct_merits` returns `{ success, remaining_balance, deducted_from, transaction_id }` on success and `{ error, upgrade_required }` on failure | `withMerits` implementation | [ASSUMED] from Phase 11 CONTEXT D-05/D-06 — Phase 11 plans not yet written. If Phase 11 names the return field `deduction_id` instead of `transaction_id`, gateway needs a one-line rename. See Open Question O-2. |
| A2 | Phase 11 `refund_merits(user_id, transaction_id)` accepts the UUID returned above as `transaction_id` | Refund path | [ASSUMED] from Phase 11 CONTEXT D-08. Same risk as A1 — trivial rename if wrong. |
| A3 | Phase 12's Stripe webhook writes to a `stripe_webhook_events` table with `event_type`, `payload jsonb`, `created_at` columns | `v_conversion_funnel` view | [ASSUMED] based on Phase 12 CONTEXT D-10 which says "recommendation: reuse the existing table." View definition must be confirmed against Phase 12's actual migration before merge. See Open Question O-1. |
| A4 | `user_roles` table exists with `role='admin'` column (used by `admin-delete-user`) | Admin allowlist fallback | [VERIFIED: grep] — `admin-delete-user/index.ts:46` references it. |
| A5 | `send-strivo-email` accepts a body shape compatible with alert delivery (subject + body + to) | Alert email pattern | [CITED: supabase/functions/send-strivo-email exists] — exact body shape needs to be read when writing `check-merit-alerts`. |
| A6 | `pg_cron` + `pg_net` are enabled in both staging and production | Cron trigger | [VERIFIED: migrations] — `20260310000000_add_keep_warm_cron.sql` already uses them successfully. |
| A7 | Anthropic classifies overload errors as HTTP 529 | Refund trigger | [CITED: `_shared/anthropic.ts` line 641-646 returns `response.status` directly] + [CITED: `analyze-resume/index.ts:16-18` comment "529 (Anthropic overloaded)"] |
| A8 | `_shared/rate-limiter.ts` works correctly with a new arbitrary key string | Pooled 60/hr limiter | [VERIFIED: rate-limiter.ts lines 80-113 — `config.key` is a free-form string, no allowlist] |
| A9 | NFR-01 100ms budget is achievable against a warm Supabase Postgres with the Phase 11 RPC (single `FOR UPDATE` lock + 1-2 INSERTs) | Performance | [ASSUMED] — Phase 11 hasn't been benchmarked. Plan includes a perf assertion test that will prove or disprove this. If the RPC exceeds 100ms on warm DB, escalate to Phase 11 for optimization. |
| A10 | The `admin-merit-metrics` view queries complete in reasonable time with live (non-materialized) views | Admin metrics perf | [ASSUMED] — D-14 accepts this as admin-only + low-QPS. Worst case: a perf-phase materializes later. Not a phase-blocking risk. |
| A11 | Interview Prep Coach (BACK-06/07) will be shipped in Phase 19 and is NOT gated in Phase 13 | D-07 feature list | [CITED: Phase 13 CONTEXT line 26] — "Interview Prep Coach backend rewrite — Phase 19." Current `interview-prep-coach/index.ts` exists and uses legacy `checkAndRecordUsage`; Phase 13 still adds the D-06 branch to it. |

## Open Questions (RESOLVED)

### O-1: Phase 12 subscription-events table shape
**What we know:** Phase 12 CONTEXT D-10 says "recommendation: reuse the existing `stripe_webhook_events` table." The Phase 07 webhook does use it. Phase 12 hasn't locked a plan yet.
**What's unclear:** Exact column names (`payload` vs `event_data` vs `raw`), exact event types routed, whether Phase 12 adds a discriminator column for tier transitions.
**Recommendation:** Planner's first task after research is to read Phase 12's PLAN.md (once it exists) and pin the exact view definition. If Phase 12 is still pre-plan, the view definition is a PROVISIONAL placeholder and MUST be marked with a TODO in the migration + a follow-up task in Phase 13's last wave.

**RESOLVED:** `v_conversion_funnel` ships as a PROVISIONAL view with a documented zero-row stub fallback in the Phase 13 migration; reconciliation with Phase 12's final shape is a follow-up task in Plan 04, not a Phase 13 blocker.


### O-2: Phase 11 RPC return field naming
**What we know:** Phase 11 CONTEXT D-06 says the RPC returns the UUID as "the `transaction_id` in the response." Discretion item allows either `transaction_id` dedicated field or embedded in `deducted_from`.
**What's unclear:** Which form Phase 11 planner actually picks.
**Recommendation:** Phase 13 planner adds a Phase 11 contract ask to the research output: "Phase 11 MUST return the deduction UUID as a field named `transaction_id` in the top-level response object." If Phase 11 PLAN locks a different name, Phase 13 does a one-line gateway rename. No downstream impact.

**RESOLVED:** The gateway assumes `transaction_id` as a top-level field on the RPC response; if Phase 11 lands a different name, the fix is a one-line rename in `_shared/merit-gateway.ts` and is accepted as low-risk drift.


### O-3: Processor refund signaling for async jobs
**What we know:** D-03 says features never call `refund_merits` directly. D-07 says processors do NOT deduct. But processors CAN fail with refundable Anthropic errors.
**What's unclear:** Does the processor call `refund_merits` indirectly (violating strict reading of D-03), or does a SEPARATE reaper scan failed jobs and refund?
**Recommendation:** Export a `refundMeritsForJob(userId, transactionId, reason)` helper from `merit-gateway.ts`. Processors import it. Reading of D-03 becomes: "refund is always owned by the gateway module, never called outside it — `withMerits` and `refundMeritsForJob` are both gateway surfaces." Document in the gateway file header.

**RESOLVED:** `refundMeritsForJob(userId, transactionId, reason)` is exported from `_shared/merit-gateway.ts` as the sole processor refund surface. D-03 is interpreted as 'refund control lives inside the gateway module' — both `withMerits` and `refundMeritsForJob` are gateway-owned.


### O-4: Where does the Interview Prep Coach branch live in Phase 13 vs Phase 19?
**What we know:** Phase 13 CONTEXT D-07 says Interview Prep "entry points when they exist." The existing `interview-prep-coach/index.ts` exists today but uses legacy `checkAndRecordUsage`. Phase 19 rewrites it.
**What's unclear:** Does Phase 13 add the D-06 branch to the existing Interview Prep function, or wait for Phase 19 to do it as part of the rewrite?
**Recommendation:** Phase 13 ADDS the branch to the existing function (mechanical edit, matches D-07 wording). Phase 19 then rewrites the body freely — the branch structure transfers naturally.

**RESOLVED:** Phase 13 adds the D-06 branch to the existing `interview-prep-coach/index.ts` as a mechanical edit. Phase 19 rewrites the body later; the branch structure transfers naturally.


### O-5: Should `user_roles` admin check be primary or fallback?
**What we know:** `ADMIN_EMAILS` env is simpler; `user_roles` is more robust.
**What's unclear:** Which ordering minimizes ops pain while keeping security tight.
**Recommendation:** Primary = `ADMIN_EMAILS` env (fast, no DB read on every request); fallback = `user_roles` query (only if `ADMIN_EMAILS` unset or email not in list). Documented in the function header. Low cost, high flexibility.

**RESOLVED:** Primary gate is `ADMIN_EMAILS` env (fast, no DB read per request); fallback is a `user_roles` query when `ADMIN_EMAILS` is unset or the caller's email is not in the list. Both paths are unit-tested in Plan 04.


## Architectural Risks to Surface Pre-Planning

1. **Phase 11 Contract Ask — `transaction_id` field naming** (O-2): Phase 13 depends on Phase 11's return shape. If Phase 11 locks a different name, Phase 13 plan writes a one-line rename. Non-blocking but must be tracked.
2. **Phase 12 Dependency — `v_conversion_funnel`** (O-1): Phase 13 migration cannot finalize the conversion funnel view until Phase 12 PLAN.md is written. Recommendation: write Phase 13's migration with the view marked `-- TODO: confirm against Phase 12` and have a late-wave task reconcile.
3. **Migration timestamp ordering**: Phase 13 migration timestamp MUST be later than BOTH Phase 11 and Phase 12 migration timestamps. Planner validates before writing the file.
4. **Streaming refund limitation**: `withMerits` can only refund pre-stream failures, not mid-stream failures. This is a documented limitation that aligns with D-02's exclusion of user-cancelled streams, but the team should acknowledge it explicitly in the Phase 13 SUMMARY.
5. **NFR-01 verification**: The 100ms budget is asserted in tests but has not been benchmarked. If Phase 11's `check_and_deduct_merits` RPC turns out to be slower than 100ms warm, Phase 13 verification will fail and Phase 11 will need a follow-up optimization.

## Sources

### Primary (HIGH confidence)
- `.planning/phases/13-merit-enforcement-and-feature-flag/13-CONTEXT.md` — full D-01..D-19 lockdown
- `.planning/phases/11-merit-rpcs-and-reconciliation/11-CONTEXT.md` — RPC contract D-05/D-06/D-08/D-19
- `.planning/phases/12-stripe-products-and-webhook/12-CONTEXT.md` — webhook event table (`stripe_webhook_events` reuse recommendation), cron pattern
- `.planning/phases/10-merit-ledger-foundation/10-CONTEXT.md` — ledger shape, RLS posture, amount sign convention
- `.planning/REQUIREMENTS.md` (lines 137, 22, 152-162, 170, 181) — exact REQ-ID text
- `.planning/ROADMAP.md` §Phase 13 (lines 107-121) — 7 success criteria
- `supabase/functions/_shared/rate-limiter.ts` — entire file, verifies D-08/D-09 feasibility
- `supabase/functions/_shared/usage-checker.ts` — entire file, legacy contract for D-18
- `supabase/functions/_shared/anthropic.ts` lines 596-679 — error return shape, basis for D-02 classification
- `supabase/functions/_shared/auth.ts` — `requireInternalOrUserAuth` signature and allowlist anchor
- `supabase/functions/_shared/handler.ts` — `handleRequest` Zod + CORS + rate limit wrapper
- `supabase/functions/_shared/logger.ts` — `createLogger` output shape
- `supabase/functions/analyze-resume/index.ts` lines 200-275 — existing pattern mirrored by D-06 branch
- `supabase/functions/submit-resume-analysis-job/index.ts` — submission-time deduction surface
- `supabase/migrations/20260310000000_add_keep_warm_cron.sql` — cron row pattern
- `supabase/migrations/20260414000000_merit_ledger_foundation.sql` — migration file style
- `supabase/functions/admin-delete-user/index.ts:46` — `user_roles` admin pattern
- `supabase/functions/notify-admin-activity/index.ts:24,145` — admin email + Resend invocation pattern

### Secondary (MEDIUM confidence)
- `supabase/functions/_shared/handler.ts:88-93` — rate limit ordering matches D-09

### Tertiary (LOW confidence)
- None — Phase 13 is an integration phase operating entirely on repo-local primitives; no external documentation searches were required.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every building block verified in the repo
- Architecture: HIGH — D-01..D-19 leave minimal room for interpretation; this research resolved remaining discretion
- Pitfalls: HIGH — grounded in existing code patterns (keep-warm cron env caveat, `analyze-resume` rate limit shape, anthropic error classification, `AI_TEST_MODE` precedent)
- Phase 11 RPC contract: MEDIUM — Phase 11 plans not yet written; field names assumed per CONTEXT but risk low (trivial rename)
- Phase 12 event table: MEDIUM — `v_conversion_funnel` depends on Phase 12 plans not yet written; flagged as Open Question O-1

**Research date:** 2026-04-14
**Valid until:** 2026-04-28 (14 days — stable, unlikely to drift until Phase 11 or Phase 12 plans land)
