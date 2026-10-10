# Phase 13: merit-enforcement-and-feature-flag - Pattern Map

**Mapped:** 2026-04-14
**Files analyzed:** 18 (3 new shared/edge, 1 migration, 10 modified handlers, 1 anthropic edit, 1 test runner, +tests)
**Analogs found:** 18 / 18

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/functions/_shared/merit-gateway.ts` (NEW) | utility (shared helper) | request-response (RPC round-trip + wrapped callback) | `supabase/functions/_shared/rate-limiter.ts` | exact (same module shape: config constants, pure helpers, RPC-backed main fn, CORS-aware response helpers) |
| `supabase/functions/_shared/merit-gateway.test.ts` (NEW) | test | pure-unit | `supabase/functions/_shared/rate-limiter.test.ts` | exact |
| `supabase/functions/admin-merit-metrics/index.ts` (NEW) | controller (edge function) | request-response (GET → aggregate JSON) | `supabase/functions/send-strivo-email/index.ts` (for serve/auth shape) + `supabase/functions/_shared/handler.ts` (for Zod+auth wrapper) | role-match (no existing admin-metrics fn; closest pattern is `handleRequest`-based internal-or-user edge fn) |
| `supabase/functions/admin-merit-metrics/index.test.ts` (NEW) | test | unit | `supabase/functions/_shared/rate-limiter.test.ts` | role-match |
| `supabase/functions/check-merit-alerts/index.ts` (NEW) | controller (scheduled edge function) | event-driven (pg_cron → pg_net → fn) | `supabase/functions/send-strivo-email/index.ts` (Resend transport) + `supabase/migrations/20260310000000_add_keep_warm_cron.sql` (cron invocation) | role-match (no existing cron-invoked alerter; closest analog is `send-strivo-email` for Resend + `keep-warm` cron pattern) |
| `supabase/functions/check-merit-alerts/index.test.ts` (NEW) | test | unit | `supabase/functions/_shared/rate-limiter.test.ts` | role-match |
| `supabase/migrations/YYYYMMDDHHMMSS_merit_enforcement_observability.sql` (NEW) | migration | batch (DDL) | `supabase/migrations/20260412000000_stripe_migration.sql` | exact (single-file additive-only migration, CREATE IF NOT EXISTS + RLS-enabled no-policy tables, no drops) |
| `supabase/functions/_shared/anthropic.ts` (MODIFIED) | utility | transform | itself — existing `AI_TEST_MODE` gate at line 528 | exact self-pattern |
| `supabase/functions/analyze-resume/index.ts` (MODIFIED) | controller | request-response / streaming | itself — existing legacy branch at lines 226-274 | exact self-pattern (D-06 branch inserted at same site) |
| `supabase/functions/analyze-career/index.ts` (MODIFIED) | controller | request-response / streaming | `analyze-resume/index.ts` | exact |
| `supabase/functions/grade-linkedin/index.ts` (MODIFIED) | controller | request-response | `analyze-resume/index.ts` | exact |
| `supabase/functions/recruiting-lens/index.ts` (MODIFIED) | controller | request-response | `analyze-resume/index.ts` | exact |
| `supabase/functions/analyze-skills-gap/index.ts` (MODIFIED) | controller | request-response | `analyze-resume/index.ts` | exact |
| `supabase/functions/compare-jobs/index.ts` (MODIFIED) | controller | request-response | `analyze-resume/index.ts` | exact |
| `supabase/functions/interview-prep-coach/index.ts` (MODIFIED) | controller | request-response | `analyze-resume/index.ts` | exact |
| `supabase/functions/submit-resume-analysis-job/index.ts` (MODIFIED) | controller (queue submit) | request-response (returns `{job_id}`) | `analyze-resume/index.ts` | role-match (submit at queue edge, deduct here per D-07) |
| `supabase/functions/submit-career-analysis-job/index.ts` (MODIFIED) | controller (queue submit) | request-response | `submit-resume-analysis-job/index.ts` | exact |
| `scripts/run-edge-tests.ps1` (MODIFIED) | config (test runner) | batch | itself — existing Deno test list at lines 18-27 | exact self-pattern |

## Pattern Assignments

### `supabase/functions/_shared/merit-gateway.ts` (utility, request-response)

**Analog:** `supabase/functions/_shared/rate-limiter.ts`

**File-header comment pattern** (rate-limiter.ts lines 1-10):
```ts
/**
 * Postgres-backed fixed-window rate limiter for Supabase Edge Functions.
 *
 * Design decisions:
 * - Fixed-window algorithm: simplest, lowest DB overhead, sufficient for abuse prevention
 * - Postgres atomic upsert via increment_rate_limit RPC: correct under concurrent load
 * - Fail open on DB error: prefer availability over strict enforcement if rate limit DB is down
 * - Distinct error code 'rate_limit_exceeded' vs 'usage_limit_reached' (credits exhaustion)
 * - Retry-After header included per RFC 6585
 */
