/**
 * Per-run unique synthetic resume PDF generator for E2E tests.
 *
 * Upload de-duplication means a static fixture can trigger a new analysis only
 * once per user. This generator keeps the established synthetic persona and
 * varies only an opaque run token. Output remains uncompressed and contains no
 * real-person data.
 */
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

function resumeLines(runToken: string): string[] {
  return [
    'Jordan E2E Baseline',
    'Senior Software Engineer',
    'San Francisco, CA',
    'jordan.baseline@example.com  |  github.com/jordan-baseline',
    '',
    'PROFESSIONAL SUMMARY',
    'Senior software engineer with eight years of experience building reliable,',
    'scalable web platforms and leading cross-functional engineering teams.',
    `Reference build ${runToken}.`,
    '',
    'EXPERIENCE',
    'Acme Corporation, San Francisco, CA',
    'Senior Software Engineer (2020 - 2024)',
    '- Built and shipped scalable web services in TypeScript, Node, and Postgres.',
    '- Led a team of four engineers and improved deployment reliability by forty percent.',
    '- Reduced average API latency from ninety to forty milliseconds through caching.',
    '- Mentored junior engineers and established the team code-review standards.',
    '',
    'Globex Industries, Austin, TX',
    'Software Engineer (2016 - 2020)',
    '- Designed and delivered customer-facing React features used by millions of users.',
    '- Automated the continuous integration pipeline, cutting release time in half.',
    '',
    'EDUCATION',
    'Bachelor of Science in Computer Science, State University, 2016',
    '',
    'SKILLS',
    'TypeScript, JavaScript, React, Node, Postgres, Supabase, Playwright, CI/CD, AWS.',
  ];
}

function escapePdfText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

export interface ResumePdfOptions {
  pageCount: number;
  runToken: string;
}

/**
 * Build deterministic PDF bytes without filesystem or randomness.
 */
export function buildResumePdfBytes({
  pageCount,
  runToken,
}: ResumePdfOptions): Uint8Array {
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new Error('pageCount must be a positive integer');
  }

  const encoder = new TextEncoder();
  const pageIds = Array.from({ length: pageCount }, (_, index) => 3 + index);
  const contentIds = Array.from(
    { length: pageCount },
    (_, index) => 3 + pageCount + index,
  );
  const fontId = 3 + (pageCount * 2);

  const contentObjects = Array.from({ length: pageCount }, (_, pageIndex) => {
    let y = 760;
    const textOps = [
      ...resumeLines(runToken),
      '',
      `Synthetic page ${pageIndex + 1} of ${pageCount}.`,
    ]
      .map((line) => {
        const op = `1 0 0 1 56 ${y} Tm (${escapePdfText(line)}) Tj`;
        y -= 22;
        return op;
      })
      .join('\n');
    const content = `BT\n/F1 11 Tf\n${textOps}\nET`;
    return `<< /Length ${encoder.encode(content).byteLength} >>\nstream\n${content}\nendstream`;
  });

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`,
    ...pageIds.map((_, index) =>
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentIds[index]} 0 R >>`
    ),
    ...contentObjects,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let byteLength = 0;
  const append = (value: string): void => {
    const bytes = encoder.encode(value);
    parts.push(bytes);
    byteLength += bytes.byteLength;
  };

  append('%PDF-1.4\n');
  objects.forEach((body, index) => {
    offsets.push(byteLength);
    append(`${index + 1} 0 obj\n${body}\nendobj\n`);
  });

  const xrefStart = byteLength;
  append(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (const offset of offsets) {
    append(`${String(offset).padStart(10, '0')} 00000 n \n`);
  }
  append(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`,
  );

  const result = new Uint8Array(byteLength);
  let cursor = 0;
  for (const part of parts) {
    result.set(part, cursor);
    cursor += part.byteLength;
  }
  return result;
}

export function makeUniqueResumePdf(
  pageCount = 1,
): { filePath: string; fileName: string; runToken: string } {
  const runToken = randomUUID();
  const bytes = buildResumePdfBytes({ pageCount, runToken });
  const fileName = `e2e-two-tab-${runToken}.pdf`;
  const filePath = path.join(tmpdir(), fileName);
  writeFileSync(filePath, bytes);

  return { filePath, fileName, runToken };
}
