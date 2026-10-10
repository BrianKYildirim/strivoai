/**
 * Quick 260804-50q — Onboarding Step 4 accepts SENTENCES, behaviourally.
 *
 * Pins, against a really-rendered <Onboarding />:
 *   1. the goal control is a <textarea>, not an <input>;
 *   2. it is still capped at 500 characters (the DB CHECK from 20260712000001);
 *   3. a two-sentence value containing a newline round-trips BYTE-IDENTICALLY — the client
 *      does not rewrite, normalize or reflow the user's wording;
 *   4. the field is still REQUIRED — Finish is aria-disabled while it is blank;
 *   5. the career_targets upsert carries ONLY professional_goal + professional_goal_set_at
 *      (+ the pre-existing target columns). It never sends professional_goal_structured or
 *      any goal_readiness_* column: those are scorer-owned and the column-level GRANTs
 *      would reject them.
 *
 * COST CONTRACT: the goal never reaches an LLM. The only edge-function invoke on this path
 * is the pre-existing analyze-resume dispatch, and its body is asserted below to carry no
 * goal field at all.
 *
 * Mock harness copied from `Onboarding.freshness.test.tsx` (router mock + useMerits mock +
 * sonner mock + supabase mock), with the career_targets upsert payload captured.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AnalysisLockProvider } from '@/contexts/AnalysisLockContext';
import React from 'react';

// ── router ──────────────────────────────────────────────────────────
const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useSearchParams: () => [new URLSearchParams(''), vi.fn()],
  };
});

// ── entitlement freshness seam ──────────────────────────────────────
vi.mock('@/hooks/useMerits', () => ({
  useMerits: () => ({ reconcileTierUpgrade: vi.fn().mockResolvedValue(undefined) }),
  useInvalidateMerits: () => vi.fn().mockResolvedValue(undefined),
}));

// ── analyze-resume dispatch ─────────────────────────────────────────
const invokeMock = vi.fn();
vi.mock('@/lib/fetchWithTimeout', () => ({
  invokeWithTimeout: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock('@/config/feature-flags', () => ({ isAnalysisLifecycleEnabled: () => false }));

// ── sonner ──────────────────────────────────────────────────────────
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

// ── supabase: capture the career_targets upsert payload ─────────────
const careerTargetsUpsertMock = vi.fn();
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    storage: {
      from: () => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
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
              maybeSingle: () => Promise.resolve({ data: { grading_data: null }, error: null }),
            }),
          }),
          insert: () => ({
            select: () => ({ single: () => Promise.resolve({ data: { id: 'r1' }, error: null }) }),
          }),
        };
      }
      if (table === 'career_targets') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          }),
          upsert: (...args: unknown[]) => {
            careerTargetsUpsertMock(...args);
            return Promise.resolve({ error: null });
          },
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

// ── document extraction (no real PDF parsing in a unit test) ────────
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

/**
 * The exact shape the sentence-aware SQL parser (20260804010000) is built for: two
 * sentences, and a newline the user typed on purpose.
 */
const TWO_SENTENCES =
  'I want to secure an investment banking internship in New York in 2027, ideally at a leading global bank.\n' +
  'I want to build the experience needed to move into private equity later.';

/** Renders and walks to Step 4. Same route as Onboarding.freshness.test.tsx. */
async function renderToStep4(): Promise<HTMLTextAreaElement> {
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

  fireEvent.click(await screen.findByRole('button', { name: /continue/i })); // step 1
  fireEvent.click(await screen.findByRole('button', { name: /skip for now/i })); // step 2
  fireEvent.click(await screen.findByRole('button', { name: /^continue$/i })); // step 3

  return (await screen.findByLabelText('Set Your Professional Goal')) as HTMLTextAreaElement;
}

beforeEach(() => {
  navigateMock.mockReset();
  careerTargetsUpsertMock.mockReset();
  invokeMock.mockReset().mockImplementation(async (functionName: string) =>
    functionName === 'validate-document'
      ? { data: { ok: true }, error: null }
      : { data: {}, error: null },
  );
  localStorage.clear();
});

describe('Onboarding step 4 — sentence-friendly goal input (quick 260804-50q)', () => {
  it('renders the goal control as a TEXTAREA still capped at 500 characters', async () => {
    const goal = await renderToStep4();

    expect(goal.tagName).toBe('TEXTAREA');
    expect(goal.maxLength).toBe(500);
    // The accessible name is unchanged, so every existing selector keeps working.
    expect(goal).toHaveAttribute('aria-label', 'Set Your Professional Goal');
  });

  it('round-trips a two-sentence value with an embedded newline BYTE-IDENTICALLY', async () => {
    const goal = await renderToStep4();
    fireEvent.change(goal, { target: { value: TWO_SENTENCES } });

    // No client-side rewriting, trimming of the interior, or newline normalization.
    expect(goal.value).toBe(TWO_SENTENCES);
    expect(goal.value).toContain('\n');
    expect(goal.value.length).toBeLessThanOrEqual(500);
  });

  it('keeps the goal REQUIRED — Finish is aria-disabled while the field is blank', async () => {
    const goal = await renderToStep4();

    const finish = screen.getByRole('button', { name: /finish setup/i });
    expect(finish).toHaveAttribute('aria-disabled', 'true');

    fireEvent.change(goal, { target: { value: TWO_SENTENCES } });
    expect(screen.getByRole('button', { name: /finish setup/i })).toHaveAttribute(
      'aria-disabled',
      'false',
    );

    // Clearing it re-blocks Finish. Whitespace alone is still blank.
    fireEvent.change(goal, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: /finish setup/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('writes the trimmed raw goal and NO scorer-owned column, and sends no goal to any edge function', async () => {
    const goal = await renderToStep4();
    fireEvent.change(goal, { target: { value: `  ${TWO_SENTENCES}  ` } });

    fireEvent.click(screen.getByRole('button', { name: /finish setup/i }));

    await waitFor(() => expect(careerTargetsUpsertMock).toHaveBeenCalled());
    const [payload] = careerTargetsUpsertMock.mock.calls[0] as [Record<string, unknown>, unknown];

    // Only the ENDS are trimmed; the user's interior wording and newline survive.
    expect(payload.professional_goal).toBe(TWO_SENTENCES);
    expect(String(payload.professional_goal)).toContain('\n');
    expect(payload).toHaveProperty('professional_goal_set_at');

    // Trigger-owned columns are never client-written.
    for (const owned of [
      'professional_goal_structured',
      'goal_readiness_score',
      'goal_readiness_components',
      'goal_readiness_computed_at',
    ]) {
      expect(payload).not.toHaveProperty(owned);
    }
    expect(Object.keys(payload).some((key) => key.startsWith('goal_readiness_'))).toBe(false);

    // COST PROOF at the client seam: the goal text is not sent to any edge function.
    await waitFor(() =>
      expect(invokeMock.mock.calls.some(([fn]) => fn === 'analyze-resume')).toBe(true),
    );
    for (const [, opts] of invokeMock.mock.calls) {
      const body = (opts as { body?: Record<string, unknown> } | undefined)?.body ?? {};
      expect(body).not.toHaveProperty('professional_goal');
      expect(body).not.toHaveProperty('professionalGoal');
      expect(JSON.stringify(body)).not.toContain('private equity');
    }
  });
});
