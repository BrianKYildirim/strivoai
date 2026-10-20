/**
 * Phase 01.1 document validation primitive coverage.
 * Run: deno test --allow-all --no-check _shared/document-validation.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  countWords,
  docxVerdict,
  listZipEntryNames,
  messageForReason,
  parseDocxPages,
  readZipEntry,
  sniffKind,
  validateDocumentBytes,
} from './document-validation.ts';
import {
  DOCX_WORD_COUNT_BACKSTOP,
  MAX_PAGES,
} from './document-limits.ts';
import {
  makeDocx,
  makeNonDocxZip,
} from '../../../e2e/fixtures/make-docx.ts';

const encoder = new TextEncoder();

Deno.test('sniffKind identifies PDF bytes including tolerated leading junk', () => {
  assertEquals(sniffKind(encoder.encode('%PDF-1.7'), null), 'pdf');
  assertEquals(sniffKind(encoder.encode(`junk${'x'.repeat(100)}%PDF-1.7`), null), 'pdf');
});

Deno.test('renamed markdown as .pdf sniffs to unknown', () => {
  const bytes = encoder.encode('# Synthetic markdown mislabeled as a PDF');
  assertEquals(sniffKind(bytes, null), 'unknown');
});

Deno.test('MIME-spoofed plain text sniffs to unknown', () => {
  const bytes = encoder.encode('Synthetic text sent with application/pdf');
  assertEquals(sniffKind(bytes, null), 'unknown');
});

Deno.test('DOCX and non-DOCX ZIP are distinguished by central-directory entries', async () => {
  const docx = await makeDocx();
  const nonDocx = await makeNonDocxZip();
  assertEquals(sniffKind(docx, listZipEntryNames(docx)), 'docx');
  assertEquals(sniffKind(nonDocx, listZipEntryNames(nonDocx)), 'zip-not-docx');
});

Deno.test('short, empty, and zero-entry inputs remain unknown without throwing', () => {
  assertEquals(sniffKind(new Uint8Array(), null), 'unknown');
  assertEquals(sniffKind(new Uint8Array([0x50, 0x4b]), null), 'unknown');
  assertEquals(sniffKind(new Uint8Array([0x50, 0x4b, 0x05, 0x06]), []), 'unknown');
});

Deno.test('parseDocxPages handles valid and unknown metadata shapes', () => {
  assertEquals(parseDocxPages('<Pages>1</Pages>'), 1);
  assertEquals(parseDocxPages('<Pages>2</Pages>'), 2);
  assertEquals(parseDocxPages('<Pages>3</Pages>'), 3);
  assertEquals(parseDocxPages('<Pages>  4 </Pages>'), 4);
  assertEquals(parseDocxPages('<Pages>0</Pages>'), null);
  assertEquals(parseDocxPages('<Pages>-1</Pages>'), null);
  assertEquals(parseDocxPages('<Pages>abc</Pages>'), null);
  assertEquals(parseDocxPages('<Properties/>'), null);
  assertEquals(parseDocxPages(null), null);
});

Deno.test('docxVerdict reconciles page metadata with the conservative word backstop', () => {
  const maxPages = MAX_PAGES.resume;
  const backstop = DOCX_WORD_COUNT_BACKSTOP;
  assertEquals(docxVerdict(1, 100, maxPages, backstop), { ok: true });
  assertEquals(docxVerdict(2, 100, maxPages, backstop), { ok: true });
  assertEquals(docxVerdict(3, backstop + 1, maxPages, backstop), {
    ok: false,
    reason: 'page_limit',
  });
  // D-06 deliberate fail-open for absent metadata.
  assertEquals(docxVerdict(null, backstop, maxPages, backstop), { ok: true });
  assertEquals(docxVerdict(null, backstop + 1, maxPages, backstop), {
    ok: false,
    reason: 'page_limit',
  });
  assertEquals(docxVerdict(null, 0, maxPages, backstop), { ok: true });
  // Direct Word evidence: Pages=3 can describe a genuine two-page document.
  assertEquals(docxVerdict(3, 1_440, maxPages, backstop), { ok: true });
});

Deno.test('generated DOCX flows through entries, app.xml, pages, and verdict', async () => {
  const words = DOCX_WORD_COUNT_BACKSTOP + 1;
  const docx = await makeDocx({ pages: 3, words });
  const names = listZipEntryNames(docx);
  const appXml = await readZipEntry(docx, ['docProps/app.xml']);
  assertEquals(sniffKind(docx, names), 'docx');
  assertEquals(
    docxVerdict(
      parseDocxPages(appXml),
      words,
      MAX_PAGES.resume,
      DOCX_WORD_COUNT_BACKSTOP,
    ),
    { ok: false, reason: 'page_limit' },
  );

  const missingPages = await makeDocx({ pages: null, words: 200 });
  assertEquals(parseDocxPages(await readZipEntry(missingPages, ['docProps/app.xml'])), null);
  assertEquals(
    docxVerdict(null, 200, MAX_PAGES.resume, DOCX_WORD_COUNT_BACKSTOP),
    { ok: true },
  );
});

Deno.test('countWords stays character-identical to the browser tokenizer', () => {
  const browserCount = (text: string): number => {
    const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}.'-]*/gu) ?? [];
    return words.filter(word => word.length > 1).length;
  };
  for (const text of [
    'A résumé with impact-driven results.',
    'x I a 42 7',
    "co-op developer's résumé",
    '東京 開発 12345',
  ]) {
    assertEquals(countWords(text), browserCount(text));
  }
});

