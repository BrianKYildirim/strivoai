# Phase 29: Foundation Infrastructure - Pattern Map

**Mapped:** 2026-05-12
**Files analyzed:** 11 (8 new + 3 modified)
**Analogs found:** 11 / 11 (every new/modified file has an exact or strong analog in-tree)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/migrations/<ts>_analysis_cache_table.sql` | migration (table + RLS + index) | DDL | `supabase/migrations/20260414000000_merit_ledger_foundation.sql` (CREATE TABLE + RLS SELECT-own + service-role writes) + `20260420000000_mig_02_analysis_results_readonly.sql` (RLS template) | exact |
| `supabase/migrations/<ts>_resumes_extracted_text.sql` | migration (ALTER ADD COLUMN) | DDL | `supabase/migrations/20260429000000_add_merit_transaction_id_to_analysis_jobs.sql` (nullable additive column on existing table + COMMENT + post-apply verification block in header) | exact |
| `supabase/migrations/<ts>_usage_tracking_analysis_id.sql` | migration (ALTER ADD COLUMN) | DDL | `supabase/migrations/20260429000000_add_merit_transaction_id_to_analysis_jobs.sql` | exact |
| `supabase/migrations/<ts>_merit_transactions_idempotency.sql` | migration (ADD COLUMN + partial UNIQUE + CREATE OR REPLACE RPC + verification block) | DDL + RPC | `supabase/migrations/20260422000000_phase_24_topup.sql` (partial UNIQUE template lines 36-38 + RPC rewrite + verification DO $$ block) + `20260415000000_merit_rpcs.sql` (`check_and_deduct_merits` RPC body to extend with `p_idempotency_key`) | exact |
| `supabase/functions/_shared/cache-fingerprint.ts` | shared helper (pure function) | transform | `supabase/functions/_shared/logger.ts` (named-export utility shape + `createLogger` consumer); browser-side analog `src/pages/Upload.tsx:142-148` for `crypto.subtle.digest('SHA-256', ...)` body | role-match (no SHA-256 helper exists in `_shared/` yet) |
| `supabase/functions/_shared/cache-fingerprint.test.ts` | test (Deno unit) | test | `supabase/functions/_shared/json-repair.test.ts` (pure-function Deno test scaffold) + `supabase/functions/_shared/merit-gateway.test.ts` (named-import test layout, env stubbing) | exact |
| `src/hooks/useIdempotencyKey.ts` | hook (state + `crypto.randomUUID()`) | event-driven | `src/hooks/useCreatePaymentIntent.ts` (named export, `useCallback`, internal state, no shared global) — closest by shape; `src/hooks/useFeatureCosts.ts` for named pure helper colocation | role-match |
| `src/hooks/useIdempotencyKey.test.ts` | test (Vitest hook) | test | `src/hooks/useCreatePaymentIntent.test.ts` (Vitest + `renderHook` + `act`) + `src/hooks/useFeatureCosts.test.ts` (pure-helper Vitest scaffold) | exact |
| `scripts/staging-cache-perf-probe.ps1` (or `.mjs`) | script (perf harness) | request-response | `.ps1` shape → `scripts/sc5-probe.ps1` (synthetic probe with Bearer JWT + evidence file append); `.mjs` shape → `scripts/validate-performance.mjs` (multi-run latency benchmark, p95 measurement) | exact (planner picks PS vs MJS) |
| `supabase/functions/_shared/merit-gateway.ts` (MODIFIED) | shared helper (gateway extension) | request-response | self — backwards-compatible 4th-arg options object. Existing 3-arg call-sites (5 features) unaffected. | exact (self-modify) |
| `supabase/functions/analyze-resume/index.ts` (MODIFIED) | edge handler patch | request-response + waitUntil | self — replace dead `resumeHash` 32-bit fold at `:389-392` with `computeCacheKey({...})` from new helper; persist `extracted_text`/`text_hash` to `resumes` on successful run; mirror existing `EdgeRuntime.waitUntil` pattern at `:1388` (email fire-and-forget) | exact (self-modify) |
| `supabase/functions/ocr-pdf/index.ts` (MODIFIED) | edge handler patch | request-response | self — on successful OCR return path (currently returns `{ text, pageCount }` at `:143-146`), additionally UPDATE `resumes.extracted_text` + `resumes.text_hash` for the active resume row before responding | exact (self-modify) |

## Pattern Assignments

### `supabase/migrations/<ts>_analysis_cache_table.sql` (migration, DDL)

**Analog #1:** `supabase/migrations/20260414000000_merit_ledger_foundation.sql` (table + RLS + service-role-write posture)

**Analog #2:** `supabase/migrations/20260420000000_mig_02_analysis_results_readonly.sql` (RLS SELECT-only template + header style)

**Header / prologue pattern** (from `20260414000000:1-9`):
```sql
-- Phase X · <name> — additive only.
-- Closes <REQ-IDs>.
--
-- CRITICAL: Do NOT add any permissive policy that matches all rows (SEC-06 anti-pattern).
-- Service role bypasses RLS automatically, which is the ONLY legitimate write path to these tables.
```

**CREATE TABLE + service-role-write + SELECT-own RLS pattern** (verbatim style from `20260414000000:14-72`):
```sql
CREATE TABLE IF NOT EXISTS public.<name> (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ...
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.<name> ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS <name>_select_own ON public.<name>;
CREATE POLICY <name>_select_own
  ON public.<name>
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
```

**Critical RLS notes from analogs:**
- `auth.uid() = user_id` is the canonical reference (NOT `auth.jwt() ->> 'sub'`) — verified in `20260415000000:39` and `20260414000000:70-79`.
- `TO authenticated` is the correct role.
- NO `WITH CHECK` clause — there is no INSERT/UPDATE/DELETE policy. Service role bypasses RLS for all writes via `getServiceClient()`.
- `DROP POLICY IF EXISTS ... ; CREATE POLICY ...` makes the migration re-runnable (pattern from `20260420000000:27`).

**UNIQUE index pattern** (from `20260422000000:36-38`):
```sql
CREATE UNIQUE INDEX IF NOT EXISTS analysis_cache_key_unique
  ON public.analysis_cache (cache_key);
```

**Verification DO $$ block** (from `20260422000000:167-196` — copy this style verbatim):
```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'analysis_cache'
      AND column_name  = 'cache_key'
  ) THEN
    RAISE EXCEPTION 'Phase 29 CACHE-01 migration failed: cache_key missing';
  END IF;
  RAISE NOTICE 'Phase 29 CACHE-01 verification passed';
