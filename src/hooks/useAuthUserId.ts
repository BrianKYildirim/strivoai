import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabaseClient';

/**
 * The ONE auth-id seam for the app.
 *
 * WHY `getSession()` and not `getUser()`: `getUser()` is a network round-trip to
 * `/auth/v1/user`, while `getSession()` reads the already-persisted local session.
 * Every dashboard data query is gated `enabled: !!userId`, so that round-trip was a
 * serial barrier standing in front of all of them.
 *
 * The id is used ONLY to scope cache keys and to filter user-owned reads. It is never
 * an authorization decision — the database still enforces identity via RLS against the
 * access token on every request. Do not use it to grant access to anything.
 *
 * Freshness comes from `<AuthCacheSync />`, which clears the cache and writes the new
 * id on every sign-out / account switch — not from refetching this query.
 */
export const authUserIdQueryKey = ['auth', 'userId'] as const;

export function useAuthUserId(): {
  userId: string | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
} {
  const { data, isPending, isError, error } = useQuery({
    queryKey: authUserIdQueryKey,
    queryFn: async (): Promise<string | null> => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      return session?.user?.id ?? null;
    },
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // The query is never disabled, so `isPending` is true only while there is no
  // resolved id at all — i.e. exactly React Query's `isLoading` semantics, which is
  // what the Dashboard cold-load gate keys off.
  // A failed local-session read is NOT proof of logout. Keep callers in their secure
  // loading/locked state rather than redirecting as though an explicit null session
  // had been confirmed. AuthCacheSync will reseed this key on the next auth event.
  return {
    userId: data ?? null,
    isLoading: isPending || isError,
    isError,
    error: error instanceof Error ? error : null,
  };
}
