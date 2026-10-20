/**
 * useFeatureCosts — pure helper tests (UX-11 + IN-02).
 *
 * Asserts the getCostForFeature() lookup helper's three-state contract:
 * - number    → matching (feature, tier) entry with a priced cost
 * - null      → feature/tier not priced (caller should treat as locked)
 * - undefined → costs not yet loaded or fetch errored (caller MUST wait
 *               or surface isError from the hook before gating)
 */
import { describe, it, expect } from 'vitest';
import { getCostForFeature } from './useFeatureCosts';

const SAMPLE_COSTS = [
  { feature: 'resume_analysis', tier: 'free', cost: 3 },
  { feature: 'resume_analysis', tier: 'pro', cost: 3 },
  { feature: 'resume_analysis', tier: 'elite', cost: 3 },
  { feature: 'career_compass', tier: 'pro', cost: 3 },
];

describe('getCostForFeature', () => {
  it('returns the cost for a matched (feature, tier) pair', () => {
    expect(getCostForFeature(SAMPLE_COSTS, 'resume_analysis', 'free')).toBe(3);
    expect(getCostForFeature(SAMPLE_COSTS, 'resume_analysis', 'pro')).toBe(3);
    expect(getCostForFeature(SAMPLE_COSTS, 'career_compass', 'pro')).toBe(3);
  });

  it('IN-02: returns undefined when costs array is undefined (loading/error)', () => {
    // Distinct from "not priced" — caller MUST NOT treat this as a locked
    // feature, or a transient DB error would look identical to a legitimate
    // tier-lock for up to 60s (staleTime).
    expect(getCostForFeature(undefined, 'resume_analysis', 'pro')).toBeUndefined();
  });

  it('returns null when no entry matches the feature', () => {
    expect(getCostForFeature(SAMPLE_COSTS, 'unknown_feature', 'pro')).toBeNull();
  });

  it('returns null when the feature exists but the tier does not', () => {
    expect(getCostForFeature(SAMPLE_COSTS, 'career_compass', 'free')).toBeNull();
  });

  it('IN-02: returns null (not undefined) for an empty costs array (loaded, no rows)', () => {
    // Empty array means the query resolved successfully but the DB has no
    // priced rows yet — that is a genuine "not priced" signal, not a load
    // state. Caller can safely treat as locked.
    expect(getCostForFeature([], 'resume_analysis', 'pro')).toBeNull();
  });
});
