import { assert, assertFalse } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const handler = await Deno.readTextFile(new URL('../index.ts', import.meta.url));
const analyze = await Deno.readTextFile(
  new URL('../../interview-prep-analyze/index.ts', import.meta.url),
);
const runtime = await Deno.readTextFile(
  new URL('../../_shared/feature-run-runtime.ts', import.meta.url),
);

Deno.test('evaluation is a separately countable variant of one canonical feature', () => {
  assert(handler.includes("feature: 'interview_prep'"));
  assert(handler.includes("runVariant: 'evaluation'"));
  assert(analyze.includes("feature: 'interview_prep'"));
  assert(analyze.includes("runVariant: 'standard'"));
});

Deno.test('evaluation creates its run after auth, access, envelope, and ownership', () => {
  const auth = handler.indexOf("await requireAuth(req, { type: 'user' })");
  const tierPrefilter = handler.indexOf("userContext.tier !== 'elite' && userContext.tier !== 'pro'");
  const envelope = handler.indexOf('uuidRegex.test(quizId)');
  const ownership = handler.indexOf("if (quizError || !quiz)");
  const alreadyEvaluated = handler.indexOf('if (quiz.evaluated_at)');
  const begin = handler.indexOf('await beginFeatureRun({');
  const ai = handler.indexOf('await invokeAnthropicText({');
  assert(auth >= 0 && tierPrefilter > auth && envelope > tierPrefilter);
  assert(begin > ownership && begin > alreadyEvaluated, 'denied evaluations create no run');
  assert(ai > begin, 'provider work follows run creation');
});

Deno.test('evaluation keys on the quiz so a duplicate action recovers one run', () => {
  assert(handler.includes('serverActionKey: `interview-prep-evaluate:${quizId}`'));
  assert(runtime.includes('createFeatureRun({'));
});

Deno.test('evaluation records its zero-Merit truth explicitly', () => {
  assert(handler.includes('await featureRuntime?.markZeroMerits()'));
  assertFalse(handler.includes('withMerits('), 'evaluation stays free of Merit charges');
});

Deno.test('evaluation links both provider attempts and terminalizes truthfully', () => {
  const links = handler.split('featureRunId: featureRuntime?.featureRunId').length - 1;
  assert(links >= 2, 'first call and retry both carry the run correlation');
  assert(handler.includes("attempt: 1,") && handler.includes("attempt: 2,"));
  assert(handler.includes("await featureRuntime?.fail('EVALUATION_AI_FAILED', 'provider')"));
  assert(handler.includes("await featureRuntime?.fail('EVALUATION_OUTPUT_INVALID', 'parsing')"));
  assert(handler.includes("await featureRuntime?.fail('EVALUATION_REQUEST_FAILED', 'internal')"));
  const persist = handler.indexOf("evaluated_at: new Date().toISOString()");
  const complete = handler.indexOf('await featureRuntime?.complete()');
  assert(persist > 0 && complete > persist, 'completion follows durable score persistence');
});

Deno.test('evaluation telemetry outage never changes question, answer, or output rules', () => {
  assertFalse(/await featureRuntime\.(?!featureRunId)/.test(handler));
  assert(runtime.includes('return { ok: true, runtime: null }'));
  assert(handler.includes('buildEvaluationPrompt('));
  assert(handler.includes('validateEvaluationScores('));
  assert(handler.includes('a.answer_text.slice(0, 500)'));
  assert(handler.includes("order('question_order', { ascending: true })"));
});
