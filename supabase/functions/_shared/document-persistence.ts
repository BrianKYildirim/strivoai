import type {
  DocumentType,
  ExtractionMetadata,
  ExtractionPolicy,
  ExtractionResult,
  ExtractionSuccess,
} from './document-extraction-types.ts';
import { DOCUMENT_EXTRACTION_VERSION } from './document-extraction-types.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

/**
 * The client these helpers receive — the REAL supabase-js client type, i.e. exactly what
 * getServiceClient() returns and what every production call site actually passes.
 *
 * Why not the hand-rolled structural mimic this replaced? Because it could not be made
 * honest. The old shape declared `eq()` directly on the value returned by `update()` and
 * modelled the builders as plain `Promise`s, which PostgREST does not do; a real
 * SupabaseClient therefore failed to satisfy it (TS2322: PostgrestBuilder is missing
 * catch/finally). Correcting the shape is not enough either — PostgREST's builders are
 * self-recursive AND heavily generic, so assigning a real SupabaseClient to ANY chainable
 * mimic makes the compiler give up (TS2589, "type instantiation is excessively deep"),
 * which is exactly what analyze-career hit. The only ways to keep a mimic would be an
 * `as unknown as` assertion or a suppression — asserting a relationship the compiler
 * cannot verify. Naming the real type keeps the production call sites genuinely checked
 * against the value that is genuinely passed. Mirrors the precedent recorded in
 * extract-analysis-structure/types.ts.
 *
 * Trade-off, recorded honestly: getServiceClient() is un-parameterised (no generated
 * Database generic), so supabase-js types query results as `any` and row fields are
 * unchecked at the DB boundary. This module already compensates by narrowing every raw
 * value through isRecord/typeof guards before use — keep doing that. If a generated
 * Database type is ever wired into getServiceClient(), row access here becomes checked
 * with no change to this alias.
 *
 * Note: the `__tests__` mocks pass duck-typed objects that no longer match this type.
 * They run under `deno test --no-check`, so they are unaffected; type-checking the test
 * files is tracked separately.
 */
type SupabaseClientLike = SupabaseClient;

type PersistAcceptedExtractionParams =
  | {
      supabase: SupabaseClientLike;
      target: 'resume';
      userId: string;
      resumeId: string;
      result: ExtractionResult;
    }
  | {
      supabase: SupabaseClientLike;
      target: 'linkedin_profile';
      userId: string;
      filename?: string | null;
      result: ExtractionResult;
    };

export type SerializedExtractionMetadata = {
  provider: ExtractionMetadata['provider'];
  attempted_providers: ExtractionMetadata['attemptedProviders'];
  quality_status: ExtractionMetadata['qualityStatus'];
  document_type: ExtractionMetadata['documentType'];
  text_hash: string;
  document_hash: string;
  extraction_version: string;
  extracted_at: string;
  reused_accepted_text: boolean;
  fallback_reason?: string;
};

export type PersistAcceptedExtractionResult =
  | { ok: true; persisted: boolean; textHash?: string }
  | { ok: false; persisted: false; error: string };

/**
 * `found: true` carries an ExtractionSuccess, not the full ExtractionResult union:
 * buildLookupResult is the only producer of that arm and always builds `{ ok: true,
 * text, metadata }` — the failure arm is unreachable there. Narrowing the declared
 * type lets `if (reuse.ok && reuse.found)` guards read `.text` / `.metadata` honestly.
 */
export type LookupAcceptedExtractionResult =
  | { ok: true; found: true; result: ExtractionSuccess }
  | { ok: true; found: false }
  | { ok: false; found: false; error: string };

