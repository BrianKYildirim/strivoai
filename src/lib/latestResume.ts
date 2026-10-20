import { supabase } from '@/lib/supabaseClient';

/**
 * Shared accessor for the genuinely-identical latest-`resumes`-row reads.
 *
 * Consolidates ONLY the duplicated `from('resumes')…order('created_at', desc).limit(1)`
 * fetches whose shape is identical except for the `columns` set and the terminal
 * (Profile.tsx, SkillsGapAnalysis.tsx ×2, CareerCompass.tsx). Each caller passes the
 * EXACT columns + terminal it consumed before — there is NO hardcoded `.select('*')`,
 * so a migrated page receives byte-identical payload to its inline query.
 *
 * Divergent reads stay separate by design: `analyzed_at`-ordered + `.not(...)` reads
 * (RecruitingLens), the `analysis_results` / `linkedin_grades` tables, and every
 * `.limit(N>1)` LIST query are NOT in scope here (folding them would change behavior).
 *
 * Returns the same `{ data, error? }` contract as `analysisHelpers.ts` — `data` is an
 * array for the `'array'` terminal and a single row (or `null`) for `'single'` /
 * `'maybeSingle'`.
 */
export type LatestResumeTerminal = 'array' | 'single' | 'maybeSingle';

export interface GetLatestResumeParams {
  userId: string;
  columns: string;
  terminal?: LatestResumeTerminal;
  orderBy?: string;
}

export async function getLatestResume(
  { userId, columns, terminal = 'array', orderBy = 'created_at' }: GetLatestResumeParams,
): Promise<{ data: any; error?: string }> {
  try {
    const query = supabase
      .from('resumes')
      .select(columns)
      .eq('user_id', userId)
      .order(orderBy, { ascending: false })
      .limit(1);

    const { data, error } =
      terminal === 'single'
        ? await query.single()
        : terminal === 'maybeSingle'
          ? await query.maybeSingle()
          : await query;

    if (error) {
      return { data: terminal === 'array' ? [] : null, error: error.message };
    }

    return { data: terminal === 'array' ? (data || []) : data };
  } catch (err: any) {
    return { data: terminal === 'array' ? [] : null, error: err.message };
  }
}
