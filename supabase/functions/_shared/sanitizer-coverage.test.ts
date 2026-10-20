import { assert } from 'https://deno.land/std@0.168.0/testing/asserts.ts';

const AI_INGESTERS = [
  'grade-linkedin',
  'recruiting-lens',
  'interview-prep-analyze',
  'analyze-resume',
  'analyze-career',
] as const;

function readFunctionSource(fn: string): string {
  const url = new URL(`../${fn}/index.ts`, import.meta.url);
  return Deno.readTextFileSync(url);
}

Deno.test('SEC-07: enrolled AI ingesters sanitize user content', () => {
  for (const fn of AI_INGESTERS) {
    const source = readFunctionSource(fn);
    assert(
      source.includes('sanitizeUserContent('),
      `${fn} must sanitize user-controlled prompt content`,
    );
  }
});
