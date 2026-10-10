# Phase 21: integration-validation-and-cutover - Research

**Researched:** 2026-04-19
**Domain:** Supabase Edge Functions (Deno) integration testing + PostgreSQL RLS migration + production cutover choreography
**Confidence:** HIGH

## Summary

Phase 21 is a pure *composition* phase: nearly every technical primitive it relies on already exists in the repository and has been verified. The three integration tests (TEST-04/05/06) have a perfect template in `analyze-resume/test-07.test.ts` — an offline Deno test that mocks the Phase 11 RPC layer in memory and exercises `withMerits` from the real `_shared/merit-gateway.ts`. Stripe webhook fixture + HMAC-signing helpers already ship at `_shared/test-helpers/stripe-fixtures.ts` + `_shared/test-helpers/stripe-signature.ts` and are used verbatim by `stripe-webhook-handler/index.test.ts`. The yearly-reset entry point `reset-subscription-merits/index.ts` is directly invokable with an internal-secret Bearer token — no clock-mocking required.

The MIG-02 migration is simpler than the context suggests: `analysis_results` currently has exactly one user write policy (`"Users can create their own analysis results"` INSERT policy in migration `20251222223116_...sql`). MIG-02 drops it. There is no existing user UPDATE or DELETE policy to drop. Service-role writes from edge functions (already the standard pattern in `recruiting-lens`, `analyze-career`) continue unaffected. The frontend `saveAnalysisResult` bypass in `src/lib/analysisHelpers.ts:120-150` has exactly one caller (`src/components/MinimalHero.tsx:163`) and one SELECT-only sibling (`getAnalysisHistory`). `src/pages/RecruitingLens.tsx` and `src/pages/CareerCompass.tsx` already use SELECT-only access — no writes.

The D-05 context claim that MIG-02 "mirrors the MIG-04 pattern applied to `usage_tracking`" is inaccurate as stated: `usage_tracking` was service-role-only from inception (migration `20251222220418_...sql` enables RLS with zero user write policies), so there was no policy to drop. The correct framing: MIG-02 *arrives at* the same posture MIG-04 already has. The migration is a one-line `DROP POLICY IF EXISTS`.

The cutover machinery is lighter than expected. `deploy-production.ps1` is a simple `foreach ($fn in $Functions) { supabase functions deploy $fn --use-api }` loop; the flag flip is a **separate operator command** (`supabase secrets set MERIT_SYSTEM_ENABLED=true --project-ref zjpjapgraoxdukdvpjes`) followed by a re-run of the deploy script to restart workers. There is no existing synthetic-probe script in `scripts/` — `sc5-probe.ps1` is new.

**Primary recommendation:** Copy `analyze-resume/test-07.test.ts`'s mock-ledger fixture verbatim into three new files in `supabase/functions/_tests/`, extend the mock with Stripe-webhook event fixtures (via existing `stripe-fixtures.ts`), and structure the cutover as a runbook + two new scripts (`sc5-probe.ps1`, `cutover-production.ps1`) rather than embedding it in the existing deploy script.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Test Strategy & Harness (TEST-04/05/06)**
- **D-01:** Offline mock harness matching TEST-07 precedent. Deno tests with in-memory mocks of Phase 11 RPC contracts (`check_and_deduct_merits`, `credit_shop_merits`, `reset_subscription_merits`) + mocked Stripe webhook events. Zero external deps; runs in CI.
- **D-02:** Stripe webhook flows simulated by invoking `stripe-webhook-handler` directly with crafted signed fixture payloads (`checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`) carrying valid HMAC signatures.
- **D-03:** TEST-06's 30-day reset simulated by directly invoking the `reset-subscription-merits` edge function. No `Date.now()` mocking.
- **D-04:** Scenario files in `supabase/functions/_tests/`: `test-04-free-signup-to-shop.test.ts`, `test-05-upgrade-proration.test.ts`, `test-06-yearly-reset.test.ts`. Registered in `scripts/run-edge-tests.ps1`.

**Legacy analysis_results Lock (MIG-02)**
- **D-05:** Drop the user `INSERT/UPDATE/DELETE` policies on `analysis_results`. Keep `SELECT "Users can view their own"`. Service role writes unrestricted via RLS bypass. Mirrors MIG-04 posture on `usage_tracking`.
- **D-06:** Close frontend bypass at `src/lib/analysisHelpers.ts:120-150` (`saveAnalysisResult`). All writes move into edge functions with service role AFTER successful `check_and_deduct_merits`. Frontend helper reduced to SELECT-only or deleted.
- **D-07:** Block all user `DELETE` on `analysis_results`. `admin-delete-user` retains service-role delete.
- **D-08:** MIG-02 ships with `MERIT_SYSTEM_ENABLED=false` **before** the flag flip.

**Cutover Sequence & Rollback**
- **D-09:** Full pre-flip checklist MANDATORY (TEST-04/05/06/07/08 green; MIG-01/03 verified; admin views queryable; `alert_state` present + `check-merit-alerts` firing dry-run; MIG-02 applied).
- **D-10:** Binary flip. `supabase secrets set MERIT_SYSTEM_ENABLED=true --project-ref <prod>` + restart all gated functions. Accepts ~30s mixed-state window.
- **D-11:** 24-hour staging soak with scripted walkthrough + clean `alert_state`. Alert/walkthrough failure aborts prod flip.
- **D-12:** 2-hour active post-flip soak on production. Success = zero NFR-11 alerts AND ≥1 `merit-transaction` log per gated feature.
- **D-13:** Rollback trigger = hard + human-in-loop. Alert is signal, not automation.
- **D-14:** Rollback procedure = flag-only (`MERIT_SYSTEM_ENABLED=false` + restart). `merit_transactions` rows preserved. MIG-02 lock stays.
- **D-15:** Flip authority = `strivolife@gmail.com` only.
- **D-16:** Flip timing = low-traffic weekday morning US-ET. Avoid Fridays/weekends.

**SC-5 Verification**
- **D-17:** Proven by `merit-transaction` log lines (one per gated feature). Phase 13 D-11 already emits this via `createLogger('merit-gateway').info('merit-transaction', { user_id, amount, source, feature, transaction_id })`.
- **D-18:** Low-traffic features exercised by scripted synthetic probe (`scripts/sc5-probe.ps1`). Dedicated test account.
- **D-19:** `merit-flag: enabled=true` boot-time log per gated handler.
- **D-20:** Evidence = `.planning/phases/21-integration-validation-and-cutover/21-SC5-EVIDENCE.md` (timestamped excerpts grouped by feature + `supabase secrets list` + probe output).
- **D-21:** Missing `merit-transaction` log for any D-07 feature = SC-5 failure. No partial credit.
- **D-22:** Evidence file committed indefinitely. Plain text, no PII.
- **D-23:** SC-5 is one-time launch gate. Post-launch regressions covered by `merit-branch.test.ts` + NFR-11 alerts.
- **D-24:** Owner writes `21-SC5-EVIDENCE.md` during active 2h soak and commits before `gsd-verifier`.

### Claude's Discretion

