// Polyfill for the TC39 "Map.prototype.getOrInsert" proposal
// (https://github.com/tc39/proposal-upsert): `getOrInsert` and
// `getOrInsertComputed` on Map and WeakMap.
//
// WHY THIS EXISTS
// ---------------
// `pdfjs-dist` (pulled in via `react-pdf`) calls `Map.prototype.getOrInsertComputed`
// in both its main-thread API and its worker — e.g. the WorkerTransport does
// `this.#methodPromises.getOrInsertComputed(name, () => this.messageHandler.sendWithPromise(...))`.
// That method is a very recent proposal that is NOT available in the stable
// browsers our users run, so pdf.js throws:
//
//     TypeError: this.#t.getOrInsertComputed is not a function
//         at messageHandler.sendWithPromise
//
// which crashes Resume Analysis before a single page can be parsed. This is a
// runtime prototype method, so transpilation / `build.target` / browserslist
// cannot restore it — it must be polyfilled. This module is imported for its
// side effects at the very top of the main-thread entry (main.tsx) AND inside
// every worker realm that runs pdf.js, so the method exists wherever pdf.js runs.
//
// The installers are guarded: when the browser ships a native implementation we
// leave it untouched, so we transparently defer to the engine once support lands.

type GetOrInsertMap<K, V> = {
  has(key: K): boolean;
  get(key: K): V | undefined;
  set(key: K, value: V): unknown;
};

// Spec semantics: return the existing value for `key` if present, otherwise
// insert `value` and return it.
function getOrInsert<K, V>(this: GetOrInsertMap<K, V>, key: K, value: V): V {
  if (this.has(key)) {
    return this.get(key) as V;
  }
  this.set(key, value);
  return value;
}

// Spec semantics: return the existing value for `key` if present, otherwise
// compute `callbackFn(key)`, insert it, and return it.
function getOrInsertComputed<K, V>(
  this: GetOrInsertMap<K, V>,
  key: K,
  callbackFn: (key: K) => V,
): V {
  if (this.has(key)) {
    return this.get(key) as V;
  }
  const value = callbackFn(key);
  this.set(key, value);
  return value;
}

function define(proto: object, name: string, impl: (...args: never[]) => unknown): void {
  // Only install when the method is genuinely missing so native engines win.
  if (typeof (proto as Record<string, unknown>)[name] === "function") {
    return;
  }
  Object.defineProperty(proto, name, {
    value: impl,
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

/**
 * Install the getOrInsert / getOrInsertComputed polyfills on Map and WeakMap in
 * the current realm. Idempotent and safe to call from any context (window or
 * worker global scope). Exported for tests; also invoked on import.
 */
export function installMapGetOrInsert(): void {
  if (typeof Map === "function" && Map.prototype) {
    define(Map.prototype, "getOrInsert", getOrInsert);
    define(Map.prototype, "getOrInsertComputed", getOrInsertComputed);
  }
  if (typeof WeakMap === "function" && WeakMap.prototype) {
    define(WeakMap.prototype, "getOrInsert", getOrInsert);
    define(WeakMap.prototype, "getOrInsertComputed", getOrInsertComputed);
  }
}

installMapGetOrInsert();
