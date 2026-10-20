/**
 * network-status.ts — Phase 03 · 03-14 · XRUN-03 (defect register XD-19).
 *
 * THE connectivity and tab-visibility event source. At HEAD `src/` contained
 * ZERO `online`, `offline` and `visibilitychange` handlers, so an iOS user who
 * backgrounded the tab mid-analysis came back to a severed WebSocket and a
 * throttled timer with nothing forcing a catch-up. This module is the seam that
 * lets a surface notice.
 *
 * ── IT IS AN EVENT SOURCE, AND NOTHING ELSE ─────────────────────────────────
 * No `fetch`, no Supabase client, no run state, no timers of its own beyond the
 * coalescing clock. Deciding WHAT to re-fetch belongs to the surface that owns
 * the run; this file only says "something changed, now is a good moment". That
 * boundary is what keeps a global listener from ever being able to start network
 * work on a route that does not want it.
 *
 * ── ONE LISTENER PER EVENT, REFERENCE COUNTED (leak contract) ───────────────
 * Every subscriber shares ONE `window` `online`, ONE `window` `offline` and ONE
 * `document` `visibilitychange` registration. They are attached when the first
 * subscriber arrives and removed when the last one leaves, so a component that
 * mounts on many routes cannot accumulate handlers. `network-status.test.ts`
 * asserts the listener count returns to exactly zero.
 *
 * ── COALESCING EXISTS TO PREVENT A POLL STORM ───────────────────────────────
 * A laptop waking from sleep fires `online` and `visibilitychange -> visible`
 * within the same tick. Reacting to both means two immediate polls per open tab,
 * per surface — against an endpoint that every affected tab hits simultaneously.
 * `onCatchUp` is therefore the ONE coalesced signal: it fires at most once per
 * `CATCH_UP_COALESCE_MS`, no matter how many raw events arrive. `onOnline`,
 * `onOffline` and `onVisible` stay un-coalesced because they carry distinct
 * meaning (they drive UI state, not network work).
 *
 * ── NEVER THROWS ────────────────────────────────────────────────────────────
 * Every DOM touch and every subscriber callback is wrapped. A hostile or absent
 * `window` / `document`, and a subscriber that throws, must not be able to break
 * connectivity handling for anybody else.
 */

/** Window inside which `online` + `visible` collapse into ONE catch-up signal. */
export const CATCH_UP_COALESCE_MS = 400;

export interface NetworkStatus {
  /** `navigator.onLine`, defaulting to `true` when the API is absent. */
  online: boolean;
}

export interface NetworkStatusHandlers {
  /** The `online` event fired. State only — do the network work in `onCatchUp`. */
  onOnline?: () => void;
  /** The `offline` event fired. */
  onOffline?: () => void;
  /** `visibilitychange` fired AND `document.visibilityState === 'visible'`. */
  onVisible?: () => void;
  /**
   * THE coalesced "now is a good moment to re-check the server" signal, raised
   * by `online` and by a tab becoming visible. At most one per
   * `CATCH_UP_COALESCE_MS`.
   */
  onCatchUp?: () => void;
}

/**
 * Reads `navigator.onLine` defensively.
 *
 * DEFAULTS TO ONLINE ON PURPOSE. `navigator.onLine` is absent in some embedded
 * webviews and in non-DOM test environments; treating "I could not tell" as
 * "offline" would make the app announce a connectivity failure to a perfectly
 * connected user and suppress the very polling that would have recovered them.
 * A false "online" is harmless — the request simply fails and is retried.
 */
export function getNetworkStatus(): NetworkStatus {
  try {
    if (typeof navigator === 'undefined' || navigator === null) return { online: true };
    const value = (navigator as Navigator & { onLine?: unknown }).onLine;
    return { online: typeof value === 'boolean' ? value : true };
  } catch {
    return { online: true };
  }
}

// ── Shared registration (reference counted) ──────────────────────────────────

const subscribers = new Set<NetworkStatusHandlers>();

/** Timestamp of the last delivered catch-up. `0` means "never". */
let lastCatchUpAt = 0;

let listenersAttached = false;

/** Invokes one subscriber callback; a throwing subscriber never affects others. */
function invoke(handler: (() => void) | undefined): void {
  if (typeof handler !== 'function') return;
  try {
    handler();
  } catch {
    /* a subscriber's failure is its own — never this seam's */
  }
}

function emitCatchUp(): void {
  const now = Date.now();
  if (lastCatchUpAt !== 0 && now - lastCatchUpAt < CATCH_UP_COALESCE_MS) return;
  lastCatchUpAt = now;
  for (const subscriber of Array.from(subscribers)) invoke(subscriber.onCatchUp);
}

function handleOnline(): void {
  for (const subscriber of Array.from(subscribers)) invoke(subscriber.onOnline);
  emitCatchUp();
}

function handleOffline(): void {
  for (const subscriber of Array.from(subscribers)) invoke(subscriber.onOffline);
}

function handleVisibilityChange(): void {
  let visible = false;
  try {
    visible = typeof document !== 'undefined' && document.visibilityState === 'visible';
  } catch {
    visible = false;
  }
  // A tab going HIDDEN is not a signal anybody here needs: nothing should be
  // started for a tab the user cannot see.
  if (!visible) return;
  for (const subscriber of Array.from(subscribers)) invoke(subscriber.onVisible);
  emitCatchUp();
}

function attachListeners(): void {
  if (listenersAttached) return;
  listenersAttached = true;
  try {
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }
  } catch {
    /* a hostile or absent window degrades the seam; it never throws */
  }
  try {
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
  } catch {
    /* ignore */
  }
}

function detachListeners(): void {
  if (!listenersAttached) return;
  listenersAttached = false;
  try {
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Registers `handlers` and returns an unsubscribe.
 *
 * The returned function is idempotent — calling it twice must not decrement the
 * shared registration twice, which would tear listeners out from under a sibling
 * subscriber (the classic reference-counting bug).
 */
export function subscribeNetworkStatus(handlers: NetworkStatusHandlers): () => void {
  const entry: NetworkStatusHandlers = { ...handlers };
  subscribers.add(entry);
  attachListeners();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    subscribers.delete(entry);
    if (subscribers.size === 0) detachListeners();
  };
}

/** Test-only: drops every subscriber, detaches listeners, clears the clock. */
export function resetNetworkStatusForTests(): void {
  subscribers.clear();
  detachListeners();
  lastCatchUpAt = 0;
}
