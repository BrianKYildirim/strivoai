import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { invokeAnthropicText } from '../_shared/anthropic.ts';
import { requireAuth } from '../_shared/auth.ts';
import { corsHeaders, handleOptionsRequest, withCors } from '../_shared/cors.ts';
import { checkRateLimit, createRateLimitResponse } from '../_shared/rate-limiter.ts';
import { FREE_MODEL } from '../_shared/tier-config.ts';
import { getServiceClient } from '../_shared/supabase-client.ts';
import { extractDocumentText } from '../_shared/document-extraction.ts';
import {
  DOCUMENT_EXTRACTION_VERSION,
  type DocumentType,
  type ExtractionPolicy,
  type ProviderAttempt,
  type ProviderEvidence,
} from '../_shared/document-extraction-types.ts';
import {
  lookupAcceptedExtraction,
  persistAcceptedExtraction,
} from '../_shared/document-persistence.ts';
import { sha256Hex } from '../_shared/cache-fingerprint.ts';
import { resolveFeatureRunToken } from '../_shared/feature-run-token.ts';
import {
  recordDocumentProcessingRun,
  type DocumentTelemetryParent,
} from '../_shared/document-telemetry.ts';

class OcrResponseError extends Error {
  constructor(
    readonly response: Response,
    readonly telemetryIds: number[] = [],
    readonly attemptCount: number = 0,
  ) {
    super('OCR response error');
  }
}

interface TrackedFeatureRun {
  parent: DocumentTelemetryParent;
  runVariant: string;
  inputType: string;
  documentCount: number | null;
}

const FORBIDDEN_COSTING_FIELDS = new Set([
  'featureRunId', 'userId', 'tier', 'subscriptionPeriod', 'environment',
  'excludeFromCosting', 'meritsCharged', 'meritsRefunded', 'pageCost',
  'providerResult', 'attemptCount', 'model', 'pricingId', 'reportedCostUsd',
  'calculatedCostUsd', 'incurredCostUsd', 'costKnown', 'costConfidence',
]);

async function resolveTrackedFeatureRun(
  featureRunToken: string,
  userId: string,
): Promise<TrackedFeatureRun | null> {
  const token = await resolveFeatureRunToken(featureRunToken);
  if (!token || token.userId !== userId) return null;
  const { data, error } = await getServiceClient()
    .from('feature_runs')
    // Keep this as one literal so supabase-js preserves the selected row type.
    .select('id,costing_subject_id,request_id,user_id,feature,tier_at_time,environment,exclude_from_costing_at_time,run_variant,input_type,document_count,status')
    .eq('id', token.featureRunId)
    .eq('user_id', userId)
    .maybeSingle();
  if (
    error || !data || data.status !== 'started' ||
    data.feature !== token.feature ||
    data.run_variant !== token.runVariant ||
    data.input_type !== token.inputType ||
    data.document_count !== token.documentCount ||
    (data.tier_at_time !== 'free' && data.tier_at_time !== 'pro' && data.tier_at_time !== 'elite') ||
    (data.environment !== 'production' && data.environment !== 'staging' &&
      data.environment !== 'development' && data.environment !== 'test')
  ) return null;
  return {
    parent: {
      featureRunId: data.id,
      costingSubjectId: data.costing_subject_id,
      requestId: data.request_id,
      userId: data.user_id,
      feature: data.feature,
      tierAtTime: data.tier_at_time,
      environment: data.environment,
      excludeFromCostingAtTime: data.exclude_from_costing_at_time,
    },
    runVariant: data.run_variant,
    inputType: data.input_type,
    documentCount: data.document_count,
  } as TrackedFeatureRun;
}

function lastProviderEvidence(attempts: ProviderAttempt[] | undefined): ProviderEvidence | null {
  return [...(attempts ?? [])].reverse().find((attempt) => attempt.providerEvidence)?.providerEvidence ?? null;
}

function triggerReason(attempts: ProviderAttempt[] | undefined):
  'empty_extraction' | 'insufficient_text' | 'parser_error' | 'other' {
  const parserReason = attempts?.find((attempt) => attempt.provider === 'pdf_parser')?.reason ?? '';
  if (parserReason.includes('no_text')) return 'empty_extraction';
  if (parserReason.includes('too_short') || parserReason.includes('missing_document_signals')) {
    return 'insufficient_text';
  }
  return parserReason ? 'parser_error' : 'other';
}

