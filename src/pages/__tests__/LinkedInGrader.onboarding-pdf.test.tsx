import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { fromMock, getUserMock, profileData, profileSelectMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getUserMock: vi.fn(),
  profileData: { current: null as Record<string, unknown> | null },
  profileSelectMock: vi.fn(),
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
    optimisticDeduct: () => ({ commit: vi.fn(), rollback: vi.fn() }),
  }),
}));

vi.mock('@/hooks/useFeatureCosts', () => ({
  useFeatureCosts: () => ({ data: null }),
  getCostForFeature: () => 0,
}));

vi.mock('@/hooks/useSubmitGuard', () => ({
  useSubmitGuard: () => ({
    isSubmitting: false,
    beginSubmit: vi.fn().mockReturnValue(null),
    endSubmit: vi.fn(),
  }),
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
vi.mock('@/lib/platform/capabilities', () => ({ isAiBlocked: () => false }));

vi.mock('@/lib/document-extraction', () => ({
  extractDocumentFromPdf: vi.fn(),
  isPdfFile: (file: File) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'),
  LINKEDIN_PDF_ACCEPT: '.pdf,application/pdf',
  serializeDocumentExtractionMetadata: () => ({}),
}));

import LinkedInGrader from '@/pages/LinkedInGrader';

function setupSupabase(): void {
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  fromMock.mockImplementation((table: string) => {
    if (table === 'profiles') {
      return {
        select: (columns: string) => {
          profileSelectMock(columns);
          return {
            eq: () => ({
              single: async () => ({ data: profileData.current, error: null }),
            }),
          };
        },
      };
    }
    if (table === 'linkedin_grades') {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      };
    }
    throw new Error(`Unexpected Supabase table: ${table}`);
  });
}

function renderGrader() {
  return render(
    <MemoryRouter>
      <LinkedInGrader />
    </MemoryRouter>,
  );
}

describe('LinkedInGrader onboarding PDF selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    profileData.current = null;
    setupSupabase();
  });

  it('selects the persisted onboarding LinkedIn PDF on immediate and later visits and allows replacement', async () => {
    profileData.current = {
      subscription_tier: 'free',
      linkedin_pdf_content: 'Persisted LinkedIn profile content from onboarding.'.repeat(4),
      linkedin_pdf_filename: 'onboarding-linkedin.pdf',
    };

    const firstVisit = renderGrader();

    expect(await screen.findByText('onboarding-linkedin.pdf')).toBeInTheDocument();
    expect(screen.getByText('Click to choose a different PDF')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get Personalized Analysis' })).toHaveAttribute('aria-disabled', 'false');

    const fileInput = firstVisit.container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    fireEvent.change(fileInput!, {
      target: { files: [new File(['replacement'], 'replacement-linkedin.pdf', { type: 'application/pdf' })] },
    });
    expect(await screen.findByText('replacement-linkedin.pdf')).toBeInTheDocument();

    firstVisit.unmount();
    renderGrader();
    expect(await screen.findByText('onboarding-linkedin.pdf')).toBeInTheDocument();
  });

  it('keeps the grader empty when onboarding has no LinkedIn PDF and never queries a resume source', async () => {
    profileData.current = { subscription_tier: 'free' };

    renderGrader();

    expect(await screen.findByText('Drag and drop your LinkedIn PDF here')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get Personalized Analysis' })).toHaveAttribute('aria-disabled', 'true');
    await waitFor(() => {
      expect(profileSelectMock).toHaveBeenCalledWith(
        'subscription_tier, linkedin_pdf_content, linkedin_pdf_filename',
      );
    });
    expect(profileSelectMock.mock.calls.flat().join(' ')).not.toMatch(/resume/i);
  });
});
