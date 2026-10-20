---
phase: 27-cutover-safety-net
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/functions/stripe-webhook/index.ts
  - supabase/functions/stripe-webhook/index.test.ts
  - supabase/functions/stripe-webhook/price-resolver.ts
  - supabase/functions/stripe-webhook/price-resolver.test.ts
  - supabase/functions/stripe-webhook/DEPLOY_RUNBOOK.md
  - scripts/run-edge-tests.ps1
autonomous: true
requirements: []
gap_closure: true
must_haves:
  truths:
    - "POST to /functions/v1/stripe-webhook returns HTTP 410 with body containing error='endpoint_deprecated', use='/functions/v1/stripe-webhook-handler', and a non-empty req_id."
    - "Every misrouted POST emits a structured warn log line with msg='legacy_endpoint_hit', fn='stripe-webhook', and matching req_id, ua, sig_present fields."
    - "OPTIONS preflight to the legacy endpoint returns HTTP 200 (handleOptionsRequest webhook policy)."
    - "GET / non-POST methods return HTTP 405 with body { error: 'method_not_allowed' }."
    - "The shim never reads STRIPE_WEBHOOK_SECRET and never calls stripe.webhooks.constructEventAsync (D-01 blanket-reject)."
    - "The shim never inserts into stripe_webhook_events (D-02 logging only)."
    - "The deleted price-resolver.test.ts is removed from scripts/run-edge-tests.ps1 explicit registration list (RESEARCH R1) so the test harness does not fail with path-not-found."
    - "The shim test file is registered in scripts/run-edge-tests.ps1 and passes via deno test."
    - "supabase/functions/stripe-webhook/DEPLOY_RUNBOOK.md is replaced with a deprecation notice pointing at stripe-webhook-handler/ and 21-CUTOVER-NOTES.md (D-18)."
    - "The orphan files price-resolver.ts, price-resolver.test.ts, and the old fixture-driven index.test.ts are deleted; no remaining file in supabase/functions/ imports './price-resolver' from stripe-webhook/."
  artifacts:
    - path: "supabase/functions/stripe-webhook/index.ts"
      provides: "410-Gone shim for misrouted Stripe webhooks"
      exports: ["handleStripeWebhook"]
      contains: "endpoint_deprecated"
    - path: "supabase/functions/stripe-webhook/index.test.ts"
      provides: "Deno unit tests for shim (POST 410, OPTIONS 200, GET 405)"
      contains: "legacy webhook shim"
    - path: "supabase/functions/stripe-webhook/DEPLOY_RUNBOOK.md"
      provides: "Deprecation notice pointing at the active handler"
      contains: "DEPRECATED"
    - path: "scripts/run-edge-tests.ps1"
      provides: "Updated explicit test registration list (price-resolver entry removed)"
  key_links:
    - from: "supabase/functions/stripe-webhook/index.ts"
      to: "supabase/functions/_shared/cors.ts"
      via: "handleOptionsRequest({ type: 'webhook' })"
      pattern: "handleOptionsRequest"
    - from: "supabase/functions/stripe-webhook/index.ts"
      to: "supabase/functions/_shared/logger.ts"
      via: "createLogger('stripe-webhook') -> log.warn('legacy_endpoint_hit', ...)"
      pattern: "createLogger\\(['\"]stripe-webhook['\"]\\)"
    - from: "scripts/run-edge-tests.ps1"
      to: "supabase/functions/stripe-webhook/index.test.ts"
      via: "explicit deno test registration line"
      pattern: "stripe-webhook/index.test.ts"
---

<objective>
Replace the legacy Phase 07 Stripe webhook handler at `supabase/functions/stripe-webhook/` with a 410-Gone shim so misrouted Stripe traffic fails loud instead of silently 200-ignoring. Closes Phase 27 SC-1.

