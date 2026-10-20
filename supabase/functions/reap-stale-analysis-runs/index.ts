import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient } from "../_shared/supabase-client.ts";
import type { Json } from "../_shared/database.types.ts";
import { requireAuth } from "../_shared/auth.ts";
import { handleOptionsRequest } from "../_shared/cors.ts";
import { refundMeritsForJob } from "../_shared/merit-gateway.ts";
import { createLogger } from "../_shared/logger.ts";

const REAPER_FUNCTION_VERSION = "reap-stale-analysis-runs-2026-07-02a";

const log = createLogger("reap-stale-analysis-runs");

/**
 * D-01 REAPER (LIFE-04 / LIFE-06 / LIFE-09) — DORMANT-but-COMPLETE.
 *
 * Internal-auth-only endpoint (requireAuth {type:'internal'} → timingSafeEqual
 * on x-internal-job-secret; secret never logged, reason-code logging only) that
 * sweeps NON-TERMINAL `analysis_jobs` rows whose `state_updated_at` is older than
 * a per-state max-age and terminalizes each via the CAS RPC transition_analysis_run,
 * releasing any stranded Merit reservation EXACTLY ONCE.
 *
 * ── Per-state max-age model (discretion A2) ─────────────────────────────────────
 * A run is "stale" when it has sat in a non-terminal state past that state's budget.
 * The terminalize TARGET encodes LIFE-06 ("never auto-retry past generation"):
 *
 *   state               max-age   → target            rationale
 *   ─────────────────   ───────   ───────────────────  ────────────────────────────
 *   created             60s       → failed             never started; hard stall
 *   validating_inputs   60s       → failed             pre-work; hard stall
 *   reserving_merits    120s      → failed             money-boundary; NEVER re-retry
 *   extracting_data     300s      → retryable_failed   transient in-flight (2× analyze
 *   generating          300s      → retryable_failed     timeout ~150s); worker death →
 *                                                        recoverable, preserve partial
 *   validating_output   120s      → failed             post-generation; DB/validation
 *   saving              120s      → failed               bound; NEVER re-retry (would
 *                                                        risk a double-charge past the
 *                                                        saving→completed point of no
 *                                                        return — Pitfall 4)
 *   retryable_failed    600s      → failed             a recovery off-ramp the retry
 *                                                        path never reclaimed within a
 *                                                        generous window is itself
 *                                                        permanently stuck → terminalize
 *                                                        to failed (LIFE-09), never
 *                                                        re-entered (LIFE-06)
 *
 * Terminal states (completed / failed / refunded) are excluded from the sweep and
 * are NEVER resurrected: the CAS transition (UPDATE ... WHERE state = from_state)
 * simply does not match a row another actor already moved (transitioned:false noop).
 *
 * ── Exactly-once Merit release (LIFE-04 / Pitfall 3) ────────────────────────────
 * For each terminalized row carrying a merit_transaction_id the reaper releases the
 * stranded reservation via refundMeritsForJob(userId, txId, 'reaper_stale'). Two
 * independent guards make this EXACTLY ONCE, never a double-refund:
 *   1. CAS claim — only the invocation whose transition_analysis_run returns
 *      transitioned:true owns the row; a racing reaper gets noop:true and skips.
 *   2. Idempotent money layer — refundMeritsForJob is idempotent (already_refunded),
 *      and the migration's CHECK (NOT (merit_settled AND refunded)) + the pre-sweep
 *      merit_settled/refunded belt-filter backstop the invariant.
 * The reaper NEVER settles or completes a run — it only terminalizes + releases.
 *
 * DORMANCY: while the Phase-3 flags are OFF no feature writes `state`, so this sweep
 * finds zero rows. It is armed inertly by the 20260702000003 pg_cron migration.
 */

type ReapTarget = "retryable_failed" | "failed";

interface ReapRule {
  maxAgeMs: number;
  target: ReapTarget;
}

/** The A2 per-state max-age table, encoded as constants (single source of truth). */
export const REAP_CONFIG: Record<string, ReapRule> = {
  created: { maxAgeMs: 60_000, target: "failed" },
  validating_inputs: { maxAgeMs: 60_000, target: "failed" },
  reserving_merits: { maxAgeMs: 120_000, target: "failed" },
  extracting_data: { maxAgeMs: 300_000, target: "retryable_failed" },
  generating: { maxAgeMs: 300_000, target: "retryable_failed" },
  validating_output: { maxAgeMs: 120_000, target: "failed" },
  saving: { maxAgeMs: 120_000, target: "failed" },
  retryable_failed: { maxAgeMs: 600_000, target: "failed" },
};

/** The smallest budget in the table — the SQL pre-filter floor for state_updated_at. */
const MIN_MAX_AGE_MS = Math.min(
  ...Object.values(REAP_CONFIG).map((r) => r.maxAgeMs),
);

/** Terminal states are excluded from the sweep and never resurrected. */
const TERMINAL_STATES = ["completed", "failed", "refunded"];

/** Bound each sweep so a backlog cannot blow the invocation budget. */
const REAP_BATCH_LIMIT = 500;

