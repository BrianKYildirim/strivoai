/**
 * Deno unit tests for the _shared/auth.ts module.
 * Run with: deno test supabase/functions/_shared/auth.test.ts --no-check
 */
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { requireAuth, requireInternalOrUserAuth } from "./auth.ts";

// ── Console capture helper (same pattern as logger.test.ts) ─────────────────

function captureConsole(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const origLog = console.log;
  const origError = console.error;
  console.log = (...args: unknown[]) => lines.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) => lines.push(args.map(String).join(" "));
  return {
    lines,
    restore: () => {
      console.log = origLog;
      console.error = origError;
    },
  };
}

// ── User auth tests ──────────────────────────────────────────────────────────

Deno.test("requireAuth user: missing Authorization header throws Response(401)", async () => {
  const req = new Request("https://example.com", { method: "POST" });
  try {
    await requireAuth(req, { type: "user" });
    assert(false, "Should have thrown");
  } catch (e) {
    assert(e instanceof Response, "Should throw a Response");
    assertEquals(e.status, 401);
    const body = await e.json();
    assertEquals(body.error, "Unauthorized");
  }
});

Deno.test("requireAuth user: Authorization not starting with Bearer throws Response(401)", async () => {
  const req = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Basic sometoken" },
  });
  try {
    await requireAuth(req, { type: "user" });
    assert(false, "Should have thrown");
  } catch (e) {
    assert(e instanceof Response, "Should throw a Response");
    assertEquals(e.status, 401);
    const body = await e.json();
    assertEquals(body.error, "Unauthorized");
  }
});

Deno.test("requireAuth user: 401 from an allowlisted Origin carries ACAO while body stays { error: 'Unauthorized' }", async () => {
  Deno.env.set("ALLOWED_ORIGINS", "https://strivoai.net");
  try {
    const req = new Request("https://example.com", {
      method: "POST",
      headers: { Origin: "https://strivoai.net" }, // no Authorization -> missing-bearer 401
    });
    await requireAuth(req, { type: "user" });
    assert(false, "Should have thrown");
  } catch (e) {
    assert(e instanceof Response, "Should throw a Response");
    assertEquals(e.status, 401);
    assertEquals(e.headers.get("Access-Control-Allow-Origin"), "https://strivoai.net");
    const body = await e.json();
    assertEquals(body.error, "Unauthorized");
  } finally {
    Deno.env.delete("ALLOWED_ORIGINS");
  }
});

// Note: Testing the full user auth path (getUser + profile query) requires
// mocking the Supabase service client, which is not feasible in a Deno unit
// test without a full mock framework. Those paths are covered by integration
// tests against the staging environment.

// ── Internal auth tests ──────────────────────────────────────────────────────

Deno.test("requireAuth internal: missing x-internal-job-secret header throws Response(401)", async () => {
  Deno.env.set("INTERNAL_JOB_SECRET", "test-secret-value");
  try {
    const req = new Request("https://example.com", { method: "POST" });
    await requireAuth(req, { type: "internal" });
    assert(false, "Should have thrown");
  } catch (e) {
    assert(e instanceof Response, "Should throw a Response");
    assertEquals(e.status, 401);
  } finally {
    Deno.env.delete("INTERNAL_JOB_SECRET");
  }
});

Deno.test("requireAuth internal: wrong secret value throws Response(401)", async () => {
  Deno.env.set("INTERNAL_JOB_SECRET", "correct-secret");
  try {
    const req = new Request("https://example.com", {
      method: "POST",
      headers: { "x-internal-job-secret": "wrong-secret" },
    });
    await requireAuth(req, { type: "internal" });
    assert(false, "Should have thrown");
  } catch (e) {
    assert(e instanceof Response, "Should throw a Response");
    assertEquals(e.status, 401);
  } finally {
    Deno.env.delete("INTERNAL_JOB_SECRET");
  }
});

