/**
 * Phase 03 · 03-05 · LIFE-01 — get-analysis-run-status source-read contract.
 *
 * get-analysis-run-status is an inline `serve((req) => withCors(...))` status
 * projection with a live-Supabase owner-scoped read (NOT handler-invocable
 * offline). This test characterizes its auth + CORS + owner-scope contract via a
 * static source read of index.ts (no network, no DB), matching the slash-strip
 * form used by the get-analysis-job-status job-contract analog.
 *
 * Security focus (T-03-14 / T-03-16): the endpoint rides withCors('user'),
 * authenticates via the shared requireAuth(user), reads analysis_jobs through an
 * anon (JWT-carrying) client scoped to the authenticated owner so one user can
 * never read another user's run, and NEVER emits a wildcard CORS origin or a raw
 * error/payload (all error branches ride jsonError).
 */
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const src = await Deno.readTextFile(
  new URL("./index.ts", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
);

// ── CORS wiring (fail-closed allowlist, never a wildcard) ─────────────────────

Deno.test("run-status: rides withCors(req, 'user')", () => {
  assert(src.includes("withCors(req, 'user'"), "must wrap the handler in withCors(req, 'user', ...)");
});

Deno.test("run-status: never emits a wildcard CORS origin", () => {
  // The fail-closed shared allowlist (cors.ts) never returns '*'. Guard against a
  // hardcoded Access-Control-Allow-Origin: '*' regression in this function.
  assert(src.includes("Access-Control-Allow-Origin") === false, "no hardcoded ACAO header");
  assert(src.includes("'*'") === false && src.includes('"*"') === false, "no '*' wildcard literal");
});

// ── Auth wiring (T-03-14) ─────────────────────────────────────────────────────

Deno.test("run-status: authenticates via the shared requireAuth(user) before any read", () => {
  assert(
    src.includes("requireAuth(req, { type: 'user' })"),
    "must authenticate via the shared requireAuth(req, { type: 'user' })",
  );
  // The authenticated userId is resolved up front, before the analysis_jobs read.
  const authIdx = src.indexOf("requireAuth(req, { type: 'user' })");
  const readIdx = src.indexOf('.from("analysis_jobs")');
  assert(authIdx !== -1 && readIdx !== -1 && authIdx < readIdx, "auth precedes the run read");
});

Deno.test("run-status: does NOT use a client-supplied user id for authorization", () => {
  assert(src.includes("body.userId") === false, "body.userId must not be read for authorization");
  assert(src.includes("body.user_id") === false, "body.user_id must not be read for authorization");
});

// ── Owner-scope + no service-role read (T-03-14) ──────────────────────────────

Deno.test("run-status: reads analysis_jobs through a JWT-carrying anon client, owner-scoped", () => {
  assert(src.includes('.from("analysis_jobs")'), "must read from analysis_jobs");
  assert(src.includes('.eq("id", runId)'), "must filter by the requested runId");
  assert(
    src.includes('.eq("user_id", auth.userId)'),
    "the read must be scoped to the authenticated owner",
  );
  // RLS enforcement requires the caller's JWT, NOT the service-role client.
  assert(
    src.includes("global: { headers: { Authorization: authHeader } }"),
    "the read client must carry the caller's Authorization header (RLS-enforced owner-SELECT)",
  );
  assert(src.includes("getServiceClient") === false, "no service-role read in this user endpoint");
  assert(src.includes("SERVICE_ROLE") === false, "no service-role key referenced in this user endpoint");
});

// ── Error posture (LIFE-08 leak-free, all via jsonError) ──────────────────────

Deno.test("run-status: missing run_id returns 400 and unknown/unowned returns 404, via jsonError", () => {
  assert(src.includes('"run_id is required"'), "a missing run_id returns a validation error");
  assert(/jsonError\(req, 400/.test(src), "missing run_id rides jsonError with 400");
  assert(src.includes('"Run not found"'), "an unknown or unowned run returns 'Run not found'");
  assert(/jsonError\(req, 404/.test(src), "not-found rides jsonError with 404");
});

Deno.test("run-status: a DB read error rides jsonError(500) and leaks no raw error text", () => {
  assert(/jsonError\(req, 500, "Failed to load run status"/.test(src), "DB read error surfaces a generic 500");
  // The raw db error must never be interpolated into the response body.
  assert(src.includes("error.message") === false, "no raw error.message crosses to the client");
});

// ── Response projection is leak-free (no result/payload/prompt columns) ───────

Deno.test("run-status: returns only the leak-free lifecycle projection", () => {
  assert(src.includes("state: run.state"), "returns the lifecycle state");
  assert(src.includes("status: run.status"), "returns the legacy status");
  assert(src.includes("failure_code: run.failure_code"), "returns failure_code");
  assert(src.includes("retry_count: run.retry_count"), "returns retry_count");
  assert(src.includes("result_ref:"), "returns a result_ref pointer (not the result body)");
  assert(src.includes("merit_settled: run.merit_settled"), "returns the Merit settlement flag");
  assert(src.includes("refunded: run.refunded"), "returns the refunded flag");
  // The raw result/payload columns are never selected or returned.
  assert(src.includes("run.result") === false, "the raw result column is never returned");
  assert(src.includes("run.payload") === false, "the raw payload column is never returned");
});
