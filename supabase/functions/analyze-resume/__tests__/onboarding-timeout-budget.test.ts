/**
 * Production regression: a Free onboarding request must exhaust provider retries and
 * reach the pre-save Merit refund before either the 120s browser wait or Supabase's
 * 150s Edge request ceiling. Onboarding therefore permits one bounded provider batch
 * and delegates a subsequent attempt to the user only after the Merit is restored.
 *
 * This is a static wiring guard because importing analyze-resume/index.ts starts the
 * Edge handler. It pins the same source contracts as the neighboring lifecycle tests.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { getTimeout } from '../../_shared/tier-config.ts';

function read(path: string): string {
  const rawPath = new URL(path, import.meta.url).pathname;
  return Deno.readTextFileSync(rawPath.startsWith('/') && rawPath[2] === ':' ? rawPath.slice(1) : rawPath);
}

function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

const resume = code(read('../index.ts'));

function onboardingBlock(): string {
  const start = resume.indexOf("if (rawBody.origin === 'onboarding')");
  const end = resume.indexOf('const streamingInputIdentity', start);
  assert(start !== -1 && end > start, 'onboarding lifecycle block must remain discoverable');
  return resume.slice(start, end);
}

Deno.test('onboarding timeout budget: no nested retry can outrun the refund boundary', () => {
  const block = onboardingBlock();
  const match = block.match(/maxRetries:\s*(\d+)/);
  assert(match, 'onboarding must set an explicit lifecycle maxRetries budget');

  const maxRetries = Number(match[1]);
  assertEquals(maxRetries, 0, 'the synchronous onboarding lifecycle must not retry a provider batch');

  assert(
    /allowProviderRetry:\s*false/.test(block),
    'onboarding must disable the Free quality retry, Elite per-call retry, and fallback',
  );
  assert(
    /const\s+onboardingProviderTimeoutMs\s*=\s*Math\.min\(getTimeout\(resolvedTier\),\s*100_000\)/.test(block),
    'onboarding must cap every provider call below the client and Edge ceilings',
  );

  for (const tier of ['free', 'elite'] as const) {
    const providerWallMs = Math.min(getTimeout(tier), 100_000);
    assert(
      providerWallMs < 120_000,
      `${tier} must leave time for the idempotent refund before the 120s client ceiling`,
    );
  }
});

Deno.test('onboarding telemetry: the only possible Free calls retain attempt 1/2 labels', () => {
  const block = onboardingBlock();
  assert(
    /maxRetries:\s*0/.test(block) && /allowProviderRetry:\s*false/.test(block),
    'outer lifecycle retries and nested provider retries must remain disabled',
  );

  assert(
    /telemetry:\s*\{\s*\.\.\.telemetryBase,\s*attempt:\s*1\s*\}/.test(resume),
    'the first Free call must remain attempt 1',
  );
  assert(
    /telemetry:\s*\{\s*\.\.\.telemetryBase,\s*attempt:\s*2\s*\}/.test(resume),
    'the optional quality retry outside onboarding must remain attempt 2',
  );
});
