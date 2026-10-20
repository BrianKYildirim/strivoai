/**
 * reset-subscription-merits — Phase 12 BACK-03.
 *
 * Called by pg_cron every 15 minutes (and manually via internal secret) to
 * sweep up to 1000 Pro/Elite subscribers whose subscription_reset_date has
 * passed, and credit their next monthly allowance via Phase 11 RPC
 * `reset_subscription_merits(user_id, tier, next_reset_date)`.
 *
 * Request body: { invocation_source: 'pg_cron' | 'webhook' | 'manual' }
 * Response:     { processed, errors, remaining, batch_size }
 *
 * Idempotency: the Phase 11 RPC is atomic and row-locked; if the same tick
 * runs twice, the second call is a no-op (SELECT already advanced
 * next_reset_date).
 *
 * Requirements: BACK-03, SUB-11, SUB-12, NFR-08
 */
import { handleOptionsRequest } from "../_shared/cors.ts";
import { requireAuth as realRequireAuth } from "../_shared/auth.ts";
import { getServiceClient } from "../_shared/supabase-client.ts";
import { createLogger } from "../_shared/logger.ts";
import { addOneMonthIso } from "../_shared/date-utils.ts";
import { normalizeActiveTier } from "../_shared/tier-config.ts";

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

export interface ResetSubscriptionMeritsDeps {
  supabase?: SupabaseLike;
  requireAuth?: (req: Request) => Promise<unknown>;
}

const BATCH_SIZE = 1000;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleResetSubscriptionMerits(
  req: Request,
  deps: ResetSubscriptionMeritsDeps = {},
): Promise<Response> {
  const log = createLogger("reset-subscription-merits");

  if (req.method === "OPTIONS") {
    return handleOptionsRequest({ type: "internal" });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  // Internal-secret auth via _shared/auth.ts requireAuth (throws a Response on 401).
  const requireAuthFn = deps.requireAuth ??
    ((r: Request) => realRequireAuth(r, { type: "internal" }));
  try {
    await requireAuthFn(req);
  } catch (r) {
    if (r instanceof Response) return r;
    throw r;
  }

  const supabase = deps.supabase ?? getServiceClient();

  const { data: due, error } = await supabase
    .from("user_merits")
    .select("user_id, subscription_reset_date, profiles!inner(subscription_tier)")
    .lte("subscription_reset_date", new Date().toISOString())
    .in("profiles.subscription_tier", ["free", "pro", "elite"])
    .limit(BATCH_SIZE);

  if (error) {
    log.error("select-due-failed", { code: (error as { code?: string }).code });
    return jsonResponse({ error: "select_failed" }, 500);
  }

  let processed = 0;
  let errors = 0;
  for (
    const row of (due ?? []) as Array<{
      user_id: string;
      subscription_reset_date: string;
      profiles: { subscription_tier: "free" | "pro" | "elite" };
    }>
  ) {
    // Pro remains a stored legacy tier for schema/Stripe compatibility, but
    // the active product temporarily grants those users the Elite allowance.
    const tier = normalizeActiveTier(row.profiles.subscription_tier);
    const nextReset = addOneMonthIso(row.subscription_reset_date);
    const { error: rpcErr } = await supabase.rpc("reset_subscription_merits", {
      p_user_id: row.user_id,
      p_tier: tier,
      p_next_reset_date: nextReset,
    });
    if (rpcErr) {
      errors += 1;
      log.warn("reset-rpc-failed", {
        user_id: row.user_id,
        code: (rpcErr as { code?: string }).code,
      });
    } else {
      processed += 1;
    }
  }

  const batchSize = (due ?? []).length;
  const remaining: number | "unknown" = batchSize === BATCH_SIZE ? "unknown" : 0;

  log.info("batch-complete", {
    processed,
    errors,
    remaining,
    batch_size: batchSize,
  });

  return jsonResponse(
    { processed, errors, remaining, batch_size: batchSize },
    200,
  );
}

Deno.serve((req) => handleResetSubscriptionMerits(req));
