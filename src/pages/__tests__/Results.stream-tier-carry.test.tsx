import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// 260724-2iv — regression guard for the STALE analyzed_tier that survives the Results
// stream-completion merge.
//
// The `resumes` row is read on mount, BEFORE the server writes analyzed_tier for a fresh
// streaming run, so the local copy holds `analyzed_tier: null`. The completion branch merges
// only overall_score + grading_data, so the stale null survives and EliteRerunCta renders the
// D-4 "pre-upgrade record" line over a brand-new Elite result.
//
// D-4 (LOCKED) is preserved: an HONEST null from the DB must still render that neutral,
// non-charging line. This file proves both halves — the stale null is corrected from the
// server-written column, and the honest null is left alone.

let mockCost: number | null | undefined = 7;
const startEliteRerun = vi.fn();

vi.mock('@/hooks/useFeatureCosts', () => ({
  useFeatureCosts: () => ({ data: [{ feature: 'resume_analysis', tier: 'elite', cost: mockCost }] }),
  getCostForFeature: () => mockCost,
}));
vi.mock('@/hooks/useEliteRerun', () => ({
  useEliteRerun: () => ({ startEliteRerun, isStarting: false, error: null }),
  clearEliteRerunLeaseByNewResumeId: () => {},
}));
vi.mock('@/components/MeritCostPreview', () => ({ MeritCostPreview: () => null }));

import { EliteRerunCta } from '@/components/EliteRerunCta';
import { applyAuthoritativeTier } from '@/pages/Results';

beforeEach(() => {
  mockCost = 7;
  startEliteRerun.mockClear();
});

// ── Group A — the pure merge helper ────────────────────────────────────────────────────────
describe('applyAuthoritativeTier merges only the SERVER-written analyzed_tier', () => {
  it('fresh Elite row: the stale null is replaced and every other field is preserved', () => {
    const grading = { overallScore: 88 };
    const prev = { id: 'r1', analyzed_tier: null, grading_data: grading };
    const next = applyAuthoritativeTier(prev, { data: { analyzed_tier: 'elite' }, error: null });

    expect(next.analyzed_tier).toBe('elite');
    expect(next.id).toBe('r1');
    expect(next.grading_data).toBe(grading);
  });

  it('genuine pre-upgrade row: an honest NULL from the DB stays NULL (D-4)', () => {
    const prev = { id: 'r1', analyzed_tier: null, grading_data: {} };
    const next = applyAuthoritativeTier(prev, { data: { analyzed_tier: null }, error: null });

    expect(next.analyzed_tier).toBeNull();
  });

  it('failed read: prev is returned untouched — no fabricated tier', () => {
    const prev = { id: 'r1', analyzed_tier: 'elite', grading_data: {} };
    const next = applyAuthoritativeTier(prev, { data: null, error: new Error('boom') });

    expect(next).toBe(prev);
    expect(next.analyzed_tier).toBe('elite');
  });

  it('row not visible (no data, no error): prev is returned untouched', () => {
    const prev = { id: 'r1', analyzed_tier: 'elite', grading_data: {} };
    const next = applyAuthoritativeTier(prev, { data: null, error: null });

    expect(next).toBe(prev);
    expect(next.analyzed_tier).toBe('elite');
  });

  it('prev == null: nothing is materialized from nothing', () => {
    expect(applyAuthoritativeTier(null, { data: { analyzed_tier: 'elite' }, error: null })).toBeNull();
  });

  it('takes exactly two arguments — there is no user/subscription tier fallback', () => {
    expect(applyAuthoritativeTier.length).toBe(2);
  });
});

// ── Group B — the rendered consequence via EliteRerunCta ───────────────────────────────────
describe('EliteRerunCta after the authoritative tier merge', () => {
  function renderCta(sourceResume: unknown, userTier: string) {
    return render(
      <MemoryRouter>
        <EliteRerunCta
          sourceResume={sourceResume as Parameters<typeof EliteRerunCta>[0]['sourceResume']}
          userTier={userTier}
        />
      </MemoryRouter>,
    );
  }

  it('fresh Elite run: no unknown-tier line and no Elite upsell', () => {
    const merged = applyAuthoritativeTier(
      { id: 'r1', analyzed_tier: null, grading_data: {} },
      { data: { analyzed_tier: 'elite' }, error: null },
    );
    renderCta(merged, 'elite');

    expect(screen.queryByText(/Tier of this analysis isn't recorded/)).toBeNull();
    expect(screen.queryByText(/Unlock Elite insights/)).toBeNull();
  });

  it('genuine pre-upgrade row: the neutral unknown-tier line still renders (D-4 preserved)', () => {
    const merged = applyAuthoritativeTier(
      { id: 'r1', analyzed_tier: null, grading_data: {} },
      { data: { analyzed_tier: null }, error: null },
    );
    renderCta(merged, 'elite');

    expect(screen.getByText(/Tier of this analysis isn't recorded/)).toBeInTheDocument();
    expect(screen.queryByText(/Unlock Elite insights —/)).toBeNull();
  });
});

// ── Group C — source pin on the wiring (drift guard) ───────────────────────────────────────
describe('Results.tsx re-reads the authoritative analyzed_tier after stream completion', () => {
  const resultsSource = readFileSync(resolve('src/pages/Results.tsx'), 'utf8').replace(/\r\n/g, '\n');

  it("re-reads authoritative tier, grading data, and score from the same row", () => {
    expect(resultsSource).toContain("select('analyzed_tier, grading_data, overall_score')");
    expect(resultsSource).toContain(".eq('id', id)");
  });

  it('routes the re-read through the pure helper', () => {
    expect(resultsSource).toContain('applyAuthoritativeTier(');
  });
});
