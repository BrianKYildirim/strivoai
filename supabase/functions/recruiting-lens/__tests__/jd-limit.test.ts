/**
 * Phase 01.1 Plan 04 — RCL-01/RCL-02, D-15/D-16/D-17.
 *
 * Proves the Recruiting Lens job-description boundary and that over-limit
 * requests return before authentication, rate limiting, merit, or Anthropic.
 */
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  getRecruitingLensJdLimitError,
  MSG_JD_TOO_LONG,
} from '../../_shared/document-limits.ts';

const rawPath = new URL('../index.ts', import.meta.url).pathname;
const INDEX_PATH =
  rawPath.startsWith('/') && rawPath[2] === ':' ? rawPath.slice(1) : rawPath;
const source = Deno.readTextFileSync(INDEX_PATH);

Deno.test('job-description limit: 5,999 characters clear the production predicate', () => {
  assertEquals(getRecruitingLensJdLimitError('j'.repeat(5_999)), null);
});

Deno.test('job-description limit: exactly 6,000 characters clear the production predicate', () => {
  assertEquals(getRecruitingLensJdLimitError('j'.repeat(6_000)), null);
});

Deno.test('job-description limit: 6,001 characters return the locked error', () => {
  assertEquals(
    getRecruitingLensJdLimitError('j'.repeat(6_001)),
    'Job descriptions may contain up to 6,000 characters.',
  );
  assertEquals(MSG_JD_TOO_LONG, 'Job descriptions may contain up to 6,000 characters.');
});

Deno.test('job-description limit: guard precedes every paid or stateful gate', () => {
  const guardIndex = source.indexOf('getRecruitingLensJdLimitError(jobDescription)');
  const authIndex = source.indexOf('await requireAuth');
  const rateLimitIndex = source.indexOf('await checkRateLimit');
  const meritIndex = source.indexOf('await withMerits');
  // The handler reaches Anthropic through executeParallelCalls; direct
  // invokeAnthropicText calls live in the helper definition above handler().
  const anthropicIndex = source.indexOf('await executeParallelCalls', guardIndex);

  assertEquals(guardIndex > -1, true);
  assertEquals(
    source.slice(guardIndex, authIndex).includes("error: 'invalid_input'"),
    true,
  );
  assertEquals(source.slice(guardIndex, authIndex).includes('status: 400'), true);
  assertEquals(guardIndex < authIndex, true);
  assertEquals(guardIndex < rateLimitIndex, true);
  assertEquals(guardIndex < meritIndex, true);
  assertEquals(guardIndex < anthropicIndex, true);
});
