import { QueryClient } from '@tanstack/react-query';

/**
 * The single QueryClient for the app.
 *
 * It used to be `new QueryClient()` inline in App.tsx, which meant every query in the
 * app inherited `staleTime: 0` / `gcTime: 5min` / `refetchOnWindowFocus: true` /
 * `retry: 3`. Each default below is a deliberate correction of one of those:
 *
 * - `staleTime` only decides whether a BACKGROUND refetch fires; React Query renders
 *   cached data first either way. 60s means a repeat visit inside a minute is a pure
 *   cache read with no request at all.
 * - `gcTime` is what actually keeps a route warm: it is how long an UNMOUNTED query's
 *   data survives. The 5-minute default expired during ordinary sessions, so returning
 *   to /dashboard remounted into a loading state. 30 minutes covers a real session.
 * - `refetchOnWindowFocus` off, because ~10 dashboard queries re-firing every time the
 *   tab regains focus is visible churn. Balance-sensitive reads (useMerits,
 *   useSubscriptionState) opt back in individually.
 * - `retry: 1`, because 3 retries with exponential backoff keeps a genuinely failing
 *   query pending for ~7s — time the cold-load gate would sit behind.
 *
 * Cross-user safety comes from `<AuthCacheSync />`, which clears this cache on
 * SIGNED_OUT and on any user-id change. Do not raise these lifetimes without it.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
