/**
 * Guards the fail-closed contract of the Phase 03 build identity (D-18).
 *
 * The realistic failure this file exists to prevent is a SILENT one: if
 * `getBuildId()` ever returned an empty string, `app_version` becomes useless
 * in diagnostics AND the version comparison in plan 03-13 always matches,
 * disabling stale-bundle recovery without anything going red. Likewise, if
 * `fetchDeployedBuildId()` could reject, a background version poll would throw
 * into a user code path over nothing more than a flaky network.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getBuildId,
  fetchDeployedBuildId,
  isVersionCheckDue,
  resetVersionCheckThrottleForTests,
  UNKNOWN_BUILD_ID,
  VERSION_CHECK_MIN_INTERVAL_MS,
} from './build-id';

type GlobalWithBuildId = typeof globalThis & { __STRIVO_BUILD_ID__?: unknown };

const g = globalThis as GlobalWithBuildId;
const hadBuildId = '__STRIVO_BUILD_ID__' in g;
const originalBuildId = g.__STRIVO_BUILD_ID__;

function setGlobalBuildId(value: unknown): void {
  g.__STRIVO_BUILD_ID__ = value;
}

function deleteGlobalBuildId(): void {
  delete g.__STRIVO_BUILD_ID__;
}

afterEach(() => {
  if (hadBuildId) g.__STRIVO_BUILD_ID__ = originalBuildId;
  else deleteGlobalBuildId();
  vi.unstubAllGlobals();
});

describe('getBuildId', () => {
  it('returns the build-time define when it is present', () => {
    setGlobalBuildId('abc123def456');
    expect(getBuildId()).toBe('abc123def456');
  });

  it("returns 'unknown' and does not throw when the define is absent", () => {
    deleteGlobalBuildId();
    // A bare reference to an undeclared global throws ReferenceError, not
    // undefined — the typeof guard in the module is what prevents that.
    expect(() => getBuildId()).not.toThrow();
    expect(getBuildId()).toBe(UNKNOWN_BUILD_ID);
  });

  it("returns 'unknown' rather than an empty string when the define is empty", () => {
    setGlobalBuildId('');
    expect(getBuildId()).toBe(UNKNOWN_BUILD_ID);
  });

  it("returns 'unknown' when the define is not a string", () => {
    setGlobalBuildId(12345);
    expect(getBuildId()).toBe(UNKNOWN_BUILD_ID);
  });

  it('never returns an empty string', () => {
    for (const value of ['', null, undefined, 0, {}, 'real-id']) {
      setGlobalBuildId(value);
      expect(getBuildId().length).toBeGreaterThan(0);
    }
  });
});

describe('fetchDeployedBuildId', () => {
  function stubFetch(impl: () => Promise<unknown>): void {
    vi.stubGlobal('fetch', vi.fn(impl));
  }

  it('returns the id from a well-formed response', async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ buildId: 'deployed-42' }) }));
    await expect(fetchDeployedBuildId()).resolves.toBe('deployed-42');
  });

  it("requests /version.json with cache: 'no-store'", async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ buildId: 'x' }) }));
    await fetchDeployedBuildId();
    expect(fetch).toHaveBeenCalledWith('/version.json', { cache: 'no-store' });
  });

  it('RESOLVES to null (never rejects) when fetch rejects', async () => {
    stubFetch(() => Promise.reject(new Error('network down')));
    // The assertion that matters: `.resolves`, not `.rejects`. A rejection here
    // would propagate into whatever user code path triggered the poll.
    await expect(fetchDeployedBuildId()).resolves.toBeNull();
  });

  it('returns null on a non-2xx response', async () => {
    stubFetch(async () => ({ ok: false, status: 500, json: async () => ({ buildId: 'nope' }) }));
    await expect(fetchDeployedBuildId()).resolves.toBeNull();
  });

  it('returns null when the body is not JSON', async () => {
    stubFetch(async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON at position 0');
      },
    }));
    await expect(fetchDeployedBuildId()).resolves.toBeNull();
  });

  it('returns null when buildId is missing', async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ commit: 'abc' }) }));
    await expect(fetchDeployedBuildId()).resolves.toBeNull();
  });

  it('returns null when buildId is an empty string', async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ buildId: '' }) }));
    await expect(fetchDeployedBuildId()).resolves.toBeNull();
  });

  it('returns null when buildId is not a string', async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ buildId: 7 }) }));
    await expect(fetchDeployedBuildId()).resolves.toBeNull();
  });

  it('returns null when the JSON body is null', async () => {
    stubFetch(async () => ({ ok: true, json: async () => null }));
    await expect(fetchDeployedBuildId()).resolves.toBeNull();
  });
});

describe('isVersionCheckDue throttle', () => {
  beforeEach(() => {
    resetVersionCheckThrottleForTests();
  });

  it('allows the first check', () => {
    expect(isVersionCheckDue(1_000_000)).toBe(true);
  });

  it('blocks a second check inside the interval', () => {
    const t0 = 1_000_000;
    expect(isVersionCheckDue(t0)).toBe(true);
    expect(isVersionCheckDue(t0 + 1)).toBe(false);
    expect(isVersionCheckDue(t0 + VERSION_CHECK_MIN_INTERVAL_MS - 1)).toBe(false);
  });

  it('allows a check once the interval has elapsed', () => {
    const t0 = 1_000_000;
    expect(isVersionCheckDue(t0)).toBe(true);
    expect(isVersionCheckDue(t0 + VERSION_CHECK_MIN_INTERVAL_MS)).toBe(true);
  });

  it('re-arms the throttle from the accepted check, not the blocked one', () => {
    const t0 = 1_000_000;
    expect(isVersionCheckDue(t0)).toBe(true);
    expect(isVersionCheckDue(t0 + 30_000)).toBe(false);
    // 30s after the blocked attempt is still inside the window opened at t0.
    expect(isVersionCheckDue(t0 + 59_999)).toBe(false);
    expect(isVersionCheckDue(t0 + 60_000)).toBe(true);
  });

  it('enforces a 60s minimum interval', () => {
    expect(VERSION_CHECK_MIN_INTERVAL_MS).toBe(60_000);
  });
});
