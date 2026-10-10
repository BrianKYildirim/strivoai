# Phase 2: Security Audit & Remediation - Pattern Map

**Mapped:** 2026-07-01
**Files analyzed:** 13 (3 targeted source fixes + 1 config edit + 6 new guard tests + 3 audit/record docs)
**Analogs found:** 13 / 13

> This is a **security audit + remediation** phase. Most "new files" are (a) automated guard
> TESTS that fold into `verify:baseline`, (b) audit/record DOCS, and (c) three surgical source
> edits at named seams. There is almost no greenfield build surface — nearly every file has an
> **exact in-repo analog** to copy from. The three source fixes are **self-modifications** (the
> analog IS the file being edited), so the "pattern" is the byte-identical block to change plus
> the adjacent block to preserve.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/functions/_shared/merit-gateway.ts` (MODIFY, Fix 1) | service (shared billing gateway) | request-response / billing-integrity | itself L201-234 + `merit-idempotency.test.ts` (4-arg RPC contract) | exact (self-modify) |
| `supabase/functions/grade-linkedin/index.ts` (MODIFY, Fix 2) | controller (edge-function handler) | request-response / billing-integrity | itself L459-462 (legit pre-save throw = the KEEP analog) | exact (self-modify) |
| `supabase/functions/paddle-webhook/index.ts` (MODIFY, Fix 3) | controller (webhook handler) | event-driven / webhook | itself L12-59, L105-114 + `_shared/cors.ts` `jsonError` + `_shared/auth.ts` reason-code logging | exact (self) + role-match (non-leaky error) |
| `supabase/functions/deno.json` (MODIFY, register guards) | config | n/a | itself (the `test:ci` allowlist tail; `cors-audit.test.ts` is the last-registered precedent) | exact (self) |
| Merit idempotency guard `.test.ts` (NEW, Fix 1) | test | runtime (Class A, gated-remote) | `_shared/merit-idempotency.test.ts` | exact |
| grade-linkedin refund-after-save guard `.test.ts` (NEW, Fix 2) | test | static-source (Class B) — isolation-safe | `grade-linkedin/free-scan.test.ts` + `grade-linkedin/handler-config.test.ts` | exact |
| Paddle webhook replay/leak guard `.test.ts` (NEW, Fix 3) | test | runtime (Class A, pure HMAC+timestamp) | `paddle-webhook/index.ts` `verifySignature` (signing helper) + `cors-audit.test.ts` (negative leak assert) | role-match |
| Prompt-sanitizer coverage guard `.test.ts` (NEW, SEC-07) | test | static-source (Class B) | `_shared/cors-audit.test.ts` (table-driven per-function `source.includes`) | exact |
| No-secret-leak / fail-closed-env static guard `.test.ts` (NEW, D-05) | test | static-source (Class B) | `_shared/cors-audit.test.ts` (negative literal assert) | role-match |
| Frontend XSS `dangerouslySetInnerHTML` guard `.test.ts` (NEW, SEC-04) | test | static-source (Class B, vitest) | `src/pages/__tests__/pricing-token-guard.test.ts` | exact |
| `SECURITY-AUDIT.md` 17-domain catalog (NEW, SEC-12) | doc | n/a | `.planning/audit/INDEX.md` + per-domain doc structure | exact |
| SEC-15 final security record (NEW, SEC-15) | doc | n/a | `.planning/audit/RESIDUAL-REGISTER.md` + INDEX Verdict/Status | role-match |
| RESIDUAL-REGISTER / KEEP-LIST append (MODIFY, D-01/D-04) | doc | n/a | `.planning/audit/RESIDUAL-REGISTER.md` (append-only entry shape) | exact |

**Data-flow legend:** *billing-integrity* = money-path (→ `autonomous:false` operator checkpoint);
*runtime* = Class A guard that drives the handler/RPC with malicious/duplicate/stale input;
*static-source* = Class B guard that reads `index.ts` as text and asserts on its contents
(the `cors-audit.test.ts` precedent for facts that can't be exercised at runtime).

---

## Pattern Assignments

### `supabase/functions/_shared/merit-gateway.ts` (service, billing-integrity) — Fix 1

**Analog:** itself (self-modify). The exact block to change is the 3-named-arg RPC call; the
post-success log block must be made null-safe for the `already_deducted` branch.

**The vulnerable block to change** (`merit-gateway.ts:198-205`) — `p_idempotency_key` is never
passed, so it defaults NULL and the partial-unique index never engages:
```ts
  // [2] check_and_deduct_merits (Phase 11 RPC)
  const supabase = getServiceClient();
  const t0 = Date.now();
  const { data, error } = await supabase.rpc('check_and_deduct_merits', {
    p_user_id: ctx.userId,
    p_feature: feature,
    p_tier: ctx.tier,
  });
