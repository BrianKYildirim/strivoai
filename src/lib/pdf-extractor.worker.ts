// Polyfill this worker realm (the one running the pdf.js API) before any pdf.js
// code executes here. See polyfills/index.ts for the rationale.
import './polyfills';
// Nested pdf.js sub-worker also points at the polyfilled wrapper so ITS realm has
// the method too (fonts are processed there during text extraction).
import pdfjsWorkerSrc from './pdfjs.worker.ts?worker&url';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import {
  reconstructPdfDocumentText,
  reconstructPdfPageText,
  type PdfTextItemLike,
} from './pdf-text-layout';

// Configure pdfjs sub-worker (nested worker) so heavy decoding stays off the main thread.
GlobalWorkerOptions.workerSrc = pdfjsWorkerSrc as unknown as string;

self.addEventListener('message', async (e: MessageEvent<{ id: number; buffer: ArrayBuffer }>) => {
  const { id, buffer } = e.data;
  try {
    const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise;

    // Fetch all pages in parallel — faster than sequential await on main thread
    const pageTexts = await Promise.all(
      Array.from({ length: pdf.numPages }, async (_, i) => {
        const page = await pdf.getPage(i + 1);
        const content = await page.getTextContent();
        return reconstructPdfPageText(content.items as PdfTextItemLike[]);
      }),
    );

    self.postMessage({ id, text: reconstructPdfDocumentText(pageTexts) });
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
});
