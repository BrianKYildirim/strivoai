// Polyfilled entry point for the pdf.js worker.
//
// pdf.js spawns its worker with `{ type: "module" }` and, inside that worker
// realm, calls `Map.prototype.getOrInsertComputed` (e.g. `this.fonts.getOrInsertComputed(...)`
// while processing fonts during text extraction). That realm is a fresh global
// scope that does NOT inherit the main-thread polyfill, so we must install the
// polyfill here — BEFORE the pdf.js worker code runs — and only then load the
// real worker for its side effects (it registers its message handlers on `self`).
//
// Both the main thread (`pdf-worker.ts`) and the extractor worker
// (`pdf-extractor.worker.ts`) point pdf.js's `workerSrc` at the bundled URL of
// this module, so every pdf.js worker instance is polyfilled.
import "./polyfills";
import "pdfjs-dist/build/pdf.worker.min.mjs";
