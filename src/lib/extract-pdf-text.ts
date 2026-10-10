// PDF text extraction with a resilient two-tier strategy.
//
// Primary: a singleton Web Worker (pdf-extractor.worker.ts) keeps decoding off the
// main thread. Some browser/build/CSP setups cannot spawn the nested pdf.js worker
// the extractor relies on, in which case the worker either errors OR resolves with
// an empty string (a "successful" reply that carries no usable text). Rather than
// letting a perfectly readable PDF fall through to image rendering + OCR, we
// transparently fall back to extracting on the main thread using the same pdf.js
// instance already used for rendering and the same layout reconstruction.

import { pdfjs } from '@/lib/pdf-worker';
import {
  reconstructPdfPageText,
  reconstructPdfDocumentText,
  type PdfTextItemLike,
} from '@/lib/pdf-text-layout';

type PendingCallback = {
  resolve: (text: string) => void;
  reject: (err: Error) => void;
};

let workerInstance: Worker | null = null;
const pending = new Map<number, PendingCallback>();
let nextId = 0;

function getWorker(): Worker {
  if (workerInstance) return workerInstance;
  // Vite bundles the worker file and injects the correct asset URL at build time.
  workerInstance = new Worker(
    new URL('./pdf-extractor.worker.ts', import.meta.url),
    { type: 'module' },
  );
  workerInstance.addEventListener(
    'message',
    ({ data }: MessageEvent<{ id: number; text?: string; error?: string }>) => {
      const cb = pending.get(data.id);
      if (!cb) return;
      pending.delete(data.id);
      if (data.error) cb.reject(new Error(data.error));
      else cb.resolve(data.text ?? '');
    },
  );
  workerInstance.addEventListener('error', () => {
    // Reject all in-flight calls and reset so the next call spawns a fresh worker.
    for (const cb of pending.values()) cb.reject(new Error('PDF worker error'));
    pending.clear();
    workerInstance = null;
  });
  return workerInstance;
}

function extractViaWorker(buffer: ArrayBuffer): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const id = nextId++;
    pending.set(id, {
      resolve: (text) => { settled = true; resolve(text); },
      reject: (err) => { settled = true; reject(err); },
    });
    try {
      // Transfer ownership of the ArrayBuffer — zero-copy across thread boundary.
      getWorker().postMessage({ id, buffer }, [buffer]);
    } catch (err) {
      // Construction/postMessage can throw synchronously if the worker can't spawn.
      if (!settled) {
        pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    }
  });
}

/**
 * Extract text on the main thread using the rendering pdf.js instance. This path
 * has no nested-worker requirement, so it works wherever PDF rendering already works.
 * Exported for direct testing of the fallback pipeline.
 */
export async function extractPdfTextOnMainThread(bytes: Uint8Array): Promise<string> {
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const pageTexts = await Promise.all(
    Array.from({ length: pdf.numPages }, async (_, i) => {
      const page = await pdf.getPage(i + 1);
      const content = await page.getTextContent();
      return reconstructPdfPageText(content.items as PdfTextItemLike[]);
    }),
  );
  return reconstructPdfDocumentText(pageTexts);
}

export async function extractPDFText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  // Keep a copy for the fallback: transferring `buffer` to the worker detaches it.
  const fallbackBytes = new Uint8Array(buffer.slice(0));

  try {
    const workerText = await extractViaWorker(buffer);
    // The worker can resolve with an empty/whitespace-only string when its nested
    // pdf.js sub-worker fails to load without throwing. Treat that as a fallback
    // trigger so a readable text layer is not silently dropped into the OCR path.
    if (workerText.trim().length > 0) return workerText;
    console.warn('[extractPDFText] worker returned no usable text, falling back to main thread');
  } catch (err) {
    console.warn('[extractPDFText] worker extraction failed, falling back to main thread', err);
  }

  return extractPdfTextOnMainThread(fallbackBytes);
}
