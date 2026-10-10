import { describe, expect, it } from 'vitest';
import {
  buildResumePdfBytes,
} from '../../../e2e/fixtures/make-unique-resume';
import {
  makeDocx,
  makeNonDocxZip,
} from '../../../e2e/fixtures/make-docx';
import {
  makeMimeSpoofedText,
  makeRenamedMarkdown,
  makeSpoofedZip,
} from '../../../e2e/fixtures/make-spoofed';

function findEocd(bytes: Uint8Array): number {
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

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const DecompressionStreamCtor = globalThis.DecompressionStream as unknown as
    new (format: string) => TransformStream<Uint8Array, Uint8Array>;
  const stream = new DecompressionStreamCtor('deflate-raw');
  const reader = stream.readable.getReader();
  const readOutput = (async (): Promise<Uint8Array> => {
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
      chunks.push(value);
      size += value.byteLength;
    }
  })();

  const writer = stream.writable.getWriter();
  await writer.write(bytes);
  await writer.close();
  return readOutput;
}

async function readZipEntry(
  bytes: Uint8Array,
  wantedName: string,
): Promise<string | null> {
  const eocd = findEocd(bytes);
  if (eocd < 0) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = view.getUint32(eocd + 16, true);
  const end = offset + view.getUint32(eocd + 12, true);

  while (offset < end && view.getUint32(offset, true) === 0x02014b50) {
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(
      bytes.slice(offset + 46, offset + 46 + nameLength),
    );

    if (name === wantedName) {
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(dataStart, dataStart + compressedSize);
      const data = method === 8 ? await inflateRaw(compressed) : compressed;
      return new TextDecoder().decode(data);
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return null;
}

describe('Phase 01.1 document fixture generators', () => {
  it('builds deterministic PDFs with the requested page count', () => {
    const first = buildResumePdfBytes({ pageCount: 3, runToken: 'fixed-token' });
    const second = buildResumePdfBytes({ pageCount: 3, runToken: 'fixed-token' });
    const source = new TextDecoder().decode(first);

    expect(first).toEqual(second);
    expect(source).toContain('/Count 3');
    expect(source.match(/\/Type \/Page\b/g)).toHaveLength(3);
  });

  it('round-trips DOCX app metadata with and without Pages', async () => {
    const withPages = await makeDocx({ pages: 3 });
    const withoutPages = await makeDocx({ pages: null });

    expect(Array.from(withPages.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(await readZipEntry(withPages, 'docProps/app.xml')).toContain(
      '<Pages>3</Pages>',
    );
    expect(await readZipEntry(withoutPages, 'docProps/app.xml')).not.toContain(
      '<Pages>',
    );
  });

  it('builds a valid ZIP that is not a DOCX', async () => {
    const bytes = await makeNonDocxZip();

    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(await readZipEntry(bytes, 'word/document.xml')).toBeNull();
  });

  it('builds extension and MIME spoofing fixtures from inert bytes', () => {
    const renamedMarkdown = makeRenamedMarkdown();
    const mimeSpoofedText = makeMimeSpoofedText();
    const firstKilobyte = new TextDecoder().decode(
      renamedMarkdown.bytes.slice(0, 1024),
    );

    expect(firstKilobyte).not.toContain('%PDF-');
    expect(renamedMarkdown.fileName).toMatch(/\.pdf$/);
    expect(renamedMarkdown.toFile().type).toBe('application/pdf');
    expect(mimeSpoofedText.contentType).toBe('application/pdf');
    expect(mimeSpoofedText.toFile().name).toBe(mimeSpoofedText.fileName);
  });

  it('builds a ZIP-shaped DOCX spoof without a Word document entry', async () => {
    const spoofedZip = await makeSpoofedZip();

    expect(Array.from(spoofedZip.bytes.slice(0, 4))).toEqual([
      0x50,
      0x4b,
      0x03,
      0x04,
    ]);
    expect(spoofedZip.fileName).toMatch(/\.docx$/);
    expect(spoofedZip.toFile().type).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(
      await readZipEntry(spoofedZip.bytes, 'word/document.xml'),
    ).toBeNull();
  });
});
