import type { ProfessionalGoalStructured } from '@/hooks/useProfessionalGoal';

/**
 * The label shown on the dashboard goal chip.
 *
 * NO SCORING MATH LIVES HERE, deliberately — this is a formatting helper, and
 * `_shared/goal-readiness-guard.test.ts` fail-closes on any rubric math regrowing on the
 * client. Nothing below adds, weights, rounds or clamps anything.
 *
 * PRECEDENCE
 *   1. `normalized_summary` — the SQL parser's derived one-line label
 *      (migration 20260804010000). ABSENT on rows parsed before that migration, which is
 *      exactly why it is optional and why step 2 still exists.
 *   2. the legacy role / location / year join — what the dashboard rendered before, so a
 *      row that has never been re-parsed looks identical to how it looked yesterday.
 *   3. the user's RAW goal, verbatim (trimmed) — their own wording is always better than
 *      nothing, and it is never rewritten.
 *   4. null.
 *
 * Defensive by construction (the never-throw posture of `profile-alignment.ts`): the
 * structured object comes from a jsonb column, so any field can be anything at runtime.
 * Every value is type-checked before use. This function must never throw — a malformed
 * parse is a missing chip, not a broken dashboard.
 */

/** A trimmed, non-empty string, or null. Tolerates any runtime type. */
function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function goalChipLabel(
  structured: ProfessionalGoalStructured | null | undefined,
  professionalGoal: string | null | undefined,
): string | null {
  if (structured && typeof structured === 'object') {
    const summary = cleanString(structured.normalized_summary);
    if (summary) return summary;

    const parts = [structured.role, structured.location, structured.year]
      .map(cleanString)
      .filter((part): part is string => part !== null);
    if (parts.length > 0) return parts.join(' • ');
  }

  return cleanString(professionalGoal);
}
