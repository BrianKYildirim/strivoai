/**
 * Quick 260718-j2x — Onboarding entitlement-freshness BEHAVIORAL guard.
 *
 * Bug: a user who upgrades to Elite mid-onboarding then clicks Finish gets a free-depth
 * analysis. Root cause is entitlement FRESHNESS — the analyze-resume edge resolves tier
 * authoritatively from profiles.subscription_tier and discards any client tier ("never trust
 * rawBody.tier"), but that row can still read `free` at the instant Finish runs because the
 * Stripe webhook has not propagated. The fix refreshes + AWAITS the entitlement read path
 * before dispatching analysis, restores a continuous spinner, and guards duplicate submits.
 *
 * The 11 validation scenarios split across two layers:
 *
 *   Backend tier-authority (scenarios 1-4) — decided by `resolvedTier` in analyze-resume from
 *   profiles.subscription_tier: (1) free analysis has locks/paywalls, (2) Elite full analysis,
 *   (3) Elite full improvements+criteria, (4) Elite no locks. These are proven by the EXISTING
 *   analyze-resume Deno suite (the "never trust rawBody.tier" contract), NOT re-implemented
 *   here. This file's only backend-facing assertion is that the client sends NO `tier` field
 *   in the invoke body, so the server's authoritative read is the sole tier source.
 *
 *   Frontend behavior (scenarios 5-11) — asserted below against a rendered <Onboarding />.
 *
 * Modeled on Dashboard.test.tsx (router searchParams mock + useMerits/reconcileTierUpgrade
 * mock + sonner mock + supabase mock).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AnalysisLockProvider } from '@/contexts/AnalysisLockContext';
import React from 'react';

// ── router mock: control searchParams + capture navigate ────────────
const navigateMock = vi.fn();
let searchString = '';
// first-attempt-reliability: drives the onboardingResultLanded recovery read of
// resumes.grading_data. null = nothing landed; an object = a result landed despite a give-up.
let landedGradingData: unknown = null;
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useSearchParams: () => [new URLSearchParams(searchString), vi.fn()],
  };
});

// ── entitlement freshness seam (the unit under test) ────────────────
const reconcileTierUpgradeMock = vi.fn().mockResolvedValue(undefined);
const invalidateMeritsMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/useMerits', () => ({
  useMerits: () => ({ reconcileTierUpgrade: reconcileTierUpgradeMock }),
  useInvalidateMerits: () => invalidateMeritsMock,
}));

// ── analyze-resume dispatch ─────────────────────────────────────────
const invokeMock = vi.fn();
vi.mock('@/lib/fetchWithTimeout', () => ({
  invokeWithTimeout: (...args: unknown[]) => invokeMock(...args),
}));

// ── lifecycle flag: dormant (100% of traffic) by default; toggled per test ──
let lifecycleEnabled = false;
vi.mock('@/config/feature-flags', () => ({
  isAnalysisLifecycleEnabled: () => lifecycleEnabled,
}));

// ── sonner ──────────────────────────────────────────────────────────
const toastMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
vi.mock('sonner', () => ({
  toast: Object.assign((...a: unknown[]) => toastMock(...a), {
    success: (...a: unknown[]) => toastSuccessMock(...a),
    error: (...a: unknown[]) => toastErrorMock(...a),
    info: vi.fn(),
  }),
}));

// ── supabase: satisfy checkExistingOnboarding + the FULL Finish path ─
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
          // Two readers share `select`: checkExistingOnboarding (`.eq().limit()` — no existing
          // resume, normal flow from step 1) and onboardingResultLanded (`.eq().maybeSingle()`
          // — the give-up recovery read of grading_data).
          select: () => ({
            eq: () => ({
              limit: () => Promise.resolve({ data: [], error: null }),
              maybeSingle: () =>
                Promise.resolve({ data: { grading_data: landedGradingData }, error: null }),
            }),
          }),
          // Finish path: insert returns the new resume id used for /results/:id.
          insert: () => ({
            select: () => ({ single: () => Promise.resolve({ data: { id: 'r1' }, error: null }) }),
          }),
        };
      }
      if (table === 'career_targets') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
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

// ── other hooks Onboarding pulls in ─────────────────────────────────
const saveGoalMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/useProfessionalGoal', () => ({ useProfessionalGoal: () => ({ saveGoal: saveGoalMock }) }));

const startRunMock = vi.fn();
vi.mock('@/hooks/useAnalysisRun', () => ({ useAnalysisRun: () => ({ startRun: startRunMock }) }));

vi.mock('@/hooks/useThemeLogo', () => ({ useThemeLogo: () => '' }));

import { setPendingUpgrade, getPendingUpgrade } from '@/lib/pendingUpgrade';
import Onboarding from '../Onboarding';

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const analyzeInvocations = () =>
  invokeMock.mock.calls.filter(([functionName]) => functionName === 'analyze-resume');

async function renderToStep4() {
  render(
    <MemoryRouter>
      <AnalysisLockProvider>
        <Onboarding />
      </AnalysisLockProvider>
    </MemoryRouter>,
  );

  // Step 1: wait for checkExistingOnboarding to settle, then upload a resume.
  const fileInput = await waitFor(() => {
    const el = document.querySelector('input[type="file"]') as HTMLInputElement | null;
    if (!el) throw new Error('resume input not mounted yet');
    return el;
  });
  const file = new File(['resume'], 'resume.pdf', { type: 'application/pdf' });
  fireEvent.change(fileInput, { target: { files: [file] } });

  // Step 1 -> 2 -> 3 -> 4.
  fireEvent.click(await screen.findByRole('button', { name: /continue/i })); // step 1
  fireEvent.click(await screen.findByRole('button', { name: /skip for now/i })); // step 2
  fireEvent.click(await screen.findByRole('button', { name: /^continue$/i })); // step 3

  // Step 4: set the required professional goal so Finish enables.
  const goalInput = await screen.findByLabelText('Set Your Professional Goal');
  fireEvent.change(goalInput, { target: { value: 'Elite Product Manager role — 2027' } });

  return screen.getByRole('button', { name: /finish setup/i });
}

beforeEach(() => {
  navigateMock.mockReset();
  reconcileTierUpgradeMock.mockReset().mockResolvedValue(undefined);
  invalidateMeritsMock.mockReset().mockResolvedValue(undefined);
  invokeMock.mockReset().mockImplementation(async (functionName: string) =>
    functionName === 'validate-document'
      ? { data: { ok: true }, error: null }
      : { data: {}, error: null });
  toastMock.mockReset();
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
  startRunMock.mockReset();
  saveGoalMock.mockReset().mockResolvedValue(undefined);
  searchString = '';
  lifecycleEnabled = false;
  landedGradingData = null; // first-attempt-reliability: nothing landed by default
  localStorage.clear(); // H-01: isolate the pending-upgrade signal between tests
});

describe('Onboarding entitlement freshness (quick 260718-j2x)', () => {
  // Scenarios 1-4 (backend tier authority) are proven by the existing analyze-resume Deno
  // suite. Here we only pin the client contract that makes that authority the SOLE source of
  // truth: the invoke body carries NO tier field.
  it('sends NO client tier field in the analyze-resume invoke body (server tier authority is sole source) [maps backend scenarios 1-4]', async () => {
    searchString = ''; // common path
    const finish = await renderToStep4();
    fireEvent.click(finish);

    await waitFor(() => expect(analyzeInvocations()).toHaveLength(1));
    const [fnName, opts] = analyzeInvocations()[0];
    expect(fnName).toBe('analyze-resume');
    const invokeBody = (opts as { body: Record<string, unknown> }).body;
    expect(invokeBody).not.toHaveProperty('tier');
    expect(invokeBody).toMatchObject({ resumeText: 'resume text body', resumeId: 'r1', userId: 'u1' });
  });

  // Scenario 5: upgrade-during-onboarding — refreshed entitlement used. With ?checkout=complete
  // the bounded reconcileTierUpgrade runs exactly once and is AWAITED before the invoke.
  it('scenario 5: with ?checkout=complete, reconcileTierUpgrade runs once and is awaited before invoke', async () => {
    searchString = '?checkout=complete';
    const gate = deferred();
    reconcileTierUpgradeMock.mockImplementation(() => gate.promise);

    const finish = await renderToStep4();
    fireEvent.click(finish);

    // The flow reaches the freshness step and blocks there.
    await waitFor(() => expect(reconcileTierUpgradeMock).toHaveBeenCalledTimes(1));
    // Scenario 6: stale-free cannot cause a free analysis — the invoke has NOT fired while the
    // reconcile promise is unresolved (entitlement still being refreshed).
    expect(analyzeInvocations()).toHaveLength(0);

    // Once the upgraded tier lands, dispatch proceeds.
    gate.resolve();
    await waitFor(() => expect(analyzeInvocations()).toHaveLength(1));
    expect(reconcileTierUpgradeMock).toHaveBeenCalledTimes(1);
  });

  // Scenario 6 (explicit): the analyze-resume invoke does not fire until the reconcile resolves.
  it('scenario 6: invoke is gated behind the awaited freshness resolve (no dispatch on stale entitlement)', async () => {
    searchString = '?checkout=complete';
    const gate = deferred();
    reconcileTierUpgradeMock.mockImplementation(() => gate.promise);

    const finish = await renderToStep4();
    fireEvent.click(finish);

    await waitFor(() => expect(reconcileTierUpgradeMock).toHaveBeenCalled());
    // Give any queued microtasks a chance — invoke must STILL be absent.
    await Promise.resolve();
    expect(analyzeInvocations()).toHaveLength(0);

    gate.resolve();
    await waitFor(() => expect(analyzeInvocations()).toHaveLength(1));
  });

  // Scenarios 7 & 8: the spinner appears immediately on click (free and Elite alike — the
  // client sends no tier, so the two are the SAME client path). The button flips to the
  // disabled "Setting up..." state synchronously, before any await settles.
  it('scenarios 7 & 8: the Finish button shows the "Setting up..." spinner immediately on click', async () => {
    searchString = '?checkout=complete';
    const gate = deferred();
    reconcileTierUpgradeMock.mockImplementation(() => gate.promise); // hold in-flight

    const finish = await renderToStep4();
    fireEvent.click(finish);

    const spinning = await screen.findByRole('button', { name: /setting up/i });
    expect(spinning).toHaveAttribute('aria-disabled', 'true');

    gate.resolve();
  });

  // Scenario 9: no duplicate submit. Two synchronous clicks (before the disabled state
  // re-renders) result in the analyze-resume invoke firing at most once (re-entrancy guard).
  it('scenario 9: a rapid double-click submits the analysis at most once', async () => {
    searchString = ''; // common path (invalidateMerits)
    const gate = deferred();
    invalidateMeritsMock.mockImplementation(() => gate.promise); // hold at freshness

    const finish = await renderToStep4();
    fireEvent.click(finish);
    fireEvent.click(finish); // second fire while the first is committed in-flight

    await waitFor(() => expect(invalidateMeritsMock).toHaveBeenCalled());
    gate.resolve();

    await waitFor(() => expect(analyzeInvocations()).toHaveLength(1));
    expect(analyzeInvocations()).toHaveLength(1);
  });

  // Scenario 10: spinner persists through the freshness step; on a GENUINE terminal failure
  // (a non-retryable taxonomy code — the server failed + refunded) the specific failure toast
  // fires and the spinner is released WITHOUT navigating (first-attempt-reliability direction 2,
  // terminal branch; hard constraint: a genuine terminal failure is never masked).
  it('scenario 10: on a genuine terminal failure (non-retryable code) the failure toast fires and the flow does NOT navigate (spinner released)', async () => {
    lifecycleEnabled = true; // lifecycle branch owns the pre-navigate terminal-failure guard
    searchString = '?checkout=complete';
    landedGradingData = null; // nothing landed → recovery read fails → terminal handling
    invokeMock.mockImplementation(async (functionName: string) =>
      functionName === 'validate-document'
        ? { data: { ok: true }, error: null }
        : {
          data: { error: 'x', code: 'MODEL_OUTPUT_TRUNCATED' },
          error: { status: 500 },
        });

    const finish = await renderToStep4();
    fireEvent.click(finish);

    await waitFor(() => expect(analyzeInvocations()).toHaveLength(1));
    await waitFor(() =>
      // The specific, mapped (leak-free) message — NOT the old generic "couldn't finish" copy.
      expect(toastErrorMock.mock.calls.some((c) => /incomplete/i.test(String(c[0])))).toBe(true),
    );
    expect(navigateMock).not.toHaveBeenCalledWith('/results/r1');
    // Spinner released — the Finish button is back (not stuck on "Setting up...").
    await waitFor(() => expect(screen.getByRole('button', { name: /finish setup/i })).toBeEnabled());
  });

  // Production regression 2026-07-28: MODEL_TIMEOUT is taxonomy-retryable for a NEW
  // deliberate attempt, but this HTTP 500 response is still terminal for the attempt that
  // just ran — runAnalysisLifecycle has already invoked refundAndFail. It must not be handed
  // to Results without a run_id, where the grading_data-only poll would look alive forever.
  it('scenario 10a: a server-reported MODEL_TIMEOUT is surfaced after refund instead of navigating to an untracked 95% state', async () => {
    lifecycleEnabled = true;
    searchString = '';
    landedGradingData = null;
    invokeMock.mockImplementation(async (functionName: string) =>
      functionName === 'validate-document'
        ? { data: { ok: true }, error: null }
        : {
          data: { error: 'Failed to analyze resume. Please try again.', code: 'MODEL_TIMEOUT' },
          error: { status: 500 },
        });

    const finish = await renderToStep4();
    fireEvent.click(finish);

    await waitFor(() => expect(analyzeInvocations()).toHaveLength(1));
    await waitFor(() =>
      expect(toastErrorMock.mock.calls.some((c) => /timed out/i.test(String(c[0])))).toBe(true),
    );
    expect(navigateMock).not.toHaveBeenCalledWith('/results/r1');
    await waitFor(() => expect(screen.getByRole('button', { name: /finish setup/i })).toBeEnabled());
  });

  // Scenario 10b (first-attempt-reliability direction 2, ALIVE branch): a client give-up (408)
  // with nothing landed yet is NOT a terminal failure — the run may still be alive. The flow
  // hands off to Results (navigate) and shows NO failure toast (the false "server error" bug).
  it('scenario 10b: an ambiguous client give-up (408) recovers to Results WITHOUT a failure toast', async () => {
    lifecycleEnabled = true;
    searchString = '';
    landedGradingData = null; // nothing landed; run may still be generating server-side
    invokeMock.mockImplementation(async (functionName: string) =>
      functionName === 'validate-document'
        ? { data: { ok: true }, error: null }
        : { data: null, error: { status: 408, message: 'Request timed out' } });

    const finish = await renderToStep4();
    fireEvent.click(finish);

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/results/r1'));
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  // Scenario 10c (first-attempt-reliability direction 2, LANDED branch): a result that LANDED
  // in resumes.grading_data despite a client give-up is recovered — navigate to Results, NO
  // failure toast over the top of an already-charged, successful analysis.
  it('scenario 10c: a result that LANDED despite a give-up recovers to Results (no failure toast)', async () => {
    lifecycleEnabled = true;
    searchString = '';
    landedGradingData = { overallScore: 80 }; // the save landed around the give-up moment
    invokeMock.mockImplementation(async (functionName: string) =>
      functionName === 'validate-document'
        ? { data: { ok: true }, error: null }
        : { data: null, error: { status: 408 } });

    const finish = await renderToStep4();
    fireEvent.click(finish);

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/results/r1'));
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  // Scenario 11: no regression. Without ?checkout=complete the full 10s poll is NOT used —
  // reconcileTierUpgrade is never called, invalidateMerits is awaited once, and the dormant
  // path navigates to /results/:id.
  it('scenario 11: no checkout signal -> no reconcile poll, single awaited invalidate, dormant navigate fires', async () => {
    searchString = '';
    lifecycleEnabled = false; // dormant (100% of traffic)

    const finish = await renderToStep4();
    fireEvent.click(finish);

    await waitFor(() => expect(analyzeInvocations()).toHaveLength(1));
    expect(reconcileTierUpgradeMock).not.toHaveBeenCalled();
    expect(invalidateMeritsMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/results/r1'));
  });

  // H-01 (review amendment): the REACHABLE upgrade signal is the pending-upgrade flag, not
  // ?checkout=complete (Stripe never returns to /onboarding). With the flag set and NO checkout
  // param, the real DB-waiting poll must still run — awaited before invoke, passed the expected
  // tier (M-01: stop-on-match, not stop-on-change), and the flag cleared afterward.
  it('H-01: a pending-upgrade flag (no ?checkout) still gates the awaited reconcile poll with the expected tier, then clears it', async () => {
    searchString = ''; // reachable path — NO checkout param
    setPendingUpgrade('elite');

    const gate = deferred();
    reconcileTierUpgradeMock.mockImplementation(() => gate.promise);

    const finish = await renderToStep4();
    fireEvent.click(finish);

    // Poll runs (gated on the flag) and blocks dispatch until the tier is confirmed.
    await waitFor(() => expect(reconcileTierUpgradeMock).toHaveBeenCalledTimes(1));
    expect(reconcileTierUpgradeMock).toHaveBeenCalledWith('elite'); // M-01: stop-on-match target
    expect(invalidateMeritsMock).not.toHaveBeenCalled();
    expect(analyzeInvocations()).toHaveLength(0);

    gate.resolve();
    await waitFor(() => expect(analyzeInvocations()).toHaveLength(1));
    // One-shot signal consumed.
    expect(getPendingUpgrade()).toBeNull();
  });
});
