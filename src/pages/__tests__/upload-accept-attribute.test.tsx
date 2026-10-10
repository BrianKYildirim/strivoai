import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/document-extraction', async () => {
  const limits = await import('@/config/document-limits');
  return {
    ACCEPTED_RESUME_DOCUMENT_ACCEPT:
      limits.ACCEPTED_RESUME_DOCUMENT_ACCEPT,
    RESUME_DOCUMENT_TYPE_LABEL: limits.RESUME_DOCUMENT_TYPE_LABEL,
    isAcceptedResumeDocument: () => true,
    precheckResumeDocument: vi.fn().mockResolvedValue({ ok: true, kind: 'pdf', pageCount: 1 }),
    extractDocumentFromFile: vi.fn(),
  };
});

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
    storage: { from: vi.fn() },
  },
}));

vi.mock('@/hooks/useMerits', () => ({
  useMerits: () => ({
    total: 100,
    isZero: false,
    canAfford: () => true,
  }),
  useInvalidateMerits: () => vi.fn(),
}));

vi.mock('@/hooks/useFeatureCosts', () => ({
  useFeatureCosts: () => ({ data: {} }),
  getCostForFeature: () => 1,
}));

vi.mock('@/hooks/usePaywallGuard', () => ({
  usePaywallGuard: () => ({
    canAnalyze: true,
    tier: 'elite',
    loading: false,
    modalProps: {},
    openModal: vi.fn(),
    triggerPaywall: vi.fn(),
    refresh: vi.fn().mockResolvedValue({ tier: 'elite', canAnalyze: true }),
    resetDate: null,
    analysisCount: 0,
    limit: 100,
  }),
}));

vi.mock('@/contexts/AnalysisLockContext', () => ({
  useAnalysisLock: () => ({ isLocked: false }),
}));

vi.mock('@/hooks/useAnalysisRun', () => ({
  useAnalysisRun: () => ({ isActive: false }),
}));

vi.mock('@/config/feature-flags', () => ({
  isAnalysisLifecycleEnabled: () => false,
}));

vi.mock('@/components/UniversalAnalyzing', () => ({
  UniversalAnalyzing: () => null,
}));
vi.mock('@/components/MeritCostPreview', () => ({
  MeritCostPreview: () => null,
}));
vi.mock('@/components/LowBalanceWarning', () => ({
  LowBalanceWarning: () => null,
}));
vi.mock('@/components/topup/OutOfMeritsModalV2', () => ({
  OutOfMeritsModalV2: () => null,
}));

import UploadPage from '../Upload';

describe('Upload resume picker accept contract', () => {
  it('renders the shared PDF/DOCX-only accept attribute', () => {
    const { container } = render(
      <MemoryRouter>
        <UploadPage />
      </MemoryRouter>,
    );
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');

    expect(input).not.toBeNull();
    expect(input?.getAttribute('accept')).toBe('.pdf,.docx');
  });
});
