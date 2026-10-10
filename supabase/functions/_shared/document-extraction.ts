import type {
  DocumentType,
  ExtractionMetadata,
  ExtractionProvider,
  ExtractionPolicy,
  ExtractionResult,
  ProviderAttempt,
  ProviderEvidence,
} from './document-extraction-types.ts';
import { DOCUMENT_EXTRACTION_VERSION } from './document-extraction-types.ts';
import {
  assessExtractionQuality,
  extractedTextHash,
} from './document-quality.ts';
import {
  invokeMistralOcr,
  type MistralOcrParams,
  type MistralOcrResult,
} from './mistral-ocr-client.ts';
import {
  invokeTextractOcr,
  type TextractOcrParams,
  type TextractOcrResult,
} from './textract-client.ts';

export type ClaudeOcrResult =
  | string
  | { ok: true; text: string; evidence?: ProviderEvidence }
  | { ok: false; reason?: string; error?: string; evidence?: ProviderEvidence };

export interface ExtractDocumentTextParams {
  documentType: DocumentType;
  policy?: ExtractionPolicy;
  documentHash?: string;
  extractionVersion?: string;
  pdfjsText?: string | null;
  images?: string[] | null;
  claudeOcr: () => Promise<ClaudeOcrResult>;
  mistralOcr?: (params: MistralOcrParams) => Promise<MistralOcrResult>;
  textractOcr?: (params: TextractOcrParams) => Promise<TextractOcrResult>;
}

export async function extractDocumentText(params: ExtractDocumentTextParams): Promise<ExtractionResult> {
  const attempts: ProviderAttempt[] = [];
  const attemptedProviders: ExtractionProvider[] = [];
  const fallbackReasons: string[] = [];
  const timestamp = () => new Date().toISOString();
  const policy = resolvePolicy(params);

  attemptedProviders.push('pdf_parser');
  if (params.pdfjsText?.trim()) {
    const quality = assessExtractionQuality({
      text: params.pdfjsText,
      documentType: params.documentType,
      provider: 'pdf_parser',
    });

    if (quality.ok) {
      attempts.push({ provider: 'pdf_parser', qualityStatus: 'accepted', attemptedAt: timestamp() });
      return await acceptedResult({
        text: params.pdfjsText,
        provider: 'pdf_parser',
        attemptedProviders,
        documentType: params.documentType,
        documentHash: policy.documentHash,
        extractionVersion: policy.extractionVersion,
        reusedAcceptedText: false,
        fallbackReasons,
        attempts,
      });
    }

    const reason = `pdf_parser_${quality.reason}`;
    attempts.push({ provider: 'pdf_parser', qualityStatus: 'rejected', reason, attemptedAt: timestamp() });
    fallbackReasons.push(reason);
  } else {
    const reason = 'pdf_parser_no_text';
    attempts.push({ provider: 'pdf_parser', qualityStatus: 'failed', reason, attemptedAt: timestamp() });
    fallbackReasons.push(reason);
  }

  const images = params.images?.filter(image => image.trim().length > 0) ?? [];
  const cheapProviders: Array<{
    provider: ExtractionProvider;
    invoke: () => Promise<
      | { ok: true; text: string; evidence?: ProviderEvidence }
      | { ok: false; reason: string; evidence?: ProviderEvidence }
    >;
  }> = [
    {
      provider: 'mistral',
      invoke: () => (params.mistralOcr ?? invokeMistralOcr)({
        documentType: params.documentType,
        images,
      }),
    },
    {
      provider: 'textract',
      invoke: () => (params.textractOcr ?? invokeTextractOcr)({
        documentType: params.documentType,
        images,
      }),
    },
  ];

  for (const cheapProvider of cheapProviders) {
    attemptedProviders.push(cheapProvider.provider);
    const providerResult = await cheapProvider.invoke();
    if (providerResult.ok === true) {
      const quality = assessExtractionQuality({
        text: providerResult.text,
        documentType: params.documentType,
        provider: cheapProvider.provider,
      });

      if (quality.ok) {
        attempts.push({
          provider: cheapProvider.provider,
          qualityStatus: 'accepted',
          attemptedAt: timestamp(),
          ...(providerResult.evidence ? { providerEvidence: providerResult.evidence } : {}),
        });
        return await acceptedResult({
          text: providerResult.text,
          provider: cheapProvider.provider,
          attemptedProviders,
          documentType: params.documentType,
          documentHash: policy.documentHash,
          extractionVersion: policy.extractionVersion,
          reusedAcceptedText: false,
          fallbackReasons,
          attempts,
          providerEvidence: providerResult.evidence,
        });
      }

      const reason = `${cheapProvider.provider}_${quality.reason}`;
      attempts.push({
        provider: cheapProvider.provider,
        qualityStatus: 'rejected',
        reason,
        attemptedAt: timestamp(),
        ...(providerResult.evidence ? { providerEvidence: providerResult.evidence } : {}),
      });
      fallbackReasons.push(reason);
      continue;
    }

    const failedProviderResult = providerResult as {
      ok: false;
      reason: string;
      evidence?: ProviderEvidence;
    };
    attempts.push({
      provider: cheapProvider.provider,
      qualityStatus: 'failed',
      reason: failedProviderResult.reason,
      attemptedAt: timestamp(),
      ...(failedProviderResult.evidence
        ? { providerEvidence: failedProviderResult.evidence }
        : {}),
    });
    fallbackReasons.push(failedProviderResult.reason);
  }

  if (!policy.allowClaudeOcr) {
    const reason = `${normalizeTierReason(policy.tier)}_claude_ocr_blocked`;
    fallbackReasons.push(reason);
    return {
      ok: false,
      attemptedProviders,
      documentType: params.documentType,
      reason: 'all_providers_failed',
      attempts,
    };
  }

  attemptedProviders.push('claude_ocr');
  const claude = normalizeClaudeOcrResult(await params.claudeOcr());
  if (claude.ok === true) {
    const quality = assessExtractionQuality({
      text: claude.text,
      documentType: params.documentType,
      provider: 'claude_ocr',
    });

    if (quality.ok) {
      attempts.push({
        provider: 'claude_ocr',
        qualityStatus: 'accepted',
        attemptedAt: timestamp(),
        ...(claude.evidence ? { providerEvidence: claude.evidence } : {}),
      });
      return await acceptedResult({
        text: claude.text,
        provider: 'claude_ocr',
        attemptedProviders,
        documentType: params.documentType,
        documentHash: policy.documentHash,
        extractionVersion: policy.extractionVersion,
        reusedAcceptedText: false,
        fallbackReasons,
        attempts,
        providerEvidence: claude.evidence,
      });
    }

    const reason = `claude_ocr_${quality.reason}`;
    attempts.push({ provider: 'claude_ocr', qualityStatus: 'rejected', reason, attemptedAt: timestamp() });
    fallbackReasons.push(reason);
  } else {
    const failedClaude = claude as { ok: false; reason: string; evidence?: ProviderEvidence };
    attempts.push({
      provider: 'claude_ocr',
      qualityStatus: 'failed',
      reason: failedClaude.reason,
      attemptedAt: timestamp(),
      ...(failedClaude.evidence ? { providerEvidence: failedClaude.evidence } : {}),
    });
    fallbackReasons.push(failedClaude.reason);
  }

  return {
    ok: false,
    attemptedProviders,
    documentType: params.documentType,
    reason: 'all_providers_failed',
    attempts,
  };
}

