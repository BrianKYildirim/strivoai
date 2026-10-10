import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabaseClient';
import { authUserIdQueryKey } from '@/hooks/useAuthUserId';
import { clearRecruitingLensResultStorage } from '@/lib/recruiting-lens-result-storage';

/**
 * The app-root cache teardown for auth transitions. Renders nothing.
 *
 * WHY it lives here instead of at the two `signOut()` call sites (Navbar, TopBar):
 * a token that simply expires emits `SIGNED_OUT` with no button involved, so those
 * call sites would miss it — and wiring both of them would double-fire on the paths
 * that DO go through a button. One always-mounted subscription fires exactly once per
 * event, whatever caused it.
 *
 * This is also what makes the longer cache lifetimes in `src/lib/queryClient.ts` safe:
 * clearing the whole cache on sign-out and on any user-id change means no entry
 * belonging to a previous account can outlive that account's session.
 */
export const AuthCacheSync = () => {
  const queryClient = useQueryClient();
  // `undefined` = nothing seen yet. The FIRST event only seeds this ref — it must not
  // be read as "the id changed", or every cold start would clear the cache.
  const lastUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUserId = session?.user?.id ?? null;
      const previousUserId = lastUserIdRef.current;
      lastUserIdRef.current = nextUserId;

      const signedOut = event === 'SIGNED_OUT';
      const switchedAccount = previousUserId !== undefined && previousUserId !== nextUserId;
      if (signedOut || switchedAccount) {
        queryClient.clear();
        clearRecruitingLensResultStorage();
      }

      // Seed on every auth event, including INITIAL_SESSION. This also recovers a
      // temporary getSession() failure without another local-session read. Clearing
      // happens first on sign-out/account switch, so no prior user's entry survives.
      queryClient.setQueryData(authUserIdQueryKey, signedOut ? null : nextUserId);
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);

  return null;
};