Purpose: Prevent the silent-success failure mode flagged in `.planning/v2.0-MILESTONE-AUDIT.md` concern #1. Two `stripe-webhook` deployments currently coexist; if Stripe's dashboard URL is mis-pinned at the legacy path, merit grants and tier syncs would silently disappear. The shim makes that condition observable (410 in Stripe's delivery dashboard, structured warn in Supabase logs).

Output:
- New ~30-line `supabase/functions/stripe-webhook/index.ts` shim (POST → 410, OPTIONS → 200, other → 405).
- New ~50-line `index.test.ts` with three Deno tests covering the three method branches.
- Three deleted files (`price-resolver.ts`, `price-resolver.test.ts`, the old `index.test.ts` is overwritten — see Task 4).
- Replacement `DEPLOY_RUNBOOK.md` (~10 lines, deprecation notice).
- Updated `scripts/run-edge-tests.ps1` (price-resolver test registration line deleted).
</objective>

<execution_context>
@C:/Projects/strive-ai-hired/.claude/get-shit-done/workflows/execute-plan.md
@C:/Projects/strive-ai-hired/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@C:/Projects/strive-ai-hired/CLAUDE.md
@.planning/phases/27-cutover-safety-net/27-CONTEXT.md
@.planning/phases/27-cutover-safety-net/27-RESEARCH.md
@.planning/ROADMAP.md
@supabase/functions/stripe-webhook/index.ts
@supabase/functions/_shared/cors.ts
@supabase/functions/_shared/logger.ts
@scripts/run-edge-tests.ps1

<interfaces>
<!-- Verified contracts the executor must reuse exactly. No exploration needed. -->

From `supabase/functions/_shared/cors.ts`:
```typescript
export type CorsType = 'user' | 'internal' | 'webhook';
export function handleOptionsRequest(opts: { type: CorsType; extraHeaders?: string }): Response;
// For type: 'webhook' returns: new Response(null, { headers: {} }) — HTTP 200, empty body, no CORS headers.
```

From `supabase/functions/_shared/logger.ts`:
```typescript
export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  timer(label: string): () => number;
}
export function createLogger(functionName: string, requestId?: string): Logger;
// Emits JSON: { level, ts, msg, fn, ...data }. warn/error → console.error; info/debug → console.log.
```

`crypto.randomUUID()` — Deno built-in (no import). Returns RFC 4122 v4 UUID string.

Required shim response body shape (locked by SC-1 + D-03):
```json
{
  "error": "endpoint_deprecated",
  "use": "/functions/v1/stripe-webhook-handler",
  "req_id": "<uuid>"
}
```

405 response body shape (locked by D-04):
```json
{ "error": "method_not_allowed" }
```

