/**
 * Phase 02 · TOK-01 — per-call Anthropic token telemetry writer.
 *
 * PERMANENT PRODUCTION INSTRUMENTATION. Both prior truncation regressions
 * (LinkedIn 2026-07-09, Career Compass 2026-07-17) were discovered only after they
 * broke a paying user's analysis. One row per completed Anthropic call makes
 * "output approaching max_tokens" visible as a trend instead of an incident.
 *
 * CONTRACT: `recordAiCall` NEVER throws and NEVER rejects. A telemetry failure of
 * any kind — missing env, missing table, exploding client — must be incapable of
 * failing an analysis (threat T-02-05). Everything below is wrapped accordingly.
 *
 * WHY THE CLIENT IS DYNAMICALLY IMPORTED: `anthropic.ts` (the single caller) today
 * imports only `prompt-sanitizer.ts` and `logger.ts`. A STATIC import of
 * `./supabase-client.ts` would pull `npm:@supabase/supabase-js@2` into every
 * offline Deno test that touches the Anthropic helper and risk a network fetch in
 * `--offline` CI. `getServiceClient()` also throws outright when SUPABASE_URL /
 * SUPABASE_SERVICE_ROLE_KEY are absent, which is exactly the case the memoised
 * disable below is for. The dynamic import is mandatory, not stylistic.
 *
 * WHY CALLERS `await` THIS: a PostgREST insert is ~10-30ms against 35-90s AI calls,
 * and a floating promise in a Deno edge isolate can be dropped when the isolate is
 * reclaimed after the response is sent — silently losing exactly the rows this
 * phase needs. `EdgeRuntime.waitUntil` is used nowhere in this repo; do not
 * introduce it. "Fire-and-forget" is satisfied by the never-throws contract, not
 * by not-awaiting.
 *
 * PRIVACY: the row carries counts and identifiers only — never prompt or response
 * text. Warn logs here carry a code + message only, never the row payload (which
 * holds `user_id` and `req_id`).
 */
import { createLogger } from './logger.ts';

const log = createLogger('ai-telemetry');

/** Column shape of `public.ai_call_telemetry` (migration 20260721000000). */
export type AiCallTelemetryRow = {
  feature: string;
  tier: string;
  call_name: string;
  attempt: number;
  req_id: string | null;
  user_id: string | null;
  model: string;
  /** The CLAMPED effective cap, never the caller's raw request. */
  max_tokens: number;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_creation_input_tokens: number | null;
  cache_read_input_tokens: number | null;
  stop_reason: string | null;
  ok: boolean;
  http_status: number | null;
  duration_ms: number;
  ttfb_ms: number | null;
  output_chars: number | null;
  feature_run_id?: string | null;
  costing_subject_id?: string | null;
  operation_name?: string | null;
  attempt_number?: number | null;
  is_retry?: boolean | null;
  provider?: string | null;
  provider_request_id?: string | null;
  environment?: string | null;
  exclude_from_costing_at_time?: boolean | null;
  telemetry_version?: string | null;
  costing_epoch?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  status?: string | null;
  error_code?: string | null;
  error_category?: string | null;
  pricing_id?: string | null;
  incurred_cost_usd?: number | null;
  cost_known?: boolean | null;
  cost_confidence?: 'calculated' | 'reported' | 'verified_zero' | 'unknown' | null;
};

type TelemetryClient = { from: (table: string) => any };

export type TokenPricing = {
  id: string;
  input_per_million_usd: number;
  output_per_million_usd: number;
  cache_write_per_million_usd: number | null;
  cache_read_per_million_usd: number | null;
};

type PricingResolver = (
  client: TelemetryClient,
  row: AiCallTelemetryRow,
) => Promise<TokenPricing | null>;

let _client: TelemetryClient | null = null;
let _disabled = false;
/** Test-only override; null means "use the real dynamic import". */
let _factory: (() => TelemetryClient | Promise<TelemetryClient>) | null = null;
let _pricingResolver: PricingResolver | null = null;

function numeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

async function resolveEffectiveTokenPricing(
  telemetryClient: TelemetryClient,
  row: AiCallTelemetryRow,
): Promise<TokenPricing | null> {
  try {
    if (row.provider !== 'anthropic' || !row.model || !row.started_at) return null;
    const { data, error } = await telemetryClient
      .from('provider_pricing')
      .select(
        'id,input_per_million_usd,output_per_million_usd,cache_write_per_million_usd,cache_read_per_million_usd',
      )
      .eq('provider', 'anthropic')
      .eq('exact_sku', row.model)
      .eq('billing_unit', 'per_million_tokens')
      .lte('effective_from', row.started_at)
      .or(`effective_to.is.null,effective_to.gt.${row.started_at}`)
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data || typeof data.id !== 'string') return null;
    const input = numeric(data.input_per_million_usd);
    const output = numeric(data.output_per_million_usd);
    if (input === null || output === null) return null;
    return {
      id: data.id,
      input_per_million_usd: input,
      output_per_million_usd: output,
      cache_write_per_million_usd: numeric(data.cache_write_per_million_usd),
      cache_read_per_million_usd: numeric(data.cache_read_per_million_usd),
    };
  } catch {
    return null;
  }
}

