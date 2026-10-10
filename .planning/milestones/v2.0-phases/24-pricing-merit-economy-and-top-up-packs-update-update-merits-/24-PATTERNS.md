# Phase 24: pricing-merit-economy-and-top-up-packs-update — Pattern Map

**Mapped:** 2026-04-21
**Files analyzed:** 34 (28 new / 6 modified)
**Analogs found:** 32 / 34

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| **Shared config layer** | | | | |
| `src/config/pricing-config.ts` (NEW) | config module (dual-imported) | static-constants | `supabase/functions/_shared/tier-config.ts` | exact (role+purpose) |
| `src/config/pricing-config.snapshot.ts` (NEW) | test fixture | static-constants | no analog — novel artefact | — (no-analog) |
| `supabase/functions/_shared/tier-config.ts` (MODIFY) | config module + accessors | static-constants + cold-start DB read | self (extend in place) | in-place |
| `supabase/functions/_shared/input-guard.ts` (NEW) | shared validator | request-response (sync, pure) | `supabase/functions/_shared/merit-gateway.ts` (response-helper pattern) + `_shared/auth.ts` (shape) | role-match |
| `supabase/functions/_shared/input-guard.test.ts` (NEW) | test | pure-function | `supabase/functions/_shared/merit-gateway.raw.test.ts` | role-match |
| **Edge function handlers** | | | | |
| `supabase/functions/create-payment-intent/index.ts` (NEW) | edge function handler | request-response (Stripe API) | `supabase/functions/create-checkout-session/index.ts` (mode=payment branch) | exact |
| `supabase/functions/create-payment-intent/index.test.ts` (NEW) | test | request-response | `supabase/functions/create-checkout-session/index.test.ts` | exact |
| `supabase/functions/stripe-webhook-handler/index.ts` (MODIFY) | webhook handler | event-driven (router branch) | self (extend `checkout.session.completed` → add `payment_intent.succeeded`) | in-place |
| `supabase/functions/analyze-resume/index.ts` (MODIFY) | edge function handler | streaming / parallel-calls | self (rewire import + invariant) | in-place |
| `supabase/functions/analyze-career/index.ts` (MODIFY) | edge function handler | streaming / parallel-calls | self | in-place |
| `supabase/functions/recruiting-lens/index.ts` (MODIFY) | edge function handler | request-response | self | in-place |
| `supabase/functions/grade-linkedin/index.ts` (MODIFY) | edge function handler | request-response | self | in-place |
| `supabase/functions/interview-prep-analyze/index.ts` (MODIFY) | edge function handler | request-response | self | in-place |
| **Database** | | | | |
| `supabase/migrations/20260422000000_phase_24_topup.sql` (NEW) | DB migration | DDL + RPC | `supabase/migrations/20260415000000_merit_rpcs.sql` §5 (`credit_shop_merits`) | exact (migration style) |
| **FE — pricing page** | | | | |
| `src/pages/Pricing.tsx` (REWRITE) | page component | render | self (existing 25-line shell) | in-place |
| `src/components/pricing/PricingPageV2.tsx` (NEW) | FE component | render + router-hash deep-link | `src/pages/Pricing.tsx` + Phase-20 `PricingTable.tsx` | role-match |
| `src/components/pricing/TierCardV2.tsx` (NEW) | FE component | render + checkout-invoke | Phase-20 `PricingTable.tsx` PLANS row renderer | role-match |
| `src/components/pricing/BillingIntervalToggleV2.tsx` (NEW) | FE component | local state | existing `shadcn/Tabs` usage | role-match |
| `src/components/pricing/PackSectionV2.tsx` (NEW) | FE component | render | `src/pages/Shop.tsx` pack grid | role-match |
| `src/components/pricing/PackCardV2.tsx` (NEW) | FE component | render + payment-intent invoke | existing Shop pack card (if any) + `StripeCheckoutWrapper.tsx` trigger | role-match |
| **FE — top-up surfaces** | | | | |
| `src/components/topup/StripePaymentElementModal.tsx` (NEW) | FE component (Stripe) | request-response (stripe.confirmPayment) | `src/components/StripeCheckoutWrapper.tsx` | role-match (Stripe Dialog host) |
| `src/components/topup/OutOfMeritsModalV2.tsx` (NEW, effectively a rewrite of UpgradeModal) | FE component | render + router-hash | `src/components/UpgradeModal.tsx` | exact |
| `src/components/topup/HeaderTopUpTrigger.tsx` (NEW) | FE component | router-hash deep-link | `src/components/MeritBalanceBadge.tsx` trigger button | role-match |
| `src/components/topup/MeritBalanceHeaderV2.tsx` (NEW) | FE component | render (from `useMerits`) | `src/components/MeritBalanceBadge.tsx` | exact |
| `src/components/topup/RunningLowCard.tsx` (NEW) | FE component | render (gated) | `MeritBalanceBadge.tsx` low-state block + shadcn Card | role-match |
| **FE — hooks** | | | | |
| `src/hooks/useMerits.ts` (MODIFY) | hook | React Query + rpc | self (update `LOW_BALANCE_THRESHOLD` logic) | in-place |
| `src/hooks/useFeatureCosts.ts` (MODIFY) | hook | React Query + rpc | self (add TS-module fallback) | in-place |
| `src/hooks/useCreatePaymentIntent.ts` (NEW) | hook | request-response (edge fn invoke) | Phase-20 `useStripeCheckout` (if exists) or similar fetch hook pattern | role-match |
| **FE — misc modifications** | | | | |
| `src/components/ui/button.tsx` (MODIFY) | component (primitive) | render | self (extend `cva` variants map) | in-place |
| `src/index.css` (MODIFY) | styles | static | self (append `.theme-v2 { ... }` block) | in-place |
| `tailwind.config.ts` (MODIFY) | config | build-time | self | in-place |
| `index.html` (MODIFY) | static | head tags | self | in-place |
| `src/components/TopBar.tsx` (MODIFY) | FE component | render | self (swap import) | in-place |
| **Tests** | | | | |
| `src/pages/__tests__/pricing-boxy.lint.test.ts` (NEW) | test (CI lint) | file-I/O (glob + regex) | no existing analog in repo | — (no-analog) |
| `src/pages/__tests__/sc12-snapshot.test.ts` (NEW) | test (snapshot) | unit | `supabase/functions/_shared/tier-config.test.ts` pattern (if exists) | role-match |
| `src/components/topup/__tests__/MeritBalanceHeaderV2.test.tsx` (NEW) | test (RTL) | render | existing RTL test under `src/pages/` | role-match |
| `src/components/topup/__tests__/HeaderTopUpTrigger.test.tsx` (NEW) | test (RTL) | render | existing RTL test | role-match |
| **Audit artefact** | | | | |
| `.planning/phases/24-.../24-AUDIT.md` (NEW) | docs / audit | markdown | `.planning/v2.0-MILESTONE-AUDIT.md` | role-match |