Required warn log line shape (locked by D-02 + D-03):
```typescript
log.warn('legacy_endpoint_hit', {
  req_id,                                            // crypto.randomUUID()
  ua: req.headers.get('user-agent'),                 // string | null
  sig_present: req.headers.has('stripe-signature'),  // boolean
});
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pre-flight cross-import audit (gate before deletion)</name>
  <read_first>
    - supabase/functions/stripe-webhook/index.ts (current Phase 07 handler)
    - supabase/functions/stripe-webhook-handler/index.ts (active handler — verify it imports from `_shared/price-resolver`, NOT `stripe-webhook/price-resolver`)
  </read_first>
  <behavior>
    - Verify zero external imports of `stripe-webhook/price-resolver.ts` exist anywhere under `supabase/`.
    - Verify the active handler imports `resolveTier` from `../_shared/price-resolver.ts` (the pre-extracted shared module — different file).
    - Verify the test-helpers `_shared/test-helpers/stripe-fixtures.ts` and `_shared/test-helpers/stripe-signature.ts` are still imported by `stripe-webhook-handler/index.test.ts` (these MUST NOT be deleted).
  </behavior>
  <action>
    Run these grep commands and confirm the exact expected results before proceeding to subsequent tasks.

    1. Audit cross-imports of the orphan price-resolver:
       ```bash
       grep -rln "from ['\"][.][.]?/stripe-webhook/price-resolver" supabase/
       grep -rln "stripe-webhook/price-resolver" supabase/
       ```
       Expected: ONLY matches inside `supabase/functions/stripe-webhook/` itself (i.e., `index.ts:28` and `price-resolver.test.ts`). Zero external matches. If ANY external match is found, STOP and report — D-06 deletion is unsafe and the planner must move the file to `_shared/` first.

    2. Confirm active handler uses the shared module (NOT the orphan):
       ```bash
       grep -n "price-resolver" supabase/functions/stripe-webhook-handler/index.ts
       ```
       Expected: a line referencing `../_shared/price-resolver.ts` (or `../_shared/price-resolver`). If the path references `../stripe-webhook/price-resolver`, STOP — the planner's assumption is wrong.

    3. Confirm test helpers survive:
       ```bash
       grep -rln "stripe-fixtures\|stripe-signature" supabase/functions/
       ```
       Expected: matches in `supabase/functions/stripe-webhook-handler/index.test.ts` and the helpers themselves. Helpers must remain untouched.

    Do NOT delete any file in this task. Pure read-only verification gate. Print a summary line such as "Audit clean — orphan deletions safe" and continue.
  </action>
  <verify>
    <automated>grep -rln "stripe-webhook/price-resolver" supabase/ | grep -v "supabase/functions/stripe-webhook/" ; test $? -ne 0 || echo "FAIL: external import found"</automated>
  </verify>
  <acceptance_criteria>
    - grep shows zero matches for `stripe-webhook/price-resolver` outside the `stripe-webhook/` directory.
    - `supabase/functions/stripe-webhook-handler/index.ts` line 38 imports `resolveTier` from `../_shared/price-resolver.ts` (verbatim path).
    - `_shared/test-helpers/stripe-fixtures.ts` and `_shared/test-helpers/stripe-signature.ts` files exist and are referenced by `stripe-webhook-handler/index.test.ts`.
  </acceptance_criteria>
  <done>Audit summary printed; no files modified; subsequent deletion tasks unblocked.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Write 410-Gone shim tests (RED)</name>
  <read_first>
    - supabase/functions/stripe-webhook/index.test.ts (existing Phase 07 fixture-driven test — being overwritten)
    - supabase/functions/_shared/cors.ts (verify handleOptionsRequest webhook return shape: status 200, empty body)
    - supabase/functions/_shared/logger.ts (verify warn log JSON shape)
    - supabase/functions/stripe-webhook-handler/index.test.ts (reference for Deno test conventions, std@0.224.0/assert/mod.ts import style)
  </read_first>
  <behavior>
    Three Deno tests, each instantiating a Request and asserting on the Response from `handleStripeWebhook(req)` (exported from `./index.ts`):

    - Test 1 — POST returns 410 with deprecation body:
      - Request: method=POST, url=https://example.test/stripe-webhook, headers `{ "stripe-signature": "t=1,v1=abc", "user-agent": "Stripe/1.0" }`, body `'{"any":"json"}'`.
      - Asserts: `res.status === 410`; body is JSON with `error === "endpoint_deprecated"`, `use === "/functions/v1/stripe-webhook-handler"`, `typeof body.req_id === "string"`, `body.req_id.length > 0`.

    - Test 2 — OPTIONS returns 200 (handleOptionsRequest webhook policy):
      - Request: method=OPTIONS.
      - Asserts: `res.status === 200`. (No body assertion — webhook OPTIONS returns null body per `handleOptionsRequest`.)

    - Test 3 — GET returns 405 method_not_allowed:
      - Request: method=GET.
      - Asserts: `res.status === 405`; body JSON has `error === "method_not_allowed"`.

    Skip the warn-log assertion (D-05 (c)) per RESEARCH §Test Strategy — the single hard-coded log.warn line is covered by visual review and the shim's small surface area; capturing console.error adds brittle setup for low-value coverage. **Variance from D-05:** D-05(c) (warn-log capture) is intentionally omitted per RESEARCH §Test Strategy — visual review covers the hard-coded warn line in this 30-line shim. This variance will be recorded in 27-SUMMARY.md at execute-phase finalization.
  </behavior>
  <action>
    OVERWRITE `supabase/functions/stripe-webhook/index.test.ts` (the existing 4-test Phase 07 fixture file is obsolete; this single Write replaces it entirely — no separate delete needed). Use this exact content:

    ```typescript
    /**
     * Phase 27 SC-1 — 410-Gone shim unit tests.
     * Replaces the deleted Phase 07 fixture-driven tests.
     */
    import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
    import { handleStripeWebhook } from "./index.ts";

    Deno.test("legacy webhook shim: POST returns 410 with deprecation body", async () => {
      const req = new Request("https://example.test/stripe-webhook", {
        method: "POST",
        headers: {
          "stripe-signature": "t=1,v1=abc",
          "user-agent": "Stripe/1.0",
        },
        body: '{"any":"json"}',
      });
      const res = await handleStripeWebhook(req);
      assertEquals(res.status, 410);
      const body = await res.json();
      assertEquals(body.error, "endpoint_deprecated");
      assertEquals(body.use, "/functions/v1/stripe-webhook-handler");
      assert(typeof body.req_id === "string" && body.req_id.length > 0);
    });

    Deno.test("legacy webhook shim: OPTIONS returns 200", async () => {
      const req = new Request("https://example.test/stripe-webhook", { method: "OPTIONS" });
      const res = await handleStripeWebhook(req);
      assertEquals(res.status, 200);
    });

    Deno.test("legacy webhook shim: GET returns 405 method_not_allowed", async () => {
      const req = new Request("https://example.test/stripe-webhook", { method: "GET" });
      const res = await handleStripeWebhook(req);
      assertEquals(res.status, 405);
      const body = await res.json();
      assertEquals(body.error, "method_not_allowed");
    });
    ```

    Then run the test file. The current `index.ts` is the Phase 07 handler — these tests MUST FAIL right now (the response shapes don't match). RED state confirmed = proceed to Task 3.

    Do NOT modify `index.ts` in this task. Tests-before-code per TDD.
  </action>
  <verify>
    <automated>cd supabase/functions && deno test --no-check --allow-all stripe-webhook/index.test.ts ; test $? -ne 0 && echo "RED OK (tests failed as expected)"</automated>
  </verify>
  <acceptance_criteria>
    - File `supabase/functions/stripe-webhook/index.test.ts` exists with exactly the three Deno.test blocks above.
    - File imports from `https://deno.land/std@0.224.0/assert/mod.ts` (matches `stripe-webhook-handler/index.test.ts` convention).
    - File imports `handleStripeWebhook` from `./index.ts` (named export).
    - Running `deno test --no-check --allow-all stripe-webhook/index.test.ts` from `supabase/functions/` exits non-zero (RED state — old handler does not satisfy new contract).
    - File contains zero references to `stripe-fixtures`, `stripe-signature`, or `STRIPE_WEBHOOK_SECRET` (orphan-helper independence).
  </acceptance_criteria>
  <done>Test file in place; running it fails against old `index.ts`; RED gate satisfied.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Replace index.ts with the 410-Gone shim (GREEN)</name>
  <read_first>
    - supabase/functions/stripe-webhook/index.test.ts (the new test file from Task 2 — this is the contract)
    - supabase/functions/_shared/cors.ts (handleOptionsRequest signature)
    - supabase/functions/_shared/logger.ts (createLogger signature)
    - supabase/functions/stripe-webhook/index.ts (current Phase 07 handler — being fully replaced)
  </read_first>
  <behavior>
    The shim exports `handleStripeWebhook(req: Request): Promise<Response>` (signature compatible with the deleted Phase 07 export so `index.test.ts` resolves it). It MUST:

    - For OPTIONS: delegate to `handleOptionsRequest({ type: 'webhook' })` and return its Response (HTTP 200, empty body, no CORS headers).
    - For non-POST (GET, PUT, DELETE, etc.): return `new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })`.
    - For POST:
        1. Generate `const req_id = crypto.randomUUID();`
        2. Call `log.warn('legacy_endpoint_hit', { req_id, ua: req.headers.get('user-agent'), sig_present: req.headers.has('stripe-signature') });`
        3. Return `new Response(JSON.stringify({ error: 'endpoint_deprecated', use: '/functions/v1/stripe-webhook-handler', req_id }), { status: 410, headers: { 'Content-Type': 'application/json' } });`
        4. NEVER call `req.text()`, `req.json()`, or read the request body in any way (D-01 / threat-model: no body parsing = no parser-bug DoS surface).
        5. NEVER reference `STRIPE_WEBHOOK_SECRET`, `Stripe`, `getStripeClient`, `getServiceClient`, `stripe_webhook_events`, or any other Phase 07 dependency.

    The shim also calls `Deno.serve` (or `serve`) at module top-level so the function actually responds in production — match whatever invocation pattern the existing Phase 07 `index.ts` uses (it currently exports `handleStripeWebhook` AND has a `Deno.serve(handleStripeWebhook)` at the bottom; preserve that bootstrap so the deployed function still serves requests).
  </behavior>
  <action>
    OVERWRITE `supabase/functions/stripe-webhook/index.ts` with this exact content:

    ```typescript
    /**
     * Stripe webhook 410-Gone shim (Phase 27 SC-1).
     *
     * The active webhook handler lives at `supabase/functions/stripe-webhook-handler/`.
     * This function exists only to make legacy Stripe dashboard URLs ending in
     * `/functions/v1/stripe-webhook` fail loud (HTTP 410 + structured warn log)
     * instead of silently 200-ignoring misrouted traffic.
     *
     * Decisions (see .planning/phases/27-cutover-safety-net/27-CONTEXT.md):
     *   D-01: Blanket-reject. No signature verify, no STRIPE_WEBHOOK_SECRET read.
     *   D-02: Logging only. No DB writes (no stripe_webhook_events insert).
     *   D-03: req_id from crypto.randomUUID() in BOTH log and response body.
     *   D-04: OPTIONS -> handleOptionsRequest({ type: 'webhook' }); non-POST -> 405.
     *
     * Background: .planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md
     */
    import { handleOptionsRequest } from "../_shared/cors.ts";
    import { createLogger } from "../_shared/logger.ts";

    export async function handleStripeWebhook(req: Request): Promise<Response> {
      if (req.method === "OPTIONS") {
        return handleOptionsRequest({ type: "webhook" });
      }
      if (req.method !== "POST") {
        return new Response(JSON.stringify({ error: "method_not_allowed" }), {
          status: 405,
          headers: { "Content-Type": "application/json" },
        });
      }

      const log = createLogger("stripe-webhook");
      const req_id = crypto.randomUUID();
      log.warn("legacy_endpoint_hit", {
        req_id,
        ua: req.headers.get("user-agent"),
        sig_present: req.headers.has("stripe-signature"),
      });

      return new Response(
        JSON.stringify({
          error: "endpoint_deprecated",
          use: "/functions/v1/stripe-webhook-handler",
          req_id,
        }),
        {
          status: 410,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    Deno.serve(handleStripeWebhook);
    ```

    Note: the function signature drops the `deps` parameter from the Phase 07 version — the shim has no DB / Stripe SDK to inject. Tests in Task 2 call `handleStripeWebhook(req)` with a single arg, so this is contract-compatible.

    Run the tests after the rewrite. ALL THREE must pass (GREEN state).
  </action>
  <verify>
    <automated>cd supabase/functions && deno test --no-check --allow-all stripe-webhook/index.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `supabase/functions/stripe-webhook/index.ts` matches the body above byte-for-byte (modulo final newline).
    - `grep -n "STRIPE_WEBHOOK_SECRET\|getStripeClient\|getServiceClient\|stripe_webhook_events\|constructEventAsync\|req.text\|req.json" supabase/functions/stripe-webhook/index.ts` returns ZERO matches (security: shim refuses to touch any Phase 07 surface).
    - `grep -n "import .* from \"./price-resolver" supabase/functions/stripe-webhook/index.ts` returns zero matches (orphan dependency removed).
    - `deno test --no-check --allow-all stripe-webhook/index.test.ts` exits 0 with three passing tests.
    - File is under 60 lines total (D-05 / RESEARCH says "30-line shim" — pragmatic ceiling 60 to allow header comment).
  </acceptance_criteria>
  <done>Shim implemented, tests pass, no Phase 07 dependencies survive in the file.</done>