```
Forward a 4th named arg `p_idempotency_key` sourced from a new optional field (recommend a field
on `MeritGatewayContext` at L84-88, or a `MeritGatewayOptions` field at L116-118 — coordinate the
signature with Phase 3 plan 03-02 so it EXTENDS this, never replaces it).

**The 4-arg RPC contract to satisfy** (from `merit-idempotency.test.ts:22-29,62-69`) — the happy
path and the idempotency-hit path return DIFFERENT shapes:
```ts
// happy path:      { success, transaction_id, remaining_balance, deducted_from }
// idempotency hit: { success: true, transaction_id, already_deducted: true }   (NO remaining_balance / deducted_from)
```

**The post-success log block to make null-safe** (`merit-gateway.ts:226-234`) — it currently reads
`deducted_from`/`remaining_balance` which are `undefined` on the `already_deducted` branch:
```ts
  // [3] NFR-09 transaction log — AFTER RPC success, never before (D-12)
  log.info('merit-transaction', {
    user_id: ctx.userId,
    feature,
    transaction_id: transactionId,
    deducted_from: (data as any).deducted_from,        // undefined when already_deducted
    remaining_balance: (data as any).remaining_balance, // undefined when already_deducted
    rpc_duration_ms: rpcMs,
  });
```
Add an `already_deducted` branch (or `?? null` guards) so the log stays structured on replay.

**Scope boundary (do not exceed):** wire the gateway *capability* + prove it with a guard driving
`withMerits` directly with a repeated key. Per-feature key *derivation* + frontend threading is
Phase 3. **Money path → `autonomous:false` operator checkpoint** (v4.0 Ph7.1 precedent).

---

### `supabase/functions/grade-linkedin/index.ts` (controller, billing-integrity) — Fix 2

**Analog:** itself (self-modify). The **legitimate pre-save throw** is the KEEP analog — do NOT
touch it; the two post-save throws are the ones to convert to log-and-continue.

**KEEP analog — legitimate pre-save throw** (`grade-linkedin/index.ts:459-462`, inside
`storeAndNotify` before the row is durable):
```ts
    if (insertError || !record?.id) {
      log.error('db-insert-failed', { error: String(insertError?.message || 'missing id') });
      throw new MeritRefundable(500, 'Could not save LinkedIn grade history.');
    }
```
This throw is correct (nothing saved yet → a refund is right). **Preserve byte-identical.**

**Fix site A — merit-path refund-after-save** (`grade-linkedin/index.ts:554-559`, INSIDE the
`withMerits` callback → currently refunds a Merit for an already-saved+emailed analysis):
```ts
            const stored = await storeAndNotify(result.parsed);
            const usageResult = await recordUsageWithAnalysis(userId, 'linkedin_grading', 1, stored.recordId);
            if (!usageResult.ok) {
              log.error('usage-tracking-insert-failed', { error: usageResult.error });
              throw new MeritRefundable(500, 'Could not record LinkedIn grade usage.');  // ← convert to log-and-continue
            }
```

**Fix site B — free-path hidden-success 500** (`grade-linkedin/index.ts:518-522`, NOT inside
`withMerits` so no refund, but still reports a saved+emailed analysis as a 500):
```ts
        const usageResult = await recordUsageWithAnalysis(userId, 'linkedin_grading', 0, stored.recordId);
        if (!usageResult.ok) {
          log.error('usage-tracking-insert-failed', { error: usageResult.error });
          throw new MeritRefundable(500, 'Could not record LinkedIn grade usage.');  // ← convert to log-and-continue
        }
```

**Fix at both sites:** replace `throw new MeritRefundable(...)` with a `log.warn/error(...)` and
**fall through to `return stored.response`** (the durable result already exists). The existing
comment two lines above each site already says "Non-blocking — a failed insert logs but does NOT
fail the user request" (L517, L552-553) — the code just contradicts it. Note both sites reuse the
existing `log.error('usage-tracking-insert-failed', ...)` reason-code line (KEEP it; only the
`throw` becomes a continue). **Money path → `autonomous:false` operator checkpoint.**

---

### `supabase/functions/paddle-webhook/index.ts` (controller, webhook) — Fix 3

**Analog:** itself for the signing/dedup mechanics; `_shared/cors.ts` `jsonError` + `_shared/auth.ts`
reason-code logging for the non-leaky error contract.

**Signing helper to preserve (and mirror in the guard)** (`paddle-webhook/index.ts:12-54`) — HMAC
over `${ts}:${payload}`, `timingSafeEqual`, length-guarded. Correct; keep:
```ts
    const ts = tsMatch.replace("ts=", "");
    const h1 = h1Match.replace("h1=", "");
    const signedPayload = `${ts}:${payload}`;
    // ... HMAC-SHA256 importKey + sign ...
    if (computedBytes.length !== h1Bytes.length) return false;
    return timingSafeEqual(computedBytes, h1Bytes);
