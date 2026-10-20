import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authUserIdQueryKey } from '@/hooks/useAuthUserId';

type AuthSession = { user: { id: string } } | null;
type AuthListener = (event: string, session: AuthSession) => void;

const authState = vi.hoisted(() => ({
  listener: null as AuthListener | null,
  unsubscribe: vi.fn(),
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (listener: AuthListener) => {
        authState.listener = listener;
        return { data: { subscription: { unsubscribe: authState.unsubscribe } } };
      },
    },
  },
}));

import { AuthCacheSync } from '../AuthCacheSync';

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
}

function renderSync(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthCacheSync />
    </QueryClientProvider>,
  );
}

function emitAuth(event: string, userId: string | null): void {
  act(() => {
    authState.listener?.(event, userId ? { user: { id: userId } } : null);
  });
}

beforeEach(() => {
  authState.listener = null;
  authState.unsubscribe.mockReset();
  sessionStorage.clear();
});

describe('AuthCacheSync', () => {
  it('seeds an initial authenticated session without clearing same-user cache', () => {
    const queryClient = makeClient();
    queryClient.setQueryData(['dashboard', 'user-a'], { score: 91 });
    const clearSpy = vi.spyOn(queryClient, 'clear');
    renderSync(queryClient);

    emitAuth('INITIAL_SESSION', 'user-a');

    expect(clearSpy).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(authUserIdQueryKey)).toBe('user-a');
    expect(queryClient.getQueryData(['dashboard', 'user-a'])).toEqual({ score: 91 });
  });

  it('clears the complete cache on sign-out and reseeds a confirmed null identity', () => {
    const queryClient = makeClient();
    renderSync(queryClient);
    emitAuth('INITIAL_SESSION', 'user-a');
    queryClient.setQueryData(['resumes', 'user-a'], ['resume-a']);
    queryClient.setQueryData(['professionalGoal', 'user-a'], { professionalGoal: 'Goal A' });
    sessionStorage.setItem('recruiting-lens-result:user-a', '{"private":"result-a"}');

    emitAuth('SIGNED_OUT', null);

    expect(queryClient.getQueryData(['resumes', 'user-a'])).toBeUndefined();
    expect(queryClient.getQueryData(['professionalGoal', 'user-a'])).toBeUndefined();
    expect(queryClient.getQueryData(authUserIdQueryKey)).toBeNull();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(1);
    expect(sessionStorage.getItem('recruiting-lens-result:user-a')).toBeNull();
  });

  it('clears every User A entry before reseeding User B, preventing cross-user cache data', () => {
    const queryClient = makeClient();
    renderSync(queryClient);
    emitAuth('INITIAL_SESSION', 'user-a');
    queryClient.setQueryData(['resumes', 'user-a'], ['resume-a']);
    queryClient.setQueryData(['merit-balance', 'user-a'], { balance: 100 });
    queryClient.setQueryData(['dashboardLinkedInGrades', 'user-a', 'elite'], [{ score: 99 }]);
    sessionStorage.setItem('recruiting-lens-result:user-a', '{"private":"result-a"}');

    emitAuth('SIGNED_IN', 'user-b');

    expect(queryClient.getQueryData(authUserIdQueryKey)).toBe('user-b');
    expect(queryClient.getQueryData(['resumes', 'user-a'])).toBeUndefined();
    expect(queryClient.getQueryData(['merit-balance', 'user-a'])).toBeUndefined();
    expect(
      queryClient.getQueryData(['dashboardLinkedInGrades', 'user-a', 'elite']),
    ).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(1);
    expect(sessionStorage.getItem('recruiting-lens-result:user-a')).toBeNull();
  });

  it('unsubscribes its single app-root auth listener on unmount', () => {
    const queryClient = makeClient();
    const view = renderSync(queryClient);

    view.unmount();

    expect(authState.unsubscribe).toHaveBeenCalledOnce();
  });
});
