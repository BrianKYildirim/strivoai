/**
 * calculateFileHash — verifies WebCrypto path and the WebKit insecure-context
 * fallback both produce the correct SHA-256 hex digest (debug: onboarding-analysis-undefined).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { calculateFileHash } from './fileHash';

// Known SHA-256 of the ASCII string "abc".
const SHA256_ABC =
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

/**
 * jsdom's File polyfill does not implement `arrayBuffer()`, so build a minimal
 * stand-in that exposes the one method `calculateFileHash` relies on.
 */
function fileFromString(s: string): File {
  const buffer = new TextEncoder().encode(s).buffer;
  return {
    arrayBuffer: () => Promise.resolve(buffer),
  } as unknown as File;
}

const originalSubtle = globalThis.crypto?.subtle;

afterEach(() => {
  Object.defineProperty(globalThis.crypto, 'subtle', {
    value: originalSubtle,
    configurable: true,
  });
  vi.restoreAllMocks();
});

describe('calculateFileHash', () => {
  it('hashes via WebCrypto when crypto.subtle is available', async () => {
    const hash = await calculateFileHash(fileFromString('abc'));
    expect(hash).toBe(SHA256_ABC);
  });

  it('falls back to pure-JS SHA-256 when crypto.subtle is undefined (insecure WebKit context)', async () => {
    // Simulate iOS Safari in a non-secure context: crypto.subtle === undefined.
    Object.defineProperty(globalThis.crypto, 'subtle', {
      value: undefined,
      configurable: true,
    });

    const hash = await calculateFileHash(fileFromString('abc'));
    expect(hash).toBe(SHA256_ABC);
  });

  it('produces identical digests from both code paths for non-trivial input', async () => {
    const input = 'The quick brown fox jumps over the lazy dog'.repeat(100);

    const secure = await calculateFileHash(fileFromString(input));

    Object.defineProperty(globalThis.crypto, 'subtle', {
      value: undefined,
      configurable: true,
    });
    const insecure = await calculateFileHash(fileFromString(input));

    expect(insecure).toBe(secure);
  });
});
