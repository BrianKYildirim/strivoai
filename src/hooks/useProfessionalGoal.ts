import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuthUserId } from '@/hooks/useAuthUserId';
import { supabase } from '@/lib/supabaseClient';

/**
 * The ONE data seam for the user's professional goal + their PERSISTED Goal Readiness.
 *
 * READS the goal and the readiness the DB trigger already computed.
 * WRITES only the goal (the raw text the user typed).
 *
 * ZERO AI (CONTEXT §9a/§9b). There is deliberately NO `refreshAlignment()`, no
 * `supabase.functions.invoke`, no edge-function call, no background recompute latch and
 * no Anthropic call anywhere in this file or anywhere downstream of it.
 *
 * The Goal Readiness scorer is a plpgsql AFTER trigger
 * (`compute_goal_readiness`, migration 20260712000002). It recomputes and PERSISTS the
 * score INSIDE THE SAME TRANSACTION as the goal write. So `saveGoal` just has to
 * invalidate the query — the fresh score is already in the column by the time the
 * refetch lands. No second round-trip, no spinner, no AI wait.
 */

export type GoalReadinessComponentRow = {
  id: string;
  label: string;
  weight: number;
  score: number;
  evidenced: boolean;
};

/**
 * The deterministic SQL parse of the raw goal, as `parse_professional_goal()` returns it.
 *
 * ADDITIVE CONTRACT: the six fields below the divider were introduced by migration
 * 20260804010000 and are therefore OPTIONAL — every row parsed before it carries only the
 * original five keys, and every reader must tolerate their absence. They are never
 * required, never written by the client, and never a substitute for the raw goal.
 */
export type ProfessionalGoalStructured = {
  role: string | null;
  industry: string | null;
  location: string | null;
  opportunity_type: string | null;
  year: string | null;

  /** Additive keys, parsed by 20260804010000. OPTIONAL: rows parsed before it lack them. */
  timeframe?: string | null;
  seniority?: string | null;
  company_type?: string | null;
  long_term_direction?: string | null;
  /** DERIVED label. Never a replacement for `professionalGoal` — display only. */
  normalized_summary?: string | null;
  keywords?: string[] | null;
};

export type ProfessionalGoalRecord = {
  /** The user's RAW wording. The source of truth for display AND for editing. */
  professionalGoal: string | null;
  /** Deterministically parsed by SQL. Never written by the client. */
  structured: ProfessionalGoalStructured | null;
  goalSetAt: string | null;
  /** TRIGGER-OWNED. Read-only here — the DB rejects a client write to it. */
  goalReadinessScore: number | null;
  goalReadinessComponents: unknown;
  goalReadinessComputedAt: string | null;
};

const EMPTY: ProfessionalGoalRecord = {
  professionalGoal: null,
  structured: null,
  goalSetAt: null,
  goalReadinessScore: null,
  goalReadinessComponents: null,
  goalReadinessComputedAt: null,
};

export const professionalGoalQueryKey = (userId?: string | null) =>
  ['professionalGoal', userId ?? null] as const;

export const professionalGoalQueryOptions = (userId: string | null) => ({
  queryKey: professionalGoalQueryKey(userId),
  queryFn: async (): Promise<ProfessionalGoalRecord> => {
    // NOTE: this select list MUST stay a single string LITERAL. supabase-js infers the
    // row type from it at the type level; concatenating it (`'a, b' + 'c'`) collapses the
    // inference to GenericStringError and every field access below fails to type-check.
    const { data, error } = await supabase
      .from('career_targets')
      .select('professional_goal, professional_goal_structured, professional_goal_set_at, goal_readiness_score, goal_readiness_components, goal_readiness_computed_at')
      .eq('user_id', userId!)
      .maybeSingle();

    if (error) {
      console.error('[useProfessionalGoal] load error:', error);
      throw error;
    }
    if (!data) return EMPTY;

    return {
      professionalGoal: data.professional_goal ?? null,
      structured: (data.professional_goal_structured ?? null) as ProfessionalGoalStructured | null,
      goalSetAt: data.professional_goal_set_at ?? null,
      goalReadinessScore: data.goal_readiness_score ?? null,
      goalReadinessComponents: data.goal_readiness_components ?? null,
      goalReadinessComputedAt: data.goal_readiness_computed_at ?? null,
    };
  },
});

export function useProfessionalGoal() {
  const queryClient = useQueryClient();

  const { userId } = useAuthUserId();

  const query = useQuery({
    ...professionalGoalQueryOptions(userId),
    enabled: !!userId,
  });

  const saveMutation = useMutation({
    mutationFn: async (rawText: string): Promise<void> => {
      const goal = rawText.trim();
      if (!goal) throw new Error('Your goal cannot be empty.');
      if (!userId) throw new Error('Not authenticated');

      // PARTIAL upsert on the conflict target. The payload carries ONLY the goal fields,
      // so target_roles / target_industries / target_companies / location_preference on an
      // existing row are NOT clobbered.
      //
      // It deliberately writes NEITHER professional_goal_structured NOR any
      // goal_readiness_* column: those are trigger-owned, and the column-level GRANTs in
      // migration 20260712000001 would reject the write anyway.
      const { error } = await supabase
        .from('career_targets')
        .upsert(
          {
            user_id: userId,
            professional_goal: goal,
            professional_goal_set_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        );

      if (error) {
        console.error('[useProfessionalGoal] saveGoal error:', error);
        throw error;
      }
      // The AFTER trigger has ALREADY recomputed and persisted readiness in this same
      // write. Nothing else to do — no invoke, no poll, no AI.
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: professionalGoalQueryKey(userId) });
      // A saved goal can flip the ProtectedRoute onboarding verdict from fail to pass.
      // Belt-and-braces only: the gate never serves a cached FAIL, so correctness does
      // not depend on this line.
      void queryClient.invalidateQueries({ queryKey: ['onboardingGate'] });
    },
  });

  const saveGoal = useCallback(
    (rawText: string) => saveMutation.mutateAsync(rawText),
    [saveMutation],
  );

  const record = query.data ?? EMPTY;

  return {
    ...record,
    hasGoal: !!record.professionalGoal?.trim(),
    isLoading: query.isLoading,
    error: query.error as Error | null,
    saveGoal,
    isSaving: saveMutation.isPending,
    refresh: () =>
      queryClient.invalidateQueries({ queryKey: professionalGoalQueryKey(userId) }),
  };
}
