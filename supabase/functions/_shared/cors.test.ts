/**
 * Deno unit tests for the _shared/cors.ts module.
 *
 * Table-driven origin x status x preflight matrix (CORS-02/03/04/06). Asserts
 * header PRESENCE for approved origins AND header ABSENCE (=== null) for a
 * disallowed origin on success, 4xx/5xx error, and OPTIONS preflight, plus the
 * withCors thrown-Response / thrown-Error / streaming-passthrough contracts.
 *
 * Run with: deno test supabase/functions/_shared/cors.test.ts --no-check --allow-env --allow-read
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { corsHeaders, handleOptionsRequest, jsonError, withCors } from "./cors.ts";

const APEX = "https://strivoai.net";
const WWW = "https://www.strivoai.net";
const EVIL = "https://evil.example";

/** Wraps a test body with the apex+www allowlist set in the env (try/finally). */
function withAllowlist(fn: () => void | Promise<void>): () => Promise<void> {
  return async () => {
    Deno.env.set("ALLOWED_ORIGINS", `${APEX},${WWW}`);
    try {
      await fn();
    } finally {
      Deno.env.delete("ALLOWED_ORIGINS");
    }
  };
}

function reqWith(origin?: string, method = "POST"): Request {
  return new Request("https://fn.example", {
    method,
    headers: origin ? { Origin: origin } : {},
  });
}

// ── The matrix: [origin] -> [expected Access-Control-Allow-Origin] ───────────

const ORIGIN_CASES: Array<{ label: string; origin?: string; expectedAcao: string | null }> = [
  { label: "approved apex", origin: APEX, expectedAcao: APEX },
  { label: "approved www", origin: WWW, expectedAcao: WWW },
  { label: "approved apex w/ trailing slash", origin: `${APEX}/`, expectedAcao: APEX },
  { label: "disallowed origin", origin: EVIL, expectedAcao: null },
  { label: "no Origin header", origin: undefined, expectedAcao: null },
];

for (const c of ORIGIN_CASES) {
  // ── success path (withCors over a 200 handler) ──────────────────────────────
  Deno.test(`matrix success: ${c.label} -> ACAO=${c.expectedAcao}`, withAllowlist(async () => {
    const res = await withCors(reqWith(c.origin), "user", () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 }));
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), c.expectedAcao);
    assert(res.headers.get("Access-Control-Allow-Origin") !== "*", "never wildcard");
    assertEquals(res.headers.get("Vary"), "Origin");
  }));

  // ── error path (jsonError 4xx) ──────────────────────────────────────────────
  Deno.test(`matrix 4xx error: ${c.label} -> ACAO=${c.expectedAcao}`, withAllowlist(async () => {
    const res = jsonError(reqWith(c.origin), 402, "out_of_merits");
    assertEquals(res.status, 402);
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), c.expectedAcao);
    assertEquals(res.headers.get("Vary"), "Origin");
    assertEquals((await res.json()).error, "out_of_merits");
  }));

  // ── error path (jsonError 5xx) ──────────────────────────────────────────────
  Deno.test(`matrix 5xx error: ${c.label} -> ACAO=${c.expectedAcao}`, withAllowlist(() => {
    const res = jsonError(reqWith(c.origin), 500, "internal_error");
    assertEquals(res.status, 500);
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), c.expectedAcao);
    assertEquals(res.headers.get("Vary"), "Origin");
  }));

  // ── preflight path (OPTIONS) ────────────────────────────────────────────────
  Deno.test(`matrix preflight: ${c.label} -> ACAO=${c.expectedAcao}`, withAllowlist(() => {
    const res = handleOptionsRequest({ type: "user" }, reqWith(c.origin, "OPTIONS"));
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), c.expectedAcao);
    assert(res.headers.get("Access-Control-Allow-Origin") !== "*", "never wildcard");
    assertEquals(res.headers.get("Vary"), "Origin");
  }));
}

// ── jsonError across the live status codes (body contract + CORS) ────────────

for (const [status, errKey] of [
  [401, "Unauthorized"],
  [402, "out_of_merits"],
  [429, "rate_limit_exceeded"],
  [500, "internal_error"],
] as Array<[number, string]>) {
  Deno.test(`jsonError ${status}: approved Origin gets CORS + Vary + string error`, withAllowlist(async () => {
    const res = jsonError(reqWith(APEX), status, errKey);
    assertEquals(res.status, status);
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), APEX);
    assertEquals(res.headers.get("Vary"), "Origin");
    assertEquals(res.headers.get("Content-Type"), "application/json");
    const body = await res.json();
    assertEquals(typeof body.error, "string");
    assertEquals(body.error, errKey);
  }));
}

