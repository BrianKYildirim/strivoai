/**
 * stale-bundle.ts — UI-SPEC Surface E (XDEV-07, D-18, D-19), defects XD-03 / XD-15.
 *
 * THE PROBLEM. `vercel.json` rewrites every path to `index.html`, so a chunk the
 * open tab was about to load — deleted by a redeploy — comes back as
 * `200 text/html` rather than a 404. Each engine reports that differently — the
 * three divergent message shapes are catalogued in 03-RESEARCH.md § Common
 * Pitfalls, Pitfall 3, and are deliberately NOT transcribed here: they differ
 * per engine AND per version, so a copy of them in source is a detector that
 * silently rots. The detector here is NEVER an `error.message` regex. It is
 * Vite 8's
 * `vite:preloadError`, a CANCELABLE `window` event dispatched by `__vitePreload`
 * for every failing dynamic import on every engine (D-18).
 *
 * ── WHY preventDefault() FORCES THE BOUNDARY SUPPRESSION ────────────────────
 * `__vitePreload` re-throws the original error unless the event was
 * `defaultPrevented`. Calling `preventDefault()` stops the uncaught throw — which
 * at HEAD unmounted the entire tree, because `src/App.tsx` wraps 20+ `lazy()`
 * routes in ONE `<Suspense>` with no boundary above it (XD-03: a white screen on
 * 5/5 projects). But it also means `__vitePreload` resolves `undefined`, so
 * `React.lazy` reads `undefined.default` and throws a DIFFERENT error on the next
 * microtask. That second throw could paint one frame of an error-boundary
 * fallback before the navigation commits, and UI-SPEC E1 forbids any such frame.
 * `isStaleReloading()` is the deterministic fix: both boundaries render `null`
 * once recovery has taken control of the document. Racing the navigation is not
 * an acceptable substitute.
 *
 * ── THE ROUTE AND THE RUN SURVIVE FOR FREE ──────────────────────────────────
 * `location.reload()` preserves `pathname`, `search` and `hash`, and the active
 * run id already persists under `ANALYSIS_RUN_STORAGE_KEY`
 * (`src/hooks/useAnalysisRun.ts`, `strivio.analysis.run_id`) in `localStorage`,
 * which survives a reload. This module therefore writes NO run state of its own —
 * adding redundant persistence here would create a second, drifting copy of the
 * one fact that must stay true for XRUN-03 recovery to restore in-flight work.
 *
 * Posture: fail-closed and never-throws, like its `build-id.ts` sibling. Nothing
 * here may propagate an exception into a user code path, and no branch returns,
 * stores or renders text taken from the underlying error (XRUN-06).
 */
import {
  UNKNOWN_BUILD_ID,
  fetchDeployedBuildId,
  getBuildId,
  isVersionCheckDue,
} from './build-id';

/** `sessionStorage` key holding the single "we already reloaded" record. */
export const STALE_BUNDLE_GUARD_KEY = 'strivio.stale_bundle.reload';

/**
 * URL query parameter used as the loop guard of last resort, and as the E2
 * fallback's cache-busting CTA target (`/?_v={buildId}`).
 */
export const STALE_BUNDLE_URL_MARKER = '_v';

/**
 * How long a recorded reload suppresses another one for the SAME build id. Long
 * enough that a genuinely broken deploy cannot spin the browser; short enough
 * that a later, unrelated chunk failure in the same session still recovers.
 */
export const LOOP_GUARD_WINDOW_MS = 60_000;

/**
 * Why recovery could not be attempted. Both values select FROZEN-TABLE copy in
 * `StaleBundleFallback`; neither is ever rendered as-is.
 *  - `loop-guard` — we already reloaded for this build id and it is still broken.
 *  - `offline`    — reloading while offline replaces the app with the BROWSER's
 *                   own error page, which is strictly worse than staying put and
 *                   saying something true.
 */
export type StaleBundleUnrecoverableReason = 'loop-guard' | 'offline';

// ── Module state ─────────────────────────────────────────────────────────────