- Exact fixture shapes for crafted Stripe events in D-02 (use `stripe-webhook-handler/index.test.ts` precedent — `makeCheckoutSessionCompletedEvent` etc. already exist in `_shared/test-helpers/stripe-fixtures.ts`).
- Script language for D-18's synthetic probe (PowerShell preferred — matches `deploy-production.ps1`).
- Log line format for D-19's attestation (keep greppable, single line, stable key).
- Whether to delete `src/lib/analysisHelpers.ts` entirely or keep SELECT-only helper (executor decides based on read-caller count).

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEST-04 | Integration test: Free signup → 5 Merits → Resume (3) → 2 left → Career Compass (3) blocked → buy 3-pack → 5 Merits → Career Compass succeeds → 2 left | §Test Harness Anatomy; §RPC Contracts; §Stripe Fixture Helpers |
| TEST-05 | Integration test: Free → Pro upgrade → 75 Merits → Recruiting Lens (8) → 67 left → limited output → Pro → Elite → diff credited → Recruiting Lens (5) → full output | §Test Harness Anatomy; §Upgrade Diff RPC (`grant_upgrade_diff`); §Tier-Gated Output Validation |
| TEST-06 | Integration test: Pro yearly subscribe → $89.99 charged → 75 Merits → simulate 30 days → reset to 75 → zero rollover | §reset-subscription-merits Invocation; §Monthly vs Yearly Reset Logic |
| MIG-02 | Existing `analysis_results` read-only; new analyses require Merits | §MIG-02 Migration Shape; §Frontend Write Inventory; §Service-Role Writers |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Mock RPC ledger (TEST-04/05/06) | Edge Functions (Deno test runtime) | — | Tests live in `supabase/functions/_tests/`; they exercise `withMerits` + classifier from `_shared/merit-gateway.ts` against an in-memory fake of Phase 11 RPCs. |
| Stripe webhook HMAC signing (test helper) | Edge Functions (Deno test runtime) | — | `_shared/test-helpers/stripe-signature.ts` already implements Stripe's `t=<unix>,v1=<hex>` scheme via `crypto.subtle` (Node `Stripe.generateTestHeaderString` does not work in Deno). |
| `analysis_results` RLS | Database (PostgreSQL) | — | RLS policy drop is a one-statement SQL migration. Service-role bypass is the only write path after MIG-02. |
| Frontend write-site removal | Browser / Client | — | `src/lib/analysisHelpers.ts` + `src/components/MinimalHero.tsx` are React code; the bypass must be closed before MIG-02 applies. |
| Boot-time attestation log (D-19) | Edge Functions (Deno runtime) | — | Each gated handler reads `MERIT_SYSTEM_ENABLED` at module load; the log line is emitted at module scope so it fires once per worker cold start. |
| 2h soak monitoring | Database (views) + Edge Functions (logs) | Owner (manual) | `v_conversion_funnel` + `v_merit_balance_health` are Postgres views; `merit-transaction` logs are captured by Supabase function stdout; human owner watches both. |
| Cutover execution | Operator CLI (local PowerShell) | Supabase Platform | `supabase secrets set` + `supabase functions deploy` are platform operations invoked from owner's laptop. |
| Synthetic probe | Operator CLI (local PowerShell) | Edge Functions (targets) | `scripts/sc5-probe.ps1` runs from operator laptop, invokes each gated edge function via HTTPS with a test-account Bearer. |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Deno std assert | `https://deno.land/std@0.224.0/assert/mod.ts` | Test assertions in `.test.ts` files | Used verbatim by `test-07.test.ts`, `merit_rls_test.ts`, and every edge test in the repo. `[VERIFIED: repo grep]` |
| `@supabase/supabase-js` | `^2.81.1` (frontend) / `npm:@supabase/supabase-js@2` (edge tests) | Supabase client for RLS tests + integration calls | Imported by `merit_rls_test.ts` line 21. `[VERIFIED: repo grep]` |
| `stripe` (npm) | `npm:stripe@14` | Stripe SDK; used by `stripe-webhook-handler` for `constructEventAsync` signature verification | Imported by `stripe-webhook-handler/index.ts` line 30. `[VERIFIED: repo grep]` |
| Deno runtime | Deno 2+ | Test execution and edge function runtime | `package.json` + `deno.json` lock this. `[VERIFIED: CLAUDE.md]` |

### Supporting (already in repo)

| File | Purpose | When to Use |
|------|---------|-------------|
| `supabase/functions/_shared/test-helpers/stripe-fixtures.ts` | `makeCheckoutSessionCompletedEvent`, `makeInvoicePaymentSucceededEvent`, `makeInvoicePaymentFailedEvent`, `makeSubscriptionCreatedEvent`, `makeSubscriptionUpdatedEvent`, `makeSubscriptionDeletedEvent` | Build `Stripe.Event` fixtures for TEST-04/05/06 without touching Stripe API. `[VERIFIED: file exists]` |
| `supabase/functions/_shared/test-helpers/stripe-signature.ts` | `signStripePayload(payload, secret) -> "t=<ts>,v1=<hex-hmac>"` | Sign fixture payloads so `stripe.webhooks.constructEventAsync` accepts them. `[VERIFIED: file contents read]` |
| `supabase/functions/_shared/merit-gateway.ts` | `withMerits`, `MeritRefundable`, `MERIT_SYSTEM_ENABLED`, `isRefundableAnthropicError`, `readMeritFlag` | The system under test; imports re-used in TEST-04/05/06 verbatim. `[VERIFIED: file contents read]` |
| `supabase/functions/reset-subscription-merits/index.ts` | `handleResetSubscriptionMerits(req, deps)` | Direct invocation target for TEST-06. Supports `deps.supabase` + `deps.requireAuth` injection. `[VERIFIED: signature lines 41-44]` |
| `supabase/functions/stripe-webhook-handler/index.ts` | `handleStripeWebhook(req, deps)` | Direct invocation target for TEST-04/05/06 Stripe flows. Supports `deps.stripe` + `deps.supabase`. `[VERIFIED: signature lines 92-95]` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff / Why Rejected |
|------------|-----------|-------------------------|
| Offline mock ledger | Real Supabase local DB (`supabase start`) | Slower, requires Docker, adds flakiness to CI. D-01 explicitly rejects this. `merit_rls_test.ts` is the only test that needs live Postgres because RLS cannot be faked. |
| `Stripe.generateTestHeaderString` | Hand-rolled `crypto.subtle` HMAC (`signStripePayload`) | Stripe SDK's built-in helper uses Node `crypto` — incompatible with Deno runtime (see supabase/supabase#26126). `[CITED: stripe-signature.ts header comment]` |
| Mocking `Date.now()` for 30-day advance | Direct invocation of `reset-subscription-merits` | Locked by D-03. No timer mocking needed. |
| Per-feature flag env vars | Single global `MERIT_SYSTEM_ENABLED` | Rejected in Phase 13 D-05. Cutover D-10 confirms: binary flip, all features at once. |
| HTTP self-invocation of `admin-merit-metrics` in soak monitor | Direct SQL queries to views | Owner is watching the 2h soak manually; direct SQL from Supabase Studio is simpler than constructing Bearer tokens. Phase 13 D-13 provides the HTTP endpoint for programmatic use but the soak does not require it. |

**Installation:** No new npm dependencies required. All primitives exist in `deno.json` transitively.

**Version verification:** 
- `@supabase/supabase-js` 2.81.1 confirmed in `package.json` line 51 `[VERIFIED: package.json]`
- `stripe` npm:14 confirmed in `stripe-webhook-handler/index.ts` line 30 `[VERIFIED: file read]`
- Deno std 0.224.0 used by `test-07.test.ts` `[VERIFIED: line 18]`

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PHASE 21 DATA FLOW                                    │
└─────────────────────────────────────────────────────────────────────────────┘

  INTEGRATION TESTS (offline, CI)                   REAL PRODUCTION (cutover)
  ─────────────────────────────                     ────────────────────────

  deno test via run-edge-tests.ps1                  strivolife@gmail.com laptop
          │                                                   │
          ▼                                                   ▼
  ┌──────────────────────────┐                      ┌──────────────────────────┐
  │ _tests/test-04-*.test.ts │                      │ Pre-flip checklist       │
  │ _tests/test-05-*.test.ts │                      │ (TEST-04/05/06/07/08     │
  │ _tests/test-06-*.test.ts │                      │  green; MIG-01/03/02     │
  │                          │                      │  verified; alert_state   │
  │ - In-memory mock ledger  │                      │  present & firing)       │
  │ - Real withMerits import │                      └────────────┬─────────────┘
  │ - Real merit-gateway.ts  │                                   │
  │ - Real stripe-webhook-   │                                   ▼
  │   handler import         │                      ┌──────────────────────────┐
  │ - signStripePayload fake │                      │ 24h staging soak         │
  │ - makeCheckoutSession*   │                      │ MERIT_SYSTEM_ENABLED=true│
  │   fixtures               │                      │ on staging project-ref   │
  └────────────┬─────────────┘                      └────────────┬─────────────┘
               │                                                 │
               ▼                                                 ▼
  ┌──────────────────────────┐                      ┌──────────────────────────┐
  │ Mock RPC surface:        │                      │ supabase secrets set     │
  │ - check_and_deduct_merits│                      │   MERIT_SYSTEM_ENABLED   │
  │ - refund_merits          │                      │   =true                  │
  │ - credit_shop_merits     │                      │   --project-ref <prod>   │
  │ - reset_subscription_*   │                      └────────────┬─────────────┘
  │ - grant_upgrade_diff     │                                   │
  └────────────┬─────────────┘                                   ▼
               │                                      ┌──────────────────────────┐
               ▼                                      │ supabase functions       │
  ┌──────────────────────────┐                        │ deploy <each gated fn>   │
  │ Assertions:              │                        │ (triggers cold restart;  │
  │ - balance transitions    │                        │  module-scope env read)  │
  │ - merit_transactions rows│                        └────────────┬─────────────┘
  │ - refund idempotency     │                                     │
  │ - rollover=0 for yearly  │                                     ▼
  │ - tier-gated output      │                        ┌──────────────────────────┐
  └──────────────────────────┘                        │ 2h active soak:          │
                                                      │ - tail merit-transaction │
                                                      │ - watch v_*_views        │
                                                      │ - watch alert_state      │
                                                      │ - run sc5-probe.ps1 at   │
                                                      │   90 min if any feature  │
                                                      │   has zero organic calls │
                                                      └────────────┬─────────────┘
                                                                   │
                                                                   ▼
                                                      ┌──────────────────────────┐
                                                      │ 21-SC5-EVIDENCE.md       │
                                                      │ committed to repo        │
                                                      │ (log excerpts, secrets   │
                                                      │  list, probe output)     │
                                                      └──────────────────────────┘

  ─────────────────────────────                     ────────────────────────
  MIG-02 APPLICATION (parallel prep before flip)

  supabase/migrations/202604xxxxxxxx_mig_02_analysis_results_readonly.sql
  ───────────────▼────────────────
  DROP POLICY "Users can create their own analysis results" ON public.analysis_results;
  ───────────────│────────────────
         ▼
  Effect: frontend cannot .insert() → MinimalHero.tsx + analysisHelpers.ts call site must migrate
  Service-role writes from analyze-career, recruiting-lens, process-*-job unaffected
  User SELECT preserved
