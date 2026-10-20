/**
 * Quick task 260713-hrd — ED-6 guard: Career Compass Free is STANDALONE.
 * A resume-only run MUST succeed.
 *
 * THE BUG THIS LOCKS OUT
 * ---------------------------------------------------------------------------
 * The UI labelled the LinkedIn PDF "(optional)" while the backend hard-required it:
 * `analyze-career:1380` returned 400 "LinkedIn PDF content is required". On top of
 * that, two 412 gates (`missing_prior_analyses`, `linkedin_prior_missing`) demanded a
 * PRIOR Resume Analysis and a PRIOR LinkedIn Grade before Career Compass would run at
 * all. Free users sat behind three separate walls for a feature they had paid Merits
 * to use.
 *
 * LOCKED OPERATOR DECISION (2026-07-13): Career Compass Free requires ONLY an uploaded
 * resume. LinkedIn is OPTIONAL. A prior Resume Analysis / LinkedIn Grade must NEVER be
 * a required gate — when those already exist, Career Compass MAY reuse them as
 * ENRICHMENT (readPersistedLinkedInText already does exactly this), but the feature
 * MUST work without them.
 *
 * A resume is still required. That gate stays.
 */
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

function winSafePath(url: string): string {
  const raw = new URL(url, import.meta.url).pathname;
  return raw.startsWith('/') && raw[2] === ':' ? raw.slice(1) : raw;
}

const source = await Deno.readTextFile(winSafePath('../index.ts'));

// ── All three gates are GONE ─────────────────────────────────────────────────


/**
 * The source with COMMENTS STRIPPED.
 *
 * Removal assertions ("this branch must be GONE") must inspect CODE, not prose. The handler
 * deliberately CARRIES comments explaining why each gate was deleted — and one of them quotes
 * the exact anti-pattern it forbids. A naive `source.includes(...)` matches the documentation
 * of the fix and fails on it.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const codeOnly = stripComments(source);

Deno.test('260713-hrd resume-only: the 400 "LinkedIn PDF content is required" gate is DELETED', () => {
  assert(
    !source.includes('LinkedIn PDF content is required'),
    'the UI called LinkedIn optional while the backend hard-failed without it (RC-7)',
  );
  assert(
    !source.includes('Unable to extract text from your LinkedIn PDF.'),
    'an unreadable/absent LinkedIn PDF must degrade to resume-only, never 400 the run',
  );
});

Deno.test('260713-hrd resume-only: the 412 prior-analysis gates are DELETED', () => {
  assert(
    !codeOnly.includes('missing_prior_analyses'),
    'a prior Resume Analysis must NEVER be a required gate (locked: Free is standalone)',
  );
  assert(
    !codeOnly.includes('linkedin_prior_missing'),
    'a prior LinkedIn Grade must NEVER be a required gate (locked: Free is standalone)',
  );
  assert(!/status:\s*412/.test(codeOnly), 'no 412 prerequisite short-circuit may remain on any career path');
});

// ── The resume gate STAYS (a resume is genuinely required) ───────────────────

Deno.test('260713-hrd resume-only: the resume IS still required (the one legitimate input gate)', () => {
  assert(source.includes('Resume file is required'), 'Career Compass cannot run on nothing');
  assert(
    source.includes('Unable to extract text from your resume.'),
    'an unreadable resume is still an honest, actionable 400',
  );
});

// ── LinkedIn survives as OPTIONAL ENRICHMENT ─────────────────────────────────

Deno.test('260713-hrd resume-only: a persisted LinkedIn profile is still auto-reused when present (enrichment, not a gate)', () => {
  assert(
    source.includes('readPersistedLinkedInText('),
    'the "reuse a prior LinkedIn when available" enrichment must be preserved — it is the whole point of optional',
  );
});

Deno.test('260713-hrd resume-only: the prompt takes an explicit resume-only branch when LinkedIn is absent', () => {
  assert(
    source.includes('(not provided — analyze from resume only)'),
    'the model must be TOLD LinkedIn is absent, so it analyses from the resume rather than hallucinating a profile',
  );
  // The branch must be reachable: profileContent is chosen on hasLinkedIn, not gated behind
  // an allowResumeOnly opt-in the client no longer sends.
  assert(
    /hasLinkedIn\s*\n?\s*\?[\s\S]{0,400}not provided — analyze from resume only/.test(source),
    'the resume-only prompt branch must key off the PRESENCE of LinkedIn content, nothing else',
  );
});

Deno.test('260713-hrd resume-only: allowResumeOnly is no longer a BRANCH (it is a no-op wire-compat field)', () => {
  // DISPOSITION (260713-hrd): allowResumeOnly is KEPT as a cache-key/idempotency input
  // (removing it would be a gratuitous cache-identity change and would break three
  // further assertions for no benefit) — but nothing may BRANCH on it any more, because
  // resume-only is now simply the default behavior.
  assert(
    !/if\s*\([^)]*!allowResumeOnly/.test(source),
    'no gate may still be bypassed-only-by allowResumeOnly — resume-only is the DEFAULT now',
  );
  assert(
    !/&&\s*!allowResumeOnly/.test(source),
    'allowResumeOnly must not participate in any gate condition',
  );
});
