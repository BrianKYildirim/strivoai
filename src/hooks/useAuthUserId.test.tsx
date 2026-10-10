import type { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSessionMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
    },
  },
}));

import { useAuthUserId } from './useAuthUserId';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });

  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  getSessionMock.mockReset();
});

describe('useAuthUserId', () => {
  it('returns the authenticated user from the local session', async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: 'user-a' } } },
      error: null,
    });

    const { result } = renderHook(() => useAuthUserId(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.userId).toBe('user-a'));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it('does not convert a temporary getSession error into a confirmed logout', async () => {
    const sessionError = new Error('temporary local session read failure');
    getSessionMock.mockResolvedValue({
      data: { session: null },
      error: sessionError,
    });

    const { result } = renderHook(() => useAuthUserId(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.userId).toBeNull();
    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBe(sessionError);
  });
});