END $$;
```

---

### `supabase/migrations/<ts>_resumes_extracted_text.sql` (migration, DDL ALTER)

**Analog:** `supabase/migrations/20260429000000_add_merit_transaction_id_to_analysis_jobs.sql`

**Full template** (this is the canonical pattern for "additive nullable column on existing table"):
```sql
-- Phase 29 · CACHE-03 — resumes.extracted_text + text_hash columns.
--
-- Re-runnability:
--   * ADD COLUMN IF NOT EXISTS — safe to re-apply.
--   * COMMENT ON COLUMN — idempotent.
-- Roll-forward only: no DROP, no destructive ALTER. If a rollback is
-- required, write a new forward migration.

ALTER TABLE public.resumes
  ADD COLUMN IF NOT EXISTS extracted_text text NULL;

ALTER TABLE public.resumes
  ADD COLUMN IF NOT EXISTS text_hash text NULL;

COMMENT ON COLUMN public.resumes.extracted_text IS
  'Phase 29 CACHE-03: raw text extracted from the resume PDF '
  '(client-side parse or ocr-pdf fallback). NULL on rows created before this migration.';

COMMENT ON COLUMN public.resumes.text_hash IS
  'Phase 29 CACHE-03: SHA-256 hex of canonicalized extracted_text. '
  'Used by cache-fingerprint.ts as a deterministic resume identity across re-OCRs.';

