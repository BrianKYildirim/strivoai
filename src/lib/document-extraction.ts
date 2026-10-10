import { invokeWithTimeout } from '@/lib/fetchWithTimeout';
import { supabase } from '@/lib/supabaseClient';
import { extractPDFText } from '@/lib/extract-pdf-text';
import { pdfjs } from '@/lib/pdf-worker';
import { calculateFileHash } from '@/lib/fileHash';
import {
  ACCEPTED_RESUME_DOCUMENT_ACCEPT,
  ACCEPTED_RESUME_DOCUMENT_EXTENSIONS,
  DOCX_WORD_COUNT_BACKSTOP,
  LINKEDIN_PDF_ACCEPT,
  MAX_PAGES,
  MSG_PAGE_LIMIT,
  MSG_UNSUPPORTED_TYPE,
  MSG_VALIDATION_UNAVAILABLE,
  RESUME_DOCUMENT_TYPE_LABEL,
} from '@/config/document-limits';

export {
  ACCEPTED_RESUME_DOCUMENT_ACCEPT,
  ACCEPTED_RESUME_DOCUMENT_EXTENSIONS,
  LINKEDIN_PDF_ACCEPT,
  RESUME_DOCUMENT_TYPE_LABEL,
} from '@/config/document-limits';

export type DocumentType = 'resume' | 'linkedin_profile';
export const DOCUMENT_EXTRACTION_VERSION = 'phase51-v1';
export type ExtractionProvider =
  | 'pdf_parser'
  // D-14: retained for historical resumes.extraction_metadata reads; no
  // production extraction path writes this provider anymore.
  | 'plain_text'
  | 'docx_parser'
  | 'ollama'
  | 'mistral'
  | 'textract'
  | 'claude_ocr';

export interface DocumentExtractionMetadata {
  provider: ExtractionProvider;
  attemptedProviders: ExtractionProvider[];
  qualityStatus: 'accepted' | 'rejected' | 'failed';
  documentType: DocumentType;
  textHash: string;
  documentHash: string;
  extractionVersion: string;
  extractedAt: string;
  reusedAcceptedText: boolean;
  fallbackReason?: string;
}

export interface SerializedDocumentExtractionMetadata {
  provider: ExtractionProvider;
  attempted_providers: ExtractionProvider[];
  quality_status: DocumentExtractionMetadata['qualityStatus'];
  document_type: DocumentType;
  text_hash: string;
  document_hash: string;
  extraction_version: string;
  extracted_at: string;
  reused_accepted_text: boolean;
  fallback_reason?: string;
}

export interface ExtractDocumentFromPdfParams {
  file: File;
  documentType: DocumentType;
  resumeId?: string;
  /** Opaque, short-lived server correlation. Never persisted in extraction metadata. */
  featureRunToken?: string;
  documentOrdinal?: number;
}

export interface ExtractDocumentFromPdfResult {
  text: string;
  pageCount: number;
  metadata?: DocumentExtractionMetadata;
  featureRunToken?: string;
}

export type ExtractDocumentFromFileResult = ExtractDocumentFromPdfResult;
export type DocumentPrecheckResult =
  | {
    ok: true;
    kind: 'pdf' | 'docx';
    pageCount: number | null;
  }
  | {
    ok: false;
    reason:
      | 'unsupported_type'
      | 'page_limit'
      | 'validation_unavailable';
    message: string;
  };

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || getFileExtension(file.name) === '.pdf';
}

export function isAcceptedResumeDocument(file: File): boolean {
  const extension = getFileExtension(file.name);
  return ACCEPTED_RESUME_DOCUMENT_EXTENSIONS.some((allowed) => allowed === extension);
}

function precheckFailure(
  reason: Extract<DocumentPrecheckResult, { ok: false }>['reason'],
  message: string,
): DocumentPrecheckResult {
  return { ok: false, reason, message };
}

