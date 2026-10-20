export type DocumentType = 'resume' | 'linkedin_profile';

export const DOCUMENT_EXTRACTION_VERSION = 'phase51-v1';

export type ExtractionProvider = 'pdf_parser' | 'ollama' | 'mistral' | 'textract' | 'claude_ocr';

export type QualityStatus = 'accepted' | 'rejected' | 'failed';

export interface ProviderEvidence {
  provider: 'mistral' | 'textract' | 'anthropic';
  modelOrApi: string | null;
  region: string | null;
  providerRequestId: string | null;
  billablePages: number | null;
  attemptCount: number;
  durationMs: number;
  reportedCostUsd: number | null;
}

export interface ProviderAttempt {
  provider: ExtractionProvider;
  qualityStatus: QualityStatus;
  reason?: string;
  attemptedAt: string;
  providerEvidence?: ProviderEvidence;
}

export interface ExtractionMetadata {
  provider: ExtractionProvider;
  attemptedProviders: ExtractionProvider[];
  qualityStatus: QualityStatus;
  documentType: DocumentType;
  textHash: string;
  documentHash: string;
  extractionVersion: string;
  extractedAt: string;
  reusedAcceptedText: boolean;
  fallbackReason?: string;
}

export interface ExtractionPolicy {
  userId: string;
  tier: string;
  allowClaudeOcr: boolean;
  documentType: DocumentType;
  documentHash: string;
  extractionVersion: string;
}

/**
 * The success arm of ExtractionResult, named so it can be referenced on its own.
 *
 * Why it needs a name: `lookupAcceptedExtraction` can only ever return an accepted
 * extraction on its `found: true` arm (buildLookupResult constructs `{ ok: true, text,
 * metadata }` inline and is the only producer of that arm), but it declared the field as
 * the full `ExtractionResult` union. Callers guarding `if (reuse.ok && reuse.found)`
 * narrowed the lookup, not the inner union, so reading `.text` was a type error even
 * though it is unreachable-safe at runtime. Naming the arm lets the declared type say
 * what the code actually does, instead of forcing a cast at the call site.
 */
export type ExtractionSuccess = {
  ok: true;
  text: string;
  metadata: ExtractionMetadata;
  attempts?: ProviderAttempt[];
  providerEvidence?: ProviderEvidence;
};

export type ExtractionResult =
  | ExtractionSuccess
  | {
      ok: false;
      attemptedProviders: ExtractionProvider[];
      documentType: DocumentType;
      reason: string;
      attempts?: ProviderAttempt[];
    };
