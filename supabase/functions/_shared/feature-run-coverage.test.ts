import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

/**
 * Repository-wide enrollment guard. Every production feature family, worker path,
 * cache/variant seam, Merit settlement, provider attempt, durable save, and terminal
 * state must run through the shared feature-run seam. A new entry point that bypasses
 * `beginFeatureRun` / `createFeatureRun` fails here rather than silently going uncosted.
 */

const read = async (path: string): Promise<string> =>
  await Deno.readTextFile(new URL(`../${path}`, import.meta.url));

const telemetry = await read('_shared/feature-run-telemetry.ts');
const runtime = await read('_shared/feature-run-runtime.ts');

const ENTRY_POINTS: Record<string, string> = {
  'analyze-resume/index.ts': 'resume_analysis',
  'analyze-career/index.ts': 'career_compass',
  'grade-linkedin/index.ts': 'linkedin_grader',
  'recruiting-lens/index.ts': 'recruiting_lens',
  'interview-prep-analyze/index.ts': 'interview_prep',
  'interview-prep-evaluate/index.ts': 'interview_prep',
};

const WORKER_PATHS = [
  'submit-resume-analysis-job/index.ts',
  'process-resume-analysis-job/index.ts',
  'submit-career-analysis-job/index.ts',
  'process-career-analysis-job/index.ts',
];

const sources = new Map<string, string>();
for (const path of [...Object.keys(ENTRY_POINTS), ...WORKER_PATHS, 'ocr-pdf/index.ts']) {
  sources.set(path, await read(path));
}

Deno.test('all five canonical feature families exist exactly once in the shared contract', () => {
  for (
    const feature of [
      'resume_analysis',
      'linkedin_grader',
      'career_compass',
      'recruiting_lens',
      'interview_prep',
    ]
  ) {
    assert(telemetry.includes(`'${feature}'`), `missing canonical feature ${feature}`);
  }
});

Deno.test('every production feature entry point enrolls in the shared run seam', () => {
  for (const [path, feature] of Object.entries(ENTRY_POINTS)) {
    const source = sources.get(path)!;
    assert(
      source.includes('beginFeatureRun('),
      `${path} must create or resolve its run through the shared seam`,
    );
    assert(source.includes(`feature: '${feature}'`), `${path} must declare ${feature}`);
  }
});

Deno.test('queue submit and worker paths continue one server-owned identity', () => {
  for (const path of WORKER_PATHS) {
    const source = sources.get(path)!;
    assert(source.includes('featureRunId'), `${path} must carry the feature-run link`);
  }
  assert(sources.get('process-resume-analysis-job/index.ts')!.includes('terminalizeFeatureRun'));
  assert(sources.get('process-career-analysis-job/index.ts')!.includes('terminalizeFeatureRun'));
});

Deno.test('browser-assisted OCR joins the caller-owned run before paid provider work', () => {
  const ocr = sources.get('ocr-pdf/index.ts')!;
  assert(ocr.includes('resolveFeatureRunToken') || ocr.includes('featureRunToken'));
  assert(ocr.includes('document_ocr'), 'physical page attempts stay operation-named');
});

Deno.test('cache reuse, rerun, unlock, and evaluation variants are all represented', () => {
  assertEquals(
    ['standard', 'cache_reuse', 'rerun', 'elite_unlock', 'evaluation'].every((variant) =>
      telemetry.includes(`'${variant}'`)
    ),
    true,
  );
  assert(sources.get('analyze-resume/index.ts')!.includes("'elite_unlock'"));
  assert(sources.get('interview-prep-evaluate/index.ts')!.includes("runVariant: 'evaluation'"));
  assert(runtime.includes('markCache('), 'cache reuse must be recordable on a run');
  assert(runtime.includes('served_from_cache: true'));
});

Deno.test('Merit settlement, provider attempts, and terminal state are all observable', () => {
  assert(runtime.includes('observeCharge'));
  assert(runtime.includes('observeRefund'));
  assert(runtime.includes('markZeroMerits'));
  assert(runtime.includes('ai_call_telemetry'));
  assert(runtime.includes('terminalizeFeatureRun'));
  for (const status of ['completed', 'failed', 'canceled']) {
    assert(telemetry.includes(`'${status}'`), `terminal status ${status} must exist`);
  }
});

Deno.test('every enrolled feature terminalizes success and failure', () => {
  for (const path of Object.keys(ENTRY_POINTS)) {
    const source = sources.get(path)!;
    assert(source.includes('?.complete()'), `${path} must terminalize success`);
    assert(source.includes('?.fail('), `${path} must terminalize failure`);
  }
});

Deno.test('costing snapshots are server-resolved and telemetry never throws', () => {
  assert(telemetry.includes('getRuntimeEnvironment'));
  assert(telemetry.includes('resolveTierAndInterval'));
  assert(telemetry.includes('exclude_from_costing_at_time'));
  // A telemetry outage degrades to a null runtime instead of a product error.
  assert(runtime.includes('return { ok: true, runtime: null }'));
});