Deno.test("requireAuth internal: wrong secret logs auth-failure with reason secret-mismatch", async () => {
  Deno.env.set("INTERNAL_JOB_SECRET", "correct-secret");
  const cap = captureConsole();
  try {
    const req = new Request("https://example.com", {
      method: "POST",
      headers: { "x-internal-job-secret": "wrong-secret" },
    });
    await requireAuth(req, { type: "internal" });
  } catch (_e) {
    // expected
  } finally {
    cap.restore();
    Deno.env.delete("INTERNAL_JOB_SECRET");
  }
  const logLines = cap.lines.map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
  const failureLog = logLines.find((entry) => entry.msg === "auth-failure");
  assert(failureLog !== undefined, "Should have logged auth-failure");
  assertEquals(failureLog.reason, "secret-mismatch");
});

Deno.test("requireAuth internal: correct secret returns null", async () => {
  Deno.env.set("INTERNAL_JOB_SECRET", "test-secret-value");
  const cap = captureConsole();
  try {
    const req = new Request("https://example.com", {
      method: "POST",
      headers: { "x-internal-job-secret": "test-secret-value" },
    });
    const result = await requireAuth(req, { type: "internal" });
    assertEquals(result, null);
  } finally {
    cap.restore();
    Deno.env.delete("INTERNAL_JOB_SECRET");
  }
});

Deno.test("requireAuth internal: correct secret logs auth-success with type internal", async () => {
  Deno.env.set("INTERNAL_JOB_SECRET", "test-secret-value");
  const cap = captureConsole();
  try {
    const req = new Request("https://example.com", {
      method: "POST",
      headers: { "x-internal-job-secret": "test-secret-value" },
    });
    await requireAuth(req, { type: "internal" });
  } finally {
    cap.restore();
    Deno.env.delete("INTERNAL_JOB_SECRET");
  }
  const logLines = cap.lines.map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
  const successLog = logLines.find((entry) => entry.msg === "auth-success");
  assert(successLog !== undefined, "Should have logged auth-success");
  assertEquals(successLog.type, "internal");
});

// ── Webhook auth tests ───────────────────────────────────────────────────────

Deno.test("requireAuth webhook: returns null without checking anything", async () => {
  const req = new Request("https://example.com", { method: "POST" });
  const result = await requireAuth(req, { type: "webhook" });
  assertEquals(result, null);
});

// ── requireInternalOrUserAuth tests ─────────────────────────────────────────

Deno.test("requireInternalOrUserAuth: valid x-internal-job-secret header returns null", async () => {
  Deno.env.set("INTERNAL_JOB_SECRET", "test-secret-value");
  try {
    const req = new Request("https://example.com", {
      method: "POST",
      headers: { "x-internal-job-secret": "test-secret-value" },
    });
    const result = await requireInternalOrUserAuth(req);
    assertEquals(result, null);
  } finally {
    Deno.env.delete("INTERNAL_JOB_SECRET");
  }
});

Deno.test("requireInternalOrUserAuth: no secret header falls through to user auth and throws 401 if no bearer", async () => {
  Deno.env.set("INTERNAL_JOB_SECRET", "test-secret-value");
  try {
    const req = new Request("https://example.com", {
      method: "POST",
      // No x-internal-job-secret, no Authorization
    });
    await requireInternalOrUserAuth(req);
    assert(false, "Should have thrown");
  } catch (e) {
    assert(e instanceof Response, "Should throw a Response");
    assertEquals(e.status, 401);
  } finally {
    Deno.env.delete("INTERNAL_JOB_SECRET");
  }
});

// ── Security check: timingSafeEqual is used, not === ────────────────────────

Deno.test("auth module uses timingSafeEqual (not ===) for secret comparison", async () => {
  // This test verifies the module source contains timingSafeEqual.
  // Read the module source and confirm the pattern exists.
  const moduleText = await Deno.readTextFile(new URL("./auth.ts", import.meta.url));
  assert(
    moduleText.includes("timingSafeEqual"),
    "auth.ts must use timingSafeEqual for secret comparison, not ==="
  );
});
