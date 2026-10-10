import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

let mockCost: number | null | undefined = 7;
const startEliteRerun = vi.fn();

vi.mock('@/hooks/useFeatureCosts', () => ({
  useFeatureCosts: () => ({ data: [{ feature: 'resume_analysis', tier: 'elite', cost: mockCost }] }),
  getCostForFeature: () => mockCost,
}));
vi.mock('@/hooks/useEliteRerun', () => ({
  useEliteRerun: () => ({ startEliteRerun, isStarting: false, error: null }),
}));
vi.mock('@/components/MeritCostPreview', () => ({ MeritCostPreview: () => null }));

import { EliteRerunCta } from '@/components/EliteRerunCta';

function renderCta(
  analyzed_tier: 'free' | 'elite' | null,
  userTier: string,
  props: Partial<Parameters<typeof EliteRerunCta>[0]> = {},
) {
  const sourceResume = { id: 'r1', analyzed_tier } as Parameters<typeof EliteRerunCta>[0]['sourceResume'];
  return render(
    <MemoryRouter>
      <EliteRerunCta sourceResume={sourceResume} userTier={userTier} {...props} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockCost = 7;
  startEliteRerun.mockClear();
});

describe('EliteRerunCta tier and state matrix', () => {
  it("Free result + Elite account renders approved database-priced unlock copy", () => {
    renderCta('free', 'elite');
    expect(screen.getByText('Unlock the rest of your Elite analysis')).toBeInTheDocument();
    expect(screen.getByText(/Your existing Free analysis won’t change/)).toBeInTheDocument();
    expect(screen.getByText('Unlock Elite insights — 7 merits')).toBeInTheDocument();
    expect(screen.queryByText('Unlock Elite insights — 3 merits')).toBeNull();
  });

  it("raw pro account normalizes to Elite and renders the unlock", () => {
    renderCta('free', 'pro');
    expect(screen.getByText('Unlock Elite insights — 7 merits')).toBeInTheDocument();
  });

  it('Elite-complete result and Free account render no unlock', () => {
    const complete = renderCta('elite', 'elite');
    expect(complete.container).toBeEmptyDOMElement();
    complete.unmount();
    const free = renderCta('free', 'free');
    expect(free.container).toBeEmptyDOMElement();
  });

  it('unknown analyzed tier preserves the neutral non-charging path', () => {
    renderCta(null, 'elite');
    expect(screen.getByText(/Tier of this analysis isn't recorded/)).toBeInTheDocument();
    expect(screen.queryByText(/Unlock Elite insights/)).toBeNull();
  });

  it('null cost hides charging action and undefined cost disables loading affordance', () => {
    mockCost = null;
    const unavailable = renderCta('free', 'elite');
    expect(unavailable.container).toBeEmptyDOMElement();
    unavailable.unmount();
    mockCost = undefined;
    renderCta('free', 'elite');
    expect(screen.getByText('Loading pricing…')).toBeDisabled();
  });

  it('backgrounded run shows the approved disabled inline status', () => {
    renderCta('free', 'elite', { unlockStatus: 'running', backgrounded: true });
    expect(screen.getByText('Unlocking Elite insights…')).toBeDisabled();
  });

  it('generic, conflict, and missing-text failures use approved message/action pairs', () => {
    const generic = renderCta('free', 'elite', { unlockStatus: 'error', unlockError: 'elite_unlock_failed' });
    expect(screen.getByText('We couldn’t unlock the Elite insights. Your Free analysis is unchanged.')).toBeInTheDocument();
    expect(screen.getByText('Try again')).toBeInTheDocument();
    generic.unmount();

    const conflict = renderCta('free', 'elite', { unlockStatus: 'error', unlockError: 'fresh_analysis_required' });
    expect(screen.getByText('This resume has changed, so it needs a new full analysis.')).toBeInTheDocument();
    expect(screen.getByText('Analyze updated resume')).toBeInTheDocument();
    conflict.unmount();

    renderCta('free', 'elite', { unlockStatus: 'error', unlockError: 'stored_text_unavailable' });
    expect(screen.getByText('This resume’s text isn’t stored. Upload it again to create a new Elite analysis.')).toBeInTheDocument();
    expect(screen.getByText('Upload resume')).toBeInTheDocument();
  });
});

describe('Phase 04 Results and design contracts', () => {
  const ctaSource = readFileSync(resolve('src/components/EliteRerunCta.tsx'), 'utf8');
  const resultsSource = readFileSync(resolve('src/pages/Results.tsx'), 'utf8').replace(/\r\n/g, '\n');

  it('uses semantic tokens and no raw color literals in the CTA', () => {
    expect(ctaSource).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    expect(ctaSource).not.toMatch(/(?:text|bg|border)-(?:red|blue|green|yellow|purple|pink|indigo|gray|slate|zinc|emerald|amber|orange|teal|cyan|violet)-\d{2,3}/);
  });

  it('keeps data-tier reconciliation and mounts the CTA after Strengths', () => {
    expect(resultsSource).toContain("const showFullResults = analyzedTier ? analyzedTier !== 'free' : userTier !== 'free';");
    expect(resultsSource.indexOf('{/* Strengths */}')).toBeLessThan(resultsSource.indexOf('<EliteRerunCta'));
    expect(resultsSource.indexOf('<EliteRerunCta')).toBeLessThan(resultsSource.indexOf('{/* Priority Improvements Section */}'));
  });

  it('uses the approved overlay and one success announcement', () => {
    expect(resultsSource).toContain("'Unlocking Elite insights'");
    expect(resultsSource).toContain("toast.success('Elite insights unlocked.')");
    expect(resultsSource.match(/Elite insights unlocked\./g)).toHaveLength(1);
  });
});
