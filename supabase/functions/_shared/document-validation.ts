/**
 * Phase 01.1 document validation primitives (D-05/D-06/D-09/D-28).
 *
 * Deno supports DecompressionStream('deflate-raw'); this repository already
 * exercises the same Web Streams API with gzip in archive-reader.ts.
 */
import {
  DOCX_WORD_COUNT_BACKSTOP,
  MAX_PAGES,
  MAX_UPLOAD_BYTES,
  MSG_PAGE_LIMIT,
  MSG_UNSUPPORTED_TYPE,
} from './document-limits.ts';

export type SniffedKind = 'pdf' | 'docx' | 'zip-not-docx' | 'unknown';
export type RejectReason = 'unsupported_type' | 'page_limit' | 'too_large';
export type DocumentVerdict =
  | { ok: true }
  | { ok: false; reason: RejectReason };
export type PdfPageCounter = (
  bytes: Uint8Array,
) => Promise<
  | { ok: true; pages: number }
  | { ok: false; reason: 'unparseable' }
>;
export type DocumentValidationResult =
  | {
    ok: true;
    kind: 'pdf' | 'docx';
    pageCount: number | null;
  }
  | {
    ok: false;
    reason: RejectReason;
    message: string;
  };

interface ZipEntry {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

const MAX_ZIP_ENTRIES = 2048;
const MAX_INFLATED_ENTRY_BYTES = 512 * 1024;

export function sniffKind(
  bytes: Uint8Array,
  zipEntryNames: string[] | null,
): SniffedKind {
  const prefixEnd = Math.min(bytes.length, 1024);
  for (let index = 0; index <= prefixEnd - 5; index += 1) {
    if (
      bytes[index] === 0x25 &&
      bytes[index + 1] === 0x50 &&
      bytes[index + 2] === 0x44 &&
      bytes[index + 3] === 0x46 &&
      bytes[index + 4] === 0x2d
    ) {
      return 'pdf';
    }
  }

  if (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  ) {
    return zipEntryNames?.includes('word/document.xml')
      ? 'docx'
      : 'zip-not-docx';
  }

  // A zero-entry archive starts with PK\x05\x06 and intentionally falls through.
  return 'unknown';
}

export function findEndOfCentralDirectory(bytes: Uint8Array): number {
  for (let index = bytes.length - 22; index >= 0; index -= 1) {
    if (
      bytes[index] === 0x50 &&
      bytes[index + 1] === 0x4b &&
      bytes[index + 2] === 0x05 &&
      bytes[index + 3] === 0x06
    ) {
      return index;
    }
  }
  return -1;
}

function walkCentralDirectory(bytes: Uint8Array): ZipEntry[] | null {
  try {
    const eocdOffset = findEndOfCentralDirectory(bytes);
    if (eocdOffset < 0 || eocdOffset + 22 > bytes.length) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const directorySize = view.getUint32(eocdOffset + 12, true);
    const directoryOffset = view.getUint32(eocdOffset + 16, true);
    const directoryEnd = directoryOffset + directorySize;
    if (
      directoryOffset > bytes.length ||
      directoryEnd < directoryOffset ||
      directoryEnd > eocdOffset
    ) {
      return null;
    }

    const entries: ZipEntry[] = [];
    let offset = directoryOffset;
    while (offset < directoryEnd) {
      if (entries.length >= MAX_ZIP_ENTRIES || offset + 46 > directoryEnd) {
        return null;
      }
      if (view.getUint32(offset, true) !== 0x02014b50) return null;
      const fileNameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const nextOffset =
        offset + 46 + fileNameLength + extraLength + commentLength;
      if (nextOffset <= offset || nextOffset > directoryEnd) return null;
      const filenameStart = offset + 46;
      const filenameEnd = filenameStart + fileNameLength;
      if (filenameEnd > bytes.length) return null;

      entries.push({
        name: new TextDecoder().decode(bytes.slice(filenameStart, filenameEnd)),
        compressionMethod: view.getUint16(offset + 10, true),
        compressedSize: view.getUint32(offset + 20, true),
        uncompressedSize: view.getUint32(offset + 24, true),
        localHeaderOffset: view.getUint32(offset + 42, true),
      });
      offset = nextOffset;
    }
    return offset === directoryEnd ? entries : null;
  } catch {
    return null;
  }
}

export function listZipEntryNames(bytes: Uint8Array): string[] | null {
  return walkCentralDirectory(bytes)?.map((entry) => entry.name) ?? null;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array | null> {
  try {
    const stream = new DecompressionStream('deflate-raw');
    const reader = stream.readable.getReader();
    const readOutput = (async (): Promise<Uint8Array | null> => {
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          const output = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) {
            output.set(chunk, offset);
            offset += chunk.byteLength;
          }
          return output;
        }
        size += value.byteLength;
        if (size > MAX_INFLATED_ENTRY_BYTES) {
          await reader.cancel();
          return null;
        }
        chunks.push(value);
      }
    })();
    const writer = stream.writable.getWriter();
    const input = new Uint8Array(data.byteLength);
    input.set(data);
    await writer.write(input);
    await writer.close();
    return await readOutput;
  } catch {
    return null;
  }
}