</task>

<task type="auto">
  <name>Task 4: Delete orphaned Phase 07 files (price-resolver + price-resolver.test)</name>
  <read_first>
    - supabase/functions/stripe-webhook/price-resolver.ts (about to delete)
    - supabase/functions/stripe-webhook/price-resolver.test.ts (about to delete)
    - Task 1 audit summary (must show clean — re-read scrollback if uncertain)
  </read_first>
  <action>
    Re-run the cross-import grep one more time as a guard (Task 1 was the planning-time audit; this is the execute-time guard immediately before deletion):

    ```bash
    grep -rln "stripe-webhook/price-resolver" supabase/ | grep -v "supabase/functions/stripe-webhook/"
    ```

    Expected: zero output. If anything appears, STOP and surface a checkpoint to the user — do NOT delete.

    Then delete the two files:
    - `supabase/functions/stripe-webhook/price-resolver.ts`
    - `supabase/functions/stripe-webhook/price-resolver.test.ts`

    Use `git rm` (or platform-equivalent file delete). Do NOT delete:
    - `supabase/functions/_shared/price-resolver.ts` (the shared module used by the active handler)
    - `supabase/functions/_shared/test-helpers/stripe-fixtures.ts`
    - `supabase/functions/_shared/test-helpers/stripe-signature.ts`
    - `supabase/functions/stripe-webhook/DEPLOY_RUNBOOK.md` (handled in Task 6)

    The old Phase 07 `index.test.ts` does NOT need a separate delete — Task 2 already overwrote it with the new shim test content.
  </action>
  <verify>
    <automated>test ! -f supabase/functions/stripe-webhook/price-resolver.ts && test ! -f supabase/functions/stripe-webhook/price-resolver.test.ts && test -f supabase/functions/_shared/price-resolver.ts && test -f supabase/functions/_shared/test-helpers/stripe-fixtures.ts && echo "ok"</automated>
  </verify>
  <acceptance_criteria>
    - `supabase/functions/stripe-webhook/price-resolver.ts` does not exist.
    - `supabase/functions/stripe-webhook/price-resolver.test.ts` does not exist.
    - `supabase/functions/_shared/price-resolver.ts` STILL exists (shared module — must NOT be deleted).
    - `supabase/functions/_shared/test-helpers/stripe-fixtures.ts` STILL exists.
    - `supabase/functions/_shared/test-helpers/stripe-signature.ts` STILL exists.
    - `supabase/functions/stripe-webhook-handler/index.test.ts` STILL exists and is unmodified.
  </acceptance_criteria>
  <done>Two orphan files removed; shared modules and unrelated handler intact.</done>