/**
 * Pure classifier (unit-testable without a DB): is a row in `state` that has been
 * there for `ageMs` stale, and if so, to which terminal-ish target?
 *
 *   worker-death-mid-generating (state='generating', age>300s) → retryable_failed
 *   saving stall               (state='saving',     age>120s) → failed
 */
export function classifyStale(
  state: string,
  ageMs: number,
): { stale: boolean; target?: ReapTarget } {
  const rule = REAP_CONFIG[state];
  if (!rule) return { stale: false };
  if (ageMs < rule.maxAgeMs) return { stale: false };
  return { stale: true, target: rule.target };
}

interface StaleRow {
  id: string;
  user_id: string;
  state: string;
  state_updated_at: string | null;
  merit_transaction_id: string | null;
  merit_settled: boolean;
  refunded: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleOptionsRequest({ type: "internal" });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Elevation-of-privilege guard (T-03-18): only pg_cron holding the Vault
  // internal_job_secret may invoke the reaper. requireAuth throws a CORS-less 401
  // Response on any mismatch (timingSafeEqual; secret never logged).
  try {
    await requireAuth(req, { type: "internal" });
  } catch (authResponse) {
    if (authResponse instanceof Response) return authResponse;
    throw authResponse;
  }

  const startedAt = Date.now();
  const supabase = getServiceClient();

  // Sweep non-terminal rows past the smallest budget; per-state max-age is applied
  // precisely in code via classifyStale (the SQL floor only trims obviously-fresh rows).
  const floorIso = new Date(Date.now() - MIN_MAX_AGE_MS).toISOString();

  const { data, error } = await supabase
    .from("analysis_jobs")
    .select(
      "id, user_id, state, state_updated_at, merit_transaction_id, merit_settled, refunded",
    )
    .not("state", "is", null)
    .not("state", "in", `(${TERMINAL_STATES.map((s) => `"${s}"`).join(",")})`)
    .lt("state_updated_at", floorIso)
    .order("state_updated_at", { ascending: true })
    .limit(REAP_BATCH_LIMIT);

  if (error) {
    log.error("reaper-select-failed", { error: error.message });
    return new Response(
      JSON.stringify({ error: "reaper_select_failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const rows = (data ?? []) as StaleRow[];
  const now = Date.now();

  let scanned = 0;
  let terminalized_retryable = 0;
  let terminalized_failed = 0;
  let released = 0;
  let already_released = 0;
  let noop = 0;
  let skipped = 0;

  for (const row of rows) {
    scanned++;

    // Financial-invariant belt (LIFE-04): a settled or already-refunded reservation
    // is never touched again — CHECK (NOT (settled AND refunded)) is the DB backstop.
    if (row.merit_settled || row.refunded) {
      skipped++;
      continue;
    }
    if (!row.state_updated_at) {
      skipped++;
      continue;
    }

    const ageMs = now - Date.parse(row.state_updated_at);
    const verdict = classifyStale(row.state, ageMs);
    if (!verdict.stale || !verdict.target) {
      skipped++;
      continue;
    }

    const hasMerit = !!row.merit_transaction_id;

    // Refund before persisting refunded=true. The money RPC is idempotent, so
    // concurrent sweepers are safe; a failed RPC leaves the row eligible for retry.
    if (hasMerit && row.merit_transaction_id) {
      const refund = await refundMeritsForJob(
        row.user_id,
        row.merit_transaction_id,
        "reaper_stale",
      );
      if (!refund.ok) {
        log.error("reaper-refund-failed", {
          run_id: row.id,
          reason: "reaper_stale",
          error: refund.error,
        });
        skipped++;
        continue;
      }
      if (refund.alreadyRefunded) already_released++;
      else released++;
    }

    // Mark refunded only after the RPC succeeds. The CAS still gives state
    // transition exclusivity; refund_merits supplies money-layer idempotency.
    const patch: { [key: string]: Json | undefined } = {
      failure_code: "reaper_stale",
      failure_stage: row.state,
    };
    if (hasMerit) patch.refunded = true;

    const { data: tData, error: tError } = await supabase.rpc(
      "transition_analysis_run",
      {
        p_run_id: row.id,
        p_from_state: row.state,
        p_to_state: verdict.target,
        p_patch: patch,
      },
    );

    if (tError) {
      log.error("reaper-transition-failed", {
        run_id: row.id,
        from: row.state,
        to: verdict.target,
        error: tError.message,
      });
      skipped++;
      continue;
    }

    // Exactly-once state gate: a stale from-state / already-moved row is a no-op.
    const transitioned = (tData as { transitioned?: boolean })?.transitioned === true;
    if (!transitioned) {
      noop++;
      continue;
    }

    if (verdict.target === "retryable_failed") terminalized_retryable++;
    else terminalized_failed++;

  }

  const summary = {
    ok: true,
    version: REAPER_FUNCTION_VERSION,
    scanned,
    terminalized: {
      retryable_failed: terminalized_retryable,
      failed: terminalized_failed,
    },
    released,
    already_released,
    noop,
    skipped,
    duration_ms: Date.now() - startedAt,
  };

  log.info("reaper-sweep-complete", summary);

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
