// CORS-05 drift guard (Phase 01 Plan 07): static-source audit over the 19 active
// USER Edge Functions. For each function it asserts the entrypoint (a) adopts the
// shared `withCors(req, 'user', …)` wrapper, (b) routes OPTIONS through the shared
// helper (`withCors` / `handleOptionsRequest`), and (c) never hardcodes an
// `Access-Control-Allow-Origin` literal — so a future function or a hand-rolled CORS
// literal cannot silently reintroduce the single-origin / missing-header pattern that
// caused the `www.strivoai.net` production outage. The only legitimate ACAO emission
// lives in `_shared/cors.ts`.
//
// Approach: static source analysis (RESEARCH §7 / grade-linkedin/handler-config.test.ts:10-13).
// Read each `index.ts` as text and assert on its contents — no Supabase/Anthropic mocking.

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// Authoritative set of 19 active USER Edge Functions (RESEARCH §4). The internal +
// webhook functions are deliberately EXCLUDED — they keep
// corsHeaders/handleOptionsRequest({ type: 'internal' | 'webhook' }) -> {} (no CORS),
// which this audit must NOT regress into requiring a user wrapper.
// NOTE: keep-warm was reclassified user -> internal (scheduler-only, x-internal-job-secret
// auth) and therefore left this user-CORS audit set.
const USER_FUNCTIONS = [
  "analyze-resume",
  "analyze-career",
  "grade-linkedin",
  "recruiting-lens",
  "interview-prep-analyze",
  "interview-prep-evaluate",
  "ocr-pdf",
  "get-analysis-job-status",
  "submit-resume-analysis-job",
  "submit-career-analysis-job",
  "create-checkout-session",
  "create-payment-intent",
  "create-stripe-portal",
  "cancel-subscription",
  "renew-subscription",
  "admin-delete-user",
  "notify-upgrade-request",
  "send-notification-email",
  "test-email",
] as const;

function readFunctionSource(fn: string): string {
  // On Windows, import.meta.url pathname begins with /C:/... which Deno cannot open.
  // Strip the leading slash to get a valid Windows path (handler-config.test.ts idiom).
  const rawPath = new URL(`../${fn}/index.ts`, import.meta.url).pathname;
  const indexPath = rawPath.startsWith("/") && rawPath[2] === ":"
    ? rawPath.slice(1)
    : rawPath;
  return Deno.readTextFileSync(indexPath);
}

// Length guard — the audit must cover exactly the authoritative 19 user functions.
// If a new user function is added, this fails until it is enrolled in the audit.
Deno.test("CORS-05 audit covers exactly 19 user functions", () => {
  assertEquals(USER_FUNCTIONS.length, 19);
});

// Table-driven: one Deno.test per function so a failure names the offending function.
for (const fn of USER_FUNCTIONS) {
  Deno.test(`CORS-05 [${fn}] adopts withCors(req, 'user', ...) at its entrypoint`, () => {
    const source = readFunctionSource(fn);
    const adoptsUserWrapper = source.includes("withCors(req, 'user'") ||
      source.includes('withCors(req, "user"');
    assertEquals(adoptsUserWrapper, true);
  });

  Deno.test(`CORS-05 [${fn}] routes OPTIONS through the shared helper`, () => {
    const source = readFunctionSource(fn);
    const routesThroughSharedHelper = source.includes("handleOptionsRequest") ||
      source.includes("withCors");
    assertEquals(routesThroughSharedHelper, true);
  });

  Deno.test(`CORS-05 [${fn}] contains no hardcoded Access-Control-Allow-Origin literal`, () => {
    const source = readFunctionSource(fn);
    // A hand-rolled ACAO literal in a function entrypoint is exactly the drift this guard
    // forbids; the centralized contract emits ACAO only from _shared/cors.ts.
    assertEquals(source.includes("Access-Control-Allow-Origin"), false);
  });
}
