# Phase 29: Foundation Infrastructure - Research

**Researched:** 2026-05-12
**Domain:** Supabase Edge Functions (Deno) + Postgres migrations — caching substrate, deterministic fingerprinting, sync-path merit idempotency, history-link plumbing
**Confidence:** HIGH on EdgeRuntime/RLS/migration patterns (verified via codebase + Supabase official docs); HIGH on idempotency-key design (verified via existing top-up pattern in `20260422000000_phase_24_topup.sql`); MEDIUM on the canonical `computeCacheKey` API shape (driven by codebase analysis of 5 call-sites; planner has discretion); LOW on the idempotency-hit replay shape recommendation (operational judgment — flagged for `/gsd-discuss-phase` confirmation).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Cache-key scoping + RLS shape:**

- **D-01:** `cache_key` is `SHA-256(user_id || feature || tier || variant || canonical_input_hashes)`. `user_id` is baked into the key — cross-user reads are structurally impossible. RLS is defense-in-depth.
- **D-02:** Single UNIQUE btree index on `cache_key`. No composite. NFR-02 <100ms p95 met via direct hash lookup.
- **D-03:** RLS policy matches the v2.0 MIG-02 lock used on `analysis_results`: `SELECT WHERE user_id = auth.uid()` for `authenticated` role; no INSERT/UPDATE/DELETE policy. Service role writes only (via `getServiceClient()`).
- **D-04:** `withMerits` gains an optional `precheck_cache: () => Promise<{ cached, analysis_id } | null>` callback. Gateway runs the precheck BEFORE rate-limit and deduction. On hit, gateway short-circuits, writes a `usage_tracking` row with `credits=0` + `analysis_id` referencing the originating row, and returns the cached `raw_response` to the caller. No new `withCacheAndMerits` wrapper — the precheck callback is a one-line extension to the existing gateway contract.

**Cache-write timing post-response:**

- **D-05:** Cache writes use `EdgeRuntime.waitUntil(promise)` to defer past `jsonResponse()`. Verify availability in deployed Supabase Edge runtime during research; fall back to `Promise.allSettled` post-response if `waitUntil` is unavailable.
- **D-06:** Cache write happens AFTER Claude success AND AFTER the per-feature persist target writes successfully (CACHE-12). Order: Claude → per-feature persist (`resumes` / `analysis_results` / `linkedin_grades` / `saved_jobs` / `interview_quizzes`) → cache write. Partial responses or failed persists never poison cache.
- **D-07:** `precheck_cache` hit returns `{ cached: raw_response, analysis_id }`. Frontend treats it like a fresh response — no special hit-vs-miss branching at the rendering layer. The `analysis_id` keeps deep-links in AnalysisHistory functional.
- **D-08:** Cache-write failures (DB transient, UNIQUE collision) are logged at `warn` and silently swallowed. UNIQUE collisions are the expected NFR-07 behavior under retry storms — another worker wrote the row first.

**Idempotency key strategy (MER-04):**

- **D-09:** Frontend generates a `crypto.randomUUID()` per user-initiated submit. Retries of the SAME logical submit reuse the same UUID. A new user click generates a new UUID.
- **D-10:** Idempotency key is transmitted in the request body as `idempotency_key`. Validated alongside other body fields via the existing Zod-friendly handler pattern. No new CORS header.
- **D-11:** `merit_transactions` gains an `idempotency_key text` column with a **partial UNIQUE index** on `(idempotency_key) WHERE source = 'feature-deduct'`. Refunds and shop credits stay outside the unique check. UUID entropy is enough that `user_id` scoping isn't required.
- **D-12:** Execution order: `precheck_cache()` FIRST → on hit, write `usage_tracking` credits=0 row → return cached. **Cache hits do NOT consume idempotency keys.** On miss → pooled rate-limit check → `check_and_deduct_merits(p_idempotency_key)` RPC → Claude call → per-feature persist → cache write (waitUntil). On `check_and_deduct_merits` idempotency hit: RPC returns "already_deducted" with the prior transaction_id — replay shape is an open research question.

**Cache-hit Activity History contract:**

- **D-13:** Every cache hit writes a NEW `usage_tracking` row with `created_at = now()`, `credits = 0`, `analysis_id = <originating row id>`, `action_type = <feature>`.
- **D-14:** Cache-hit rows are visually IDENTICAL to fresh-analysis rows in AnalysisHistory. No "cached" badge. Cache is invisible to users.
- **D-15:** Cache hits BYPASS the pooled `ai-analyses-all` 60/hr rate limit.
- **D-16:** Orphan `usage_tracking` rows (where the referenced `analysis_id` row was deleted) are filtered at query time in Phase 36 — LEFT JOIN with NULL check. No cascade DELETE on the FK; audit history preserved.

### Claude's Discretion

- Migration file naming/numbering (single migration vs. one per concern). Recommendation: one migration per concern (`*_analysis_cache_table.sql`, `*_resumes_extracted_text.sql`, `*_usage_tracking_analysis_id.sql`, `*_merit_transactions_idempotency.sql`) for clean rollback paths per NFR-01.
- `cache-fingerprint.ts` API surface — single `computeCacheKey(opts)` function or feature-specific builders. Planner picks based on what reads cleanest across the 5 call-sites.
- Test split between Deno (`deno test` edge unit), Vitest (frontend hook tests), and pgTAP (RLS + UNIQUE constraint regressions). TEST-02 is the canonical regression.
- Exact `EdgeRuntime.waitUntil` availability + fallback shape.
- Whether `cache-fingerprint.ts` hashes individual inputs separately before concatenation or hashes the concatenated canonical string once.

### Deferred Ideas (OUT OF SCOPE)

- **Cache analytics dashboard** (hit rate, popular fingerprints, cost savings) — Future, internal telemetry only.
- **Per-user cache invalidation UI** ("Re-run analysis without using cache") — Future. RLS posture (D-03) means a future UI needs an RPC, not a direct DELETE.
- **Test contract split decision** — flagged in Claude's Discretion. Planner decides.
- **pgTAP CI runner** — operator-deferred from v2.0 Phase 11. Flag in Phase 29 plan if needed and Docker isn't available.
- **`analysis_jobs.merit_transaction_id` deeper async integration** — Phase 26 already wired refund on async failure; Phase 29 does NOT extend the async path. Phases 37–40 will plumb idempotency_key + precheck_cache through `submit-*-job` + `process-*-job` paths.
- **Per-feature cache wiring** — Phases 37–41 wire `analyze-resume`, `grade-linkedin`, `analyze-career`, `recruiting-lens`, `interview-prep-analyze`. Phase 29 ships substrate ONLY.
- **Per-feature `analysis_results` / `saved_jobs` inserts** — Phase 36.
- **UI changes to AnalysisHistory** — Phase 36.
- **Prompt content changes** — Phase 36+ and feature phases.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CACHE-01 | `analysis_cache` table with `(id PK, cache_key UNIQUE, feature, tier, variant, user_id, raw_response jsonb, created_at, last_hit_at, hit_count)` | §"`analysis_cache` Table DDL"; RLS template from `20260420000000_mig_02_analysis_results_readonly.sql` |
| CACHE-02 | Shared `_shared/cache-fingerprint.ts` SHA-256 builder | §"Cache Fingerprint Helper API"; Web Crypto `crypto.subtle.digest('SHA-256', ...)` is available in Deno + browsers (already used at `src/pages/Upload.tsx:145`) |
| CACHE-03 | `resumes.extracted_text text NULL` + `resumes.text_hash text NULL` columns; `analyze-resume` + `ocr-pdf` populate them | §"`resumes` Text Persistence Wiring" |
| CACHE-09 | Cache hit short-circuits merit deduct via `withMerits` precheck callback | §"`withMerits` Precheck Extension" |
| CACHE-10 | Cache hits surface in Activity History via `usage_tracking` row with `credits=0` + `analysis_id` | §"`usage_tracking.analysis_id` Column" |
| CACHE-11 | User-scoped cache via `user_id` in both the cache_key AND RLS predicate | D-01 + D-03 covered together — `user_id` in fingerprint structurally prevents cross-user keys; RLS is defense-in-depth |
| CACHE-12 | Cache write happens AFTER successful Claude response AND AFTER per-feature persist; uses `EdgeRuntime.waitUntil` | §"Cache Write Timing"; verified availability via Supabase docs + existing usage at `analyze-resume/index.ts:1388` |
| HIST-01 | `usage_tracking.analysis_id uuid NULL` column (loose FK) | §"`usage_tracking.analysis_id` Column" |
| MER-04 | `merit_transactions.idempotency_key text` + partial UNIQUE index + `check_and_deduct_merits(p_idempotency_key)` | §"Merit Idempotency"; existing `merit_transactions_stripe_pi_unique` is the canonical pattern |
| NFR-01 | Idempotent migrations + documented rollback | §"Migration Patterns" — `IF NOT EXISTS` / `CREATE OR REPLACE` / partial-unique with `IF NOT EXISTS`; rollback as forward-only migration |
| NFR-02 | Cache lookup <100 ms p95 | Single btree index on `cache_key` → exact lookup; D-02 |
| NFR-05 | Preserve CORS / rate-limit / sanitizer / JWT | `withMerits` is the only change-point; precheck runs BEFORE rate-limit but rate-limit still fires on cache miss (D-12, D-15) |
| NFR-06 | Cache writes never block response | `EdgeRuntime.waitUntil` (verified) |
| NFR-07 | Idempotency tolerates retry storms | Partial UNIQUE + transactional RPC; D-08 absorbs cache-write UNIQUE collisions silently |
| TEST-01 | Per-fix test/QA | §"Validation Architecture" |
| TEST-02 | Merit-idempotency regression test | §"Validation Architecture" — Deno test against staging Supabase |

</phase_requirements>

## Summary

