import { assert, assertFalse } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const handler = await Deno.readTextFile(new URL('../index.ts', import.meta.url));
const runtime = await Deno.readTextFile(
  new URL('../../_shared/feature-run-runtime.ts', import.meta.url),
);

Deno.test('recruiting lens creates one trusted run after auth and tier gating', () => {
  const auth = handler.indexOf("await requireAuth(req, { type: 'user' })");
  const tierGate = handler.indexOf("userContext!.tier === 'free'");
  const begin = handler.indexOf('await beginFeatureRun({');
  const rateLimit = handler.indexOf('const rl = await checkRateLimit(');
  const merit = handler.indexOf('const gated = await withMerits(');
  const ai = handler.indexOf('const results = await executeParallelCalls(');
  assert(auth >= 0 && tierGate > auth, 'entitlement gating stays ahead of costing');
  assert(begin > tierGate, 'no run is created for an unauthorized or Free request');
  assert(rateLimit > begin && merit > begin && ai > begin);
  assert(handler.includes("feature: 'recruiting_lens'"));
});

Deno.test('recruiting lens costing snapshots are server-resolved only', () => {
  assertFalse(handler.includes('tier: body.tier'));
  assertFalse(handler.includes('environment: body.'));
  assertFalse(handler.includes('meritsCharged: body.'));
  assert(handler.includes("const resolvedTier = userContext!.tier as 'pro' | 'elite'"));
  assert(handler.includes('const userId = userContext!.userId'));
  assert(runtime.includes('createFeatureRun({'));
});

Deno.test('recruiting lens forwards opaque document correlation and a stable action key', () => {
  assert(handler.includes("typeof body.featureRunToken === 'string'"));
  assert(handler.includes('featureRunToken: typeof body.featureRunToken'));
  assert(handler.includes('serverActionKey: typeof body.attemptNonce'));
  assert(handler.includes("runVariant: body.runVariant === 'rerun' ? 'rerun' : 'standard'"));
  assert(runtime.includes('resolveFeatureRunToken'));
  assert(runtime.includes("reason: 'invalid_feature_run_correlation'"));
});

Deno.test('recruiting lens links AI attempts, exact Merit truth, cache, and terminal state', () => {
  assert(handler.includes('featureRunId: featureRuntime?.featureRunId'));
  assert(handler.includes('await featureRuntime?.observeCharge(_txId)'));
  assert(handler.includes("await featureRuntime?.markCache('analysis_cache')"));
  assert(handler.includes('await featureRuntime?.observeCharge(gated.transactionId)'));
  assert(handler.includes('await featureRuntime?.flushAiCalls()'));
  assert(handler.includes('await featureRuntime?.complete()'));
});

Deno.test('recruiting lens terminalizes failure paths without hiding incurred cost', () => {
  assert(handler.includes("await featureRuntime?.fail('RATE_LIMITED', 'rate_limit')"));
  assert(handler.includes("await featureRuntime?.fail('USAGE_LIMIT_REACHED', 'authorization')"));
  assert(handler.includes("await featureRuntime?.fail('MERIT_GATE_REJECTED', 'authorization')"));
  assert(handler.includes("await featureRuntime?.fail('PROVIDER_OVERLOADED', 'provider')"));
  assert(handler.includes("await featureRuntime?.fail('ANALYSIS_FAILED', 'provider')"));
  assert(handler.includes("await featureRuntime?.fail('RECRUITING_LENS_REQUEST_FAILED', 'internal')"));
});

Deno.test('recruiting lens observes gateway-owned refunds after a save failure', () => {
  const refundObservation = handler.indexOf(
    'await featureRuntime?.observeRefund(activeMeritTransactionId)',
  );
  const terminal = handler.indexOf(
    "await featureRuntime?.fail('RECRUITING_LENS_REQUEST_FAILED', 'internal')",
  );
  assert(refundObservation > 0 && terminal > refundObservation);
  // The Merit gateway remains the only refund authority.
  assert(handler.includes('meritsRefunded?: boolean'));
  assertFalse(handler.includes('refund_merits'));
});

Deno.test('recruiting lens telemetry outage never changes product behavior', () => {
  assertFalse(/await featureRuntime\.(?!featureRunId)/.test(handler));
  assert(runtime.includes('return { ok: true, runtime: null }'));
});

Deno.test('recruiting lens limits, byte handling, and prompts are untouched by costing', () => {
  assert(handler.includes('getRecruitingLensJdLimitError'));
  assert(handler.includes("getMaxInputChars('recruitingLens'"));
  assert(handler.includes('buildRecruitingLensUserPrompt'));
  assert(handler.includes('mergeRecruitingLensResults'));
});
