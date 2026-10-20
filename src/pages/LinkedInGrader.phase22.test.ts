// Phase 22 Plan 01 — LinkedInGrader UI source-grep tests (SC-1, SC-2, SC-3, SC-7)
// Follows the project's source-grep convention: read the page file as text and
// assert substrings. No React render needed for page-level structural assertions.

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const source = readFileSync(
  resolve(__dirname, 'LinkedInGrader.tsx'),
  'utf-8'
);

describe('SC-1: container class has pt-6 (not pt-24)', () => {
  it('container uses pt-6 pb-12 without pt-24', () => {
    expect(source).toContain('pt-6 pb-12');
    expect(source).not.toContain('pt-24');
  });
});

describe('SC-2: D-05 teaser removal — Free sees the full fix list (no locked placeholders)', () => {
  // 04-05 removed the LinkedIn free-tier teaser design per D-05 (everything-to-everyone):
  // Free now sees the full 11-section output + complete fix list, with no locked
  // placeholder cards and no depth gating. This block is the source-grep regression lock
  // that fails-closed if the teaser is reintroduced (mirrors the backend
  // grade-linkedin/__tests__/fixed-source-guard.test.ts posture).

  it('the LOCKED_FIXES_PLACEHOLDERS teaser constant is removed', () => {
    expect(source).not.toContain('LOCKED_FIXES_PLACEHOLDERS');
  });

  it('the BlurredLockCard teaser wrapper is removed', () => {
    expect(source).not.toContain('BlurredLockCard');
  });

  it('the Headline Refinement #2 placeholder card title is removed', () => {
    expect(source).not.toContain('Headline Refinement #2');
  });

  it('the top fixes render unconditionally to all tiers (no free slice gate)', () => {
    expect(source).toContain('result.topFixes.map');
    expect(source).not.toContain('isFreeGated ? 1');
  });
});

describe('SC-3: orderedSections useMemo moves Profile Completeness to index 0', () => {
  it('orderedSections useMemo is declared', () => {
    expect(source).toContain('const orderedSections = useMemo');
  });

  it('useMemo searches for profile completeness section', () => {
    expect(source).toContain('profile completeness');
  });

  it('section breakdown render uses orderedSections not raw sectionBreakdown', () => {
    expect(source).toContain('orderedSections.map');
  });

  it('raw sectionBreakdown is never mutated (no sort/splice/reassignment)', () => {
    expect(source).not.toMatch(/sectionBreakdown\.sort\b/);
    expect(source).not.toMatch(/sectionBreakdown\.splice\b/);
    expect(source).not.toMatch(/sectionBreakdown\s*=/);
  });

  it('AnalysisComparisonModal still receives the raw sectionBreakdown array', () => {
    expect(source).toContain('sectionBreakdown: result.sectionBreakdown');
  });
});