---

## Pattern Assignments

### Subsystem A — Shared dual-imported config

#### `src/config/pricing-config.ts` (config module, static-constants)

**Analog:** `supabase/functions/_shared/tier-config.ts` (122 lines)

**Imports + header pattern** (lines 1-18):
```typescript
/**
 * tier-config.ts — Single source of truth for per-tier timeouts and model IDs.
 *
 * SECURITY NOTE (T-14-01): This module is a pure function with zero client surface.
 * Consumers MUST read `tier` from `profiles.subscription_tier` server-side —
 * never from request body or client-supplied parameters.
 *
 * Zero edge-layer dependencies — safe to import without triggering HTTP client init.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type Tier = 'free' | 'pro' | 'elite';
export type CallType = 'core' | 'elite-preview' | 'quiz';
export type FeatureKey = 'resume' | 'career' | 'linkedin' | 'recruiting' | 'interview';
```

**Copy for `pricing-config.ts`:** zero-dep pure-module convention + the "MUST read tier server-side" security comment verbatim. **But note:** the NEW module MUST use the SC-12 canonical `FeatureKey` names (`resumeAnalysis` / `careerCompass` / `linkedinGrader` / `recruitingLens` / `interviewPrepCoach`) — this is a NAMED DIVERGENCE from tier-config's short names. Add a mapping constant `FEATURE_KEY_TO_DB` for the cost-map invariant (see D-03 assertion).

**Table-as-Record pattern** (lines 27-50):
```typescript
export const TIER_TIMEOUTS: Record<Tier, Partial<Record<CallType, number>>> = {
  free:  { core: 50_000 },
  pro:   { core: 125_000, 'elite-preview': 65_000 },
  elite: { core: 155_000, quiz: 80_000 },
};

export const TIER_MAX_TOKENS: Record<Tier, number> = {
  free: 6000,
  pro: 16000,
  elite: 20000,
};
```

**Typed-accessor pattern** (lines 86-92):
```typescript
export function getTimeout(tier: Tier, callType: CallType = 'core'): number {
  const value = TIER_TIMEOUTS[tier]?.[callType];
  if (value === undefined) {
    throw new Error(`tier-config: no timeout for tier=${tier} callType=${callType}`);
  }
  return value;
}
```

**Copy pattern for:** `getMaxOutput`, `getMaxInputTokens`, `getMaxInputChars`, `getMeritCost`. For the two `null`-bearing tables (`maxTokensInput`, `maxCharactersInput`), accessor return type is `number | null` (see D-13 — `null` = tier-locked).

---

#### `supabase/functions/_shared/tier-config.ts` (MODIFY — add D-03 invariant + accessor re-exports)

**Add DB↔TS cost-map invariant** (copy RESEARCH.md Pattern 2, lines 382-410):

```typescript
// Module-scope cache — runs once per Deno isolate (D-26)
let _costMapVerified = false;
export async function verifyCostMap(): Promise<void> {
  if (_costMapVerified) return;
  const supabase = getServiceClient();
  const { data, error } = await supabase.from('merit_feature_costs').select('feature, tier, cost');
  if (error) throw new Error(`tier-config: failed to read merit_feature_costs: ${error.message}`);
  // ... diff loop per RESEARCH.md lines 392-410 ...
  _costMapVerified = true;
}
```

**Fail-closed logging pattern — copy from `merit-gateway.ts` line 138:**
```typescript
log.error('check_and_deduct_merits failed', { userId: ctx.userId, feature, error: error?.message, rpcMs });
```

Adapt to:
```typescript
log.error('invariant-violation', { feature: featKey, tier, source: 'd-03', ts_value: tsCost, db_value: dbCost });
throw new Error(`[D-03] cost-map drift: ${featKey}/${tier} ts=${tsCost} db=${dbCost}`);
```

**Deprecation pattern for `TIER_MAX_TOKENS`** (D-11):
```typescript
/** @deprecated Use getMaxOutput(feature, tier). Removed in Phase 25. */
export { TIER_MAX_TOKENS };  // keep the existing export intact
```

---

#### `supabase/functions/_shared/input-guard.ts` (NEW — shared validator)

**Analog:** `supabase/functions/_shared/merit-gateway.ts` (response-helper shape + discriminated-union return)

**Discriminated-union return pattern** (merit-gateway.ts lines 90-92):
```typescript
export type MeritGatewayResult<T> =
  | { ok: true; value: T; transactionId: string }
  | { ok: false; response: Response };
```

**Copy for input-guard** (RESEARCH.md lines 420-424):
```typescript
export type InputGuardResult =
  | { ok: true }
  | { ok: false; reason: 'tier_locked' | 'tokens_exceeded' | 'characters_exceeded';
      limit: number | null; actual: number };
```

**Response-helper pattern** (merit-gateway.ts lines 229-255):
```typescript
export function tierLockedResponse(corsType: CorsType): Response {
  return new Response(
    JSON.stringify({
      error: 'tier_locked',
      message: 'This feature is not available on your current plan.',
      upgrade_required: true,
    }),
    {
      status: 403,
      headers: { ...corsHeaders({ type: corsType }), 'Content-Type': 'application/json' },
    },
  );
}
```

**Copy for input-guard's `toInputGuardResponse`** — reuse the `corsHeaders({ type: corsType })` + `'Content-Type': 'application/json'` header shape verbatim. 413 for size-exceeded, 403 for tier_locked (matches existing `tierLockedResponse` status).

**Pure-function pattern** — no side effects, no logger calls from inside `validateInputBudget` itself (logging happens at the caller; this matches merit-gateway.ts `isRefundableAnthropicError` lines 51-60 which is also side-effect-free).

---

### Subsystem B — Stripe dual-path

#### `supabase/functions/create-payment-intent/index.ts` (NEW)

**Analog:** `supabase/functions/create-checkout-session/index.ts` (355 lines, especially the `mode === 'payment'` branch at lines 281-340)

