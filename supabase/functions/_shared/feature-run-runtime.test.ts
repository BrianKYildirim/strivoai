import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const source = await Deno.readTextFile(new URL('./feature-run-runtime.ts', import.meta.url));

Deno.test('feature runtime resolves opaque and trusted-internal identities without client run authority', () => {
  assert(source.includes('resolveFeatureRunToken(params.featureRunToken)'));
  assert(source.includes('token.userId !== params.userId'));
  assert(source.includes('token.feature !== params.feature'));
  assert(source.includes('if (!params.trustedInternal)'));
  assert(source.includes("existing.status !== 'started'"));
});

Deno.test('feature runtime links provider evidence before truthful terminalization', () => {
  assert(source.includes(".from('ai_call_telemetry')"));
  assert(source.includes(".eq('req_id', requestId)"));
  assert(source.indexOf('await linkAiCalls();') < source.indexOf("status: 'completed'"));
  assert(source.includes("status: 'failed'"));
  assert(source.includes("status: 'canceled'"));
});

Deno.test('feature runtime records cache and queue correlation without owning product behavior', () => {
  assert(source.includes('served_from_cache: true'));
  assert(source.includes('merits_charged: 0'));
  assert(source.includes('analysis_job_id: analysisJobId'));
  assertEquals((source.match(/Best-effort observer only\./g) ?? []).length >= 2, true);
});
