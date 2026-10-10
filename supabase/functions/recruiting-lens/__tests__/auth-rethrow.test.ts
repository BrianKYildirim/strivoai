/**
 * Phase 07.1-03 (RUN-04 #2) — recruiting-lens auth-Response re-throw guard test.
 *
 * OFF the test:ci gate (isolation-only). Importing recruiting-lens/index.ts pulls in
 * supabase-client + several shared modules whose load perturbs the SHARED single `deno test`
 * process and tips the stripe-webhook idempotency tests (handler returns 500 not 200) when this
 * file shares the run (a pre-existing fragility - interview-prep-analyze triggers it pairwise too;
 * the full baseline order happens to dodge it). Operator decision 2026-06-23: keep this runtime
 * test for isolation runs, but the IN-GATE coverage of the 07.1-03 guard/seam is the static
 * source-string assertion in ../handler-config.test.ts. Run this file on its own:
 *   deno test --allow-all --no-check supabase/functions/recruiting-lens/__tests__/auth-rethrow.test.ts
 * (No neighboring handler test perturbs the shared run.)
 *
 * recruiting-lens validates the body BEFORE requireAuth (index.ts step 3 then step 4),
 * so a fully-valid body with NO/invalid Authorization reaches requireAuth, which throws
 * Response(401). The 07.1-03 catch guard `if (err instanceof Response) return err;` now
 * propagates it as the frozen 401 {error:'Unauthorized'} contract instead of swallowing
 * it into a generic 500.
 *
 * The handler/IS_TEST seam (export async function handler + IS_TEST-guarded serve) was
 * added in 07.1-03 so this offline handler invocation is possible — mirroring
 * interview-prep-analyze/__tests__/analyze.failure-branches.test.ts.
 *
 * Run:
 *   IS_TEST=true AI_TEST_MODE=true deno test --allow-all --no-check \
 *     supabase/functions/recruiting-lens/__tests__/auth-rethrow.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const testOpts = { sanitizeOps: false, sanitizeResources: false } as const;

// LAZY env-set + import (test-isolation, 07.1-03): importing recruiting-lens/index.ts pulls in
// supabase-client + several shared modules whose load perturbs the SHARED single `deno test`
// process and tips the stripe-webhook idempotency tests (FakeRpcCall counters) from green to red
// when this file is loaded at IMPORT phase. Deferring the env-set + dynamic import into the first
// test body (which runs AFTER the early stripe-webhook test bodies) keeps this file hermetic in
// the shared run. Deno caches the module, so the import runs once.
let _handler: ((req: Request) => Promise<Response>) | null = null;
async function getHandler(): Promise<(req: Request) => Promise<Response>> {
  if (!_handler) {
    // IS_TEST keeps serve() off; synthetic SUPABASE_*/APP_URL placeholders only; SUPABASE_URL is
    // an unroutable loopback so requireAuth's live getUser fails fast and locally. Override only
    // when unset so a CI that injects a real test URL wins.
    Deno.env.set("IS_TEST", "true");
    Deno.env.set("AI_TEST_MODE", "true");
    Deno.env.set("SUPABASE_URL", Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:0");
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "placeholder-service-role-key");
    Deno.env.set("SUPABASE_ANON_KEY", Deno.env.get("SUPABASE_ANON_KEY") ?? "placeholder-anon-key");
    Deno.env.set("APP_URL", Deno.env.get("APP_URL") ?? "http://localhost:8080");
    const mod = await import("../index.ts");
    _handler = mod.handler;
  }
  return _handler;
}

// A fully valid Recruiting Lens body that clears the step-3 validation
// (resumeSummary >= 50 chars, jobDescription >= 50 chars, company, roleTitle) so the
// request reaches the step-4 auth gate. Synthetic, non-sensitive placeholder text only.
const VALID_BODY = {
  resumeSummary:
    "Senior backend engineer with eight years building reliable distributed payment systems and leading small platform teams.",
  jobDescription:
    "We are hiring a senior backend engineer with strong distributed systems experience and a track record of shipping reliable services at scale.",
  company: "Acme Corp",
  roleTitle: "Senior Backend Engineer",
};

function req(opts: { auth?: boolean } = {}): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.auth !== false) headers["Authorization"] = "Bearer synthetic-jwt-placeholder";
  return new Request("http://recruiting-lens.test/", {
    method: "POST",
    headers,
    body: JSON.stringify(VALID_BODY),
  });
}

// ── Auth-reject: valid body, NO Authorization → requireAuth throws Response(401);
//        the 07.1-03 catch guard propagates it as 401 {error:'Unauthorized'} (RUN-04 #2) ──
Deno.test({
  name: "recruiting-lens handler: valid body, missing auth -> 401 Unauthorized (thrown 401 Response propagated by catch guard)",
  ...testOpts,
  fn: async () => {
    const handler = await getHandler();
    const res = await handler(req({ auth: false }));
    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(body.error, "Unauthorized");
  },
});

// ── Auth-reject: valid body, synthetic bearer that cannot pass live getUser → the
//        getUser failure surfaces as requireAuth's thrown Response(401), which the same
//        guard propagates (not a swallowed 500). ──────────────────────────────────────
Deno.test({
  name: "recruiting-lens handler: valid body, invalid token -> 401 Unauthorized (getUser failure surfaces as propagated 401)",
  ...testOpts,
  fn: async () => {
    const handler = await getHandler();
    const res = await handler(req());
    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(body.error, "Unauthorized");
  },
});
