import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { normalizeActiveTier } from '@/config/pricing-config';

const ADMIN_TEST_TIER_KEY = 'strivo_admin_test_tier';

interface AdminTierTestContextType {
  isAdmin: boolean;
  testTier: string | null; // null means using real tier
  setTestTier: (tier: string | null) => void;
  getEffectiveTier: (realTier: string) => string;
}

const AdminTierTestContext = createContext<AdminTierTestContextType | undefined>(undefined);

export function AdminTierTestProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [testTier, setTestTierState] = useState<string | null>(null);

  useEffect(() => {
    checkAdminStatus();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkAdminStatus();
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkAdminStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser();

    // Admin status is authoritative server-side: it lives in the `user_roles`
    // table (seeded against the main account's Supabase Auth user ID) and is
    // read via the `has_role` SECURITY DEFINER RPC — the same source of truth
    // the AdminUsage page, Dashboard badge, and admin RPCs use. It is NOT
    // derived from the account email or the membership tier, so upgrading a
    // user to Elite never grants admin UI/access. Fails closed (isAdmin=false)
    // when there is no user or the RPC errors.
    let userIsAdmin = false;
    if (user) {
      const { data: hasAdminRole, error: roleError } = await supabase
        .rpc('has_role', { _user_id: user.id, _role: 'admin' });
      userIsAdmin = !roleError && hasAdminRole === true;
    }
    setIsAdmin(userIsAdmin);

    if (userIsAdmin) {
      // Load saved test tier from localStorage, default to 'elite' for admin
      const savedTier = localStorage.getItem(ADMIN_TEST_TIER_KEY);
      if (savedTier) {
        setTestTierState(normalizeActiveTier(savedTier));
      } else {
        // Default admin to elite tier for testing
        setTestTierState('elite');
        localStorage.setItem(ADMIN_TEST_TIER_KEY, 'elite');
      }
    } else {
      // Clear test tier if not admin
      localStorage.removeItem(ADMIN_TEST_TIER_KEY);
      setTestTierState(null);
    }
  };

  const setTestTier = (tier: string | null) => {
    if (tier === null) {
      localStorage.removeItem(ADMIN_TEST_TIER_KEY);
    } else {
      tier = normalizeActiveTier(tier);
      localStorage.setItem(ADMIN_TEST_TIER_KEY, tier);
    }
    setTestTierState(tier);
  };

  const getEffectiveTier = (realTier: string): string => {
    if (isAdmin && testTier) {
      return normalizeActiveTier(testTier);
    }
    // Admin View (testTier is null): return 'admin' tier for full access
    // regardless of what the profile tier says
    if (isAdmin && !testTier) {
      return 'admin';
    }
    return normalizeActiveTier(realTier);
  };

  return (
    <AdminTierTestContext.Provider value={{ isAdmin, testTier, setTestTier, getEffectiveTier }}>
      {children}
    </AdminTierTestContext.Provider>
  );
}

export function useAdminTierTest() {
  const context = useContext(AdminTierTestContext);
  if (context === undefined) {
    throw new Error('useAdminTierTest must be used within an AdminTierTestProvider');
  }
  return context;
}
