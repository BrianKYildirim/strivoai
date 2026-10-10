/**
 * Quick 260804-50q — `goalChipLabel` precedence + never-throw guard.
 *
 * The chip reads a jsonb column, so at runtime ANY field can be ANY type. A malformed
 * parse must degrade to a missing chip, never to a broken dashboard.
 */
import { describe, it, expect } from 'vitest';

import { goalChipLabel } from './goal-display';
import type { ProfessionalGoalStructured } from '@/hooks/useProfessionalGoal';

const LEGACY: ProfessionalGoalStructured = {
  role: 'Investment Banking',
  industry: 'Investment Banking',
  location: 'New York',
  opportunity_type: 'internship',
  year: '2027',
};

const ENRICHED: ProfessionalGoalStructured = {
  ...LEGACY,
  timeframe: '2027',
  seniority: 'intern',
  company_type: 'leading global bank',
  long_term_direction: 'I want to move into private equity later',
  normalized_summary: 'Investment Banking • Internship • Leading Global Bank • New York • 2027',
  keywords: ['investment banking', 'new york', 'private equity'],
};

const RAW = 'I want an investment banking internship in New York in 2027.';

describe('goalChipLabel', () => {
  it('prefers normalized_summary when it is present', () => {
    expect(goalChipLabel(ENRICHED, RAW)).toBe(
      'Investment Banking • Internship • Leading Global Bank • New York • 2027',
    );
  });

  it('falls through to the role/location/year join when normalized_summary is blank', () => {
    expect(goalChipLabel({ ...ENRICHED, normalized_summary: '   ' }, RAW)).toBe(
      'Investment Banking • New York • 2027',
    );
    expect(goalChipLabel({ ...ENRICHED, normalized_summary: null }, RAW)).toBe(
      'Investment Banking • New York • 2027',
    );
  });

  it('renders a LEGACY 5-key row exactly as it rendered before the migration', () => {
    // Rows parsed before 20260804010000 have no normalized_summary key AT ALL.
    expect('normalized_summary' in LEGACY).toBe(false);
    expect(goalChipLabel(LEGACY, RAW)).toBe('Investment Banking • New York • 2027');
  });

  it('joins only the parts that are present', () => {
    expect(goalChipLabel({ ...LEGACY, location: null, year: null }, RAW)).toBe('Investment Banking');
  });

  it('falls back to the RAW goal, trimmed, when there is no structured form', () => {
    expect(goalChipLabel(null, `  ${RAW}  `)).toBe(RAW);
    expect(goalChipLabel(undefined, RAW)).toBe(RAW);
    // ...and when a structured form exists but is entirely empty.
    expect(
      goalChipLabel({ role: null, industry: null, location: null, opportunity_type: null, year: null }, RAW),
    ).toBe(RAW);
  });

  it('returns null when there is nothing at all to show', () => {
    expect(goalChipLabel(null, null)).toBeNull();
    expect(goalChipLabel(null, '   ')).toBeNull();
    expect(goalChipLabel(undefined, undefined)).toBeNull();
  });

  it('never throws on malformed jsonb', () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const malformed = {
      role: 42,
      industry: {},
      location: ['New York'],
      opportunity_type: null,
      year: true,
      normalized_summary: 7,
      keywords: 'oops',
    } as any;
    expect(() => goalChipLabel(malformed, RAW)).not.toThrow();
    // Every field is unusable, so it degrades to the raw goal rather than rendering junk.
    expect(goalChipLabel(malformed, RAW)).toBe(RAW);
    expect(goalChipLabel('not an object' as any, RAW)).toBe(RAW);
    expect(goalChipLabel(malformed, null)).toBeNull();
    /* eslint-enable @typescript-eslint/no-explicit-any */
  });
});
