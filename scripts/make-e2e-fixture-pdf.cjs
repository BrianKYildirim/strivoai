/**
 * Generates the deterministic e2e fixture PDF (e2e/fixtures/test-resume.pdf):
 * a minimal, valid single-page PDF with extractable text so the Upload flow's
 * client-side PDF.js extraction yields > 50 chars. The AI score itself is
 * stubbed server-side (AI_TEST_MODE), so the exact text is irrelevant — only
 * that it is a valid, text-bearing PDF. Re-run with `node scripts/make-e2e-fixture-pdf.cjs`.
 */
const fs = require('fs');
const path = require('path');

// The resume quality gate in src/lib/document-extraction.ts requires the
// client-extracted text to have >= 65 words and >= 320 chars PLUS document
// signals (email, a 4-digit year, "City, ST", a Title-Case name, bullets).
// This content clears all of those so PDF.js extraction is ACCEPTED and the
// flow never falls through to the server-side OCR path (which is CORS-gated to
// a different origin on the TEST project). The AI score itself is stubbed
// server-side, so the exact wording is irrelevant — only the quality gate matters.
const lines = [
  'Jordan E2E Baseline',
  'Senior Software Engineer',
  'San Francisco, CA',
  'jordan.baseline@example.com  |  github.com/jordan-baseline',
  '',
  'PROFESSIONAL SUMMARY',
  'Senior software engineer with eight years of experience building reliable,',
  'scalable web platforms and leading cross-functional engineering teams.',
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

function escapePdfText(s) {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

let y = 760;
let textOps = 'BT\n/F1 11 Tf\n';
for (const line of lines) {
  textOps += `1 0 0 1 56 ${y} Tm (${escapePdfText(line)}) Tj\n`;
  y -= 22;
}
textOps += 'ET';
const stream = textOps;

const objects = [];
objects.push('<< /Type /Catalog /Pages 2 0 R >>');
objects.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
objects.push(
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
);
objects.push(
  `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
);
objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

let pdf = '%PDF-1.4\n';
const offsets = [];
objects.forEach((obj, i) => {
  offsets.push(Buffer.byteLength(pdf, 'latin1'));
  pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
});
const xrefStart = Buffer.byteLength(pdf, 'latin1');
pdf += `xref\n0 ${objects.length + 1}\n`;
pdf += '0000000000 65535 f \n';
offsets.forEach((off) => {
  pdf += String(off).padStart(10, '0') + ' 00000 n \n';
});
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

const outDir = path.resolve(__dirname, '..', 'e2e', 'fixtures');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'test-resume.pdf');
fs.writeFileSync(outPath, Buffer.from(pdf, 'latin1'));
console.log('Wrote', outPath, fs.statSync(outPath).size, 'bytes');
