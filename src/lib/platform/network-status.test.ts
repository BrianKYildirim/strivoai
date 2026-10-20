/**
 * Guards the 03-14 connectivity seam (XRUN-03 / defect register XD-19).
 *
 * The three failures this file exists to prevent are all invisible in a browser:
 *  - a listener LEAK. `Results.tsx` mounts on a route users open repeatedly; a
 *    seam that adds a `visibilitychange` handler per mount and removes none ends
 *    up firing N polls per tab wake-up. The zero-leak case asserts the count
 *    returns to exactly zero, not merely "decreases".
 *  - a lost COALESCE. `online` and `visibilitychange -> visible` arrive in the
 *    same tick when a laptop wakes; two catch-ups per tab is the poll storm the
 *    plan's threat model names.
 *  - `getNetworkStatus()` reporting OFFLINE for a missing API, which would make
 *    a perfectly connected user see an offline notice and suppress the polling
 *    that recovers them.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CATCH_UP_COALESCE_MS,
  getNetworkStatus,
  resetNetworkStatusForTests,
  subscribeNetworkStatus,
} from './network-status';

/**
 * Counts live registrations by wrapping the real add/remove. Counting is the
 * only honest way to assert absence: a spy on `addEventListener` alone cannot
 * distinguish "never added" from "added and removed".
 */
interface ListenerCounts {
  online: number;
  offline: number;
  visibilitychange: number;
}

let counts: ListenerCounts;
let restore: Array<() => void>;

function track(
  target: { addEventListener: (...args: never[]) => void; removeEventListener: (...args: never[]) => void },
  key: keyof ListenerCounts,
): void {
  const add = target.addEventListener;
  const remove = target.removeEventListener;
  const patchedAdd = function (this: unknown, type: string, ...rest: unknown[]) {
    if (type === key) counts[key] += 1;
    return (add as unknown as (...a: unknown[]) => void).call(this, type, ...rest);
  };
  const patchedRemove = function (this: unknown, type: string, ...rest: unknown[]) {
    if (type === key) counts[key] -= 1;
    return (remove as unknown as (...a: unknown[]) => void).call(this, type, ...rest);
  };
  (target as unknown as Record<string, unknown>).addEventListener = patchedAdd;
  (target as unknown as Record<string, unknown>).removeEventListener = patchedRemove;
  restore.push(() => {
    (target as unknown as Record<string, unknown>).addEventListener = add;
    (target as unknown as Record<string, unknown>).removeEventListener = remove;
  });
}

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
}

beforeEach(() => {
  resetNetworkStatusForTests();
  counts = { online: 0, offline: 0, visibilitychange: 0 };
  restore = [];
  track(window as unknown as Parameters<typeof track>[0], 'online');
  track(window as unknown as Parameters<typeof track>[0], 'offline');
  track(document as unknown as Parameters<typeof track>[0], 'visibilitychange');
  setVisibility('visible');
});

afterEach(() => {
  resetNetworkStatusForTests();
  for (const undo of restore.reverse()) undo();
  vi.useRealTimers();
});

// ── Registration + the zero-leak contract ───────────────────────────────────

describe('subscribeNetworkStatus registration', () => {
  it('registers exactly ONE listener per event type regardless of subscriber count', () => {
    const a = subscribeNetworkStatus({ onOnline: () => {} });
    const b = subscribeNetworkStatus({ onOffline: () => {} });
    const c = subscribeNetworkStatus({ onVisible: () => {} });

    expect(counts).toEqual({ online: 1, offline: 1, visibilitychange: 1 });

    a();
    b();
    c();
  });

  it('removes ALL listeners when the last subscriber detaches (zero leak)', () => {
    const a = subscribeNetworkStatus({ onCatchUp: () => {} });
    const b = subscribeNetworkStatus({ onCatchUp: () => {} });

    expect(counts).toEqual({ online: 1, offline: 1, visibilitychange: 1 });

    a();
    // Still one subscriber left — the shared registration must survive.
    expect(counts).toEqual({ online: 1, offline: 1, visibilitychange: 1 });

    b();
    expect(counts).toEqual({ online: 0, offline: 0, visibilitychange: 0 });
  });

  it('is idempotent: unsubscribing twice cannot tear listeners from a sibling', () => {
    const a = subscribeNetworkStatus({ onCatchUp: () => {} });
    const b = subscribeNetworkStatus({ onCatchUp: () => {} });

    a();
    a();
    a();
    expect(counts).toEqual({ online: 1, offline: 1, visibilitychange: 1 });

    b();
    expect(counts).toEqual({ online: 0, offline: 0, visibilitychange: 0 });
  });

  it('delivers nothing to a detached subscriber', () => {
    const onOnline = vi.fn();
    const unsubscribe = subscribeNetworkStatus({ onOnline });
    unsubscribe();

    window.dispatchEvent(new Event('online'));
    expect(onOnline).not.toHaveBeenCalled();
  });
});

