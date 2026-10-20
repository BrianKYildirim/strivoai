import './pdf-test-env';
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { extractPDFText } from '../extract-pdf-text';

// Regression for the LinkedIn "Save to PDF" zero-cost path. The Web Worker can
// resolve with an EMPTY string (not throw) when the nested pdf.js sub-worker
// fails to load in the deployed browser/CSP. In that case `extractPDFText` must
// still recover the clean text layer via the main-thread fallback — otherwise the
// readable profile is wrongly pushed to image OCR (server: pdf_parser_no_text),
// which is non-zero cost and blocked on free tier.
//
// This drives `extractPDFText` (the public entry), NOT `extractPdfTextOnMainThread`
// directly, by stubbing the Worker constructor so it always posts back text:''.

const FIXTURE = join(process.cwd(), 'scripts', 'test-resumes', 'Profile.pdf');
const hasFixture = existsSync(FIXTURE);

// A fake Worker that mimics the real pdf-extractor.worker.ts "success with empty
// text" failure mode: on every postMessage, it echoes back { id, text: '' }.
class EmptyResultWorker {
  private listeners: Record<string, Array<(ev: unknown) => void>> = {};
  addEventListener(type: string, cb: (ev: unknown) => void): void {
    (this.listeners[type] ??= []).push(cb);
  }
  removeEventListener(): void {}
  terminate(): void {}
  postMessage(data: { id: number }): void {
    // Simulate async worker reply on the next microtask, with empty text.
    queueMicrotask(() => {
      for (const cb of this.listeners['message'] ?? []) {
        cb({ data: { id: data.id, text: '' } });
      }
    });
  }
}

// jsdom's File does not implement arrayBuffer(); extractPDFText only needs that.
function fileFromBytes(bytes: Uint8Array): File {
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return { arrayBuffer: async () => ab } as unknown as File;
}

describe.skipIf(!hasFixture)('extractPDFText empty-worker-result fallback', () => {
  let originalWorker: typeof globalThis.Worker | undefined;

  beforeAll(async () => {
    // The main-thread fallback uses the rendering pdf.js instance. pdf-worker.ts
    // (imported transitively by extract-pdf-text) points workerSrc at a Vite
    // `?url` asset that node cannot load; override it with the legacy build so the
    // fallback can actually decode under vitest.
    const { GlobalWorkerOptions } = await import('pdfjs-dist');
    GlobalWorkerOptions.workerSrc = import.meta.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
  });

  afterEach(() => {
    if (originalWorker !== undefined) {
      globalThis.Worker = originalWorker;
    }
  });

  it('recovers the text layer when the worker resolves an empty string', async () => {
    originalWorker = globalThis.Worker;
    // Force the worker-first path to "succeed" with empty text. getWorker() reads
    // globalThis.Worker lazily, so stubbing before the first call is sufficient.
    (globalThis as { Worker: unknown }).Worker = EmptyResultWorker as unknown;

    const bytes = new Uint8Array(await readFile(FIXTURE));
    const file = fileFromBytes(bytes);

    const text = await extractPDFText(file);

    const wordCount = (text.match(/[\p{L}\p{N}][\p{L}\p{N}.'-]*/gu) ?? [])
      .filter(w => w.length > 1).length;

    // linkedin_profile quality gate requires 420 chars / 80 words.
    expect(text.length).toBeGreaterThanOrEqual(420);
    expect(wordCount).toBeGreaterThanOrEqual(80);
    // Retargeted from the real profile's handle to the synthetic fixture's handle
    // (Phase 9 / 09-02, finding T-09-02-B). The contract is unchanged: the main-thread
    // fallback must recover the vanity URL from the text layer.
    expect(text.toLowerCase()).toContain('linkedin.com/in/taylor-rivera-synthetic');
  });
});
