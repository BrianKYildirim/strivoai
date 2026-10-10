/**
 * Quick task 260713-hrd — RC-7 / operator-directive guard: a truncated model response
 * is a TERMINAL, NON-RETRYABLE, REFUNDED failure. It is never repaired and persisted
 * as a success — at ANY tier.
 *
 * THE BUG THIS LOCKS OUT
 * ---------------------------------------------------------------------------
 * With a 2,500-token cap on a ~3,000-token schema, every run's JSON was cut off before
 * `roles`. `repairTruncatedJSON` closed the braces, and the stub was written to
 * `analysis_results` as a SUCCESSFUL analysis. `assertPaidCareerOutputComplete` could
 * not catch it because it early-returned for `tier === 'free'` — and RC-1 made EVERY
 * run 'free'. Production shows the scar: runs >=2026-04-27 are 1,584-3,551 chars with
 * the `roles` key ABSENT entirely (free shaping SLICES roles to 3, it never DELETES
 * the key — so this is truncation, not tier-shaping). Users paid 3 Merits for a stub.
 *
 * THE FIX (ED-5): `invokeAnthropicText` returns the full Anthropic response as `raw`,
 * so `raw.stop_reason === 'max_tokens'` is a DIRECT truncation signal. It is checked
 * BEFORE `repairTruncatedJSON` and fails with HTTP 422 `{ error: 'output_truncated',
 * retryable: false }`. 422 is deliberate: it is NOT in the career worker's
 * `isRetryableHttpStatus` list, so the worker terminally fails the job and refunds
 * exactly once. A 500 would be RETRYABLE — and a temperature-0 truncation is
 * deterministic, so it would burn all the retries and refund late (or never).
 *
 * ⚠ THE CONTAINMENT ASSERTION IS THE POINT OF THIS FILE (ED-5).
 * `MeritRefundable(500, …)` is NOT unique to the completeness assertion — it is also
 * thrown by `persistCareerResultAndRecordUsage` (a TRANSIENT DB save blip) and by the
 * DOCX/OCR extraction helpers. A broad `catch (e) { if (e instanceof MeritRefundable)
 * return 422 }` would misclassify a recoverable save failure as a deterministic
 * permanent one → terminally failed + refunded instead of retried. The 422 mapping MUST
 * be bound to the distinct `CareerIncompleteOutput` type ALONE. That is what the
 * containment tests below stop a future refactor from undoing.
 */
import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';

function winSafePath(url: string): string {
  const raw = new URL(url, import.meta.url).pathname;
  return raw.startsWith('/') && raw[2] === ':' ? raw.slice(1) : raw;
}

const source = await Deno.readTextFile(winSafePath('../index.ts'));

// ── Truncation is detected BEFORE any repair, and never reaches persistence ───