-- Post-apply verification (run in Supabase SQL editor):
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='resumes'
--     AND column_name IN ('extracted_text','text_hash');
-- Expected: 2 rows, data_type='text', is_nullable='YES'.
```

---

### `supabase/migrations/<ts>_usage_tracking_analysis_id.sql` (migration, DDL ALTER)

**Analog:** Same as above (`20260429000000_add_merit_transaction_id_to_analysis_jobs.sql`).

Single `ALTER TABLE public.usage_tracking ADD COLUMN IF NOT EXISTS analysis_id uuid NULL;` plus COMMENT explaining loose-FK rationale (`action_type` varies — no FK constraint per CONTEXT D-16). No additional index needed; ARCHITECTURE.md notes `(user_id, action_type, created_at DESC)` already exists.

The `record_ai_usage` RPC update (adding `p_analysis_id` parameter for HIST-01) belongs in this same migration. Pattern for `CREATE OR REPLACE FUNCTION ... SECURITY DEFINER SET search_path = public, pg_temp` is at `20260411000002_atomic_check_and_record_usage.sql:6-15` and `20260415000000_merit_rpcs.sql:67-72` — copy the prologue verbatim.

---

### `supabase/migrations/<ts>_merit_transactions_idempotency.sql` (migration, DDL + RPC rewrite)

**Analog #1 (partial UNIQUE template):** `supabase/migrations/20260422000000_phase_24_topup.sql:21-38`

**Partial UNIQUE index pattern (verbatim)** — `20260422000000:36-38`:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS merit_transactions_stripe_pi_unique
  ON public.merit_transactions (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
```

Phase 29 MER-04 mirrors this with `WHERE source = 'feature-deduct' AND idempotency_key IS NOT NULL`. RESEARCH §"Pattern 4" gives the full DDL.

**Analog #2 (RPC body to extend):** `supabase/migrations/20260415000000_merit_rpcs.sql:67-152` — the existing `check_and_deduct_merits` body. The MER-04 rewrite ADDS a 4th `p_idempotency_key text DEFAULT NULL` parameter and wraps the INSERT block in `EXCEPTION WHEN unique_violation` to absorb retry-storm races (NFR-07).

**Existing RPC prologue to preserve verbatim** (from `20260415000000:67-72`):
```sql
CREATE OR REPLACE FUNCTION public.check_and_deduct_merits(
  p_user_id uuid,
  p_feature text,
  p_tier text,
  p_idempotency_key text DEFAULT NULL    -- NEW (MER-04)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
```

**GRANT/REVOKE pattern to preserve** (from `20260415000000:154-156`) — must update signature to match the new 4-arg overload:
```sql
REVOKE ALL ON FUNCTION public.check_and_deduct_merits(uuid, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.check_and_deduct_merits(uuid, text, text, text)
  TO authenticated, service_role;
```

**`unique_violation` EXCEPTION block pattern** (from `20260422000000:146-156`):
```sql
EXCEPTION
  WHEN unique_violation THEN
    -- A concurrent caller with the same idempotency_key won. Replay theirs.
    SELECT (metadata->>'deduction_id')::uuid INTO v_prior_deduction
    FROM public.merit_transactions
    WHERE idempotency_key = p_idempotency_key
      AND source = 'feature-deduct'
    LIMIT 1;
    RETURN jsonb_build_object(
      'success',          true,
      'transaction_id',   v_prior_deduction,
      'already_deducted', true
    );
```

**Final DO $$ verification block** (mirror `20260415000000:468-534` — Phase 11 style):
- Verify column exists in `information_schema.columns`
- Verify partial UNIQUE index exists in `pg_indexes`
- Verify RPC arity = 4 and `prosecdef = true`
- `RAISE NOTICE` on success / `RAISE EXCEPTION` on mismatch

---

### `supabase/functions/_shared/cache-fingerprint.ts` (shared helper, transform)

**Analog:** `supabase/functions/_shared/logger.ts` (named-export utility shape) + `src/pages/Upload.tsx:142-148` (SHA-256 body)

**Imports pattern** (from `_shared/merit-gateway.ts:19-23`):
```typescript
import { createLogger } from './logger.ts';

const log = createLogger('cache-fingerprint');
```

**SHA-256 body to copy** (`src/pages/Upload.tsx:142-148` — identical Web Crypto API in Deno):
```typescript
const arrayBuffer = await file.arrayBuffer();
const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
const hashArray = Array.from(new Uint8Array(hashBuffer));
return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
```

For `cache-fingerprint.ts` the input is a `string` not a `File`, so the body becomes:
```typescript
async function sha256Hex(s: string): Promise<string> {
  const bytes = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
```

**API surface pattern** — single `computeCacheKey(opts: CacheKeyOpts): Promise<string>` per RESEARCH §"Pattern 2", lines 320-362. Two-pass hashing (hash each input → concatenate → hash again) for debug-ability per Claude's Discretion in CONTEXT D-09…D-16.

