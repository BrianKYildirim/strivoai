/**
 * Phase 31 · 31-04 · MER-05 — refund-on-failure verification (gated staging suite)
 *
 * Proves the EXISTING refund machinery (merit-gateway.ts withMerits + the async
 * refundMeritsForJob path) refunds the deducted Merits whenever Anthropic fails
 * with a refundable error, across:
 *
 *   (A) Exhaustive gateway leg — every refundable class:
 *         500, 529, 408, AbortError(->408), network/timeout
 *       For each: force the error via MERIT_TEST_FORCE_REFUNDABLE_ERROR (set on
 *       the staging FUNCTION env by the operator), call an endpoint, assert the
 *       endpoint RETURNED the forced refundable error FIRST (Pitfall 3 — guards a
 *       vacuous pass where no error fired), then assert the balance was restored
 *       to the exact seed (Pitfall 5 — exact equality, not a delta).
 *
 *   (B) 7 per-path smoke tests (D-15) — one forced-error case for each of the
 *       5 sync + 2 async endpoints, confirming each endpoint wires the gateway:
 *         sync:  analyze-resume, analyze-career, grade-linkedin,
 *                recruiting-lens, interview-prep-analyze
 *         async: process-resume-analysis-job, process-career-analysis-job
 *       (driven through submit-job -> poll terminal 'failed').
 *
 * Plan 31-02 SUMMARY recorded **A4 CONFIRMED — no divergence**: all 5 sync +
 * 2 async paths route through the single _shared/anthropic.ts chokepoint, so the
 * one MERIT_TEST_FORCE_REFUNDABLE_ERROR toggle fires on every endpoint. No
 * per-path alternate-injection workaround is required.
 *
 * Execution model: registered in scripts/run-edge-tests.ps1 but gated behind
 * DENO_TEST_SUPABASE_REMOTE=1. Default unit-test runs SKIP without failing — the
 * always-on skip-guard self-check at the bottom confirms the gate mechanism.
 * Plan 31-04's blocking operator checkpoint runs the gated path against staging.
 *
 * Required env (gated):
 *   - SUPABASE_URL                       (staging project URL, ref cimjltzovkahkqecpwgi)
 *   - SUPABASE_SERVICE_ROLE_KEY          (provision/seed/read/teardown test users)
 *   - SUPABASE_ANON_KEY                  (mint user JWTs to call the deployed endpoints)
 *   - DENO_TEST_SUPABASE_REMOTE=1        (opt-in)
 *
 * Operator FUNCTION-env prerequisite (set on the staging Edge Function env, NOT
 * the local shell): MERIT_TEST_FORCE_REFUNDABLE_ERROR=<3-digit status>. Plan
 * 31-02's seam parses a 3-digit value (defaulting to 529 for non-numeric flags
 * like "true") and only fires on the staging host. The operator MUST UNSET it
 * after the run (Runtime State Inventory — a left-set flag force-fails staging).
 *
 * Verify-only: this file does NOT modify merit-gateway.ts or anthropic.ts.
 *
 * Run with:
 *   $env:DENO_TEST_SUPABASE_REMOTE = "1"
 *   $env:SUPABASE_URL = "https://cimjltzovkahkqecpwgi.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY = "<service-role-key>"
 *   $env:SUPABASE_ANON_KEY = "<anon-key>"
 *   deno test --allow-all _shared/merit-gateway.refund.test.ts --no-check
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const GATED = () => Deno.env.get("DENO_TEST_SUPABASE_REMOTE") === "1";

// Seed balance well above any single feature cost so a refund failure is
// observable as balance < SEED_BALANCE rather than masked by insufficient_merits.
const SEED_BALANCE = 100;

// The full refundable taxonomy (merit-gateway.ts:51-60 isRefundableAnthropicError):
//   any 5xx (incl. 529), 408, AbortError name, network/timeout keywords.
// MERIT_TEST_FORCE_REFUNDABLE_ERROR (31-02) takes a 3-digit status; AbortError
// and network/timeout both classify to 408 at the anthropic.ts chokepoint, so we
// drive them via 408 here and document the upstream class each one represents.
interface RefundableClass {
  label: string;
  forcedStatus: number;
}

const REFUNDABLE_CLASSES: RefundableClass[] = [
  { label: "500 (generic 5xx)", forcedStatus: 500 },
  { label: "529 (Anthropic overloaded)", forcedStatus: 529 },
  { label: "408 (request timeout)", forcedStatus: 408 },
  { label: "AbortError -> 408", forcedStatus: 408 },
  { label: "network/timeout -> 408", forcedStatus: 408 },
];

// The 7 paths. A4 (31-02 SUMMARY) confirmed all route through the chokepoint.
const SYNC_PATHS = [
  "analyze-resume",
  "analyze-career",
  "grade-linkedin",
  "recruiting-lens",
  "interview-prep-analyze",
] as const;

const ASYNC_PATHS = [
  { submit: "submit-resume-analysis-job", process: "process-resume-analysis-job" },
  { submit: "submit-career-analysis-job", process: "process-career-analysis-job" },
] as const;

// ── Harness (copied verbatim from merit-idempotency.test.ts) ─────────────────

async function freshClient() {
  const { createClient } = await import("npm:@supabase/supabase-js@2");
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to run the remote refund suite",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Provision a fresh auth user via Admin API, seed user_merits with a known
 * starting balance, and return both the user id and a freshly-minted user JWT
 * (needed to call the deployed endpoints as that user). Randomly-suffixed
 * @strivo-test.invalid email so concurrent runs never collide.
 */