async function toAnthropicImageBlock(imageInput: string): Promise<any | null> {
  const dataUrlMatch = imageInput.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (dataUrlMatch) {
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: dataUrlMatch[1],
        data: dataUrlMatch[2],
      },
    };
  }

  try {
    const resp = await fetch(imageInput);
    if (!resp.ok) return null;
    const bytes = new Uint8Array(await resp.arrayBuffer());
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
    }
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: resp.headers.get('content-type') || 'image/png',
        data: btoa(binary),
      },
    };
  } catch {
    return null;
  }
}

function resolveDocumentType(value: unknown): DocumentType {
  return value === 'linkedin_profile' ? 'linkedin_profile' : 'resume';
}

async function runClaudePageOcr(
  images: string[],
  headers: HeadersInit,
  context: { parent: DocumentTelemetryParent; reqId: string },
): Promise<{ ok: true; text: string; evidence: ProviderEvidence; telemetryIds: number[] }> {
  const extractedTexts: string[] = [];
  const telemetryIds: number[] = [];
  let attemptCount = 0;
  const started = performance.now();

  for (let i = 0; i < images.length; i++) {
    const imageData = images[i];
    console.log(`Processing page ${i + 1}/${images.length}`);

    const imageBlock = typeof imageData === 'string' ? await toAnthropicImageBlock(imageData) : null;
    if (!imageBlock) {
      console.error(`OCR page ${i + 1} could not be converted to an Anthropic image block`);
      continue;
    }

    attemptCount++;

    const ai = await invokeAnthropicText({
      model: FREE_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `This is page ${i + 1} of a career document. Extract ALL human-readable text from this image exactly as it appears, preserving the structure. Include:
- Names and contact details
- Section headings
- Roles, company names, dates, and locations
- Bullet points and descriptions
- Education, skills, certifications, achievements, or profile sections
- Any other visible text

Output ONLY the extracted text with proper line breaks for readability. No commentary or explanations.`,
            },
            {
              type: 'image',
              source: imageBlock.source,
            },
          ],
        },
      ],
      maxTokens: 3000,
      temperature: 0,
      fixtureKey: 'ocr',
      telemetry: {
        feature: context.parent.feature,
        tier: context.parent.tierAtTime,
        callName: 'document-ocr',
        operationName: 'document_ocr',
        reqId: context.reqId,
        userId: context.parent.userId ?? undefined,
        featureRunId: context.parent.featureRunId,
        costingSubjectId: context.parent.costingSubjectId,
        attempt: attemptCount,
        attemptNumber: attemptCount,
        isRetry: false,
        environment: context.parent.environment,
        excludeFromCostingAtTime: context.parent.excludeFromCostingAtTime,
        telemetryVersion: '04.2',
        costingEpoch: 'phase_04_2_complete',
      },
    });

    if (typeof ai.telemetryId === 'number') telemetryIds.push(ai.telemetryId);

    if (!ai.ok) {
      console.error(`OCR error for page ${i + 1}:`, ai.status, ai.error);

      if (ai.status === 429) {
        throw new OcrResponseError(new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers },
        ), telemetryIds, attemptCount);
      }
      if (ai.status === 402) {
        throw new OcrResponseError(new Response(
          JSON.stringify({ error: 'Payment required. Please add credits.' }),
          { status: 402, headers },
        ), telemetryIds, attemptCount);
      }
      continue;
    }

    const pageText = ai.text || '';
    extractedTexts.push(pageText);
    console.log(`Page ${i + 1} extracted ${pageText.length} characters`);
  }

  return {
    ok: true,
    text: extractedTexts.join('\n\n--- Page Break ---\n\n').trim(),
    telemetryIds,
    evidence: {
      provider: 'anthropic',
      modelOrApi: FREE_MODEL,
      region: null,
      providerRequestId: null,
      billablePages: attemptCount,
      attemptCount,
      durationMs: Math.round(performance.now() - started),
      reportedCostUsd: null,
    },
  };
}

