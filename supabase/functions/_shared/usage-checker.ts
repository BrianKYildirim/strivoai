import { getServiceClient } from './supabase-client.ts';

export type ActionType =
  | 'resume_analysis'
  | 'job_matching'
  | 'career_compass'
  | 'linkedin_grading'
  | 'recruiting_lens'
  | 'interview_prep';

export interface UsageCheckResult {
  allowed: boolean;
  resetDate: string;
  tier: string;
}

export async function checkAndRecordUsage(
  userId: string,
  actionType: ActionType
): Promise<UsageCheckResult> {
  const supabase = getServiceClient();

  // Atomic check-and-record via a single SQL function that holds an advisory lock,
  // eliminating the TOCTOU race between can_perform_ai_action and record_ai_usage.
  const { data: checkResult, error: checkError } = await supabase
    .rpc('check_and_record_ai_usage', {
      p_user_id: userId,
      p_action_type: actionType,
      p_credits: 1,
    });

  if (checkError) {
    console.error('Error checking/recording usage:', checkError);
    // Fail closed to avoid letting users exceed limits if the check fails
    return { allowed: false, resetDate: '', tier: 'unknown' };
  }

  const result = checkResult as {
    allowed: boolean;
    current_usage: number;
    limit: number;
    tier: string;
    reset_date: string;
  };

  if (!result.allowed) {
    return {
      allowed: false,
      resetDate: result.reset_date,
      tier: result.tier
    };
  }

  return {
    allowed: true,
    resetDate: result.reset_date,
    tier: result.tier
  };
}

/**
 * HIST-06: Read-only entitlement check that does NOT insert a usage_tracking row.
 * Used by features to check if the user can proceed before starting a long-running AI task.
 */
export async function checkEntitlement(
  userId: string,
  _actionType: ActionType
): Promise<UsageCheckResult> {
  const supabase = getServiceClient();

  const { data: checkResult, error: checkError } = await supabase
    .rpc('can_perform_ai_action', {
      p_user_id: userId
    });

  if (checkError) {
    console.error('Error checking entitlement:', checkError);
    return { allowed: false, resetDate: '', tier: 'unknown' };
  }

  const result = checkResult as {
    allowed: boolean;
    tier: string;
    reset_date: string;
  };

  return {
    allowed: result.allowed,
    resetDate: result.reset_date,
    tier: result.tier
  };
}

/**
 * HIST-06: Post-success usage ledger write that links to the durable analysis row.
 * Called after the feature-specific row (analysis_results, resumes, etc.) is persisted.
 */
export async function recordUsageWithAnalysis(
  userId: string,
  actionType: ActionType,
  credits: number,
  analysisId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getServiceClient();

  const { error } = await supabase
    .rpc('record_ai_usage', {
      p_user_id: userId,
      p_action_type: actionType,
      p_credits: credits,
      p_analysis_id: analysisId,
    });

  if (error) {
    console.error('Error recording usage with analysis:', error);
    return { ok: false, error: error.message || 'record_ai_usage failed' };
  }

  return { ok: true };
}

export function createUsageLimitResponse(resetDate: string, tier: string, corsHeaders: Record<string, string>) {
  const formattedDate = new Date(resetDate).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  
  return new Response(
    JSON.stringify({
      error: 'usage_limit_reached',
      message: `You've reached the usage limit for this billing cycle. Your access will reset on ${formattedDate}.`,
      resetDate: resetDate,
      tier: tier
    }),
    {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  );
}