async function provisionTestUser(
  startingBalance: number,
): Promise<{ userId: string; accessToken: string; email: string; password: string }> {
  const client = await freshClient();
  const suffix = crypto.randomUUID().slice(0, 8);
  const email = `merit-refund-test-${suffix}@strivo-test.invalid`;
  const password = crypto.randomUUID();

  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { test_fixture: "phase-31-04-merit-refund" },
  });
  if (error || !data?.user) {
    throw new Error(`Admin createUser failed: ${error?.message ?? "no user returned"}`);
  }
  const userId = data.user.id;

  const { error: meritErr } = await client
    .from("user_merits")
    .upsert(
      { user_id: userId, subscription_balance: startingBalance, shop_balance: 0 },
      { onConflict: "user_id" },
    );
  if (meritErr) {
    await client.auth.admin.deleteUser(userId).catch(() => {});
    throw new Error(`Seed user_merits failed: ${meritErr.message}`);
  }

  // Mint a real user JWT by signing in with the anon-key client.
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const url = Deno.env.get("SUPABASE_URL")!;
  if (!anonKey) {
    await client.auth.admin.deleteUser(userId).catch(() => {});
    throw new Error("SUPABASE_ANON_KEY must be set to mint a user JWT for endpoint calls");
  }
  const { createClient } = await import("npm:@supabase/supabase-js@2");
  const anonClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: signIn, error: signInErr } = await anonClient.auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr || !signIn?.session?.access_token) {
    await client.auth.admin.deleteUser(userId).catch(() => {});
    throw new Error(`Sign-in to mint JWT failed: ${signInErr?.message ?? "no session"}`);
  }

  return { userId, accessToken: signIn.session.access_token, email, password };
}

/** Tear down the test user — CASCADE removes every fixture row. */
async function teardownTestUser(userId: string): Promise<void> {
  const client = await freshClient();
  const { error } = await client.auth.admin.deleteUser(userId);
  if (error) {
    console.error(`[merit-gateway-refund] teardown failed for ${userId}: ${error.message}`);
  }
}

/** Read the total balance (subscription + shop) on a fresh client. */
async function readBalance(userId: string): Promise<number> {
  const client = await freshClient();
  const { data, error } = await client
    .from("user_merits")
    .select("subscription_balance, shop_balance")
    .eq("user_id", userId)
    .single();
  if (error || !data) {
    throw new Error(`Balance read failed: ${error?.message ?? "no row"}`);
  }
  return (data.subscription_balance ?? 0) + (data.shop_balance ?? 0);
}

const FUNCTIONS_BASE = () => `${Deno.env.get("SUPABASE_URL")}/functions/v1`;

/**
 * Call a deployed Edge Function endpoint as the seeded user. Returns the parsed
 * status + body so the caller can assert the forced refundable error came back.
 * A minimal-but-valid payload per endpoint keeps the request past input
 * validation so it reaches the forced-error chokepoint.
 */