Deno.test('messageForReason returns locked user-facing copy', () => {
  assertEquals(
    messageForReason('page_limit'),
    'Your document is longer than the 2-page limit. Please upload a PDF or DOCX file containing no more than 2 pages.',
  );
  assertEquals(
    messageForReason('unsupported_type'),
    'Unsupported file type. Please upload a PDF or DOCX file.',
  );
  assertEquals(
    messageForReason('too_large'),
    'Unsupported file type. Please upload a PDF or DOCX file.',
  );
});

Deno.test('malformed ZIP offsets and sizes return null without throwing', async () => {
  assertEquals(listZipEntryNames(new Uint8Array([0x50, 0x4b, 0x03])), null);

  const pastEnd = await makeDocx();
  const pastEndView = new DataView(pastEnd.buffer);
  const eocd = pastEnd.length - 22;
  pastEndView.setUint32(eocd + 16, 0xffffffff, true);
  assertEquals(listZipEntryNames(pastEnd), null);

  const absurdSize = await makeDocx();
  const absurdView = new DataView(absurdSize.buffer);
  const centralOffset = absurdView.getUint32(absurdSize.length - 22 + 16, true);
  absurdView.setUint32(centralOffset + 20, 0xffffffff, true);
  assertEquals(await readZipEntry(absurdSize, ['[Content_Types].xml']), null);
});

Deno.test('validateDocumentBytes accepts 1/2-page PDFs and rejects 3 pages', async () => {
  const pdfBytes = encoder.encode('%PDF-1.7 synthetic');
  for (const pages of [1, 2]) {
    assertEquals(
      await validateDocumentBytes({
        bytes: pdfBytes,
        fileName: encodeURIComponent(`Resume ${pages}.PDF`),
        documentType: 'resume',
        countPdfPages: async () => ({ ok: true, pages }),
      }),
      { ok: true, kind: 'pdf', pageCount: pages },
    );
  }

  assertEquals(
    await validateDocumentBytes({
      bytes: pdfBytes,
      fileName: 'resume.pdf',
      documentType: 'resume',
      countPdfPages: async () => ({ ok: true, pages: 3 }),
    }),
    {
      ok: false,
      reason: 'page_limit',
      message:
        'Your document is longer than the 2-page limit. Please upload a PDF or DOCX file containing no more than 2 pages.',
    },
  );
});

Deno.test('validateDocumentBytes fails closed on unparseable or spoofed PDFs', async () => {
  const parserFailure = async () =>
    ({ ok: false, reason: 'unparseable' } as const);
  assertEquals(
    await validateDocumentBytes({
      bytes: encoder.encode('%PDF-1.7 malformed'),
      fileName: 'resume.pdf',
      documentType: 'resume',
      countPdfPages: parserFailure,
    }),
    {
      ok: false,
      reason: 'unsupported_type',
      message: 'Unsupported file type. Please upload a PDF or DOCX file.',
    },
  );

  assertEquals(
    await validateDocumentBytes({
      bytes: encoder.encode('# markdown'),
      fileName: 'resume.pdf',
      documentType: 'resume',
      countPdfPages: async () => ({ ok: true, pages: 1 }),
    }),
    {
      ok: false,
      reason: 'unsupported_type',
      message: 'Unsupported file type. Please upload a PDF or DOCX file.',
    },
  );
});

