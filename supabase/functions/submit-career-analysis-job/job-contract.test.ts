/**
 * Phase 05 Plan 04 Task 1 — submit-career-analysis-job source-read contract (Pattern A, worker variant).
 *
 * submit-career-analysis-job is an inline `serve(async (req) => ...)` worker with
 * live-Supabase + internal-trigger side effects (NOT handler-invocable offline).
 * This test characterizes its CURRENT queue + auth contract as WIRED via a source
 * read of index.ts (no network, no DB), mirroring the worker analog at
 * process-career-analysis-job/__tests__/refund-on-failure.test.ts.
 *
 * Security focus (T-05-07): the worker authenticates the JWT via requireAuth(type:'user');
 * body.userId is MATCHED against the authenticated identity (403 on mismatch), never
 * TRUSTED as the auth source.
 */
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const src = await Deno.readTextFile(
  new URL("./index.ts", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
);

Deno.test('queued career jobs carry one server-created feature run', () => {
  assert(src.includes('await beginFeatureRun({'));
  assert(src.includes('featureRunId: featureRuntime.featureRunId'));
  assert(src.includes('await featureRuntime?.linkAnalysisJob(job.id)'));
});

// ── Auth wiring (T-05-07) ─────────────────────────────────────────────────────

Deno.test("submit-career: authenticates the JWT via requireAuth(type:'user')", () => {
  assert(src.includes("requireAuth"), "must import/call requireAuth");
  assert(
    src.includes("requireAuth(req, { type: 'user' })") ||
      src.includes('requireAuth(req, { type: "user" })'),
    "must call requireAuth with type:'user'",
  );
});

Deno.test("submit-career: identity is the authenticated userId, not the request body", () => {
  assert(
    src.includes("authenticatedUserCtxCareer.userId"),
    "auth identity must come from the UserContext returned by requireAuth",
  );
  assert(
    src.includes("user_id: authenticatedUserId"),
    "the inserted job must be owned by the authenticated user, not body.userId",
  );
});

Deno.test("submit-career: body.userId is only MATCHED against the auth identity (403), never trusted", () => {
  const guard = src.match(/if \(userId && authenticatedUserId !== userId\)[\s\S]*?status:\s*403[\s\S]*?\);/)?.[0] ?? "";
  assert(guard.length > 0, "expected `if (userId && authenticatedUserId !== userId)` mismatch guard returning 403");
  assert(guard.includes("403"), "userId mismatch must return 403");
  assert(
    guard.includes("Authenticated user does not match request userId"),
    "mismatch must surface the does-not-match message",
  );
});

// ── Queue / enqueue contract ──────────────────────────────────────────────────

Deno.test("submit-career: enqueues a career_compass_analysis job into analysis_jobs as 'pending'", () => {
  assert(src.includes('.from("analysis_jobs")'), "must write to analysis_jobs");
  assert(
    /job_type:\s*"career_compass_analysis"/.test(src),
    "the enqueued job_type must be career_compass_analysis",
  );
  assert(/status:\s*"pending"/.test(src), "a newly enqueued job starts as 'pending'");
});

Deno.test("submit-career: returns 202 with a jobId for the queued job", () => {
  assert(src.includes("jobId: job.id"), "the accepted response carries the new jobId");
  assert(/status:\s*202/.test(src), "queued submission responds 202 Accepted");
});

Deno.test("submit-career: merit gate is wired behind MERIT_SYSTEM_ENABLED with refund-on-insert-failure", () => {
  assert(
    src.includes("if (MERIT_SYSTEM_ENABLED && authenticatedUserCtxCareer)"),
    "merit deduction is gated behind MERIT_SYSTEM_ENABLED && userContext",
  );
  assert(src.includes("withMerits"), "merit-path enqueue runs inside withMerits");
  assert(
    src.includes("'career_compass'"),
    "the career worker spends merits under the 'career_compass' key",
  );
  assert(
    src.includes("throw new MeritRefundable"),
    "insert failure inside withMerits must throw MeritRefundable (refund, not leak)",
  );
});

// ── Failure / error response branch ───────────────────────────────────────────

Deno.test("submit-career: enqueue failure returns 500 and auth errors map to 401", () => {
  assert(
    src.includes("Failed to enqueue career analysis job"),
    "a failed insert on the legacy path surfaces an enqueue-failure error",
  );
  // WR-05: fall back to "" (not src) so a regex miss FAILS this test instead of
  // silently matching the whole file (401/500 appear elsewhere and would false-pass).
  const catchBlock = src.match(/catch \(error\)[\s\S]*$/)?.[0] ?? "";
  assert(catchBlock.includes("isAuthError"), "catch classifies auth failures");
  assert(
    catchBlock.includes("401") && catchBlock.includes("500"),
    "catch returns 401 for auth failures, 500 otherwise",
  );
  // CR-01: requireAuth throws a Response (401); the catch must re-throw it so withCors
  // emits the real 401 instead of collapsing it into a 500 "Internal server error".
  assert(
    catchBlock.includes("error instanceof Response"),
    "catch must re-throw a thrown Response (401) instead of mapping it to 500 (CR-01)",
  );
});
