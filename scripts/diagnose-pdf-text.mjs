// Diagnose whether a PDF has an extractable text layer or is image-backed (needs OCR).
//
// Usage:
//   node scripts/diagnose-pdf-text.mjs "C:\\path\\to\\linkedin-profile.pdf"
//
// Reports, per page: how many text items pdf.js returns, how many carry a real
// (non-empty) Unicode string, total extracted characters, whether the page paints
// images, and a text sample. Then prints an overall verdict matching the app's
// extraction path (pdf_parser_no_text -> OCR fallback).

import { readFile } from 'node:fs/promises';

const target = process.argv[2];
if (!target) {
  console.error('Usage: node scripts/diagnose-pdf-text.mjs <path-to-pdf>');
  process.exit(1);
}

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const { getDocument, OPS, GlobalWorkerOptions, VerbosityLevel } = pdfjs;

// Point the worker at the package's own worker module (resolved through Node's
// module resolution so it works regardless of install layout).
GlobalWorkerOptions.workerSrc = import.meta.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');

const bytes = new Uint8Array(await readFile(target));
const pdf = await getDocument({ data: bytes, verbosity: VerbosityLevel?.ERRORS ?? 0 }).promise;

const IMAGE_OPS = new Set(
  [OPS.paintImageXObject, OPS.paintInlineImage, OPS.paintImageMaskXObject, OPS.paintJpegXObject]
    .filter(op => typeof op === 'number'),
);

let totalItems = 0;
let totalNonEmpty = 0;
let totalChars = 0;
let pagesWithImages = 0;

console.log(`\nFile: ${target}`);
console.log(`Pages: ${pdf.numPages}\n`);

for (let n = 1; n <= pdf.numPages; n += 1) {
  const page = await pdf.getPage(n);
  const content = await page.getTextContent();
  const items = content.items;
  const nonEmpty = items.filter(it => typeof it.str === 'string' && it.str.trim().length > 0);
  const joined = nonEmpty.map(it => it.str).join(' ').replace(/\s+/g, ' ').trim();

  let imageCount = 0;
  try {
    const ops = await page.getOperatorList();
    imageCount = ops.fnArray.filter(fn => IMAGE_OPS.has(fn)).length;
  } catch {
    imageCount = -1;
  }
  if (imageCount > 0) pagesWithImages += 1;

  totalItems += items.length;
  totalNonEmpty += nonEmpty.length;
  totalChars += joined.length;

  const sample = joined.slice(0, 160).replace(/\n/g, ' ');
  console.log(`Page ${n}: textItems=${items.length} nonEmptyStr=${nonEmpty.length} chars=${joined.length} images=${imageCount}`);
  console.log(`  sample: ${sample ? JSON.stringify(sample) : '(none)'}`);
}

console.log('\n──────── Verdict ────────');
console.log(`Total text items: ${totalItems}`);
console.log(`Items with real Unicode text: ${totalNonEmpty}`);
console.log(`Total extracted chars: ${totalChars}`);
console.log(`Pages that paint images: ${pagesWithImages}/${pdf.numPages}`);

if (totalChars >= 200 && totalNonEmpty >= 20) {
  console.log('\n=> HAS A TEXT LAYER. pdf.js can read this. If the app still OCR\'d it,');
  console.log('   the bug is in reconstruction or the quality gate — fixable with $0, no OCR.');
} else if (totalItems > 0 && totalNonEmpty === 0) {
  console.log('\n=> TEXT ITEMS EXIST BUT CARRY NO UNICODE (CID font / missing ToUnicode).');
  console.log('   The text layer is unrecoverable via getTextContent. OCR is genuinely needed.');
} else if (totalItems === 0 && pagesWithImages > 0) {
  console.log('\n=> IMAGE-BACKED, NO TEXT LAYER. OCR is genuinely needed.');
} else {
  console.log('\n=> INCONCLUSIVE / very little text. Inspect the per-page output above.');
}