function hasPdfMagic(bytes: Uint8Array): boolean {
  const prefixEnd = Math.min(bytes.length, 1024);
  for (let index = 0; index <= prefixEnd - 5; index += 1) {
    if (
      bytes[index] === 0x25 &&
      bytes[index + 1] === 0x50 &&
      bytes[index + 2] === 0x44 &&
      bytes[index + 3] === 0x46 &&
      bytes[index + 4] === 0x2d
    ) {
      return true;
    }
  }
  return false;
}

function parseDocxPages(appXml: string | null): number | null {
  if (!appXml) return null;
  const match = appXml.match(/<Pages>\s*([+-]?\d+)\s*<\/Pages>/i);
  if (!match) return null;
  const pages = Number(match[1]);
  return Number.isFinite(pages) && pages > 0 ? pages : null;
}

function countWords(text: string): number {
  const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}.'-]*/gu) ?? [];
  return words.filter(word => word.length > 1).length;
}

/**
 * Browser fast-feedback only. The authenticated edge seam remains authoritative
 * before storage, persistence, Merit, or analysis work.
 */
export async function precheckResumeDocument(
  file: File,
  documentType: DocumentType = 'resume',
): Promise<DocumentPrecheckResult> {
  const extension = getFileExtension(file.name);
  if (
    documentType === 'resume'
      ? !ACCEPTED_RESUME_DOCUMENT_EXTENSIONS.some(allowed => allowed === extension)
      : extension !== '.pdf'
  ) {
    return precheckFailure('unsupported_type', MSG_UNSUPPORTED_TYPE);
  }

  try {
    if (extension === '.pdf') {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!hasPdfMagic(bytes)) {
        return precheckFailure('unsupported_type', MSG_UNSUPPORTED_TYPE);
      }

      const loadingTask = pdfjs.getDocument({ data: bytes });
      const pdf = await loadingTask.promise;
      const pageCount = pdf.numPages;
      if (pageCount > MAX_PAGES[documentType]) {
        return precheckFailure('page_limit', MSG_PAGE_LIMIT);
      }
      return { ok: true, kind: 'pdf', pageCount };
    }

    if (documentType !== 'resume' || extension !== '.docx') {
      return precheckFailure('unsupported_type', MSG_UNSUPPORTED_TYPE);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const hasZipMagic =
      bytes.length >= 4 &&
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      bytes[2] === 0x03 &&
      bytes[3] === 0x04;
    if (!hasZipMagic) {
      return precheckFailure('unsupported_type', MSG_UNSUPPORTED_TYPE);
    }

    const [documentXml, appXml] = await Promise.all([
      readZipTextEntry(file, ['word/document.xml']),
      readZipTextEntry(file, ['docProps/app.xml']),
    ]);
    if (!documentXml) {
      return precheckFailure('unsupported_type', MSG_UNSUPPORTED_TYPE);
    }

    const pageCount = parseDocxPages(appXml);
    const countingText = extractTextFromWordXml(
      documentXml.replace(/<\/w:t>/g, '</w:t> '),
    );
    const wordCount = countWords(countingText);
    if (
      pageCount !== null &&
      pageCount <= MAX_PAGES[documentType]
    ) {
      return { ok: true, kind: 'docx', pageCount };
    }
    if (wordCount <= DOCX_WORD_COUNT_BACKSTOP) {
      return { ok: true, kind: 'docx', pageCount };
    }
    return precheckFailure('page_limit', MSG_PAGE_LIMIT);
  } catch {
    return precheckFailure(
      'validation_unavailable',
      MSG_VALIDATION_UNAVAILABLE,
    );
  }
}

