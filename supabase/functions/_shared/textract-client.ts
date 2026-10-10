import type { DocumentType, ProviderEvidence } from './document-extraction-types.ts';

export type TextractOcrReason =
  | 'textract_config_missing'
  | 'textract_no_images'
  | 'textract_timeout'
  | 'textract_fetch_failed'
  | 'textract_invalid_response'
  | 'textract_empty_response'
  | `textract_http_${number}`;

export type TextractOcrResult =
  | { ok: true; text: string; evidence: ProviderEvidence }
  | { ok: false; reason: TextractOcrReason; evidence?: ProviderEvidence };

export interface TextractOcrParams {
  documentType: DocumentType;
  images: string[];
}

const DEFAULT_TIMEOUT_MS = 25_000;

export async function invokeTextractOcr(params: TextractOcrParams): Promise<TextractOcrResult> {
  const endpoint = Deno.env.get('TEXTRACT_OCR_ENDPOINT');
  const token = Deno.env.get('TEXTRACT_OCR_TOKEN');
  if (!endpoint || !token) return { ok: false, reason: 'textract_config_missing' };
  if (params.images.length === 0) return { ok: false, reason: 'textract_no_images' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const started = performance.now();
  const evidence = (
    durationMs: number,
    values: Partial<Omit<ProviderEvidence, 'provider' | 'attemptCount' | 'durationMs' | 'reportedCostUsd'>> = {},
  ): ProviderEvidence => ({
    provider: 'textract',
    modelOrApi: null,
    region: null,
    providerRequestId: null,
    billablePages: null,
    attemptCount: 1,
    durationMs,
    // This compatible endpoint does not prove AWS operation/region/billing semantics.
    ...values,
    reportedCostUsd: null,
  });

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        document_type: params.documentType,
        images: params.images,
      }),
      signal: controller.signal,
    });

    const durationMs = Math.round(performance.now() - started);
    const headerRequestId = response.headers.get('x-amzn-requestid') ??
      response.headers.get('x-request-id');
    if (!response.ok) {
      return {
        ok: false,
        reason: `textract_http_${response.status}`,
        evidence: evidence(durationMs, { providerRequestId: headerRequestId }),
      };
    }

    const body = await response.json().catch(() => null) as {
      text?: unknown;
      blocks?: Array<{ text?: unknown }>;
      api?: unknown;
      operation?: unknown;
      region?: unknown;
      request_id?: unknown;
      pages_processed?: unknown;
    } | null;
    const text = typeof body?.text === 'string'
      ? body.text
      : (body?.blocks ?? []).map(block => typeof block.text === 'string' ? block.text : '').join('\n');

    const pages = body?.pages_processed;
    const providerEvidence = evidence(durationMs, {
      modelOrApi: typeof body?.operation === 'string'
        ? body.operation
        : typeof body?.api === 'string' ? body.api : null,
      region: typeof body?.region === 'string' ? body.region : null,
      providerRequestId: typeof body?.request_id === 'string'
        ? body.request_id
        : headerRequestId,
      billablePages: typeof pages === 'number' && Number.isInteger(pages) && pages >= 0
        ? pages
        : null,
    });
    if (typeof text !== 'string') {
      return { ok: false, reason: 'textract_invalid_response', evidence: providerEvidence };
    }
    if (!text.trim()) {
      return { ok: false, reason: 'textract_empty_response', evidence: providerEvidence };
    }
    return { ok: true, text, evidence: providerEvidence };
  } catch (error) {
    const isAbort = error instanceof DOMException && error.name === 'AbortError';
    return {
      ok: false,
      reason: isAbort ? 'textract_timeout' : 'textract_fetch_failed',
      evidence: evidence(Math.round(performance.now() - started)),
    };
  } finally {
    clearTimeout(timeout);
  }
}