/**
 * True once recovery has taken control of the document — either a reload is in
 * flight, or the fallback owns the viewport. Read by both error boundaries via
 * `isStaleReloading()` / `isStaleReloadInProgress()`.
 */
let recoveryEngaged = false;

/** Exactly one recovery decision is made per document. */
let decided = false;

let installed = false;

let onUnrecoverable: ((reason: StaleBundleUnrecoverableReason) => void) | null = null;

/**
 * UI-SPEC E1. `true` from the instant a stale bundle is detected: an error
 * boundary must render `null` rather than a fallback frame, because the document
 * is either about to be replaced or is about to be taken over by Surface E2.
 */
export function isStaleReloading(): boolean {
  return recoveryEngaged;
}

// ── Loop guard ───────────────────────────────────────────────────────────────

interface GuardRecord {
  buildId: string;
  at: number;
}

/**
 * Does the URL already carry our marker for this build?
 *
 * This is the guard of LAST RESORT, used when `sessionStorage` is unavailable —
 * private-mode WebKit, partitioned third-party contexts, and the locked-down
 * enterprise profiles this phase exists to serve all throw on mere property
 * access. Never throws itself.
 */
function hasUrlMarkerFor(buildId: string): boolean {
  try {
    const search = typeof window !== 'undefined' ? window.location?.search : '';
    return new URLSearchParams(search ?? '').get(STALE_BUNDLE_URL_MARKER) === buildId;
  } catch {
    return false;
  }
}

/**
 * Have we already reloaded once for this exact build inside the window?
 *
 * ANY throw — a blocked `sessionStorage` getter, a quota error, a corrupt or
 * hand-edited value that fails `JSON.parse` — degrades to the URL marker rather
 * than propagating into the reload path.
 */
