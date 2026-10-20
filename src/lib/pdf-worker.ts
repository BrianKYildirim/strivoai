// Configure pdf.js worker using the same package as the API to avoid version mismatches
// We intentionally import from `pdfjs-dist` (not `react-pdf`) so the worker and API versions match.
//
// The worker URL points at our polyfilled wrapper (`pdfjs.worker.ts`) rather than
// the raw `pdf.worker.min.mjs`, so the worker realm has `Map.prototype.getOrInsertComputed`
// before pdf.js runs. `?worker&url` makes Vite bundle the wrapper as a module
// worker and hand back its URL; pdf.js then spawns it with `{ type: "module" }`.
import './polyfills/map-get-or-insert';
// @ts-ignore - ?worker&url is handled by Vite bundler
import workerSrc from './pdfjs.worker.ts?worker&url';
import {
  getDocument,
  GlobalWorkerOptions,
  version,
  // Keep the surface compatible with existing imports
} from 'pdfjs-dist';

if (typeof window !== 'undefined' && GlobalWorkerOptions) {
  GlobalWorkerOptions.workerSrc = workerSrc as unknown as string;
}

// Export a `pdfjs`-like object so existing code using `pdfjs.getDocument` continues to work
export const pdfjs = {
  getDocument,
  GlobalWorkerOptions,
  version,
} as const;
