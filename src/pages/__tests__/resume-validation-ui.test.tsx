import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MSG_PAGE_LIMIT,
  MSG_UNSUPPORTED_TYPE,
  MSG_VALIDATION_UNAVAILABLE,
} from '@/config/document-limits';

const precheckMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock('@/lib/document-extraction', async () => {
  const limits = await import('@/config/document-limits');
  return {
    ACCEPTED_RESUME_DOCUMENT_ACCEPT: limits.ACCEPTED_RESUME_DOCUMENT_ACCEPT,
    RESUME_DOCUMENT_TYPE_LABEL: limits.RESUME_DOCUMENT_TYPE_LABEL,
    extractDocumentFromFile: vi.fn(),
    precheckResumeDocument: (...args: unknown[]) => precheckMock(...args),
  };
});

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: (...args: unknown[]) => toastErrorMock(...args),
  }),
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
    storage: { from: vi.fn() },
  },
}));
vi.mock('@/lib/fetchWithTimeout', () => ({ invokeWithTimeout: vi.fn() }));
vi.mock('@/hooks/useMerits', () => ({
  useMerits: () => ({ total: 100, isZero: false, canAfford: () => true }),
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
    refresh: vi.fn(),
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
vi.mock('@/components/UniversalAnalyzing', () => ({ UniversalAnalyzing: () => null }));
vi.mock('@/components/MeritCostPreview', () => ({ MeritCostPreview: () => null }));
vi.mock('@/components/LowBalanceWarning', () => ({ LowBalanceWarning: () => null }));
vi.mock('@/components/topup/OutOfMeritsModalV2', () => ({ OutOfMeritsModalV2: () => null }));

import UploadPage from '../Upload';

const componentFiles = [
  'src/pages/Upload.tsx',
  'src/pages/Onboarding.tsx',
  'src/pages/Profile.tsx',
  'src/pages/CareerCompass.tsx',
  'src/components/MinimalHero.tsx',
  'src/components/ActionFirstHero.tsx',
] as const;
const componentSources = componentFiles.map((file) => [
  file,
  readFileSync(resolve(file), 'utf8').replace(/\r\n/g, '\n'),
] as const);

function renderUpload() {
  return render(
    <MemoryRouter>
      <UploadPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  precheckMock.mockReset();
  toastErrorMock.mockReset();
});

describe('resume validation UI contract', () => {
  it('exposes the exact helper through aria-describedby', () => {
    const { container } = renderUpload();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const helper = document.getElementById(input.getAttribute('aria-describedby')!);

    expect(helper).toHaveTextContent('PDF or DOCX files supported. Maximum 2 pages.');
    expect(screen.getByText('Drag and drop your resume here')).toBeInTheDocument();
  });

  it.each([
    ['unsupported', MSG_UNSUPPORTED_TYPE],
    ['page limit', MSG_PAGE_LIMIT],
    ['unavailable', MSG_VALIDATION_UNAVAILABLE],
  ])('clears and refocuses a rejected %s selection with exact copy', async (_name, message) => {
    precheckMock.mockResolvedValue({ ok: false, reason: 'rejected', message });
    const { container } = renderUpload();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(['bad'], 'resume.pdf', { type: 'application/pdf' });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith(message));
    await waitFor(() => expect(input).toHaveFocus());
    expect(input.value).toBe('');
    expect(screen.queryByTitle('resume.pdf')).not.toBeInTheDocument();

    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(precheckMock).toHaveBeenCalledTimes(2));
  });

  it('renders semantic busy state and disables repeat selection while validation is pending', async () => {
    let resolvePrecheck!: (value: unknown) => void;
    precheckMock.mockReturnValue(new Promise((resolve) => {
      resolvePrecheck = resolve;
    }));
    const { container } = renderUpload();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;

    fireEvent.change(input, {
      target: { files: [new File(['pdf'], 'resume.pdf', { type: 'application/pdf' })] },
    });

    expect(await screen.findByText('Validating...')).toBeInTheDocument();
    expect(input).toBeDisabled();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();

    resolvePrecheck({ ok: true, kind: 'pdf', pageCount: 2 });
    await waitFor(() => expect(screen.queryByText('Validating...')).not.toBeInTheDocument());
  });

  it('locks responsive, drag, filename, and copy contracts across all six surfaces', () => {
    for (const [file, source] of componentSources) {
      expect(source, file).toContain('precheckResumeDocument');
      expect(source, file).toContain('PDF or DOCX files supported. Maximum 2 pages.');
      expect(source, file).toContain('aria-describedby');
      expect(source, file).toContain('Validating...');
      expect(source, file).toMatch(/w-full/);
      expect(source, file).toMatch(/min-h-11|h-12/);
      expect(source, file).not.toMatch(/h-\[(?:[0-9]+)px\].*Maximum 2 pages/);
    }

    const upload = componentSources[0][1];
    const onboarding = componentSources[1][1];
    const minimalHero = componentSources[4][1];
    const actionHero = componentSources[5][1];
    for (const source of [upload, onboarding, minimalHero, actionHero]) {
      expect(source).toContain('border-primary bg-primary/10');
    }
    expect(upload).toContain('min-w-0 truncate');
    expect(onboarding).toContain('min-w-0 truncate');
    expect(componentSources[2][1]).toContain('min-w-0 truncate');
    expect(componentSources[3][1]).toContain('? resumeFile.name');
  });
});