export async function extractDocumentFromFile(
  params: ExtractDocumentFromPdfParams,
): Promise<ExtractDocumentFromFileResult> {
  if (isPdfFile(params.file)) {
    return extractDocumentFromPdf(params);
  }

  if (!isAcceptedResumeDocument(params.file)) {
    throw new Error(MSG_UNSUPPORTED_TYPE);
  }

  const documentHash = await calculateFileHash(params.file);
  const provider: ExtractionProvider = 'docx_parser';
  const rawText = await extractDocxText(params.file);
  const quality = assessBrowserExtractionQuality(rawText, params.documentType);

  if (!quality.ok) {
    throw new Error(`We could not read this file reliably. Please upload a ${RESUME_DOCUMENT_TYPE_LABEL} file with selectable text.`);
  }

  return {
    text: quality.canonicalText,
    pageCount: 0,
    ...(params.featureRunToken ? { featureRunToken: params.featureRunToken } : {}),
    metadata: await buildBrowserMetadata({
      text: quality.canonicalText,
      documentType: params.documentType,
      documentHash,
      attemptedProviders: [provider],
      provider,
    }),
  };
}

export function serializeDocumentExtractionMetadata(
  metadata: DocumentExtractionMetadata,
): SerializedDocumentExtractionMetadata {
  return {
    provider: metadata.provider,
    attempted_providers: [...metadata.attemptedProviders],
    quality_status: metadata.qualityStatus,
    document_type: metadata.documentType,
    text_hash: metadata.textHash,
    document_hash: metadata.documentHash,
    extraction_version: metadata.extractionVersion,
    extracted_at: metadata.extractedAt,
    reused_accepted_text: metadata.reusedAcceptedText,
    ...(metadata.fallbackReason ? { fallback_reason: metadata.fallbackReason } : {}),
  };
}

interface DocumentExtractionFallbackResponse {
  text?: string;
  pageCount?: number;
  metadata?: DocumentExtractionMetadata;
  error?: string;
  message?: string;
}

type QualityReason =
  | 'too_short'
  | 'too_noisy'
  | 'repetitive'
  | 'pdf_operator_noise'
  | 'missing_document_signals';

type QualityResult =
  | { ok: true; canonicalText: string }
  | { ok: false; canonicalText: string; reason: QualityReason };

// OCR render budgets only. Resume/LinkedIn rejection limits are separately
// owned by shared MAX_PAGES and must not be inferred from this table.
const PAGE_LIMITS: Record<DocumentType, number> = {
  resume: 8,
  linkedin_profile: 12,
};

const MAX_IMAGE_WIDTH = 1400;

const QUALITY_THRESHOLDS: Record<DocumentType, { minWords: number; minChars: number }> = {
  resume: { minWords: 65, minChars: 320 },
  linkedin_profile: { minWords: 80, minChars: 420 },
};

const GENERIC_DOCUMENT_SIGNALS = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /\b\d{4}\b/,
  /\b[A-Z][a-z]+,\s*[A-Z]{2}\b/,
  /\b[A-Z][a-z]+ [A-Z][a-z]+\b/,
  /[-•]\s+\p{L}{3,}/u,
  /\b(https?:\/\/|linkedin\.com|github\.com)\b/i,
  /\b[A-Z][\p{L}\p{N} /&+-]{2,40}:?\s*$/mu,
];

