#!/usr/bin/env node
/**
 * Regenerates `scripts/test-resumes/Profile.pdf` — the synthetic LinkedIn
 * "Save to PDF" fixture used by the LinkedIn Grader tests and by the Phase 9
 * VER-04 production runs (D-15: synthetic fixtures are the ONLY permitted input).
 *
 * WHY THIS SCRIPT EXISTS (Phase 9, plan 09-02, finding T-09-02-B):
 * The original `Profile.pdf` committed in 21925c88 was a REAL person's LinkedIn
 * export — real name, personal email, mobile number and vanity URL. That is a
 * finding, not a fixture. This script deterministically rebuilds a synthetic
 * profile of the SAME SHAPE (LinkedIn's Apache-FOP export layout: Contact /
 * Top Skills / Languages / Summary / Experience / Education, 2 pages), so the
 * binary fixture has a reproducible, auditable provenance instead of being an
 * opaque blob nobody can vouch for.
 *
 * The persona is provably fictional:
 *   - email domain  `example.com`     (RFC 2606 reserved — can never route)
 *   - phone         `(555) 010-1234`  (NANP 555-0100..555-0199 fictional range)
 *   - vanity URL    a non-existent handle
 *
 * Constraints this fixture must keep satisfying (see
 * `src/lib/__tests__/profile-pdf-reconstruct.test.ts`):
 *   - a REAL text layer (not a scan) so `extractPdfTextOnMainThread` recovers it
 *     and the app never sends it down the OCR path;
 *   - >= 420 chars and >= 80 words, clearing the `linkedin_profile` quality gate;
 *   - contains a `linkedin.com/in/...` vanity URL and the skill `TypeScript`.
 *
 * No npm dependency: the PDF is emitted by hand (PDF 1.4, uncompressed content
 * streams, Helvetica). Uncompressed is deliberate — it keeps the fixture's text
 * greppable as literal ASCII, which is what lets the Phase 9 PII guard
 * (`src/test/security/phase9-pii-guard.test.ts`) scan the binary directly.
 *
 * Usage: node scripts/test-resumes/generate-synthetic-linkedin-pdf.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'Profile.pdf');

/** Page 1 — mirrors the LinkedIn export's left contact rail + main column. */
const PAGE_1 = [
  'Contact',
  '(555) 010-1234 (Mobile)',
  'taylor.rivera@example.com',
  'www.linkedin.com/in/taylor-rivera-synthetic (LinkedIn)',
  '',
  'Top Skills',
  'TypeScript',
  'Python (Programming Language)',
  'Distributed Systems',
  '',
  'Languages',
  'Spanish (Professional Working)',
  'English (Native or Bilingual)',
  '',
  'Taylor Rivera',
  'Senior Software Engineer | Platform & Reliability',
  'Austin, Texas, United States',
  '',
  'Summary',
  'Backend engineer focused on high-throughput services and the operational',
  'discipline that keeps them healthy. At Northwind Systems I led the migration',
  'of a monolithic billing service onto an event-driven platform, cutting median',
  'checkout latency from 940ms to 210ms while holding error budgets intact.',
  'I care about measurable reliability, honest postmortems, and paying down',
  'complexity before it compounds into an outage.',
  '',
  'Experience',
  '',
  'Northwind Systems',
  'Senior Software Engineer',
  'March 2023 - Present (2 years 4 months)',
  'Austin, TX',
  'Led the decomposition of a billing monolith into six event-driven services,',
  'reducing median checkout latency 78% and eliminating a recurring class of',
  'double-charge incidents. Introduced idempotency keys across every payment',
  'write path. Built the on-call runbook and cut mean time to recovery by half.',
  '',
  'Cobalt Analytics',
  'Software Engineer',
  'July 2020 - February 2023 (2 years 8 months)',
  'Remote',
  'Built a streaming ingestion pipeline in TypeScript and Python that sustained',
  '40k events per second with exactly-once delivery semantics. Designed the',
  'schema-evolution strategy that let 30+ downstream consumers upgrade without',
  'coordinated deploys.',
  '',
  'Education',
  '',
  'Western Plains University',
  'Bachelor of Science - BS, Computer Science (September 2016 - June 2020)',
  '',
  'Page 1 of 2',
];

/** Page 2 — LinkedIn exports habitually spill a short tail page. */
const PAGE_2 = [
  'Certifications',
  'Certified Kubernetes Application Developer',
  '',
  'Honors & Awards',
  'Internal Reliability Award, Northwind Systems (2024)',
  '',
  'Page 2 of 2',
];

/** Escape the three characters that are structural inside a PDF literal string. */
function escapePdfText(line) {
  return line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** Build an uncompressed content stream that lays `lines` out top-down. */
function contentStream(lines) {
  const body = lines
    .map((line) => (line === '' ? 'T*' : `(${escapePdfText(line)}) Tj T*`))
    .join('\n');
  return `BT\n/F1 10 Tf\n13 TL\n1 0 0 1 56 760 Tm\n${body}\nET\n`;
}

function buildPdf() {
  const objects = [];
  const push = (body) => objects.push(body);

  const c1 = contentStream(PAGE_1);
  const c2 = contentStream(PAGE_2);

  // 1: Catalog, 2: Pages, 3/5: Page, 4/6: Contents, 7: Font, 8: Info
  push('<< /Type /Catalog /Pages 2 0 R >>');
  push('<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>');
  push(
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ' +
      '/Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>',
  );
  push(`<< /Length ${c1.length} >>\nstream\n${c1}endstream`);
  push(
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ' +
      '/Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
  );
  push(`<< /Length ${c2.length} >>\nstream\n${c2}endstream`);
  push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  push(
    '<< /Title (Profile) /Author (Synthetic Fixture) ' +
      '/Subject (Synthetic LinkedIn profile export - Strivo test fixture, not a real person) ' +
      '/Producer (strivo generate-synthetic-linkedin-pdf.mjs) /CreationDate (D:20260711000000Z) >>',
  );

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  const count = objects.length + 1; // +1 for the free head entry
  pdf += `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  pdf +=
    `trailer\n<< /Size ${count} /Root 1 0 R /Info ${objects.length} 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

writeFileSync(OUT, buildPdf());
console.log(`[generate-synthetic-linkedin-pdf] wrote ${OUT}`);
