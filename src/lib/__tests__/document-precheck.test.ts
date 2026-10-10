import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  DecompressionStream as NodeDecompressionStream,
} from 'node:stream/web';
import {
  Blob as NodeBlob,
  File as NodeFile,
} from 'node:buffer';

Object.defineProperty(globalThis, 'DecompressionStream', {
  configurable: true,
  value: NodeDecompressionStream,
});
Object.defineProperty(globalThis, 'Blob', {
  configurable: true,
  value: NodeBlob,
});
Object.defineProperty(globalThis, 'File', {
  configurable: true,
  value: NodeFile,
});

vi.mock('@/lib/pdf-worker', () => ({
  pdfjs: {
    getDocument: ({ data }: { data: Uint8Array }) => ({
      promise: Promise.resolve().then(() => {
        const source = new TextDecoder().decode(data);
        const count = /\/Type \/Pages[\s\S]*?\/Count (\d+)/.exec(source);
        if (!source.includes('%PDF-') || !count) {
          throw new Error('Synthetic corrupt PDF');
        }
        return { numPages: Number(count[1]) };
      }),
    }),
  },
}));
import {
  DOCX_WORD_COUNT_BACKSTOP,
  LINKEDIN_PDF_ACCEPT,
  MAX_PAGES,
  MSG_PAGE_LIMIT,
  MSG_UNSUPPORTED_TYPE,
  MSG_VALIDATION_UNAVAILABLE,
} from '@/config/document-limits';
import {
  precheckResumeDocument,
} from '@/lib/document-extraction';
import {
  buildResumePdfBytes,
} from '../../../e2e/fixtures/make-unique-resume';
import {
  DOCUMENT_PARITY_RUN_TOKEN,
  DOCUMENT_PARITY_SHA256,
} from '../../../e2e/fixtures/document-parity-manifest';
import {
  makeDocx,
} from '../../../e2e/fixtures/make-docx';
import {
  makeMimeSpoofedText,
  makeRenamedMarkdown,
  makeSpoofedZip,
} from '../../../e2e/fixtures/make-spoofed';

const PDF_MIME = 'application/pdf';
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function file(
  bytes: Uint8Array,
  name: string,
  type: string,
): File {
  return new File([bytes as BlobPart], name, { type });
}

function pdf(pageCount: number): File {
  return file(
    buildResumePdfBytes({
      pageCount,
      runToken: `precheck-${pageCount}`,
    }),
    `resume-${pageCount}.pdf`,
    PDF_MIME,
  );
}

