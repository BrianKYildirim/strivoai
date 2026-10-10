/**
 * Phase 05 Plan 04 Task 2 — interview-prep-analyze TRUE handler-invocation failure branches (Pattern B).
 *
 * interview-prep-analyze is the ONLY edge function that exports `handler` and guards
 * `serve` behind IS_TEST (index.ts:115 + 724-726), so D-02's literal "construct real
 * Requests against the handler with Anthropic stubbed" is achievable HERE and only here.
 * This test invokes `handler(new Request(...))` directly with the AI seam stubbed
 * (AI_TEST_MODE) and characterizes the ACTUAL status + body of each failure branch the
 * handler can reach OFFLINE (no live Supabase). It does NOT duplicate the existing
 * __tests__ coverage:
 *   - analyze.truncated-json-repair.test.ts exercises parseAiResponse only (no handler call)
 *   - merit-refund.test.ts exercises the refund classifier taxonomy directly (no handler call)
 *
 * Pin-and-log (05-SUSPECTED-BEHAVIOR.md SB-05-04): the handler runs body-parse + Zod
 * BEFORE auth (Pitfall 6 "fail fast"). Phase 07.1-03 (RUN-04) added the
 * `if (err instanceof Response) return err;` guard to the terminal catch (matching
 * interview-prep-evaluate), so a thrown auth Response now PROPAGATES rather than being
 * swallowed. So:
 *   - malformed body / bad intake → 400 invalid_input (reachable, no network)
 *   - missing/invalid Authorization, valid intake → requireAuth throws Response(401),
 *     which the guard now re-throws as 401 {error:'Unauthorized'} (was a swallowed 500 — SB-05-04 RESOLVED).
 *   - the AI-failure refund branch needs a live session (requireAuth -> supabase.auth.getUser
 *     -> profiles), so it is NOT reachable offline; AI_FORCE_FAILURE therefore stays INERT
 *     here (the refund TAXONOMY is covered by the sibling merit-refund.test.ts classifier test).
 *
 * Two-key safety (T-05-08): synthetic placeholder Authorization only; AI_FORCE_FAILURE is
 * never set without AI_TEST_MODE also true, and is restored in each test's tail.
 *
 * Run:
 *   IS_TEST=true AI_TEST_MODE=true deno test --allow-all --no-check \
 *     supabase/functions/interview-prep-analyze/__tests__/analyze.failure-branches.test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Set env BEFORE the dynamic import so index.ts does not attach a real HTTP server
// (IS_TEST) and the Anthropic seam is stubbed (AI_TEST_MODE). The handler reads
// SUPABASE_*/APP_URL at module/getServiceClient scope — synthetic placeholders only.
//
// WR-04: SUPABASE_URL points at a guaranteed-unroutable LOCAL target (loopback,
// invalid port 0) so requireAuth's live supabase.auth.getUser fails fast and
// locally — no outbound DNS/TLS to a real `*.supabase.co` host that could hang on
// a network-connected runner or be hijacked by a wildcard DNS resolver. The
// Post-07.1-03, any thrown Response from the auth gate (here a local connection
// failure that surfaces as requireAuth's thrown 401 Response) now propagates as a
// 401 {error:'Unauthorized'} via the catch guard. We only override when the env var is unset, so
// a CI that injects a real test URL still wins.
Deno.env.set("IS_TEST", "true");
Deno.env.set("AI_TEST_MODE", "true");
Deno.env.set("SUPABASE_URL", Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:0");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "placeholder-service-role-key");
Deno.env.set("SUPABASE_ANON_KEY", Deno.env.get("SUPABASE_ANON_KEY") ?? "placeholder-anon-key");
Deno.env.set("APP_URL", Deno.env.get("APP_URL") ?? "http://localhost:8080");

const { handler } = await import("../index.ts");

const testOpts = { sanitizeOps: false, sanitizeResources: false } as const;

// A fully valid §intake that passes IntakeFormSchema.safeParse — used to drive the
// request PAST Zod and into the auth gate.
const VALID_INTAKE = {
  job_description:
    "We are hiring a senior backend engineer with strong distributed systems experience and a proven track record of shipping reliable services at scale.",
  background_context: "Five years building payment infrastructure on a small platform team.",
  role_title: "Senior Backend Engineer",
  company: "Acme Corp",
  interview_type: "behavioral",
  question_categories: ["leadership", "technical"],
  difficulty: "senior",
  duration: 30,
  format: "written",
};

function req(body: BodyInit | null, opts: { auth?: boolean } = {}): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.auth !== false) headers["Authorization"] = "Bearer synthetic-jwt-placeholder";
  return new Request("http://interview-prep-analyze.test/", {
    method: "POST",
    headers,
    body,
  });
}

