import { describe, it, expect } from 'vitest';
import {
  FEATURE_KEY_TO_DB,
  verifyCostMap,
  type MeritFeatureCostRow,
} from '../tier-config.ts';
import { MERIT_COST_PER_FEATURE } from '@/config/pricing-config';

const goodRows = (): MeritFeatureCostRow[] => {
  const rows: MeritFeatureCostRow[] = [];
  for (const short of Object.keys(FEATURE_KEY_TO_DB) as Array<
    keyof typeof FEATURE_KEY_TO_DB
  >) {
    const canonical = FEATURE_KEY_TO_DB[short];
    const costs = MERIT_COST_PER_FEATURE[canonical];
    for (const tier of ['free', 'pro', 'elite'] as const) {
      rows.push({ feature: short, tier, cost: costs[tier] });
    }
  }
  return rows;
};

describe('D-03 FEATURE_KEY_TO_DB + verifyCostMap', () => {
  it('maps all 5 short names to canonical SC-12 names', () => {
    expect(FEATURE_KEY_TO_DB.resume).toBe('resumeAnalysis');
    expect(FEATURE_KEY_TO_DB.career).toBe('careerCompass');
    expect(FEATURE_KEY_TO_DB.linkedin).toBe('linkedinGrader');
    expect(FEATURE_KEY_TO_DB.recruiting).toBe('recruitingLens');
    expect(FEATURE_KEY_TO_DB.interview).toBe('interviewPrepCoach');
  });

  it('verifyCostMap returns ok:true on good rows', () => {
    expect(verifyCostMap(goodRows())).toEqual({ ok: true });
  });

  it('verifyCostMap catches a single drifted cell', () => {
    const rows = goodRows();
    const target = rows.find(
      (r) => r.feature === 'resume' && r.tier === 'pro',
    )!;
    target.cost = 999;
    const res = verifyCostMap(rows);
    expect(res.ok).toBe(false);
    expect(res.drift).toEqual([
      { feature: 'resume', tier: 'pro', ts: 3, db: 999 },
    ]);
  });

  it('verifyCostMap catches a missing row', () => {
    const rows = goodRows().filter(
      (r) => !(r.feature === 'career' && r.tier === 'pro'),
    );
    const res = verifyCostMap(rows);
    expect(res.ok).toBe(false);
    expect(res.missing).toContain('career/pro');
  });

  it('verifyCostMap returns both drift and missing when present', () => {
    const rows = goodRows().filter(
      (r) => !(r.feature === 'interview' && r.tier === 'elite'),
    );
    const target = rows.find(
      (r) => r.feature === 'linkedin' && r.tier === 'free',
    )!;
    target.cost = 777;
    const res = verifyCostMap(rows);
    expect(res.ok).toBe(false);
    expect(res.drift?.length).toBe(1);
    expect(res.missing).toContain('interview/elite');
  });
});