```

Mirror with D-01..D-19 design-decision footprint for Phase 13.

**Imports pattern** (rate-limiter.ts lines 12-16):
```ts
import { getServiceClient } from './supabase-client.ts';
import { corsHeaders, CorsType } from './cors.ts';
import { createLogger } from './logger.ts';

const log = createLogger('_shared/rate-limiter');
```

merit-gateway must additionally import `checkRateLimit, createRateLimitResponse, RateLimitConfig` from `./rate-limiter.ts`. Logger name: `createLogger('merit-gateway')` per D-11.

**Module-scope config constant pattern** (rate-limiter.ts lines 20-31) — used by Phase 13 for both the flag read and the pooled limiter:
```ts
export interface RateLimitConfig {
  key: string;
  limits: { free: number; pro: number; elite: number; };
  windowSeconds?: number;
}
```

Phase 13 adds, at module scope (D-05, D-08):
```ts
export const MERIT_SYSTEM_ENABLED =
  (Deno.env.get('MERIT_SYSTEM_ENABLED') ?? '').toLowerCase() === 'true';

const AI_POOL_LIMIT: RateLimitConfig = {
  key: 'ai-analyses-all',
  limits: { free: 60, pro: 60, elite: 60 },
};
```

**RPC-call + fail-open pattern** (rate-limiter.ts lines 80-113):
```ts
export async function checkRateLimit(
  userId: string,
  tier: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const windowSecs = config.windowSeconds ?? 3600;
  const win = windowStart(windowSecs);
  const limit = getTierLimit(config.limits, tier);
  const key = `user:${userId}:${config.key}`;

  const { data, error } = await getServiceClient().rpc('increment_rate_limit', {
    p_key: key,
    p_window_start: win,
  });

  if (error) {
    log.info('Rate limit DB error — failing open', { key, error: error.message });
    return { allowed: true, retryAfterSeconds: 0, remaining: limit };
  }
  // ...
}
```

**Copy for `withMerits`:** same shape — resolve service client once, call `supabase.rpc('check_and_deduct_merits', { p_user_id, p_feature, p_tier })`, timestamp around it for NFR-01 perf logging, and branch on `(data as any).error` per Phase 11 RPC contract (`'insufficient_merits' | 'tier_locked' | undefined`). D-12: logging happens ONLY after success.

**Response-builder helper pattern** (rate-limiter.ts lines 162-178):
```ts
export function createRateLimitResponse(retryAfterSecs: number, corsType: CorsType): Response {
  return new Response(
    JSON.stringify({
      error: 'rate_limit_exceeded',
      message: 'Too many requests. Please try again later.',
      retryAfter: retryAfterSecs,
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders({ type: corsType }),
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSecs),
      },
    },
  );
}
```

**Phase 13 parallel helpers to add** (all CORS-aware, per D-10 wire format):
- `insufficientMeritsResponse(corsType)` → `{ error: 'insufficient_merits', upgrade_required: true }` status 402
- `tierLockedResponse(corsType)` → status 403
- `createRateLimitResponse` — reused as-is for the pooled limiter hit

**Anthropic refund classification anchor** (`_shared/anthropic.ts` line 673):
```ts
const isAbort = error instanceof Error && error.name === 'AbortError';
```

merit-gateway's `isRefundableAnthropicError(status, text)` must match this set: 5xx, 529, 408, AbortError/timeout, `ECONNRESET`, `overload|overloaded` regex. Keeps D-02 taxonomy aligned with the existing classifier.

**Secondary error-handling pattern** (usage-checker.ts lines 34-38) — shows fail-closed vs fail-open decision point. merit-gateway follows rate-limiter's **fail-open-on-rate-limit-DB** but **fail-closed-on-Merit-RPC-error** (500 response, not a free analysis) because a Merit RPC failure is an integrity event, not an abuse-control one.

---

### `supabase/functions/_shared/merit-gateway.test.ts` (test)

**Analog:** `supabase/functions/_shared/rate-limiter.test.ts`

**Test file header + permissions** (lines 1-4):
```ts
/**
 * Unit tests for _shared/rate-limiter.ts pure functions.
 * Run with: deno test _shared/rate-limiter.test.ts --no-check --allow-env --allow-net --allow-read
 */
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
```

**Deno.test shape** (lines 17-19):
```ts
Deno.test("windowStart: rounds down to hour boundary (3661 -> 3600)", () => {
  assertEquals(windowStart(3600, 3661), 3600);
});
```

**Phase 13 tests to write:**
- `isRefundableAnthropicError(500, '') === true`
- `isRefundableAnthropicError(529, 'overloaded') === true`
- `isRefundableAnthropicError(408, '') === true`
- `isRefundableAnthropicError(400, 'bad json') === false`
- `isRefundableAnthropicError(200, '') === false`
- `MERIT_SYSTEM_ENABLED` reads env var correctly (case-insensitive `'true'`)
- `AI_POOL_LIMIT` has `key === 'ai-analyses-all'` and all tiers === 60

TEST-07 (the integration round-trip) lives as a SEPARATE file in `_tests/` — see below.

---

### `supabase/functions/admin-merit-metrics/index.ts` (controller, request-response)

**Analog:** `supabase/functions/_shared/handler.ts` (the wrapper the new fn must use) + `supabase/functions/send-strivo-email/index.ts` (for serve/auth/RESEND pattern if anything is forwarded).

**`handleRequest` usage pattern** (handler.ts lines 51-122) — the full composed pipeline:
```ts
export async function handleRequest<T>(
  req: Request,
  opts: HandleRequestOptions<T>,
): Promise<Response> {
  // OPTIONS → auth → rate limit → body parse → Zod → handler → error sanitize
}
```

**Call-site pattern for Phase 13's admin function:**
```ts
import { handleRequest } from '../_shared/handler.ts';
import { z } from 'npm:zod@3.25';
import { getServiceClient } from '../_shared/supabase-client.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createLogger } from '../_shared/logger.ts';

