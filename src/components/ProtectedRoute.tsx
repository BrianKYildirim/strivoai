import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuthUserId } from '@/hooks/useAuthUserId';
import { onboardingGateQueryOptions } from '@/lib/dashboard-queries';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  skipOnboardingCheck?: boolean;
}

/** What the guard should do with the current render. */
type GateStatus = 'resolving' | 'no-session' | 'allow' | 'redirect-onboarding';

export const ProtectedRoute = ({ children, skipOnboardingCheck = false }: ProtectedRouteProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { userId, isLoading: isResolvingSession } = useAuthUserId();
  const [unlockedByTimeout, setUnlockedByTimeout] = useState(false);
  // An explicit sign-out lands on the public homepage, not the auth gate. The auth event
  // and the cleared session both fire, so remember which one happened first.
  const signedOutRef = useRef(false);

  // Hard timeout safeguard so route guards never trap navigation
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      console.warn('ProtectedRoute: timeout while resolving session; unlocking UI');
      setUnlockedByTimeout(true);
    }, 6000);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      console.log('ProtectedRoute auth event:', event);

      if (event === 'SIGNED_OUT') {
        // After explicit sign out, send users to the public homepage (not the auth gate)
        signedOutRef.current = true;
        navigate('/');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const gateQuery = useQuery({
    ...onboardingGateQueryOptions(userId),
    enabled: !!userId && !skipOnboardingCheck,
  });

  const gateData = gateQuery.data;
  const gatePasses = !!gateData && gateData.hasResume && gateData.hasGoal;

  const gateStatus: GateStatus = (() => {
    if (isResolvingSession) return 'resolving';
    if (!userId) return 'no-session';
    if (skipOnboardingCheck) return 'allow';
    // Fail open: a failed gate lookup must render the app, never trap the user.
    if (gateQuery.isError) return 'allow';
    if (!gateData) return 'resolving';
    // A PASSING verdict is served straight from cache — that is the whole point of the
    // DD-4 asymmetry, and it is what makes repeat navigation render instantly.
    if (gatePasses) return 'allow';
    // A NON-passing verdict is never acted on from a stale copy. Its staleTime is 0, so
    // a refetch is already in flight; bouncing on the cached answer is exactly how a
    // just-onboarded user would get thrown back to /onboarding.
    if (gateQuery.isFetching) return 'resolving';
    if (!gateData.hasResume) return 'redirect-onboarding';
    // Resume but NO goal (legacy user) -> onboarding, which opens directly on Step 4 and
    // never repeats Steps 1-3. NOTE: a goalError leaves hasGoal false-y, so it is
    // deliberately ANDed with "no error" to preserve the fail-open posture.
    if (!gateData.hasGoal && !gateData.goalError) return 'redirect-onboarding';
    return 'allow';
  })();

  useEffect(() => {
    if (gateStatus === 'no-session') {
      if (!signedOutRef.current) navigate('/auth');
      return;
    }
    if (gateStatus === 'redirect-onboarding' && location.pathname !== '/onboarding') {
      navigate('/onboarding');
    }
  }, [gateStatus, location.pathname, navigate]);

  if (gateStatus === 'resolving' && !unlockedByTimeout) {
    return (
      <div className="min-h-viewport bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return userId ? <>{children}</> : null;
};
