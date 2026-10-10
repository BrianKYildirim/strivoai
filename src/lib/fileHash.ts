/**
 * Compute a stable SHA-256 hex digest for a File, used as a content cache key.
 *
 * WebKit/iOS Safari compatibility:
 *   `crypto.subtle` (the WebCrypto SubtleCrypto interface) is ONLY exposed in a
 *   secure context. On iOS Safari/WebKit, accessing the app over a non-HTTPS
 *   origin (e.g. a LAN IP during testing, or certain in-app WebView contexts)
 *   leaves `crypto.subtle` === undefined. The previous code called
 *   `crypto.subtle.digest(...)` unguarded, which threw the JavaScriptCore error
 *   `undefined is not a function (near '...(function (){})...')` instantly — before
 *   any network call — breaking the onboarding analysis trigger on affected iPhones.
 *   Chrome/V8 masks this because it exposes `crypto.subtle` on localhost too.
 *
 * This helper prefers WebCrypto when available and falls back to a pure-JS
 * SHA-256 implementation so file hashing never crashes on insecure contexts.
 */

/** Render a byte array as a lowercase hex string. */
function toHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

/** True when WebCrypto SubtleCrypto is actually available (secure context). */
function hasSubtleCrypto(): boolean {
  return (
    typeof crypto !== 'undefined' &&
    typeof (crypto as Crypto).subtle !== 'undefined' &&
    typeof crypto.subtle.digest === 'function'
  );
}

// ── Pure-JS SHA-256 fallback ──────────────────────────────────────────────
// Used only when crypto.subtle is unavailable (insecure context on WebKit).

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

function sha256(message: Uint8Array): Uint8Array {
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ]);

  const len = message.length;
  const bitLen = len * 8;
  // Padded length: message + 0x80 + zero pad to 56 mod 64 + 8-byte length.
  const withOne = len + 1;
  const padLen = ((withOne + 8 + 63) & ~63);
  const padded = new Uint8Array(padLen);
  padded.set(message);
  padded[len] = 0x80;
  // 64-bit big-endian bit length (high 32 bits assumed 0 for file sizes here).
  const dv = new DataView(padded.buffer);
  dv.setUint32(padLen - 4, bitLen >>> 0, false);
  dv.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000), false);

  const w = new Uint32Array(64);
  for (let offset = 0; offset < padLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = dv.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, hh] = h;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;

      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, h[i], false);
  return out;
}

/**
 * Returns the lowercase hex SHA-256 of the file's bytes. Never throws on
 * insecure WebKit contexts: falls back to a pure-JS digest when WebCrypto is
 * unavailable.
 */
export async function calculateFileHash(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();

  if (hasSubtleCrypto()) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    return toHex(new Uint8Array(hashBuffer));
  }

  return toHex(sha256(new Uint8Array(arrayBuffer)));
}
