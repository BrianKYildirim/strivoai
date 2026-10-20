import { assert, assertFalse } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const handler = await Deno.readTextFile(new URL('../index.ts', import.meta.url));
const runtime = await Deno.readTextFile(
  new URL('../../_shared/feature-run-runtime.ts', import.meta.url),
);

Deno.test('analyze creates one run after auth, envelope, and access gating', () => {
  const envelope = handler.indexOf('IntakeFormSchema.safeParse(bodyJson)');
  const auth = handler.indexOf("await requireAuth(req, { type: 'user' })");
  const tierGate = handler.indexOf("if (userContext.tier === 'free')");
  const begin = handler.indexOf('await beginFeatureRun({');
  const caps = handler.indexOf("if (variant === 'elite_taste')");
  const extraction = handler.indexOf('await extractPDFTextWithMetadata(');
  const merit = handler.indexOf('const gated = await withMerits(');
  const ai = handler.indexOf('await invokeAnthropicText({');
  assert(envelope >= 0 && auth > envelope, 'envelope validation precedes auth');
  assert(begin > tierGate && tierGate > auth, 'no run for unauthorized or Free requests');
  assert(caps > begin && extraction > begin, 'caps and extraction follow run creation');
  assert(merit > begin && ai > begin, 'Merit and AI work follow run creation');
});

Deno.test('analyze is the standard variant of the canonical interview_prep feature', () => {
  assert(handler.includes("feature: 'interview_prep'"));
  assert(handler.includes("runVariant: 'standard'"));
  assertFalse(handler.includes("runVariant: 'evaluation'"));
});

Deno.test('analyze trusts no client costing fields', () => {
  assertFalse(handler.includes('tier: bodyJson'));
  assertFalse(handler.includes('environment: bodyJson'));
  assertFalse(handler.includes('meritsCharged:'));
  assert(handler.includes('const tier = userContext.tier as Tier'));
  assert(runtime.includes('createFeatureRun({'));
});

Deno.test('analyze names both provider operations and their attempt numbers', () => {
  assert(handler.includes('callName: `interview-prep-generate:${variant}`'));
  assert(handler.includes('attempt: 1,'));
  assert(handler.includes('attempt: 2,'));
  // Both the first call and the validation retry attach to the same run.
  const links = handler.split('featureRunId: featureRuntime?.featureRunId').length - 1;
  assert(links >= 2, 'every provider attempt carries the run correlation');
});

Deno.test('analyze records Merit truth, terminal success, and refunded failure', () => {
  assert(handler.includes('await featureRuntime?.observeCharge(_txId)'));
  assert(handler.includes('await featureRuntime?.complete()'));
  assert(handler.includes('await featureRuntime?.observeRefund(activeMeritTransactionId)'));
  assert(handler.includes("await featureRuntime?.fail('INTERVIEW_PREP_REQUEST_FAILED', 'internal')"));
  assert(handler.includes("await featureRuntime?.fail('MERIT_GATE_REJECTED', 'authorization')"));
  // Terminal success happens only after the durable quiz row and usage evidence.
  const persist = handler.indexOf("from('interview_quizzes')\n          .insert({");
  const complete = handler.indexOf('await featureRuntime?.complete()');
  assert(complete > handler.indexOf('recordUsageWithAnalysis(userId'), 'save precedes completion');
  assert(persist === -1 || complete > persist);
});

Deno.test('analyze terminalizes pre-provider rejections without inventing cost', () => {
  assert(handler.includes("await featureRuntime?.fail('RATE_LIMITED', 'rate_limit')"));
  assert(handler.includes("await featureRuntime?.fail('MONTHLY_TASTE_USED', 'authorization')"));
  assert(handler.includes("await featureRuntime?.fail('DAILY_CAP_REACHED', 'authorization')"));
  assert(handler.includes("await featureRuntime?.fail('NO_RESUME', 'validation')"));
  assert(handler.includes("await featureRuntime?.fail('RESUME_EXTRACTION_FAILED', 'document')"));
});

Deno.test('analyze telemetry outage never changes coaching behavior', () => {
  assertFalse(/await featureRuntime\.(?!featureRunId)/.test(handler));
  assert(runtime.includes('return { ok: true, runtime: null }'));
  assert(handler.includes('validateInterviewPrepPayload'));
  assert(handler.includes("loadPromptVariant('interview'"));
});