</task>

<task type="auto">
  <name>Task 5: Update scripts/run-edge-tests.ps1 — remove price-resolver registration (RESEARCH R1)</name>
  <read_first>
    - scripts/run-edge-tests.ps1 (the explicit test list — NOT a glob; CONTEXT.md "tests slot in automatically" wording is wrong)
  </read_first>
  <action>
    The test harness uses a hand-maintained, line-by-line list of test paths. Two consecutive lines reference `stripe-webhook/`:

    ```powershell
    stripe-webhook/price-resolver.test.ts `
    stripe-webhook/index.test.ts `
    ```

    Edit `scripts/run-edge-tests.ps1` and DELETE the entire line containing `stripe-webhook/price-resolver.test.ts` (including the trailing backtick continuation). KEEP the `stripe-webhook/index.test.ts` line — the new shim test file lives at the same path and slots in transparently.

    After the edit, the surrounding region should read:

    ```powershell
    _shared/merit-gateway.raw.test.ts `
    stripe-webhook/index.test.ts `
    create-checkout-session/index.test.ts `
    ```

    Verify the file has no other reference to `price-resolver.test.ts` anywhere (the `_shared/price-resolver.test.ts` does NOT currently appear in this script — do not add it; out of scope).

    Then run the full edge-tests harness to confirm CI compatibility:

    ```powershell
    .\scripts\run-edge-tests.ps1
    ```

    The harness must exit 0. The shim's three tests must appear in the output. NO test must fail with `Path does not exist: ... price-resolver.test.ts`.
  </action>
  <verify>
    <automated>grep -c "stripe-webhook/price-resolver.test.ts" scripts/run-edge-tests.ps1 ; test $? -ne 0 || (grep -c "stripe-webhook/price-resolver.test.ts" scripts/run-edge-tests.ps1 | grep -q "^0$") && grep -q "stripe-webhook/index.test.ts" scripts/run-edge-tests.ps1 && echo "ok"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "stripe-webhook/price-resolver" scripts/run-edge-tests.ps1` returns zero matches.
    - `grep -n "stripe-webhook/index.test.ts" scripts/run-edge-tests.ps1` returns exactly one match (the registration line).
    - `.\scripts\run-edge-tests.ps1` exits 0.
    - Harness output shows the three new shim test names (POST 410 / OPTIONS 200 / GET 405).
  </acceptance_criteria>
  <done>Registration list reflects the shipped file set; full edge-test harness passes.</done>
