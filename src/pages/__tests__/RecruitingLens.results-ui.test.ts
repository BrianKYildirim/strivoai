import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, '../RecruitingLens.tsx'), 'utf8');

describe('Recruiting Lens premium results presentation', () => {
  it('keeps the score and decision summary together, followed by the full verdict', () => {
    expect(source).toContain('Your Recruiting Lens Match');
    expect(source).toContain('result.overallMatch?.score');
    expect(source).toContain('result.overallMatch?.label');
    expect(source).toContain('result.recruiterVerdict');
    expect(source).toContain('result.overallMatch?.summary || result.recruiterVerdict');
    expect(source.indexOf('/* Match summary */')).toBeLessThan(source.indexOf('/* Full recruiter verdict */'));
    expect(source.indexOf('/* Full recruiter verdict */')).toBeLessThan(source.indexOf('/* Sub-scores */'));
  });

  it('avoids a second sticky navigation layer in the result report', () => {
    expect(source).not.toContain('aria-label="Recruiting Lens result sections"');
    expect(source).not.toContain('sectionLinks.map');
  });

  it('shows the full verdict directly below the summary and uses stored reasoning in disclosure panels', () => {
    expect(source).not.toContain('Read full recruiter verdict');
    expect(source).toContain('Full reasoning');
    expect(source).toContain('Show top 3 gaps');
    expect(source).toContain('Why this matters');
    expect(source).toContain('result.topGaps?.slice(0, 3)');
    expect(source).toContain('expandedScores.has(key)');
    expect(source).toContain('{sub.rationale}');
  });

  it('preserves every actionable result collection and copy workflow', () => {
    for (const field of [
      'result.subScores',
      'result.topGaps',
      'result.quickFixes',
      'result.resumeEdits',
      'result.roadmap',
      'result.keywords.matched',
      'result.keywords.missing',
      'result.linkedinImprovements',
      'result.strategicAdvice',
    ]) {
      expect(source).toContain(field);
    }
    expect(source).toContain('Copy strongest rewrites');
    expect(source).toContain('Copy missing keywords');
  });

  it('does not fabricate locked gap, rewrite, keyword, LinkedIn, or roadmap content', () => {
    expect(source).not.toContain('LOCKED_GAP_PLACEHOLDERS');
    expect(source).not.toContain('LOCKED_EDIT_PLACEHOLDERS');
    expect(source).not.toContain('Kubernetes');
    expect(source).not.toContain('Week 1:');
    expect(source).not.toContain('Update headline to include target role keywords');
  });
});