export function calculateAnthropicTokenCost(
  row: AiCallTelemetryRow,
  pricing: TokenPricing,
): { cost: number; confidence: 'calculated' | 'verified_zero' } | null {
  const input = numeric(row.input_tokens);
  const output = numeric(row.output_tokens);
  const cacheWrite = numeric(row.cache_creation_input_tokens);
  const cacheRead = numeric(row.cache_read_input_tokens);
  if (input === null || output === null || cacheWrite === null || cacheRead === null) return null;
  if (cacheWrite > 0 && pricing.cache_write_per_million_usd === null) return null;
  if (cacheRead > 0 && pricing.cache_read_per_million_usd === null) return null;

  const cost = (
    input * pricing.input_per_million_usd +
    output * pricing.output_per_million_usd +
    cacheWrite * (pricing.cache_write_per_million_usd ?? 0) +
    cacheRead * (pricing.cache_read_per_million_usd ?? 0)
  ) / 1_000_000;
  return {
    cost,
    confidence: cost === 0 ? 'verified_zero' : 'calculated',
  };
}

/**
 * Lazily resolves a service client. Never throws; memoises BOTH the success and
 * the failure, so a misconfigured environment costs one warn line, not one per
 * Anthropic call.
 */
async function client(): Promise<TelemetryClient | null> {
  if (_disabled) return null;
  if (_client) return _client;
  try {
    if (_factory) {
      _client = await _factory();
    } else {
      const { getServiceClient } = await import('./supabase-client.ts');
      _client = getServiceClient() as unknown as TelemetryClient;
    }
    return _client;
  } catch (e) {
    _disabled = true;
    log.warn('telemetry-client-unavailable', { reason: (e as Error)?.message });
    return null;
  }
}

/**
 * Writes one telemetry row. Fire-and-forget semantics via a never-throws body:
 * callers may `await` it without any risk to the analysis they are serving.
 */
export async function recordAiCall(row: AiCallTelemetryRow): Promise<void> {
  try {
    // Fixture mode performs no real AI call, so there is nothing true to record —
    // and offline tests must not attempt a database round trip.
    if (Deno.env.get('AI_TEST_MODE')?.toLowerCase() === 'true') return;

    const c = await client();
    if (!c) return;

    const result = (await c.from('ai_call_telemetry').insert(row)) as
      | { error?: { code?: string; message?: string } | null }
      | null
      | undefined;

    const error = result?.error;
    if (error) log.warn('telemetry-insert-failed', { code: error.code, msg: error.message });
  } catch (e) {
    log.warn('telemetry-threw', { msg: (e as Error)?.message });
  }
}

/**
 * Phase 04.2 write path. Resolves the price version effective when the physical
 * request started and snapshots a calculated cost only when every usage category
 * required by that price is known. The legacy writer remains available while
 * feature call sites migrate in Plan 03.
 */
export async function recordAiTelemetry(row: AiCallTelemetryRow): Promise<number | null> {
  try {
    if (Deno.env.get('AI_TEST_MODE')?.toLowerCase() === 'true') return null;
    const c = await client();
    if (!c) return null;

    let pricedRow: AiCallTelemetryRow = {
      ...row,
      pricing_id: null,
      incurred_cost_usd: null,
      cost_known: false,
      cost_confidence: 'unknown',
    };
    const pricing = await (_pricingResolver ?? resolveEffectiveTokenPricing)(c, row);
    if (pricing) {
      const calculated = calculateAnthropicTokenCost(row, pricing);
      if (calculated) {
        pricedRow = {
          ...pricedRow,
          pricing_id: pricing.id,
          incurred_cost_usd: calculated.cost,
          cost_known: true,
          cost_confidence: calculated.confidence,
        };
      }
    }

    const insertion = c.from('ai_call_telemetry').insert(pricedRow);
    const result = (await (typeof insertion?.select === 'function'
      ? insertion.select('id').maybeSingle()
      : insertion)) as
      | { data?: { id?: number } | null; error?: { code?: string; message?: string } | null }
      | null
      | undefined;
    const error = result?.error;
    if (error) log.warn('telemetry-insert-failed', { code: error.code, msg: error.message });
    return !error && typeof result?.data?.id === 'number' ? result.data.id : null;
  } catch (e) {
    log.warn('telemetry-threw', { msg: (e as Error)?.message });
    return null;
  }
}

/** Test seam only — replaces the dynamic client resolution. */
export function __setAiTelemetryClientFactoryForTest(
  factory: (() => TelemetryClient | Promise<TelemetryClient>) | null,
): void {
  _factory = factory;
}

export function __setAiPricingResolverForTest(resolver: PricingResolver | null): void {
  _pricingResolver = resolver;
}

/** Test seam only — clears the memoised client, disable flag, and factory. */
export function __resetAiTelemetryForTest(): void {
  _client = null;
  _disabled = false;
  _factory = null;
  _pricingResolver = null;
}