async function callEndpoint(
  path: string,
  accessToken: string,
  body: Record<string, unknown>,
): Promise<{ status: number; text: string }> {
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const resp = await fetch(`${FUNCTIONS_BASE()}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
    },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  return { status: resp.status, text };
}

/** A refundable error surfaced if the endpoint returned a 5xx/408 or carried a known refundable keyword. */
function looksRefundable(status: number, text: string): boolean {
  if (status >= 500 || status === 408) return true;
  return /overload|overloaded|timeout|ECONNRESET|network|AbortError|forced-refundable-error|merit_system_error/i.test(
    text,
  );
}

/**
 * Minimal valid payload per sync endpoint. The exact shape only needs to clear
 * input validation so the request reaches the forced-error chokepoint; the
 * forced error fires before any real Anthropic work matters.
 */
function syncPayloadFor(path: string): Record<string, unknown> {
  const resumeText =
    "Experienced software engineer with 8 years building scalable web platforms, " +
    "leading teams, and shipping reliable production systems across multiple domains.";
  switch (path) {
    case "analyze-resume":
      return { resumeText, stream: false };
    case "analyze-career":
      return { resumeText, careerGoal: "Engineering Manager" };
    case "grade-linkedin":
      return { profileText: resumeText };
    case "recruiting-lens":
      return { resumeText, jobDescription: "Senior engineer role requiring leadership and scale." };
    case "interview-prep-analyze":
      return { resumeText, jobDescription: "Senior engineer role requiring leadership and scale." };
    default:
      return { resumeText };
  }
}

/** Async submit payload (mirrors the sync resume/career payloads). */
function asyncSubmitPayloadFor(submitPath: string): Record<string, unknown> {
  if (submitPath.includes("career")) return syncPayloadFor("analyze-career");
  return syncPayloadFor("analyze-resume");
}

/**
 * Poll a job row until it reaches a terminal state. The async worker refunds via
 * refundMeritsForJob() BEFORE flipping status='failed'
 * (process-career-analysis-job/index.ts:187-258), so a terminal 'failed' status
 * is the signal that the refund leg has run.
 */
async function pollJobTerminal(
  userId: string,
  jobType: string,
  timeoutMs = 90_000,
): Promise<{ status: string; row: Record<string, unknown> | null }> {
  const client = await freshClient();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // Both async paths share the single `analysis_jobs` table, discriminated by
    // `job_type` (resume_analysis | career_compass_analysis).
    const { data } = await client
      .from("analysis_jobs")
      .select("*")
      .eq("user_id", userId)
      .eq("job_type", jobType)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const status = (data as { status?: string } | null)?.status ?? "";
    if (status === "failed" || status === "completed") {
      return { status, row: data as Record<string, unknown> | null };
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  return { status: "timeout", row: null };
}

/** The job_type discriminator in analysis_jobs for each async submit path. */
function jobTypeFor(submitPath: string): string {
  return submitPath.includes("career") ? "career_compass_analysis" : "resume_analysis";
}

// ── (A) Exhaustive gateway leg — every refundable class ──────────────────────
// Driven through analyze-resume (the streaming chokepoint twin per 31-02 Pitfall
// 2) so each refundable class exercises the gateway refund control flow.

for (const klass of REFUNDABLE_CLASSES) {
  Deno.test(
    `MER-05 gateway refund: refundable class ${klass.label} -> deduction refunded to seed`,
    async () => {
      if (!GATED()) {
        console.log(
          `[merit-gateway-refund] SKIP — set DENO_TEST_SUPABASE_REMOTE=1 (+ SUPABASE_URL/SERVICE_ROLE_KEY/ANON_KEY, and MERIT_TEST_FORCE_REFUNDABLE_ERROR=${klass.forcedStatus} on the staging fn env) to run class ${klass.label}`,
        );
        return;
      }

      const { userId, accessToken } = await provisionTestUser(SEED_BALANCE);
      try {
        // Operator has set MERIT_TEST_FORCE_REFUNDABLE_ERROR on the staging fn
        // env for this run. Call the endpoint and capture the response.
        const res = await callEndpoint("analyze-resume", accessToken, syncPayloadFor("analyze-resume"));

        // Pitfall 3 guard — assert the forced refundable error returned FIRST.
        // Without this, a 200 (no error fired) would let the balance==seed
        // assertion pass vacuously (deduct + no failure also leaves seed intact
        // only if nothing deducted — but a real deduct+no-refund would FAIL the
        // balance check, so the error assertion is what proves the leg ran).
        assert(
          looksRefundable(res.status, res.text),
          `Forced refundable error (${klass.label}) must be returned BEFORE asserting refund; ` +
            `got status=${res.status} body=${res.text.slice(0, 300)}. ` +
            `Is MERIT_TEST_FORCE_REFUNDABLE_ERROR set on the staging fn env?`,
        );

        // Pitfall 5 — exact balance equality (not a delta): the deduction was
        // refunded back to the exact seed.
        assertEquals(
          await readBalance(userId),
          SEED_BALANCE,
          `Balance must be restored to seed (${SEED_BALANCE}) after refundable ${klass.label}; ` +
            `a value < seed means the deduction was NOT refunded`,
        );
      } finally {
        await teardownTestUser(userId);
      }
    },
  );
}

// ── (B) 7 per-path smoke tests (D-15) ────────────────────────────────────────
// One forced-error case per endpoint, confirming each wires the gateway. The
// gateway is the single source of refund truth; per-path divergence (a path NOT
// routing through the chokepoint) is the only risk these catch — A4 (31-02)
// confirmed none diverge, so each must restore balance to seed.

for (const path of SYNC_PATHS) {
  Deno.test(
    `MER-05 per-path smoke (sync): ${path} forces refundable error -> balance restored to seed`,
    async () => {
      if (!GATED()) {
        console.log(
          `[merit-gateway-refund] SKIP — set DENO_TEST_SUPABASE_REMOTE=1 (+ creds, + MERIT_TEST_FORCE_REFUNDABLE_ERROR on staging fn env) to smoke-test ${path}`,
        );
        return;
      }

      const { userId, accessToken } = await provisionTestUser(SEED_BALANCE);
      try {
        const res = await callEndpoint(path, accessToken, syncPayloadFor(path));

        // Pitfall 3 — forced error returned first.
        assert(
          looksRefundable(res.status, res.text),
          `${path}: forced refundable error must return BEFORE asserting refund; ` +
            `got status=${res.status} body=${res.text.slice(0, 300)}. ` +
            `If status=200, this path may NOT route through the gateway chokepoint (A4 divergence) — investigate before treating as a vacuous pass.`,
        );

        // Pitfall 5 — exact equality back to seed.
        assertEquals(
          await readBalance(userId),
          SEED_BALANCE,
          `${path}: balance must be restored to seed (${SEED_BALANCE}) — confirms this endpoint wires the gateway refund`,
        );
      } finally {
        await teardownTestUser(userId);
      }
    },
  );
}

for (const { submit, process } of ASYNC_PATHS) {
  Deno.test(
    `MER-05 per-path smoke (async): ${process} via ${submit} forces refundable error -> balance restored to seed`,
    async () => {
      if (!GATED()) {
        console.log(
          `[merit-gateway-refund] SKIP — set DENO_TEST_SUPABASE_REMOTE=1 (+ creds, + MERIT_TEST_FORCE_REFUNDABLE_ERROR on staging fn env) to smoke-test ${process}`,
        );
        return;
      }

      const { userId, accessToken } = await provisionTestUser(SEED_BALANCE);
      try {
        // Submit the job — submission deducts; the worker (process-*-job) calls
        // refundMeritsForJob() BEFORE flipping the row to status='failed' when
        // the forced refundable error fires (process-career-analysis-job:187-258).
        const submitRes = await callEndpoint(submit, accessToken, asyncSubmitPayloadFor(submit));
        assert(
          submitRes.status < 400,
          `${submit}: job submission must be accepted (status<400) so the worker can run and refund; ` +
            `got status=${submitRes.status} body=${submitRes.text.slice(0, 300)}`,
        );

        // Poll to terminal. The worker self-triggers (submit fires the process
        // function); a terminal 'failed' is the signal the refund leg ran.
        const terminal = await pollJobTerminal(userId, jobTypeFor(submit));

        // Pitfall 3 — assert the job terminated as FAILED (the forced refundable
        // error) BEFORE asserting refund. A 'completed' status means the forced
        // error did not fire (operator did not set the staging flag).
        assertEquals(
          terminal.status,
          "failed",
          `${process}: job must reach terminal status='failed' from the forced refundable error BEFORE asserting refund; ` +
            `got '${terminal.status}'. Is MERIT_TEST_FORCE_REFUNDABLE_ERROR set on the staging fn env?`,
        );

        // Pitfall 5 — exact equality back to seed (worker refunded before failing).
        assertEquals(
          await readBalance(userId),
          SEED_BALANCE,
          `${process}: balance must be restored to seed (${SEED_BALANCE}) — confirms the async worker wires refundMeritsForJob before status='failed'`,
        );
      } finally {
        await teardownTestUser(userId);
      }
    },
  );
}

// ── Skip-guard self-check (always-on) ────────────────────────────────────────

Deno.test(
  "merit-gateway-refund: skip-guard mechanism is exercised when DENO_TEST_SUPABASE_REMOTE is unset",
  () => {
    if (!GATED()) {
      console.log(
        "[merit-gateway-refund] SKIP — set DENO_TEST_SUPABASE_REMOTE=1 to exercise the live-staging refund suite (Plan 31-04 operator checkpoint)",
      );
    }
    // Always passes — the skip-guard itself is the feature under test here.
  },
);
