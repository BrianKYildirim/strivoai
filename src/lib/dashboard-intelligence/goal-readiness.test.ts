import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, it, expect } from 'vitest';

import { parseGoalReadiness } from './goal-readiness';

/**
 * `goal-readiness.ts` is a READ-ONLY PARSER of the jsonb that the SQL scorer
 * (`compute_goal_readiness`, migration 20260712000002) persists. These tests pin two
 * things:
 *   1. it parses the real persisted shape into the render model, and
 *   2. it NEVER throws on malformed input — a garbage column must not white-screen the
 *      dashboard (the `profile-alignment.ts` defensive posture).
 */

/** The exact shape compute_goal_readiness() writes (see migration 20260712000002 §B). */
const PERSISTED = {
  components: [
    { id: 'resume_quality', label: 'Resume Quality', weight: 25, score: 80, evidenced: true },
    { id: 'goal_alignment', label: 'Goal Alignment', weight: 25, score: 60, evidenced: true },
    { id: 'goal_keyword_coverage', label: 'ATS Keyword Coverage', weight: 15, score: 55, evidenced: true },
    { id: 'linkedin_strength', label: 'LinkedIn Strength', weight: 15, score: 0, evidenced: false },
    { id: 'evidence_depth', label: 'Demonstrated Impact', weight: 10, score: 70, evidenced: true },
    { id: 'profile_consistency', label: 'Profile Consistency', weight: 10, score: 0, evidenced: false },
  ],
  interpretation: 'On the evidence Strivo can see, your profile solidly supports this goal.',
  partial_evidence: true,
  evidenced_weight: 75,
  blockers: [
    'Add LinkedIn Strength — Strivo has no evidence for it yet',
    'Add Profile Consistency — Strivo has no evidence for it yet',
  ],
};

describe('parseGoalReadiness — well-formed persisted breakdown', () => {
  it('parses the persisted jsonb into the render model', () => {
    const model = parseGoalReadiness(68, PERSISTED);

    expect(model.status).toBe('ready');
    expect(model.components).toHaveLength(6);
    expect(model.interpretation).toBe(PERSISTED.interpretation);
    expect(model.blockers).toHaveLength(2);
    expect(model.evidencedWeight).toBe(75);
  });

  it('passes the PERSISTED score through verbatim — never recomputed', () => {
    // 68 is what SQL persisted. The parser must not re-derive, re-weight or round it.
    expect(parseGoalReadiness(68, PERSISTED).score).toBe(68);
    // Even a value the client might consider "wrong" is passed through untouched:
    // the SQL scorer is the single source of truth.
    expect(parseGoalReadiness(3, PERSISTED).score).toBe(3);
  });

  it('derives `unevidenced` — missing LinkedIn is MISSING DATA, never a 0% bar', () => {
    const model = parseGoalReadiness(68, PERSISTED);

    expect(model.unevidenced.map((component) => component.id)).toEqual([
      'linkedin_strength',
      'profile_consistency',
    ]);
    // The un-evidenced components are still present in `components` so the UI can render
    // them via the muted/locked "Needs data" path.
    expect(model.components.find((component) => component.id === 'linkedin_strength')?.evidenced).toBe(false);
  });

  it('surfaces partial evidence (§9f)', () => {
    expect(parseGoalReadiness(68, PERSISTED).partialEvidence).toBe(true);
  });

  it('reports full evidence when every component is evidenced', () => {
    const full = {
      ...PERSISTED,
      components: PERSISTED.components.map((component) => ({ ...component, evidenced: true })),
      partial_evidence: false,
      evidenced_weight: 100,
    };

    const model = parseGoalReadiness(74, full);

    expect(model.partialEvidence).toBe(false);
    expect(model.unevidenced).toHaveLength(0);
    expect(model.evidencedWeight).toBe(100);
  });

  it('still flags partial evidence if the persisted flag is stale but a component is un-evidenced', () => {
    const stale = { ...PERSISTED, partial_evidence: false };
    expect(parseGoalReadiness(68, stale).partialEvidence).toBe(true);
  });

  it('is deterministic — same input, same model', () => {
    expect(parseGoalReadiness(68, PERSISTED)).toEqual(parseGoalReadiness(68, PERSISTED));
  });
});

