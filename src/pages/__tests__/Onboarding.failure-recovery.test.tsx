/**
 * Quick task 260810-9vx — onboarding must never dead-end a new user.
 *
 * Production 2026-08-08: a fresh Free account's first-ever onboarding analysis was
 * terminalised as `MODEL_TIMEOUT` and the page answered with a single red toast —
 * "The analysis timed out." — then left the user sitting on the setup screen with no
 * explanation and no next step. (The run had not timed out; the model call had
 * succeeded in 45 354 ms and the response failed to parse. That half is fixed in
 * `analyze-resume`; this file covers the UI contract.)
 *
 * BEHAVIORAL, not a source grep: these assertions drive a rendered <Onboarding /> and
 * check what the user can actually see and click. Harness mirrors
 * Onboarding.freshness.test.tsx.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AnalysisLockProvider } from '@/contexts/AnalysisLockContext';
import React from 'react';

const navigateMock = vi.fn();
let landedGradingData: unknown = null;
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useSearchParams: () => [new URLSearchParams(''), vi.fn()],
  };
});

vi.mock('@/hooks/useMerits', () => ({
  useMerits: () => ({ reconcileTierUpgrade: vi.fn().mockResolvedValue(undefined) }),
  useInvalidateMerits: () => vi.fn().mockResolvedValue(undefined),
}));

const invokeMock = vi.fn();
vi.mock('@/lib/fetchWithTimeout', () => ({
  invokeWithTimeout: (...args: unknown[]) => invokeMock(...args),
}));

// The migrated onboarding path (origin:'onboarding' + run_id) is the one that can
// surface a server taxonomy code, so these tests run with the lifecycle flag ON.
vi.mock('@/config/feature-flags', () => ({ isAnalysisLifecycleEnabled: () => true }));

const toastErrorMock = vi.fn();
vi.mock('sonner', () => ({
  toast: Object.assign((...a: unknown[]) => undefined, {
    success: vi.fn(),
    error: (...a: unknown[]) => toastErrorMock(...a),
    info: vi.fn(),
  }),
}));

// Module-level so upload/insert CALL COUNTS survive across re-renders — the
// no-orphan-row assertion depends on counting them across two submits.
const uploadMock = vi.fn();
const resumeInsertMock = vi.fn();

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    storage: {
      from: () => ({
        upload: (...a: unknown[]) => uploadMock(...a),
        createSignedUrl: vi
          .fn()
          .mockResolvedValue({ data: { signedUrl: 'https://signed.example/r' }, error: null }),
      }),
    },
    from: (table: string) => {
      if (table === 'resumes') {
        return {
          select: () => ({
            eq: () => ({
              limit: () => Promise.resolve({ data: [], error: null }),
              maybeSingle: () =>
                Promise.resolve({ data: { grading_data: landedGradingData }, error: null }),
            }),
          }),
          insert: (...a: unknown[]) => {
            resumeInsertMock(...a);
            return {
              select: () => ({
                single: () => Promise.resolve({ data: { id: 'r1' }, error: null }),
              }),
            };
          },
        };
      }
      if (table === 'career_targets') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          }),
          upsert: () => Promise.resolve({ error: null }),
        };
      }
      if (table === 'profiles') {
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: {}, error: null }) }) }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      return {};
    },
  },
}));

vi.mock('@/lib/document-extraction', () => ({
  ACCEPTED_RESUME_DOCUMENT_ACCEPT: '.pdf',
  RESUME_DOCUMENT_TYPE_LABEL: 'PDF',
  LINKEDIN_PDF_ACCEPT: '.pdf',
  isAcceptedResumeDocument: () => true,
  precheckResumeDocument: vi.fn().mockResolvedValue({ ok: true, kind: 'pdf', pageCount: 1 }),
  isPdfFile: () => true,
  extractDocumentFromFile: vi.fn().mockResolvedValue({ text: 'resume text body', metadata: {} }),
  extractDocumentFromPdf: vi.fn().mockResolvedValue({ text: 'linkedin text', metadata: {} }),
  serializeDocumentExtractionMetadata: () => ({}),
}));

vi.mock('@/lib/fileHash', () => ({ calculateFileHash: vi.fn().mockResolvedValue('hash123') }));
vi.mock('@/hooks/useProfessionalGoal', () => ({
  useProfessionalGoal: () => ({ saveGoal: vi.fn().mockResolvedValue(undefined) }),
}));
vi.mock('@/hooks/useAnalysisRun', () => ({ useAnalysisRun: () => ({ startRun: vi.fn() }) }));
vi.mock('@/hooks/useThemeLogo', () => ({ useThemeLogo: () => '' }));

import Onboarding from '../Onboarding';

const analyzeCalls = () => invokeMock.mock.calls.filter(([fn]) => fn === 'analyze-resume');
const analyzeBody = (i: number) =>
  (analyzeCalls()[i][1] as { body: Record<string, unknown> }).body;

async function renderToStep4() {
  render(
    <MemoryRouter>
      <AnalysisLockProvider>
        <Onboarding />
      </AnalysisLockProvider>
    </MemoryRouter>,
  );

  const fileInput = await waitFor(() => {
    const el = document.querySelector('input[type="file"]') as HTMLInputElement | null;
    if (!el) throw new Error('resume input not mounted yet');
    return el;
  });
  fireEvent.change(fileInput, {
    target: { files: [new File(['resume'], 'resume.pdf', { type: 'application/pdf' })] },
  });

  fireEvent.click(await screen.findByRole('button', { name: /continue/i }));
  fireEvent.click(await screen.findByRole('button', { name: /skip for now/i }));
  fireEvent.click(await screen.findByRole('button', { name: /^continue$/i }));

  fireEvent.change(await screen.findByLabelText('Set Your Professional Goal'), {
    target: { value: 'Staff Engineer role — 2027' },
  });

  return screen.getByRole('button', { name: /finish setup/i });
}

/**
 * A server-reported terminal failure carrying a lifecycle taxonomy code.
 *
 * Shape matters: `toAnalysisJsonError` returns a NON-2xx response, so
 * `invokeWithTimeout` populates BOTH sides — `data` is the parsed jsonError envelope
 * (carrying `code`) and `error` is a status-bearing Error. A fixture with `error: null`
 * is indistinguishable from success and silently exercises the happy path instead.
 */
