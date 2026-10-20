/**
 * Guards the never-throws contract of the storage probe (XDEV-04).
 *
 * The failure this file exists to prevent is the ORIGINAL defect resurfacing in
 * a new place: a bare `localStorage` reference outside a try/catch. Reading the
 * property throws `SecurityError` where site data is blocked, and that throw
 * white-screened the whole app from `supabaseClient.ts`. A capability probe that
 * could throw the same way would simply move the blank page rather than close
 * it, so the getter-throw case here is not a nicety — it is the point.
 *
 * The memoization and once-per-session cases matter for a subtler reason: this
 * probe is intended to be callable from a render path, and an unmemoized
 * synchronous write-read (or an uncapped diagnostic emit) called from a render
 * loop is its own failure mode.
 */
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import {
  probeLocalStorage,
  resetStorageProbeForTests,
  STORAGE_PROBE_KEY,
} from './storage-probe';
import { reportDiagnostic } from '../diagnostics/client-diagnostics';

vi.mock('../diagnostics/client-diagnostics', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../diagnostics/client-diagnostics')>();
  return { ...actual, reportDiagnostic: vi.fn() };
});

const reportDiagnosticMock = reportDiagnostic as unknown as Mock;

/**
 * jsdom defines `localStorage` as an accessor on the window. Capture whatever
 * descriptor is really there (own or inherited) so every override can be undone
 * exactly, rather than leaving a redefined global to leak into the next file.
 */
function currentDescriptor(): PropertyDescriptor | undefined {
  return (
    Object.getOwnPropertyDescriptor(window, 'localStorage') ??
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window), 'localStorage')
  );
}

const originalDescriptor = currentDescriptor();

function restoreLocalStorage(): void {
  if (originalDescriptor) {
    Object.defineProperty(window, 'localStorage', {
      ...originalDescriptor,
      configurable: true,
    });
  }
}

/** Replaces the `localStorage` getter; returns how many times it was read. */
function installGetter(get: () => Storage): { reads: () => number } {
  let reads = 0;
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      reads += 1;
      return get();
    },
  });
  return { reads: () => reads };
}

/** A minimal in-memory Storage stand-in with overridable methods. */
function makeStore(overrides: Partial<Storage> = {}): Storage {
  const map = new Map<string, string>();
  const store: Storage = {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    ...overrides,
  } as Storage;
  return store;
}

beforeEach(() => {
  resetStorageProbeForTests();
  reportDiagnosticMock.mockClear();
});

afterEach(() => {
  restoreLocalStorage();
  resetStorageProbeForTests();
});

describe('probeLocalStorage', () => {
  it('reports available when storage works, and leaves no probe key behind', () => {
    const store = makeStore();
    installGetter(() => store);

    expect(probeLocalStorage()).toBe('available');

    // The probe wrote exactly one key and removed it. A probe that littered the
    // origin with a recognisable key would be a fingerprinting surface.
    expect(store.getItem(STORAGE_PROBE_KEY)).toBeNull();
    expect(store.length).toBe(0);
    expect(reportDiagnosticMock).not.toHaveBeenCalled();
  });

  it('reports blocked WITHOUT THROWING when the localStorage getter itself throws', () => {
    // THE defect. `src/lib/supabaseClient.ts:16` did this outside a try/catch and
    // took the entire app down with it on 5/5 engines (XD-01).
    installGetter(() => {
      const error = new Error(
        "Failed to read the 'localStorage' property from 'Window': " +
          'Access is denied for this document.',
      );
      error.name = 'SecurityError';
      throw error;
    });

    expect(() => probeLocalStorage()).not.toThrow();
    resetStorageProbeForTests();
    expect(probeLocalStorage()).toBe('blocked');
  });

  it('reports blocked WITHOUT THROWING when setItem throws (Safari private browsing)', () => {
    installGetter(() =>
      makeStore({
        setItem: () => {
          const error = new Error('QuotaExceededError: The quota has been exceeded.');
          error.name = 'QuotaExceededError';
          throw error;
        },
      }),
    );

    expect(() => probeLocalStorage()).not.toThrow();
    resetStorageProbeForTests();
    expect(probeLocalStorage()).toBe('blocked');
  });

  it('reports blocked when the write is silently discarded (read-back mismatch)', () => {
    // Some privacy modes accept the write and drop it. Indistinguishable from
    // working storage until a session vanishes — unless the probe reads back.
    installGetter(() =>
      makeStore({
        setItem: () => {
          /* accepted and discarded */
        },
      }),
    );

    expect(probeLocalStorage()).toBe('blocked');
  });

  it('reports blocked when getItem throws', () => {
    installGetter(() =>
      makeStore({
        getItem: () => {
          throw new Error('nope');
        },
      }),
    );

    expect(() => probeLocalStorage()).not.toThrow();
    resetStorageProbeForTests();
    expect(probeLocalStorage()).toBe('blocked');
  });

  it('memoizes: the localStorage accessor is touched exactly once across many calls', () => {
    const store = makeStore();
    const { reads } = installGetter(() => store);

    expect(probeLocalStorage()).toBe('available');
    expect(probeLocalStorage()).toBe('available');
    expect(probeLocalStorage()).toBe('available');

    expect(reads()).toBe(1);
  });

  it('emits the storage_blocked diagnostic at most once per session', () => {
    installGetter(() => {
      throw new Error('denied');
    });

    probeLocalStorage();
    probeLocalStorage();
    probeLocalStorage();

    expect(reportDiagnosticMock).toHaveBeenCalledTimes(1);
    expect(reportDiagnosticMock).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'storage_blocked', surface: 'app-shell' }),
    );
  });

  it('passes the calling surface through to diagnostics', () => {
    installGetter(() => {
      throw new Error('denied');
    });

    probeLocalStorage('authentication');

    expect(reportDiagnosticMock).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'storage_blocked', surface: 'authentication' }),
    );
  });

  it('never lets a throwing diagnostics seam escape into the caller', () => {
    // Defence in depth: `reportDiagnostic` promises never to throw, but the probe
    // must not depend on that promise being kept.
    reportDiagnosticMock.mockImplementationOnce(() => {
      throw new Error('diagnostics exploded');
    });
    installGetter(() => {
      throw new Error('denied');
    });

    expect(() => probeLocalStorage()).not.toThrow();
    expect(probeLocalStorage()).toBe('blocked');
  });
});