export async function readZipEntry(
  bytes: Uint8Array,
  names: string[],
): Promise<string | null> {
  try {
    const entry = walkCentralDirectory(bytes)?.find((item) =>
      names.includes(item.name)
    );
    if (!entry || entry.uncompressedSize > MAX_INFLATED_ENTRY_BYTES) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (
      entry.localHeaderOffset > bytes.length ||
      entry.localHeaderOffset + 30 > bytes.length ||
      view.getUint32(entry.localHeaderOffset, true) !== 0x04034b50
    ) {
      return null;
    }
    const nameLength = view.getUint16(entry.localHeaderOffset + 26, true);
    const extraLength = view.getUint16(entry.localHeaderOffset + 28, true);
    const dataStart =
      entry.localHeaderOffset + 30 + nameLength + extraLength;
    const dataEnd = dataStart + entry.compressedSize;
    if (dataStart > bytes.length || dataEnd < dataStart || dataEnd > bytes.length) {
      return null;
    }
    const compressed = bytes.slice(dataStart, dataEnd);
    const data = entry.compressionMethod === 0
      ? compressed
      : entry.compressionMethod === 8
        ? await inflateRaw(compressed)
        : null;
    return data ? new TextDecoder().decode(data) : null;
  } catch {
    return null;
  }
}

export function parseDocxPages(appXml: string | null): number | null {
  if (!appXml) return null;
  const match = appXml.match(/<Pages>\s*([+-]?\d+)\s*<\/Pages>/i);
  if (!match) return null;
  const pages = Number(match[1]);
  return Number.isFinite(pages) && pages > 0 ? pages : null;
}

export function countWords(text: string): number {
  const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}.'-]*/gu) ?? [];
  return words.filter(word => word.length > 1).length;
}

function extractTextFromWordXml(xml: string): string {
  return xml
    .replace(/<w:tab\b[^>]*\/>/g, '\t')
    .replace(/<w:br\b[^>]*\/>/g, '\n')
    .replace(/<\/w:t>/g, ' ')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function messageForReason(reason: RejectReason): string {
  if (reason === 'page_limit') return MSG_PAGE_LIMIT;
  // No separate oversize copy is locked; use the unsupported-type message.
  return MSG_UNSUPPORTED_TYPE;
}

export function docxVerdict(
  pages: number | null,
  wordCount: number,
  maxPages: number,
  backstop: number,
): DocumentVerdict {
  if (pages !== null && pages <= maxPages) return { ok: true };

  // Direct Word evidence showed Pages=3 for a two-page, 1,440-word document.
  // Reconcile implausible/absent metadata with extracted words in the deliberate
  // D-06 ACCEPT direction; only both signals exceeding the cap can reject.
  if (wordCount <= backstop) return { ok: true };
  return { ok: false, reason: 'page_limit' };
}

function reject(reason: RejectReason): DocumentValidationResult {
  return {
    ok: false,
    reason,
    message: messageForReason(reason),
  };
}

function normalizedExtension(fileName: string): '.pdf' | '.docx' | null {
  try {
    const decoded = decodeURIComponent(fileName);
    const basename = decoded.replace(/\\/g, '/').split('/').pop()?.trim() ?? '';
    const lower = basename.toLowerCase();
    if (lower.endsWith('.pdf')) return '.pdf';
    if (lower.endsWith('.docx')) return '.docx';
  } catch {
    // Malformed percent encoding is invalid file metadata.
  }
  return null;
}

/**
 * Produces the authoritative resume-document verdict from raw bytes.
 *
 * The filename is used only to require extension/content agreement. Content
 * kind and page count always come from the bytes themselves.
 */
export async function validateDocumentBytes({
  bytes,
  fileName,
  documentType,
  countPdfPages,
}: {
  bytes: Uint8Array;
  fileName: string;
  documentType: string;
  countPdfPages: PdfPageCounter;
}): Promise<DocumentValidationResult> {
  if (documentType !== 'resume') return reject('unsupported_type');
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return reject('too_large');

  const extension = normalizedExtension(fileName);
  if (!extension) return reject('unsupported_type');

  const zipEntryNames = extension === '.docx'
    ? listZipEntryNames(bytes)
    : null;
  const kind = sniffKind(bytes, zipEntryNames);

  if (extension === '.pdf') {
    if (kind !== 'pdf') return reject('unsupported_type');
    const pageResult = await countPdfPages(bytes);
    if (!pageResult.ok) return reject('unsupported_type');
    if (pageResult.pages > MAX_PAGES.resume) return reject('page_limit');
    return {
      ok: true,
      kind: 'pdf',
      pageCount: pageResult.pages,
    };
  }

  if (kind !== 'docx') return reject('unsupported_type');
  const [appXml, documentXml] = await Promise.all([
    readZipEntry(bytes, ['docProps/app.xml']),
    readZipEntry(bytes, ['word/document.xml']),
  ]);
  if (!documentXml) return reject('unsupported_type');

  const pageCount = parseDocxPages(appXml);
  const verdict = docxVerdict(
    pageCount,
    countWords(extractTextFromWordXml(documentXml)),
    MAX_PAGES.resume,
    DOCX_WORD_COUNT_BACKSTOP,
  );
  if (!verdict.ok) return reject(verdict.reason);
  return {
    ok: true,
    kind: 'docx',
    pageCount,
  };
}
