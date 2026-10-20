import {
  assert,
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { buildRecruitingLensSystemBlock } from './recruiting-lens-prompts.ts';

function buildCall3Suffix(tier: 'pro' | 'elite'): string {
  const blocks = buildRecruitingLensSystemBlock('rl-call-3', {
    tier,
    currentDate: '2026-07-28',
  });

  assertEquals(blocks.length, 2);
  assertEquals(blocks[0].cache_control, { type: 'ephemeral' });
  return blocks[1].text;
}

const PRO_SUFFIX = buildCall3Suffix('pro');
const ELITE_SUFFIX = buildCall3Suffix('elite');

const SHARED_HARD_LIMITS = [
  'under 8,000 output tokens',
  'HARD LIMIT, not a suggestion',
  'resumeEdits: at most 8 items',
  'original at most 240 characters',
  'rewritten at most 280 characters',
  'linkedinImprovements: at most 6 items',
  'suggestion at most 280 characters',
  'keywords.matched: at most 10 items',
  'keywords.missing: 5-10 items',
  'every keyword at most 80 characters',
  'quickFixes: 3-5 items',
  'every item at most 240 characters',
];

Deno.test('rl-call-3 Pro and Elite prompts carry identical hard output limits', () => {
  for (const suffix of [PRO_SUFFIX, ELITE_SUFFIX]) {
    assertStringIncludes(suffix, 'BREVITY CRITICAL');
    for (const limit of SHARED_HARD_LIMITS) {
      assertStringIncludes(suffix, limit);
    }
  }
});

Deno.test('rl-call-3 preserves Elite exact-8 and Pro 6-8 resume edit contracts', () => {
  assertStringIncludes(
    ELITE_SUFFIX,
    'The resumeEdits array must contain 8 items.',
  );
  assertStringIncludes(
    PRO_SUFFIX,
    'The resumeEdits array must contain 6-8 items.',
  );
});

Deno.test('rl-call-3 Pro prompt still forbids Elite-only output fields', () => {
  assertStringIncludes(
    PRO_SUFFIX,
    'Do NOT output "linkedinImprovements", "keywords", or "quickFixes" fields.',
  );
  assertStringIncludes(PRO_SUFFIX, 'Output ONLY the "resumeEdits" array.');
});

Deno.test('rl-call-3 prompt never weakens caps, headroom, or field ownership', () => {
  const forbiddenInstructions = [
    'Increase maxTokens',
    'Raise maxTokens',
    'Lower the 15% headroom threshold',
    'You may output additional fields',
  ];

  for (const suffix of [PRO_SUFFIX, ELITE_SUFFIX]) {
    for (const instruction of forbiddenInstructions) {
      assert(
        !suffix.includes(instruction),
        `Prompt contains forbidden instruction: ${instruction}`,
      );
    }
  }
});