async function resolveRawSubscriptionTier(userId: string): Promise<string> {
  const { data, error } = await getServiceClient()
    .from('profiles')
    .select('subscription_tier')
    .eq('id', userId)
    .single();

  if (error || !data || typeof data.subscription_tier !== 'string') return 'free';
  return data.subscription_tier.toLowerCase();
}

async function resolveDocumentHash(params: {
  documentHash: unknown;
  images: string[];
  pdfjsText: string | null;
}): Promise<string> {
  if (typeof params.documentHash === 'string' && /^[a-f0-9]{64}$/i.test(params.documentHash)) {
    return params.documentHash.toLowerCase();
  }

  const fallbackSource = params.images.length > 0
    ? params.images.join('|')
    : params.pdfjsText ?? '';
  return await sha256Hex(fallbackSource);
}

function buildExtractionFailureResponse(extraction: unknown): { code: string; error: string; message: string; reasons: string[] } {
  const attempts = extraction && typeof extraction === 'object' && 'attempts' in extraction
    ? (extraction as { attempts?: Array<{ reason?: string }> }).attempts
    : undefined;
  const reasons = attempts
    ?.map(attempt => attempt.reason)
    .filter((reason): reason is string => typeof reason === 'string' && reason.trim().length > 0) ?? [];

  const fallbackUnavailable = [
    'ollama_config_missing',
    'mistral_config_missing',
    'textract_config_missing',
  ].every(reason => reasons.includes(reason));
  const claudeBlocked = reasons.some(reason => reason.endsWith('_claude_ocr_blocked'));

  const message = fallbackUnavailable && claudeBlocked
    ? 'We could not extract text automatically because OCR fallback providers are not configured for this environment, and Claude OCR is only available to Elite. Please upload a text-based PDF or DOCX, or paste the text directly.'
    : 'We could not read this file reliably. Please upload a text-based PDF or DOCX, or paste the text directly.';

  return {
    code: 'document_extraction_failed',
    error: message,
    message,
    reasons,
  };
}