function hasAlreadyReloadedFor(buildId: string): boolean {
  try {
    const raw = window.sessionStorage.getItem(STALE_BUNDLE_GUARD_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<GuardRecord> | null;
    if (!parsed || typeof parsed.buildId !== 'string' || typeof parsed.at !== 'number') {
      return false;
    }
    if (parsed.buildId !== buildId) return false;
    return Date.now() - parsed.at < LOOP_GUARD_WINDOW_MS;
  } catch {
    return hasUrlMarkerFor(buildId);
  }
}

/**
 * Record the reload we are about to perform.
 *
 * Returns `false` when the record could not be persisted, which is the signal to
 * reload via the URL marker instead — otherwise a restricted-storage browser
 * would have NO guard at all and would loop forever against a broken deploy.
 * Never throws.
 */
function rememberReload(buildId: string): boolean {
  try {
    const record: GuardRecord = { buildId, at: Date.now() };
    window.sessionStorage.setItem(STALE_BUNDLE_GUARD_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

// ── Reload ───────────────────────────────────────────────────────────────────

/** `navigator.onLine` read defensively: a missing API must never claim offline. */
function isOffline(): boolean {
  try {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  } catch {
    return false;
  }
}

/**
 * The reload itself. Called SYNCHRONOUSLY from the detector, which is well
 * inside D-19's 250ms budget and leaves the smallest possible window for a
 * fallback frame. `location.reload()` preserves pathname + search + hash.
 *
 * When the `sessionStorage` guard could not be written we navigate to the same
 * URL carrying `_v={buildId}` instead, so the loop guard still has somewhere to
 * live. That single added query parameter is the deliberate cost of not looping
 * forever in a restricted-storage browser.
 */
function reloadNow(buildId: string, guardPersisted: boolean): void {
  try {
    if (guardPersisted) {
      window.location.reload();
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set(STALE_BUNDLE_URL_MARKER, buildId);
    window.location.replace(url.toString());
  } catch {
    // A reload we could not perform must not take the app down with it. The
    // boundaries stay suppressed and the fallback (already notified below on the
    // unrecoverable paths) or the existing UI remains.
  }
}

/**
 * THE one recovery decision, shared by the `vite:preloadError` detector and the
 * deployed-version poll so the two can never diverge.
 */
function enterRecovery(): void {
  if (decided) return;
  decided = true;

  // Set BEFORE anything else can render: from here on, no boundary may paint.
  recoveryEngaged = true;

  const buildId = getBuildId();

  if (hasAlreadyReloadedFor(buildId)) {
    notifyUnrecoverable('loop-guard');
    return;
  }

  if (isOffline()) {
    // XD-03. A reload while offline yields the browser's own error page and
    // loses the SPA entirely; the honest move is to keep the document and say
    // so. The connectivity seam that recovers from this is plan 03-14's.
    notifyUnrecoverable('offline');
    return;
  }

  const guardPersisted = rememberReload(buildId);
  reloadNow(buildId, guardPersisted);
}

function notifyUnrecoverable(reason: StaleBundleUnrecoverableReason): void {
  try {
    onUnrecoverable?.(reason);
  } catch {
    // The fallback failing to render must not re-enter the error path.
  }
}

// ── Deployed-version poll ────────────────────────────────────────────────────

/**
 * Compare the build this bundle was compiled with against the one currently
 * deployed, and enter the SAME reload path on a mismatch.
 *
 * Every unhappy outcome is "no information", never a mismatch: `null` from
 * `fetchDeployedBuildId()` (offline, non-2xx, malformed JSON) and an `unknown`
 * local id both return without acting. Throttled by `isVersionCheckDue()` to at
 * most one request per 60s so an active session cannot become a self-inflicted
 * load source. Resolves; never rejects.
 *
 * Exported so the router can call it on route change (plan 03-14 owns that
 * wiring); it is also registered on `visibilitychange -> visible`.
 */
export async function checkDeployedVersion(nowMs: number = Date.now()): Promise<void> {
  try {
    if (decided) return;
    if (isOffline()) return;
    const current = getBuildId();
    if (current === UNKNOWN_BUILD_ID) return;
    if (!isVersionCheckDue(nowMs)) return;

    const deployed = await fetchDeployedBuildId();
    if (deployed === null) return;
    if (deployed === current) return;

    enterRecovery();
  } catch {
    // A version check can never be the reason something broke.
  }
}

// ── Installation ─────────────────────────────────────────────────────────────

function handlePreloadError(event: Event): void {
  try {
    // Suppress Vite's re-throw. Without this the rejected dynamic import escapes
    // App.tsx's single boundary-less <Suspense> and unmounts the whole tree.
    event.preventDefault();
  } catch {
    /* a non-cancelable event cannot be prevented; recovery proceeds regardless */
  }
  enterRecovery();
}

function handleVisibilityChange(): void {
  try {
    if (document.visibilityState !== 'visible') return;
    void checkDeployedVersion();
  } catch {
    /* never throws */
  }
}

/**
 * Idempotent. Install once, from `src/main.tsx`, BEFORE the first render — a
 * chunk that fails during the very first route resolution must already be
 * covered.
 *
 * `onUnrecoverableFailure` is called at most once, with the reason, when
 * recovery cannot be attempted. `src/main.tsx` renders UI-SPEC Surface E2 from
 * it into the SAME React root, which is what keeps `#root` non-empty (XD-03) and
 * guarantees exactly ONE surface is on screen.
 */
export function installStaleBundleRecovery(
  onUnrecoverableFailure: (reason: StaleBundleUnrecoverableReason) => void,
): void {
  onUnrecoverable = onUnrecoverableFailure;
  if (installed) return;
  installed = true;

  try {
    window.addEventListener('vite:preloadError', handlePreloadError);
    document.addEventListener('visibilitychange', handleVisibilityChange);
  } catch {
    // No listener support means no recovery, but never a failed boot.
  }
}

/** Test-only: clears module state AND the installed listeners. */
export function resetStaleBundleForTests(): void {
  recoveryEngaged = false;
  decided = false;
  onUnrecoverable = null;
  if (installed) {
    try {
      window.removeEventListener('vite:preloadError', handlePreloadError);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    } catch {
      /* ignore */
    }
    installed = false;
  }
}