// ── Event delivery ──────────────────────────────────────────────────────────

describe('event delivery', () => {
  it('fires onOffline for offline and onOnline for online', () => {
    const onOnline = vi.fn();
    const onOffline = vi.fn();
    const unsubscribe = subscribeNetworkStatus({ onOnline, onOffline });

    window.dispatchEvent(new Event('offline'));
    expect(onOffline).toHaveBeenCalledTimes(1);
    expect(onOnline).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('online'));
    expect(onOnline).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('fires onVisible ONLY when visibilityState is visible', () => {
    const onVisible = vi.fn();
    const unsubscribe = subscribeNetworkStatus({ onVisible });

    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onVisible).not.toHaveBeenCalled();

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onVisible).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('delivers to every subscriber, and one that throws cannot silence another', () => {
    const good = vi.fn();
    const bad = vi.fn(() => {
      throw new Error('subscriber blew up');
    });
    const first = subscribeNetworkStatus({ onOffline: bad });
    const second = subscribeNetworkStatus({ onOffline: good });

    expect(() => window.dispatchEvent(new Event('offline'))).not.toThrow();
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);

    first();
    second();
  });
});

// ── Coalescing (the anti-poll-storm contract) ───────────────────────────────

describe('catch-up coalescing', () => {
  it('produces ONE catch-up when online and visible fire together', () => {
    const onCatchUp = vi.fn();
    const unsubscribe = subscribeNetworkStatus({ onCatchUp });

    window.dispatchEvent(new Event('online'));
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(onCatchUp).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('coalesces ACROSS subscribers — three tabs-worth of handlers, one round', () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = subscribeNetworkStatus({ onCatchUp: a });
    const unsubB = subscribeNetworkStatus({ onCatchUp: b });

    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('online'));

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    unsubA();
    unsubB();
  });

  it('allows a further catch-up once the coalescing window has passed', () => {
    const onCatchUp = vi.fn();
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000);

    const unsubscribe = subscribeNetworkStatus({ onCatchUp });
    window.dispatchEvent(new Event('online'));
    expect(onCatchUp).toHaveBeenCalledTimes(1);

    now.mockReturnValue(1_000 + CATCH_UP_COALESCE_MS + 1);
    window.dispatchEvent(new Event('online'));
    expect(onCatchUp).toHaveBeenCalledTimes(2);

    unsubscribe();
    now.mockRestore();
  });

  it('does not raise a catch-up when the tab merely goes hidden', () => {
    const onCatchUp = vi.fn();
    const unsubscribe = subscribeNetworkStatus({ onCatchUp });

    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(onCatchUp).not.toHaveBeenCalled();
    unsubscribe();
  });
});

// ── getNetworkStatus ────────────────────────────────────────────────────────

describe('getNetworkStatus', () => {
  const original = Object.getOwnPropertyDescriptor(window.navigator, 'onLine');

  afterEach(() => {
    if (original) Object.defineProperty(window.navigator, 'onLine', original);
  });

  it('reports the browser value when present', () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
    expect(getNetworkStatus()).toEqual({ online: false });

    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true });
    expect(getNetworkStatus()).toEqual({ online: true });
  });

  it('DEFAULTS TO ONLINE when navigator.onLine is undefined', () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => undefined });
    expect(getNetworkStatus()).toEqual({ online: true });
  });

  it('DEFAULTS TO ONLINE when reading navigator.onLine throws', () => {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      get: () => {
        throw new Error('blocked');
      },
    });
    expect(getNetworkStatus()).toEqual({ online: true });
  });
});

// ── Hostile environment ─────────────────────────────────────────────────────

describe('degrades instead of throwing', () => {
  it('survives addEventListener being unavailable on window and document', () => {
    const windowAdd = window.addEventListener;
    const documentAdd = document.addEventListener;
    (window as unknown as Record<string, unknown>).addEventListener = undefined;
    (document as unknown as Record<string, unknown>).addEventListener = undefined;

    let unsubscribe: (() => void) | null = null;
    expect(() => {
      unsubscribe = subscribeNetworkStatus({ onCatchUp: () => {} });
    }).not.toThrow();
    expect(() => unsubscribe?.()).not.toThrow();

    (window as unknown as Record<string, unknown>).addEventListener = windowAdd;
    (document as unknown as Record<string, unknown>).addEventListener = documentAdd;
  });

  it('survives a subscriber registering no handlers at all', () => {
    const unsubscribe = subscribeNetworkStatus({});
    expect(() => {
      window.dispatchEvent(new Event('online'));
      window.dispatchEvent(new Event('offline'));
      document.dispatchEvent(new Event('visibilitychange'));
    }).not.toThrow();
    unsubscribe();
  });
});