**Module-export style** (from `_shared/logger.ts` + `_shared/merit-gateway.ts`):
- Named exports only (no default).
- Top-of-file JSDoc with REQ-IDs (`CACHE-02`).
- Interface for typed options exported (`CacheKeyOpts`).
- Private helpers (`sha256Hex`, `canonicalize`) NOT exported.

---

### `supabase/functions/_shared/cache-fingerprint.test.ts` (Deno unit test)

**Analog:** `supabase/functions/_shared/json-repair.test.ts`

**Imports + scaffold** (`json-repair.test.ts:1-11` — copy verbatim shape):
```typescript
/**
 * Deno unit tests for computeCacheKey.
 * Run with: deno test supabase/functions/_shared/cache-fingerprint.test.ts --allow-read
 */
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeCacheKey } from "./cache-fingerprint.ts";
```

**Test-case style** (from `json-repair.test.ts:13-30` and `merit-gateway.test.ts:26-56`):
```typescript
Deno.test("computeCacheKey: identical inputs produce identical hash (deterministic)", async () => {
  const a = await computeCacheKey({ user_id: "u1", feature: "resume_analysis", tier: "free", inputs: { x: "y" } });
  const b = await computeCacheKey({ user_id: "u1", feature: "resume_analysis", tier: "free", inputs: { x: "y" } });
  assertEquals(a, b);
});

Deno.test("computeCacheKey: differing user_id produces different hash (cross-user isolation)", async () => {
  const a = await computeCacheKey({ user_id: "u1", feature: "f", tier: "free", inputs: {} });
  const b = await computeCacheKey({ user_id: "u2", feature: "f", tier: "free", inputs: {} });
  assert(a !== b, "user_id must be part of the canonical key");
});
```

**Required coverage per Phase 29 TEST-01:**
- Determinism (same inputs → same output across calls)
- Order-independence (keys in `inputs` sorted before hashing)
- Cross-user isolation (CACHE-11 contract — different `user_id` produces different hash)
- Tier/variant differentiation
- Empty/null variant handling
- Unicode NFC normalization (per RESEARCH §"Pattern 2" `canonicalize()`)

**Test-runner registration:** Add the new test file to `scripts/run-edge-tests.ps1` lines 18-31 (the deno test invocation list — alphabetically near `cors.test.ts`).

---

### `src/hooks/useIdempotencyKey.ts` (hook, event-driven)

**Analog:** `src/hooks/useCreatePaymentIntent.ts` (closest by shape — internal state + `useCallback` + named export, no shared global)

**Imports pattern** (from `useCreatePaymentIntent.ts:12-15`):
```typescript
import { useCallback, useState } from 'react';
```

**Hook shape pattern** (D-09 contract: same UUID for retries of same submit, new UUID for new submit):
```typescript
/**
 * useIdempotencyKey — Phase 29 MER-04 (D-09).
 *
 * Returns a stable UUID per "user submit" (the click that triggers analyze).
 * `regenerate()` rolls a new UUID — call this on each new user-initiated submit.
 * AbortController-driven retries of the SAME logical submit MUST reuse the SAME
 * UUID by NOT calling regenerate(); a new click MUST call regenerate() first.
 *
 * The UUID is transmitted in the request body as `idempotency_key` (D-10);
 * the partial UNIQUE index on merit_transactions enforces dedup server-side.
 */
import { useCallback, useState } from 'react';

export function useIdempotencyKey() {
  const [key, setKey] = useState<string>(() => crypto.randomUUID());
  const regenerate = useCallback(() => {
    const next = crypto.randomUUID();
    setKey(next);
    return next;
  }, []);
  return { key, regenerate };
}
```

**Naming/style notes:**
- `crypto.randomUUID()` is the standard already verified in v2.0 Phase 27 RESEARCH (deno + browsers, RFC 4122 v4).
- Named export, no default (matches every hook in `src/hooks/`).
- `use*` prefix (project convention from CLAUDE.md).
- Console-log on regenerate is OPTIONAL — keep it off to avoid spam during legitimate use; the server log on the merit RPC is the operational signal.

---

### `src/hooks/useIdempotencyKey.test.ts` (Vitest hook test)

