/**
 * Phase 02 · 02-05 · Fix 1 guard (SEC-13 / SEC-14) — Merit idempotency-key forwarding.
 *
 * The confirmed HIGH billing defect (DB-BILLING-WEBHOOK-FINDINGS Domain 12, Fix 1):
 * `withMerits` called the 4-arg `check_and_deduct_merits` RPC with only THREE named
 * args (`p_user_id`, `p_feature`, `p_tier`) and never forwarded `p_idempotency_key`,
 * so the partial-unique index (`WHERE source='feature-deduct' AND idempotency_key IS
 * NOT NULL`) never engaged → every prod deduction was non-idempotent (double-click /
 * two-tab / refresh-resubmit each deducted independently).
 *
 * This file carries TWO guards for the same fact, matching the 02-PATTERNS split:
 *
 *   (A) In-gate STATIC-SOURCE guard (Class B, modeled on `_shared/cors-audit.test.ts`
 *       incl. the Windows leading-slash path idiom). Reads `merit-gateway.ts` as text
 *       and asserts it (a) forwards `p_idempotency_key` from `ctx.idempotencyKey`, (b)
 *       carries an optional `idempotencyKey?: string` on `MeritGatewayContext`, and (c)
 *       makes the post-success transaction log null-safe on the `already_deducted`
 *       replay branch. This is the path registered in `deno.json` `test:ci` → it enters
 *       `verify:baseline`. It is isolation-safe (no handler import, no runtime I/O) so
 *       it cannot perturb the stripe-webhook idempotency siblings (Pitfall 6).
 *
 *   (B) A gated-remote RUNTIME twin (Class A, modeled on `_shared/merit-idempotency.test.ts`)
 *       that drives `withMerits` — not the raw RPC — with a REPEATED key against a live
 *       Supabase instance and asserts exactly ONE feature-deduct row. It is skip-by-default
 *       (`DENO_TEST_SUPABASE_REMOTE=1` opt-in) and dynamically imports the gateway INSIDE
 *       the gated block so the offline shared process never loads the handler. The operator
 *       may run it on staging at the 02-05 checkpoint to witness repeated-key → one deduction.
 *
 * Fail-before/pass-after (SEC-13 evidence): the static guard FAILS on the pre-fix source
 * (no `p_idempotency_key`, no `already_deducted` handling) and PASSES after the fix.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

// ── (A) In-gate static-source guard (registered in deno.json test:ci) ────────

// On Windows, import.meta.url pathname begins with /C:/... which Deno cannot open.
// Strip the leading slash to get a valid Windows path (cors-audit.test.ts idiom).
const rawPath = new URL('./merit-gateway.ts', import.meta.url).pathname;
const GATEWAY_PATH = rawPath.startsWith('/') && rawPath[2] === ':' ? rawPath.slice(1) : rawPath;
const source = Deno.readTextFileSync(GATEWAY_PATH);

Deno.test('Fix1 [static]: withMerits forwards p_idempotency_key from ctx.idempotencyKey to the deduct RPC', () => {
  // The 4-arg check_and_deduct_merits call must forward the per-request key
  // (omitting the absent optional arg, whose database default is NULL) so the
  // partial-unique idempotency index can engage when a key is present.
  assertEquals(source.includes('p_idempotency_key: ctx.idempotencyKey ?? undefined'), true);
});

Deno.test('Fix1 [static]: MeritGatewayContext carries an optional idempotencyKey (the Phase-3-extensible seam)', () => {
  // Additive-only capability seam — Phase 3 (03-02) EXTENDS this by deriving +
  // threading the key from each feature; it does not replace it.
  assertEquals(source.includes('idempotencyKey?: string'), true);
});

Deno.test('Fix1 [static]: post-success transaction log is null-safe on the already_deducted replay branch', () => {
  // The 4-arg RPC returns { success, transaction_id, already_deducted:true } with NO
  // deducted_from / remaining_balance on a repeated key. The log must surface
  // already_deducted and null-guard the two optional reads so it never emits on
  // undefined for a replay.
  assertEquals(source.includes('already_deducted'), true);
  assertEquals(source.includes('deducted_from: (data as any).deducted_from ?? null'), true);
  assertEquals(source.includes('remaining_balance: (data as any).remaining_balance ?? null'), true);
});

// ── (B) Gated-remote runtime twin (skip-by-default; NOT registered in test:ci) ─
//
// Modeled on _shared/merit-idempotency.test.ts. Drives withMerits with a repeated
// key and asserts exactly ONE feature-deduct row + a single balance deduction.
// Skip-by-default so it does not perturb the offline shared process (Pitfall 6);
// the gateway is dynamically imported INSIDE the gated block only.

const GATED = () => Deno.env.get('DENO_TEST_SUPABASE_REMOTE') === '1';

// resume_analysis / free row from merit_feature_costs (cost = 3 merits) — the same
// proven fixture the sibling idempotency suite uses.
const TEST_FEATURE = 'resume_analysis';
const TEST_TIER = 'free' as const;
const TEST_COST = 3;
const STARTING_BALANCE = 100;

async function freshClient() {
  const { createClient } = await import('npm:@supabase/supabase-js@2');
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to run the remote idempotency-forward twin',
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function provisionTestUser(startingBalance: number): Promise<string> {
  const client = await freshClient();
  const suffix = crypto.randomUUID().slice(0, 8);
  const email = `merit-idem-fwd-test-${suffix}@strivo-test.invalid`;
  const password = crypto.randomUUID();

  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { test_fixture: 'phase-02-05-idempotency-forward' },
  });
  if (error || !data?.user) {
    throw new Error(`Admin createUser failed: ${error?.message ?? 'no user returned'}`);
  }
  const userId = data.user.id;

  const { error: meritErr } = await client
    .from('user_merits')
    .upsert(
      { user_id: userId, subscription_balance: startingBalance, shop_balance: 0 },
      { onConflict: 'user_id' },
    );
  if (meritErr) {
    await client.auth.admin.deleteUser(userId).catch(() => {});
    throw new Error(`Seed user_merits failed: ${meritErr.message}`);
  }
  return userId;
}

async function teardownTestUser(userId: string): Promise<void> {
  const client = await freshClient();
  const { error } = await client.auth.admin.deleteUser(userId);
  if (error) {
    console.error(`[merit-gateway.idempotency-forward] teardown failed for ${userId}: ${error.message}`);
  }
}

async function readBalance(userId: string): Promise<number> {
  const client = await freshClient();
  const { data, error } = await client
    .from('user_merits')
    .select('subscription_balance, shop_balance')
    .eq('user_id', userId)
    .single();
  if (error || !data) {
    throw new Error(`Balance read failed: ${error?.message ?? 'no row'}`);
  }
  return (data.subscription_balance ?? 0) + (data.shop_balance ?? 0);
}

async function countFeatureDeductRows(userId: string, idempotencyKey: string): Promise<number> {
  const client = await freshClient();
  const { data, error } = await client
    .from('merit_transactions')
    .select('id, idempotency_key, source')
    .eq('user_id', userId)
    .eq('idempotency_key', idempotencyKey)
    .eq('source', 'feature-deduct');
  if (error) {
    throw new Error(`Transaction count read failed: ${error.message}`);
  }
  return data?.length ?? 0;
}

Deno.test(
  'Fix1 [gated-remote]: withMerits with a REPEATED idempotency key deducts exactly once (end-to-end)',
  async () => {
    if (!GATED()) {
      console.log(
        '[merit-gateway.idempotency-forward] SKIP — set DENO_TEST_SUPABASE_REMOTE=1 + SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to drive withMerits against a live DB',
      );
      return;
    }

    // Dynamic import INSIDE the gated block: the offline shared process never loads
    // the gateway module, keeping this twin isolation-safe (Pitfall 6).
    const { withMerits } = await import('./merit-gateway.ts');

    const userId = await provisionTestUser(STARTING_BALANCE);
    const idempotencyKey = crypto.randomUUID();
    const ctx = { userId, tier: TEST_TIER, corsType: 'user' as const, idempotencyKey };

    try {
      const first = await withMerits(ctx, TEST_FEATURE, async (txId: string) => txId);
      assert(first.ok === true, `First withMerits must succeed; got ${JSON.stringify(first)}`);

      const second = await withMerits(ctx, TEST_FEATURE, async (txId: string) => txId);
      assert(second.ok === true, `Second withMerits (repeated key) must succeed; got ${JSON.stringify(second)}`);

      // The load-bearing NFR-07 assertion: the repeated key produced exactly ONE
      // feature-deduct row and exactly ONE balance deduction.
      assertEquals(
        await countFeatureDeductRows(userId, idempotencyKey),
        1,
        'Repeated idempotency key must yield exactly one feature-deduct row (idempotency-key forwarding engaged the partial-unique index)',
      );
      assertEquals(
        await readBalance(userId),
        STARTING_BALANCE - TEST_COST,
        'Balance must reflect exactly one deduction after a repeated-key replay (no double-charge)',
      );
    } finally {
      await teardownTestUser(userId);
    }
  },
);

// ── (B2) Phase 3 (03-02 / LIFE-05) extension: DERIVED key → one deduction ─────
//
// The (B) twin above proves a raw randomUUID key deducts once. This extension
// closes the LIFE-05 loop: it proves the SAME property holds for a key produced
// by the Phase-3 `deriveIdempotencyKey` contract — i.e. the derivation output is
// a valid idempotency key end-to-end through the already-wired withMerits forward
// (Pitfall 1 closed at the source). A repeated intent (same attemptNonce) re-derives
// the SAME key on both calls, so the second call hits the RPC `already_deducted`
// replay branch and there is exactly one feature-deduct row.
//
// Skip-by-default (DENO_TEST_SUPABASE_REMOTE=1 opt-in); both the gateway AND the
// derivation module are dynamically imported INSIDE the gated block so the offline
// shared process loads neither (Pitfall 6 isolation).

Deno.test(
  'LIFE-05 [gated-remote]: a DERIVED idempotency key (deriveIdempotencyKey) threaded through withMerits deducts exactly once',
  async () => {
    if (!GATED()) {
      console.log(
        '[merit-gateway.idempotency-forward] SKIP — set DENO_TEST_SUPABASE_REMOTE=1 + SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to drive a DERIVED key through withMerits against a live DB',
      );
      return;
    }

    const { withMerits } = await import('./merit-gateway.ts');
    const { deriveIdempotencyKey } = await import('./idempotency-key.ts');

    const userId = await provisionTestUser(STARTING_BALANCE);

    // Fixed intent — the same attemptNonce on both calls models an ACCIDENTAL
    // resubmit (double-click / two-tab / refresh), which must re-derive the SAME
    // key and therefore charge exactly once. inputIdentity is an opaque stable
    // content-identity (never a save-mutated field — Pitfall 8 / D-06).
    const intent = {
      userId,
      feature: TEST_FEATURE,
      tier: TEST_TIER,
      inputIdentity: 'sha256:idempotency-forward-fixture',
      attemptNonce: 'fixed-attempt-nonce',
    };

    const idempotencyKey = await deriveIdempotencyKey(intent);
    // Re-deriving from the same intent yields the SAME key (accidental resubmit).
    assertEquals(
      await deriveIdempotencyKey(intent),
      idempotencyKey,
      'deriveIdempotencyKey must be deterministic so an accidental resubmit re-derives the same key',
    );

    const ctx = { userId, tier: TEST_TIER, corsType: 'user' as const, idempotencyKey };

    try {
      const first = await withMerits(ctx, TEST_FEATURE, async (txId: string) => txId);
      assert(first.ok === true, `First withMerits (derived key) must succeed; got ${JSON.stringify(first)}`);

      const second = await withMerits(ctx, TEST_FEATURE, async (txId: string) => txId);
      assert(second.ok === true, `Second withMerits (re-derived same key) must succeed; got ${JSON.stringify(second)}`);

      // Load-bearing LIFE-05 assertion: the derived key produced exactly ONE
      // feature-deduct row and exactly ONE balance deduction — the derivation
      // output is a valid idempotency key end-to-end (Pitfall 1 closed).
      assertEquals(
        await countFeatureDeductRows(userId, idempotencyKey),
        1,
        'A repeated DERIVED idempotency key must yield exactly one feature-deduct row end-to-end (LIFE-05)',
      );
      assertEquals(
        await readBalance(userId),
        STARTING_BALANCE - TEST_COST,
        'Balance must reflect exactly one deduction for a re-derived key (no double-charge)',
      );
    } finally {
      await teardownTestUser(userId);
    }
  },
);

Deno.test(
  'merit-gateway.idempotency-forward: skip-guard mechanism is exercised when DENO_TEST_SUPABASE_REMOTE is unset',
  () => {
    if (!GATED()) {
      console.log(
        '[merit-gateway.idempotency-forward] SKIP — set DENO_TEST_SUPABASE_REMOTE=1 to exercise the live-DB twin',
      );
    }
    // Always passes — the skip-guard is the feature under test here.
  },
);
