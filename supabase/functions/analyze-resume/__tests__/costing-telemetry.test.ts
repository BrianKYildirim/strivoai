import { assert, assertMatch } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const handler = await Deno.readTextFile(new URL('../index.ts', import.meta.url));
const submit = await Deno.readTextFile(new URL('../../submit-resume-analysis-job/index.ts', import.meta.url));
const worker = await Deno.readTextFile(new URL('../../process-resume-analysis-job/index.ts', import.meta.url));

Deno.test('resume creates or resolves one trusted run before validation, cache, Merit, and AI', () => {
  const auth = handler.indexOf('await requireInternalOrUserAuth(req)');
  const begin = handler.indexOf('await beginFeatureRun({');
  const contentValidation = handler.indexOf('if (!resumeText || resumeText.length < 50)');
  const merit = handler.indexOf('const gated = await withMerits(', contentValidation);
  assert(auth >= 0 && begin > auth);
  assert(contentValidation > begin);
  assert(merit > begin);
  assert(handler.includes("feature: 'resume_analysis'"));
  assert(handler.includes("rawBody.mode === 'elite_unlock'"));
  assert(handler.includes("previousScore !== null ? 'rerun' : 'standard'"));
});

Deno.test('resume cache, Merit, lifecycle, save, and terminal evidence share the runtime', () => {
  assert(handler.includes('featureRunId: featureRuntime?.featureRunId'));
  assert(handler.includes('await featureRuntime?.observeCharge(_txId)'));
  assert(handler.includes("await featureRuntime?.markCache('analysis_cache')"));
  assert(handler.includes('await featureRuntime?.complete()'));
  assert(handler.includes('await featureRuntime?.observeRefund(_txId)'));
  assert(handler.includes("await featureRuntime?.fail('REQUEST_FAILED', 'internal')"));
});

Deno.test('resume queue stores and resumes the same server feature-run identity', () => {
  assert(submit.includes('featureRunId: featureRuntime.featureRunId'));
  assert(submit.includes('await featureRuntime?.linkAnalysisJob(job.id)'));
  assert(submit.includes('await featureRuntime?.observeCharge(txId)'));
  assert(worker.includes("typeof payload.featureRunId === 'string'"));
  assert(worker.includes("observeFeatureRunMeritTransaction(payload.featureRunId, txId, 'refunded')"));
  assert(worker.includes('terminalizeFeatureRun(payload.featureRunId'));
  assertMatch(worker, /analysisPayload = payload\.mode === 'elite_unlock'[\s\S]*?featureRunId/);
});

Deno.test('resume costing never trusts browser tier or environment snapshots', () => {
  assert(handler.includes('resolvedTier = await resolveTierForUserId(userId)'));
  assert(!handler.includes('tier: rawBody.tier'));
  assert(!handler.includes('environment: rawBody.environment'));
  assert(submit.includes('tier: authenticatedUserCtx.tier'));
});