</task>

<task type="auto">
  <name>Task 6: Replace DEPLOY_RUNBOOK.md with deprecation notice (D-18)</name>
  <read_first>
    - supabase/functions/stripe-webhook/DEPLOY_RUNBOOK.md (current 232-line Phase 07 deploy notes — fully obsolete)
  </read_first>
  <action>
    OVERWRITE `supabase/functions/stripe-webhook/DEPLOY_RUNBOOK.md` with this exact content:

    ```markdown
    # DEPRECATED — `stripe-webhook` is now a 410-Gone shim

    The active Stripe webhook handler is `supabase/functions/stripe-webhook-handler/`.

    The Stripe production dashboard endpoint URL **MUST** end in
    `/functions/v1/stripe-webhook-handler` (NOT `/functions/v1/stripe-webhook`).

    This function continues to deploy because Stripe traffic mis-pinned at the
    legacy URL must fail loudly (HTTP 410 + structured `legacy_endpoint_hit` warn
    log) instead of silently 200-ignoring. See Phase 27 SC-1.

    Full background, operator runbook touchpoints, and the planted-seed for
    eventual full removal of this directory live in
    `.planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md`.
    ```

    The replacement file is intentionally short — it is a redirect, not documentation. Phase 07 deploy notes (CLI commands, secret rotation steps, etc.) are obsolete the moment the shim ships and would mislead future operators if preserved alongside the 410 body.
  </action>
  <verify>
    <automated>grep -q "DEPRECATED" supabase/functions/stripe-webhook/DEPLOY_RUNBOOK.md && grep -q "stripe-webhook-handler" supabase/functions/stripe-webhook/DEPLOY_RUNBOOK.md && grep -q "21-CUTOVER-NOTES.md" supabase/functions/stripe-webhook/DEPLOY_RUNBOOK.md && echo "ok"</automated>
  </verify>
  <acceptance_criteria>
    - File starts with `# DEPRECATED` heading.
    - File names the active handler path `supabase/functions/stripe-webhook-handler/`.
    - File names the correct production endpoint URL suffix `/functions/v1/stripe-webhook-handler`.
    - File cross-references `.planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md`.
    - File is under 20 lines.
    - File contains zero references to STR-02, STR-03, STR-04, STR-07, idempotency, secret rotation, or any Phase 07 setup step.
  </acceptance_criteria>
  <done>Old runbook replaced with a forward-pointing deprecation notice.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Stripe servers → 410 shim | Untrusted POST body crosses here, but the shim refuses to read it |
