import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  DOCUMENT_PARITY_RUN_TOKEN,
  DOCUMENT_PARITY_SHA256,
} from '../../../e2e/fixtures/document-parity-manifest.ts';
import {
  buildResumePdfBytes,
} from '../../../e2e/fixtures/make-unique-resume.ts';
import { countPdfPages } from './pdf-pages.ts';

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

Deno.test('pdf-lib matches pdfjs on identical digest-identified 1/2/3-page bytes', async () => {
  for (const pageCount of [1, 2, 3] as const) {
    const bytes = buildResumePdfBytes({
      pageCount,
      runToken: DOCUMENT_PARITY_RUN_TOKEN,
    });
    assertEquals(await sha256(bytes), DOCUMENT_PARITY_SHA256[pageCount]);
    assertEquals(await countPdfPages(bytes), { ok: true, pages: pageCount });
  }
});
