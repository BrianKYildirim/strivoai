/**
 * Guards UI-SPEC Surface E's decision table (XDEV-07, D-18, D-19).
 *
 * The failures this file exists to prevent are all SILENT ones:
 *  - a detector that stops calling `preventDefault()` re-arms Vite's re-throw and
 *    puts XD-03's white screen straight back;
 *  - a loop guard that throws instead of degrading turns every restricted-storage
 *    browser (private-mode WebKit, locked-down enterprise profiles) into an
 *    infinite reload against a broken deploy — strictly worse than the defect;
 *  - a version poll that treats `null` as a mismatch reloads healthy users at
 *    random.
 *
 * `resetStaleBundleForTests()` clears MODULE state only, deliberately: leaving
 * `sessionStorage` intact is how a real cross-document reload is simulated here
 * (document 1 writes the guard, reloads; document 2 is a fresh module with the
 * same session store).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  LOOP_GUARD_WINDOW_MS,
  STALE_BUNDLE_GUARD_KEY,
  STALE_BUNDLE_URL_MARKER,
  checkDeployedVersion,
  installStaleBundleRecovery,
  isStaleReloading,
  resetStaleBundleForTests,
  type StaleBundleUnrecoverableReason,
} from './stale-bundle';
import { resetVersionCheckThrottleForTests, VERSION_CHECK_MIN_INTERVAL_MS } from './build-id';

type GlobalWithBuildId = typeof globalThis & { __STRIVO_BUILD_ID__?: unknown };
const g = globalThis as GlobalWithBuildId;
const hadBuildId = '__STRIVO_BUILD_ID__' in g;
const originalBuildId = g.__STRIVO_BUILD_ID__;

const BUILD_A = 'build-aaa';
const BUILD_B = 'build-bbb';

let reload: ReturnType<typeof vi.fn>;
let replace: ReturnType<typeof vi.fn>;
let unrecoverable: ReturnType<typeof vi.fn<(reason: StaleBundleUnrecoverableReason) => void>>;

/**
 * jsdom's `window.location` is not writable and navigation is unimplemented, so
 * the navigation surface is replaced wholesale with a stub carrying only the
 * fields this module reads.
 */
function stubLocation(href: string): void {
  const url = new URL(href);
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { href: url.toString(), search: url.search, reload, replace },
  });
}

function setOnline(online: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: online });
}

/**
 * A Map-backed `sessionStorage` whose accessors can be made to THROW.
 *
 * `vi.spyOn(window.sessionStorage, …)` does not work here: jsdom's Storage is a
 * Proxy whose methods live on the prototype, so the spy is silently ignored and
 * the restricted-storage branches would never be exercised — a green test over
 * an untested path, which is the exact failure this file exists to prevent.
 */
interface FakeSessionStorage {
  store: Map<string, string>;
  throwOnGet: boolean;
  throwOnSet: boolean;
}

let fakeStorage: FakeSessionStorage;

function installFakeSessionStorage(): void {
  fakeStorage = { store: new Map(), throwOnGet: false, throwOnSet: false };
  const blocked = (): never => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  };
  Object.defineProperty(window, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) =>
        fakeStorage.throwOnGet ? blocked() : (fakeStorage.store.get(key) ?? null),
      setItem: (key: string, value: string) => {
        if (fakeStorage.throwOnSet) blocked();
        fakeStorage.store.set(key, value);
      },
      removeItem: (key: string) => void fakeStorage.store.delete(key),
      clear: () => fakeStorage.store.clear(),
    },
  });
}