```

### Recommended Project Structure

```
supabase/
├── migrations/
│   └── 202604xxxxxxxx_mig_02_analysis_results_readonly.sql    # NEW — one DROP POLICY
├── functions/
│   └── _tests/
│       ├── merit_rls_test.ts                                  # EXISTING (Phase 10)
│       ├── test-04-free-signup-to-shop.test.ts               # NEW (D-04)
│       ├── test-05-upgrade-proration.test.ts                 # NEW (D-04)
│       └── test-06-yearly-reset.test.ts                      # NEW (D-04)
└── ...

scripts/
├── run-edge-tests.ps1                                        # MODIFY — register 3 new test files
├── deploy-production.ps1                                     # REFERENCE (cutover uses as-is)
├── deploy-staging.ps1                                        # REFERENCE (staging soak uses as-is)
├── cutover-production.ps1                                    # NEW (orchestrates flag flip + deploy) — optional
└── sc5-probe.ps1                                             # NEW (D-18 synthetic probe)

src/
├── lib/
│   └── analysisHelpers.ts                                    # MODIFY — remove saveAnalysisResult (D-06)
└── components/
    └── MinimalHero.tsx                                       # MODIFY — remove saveAnalysisResult call (line 163)

.planning/phases/21-integration-validation-and-cutover/
├── 21-CONTEXT.md
├── 21-RESEARCH.md
├── 21-PLAN.md (+ plan files)
├── 21-SC5-EVIDENCE.md                                        # NEW (committed at soak end, D-20)
└── 21-VERIFICATION.md                                        # Created by gsd-verifier
```

### Pattern 1: Offline Deno Test with In-Memory Mock Ledger

**What:** Ledger state lives in a `MockLedger` interface with `subscription_balance`, `shop_balance`, `transactions[]`. A `buildMockServiceClient(ledger, userId)` function returns an object implementing `.rpc(fnName, params)` + `.from(table).select(...).eq(...).single()` that reproduces the real Supabase service-client surface. Each RPC call mutates the ledger in-memory.

**When to use:** TEST-04/05/06 each need a different multi-step sequence of RPC calls; each test instantiates its own ledger and asserts transitions.

**Example (verbatim pattern from `analyze-resume/test-07.test.ts`):**

```typescript
// Source: supabase/functions/analyze-resume/test-07.test.ts (lines 44-121)
function createMockLedger(subBalance: number, shopBalance: number): MockLedger {
  return { subscription_balance: subBalance, shop_balance: shopBalance, transactions: [] };
}