**Imports pattern** (lines 32-52):
```typescript
import type Stripe from "npm:stripe@14";
import { corsHeaders, handleOptionsRequest } from "../_shared/cors.ts";
import {
  requireAuth as realRequireAuth,
  type UserContext,
} from "../_shared/auth.ts";
import { getServiceClient } from "../_shared/supabase-client.ts";
import { createLogger } from "../_shared/logger.ts";
import {
  checkRateLimit as realCheckRateLimit,
  createRateLimitResponse,
  type RateLimitConfig,
  type RateLimitResult,
} from "../_shared/rate-limiter.ts";
import { getStripeClient } from "../_shared/stripe-client.ts";
import { isPackSize, type PackSize } from "../_shared/shop-pack-resolver.ts";
```

**Copy verbatim for `create-payment-intent`.** Also import `PACK_CATALOG` from `../../../src/config/pricing-config.ts` (D-02 dual-import).

**Deps-injection pattern for testability** (lines 98-107):
```typescript
export interface CreateCheckoutSessionDeps {
  supabase?: SupabaseLike;
  stripe?: Stripe;
  requireAuth?: (req: Request) => Promise<UserContext>;
  checkRateLimit?: (userId: string, tier: string, cfg: RateLimitConfig) => Promise<RateLimitResult>;
}
```

Copy for `CreatePaymentIntentDeps`.

**Auth + rate-limit + method-guard preamble** (lines 131-166) — copy verbatim; change rate-limit `key` to `'create-payment-intent'` with the shop-tight cap `{ free: 10, pro: 10, elite: 10 }`.

**Body normalisation + back-compat pattern** (lines 68-96):
```typescript
function normalizeBody(raw: unknown): CheckoutBody | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (b.mode === "payment") {
    return { mode: "payment", pack_size: b.pack_size as PackSize, /* ... */ };
  }
  // ...
  return null;
}
```

Copy + simplify for `create-payment-intent` (one-shape body: `{ pack_size: 3|10|25|50 }` — use `isPackSize()` validator).

**Lazy Stripe customer creation** (lines 196-219):
```typescript
let customerId: string | null = (profile?.stripe_customer_id as string | null) ?? null;
if (!customerId) {
  const customer = await stripe.customers.create({
    email: ctx.email,
    metadata: { user_id: ctx.userId },
  });
  customerId = customer.id;
  await supabase.from("profiles")
    .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
    .eq("id", ctx.userId);
}
```

**Copy verbatim** — same customer-resolution contract applies to PaymentIntents.

**Core PaymentIntent creation** (replaces Checkout Session creation at lines 290-319):
```typescript
// NEW pattern for create-payment-intent — derive from PACK_CATALOG (not Stripe Price IDs)
const pack = PACK_CATALOG.find(p => p.merits === body.pack_size);
if (!pack) return jsonResponse({ error: 'invalid_pack_size' }, 400);

const pi = await stripe.paymentIntents.create({
  amount: pack.priceCents,
  currency: 'usd',
  customer: customerId!,
  metadata: {
    user_id: ctx.userId,    // Pitfall 9: mirror on PI metadata (already a convention here)
    pack_size: String(body.pack_size),
  },
  automatic_payment_methods: { enabled: true },
});

return jsonResponse({ clientSecret: pi.client_secret, id: pi.id }, 200);
```

**Pitfall 9 / metadata pattern** (checkout-session lines 296-310):
```typescript
metadata: {
  user_id: ctx.userId,
  pack_size: String(body.pack_size),
},
payment_intent_data: {
  metadata: {
    user_id: ctx.userId,
    pack_size: String(body.pack_size),
  },
},
```

For raw PaymentIntent (no Checkout Session wrapper), metadata lives directly on the PI — drop the `payment_intent_data` wrapper. Still mirror `user_id` + `pack_size` for webhook correlation.

**JSON response helper** (lines 109-117) — copy verbatim.

---

#### `supabase/functions/stripe-webhook-handler/index.ts` (MODIFY — add `payment_intent.succeeded` branch)

**Analog:** self, existing `checkout.session.completed` / `session.mode === 'payment'` branch at lines 465-501

**Existing pattern to clone** (lines 465-501):
```typescript
} else if (session.mode === "payment") {
  const packSize = parseInt(session.metadata?.pack_size ?? "0", 10);
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
  if (
    !(VALID_PACK_SIZES as readonly number[]).includes(packSize) ||
    !paymentIntentId
  ) {
    log.warn("checkout-invalid-shop-metadata", { ... });
    return jsonResponse({ received: true, matchedBy, warning: "invalid_shop_metadata" }, 200);
  }
  const { error: rpcErr } = await supabase.rpc("credit_shop_merits", {
    p_user_id: userId,
    p_pack_size: packSize,
    p_stripe_payment_id: paymentIntentId,
  });
  if (rpcErr) {
    log.error("credit-shop-rpc-failed", { eventId: event.id, code: (rpcErr as { code?: string }).code });
    return jsonResponse({ error: "rpc_failed" }, 500);
  }
  log.info("checkout-shop-credited", { eventId: event.id, userId, packSize });
}
```

**New branch to add** — near line 429 (`if (event.type === "checkout.session.completed") {`), add a sibling:
```typescript
} else if (event.type === "payment_intent.succeeded") {
  const pi = event.data.object as Stripe.PaymentIntent;
  const userId = pi.metadata?.user_id ?? resolvedUserId;
  const packSize = parseInt(pi.metadata?.pack_size ?? "0", 10);
  // Skip PIs that belong to a Checkout Session (those already handled by checkout.session.completed)
  // Heuristic: pi.invoice is set for subscription PIs; pi.metadata.pack_size is only set by create-payment-intent.
  if (!pi.metadata?.pack_size) {
    log.info("pi-ignored-no-pack-metadata", { eventId: event.id, piId: pi.id });
    return jsonResponse({ received: true, ignored: true }, 200);
  }
  if (!(VALID_PACK_SIZES as readonly number[]).includes(packSize) || !userId) {
    log.warn("pi-invalid-metadata", { eventId: event.id, packSize, hasUserId: !!userId });
    return jsonResponse({ received: true, warning: "invalid_pi_metadata" }, 200);
  }
  const { error: rpcErr } = await supabase.rpc("credit_shop_merits", {
    p_user_id: userId,
    p_pack_size: packSize,
    p_stripe_payment_id: pi.id,  // idempotency key — same PI id as Checkout path
  });
  if (rpcErr) {
    log.error("credit-shop-rpc-failed", { eventId: event.id, code: (rpcErr as { code?: string }).code });
    return jsonResponse({ error: "rpc_failed" }, 500);
  }
  log.info("pi-shop-credited", { eventId: event.id, userId, packSize });
}
```

