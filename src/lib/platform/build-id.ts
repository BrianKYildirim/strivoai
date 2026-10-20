/**
 * build-id.ts — the single definition of "which build am I running?".
 *
 * Phase 03 (XDEV-07 / XLOG-01, D-18). One identity, three consumers:
 *   - plan 03-06 stamps it into the diagnostics `app_version` column,
 *   - plan 03-13 compares it against the deployed manifest to recover a stale
 *     bundle, and uses it as the reload loop-guard key and the `/?_v=` CTA,
 *   - the value itself is produced by `resolveBuildId()` in `vite.config.ts`.
 *
 * Posture: fail-closed and never-throws, matching `src/lib/analysis-error-log.ts`.
 * Nothing here may propagate an exception into a user code path — a diagnostics
 * or version-check failure must leave the app exactly as it was.
 *
 * This module deliberately installs NO event listeners and makes NO reload
 * decision. Listener installation and the recovery policy belong to plan 03-13;
 * keeping this a pure accessor + fetch helper means both consumers share one
 * definition instead of drifting apart.
 */

/** Returned when the build-time define is absent (vitest, SSR-like contexts). */
export const UNKNOWN_BUILD_ID = 'unknown';

/** Minimum spacing between deployed-version polls. */
export const VERSION_CHECK_MIN_INTERVAL_MS = 60_000;

/**
 * The build ID this bundle was compiled with.
 *
 * `__STRIVO_BUILD_ID__` is substituted by Vite's `define` at build time. The
 * `typeof` guard is required: under vitest the app config (and therefore the
 * define) is not applied, so a bare reference would throw a ReferenceError
 * rather than being `undefined`.
 */
export function getBuildId(): string {
  try {
    if (typeof __STRIVO_BUILD_ID__ === 'undefined') return UNKNOWN_BUILD_ID;
    const id = __STRIVO_BUILD_ID__;
    return typeof id === 'string' && id.length > 0 ? id : UNKNOWN_BUILD_ID;
  } catch {
    return UNKNOWN_BUILD_ID;
  }
}

/**
 * Fetch the build ID currently deployed, from `/version.json`.
 *
 * `cache: 'no-store'` is belt-and-braces with the `Cache-Control: no-store`
 * header set on the same path in `vercel.json`: either alone can be overridden,
 * and a stale manifest would report the old build forever and silently defeat
 * stale-bundle recovery.
 *
 * Returns `null` for EVERY unhappy outcome — network failure, non-2xx, a body
 * that is not JSON, a missing or empty `buildId`. It resolves; it never rejects,
 * and it never logs at error level. A caller that sees `null` must do nothing.
 */
export async function fetchDeployedBuildId(): Promise<string | null> {
  try {
    const res = await fetch('/version.json', { cache: 'no-store' });
    if (!res || !res.ok) return null;
    const body: unknown = await res.json();
    if (!body || typeof body !== 'object') return null;
    const id = (body as { buildId?: unknown }).buildId;
    return typeof id === 'string' && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

/**
 * Negative infinity, not 0, so the very first check is always due regardless of
 * the clock the caller passes.
 */
let lastVersionCheckMs = Number.NEGATIVE_INFINITY;

/**
 * Throttle gate for the version poll: at most one check per
 * VERSION_CHECK_MIN_INTERVAL_MS.
 *
 * Callers in plan 03-13 poll on `visibilitychange -> visible` and on route
 * change; without this an active session would issue a request per navigation
 * and become a self-inflicted load source. Calling this records the check, so
 * call it exactly once per candidate poll and act on the boolean.
 */
export function isVersionCheckDue(nowMs: number): boolean {
  if (nowMs - lastVersionCheckMs < VERSION_CHECK_MIN_INTERVAL_MS) return false;
  lastVersionCheckMs = nowMs;
  return true;
}

/** Test-only: clears the throttle so both sides of the window can be exercised. */
export function resetVersionCheckThrottleForTests(): void {
  lastVersionCheckMs = Number.NEGATIVE_INFINITY;
}
