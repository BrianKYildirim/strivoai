/**
 * Isolated PDF parser boundary for Phase 01.1 (D-08/D-09).
 *
 * pdf-lib is pure JavaScript and supports Deno. Keeping the pinned npm import
 * in this file prevents the pure document-validation tests from loading the
 * parser dependency.
 */
import { PDFDocument } from 'npm:pdf-lib@1.17.1';

export type PdfPageCountResult =
  | { ok: true; pages: number }
  | { ok: false; reason: 'unparseable' };

export async function countPdfPages(
  bytes: Uint8Array,
): Promise<PdfPageCountResult> {
  try {
    const pdf = await PDFDocument.load(bytes, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    const pages = pdf.getPageCount();
    return pages > 0
      ? { ok: true, pages }
      : { ok: false, reason: 'unparseable' };
  } catch {
    return { ok: false, reason: 'unparseable' };
  }
}