describe('parseGoalReadiness — defensive: never throws, returns a safe model', () => {
  it('no goal -> no_goal', () => {
    const model = parseGoalReadiness(null, null, false);

    expect(model.status).toBe('no_goal');
    expect(model.score).toBeNull();
    expect(model.components).toEqual([]);
  });

  it('goal but nothing persisted yet (trigger has not fired) -> no_evidence', () => {
    const model = parseGoalReadiness(null, null);

    expect(model.status).toBe('no_evidence');
    expect(model.score).toBeNull();
    expect(model.partialEvidence).toBe(false);
  });

  it.each([
    ['undefined', undefined],
    ['a string', 'not json'],
    ['a number', 42],
    ['an array (wrong top-level type)', [{ id: 'x' }]],
    ['an empty object', {}],
    ['components: null', { components: null }],
    ['components: not an array', { components: 'nope' }],
  ])('malformed jsonb (%s) returns a safe model without throwing', (_label, components) => {
    expect(() => parseGoalReadiness(68, components)).not.toThrow();

    const model = parseGoalReadiness(68, components);
    expect(model.status).toBe('no_evidence');
    expect(model.score).toBeNull();
    expect(model.components).toEqual([]);
    expect(model.interpretation.length).toBeGreaterThan(0);
  });

  it('drops structurally invalid components rather than guessing at them', () => {
    const model = parseGoalReadiness(70, {
      ...PERSISTED,
      components: [
        { id: 'resume_quality', label: 'Resume Quality', weight: 25, score: 80, evidenced: true },
        { id: 'broken_missing_label', weight: 25, score: 60, evidenced: true },
        { id: 'broken_score_type', label: 'Bad', weight: 15, score: 'high', evidenced: true },
        null,
        'garbage',
      ],
    });

    expect(model.components.map((component) => component.id)).toEqual(['resume_quality']);
    expect(model.score).toBe(70);
  });

  it('treats a non-true `evidenced` as un-evidenced (missing data), not as a zero score', () => {
    const model = parseGoalReadiness(70, {
      ...PERSISTED,
      components: [
        { id: 'linkedin_strength', label: 'LinkedIn Strength', weight: 15, score: 0, evidenced: 'yes' },
      ],
    });

    expect(model.components[0].evidenced).toBe(false);
    expect(model.unevidenced).toHaveLength(1);
  });

  it('a null persisted score with valid components is still no_evidence (nothing scorable)', () => {
    const model = parseGoalReadiness(null, PERSISTED);

    expect(model.status).toBe('no_evidence');
    expect(model.score).toBeNull();
    // The components survive so the UI can still show WHAT is missing.
    expect(model.components).toHaveLength(6);
  });

  it('ignores non-string blockers', () => {
    const model = parseGoalReadiness(68, { ...PERSISTED, blockers: ['ok', 42, null, '', 'also ok'] });
    expect(model.blockers).toEqual(['ok', 'also ok']);
  });
});

describe('NO PARALLEL SCORER — the rubric math lives in SQL, once', () => {
  // Mirrors the Deno-side static guard (_shared/goal-readiness-guard.test.ts §6) from the
  // vitest side. If anyone regrows the scoring math client-side, BOTH gates go red.
  const source = readFileSync(
    path.resolve(__dirname, './goal-readiness.ts'),
    'utf8',
  );

  it.each([
    ['a hardcoded weight constant', /\bweight\s*[:=]\s*\d+/],
    ['a /100 renormalization expression', /\/\s*100\b/],
    ['a .reduce( summation', /\.reduce\s*\(/],
    ['Math.round( (re-scoring the persisted value)', /Math\.round\s*\(/],
    ['a clamp helper', /clampScore/],
  ])('the parser module contains no scoring math: %s', (_what, pattern) => {
    expect(pattern.test(source)).toBe(false);
  });

  it('exports only the parser', () => {
    expect(typeof parseGoalReadiness).toBe('function');
  });
});