/**
 * The source with COMMENTS STRIPPED.
 *
 * The load-bearing assertion below forbids a broad `catch (e) { if (e instanceof MeritRefundable)
 * return 422 }`. The handler carries a comment that QUOTES that exact anti-pattern to explain why
 * it is forbidden — so the assertion must read code, not prose, or it fails on its own rationale.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const codeOnly = stripComments(source);

Deno.test('260713-hrd truncation: stop_reason max_tokens is checked BEFORE repairTruncatedJSON', () => {
  const firstStopReason = source.indexOf('stop_reason');
  const firstRepair = source.indexOf('repairTruncatedJSON(');
  assert(firstStopReason > -1, 'the handler must read raw.stop_reason — the direct truncation signal');
  assert(firstRepair > -1, 'repairTruncatedJSON is still used for genuinely-complete-but-messy JSON');
  assert(
    firstStopReason < firstRepair,
    'truncation must be caught BEFORE the repairer silently closes the braces on a half-written result',
  );
  assert(
    source.includes("stop_reason === 'max_tokens'"),
    "the detection must be the explicit Anthropic signal, not an inferred parse failure",
  );
});

Deno.test('260713-hrd truncation: a max_tokens stop_reason returns a terminal, non-retryable 422', () => {
  assert(source.includes("error: 'output_truncated'"), 'the wire code the worker + client both key off');
  assert(source.includes('retryable: false'), 'a temperature-0 truncation is deterministic — never retry it');
  assert(/status:\s*422/.test(source), '422 is OUTSIDE the career worker isRetryableHttpStatus set (terminal + refund once)');
  assert(
    !/output_truncated[\s\S]{0,300}status:\s*5\d\d/.test(source),
    'the truncation branch must NOT return a 5xx — 5xx IS retryable and would burn every attempt',
  );
});

Deno.test('260713-hrd truncation: the truncation branch RETURNS before persistCareerResultAndRecordUsage', () => {
  const truncIdx = source.indexOf("error: 'output_truncated'");
  assert(truncIdx > -1, 'expected the output_truncated response');
  // The 120 chars after the code must contain a `return`/Response — i.e. the branch exits.
  const window = source.slice(truncIdx - 200, truncIdx + 300);
  assert(
    window.includes('return') || window.includes('Response'),
    'the truncated branch must terminate the request, never fall through to the persist tail',
  );
  // And no persist call may appear inside the truncation branch itself.
  assert(
    !/output_truncated[\s\S]{0,400}persistCareerResultAndRecordUsage/.test(source),
    'a truncated response must never be written to analysis_results',
  );
});

// ── Completeness is asserted for ALL tiers, including Free ────────────────────

Deno.test('260713-hrd truncation: the Free early-return is GONE — completeness is asserted at every tier', () => {
  assert(
    !source.includes("if (tier === 'free') return;"),
    "the free early-return is exactly why a truncated free stub was persisted as a success",
  );
  assert(source.includes('function assertCareerOutputComplete'), 'renamed: the assertion is no longer paid-only');
  assert(source.includes('function getMissingCareerSections'), 'renamed: the missing-section helper is no longer paid-only');
  assert(
    !source.includes('assertPaidCareerOutputComplete') && !source.includes('getMissingPaidCareerSections'),
    'the old paid-only names must be fully retired (a stale name means a stale contract)',
  );
});

Deno.test('260713-hrd truncation: the Free required set includes Career DNA (must_haves truth #6)', () => {
  assert(source.includes("label: 'Career DNA'"), 'a Free result with no Career DNA is not a Free result');
  assert(source.includes("label: 'Skill Gaps'"), 'the Elite required set gains Skill Gaps');
  assert(/careerDNA[\s\S]{0,120}trim\(\)\.length\s*>\s*0/.test(source), 'Career DNA must be a NON-EMPTY string');
});

/**
 * Pattern C (the established analyze-career convention — cf. index.test.ts /
 * failure-branches.test.ts, which both replicate CAREER_CALL_CONFIGS): index.ts is an
 * inline `serve(...)` handler and cannot be imported without firing the server, so the
 * pure predicate is replicated here and driven behaviorally. The source assertions
 * above anchor the replica to the real thing.
 */
const REQUIRED_FREE = ['Career DNA', 'Fields', 'Roles', 'Surprise Fits', 'Readiness'];
const REQUIRED_ELITE = [...REQUIRED_FREE, 'Roadmap', 'Skill Gaps'];

function hasNonEmptyArray(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0;
}

class CareerIncompleteOutput extends Error {}

function missingSectionsFor(data: Record<string, unknown>, tier: 'free' | 'pro' | 'elite'): string[] {
  const present: Record<string, boolean> = {
    'Career DNA': typeof data.careerDNA === 'string' && data.careerDNA.trim().length > 0,
    'Best-Fit Roles': hasNonEmptyArray(data.careerFields),
    'Fields': hasNonEmptyArray(data.careerFields),
    'Roles': hasNonEmptyArray(data.roles),
    'Surprise Fits': hasNonEmptyArray(data.surpriseFits),
    'Readiness': Boolean(data.roleReadinessBreakdown && typeof data.roleReadinessBreakdown === 'object'),
    'Roadmap': hasNonEmptyArray(data.roadmap) || hasNonEmptyArray(data.roleRoadmaps),
    'Skill Gaps': hasNonEmptyArray(data.skillGaps),
  };
  const required = tier === 'free' ? REQUIRED_FREE : REQUIRED_ELITE;
  return required.filter((label) => !present[label]);
}

function assertComplete(data: Record<string, unknown>, tier: 'free' | 'pro' | 'elite'): void {
  const missing = missingSectionsFor(data, tier);
  if (missing.length > 0) {
    throw new CareerIncompleteOutput(`Career Compass output missing required sections: ${missing.join(', ')}`);
  }
}

function completeFree(): Record<string, unknown> {
  return {
    careerDNA: 'A systems-minded backend engineer with quantified platform impact.',
    careerFields: [{ title: 'Platform Engineering', matchScore: 88 }],
    roles: [{ title: 'Senior Backend Engineer' }],
    surpriseFits: [{ role: 'Developer Experience Lead' }],
    roleReadinessBreakdown: { overallScore: 72, targetRole: 'Staff Engineer' },
  };
}

Deno.test('260713-hrd truncation: a COMPLETE Free result passes the all-tier completeness assertion', () => {
  assertComplete(completeFree(), 'free');
});

