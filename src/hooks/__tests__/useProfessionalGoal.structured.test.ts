/**
 * Quick 260804-50q — `useProfessionalGoal` BACKWARD-COMPATIBILITY guard.
 *
 * Migration 20260804010000 added six keys to `professional_goal_structured`. Rows parsed
 * BEFORE it carry only the original five, and rows whose goal was saved but never parsed
 * carry NULL. Both must keep loading without error.
 *
 * Also pins the cost contract at the client seam: `saveGoal` writes ONLY the goal columns
 * — no scorer-owned column, and no `supabase.functions.invoke` (there is no invoke seam on
 * the mock at all, so any attempt to add one fails loudly here).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mocks = vi.hoisted(() => ({
  maybeSingleMock: vi.fn(),
  upsertMock: vi.fn(),
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => mocks.maybeSingleMock() }),
      }),
      upsert: (...args: unknown[]) => mocks.upsertMock(...args),
    }),
  },
}));

vi.mock('@/hooks/useAuthUserId', () => ({
  useAuthUserId: () => ({ userId: 'user-42' }),
}));

import { useProfessionalGoal } from '../useProfessionalGoal';

const RAW = 'IB internship 2027 in New York — Investment Banking';

/** Exactly what parse_professional_goal returned BEFORE 20260804010000. */
const LEGACY_5_KEY = {
  role: 'Investment Banking',
  industry: 'Investment Banking',
  location: 'New York',
  opportunity_type: 'internship',
  year: '2027',
};

/** What it returns after. */
const ENRICHED_11_KEY = {
  ...LEGACY_5_KEY,
  timeframe: '2027',
  seniority: 'intern',
  company_type: 'leading global bank',
  long_term_direction: 'I want to move into private equity later',
  normalized_summary: 'Investment Banking • Internship • New York • 2027',
  keywords: ['investment banking', 'new york', 'private equity'],
};

function row(structured: unknown) {
  return {
    data: {
      professional_goal: RAW,
      professional_goal_structured: structured,
      professional_goal_set_at: '2026-08-04T00:00:00Z',
      goal_readiness_score: 71,
      goal_readiness_components: { components: [] },
      goal_readiness_computed_at: '2026-08-04T00:00:00Z',
    },
    error: null,
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  mocks.maybeSingleMock.mockReset();
  mocks.upsertMock.mockReset();
  mocks.upsertMock.mockResolvedValue({ error: null });
});

describe('useProfessionalGoal — structured backward compatibility', () => {
  it('loads a LEGACY 5-key row with no error; the additive fields read undefined', async () => {
    mocks.maybeSingleMock.mockResolvedValue(row(LEGACY_5_KEY));

    const { result } = renderHook(() => useProfessionalGoal(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.hasGoal).toBe(true);
    expect(result.current.professionalGoal).toBe(RAW);
    expect(result.current.structured?.role).toBe('Investment Banking');
    expect(result.current.structured?.normalized_summary).toBeUndefined();
    expect(result.current.structured?.keywords).toBeUndefined();
    expect(result.current.structured?.long_term_direction).toBeUndefined();
  });

  it('loads a row whose structured form is NULL (a goal saved but never parsed)', async () => {
    mocks.maybeSingleMock.mockResolvedValue(row(null));

    const { result } = renderHook(() => useProfessionalGoal(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.structured).toBeNull();
    // The RAW goal is the source of truth, so the user still "has a goal".
    expect(result.current.hasGoal).toBe(true);
  });

  it('exposes all six additive fields on an 11-key row', async () => {
    mocks.maybeSingleMock.mockResolvedValue(row(ENRICHED_11_KEY));

    const { result } = renderHook(() => useProfessionalGoal(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const s = result.current.structured!;
    expect(s.timeframe).toBe('2027');
    expect(s.seniority).toBe('intern');
    expect(s.company_type).toBe('leading global bank');
    expect(s.long_term_direction).toBe('I want to move into private equity later');
    expect(s.normalized_summary).toBe('Investment Banking • Internship • New York • 2027');
    expect(s.keywords).toEqual(['investment banking', 'new york', 'private equity']);
  });

  it('saveGoal writes ONLY the goal columns — never a scorer-owned one, never an AI call', async () => {
    mocks.maybeSingleMock.mockResolvedValue(row(ENRICHED_11_KEY));

    const { result } = renderHook(() => useProfessionalGoal(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const TWO_SENTENCES =
      'I want an investment banking internship in New York in 2027.\nEventually I want to move into private equity.';
    await result.current.saveGoal(TWO_SENTENCES);

    expect(mocks.upsertMock).toHaveBeenCalledTimes(1);
    const [payload, options] = mocks.upsertMock.mock.calls[0] as [Record<string, unknown>, unknown];

    expect(Object.keys(payload).sort()).toEqual([
      'professional_goal',
      'professional_goal_set_at',
      'user_id',
    ]);
    expect(options).toEqual({ onConflict: 'user_id' });

    // The interior of the user's text is preserved verbatim — only the ends are trimmed.
    expect(payload.professional_goal).toBe(TWO_SENTENCES);
    expect(String(payload.professional_goal)).toContain('\n');

    // Trigger-owned columns are never sent; the DB grants would reject them anyway.
    for (const owned of [
      'professional_goal_structured',
      'goal_readiness_score',
      'goal_readiness_components',
      'goal_readiness_computed_at',
    ]) {
      expect(payload).not.toHaveProperty(owned);
    }
  });
});
