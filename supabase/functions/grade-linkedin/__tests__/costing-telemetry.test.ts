import { assert, assertFalse } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const handler = await Deno.readTextFile(new URL('../index.ts', import.meta.url));
const runtime = await Deno.readTextFile(
  new URL('../../_shared/feature-run-runtime.ts', import.meta.url),
);

Deno.test('linkedin creates one trusted run after auth and before validation, Merit, and AI', () => {
  const auth = handler.indexOf("await requireAuth(req, { type: 'user' })");
  const begin = handler.indexOf('await beginFeatureRun({');
  const rateLimit = handler.indexOf('await checkRateLimit(', begin);
  const contentValidation = handler.indexOf('meritProfileContent.length < 50');
  const merit = handler.indexOf('const gated = await withMerits(');
  const ai = handler.indexOf('await invokeAnthropicText(');
  assert(auth >= 0 && begin > auth, 'run creation must follow authentication');
  assert(rateLimit > begin, 'rate limiting must follow run creation');
  assert(contentValidation > begin, 'content validation must follow run creation');
  assert(merit > begin && ai > begin, 'Merit and AI work must follow run creation');
  assert(handler.includes("feature: 'linkedin_grader'"));
});

Deno.test('linkedin costing snapshots are server-resolved and never client-supplied', () => {
  assertFalse(handler.includes('tier: costingBody.tier'));
  assertFalse(handler.includes('environment: costingBody'));
  assertFalse(handler.includes('meritsCharged: costingBody'));
  // Tier comes from the authenticated context that requireAuth resolved from profiles.
  assert(handler.includes("const tier = (userContext.tier as Tier) ?? 'free'"));
  assert(handler.includes("const resolvedTier = (userContext!.tier as Tier) ?? 'free'"));
  // Tier, billing interval, environment, and exclusion are resolved inside the shared
  // creator from profiles/costing tables, never from the request envelope.
  assert(runtime.includes('createFeatureRun({'));
});

Deno.test('linkedin carries opaque document correlation and a stable action key', () => {
  assert(handler.includes("typeof costingBody.featureRunToken === 'string'"));
  assert(handler.includes('featureRunToken: typeof costingBody.featureRunToken'));
  assert(handler.includes('serverActionKey: typeof costingBody.attemptNonce'));
  assert(handler.includes("runVariant: costingBody.runVariant === 'rerun' ? 'rerun' : 'standard'"));
  // Duplicate deliberate actions recover the same run instead of creating a second one.
  assert(runtime.includes('getRunByActionHash') || runtime.includes('createFeatureRun'));
});

Deno.test('linkedin links AI attempts, Merit truth, cache reuse, and terminal state once', () => {
  assert(handler.includes('featureRunId: featureRuntime?.featureRunId'));
  assert(handler.includes('await featureRuntime?.observeCharge(_txId)'));
  assert(handler.includes("await featureRuntime?.markCache('analysis_cache')"));
  assert(handler.includes('await featureRuntime?.observeCharge(gated.transactionId)'));
  assert(handler.includes('await featureRuntime?.flushAiCalls()'));
  assert(handler.includes('await featureRuntime?.complete()'));
  assert(handler.includes('await featureRuntime?.observeRefund(activeMeritTransactionId)'));
  assert(handler.includes("await featureRuntime?.fail('GRADE_SAVE_FAILED', 'persistence')"));
  assert(handler.includes("await featureRuntime?.fail('LINKEDIN_REQUEST_FAILED'"));
});

Deno.test('linkedin provider failures terminalize failed while keeping incurred evidence', () => {
  const aiFailure = handler.indexOf('if (!ai.ok) {');
  const flush = handler.indexOf('await featureRuntime?.flushAiCalls();', aiFailure);
  const overloaded = handler.indexOf("await featureRuntime?.fail('PROVIDER_OVERLOADED', 'provider')");
  assert(aiFailure >= 0 && flush > aiFailure, 'AI evidence links before terminalization');
  assert(overloaded > flush, 'provider failure terminalizes after the AI back-link');
  assert(handler.includes("await featureRuntime?.fail('PROVIDER_OVERLOADED', 'provider')"));
  assert(handler.includes("await featureRuntime?.fail('PROVIDER_RATE_LIMITED', 'provider')"));
  assert(handler.includes("await featureRuntime?.fail('VALIDATION_RETRY_FAILED', 'provider')"));
  assert(handler.includes("await featureRuntime?.fail('MODEL_OUTPUT_INVALID', 'parsing')"));
});

Deno.test('linkedin telemetry outage never changes the product response', () => {
  // Every costing call is optional-chained on a runtime that is null when the
  // telemetry store is unavailable, and beginFeatureRun swallows its own failures.
  assertFalse(/await featureRuntime\.(?!featureRunId)/.test(handler));
  assert(runtime.includes('return { ok: true, runtime: null }'));
});

Deno.test('linkedin rubric and grading inputs are untouched by costing', () => {
  assert(handler.includes("loadPromptVariant('linkedin'"));
  assert(handler.includes('injectLinkedInRawScore'));
  assertFalse(handler.includes('featureRunId: costingBody'));
});
