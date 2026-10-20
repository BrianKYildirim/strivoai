/*
 * Deliberate attack payloads for validation tests only.
 * They contain no real user data and must never be uploaded to production.
 */

import { makeNonDocxZip } from './make-docx';

const PDF_MIME = 'application/pdf';
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const encoder = new TextEncoder();

export interface SpoofedFileFixture {
  bytes: Uint8Array;
  fileName: string;
  contentType: string;
  toFile: () => File;
}

function fixture(
  bytes: Uint8Array,
  fileName: string,
  contentType: string,
): SpoofedFileFixture {
  return {
    bytes,
    fileName,
    contentType,
    toFile: () =>
      new File([bytes as BlobPart], fileName, { type: contentType }),
  };
}

export function makeRenamedMarkdown(): SpoofedFileFixture {
  return fixture(
    encoder.encode(
      '# Synthetic resume\n\nThis inert markdown is intentionally mislabeled.',
    ),
    'synthetic-renamed.pdf',
    PDF_MIME,
  );
}

export function makeMimeSpoofedText(): SpoofedFileFixture {
  return fixture(
    encoder.encode('Synthetic plain text intentionally sent as a PDF.'),
    'synthetic-mime-spoof.pdf',
    PDF_MIME,
  );
}

export async function makeSpoofedZip(): Promise<SpoofedFileFixture> {
  return fixture(
    await makeNonDocxZip(),
    'synthetic-spoof.docx',
    DOCX_MIME,
  );
}