// ── 1. Malformed JSON body → 400 invalid_input (executed, no network) ─────────

Deno.test({
  name: "handler invocation: malformed JSON body → 400 invalid_input",
  ...testOpts,
  fn: async () => {
    const res = await handler(req("this is not json"));
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error, "invalid_input");
    assertEquals(body.message, "Invalid JSON body.");
  },
});

// ── 2. Bad intake failing IntakeFormSchema → 400 invalid_input + issues[] ──────

Deno.test({
  name: "handler invocation: intake failing Zod → 400 invalid_input with issues[]",
  ...testOpts,
  fn: async () => {
    // job_description under the 40-char minimum + missing required fields.
    const res = await handler(req(JSON.stringify({ job_description: "too short" })));
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error, "invalid_input");
    assertEquals(body.message, "Intake form validation failed");
    assert(Array.isArray(body.issues), "validation failure surfaces an issues[] array");
    assert(body.issues.length > 0, "issues[] must enumerate the failing fields");
    assert(
      body.issues.every((i: { path: string; message: string }) =>
        typeof i.path === "string" && typeof i.message === "string"
      ),
      "each issue carries a path + message (no raw Zod object leak)",
    );
  },
});

// ── 3. Auth-reject: valid intake, NO Authorization → the catch guard re-throws the
//        thrown 401 Response as 401 {error:'Unauthorized'} (SB-05-04 RESOLVED, RUN-04) ──────

Deno.test({
  name: "handler invocation: valid intake, missing auth → 401 Unauthorized (thrown 401 Response propagated by catch guard)",
  ...testOpts,
  fn: async () => {
    const res = await handler(req(JSON.stringify(VALID_INTAKE), { auth: false }));
    // requireAuth throws Response(401); the 07.1-03 catch guard `if (err instanceof Response) return err;`
    // (matching interview-prep-evaluate) now propagates it as the frozen 401 contract instead of a 500.
    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(body.error, "Unauthorized");
  },
});

// ── 4. AI-failure refund branch is auth-gated → NOT reachable offline ─────────
//        AI_FORCE_FAILURE stays INERT because requireAuth (live getUser) fires first.

Deno.test({
  name: "handler invocation: AI_FORCE_FAILURE stays inert offline (refund branch is behind the live-auth gate)",
  ...testOpts,
  fn: async () => {
    Deno.env.set("AI_FORCE_FAILURE", "true"); // paired with AI_TEST_MODE already true (two-key safety)
    try {
      const res = await handler(req(JSON.stringify(VALID_INTAKE)));
      // The synthetic Bearer cannot pass requireAuth's live supabase.auth.getUser offline
      // (getUser returns an error → requireAuth throws Response(401)), so the request never
      // reaches the withMerits/AI block where AI_FORCE_FAILURE would raise a refundable 529.
      // Post-07.1-03 it surfaces as the same propagated 401 as case 3 — proving the refund
      // branch is unreachable without a live session. The refund classification taxonomy
      // itself is covered by the sibling merit-refund.test.ts.
      assertEquals(res.status, 401);
      const body = await res.json();
      assertEquals(body.error, "Unauthorized");
    } finally {
      Deno.env.delete("AI_FORCE_FAILURE"); // restore — never leak the fault-injection flag
    }
  },
});
