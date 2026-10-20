/**
 * storage-probe.ts — "is `localStorage` usable on this device?", for REPORTING ONLY.
 *
 * ── THIS MODULE MUST NEVER CONFIGURE THE SUPABASE AUTH CLIENT ───────────────
 * XDEV-04 / 03-RESEARCH Pitfall 1. `src/lib/supabaseClient.ts` used to pass a
 * `storage` option into `createClient`, and that single line white-screened the
 * app on 5/5 matrix engines (XD-01) *and* short-circuited the fallback
 * `@supabase/auth-js` already implements (XD-02). The fix was to DELETE the
 * option, not to replace it with a better probe. A hand-rolled `StorageAdapter`
 * would have to get the getter throw, the write throw, quota and partitioned
 * storage right — auth-js's `supportsLocalStorage()` already does, memoized —
 * and a worse copy would be a permanent liability. So: nothing in this file is
 * imported by `supabaseClient.ts`, and nothing in this file returns an adapter.
 *
 * What it IS for: the capability tier (plan 03-11) and the diagnostics stream
 * (plan 03-06) both need to KNOW that storage is restricted, so the user can be
 * told "your session will not survive a reload in this browser" instead of
 * experiencing it as random logouts. Plan 03-12 renders the `CLIENT_STORAGE_BLOCKED`
 * copy from this signal.
 *
 * Posture: never throws, memoized for the session, reports at most once.
 *
 * PRIVACY: the probe writes ONE short, fixed, non-identifying key and removes it
 * immediately. It never writes anything derived from user data or the session,
 * and it never reads, returns or logs any other key's value — a probe key that
 * encoded anything about the user would be readable by every script on the
 * origin, including an extension.
 */
import {
  reportDiagnostic,
  type DiagnosticSurface,
} from '../diagnostics/client-diagnostics';

/** The two outcomes. Deliberately not a boolean, so call sites read as prose. */
export type StorageAvailability = 'available' | 'blocked';

/**
 * The one key written. Short, fixed and non-identifying by design (see the
 * PRIVACY note above). Namespaced so it is recognisable if a probe ever fails
 * to clean up after itself.
 */
export const STORAGE_PROBE_KEY = '__strivo_sp';

/** The value round-tripped. A constant: it must not encode a clock or an id. */
const STORAGE_PROBE_VALUE = '1';

let cachedResult: StorageAvailability | undefined;
let hasReported = false;

/**
 * The actual round trip, entirely inside ONE try/catch.
 *
 * Both throw sites are covered on purpose because they are genuinely different
 * failures: reading the `localStorage` PROPERTY throws `SecurityError` where
 * site data is blocked, while the property reads fine but `setItem` throws
 * `QuotaExceededError` in Safari private browsing (quota ~0). A probe that only
 * handled one of them would report `available` for the other and be worse than
 * no probe at all.
 *
 * A read-back MISMATCH also counts as blocked: some privacy modes accept the
 * write and silently discard it, which is indistinguishable from working
 * storage until a session is lost.
 */
function runProbe(): StorageAvailability {
  try {
    if (typeof window === 'undefined') return 'blocked';

    // May throw on property ACCESS alone — this line is the whole reason the
    // try/catch wraps the property read and not just the write.
    const store = window.localStorage;
    if (!store || typeof store.setItem !== 'function') return 'blocked';

    store.setItem(STORAGE_PROBE_KEY, STORAGE_PROBE_VALUE);
    const readBack = store.getItem(STORAGE_PROBE_KEY);
    store.removeItem(STORAGE_PROBE_KEY);

    return readBack === STORAGE_PROBE_VALUE ? 'available' : 'blocked';
  } catch {
    return 'blocked';
  }
}

/**
 * Returns whether `localStorage` is usable, memoized for the page session.
 *
 * Memoized for two reasons: a capability signal that costs a synchronous
 * write-read on every render is a performance defect, and an unmemoized probe
 * called from a render loop would emit a diagnostic per frame. The first
 * `'blocked'` result — and only the first — is reported once as
 * `storage_blocked`; `reportDiagnostic` is fire-and-forget and cannot throw, so
 * this function's never-throws contract holds regardless.
 *
 * @param surface Which audit surface asked. Defaults to the app shell, since the
 *                earliest caller is boot, before any feature surface exists.
 */
export function probeLocalStorage(
  surface: DiagnosticSurface = 'app-shell',
): StorageAvailability {
  if (cachedResult !== undefined) return cachedResult;

  cachedResult = runProbe();

  if (cachedResult === 'blocked' && !hasReported) {
    hasReported = true;
    // Defence in depth. `reportDiagnostic` promises never to throw, but a probe
    // whose never-throws contract DEPENDS on another module keeping its promise
    // does not really have one — and this probe is called from boot.
    try {
      reportDiagnostic({
        surface,
        stage: 'capability-gate',
        category: 'storage_blocked',
      });
    } catch {
      /* a diagnostics failure must never become the user's failure */
    }
  }

  return cachedResult;
}

/** Test-only: clears the memoized result and the once-per-session report latch. */
export function resetStorageProbeForTests(): void {
  cachedResult = undefined;
  hasReported = false;
}
