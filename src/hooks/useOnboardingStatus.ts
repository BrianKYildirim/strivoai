import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

export interface OnboardingStatus {
  loading: boolean;
  hasCompletedOnboarding: boolean;
  hasResume: boolean;
  hasLinkedIn: boolean;
  hasTargetRoles: boolean;
  /** True only when career_targets.professional_goal holds non-whitespace text. */
  hasProfessionalGoal: boolean;
  /** The user's RAW goal wording, verbatim. Never a derived/structured form. */
  professionalGoal: string | null;
  profileStrength: number;
  userId: string | null;
}

export function useOnboardingStatus() {
  const [status, setStatus] = useState<OnboardingStatus>({
    loading: true,
    hasCompletedOnboarding: false,
    hasResume: false,
    hasLinkedIn: false,
    hasTargetRoles: false,
    hasProfessionalGoal: false,
    professionalGoal: null,
    profileStrength: 0,
    userId: null,
  });

  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  const checkOnboardingStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setStatus(prev => ({ ...prev, loading: false }));
        return;
      }

      // Check for resume
      const { data: resumes } = await supabase
        .from('resumes')
        .select('id')
        .eq('user_id', user.id)
        .limit(1);

      const hasResume = resumes && resumes.length > 0;

      // Check profile for LinkedIn and general profile completion
      const [profileResult, targetsResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('linkedin_pdf_content, linkedin_url, preferred_locations, full_name')
          .eq('id', user.id)
          .single(),
        supabase
          .from('career_targets')
          .select('target_roles, target_industries, professional_goal')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

      const profile = profileResult.data;
      const targets = targetsResult.data;

      const professionalGoal = targets?.professional_goal ?? null;
      // Whitespace-only is NOT a goal — it must not satisfy the gate.
      const hasProfessionalGoal = !!professionalGoal?.trim();

      const hasLinkedIn = !!(profile?.linkedin_pdf_content || profile?.linkedin_url);
      const hasTargetRoles = targets?.target_roles && targets.target_roles.length > 0;
      const hasTargetIndustries = targets?.target_industries && targets.target_industries.length > 0;
      const hasLocations = profile?.preferred_locations && profile.preferred_locations.length > 0;
      const hasName = !!profile?.full_name;

      // Calculate profile strength
      let strength = 0;
      if (hasResume) strength += 40; // Resume is critical
      if (hasLinkedIn) strength += 20;
      if (hasTargetRoles) strength += 15;
      if (hasTargetIndustries) strength += 10;
      if (hasLocations) strength += 10;
      if (hasName) strength += 5;

      // Onboarding is complete only with a resume AND a professional goal (quick
      // 260712-msh). The goal is now Step 4 and is required — a legacy user with a
      // resume but no goal is NOT onboarded and is routed to Step 4.
      const hasCompletedOnboarding = !!hasResume && hasProfessionalGoal;

      setStatus({
        loading: false,
        hasCompletedOnboarding,
        hasResume: !!hasResume,
        hasLinkedIn,
        hasTargetRoles: !!hasTargetRoles,
        hasProfessionalGoal,
        professionalGoal,
        profileStrength: strength,
        userId: user.id,
      });
    } catch (error) {
      console.error('Error checking onboarding status:', error);
      setStatus(prev => ({ ...prev, loading: false }));
    }
  };

  const refresh = () => {
    setStatus(prev => ({ ...prev, loading: true }));
    checkOnboardingStatus();
  };

  return { ...status, refresh };
}