export function serializeExtractionMetadata(metadata: ExtractionMetadata): SerializedExtractionMetadata {
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

export async function lookupAcceptedExtraction(params: {
  supabase: SupabaseClientLike;
  policy: ExtractionPolicy;
}): Promise<LookupAcceptedExtractionResult> {
  const extractionVersion = params.policy.extractionVersion || DOCUMENT_EXTRACTION_VERSION;

  if (params.policy.documentType === 'resume') {
    const { data, error } = await params.supabase
      .from('resumes')
      .select('extracted_text, text_hash, extraction_metadata, document_hash, extraction_version')
      .eq('user_id', params.policy.userId)
      .eq('document_hash', params.policy.documentHash)
      .eq('extraction_version', extractionVersion)
      .maybeSingle<Record<string, unknown>>();

    if (error) return { ok: false, found: false, error: errorToString(error) };
    return buildLookupResult(data, params.policy);
  }

  const { data, error } = await params.supabase
    .from('profiles')
    .select('linkedin_pdf_content, linkedin_pdf_text_hash, linkedin_pdf_extraction_metadata, linkedin_pdf_document_hash, linkedin_pdf_extraction_version')
    .eq('id', params.policy.userId)
    .eq('linkedin_pdf_document_hash', params.policy.documentHash)
    .eq('linkedin_pdf_extraction_version', extractionVersion)
    .maybeSingle<Record<string, unknown>>();

  if (error) return { ok: false, found: false, error: errorToString(error) };
  return buildLookupResult(data, params.policy);
}

export async function persistAcceptedExtraction(
  params: PersistAcceptedExtractionParams,
): Promise<PersistAcceptedExtractionResult> {
  if (!params.result.ok || params.result.text.trim().length === 0) {
    return { ok: true, persisted: false };
  }

  const metadata = serializeExtractionMetadata(params.result.metadata);

  if (params.target === 'resume') {
    const { error } = await params.supabase
      .from('resumes')
      .update({
        extracted_text: params.result.text,
        text_hash: params.result.metadata.textHash,
        document_hash: params.result.metadata.documentHash,
        extraction_version: params.result.metadata.extractionVersion,
        extraction_metadata: metadata,
      })
      .eq('id', params.resumeId)
      .eq('user_id', params.userId);

    if (error) {
      return { ok: false, persisted: false, error: errorToString(error) };
    }

    return { ok: true, persisted: true, textHash: params.result.metadata.textHash };
  }

  const payload: Record<string, unknown> = {
    linkedin_pdf_content: params.result.text,
    linkedin_pdf_updated_at: params.result.metadata.extractedAt,
    linkedin_pdf_text_hash: params.result.metadata.textHash,
    linkedin_pdf_document_hash: params.result.metadata.documentHash,
    linkedin_pdf_extraction_version: params.result.metadata.extractionVersion,
    linkedin_pdf_extraction_metadata: metadata,
  };

  if (params.filename?.trim()) {
    payload.linkedin_pdf_filename = params.filename.trim();
  }

  const { error } = await params.supabase
    .from('profiles')
    .update(payload)
    .eq('id', params.userId);

  if (error) {
    return { ok: false, persisted: false, error: errorToString(error) };
  }

  return { ok: true, persisted: true, textHash: params.result.metadata.textHash };
}

function buildLookupResult(
  row: Record<string, unknown> | null,
  policy: ExtractionPolicy,
): LookupAcceptedExtractionResult {
  const text = typeof row?.extracted_text === 'string'
    ? row.extracted_text
    : typeof row?.linkedin_pdf_content === 'string'
      ? row.linkedin_pdf_content
      : null;

  if (!text?.trim()) return { ok: true, found: false };

  const textHash = typeof row?.text_hash === 'string'
    ? row.text_hash
    : typeof row?.linkedin_pdf_text_hash === 'string'
      ? row.linkedin_pdf_text_hash
      : '';
  const existingMetadata = isRecord(row?.extraction_metadata)
    ? row.extraction_metadata
    : isRecord(row?.linkedin_pdf_extraction_metadata)
      ? row.linkedin_pdf_extraction_metadata
      : {};

  return {
    ok: true,
    found: true,
    result: {
      ok: true,
      text,
      metadata: {
        provider: 'pdf_parser',
        attemptedProviders: [],
        qualityStatus: 'accepted',
        documentType: policy.documentType,
        textHash,
        documentHash: policy.documentHash,
        extractionVersion: policy.extractionVersion,
        extractedAt: typeof existingMetadata.extracted_at === 'string'
          ? existingMetadata.extracted_at
          : new Date().toISOString(),
        reusedAcceptedText: true,
        fallbackReason: 'accepted_text_reuse',
      },
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function errorToString(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return String(error);
}