const log = createLogger('admin-merit-metrics');
const ADMIN_EMAILS = (Deno.env.get('ADMIN_EMAILS') ?? Deno.env.get('ADMIN_EMAIL') ?? 'strivolife@gmail.com')
  .split(',').map((e) => e.trim().toLowerCase());

Deno.serve((req) => handleRequest(req, {
  authMode: 'internal-or-user',
  schema: z.object({}).strip(),
  corsType: 'user',
  handler: async (_body, userCtx) => {
    if (userCtx && !ADMIN_EMAILS.includes((userCtx.email ?? '').toLowerCase())) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' },
      });
    }
    const supabase = getServiceClient();
    const [circ, feat, shop, conv] = await Promise.all([
      supabase.from('v_merits_in_circulation').select('*').single(),
      supabase.from('v_feature_consumption_daily').select('*'),
      supabase.from('v_shop_purchases_daily').select('*'),
      supabase.from('v_conversion_funnel').select('*'),
    ]);
    return new Response(JSON.stringify({ /* aggregate */ }), {
      status: 200,
      headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' },
    });
  },
}));
```

**`AuthMode` type anchor** (handler.ts line 24): `'user' | 'internal-or-user' | 'internal' | 'none'` — use `'internal-or-user'` for admin-metrics (D-13), `'internal'` for alerts (cron-invoked).

---

### `supabase/functions/check-merit-alerts/index.ts` (controller, event-driven)

**Analogs:**
- `supabase/functions/_shared/handler.ts` — wrapper
- `supabase/functions/send-strivo-email/index.ts` — Resend transport (called via fetch, not imported)
- `supabase/migrations/20260310000000_add_keep_warm_cron.sql` — cron invocation source

**Authenticated internal invocation pattern** (send-strivo-email/index.ts lines 340-346):
```ts
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleOptionsRequest({ type: 'internal' });
  }

  try {
    await requireAuth(req, { type: 'internal' });
```

**Phase 13 `check-merit-alerts` skeleton** — use `handleRequest` (cleaner than raw `serve`):
```ts
import { handleRequest } from '../_shared/handler.ts';
import { z } from 'npm:zod@3.25';
import { getServiceClient } from '../_shared/supabase-client.ts';
import { createLogger } from '../_shared/logger.ts';

const log = createLogger('check-merit-alerts');

Deno.serve((req) => handleRequest(req, {
  authMode: 'internal',
  schema: z.object({}).strip(),
  corsType: 'user',
  handler: async () => {
    const supabase = getServiceClient();
    const results = await Promise.all([
      evaluateNegativeBalance(supabase),
      evaluateAiFailureRate(supabase),
      evaluateShopFailureRate(supabase),
    ]);
    return new Response(JSON.stringify({ ok: true, results }), { status: 200 });
  },
}));
```

**Resend-forward pattern** (send-strivo-email/index.ts lines 376-401) — the alert function must NOT import Resend directly; it forwards to `send-strivo-email` via fetch + `x-internal-job-secret`:
```ts
const response = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${RESEND_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    from: "Brian from Strivo <support@strivoai.net>",
    reply_to: "support@strivoai.net",
    to: [to],
    subject,
    html,
  }),
});

