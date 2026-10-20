import type { DocumentType, ProviderEvidence } from './document-extraction-types.ts';

export type MistralOcrReason =
  | 'mistral_config_missing'
  | 'mistral_no_images'
  | 'mistral_timeout'
  | 'mistral_fetch_failed'
  | 'mistral_invalid_response'
  | 'mistral_empty_response'
  | `mistral_http_${number}`;

export type MistralOcrResult =
  | { ok: true; text: string; evidence: ProviderEvidence }
  | { ok: false; reason: MistralOcrReason; evidence?: ProviderEvidence };

export interface MistralOcrParams {
  documentType: DocumentType;
  images: string[];
}

const DEFAULT_TIMEOUT_MS = 20_000;

export async function invokeMistralOcr(params: MistralOcrParams): Promise<MistralOcrResult> {
  const apiKey = Deno.env.get('MISTRAL_OCR_API_KEY');
  const endpoint = Deno.env.get('MISTRAL_OCR_ENDPOINT') ?? 'https://api.mistral.ai/v1/ocr';
  if (!apiKey) return { ok: false, reason: 'mistral_config_missing' };
  if (params.images.length === 0) return { ok: false, reason: 'mistral_no_images' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const started = performance.now();
  const configuredModel = Deno.env.get('MISTRAL_OCR_MODEL') ?? 'mistral-ocr-latest';
  const evidence = (
    durationMs: number,
    values: Partial<Omit<ProviderEvidence, 'provider' | 'attemptCount' | 'durationMs'>> = {},
  ): ProviderEvidence => ({
    provider: 'mistral',
    modelOrApi: configuredModel,
    region: null,
    providerRequestId: null,
    billablePages: null,
    attemptCount: 1,
    durationMs,
    reportedCostUsd: null,
    ...values,
  });

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: configuredModel,
        document_type: params.documentType,
        images: params.images,
      }),
      signal: controller.signal,
    });

    const durationMs = Math.round(performance.now() - started);
    const providerRequestId = response.headers.get('request-id') ??
      response.headers.get('x-request-id');
    if (!response.ok) {
      return {
        ok: false,
        reason: `mistral_http_${response.status}`,
        evidence: evidence(durationMs, { providerRequestId }),
      };
    }

    const body = await response.json().catch(() => null) as {
      text?: unknown;
      model?: unknown;
      pages?: Array<{ text?: unknown }>;
      cost_usd?: unknown;
      usage_info?: { pages_processed?: unknown; cost_usd?: unknown };
    } | null;
    const text = typeof body?.text === 'string'
      ? body.text
      : (body?.pages ?? []).map(page => typeof page.text === 'string' ? page.text : '').join('\n\n');

    const providerPages = body?.usage_info?.pages_processed;
    const billablePages = typeof providerPages === 'number' &&
        Number.isInteger(providerPages) && providerPages >= 0
      ? providerPages
      : Array.isArray(body?.pages) ? body.pages.length : null;
    const rawReportedCost = body?.usage_info?.cost_usd ?? body?.cost_usd;
    const reportedCostUsd = typeof rawReportedCost === 'number' &&
        Number.isFinite(rawReportedCost) && rawReportedCost >= 0
      ? rawReportedCost
      : null;
    const providerEvidence = evidence(durationMs, {
      modelOrApi: typeof body?.model === 'string' ? body.model : configuredModel,
      providerRequestId,
      billablePages,
      reportedCostUsd,
    });
    if (typeof text !== 'string') {
      return { ok: false, reason: 'mistral_invalid_response', evidence: providerEvidence };
    }
    if (!text.trim()) {
      return { ok: false, reason: 'mistral_empty_response', evidence: providerEvidence };
    }
    return { ok: true, text, evidence: providerEvidence };
  } catch (error) {
    const isAbort = error instanceof DOMException && error.name === 'AbortError';
    return {
      ok: false,
      reason: isAbort ? 'mistral_timeout' : 'mistral_fetch_failed',
      evidence: evidence(Math.round(performance.now() - started)),
    };
  } finally {
    clearTimeout(timeout);
  }
}
