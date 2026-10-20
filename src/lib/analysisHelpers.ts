import { supabase } from '@/lib/supabaseClient';

export interface AnalysisInsight {
  icon: 'positive' | 'warning' | 'info';
  text: string;
  locked?: boolean;
}

export interface AnalysisDisplayResult {
  score: number;
  headline: string;
  insights: AnalysisInsight[];
}

/**
 * Extract key insights from resume analysis response
 * "One Full Taste, Then Friction" - Show ALL insights to ALL users
 * Paywall happens at the analysis trigger, not on viewing results
 */
export function extractResumeInsights(data: any, _isFreeTier?: boolean): AnalysisDisplayResult {
  if (!data) {
    return {
      score: 0,
      headline: 'Analysis Error',
      insights: [{ icon: 'warning', text: 'Could not analyze resume. Please try again.' }]
    };
  }

  const insights: AnalysisInsight[] = [];
  
  // Show ALL strengths to ALL users
  const strengths: string[] = data.strengths || [];
  if (strengths.length > 0) {
    insights.push({ icon: 'positive', text: strengths[0] });
    if (strengths.length > 1) {
      insights.push({ icon: 'positive', text: strengths[1] });
    }
  }

  // Support both new field name (priorityImprovements per Runtime Brief v2) and legacy (improvements)
  const improvements: string[] = data.priorityImprovements || data.improvements || [];
  if (improvements.length > 0) {
    insights.push({ icon: 'warning', text: improvements[0] });
    if (improvements.length > 1) {
      insights.push({ icon: 'warning', text: improvements[1] });
    }
  }

  // Add industry guess
  if (data.industryGuess) {
    insights.push({
      icon: 'info',
      text: `Your resume aligns best with ${data.industryGuess} roles`
    });
  }

  // Show target roles to ALL users
  if (data.suggestedTargetRoles && data.suggestedTargetRoles.length > 0) {
    insights.push({
      icon: 'info',
      text: `Best suited for: ${data.suggestedTargetRoles.slice(0, 3).join(', ')}`
    });
  }

  return {
    score: data.overallScore || 0,
    headline: 'Interview Readiness Score',
    insights
  };
}

/**
 * Extract key insights from LinkedIn grading response
 * "One Full Taste, Then Friction" - Show ALL insights to ALL users
 */
export function extractLinkedInInsights(data: any, _isFreeTier?: boolean): AnalysisDisplayResult {
  if (!data) {
    return {
      score: 0,
      headline: 'LinkedIn Score',
      insights: [{ icon: 'warning', text: 'Could not analyze profile. Please try again.' }]
    };
  }

  const insights: AnalysisInsight[] = [];
  const grading = data.grading_data || data;

  // Extract from criteria if available - show ALL to ALL users
  if (grading.criteria && Array.isArray(grading.criteria)) {
    const highScoring = grading.criteria.filter((c: any) => c.score >= 80).slice(0, 2);
    const lowScoring = grading.criteria.filter((c: any) => c.score < 70).slice(0, 2);

    highScoring.forEach((c: any) => {
      insights.push({ icon: 'positive', text: `Strong ${c.label || c.name}: ${c.score}/100` });
    });

    lowScoring.forEach((c: any) => {
      insights.push({
        icon: 'warning',
        text: `Improve ${c.label || c.name}: ${c.score}/100`
      });
    });
  }

  // Add summary insight
  if (grading.summary) {
    insights.push({ icon: 'info', text: grading.summary.slice(0, 100) + '...' });
  }

  return {
    score: data.overall_score || grading.overallScore || 0,
    headline: 'LinkedIn Profile Score',
    insights
  };
}

/**
 * Get analysis history for a user.
 *
 * NOTE: This module is SELECT-only on `analysis_results` as of Phase 21 MIG-02.
 * The prior `saveAnalysisResult` helper was removed — `analysis_results` writes
 * now happen exclusively from edge functions via the service role, after a
 * successful Merit deduction (D-05 / D-06 / D-07).
 */
export async function getAnalysisHistory(
  userId: string,
  limit = 10
): Promise<{ data: any[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('analysis_results')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return { data: [], error: error.message };
    }

    return { data: data || [] };
  } catch (err: any) {
    return { data: [], error: err.message };
  }
}
