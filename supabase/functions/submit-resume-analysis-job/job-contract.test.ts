/**
 * Phase 05 Plan 04 Task 1 — submit-resume-analysis-job source-read contract (Pattern A, worker variant).
 *
 * submit-resume-analysis-job is an inline `serve(async (req) => ...)` worker with
 * live-Supabase + internal-trigger side effects (RESEARCH testability matrix:
 * NOT handler-invocable offline). This test characterizes its CURRENT queue +
 * auth contract as WIRED by reading index.ts as text (no network, no DB), mirroring
 * the worker analog at process-resume-analysis-job/__tests__/refund-on-failure.test.ts.
 *
 * Security focus (T-05-07, control verification — internal/user auth):
 *   - the worker authenticates the JWT via requireAuth(type:'user'); body.userId is
 *     MATCHED against the authenticated identity (403 on mismatch), never TRUSTED as
 *     the auth source. We assert the positive identity source + the no-trust guard.
 */
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const src = await Deno.readTextFile(
  new URL("./index.ts", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
);

Deno.test('queued resume jobs carry one server-created feature run', () => {
  assert(src.includes('await beginFeatureRun({'));
  assert(src.includes('featureRunId: featureRuntime.featureRunId'));
  assert(src.includes('await featureRuntime?.linkAnalysisJob(job.id)'));
});

// ── Auth wiring (T-05-07) ─────────────────────────────────────────────────────

Deno.test("submit-resume: authenticates the JWT via requireAuth(type:'user')", () => {
  assert(src.includes("requireAuth"), "must import/call requireAuth");
  assert(
    src.includes("requireAuth(req, { type: 'user' })") ||
      src.includes('requireAuth(req, { type: "user" })'),
    "must call requireAuth with type:'user'",
  );
});

Deno.test("submit-resume: identity is the authenticated userId, not the request body", () => {
  // The job is enqueued under the authenticated identity (user_id: authenticatedUserId),
  // never under body.userId.
  assert(
    src.includes("authenticatedUserCtx.userId"),
    "auth identity must come from the UserContext returned by requireAuth",
  );
  assert(
    src.includes("user_id: authenticatedUserId"),
    "the inserted job must be owned by the authenticated user, not body.userId",
  );
});

Deno.test("submit-resume: body.userId is only MATCHED against the auth identity (403), never trusted", () => {
  // The handler reads body.userId solely to verify it equals the authenticated user,
  // returning 403 on mismatch — it is a consistency check, NOT an auth source.
  // Scope to the mismatch guard: from the `if (...)` condition to the end of its 403 response block.
  const guard = src.match(/if \(userId && authenticatedUserId !== userId\)[\s\S]*?status:\s*403[\s\S]*?\);/)?.[0] ?? "";
  assert(guard.length > 0, "expected `if (userId && authenticatedUserId !== userId)` mismatch guard returning 403");
  assert(guard.includes("403"), "userId mismatch must return 403");
  assert(
    guard.includes("Authenticated user does not match request userId"),
    "mismatch must surface the does-not-match message",
  );
});

// ── Queue / enqueue contract ──────────────────────────────────────────────────

Deno.test("submit-resume: enqueues a resume_analysis job into analysis_jobs as 'pending'", () => {
  assert(src.includes('.from("analysis_jobs")'), "must write to analysis_jobs");
  assert(
    /job_type:\s*"resume_analysis"/.test(src),
    "the enqueued job_type must be resume_analysis",
  );
  assert(/status:\s*"pending"/.test(src), "a newly enqueued job starts as 'pending'");
});

Deno.test("submit-resume: returns 202 with a jobId for the queued job", () => {
  assert(src.includes("jobId: job.id"), "the accepted response carries the new jobId");
  assert(/status:\s*202/.test(src), "queued submission responds 202 Accepted");
});

Deno.test("submit-resume: merit gate is wired behind the legacy MERIT_SYSTEM_ENABLED flag with refund-on-insert-failure", () => {
  // MIG-05 dual path: the legacy enqueue stays byte-identical until the flag flips.
  assert(
    src.includes("if ((MERIT_SYSTEM_ENABLED || mode === 'elite_unlock') && authenticatedUserCtx)"),
    "merit deduction is gated behind MERIT_SYSTEM_ENABLED && userContext",
  );
  assert(src.includes("withMerits"), "merit-path enqueue runs inside withMerits");
  // D-08a: a job-insert failure inside withMerits throws MeritRefundable so the deduction is refunded.
  assert(
    src.includes("throw new MeritRefundable"),
    "insert failure inside withMerits must throw MeritRefundable (refund, not leak)",
  );
});

Deno.test("AC-09 submit-resume: elite_unlock stores only stable identifiers", () => {
  assert(src.includes("mode === 'elite_unlock'"));
  assert(src.includes("baseAnalysisId"));
  assert(src.includes("const queuePayload = mode === 'elite_unlock'"));
  const unlockPayload = src.match(/const queuePayload = mode === 'elite_unlock'[\s\S]*?: \{/ )?.[0] ?? "";
  assert(unlockPayload.includes("resumeId"));
  assert(unlockPayload.includes("baseAnalysisId"));
  assert(!unlockPayload.includes("resumeText,"), "unlock payload must not store replacement text");
  assert(!unlockPayload.includes("tier:"), "unlock payload must not store client/server tier as authority");
});

Deno.test("AC-05 submit-resume: elite_unlock rejects spoofable authority fields", () => {
  assert(src.includes("forbiddenUnlockFields"));
  for (const field of ["tier", "userId", "resumeText", "gradingData", "fileName", "filename"]) {
    assert(src.includes(`'${field}'`) || src.includes(`"${field}"`));
  }
});

Deno.test("AC-09 submit-resume: unlock deduction and duplicate lookup share a stable identity", () => {
  assert(src.includes("unlockIdempotencyKey"));
  assert(src.includes("idempotencyKey: unlockIdempotencyKey"));
  assert(src.includes("activePayloadIdentity"));
  assert(src.includes("{ resumeId, mode: 'elite_unlock' }"));
});

// ── Failure / error response branch ───────────────────────────────────────────

Deno.test("submit-resume: enqueue failure returns 500 and auth errors map to 401", () => {
  assert(
    src.includes("Failed to enqueue resume analysis job"),
    "a failed insert on the legacy path surfaces an enqueue-failure error",
  );
  // The terminal catch distinguishes auth failures (401) from internal errors (500).
  // WR-05: fall back to "" (not src) so a regex miss FAILS this test instead of
  // silently matching the whole file (401/500 appear elsewhere and would false-pass).
  // The terminal token tolerates the withCors serve-wrap: the outer entrypoint now
  // closes with `}))` rather than `})`, so accept one-or-more closing parens.
  const catchBlock = src.match(/catch \(error\)[\s\S]*?\}\);[\s\S]*?\}\)+;/)?.[0] ?? "";
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