/** Dispatch the cancelable event Vite 8 emits for a failing dynamic import. */
function dispatchPreloadError(): Event {
  const event = new Event('vite:preloadError', { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  reload = vi.fn();
  replace = vi.fn();
  unrecoverable = vi.fn();
  g.__STRIVO_BUILD_ID__ = BUILD_A;
  installFakeSessionStorage();
  stubLocation('https://strivoai.net/career-compass?tab=skills#top');
  setOnline(true);
  resetStaleBundleForTests();
  resetVersionCheckThrottleForTests();
});

afterEach(() => {
  resetStaleBundleForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (hadBuildId) g.__STRIVO_BUILD_ID__ = originalBuildId;
  else delete g.__STRIVO_BUILD_ID__;
});

describe('vite:preloadError — the engine-independent detector (D-18)', () => {
  it('is inert before anything happens', () => {
    installStaleBundleRecovery(unrecoverable);
    expect(isStaleReloading()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(unrecoverable).not.toHaveBeenCalled();
  });

  it('cancels the event, engages recovery, records the guard and reloads once', () => {
    installStaleBundleRecovery(unrecoverable);

    const event = dispatchPreloadError();

    // preventDefault is what stops Vite re-throwing into App.tsx's single
    // boundary-less <Suspense> (XD-03).
    expect(event.defaultPrevented).toBe(true);
    expect(isStaleReloading()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
    expect(unrecoverable).not.toHaveBeenCalled();

    const record = JSON.parse(window.sessionStorage.getItem(STALE_BUNDLE_GUARD_KEY) ?? 'null');
    expect(record.buildId).toBe(BUILD_A);
    expect(typeof record.at).toBe('number');
  });

  it('makes exactly ONE decision per document, however many chunks fail', () => {
    installStaleBundleRecovery(unrecoverable);
    dispatchPreloadError();
    dispatchPreloadError();
    dispatchPreloadError();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('is idempotent — installing twice does not double-handle', () => {
    installStaleBundleRecovery(unrecoverable);
    installStaleBundleRecovery(unrecoverable);
    dispatchPreloadError();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('the loop guard (D-19)', () => {
  it('a SECOND failure for the same build inside the window falls back instead of reloading', () => {
    installStaleBundleRecovery(unrecoverable);
    dispatchPreloadError();
    expect(reload).toHaveBeenCalledTimes(1);

    // Simulate the reload: a fresh document, fresh module state, SAME session store.
    resetStaleBundleForTests();
    reload.mockClear();
    installStaleBundleRecovery(unrecoverable);

    dispatchPreloadError();

    expect(reload).not.toHaveBeenCalled();
    expect(unrecoverable).toHaveBeenCalledTimes(1);
    expect(unrecoverable).toHaveBeenCalledWith('loop-guard');
    // Still suppressed: the E2 fallback owns the viewport, not a boundary.
    expect(isStaleReloading()).toBe(true);
  });

  it('a failure for a DIFFERENT build id reloads — a new deploy gets a fresh chance', () => {
    installStaleBundleRecovery(unrecoverable);
    dispatchPreloadError();

    resetStaleBundleForTests();
    reload.mockClear();
    g.__STRIVO_BUILD_ID__ = BUILD_B;
    installStaleBundleRecovery(unrecoverable);

    dispatchPreloadError();

    expect(reload).toHaveBeenCalledTimes(1);
    expect(unrecoverable).not.toHaveBeenCalled();
  });

  it('a guard record older than the window no longer suppresses', () => {
    window.sessionStorage.setItem(
      STALE_BUNDLE_GUARD_KEY,
      JSON.stringify({ buildId: BUILD_A, at: Date.now() - LOOP_GUARD_WINDOW_MS - 1 }),
    );
    installStaleBundleRecovery(unrecoverable);

    dispatchPreloadError();

    expect(reload).toHaveBeenCalledTimes(1);
    expect(unrecoverable).not.toHaveBeenCalled();
  });

  it('a corrupt guard record is treated as absent, not as a reason to throw', () => {
    window.sessionStorage.setItem(STALE_BUNDLE_GUARD_KEY, '{not json');
    installStaleBundleRecovery(unrecoverable);

    expect(() => dispatchPreloadError()).not.toThrow();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('restricted storage — the guard degrades, it never throws', () => {
  function breakSessionStorageGetter(): void {
    fakeStorage.throwOnGet = true;
  }

  it('a throwing getItem falls back to the URL marker — absent marker still reloads', () => {
    breakSessionStorageGetter();
    installStaleBundleRecovery(unrecoverable);

    expect(() => dispatchPreloadError()).not.toThrow();
    expect(unrecoverable).not.toHaveBeenCalled();
    // setItem still works here, so the plain reload path is taken.
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('a throwing getItem falls back to the URL marker — matching marker trips the guard', () => {
    stubLocation(`https://strivoai.net/career-compass?${STALE_BUNDLE_URL_MARKER}=${BUILD_A}`);
    breakSessionStorageGetter();
    installStaleBundleRecovery(unrecoverable);

    dispatchPreloadError();

    expect(reload).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(unrecoverable).toHaveBeenCalledWith('loop-guard');
  });

  it('a marker for a DIFFERENT build does not trip the guard', () => {
    stubLocation(`https://strivoai.net/career-compass?${STALE_BUNDLE_URL_MARKER}=${BUILD_B}`);
    breakSessionStorageGetter();
    installStaleBundleRecovery(unrecoverable);

    dispatchPreloadError();

    expect(unrecoverable).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('a throwing setItem does not prevent the reload — it reloads via the URL marker', () => {
    fakeStorage.throwOnSet = true;
    installStaleBundleRecovery(unrecoverable);

    expect(() => dispatchPreloadError()).not.toThrow();
    // Without a persistable guard the marker IS the guard, so the navigation
    // must carry it — otherwise this browser loops forever.
    expect(reload).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(String(replace.mock.calls[0][0])).toContain(
      `${STALE_BUNDLE_URL_MARKER}=${BUILD_A}`,
    );
  });
});

describe('offline — reloading would be worse than the defect (XD-03)', () => {
  it('does not reload while offline; it hands over to the fallback', () => {
    setOnline(false);
    installStaleBundleRecovery(unrecoverable);

    dispatchPreloadError();

    expect(reload).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(unrecoverable).toHaveBeenCalledWith('offline');
    expect(isStaleReloading()).toBe(true);
    // Nothing was written: the tab has not consumed its one reload.
    expect(window.sessionStorage.getItem(STALE_BUNDLE_GUARD_KEY)).toBeNull();
  });
});

describe('checkDeployedVersion — no information is never a mismatch', () => {
  function stubVersionFetch(body: unknown | null, ok = true): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        body === null
          ? ({ ok: false, json: async () => ({}) } as unknown as Response)
          : ({ ok, json: async () => body } as unknown as Response),
      ),
    );
  }

  it('does nothing when the deployed id matches', async () => {
    stubVersionFetch({ buildId: BUILD_A });
    installStaleBundleRecovery(unrecoverable);

    await checkDeployedVersion(0);

    expect(reload).not.toHaveBeenCalled();
    expect(isStaleReloading()).toBe(false);
  });

  it('enters the SAME reload path on a mismatch', async () => {
    stubVersionFetch({ buildId: BUILD_B });
    installStaleBundleRecovery(unrecoverable);

    await checkDeployedVersion(0);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(isStaleReloading()).toBe(true);
  });

  it('treats a failed fetch as no information, never as a mismatch', async () => {
    stubVersionFetch(null);
    installStaleBundleRecovery(unrecoverable);

    await checkDeployedVersion(0);

    expect(reload).not.toHaveBeenCalled();
    expect(unrecoverable).not.toHaveBeenCalled();
  });

  it('throttles: a second poll inside the window never reaches the network', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ buildId: BUILD_A }),
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchSpy);
    installStaleBundleRecovery(unrecoverable);

    await checkDeployedVersion(0);
    await checkDeployedVersion(VERSION_CHECK_MIN_INTERVAL_MS - 1);

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await checkDeployedVersion(VERSION_CHECK_MIN_INTERVAL_MS);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('never polls while offline', async () => {
    const fetchSpy = vi.fn() as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchSpy);
    setOnline(false);
    installStaleBundleRecovery(unrecoverable);

    await checkDeployedVersion(0);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('never polls when the build define is missing — it could not compare anyway', async () => {
    const fetchSpy = vi.fn() as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchSpy);
    delete g.__STRIVO_BUILD_ID__;
    installStaleBundleRecovery(unrecoverable);

    await checkDeployedVersion(0);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
