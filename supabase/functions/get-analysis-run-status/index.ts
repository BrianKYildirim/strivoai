// Phase 03 · 03-05 · LIFE-01 — get-analysis-run-status.
//
// Owner-scoped poll fallback for the analysis lifecycle recovery surface
// (useAnalysisRun). Returns the PERSISTED lifecycle state for a single run_id.
//
// Security posture (T-03-14):
//   * Rides withCors(req, 'user') so every exit — success or error — carries the
//     fail-closed allowlist CORS headers (never a wildcard origin).
//   * Authenticates via the shared requireAuth(req, { type: 'user' }) (throws a
//     401 Response on failure, caught + CORS-merged by withCors).
//   * Reads analysis_jobs through an ANON client carrying the caller's JWT so the
//     owner-SELECT RLS policy ("Users can view their own analysis jobs",
//     auth.uid() = user_id) enforces ownership — NO service-role read here. A
//     belt-and-suspenders .eq("user_id", auth.userId) makes the owner scope
//     explicit so one user can never read another user's run.
//   * The two lifecycle CAS RPCs (create_or_recover_analysis_run /
//     transition_analysis_run) are service_role-only and are NEVER called here —
//     this endpoint is a read-only status projection.
//
// Leak posture (LIFE-08): only the machine-readable lifecycle projection crosses
// to the browser (state, legacy status, failure_code, failure_stage, retry_count,
// updated_at, result_ref, merit_settled, refunded). No payload, prompt, provider
// body, secret, or raw error text is ever returned; error branches ride jsonError.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonError, withCors } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";

// Owner-scoped lifecycle projection. NOTE: no `result`/`payload`/`error` columns
// are selected — only the leak-free status projection the recovery surface needs.
// NOTE: `analysis_jobs` has NO `archive_path` column — that column exists only on
// the 7 payload tables (migration 20260525000007); the Phase-3 ledger migration
// (20260702000001) never added it here. Selecting it errored PostgREST → 500
// db-read-error whenever the flag-ON poll fallback ran. result_ref is documented
// (Phase 4/5) as always null on analysis_jobs — rehydration is via ?id=/recordId.
const RUN_STATUS_COLUMNS =
  "id, user_id, state, status, failure_code, failure_stage, retry_count, state_updated_at, updated_at, merit_settled, refunded";

serve((req) => withCors(req, 'user', async () => {
  if (req.method !== "GET" && req.method !== "POST") {
    return jsonError(req, 405, "Method not allowed", { code: "METHOD_NOT_ALLOWED", retryable: false });
  }

  // Owner auth. requireAuth('user') throws a 401 Response on failure (caught by
  // withCors); the null guard is defensive — this path returns a UserContext.
  const auth = await requireAuth(req, { type: 'user' });
  if (!auth) {
    return jsonError(req, 401, "Unauthorized", { code: "UNAUTHORIZED", retryable: false });
  }

  // run_id from the query string (GET) or the JSON body (POST). runId is accepted
  // as a compatibility alias. The OWNER scope is always the authenticated userId —
  // no client-supplied user identifier is ever trusted for authorization.
  let runId = "";
  if (req.method === "GET") {
    const url = new URL(req.url);
    runId = (url.searchParams.get("run_id") || url.searchParams.get("runId") || "").trim();
  } else {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    runId = String((body as Record<string, unknown>)?.run_id ?? (body as Record<string, unknown>)?.runId ?? "").trim();
  }

  if (!runId) {
    return jsonError(req, 400, "run_id is required", { code: "INPUT_MISSING", retryable: false });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    console.error("[get-analysis-run-status] misconfigured: SUPABASE_URL/ANON_KEY missing");
    return jsonError(req, 500, "Server not configured", { code: "UNKNOWN_ANALYSIS_ERROR", retryable: false });
  }

  // Anon client carrying the caller's JWT — RLS enforces owner-SELECT (no
  // service-role read). The explicit .eq("user_id", ...) is a redundant backstop.
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });

  const { data: run, error } = await userClient
    .from("analysis_jobs")
    .select(RUN_STATUS_COLUMNS)
    .eq("id", runId)
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (error) {
    // Reason code to logs only; never surface the DB error text to the client.
    console.error("[get-analysis-run-status] read failed", { reason: "db-read-error" });
    return jsonError(req, 500, "Failed to load run status", { code: "UNKNOWN_ANALYSIS_ERROR", retryable: false });
  }

  if (!run) {
    // Unknown OR unowned run_id both surface as 404 (no existence oracle).
    return jsonError(req, 404, "Run not found", { code: "FILE_NOT_FOUND", retryable: false });
  }

  return new Response(
    JSON.stringify({
      run_id: run.id,
      state: run.state,
      status: run.status,
      failure_code: run.failure_code,
      failure_stage: run.failure_stage,
      retry_count: run.retry_count,
      updated_at: run.state_updated_at ?? run.updated_at,
      result_ref: null, // analysis_jobs has no archive_path; rehydration via ?id=/recordId (Phase 4/5)
      merit_settled: run.merit_settled,
      refunded: run.refunded,
    }),
    { headers: { ...corsHeaders({ type: 'user' }), "Content-Type": "application/json" } },
  );
}));