Deno.test('validateDocumentBytes requires extension/content agreement and resume scope', async () => {
  const docx = await makeDocx();
  const nonDocx = await makeNonDocxZip();
  const pdfBytes = encoder.encode('%PDF-1.7 synthetic');
  const pdfCounter = async () => ({ ok: true, pages: 1 } as const);

  for (const input of [
    { bytes: docx, fileName: 'resume.pdf', documentType: 'resume' },
    { bytes: pdfBytes, fileName: 'resume.docx', documentType: 'resume' },
    { bytes: nonDocx, fileName: 'resume.docx', documentType: 'resume' },
    { bytes: pdfBytes, fileName: 'profile.pdf', documentType: 'linkedin_profile' },
    { bytes: pdfBytes, fileName: 'resume.txt', documentType: 'resume' },
  ]) {
    assertEquals(
      await validateDocumentBytes({
        ...input,
        countPdfPages: pdfCounter,
      }),
      {
        ok: false,
        reason: 'unsupported_type',
        message: 'Unsupported file type. Please upload a PDF or DOCX file.',
      },
    );
  }
});

Deno.test('validateDocumentBytes applies DOCX metadata and word-count policy', async () => {
  const accepted = await makeDocx({ pages: 2, words: 200 });
  assertEquals(
    await validateDocumentBytes({
      bytes: accepted,
      fileName: 'resume.docx',
      documentType: 'resume',
      countPdfPages: async () => ({ ok: true, pages: 1 }),
    }),
    { ok: true, kind: 'docx', pageCount: 2 },
  );

  const rejected = await makeDocx({
    pages: 3,
    words: DOCX_WORD_COUNT_BACKSTOP + 1,
  });
  assertEquals(
    await validateDocumentBytes({
      bytes: rejected,
      fileName: 'resume.docx',
      documentType: 'resume',
      countPdfPages: async () => ({ ok: true, pages: 1 }),
    }),
    {
      ok: false,
      reason: 'page_limit',
      message:
        'Your document is longer than the 2-page limit. Please upload a PDF or DOCX file containing no more than 2 pages.',
    },
  );

  const noPages = await makeDocx({ pages: null, words: 200 });
  assertEquals(
    await validateDocumentBytes({
      bytes: noPages,
      fileName: 'resume.docx',
      documentType: 'resume',
      countPdfPages: async () => ({ ok: true, pages: 1 }),
    }),
    { ok: true, kind: 'docx', pageCount: null },
  );
});

Deno.test('validateDocumentBytes rejects oversized and malformed DOCX inputs', async () => {
  assertEquals(
    await validateDocumentBytes({
      bytes: new Uint8Array(5_242_881),
      fileName: 'resume.pdf',
      documentType: 'resume',
      countPdfPages: async () => ({ ok: true, pages: 1 }),
    }),
    {
      ok: false,
      reason: 'too_large',
      message: 'Unsupported file type. Please upload a PDF or DOCX file.',
    },
  );

  const malformed = await makeDocx();
  const malformedView = new DataView(malformed.buffer);
  const centralOffset = malformedView.getUint32(malformed.length - 22 + 16, true);
  const documentEntryOffset = centralOffset +
    46 + encoder.encode('[Content_Types].xml').byteLength +
    46 + encoder.encode('_rels/.rels').byteLength;
  malformedView.setUint32(documentEntryOffset + 20, 0xffffffff, true);
  assertEquals(
    await validateDocumentBytes({
      bytes: malformed,
      fileName: 'resume.docx',
      documentType: 'resume',
      countPdfPages: async () => ({ ok: true, pages: 1 }),
    }),
    {
      ok: false,
      reason: 'unsupported_type',
      message: 'Unsupported file type. Please upload a PDF or DOCX file.',
    },
  );
});