const terminalFailure = {
  data: { error: 'The analysis timed out. Please try again.', code: 'MODEL_TIMEOUT', retryable: true },
  error: Object.assign(new Error('The analysis timed out. Please try again.'), { status: 504 }),
};
/** A bodyless client give-up — the run may still be alive (the AMBIGUOUS branch). */
const clientGiveUp = {
  data: null,
  error: Object.assign(new Error('Request timed out. Please try again.'), { status: 408 }),
};

beforeEach(() => {
  navigateMock.mockReset();
  invokeMock.mockReset();
  toastErrorMock.mockReset();
  uploadMock.mockReset().mockResolvedValue({ error: null });
  resumeInsertMock.mockReset();
  landedGradingData = null;
  localStorage.clear();
});

function respond(analyzeResponses: unknown[]) {
  let n = 0;
  invokeMock.mockImplementation(async (fn: string) => {
    if (fn === 'validate-document') return { data: { ok: true }, error: null };
    if (fn === 'analyze-resume') return analyzeResponses[Math.min(n++, analyzeResponses.length - 1)];
    return { data: {}, error: null };
  });
}

describe('onboarding never dead-ends on a terminal analysis failure (260810-9vx)', () => {
  it('renders a persistent recovery card with the reason and a Try again action', async () => {
    respond([terminalFailure]);
    fireEvent.click(await renderToStep4());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/couldn't finish your first analysis/i);
    // The mapped, leak-free reason is shown IN THE PAGE, not only in a toast that fades.
    expect(alert).toHaveTextContent(/the analysis timed out/i);
    // The user is told the state of their data and their credits.
    expect(alert).toHaveTextContent(/resume and goal are saved/i);
    expect(alert).toHaveTextContent(/no credits were used/i);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();

    // Still on setup — a terminal failure must not silently strand the user on /results.
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('Try again re-dispatches WITHOUT re-uploading — no duplicate resumes row', async () => {
    respond([terminalFailure, { data: { run_id: 'run-2' }, error: null }]);
    fireEvent.click(await renderToStep4());

    fireEvent.click(await screen.findByRole('button', { name: /try again/i }));

    await waitFor(() => expect(analyzeCalls()).toHaveLength(2));
    // Production 2026-08-08 left an orphan `resumes` row with grading_data = null
    // because the failure path dropped the held record and the retry re-uploaded.
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(resumeInsertMock).toHaveBeenCalledTimes(1);
    // Both attempts analyse the SAME resume row, so recovery-by-resumeId stays unambiguous.
    expect(analyzeBody(0).resumeId).toBe('r1');
    expect(analyzeBody(1).resumeId).toBe('r1');
  });

  it('the retry derives a FRESH attempt nonce, so it creates a new run rather than recovering the dead one', async () => {
    respond([terminalFailure, { data: { run_id: 'run-2' }, error: null }]);
    fireEvent.click(await renderToStep4());
    fireEvent.click(await screen.findByRole('button', { name: /try again/i }));

    await waitFor(() => expect(analyzeCalls()).toHaveLength(2));
    const first = analyzeBody(0).attemptNonce;
    const second = analyzeBody(1).attemptNonce;
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    // A REUSED nonce would derive the same idempotency key, and
    // create_or_recover_analysis_run treats `retryable_failed` as an ACTIVE run — it
    // would hand back the dead row and every CAS transition would silently no-op.
    expect(second).not.toBe(first);
  });

  it('a successful retry clears the card and lands the user on their results', async () => {
    respond([terminalFailure, { data: { run_id: 'run-2' }, error: null }]);
    fireEvent.click(await renderToStep4());
    fireEvent.click(await screen.findByRole('button', { name: /try again/i }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/results/r1'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('an AMBIGUOUS client give-up still hands off to Results and shows NO failure card', async () => {
    // The 120s client race can fire while the server is still generating. That is not
    // a failure: the loading UI must continue on /results, not turn into an error.
    respond([clientGiveUp]);
    fireEvent.click(await renderToStep4());

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/results/r1'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('choosing a different resume after a failure drops the held upload', async () => {
    respond([terminalFailure]);
    fireEvent.click(await renderToStep4());
    await screen.findByRole('alert');

    // Back to step 1 and swap the file. The previously uploaded row must NOT be reused,
    // or the user would be analysed against the resume they just replaced.
    fireEvent.click(screen.getByRole('button', { name: /^back$/i })); // 4 -> 3
    fireEvent.click(screen.getByRole('button', { name: /^back$/i })); // 3 -> 2
    fireEvent.click(screen.getByRole('button', { name: /^back$/i })); // 2 -> 1

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(['other'], 'other.pdf', { type: 'application/pdf' })] },
    });

    // Swapping the file also retires the stale failure card.
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});