Phase 29 is pure substrate: four migrations + one shared TS helper + one `withMerits` extension + frontend UUID-per-submit. No edge function ships behavior change; every feature continues to run exactly as today. The substrate enables Phases 37–41 to wire cache short-circuits per feature, and Phase 36 to swap the fragile ±5-min proximity matcher for an explicit `analysis_id` link.

Three findings drove decision recommendations during research:

1. **`EdgeRuntime.waitUntil` is officially supported, documented, AND already used in this codebase** at `analyze-resume/index.ts:1388`. The decision to depend on it (D-05) is safe. Free-plan background tasks run up to 150 s; paid plans up to 400 s — far exceeds the time a cache INSERT needs. The `Promise.allSettled` fallback in D-05 is unnecessary as a primary path; document it only as a defensive comment in the helper.
2. **The codebase already has the canonical pattern for the new partial-UNIQUE idempotency index** in `merit_transactions_stripe_pi_unique` (`20260422000000_phase_24_topup.sql:36-38`). MER-04 follows that pattern verbatim with `WHERE source = 'feature-deduct'` instead of `WHERE stripe_payment_intent_id IS NOT NULL`. The RPC catches `unique_violation` (Postgres SQLSTATE `23505`) and returns the prior `transaction_id` from `metadata->>'deduction_id'`.
3. **No SHA-256 helper exists yet in `_shared/`**, but `src/pages/Upload.tsx:145` already uses `crypto.subtle.digest('SHA-256', arrayBuffer)` for `file_hash`. The same Web Crypto API works identically in Deno edge functions. The new `cache-fingerprint.ts` helper is ~30 lines of TS — recommended shape is a single `computeCacheKey(opts)` function with a typed `opts` object so each of the 5 features passes only the fields it needs.

**Primary recommendation:** Ship 4 migrations (`analysis_cache` / `resumes` columns / `usage_tracking.analysis_id` / `merit_transactions.idempotency_key` + RPC update), 1 shared helper (`cache-fingerprint.ts`), 1 `withMerits` 4th-arg extension, and 1 `ocr-pdf` + 1 `analyze-resume` wiring patch for `extracted_text`/`text_hash` persistence. Test contract: Deno integration test for MER-04 (TEST-02), Deno unit test for `cache-fingerprint.ts` determinism, manual SQL-inspection QA for RLS + UNIQUE constraints (pgTAP NOT required).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `analysis_cache` table + RLS | Database / Storage | — | Substrate. Service-role-write; RLS for user SELECT. No edge logic in Phase 29. |
| `cache-fingerprint.ts` SHA-256 helper | API / Backend (shared) | — | Lives in `supabase/functions/_shared/`. Consumed by 5 edge functions in Phases 37–41. Pure function, no IO. |
| `resumes.extracted_text` + `text_hash` columns + wiring | Database / Storage + API / Backend | — | DB columns (additive); `analyze-resume` + `ocr-pdf` populate on write path. Frontend never reads these directly. |
| `usage_tracking.analysis_id` loose FK | Database / Storage | API / Backend (population deferred to Phase 36) | Phase 29 ships column only. Per-feature `record_ai_usage` updates land in Phase 36. |
| `merit_transactions.idempotency_key` + partial UNIQUE | Database / Storage | API / Backend (RPC update) | DDL + `check_and_deduct_merits` RPC rewrite to accept `p_idempotency_key`. Server-side enforcement, never trust client UUID for anything but dedup. |
| `withMerits` `precheck_cache` callback | API / Backend | — | One-line extension to existing gateway contract. Existing callers unaffected. |
| Frontend UUID-per-submit (MER-04 client side) | Browser / Client | — | `crypto.randomUUID()` per `onClick`; AbortController retry reuses; new click regenerates. Phase 29 ships the helper hook; per-feature wiring lands in Phase 31 (Optimistic UI). |

## Standard Stack

