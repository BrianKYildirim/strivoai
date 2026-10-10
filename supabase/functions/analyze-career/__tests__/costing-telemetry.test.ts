import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const handler = await Deno.readTextFile(new URL('../index.ts', import.meta.url));
const submit = await Deno.readTextFile(new URL('../../submit-career-analysis-job/index.ts', import.meta.url));
const worker = await Deno.readTextFile(new URL('../../process-career-analysis-job/index.ts', import.meta.url));

Deno.test('career resolves trusted product identity before persisted input, Merit, cache, and AI', () => {
  const auth = handler.indexOf('await requireInternalOrUserAuth(req)');
  const begin = handler.indexOf('await beginFeatureRun({');
  const persistedInput = handler.indexOf('await readPersistedLinkedInText');
  const merit = handler.indexOf('const gated = await withMerits(');
  assert(auth >= 0 && begin > auth);
  assert(persistedInput > begin);
  assert(merit > begin);
  assert(handler.includes("feature: 'career_compass'"));
  assert(handler.includes("requestBody.runVariant === 'rerun' ? 'rerun' : 'standard'"));
});

Deno.test('career cache, lifecycle, provider, save, and failure evidence converge', () => {
  assert(handler.includes('activeMeritTransactionId = directTxId'));
  assert(handler.includes('featureRunId: featureRuntime?.featureRunId'));
  assert(handler.includes("await featureRuntime?.markCache('analysis_cache')"));
  assert(handler.includes('await featureRuntime?.complete()'));
  assert(handler.includes('await featureRuntime?.flushAiCalls()'));
  assert(handler.includes('await featureRuntime?.observeRefund(activeMeritTransactionId)'));
});

Deno.test('career queue links one costing run through submit and worker retry/refund', () => {
  assert(submit.includes('featureRunId: featureRuntime.featureRunId'));
  assert(submit.includes('await featureRuntime?.linkAnalysisJob(job.id)'));
  assert(submit.includes('await featureRuntime?.linkAnalysisJob(runId)'));
  assert(submit.includes('await featureRuntime?.observeCharge(txId)'));
  assert(worker.includes("observeFeatureRunMeritTransaction(payload.featureRunId, txId, 'refunded')"));
  assert(worker.includes('terminalizeFeatureRun(payload.featureRunId'));
});

Deno.test('career snapshots tier and interval on the server and ignores client classification', () => {
  assert(handler.includes('resolvedTier = await resolveTierForUserId(effectiveUserId)'));
  assert(!handler.includes('resolvedTier = requestBody.tier'));
  assert(!handler.includes('environment: requestBody.environment'));
  assert(!submit.includes('tier: body.tier'));
});