if (!response.ok) {
  const errorText = await response.text();
  console.error('Resend API error:', response.status, errorText);
```

**Debounce-before-side-effect invariant** (from RESEARCH.md Pitfall 7): upsert `alert_state` BEFORE the email fetch. Log+skip if upsert fails.

---

### `supabase/migrations/YYYYMMDDHHMMSS_merit_enforcement_observability.sql` (migration)

**Analog:** `supabase/migrations/20260412000000_stripe_migration.sql`

**File-header pattern** (stripe_migration.sql lines 1-4):
```sql
-- Phase 07: Stripe migration — additive only.
-- Closes STR-06 (profiles columns) and STR-07 (stripe_webhook_events with correct RLS).
-- CRITICAL: Do NOT add any permissive policy that matches all rows. The Paddle migration
-- has that bug (SEC-06); do not replicate. Service role bypasses RLS automatically.
```

Phase 13 header must: (a) declare additive-only, (b) enumerate REQ-IDs closed (NFR-10/11, MIG-05 infra), (c) warn that the `cron.schedule` row is per-env and must be run via SQL editor (cite `20260310000000_add_keep_warm_cron.sql`).

**Idempotent additive pattern** (stripe_migration.sql lines 6-10):
```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id     text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_price_id        text;
```

**RLS-enabled, zero-permissive-policy table pattern** (stripe_migration.sql lines 22-32):
```sql
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id   text PRIMARY KEY,
  event_type text NOT NULL,
  payload    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- STR-07: RLS enabled with NO permissive policies.
-- Service role bypasses RLS. Anon / authenticated roles have zero access by default.
-- DO NOT add any permissive CREATE POLICY here — that is the SEC-06 Paddle bug.
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
```

**Copy for Phase 13 `alert_state`:**
```sql
CREATE TABLE IF NOT EXISTS public.alert_state (
  alert_name    text PRIMARY KEY,
  last_fired_at timestamptz NULL,
  last_ok_at    timestamptz NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.alert_state ENABLE ROW LEVEL SECURITY;
-- No permissive policies — service role only (matches SEC-06 remediation pattern).
```

**Analytics index pattern** (stripe_migration.sql lines 34-36):
```sql
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_created_at
  ON public.stripe_webhook_events(created_at DESC);
```

Apply the same shape to any index required by `v_feature_consumption_daily` (e.g., `merit_transactions(created_at)` if Phase 10 did not already add it — verify before adding).

**Cron row pattern** (20260310000000_add_keep_warm_cron.sql lines 1-23):
```sql
-- Schedule keep-warm pings every 5 minutes to prevent edge function cold starts.
-- Uses pg_cron + pg_net (both already enabled in prior migration).
--
-- IMPORTANT: This migration must be run per-environment via the Supabase SQL editor
-- (not via `supabase db push`) because the URL differs per project.
--
-- Staging:    https://cimjltzovkahkqecpwgi.supabase.co
-- Production: https://zjpjapgraoxdukdvpjes.supabase.co

SELECT cron.schedule(
  'keep-warm-ping',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url    := 'https://cimjltzovkahkqecpwgi.supabase.co/functions/v1/keep-warm',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body   := '{}'::jsonb
  );
  $$
);
```

**Phase 13 handling:** per RESEARCH.md Pitfall 5 the cron row must NOT live in the main migration file. Keep the views + `alert_state` in the main migration, and ship the `SELECT cron.schedule('check-merit-alerts', '*/15 * * * *', ...)` in a separate per-env template file (e.g., `docs/phase-13-cron-setup.sql` or `supabase/ops/phase-13-cron-setup.sql`). Header of main migration must state this boundary explicitly.

---

### `supabase/functions/_shared/anthropic.ts` (MODIFIED — 1-line gate addition)

**Analog:** itself, existing `AI_TEST_MODE` gate at line 528:
```ts
export async function invokeAnthropicText(params: AnthropicInvokeParams): Promise<AnthropicInvokeResult> {
  if ((Deno.env.get('AI_TEST_MODE') || '').toLowerCase() === 'true') {
    const text = getMockFixtureText(params.fixtureKey);
    // ...
  }
```

And at line 690 (streaming variant):
```ts
if ((Deno.env.get('AI_TEST_MODE') || '').toLowerCase() === 'true') {
```

**Phase 13 edit pattern (exact shape — two-key defense per Pitfall 8):**
```ts
// Insert IMMEDIATELY BEFORE the existing AI_TEST_MODE block at line 528 (and line 690)
if (
  (Deno.env.get('AI_TEST_MODE') || '').toLowerCase() === 'true' &&
  (Deno.env.get('AI_FORCE_FAILURE') || '').toLowerCase() === 'true'
) {
  return { ok: false, status: 529, error: 'forced-failure' };
}
```

Two-key defense: `AI_FORCE_FAILURE` only fires when `AI_TEST_MODE=true` is ALSO set. Prevents accidental production poisoning.

---

### `supabase/functions/analyze-resume/index.ts` (MODIFIED)

**Analog:** itself — existing legacy branch (lines 226-274). The D-06 branch wraps this body verbatim.

**Current legacy pattern to preserve** (analyze-resume/index.ts lines 226-274):
```ts
const userContext = await requireInternalOrUserAuth(req);
// Rate limit: 5/15/30 per hour by tier (D-01). Skip for internal worker path (userContext null).
if (userContext) {
  const rl = await checkRateLimit(userContext.userId, userContext.tier, {
    key: 'analyze-resume',
    limits: { free: 5, pro: 15, elite: 30 },
  });
  if (!rl.allowed) {
    return createRateLimitResponse(rl.retryAfterSeconds, 'user');
  }
}
const authenticatedUserId = userContext?.userId ?? userId;

// Check usage limits (DO NOT record until after a successful analysis)
const usageUserId = userId || authenticatedUserId;
if (usageUserId) {
  const { data: checkResult, error: checkError } = await supabase
    .rpc('can_perform_ai_action', { p_user_id: usageUserId });
  // ...
  if (!result.allowed) {
    // email + return createUsageLimitResponse(...)
  }
}
```

**D-06 canonical insertion site:** BEFORE the existing per-feature rate-limit block at line 228 (so per-feature limiter still runs as the additive safety net on the merit path — see RESEARCH.md Pitfall 1).

**Exact edit pattern:**
```ts
import { MERIT_SYSTEM_ENABLED, withMerits, MeritRefundable } from '../_shared/merit-gateway.ts';
// ... existing imports ...

const userContext = await requireInternalOrUserAuth(req);

// Per-feature rate limit stays on both paths (additive safety net per Pitfall 1)
if (userContext) {
  const rl = await checkRateLimit(userContext.userId, userContext.tier, {
    key: 'analyze-resume',
    limits: { free: 5, pro: 15, elite: 30 },
  });
  if (!rl.allowed) return createRateLimitResponse(rl.retryAfterSeconds, 'user');
}

// === Phase 13 branch (D-06) ===
if (MERIT_SYSTEM_ENABLED && userContext) {
  const gated = await withMerits(
    { userId: userContext.userId, tier: userContext.tier as 'free' | 'pro' | 'elite', corsType: 'user' },
    'resume_analysis',
    async (_txId) => {
      // existing body lifted verbatim — the Anthropic calls, merge, response build
      // Anthropic errors must be re-thrown as MeritRefundable for refund:
      //   const r = await invokeAnthropicText(...);
      //   if (!r.ok) throw new MeritRefundable(r.status, r.error);
      return buildFinalResponse(/* ... */);
    },
  );
  if (!gated.ok) return gated.response;
  return gated.value;
}

// === Legacy path (unchanged — MIG-05 regression test pins this byte-for-byte) ===
const authenticatedUserId = userContext?.userId ?? userId;
const usageUserId = userId || authenticatedUserId;
if (usageUserId) {
  // ... existing can_perform_ai_action block untouched ...
}
```

**Invariants (from D-18 + Pitfall 1):**
- Legacy `can_perform_ai_action` block stays byte-identical inside the `else`-equivalent fall-through.
- Per-feature rate limit runs OUTSIDE the `if (MERIT_SYSTEM_ENABLED)` so it applies to both paths.
- Do NOT delete `checkAndRecordUsage`, `createUsageLimitResponse`, or `can_perform_ai_action` imports.

---

### `supabase/functions/analyze-career/index.ts`, `grade-linkedin/`, `recruiting-lens/`, `analyze-skills-gap/`, `compare-jobs/`, `interview-prep-coach/` (MODIFIED)

**Analog:** `supabase/functions/analyze-resume/index.ts` (the canonical D-06 insertion above).

**Per-feature deltas:** only the `feature` string passed to `withMerits` changes:
- `analyze-career` → `'career_compass'`
- `grade-linkedin` → `'linkedin_grading'`
- `recruiting-lens` → `'recruiting_lens'`
- `analyze-skills-gap` → `'skills_gap_analysis'`
- `compare-jobs` → `'job_comparison'`
- `interview-prep-coach` → `'interview_prep'`

(These strings must match the `ActionType` enum in `_shared/usage-checker.ts` lines 3-11 so both paths use the same feature keys.)

---

### `supabase/functions/submit-resume-analysis-job/index.ts`, `submit-career-analysis-job/index.ts` (MODIFIED)

**Analog:** `supabase/functions/analyze-resume/index.ts` (same insertion pattern) — but with the D-07 rule: **deduction happens at submission**, and the returned `Response` is the `{ job_id }` payload. `process-*-job` processors are NOT touched.

**Additional invariant:** the `job_id` row created inside `withMerits` should include `metadata.merit_transaction_id = txId` so a future refund path (D-07 open question) can locate the original transaction for refund on async failure.

---

### `scripts/run-edge-tests.ps1` (MODIFIED — register new test files)

**Analog:** itself — existing test list at lines 18-27:
```powershell
deno test --allow-all `
  _shared/json-repair.test.ts `
  _shared/logger.test.ts `
  _shared/stripe-client.test.ts `
  stripe-webhook/price-resolver.test.ts `
  stripe-webhook/index.test.ts `
  create-checkout-session/index.test.ts `
  create-stripe-portal/index.test.ts `
  _tests/merit_rls_test.ts `
  --no-check
```

**Edit pattern:** insert new test paths in the list (keep backtick line continuations, alphabetical within `_shared/`):
```powershell
  _shared/merit-gateway.test.ts `
  admin-merit-metrics/index.test.ts `
  check-merit-alerts/index.test.ts `
  _tests/merit_refund_integration_test.ts `   # TEST-07 integration round-trip
```

TEST-07 lives in `_tests/` (co-located with `merit_rls_test.ts`) because it spans multiple functions + DB state.

---

## Shared Patterns

### Authentication & Handler Composition

**Source:** `supabase/functions/_shared/handler.ts` (lines 51-122) + `supabase/functions/_shared/auth.ts`

**Apply to:** All Phase 13 NEW edge functions (`admin-merit-metrics`, `check-merit-alerts`).

```ts
Deno.serve((req) => handleRequest(req, {
  authMode: 'internal' | 'internal-or-user',
  schema: z.object({}).strip(),
  corsType: 'user',
  handler: async (_body, userCtx, req) => { /* ... */ },
}));
```

- `admin-merit-metrics` → `authMode: 'internal-or-user'` + admin allowlist check on `userCtx.email`.
- `check-merit-alerts` → `authMode: 'internal'` (cron invokes with `x-internal-job-secret`).
- MODIFIED feature handlers keep their existing `requireInternalOrUserAuth(req)` call — do NOT refactor to `handleRequest`; that is out of scope for Phase 13.

### Service-Role RPC Writes

**Source:** `supabase/functions/_shared/rate-limiter.ts` lines 90-93, `supabase/functions/_shared/usage-checker.ts` lines 27-32

**Apply to:** `merit-gateway.ts` (for `check_and_deduct_merits` + `refund_merits`), `check-merit-alerts/index.ts` (for `get_ai_failure_rate_1h`, `get_shop_failure_rate_1h` if added).

```ts
const { data, error } = await getServiceClient().rpc('rpc_name', { p_arg: value });
if (error) { /* log + either fail-open (rate limiter) OR fail-closed (integrity) */ }
```

Phase 11 RPCs (`check_and_deduct_merits`, `refund_merits`) are GRANTed to `service_role` only (MER-04 / Phase 10 D-17). Always go through `getServiceClient()` — NOT a user-auth client.

### Structured Logging (NFR-09)

**Source:** `supabase/functions/_shared/rate-limiter.ts` lines 14-16, 96, 105

**Apply to:** `merit-gateway.ts`, `admin-merit-metrics/index.ts`, `check-merit-alerts/index.ts`.

```ts
import { createLogger } from './logger.ts';
const log = createLogger('merit-gateway');

log.info('merit-transaction', {
  user_id: ctx.userId,
  feature,
  transaction_id: transactionId,
  deducted_from: data.deducted_from,
  remaining_balance: data.remaining_balance,
  rpc_duration_ms: rpcMs,
});
```

**Invariant (D-12):** gateway does NOT log before the RPC returns `success: true`. Transaction logs are consequent, never predictive.

### CORS-Aware Response Building

**Source:** `supabase/functions/_shared/rate-limiter.ts` lines 162-178 + `supabase/functions/_shared/cors.ts`

**Apply to:** `merit-gateway.ts` helpers (`insufficientMeritsResponse`, `tierLockedResponse`), `admin-merit-metrics/index.ts` responses.

```ts
new Response(JSON.stringify({ error: 'code', ... }), {
  status,
  headers: {
    ...corsHeaders({ type: corsType }),
    'Content-Type': 'application/json',
  },
});
```

`check-merit-alerts` is cron-invoked (no browser) — no CORS needed; still use `handleRequest` for consistency.

### Additive-Only Migration Style

**Source:** `supabase/migrations/20260412000000_stripe_migration.sql`

**Apply to:** the Phase 13 `_merit_enforcement_observability.sql` migration.

- `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE VIEW`, `CREATE INDEX IF NOT EXISTS`.
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` with NO permissive `CREATE POLICY`.
- Header comment declaring REQ-IDs closed + explicit SEC-06 anti-repeat warning.
- Cron `SELECT cron.schedule(...)` call **NOT** in the main migration — kept in a per-env ops SQL file per the `keep-warm` convention.

### Feature-Flag Env-Var Read at Module Scope

**Source pattern:** `supabase/functions/_shared/anthropic.ts` line 528 (`AI_TEST_MODE`), existing `INTERNAL_JOB_SECRET` / `ANTHROPIC_MODEL_TEXT` conventions across `_shared/`.

**Apply to:** `merit-gateway.ts` (`MERIT_SYSTEM_ENABLED`), `anthropic.ts` (`AI_FORCE_FAILURE`), `admin-merit-metrics/index.ts` (`ADMIN_EMAILS`).

```ts
export const MERIT_SYSTEM_ENABLED =
  (Deno.env.get('MERIT_SYSTEM_ENABLED') ?? '').toLowerCase() === 'true';
```

Cached at cold start. Flip requires function restart (~30 s propagation). Documented in ops runbook per Pitfall 4.

### Test File Structure (Deno)

**Source:** `supabase/functions/_shared/rate-limiter.test.ts` lines 1-50

**Apply to:** `merit-gateway.test.ts`, `admin-merit-metrics/index.test.ts`, `check-merit-alerts/index.test.ts`, and the TEST-07 integration file in `_tests/`.

```ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { thing } from "./merit-gateway.ts";

Deno.env.set("APP_URL", "https://test.example.com");

Deno.test("descriptive: condition (input -> expected)", () => {
  assertEquals(actual, expected);
});
```

Register every new test file in `scripts/run-edge-tests.ps1` — Phase 13 is not complete until the runner picks them up.

## No Analog Found

None. Every Phase 13 file has at least a role-matched analog in the repo. The most novel surface (`check-merit-alerts` cron-to-alert flow) composes two existing patterns (`send-strivo-email` Resend transport + `keep-warm` pg_cron→pg_net) rather than introducing a new one.

## Metadata

**Analog search scope:**
- `supabase/functions/_shared/` — all shared utilities
- `supabase/functions/` — handler-level functions (analyze-resume, send-strivo-email)
- `supabase/migrations/` — recent migrations (stripe, keep-warm)
- `scripts/` — PowerShell test runner

**Files scanned:** ~20 (targeted by RESEARCH.md's explicit analog list, plus confirmatory reads of the handler composition chain)

**Pattern extraction date:** 2026-04-14