**Also update `HANDLED_EVENTS` set** (line 43) to add `"payment_intent.succeeded"`.

**Idempotency guarantee:** `credit_shop_merits` RPC (migration `20260415000000_merit_rpcs.sql` lines 288-349) already dedupes on `p_stripe_payment_id` via `merit_shop_purchases.stripe_payment_intent_id UNIQUE` + pre-lookup at lines 306-319. **Zero new code needed** — same PI id from both events coalesces to one credit.

**Receipt email fire-and-forget pattern** (lines 503-538) — optionally replicate in the new branch, or let it fall through to existing path.

---

### Subsystem C — DB migration

#### `supabase/migrations/20260422000000_phase_24_topup.sql` (NEW)

**Analog:** `supabase/migrations/20260415000000_merit_rpcs.sql` (534 lines, especially §5 `credit_shop_merits` at lines 281-349)

**Migration header / structure pattern** (merit-rpcs.sql lines 281-287):
```sql
-- §5 ─────────────────────────────────────────────────────────────────────────
-- credit_shop_merits: Stripe-webhook callable RPC to credit a shop pack onto
-- shop_balance. Idempotent via pre-lookup on merit_shop_purchases.
-- stripe_payment_intent_id (UNIQUE constraint is the ultimate safety net).
-- Lock order (Pitfall 6): FOR UPDATE the user_merits row FIRST, then do the
-- duplicate check, so concurrent webhook retries serialize cleanly.
-- ─────────────────────────────────────────────────────────────────────────────
```

**Copy format** — each section headed by `§N ───` with multi-line comment explaining purpose, idempotency rationale, and lock ordering.

**Additive DDL pattern** — RESEARCH.md lines 548-554:
```sql
ALTER TABLE public.merit_transactions
  ADD COLUMN pack_id                  text NULL,
  ADD COLUMN stripe_payment_intent_id text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_merit_tx_stripe_pi
  ON public.merit_transactions(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
```

**SECURITY DEFINER + search_path pattern** (merit-rpcs.sql lines 288-293):
```sql
CREATE OR REPLACE FUNCTION public.credit_shop_merits(p_user_id uuid, p_pack_size integer, p_stripe_payment_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
```

**Copy verbatim** for any new RPC (e.g., optional `credit_topup_merits` variant that writes `source='topup'`). Or simply update `credit_shop_merits` INSERT at lines 338-345 to write `source='topup'` + new columns `pack_id`/`stripe_payment_intent_id` — **RESEARCH recommends the in-place update** since the RPC is already generically named.

**Updated ledger-row insert** (merit-rpcs.sql lines 338-345 → MODIFY):
```sql
INSERT INTO public.merit_transactions
  (user_id, amount, balance_type, source, feature, pack_id, stripe_payment_intent_id, metadata)
VALUES
  (p_user_id, p_pack_size, 'shop', 'topup', NULL,
   'pack_' || p_pack_size, p_stripe_payment_id,
   jsonb_build_object('stripe_payment_id', p_stripe_payment_id, 'pack_size', p_pack_size));
```

**GRANT pattern** (merit-rpcs.sql line 270):
```sql
GRANT EXECUTE ON FUNCTION public.get_merit_balance(uuid) TO authenticated, service_role;
```

Apply to any new function.

---

### Subsystem D — Feature-handler budget rewiring

#### `supabase/functions/analyze-resume/index.ts` (MODIFY — rewire to `getMaxOutput`)

**Analog:** self, boot invariant at lines 65-80

**Existing pattern** (lines 46-76):
```typescript
const CALL_CONFIGS: Array<{ callType: CallType; maxTokensFree: number; maxTokensPro: number; maxTokensElite: number }> = [
  { callType: 'criteria-1', maxTokensFree: 1800, maxTokensPro: 4800, maxTokensElite: 5000 },
  { callType: 'criteria-2', maxTokensFree: 1800, maxTokensPro: 4800, maxTokensElite: 5000 },
  { callType: 'summary',    maxTokensFree: 2400, maxTokensPro: 6400, maxTokensElite: 6000 },
  { callType: 'elite-extras', maxTokensFree: 0, maxTokensPro: 0, maxTokensElite: 4000 },
];

const FREE_SINGLE_CALL_MAX_TOKENS = 4000;

// -- Boot-time invariant: per-tier budgets must not exceed TIER_MAX_TOKENS (D-18) --
for (const tier of ['free', 'pro', 'elite'] as const) {
  const key = `maxTokens${tier[0].toUpperCase() + tier.slice(1)}` as 'maxTokensFree' | 'maxTokensPro' | 'maxTokensElite';
  const sum = CALL_CONFIGS.reduce((acc, cfg) => acc + cfg[key], 0);
  if (sum > TIER_MAX_TOKENS[tier]) {
    throw new Error(`[analyze-resume] CALL_CONFIGS sum ${sum} exceeds TIER_MAX_TOKENS[${tier}] (${TIER_MAX_TOKENS[tier]})`);
  }
}
```

**Rewire pattern** (D-10 + RESEARCH.md lines 616-625):
```typescript
import { getMaxOutput } from '../_shared/tier-config.ts';  // re-exported from pricing-config.ts

for (const tier of ['free', 'pro', 'elite'] as const) {
  const key = `maxTokens${tier[0].toUpperCase() + tier.slice(1)}` as const;
  const sum = CALL_CONFIGS.reduce((acc, cfg) => acc + cfg[key], 0);
  const cap = getMaxOutput('resumeAnalysis', tier);
  if (sum > cap) {
    log.error('invariant-violation', { feature: 'resumeAnalysis', tier, source: 'd-10', sum, cap });
    throw new Error(`[D-10] analyze-resume CALL_CONFIGS sum ${sum} exceeds getMaxOutput('resumeAnalysis','${tier}')=${cap}`);
  }
}
```

