// The SINGLE install site for every polyfill, in every realm.
//
// WHY A BARREL
// ------------
// The `getOrInsertComputed` production incident (2026-07-26) had this exact shape:
// a polyfill installed in the window realm only, while pdf.js kept throwing inside
// its worker. pdf.js spawns its worker with `{ type: "module" }`, and that worker is
// a FRESH GLOBAL SCOPE that does NOT inherit the main-thread realm's polyfills — so
// every realm must install for itself. Before this file existed, each realm entry
// imported each polyfill individually, which meant adding a new polyfill required
// remembering to edit three files, and forgetting one produced a bug reproducible
// only on the devices nobody tests on.
//
// Adding a polyfill HERE lands it in all three realms at once:
//   - the window realm            -> src/main.tsx
//   - the pdf.js worker realm     -> src/lib/pdfjs.worker.ts
//   - the extractor worker realm  -> src/lib/pdf-extractor.worker.ts
//
// IMPORT ORDER IS LOAD-BEARING
// ----------------------------
// These are side-effect imports: the module body installs on evaluation. This barrel
// MUST therefore be the FIRST app import in each realm entry, so the polyfills are in
// place before any pdf.js, Stripe or React code evaluates. ES modules are evaluated in
// import order, so moving this import below another one silently re-opens the gap.
//
// `src/test/platform/polyfill-realm-source-guard.test.ts` enforces all of the above
// statically: every realm entry must import this barrel first, and none may import an
// individual polyfill module directly.
import "./map-get-or-insert";
import "./crypto-random-uuid";
