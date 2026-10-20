/**
 * Phase 05 Plan 04 Task 1 — get-analysis-job-status source-read contract (Pattern A, worker variant).
 *
 * get-analysis-job-status is an inline `serve(async (req) => ...)` status-poll worker
 * with live-Supabase reads + an internal worker re-trigger side effect (NOT
 * handler-invocable offline). This test characterizes its CURRENT auth + job-status
 * read contract as WIRED via a source read of index.ts (no network, no DB), using
 * the same slash-strip form as the process-*-job worker analogs.
 *
 * Security focus (T-05-07): the poll authenticates the JWT and scopes the job lookup
 * to the authenticated user (.eq("user_id", authenticatedUserId)) so one user can
 * never read another user's job. body.userId is NOT used for authorization.
 */
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const src = await Deno.readTextFile(
  new URL("./index.ts", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
);

// ── Auth wiring (T-05-07) ─────────────────────────────────────────────────────

Deno.test("status-poll: authenticates the request before any job read", () => {
  // This worker uses a local authenticateRequest(Bearer -> supabase.auth.getUser).
  assert(src.includes("authenticateRequest"), "must authenticate via authenticateRequest");
  assert(
    src.includes("const authenticatedUserId = await authenticateRequest("),
    "the authenticated userId is resolved up front",
  );
  assert(
    src.includes("supabase.auth.getUser(token)"),
    "the bearer token is validated against supabase.auth.getUser",
  );
});

Deno.test("status-poll: does NOT use body.userId for authorization", () => {
  // jobId may come from the body, but the OWNER scope is always the authenticated userId.
  assert(src.includes("body.userId") === false, "body.userId must not be read for authorization");
});

Deno.test("status-poll: the job lookup is scoped to the authenticated user", () => {
  // .eq("user_id", authenticatedUserId) is what prevents cross-user job disclosure.
  assert(
    src.includes('.eq("user_id", authenticatedUserId)'),
    "the analysis_jobs lookup must be scoped to the authenticated user",
  );
});

// ── Job-status read contract ──────────────────────────────────────────────────

Deno.test("status-poll: reads the job from analysis_jobs by id", () => {
  assert(src.includes('.from("analysis_jobs")'), "must read from analysis_jobs");
  assert(src.includes('.eq("id", jobId)'), "must filter by the requested jobId");
});

Deno.test("status-poll: returns terminal result on 'completed' and the error payload on 'failed'", () => {
  assert(
    src.includes('if (job.status === "completed")'),
    "completed branch returns the job result",
  );
  assert(src.includes("result: jobResult"), "completed response carries the result field");
  assert(
    src.includes('if (job.status === "failed")'),
    "failed branch returns the error payload",
  );
  assert(
    src.includes("isInfrastructureFailure"),
    "failed response classifies infrastructure failures (retryable 5xx)",
  );
});

Deno.test("status-poll: in-progress statuses return a pollAfterMs hint", () => {
  // The fall-through (pending / processing / retrying) returns a poll cadence.
  assert(src.includes("pollAfterMs"), "in-progress responses include a pollAfterMs cadence");
  assert(
    src.includes('job.status === "processing" ? 1500 : 2500'),
    "processing polls faster (1500ms) than pending/retrying (2500ms)",
  );
});

// ── Not-found / error branch ──────────────────────────────────────────────────

Deno.test("status-poll: unknown / unowned jobId returns 404, missing jobId returns 400", () => {
  const notFound = src.match(/if \(!job\)[\s\S]*?status:\s*404/)?.[0] ?? "";
  assert(notFound.includes("Job not found"), "an unknown or unowned job returns 'Job not found'");
  assert(notFound.includes("404"), "not-found returns 404");
  assert(src.includes('"jobId is required"'), "a missing jobId returns a 400 validation error");
  assert(/status:\s*400/.test(src), "the missing-jobId branch returns 400");
});

Deno.test("status-poll: query error returns 500 and auth errors map to 401", () => {
  assert(src.includes('"Failed to load job status"'), "a DB read error surfaces a load-failure error");
  // WR-05: fall back to "" (not src) so a regex miss FAILS this test instead of
  // silently widening the search to the whole file (where 401/500 appear elsewhere
  // and would make the proximity assertion pass without verifying the catch block).
  const catchBlock = src.match(/catch \(error\)[\s\S]*$/)?.[0] ?? "";
  assert(catchBlock.includes("isAuthError"), "catch classifies auth failures");
  assert(
    catchBlock.includes("401") && catchBlock.includes("500"),
    "catch returns 401 for auth failures, 500 otherwise",
  );
});