| 410 shim → Supabase log infra | Single warn line carrying req_id, ua, sig_present (boolean) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-27-01 | Tampering / DoS | shim POST handler reads body | mitigate | The shim NEVER calls `req.text()`, `req.json()`, or otherwise consumes the body. Acceptance criterion in Task 3 grep-asserts zero `req.text\|req.json` matches. Eliminates parser-bug / unbounded-body DoS surface. |
| T-27-02 | Information Disclosure | secret in logs | mitigate | The shim NEVER reads `STRIPE_WEBHOOK_SECRET` (D-01). Logged fields are `req_id` (server-generated UUID), `ua` (client-supplied user-agent string), `sig_present` (boolean only — never the signature value). Task 3 grep-asserts zero `STRIPE_WEBHOOK_SECRET` references. |
| T-27-03 | Spoofing | attacker triggers `legacy_endpoint_hit` warn flood | accept | Cost is one log line per request; no DB writes (D-02), no downstream side effects. Mitigated by Supabase platform rate limiting at the edge runtime layer. Logging the spoofed traffic IS the intended forensic value. |
| T-27-04 | Repudiation | misroute event has no audit trail | mitigate | `req_id` is generated via `crypto.randomUUID()` and returned in BOTH the 410 response body AND the warn log, allowing operators to correlate Stripe's delivery dashboard against Supabase logs. |
| T-27-05 | Elevation of Privilege | shim accepts auth tokens | accept | The shim's per-function `verify_jwt = false` config (already set in `supabase/config.toml:93`) is correct — Stripe webhooks never carry JWTs. Shim ignores all headers except `user-agent` and `stripe-signature` (logged as boolean only). No new auth surface. |
</threat_model>