### Core (all already present in the codebase — no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `npm:@supabase/supabase-js@2` | 2.81.1 [VERIFIED: `package.json` + `supabase-client.ts:1`] | DB writes via service client | Already the canonical edge-function DB surface |
| Web Crypto `crypto.subtle.digest` | Built-in [VERIFIED: Deno + browsers] | SHA-256 hashing | Already used at `src/pages/Upload.tsx:145`; identical API in Deno edge functions |
| `EdgeRuntime.waitUntil` | Supabase Deno runtime built-in [CITED: https://supabase.com/docs/guides/functions/background-tasks] | Defer cache write past response | Officially supported; already used at `analyze-resume/index.ts:1388`; 150 s cap on free / 400 s on paid |
| `https://deno.land/std@0.224.0/assert/mod.ts` | std@0.224.0 [VERIFIED: existing `merit-gateway.test.ts:12`] | Deno test asserts | Established pattern in `_shared/*.test.ts` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `_shared/logger.ts` `createLogger('cache-fingerprint')` | n/a — internal [VERIFIED: existing pattern] | Structured logs | Every shared helper that emits warn/info |
| `_shared/supabase-client.ts` `getServiceClient()` | n/a — internal | RLS-bypassing writes | Cache writes, RPC calls — never use anon client server-side |
| `_shared/merit-gateway.ts` `withMerits` | n/a — internal | Gateway extension point | Add 4th-arg options object with `precheck_cache` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `EdgeRuntime.waitUntil(promise)` | `Promise.allSettled([cachePromise]).catch(noop)` post-response | Fallback only. `waitUntil` is the documented Supabase primitive and keeps the worker warm until the promise resolves; bare `Promise.allSettled` may be killed by the runtime when the response stream closes. Keep `Promise.allSettled` as a code-comment fallback for environments where `waitUntil` is unavailable (none in our prod/staging). |
| Single `computeCacheKey(opts)` function | Per-feature builders (`computeResumeKey`, `computeLinkedInKey`, etc.) | Single function is shorter and forces a single canonical-input shape; per-feature builders make each call-site read more like English but duplicate the SHA-256 plumbing 5x. Recommend single function; planner has discretion. |
| Hashing concatenated canonical string once | Hash each input separately, then hash the concatenation of hashes | Single-pass is simpler. Two-pass ("hash of hashes") is debug-friendlier — each component's hash is recoverable for log inspection. Recommend two-pass for the 5-feature case because different features have different input shapes and isolating "which input changed" during debugging matters more than a few microseconds. |
| Polymorphic `(analysis_target_type, analysis_id)` on `usage_tracking` | Plain `analysis_id uuid NULL` with no FK constraint | Loose FK (no constraint) is preferred per D-16 because the referenced table varies by `action_type`. Phase 36 reads filter at query time via LEFT JOIN. Adding `analysis_target_type` would be a duplicate of the existing `action_type` column. |

**Installation:**

No new dependencies. Phase 29 uses only built-in Deno + existing `_shared` helpers + the already-installed `@supabase/supabase-js@2.81.1`.

**Version verification:**

- `@supabase/supabase-js@2.81.1` — [VERIFIED: `package.json` line 78 + `_shared/supabase-client.ts:1` pinned to `2`]
- Deno standard library `0.224.0` — [VERIFIED: existing `_shared/auth.ts:17`, `merit-gateway.test.ts:12`]

## Architecture Patterns

### System Architecture Diagram

```
                ┌──────────────────────────────────────────────────────────────┐
                │  Frontend (React + Vite)                                     │
                │                                                              │
                │  on Analyze click → crypto.randomUUID() per submit          │
                │  retries on same submit re-use the SAME UUID                 │
                │  request body: { ..., idempotency_key: <uuid> }              │
                └────────────────────┬─────────────────────────────────────────┘
                                     │ POST /functions/v1/<feature>
                                     ▼
        ┌────────────────────────────────────────────────────────────────────┐
        │  Edge function (analyze-resume, grade-linkedin, ..., 5 features)   │
        │  Phase 29 does NOT modify these. Phases 37–41 do.                  │
        │                                                                    │
        │  withMerits(ctx, feature, fn, { precheck_cache })  ← Phase 29 ext  │
        │   1. precheck_cache()? ─yes─> cache hit path (see below)           │
        │   2. else: rate-limit → check_and_deduct_merits(p_idempotency_key) │
        │   3.        Claude call → per-feature persist                      │
        │   4.        EdgeRuntime.waitUntil(cacheWrite(...))                 │
        │   5.        jsonResponse(payload)                                  │
        └────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
        ┌────────────────────────────────────────────────────────────────────┐
        │  Cache HIT path (Phase 29 substrate)                               │
        │   • lookup: SELECT FROM analysis_cache WHERE cache_key = $1        │
        │   • update: UPDATE hit_count = hit_count + 1, last_hit_at = now()  │
        │   • write usage_tracking row: credits=0, analysis_id=<orig>        │
        │   • short-circuit: skip rate-limit + deduct + Claude + persist     │
        │   • return cached.raw_response                                     │
        └────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
        ┌────────────────────────────────────────────────────────────────────┐
        │  Cache MISS / fresh path  → cache WRITE after persist              │
        │                                                                    │
        │   EdgeRuntime.waitUntil(async () => {                              │
        │     INSERT INTO analysis_cache (cache_key, feature, tier,          │
        │       variant, user_id, raw_response, created_at, last_hit_at,     │
        │       hit_count = 1)                                               │
        │     ON CONFLICT (cache_key) DO NOTHING  -- absorb race storms      │
        │   });                                                              │
        │   return jsonResponse(payload);  -- response already returned      │
        └────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
        ┌────────────────────────────────────────────────────────────────────┐
        │  Postgres (Supabase)                                               │
        │                                                                    │
        │  analysis_cache         ← Phase 29 new table (RLS user-scoped)     │
        │  resumes (+extracted_text, +text_hash)  ← Phase 29 new columns     │
        │  usage_tracking (+analysis_id)          ← Phase 29 new column      │
        │  merit_transactions (+idempotency_key)  ← Phase 29 new column      │
        │  check_and_deduct_merits(p_idempotency_key)  ← Phase 29 RPC update │
        └────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
supabase/
├── functions/
│   └── _shared/
│       ├── cache-fingerprint.ts        # NEW (CACHE-02) — SHA-256 builder
│       ├── cache-fingerprint.test.ts   # NEW — Deno unit tests
│       ├── merit-gateway.ts            # MODIFIED — adds 4th-arg options w/ precheck_cache
│       └── merit-gateway.test.ts       # MODIFIED — adds precheck path coverage
│   ├── analyze-resume/
│   │   └── index.ts                    # MODIFIED — populate resumes.extracted_text/text_hash;
│   │                                   #            delete dead 32-bit resumeHash at :389-392
│   └── ocr-pdf/
│       └── index.ts                    # MODIFIED — return extracted_text + write to resumes
└── migrations/
    ├── 2026MMDD_analysis_cache_table.sql              # NEW (CACHE-01)
    ├── 2026MMDD_resumes_extracted_text.sql            # NEW (CACHE-03)
    ├── 2026MMDD_usage_tracking_analysis_id.sql        # NEW (HIST-01)
    └── 2026MMDD_merit_transactions_idempotency.sql    # NEW (MER-04: column + index + RPC update)

src/
├── hooks/
│   └── useIdempotencyKey.ts            # NEW — crypto.randomUUID() per submit + reset
│                                       #       (Phase 29 ships helper; per-feature wiring is Phase 31)
```

### Pattern 1: `analysis_cache` Table DDL

**What:** New `public.analysis_cache` table with single UNIQUE btree index on `cache_key`. User-SELECT-own RLS; service-role-only writes.

**When to use:** Phase 29 migration `2026MMDD_analysis_cache_table.sql`.

**Example (verbatim recommended DDL):**

```sql
-- Source: pattern from supabase/migrations/20260420000000_mig_02_analysis_results_readonly.sql
-- (RLS SELECT-only template) + supabase/migrations/20260414000000_merit_ledger_foundation.sql
-- (CREATE TABLE IF NOT EXISTS + RLS-no-INSERT-policy pattern)

CREATE TABLE IF NOT EXISTS public.analysis_cache (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key     text NOT NULL,
  feature       text NOT NULL,
  tier          text NOT NULL CHECK (tier IN ('free','pro','elite')),
  variant       text NULL,                   -- nullable: not every feature has a variant
  user_id       uuid NOT NULL
                  REFERENCES public.profiles(id) ON DELETE CASCADE,
  raw_response  jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_hit_at   timestamptz NOT NULL DEFAULT now(),
  hit_count     integer NOT NULL DEFAULT 1 CHECK (hit_count > 0)
);

-- D-02: single UNIQUE btree on cache_key. No composite.
CREATE UNIQUE INDEX IF NOT EXISTS analysis_cache_key_unique
  ON public.analysis_cache (cache_key);

-- (Optional supporting index for future analytics; cheap on a table that's
--  expected to grow slowly. Planner can defer.)
CREATE INDEX IF NOT EXISTS analysis_cache_user_feature_created_idx
  ON public.analysis_cache (user_id, feature, created_at DESC);

ALTER TABLE public.analysis_cache ENABLE ROW LEVEL SECURITY;

-- D-03: SELECT-own only. No INSERT/UPDATE/DELETE policy.
-- Service role bypasses RLS for all writes via getServiceClient().
DROP POLICY IF EXISTS analysis_cache_select_own ON public.analysis_cache;
CREATE POLICY analysis_cache_select_own
  ON public.analysis_cache
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
```

**Notes on RLS:**
- `auth.uid()` is the canonical reference (not `auth.jwt() ->> 'sub'`) — pattern verified in `20260415000000_merit_rpcs.sql:39` and `20260414000000_merit_ledger_foundation.sql:71-79`.
- `TO authenticated` is the correct role; `public` schema reference is correct (matches every other RLS migration in the repo).
- No `WITH CHECK` clause needed — there's no INSERT/UPDATE/DELETE policy at all.

### Pattern 2: Cache Fingerprint Helper API

**What:** Single shared `computeCacheKey(opts)` function that hashes a canonical input map to a deterministic SHA-256.

**When to use:** Imported by all 5 feature edge functions in Phases 37–41. Phase 29 ships the helper and tests it; no per-feature wiring lands here.

**Example (recommended shape — planner has discretion):**

```typescript
// Source: pattern from src/pages/Upload.tsx:142-148 (existing crypto.subtle SHA-256)
// + _shared/auth.ts:17 (deno.land/std imports)

import { createLogger } from './logger.ts';

const log = createLogger('cache-fingerprint');

/**
 * Inputs for computing an analysis_cache cache_key.
 *
 * Two-pass hashing strategy (planner-discretion D-16):
 *   1. Each value in `inputs` is hashed individually after canonicalization
 *      (trim, lowercase, NFC-normalize for text; sort + stringify for arrays/objects).
 *   2. The resulting hex hashes are concatenated with `|` and hashed again.
 *
 * Rationale: debug-friendlier than single-pass. If a key changes unexpectedly,
 * a planner can log the individual component hashes and binary-search which
 * input drifted. The cost is one extra SHA-256 pass — negligible.
 *
 * D-01: user_id is the FIRST field. Cross-user keys are structurally impossible.
 * BUDGET-03: callers MUST pass inputs AFTER per-tier truncation. Hashing raw
 * input would make retries with different tier caps produce different keys.
 */
export interface CacheKeyOpts {
  user_id: string;        // REQUIRED — first in canonical order
  feature: string;        // 'resume_analysis' | 'linkedin_grading' | ...
  tier: 'free' | 'pro' | 'elite';
  variant?: string | null; // e.g. 'flashcard' | 'quiz' | 'elite_taste' for IP
  inputs: Record<string, string | number | boolean | null | string[]>;
}

export async function computeCacheKey(opts: CacheKeyOpts): Promise<string> {
  // Canonicalize each input value to a stable string.
  const componentHashes: string[] = [];
  componentHashes.push(await sha256Hex(opts.user_id));
  componentHashes.push(await sha256Hex(opts.feature));
  componentHashes.push(await sha256Hex(opts.tier));
  componentHashes.push(await sha256Hex(opts.variant ?? ''));

  // Sort input keys for deterministic order regardless of JS key-insertion order.
  const sortedKeys = Object.keys(opts.inputs).sort();
  for (const k of sortedKeys) {
    const v = opts.inputs[k];
    const canonical = canonicalize(v);
    componentHashes.push(await sha256Hex(`${k}=${canonical}`));
  }

  // Final pass: hash the concatenation of component hashes.
  return await sha256Hex(componentHashes.join('|'));
}

async function sha256Hex(s: string): Promise<string> {
  const bytes = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function canonicalize(v: string | number | boolean | null | string[]): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return JSON.stringify([...v].sort());
  if (typeof v === 'string') return v.normalize('NFC').trim();
  return String(v);
}
```

**Per-feature call sites (NOT in Phase 29 — Phases 37–41 add these):**

```typescript
// Phase 37 — analyze-resume (CACHE-04)
const cacheKey = await computeCacheKey({
  user_id: ctx.userId, feature: 'resume_analysis', tier: resolvedTier, variant: null,
  inputs: {
    text_hash: resume.text_hash,
    targetRole: targetRole.slice(0, 200),       // post-truncation per BUDGET-03
    targetIndustry: targetIndustry.slice(0, 200),
    previousScore: previousScore ?? 0,
    previousSuggestions_hash: await sha256Hex(JSON.stringify(previousSuggestions)),
  },
});

// Phase 38 — grade-linkedin (CACHE-05) — note prior_grade_id participates
const cacheKey = await computeCacheKey({
  user_id: ctx.userId, feature: 'linkedin_grading', tier: resolvedTier, variant: null,
  inputs: {
    profileContent_hash: await sha256Hex(profileContent.slice(0, 12000)),
    profileUrl,
    prior_grade_id: priorGrade?.id ?? '',
  },
});

// Phase 40 — recruiting-lens (CACHE-07) — company + role + JD all hashed post-trim
const cacheKey = await computeCacheKey({
  user_id: ctx.userId, feature: 'recruiting_lens', tier: resolvedTier, variant: null,
  inputs: {
    resumeSummary_hash: await sha256Hex(resumeSummary.slice(0, 5000)),
    jobDescription_hash: await sha256Hex(jobDescription.slice(0, 3000)),
    linkedinText_hash: await sha256Hex(linkedinText?.slice(0, 4000) ?? ''),
    company, role_title,
  },
});
```

### Pattern 3: `withMerits` Precheck Extension

**What:** Add an optional 4th argument to `withMerits` that accepts a `precheck_cache` callback. Gateway runs the callback BEFORE rate-limit + deduction. On hit, gateway short-circuits and returns the cached value.

**When to use:** Phase 29 modifies `_shared/merit-gateway.ts` once. Existing feature call-sites (which pass 3 args) are unaffected — TypeScript's optional 4th arg makes this backwards-compatible.

**Example (recommended diff against `merit-gateway.ts:115-198`):**

```typescript
// Source: existing _shared/merit-gateway.ts:84-198 + Phase 29 D-04
export interface MeritGatewayOptions<T> {
  /**
   * Optional cache precheck. Gateway runs this BEFORE rate-limit + deduct.
   * On hit: gateway records a usage_tracking row with credits=0 + analysis_id
   *         and returns the cached value without touching merits.
   * On miss (null): gateway proceeds with normal rate-limit → deduct → fn.
   *
   * D-04, D-12, D-13, D-15.
   */
  precheck_cache?: () => Promise<{ cached: T; analysis_id: string } | null>;
}

export async function withMerits<T>(
  ctx: MeritGatewayContext,
  feature: string,
  fn: (transactionId: string) => Promise<T>,
  options?: MeritGatewayOptions<T>,
): Promise<MeritGatewayResult<T>> {
  // [0] CACHE PRECHECK (Phase 29 D-04) — runs BEFORE rate-limit + deduct.
  if (options?.precheck_cache) {
    const hit = await options.precheck_cache().catch((err) => {
      log.warn('precheck_cache failed — treating as miss', { feature, err: err?.message });
      return null;
    });
    if (hit) {
      // D-13: write usage_tracking row with credits=0 + analysis_id reference.
      const supabase = getServiceClient();
      const { error: usageError } = await supabase.rpc('record_ai_usage', {
        p_user_id: ctx.userId,
        p_action_type: feature,
        p_credits: 0,
        p_analysis_id: hit.analysis_id,   // NEW param added by HIST-01 RPC update
      });
      if (usageError) {
        log.warn('cache-hit usage_tracking write failed', { feature, err: usageError.message });
        // D-08: swallow — the user already gets the cached value.
      }
      log.info('cache-hit', { user_id: ctx.userId, feature, analysis_id: hit.analysis_id });
      // D-15: cache hits bypass rate-limit + deduct. No transaction_id.
      return { ok: true, value: hit.cached, transactionId: 'cache-hit' };
    }
  }

  // [1] rate-limit (unchanged)
  // [2] check_and_deduct_merits(p_idempotency_key) (MER-04 updated RPC)
  // [3] fn(transactionId)
  // [4] caller writes per-feature persist + EdgeRuntime.waitUntil(cacheWrite())
  // ... (existing logic unchanged from merit-gateway.ts:120-197)
}
```

**Notes:**
- `transactionId: 'cache-hit'` is a sentinel string. Callers that need to gate on it can check `=== 'cache-hit'`. Alternative: make `transactionId: string | 'cache-hit'`. Planner picks.
- The `record_ai_usage` RPC needs a new `p_analysis_id uuid NULL` parameter (HIST-01 work). This is included in the same Phase 29 migration that adds the column.
- Existing 3-arg callers (the 5 feature functions today) compile unchanged because the 4th arg is `?:` optional.

### Pattern 4: Merit Idempotency — Partial UNIQUE + RPC update

**What:** Add `idempotency_key text NULL` to `merit_transactions`, partial UNIQUE index where `source = 'feature-deduct'`, and rewrite `check_and_deduct_merits` to accept `p_idempotency_key text` and catch `unique_violation` (SQLSTATE `23505`).

**When to use:** Phase 29 migration `2026MMDD_merit_transactions_idempotency.sql`.

**Example (verbatim recommended migration):**

```sql
-- Source: pattern from supabase/migrations/20260422000000_phase_24_topup.sql:21-38
-- (additive ALTER + partial UNIQUE INDEX IF NOT EXISTS).
-- + RPC update mirrors check_and_deduct_merits signature at 20260415000000:67-152.

-- §1 Additive column on merit_transactions
ALTER TABLE public.merit_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key text NULL;

COMMENT ON COLUMN public.merit_transactions.idempotency_key IS
  'Phase 29 MER-04: client-supplied UUID per submit. Partial UNIQUE index '
  'where source = ''feature-deduct'' prevents double-charge on retry. NULL for '
  'all non-deduct rows (refund, grant, shop-credit, subscription-reset).';

-- §2 Partial UNIQUE index (idempotency dedup at the row level)
-- Postgres docs: https://www.postgresql.org/docs/current/indexes-partial.html
CREATE UNIQUE INDEX IF NOT EXISTS merit_transactions_idempotency_key_unique
  ON public.merit_transactions (idempotency_key)
  WHERE source = 'feature-deduct' AND idempotency_key IS NOT NULL;

-- §3 RPC update: accept p_idempotency_key and short-circuit on duplicate.
CREATE OR REPLACE FUNCTION public.check_and_deduct_merits(
  p_user_id uuid,
  p_feature text,
  p_tier text,
  p_idempotency_key text DEFAULT NULL    -- NEW: nullable for backwards compat
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cost            integer;
  v_sub_balance     integer;
  v_shop_balance    integer;
  v_sub_take        integer;
  v_shop_take       integer;
  v_deduction_id    uuid := gen_random_uuid();
  v_prior_deduction uuid;
BEGIN
  -- 0. Idempotency pre-check (new). If a prior deduct with this key exists,
  --    return its deduction_id without taking the user_merits row lock.
  --    This avoids contention storms when a user double-clicks.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT (metadata->>'deduction_id')::uuid INTO v_prior_deduction
    FROM public.merit_transactions
    WHERE idempotency_key = p_idempotency_key
      AND source = 'feature-deduct'
    LIMIT 1;

    IF v_prior_deduction IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success',           true,
        'transaction_id',    v_prior_deduction,
        'already_deducted',  true
      );
    END IF;
  END IF;

  -- 1. Tier-gated cost lookup (existing logic from 20260415000000:82-91)
  SELECT cost INTO v_cost
  FROM public.merit_feature_costs
  WHERE feature = p_feature AND tier = p_tier;
  IF v_cost IS NULL THEN
    RETURN jsonb_build_object('error', 'tier_locked', 'upgrade_required', true);
  END IF;

  -- 2. Row lock + balance check (existing logic from 20260415000000:93-111)
  SELECT subscription_balance, shop_balance
    INTO v_sub_balance, v_shop_balance
    FROM public.user_merits WHERE user_id = p_user_id FOR UPDATE;
  IF v_sub_balance IS NULL THEN
    RETURN jsonb_build_object('error', 'user_not_found');
  END IF;
  IF (v_sub_balance + v_shop_balance) < v_cost THEN
    RETURN jsonb_build_object('error', 'insufficient_merits', 'upgrade_required', true);
  END IF;

  -- 3. Split deduction (existing 20260415000000:113-115)
  v_sub_take  := LEAST(v_sub_balance, v_cost);
  v_shop_take := v_cost - v_sub_take;

  -- 4. Insert 1 or 2 merit_transactions rows with NEW idempotency_key column.
  --    Wrap in EXCEPTION block to catch race: another concurrent caller
  --    with the same idempotency_key wins; we look up their deduction and
  --    return it as "already_deducted" (NFR-07 retry-storm tolerance).
  BEGIN
    IF v_sub_take > 0 THEN
      INSERT INTO public.merit_transactions
        (user_id, amount, balance_type, source, feature, metadata, idempotency_key)
      VALUES
        (p_user_id, -v_sub_take, 'subscription', 'feature-deduct', p_feature,
         jsonb_build_object('deduction_id', v_deduction_id, 'tier', p_tier),
         p_idempotency_key);
    END IF;
    IF v_shop_take > 0 THEN
      INSERT INTO public.merit_transactions
        (user_id, amount, balance_type, source, feature, metadata, idempotency_key)
      VALUES
        (p_user_id, -v_shop_take, 'shop', 'feature-deduct', p_feature,
         jsonb_build_object('deduction_id', v_deduction_id, 'tier', p_tier),
         p_idempotency_key);
    END IF;
  EXCEPTION
    WHEN unique_violation THEN
      -- A concurrent caller with the same idempotency_key won. Replay theirs.
      SELECT (metadata->>'deduction_id')::uuid INTO v_prior_deduction
      FROM public.merit_transactions
      WHERE idempotency_key = p_idempotency_key
        AND source = 'feature-deduct'
      LIMIT 1;
      RETURN jsonb_build_object(
        'success',           true,
        'transaction_id',    v_prior_deduction,
        'already_deducted',  true
      );
  END;

  -- 5. Update user_merits (existing 20260415000000:134-139)
  UPDATE public.user_merits
    SET subscription_balance = subscription_balance - v_sub_take,
        shop_balance         = shop_balance         - v_shop_take,
        updated_at           = now()
    WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'success',           true,
    'transaction_id',    v_deduction_id,
    'remaining_balance', (v_sub_balance - v_sub_take) + (v_shop_balance - v_shop_take),
    'deducted_from',     jsonb_build_object('subscription', v_sub_take, 'shop', v_shop_take)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_and_deduct_merits(uuid, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.check_and_deduct_merits(uuid, text, text, text)
  TO authenticated, service_role;

-- §4 Verification block (raise on missing artefact — pattern from 20260415000000:468-534)
DO $$
DECLARE v_col integer; v_idx integer;
BEGIN
  SELECT COUNT(*) INTO v_col FROM information_schema.columns
   WHERE table_schema='public' AND table_name='merit_transactions' AND column_name='idempotency_key';
  IF v_col <> 1 THEN RAISE EXCEPTION 'MER-04 column missing'; END IF;

  SELECT COUNT(*) INTO v_idx FROM pg_indexes
   WHERE schemaname='public' AND indexname='merit_transactions_idempotency_key_unique';
  IF v_idx <> 1 THEN RAISE EXCEPTION 'MER-04 partial UNIQUE index missing'; END IF;

  RAISE NOTICE 'Phase 29 MER-04 verification passed: column + partial UNIQUE index in place';
END $$;
```

**Critical Postgres gotcha [CITED: https://www.postgresql.org/docs/current/indexes-partial.html]:** Using `ON CONFLICT (idempotency_key) WHERE source = 'feature-deduct' DO NOTHING` is fragile — the partial-index predicate must match the ON CONFLICT predicate exactly OR Postgres will fail to infer the index. We sidestep the issue by using an `EXCEPTION WHEN unique_violation` block instead, which is more readable and works regardless of how Postgres infers index matches.

### Pattern 5: `resumes` Text Persistence Wiring

**What:** Add `extracted_text text NULL` + `text_hash text NULL` to `resumes`. Wire `analyze-resume` + `ocr-pdf` to populate both on success.

**When to use:** Phase 29 migration + 2 edge-function patches.

**Migration:**

```sql
ALTER TABLE public.resumes
  ADD COLUMN IF NOT EXISTS extracted_text text NULL;

ALTER TABLE public.resumes
  ADD COLUMN IF NOT EXISTS text_hash text NULL;

COMMENT ON COLUMN public.resumes.extracted_text IS
  'Phase 29 CACHE-03: raw text extracted from the resume PDF (client-side or via ocr-pdf). '
  'Populated by analyze-resume on first successful analyze and by ocr-pdf when OCR runs. '
  'Powers deterministic cache fingerprints (CACHE-04) — file_hash is bytes-only and does NOT '
  'identify the same content across re-OCRs.';

COMMENT ON COLUMN public.resumes.text_hash IS
  'Phase 29 CACHE-03: SHA-256 hex digest of extracted_text. Cached via cache-fingerprint.ts. '
  'NULL for rows analyzed before Phase 29 — analyze-resume backfills on the next call.';

CREATE INDEX IF NOT EXISTS resumes_text_hash_idx ON public.resumes (text_hash)
  WHERE text_hash IS NOT NULL;
```

**Edge function wiring:**

In `analyze-resume/index.ts` around the existing `resumes.update({grading_data, overall_score, analyzed_at})` call, extend with `extracted_text: normalizedText` + `text_hash: await sha256Hex(normalizedText)`. The dead `resumeHash` 32-bit fold at lines 389–392 is deleted — its slot is taken by the new SHA-256.

In `ocr-pdf/index.ts` around line 143 (the `Response` return), accept a `resume_id` parameter in the request body and persist:
```typescript
if (resumeId) {
  const textHash = await sha256Hex(fullText);
  await supabase.from('resumes')
    .update({ extracted_text: fullText, text_hash: textHash })
    .eq('id', resumeId);
}
```
Both writes use the service client. **No frontend change required** — frontend just keeps calling `ocr-pdf` as today; persistence happens server-side.

### Pattern 6: `usage_tracking.analysis_id` Column

**What:** Add `analysis_id uuid NULL` (loose FK — no constraint) + update `record_ai_usage` RPC to accept `p_analysis_id uuid DEFAULT NULL`.

**Migration:**

```sql
ALTER TABLE public.usage_tracking
  ADD COLUMN IF NOT EXISTS analysis_id uuid NULL;

COMMENT ON COLUMN public.usage_tracking.analysis_id IS
  'Phase 29 HIST-01: loose FK reference to the originating row in the per-feature table '
  '(resumes / analysis_results / linkedin_grades / saved_jobs / interview_quizzes). '
  'No FK constraint because the referenced table varies by action_type. '
  'Phase 36 reads via LEFT JOIN with NULL-filter for soft-deleted referents (D-16). '
  'NULL on legacy rows; populated by the 5 features on every successful run from Phase 36 onward.';

-- record_ai_usage RPC accepts p_analysis_id — keep parameter nullable
-- to preserve backwards compat with callers that haven't been updated yet.
-- (See migration 20251222220418 for the canonical RPC signature today.)
-- TODO planner: confirm exact existing RPC signature before drafting CREATE OR REPLACE.
```

**Why no FK constraint:** Per D-16, the referenced table varies with `action_type`. Phase 36 reads filter at query time. The existing index on `(user_id, action_type, created_at DESC)` already covers the read pattern. **The query pattern Phase 36 will use:**

```sql
-- Phase 36 read path (not Phase 29)
SELECT ut.*, COALESCE(r.id, lg.id, ar.id, sj.id, iq.id) AS resolved_id
FROM usage_tracking ut
LEFT JOIN resumes r          ON ut.action_type='resume_analysis'   AND r.id=ut.analysis_id
LEFT JOIN linkedin_grades lg ON ut.action_type='linkedin_grading'  AND lg.id=ut.analysis_id
LEFT JOIN analysis_results ar ON ut.action_type IN ('career_compass','recruiting_lens') AND ar.id=ut.analysis_id
LEFT JOIN saved_jobs sj      ON ut.action_type='recruiting_lens'   AND sj.id=ut.analysis_id
LEFT JOIN interview_quizzes iq ON ut.action_type='interview_prep'  AND iq.id=ut.analysis_id
WHERE ut.user_id = $1
ORDER BY ut.created_at DESC;
```

Rows where `analysis_id` was deleted (cascade from `profiles.id`, soft-delete by future tools) come through with `resolved_id IS NULL` and Phase 36 hides them in the UI.

### Anti-Patterns to Avoid

- **Hashing inputs BEFORE truncation.** Causes cache miss on retries with the same logical input. BUDGET-03 (carried-forward v2.0 tech debt) makes this worse because not all features apply per-tier truncation today. Cache-fingerprint helper docstring MUST warn: "callers MUST pass values AFTER truncation to the same cap used in the Claude prompt."
- **`ON CONFLICT (idempotency_key) WHERE source='feature-deduct' DO NOTHING`.** The partial-index inference is fragile per [Postgres docs](https://www.postgresql.org/docs/current/indexes-partial.html). Use `EXCEPTION WHEN unique_violation` instead — pattern verified in `20260422000000_phase_24_topup.sql:147-156`.
- **Cascade DELETE on `usage_tracking.analysis_id`.** D-16 explicitly forbids — audit history must outlive feature-table soft-deletes.
- **Direct DELETE from `analysis_cache` by users.** RLS posture is SELECT-only; a future "re-run without cache" UI needs an RPC, not a frontend DELETE. (Deferred per CONTEXT.md.)
- **Re-using `transactionId` of a cache-hit as a real merit deduction reference.** Use a sentinel like `'cache-hit'` to make it impossible to call `refund_merits(p_transaction_id='cache-hit')` accidentally.
- **Writing the cache row BEFORE the per-feature persist write succeeds.** D-06 violation. A partial/failed persist would poison the cache and serve broken history clicks on every subsequent hit.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Background work post-response | A `setTimeout(0)` + bare `Promise.allSettled` after `return new Response(...)` | `EdgeRuntime.waitUntil(cacheWrite)` | The Supabase runtime explicitly hooks `waitUntil` and keeps the worker alive until the promise resolves. Bare async-fire-and-forget may be killed when the response stream closes. [CITED: https://supabase.com/docs/guides/functions/background-tasks] |
| Idempotency dedup via SELECT-then-INSERT | TOCTOU window: two callers both SELECT empty, both INSERT, both win | Partial UNIQUE index + EXCEPTION WHEN unique_violation | Atomic at the DB layer; pattern proven in `merit_transactions_stripe_pi_unique` ([VERIFIED: `20260422000000_phase_24_topup.sql:36-38`]) |
| SHA-256 in JS | A hand-rolled FNV / 32-bit fold (the dead code at `analyze-resume/index.ts:389-392`) | `crypto.subtle.digest('SHA-256', bytes)` | Already in browsers + Deno; collision-resistant; identical API both sides. The dead 32-bit fold has only ~4 billion possible outputs — guaranteed collisions across millions of resume runs. |
| RLS shape for cache writes | A custom RPC that does INSERT with checks | Service-role-only writes (no INSERT policy) + RLS SELECT-own | Established repo pattern; service role bypasses RLS for `getServiceClient()` writes; users get safe SELECT via RLS. ([VERIFIED: `20260420000000_mig_02_analysis_results_readonly.sql` + `20260414000000_merit_ledger_foundation.sql:63-80`]) |
| Frontend UUID generation | A custom RNG or sequence counter | `crypto.randomUUID()` | Built-in in browsers + Deno; 122 bits of entropy. No third-party dependency. |

**Key insight:** Every load-bearing primitive Phase 29 needs already exists in the codebase, the Supabase runtime, or the Web Crypto standard. The phase is plumbing, not invention. Reject any plan task that proposes a custom hash, custom UUID, custom rate-limiter, or custom RPC dispatcher.

## Runtime State Inventory

This phase is not a rename/refactor — it's additive. Inventory included for completeness because Phase 29 modifies the `check_and_deduct_merits` RPC signature, which IS a stored-procedure rename-equivalent.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `merit_transactions` rows pre-Phase-29: `idempotency_key` will be NULL on legacy rows. Partial UNIQUE index excludes NULL — safe. No data migration needed. | None |
| Live service config | Supabase Edge Functions deploy `check_and_deduct_merits` callers — `merit-gateway.ts` is the ONLY caller of the RPC. All edge functions go through the gateway. No external service holds the old RPC signature. | Single edge-function redeploy after migration |
| OS-registered state | None — Supabase manages function deployment, no Windows Task Scheduler / pm2 / cron involvement | None |
| Secrets/env vars | None — Phase 29 introduces no new secret. `SUPABASE_SERVICE_ROLE_KEY`, `INTERNAL_JOB_SECRET`, `MERIT_SYSTEM_ENABLED` all unchanged | None |
| Build artifacts / installed packages | None — no `npm install` change. Deno edge functions have no installed-package artefacts | None |

**RPC signature change ordering:** The new `check_and_deduct_merits(uuid, text, text, text)` is a different function from the old `check_and_deduct_merits(uuid, text, text)` (Postgres dispatches by arg count). `CREATE OR REPLACE FUNCTION ... DEFAULT NULL` on the new signature creates the 4-arg version. The old 3-arg version remains callable until explicitly dropped. **Recommendation:** keep both signatures live across the migration window. Drop the 3-arg overload in a follow-up forward migration once `merit-gateway.ts` is deployed and verified — NOT in Phase 29.

## Common Pitfalls

### Pitfall 1: BUDGET-03 — Hash Before Truncation

**What goes wrong:** Feature passes `resumeText` (raw, 100KB) to `computeCacheKey()` but slices to 5000 chars before sending to Claude. Retry with the same input produces the same Claude output but a different cache key. Cache never hits.

**Why it happens:** Truncation in `analyze-career/index.ts:857-858` happens AFTER merit deduction and inside the Claude-call branch. Callers naturally pass the pre-truncation value to the cache key.

**How to avoid:** Documented in the `computeCacheKey` docstring + every per-feature call-site (Phases 37–41) MUST hash the truncated value. The plan-checker should reject any task that passes a non-truncated input to `computeCacheKey`.

**Warning signs:** TEST-04 (Phase 41) cache-hit regression test that fires the same input twice and sees a cache miss on the second call — that's the canary. Phase 29 doesn't ship the regression yet, but the helper docstring carries the warning forward.

### Pitfall 2: `unused-row` Stale Data on `analysis_cache`

**What goes wrong:** A user runs Resume Analysis with `targetRole='SWE'`, then re-runs with `targetRole='SWE '` (trailing space). The fingerprint differs because canonicalization is incomplete. User sees an unexplained cache miss.

**Why it happens:** Naive `JSON.stringify` is order-stable for fields but not for whitespace, casing, or Unicode normalization.

**How to avoid:** The `canonicalize()` helper in `cache-fingerprint.ts` MUST `trim()` + `normalize('NFC')` strings. Numbers and booleans pass through `String(v)`. Arrays sort. Objects MUST sort keys.

**Warning signs:** Deno unit test in `cache-fingerprint.test.ts` that asserts `computeCacheKey({inputs: {role: 'SWE'}})` === `computeCacheKey({inputs: {role: 'SWE '}})` (trailing space) and same for `'swe'` vs `'SWE'` (case — for fields where case is semantically irrelevant; left to per-feature caller to choose). Recommended: helper trims + NFC, callers explicitly lowercase if they want case-insensitivity.

### Pitfall 3: `EdgeRuntime.waitUntil` Cap Exceeded

**What goes wrong:** Cache write takes > 150 s (free) / 400 s (paid). Function terminates before the INSERT lands.

**Why it happens:** Pathological — but possible if Postgres is under heavy load or the Supabase routing layer hiccups.

**How to avoid:** Cache INSERT is ~1 row, ~10 KB jsonb. Realistic latency is <100 ms. The 150-s cap is essentially infinite for this workload. Document the cap in the helper for posterity but don't engineer for it.

**Warning signs:** Edge-function logs showing `analysis_cache` row count not matching Claude-call count (i.e., misses outnumber writes). If this ever appears, switch to in-band write before `jsonResponse()` — NFR-06 will degrade slightly but correctness is restored.

### Pitfall 4: Idempotency Key Reuse Across User Sessions

**What goes wrong:** User clears localStorage; new session generates new UUIDs; old UUIDs remain in `merit_transactions.idempotency_key` forever. Storage grows linearly with usage.

**Why it happens:** No TTL on `idempotency_key`.

**How to avoid:** Acceptable trade-off. `merit_transactions` is an append-only audit log — it grows linearly anyway. The new column is `text NULL`, ~36 bytes per UUID. At 10K analyses/day, that's ~130 MB/year of column overhead. Storage is cheap.

**Warning signs:** None expected. If Phase 46 (lifecycle / archival) wants to drop old `idempotency_key` values, it can do so safely after 90 days — the dedup window is operationally <1 minute.

### Pitfall 5: Forgetting RLS on `analysis_cache` and Leaking Cross-User Outputs

**What goes wrong:** RLS not enabled on `analysis_cache`; a user with the right anon-key SELECTs another user's cached JSON.

**Why it happens:** Forgetting `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` is the single most common Postgres security mistake.

**How to avoid:** Migration verification block runs `SELECT relrowsecurity FROM pg_class WHERE relname='analysis_cache'` and raises EXCEPTION if false. Pattern verified in `20260415000000_merit_rpcs.sql:482-534`.

**Warning signs:** A staging SQL probe: `SET ROLE authenticated; SET request.jwt.claims TO '{"sub":"<userA>"}'; SELECT count(*) FROM analysis_cache WHERE user_id = '<userB>';` MUST return 0 (RLS denies). This is recommended TEST-01 manual QA.

### Pitfall 6: Per-Feature Persist Failure Poisons Cache

**What goes wrong:** Per-feature INSERT (e.g. `linkedin_grades.insert(...)`) succeeds, cache INSERT fires inside `waitUntil`, then a bug in Phase 37–41 inserts the wrong `raw_response` shape into cache. Future hits return broken data.

**Why it happens:** Caller mistakes the cache value for an intermediate Claude response shape instead of the final response shape.

**How to avoid:** The `withMerits` precheck callback returns `{ cached: T; analysis_id }` where `T` is the SAME type that `fn(transactionId)` returns. If the feature handler returns the final response shape, the cache stores that same shape. Plan-checker should reject any task that diverges the two.

**Warning signs:** A Phase 37–41 feature test where cache-hit-second-call rendering doesn't match cache-miss-first-call rendering pixel-for-pixel.

## Code Examples

### Computing a cache key from a feature handler (Phase 37+ pattern — NOT Phase 29)

```typescript
// Source: derived from analyze-resume/index.ts:328-342 + Phase 29 cache-fingerprint.ts
import { computeCacheKey } from '../_shared/cache-fingerprint.ts';
import { getServiceClient } from '../_shared/supabase-client.ts';

// Inside a feature handler (Phase 37 example):
const supabase = getServiceClient();
const cacheKey = await computeCacheKey({
  user_id: ctx.userId,
  feature: 'resume_analysis',
  tier: resolvedTier,
  variant: null,
  inputs: {
    text_hash: resume.text_hash,            // post-OCR, post-truncation
    targetRole: targetRole.slice(0, 200),    // post-truncation
    targetIndustry: targetIndustry.slice(0, 200),
    previousScore: previousScore ?? 0,
    // previousSuggestions hashed to avoid array-order sensitivity
    previousSuggestions_hash: (previousSuggestions ?? [])
      .map(s => s.title ?? '').sort().join('|'),
  },
});

const gated = await withMerits(
  meritCtx, 'resume_analysis',
  async (txId) => {
    // ... existing Claude call + per-feature persist ...
    const final = await runClaudeAndPersist(...);

    // CACHE-12: write AFTER persist succeeds.
    EdgeRuntime.waitUntil((async () => {
      const { error } = await supabase.from('analysis_cache').insert({
        cache_key: cacheKey,
        feature: 'resume_analysis',
        tier: resolvedTier,
        variant: null,
        user_id: ctx.userId,
        raw_response: final,
      });
      if (error && error.code !== '23505') {  // 23505 = UNIQUE violation — D-08 silent
        log.warn('cache-write-failed', { cache_key, err: error.message });
      }
    })());

    return final;
  },
  {
    // CACHE-09: precheck on cache.
    precheck_cache: async () => {
      const { data } = await supabase
        .from('analysis_cache')
        .select('id, raw_response')
        .eq('cache_key', cacheKey)
        .maybeSingle();
      if (!data) return null;

      // Bump hit_count + last_hit_at — fire and forget, don't block hit return.
      EdgeRuntime.waitUntil((async () => {
        await supabase.from('analysis_cache')
          .update({ hit_count: data.hit_count + 1, last_hit_at: new Date().toISOString() })
          .eq('id', data.id);
      })());

      return { cached: data.raw_response, analysis_id: data.id };
    },
  },
);
```

### Frontend idempotency-key hook (Phase 31 — Phase 29 ships the helper)

```typescript
// src/hooks/useIdempotencyKey.ts — Phase 29 ships; Phase 31 wires per feature.
import { useRef, useCallback } from 'react';

/**
 * Generates a stable idempotency key per logical submit.
 * Same key returned for retries (AbortController re-fire, double-click) until reset().
 * A new submit MUST call reset() before calling current() again.
 */
export function useIdempotencyKey() {
  const keyRef = useRef<string | null>(null);

  const current = useCallback(() => {
    if (keyRef.current === null) {
      keyRef.current = crypto.randomUUID();
    }
    return keyRef.current;
  }, []);

  const reset = useCallback(() => {
    keyRef.current = null;
  }, []);

  return { current, reset };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Promise.allSettled` post-response background work | `EdgeRuntime.waitUntil(promise)` | Supabase released Background Tasks support 2024 [CITED: https://supabase.com/blog/edge-functions-background-tasks-websockets] | Worker stays warm until promise resolves; survives response-stream close. |
| 32-bit FNV/fold hashes for cache keys | SHA-256 (`crypto.subtle.digest`) | Web Crypto API available in all targets since 2017 | 256-bit entropy vs ~4 billion. Eliminates collision risk. |
| SELECT-then-INSERT idempotency check | Partial UNIQUE index + EXCEPTION WHEN unique_violation | Postgres 9.5+ ON CONFLICT (2016); pattern proven in repo `20260422000000_phase_24_topup.sql` | Atomic; no TOCTOU window. |
| Composite cache key (multiple cols, multiple indexes) | Single canonical SHA-256 column + single btree UNIQUE | Industry standard for content-addressed caches | One index lookup; NFR-02 <100ms p95 trivially met. |

**Deprecated/outdated:**
- `analyze-resume/index.ts:389-392` 32-bit `resumeHash` fold — never consumed downstream. Replaced by Phase 29's SHA-256 via `cache-fingerprint.ts`. Plan task: delete the dead code.
- `usage_tracking` ±5-min proximity matcher at `AnalysisHistory.tsx:255-269` — replaced by explicit `analysis_id` FK link. Phase 29 ships the column; Phase 36 swaps the matcher to a LEFT JOIN.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The existing `record_ai_usage` RPC accepts a NULL-defaulted `p_analysis_id` after migration without breaking legacy callers. | Pattern 6 / withMerits precheck | LOW — Postgres `CREATE OR REPLACE FUNCTION` with new NULL-defaulted param is non-breaking. Confirmable in Phase 29 by reading `migrations/20251222220418_b52662bb*.sql` and writing the diff against current signature. Planner should read the existing RPC verbatim before drafting the update. |
| A2 | Resume Analysis test_hash hashing the FULL extracted text (not a per-tier truncation) is correct because resume text isn't truncated in `analyze-resume` today. | Code example Phase 37 | MEDIUM — confirmed by `analyze-resume/index.ts:334` slicing to `MAX_TEXT_SIZE` (100KB). The text_hash should be computed AFTER that slice. Verified: the slice is global, not per-tier. Safe. |
| A3 | NFR-02 (cache lookup <100ms p95) is met by a single btree UNIQUE index lookup against a table that grows to ~10K rows/user × ~1K users = ~10M rows. | Pattern 1 | LOW — btree lookups on UNIQUE indexes are O(log n). 10M rows = ~24 disk seeks worst case; Supabase Postgres serves these from RAM in single-digit ms. No perf concern. |
| A4 | The recommended idempotency-hit replay shape (Option C — treat as fresh Claude call, see below) is the right operational choice for Phase 29's launch. | Open Questions | MEDIUM — operational judgment, not verifiable in code. Surfaced as a research-flagged decision needing user confirmation in `/gsd-discuss-phase` if planner doesn't lock it in plan-phase. |
| A5 | The frontend `useIdempotencyKey` hook lands in Phase 29 as a shipping helper but is wired into the 5 feature pages in Phase 31 (Optimistic UI). | Architecture diagram | LOW — matches the roadmap split (Phase 29 = substrate; Phase 31 = MER-03/05/06 optimistic UI). Confirmable against ROADMAP.md Phase 31 entry. |
| A6 | `merit_transactions.source = 'feature-deduct'` is the canonical discriminator. (Other values in use: `'feature-refund'`, `'shop-credit'`, `'subscription-reset'`.) | Pattern 4 | LOW — verified by reading `20260415000000_merit_rpcs.sql:122`, `:207`, `:340`, `:411`. |

**If user confirms A4 differently:** planner adjusts the `withMerits` post-deduct branch shape in Pattern 3 accordingly. No DDL change.

## Open Questions

1. **`check_and_deduct_merits` idempotency-hit replay shape** (CONTEXT.md Specific Ideas)

   **What we know:** The RPC will return `{ success: true, transaction_id, already_deducted: true }` on dedup hit. The frontend's UUID covers the deduct atomically. What it does NOT cover is the Claude work — if the first request crashed after deduct but before Claude returned, the second request finds the prior deduction but no analysis to replay.

   **What's unclear:** Three options on the table:
   - **(a) Look up prior analysis via the `analysis_id` linkage and replay cached output.** Requires the original deduct to have recorded an `analysis_id` — which it doesn't today. Would require a new column on `merit_transactions` and a write-after-Claude-succeeds path. Net: +1 migration, +1 query per dedup hit. Complexity high.
   - **(b) Throw 409 to the frontend with "duplicate submit"** so the frontend re-fetches from AnalysisHistory. Simple. But: the frontend then needs to know how to recover (poll history? hard-refresh?), and the user's UX is "wait then suddenly the result appears" which is confusing.
   - **(c) Treat as fresh Claude call.** Only the deduct is idempotent. The second request runs Claude again, persists again, caches again. Loses the original analysis (the first-request crash victim) but never double-charges. Simplest. Mildly wasteful of Claude tokens on rare retry storms.

   **Recommendation:** **Option (c).** Rationale:
   - **Frequency:** Idempotency dedup hits happen on user double-click or network retry — both common, both within seconds of each other. The first request has either succeeded (cache hit on the second covers it) OR failed (legitimately needs a fresh Claude call).
   - **Resume Analysis is most exposed.** A 30-second Claude call has a wider retry window. But Resume Analysis ALSO has the most reliable per-feature persist path (writes to `resumes.grading_data`), so a successful first run + retry second click results in a CACHE hit on the second call (because by then `text_hash + targetRole + tier` produces the same `cache_key` and the cache row was written). Option (c) degrades gracefully into the cache layer.
   - **Worst case for (c):** First request crashes during Claude streaming after deduct. Second request finds the dedup hit, runs Claude again, succeeds. User is charged once (idempotency held); Strivo eats one extra Claude call. Acceptable.
   - **(a) requires schema churn** for an edge case that's mostly absorbed by the cache layer anyway. **(b) creates a UX cliff** for an issue users can't articulate.

   **How to handle:** Planner SHOULD lock (c) in the plan. If the planner wants to be conservative, run `/gsd-discuss-phase` to confirm with the operator.

2. **Should `cache-fingerprint.ts` ship with two-pass hashing as recommended, or single-pass?**

   **What we know:** Single-pass = one SHA-256 over the concatenated canonical string. Two-pass = each component hashed individually, then a final hash over the concatenation of those hex digests. Single-pass is ~50% faster. Two-pass is debug-friendlier (log component hashes to find which input drifted).

   **What's unclear:** Whether the debugging value is worth the extra 50 µs.

   **Recommendation:** **Two-pass.** Cache-key drift is the most common cache bug ("why isn't my cache hitting?"), and being able to log component hashes from a single edge-function call to find "the `targetRole` hash changed" is operationally invaluable. The 50 µs cost is invisible against the 30-second Claude call.

3. **Should the `cache-fingerprint.ts` Deno unit test live next to the helper or under `__tests__/`?**

   **What we know:** Established repo pattern is `_shared/foo.test.ts` next to `_shared/foo.ts` (`merit-gateway.test.ts`, `auth.test.ts`, `rate-limiter.test.ts` all follow this). There IS a `__tests__/` directory but it holds test fixtures, not test files.

   **Recommendation:** Sibling `_shared/cache-fingerprint.test.ts`. Matches every other shared helper.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Deno 2+ | Edge functions + Deno tests | ✓ (assumed — verified in repo `deno.json` + working CI) | per `deno.json` | — |
| `npm` + Node 22 | Frontend build + Vitest | ✓ | per `package.json` `engines` (and CLAUDE.md "Node 22+") | — |
| Supabase CLI 2.92+ | Migration apply | ✓ (per `package.json` devDeps `supabase@^2.92.0`) | 2.92.0 | — |
| `crypto.subtle.digest` (SHA-256) | `cache-fingerprint.ts` | ✓ (Web Crypto in Deno + browsers) | n/a — built-in | — |
| `EdgeRuntime.waitUntil` | Cache write timing (D-05) | ✓ (verified at `analyze-resume/index.ts:1388` already in use; Supabase docs confirm support) | Supabase Deno runtime built-in | `Promise.allSettled` post-response (DEFENSIVE only) |
| `gen_random_uuid()` (pgcrypto) | Migration DDL defaults | ✓ (already used in `merit_transactions`, `user_merits`, `analysis_cache` schema) | Postgres extension | — |
| pgTAP runner | Optional — pgTAP for RLS regressions | ✗ | — | Use Deno integration test against staging Supabase instead |
| Docker (for local pgTAP) | Optional | ✗ (operator-deferred from v2.0 Phase 11) | — | Skip pgTAP; rely on Deno integration test + manual SQL inspection |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** pgTAP — operator-deferred. Phase 29 should NOT block on pgTAP. Use Deno integration tests against a staging Supabase project for TEST-02 (merit idempotency). Manual SQL inspection in staging covers the RLS verification ASVS V4 control. Document this trade-off in the plan; flag to operator if any TEST-01 fix later genuinely needs pgTAP.

## Validation Architecture

> nyquist_validation is `true` in `.planning/config.json` — section included.

### Test Framework

| Property | Value |
|----------|-------|
| Frameworks | Deno test (Deno 2+ built-in) for `_shared/*` and any new SQL-touching edge logic; Vitest 1.6.1 for `src/hooks/useIdempotencyKey` |
| Config file | `supabase/functions/deno.json` (Deno); `vitest.config.ts` implied by `package.json` `"test": "vitest run"` |
| Quick run command (Deno) | `cd supabase/functions && deno test _shared/cache-fingerprint.test.ts --no-check --allow-env --allow-net --allow-read` |
| Quick run command (Vitest) | `npm run test -- src/hooks/useIdempotencyKey.test.ts` |
| Full Deno suite | `.\scripts\run-edge-tests.ps1` |
| Full Vitest suite | `npm run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CACHE-01 | `analysis_cache` table exists with correct shape + RLS | manual SQL inspection (staging) | `\d+ public.analysis_cache` + `SELECT * FROM pg_policies WHERE tablename='analysis_cache'` in Supabase SQL editor | ❌ — staging probe documented in plan |
| CACHE-01 | RLS enforces user-scoping (cross-user SELECT returns 0) | manual SQL inspection (staging) | `SET request.jwt.claims TO '{"sub":"<otherUser>"}'; SELECT count(*) FROM analysis_cache;` returns 0 | ❌ — staging probe documented in plan |
| CACHE-02 | `computeCacheKey` is deterministic + canonicalizes correctly | Deno unit | `deno test _shared/cache-fingerprint.test.ts -A` | ❌ Wave 0 — new file |
| CACHE-02 | Same inputs in different key order produce same hash | Deno unit | (same file) | ❌ Wave 0 |
| CACHE-02 | Trimmed-vs-untrimmed-vs-NFC-normalized variants produce same hash | Deno unit | (same file) | ❌ Wave 0 |
| CACHE-02 | Different `user_id` ALWAYS produces different hash | Deno unit | (same file) | ❌ Wave 0 |
| CACHE-03 | `resumes.extracted_text` + `text_hash` columns exist | manual SQL | `\d+ public.resumes` | ❌ — staging probe |
| CACHE-03 | `analyze-resume` populates both on a successful analyze | manual end-to-end | Upload + analyze a resume in staging → query `resumes` row → assert non-NULL | ❌ — staging QA checklist |
| CACHE-03 | `ocr-pdf` populates `extracted_text` + `text_hash` when given a `resume_id` | Deno integration | `deno test ocr-pdf/__tests__/*.test.ts` (new) OR manual staging E2E | ❌ Wave 0 (decision: planner picks integration vs manual) |
| CACHE-09 | `withMerits` precheck short-circuits before rate-limit + deduct | Deno integration (against staging Supabase) | extends existing `merit-gateway.rate.test.ts` pattern | ❌ Wave 0 — extends |
| CACHE-10 | Cache hit writes `usage_tracking` row with `credits=0` + `analysis_id` | Deno integration | (same file as CACHE-09) | ❌ Wave 0 |
| CACHE-11 | RLS on `analysis_cache` blocks cross-user SELECT | manual SQL | (see CACHE-01 RLS test) | ❌ |
| CACHE-12 | Cache write happens AFTER per-feature persist | code review + integration | reviewer checks `withMerits` precheck contract; Deno integration asserts ordering | partial Wave 0 |
| HIST-01 | `usage_tracking.analysis_id` column exists | manual SQL | `\d+ public.usage_tracking` | ❌ |
| **MER-04** | **Merit idempotency: same key twice = one deduct, returns `already_deducted`** | **Deno integration (TEST-02)** | **`deno test _shared/merit-gateway.idempotency.test.ts -A` (new file against staging)** | **❌ Wave 0 — CANONICAL regression** |
| MER-04 | `merit_transactions` partial UNIQUE index exists | manual SQL | `SELECT indexdef FROM pg_indexes WHERE indexname='merit_transactions_idempotency_key_unique'` | ❌ |
| NFR-01 | All 4 migrations re-run safely | manual | apply migration twice in staging; second apply should NOTICE without error | ❌ — staging QA |
| NFR-02 | Cache lookup <100 ms p95 in staging | manual perf probe | `SELECT * FROM analysis_cache WHERE cache_key=$1` via psql `\timing on` over 100 calls | ❌ — accepted as analytical (single btree lookup; no need for harness) |
| NFR-05 | Existing 5 features still work end-to-end | smoke (existing) | `.\scripts\run-edge-tests.ps1` + manual UI smoke | ✅ — existing tests cover |
| NFR-06 | Cache write doesn't block response | code review + log inspection | reviewer asserts `EdgeRuntime.waitUntil` wraps every cache INSERT; log shows TTFB unchanged | partial |
| NFR-07 | Idempotency tolerates retry storms (concurrent same-key) | Deno integration | `merit-gateway.idempotency.test.ts` fires N parallel requests with same key | ❌ Wave 0 |
| TEST-01 | Per-fix automated or manual QA | all above | combined | partial |
| **TEST-02** | **Merit idempotency regression** | **Deno integration (above)** | **(same as MER-04 line)** | **❌ Wave 0** |

### Sampling Rate

- **Per task commit:** `npm run test` (Vitest, frontend hook coverage) + `deno test _shared/cache-fingerprint.test.ts -A` (cache helper)
- **Per wave merge:** `.\scripts\run-edge-tests.ps1` (full Deno suite, includes existing `merit-gateway.*.test.ts` + new `merit-gateway.idempotency.test.ts` + new `cache-fingerprint.test.ts`)
- **Phase gate:** Full edge suite green + staging migration apply + staging RLS/UNIQUE inspection checklist (documented in plan) green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `supabase/functions/_shared/cache-fingerprint.ts` — covers CACHE-02
- [ ] `supabase/functions/_shared/cache-fingerprint.test.ts` — Deno unit tests for determinism + canonicalization
- [ ] `supabase/functions/_shared/merit-gateway.idempotency.test.ts` — Deno integration test for TEST-02 (canonical regression). Runs against staging Supabase; gated on `DENO_TEST_SUPABASE_LOCAL=1` per `merit-gateway.rate.test.ts` precedent.
- [ ] `src/hooks/useIdempotencyKey.ts` + `useIdempotencyKey.test.ts` (Vitest) — Phase 29 ships hook; Phase 31 wires per feature
- [ ] Staging migration-apply + manual SQL inspection checklist (one row per CACHE-01/CACHE-03/CACHE-11/HIST-01/MER-04). Lives as a section in plan's VERIFICATION artifact, not a test file.
- [ ] No framework install needed — Deno + Vitest already in place.

**pgTAP NOT required for Phase 29.** Operator-deferred from v2.0 Phase 11; flagged here for the record. The Deno integration test + manual SQL inspection cover the RLS and UNIQUE constraint regressions without Docker.

## Security Domain

> `security_enforcement` not explicitly configured; assumed enabled per CLAUDE.md's strict-mode posture.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (inherits from existing — no change) | `requireAuth` / `requireInternalOrUserAuth` in `_shared/auth.ts` — unchanged in Phase 29 |
| V3 Session Management | no (inherits — no change) | Supabase JWT; unchanged |
| V4 Access Control | yes | RLS SELECT-own on `analysis_cache` (D-03); service-role-only writes; no INSERT/UPDATE/DELETE policy. Mirrors `analysis_results` MIG-02 lock. SECURITY DEFINER on `check_and_deduct_merits` with `SET search_path = public, pg_temp` (existing hardening). |
| V5 Input Validation | yes | `idempotency_key` validated as UUID-shaped string in the handler before passing to RPC. Empty/null is acceptable (RPC handles). `crypto.randomUUID()` output is well-formed by construction on the frontend. |
| V6 Cryptography | yes | `crypto.subtle.digest('SHA-256', ...)` — Web Crypto standard. **Never hand-roll a hash** (kill the 32-bit FNV at `analyze-resume:389-392`). |

### Known Threat Patterns for Supabase Edge + Postgres Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-user cache leak via crafted JWT | Information disclosure | RLS `auth.uid() = user_id` on `analysis_cache` + `user_id` baked into `cache_key` (defense in depth, D-01 + D-03) |
| Double-charge via double-submit | Tampering | Partial UNIQUE index on `merit_transactions(idempotency_key) WHERE source='feature-deduct'` + RPC EXCEPTION WHEN unique_violation (MER-04) |
| Cache poisoning via partial response | Tampering / Repudiation | D-06 ordering: cache write happens AFTER per-feature persist succeeds. Failed Claude / failed persist never writes cache. |
| Resource exhaustion via retry storms | DoS | Existing pooled 60/hr `ai-analyses-all` rate limit applies to cache MISSES. Cache HITS bypass (D-15) — but cache hits are cheap (one btree lookup + one usage_tracking INSERT). Acceptable. |
| RPC privilege escalation | Elevation of privilege | `SECURITY DEFINER` + `SET search_path = public, pg_temp` on the rewritten `check_and_deduct_merits` (mirrors existing hardening verified in `20260415000000_merit_rpcs.sql:71`). Verification block asserts. |
| SQL injection via idempotency_key body field | Tampering | Treated as opaque text; passed as RPC parameter (parameterized — not concatenated). Postgres prepared-statement semantics block injection. |
| Timing-attack on idempotency dedup | Information disclosure | Not exploitable — dedup hit returns a string `transaction_id` derived from existing rows; an attacker without `user_id` access can't enumerate it. |

**Specific note on `idempotency_key`:** The key is supplied by the client and stored verbatim. No PII concerns — it's a UUID. Length cap recommended: validate `key.length <= 64` at the handler to prevent storage abuse. Zod schema: `z.string().uuid().optional()`.

## Sources

### Primary (HIGH confidence)

- [Supabase Background Tasks docs](https://supabase.com/docs/guides/functions/background-tasks) — verified `EdgeRuntime.waitUntil` API + 150s/400s caps
- [Supabase blog: Background Tasks, Ephemeral Storage, WebSockets](https://supabase.com/blog/edge-functions-background-tasks-websockets) — confirms support and usage shape
- [PostgreSQL docs: Partial Indexes](https://www.postgresql.org/docs/current/indexes-partial.html) — confirms partial UNIQUE behavior + ON CONFLICT inference rules
- Codebase: `supabase/migrations/20260415000000_merit_rpcs.sql` — canonical SECURITY DEFINER RPC template + verification block pattern
- Codebase: `supabase/migrations/20260420000000_mig_02_analysis_results_readonly.sql` — RLS SELECT-own template for `analysis_cache`
- Codebase: `supabase/migrations/20260422000000_phase_24_topup.sql:36-38` — canonical partial UNIQUE index + `unique_violation` catch pattern (basis for MER-04)
- Codebase: `supabase/migrations/20260414000000_merit_ledger_foundation.sql:14-80` — canonical `CREATE TABLE IF NOT EXISTS` + RLS pattern
- Codebase: `supabase/migrations/20260429000000_add_merit_transaction_id_to_analysis_jobs.sql` — canonical `ALTER TABLE ADD COLUMN IF NOT EXISTS` + `COMMENT ON COLUMN` pattern
- Codebase: `supabase/functions/analyze-resume/index.ts:1388` — verified `EdgeRuntime.waitUntil` already used in production
- Codebase: `supabase/functions/_shared/merit-gateway.ts:115-198` — verified `withMerits` signature and refund classification
- Codebase: `src/pages/Upload.tsx:142-148` — verified `crypto.subtle.digest('SHA-256', ...)` pattern already in use
- Codebase: `supabase/functions/_shared/merit-gateway.test.ts` — verified Deno test pattern + std@0.224.0 imports

### Secondary (MEDIUM confidence)

- [Medium: Why PostgreSQL's ON CONFLICT can't find my partial unique index](https://betakuang.medium.com/why-postgresqls-on-conflict-cannot-find-my-partial-unique-index-552327b85e1) — confirms the partial-index ON CONFLICT inference fragility; basis for recommending EXCEPTION WHEN unique_violation instead
- [DEV.to: Supabase Edge Functions Background Tasks](https://dev.to/supabase/supabase-edge-functions-introducing-background-tasks-ephemeral-storage-and-websockets-pe) — secondary corroboration of `EdgeRuntime.waitUntil` semantics

### Tertiary (LOW confidence)

- None. All claims are either codebase-verified or cited from Supabase/PostgreSQL official docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every dependency exists in repo or in Supabase runtime; no new installs
- Architecture: HIGH — patterns proven by existing migrations (`20260415000000`, `20260420000000`, `20260422000000`, `20260429000000`)
- Pitfalls: HIGH — each pitfall maps to a specific repo path or to a Postgres official doc
- Idempotency-hit replay shape (Open Question 1): MEDIUM (operational judgment; recommended Option C with explicit rationale)
- API shape of `computeCacheKey` (Open Question 2): MEDIUM (planner discretion per CONTEXT.md; recommended two-pass with explicit rationale)

**Research date:** 2026-05-12
**Valid until:** 2026-06-11 (30 days — substrate concerns are stable; the only fast-moving piece is Supabase Edge runtime updates which only ADD features, never remove `EdgeRuntime.waitUntil`)
