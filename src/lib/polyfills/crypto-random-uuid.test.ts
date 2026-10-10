/**
 * Root-cause regression test for defect XD-16 (XDEV-03 / D-09):
 *
 *   TypeError: crypto.randomUUID is not a function
 *
 * Six money-path submit handlers call `crypto.randomUUID()` unguarded to mint the
 * `attemptNonce` that guards Merit idempotency. The method requires a secure context
 * and is absent before Safari 15.4 / Firefox 95 / Chrome 92, so on those browsers the
 * submit aborts before a request is ever built. This test reproduces the failure by
 * removing the method, proves the polyfill restores a correct RFC 4122 v4 generator,
 * and — critically — proves it does NOT invent randomness it does not have.
 *
 * NON-VACUITY NOTE (the thing that makes this test worth having): jsdom and Node BOTH
 * ship `crypto.randomUUID`, so a test that merely called it would pass while proving
 * nothing. Worse, `randomUUID` is inherited from `Crypto.prototype` rather than being
 * an own property, so the obvious `delete crypto.randomUUID` is a silent NO-OP and
 * would leave the native method in place. Every case below therefore SHADOWS the
 * property with an own `undefined` via `defineProperty`, and asserts the shadow
 * actually took effect before exercising the installer.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { installCryptoRandomUUID, uuidV4FromRandomValues } from './crypto-random-uuid';

const CANONICAL_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type MutableCrypto = Record<string, unknown>;

function cryptoObj(): MutableCrypto {
  return globalThis.crypto as unknown as MutableCrypto;
}

/** Shadow an inherited Crypto member with an own `undefined` (delete cannot). */
function hide(name: 'randomUUID' | 'getRandomValues'): void {
  Object.defineProperty(cryptoObj(), name, {
    value: undefined,
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

/** Drop the own shadow so the native prototype member is visible again. */
function unhide(name: 'randomUUID' | 'getRandomValues'): void {
  delete cryptoObj()[name];
}

afterEach(() => {
  // Remove any own property this test (or the installer) added, restoring the
  // environment's native inherited implementations for every other suite.
  unhide('randomUUID');
  unhide('getRandomValues');
});

describe('crypto.randomUUID polyfill (XD-16 money-path nonce)', () => {
  describe('reproduction: unsupported browser', () => {
    it('throws the exact production error when the method is missing', () => {
      hide('randomUUID');
      // The shadow must genuinely take effect, or the reproduction is fake.
      expect(typeof cryptoObj().randomUUID).not.toBe('function');

      // The shape of the six money-path call sites, e.g. Upload.tsx:281. Note the
      // DOM lib types `randomUUID` as always present — which is precisely why the
      // compiler never flagged these six sites and the defect reached production.
      expect(() => {
        const attemptNonce: string = crypto.randomUUID();
        return attemptNonce;
      }).toThrow(/randomUUID is not a function/);
    });
  });

  describe('fix: polyfill installed', () => {
    it('installs a function returning a canonical v4 UUID', () => {
      hide('randomUUID');
      installCryptoRandomUUID();

      expect(typeof cryptoObj().randomUUID).toBe('function');
      expect(crypto.randomUUID()).toMatch(CANONICAL_V4);
    });

    it('sets the version nibble to 4 and the variant nibble to 8/9/a/b', () => {
      hide('randomUUID');
      installCryptoRandomUUID();

      // Assert the RFC 4122 bit-fiddling specifically, not merely the length —
      // a generator that emitted 36 random hex chars would pass a length check
      // and still be a non-conforming UUID.
      for (let i = 0; i < 200; i++) {
        const uuid = crypto.randomUUID();
        expect(uuid).toHaveLength(36);
        expect(uuid.charAt(14)).toBe('4');
        expect('89ab').toContain(uuid.charAt(19));
        expect(uuid).toBe(uuid.toLowerCase());
      }
    });

    it('produces 1000 distinct values (a colliding nonce would merge two Merit attempts)', () => {
      hide('randomUUID');
      installCryptoRandomUUID();

      const seen = new Set<string>();
      for (let i = 0; i < 1000; i++) seen.add(crypto.randomUUID());
      expect(seen.size).toBe(1000);
    });

    it('is idempotent — a second install does not replace the first', () => {
      hide('randomUUID');
      installCryptoRandomUUID();
      const first = cryptoObj().randomUUID;

      installCryptoRandomUUID();
      expect(cryptoObj().randomUUID).toBe(first);
    });

    it('installs non-enumerably, writable and configurable', () => {
      hide('randomUUID');
      installCryptoRandomUUID();

      const descriptor = Object.getOwnPropertyDescriptor(cryptoObj(), 'randomUUID');
      expect(descriptor).toBeDefined();
      expect(descriptor?.enumerable).toBe(false);
      expect(descriptor?.writable).toBe(true);
      expect(descriptor?.configurable).toBe(true);
      // Non-enumerable so the polyfill cannot leak into a spread/serialization of
      // the crypto object, matching the map-get-or-insert descriptor exactly.
      expect(Object.keys(cryptoObj())).not.toContain('randomUUID');
    });
  });

  describe('guard: native implementation is preserved', () => {
    it('does not overwrite an existing native method', () => {
      const sentinel = function sentinel(): string {
        return 'native';
      };
      Object.defineProperty(cryptoObj(), 'randomUUID', {
        value: sentinel,
        writable: true,
        configurable: true,
        enumerable: false,
      });

      installCryptoRandomUUID();

      expect(cryptoObj().randomUUID).toBe(sentinel);
      expect(crypto.randomUUID()).toBe('native');
    });
  });

  describe('guard: no dishonest entropy (D-09 — block rather than fake)', () => {
    it('installs NOTHING when crypto.getRandomValues is also absent, and does not throw', () => {
      hide('randomUUID');
      hide('getRandomValues');
      expect(typeof cryptoObj().getRandomValues).not.toBe('function');

      expect(() => installCryptoRandomUUID()).not.toThrow();

      // The load-bearing assertion: `randomUUID` must remain UNDEFINED. A
      // Math.random fallback here would silently weaken Merit idempotency on a
      // money path, which is strictly worse than an honest absence that the
      // capability tier (03-11) can detect and block on.
      expect(typeof cryptoObj().randomUUID).not.toBe('function');
      expect(cryptoObj().randomUUID).toBeUndefined();
    });

    it('the source contains no Math.random fallback at all', async () => {
      const { readFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const source = readFileSync(
        join(process.cwd(), 'src', 'lib', 'polyfills', 'crypto-random-uuid.ts'),
        'utf8',
      );
      // Belt and braces: the behavioural test above could be satisfied by a
      // conditional Math.random path that this static check forbids outright.
      expect(source).not.toMatch(/Math\.random/);
    });
  });

  describe('the pure generator', () => {
    it('draws from crypto.getRandomValues (not a private PRNG)', () => {
      const native = cryptoObj().getRandomValues as (a: Uint8Array) => Uint8Array;
      let calls = 0;
      Object.defineProperty(cryptoObj(), 'getRandomValues', {
        value: (array: Uint8Array) => {
          calls++;
          expect(array).toHaveLength(16);
          return native.call(globalThis.crypto, array);
        },
        writable: true,
        configurable: true,
        enumerable: false,
      });

      expect(uuidV4FromRandomValues()).toMatch(CANONICAL_V4);
      expect(calls).toBe(1);
    });

    it('formats an all-zero draw as the canonical nil-with-v4-bits UUID', () => {
      // Deterministic boundary: proves the hyphen positions and the version/variant
      // masks are applied to the right bytes, which random draws cannot pin down.
      Object.defineProperty(cryptoObj(), 'getRandomValues', {
        value: (array: Uint8Array) => array.fill(0x00),
        writable: true,
        configurable: true,
        enumerable: false,
      });
      expect(uuidV4FromRandomValues()).toBe('00000000-0000-4000-8000-000000000000');
    });

    it('formats an all-ones draw with the version/variant bits masked in', () => {
      Object.defineProperty(cryptoObj(), 'getRandomValues', {
        value: (array: Uint8Array) => array.fill(0xff),
        writable: true,
        configurable: true,
        enumerable: false,
      });
      expect(uuidV4FromRandomValues()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    });
  });
});