async function acceptedResult(params: {
  text: string;
  provider: ExtractionProvider;
  attemptedProviders: ExtractionProvider[];
  documentType: DocumentType;
  documentHash: string;
  extractionVersion: string;
  reusedAcceptedText: boolean;
  fallbackReasons: string[];
  attempts: ProviderAttempt[];
  providerEvidence?: ProviderEvidence;
}): Promise<ExtractionResult> {
  const metadata: ExtractionMetadata = {
    provider: params.provider,
    attemptedProviders: [...params.attemptedProviders],
    qualityStatus: 'accepted',
    documentType: params.documentType,
    textHash: await extractedTextHash(params.text),
    documentHash: params.documentHash,
    extractionVersion: params.extractionVersion,
    extractedAt: new Date().toISOString(),
    reusedAcceptedText: params.reusedAcceptedText,
    ...(params.fallbackReasons.length > 0
      ? { fallbackReason: params.fallbackReasons.join(';') }
      : {}),
  };

  return {
    ok: true,
    text: params.text,
    metadata,
    attempts: [...params.attempts],
    ...(params.providerEvidence ? { providerEvidence: params.providerEvidence } : {}),
  };
}

function resolvePolicy(params: ExtractDocumentTextParams): ExtractionPolicy {
  if (params.policy) return params.policy;

  return {
    userId: 'unknown',
    tier: 'free',
    allowClaudeOcr: false,
    documentType: params.documentType,
    documentHash: params.documentHash ?? 'unknown',
    extractionVersion: params.extractionVersion ?? DOCUMENT_EXTRACTION_VERSION,
  };
}

function normalizeTierReason(tier: string): string {
  const normalized = tier.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return normalized || 'non_elite';
}

function normalizeClaudeOcrResult(result: ClaudeOcrResult):
  | { ok: true; text: string; evidence?: ProviderEvidence }
  | { ok: false; reason: string; evidence?: ProviderEvidence } {
  if (typeof result === 'string') {
    return result.trim() ? { ok: true, text: result } : { ok: false, reason: 'claude_ocr_empty_response' };
  }

  if (result.ok === true) {
    return result.text.trim()
      ? { ok: true, text: result.text, ...(result.evidence ? { evidence: result.evidence } : {}) }
      : {
          ok: false,
          reason: 'claude_ocr_empty_response',
          ...(result.evidence ? { evidence: result.evidence } : {}),
        };
  }

  const failed = result as {
    ok: false;
    reason?: string;
    error?: string;
    evidence?: ProviderEvidence;
  };
  return {
    ok: false,
    reason: failed.reason ?? failed.error ?? 'claude_ocr_failed',
    ...(failed.evidence ? { evidence: failed.evidence } : {}),
  };
}
