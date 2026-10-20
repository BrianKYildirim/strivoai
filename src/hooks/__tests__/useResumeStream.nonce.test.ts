/**
 * Quick task 260723-2b0 · Task 5 (D-3) — attemptNonce threading guard.
 *
 * THE DEFECT THIS PINS. `Upload.tsx:217` mints a fresh `attemptNonce` per deliberate
 * submit and writes it into `sessionStorage['stream_params_<id>']`, but `StreamParams`
 * did not declare the field and the streaming invoke body never forwarded it. The edge
 * function (`analyze-resume/index.ts:1517-1519`) therefore fell through to
 * `crypto.randomUUID()` SERVER-SIDE on every single request, so every retry of the same
 * attempt derived a DIFFERENT `deriveIdempotencyKey` and `check_and_deduct_merits` never
 * saw `already_deducted` — each retry charged again.
 *
 * This is the same shape as the CareerCompass production incident recorded in
 * `src/pages/__tests__/CareerCompass.recovery.test.tsx:47-59` (one Elite user charged 8x,
 * -24 merits, for a single usable result). The resume streaming path had the identical
 * hole.
 *
 * The contract: same nonce + same content ⇒ same derived idempotency key ⇒ exactly ONE
 * charge no matter how many times the attempt is retried. A FRESH nonce is the
 * deliberate-new-run signal.
 *
 * These are behavioral tests against a mocked `fetch`, not source greps: they read the
 * actual JSON request body the hook puts on the wire.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// ── mocks ──────────────────────────────────────────────────────────
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { access_token: 'test-token' } } }),
    },
  },
}));

vi.mock('@/hooks/useMerits', () => ({
  useMerits: () => ({
    optimisticDeduct: () => ({ commit: () => {}, rollback: () => {} }),
    invalidate: () => {},
  }),
}));

vi.mock('@/hooks/useAnalysisRun', () => ({
  useAnalysisRun: () => ({ startRun: () => {} }),
}));

vi.mock('@/lib/perf', () => ({
  perf: { start: () => ({}), mark: () => {}, end: () => {} },
}));

vi.mock('sonner', () => ({
  toast: { error: () => {}, success: () => {}, message: () => {} },
}));

import { useResumeStream, type StreamParams } from '../useResumeStream';

// ── helpers ────────────────────────────────────────────────────────
const fetchMock = vi.fn();

/** A Response whose SSE body closes immediately — enough to reach the fetch call. */
function emptyStreamResponse(): Response {
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: () => Promise.resolve({ done: true, value: undefined }),
        releaseLock: () => {},
      }),
    },
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  } as unknown as Response;
}

function baseParams(overrides: Partial<StreamParams> = {}): StreamParams {
  return {
    resumeId: 'resume-1',
    resumeText: 'x'.repeat(120),
    userId: 'user-1',
    tier: 'elite',
    previousSuggestions: [],
    previousScore: null,
    ...overrides,
  };
}

/** Renders the hook and returns the parsed JSON body the hook POSTed. */
async function capturePostedBody(params: StreamParams): Promise<Record<string, unknown>> {
  renderHook(() => useResumeStream(params));
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  const [, init] = fetchMock.mock.calls[0];
  return JSON.parse((init as RequestInit).body as string);
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(emptyStreamResponse());
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── tests ──────────────────────────────────────────────────────────
describe('useResumeStream · attemptNonce threading (Task 5 / D-3)', () => {
  it('forwards the attemptNonce from StreamParams into the analyze-resume request body', async () => {
    const body = await capturePostedBody(
      baseParams({ attemptNonce: 'nonce-abc-123' }),
    );

    // THE assertion. Without this the edge mints its own UUID per request and every
    // retry of the same attempt derives a new idempotency key → a new charge.
    expect(body.attemptNonce).toBe('nonce-abc-123');
  });

  it('sends the SAME nonce on a retry of the same attempt (one attempt = one charge)', async () => {
    // `_retryKey` is the hook's re-run signal. The nonce must survive it verbatim —
    // that identity is what makes check_and_deduct_merits return already_deducted
    // instead of charging a second time.
    const first = await capturePostedBody(
      baseParams({ attemptNonce: 'nonce-stable', _retryKey: 1 }),
    );
    fetchMock.mockClear();
    const second = await capturePostedBody(
      baseParams({ attemptNonce: 'nonce-stable', _retryKey: 2 }),
    );

    expect(first.attemptNonce).toBe('nonce-stable');
    expect(second.attemptNonce).toBe('nonce-stable');
  });

  it('still posts a well-formed body when no nonce is present (back-compat)', async () => {
    // `stream_params_*` payloads written before the field existed have no nonce. The
    // server already falls back to a random UUID when the key is absent or non-string,
    // so omitting it must be byte-identical to the pre-fix behavior — and must not
    // corrupt the rest of the body.
    const body = await capturePostedBody(baseParams());

    expect(body.attemptNonce).toBeUndefined();
    expect('attemptNonce' in body).toBe(false); // JSON.stringify drops undefined
    expect(body.resumeId).toBe('resume-1');
    expect(body.userId).toBe('user-1');
    expect(body.tier).toBe('elite');
    expect(body.stream).toBe(true);
  });
});