export async function extractDocumentFromPdf(
  params: ExtractDocumentFromPdfParams,
): Promise<ExtractDocumentFromPdfResult> {
  let pdfjsText = '';
  const documentHash = await calculateFileHash(params.file);

  try {
    pdfjsText = await extractPDFText(params.file);
  } catch (error) {
    console.error('[DocumentExtraction] pdfjs extraction failed', error);
  }

  const pdfjsQuality = assessBrowserExtractionQuality(pdfjsText, params.documentType);
  if (pdfjsQuality.ok) {
    if (params.resumeId || params.featureRunToken) {
      const persisted = await persistAcceptedPdfjsResumeText({
        documentType: params.documentType,
        pdfjsText,
        resumeId: params.resumeId,
        documentHash,
        filename: params.file.name,
        featureRunToken: params.featureRunToken,
        fileSizeBytes: params.file.size,
        documentOrdinal: params.documentOrdinal,
      });
      if (persisted) return persisted;
    }

    return {
      text: pdfjsText,
      pageCount: 0,
      ...(params.featureRunToken ? { featureRunToken: params.featureRunToken } : {}),
      metadata: await buildBrowserMetadata({
        text: pdfjsText,
        documentType: params.documentType,
        documentHash,
        attemptedProviders: ['pdf_parser'],
      }),
    };
  }

  const images = await renderPdfPagesToImages(params.file, params.documentType);
  if (images.length === 0) {
    throw new Error('Could not render PDF pages for text extraction.');
  }

  const { data, error } = await invokeWithTimeout<DocumentExtractionFallbackResponse>(
    'ocr-pdf',
    {
      body: {
        documentType: params.documentType,
        images,
        documentHash,
        extractionVersion: DOCUMENT_EXTRACTION_VERSION,
        filename: params.file.name,
        ...(params.featureRunToken ? { featureRunToken: params.featureRunToken } : {}),
        ...(params.documentOrdinal ? { documentOrdinal: params.documentOrdinal } : {}),
        fileSizeBytes: params.file.size,
        ...(params.resumeId ? { resumeId: params.resumeId } : {}),
        ...(pdfjsText.trim() ? { pdfjsText } : {}),
      },
    },
    120000,
  );

  if (error) {
    throw new Error(error.message || `We could not read this file reliably. Please upload a ${RESUME_DOCUMENT_TYPE_LABEL} file with selectable text.`);
  }

  if (!data?.text?.trim()) {
    throw new Error(data?.message || data?.error || `We could not read this file reliably. Please upload a ${RESUME_DOCUMENT_TYPE_LABEL} file with selectable text.`);
  }

  return {
    text: data.text,
    pageCount: data.pageCount ?? images.length,
    metadata: data.metadata,
    ...(params.featureRunToken ? { featureRunToken: params.featureRunToken } : {}),
  };
}

async function persistAcceptedPdfjsResumeText(params: {
  documentType: DocumentType;
  pdfjsText: string;
  resumeId?: string;
  documentHash: string;
  filename: string;
  featureRunToken?: string;
  fileSizeBytes: number;
  documentOrdinal?: number;
}): Promise<ExtractDocumentFromPdfResult | null> {
  const { data, error } = await invokeWithTimeout<DocumentExtractionFallbackResponse>(
    'ocr-pdf',
    {
      body: {
        documentType: params.documentType,
        images: [],
        ...(params.resumeId ? { resumeId: params.resumeId } : {}),
        pdfjsText: params.pdfjsText,
        documentHash: params.documentHash,
        extractionVersion: DOCUMENT_EXTRACTION_VERSION,
        filename: params.filename,
        ...(params.featureRunToken ? { featureRunToken: params.featureRunToken } : {}),
        ...(params.documentOrdinal ? { documentOrdinal: params.documentOrdinal } : {}),
        fileSizeBytes: params.fileSizeBytes,
      },
    },
    60000,
  );

  if (error || !data?.text?.trim()) {
    console.warn('[DocumentExtraction] accepted pdfjs resume persistence failed', error ?? data?.error);
    // The costing-attributed route is unavailable — e.g. `begin-feature-run` could not
    // mint a featureRunToken, so `ocr-pdf` rejects this call with `invalid_feature_run_token`
    // (ocr-pdf/index.ts:343-353). That token exists to ATTRIBUTE PROVIDER SPEND, and this
    // call spends nothing: the text was already extracted in the browser by pdf.js and
    // accepted by the quality gate.
    //
    // Dropping it here is what silently breaks every LATER session. Backend raw-byte PDF
    // parsing is intentionally a no-op (supabase/functions/_shared/pdf-parser.ts pins
    // pdfjsText:null / images:[] / claude_ocr_blocked_by_policy), so a feature reading a
    // SAVED resume has exactly one source — `resumes.extracted_text`. With it empty,
    // analyze-career fails closed at index.ts:1876 with INPUT_MISSING and refunds.
    //
    // So persist durably here instead. Telemetry stays best-effort; user data does not.
    return await persistAcceptedResumeTextDirect(params);
  }

  return {
    text: data.text,
    pageCount: data.pageCount ?? 0,
    metadata: data.metadata,
    ...(params.featureRunToken ? { featureRunToken: params.featureRunToken } : {}),
  };
}