**CALL_CONFIGS split retune** (Claude's Discretion per CONTEXT): new Pro cap=8000 → splits sum ≤ 8000. RESEARCH recommends Pro `(2500,2500,3000)`, Elite `(3500,3500,4000,1000)`.

**Input-guard call site** — add after `withMerits` entry, before `invokeAnthropicText` (resolve per Open-Question Q1):
```typescript
const guard = validateInputBudget('resumeAnalysis', tier, resumeText);
if (!guard.ok) {
  if (guard.reason === 'tier_locked') return tierLockedResponse(corsType);
  throw new MeritRefundable(413, `${guard.reason}: limit=${guard.limit} actual=${guard.actual}`);
}
```

**Apply the same rewire pattern to:** `analyze-career/index.ts`, `recruiting-lens/index.ts`, `grade-linkedin/index.ts`, `interview-prep-analyze/index.ts`. Each replaces its local per-tier cap map with `getMaxOutput('<featureKey>', tier)` and adds the `validateInputBudget` call.

---

### Subsystem E — Frontend

#### `src/components/ui/button.tsx` (MODIFY — add `boxy` variant)

**Analog:** self — extend existing `cva` variants map (lines 10-25)

**Existing pattern:**
```typescript
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      // ...
    },
  },
);
```

**Add two new variants** (D-18):
```typescript
boxy: "bg-[hsl(var(--accent-red))] text-[hsl(var(--accent-red-foreground))] rounded-[var(--radius-boxy)] px-6 py-3 font-semibold hover:opacity-90",
"boxy-outline": "border border-[hsl(var(--accent-red))] text-[hsl(var(--accent-red))] bg-transparent rounded-[var(--radius-boxy)] px-6 py-3 font-semibold hover:bg-[hsl(var(--accent-red))]/10",
```

**Note:** Base class (line 8) still carries `rounded-md` — that's fine; `cva` variant override via the boxy class's `rounded-[var(--radius-boxy)]` wins via Tailwind-merge ordering in `cn()`. Verify with a render test.

---

#### `src/index.css` (MODIFY — append `.theme-v2` namespace + fonts)

**Analog:** self — existing `:root,.dark` (lines 11-56) + `.light` (lines 59-94) blocks

**Existing pattern:**
```css
@layer base {
  :root,
  .dark {
    --background: 0 0% 0%;
    --primary: 357 100% 68%;
    --radius: 0.75rem;
    /* ... */
  }

  .light {
    --background: 0 0% 100%;
    --primary: 357 100% 55%;
    /* ... */
  }
}
```

**Append (D-16 + RESEARCH.md lines 655-679):**
```css
/* Top of file — before @tailwind directives, or in an @import-safe location */
@import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600&family=JetBrains+Mono:wght@500&family=Inter+Tight:wght@400;500;700&display=swap');

@layer base {
  .theme-v2 {
    --bg-deep: 344 44% 3%;              /* #0a0607 */
    --accent-red: 355 100% 59%;         /* #ff2d3f */
    --accent-red-foreground: 0 0% 100%;
    --glass-bg: 0 0% 100% / 0.03;
    --glass-border: 0 0% 100% / 0.08;
    --radius-boxy: 0.125rem;
    --font-display: 'Fraunces', Georgia, serif;
    --font-mono: 'JetBrains Mono', ui-monospace, monospace;
    --font-body: 'Inter Tight', Inter, system-ui, sans-serif;

    --background: var(--bg-deep);
    --primary: var(--accent-red);
    --primary-foreground: var(--accent-red-foreground);
    --radius: var(--radius-boxy);

    background: hsl(var(--bg-deep));
    color: hsl(var(--foreground));
    font-family: var(--font-body);
  }
}
```

**Critical:** do NOT modify `:root`, `.dark`, or `.light` blocks (D-16 explicit). Everything new lives in `.theme-v2` selector.

---

#### `src/components/topup/StripePaymentElementModal.tsx` (NEW)

**Analog:** `src/components/StripeCheckoutWrapper.tsx` (46 lines)

**Imports + module-level loadStripe pattern** (lines 1-13):
```typescript
import { loadStripe } from '@stripe/stripe-js';
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from '@stripe/react-stripe-js';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');
```

**Copy verbatim** the `loadStripe` call at module scope + the `Dialog` + `DialogContent` + `DialogHeader` + `DialogTitle` shadcn pattern.

**Swap `EmbeddedCheckoutProvider` / `EmbeddedCheckout` for `Elements` / `PaymentElement`** (net-new for Phase 24 — no existing PaymentElement usage in repo):
```typescript
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

// Inner submit component that calls confirmPayment
function PaymentForm({ onSuccess, packMerits, packPrice }: { onSuccess: () => void; packMerits: number; packPrice: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    const result = await stripe.confirmPayment({ elements, redirect: 'if_required' });
    setSubmitting(false);
    if (!result.error) onSuccess();
  };

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      <Button type="submit" variant="boxy" className="w-full mt-4" disabled={submitting}>
        {submitting ? 'Processing…' : `Confirm purchase`}
      </Button>
    </form>
  );
}

export function StripePaymentElementModal({
  open, onOpenChange, clientSecret, packMerits, packPrice, onSuccess,
}: Props) {
  if (!clientSecret) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{`Buy ${packMerits} Merits — ${packPrice}`}</DialogTitle>
        </DialogHeader>
        <Elements stripe={stripePromise} options={{ clientSecret }}>
          <PaymentForm onSuccess={onSuccess} packMerits={packMerits} packPrice={packPrice} />
        </Elements>
      </DialogContent>
    </Dialog>
  );
}
```

**`onSuccess` pattern per D-25** — caller calls `invalidateQueries(['merit-balance'])` + fires Sonner toast + closes dialog.

---

#### `src/components/topup/MeritBalanceHeaderV2.tsx` (NEW)

**Analog:** `src/components/MeritBalanceBadge.tsx` (85 lines)

**Imports pattern** (lines 1-6):
```typescript
import { Gem, AlertTriangle } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Link } from 'react-router-dom';
import { useMerits } from '@/hooks/useMerits';
import { format } from 'date-fns';
```

**Copy verbatim.** Add `import { Progress } from '@/components/ui/progress';` and `import { MERITS_PER_MONTH } from '@/config/pricing-config';`.

**Loading-state pattern** (lines 11-13):
```typescript
if (isLoading) {
  return <div className="w-16 h-8 rounded-full bg-muted animate-pulse" />;
}
```

Adapt to `<Skeleton className="h-5 w-28" />` per UI-SPEC State Matrix.

**Conditional-class pattern** (lines 15-19):
```typescript
const badgeClassName = isZero
  ? 'bg-destructive/10 text-destructive border-destructive/30'
  : isLow
    ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
    : 'bg-primary/10 text-primary border-primary/20';
```

Copy structure; adapt classes per UI-SPEC color table (JetBrains Mono font-family, red progress fill, amber-500 numeric in low state).

**Popover-wrapped trigger pattern** (lines 22-32) — **preserve** this whole structure (SC-10 requires the header readout to still open the popover on click, per UI-SPEC "Click on numeric area: Opens existing MeritBalancePopover").

**Aria pattern** (line 27):
```typescript
aria-label={`Merit balance: ${total} Merits`}
```

Adapt to UI-SPEC: `aria-label={`Merit balance: ${subscription} of ${cap}, plus ${shop} bonus`}`.

**Balance format (SC-10, UI-SPEC line 180-182):**
```typescript
<span className="font-mono text-sm">{subscription} / {cap}</span>
{shop > 0 ? (
  <span className="font-mono text-xs text-[hsl(var(--accent-red))]">+ {shop} bonus</span>
) : (
  <span className="text-xs text-muted-foreground ml-1">merits</span>
)}
<Progress value={(subscription / cap) * 100} className="w-20 h-1 bg-white/5 [&>div]:bg-[hsl(var(--accent-red))]" />
```

---

#### `src/components/topup/OutOfMeritsModalV2.tsx` (NEW — rewrite of UpgradeModal)

**Analog:** `src/components/UpgradeModal.tsx` (existing — use shadcn Dialog + two CTAs)

**Copy the Dialog shell pattern from `StripeCheckoutWrapper.tsx`:**
```typescript
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="max-w-md">
    <DialogHeader>
      <DialogTitle>Out of Merits</DialogTitle>
    </DialogHeader>
    {/* body + 2 CTAs */}
  </DialogContent>
</Dialog>
```

**CTA deep-link pattern** (UI-SPEC §OutOfMeritsModalV2):
```typescript
import { useNavigate } from 'react-router-dom';
const navigate = useNavigate();

<Button variant="boxy" className="w-full" onClick={() => { onOpenChange(false); navigate('/pricing#packs'); }}>
  Buy a top-up pack
</Button>
<Button variant="boxy-outline" className="w-full" onClick={() => { onOpenChange(false); navigate('/pricing'); }}>
  Upgrade plan
</Button>
```

---

#### `src/hooks/useMerits.ts` (MODIFY — 20%-of-cap threshold)

**Analog:** self — lines 5, 50-59

**Existing pattern:**
```typescript
const LOW_BALANCE_THRESHOLD = 4; // D-05: 2x cheapest feature cost (2 Merits)
// ...
return {
  total, subscription, shop, resetDate,
  isLow: total > 0 && total < LOW_BALANCE_THRESHOLD,
  isZero: total <= 0,
  isLoading: isLoading || userId === null,
  canAfford: (cost: number) => total >= cost,
};
```

**Rewire (D-08 + SC-9b):**
```typescript
import { MERITS_PER_MONTH, type Tier } from '@/config/pricing-config';

// tier resolved elsewhere — likely from a `useUser()` hook or AuthContext; verify in Wave 0
const cap = MERITS_PER_MONTH[tier];
const lowThresholdReached = subscription / cap < 0.2;

return {
  total, subscription, shop, resetDate, cap,
  isLow: lowThresholdReached && !isZero,           // replaces 4-flat
  lowThresholdReached,                              // new export for HeaderTopUpTrigger
  isZero: total <= 0,
  isLoading: isLoading || userId === null,
  canAfford: (cost: number) => total >= cost,
};
```

**Backward-compatibility note:** every consumer of `isLow` (grep shows `MeritBalanceBadge.tsx`, `UpgradeModal.tsx`, `TopBar.tsx`, `usePaywallGuard.ts`) MUST be read before this change — per RESEARCH.md Landmine 10.

---

#### `src/hooks/useFeatureCosts.ts` (MODIFY — add TS-module fallback)

**Analog:** self — existing `useQuery`-backed DB read

**Existing pattern** (lines 10-22):
```typescript
export function useFeatureCosts() {
  return useQuery({
    queryKey: ['feature-costs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('merit_feature_costs')
        .select('feature, tier, cost');
      if (error) throw error;
      return (data ?? []) as FeatureCost[];
    },
    staleTime: 60_000,
  });
}
```

**Add TS-module `initialData` for instant paint** (Open-Question Q4 recommendation):
```typescript
import { MERIT_COST_PER_FEATURE } from '@/config/pricing-config';

const tsInitialData: FeatureCost[] = /* derived from MERIT_COST_PER_FEATURE, mapped to DB feature names */;

return useQuery({
  queryKey: ['feature-costs'],
  queryFn: async () => { /* same as before */ },
  initialData: tsInitialData,
  staleTime: 60_000,
});
```

---

### Subsystem F — Tests

#### `src/pages/__tests__/pricing-boxy.lint.test.ts` (NEW)

**Analog:** no existing analog in repo — novel mechanical-lint pattern

**RESEARCH.md provides the full pattern** (lines 704-735):
```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { globSync } from 'fast-glob';  // or node-native recursion

const PRICING_GLOBS = [
  'src/pages/Pricing.tsx',
  'src/components/pricing/**/*.tsx',
  'src/components/topup/**/*.tsx',
];

describe('D-18 pricing boxy-CTA enforcement', () => {
  it('no <Button> carries rounded-full or variant="default" on pricing surfaces', () => {
    const files = PRICING_GLOBS.flatMap(g => globSync(g));
    const violations: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const buttonBlocks = src.matchAll(/<Button[^>]*>/g);
      for (const match of buttonBlocks) {
        if (/rounded-full/.test(match[0])) {
          violations.push(`${file}: Button with rounded-full → ${match[0]}`);
        }
        if (/variant=["']default["']/.test(match[0])) {
          violations.push(`${file}: Button with variant="default" (must be "boxy") → ${match[0]}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
```

Use this verbatim. Add `fast-glob` dep OR native `fs.readdirSync` recursion.

---

#### `src/pages/__tests__/sc12-snapshot.test.ts` (NEW)

**Analog:** vitest snapshot tests anywhere in `src/` (check existing RTL tests for structure)

**Pattern:**
```typescript
import { describe, it, expect } from 'vitest';
import { maxTokensOutput, maxTokensInput, maxCharactersInput } from '@/config/pricing-config';
import { SC12_SNAPSHOT } from '@/config/pricing-config.snapshot';

describe('D-19 SC-12 verbatim snapshot', () => {
  it('maxTokensOutput matches locked ROADMAP SC-12 values', () => {
    expect(maxTokensOutput).toEqual(SC12_SNAPSHOT.maxTokensOutput);
  });
  it('maxTokensInput matches locked ROADMAP SC-12 values', () => {
    expect(maxTokensInput).toEqual(SC12_SNAPSHOT.maxTokensInput);
  });
  it('maxCharactersInput matches locked ROADMAP SC-12 values', () => {
    expect(maxCharactersInput).toEqual(SC12_SNAPSHOT.maxCharactersInput);
  });
  it('4:1 char:token invariant holds on every non-null row', () => {
    for (const feat of Object.keys(maxTokensInput) as Array<keyof typeof maxTokensInput>) {
      for (const tier of ['free','pro','elite'] as const) {
        const tok = maxTokensInput[feat][tier];
        const chr = maxCharactersInput[feat][tier];
        if (tok !== null && chr !== null) {
          expect(chr).toBe(tok * 4);
        }
      }
    }
  });
});
```

---

#### `supabase/functions/_shared/input-guard.test.ts` (NEW)

**Analog:** `supabase/functions/_shared/merit-gateway.raw.test.ts` (Deno test convention)

**Deno test imports pattern** (existing repo convention):
```typescript
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { validateInputBudget } from './input-guard.ts';

Deno.test('D-13 tier_locked: returns ok:false reason:tier_locked for null maxTokensInput', () => {
  const r = validateInputBudget('recruitingLens', 'free', 'any text');
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.reason, 'tier_locked');
});

