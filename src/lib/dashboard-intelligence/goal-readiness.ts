import type { GoalReadinessComponent, GoalReadinessModel } from './types';

/**
 * READ-ONLY PARSER for the PERSISTED Goal Readiness breakdown.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS MODULE CONTAINS NO SCORING MATH, AND MUST NEVER REGAIN ANY.
 *
 * The rubric — the six components, their weights, and the renormalized weighted average
 * taken over EVIDENCED components only (un-evidenced components are dropped from BOTH
 * the numerator and the denominator) — lives in SQL, ONCE: `compute_goal_readiness()`
 * (migration 20260712000002). A Postgres AFTER trigger on each of the four evidence
 * tables recomputes it on every write path and PERSISTS the result into
 * `career_targets.goal_readiness_score` / `goal_readiness_components`.
 *
 * This file only VALIDATES that persisted jsonb into a render model. It does not
 * recompute, re-weight, renormalize, clamp, round, or otherwise "fix" the number.
 * Regrowing the math here recreates exactly the dual-implementation drift the whole
 * design exists to eliminate — and `_shared/goal-readiness-guard.test.ts` fail-closes
 * inside `verify:baseline` on any hardcoded weight constant, renormalization
 * expression, summation, rounding call, or clamp helper appearing in this file.
 *
 * Defensive posture matches `profile-alignment.ts`: malformed, absent, or wrong-typed
 * jsonb returns a SAFE model. It never throws — a garbage column must not white-screen
 * the dashboard.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const NO_GOAL_INTERPRETATION =
  'Set your professional goal so Strivo can measure how strongly your profile supports it.';

const NO_EVIDENCE_INTERPRETATION =
  'Strivo does not have enough evidence yet to measure how strongly your profile supports this goal.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A persisted score is a finite number or nothing. Never coerced, never repaired. */
function readScore(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

/**
 * Validate ONE persisted component. Anything structurally wrong is dropped rather than
 * guessed at — a component we cannot trust must not silently render as a 0% bar.
 */
function readComponent(value: unknown): GoalReadinessComponent | null {
  if (!isRecord(value)) return null;

  const id = typeof value.id === 'string' ? value.id : null;
  const label = typeof value.label === 'string' ? value.label : null;
  const weight = readScore(value.weight);
  const score = readScore(value.score);

  if (!id || !label || weight === null || score === null) return null;

  return {
    id,
    label,
    weight,
    score,
    // Only an explicit `true` counts as evidenced. Absent/garbage => un-evidenced,
    // which renders as MISSING DATA ("Needs data"), never as a zero.
    evidenced: value.evidenced === true,
  };
}

function readComponents(value: unknown): GoalReadinessComponent[] {
  if (!Array.isArray(value)) return [];
  const out: GoalReadinessComponent[] = [];
  for (const entry of value) {
    const component = readComponent(entry);
    if (component) out.push(component);
  }
  return out;
}

function readBlockers(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function safeModel(status: 'no_goal' | 'no_evidence'): GoalReadinessModel {
  return {
    status,
    score: null,
    components: [],
    unevidenced: [],
    partialEvidence: false,
    evidencedWeight: 0,
    interpretation: status === 'no_goal' ? NO_GOAL_INTERPRETATION : NO_EVIDENCE_INTERPRETATION,
    blockers: [],
  };
}

/**
 * @param score      `career_targets.goal_readiness_score` — the PERSISTED value, as-is.
 * @param components `career_targets.goal_readiness_components` — the PERSISTED jsonb.
 * @param hasGoal    Whether the user has saved a professional goal at all.
 */
export function parseGoalReadiness(
  score: number | null,
  components: unknown,
  hasGoal = true,
): GoalReadinessModel {
  if (!hasGoal) return safeModel('no_goal');
  if (!isRecord(components)) return safeModel('no_evidence');

  const parsed = readComponents(components.components);
  const persistedScore = readScore(score);

  // No trustworthy components, or nothing scored yet => no evidence. The trigger has
  // either not fired or found nothing to score. Not a zero.
  if (parsed.length === 0 || persistedScore === null) {
    const empty = safeModel('no_evidence');
    return {
      ...empty,
      components: parsed,
      unevidenced: parsed.filter((component) => !component.evidenced),
      interpretation: readText(components.interpretation, NO_EVIDENCE_INTERPRETATION),
    };
  }

  const evidencedWeight = readScore(components.evidenced_weight) ?? 0;

  return {
    status: 'ready',
    // The PERSISTED score, passed straight through. Untouched.
    score: persistedScore,
    components: parsed,
    unevidenced: parsed.filter((component) => !component.evidenced),
    // The SQL scorer owns this flag; trust it, but fall back to the component set so a
    // stale/absent flag still surfaces missing evidence rather than hiding it.
    partialEvidence:
      components.partial_evidence === true || parsed.some((component) => !component.evidenced),
    evidencedWeight,
    interpretation: readText(components.interpretation, NO_EVIDENCE_INTERPRETATION),
    blockers: readBlockers(components.blockers),
  };
}
