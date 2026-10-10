/**
 * Phase 47 — Interview Prep production gate.
 *
 * Single source of truth for the Interview Prep feature flag.
 * Every gated surface imports from this helper — no inline
 * `import.meta.env.VITE_FEATURE_INTERVIEW_PREP` checks anywhere else.
 *
 * Semantics (per CONTEXT D-06/D-07/D-08/D-09):
 *   - Vercel "Production" scope sets VITE_FEATURE_INTERVIEW_PREP=false  → hidden
 *   - Vercel "Preview"    scope sets VITE_FEATURE_INTERVIEW_PREP=true   → visible
 *   - Unset / missing / any non-exact-'true' value                       → hidden (fail closed, D-08)
 *
 * Do NOT use `import.meta.env.MODE` or `import.meta.env.PROD` here —
 * both equal `production` for every `vite build`, including preview/staging
 * builds, because Vite mode is set at build time, not by Vercel branch
 * routing (D-09).
 *
 * Strict string equality `=== 'true'` ensures that misconfigured values
 * such as `'TRUE'`, `'True'`, `'1'`, `'yes'`, `'on'`, the empty string,
 * or boolean `true` all fail closed.
 */
export function isInterviewPrepEnabled(): boolean {
  // Vite inlines this at build time; the comparison runs at runtime.
  // Strict string equality ensures 'TRUE' / '1' / 'yes' / true (bool) all fail closed.
  return import.meta.env.VITE_FEATURE_INTERVIEW_PREP === 'true';
}

/**
 * Phase 03 — Shared analysis-lifecycle gate (LIFE-09).
 *
 * Single source of truth for the analysis-lifecycle recovery surface
 * (useAnalysisRun). The hook early-returns an inert state when this is off, so
 * the whole substrate ships DORMANT in Phase 3 — no feature wires it until a
 * later phase flips the flag AND threads a run_id.
 *
 * Same fail-closed semantics as isInterviewPrepEnabled: only the exact lowercase
 * string 'true' enables. Anything else — undefined, '', 'false', 'True', 'TRUE',
 * '1', 'yes', 'on', boolean true — returns false. Do NOT use
 * import.meta.env.MODE / PROD here (both equal 'production' for every vite build,
 * including preview/staging).
 */
export function isAnalysisLifecycleEnabled(): boolean {
  return import.meta.env.VITE_FEATURE_ANALYSIS_LIFECYCLE === 'true';
}