Deno.test('D-12 tokens_exceeded: text longer than cap trips tokens_exceeded', () => {
  const longText = 'a'.repeat(50_000);  // ~12.5k tokens, exceeds every cap
  const r = validateInputBudget('resumeAnalysis', 'free', longText);
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.reason, 'characters_exceeded');  // char check runs first
});

Deno.test('happy path: returns ok:true when within both budgets', () => {
  const r = validateInputBudget('resumeAnalysis', 'pro', 'short text');
  assertEquals(r.ok, true);
});
```

---

### Subsystem G — Audit artefact

#### `.planning/phases/24-.../24-AUDIT.md` (NEW)

**Analog:** `.planning/v2.0-MILESTONE-AUDIT.md`

**Header pattern** (lines 1-16):
```markdown
***

milestone: v2.0
milestone_name: merit-system-monetization
audited: 2026-04-15
status: gaps_found
scores:
requirements: 0/116
phases: 0/12
integration: not_run
flows: not_run
blockers:
  - kind: milestone_incomplete
    detail: "..."
```

**Adapt to phase-scope** (Phase 24 D-14 + SC-13):
```markdown
***

phase: 24
phase_name: pricing-merit-economy-and-top-up-packs-update
audited: 2026-04-22
status: reconciled
scope: all per-feature × per-tier token budgets (maxTokensOutput, maxTokensInput, maxCharactersInput)