**Analog #1 (renderHook + act for hooks with state):** `src/hooks/useCreatePaymentIntent.test.ts`

**Analog #2 (pure-helper Vitest scaffold):** `src/hooks/useFeatureCosts.test.ts:1-12`

**Imports pattern** (from `useCreatePaymentIntent.test.ts:10-11`):
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIdempotencyKey } from './useIdempotencyKey';
```

**Test shape pattern** (combining both analogs):
```typescript
describe('useIdempotencyKey', () => {
  it('returns a stable UUID on first render', () => {
    const { result } = renderHook(() => useIdempotencyKey());
    expect(result.current.key).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('retries of the SAME submit reuse the SAME UUID (D-09)', () => {
    const { result, rerender } = renderHook(() => useIdempotencyKey());
    const k1 = result.current.key;
    rerender();
    expect(result.current.key).toBe(k1);
  });

  it('regenerate() rolls a new UUID for a new user-initiated submit', () => {
    const { result } = renderHook(() => useIdempotencyKey());
    const k1 = result.current.key;
    act(() => { result.current.regenerate(); });
    expect(result.current.key).not.toBe(k1);
    expect(result.current.key).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
```

**No mocking needed** — `crypto.randomUUID()` is built into jsdom and Node ≥19. The hook has no Supabase calls (unlike `useCreatePaymentIntent`), so no `vi.mock('@/lib/supabaseClient', …)` is required.

---

### `scripts/staging-cache-perf-probe.ps1` or `.mjs` (NFR-02 p95 measurement)

**Analog #1 (PowerShell + Bearer JWT + evidence-file append):** `scripts/sc5-probe.ps1`

**Analog #2 (Node.js + multi-run latency + p95 measurement + markdown report):** `scripts/validate-performance.mjs`

**Recommendation:** Use `.mjs` for the p95 probe — `validate-performance.mjs` already does multi-run latency with cooldowns + markdown output, which is exactly the NFR-02 contract ("cache lookup <100 ms p95"). Use the PowerShell shape only if the harness needs to live alongside `deploy-staging.ps1` for operator ergonomics.

**MJS prologue + arg parsing** (from `validate-performance.mjs:1-27, 67-80`):
```javascript
#!/usr/bin/env node
/**
 * Cache lookup perf probe — Phase 29 NFR-02 (<100 ms p95).
 *
 * Drives N consecutive cache-key lookups against analysis_cache (priming the
 * row first so we measure the index-hit path, not the miss path). Reports
 * p50/p95/p99 wall-clock from request sent to response received.
 *
 * Usage:
 *   node scripts/staging-cache-perf-probe.mjs --env staging --runs 50 --warmup
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
```

**Env-config block** (from `validate-performance.mjs:45-56`):
```javascript
const ENV_CONFIGS = {
  staging:    { urlVar: 'SUPABASE_URL_STAGING',    keyVar: 'SUPABASE_ANON_KEY_STAGING' },
  production: { urlVar: 'SUPABASE_URL_PRODUCTION', keyVar: 'SUPABASE_ANON_KEY_PRODUCTION' },
};
```

**PS1 prologue (if planner chooses PowerShell)** — copy `sc5-probe.ps1:1-53` style:
- `[CmdletBinding()] param(...)` block with `Mandatory = $true` for `$SupabaseUrl`
- `$jwt = [Environment]::GetEnvironmentVariable($JwtEnvVar)` for Bearer
- `$ErrorActionPreference = "Stop"`
- Append measurement results to a markdown evidence file (never overwrite)

---

### `supabase/functions/_shared/merit-gateway.ts` (MODIFIED — 4th-arg `precheck_cache`)

**Self-modify** — backwards-compatible additive change. Existing 3-arg call-sites (`analyze-resume`, `grade-linkedin`, `analyze-career`, `recruiting-lens`, `interview-prep-analyze`) compile unchanged.

**Current signature to extend** (`merit-gateway.ts:115-119`):
```typescript
export async function withMerits<T>(
  ctx: MeritGatewayContext,
  feature: string,
  fn: (transactionId: string) => Promise<T>,
): Promise<MeritGatewayResult<T>> {
```

**Phase 29 extension (RESEARCH §"Pattern 3")** — add optional 4th `options?: MeritGatewayOptions<T>` parameter. The precheck callback fires BEFORE the rate-limit check at line 121 and BEFORE the deduct RPC at line 129. On hit: write `usage_tracking` row with `credits=0` + `analysis_id` (HIST-01), return `{ ok: true, value: hit.cached, transactionId: 'cache-hit' }`. On miss/null: fall through to the existing logic unchanged.

**Logger pattern to mirror** (from `merit-gateway.ts:155-162`):
```typescript
log.info('cache-hit', {
  user_id: ctx.userId,
  feature,
  analysis_id: hit.analysis_id,
});
```

**Error-swallow pattern for cache-hit usage_tracking failure (D-08)** — log at `warn`, do not bubble to the user:
```typescript
if (usageError) {
  log.warn('cache-hit usage_tracking write failed', { feature, err: usageError.message });
  // D-08: swallow — user already gets the cached value.
}
```

**Existing service-client pattern to reuse** (`merit-gateway.ts:127`):
```typescript
const supabase = getServiceClient();
```

**Existing test file** (`merit-gateway.test.ts`) — add new `Deno.test()` cases for: precheck hit short-circuits before rate-limit/deduct; precheck miss falls through; precheck throw is treated as miss (defensive). Pattern mirrors existing `isRefundableAnthropicError` tests at lines 26-56.

---

### `supabase/functions/analyze-resume/index.ts` (MODIFIED)

**Self-modify.** Phase 29 does NOT wire feature-level caching here (that's Phase 37). Three specific changes:

**Change 1: Replace dead 32-bit fold at lines 389-392.** Current code:
```typescript
const resumeHash = resumeText.split('').reduce((a: number, b: string) => {
  a = ((a << 5) - a) + b.charCodeAt(0);
  return a & a;
}, 0);
```

Replacement: delete entirely. `resumeHash` is unused downstream per CONCERNS.md. The deterministic SHA-256 substitute lives in `cache-fingerprint.ts` and is consumed in Phase 37, not here.

**Change 2: Persist `extracted_text` + `text_hash` to `resumes` on successful run.** Use the existing service client (already imported as `supabase` per `analyze-resume/index.ts` patterns; see `:1381` for an active `supabase.from('profiles')` call). Update happens AFTER `analysisResult` is built and BEFORE the email fire-and-forget at `:1387`. Compute `text_hash` via `await sha256Hex(normalizedText)` from the new helper.

**Change 3: Mirror existing `EdgeRuntime.waitUntil` pattern.** The current site at `:1388` is a comment ("Fire and forget - use EdgeRuntime.waitUntil for background task") followed by a bare `fetch(...)`. Phase 29 cache-write wiring (Phase 37) will wrap the cache INSERT in actual `EdgeRuntime.waitUntil(...)`. Phase 29 ONLY needs to keep the existing waitUntil call working; don't refactor it.

**Existing `supabase.from('profiles').select(...).eq().single()` pattern to mirror for the `resumes` UPDATE** (from `:1381-1385`):
```typescript
const { data: profile } = await supabase
  .from('profiles')
  .select('email, full_name')
  .eq('id', usageUserId)
  .single();
```

For Phase 29's UPDATE:
```typescript
if (resumeId) {
  const { error: persistError } = await supabase
    .from('resumes')
    .update({ extracted_text: normalizedText, text_hash: await sha256Hex(normalizedText) })
    .eq('id', resumeId);
  if (persistError) {
    console.error('[analyze-resume] resumes text persist failed', persistError);
    // CACHE-12 / D-08: do not block the response on a persist warning.
  }
}
```

---

### `supabase/functions/ocr-pdf/index.ts` (MODIFIED)

**Self-modify.** OCR currently returns `{ text: fullText, pageCount }` at lines 143-146 without persisting anything to the database. Phase 29 adds a `resumes.extracted_text` + `text_hash` UPDATE before that return.

**Existing imports to extend** (`ocr-pdf/index.ts:3-7`):
```typescript
import { invokeAnthropicText } from '../_shared/anthropic.ts';
import { requireAuth } from '../_shared/auth.ts';
import { corsHeaders, handleOptionsRequest } from '../_shared/cors.ts';
import { checkRateLimit, createRateLimitResponse } from '../_shared/rate-limiter.ts';
import { FREE_MODEL } from '../_shared/tier-config.ts';
```

Add:
```typescript
import { getServiceClient } from '../_shared/supabase-client.ts';
// computeCacheKey not needed in ocr-pdf — we only need sha256Hex.
// Either export sha256Hex from cache-fingerprint.ts or inline the 5-line helper.
```

**Decision point for planner:** `sha256Hex` is currently a private helper inside `cache-fingerprint.ts` per RESEARCH §"Pattern 2". For Phase 29 use in `ocr-pdf/index.ts` + `analyze-resume/index.ts`, either (a) export `sha256Hex` as a named export from `cache-fingerprint.ts`, or (b) inline the 5-line helper at each call site. Recommend (a) — single source of truth for the SHA-256 byte→hex pattern.

**Request-body extension contract:** `ocr-pdf` must accept a `resumeId` param (currently the body is only `{ images }`). Add it to the destructure at `:60` and validate via the existing pattern (manual check; no Zod handler wrapper in this function).

**Persist pattern to add (placed between line 141 and the return at 143):**
```typescript
if (resumeId && fullText.length > 0) {
  const supabase = getServiceClient();
  const textHash = await sha256Hex(fullText);
  const { error: persistError } = await supabase
    .from('resumes')
    .update({ extracted_text: fullText, text_hash: textHash })
    .eq('id', resumeId);
  if (persistError) {
    console.error('[ocr-pdf] resumes text persist failed', persistError);
    // CACHE-12 / D-08: persist failure does not block the OCR response.
  }
}
```

**Error response pattern to preserve** (`ocr-pdf/index.ts:148-156`):
```typescript
} catch (error: unknown) {
  if (error instanceof Response) throw error;
  console.error('OCR error:', error);
  const errorMessage = error instanceof Error ? error.message : 'OCR failed';
  return new Response(
    JSON.stringify({ error: errorMessage }),
    { status: 500, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } }
  );
}
```

The new persist block goes inside the existing try block, BEFORE the success Response — keeping the existing catch unchanged.

---

## Shared Patterns

### Migration prologue + re-runnability

**Source:** `supabase/migrations/20260422000000_phase_24_topup.sql:1-17` and `20260429000000_add_merit_transaction_id_to_analysis_jobs.sql:1-12`

**Apply to:** All 4 new migrations.

```sql
-- Phase 29 · <plan> — <name> (<REQ-IDs>).
--
-- Sections:
--   1. ...
--   2. Verification block (RAISE EXCEPTION on missing artifact)
--
-- Re-runnability:
--   * <CREATE TABLE / ADD COLUMN> IF NOT EXISTS — safe to re-apply.
--   * CREATE [UNIQUE] INDEX IF NOT EXISTS — safe.
--   * CREATE OR REPLACE FUNCTION — safe.
--
-- Roll-forward only: no DROP, no destructive ALTER. If a rollback is required,
-- write a new forward migration.
```

### RPC prologue (every `SECURITY DEFINER` function)

**Source:** `20260415000000_merit_rpcs.sql:67-72` and `20260411000002_atomic_check_and_record_usage.sql:6-15`

**Apply to:** `check_and_deduct_merits` rewrite (MER-04) and `record_ai_usage` update (HIST-01).

```sql
CREATE OR REPLACE FUNCTION public.<name>(...)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
...
$$;

REVOKE ALL ON FUNCTION public.<name>(...) FROM public;
GRANT EXECUTE ON FUNCTION public.<name>(...) TO authenticated, service_role;
```

`SET search_path = public, pg_temp` is non-negotiable (ASVS V4, T-11-10 / T-11-20 in Phase 11 — the migration verification block at `20260415000000:496-510` asserts this on every RPC).

### Service-client write pattern

**Source:** `supabase/functions/_shared/merit-gateway.ts:127`

**Apply to:** Every edge-function DB write Phase 29 introduces (cache write, `usage_tracking` insert, `resumes` UPDATE).

```typescript
const supabase = getServiceClient();
// All RLS-bypassing writes go through this client.
```

### Structured logger usage

**Source:** `supabase/functions/_shared/merit-gateway.ts:24` + `supabase/functions/_shared/logger.ts:16`

**Apply to:** `cache-fingerprint.ts`, `merit-gateway.ts` extension, any new Phase 29 helper.

```typescript
import { createLogger } from './logger.ts';
const log = createLogger('<function-name>');

log.info('event-name', { user_id, feature, ... });
log.warn('soft-failure', { err: err.message });
```

Frontend equivalent: `console.log('[ComponentName] message')` with bracket prefix (CLAUDE.md convention).

### Deno test scaffold

**Source:** `supabase/functions/_shared/json-repair.test.ts:1-11` + `supabase/functions/_shared/merit-gateway.test.ts:1-22`

**Apply to:** `cache-fingerprint.test.ts`, and any new `_shared/*.test.ts`.

```typescript
/**
 * Deno unit tests for <module>.
 * Run with: deno test supabase/functions/_shared/<file>.test.ts --no-check --allow-env
 */
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { <export> } from "./<module>.ts";

Deno.test("<behavior description>", () => {
  ...
});
```

**Test-runner registration:** Add new test files to `scripts/run-edge-tests.ps1` lines 18-31.

### Vitest hook scaffold

**Source:** `src/hooks/useCreatePaymentIntent.test.ts:1-36` + `src/hooks/useFeatureCosts.test.ts:1-12`

**Apply to:** `useIdempotencyKey.test.ts`, and any new frontend hook tests.

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { <hook> } from './<hook>';

beforeEach(() => { vi.resetAllMocks(); });

describe('<hook>', () => {
  it('<behavior>', () => { ... });
});
```

Run via `npm run test` (Vitest is already in `package.json:9` — `"test": "vitest run"`).

### `EdgeRuntime.waitUntil` for fire-and-forget

**Source:** `supabase/functions/analyze-resume/index.ts:1388` (verified Supabase Edge runtime support — RESEARCH finding #1)

**Apply to:** Cache writes (Phase 37 wiring) — Phase 29 only documents the pattern in the helper. NO Phase 29 file actually calls `EdgeRuntime.waitUntil`; the existing call at `:1388` is left untouched.

```typescript
// Fire and forget - keeps worker alive until promise resolves.
// 150s cap on free, 400s cap on paid (Supabase docs).
EdgeRuntime.waitUntil((async () => {
  // ... INSERT INTO analysis_cache ... ON CONFLICT DO NOTHING
})());
```

## No Analog Found

None. Every Phase 29 file has at least one strong in-tree analog.

## Metadata

**Analog search scope:**
- `supabase/migrations/` (all 20260* migrations — 26 files)
- `supabase/functions/_shared/` (helpers + tests — 24 source + 24 test files)
- `supabase/functions/analyze-resume/index.ts` (1388-line monolith — read targeted ranges only)
- `supabase/functions/ocr-pdf/index.ts` (157 lines — full read)
- `src/hooks/` (22 hooks + 4 tests)
- `src/pages/Upload.tsx` (SHA-256 site only)
- `scripts/*.{ps1,mjs}` (12 files — `sc5-probe.ps1` and `validate-performance.mjs` selected as analogs)

**Files scanned:** ~35 read, ~120 globbed/grepped.

**Pattern extraction date:** 2026-05-12

**Key cross-cutting observations:**
1. The codebase already standardizes on `IF NOT EXISTS` + `CREATE OR REPLACE` + `DO $$ ... RAISE EXCEPTION ...` verification blocks for every additive migration since Phase 10. Phase 29 must follow this verbatim for NFR-01.
2. `auth.uid() = user_id` (not `auth.jwt() ->> 'sub'`) is the canonical RLS predicate everywhere — `20260414000000:70-79`, `20260415000000:39`, `20260417000000:6`, `20260420000000:25`.
3. The partial-UNIQUE-with-EXCEPTION-block pattern at `20260422000000:36-38, 146-156` is the EXACT template MER-04 must mirror — including the `WHERE <col> IS NOT NULL` clause and the `EXCEPTION WHEN unique_violation` replay handler.
4. `EdgeRuntime.waitUntil` is already in production at `analyze-resume/index.ts:1388` — RESEARCH §92 confirms this resolves D-05's "verify availability" item; the `Promise.allSettled` fallback in D-05 is documented-only, never the primary path.
5. The dead `resumeHash` 32-bit fold at `analyze-resume/index.ts:389-392` is structurally unused downstream — safe to delete in Phase 29 even though feature-level cache wiring lands in Phase 37.
