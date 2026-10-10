import { sha256Hex } from './cache-fingerprint.ts';
import type { DocumentType, ExtractionProvider } from './document-extraction-types.ts';

export type ExtractionQualityReason =
  | 'too_short'
  | 'too_noisy'
  | 'repetitive'
  | 'pdf_operator_noise'
  | 'missing_document_signals';

export type ExtractionQualityResult =
  | {
      ok: true;
      reason: null;
      canonicalText: string;
      wordCount: number;
      charCount: number;
      signalCount: number;
    }
  | {
      ok: false;
      reason: ExtractionQualityReason;
      canonicalText: string;
      wordCount: number;
      charCount: number;
      signalCount: number;
    };

export interface AssessExtractionQualityParams {
  text: string;
  documentType: DocumentType;
  provider: ExtractionProvider;
}

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

export function canonicalizeExtractedText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function extractedTextHash(text: string): Promise<string> {
  return await sha256Hex(canonicalizeExtractedText(text));
}

export function assessExtractionQuality(params: AssessExtractionQualityParams): ExtractionQualityResult {
  const canonicalText = canonicalizeExtractedText(params.text);
  const words = canonicalText.match(/[\p{L}\p{N}][\p{L}\p{N}.'-]*/gu) ?? [];
  const wordCount = words.filter(word => word.length > 1).length;
  const charCount = canonicalText.length;
  const signalCount = countDocumentSignals(canonicalText, params.documentType);
  const base = { canonicalText, wordCount, charCount, signalCount };
  const threshold = QUALITY_THRESHOLDS[params.documentType];

  if (wordCount < threshold.minWords || charCount < threshold.minChars) {
    return { ok: false, reason: 'too_short', ...base };
  }

  if (symbolNoiseRatio(canonicalText) > 0.22) {
    return { ok: false, reason: 'too_noisy', ...base };
  }

  if (pdfOperatorRatio(canonicalText) > 0.08) {
    return { ok: false, reason: 'pdf_operator_noise', ...base };
  }

  if (highestRepeatedLineRatio(canonicalText) > 0.35) {
    return { ok: false, reason: 'repetitive', ...base };
  }

  if (signalCount < 1) {
    return { ok: false, reason: 'missing_document_signals', ...base };
  }

  return { ok: true, reason: null, ...base };
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
