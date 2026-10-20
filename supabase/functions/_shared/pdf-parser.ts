import { extractDocumentText } from './document-extraction.ts';
import {
  DOCUMENT_EXTRACTION_VERSION,
  type DocumentType,
  type ExtractionResult,
} from './document-extraction-types.ts';
import { sha256Hex } from './cache-fingerprint.ts';

// Backend raw-byte PDF parsing was intentionally removed for Phase 51. Supabase
// Edge does not currently carry a reliable embedded-text parser here, so browser
// pdf.js text is the accepted parser path and OCR policy stays in ocr-pdf.
export async function extractPDFText(pdfBuffer: ArrayBuffer): Promise<string> {
  const result = await extractPDFTextWithMetadata(pdfBuffer, 'resume');
  if (result.ok) return result.text;

  throw new Error('Unable to extract text from PDF. Please use a text-based PDF or route through ocr-pdf.');
}

export async function extractPDFTextWithMetadata(
  pdfBuffer: ArrayBuffer,
  documentType: DocumentType = 'resume',
): Promise<ExtractionResult> {
  return await extractDocumentText({
    documentType,
    documentHash: await sha256Hex(String(pdfBuffer.byteLength)),
    extractionVersion: DOCUMENT_EXTRACTION_VERSION,
    pdfjsText: null,
    images: [],
    claudeOcr: async () => ({ ok: false, reason: 'claude_ocr_blocked_by_policy' }),
  });
}