describe('precheckResumeDocument', () => {
  it('proves real pdfjs counts the digest-identified 1/2/3-page bytes', async () => {
    if (!('DOMMatrix' in globalThis)) {
      Object.defineProperty(globalThis, 'DOMMatrix', {
        configurable: true,
        value: class DOMMatrix {},
      });
    }
    const realPdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

    for (const pageCount of [1, 2, 3] as const) {
      const bytes = buildResumePdfBytes({
        pageCount,
        runToken: DOCUMENT_PARITY_RUN_TOKEN,
      });
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        DOCUMENT_PARITY_SHA256[pageCount],
      );
      const pdfDocument = await realPdfjs.getDocument({
        data: bytes,
      }).promise;
      expect(pdfDocument.numPages).toBe(pageCount);
      await pdfDocument.destroy();
    }
  });

  it.each([1, 2])('accepts a %i-page resume PDF', async (pageCount) => {
    await expect(precheckResumeDocument(pdf(pageCount), 'resume')).resolves
      .toEqual({ ok: true, kind: 'pdf', pageCount });
  });

  it('rejects a 3-page resume PDF with exact page-limit copy', async () => {
    await expect(precheckResumeDocument(pdf(3), 'resume')).resolves.toEqual({
      ok: false,
      reason: 'page_limit',
      message: MSG_PAGE_LIMIT,
    });
  });

  it.each([1, 2])('accepts a DOCX with Pages=%i', async (pageCount) => {
    const bytes = await makeDocx({ pages: pageCount, words: 200 });
    await expect(
      precheckResumeDocument(
        file(bytes, `resume-${pageCount}.docx`, DOCX_MIME),
        'resume',
      ),
    ).resolves.toEqual({ ok: true, kind: 'docx', pageCount });
  });

  it('rejects a DOCX whose page and word signals both exceed the limit', async () => {
    const bytes = await makeDocx({
      pages: 3,
      words: DOCX_WORD_COUNT_BACKSTOP + 1,
    });
    await expect(
      precheckResumeDocument(file(bytes, 'resume-3.docx', DOCX_MIME), 'resume'),
    ).resolves.toEqual({
      ok: false,
      reason: 'page_limit',
      message: MSG_PAGE_LIMIT,
    });
  });

  it('uses the exact backstop when DOCX Pages metadata is absent', async () => {
    const atBackstop = await makeDocx({
      pages: null,
      words: DOCX_WORD_COUNT_BACKSTOP,
    });
    await expect(
      precheckResumeDocument(
        file(atBackstop, 'resume-backstop.docx', DOCX_MIME),
        'resume',
      ),
    ).resolves.toEqual({ ok: true, kind: 'docx', pageCount: null });

    const aboveBackstop = await makeDocx({
      pages: null,
      words: DOCX_WORD_COUNT_BACKSTOP + 1,
    });
    await expect(
      precheckResumeDocument(
        file(aboveBackstop, 'resume-too-long.docx', DOCX_MIME),
        'resume',
      ),
    ).resolves.toEqual({
      ok: false,
      reason: 'page_limit',
      message: MSG_PAGE_LIMIT,
    });
  });

  it('rejects renamed Markdown and MIME-spoofed text by bytes', async () => {
    for (const fixture of [makeRenamedMarkdown(), makeMimeSpoofedText()]) {
      await expect(
        precheckResumeDocument(fixture.toFile(), 'resume'),
      ).resolves.toEqual({
        ok: false,
        reason: 'unsupported_type',
        message: MSG_UNSUPPORTED_TYPE,
      });
    }
  });

  it('rejects a non-DOCX ZIP and a corrupt DOCX as unsupported', async () => {
    const spoofedZip = await makeSpoofedZip();
    for (
      const candidate of [
        spoofedZip.toFile(),
        file(
          new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]),
          'corrupt.docx',
          DOCX_MIME,
        ),
      ]
    ) {
      await expect(precheckResumeDocument(candidate, 'resume')).resolves.toEqual({
        ok: false,
        reason: 'unsupported_type',
        message: MSG_UNSUPPORTED_TYPE,
      });
    }
  });

  it('fails closed with validation-unavailable copy for a corrupt PDF parser input', async () => {
    const corrupt = file(
      new TextEncoder().encode('%PDF-1.7 structurally corrupt'),
      'corrupt.pdf',
      PDF_MIME,
    );
    await expect(precheckResumeDocument(corrupt, 'resume')).resolves.toEqual({
      ok: false,
      reason: 'validation_unavailable',
      message: MSG_VALIDATION_UNAVAILABLE,
    });
  });

  it('preserves the 12-page LinkedIn contract and accepts five pages', async () => {
    expect(MAX_PAGES.linkedin_profile).toBe(12);
    expect(LINKEDIN_PDF_ACCEPT).toBe('.pdf,application/pdf');
    const result = await precheckResumeDocument(pdf(5), 'linkedin_profile');
    expect(result).toEqual({ ok: true, kind: 'pdf', pageCount: 5 });
    if (!result.ok) {
      expect(result.message).not.toBe(MSG_PAGE_LIMIT);
    }
  });

  it('transports opaque correlation without adding it to persisted extraction metadata', async () => {
    const source = await import('node:fs/promises').then(({ readFile }) =>
      readFile('src/lib/document-extraction.ts', 'utf8'));
    expect(source).toContain('featureRunToken?: string;');
    expect(source).toContain('featureRunToken: params.featureRunToken');
    const serializer = source.slice(
      source.indexOf('export function serializeDocumentExtractionMetadata'),
      source.indexOf('interface DocumentExtractionFallbackResponse'),
    );
    expect(serializer).not.toContain('featureRunToken');
    expect(serializer).not.toContain('feature_run_token');
  });
});
