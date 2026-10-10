// FEAT-03 static-source guard test for the LinkedIn prompt layer (Phase 04-03).
//
// These assertions fail-closed if a future edit reintroduces prompt-example
// numeric anchoring, a follow-up / prior-grade re-injection block, or Free-only
// depth gating. They lock the Phase 08.3 prompt contract:
//   - 4 evidence-anchored direct-100 sections present
//   - ZERO numeric calibration anchors (no fixed-score prompt sources)
//   - applicable (D-01) + honest-low/absent handling (D-04) instructed
//   - buildUserMessage carries NO followUp / prior-grade context (Pitfall 8)
//   - Free variant output shape === Elite variant (D-05 everything-to-everyone)

import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  buildLinkedInSystemPrompt,
  buildUserMessage,
  LINKEDIN_PROMPT_VARIANTS,
} from './prompts.ts';

// The 4 mandated sections (names/order match schema.ts LINKEDIN_SECTIONS, 08.3-01).
const SECTION_NAMES = [
  'Headline',
  'About',
  'Experience',
  'Search Alignment, Skills & Credentials',
];

// Numeric calibration anchors / cross-profile target ranges that MUST NOT appear
// (the ~52 clustering source — FEAT-03 fixed-score prompt sources).
const FORBIDDEN_ANCHORS = [
  '20-40',
  '70-90',
  'rarely exceeds 90',
  'caps at 10 out of 30',
  'score 2-5 out of 20',
];

const FREE = LINKEDIN_PROMPT_VARIANTS.free({} as never);
const ELITE = LINKEDIN_PROMPT_VARIANTS.elite({} as never);
const PRO = LINKEDIN_PROMPT_VARIANTS.pro({} as never);

// ── 4 evidence-anchored sections present (both variants) ────────────────────

Deno.test('system prompt names all 4 sections (Free variant)', () => {
  for (const name of SECTION_NAMES) {
    assert(FREE.includes(name), `Free prompt is missing section: ${name}`);
  }
});

Deno.test('system prompt names all 4 sections (Elite variant)', () => {
  for (const name of SECTION_NAMES) {
    assert(ELITE.includes(name), `Elite prompt is missing section: ${name}`);
  }
});

Deno.test('buildLinkedInSystemPrompt names all 4 sections', () => {
  const prompt = buildLinkedInSystemPrompt();
  for (const name of SECTION_NAMES) {
    assert(prompt.includes(name), `Prompt is missing section: ${name}`);
  }
});

// ── ZERO numeric calibration anchors (FEAT-03) ──────────────────────────────

Deno.test('system prompt contains no numeric calibration anchors', () => {
  for (const anchor of FORBIDDEN_ANCHORS) {
    assertEquals(FREE.includes(anchor), false, `Free prompt reintroduced anchor: ${anchor}`);
    assertEquals(ELITE.includes(anchor), false, `Elite prompt reintroduced anchor: ${anchor}`);
  }
});

Deno.test('system prompt has no old 4-section SCORING ARCHITECTURE maxes', () => {
  // The retired 4-section rubric used "(0-20 points)" / "(0-30 points)" phrasing.
  const prompt = buildLinkedInSystemPrompt();
  assertEquals(prompt.includes('(0-20 points)'), false);
  assertEquals(prompt.includes('(0-30 points)'), false);
});

Deno.test('system prompt contains the direct-100 rubric top bands', () => {
  const prompt = buildLinkedInSystemPrompt();
  assert(prompt.includes('13–15'), 'Prompt must include the Headline/About top band');
  assert(prompt.includes('37–45'), 'Prompt must include the Experience top band');
  assert(prompt.includes('21–25'), 'Prompt must include the Search Alignment top band');
});

// ── applicable (D-01) + honest-low/absent (D-04) instructed ─────────────────

Deno.test('system prompt instructs applicable:false for non-applicable sections (D-01)', () => {
  const prompt = buildLinkedInSystemPrompt();
  assert(prompt.includes('applicable'), 'Prompt must mention the applicable flag (D-01)');
  assert(prompt.includes('applicable: false'), 'Prompt must instruct applicable: false for excluded sections');
});

Deno.test('system prompt instructs honest-low scoring for applicable-but-absent sections (D-04)', () => {
  const prompt = buildLinkedInSystemPrompt();
  // D-04: an applicable-but-empty section is scored honestly low, not mid-range filler.
  assert(prompt.includes('applicable: true'), 'Prompt must cover applicable: true absent sections');
  assert(
    prompt.includes('honestly') || prompt.includes('honest'),
    'Prompt must instruct honest low scoring for absent-but-applicable sections',
  );
});

// ── The model does not invent the total (math-from-sections) ────────────────

Deno.test('system prompt tells the model the total is computed server-side', () => {
  const prompt = buildLinkedInSystemPrompt();
  assert(prompt.includes('server'), 'Prompt must state the total is computed server-side');
});

// ── buildUserMessage carries NO follow-up / prior-grade context (Pitfall 8) ─

Deno.test('buildUserMessage(content, url) appends no follow-up / prior-grade block', () => {
  const result = buildUserMessage('Sample LinkedIn profile content.', 'https://linkedin.com/in/jsmith');
  assertEquals(result.includes('FOLLOW-UP CONTEXT'), false);
  assertEquals(result.includes('PREVIOUS ANALYSIS'), false);
  assertEquals(result.includes('re-analysis'), false);
});

Deno.test('buildUserMessage has no third followUp parameter', () => {
  // Arity is exactly 2: (profileContent, profileUrl?). A reintroduced followUp
  // param would push the length to 3.
  assertEquals(buildUserMessage.length <= 2, true);
});

Deno.test('buildUserMessage includes profile content and optional URL', () => {
  const content = 'Senior Engineer at Acme with 5 years building distributed systems.';
  const withUrl = buildUserMessage(content, 'https://linkedin.com/in/x');
  assert(withUrl.includes('PROFILE CONTENT:'));
  assert(withUrl.includes(content));
  assert(withUrl.includes('Profile URL: https://linkedin.com/in/x'));

  const noUrl = buildUserMessage(content);
  assertEquals(noUrl.includes('Profile URL:'), false);
  assert(noUrl.startsWith('Grade this LinkedIn profile.'));
});

// ── Free variant output shape === Elite variant (D-05) ──────────────────────

Deno.test('D-05: Free variant output shape is identical to Elite (everything-to-everyone)', () => {
  assertEquals(FREE, ELITE);
});

Deno.test('D-05: pro alias resolves to the same full builder (back-compat routing)', () => {
  assertEquals(PRO, ELITE);
});

Deno.test('D-05: Free prompt has no depth-gating / restriction phrasing', () => {
  // The retired Free variant limited topFixes to 1 and stripped feedback arrays.
  assertEquals(FREE.includes('Return exactly 1 topFixes entry'), false);
  assertEquals(FREE.includes('single highest-priority fix'), false);
  // Free must request the full per-section output shape, same as Elite.
  assert(FREE.includes('strengths'));
  assert(FREE.includes('weaknesses'));
  assert(FREE.includes('improvements'));
  assert(FREE.includes('evidence'));
});
