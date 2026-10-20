import './pdf-test-env';
import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { extractPdfTextOnMainThread } from '../extract-pdf-text';

// The fixture is a SYNTHETIC LinkedIn "Save to PDF" export, committed to the repo and
// rebuildable via `node scripts/test-resumes/generate-synthetic-linkedin-pdf.mjs`.
// (Phase 9 / 09-02, finding T-09-02-B: it used to be a REAL person's export — real
// name, email, mobile and vanity URL — despite this comment once claiming it was not
// committed. It was. It is now synthetic; see 09-FIXTURE-PROVENANCE.md.)
const FIXTURE = join(process.cwd(), 'scripts', 'test-resumes', 'Profile.pdf');
const hasFixture = existsSync(FIXTURE);

// Regression guard for the LinkedIn "Save to PDF" export that the app wrongly sent
// to OCR (server logged pdf_parser_no_text). The PDF has a clean text layer, so the
// main-thread fallback in extractPDFText must recover usable text — keeping this
// readable profile out of the OCR path entirely (zero cost, no LLM).
describe.skipIf(!hasFixture)('LinkedIn Profile.pdf main-thread text extraction', () => {
  let fullText = '';

  beforeAll(async () => {
    // The main-thread path uses the rendering pdf.js instance; give it a worker src.
    const { GlobalWorkerOptions } = await import('pdfjs-dist');
    GlobalWorkerOptions.workerSrc = import.meta.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');

    const bytes = new Uint8Array(await readFile(FIXTURE));
    fullText = await extractPdfTextOnMainThread(bytes);

    const wordCount = (fullText.match(/[\p{L}\p{N}][\p{L}\p{N}.'-]*/gu) ?? [])
      .filter(w => w.length > 1).length;
    // Log the SHAPE only, never the content. Echoing the head of an extracted profile
    // into CI output is exactly the leak D-15 exists to prevent.
    console.log(`[Profile.pdf] chars=${fullText.length} words=${wordCount}`);
  });

  it('recovers a non-trivial text layer that clears the linkedin_profile quality gate', () => {
    // linkedin_profile quality gate requires 80 words / 420 chars.
    const wordCount = (fullText.match(/[\p{L}\p{N}][\p{L}\p{N}.'-]*/gu) ?? [])
      .filter(w => w.length > 1).length;
    expect(fullText.length).toBeGreaterThanOrEqual(420);
    expect(wordCount).toBeGreaterThanOrEqual(80);
  });

  it('preserves identifying LinkedIn profile content', () => {
    // Same contract as before (a vanity URL + a Top Skills entry survive extraction),
    // retargeted from the real profile's handle to the synthetic fixture's handle.
    expect(fullText.toLowerCase()).toContain('linkedin.com/in/taylor-rivera-synthetic');
    expect(fullText.toLowerCase()).toContain('typescript');
  });
});