function mockCheckAndDeductMerits(
  ledger: MockLedger, userId: string, feature: string, tier: string,
): Record<string, unknown> {
  const cost = FEATURE_COSTS[feature]?.[tier];
  if (cost === undefined) return { error: "tier_locked", upgrade_required: true };
  if (ledger.subscription_balance + ledger.shop_balance < cost)
    return { error: "insufficient_merits", upgrade_required: true };
  const subTake = Math.min(ledger.subscription_balance, cost);
  const shopTake = cost - subTake;
  const deductionId = uuid();
  // ... writes 1-2 merit_transactions rows sharing deduction_id ...
  return { success: true, transaction_id: deductionId, remaining_balance: ..., deducted_from: ... };
}
```

### Pattern 2: Crafted Signed Stripe Event Invocation

**What:** Build an `Stripe.Event` via `makeCheckoutSessionCompletedEvent(...)`, serialize with `JSON.stringify`, sign with `signStripePayload(body, TEST_SECRET)`, attach as `stripe-signature` header, POST to `handleStripeWebhook(req, deps)`.

**When to use:** Every TEST-04/05/06 scenario that transitions state via Stripe (shop purchase, subscription upgrade, monthly invoice).

**Example (verbatim pattern from `stripe-webhook-handler/index.test.ts`):**

```typescript
// Source: supabase/functions/_shared/test-helpers/stripe-signature.ts (lines 14-36)
export async function signStripePayload(payload: string, secret: string): Promise<string> {
  const ts = Math.floor(Date.now() / 1000);
  const signedPayload = `${ts}.${payload}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `t=${ts},v1=${hex}`;
}

// Usage in a test:
const event = makeCheckoutSessionCompletedEvent({ mode: "subscription", tier: "pro", priceId: PRO_MONTHLY });
const body = JSON.stringify(event);
const signature = await signStripePayload(body, TEST_SECRET);
const req = new Request("https://example.com/stripe-webhook-handler", {
  method: "POST",
  headers: { "stripe-signature": signature, "Content-Type": "application/json" },
  body,
});
const resp = await handleStripeWebhook(req, { supabase: fakeSupabase, stripe: fakeStripe });
```

### Pattern 3: Boot-Time Module-Scope Attestation Log (D-19)

**What:** Add `log.info('merit-flag', { enabled: MERIT_SYSTEM_ENABLED });` at module scope in each gated handler, after the import of `MERIT_SYSTEM_ENABLED` from `_shared/merit-gateway.ts`. Fires once per worker cold start — greppable across post-flip logs.

**When to use:** D-19 attestation. Every D-07 gated handler gets exactly one such line. `interview-prep-evaluate` is the only gated feature that does NOT currently import `MERIT_SYSTEM_ENABLED` (see Open Questions) — decide whether to add the import or treat it as intentionally out-of-scope.

**Example:**

```typescript
// At top of each gated handler, after imports:
import { MERIT_SYSTEM_ENABLED, withMerits, MeritRefundable } from '../_shared/merit-gateway.ts';
import { createLogger } from '../_shared/logger.ts';

const _bootLog = createLogger('analyze-resume');
_bootLog.info('merit-flag', { enabled: MERIT_SYSTEM_ENABLED });
```

**Greppable evidence:** `supabase functions logs analyze-resume | grep '"msg":"merit-flag"'` → should emit `"enabled":true` once per cold start.

### Pattern 4: Direct-Invocation of `reset-subscription-merits` (D-03)

**What:** TEST-06 does not mock `Date.now()`. Instead, it directly invokes `handleResetSubscriptionMerits(req, deps)` with a fake `supabase` client where the `user_merits` row has `subscription_reset_date` in the past. The real RPC logic then fires as if the cron loop picked the user up.

**When to use:** TEST-06 yearly reset; also the walkthrough step in the 24h staging soak.

**Example:**

```typescript
// Source: reset-subscription-merits/index.ts accepts deps injection (lines 41-44)
const req = new Request("https://example.com/reset-subscription-merits", {
  method: "POST",
  headers: { "Authorization": `Bearer ${INTERNAL_JOB_SECRET}` },
  body: JSON.stringify({ invocation_source: "manual" }),
});
const resp = await handleResetSubscriptionMerits(req, {
  supabase: fakeSupabaseWithDuePayableUser,
  requireAuth: async () => ({ ok: true }),
});
// Then assert: ledger.subscription_balance === 75 (Pro) or 150 (Elite)
// Then assert: a merit_transactions row with balance_type='grant', source='subscription-reset'
// Then assert: shop_balance unchanged (D-15)
```

### Anti-Patterns to Avoid

- **Invoking `stripe-webhook-handler` over HTTP in tests.** Use the exported `handleStripeWebhook(req, deps)` directly with deps-injected fakes. HTTP-only tests introduce CORS/port flakiness and run an order of magnitude slower.
- **Dropping user DELETE policies in MIG-02 when none exist.** Verified: `analysis_results` currently has *exactly* `SELECT "Users can view their own"` + `INSERT "Users can create their own"`. There is no user UPDATE or DELETE policy to drop. `DROP POLICY IF EXISTS` on nonexistent policies is harmless but dead code.
- **Deleting `getAnalysisHistory` in `src/lib/analysisHelpers.ts`.** `getAnalysisHistory` is SELECT-only — does not violate MIG-02. Only `saveAnalysisResult` must go.
- **Mocking `Date.now()` for the 30-day reset.** Locked by D-03. Direct invocation is the canonical path.
- **Adding auto-rollback on NFR-11 alert.** Locked by D-13. Alert is signal, not automation — flag-flapping risk on transient spikes.
- **Relying on `Stripe.generateTestHeaderString` in Deno.** Does not work (Node-only crypto). Use `signStripePayload` from `_shared/test-helpers/stripe-signature.ts`. `[CITED: stripe-signature.ts header]`
- **Embedding the flag flip inside `deploy-production.ps1`.** The deploy script is idempotent by design — adding `supabase secrets set` to it would make every deploy reconfigure the flag. Keep the cutover step separate: either a new `cutover-production.ps1` that composes deploy + secrets-set, or explicit manual commands in the runbook.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HMAC signing of Stripe test payloads | Custom HMAC-SHA-256 wrapper | `signStripePayload` in `_shared/test-helpers/stripe-signature.ts` | Already exists, uses `crypto.subtle`, handles Stripe's `t=<unix>.payload` serialization quirk. |
| Stripe Event fixtures | Hand-typed `Stripe.Event` literals | `makeCheckoutSessionCompletedEvent` etc. in `_shared/test-helpers/stripe-fixtures.ts` | Existing helpers already match the `Stripe.Event` shape `constructEventAsync` expects. |
| Mock Supabase client | Custom `{ rpc, from }` fake | Copy `buildMockServiceClient` from `test-07.test.ts` (lines 188-246) | Faithfully reproduces the service-client surface the gateway consumes. |
| Rate-limit mock | Custom fake | `test-07.test.ts` line 208-214 mocks `increment_rate_limit` RPC to always allow | Existing; one-line extension. |
| `merit-transaction` log emission | New code | Already emitted by `withMerits` after RPC success (`merit-gateway.ts:155`) | D-17 is "observe this line," not "emit it." |
| Admin alert emails | New email templating | `check-merit-alerts` already wired to `send-strivo-email` (D-15) | Reuse unchanged. |
| Analysis-results DELETE blocking | `REVOKE DELETE ... FROM authenticated` | No action needed | `analysis_results` has zero user DELETE policies; RLS default-deny blocks already. `admin-delete-user` writes with service-role which bypasses RLS. |
| Cron scheduling of `check-merit-alerts` | New cron setup | `supabase/ops/phase-13-cron-setup.sql` (already deployed per Phase 13) | Scheduled `*/15 * * * *`. D-09 checklist asks the owner to confirm it's firing, not to re-schedule it. |

**Key insight:** Phase 21 is integration + choreography. Nearly every primitive already ships and has been unit-tested by earlier phases. The new artifacts are (a) three integration test files, (b) one DROP-POLICY migration, (c) two frontend file edits, (d) boot-log attestation in 9 handlers, (e) one synthetic-probe script, (f) one evidence markdown file.

## Runtime State Inventory

> Required because Phase 21 performs a **production cutover** — flipping an env var and dropping an RLS policy both have live-state implications.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | `analysis_results` table — rows written before MIG-02 are preserved and remain readable by owning users. `merit_transactions` rows written during the cutover window are durable audit, NOT reversed on rollback (D-14). | No data migration. `analysis_results` rows stay; SELECT policy unchanged. |
| **Live service config** | `MERIT_SYSTEM_ENABLED` secret on Supabase project `zjpjapgraoxdukdvpjes` (production ref confirmed in `deploy-production.ps1`). Currently `false` or unset. Set via `supabase secrets set --project-ref zjpjapgraoxdukdvpjes MERIT_SYSTEM_ENABLED=true`. | D-10: flip on cutover. D-14: flip back to `false` on rollback. |
| **OS-registered state** | pg_cron job `check-merit-alerts` schedule `*/15 * * * *` (already installed per Phase 13 `supabase/ops/phase-13-cron-setup.sql`). `reset-subscription-merits` cron (if any — check Phase 12 ops file). | No re-registration. D-09 checklist confirms both are firing in prod before flip. |
| **Secrets and env vars** | `MERIT_SYSTEM_ENABLED` (flipped in D-10), `INTERNAL_JOB_SECRET` (for probe auth), `STRIPE_WEBHOOK_SECRET` (webhook sig verify — unchanged), `APP_URL` (unchanged). | Only `MERIT_SYSTEM_ENABLED` changes. Other secrets confirmed present in D-09 via `supabase secrets list --project-ref <prod>`. |
| **Build artifacts / installed packages** | None — this phase modifies no `package.json` deps, no migrations that recreate tables, no compiled assets. The MIG-02 migration is `DROP POLICY` only (no schema shape change). | None — verified by mapping every artifact in decisions to its substrate. |

**Nothing found for data migration:** Confirmed — MIG-02 changes a *policy*, not a row. `analysis_results` rows written before the cutover are preserved per SC-4. `merit_transactions` rows are preserved across flag flip per D-14.

## Common Pitfalls

### Pitfall 1: Mock ledger drifts from real RPC contract

**What goes wrong:** TEST-04/05/06 pass against the in-memory mock but the production RPC returns a different shape (e.g., Phase 11 refactors `deducted_from` to `deducted_split`).

**Why it happens:** Mock implements the contract as an independent copy.

**How to avoid:**
- Reference the real SQL in `supabase/migrations/20260415000000_merit_rpcs.sql` §2/§3/§5/§6 when writing the mock.
- Add a smoke test (`deno test --allow-net` against staging) to `run-edge-tests.ps1` under an env gate (`if ($env:RUN_LIVE_MERIT=='1')`) so a human can periodically cross-check.
- The mock's comment header should cite the migration line range: `// Mirrors public.check_and_deduct_merits (migration 20260415000000_merit_rpcs.sql §2, lines 67-152)`.

**Warning signs:** TEST-04/05/06 green but Phase 11 unit tests red; `merit-branch.test.ts` red on post-flip smoke.

### Pitfall 2: Forgetting `DROP POLICY IF EXISTS` for idempotency

**What goes wrong:** The MIG-02 migration runs twice (e.g., local replay), second run errors out because the policy was already dropped, CI goes red.

**Why it happens:** `DROP POLICY "name" ON table;` without `IF EXISTS` is not idempotent.

**How to avoid:** Use `DROP POLICY IF EXISTS "Users can create their own analysis results" ON public.analysis_results;` — matches the style of `usage_tracking_user_select_policy.sql`. `[VERIFIED: migration style]`

**Warning signs:** Migration `supabase db push` errors with `ERROR: policy "..." on table ... does not exist`.

### Pitfall 3: Frontend build fails after `saveAnalysisResult` deletion

**What goes wrong:** After D-06 removes `saveAnalysisResult`, `src/components/MinimalHero.tsx` line 163 still imports it, Vite build fails.

**Why it happens:** The helper has exactly **one** external caller (confirmed via grep): `src/components/MinimalHero.tsx:11` imports it and `:163` calls it.

**How to avoid:** Remove both the import AND the call-site. `MinimalHero.tsx:163-170` is a free-signup landing-page save of the analysis result — consider whether the edge function should perform this write going forward (service-role from `analyze-resume` already saves, so the MinimalHero call is likely redundant; verify with plan).

**Warning signs:** `npm run build` fails with "has no exported member 'saveAnalysisResult'". Run `npm run lint` before commit.

### Pitfall 4: Race condition between MIG-02 apply and edge-function deploy

**What goes wrong:** MIG-02 applied in prod but `MinimalHero.tsx` has not been redeployed to Vercel yet — free users hit the `.insert()` call, get RLS denial (`42501`), analysis appears to "save" but silently fails.

**Why it happens:** Migrations and frontend deploys are independent pipelines (Supabase Studio vs Vercel).

**How to avoid:** D-08 sequence — **apply MIG-02 only after** the frontend build containing the `saveAnalysisResult` removal has deployed to production. Order: (1) commit frontend change, (2) wait for Vercel deploy complete, (3) `supabase db push` for MIG-02, (4) verify with direct SQL probe, (5) then proceed with flag flip.

**Warning signs:** Post-MIG-02 error logs show 42501 from browser user-agents; users report "Analysis done but results page empty." Mitigation: user sessions still reading from cached state see stale results but no new rows appear.

### Pitfall 5: `stripe-signature` timestamp skew in tests

**What goes wrong:** Test runs at 09:00:00, ts=1700000000. Test suite runs for 5+ minutes. Later tests constructing fresh signatures use ts=1700000300, but Stripe SDK's default tolerance rejects signatures older than 300 seconds.

**Why it happens:** `constructEventAsync` default tolerance is 300s. Long test suites cross the window.

**How to avoid:** Each test generates its signature immediately before the request. `signStripePayload` reads `Date.now()` at call-time, so as long as signing + dispatch happen within the same test, there's no skew.

**Warning signs:** TEST-04 passes in isolation but fails when run after 5+ minutes of prior tests.

### Pitfall 6: Flag flip propagation ~30s window accepted (D-19) but underestimated

**What goes wrong:** During the ~30s "mixed-state" window after `supabase secrets set`, some in-flight Anthropic calls complete on the legacy path, but their follow-up `saveAnalysisResult` hits RLS denial because MIG-02 already landed. User sees "Analysis complete" but no row saved.

**Why it happens:** MIG-02 is applied pre-flip (D-08). Legacy path still writes via `saveAnalysisResult` (browser client → INSERT RLS policy dropped).

**How to avoid:** D-06 is the contract that closes this: `saveAnalysisResult` is removed as part of this phase, so the legacy path no longer writes `analysis_results` from the browser either. Verify by grep that zero frontend code calls `analysis_results.insert()` before MIG-02 lands. The legacy edge-function path (`analyze-resume` without merit branch) must also save via service-role if it needs to persist — audit required.

**Warning signs:** Post-flip browser errors in Sentry with `42501`.

### Pitfall 7: `check-merit-alerts` debounce state hides rollback-worthy alerts

**What goes wrong:** During the 2h soak, `ai_failure_rate_high` fires once, debounces for 60 minutes per `alert_state.last_fired_at`. A second spike during the soak doesn't re-alert; operator sees "no new alerts" and declares success.

**Why it happens:** `check-merit-alerts/index.ts:23` — `DEBOUNCE_MINUTES = 60`.

**How to avoid:** D-12 soak monitoring reads `alert_state` table directly (via Supabase Studio or probe script), not email count. Query: `SELECT * FROM public.alert_state WHERE last_fired_at > now() - interval '2 hours';` — any row in the window means an alert fired at some point, regardless of whether email was sent.

**Warning signs:** Email inbox looks clean, but `alert_state` has a recent `last_fired_at`.

### Pitfall 8: Synthetic probe auth fails silently

**What goes wrong:** `sc5-probe.ps1` invokes each gated function, but the dedicated test account's auth token is expired or the account was never created. Function returns 401; probe logs "OK response 401" because it didn't assert status.

**Why it happens:** PowerShell `Invoke-RestMethod` default error handling is weak.

**How to avoid:** Every probe request must `-ErrorAction Stop` and assert 2xx. Test account must be created during D-09 checklist (not at probe time). Bearer token generation: refresh via `supabase.auth.signIn*` once, cache for the 2h window.

**Warning signs:** Probe script exits 0 but no `merit-transaction` logs appear — functions returned 401 for each call.

## Code Examples

### Example 1: TEST-04 scenario skeleton

```typescript
// .planning: target file = supabase/functions/_tests/test-04-free-signup-to-shop.test.ts
// Source pattern: analyze-resume/test-07.test.ts (lines 44-121, 188-246, 298-327)

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  makeCheckoutSessionCompletedEvent,
} from "../_shared/test-helpers/stripe-fixtures.ts";
import { signStripePayload } from "../_shared/test-helpers/stripe-signature.ts";

// ... paste MockLedger / mockCheckAndDeductMerits / mockRefundMerits verbatim ...

// Plus: mockCreditShopMerits (mirrors migration 20260415000000 §5)
function mockCreditShopMerits(
  ledger: MockLedger, userId: string, packSize: number, stripePaymentId: string,
): Record<string, unknown> {
  // Idempotency check, pack-size validation, credit shop_balance, ledger row
  // Exactly mirrors public.credit_shop_merits (Phase 11 migration lines 288-352)
  // ...
}

Deno.test("TEST-04: Free signup -> 5 Merits -> Resume (3) -> Career Compass blocked -> shop 3-pack -> Career Compass succeeds", async () => {
  const USER = "00000000-0000-0000-0000-test04000001";
  const ledger = createMockLedger(5, 0); // Free signup = 5 lifetime Merits in subscription_balance (MER-10)

  // Step 1: Resume Analysis (Free cost 3)
  const r1 = mockCheckAndDeductMerits(ledger, USER, "resume_analysis", "free");
  assertEquals((r1 as any).success, true);
  assertEquals((r1 as any).remaining_balance, 2, "after Resume, 2 Merits remain");

  // Step 2: Career Compass (Free cost 3) blocked — only 2 left
  const r2 = mockCheckAndDeductMerits(ledger, USER, "career_compass", "free");
  assertEquals((r2 as any).error, "insufficient_merits");

  // Step 3: Shop 3-pack via crafted webhook event
  const event = makeCheckoutSessionCompletedEvent({
    mode: "payment", packSize: 3, paymentIntentId: "pi_test04_3pack", userId: USER,
  });
  const body = JSON.stringify(event);
  const signature = await signStripePayload(body, "whsec_test_secret_abcdef1234567890");
  // Dispatch via handleStripeWebhook(req, { supabase: ledgerBackedFake, stripe: fakeStripe })
  // — fakeSupabase.rpc('credit_shop_merits', ...) delegates to mockCreditShopMerits
  // ... assert: ledger.shop_balance === 3, total === 5 ...

  // Step 4: Career Compass retry — now succeeds
  const r4 = mockCheckAndDeductMerits(ledger, USER, "career_compass", "free");
  assertEquals((r4 as any).success, true);
  assertEquals((r4 as any).remaining_balance, 2);
  // Subscription-first rule: should have pulled from remaining 2 subscription + 1 shop
  assertEquals((r4 as any).deducted_from.subscription, 2);
  assertEquals((r4 as any).deducted_from.shop, 1);
});
```

### Example 2: MIG-02 migration (complete, one file)

```sql
-- Source: new file, supabase/migrations/202604XXXXXXXX_mig_02_analysis_results_readonly.sql
-- Based on style of supabase/migrations/20260417000000_usage_tracking_user_select_policy.sql
-- Implements MIG-02, closes Phase 21 D-05.
--
-- Effect: drops the user INSERT policy on public.analysis_results. After this
-- migration, only service_role (edge functions bypassing RLS) can INSERT rows.
-- SELECT policy "Users can view their own analysis results" is preserved.
--
-- Pre-condition (D-06, enforced by plan): all frontend code that writes
-- analysis_results has been removed in a prior commit. Verified via:
--   rg "from\('analysis_results'\)" src/ -n  -->  only .select() calls
--   rg "saveAnalysisResult" src/ -n          -->  no matches
--
-- Rollback: see Phase 21 D-14 — not reversed. The lock stays even on flag rollback.

DROP POLICY IF EXISTS "Users can create their own analysis results"
  ON public.analysis_results;

-- Verification block: execute immediately after apply to confirm.
-- Expected: rowcount = 1, policy name = "Users can view their own analysis results", cmd = "SELECT"
-- SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='analysis_results';
```

### Example 3: Synthetic probe script (sc5-probe.ps1 skeleton)

```powershell
# Source: new file, scripts/sc5-probe.ps1
# D-18: invoke each D-07 gated feature at least once with a dedicated test account.
# Captures: HTTP status, latency, response body hash. Asserts 2xx/402/403 only (never 401/5xx).

param(
  [Parameter(Mandatory=$true)][string]$BaseUrl,        # e.g. https://<ref>.supabase.co/functions/v1
  [Parameter(Mandatory=$true)][string]$TestUserJwt,    # pre-refreshed Bearer
  [string]$OutputFile = ".planning/phases/21-integration-validation-and-cutover/21-SC5-EVIDENCE.md"
)

$ErrorActionPreference = "Stop"
$probes = @(
  @{ fn="analyze-resume"; body=@{ resumeText="probe" } },
  @{ fn="analyze-career"; body=@{ resumeText="probe" } },
  @{ fn="grade-linkedin"; body=@{ profileUrl="https://linkedin.com/in/probe" } },
  @{ fn="recruiting-lens"; body=@{ jobDescription="probe" } },
  @{ fn="analyze-skills-gap"; body=@{ resumeText="probe"; jobDescription="probe" } },
  @{ fn="compare-jobs"; body=@{ jobs=@() } },
  @{ fn="submit-resume-analysis-job"; body=@{ resumeText="probe" } },
  @{ fn="submit-career-analysis-job"; body=@{ resumeText="probe" } },
  @{ fn="interview-prep-analyze"; body=@{ resumeText="probe"; jobDescription="probe" } },
  @{ fn="interview-prep-evaluate"; body=@{ quizId="probe"; answers=@() } }
)

$results = @()
foreach ($p in $probes) {
  $url = "$BaseUrl/$($p.fn)"
  $start = Get-Date
  try {
    $resp = Invoke-WebRequest -Uri $url -Method POST `
      -Headers @{ Authorization="Bearer $TestUserJwt"; "Content-Type"="application/json" } `
      -Body ($p.body | ConvertTo-Json -Depth 5) -UseBasicParsing
    $status = $resp.StatusCode
  } catch {
    $status = $_.Exception.Response.StatusCode.value__
  }
  $elapsed = ((Get-Date) - $start).TotalMilliseconds
  $results += [PSCustomObject]@{ Function=$p.fn; Status=$status; LatencyMs=[int]$elapsed }
  Write-Host "$($p.fn) -> $status ($([int]$elapsed) ms)"
}

# Append evidence to 21-SC5-EVIDENCE.md
"`n## SC-5 Synthetic Probe Results (D-18)" | Out-File $OutputFile -Append
"Timestamp: $(Get-Date -Format 'o')" | Out-File $OutputFile -Append
$results | Format-Table | Out-String | Out-File $OutputFile -Append
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| User-facing INSERT on `analysis_results` from browser | Service-role INSERT only (edge functions) | Phase 21 MIG-02 | Frontend can no longer "helpfully" save a result; all writes trace to an authenticated edge-function call following a Merit deduction. |
| `AiCreditsContext` + `usage_tracking` for quota | `useMerits` + `merit_transactions` | Phase 13 D-06 + Phase 20 UX | Legacy path preserved read-only for rollback, then deprecated post-launch. |
| `Stripe.generateTestHeaderString` | `crypto.subtle`-based `signStripePayload` | Phase 07 (repo-specific workaround) | Deno edge runtime incompatibility forced the workaround — now the standard for all Stripe webhook tests. `[CITED: stripe-signature.ts header]` |
| `paddle-webhook` + Paddle client checkout | `stripe-webhook-handler` + Stripe Checkout | Phase 12 | Paddle deprecated. Not removed (existing subs complete lifecycle). |

**Deprecated/outdated:**
- Browser-side `saveAnalysisResult` helper (MIG-02 removes the write path).
- Phase 07 `stripe-webhook` function (superseded by `stripe-webhook-handler` — `deploy-production.ps1` still lists the old name; confirm with operator whether the old function name should be dropped from the deploy list as part of this phase or left for a future cleanup).

## Project Constraints (from CLAUDE.md)

- **Never commit `.planning/*`** — but the `21-SC5-EVIDENCE.md` file lives under `.planning/phases/21-integration-validation-and-cutover/` per D-22. D-22 explicitly says "committed to the repo indefinitely." This is a *deliberate exception* to CLAUDE.md's gitignore rule; the plan must include a `git add -f` step or move the file location. **Flag for user confirmation during planning.**
- **Preserve TypeScript strict mode + React patterns** — `src/lib/analysisHelpers.ts` edit must preserve file-level conventions (named exports, camelCase, explicit return types).
- **No new npm dependencies** — confirmed, none needed.
- **Use `rg` for search, `apply_patch` for edits** — test file creation is new-file (use `Write` tool; not a patch).
- **Supabase secrets vs `.env`** — `MERIT_SYSTEM_ENABLED` lives in Supabase secrets, not `.env`. Matches D-10 command shape.
- **Business-critical reliability: Resume + Career Compass** — MIG-02 must not break their save path. Verified: edge functions use service-role for writes already; only the browser-side `MinimalHero.tsx:163` save is at risk (and is closed by D-06).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `analysis_results` has only one user write policy (`INSERT "Users can create their own analysis results"`). MIG-02 drops this one policy only. | §MIG-02 migration shape | If additional user write policies exist from a migration not yet read, the drop is incomplete. **Mitigation:** plan includes a verification block `SELECT policyname, cmd FROM pg_policies WHERE tablename='analysis_results';` listing all policies pre- and post-migration. `[VERIFIED: grep across all migration files — only 20251222223116 creates this policy]` |
| A2 | The D-07 gated-handler list from Phase 13 is complete and current. Every file in the list imports `MERIT_SYSTEM_ENABLED` from `_shared/merit-gateway.ts` EXCEPT `interview-prep-evaluate/index.ts` which intentionally does not deduct (it evaluates existing quiz answers, no new Anthropic call that should be guarded). | §Boot-Time Attestation | If `interview-prep-evaluate` should have been gated, the D-19 attestation will miss it. **Mitigation:** plan confirms with Phase 19 decisions; if evaluate is truly ungated, SC-5 evidence explicitly marks it as "not applicable." `[VERIFIED: grep — evaluate/index.ts:14 has NOTE comment explaining no import]` |
| A3 | The pre-flip checklist (D-09) items are all *observable* from the operator's laptop — i.e., every item can be verified via `supabase secrets list`, a SQL query against the production project, or reading a committed file. | §Cutover execution | If any checklist item requires infrastructure the owner does not have access to, the checklist cannot complete. **Mitigation:** plan enumerates one verification command per checklist item and confirms feasibility from `strivolife@gmail.com`'s access level. |
| A4 | `scripts/deploy-production.ps1` in its current form (as of 2026-04-19) will correctly restart every gated handler on re-run. `supabase functions deploy --use-api` always produces a cold restart on successful deploy. | §D-10 flip mechanics | If `--use-api` allows warm-swap without restart, new env vars don't propagate, merit-flag stays false in workers. **Mitigation:** spot-check one handler's post-deploy logs for the `merit-flag` attestation line before declaring the flip complete. `[ASSUMED — supabase docs say deploy replaces the function but warm/cold semantics aren't explicit in the repo]` |
| A5 | During the 24h staging soak, Stripe test-mode webhooks fire through the staging project normally and `reset_subscription_merits` can be invoked manually via `INTERNAL_JOB_SECRET`. | §D-11 staging soak | If the staging project lacks a valid `INTERNAL_JOB_SECRET` or is pointing at prod Stripe webhooks, the scripted walkthrough cannot complete. **Mitigation:** D-09 checklist explicitly includes `supabase secrets list --project-ref <staging>` to confirm. |
| A6 | `.planning/` directory commit exception for `21-SC5-EVIDENCE.md` is accepted by the user. | §D-22 evidence file | If the user enforces CLAUDE.md strictly, the evidence file cannot be committed to the repo. **Mitigation:** discuss-phase already resolved this (D-22 explicit), but planner should include a verification step and `git add -f` if needed. |
| A7 | The 25 n8n-style out-of-band integrations do not exist here. No Datadog, pm2, Tailscale, launchd, or similar tools consume the name "MERIT_SYSTEM_ENABLED" or reference `analysis_results`. | §Runtime State Inventory | If external ops tools are watching for specific log strings or RLS states, changes could trigger false alerts. **Mitigation:** monitor `check-merit-alerts` + Vercel Speed Insights during the 2h soak as the only two external observers known. `[VERIFIED: grep across repo, no external ops references]` |

**If the user confirms A1–A7 (or corrects any), the remaining research is verified fact.**

## Open Questions

1. **Should `interview-prep-evaluate` emit a `merit-flag` attestation log despite not gating merits?**
   - What we know: `interview-prep-evaluate/index.ts:14` has an explicit NOTE "No import of withMerits or MERIT_SYSTEM_ENABLED." It evaluates existing quiz answers; the deduction already happened at quiz-start.
   - What's unclear: D-19 says "Each gated handler emits `merit-flag: enabled=true` at cold start." Is evaluate a gated handler? Phase 13 D-07 lists "Interview Prep entry points" — ambiguous.
   - Recommendation: Plan treats evaluate as ungated (no attestation log needed). Evidence file explicitly notes this and cross-references the Phase 19 decision record.

2. **Should the deploy scripts (`deploy-production.ps1`, `deploy-staging.ps1`) be modified to include an explicit `supabase functions restart` step, or is redeploying sufficient?**
   - What we know: `--use-api` server-side bundling is used; behavior differs from local deploys.
   - What's unclear: A4 assumption above.
   - Recommendation: Plan adds a post-deploy smoke check (grep for the `merit-flag:{"enabled":true}` log within 60s of deploy completion) to force verification rather than trust.

3. **Does the stale `stripe-webhook` (Phase 07) name still in `deploy-production.ps1` functions list need to be removed as part of this phase?**
   - What we know: `stripe-webhook-handler` supersedes it per Phase 12 D-06/D-07.
   - What's unclear: Whether the old function still exists deployed and whether removing it from deploys is in scope.
   - Recommendation: Out of scope for Phase 21; flag as a future cleanup quick-task.

4. **Migration timestamp conflict check:** What is the next available migration timestamp given the latest file `20260418100000_admin_merit_adjustment.sql`? Plan must select a timestamp > that.
   - Recommendation: Use `20260420000000_mig_02_analysis_results_readonly.sql` or later — outside the Phase 21 plan-generation date range.

5. **Where does the test-user JWT for D-11 staging walkthrough + D-18 probe come from?**
   - What we know: `merit_rls_test.ts` uses `TEST_USER_JWT` env var; the account is manually provisioned.
   - What's unclear: Whether a staging/prod dedicated probe account already exists.
   - Recommendation: Plan adds a D-09 checklist item "Verify test account exists in prod project (email: probe@strivoai.net, or similar)" with fallback creation step.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | `npm run build`, `npm run lint` | ✓ | 22+ (per CLAUDE.md) | — |
| Deno | Edge tests | ✓ | 2+ (per deno.json) | — |
| Supabase CLI | Cutover (`supabase secrets set`, `supabase functions deploy`) | ✓ | 2.76.9+ | — |
| PowerShell | `deploy-production.ps1`, `sc5-probe.ps1`, `run-edge-tests.ps1` | ✓ | Windows 11 confirmed in env | bash fallback for sc5-probe if owner prefers (D-18 discretion) |
| `stripe` npm package | Test fixtures + prod handler | ✓ | `npm:stripe@14` | — |
| `@supabase/supabase-js` | Frontend + merit_rls_test | ✓ | `^2.81.1` | — |
| Resend (admin alerts) | `check-merit-alerts` email delivery | Phase 13 already configured | — | — |
| Stripe test mode | D-11 staging soak walkthrough | Assumed ✓ in staging | — | Manual `reset-subscription-merits` invoke still works without Stripe |
| Access to prod Supabase project `zjpjapgraoxdukdvpjes` | D-10 cutover | ✓ (strivolife@gmail.com) | — | — |

**Missing dependencies with no fallback:** None identified.

**Missing dependencies with fallback:** None identified.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Deno Test (for edge tests) + Vitest (for frontend, but not used in this phase) |
| Config file | `supabase/functions/deno.json` (edge tests); `vitest.config.ts` (frontend, unused here) |
| Quick run command | `deno test supabase/functions/_tests/test-04-free-signup-to-shop.test.ts --no-check --allow-env --allow-net --allow-read` |
| Full suite command | `scripts/run-edge-tests.ps1` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEST-04 | Free signup → shop → refill Merit arithmetic | integration (offline mock) | `deno test supabase/functions/_tests/test-04-free-signup-to-shop.test.ts` | ❌ Wave 0 |
| TEST-05 | Free → Pro → Elite upgrade Merit arithmetic + tier-gated output | integration (offline mock) | `deno test supabase/functions/_tests/test-05-upgrade-proration.test.ts` | ❌ Wave 0 |
| TEST-06 | Yearly subscribe → monthly reset Merit arithmetic (no rollover) | integration (offline mock) | `deno test supabase/functions/_tests/test-06-yearly-reset.test.ts` | ❌ Wave 0 |
| MIG-02 | User cannot INSERT into `analysis_results`; SELECT preserved | RLS (live DB) | `deno test supabase/functions/_tests/merit_rls_test.ts` (extend with analysis_results cases) | ⚠️ Partial — `merit_rls_test.ts` exists but covers `user_merits`/`merit_transactions`/`merit_shop_purchases`. New file or extension needed. |
| SC-5 (flag=true) | `merit-flag: enabled=true` boot log per handler | runtime observation | `supabase functions logs <each> \| grep merit-flag` | ⚠️ Wave 0 — instrumentation needed in each handler |
| SC-5 (all routed) | `merit-transaction` log per feature | runtime observation | `supabase functions logs <each> \| grep merit-transaction` | ✓ — already emitted by `withMerits` (`merit-gateway.ts:155`) |

### Sampling Rate

- **Per task commit:** `deno test supabase/functions/_tests/test-04-*.ts --no-check --allow-env --allow-net --allow-read` (about 2–5 seconds per file)
- **Per wave merge:** `scripts/run-edge-tests.ps1` (full edge suite; ~60–120s)
- **Phase gate:** Full suite green before `/gsd-verify-work`; also `npm run lint` and `npm run build` for the frontend `saveAnalysisResult` removal.

### Wave 0 Gaps

- [ ] `supabase/functions/_tests/test-04-free-signup-to-shop.test.ts` — covers TEST-04
- [ ] `supabase/functions/_tests/test-05-upgrade-proration.test.ts` — covers TEST-05
- [ ] `supabase/functions/_tests/test-06-yearly-reset.test.ts` — covers TEST-06
- [ ] MIG-02 direct-SQL verification in plan (e.g., a new `_tests/analysis_results_rls_test.ts` or extension of `merit_rls_test.ts`)
- [ ] `scripts/sc5-probe.ps1` — D-18 synthetic probe
- [ ] Boot-time `merit-flag` log line added to each of 9 gated handlers (D-19)
- [ ] `scripts/run-edge-tests.ps1` modified to register the three new test files (pattern-matches lines 19-46)
- [ ] Optional: `scripts/cutover-production.ps1` orchestration wrapper

## Security Domain

> Required because `security_enforcement` is not set to `false` in config.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `requireAuth` (user) and `requireInternalOrUserAuth` (internal secret) helpers in `_shared/auth.ts` — already applied to `reset-subscription-merits` and every gated handler. No change in Phase 21. |
| V3 Session Management | yes | Supabase Auth JWT + auto-refresh. The sc5-probe reuses a pre-refreshed Bearer for the 2h window — acceptable because the window ≤ token lifetime (default 1h, configurable). **Flag:** plan must confirm test-account JWT lifetime ≥ probe window. |
| V4 Access Control | yes | RLS policies. MIG-02 *tightens* access control by removing a user write policy. Service-role bypass is the authorized write path. |
| V5 Input Validation | yes | Zod schemas + `prompt-sanitizer.ts` in edge functions. TEST-04/05/06 assertions include insufficient/tier-locked error responses — input validation is implicitly tested through the RPC error-shape contract. |
| V6 Cryptography | yes (for test fixtures) | `crypto.subtle` HMAC-SHA-256 in `signStripePayload`. Never hand-rolled beyond what Stripe documents. Webhook signature verification in production uses `stripe.webhooks.constructEventAsync` (Stripe SDK), never hand-rolled HMAC (locked by stripe-webhook-handler D-18). |
| V9 Communication | yes | TLS enforced by Supabase + Vercel platform. No change. |
| V10 Malicious Code | no | No dependency addition. |
| V14 Configuration | yes | Secrets (`MERIT_SYSTEM_ENABLED`, `STRIPE_WEBHOOK_SECRET`, `INTERNAL_JOB_SECRET`) managed via `supabase secrets set`. D-15 locks flip authority to strivolife@gmail.com only. |

### Known Threat Patterns for Supabase Edge Functions + Deno + Postgres RLS

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Flag-flip replay during mixed-state window (user sees flag=true, worker still sees false) | Information Disclosure | Accepted ~30s window per D-19; `merit_transactions` path is additive, cannot corrupt legacy state (Phase 13 D-19 rationale). |
| MIG-02 applied but frontend still writes → silent RLS denial → "lost" analyses | Denial of Service (data) | D-08 ordering + Pitfall 4: frontend deploy completes before migration applies. |
| Crafted fixture signature reused on production webhook | Tampering | Not possible: `STRIPE_WEBHOOK_SECRET` differs between test fixtures (`whsec_test_secret_*`) and production. `crypto.subtle` signatures are secret-scoped. |
| Test-account JWT leaked during 2h probe window | Elevation of Privilege | Dedicated probe account with no Pro/Elite entitlements; rotate after cutover. |
| `DROP POLICY` races with in-flight user inserts | Repudiation | Acceptable — in-flight inserts either commit before the drop (OK) or fail with 42501 (retry-safe, client handles as error). MIG-02 applies in seconds. |
| `supabase secrets set` propagation delay leaves some workers on false, others on true | Tampering/IntegrityConfusion | Accepted per D-19. Same user can't double-spend because merit path and legacy path touch disjoint state. |
| Rollback leaves `merit_transactions` rows written during flip window — could appear as "phantom" charges | Repudiation | Explicit D-14 decision: preserve as durable audit, do NOT reverse. Owner communicates to any affected user via standard refund-Merits admin path if needed. |

## Sources

### Primary (HIGH confidence)

- `supabase/functions/analyze-resume/test-07.test.ts` — TEST-07 harness, lines 18–497 read in full `[VERIFIED: file read]`
- `supabase/functions/_tests/merit_rls_test.ts` — RLS test convention, lines 1–174 read in full `[VERIFIED: file read]`
- `supabase/functions/stripe-webhook-handler/index.ts` — webhook handler contract, lines 1–735 read in full `[VERIFIED: file read]`
- `supabase/functions/reset-subscription-merits/index.ts` — direct-invocation target, lines 1–122 read in full `[VERIFIED: file read]`
- `supabase/functions/_shared/merit-gateway.ts` — `withMerits`, `MeritRefundable`, `MERIT_SYSTEM_ENABLED`, log format, lines 1–266 read in full `[VERIFIED: file read]`
- `supabase/functions/_shared/test-helpers/stripe-signature.ts` — HMAC helper, full file read `[VERIFIED: file read]`
- `supabase/functions/stripe-webhook-handler/index.test.ts` — webhook test precedent, lines 1–100 read `[VERIFIED: file read]`
- `supabase/functions/check-merit-alerts/index.ts` — debounce + thresholds, lines 1–80 read `[VERIFIED: file read]`
- `supabase/migrations/20260415000000_merit_rpcs.sql` — Phase 11 RPC signatures + return shapes (lines 61–428 read) `[VERIFIED: file read]`
- `supabase/migrations/20260416000000_merit_enforcement_observability.sql` — observability views + alert_state + helper RPCs (full file read) `[VERIFIED: file read]`
- `supabase/migrations/20260414000000_merit_ledger_foundation.sql` — Phase 10 table shapes + RLS pattern `[VERIFIED: file read]`
- `supabase/migrations/20251222223116_8abce0df-2f95-472e-a9e5-dca9a6d69c53.sql` — `analysis_results` table + current policies (full file read) `[VERIFIED: file read]`
- `supabase/migrations/20251222220418_b52662bb-5e0f-4847-bc53-d848d159e2c2.sql` — `usage_tracking` creation (no user write policy ever existed) `[VERIFIED: file read]`
- `supabase/migrations/20260417000000_usage_tracking_user_select_policy.sql` — style precedent for MIG-02 migration `[VERIFIED: file read]`
- `src/lib/analysisHelpers.ts` — frontend write helper to remove (full file read, 176 lines) `[VERIFIED: file read]`
- `src/components/MinimalHero.tsx` lines 11, 163 — the only external caller of `saveAnalysisResult` `[VERIFIED: grep + file read]`
- `scripts/run-edge-tests.ps1` — test registration point, full file read `[VERIFIED: file read]`
- `scripts/deploy-production.ps1` and `scripts/deploy-staging.ps1` — cutover execution, full files read `[VERIFIED: file read]`
- `supabase/ops/phase-13-cron-setup.sql` — `check-merit-alerts` cron schedule `[VERIFIED: grep + line content]`
- `.planning/REQUIREMENTS.md` — TEST-04/05/06, MIG-02 specs `[VERIFIED: file read]`
- `.planning/phases/13-merit-enforcement-and-feature-flag/13-CONTEXT.md` — prior-phase contract `[VERIFIED: file read in full]`

### Secondary (MEDIUM confidence)

- Cross-reference: `supabase/functions/analyze-career/index.ts` + `recruiting-lens/index.ts` for edge-function service-role `analysis_results.insert()` precedent — confirmed both write via `getServiceClient().from('analysis_results').insert(...)` which bypasses RLS. `[VERIFIED: grep, lines 676, 1206, 256, 360]`
- Grep coverage: all files with `analysis_results` string in `src/` and `supabase/` cataloged. `src/pages/RecruitingLens.tsx` uses SELECT only (line 274); `src/pages/CareerCompass.tsx` uses SELECT only (line 176). No hidden write sites. `[VERIFIED: grep + line content]`
- Grep coverage: all 15 edge-function files referencing `MERIT_SYSTEM_ENABLED` enumerated. `interview-prep-evaluate` is the only explicit non-importer with a NOTE comment. `[VERIFIED: grep]`

### Tertiary (LOW confidence)

- A4: behavior of `supabase functions deploy --use-api` restart semantics — sourced from context of Phase 13 D-05 which specifies "~30s propagation window" but does not cite Supabase docs directly. Plan should verify post-deploy via the boot-log attestation (D-19).
- Stripe SDK `constructEventAsync` tolerance window default (300s) — standard Stripe SDK behavior, not verified against Stripe docs in this research session. Pitfall 5 flags this as a risk if test runs cross the window.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every tool, helper, and pattern already exists in the repo and has been read file-by-file.
- Architecture: HIGH — TEST-07, `stripe-webhook-handler/index.test.ts`, and `merit_rls_test.ts` are direct, verified templates for TEST-04/05/06.
- Pitfalls: MEDIUM — derived from decisions + code structure; Pitfalls 4–6 are novel to this phase (the race between frontend deploy + migration + flag flip) and could have additional modes not yet enumerated.
- Cutover choreography: MEDIUM — all pieces exist but have not been composed in a single phase before. The 2h soak + synthetic probe sequence is new to the project; Pitfalls 7–8 are best-effort enumeration.
- Security: HIGH — MIG-02 is strictly additive security (tightens RLS). No new surface area.

**Research date:** 2026-04-19
**Valid until:** 2026-05-19 (30-day window — domain is internal + stable, no fast-moving external dependencies).
