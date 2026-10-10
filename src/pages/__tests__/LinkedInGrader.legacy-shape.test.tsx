import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { LinkedInResult, LinkedInSection } from '@/pages/LinkedInGrader';

const { fromMock, getUserMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: { getUser: getUserMock },
    from: fromMock,
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

vi.mock('@/hooks/useFeatureUsage', () => ({
  useFeatureUsage: () => ({ recordEvent: vi.fn() }),
}));

vi.mock('@/hooks/useAnalysisRun', () => ({
  useAnalysisRun: () => ({ startRun: vi.fn() }),
}));

vi.mock('@/hooks/useMerits', () => ({
  useMerits: () => ({
    isZero: false,
    canAfford: () => true,
    optimisticDeduct: () => ({ confirm: vi.fn(), rollback: vi.fn() }),
  }),
}));

vi.mock('@/hooks/useFeatureCosts', () => ({
  useFeatureCosts: () => ({ data: null }),
  getCostForFeature: () => 0,
}));

vi.mock('@/components/AnalysisComparisonModal', () => ({
  AnalysisComparisonModal: () => null,
}));

vi.mock('@/components/recommendations/RecommendationActions', () => ({
  default: () => null,
}));

vi.mock('@/components/UniversalAnalyzing', () => ({
  UniversalAnalyzing: () => null,
}));

vi.mock('@/components/MeritCostPreview', () => ({ MeritCostPreview: () => null }));
vi.mock('@/components/LowBalanceWarning', () => ({ LowBalanceWarning: () => null }));

// document-extraction transitively imports pdfjs-dist, which needs DOMMatrix (absent in jsdom).
vi.mock('@/lib/document-extraction', () => ({
  extractDocumentFromPdf: vi.fn(),
  isPdfFile: () => false,
  LINKEDIN_PDF_ACCEPT: '.pdf,application/pdf',
  serializeDocumentExtractionMetadata: () => ({}),
}));

import LinkedInGrader from '@/pages/LinkedInGrader';

let savedGrade: LinkedInResult;

function section(name: string, score: number, maxScore: number): LinkedInSection {
  return {
    name,
    score,
    maxScore,
    applicable: true,
    evidence: `${name} evidence`,
    strengths: [],
    weaknesses: [],
    improvements: [],
  };
}

function grade(rawScore: number, sectionBreakdown: LinkedInSection[]): LinkedInResult {
  return {
    rawScore,
    scoreJustification: 'Stored score justification',
    nextBestAction: {
      action: 'Tighten the profile narrative',
      reason: 'Keep visible evidence aligned.',
      expectedImpact: 'Clearer positioning',
    },
    sectionBreakdown,
    topFixes: [],
    keyStrengths: [],
  };
}

function renderSavedGrade(): void {
  render(
    <MemoryRouter>
      <LinkedInGrader />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  getUserMock.mockReset();
  fromMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  fromMock.mockImplementation((table: string) => {
    if (table === 'profiles') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { subscription_tier: 'free' }, error: null }),
          }),
        }),
      };
    }
    if (table === 'linkedin_grades') {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({
                data: [{
                  id: 'grade-1',
                  overall_score: savedGrade.rawScore,
                  grading_data: savedGrade,
                  created_at: '2026-07-10T00:00:00.000Z',
                  profile_url: null,
                }],
                error: null,
              }),
            }),
          }),
        }),
      };
    }
    if (table === 'recommendations') {
      return {
        select: () => ({
          eq: () => ({
            eq: async () => ({ data: [], error: null }),
          }),
        }),
      };
    }
    throw new Error(`Unexpected Supabase table: ${table}`);
  });
});

describe('LinkedInGrader saved result shape compatibility', () => {
  it('renders the 08.3 direct-100 grade as exactly four new section cards', async () => {
    savedGrade = grade(84, [
      section('Headline', 13, 15),
      section('About', 12, 15),
      section('Experience', 37, 45),
      section('Search Alignment, Skills & Credentials', 22, 25),
    ]);

    renderSavedGrade();

    expect(await screen.findByRole('heading', { name: 'Your LinkedIn Analysis' })).toBeInTheDocument();
    expect(screen.getByText('84')).toBeInTheDocument();
    expect(screen.getByText('/ 100')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(4);
    expect(screen.getByRole('heading', { name: 'Headline' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'About' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Experience' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Search Alignment, Skills & Credentials' })).toBeInTheDocument();
    expect(screen.getAllByText('/15')).toHaveLength(2);
    expect(screen.getByText('/45')).toBeInTheDocument();
    expect(screen.getByText('/25')).toBeInTheDocument();
  });

  it('renders a legacy 08.1 grade at its stored maximums and total without recomputing it', async () => {
    savedGrade = grade(68, [
      section('Headline', 8, 11),
      section('About', 7, 11),
      section('Experience', 12, 18),
      section('Education', 3, 4),
    ]);

    renderSavedGrade();

    expect(await screen.findByRole('heading', { name: 'Your LinkedIn Analysis' })).toBeInTheDocument();
    expect(screen.getByText('68')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(4);
    expect(screen.getByRole('heading', { name: 'Education' })).toBeInTheDocument();
    expect(screen.getAllByText('/11')).toHaveLength(2);
    expect(screen.getByText('/18')).toBeInTheDocument();
    expect(screen.getByText('/4')).toBeInTheDocument();
    await waitFor(() => expect(fromMock).toHaveBeenCalledWith('recommendations'));
  });
});