<verification>
- All three Deno tests in `supabase/functions/stripe-webhook/index.test.ts` pass.
- `.\scripts\run-edge-tests.ps1` exits 0 (full edge-test harness, not just shim tests).
- Grep-asserts in each task's acceptance_criteria all return the documented results.
- File-existence guards hold: deleted files gone, shared modules and unrelated handler intact.
</verification>

<success_criteria>
- POST `/functions/v1/stripe-webhook` returns HTTP 410 with `{error, use, req_id}` body and emits exactly one `legacy_endpoint_hit` warn log per request — verified by Tests 1 and visual log inspection.
- OPTIONS returns 200; GET / non-POST returns 405 with `{error: 'method_not_allowed'}` — verified by Tests 2 and 3.
- The shim file references no Phase 07 dependencies (Stripe SDK, service client, DB tables, secrets) — grep-verified.
- Test harness registration is consistent with the on-disk file set — `run-edge-tests.ps1` runs clean.
- DEPLOY_RUNBOOK.md is a forward-pointing deprecation notice, not stale Phase 07 content.
</success_criteria>

<output>
After completion, create `.planning/phases/27-cutover-safety-net/27-01-stripe-webhook-410-shim-SUMMARY.md` documenting:
- Files added / modified / deleted (with line counts).
- Cross-import audit result (Task 1).
- Confirmation that orphan helpers (`_shared/test-helpers/*`) survived.
- `run-edge-tests.ps1` registration delta.
- Test pass/fail summary from final `run-edge-tests.ps1` run.
</output>