serve((req) => withCors(req, 'user', async () => {
  if (req.method === 'OPTIONS') {
    return handleOptionsRequest({ type: 'user' });
  }

  const responseHeaders = { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' };
  let activeParent: DocumentTelemetryParent | null = null;
  let activeDocumentOrdinal = 1;
  let activeFileSizeBytes: number | null = null;
  const requestStarted = performance.now();

  try {
    const userContextOcr = await requireAuth(req, { type: 'user' });
    if (!userContextOcr) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: responseHeaders },
      );
    }

    const parsedBody = await req.json();
    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
      return new Response(
        JSON.stringify({ error: 'invalid_feature_run_token' }),
        { status: 400, headers: responseHeaders },
      );
    }
    const body = parsedBody as Record<string, unknown>;
    if (Object.keys(body).some((key) => FORBIDDEN_COSTING_FIELDS.has(key))) {
      return new Response(
        JSON.stringify({ error: 'invalid_feature_run_token' }),
        { status: 400, headers: responseHeaders },
      );
    }
    const featureRunToken = typeof body.featureRunToken === 'string'
      ? body.featureRunToken
      : '';
    const featureRun = await resolveTrackedFeatureRun(featureRunToken, userContextOcr.userId);
    if (!featureRun || (featureRun.inputType !== 'pdf' && featureRun.inputType !== 'mixed') ||
      (featureRun.documentCount ?? 0) < 1) {
      return new Response(
        JSON.stringify({ error: 'invalid_feature_run_token' }),
        { status: 400, headers: responseHeaders },
      );
    }
    activeParent = featureRun.parent;
    activeDocumentOrdinal = typeof body.documentOrdinal === 'number' &&
        Number.isInteger(body.documentOrdinal) && body.documentOrdinal > 0 &&
        body.documentOrdinal <= (featureRun.documentCount ?? 0)
      ? body.documentOrdinal
      : 1;
    if ((featureRun.documentCount ?? 0) > 1 && body.documentOrdinal === undefined) {
      return new Response(
        JSON.stringify({ error: 'invalid_document_ordinal' }),
        { status: 400, headers: responseHeaders },
      );
    }
    if (body.documentOrdinal !== undefined && activeDocumentOrdinal !== body.documentOrdinal) {
      return new Response(
        JSON.stringify({ error: 'invalid_document_ordinal' }),
        { status: 400, headers: responseHeaders },
      );
    }
    activeFileSizeBytes = typeof body.fileSizeBytes === 'number' &&
        Number.isFinite(body.fileSizeBytes) && body.fileSizeBytes >= 0
      ? body.fileSizeBytes
      : null;

    const rlOcr = await checkRateLimit(userContextOcr.userId, userContextOcr.tier, {
      key: 'ocr-pdf',
      limits: { free: 5, pro: 15, elite: 30 },
    });
    if (!rlOcr.allowed) {
      return createRateLimitResponse(rlOcr.retryAfterSeconds, 'user');
    }

    const { images, resumeId, documentType, pdfjsText, documentHash, filename } = body;
    const normalizedImages = Array.isArray(images)
      ? images.filter((image): image is string => typeof image === 'string' && image.trim().length > 0)
      : [];
    const resolvedDocumentType = resolveDocumentType(documentType);
    const initialPdfjsText = typeof pdfjsText === 'string' ? pdfjsText : null;
    const serviceClient = getServiceClient();
    const resolvedDocumentHash = await resolveDocumentHash({
      documentHash,
      images: normalizedImages,
      pdfjsText: initialPdfjsText,
    });
    const rawTier = await resolveRawSubscriptionTier(userContextOcr.userId);
    const extractionPolicy: ExtractionPolicy = {
      userId: userContextOcr.userId,
      tier: rawTier,
      allowClaudeOcr: rawTier === 'elite',
      documentType: resolvedDocumentType,
      documentHash: resolvedDocumentHash,
      extractionVersion: DOCUMENT_EXTRACTION_VERSION,
    };

    await recordDocumentProcessingRun({
      parent: featureRun.parent,
      documentOrdinal: activeDocumentOrdinal,
      fileType: 'pdf',
      pageCount: normalizedImages.length,
      fileSizeBytes: activeFileSizeBytes,
      initialExtractor: 'pdf_parser',
      extractionStatus: 'started',
      startedAt: new Date().toISOString(),
    });

    if (normalizedImages.length === 0 && !initialPdfjsText?.trim()) {
      await recordDocumentProcessingRun({
        parent: featureRun.parent,
        documentOrdinal: activeDocumentOrdinal,
        fileType: 'pdf',
        pageCount: null,
        fileSizeBytes: activeFileSizeBytes,
        initialExtractor: 'pdf_parser',
        finalExtractor: 'none',
        extractionStatus: 'empty',
        extractedCharacterCount: 0,
        extractionDurationMs: Math.round(performance.now() - requestStarted),
        ocrTriggered: false,
        errorCode: 'document_input_empty',
        errorCategory: 'validation',
      });
      return new Response(
        JSON.stringify({ error: 'No images provided' }),
        { status: 400, headers: responseHeaders },
      );
    }

    console.log(`Processing ${normalizedImages.length} page(s) for OCR`);

    const reuse = await lookupAcceptedExtraction({
      supabase: serviceClient,
      policy: extractionPolicy,
    });
    if (reuse.ok && reuse.found) {
      // 2026-07-24 prod incident: a re-upload of already-accepted bytes creates a NEW
      // resumes row with empty extracted_text. This short-circuit used to return without
      // persisting to that new row, and the backend PDF parser is intentionally a no-op
      // (pdf-parser.ts, Phase 51) — so Career Compass, which resolves resume text by the
      // NEW row's file_path, died with a permanent 400/INPUT_MISSING on every retry.
      // Copy the reused accepted extraction onto the new row before returning.
      if (resolvedDocumentType === 'resume' && resumeId && typeof resumeId === 'string') {
        try {
          const persistResult = await persistAcceptedExtraction({
            supabase: serviceClient,
            target: 'resume',
            userId: userContextOcr.userId,
            resumeId,
            result: reuse.result,
          });
          if (!persistResult.ok) {
            console.error('[ocr-pdf] reuse persist failed', persistResult.error);
          }
        } catch (e) {
          console.error('[ocr-pdf] reuse persist threw', e);
        }
      }
      await recordDocumentProcessingRun({
        parent: featureRun.parent,
        documentOrdinal: activeDocumentOrdinal,
        fileType: 'pdf',
        pageCount: normalizedImages.length,
        fileSizeBytes: activeFileSizeBytes,
        initialExtractor: 'accepted_extraction',
        finalExtractor: 'accepted_extraction',
        extractionStatus: 'completed',
        extractedCharacterCount: reuse.result.text.length,
        extractionDurationMs: Math.round(performance.now() - requestStarted),
        ocrTriggered: false,
      });
      return new Response(
        JSON.stringify({
          text: reuse.result.text,
          pageCount: normalizedImages.length,
          metadata: reuse.result.metadata,
        }),
        { headers: responseHeaders },
      );
    }
    if (!reuse.ok) {
      console.error('[ocr-pdf] accepted extraction lookup failed', {
        documentType: resolvedDocumentType,
        reason: reuse.error,
      });
    }

    let claudeTelemetryIds: number[] = [];
    const extraction = await extractDocumentText({
      documentType: resolvedDocumentType,
      policy: extractionPolicy,
      pdfjsText: initialPdfjsText,
      images: normalizedImages,
      claudeOcr: async () => {
        if (normalizedImages.length === 0) {
          return { ok: false, reason: 'claude_ocr_no_images' };
        }
        const claudeResult = await runClaudePageOcr(normalizedImages, responseHeaders, {
          parent: featureRun.parent,
          reqId: featureRun.parent.requestId ?? crypto.randomUUID(),
        });
        claudeTelemetryIds = claudeResult.telemetryIds;
        return claudeResult;
      },
    });

    if (!extraction.ok) {
      const failureResponse = buildExtractionFailureResponse(extraction);
      const evidence = lastProviderEvidence(extraction.attempts);
      const ocrTriggered = (evidence?.attemptCount ?? 0) > 0;
      await recordDocumentProcessingRun({
        parent: featureRun.parent,
        documentOrdinal: activeDocumentOrdinal,
        fileType: 'pdf',
        pageCount: normalizedImages.length,
        fileSizeBytes: activeFileSizeBytes,
        initialExtractor: 'pdf_parser',
        finalExtractor: 'none',
        extractionStatus: 'failed',
        extractedCharacterCount: 0,
        extractionDurationMs: Math.round(performance.now() - requestStarted),
        ocrTriggered,
        ocrTriggerReason: ocrTriggered ? triggerReason(extraction.attempts) : null,
        ocrProvider: evidence?.provider === 'anthropic' ? 'anthropic' : evidence?.provider ?? null,
        ocrModel: evidence?.modelOrApi ?? null,
        ocrPages: evidence?.billablePages ?? null,
        ocrAttemptCount: evidence?.attemptCount ?? (ocrTriggered ? 1 : 0),
        ocrStatus: ocrTriggered ? 'failed' : 'not_triggered',
        providerRequestId: evidence?.providerRequestId ?? null,
        providerReportedCostUsd: evidence?.reportedCostUsd ?? null,
        aiCallTelemetryId: claudeTelemetryIds[0] ?? null,
        errorCode: extraction.reason,
        errorCategory: evidence ? 'provider' : 'parsing',
      });
      console.error('[ocr-pdf] extraction failed', {
        documentType: extraction.documentType,
        reason: extraction.reason,
        attemptedProviders: extraction.attemptedProviders,
        failureReasons: failureResponse.reasons,
      });
      return new Response(
        JSON.stringify(failureResponse),
        { status: 422, headers: responseHeaders },
      );
    }

    console.log(`Total OCR extracted: ${extraction.text.length} characters`);
    const evidence = extraction.providerEvidence ?? lastProviderEvidence(extraction.attempts);
    const ocrTriggered = (evidence?.attemptCount ?? 0) > 0;
    const finalExtractor = extraction.metadata.provider === 'ollama'
      ? 'none'
      : extraction.metadata.provider;
    await recordDocumentProcessingRun({
      parent: featureRun.parent,
      documentOrdinal: activeDocumentOrdinal,
      fileType: 'pdf',
      pageCount: normalizedImages.length,
      fileSizeBytes: activeFileSizeBytes,
      initialExtractor: 'pdf_parser',
      finalExtractor,
      extractionStatus: 'completed',
      extractedCharacterCount: extraction.text.length,
      extractionDurationMs: Math.round(performance.now() - requestStarted),
      ocrTriggered,
      ocrTriggerReason: ocrTriggered ? triggerReason(extraction.attempts) : null,
      ocrProvider: evidence?.provider === 'anthropic' ? 'anthropic' : evidence?.provider ?? null,
      ocrModel: evidence?.modelOrApi ?? null,
      ocrPages: evidence?.billablePages ?? null,
      ocrAttemptCount: evidence?.attemptCount ?? 0,
      ocrStatus: ocrTriggered ? 'completed' : 'not_triggered',
      providerRequestId: evidence?.providerRequestId ?? null,
      providerReportedCostUsd: evidence?.reportedCostUsd ?? null,
      aiCallTelemetryId: extraction.metadata.provider === 'claude_ocr'
        ? claudeTelemetryIds[0] ?? null
        : null,
    });

    if (resolvedDocumentType === 'resume' && resumeId && typeof resumeId === 'string') {
      try {
        const persistResult = await persistAcceptedExtraction({
          supabase: serviceClient,
          target: 'resume',
          userId: userContextOcr.userId,
          resumeId,
          result: extraction,
        });
        if (!persistResult.ok) {
          console.error('[ocr-pdf] resumes text persist failed', persistResult.error);
        }
      } catch (e) {
        console.error('[ocr-pdf] resumes text persist threw', e);
      }
    }

    if (resolvedDocumentType === 'linkedin_profile') {
      try {
        const persistResult = await persistAcceptedExtraction({
          supabase: serviceClient,
          target: 'linkedin_profile',
          userId: userContextOcr.userId,
          filename: typeof filename === 'string' ? filename : null,
          result: extraction,
        });
        if (!persistResult.ok) {
          console.error('[ocr-pdf] linkedin text persist failed', persistResult.error);
        }
      } catch (e) {
        console.error('[ocr-pdf] linkedin text persist threw', e);
      }
    }

    return new Response(
      JSON.stringify({
        text: extraction.text,
        pageCount: normalizedImages.length,
        metadata: extraction.metadata,
      }),
      { headers: responseHeaders },
    );
  } catch (error: unknown) {
    if (error instanceof OcrResponseError) {
      if (activeParent) {
        await recordDocumentProcessingRun({
          parent: activeParent,
          documentOrdinal: activeDocumentOrdinal,
          fileType: 'pdf',
          fileSizeBytes: activeFileSizeBytes,
          initialExtractor: 'pdf_parser',
          finalExtractor: 'none',
          extractionStatus: 'failed',
          extractionDurationMs: Math.round(performance.now() - requestStarted),
          ocrTriggered: error.attemptCount > 0,
          ocrTriggerReason: error.attemptCount > 0 ? 'other' : null,
          ocrProvider: error.attemptCount > 0 ? 'anthropic' : null,
          ocrModel: error.attemptCount > 0 ? FREE_MODEL : null,
          ocrAttemptCount: error.attemptCount,
          ocrStatus: error.attemptCount > 0 ? 'failed' : 'not_triggered',
          aiCallTelemetryId: error.telemetryIds[0] ?? null,
          errorCode: `claude_ocr_http_${error.response.status}`,
          errorCategory: 'provider',
        });
      }
      return error.response;
    }
    if (error instanceof Response) return error;

    if (activeParent) {
      await recordDocumentProcessingRun({
        parent: activeParent,
        documentOrdinal: activeDocumentOrdinal,
        fileType: 'pdf',
        fileSizeBytes: activeFileSizeBytes,
        initialExtractor: 'unknown',
        finalExtractor: 'none',
        extractionStatus: 'failed',
        extractionDurationMs: Math.round(performance.now() - requestStarted),
        ocrTriggered: false,
        errorCode: 'ocr_handler_failed',
        errorCategory: 'internal',
      });
    }

    console.error('OCR error:', error);
    const errorMessage = error instanceof Error ? error.message : 'OCR failed';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: responseHeaders },
    );
  }
}));
