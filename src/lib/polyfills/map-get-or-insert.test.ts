/**
 * Root-cause regression test for the production error:
 *
 *   TypeError: this.#t.getOrInsertComputed is not a function
 *       at messageHandler.sendWithPromise
 *
 * pdf.js (pdfjs-dist, via react-pdf) calls `Map.prototype.getOrInsertComputed`,
 * a TC39 proposal method absent from the browsers our users run. This test
 * reproduces the failure by removing the method, proves the exact same
 * "getOrInsertComputed is not a function" TypeError occurs, then proves the
 * polyfill restores correct behavior — the permanent fix.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installMapGetOrInsert } from './map-get-or-insert';

// The exact shape of pdf.js's failing call site (pdf.mjs:15801):
//   this.#methodPromises.getOrInsertComputed(name, () => messageHandler.sendWithPromise(...))
function pdfjsStyleMethodPromise<K, V>(
  methodPromises: Map<K, V>,
  name: K,
  compute: () => V,
): V {
  // @ts-expect-error — exercising the runtime method the browser may lack
  return methodPromises.getOrInsertComputed(name, compute);
}

const originalMapGOIC = (Map.prototype as unknown as Record<string, unknown>).getOrInsertComputed;
const originalMapGOI = (Map.prototype as unknown as Record<string, unknown>).getOrInsert;
const originalWeakGOIC = (WeakMap.prototype as unknown as Record<string, unknown>).getOrInsertComputed;
const originalWeakGOI = (WeakMap.prototype as unknown as Record<string, unknown>).getOrInsert;

function deleteMethods(): void {
  delete (Map.prototype as unknown as Record<string, unknown>).getOrInsertComputed;
  delete (Map.prototype as unknown as Record<string, unknown>).getOrInsert;
  delete (WeakMap.prototype as unknown as Record<string, unknown>).getOrInsertComputed;
  delete (WeakMap.prototype as unknown as Record<string, unknown>).getOrInsert;
}

afterEach(() => {
  // Restore whatever the environment originally had.
  const m = Map.prototype as unknown as Record<string, unknown>;
  const w = WeakMap.prototype as unknown as Record<string, unknown>;
  if (originalMapGOIC) m.getOrInsertComputed = originalMapGOIC; else delete m.getOrInsertComputed;
  if (originalMapGOI) m.getOrInsert = originalMapGOI; else delete m.getOrInsert;
  if (originalWeakGOIC) w.getOrInsertComputed = originalWeakGOIC; else delete w.getOrInsertComputed;
  if (originalWeakGOI) w.getOrInsert = originalWeakGOI; else delete w.getOrInsert;
});

describe('Map.getOrInsertComputed polyfill (pdf.js root cause)', () => {
  describe('reproduction: unsupported browser', () => {
    beforeEach(() => deleteMethods());

    it('throws the exact production error when the method is missing', () => {
      const methodPromises = new Map<string, Promise<string>>();
      expect(() =>
        pdfjsStyleMethodPromise(methodPromises, 'GetDocRequest', () => Promise.resolve('ok')),
      ).toThrow(/getOrInsertComputed is not a function/);
    });
  });

  describe('fix: polyfill installed', () => {
    beforeEach(() => {
      deleteMethods();
      installMapGetOrInsert();
    });

    it('restores getOrInsertComputed so the pdf.js call site succeeds', async () => {
      const methodPromises = new Map<string, Promise<string>>();
      const value = pdfjsStyleMethodPromise(methodPromises, 'GetDocRequest', () =>
        Promise.resolve('ok'),
      );
      await expect(value).resolves.toBe('ok');
    });

    it('computes and inserts once, then returns the cached value (no recompute)', () => {
      const map = new Map<string, number>();
      let calls = 0;
      // @ts-expect-error runtime method
      const first = map.getOrInsertComputed('k', () => { calls++; return 42; });
      // @ts-expect-error runtime method
      const second = map.getOrInsertComputed('k', () => { calls++; return 99; });
      expect(first).toBe(42);
      expect(second).toBe(42); // cached — callback not re-run
      expect(calls).toBe(1);
      expect(map.get('k')).toBe(42);
    });

    it('getOrInsert returns existing value or inserts the default', () => {
      const map = new Map<string, number>();
      // @ts-expect-error runtime method
      expect(map.getOrInsert('a', 1)).toBe(1);
      // @ts-expect-error runtime method
      expect(map.getOrInsert('a', 2)).toBe(1); // existing wins
      expect(map.get('a')).toBe(1);
    });

    it('works on WeakMap too (pdf.js caches keyed by object)', () => {
      const wm = new WeakMap<object, string>();
      const key = {};
      // @ts-expect-error runtime method
      expect(wm.getOrInsertComputed(key, () => 'v')).toBe('v');
      // @ts-expect-error runtime method
      expect(wm.getOrInsert(key, 'other')).toBe('v');
    });
  });

  describe('guard: native implementation is preserved', () => {
    it('does not overwrite an existing native method', () => {
      const sentinel = function sentinel() { return 'native'; };
      (Map.prototype as unknown as Record<string, unknown>).getOrInsertComputed = sentinel;
      installMapGetOrInsert();
      expect((Map.prototype as unknown as Record<string, unknown>).getOrInsertComputed).toBe(sentinel);
    });
  });
});