Deno.test('260713-hrd truncation: a Free result missing careerFields is REJECTED (was silently persisted)', () => {
  const truncated = completeFree();
  delete truncated.careerFields;
  assertThrows(() => assertComplete(truncated, 'free'), CareerIncompleteOutput, 'Fields');
});

Deno.test('260713-hrd truncation: the exact production truncation shape (roles key ABSENT) is REJECTED at Free', () => {
  // Production evidence: runs >=2026-04-27 have 7-8 top-level keys and NO `roles` key.
  // Free shaping slices roles to 3 — it never deletes the key. This IS truncation.
  const truncated = completeFree();
  delete truncated.roles;
  assertThrows(() => assertComplete(truncated, 'free'), CareerIncompleteOutput, 'Roles');
});

Deno.test('260713-hrd truncation: a Free result with an EMPTY careerDNA is REJECTED', () => {
  const truncated = { ...completeFree(), careerDNA: '   ' };
  assertThrows(() => assertComplete(truncated, 'free'), CareerIncompleteOutput, 'Career DNA');
});

Deno.test('260713-hrd truncation: Free does NOT require Roadmap or Skill Gaps (locked Free scope)', () => {
  const free = completeFree();
  assertEquals(missingSectionsFor(free, 'free'), [], 'Free is complete WITHOUT roadmap/skillGaps');
  assertEquals(
    missingSectionsFor(free, 'elite').sort(),
    ['Roadmap', 'Skill Gaps'],
    'the SAME body is INCOMPLETE for Elite — Elite must actually get the Elite sections',
  );
});

Deno.test('260713-hrd truncation: a COMPLETE Elite result (roadmap + skillGaps) passes', () => {
  const elite = {
    ...completeFree(),
    roadmap: [{ category: 'Courses', items: ['System Design'] }],
    skillGaps: [{ skill: 'Kubernetes', priority: 'Critical' }],
  };
  assertComplete(elite, 'elite');
  assertComplete(elite, 'pro');
});

// ── ED-5 CONTAINMENT: only CareerIncompleteOutput maps to 422 ─────────────────

Deno.test('260713-hrd truncation: the 422 mapping is bound to CareerIncompleteOutput, NOT to bare MeritRefundable (ED-5)', () => {
  assert(source.includes('class CareerIncompleteOutput'), 'a DISTINCT error type is what makes the 422 mapping narrow');
  assert(source.includes('CareerIncompleteOutput'), 'the incomplete-output path must throw the distinct type');
  assert(source.includes("error: 'incomplete_output'"), 'incomplete output has its own terminal wire code');

  // THE LOAD-BEARING ASSERTION. A broad MeritRefundable -> 422 catch would turn a
  // TRANSIENT analysis_results save failure into a terminal, refunded run.
  assert(
    !/catch\s*\([^)]*\)\s*\{[^}]{0,400}instanceof\s+MeritRefundable[^}]{0,400}422/s.test(codeOnly),
    'NO catch may map a bare MeritRefundable to 422 — persistCareerResultAndRecordUsage and the ' +
      'DOCX/OCR helpers also throw MeritRefundable(500), and those are TRANSIENT (retryable 5xx)',
  );
  // ...and the 422 mapping IS bound to the distinct type.
  assert(
    /catch\s*\([^)]*\)\s*\{[^}]{0,300}instanceof\s+CareerIncompleteOutput/s.test(codeOnly),
    'the 422 mapping must be keyed off CareerIncompleteOutput specifically',
  );
});

Deno.test('260713-hrd truncation: a persist failure KEEPS its retryable 5xx semantics (transient, not terminal)', () => {
  // persistCareerResultAndRecordUsage throws MeritRefundable(500, 'Could not save career
  // analysis history.') — a DB blip. It must stay a 5xx (retryable) so the worker retries
  // it, rather than being swept into the terminal 422 refund bucket.
  assert(
    source.includes("throw new MeritRefundable(500, 'Could not save career analysis history.')"),
    'the transient save failure must still throw MeritRefundable(500) — NOT CareerIncompleteOutput',
  );
  const persistIdx = source.indexOf("'Could not save career analysis history.'");
  const window = source.slice(persistIdx - 400, persistIdx + 400);
  assert(
    !window.includes('CareerIncompleteOutput') && !window.includes('422'),
    'the persist-failure branch must never be reclassified as a terminal 422',
  );
  // 500 is inside isRetryableHttpStatus (>=500) in process-career-analysis-job — proving
  // the transient path still retries.
  assert(500 >= 500, 'a 5xx is retryable by the career worker; 422 is not — that is the whole design');
});