Deno.test("jsonError: additive siblings preserved; retryable defaulted by status", withAllowlist(async () => {
  const r429 = await jsonError(reqWith(APEX), 429, "usage_limit_reached", {
    message: "Resets soon.",
    resetDate: "2026-07-01",
    tier: "free",
  }).json();
  assertEquals(r429.message, "Resets soon.");
  assertEquals(r429.resetDate, "2026-07-01");
  assertEquals(r429.tier, "free");
  assertEquals(r429.retryable, true); // 429 retryable

  const r400 = await jsonError(reqWith(APEX), 400, "bad_input").json();
  assertEquals(r400.retryable, false); // 4xx validation not retryable

  const rOverride = await jsonError(reqWith(APEX), 500, "internal_error", { retryable: false }).json();
  assertEquals(rOverride.retryable, false); // explicit override wins over status default
}));

// ── OPTIONS preflight header detail ──────────────────────────────────────────

Deno.test("preflight: Allow-Headers has the four defaults + extraHeaders; Allow-Methods present", withAllowlist(() => {
  const res = handleOptionsRequest(
    { type: "user", extraHeaders: "x-internal-job-secret" },
    reqWith(APEX, "OPTIONS"),
  );
  const allow = res.headers.get("Access-Control-Allow-Headers") ?? "";
  for (const h of ["authorization", "x-client-info", "apikey", "content-type", "x-internal-job-secret"]) {
    assert(allow.includes(h), `Allow-Headers should include ${h}`);
  }
  assert((res.headers.get("Access-Control-Allow-Methods") ?? "").includes("OPTIONS"));
  assertEquals(res.status, 200);
}));

// ── internal / webhook: no CORS headers ──────────────────────────────────────

Deno.test("internal/webhook: corsHeaders + handleOptionsRequest emit no ACAO", withAllowlist(() => {
  assertEquals(corsHeaders({ type: "internal" }, reqWith(APEX)), {});
  assertEquals(corsHeaders({ type: "webhook" }, reqWith(APEX)), {});
  assertEquals(handleOptionsRequest({ type: "internal" }, reqWith(APEX, "OPTIONS"))
    .headers.get("Access-Control-Allow-Origin"), null);
  assertEquals(handleOptionsRequest({ type: "webhook" }, reqWith(APEX, "OPTIONS"))
    .headers.get("Access-Control-Allow-Origin"), null);
}));

// ── withCors guarantees ──────────────────────────────────────────────────────

Deno.test("withCors: thrown bare Response(401) is returned with CORS merged", withAllowlist(async () => {
  const res = await withCors(reqWith(APEX), "user", () => {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  });
  assertEquals(res.status, 401);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), APEX);
  assertEquals((await res.json()).error, "Unauthorized");
}));

Deno.test("withCors: thrown Error becomes a CORS-tagged 500 with no detail leak", withAllowlist(async () => {
  const res = await withCors(reqWith(APEX), "user", () => {
    throw new Error("secret internal stack detail");
  });
  assertEquals(res.status, 500);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), APEX);
  const body = await res.json();
  assertEquals(body.error, "internal_error");
  assertEquals(body.retryable, false);
  assert(!JSON.stringify(body).includes("secret internal stack detail"), "must not leak internal detail");
}));

Deno.test("withCors: OPTIONS short-circuits to preflight (handler never runs)", withAllowlist(async () => {
  let ran = false;
  const res = await withCors(reqWith(APEX, "OPTIONS"), "user", () => {
    ran = true;
    return new Response("nope");
  });
  assertEquals(ran, false);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), APEX);
}));

Deno.test("withCors: streaming ReadableStream body passes through unbuffered", withAllowlist(async () => {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode("data: chunk-1\n\n"));
      controller.enqueue(enc.encode("data: chunk-2\n\n"));
      controller.close();
    },
  });
  const res = await withCors(reqWith(APEX), "user", () =>
    new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } }));
  // CORS overlaid, original Content-Type preserved...
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), APEX);
  assertEquals(res.headers.get("Content-Type"), "text/event-stream");
  // ...and the streamed content arrives intact (body was not buffered/replaced).
  const text = await res.text();
  assert(text.includes("chunk-1"), "first chunk survived");
  assert(text.includes("chunk-2"), "second chunk survived");
}));