/**
 * Last-resort durable write of browser-accepted resume text straight to `resumes`.
 *
 * Only the five extraction columns are touched. They are sanctioned client-writes with
 * column-scoped grants (`supabase/functions/_shared/client-write-grants.test.ts`
 * RESUMES_INSERT); the server-owned analysis fields — analyzed_tier, grading_data,
 * overall_score, analyzed_at, archive_path — are never written from here. RLS scopes the
 * update to the owning user.
 *
 * Returns null on any failure so the caller falls through to its existing
 * non-persisted result — this can only add persistence, never remove a working path.
 */
async function persistAcceptedResumeTextDirect(params: {
  documentType: DocumentType;
  pdfjsText: string;
  resumeId?: string;
  documentHash: string;
  featureRunToken?: string;
}): Promise<ExtractDocumentFromPdfResult | null> {
  if (params.documentType !== 'resume' || !params.resumeId) return null;

  const metadata = await buildBrowserMetadata({
    text: params.pdfjsText,
    documentType: params.documentType,
    documentHash: params.documentHash,
    attemptedProviders: ['pdf_parser'],
  });

  const { error } = await supabase
    .from('resumes')
    .update({
      extracted_text: params.pdfjsText,
      text_hash: metadata.textHash,
      document_hash: metadata.documentHash,
      extraction_version: metadata.extractionVersion,
      extraction_metadata: serializeDocumentExtractionMetadata(metadata),
    })
    .eq('id', params.resumeId);

  if (error) {
    console.error('[DocumentExtraction] direct resume text persistence failed', error);
    return null;
  }

  console.info('[DocumentExtraction] resume text persisted via direct fallback', {
    resumeId: params.resumeId,
    length: params.pdfjsText.length,
  });

  return {
    text: params.pdfjsText,
    pageCount: 0,
    metadata,
    ...(params.featureRunToken ? { featureRunToken: params.featureRunToken } : {}),
  };
}

async function renderPdfPagesToImages(file: File, documentType: DocumentType): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdf = await loadingTask.promise;
  const maxPages = Math.min(pdf.numPages, PAGE_LIMITS[documentType]);
  const images: string[] = [];

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2, MAX_IMAGE_WIDTH / Math.max(1, baseViewport.width));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) continue;

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    await page.render({
      canvasContext: context,
      viewport,
      canvas,
    } as any).promise;

    images.push(canvas.toDataURL('image/png'));
  }

  return images;
}

async function extractDocxText(file: File): Promise<string> {
  const documentXml = await readZipTextEntry(file, ['word/document.xml']);
  if (!documentXml) {
    throw new Error('Could not find DOCX document text.');
  }

  const relatedXmlEntries = await Promise.all([
    readZipTextEntry(file, ['word/header1.xml', 'word/header2.xml', 'word/header3.xml']),
    readZipTextEntry(file, ['word/footer1.xml', 'word/footer2.xml', 'word/footer3.xml']),
  ]);

  return [documentXml, ...relatedXmlEntries]
    .filter((xml): xml is string => Boolean(xml))
    .map(extractTextFromWordXml)
    .join('\n')
    .trim();
}

