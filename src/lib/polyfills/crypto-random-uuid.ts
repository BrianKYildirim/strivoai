// Polyfill for `crypto.randomUUID()` (WebCrypto, RFC 4122 version 4).
//
// WHY THIS EXISTS (XDEV-03 · D-09 · defect XD-16)
// ----------------------------------------------
// SIX money-path submit handlers call `crypto.randomUUID()` unguarded to mint the
// `attemptNonce` that protects against double Merit charges:
//
//     src/pages/Upload.tsx:281          src/pages/RecruitingLens.tsx:579
//     src/pages/Onboarding.tsx:86       src/pages/LinkedInGrader.tsx:522
//     src/pages/CareerCompass.tsx:254   src/hooks/useEliteRerun.ts:189
//
// (`src/hooks/useIdempotencyKey.ts:25,28` derives the same value and is covered too.)
// `crypto.randomUUID` requires a SECURE CONTEXT and is absent before Safari 15.4 /
// Firefox 95 / Chrome 92. When it is missing the call throws:
//
//     TypeError: crypto.randomUUID is not a function
//
// *before the request is built*, so the submit aborts with no request, no server
// attempt, and no error surface — the user taps "Analyze" and nothing happens.
//
// WHY NO TEST CATCHES IT: `localhost` IS a secure context and production is HTTPS,
// so neither the Playwright lane nor the operator's machine can reproduce the throw.
// This is a runtime host-object method, so transpilation / `build.target` /
// browserslist cannot restore it — it must be polyfilled. This module is imported
// for its side effects via the `polyfills/` barrel at the very top of the main-thread
// entry (main.tsx) AND inside every pdf.js worker realm, so the method exists
// wherever app code runs.
//
// The installer is guarded: when the browser ships a native implementation we leave
// it untouched, so we transparently defer to the engine once support lands.
//
// SECURITY POSTURE (this is a money path, not a cosmetic id)
// ---------------------------------------------------------
// The nonce feeds server-side Merit idempotency. A predictable or colliding value
// could collapse two distinct submits into one attempt (a lost run) or collide with
// another user's attempt. So the fallback draws from `crypto.getRandomValues` and
// NOTHING else. If `getRandomValues` is ALSO absent we install NOTHING — deliberately
// leaving `crypto.randomUUID` undefined rather than substituting the ambient
// pseudo-random generator, which is not a CSPRNG and would silently weaken
// idempotency. That is D-09's rule: block where honest emulation is impossible. The
// capability tier (03-11) then blocks the AI/checkout entry points instead, which is
// an honest failure rather than a quiet one.
//
// That prohibition is enforced, not merely intended: `crypto-random-uuid.test.ts`
// statically asserts this file contains no non-CSPRNG fallback token at all.

/** Lowercase hex lookup for byte -> 2 chars, avoiding per-byte `padStart`. */
const HEX_BY_BYTE: readonly string[] = Array.from({ length: 256 }, (_, i) =>
  i.toString(16).padStart(2, "0"),
);

/**
 * Build one RFC 4122 version 4 UUID from 16 CSPRNG bytes.
 *
 * Sets the version nibble (byte 6 high nibble = 4) and the variant bits (byte 8
 * high bits = 0b10), then formats canonical lowercase 8-4-4-4-12 hyphenated hex.
 * Exported so tests can exercise the generator directly, independent of install.
 *
 * @throws if `crypto.getRandomValues` is unavailable — callers must guard first.
 */
export function uuidV4FromRandomValues(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);

  // Version 4: high nibble of byte 6 is 0100.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  // Variant RFC 4122: two high bits of byte 8 are 10 (yields 8, 9, a or b).
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const h = HEX_BY_BYTE;
  return (
    h[bytes[0]] + h[bytes[1]] + h[bytes[2]] + h[bytes[3]] +
    "-" +
    h[bytes[4]] + h[bytes[5]] +
    "-" +
    h[bytes[6]] + h[bytes[7]] +
    "-" +
    h[bytes[8]] + h[bytes[9]] +
    "-" +
    h[bytes[10]] + h[bytes[11]] + h[bytes[12]] + h[bytes[13]] + h[bytes[14]] + h[bytes[15]]
  );
}

/**
 * Install the `crypto.randomUUID` polyfill in the current realm. Idempotent and
 * safe to call from any context (window or worker global scope). Exported for
 * tests; also invoked on import.
 */
export function installCryptoRandomUUID(): void {
  const cryptoObj: Crypto | undefined = globalThis.crypto;

  // No WebCrypto at all — nothing to install onto, and no entropy source we would
  // trust for a money-path nonce. Leave it absent so the capability tier can block.
  if (!cryptoObj) {
    return;
  }

  // No CSPRNG — refuse to fake it (see SECURITY POSTURE above). A pseudo-random
  // UUID here would be worse than the throw it replaces, because it would look
  // like it worked.
  if (typeof cryptoObj.getRandomValues !== "function") {
    return;
  }

  // Only install when the method is genuinely missing so native engines win.
  // NOTE: native `randomUUID` lives on `Crypto.prototype`, not as an own property,
  // so this membership test must be a plain property read (not `hasOwnProperty`).
  if (typeof cryptoObj.randomUUID === "function") {
    return;
  }

  try {
    Object.defineProperty(cryptoObj, "randomUUID", {
      value: function randomUUID(): string {
        return uuidV4FromRandomValues();
      },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  } catch {
    // A host that refuses the definition (frozen/sealed Crypto object) leaves the
    // method absent, which the capability tier handles. This install runs as the
    // FIRST executable statement of the boot — before the global diagnostics
    // handlers exist — so a throw here would white-screen the app with no report.
    // Failing quiet-and-absent is strictly better than failing loud-and-blank.
  }
}

installCryptoRandomUUID();