```

**GAP to fix — `ts` parsed but never freshness-checked** (`ts` extracted at L24, used only for the
signed payload). Add a replay-window bound (reject if `|now - ts|` exceeds ~5 min, the Paddle
pattern) BEFORE or alongside signature verify, keeping the existing `event_id` dedup at L151-171.

**Config-leak to fix — 500 body names the env var** (`paddle-webhook/index.ts:105-114`):
```ts
    if (!webhookSecret) {
      console.error("PADDLE_WEBHOOK_SECRET not configured");
      return new Response(JSON.stringify({
        error: "webhook_secret_not_configured",
        message: "PADDLE_WEBHOOK_SECRET environment variable is not set"  // ← leaks config/env-name
      }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
```

**Non-leaky-error analog to copy** — `_shared/cors.ts` `jsonError` (L202-216) is the generic,
frontend-readable envelope; note that a webhook endpoint stays CORS-less (`type: 'webhook'` → `{}`),
so keep the plain `{ "Content-Type": "application/json" }` header shape but strip the env-name from
the body. And `_shared/auth.ts` (L143-152) is the reason-code discipline for the missing/misconfigured
secret path — log a reason code, never the secret or its env-name in the response body:
```ts
  // auth.ts pattern: reason code to logs, generic body to caller
  log.error('auth-failure', { reason: 'secret-not-configured', type: 'internal' });
  throw unauthorizedResponse(req, 'internal');   // body stays { error: 'Unauthorized' } — no detail leak
```

**Fix:** add the timestamp replay-window; make missing-secret + invalid-signature responses generic
(no env-name / config disclosure), keeping the reason code in the log only. Do NOT remove Paddle
(Phase 8 owns the expiration gate). `type:'webhook'` `{}` CORS stays.

---

### `supabase/functions/deno.json` (config) — register every new guard

**Analog:** itself. Each new edge/deno guard appends its `*.test.ts` path to the single
`test:ci` task string (L5), exactly how `cors-audit.test.ts` registered as the tail entry:
```
... interview-prep-evaluate/__tests__/evaluate.question-order-join.test.ts compare-jobs/auth-rethrow.test.ts _shared/cors-audit.test.ts"
```
Append the Fix-1/Fix-2/Fix-3 guards + the prompt-sanitizer/secret-leak static guards to this
whitespace-separated list → they enter `verify:baseline` via `npm run test:edge`
(`deno task test:ci`). Frontend (vitest) guards need NO registration — vitest auto-discovers
`src/**/*.test.ts` and enters via `npm run test`.

---

## Shared Patterns

### Class-B static-source guard skeleton (the `cors-audit.test.ts` precedent)
**Source:** `supabase/functions/_shared/cors-audit.test.ts`
**Apply to:** prompt-sanitizer coverage guard, no-secret-leak guard, any config-drift assertion
where a runtime test is impractical (D-05).

The load-bearing idioms — Windows path fix + table-driven per-function assertion + a length guard
so a NEW function fails until enrolled:
```ts
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';

function readFunctionSource(fn: string): string {
  // On Windows, import.meta.url pathname begins with /C:/... which Deno cannot open.
  const rawPath = new URL(`../${fn}/index.ts`, import.meta.url).pathname;
  const indexPath = rawPath.startsWith('/') && rawPath[2] === ':' ? rawPath.slice(1) : rawPath;
  return Deno.readTextFileSync(indexPath);
}

// Length guard — fails when a new function is added until it is enrolled in the audit.
Deno.test('SEC-07 audit covers exactly N AI text-ingesting functions', () => {
  assertEquals(AI_INGESTERS.length, N);
});

for (const fn of AI_INGESTERS) {
  Deno.test(`SEC-07 [${fn}] sanitizes user content before Anthropic`, () => {
    const source = readFunctionSource(fn);
    assertEquals(source.includes('sanitize'), true);   // exact analog of includes("withCors(req, 'user'")
  });
}
```
For the **no-leak** direction, copy the negative assertion form
(`assertEquals(source.includes('Access-Control-Allow-Origin'), false)` at `cors-audit.test.ts:75`) →
e.g. assert the paddle-webhook source body contains no env-name literal.

### Frontend Class-B static guard (vitest twin)
**Source:** `src/pages/__tests__/pricing-token-guard.test.ts`
**Apply to:** the SEC-04 `dangerouslySetInnerHTML` audit (research found exactly ONE sink:
`src/components/ui/chart.tsx:70`, a shadcn CSS-var injection, no user data).
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const FORBIDDEN = [{ label: 'dangerouslySetInnerHTML outside chart.tsx', re: /dangerouslySetInnerHTML/ }];
describe('SEC-04 XSS sink guard', () => {
  for (const { label, re } of FORBIDDEN) {
    it(`no src surface (except the allowlisted chart.tsx CSS-var sink) contains ${label}`, () => {
      const offenders = SURFACES.filter((p) => re.test(readFileSync(p, 'utf8')));
      expect(offenders, `${label}; offenders: ${offenders.join(', ')}`).toEqual([]);
    });
  }
});
```
Allowlist `chart.tsx` explicitly so a NEW sink fails the guard.

### Runtime Class-A guard (gated-remote, money-path)
**Source:** `supabase/functions/_shared/merit-idempotency.test.ts`
**Apply to:** the Fix-1 Merit idempotency guard (drive `withMerits` — not just the raw RPC — with a
repeated key and assert exactly ONE deduction end-to-end).

Copy the skip-guard + fresh-client + provision/teardown scaffold so the test is a no-op in the
default offline run and only exercises live DB when opted in:
```ts
const GATED = () => Deno.env.get("DENO_TEST_SUPABASE_REMOTE") === "1";
Deno.test("... idempotency ...", async () => {
  if (!GATED()) { console.log("[..] SKIP — set DENO_TEST_SUPABASE_REMOTE=1 ..."); return; }
  const userId = await provisionTestUser(STARTING_BALANCE);
  try {
    const first = await callRpc(userId, idempotencyKey);   // for Fix 1, call through withMerits instead
    const second = await callRpc(userId, idempotencyKey);
    assertEquals(second.already_deducted, true);
    assertEquals(await countFeatureDeductRows(userId, idempotencyKey), 1);  // exactly one deduction
  } finally { await teardownTestUser(userId); }
});
```
**Isolation caveat (Pitfall 6):** a handler-importing runtime test can perturb sibling tests in the
shared deno process. For Fix 2 (grade-linkedin) prefer the **static** twin below; keep any perturbing
runtime test off-gate with an in-gate static assertion (the recruiting-lens precedent).

### Static twin for the refund-ordering guard (Fix 2)
**Source:** `grade-linkedin/free-scan.test.ts` + `grade-linkedin/handler-config.test.ts`
**Apply to:** Fix 2. Assert on `index.ts` source that the post-save sites log-and-continue rather
than throw — the same source-string idiom already used across the grade-linkedin test family:
```ts
const source = Deno.readTextFileSync(INDEX_PATH);
// the two post-save usage-write sites must NOT throw MeritRefundable after storeAndNotify
Deno.test('Fix2: merit-path post-save usage failure does not throw MeritRefundable', () => {
  // assert the throw was removed / replaced with a log-and-continue at the post-save site
  // (positive: the fall-through `return stored.response` still present; negative: no post-save throw)
});
```

### Reason-code-not-value logging
**Source:** `supabase/functions/_shared/auth.ts` (L96, L144-151, L167 — `log.warn('auth-failure', { reason: '…' })`)
**Apply to:** Fix 3 (paddle-webhook missing/invalid secret path) and Fix 2 (grade-linkedin
log-and-continue). Secrets/env-names go to the structured log as reason codes, never into a
response body (D-14). This is also the Pitfall-7 discipline for the audit docs (names-only).

### Audit-catalog doc discipline
**Source:** `.planning/audit/INDEX.md` (catalog scaffold: Verdict/Status, Domain→Doc map,
How-to-Re-Run, Cross-References) + per-domain docs + `RESIDUAL-REGISTER.md` (append-only entry
table shape).
**Apply to:** `SECURITY-AUDIT.md` (17-domain catalog: one section per domain, each with a
classified finding-or-clean-confirmation, cross-referencing KEEP-LIST as the `safe`-classification
gate) and the SEC-15 record (scope / findings / severity+impact / remediation / verification /
accepted residual — each completion claim backed by a test ref, advisor evidence, or a reproducible
operator command). Append low-severity + accepted residuals to `RESIDUAL-REGISTER.md` using its
existing field-table row shape (`File / Discovered by / Verdict / Residual signal / Clearance
criterion / Status`).

---

## No Analog Found

None. Every Phase-2 file maps to an existing in-repo analog (the three source fixes are
self-modifications; every guard class and every audit doc has a direct precedent). The planner does
NOT need to fall back to RESEARCH.md reference patterns for structure — RESEARCH.md supplies the
*findings and seams*, and the analogs above supply the *shape*.

---

## Metadata

**Analog search scope:** `supabase/functions/_shared/`, `supabase/functions/grade-linkedin/`,
`supabase/functions/paddle-webhook/`, `supabase/functions/deno.json`, `src/**/__tests__/`,
`.planning/audit/`.
**Files scanned:** ~15 (5 source/config + 4 deno test analogs + 1 vitest analog + 3 audit docs +
glob inventories).
**Read-only constraint honored:** no source file modified; PATTERNS.md is the only file written.
**Pattern extraction date:** 2026-07-01