async function readZipTextEntry(file: File, entryNames: string[]): Promise<string | null> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const eocdOffset = findEndOfCentralDirectory(bytes);
  if (eocdOffset < 0) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  const centralDirectorySize = view.getUint32(eocdOffset + 12, true);
  const wanted = new Set(entryNames);
  let offset = centralDirectoryOffset;
  const end = centralDirectoryOffset + centralDirectorySize;

  while (offset < end && view.getUint32(offset, true) === 0x02014b50) {
    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const filenameStart = offset + 46;
    const filename = new TextDecoder().decode(bytes.slice(filenameStart, filenameStart + fileNameLength));

    if (wanted.has(filename)) {
      const localNameLength = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(dataStart, dataStart + compressedSize);
      const inflated = compressionMethod === 0
        ? compressed
        : compressionMethod === 8
          ? await inflateRaw(compressed)
          : null;

      if (!inflated) return null;
      return new TextDecoder().decode(inflated);
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return null;
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 &&
      bytes[i + 3] === 0x06
    ) {
      return i;
    }
  }
  return -1;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const DecompressionStreamCtor = (globalThis as {
    DecompressionStream?: new (format: string) => TransformStream<Uint8Array, Uint8Array>;
  }).DecompressionStream;

  if (!DecompressionStreamCtor) {
    throw new Error('DOCX extraction is not supported in this browser.');
  }

  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStreamCtor('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function extractTextFromWordXml(xml: string): string {
  return canonicalizeExtractedText(
    decodeXmlEntities(
      xml
        .replace(/<w:tab\b[^>]*\/>/g, '\t')
        .replace(/<w:br\b[^>]*\/>/g, '\n')
        .replace(/<\/w:p>/g, '\n')
        .replace(/<[^>]+>/g, ''),
    ),
  );
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function assessBrowserExtractionQuality(text: string, documentType: DocumentType): QualityResult {
  const canonicalText = canonicalizeExtractedText(text);
  const words = canonicalText.match(/[\p{L}\p{N}][\p{L}\p{N}.'-]*/gu) ?? [];
  const wordCount = words.filter(word => word.length > 1).length;
  const threshold = QUALITY_THRESHOLDS[documentType];

  if (wordCount < threshold.minWords || canonicalText.length < threshold.minChars) {
    return { ok: false, reason: 'too_short', canonicalText };
  }

  if (symbolNoiseRatio(canonicalText) > 0.22) {
    return { ok: false, reason: 'too_noisy', canonicalText };
  }

  if (pdfOperatorRatio(canonicalText) > 0.08) {
    return { ok: false, reason: 'pdf_operator_noise', canonicalText };
  }

  if (highestRepeatedLineRatio(canonicalText) > 0.35) {
    return { ok: false, reason: 'repetitive', canonicalText };
  }

  if (countDocumentSignals(canonicalText, documentType) < 1) {
    return { ok: false, reason: 'missing_document_signals', canonicalText };
  }

  return { ok: true, canonicalText };
}

function canonicalizeExtractedText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function countDocumentSignals(text: string, documentType: DocumentType): number {
  void documentType;
  return GENERIC_DOCUMENT_SIGNALS.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function symbolNoiseRatio(text: string): number {
  const symbols = text.match(/[^\p{L}\p{N}\s.,;:'"@()&/+\-#]/gu) ?? [];
  return symbols.length / Math.max(1, text.length);
}

function highestRepeatedLineRatio(text: string): number {
  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length >= 12);

  if (lines.length < 4) return 0;

  const counts = new Map<string, number>();
  for (const line of lines) {
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }

  return Math.max(...counts.values()) / lines.length;
}

function pdfOperatorRatio(text: string): number {
  const tokens = text.match(/\b(BT|ET|Tj|TJ|Td|Tm|Tf|stream|endstream|xref|obj|endobj)\b/g) ?? [];
  const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}.'-]*/gu) ?? [];
  return tokens.length / Math.max(1, words.length);
}

async function buildBrowserMetadata(params: {
  text: string;
  documentType: DocumentType;
  documentHash: string;
  attemptedProviders: ExtractionProvider[];
  provider?: ExtractionProvider;
}): Promise<DocumentExtractionMetadata> {
  return {
    provider: params.provider ?? 'pdf_parser',
    attemptedProviders: params.attemptedProviders,
    qualityStatus: 'accepted',
    documentType: params.documentType,
    textHash: await sha256Hex(canonicalizeExtractedText(params.text)),
    documentHash: params.documentHash,
    extractionVersion: DOCUMENT_EXTRACTION_VERSION,
    extractedAt: new Date().toISOString(),
    reusedAcceptedText: false,
  };
}

function getFileExtension(fileName: string): string {
  const match = /\.[^.]+$/.exec(fileName.trim().toLowerCase());
  return match?.[0] ?? '';
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}
