// Minimal canvas-API stubs so pdf.js's (non-legacy) browser build can be imported
// under jsdom/node for tests. pdf.js references these at module load even when we
// only extract text. Browsers provide them natively, so this only affects tests.
// Imported for its side effects; must run before any `pdfjs-dist` (non-legacy) import.

const g = globalThis as Record<string, unknown>;

if (typeof g.DOMMatrix === 'undefined') {
  g.DOMMatrix = class DOMMatrix {
    constructor(_init?: unknown) {}
  };
}
if (typeof g.DOMPoint === 'undefined') {
  g.DOMPoint = class DOMPoint {
    constructor(_x?: number, _y?: number, _z?: number, _w?: number) {}
  };
}
if (typeof g.Path2D === 'undefined') {
  g.Path2D = class Path2D {
    constructor(_path?: unknown) {}
  };
}
if (typeof g.ImageData === 'undefined') {
  g.ImageData = class ImageData {
    constructor(_w?: number, _h?: number) {}
  };
}

export {};