***

# Phase 24 Budget Reconciliation

## resumeAnalysis

| Tier | Budget Type | Old Value | New Value | Source Phase | Action |
|------|-------------|-----------|-----------|--------------|--------|
| free | maxTokensOutput | 6000 | 4000 | 15 | Retune analyze-resume/index.ts FREE_SINGLE_CALL_MAX_TOKENS |
| pro  | maxTokensOutput | 16000 | 8000 | 15 | Retune CALL_CONFIGS sum |
| elite | maxTokensOutput | 20000 | 12000 | 15 | Retune CALL_CONFIGS sum |
| free | maxTokensInput | — (truncation only) | 3500 | (new) | validateInputBudget pre-Anthropic |
| free | maxCharactersInput | — | 14000 | (new) | same |
| ... | ... | ... | ... | ... | ... |

## careerCompass
...
```

Use the SC-13 row format specified in CONTEXT D-14 (`| Feature | Tier | Budget Type | Old Value | New Value | Source Phase | Action |`). Author this as 5 sections (one per feature: resumeAnalysis, careerCompass, recruitingLens, linkedinGrader, interviewPrepCoach) — data from RESEARCH.md "maxTokensOutput — Audit Delta" table (lines 887-903).

---

## Shared Patterns

### Auth (applies to all new edge functions)

**Source:** `supabase/functions/_shared/auth.ts` (`requireAuth`) + pattern usage in `create-checkout-session/index.ts` lines 139-148

**Apply to:** `create-payment-intent/index.ts`

```typescript
const requireAuthFn = deps.requireAuth ??
  ((r: Request) => realRequireAuth(r, { type: "user" }) as Promise<UserContext>);
