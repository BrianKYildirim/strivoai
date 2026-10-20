interface DocxOptions {
  pages?: number | null;
  words?: number;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const encoder = new TextEncoder();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const CompressionStreamCtor = globalThis.CompressionStream as unknown as
    new (format: string) => TransformStream<Uint8Array, Uint8Array>;
  const stream = new CompressionStreamCtor('deflate-raw');
  const reader = stream.readable.getReader();
  const readOutput = (async (): Promise<Uint8Array> => {
    const chunks: Uint8Array[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        return concat(chunks);
      }
      chunks.push(value);
    }
  })();

  const writer = stream.writable.getWriter();
  await writer.write(bytes);
  await writer.close();
  return readOutput;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(
    parts.reduce((total, part) => total + part.byteLength, 0),
  );
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function header(size: number): { bytes: Uint8Array; view: DataView } {
  const bytes = new Uint8Array(size);
  return { bytes, view: new DataView(bytes.buffer) };
}

async function buildZip(entries: ZipEntry[]): Promise<Uint8Array> {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const compressed = await deflateRaw(entry.data);
    const checksum = crc32(entry.data);

    const local = header(30);
    local.view.setUint32(0, 0x04034b50, true);
    local.view.setUint16(4, 20, true);
    local.view.setUint16(8, 8, true);
    local.view.setUint32(14, checksum, true);
    local.view.setUint32(18, compressed.byteLength, true);
    local.view.setUint32(22, entry.data.byteLength, true);
    local.view.setUint16(26, name.byteLength, true);
    localParts.push(local.bytes, name, compressed);

    const central = header(46);
    central.view.setUint32(0, 0x02014b50, true);
    central.view.setUint16(4, 20, true);
    central.view.setUint16(6, 20, true);
    central.view.setUint16(10, 8, true);
    central.view.setUint32(16, checksum, true);
    central.view.setUint32(20, compressed.byteLength, true);
    central.view.setUint32(24, entry.data.byteLength, true);
    central.view.setUint16(28, name.byteLength, true);
    central.view.setUint32(42, localOffset, true);
    centralParts.push(central.bytes, name);

    localOffset += local.bytes.byteLength + name.byteLength + compressed.byteLength;
  }

  const centralDirectory = concat(centralParts);
  const eocd = header(22);
  eocd.view.setUint32(0, 0x06054b50, true);
  eocd.view.setUint16(8, entries.length, true);
  eocd.view.setUint16(10, entries.length, true);
  eocd.view.setUint32(12, centralDirectory.byteLength, true);
  eocd.view.setUint32(16, localOffset, true);

  return concat([...localParts, centralDirectory, eocd.bytes]);
}

function xml(value: string): Uint8Array {
  return encoder.encode(value);
}

export async function makeDocx({
  pages = 1,
  words = 120,
}: DocxOptions = {}): Promise<Uint8Array> {
  const body = Array.from(
    { length: words },
    (_, index) => `<w:r><w:t>synthetic${index + 1}</w:t></w:r>`,
  ).join('');
  const pagesElement = typeof pages === 'number' ? `<Pages>${pages}</Pages>` : '';

  return buildZip([
    {
      name: '[Content_Types].xml',
      data: xml(
        '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>',
      ),
    },
    {
      name: '_rels/.rels',
      data: xml(
        '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>',
      ),
    },
    {
      name: 'word/document.xml',
      data: xml(
        `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p>${body}</w:p><w:sectPr/></w:body></w:document>`,
      ),
    },
    {
      name: 'docProps/app.xml',
      data: xml(
        `<?xml version="1.0" encoding="UTF-8"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Strivo Synthetic Fixture</Application>${pagesElement}</Properties>`,
      ),
    },
  ]);
}

export async function makeNonDocxZip(): Promise<Uint8Array> {
  return buildZip([
    {
      name: '[Content_Types].xml',
      data: xml(
        '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
      ),
    },
    {
      name: 'xl/workbook.xml',
      data: xml(
        '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>',
      ),
    },
  ]);
}
