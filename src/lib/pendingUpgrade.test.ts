/**
 * Quick 260718-j2x (amendment H-01) — pending-upgrade signal unit tests.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setPendingUpgrade, getPendingUpgrade, clearPendingUpgrade } from './pendingUpgrade';

const STORAGE_KEY = 'strivo:pendingUpgrade';
const WINDOW_MS = 30 * 60 * 1000;

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('pendingUpgrade', () => {
  it('set → get round-trips the tier', () => {
    setPendingUpgrade('elite');
    expect(getPendingUpgrade()).toBe('elite');
    setPendingUpgrade('pro');
    expect(getPendingUpgrade()).toBe('pro');
  });

  it('returns null when nothing is set', () => {
    expect(getPendingUpgrade()).toBeNull();
  });

  it('clear removes the flag', () => {
    setPendingUpgrade('elite');
    clearPendingUpgrade();
    expect(getPendingUpgrade()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('honors the 30-minute freshness window (boundary)', () => {
    const base = 1_000_000_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(base);
    setPendingUpgrade('elite');

    // Exactly at the window edge → still fresh.
    vi.setSystemTime(base + WINDOW_MS);
    expect(getPendingUpgrade()).toBe('elite');

    // One ms past the window → stale, cleared, null.
    vi.setSystemTime(base + WINDOW_MS + 1);
    // Re-set because the boundary read above did NOT clear it (still fresh); write again.
    vi.setSystemTime(base);
    setPendingUpgrade('elite');
    vi.setSystemTime(base + WINDOW_MS + 1);
    expect(getPendingUpgrade()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('malformed JSON → null and clears', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json');
    expect(getPendingUpgrade()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('unexpected shape (bad tier / missing ts) → null and clears', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tier: 'diamond', ts: Date.now() }));
    expect(getPendingUpgrade()).toBeNull();

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tier: 'elite' }));
    expect(getPendingUpgrade()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('is a safe no-op when localStorage is unavailable', () => {
    const original = globalThis.localStorage;
    // Simulate SSR / disabled storage.
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('localStorage is not available');
      },
    });
    try {
      expect(() => setPendingUpgrade('elite')).not.toThrow();
      expect(getPendingUpgrade()).toBeNull();
      expect(() => clearPendingUpgrade()).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: original,
      });
    }
  });
});