let ctx: UserContext;
try {
  ctx = await requireAuthFn(req);
} catch (r) {
  if (r instanceof Response) return r;
  throw r;
}
```

### CORS handling (applies to all new edge functions)

**Source:** `create-checkout-session/index.ts` lines 131-133, `merit-gateway.ts` lines 238-239

```typescript
if (req.method === "OPTIONS") {
  return handleOptionsRequest({ type: "user" });
}
// ...
headers: { ...corsHeaders({ type: "user" }), "Content-Type": "application/json" }
```

**Apply to:** every new edge function handler.

### Rate limiting (applies to `create-payment-intent`)

**Source:** `create-checkout-session/index.ts` lines 153-159

```typescript
const rl = await rateLimitFn(ctx.userId, ctx.tier, {
  key: "create-payment-intent",
  limits: { free: 10, pro: 10, elite: 10 },  // tight cap per shop-pattern
  windowSeconds: 3600,
});
if (!rl.allowed) return createRateLimitResponse(rl.retryAfterSeconds, "user");
```

### Structured logging (applies to all new edge functions + invariant surface)

**Source:** `supabase/functions/_shared/logger.ts` usage everywhere; `create-checkout-session/index.ts` line 53, `stripe-webhook-handler/index.ts` lines 96, 453-458

**Pattern:**
```typescript
const log = createLogger("create-payment-intent");
log.info("payment-intent-created", { userId: ctx.userId, packSize, piId: pi.id });
log.error("stripe-pi-failed", { userId: ctx.userId, error: err.message });
log.error("invariant-violation", { feature, tier, source: 'd-03', ts_value, db_value });  // D-28
```

**Apply to:** `create-payment-intent`, the D-03 invariant throw, the D-10 invariant throw, and every new handler.

### Deps-injection for testability (applies to new edge functions)

**Source:** `create-checkout-session/index.ts` lines 98-107 + lines 127-149 (optional deps chain)

```typescript
export interface CreatePaymentIntentDeps {
  supabase?: SupabaseLike;
  stripe?: Stripe;
  requireAuth?: (req: Request) => Promise<UserContext>;
  checkRateLimit?: (userId: string, tier: string, cfg: RateLimitConfig) => Promise<RateLimitResult>;
}
```

### React Query + rpc (applies to `useCreatePaymentIntent`, `useFeatureCosts` modification)

**Source:** `src/hooks/useMerits.ts` lines 31-43, `src/hooks/useFeatureCosts.ts` lines 11-22

```typescript
const { data, isLoading } = useQuery({
  queryKey: ['merit-balance', userId],
  queryFn: async () => {
    const { data, error } = await supabase.rpc('get_merit_balance', { p_user_id: userId! });
    if (error) throw error;
    return data;
  },
  enabled: !!userId,
  staleTime: 5_000,
});
```

### Invalidate-on-mutation (applies to post-purchase refresh per D-25)

**Source:** `useMerits.ts` lines 62-65

```typescript
export function useInvalidateMerits() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['merit-balance'] });
}
```

Caller: Payment Element `onSuccess` handler → call `invalidateMerits()` + toast.

### shadcn Dialog host (applies to both new modal components)

**Source:** `src/components/StripeCheckoutWrapper.tsx` lines 30-44

```typescript
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="max-w-md">  {/* or max-w-[560px] */}
    <DialogHeader>
      <DialogTitle>{title}</DialogTitle>
    </DialogHeader>
    {/* body */}
  </DialogContent>
</Dialog>
```

**Apply to:** `StripePaymentElementModal`, `OutOfMeritsModalV2`.

### Router-hash deep-link (applies to all top-up CTAs)

**Source:** `src/components/MeritBalanceBadge.tsx` lines 72-77 (react-router `<Link to="/shop">`)

**Phase 24 pattern** — use `useNavigate()` + hash:
```typescript
import { useNavigate } from 'react-router-dom';
const navigate = useNavigate();
onClick={() => navigate('/pricing#packs')}
```

**Apply to:** `HeaderTopUpTrigger`, `OutOfMeritsModalV2` primary CTA, `RunningLowCard` primary CTA.

### Deno boot-time invariant (applies to D-03 and D-10)

**Source:** `analyze-resume/index.ts` lines 65-80 (existing pattern — module-scope `for` loop that throws)

```typescript
for (const tier of ['free', 'pro', 'elite'] as const) {
  const sum = /* ... */;
  if (sum > cap) throw new Error(`[handler-name] ${detail}`);
}
```

**Apply to (D-10 rewire):** all 5 feature handlers. **Apply to (D-03):** `tier-config.ts` `verifyCostMap` called once at cold start.

---

## No Analog Found

Files with no close match in the codebase (planner should lean on RESEARCH.md patterns):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/pages/__tests__/pricing-boxy.lint.test.ts` | CI-lint vitest | file-I/O (glob + regex) | No existing mechanical-AST lint test in repo; novel to Phase 24 (D-18). RESEARCH.md provides the full pattern to copy. |
| `src/config/pricing-config.snapshot.ts` | test fixture (pinned SC-12 values) | static-constants | Novel D-19 artefact; copy the SC-12 tables from ROADMAP lines 468-497 verbatim into a const. |
| `src/components/topup/StripePaymentElementModal.tsx` (PaymentElement inner) | Stripe Elements / PaymentElement | request-response | Repo uses only `EmbeddedCheckout` today; `<PaymentElement>` is net-new. RESEARCH.md Pattern (lines 256-264 + ~486) provides the full shape. Upstream docs reference: `@stripe/react-stripe-js` PaymentElement. |

---

## Metadata

**Analog search scope:**
- `supabase/functions/_shared/` — tier-config.ts, merit-gateway.ts, auth.ts, cors.ts, logger.ts, rate-limiter.ts
- `supabase/functions/create-checkout-session/` — index.ts (primary analog for new create-payment-intent)
- `supabase/functions/stripe-webhook-handler/` — index.ts (analog for new branch)
- `supabase/functions/analyze-resume/` — index.ts (analog for per-feature rewire)
- `supabase/migrations/20260415000000_merit_rpcs.sql` — analog for new topup migration
- `src/components/ui/button.tsx` — analog for boxy variant
- `src/components/MeritBalanceBadge.tsx` — analog for MeritBalanceHeaderV2
- `src/components/StripeCheckoutWrapper.tsx` — analog for StripePaymentElementModal
- `src/components/UpgradeModal.tsx` — analog for OutOfMeritsModalV2 (rewrite target)
- `src/hooks/useMerits.ts`, `src/hooks/useFeatureCosts.ts` — analog for useCreatePaymentIntent
- `src/index.css` — analog for .theme-v2 append
- `src/pages/Pricing.tsx` — analog for PricingPageV2 rewrite
- `.planning/v2.0-MILESTONE-AUDIT.md` — analog for 24-AUDIT.md

**Files scanned:** 15+ source files read first-hand during mapping

**Pattern extraction date:** 2026-04-21

**Key takeaways for the planner:**
1. **70% of the work is composition of existing patterns** — the merit RPC already does SC-7 spend ordering; the webhook already credits shop via `credit_shop_merits`; the Checkout handler already supports `mode: 'payment'`. Phase 24 wires NEW paths alongside these (not replacements).
2. **Three genuinely novel patterns** have no in-repo analog: (a) the `<PaymentElement>` wrapper (vs existing `<EmbeddedCheckout>`), (b) the vitest boxy-lint (no AST lint exists today), (c) the `.theme-v2` namespace (first scoped CSS-var overlay). Each has a clear template in either RESEARCH.md (Patterns 1-3) or UI-SPEC.
3. **The five feature-handler rewires are mechanical** — same import swap, same boot-invariant rewrite, same `validateInputBudget` call-site insertion. Build one (analyze-resume), copy-paste + adjust feature key for the other four.
4. **Migration-first deploy (D-22)** — the `20260422000000_phase_24_topup.sql` migration is INDEPENDENTLY SHIPPABLE (additive columns + partial unique index). No code needs it before the code deploy ships; the code deploy depends on it being applied first. Planner should put this migration in Wave 0.
