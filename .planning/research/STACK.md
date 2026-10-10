# Stack Research

**Domain:** Brownfield reliability/trust hardening of an AI-analysis platform (Supabase Edge/Deno + Postgres + React/Vite + Anthropic Claude)
**Milestone:** v5.0 — Platform Trust, Reliability & Intelligence
**Researched:** 2026-06-25
**Confidence:** HIGH (all claims grounded in the live codebase + migrations; zod version cross-checked against npm)

## Headline

**This milestone needs ZERO new runtime dependencies and ZERO new infrastructure.** All three target
capabilities (shared analysis lifecycle, multi-origin CORS, strict LLM output validation) are buildable
entirely from **Postgres primitives already proven in this schema**, the existing `_shared/` layer, and
**zod 3.25.76 which is already vendored in both surfaces**. The work is *new code on existing substrate*,
not new tooling. Everything below is "reuse / extend X" — the only "add" is a handful of additive,
roll-forward SQL migrations (new columns, new CHECK values, new partial indexes) and 2-3 new `_shared/`
TypeScript modules that import only what is already in the tree.

The single most important framing for the roadmapper: **the v5.0 lifecycle is an EXTENSION of
`analysis_jobs` + the Merit RPCs, not a greenfield state-machine engine.** Do not introduce a workflow
library, a queue, or an ORM.

---

## Recommended Stack

### Core Technologies (all already in the repo — reuse, do not add)

| Technology | Version (pinned) | Purpose for v5.0 | Why reuse, not replace |
|------------|------------------|------------------|------------------------|
| PostgreSQL (Supabase-managed) | 15.x (Supabase prod/preview) | Lifecycle state machine, idempotency, atomic Merit reserve/settle/refund | Already hosts `analysis_jobs`, `analysis_cache`, `merit_transactions`, all Merit RPCs. Advisory locks, partial unique indexes, CHECK constraints, `SECURITY DEFINER` RPC transactions are all in production use today. No external queue/Redis can match the transactional guarantees the Merit ledger already relies on. |
| Deno (Supabase Edge runtime) | Deno 2 (Supabase platform) | All edge logic: lifecycle orchestration, CORS, output validation | Existing 20+ functions; `npm:` specifiers AND `https://esm.sh` / `deno.land/std` URL imports both already work here. |
| `@supabase/supabase-js` | `npm:@supabase/supabase-js@2` (edge) / `^2.108.2` (frontend) | Service-role DB writes (RLS-bypassing) + RPC calls from edge; auth/reads from frontend | Already the only DB access layer. `getServiceClient()` singleton in `_shared/supabase-client.ts`. |
| zod | **3.25.76** (frontend npm `^3.25.76` + edge `https://esm.sh/zod@3.25.76`) | Strict LLM output validation schemas (Q3) | **Already imported in a Deno edge function** (`_shared/types/interviewPrep.ts:4`) at this exact pin, and a frontend dependency. Same version on both sides = shared schema shapes with zero new install. |
| Anthropic Claude (direct fetch) | API `2023-06-01`, `prompt-caching-2024-07-31` beta | The generation step inside the lifecycle | `_shared/anthropic.ts` `invokeAnthropicText` / `streamAnthropicText` already returns the discriminated `{ ok:false; status; error }` shape the lifecycle's retry/refund taxonomy keys off. No SDK — keep it that way. |
| `deno.land/std` (http server, crypto) | `std@0.168.0` (`serve`), `std@0.224.0` (`timing_safe_equal`) | Request handling + constant-time secret compare | Existing convention. CORS work needs nothing beyond `Request`/`Response` + `URL`. |

### Supporting Libraries (already present — the v5.0 work composes these)

| Library / Module | Version | Purpose | When used in v5.0 |
|------------------|---------|---------|-------------------|
| `_shared/merit-gateway.ts` (`withMerits`, `MeritRefundable`, `refundMeritsForJob`, `isRefundableAnthropicError`) | in-repo | Atomic reserve → settle/refund, with a NARROW refund taxonomy (5xx/529/408/AbortError/network) | The lifecycle's `reserving_merits` → `refunded` legs wrap or call these. The refund taxonomy is the canonical "only-transient" classifier. |
| `_shared/json-repair.ts` (`repairTruncatedJSON`) | in-repo | Strip markdown fences/preamble, escape control chars, repair truncated JSON | Step 1 of output validation (the "formatting-wrapper stripping + truncation detection" the requirement names). |
| `_shared/json-repair` + hand-rolled validators (`grade-linkedin/validation.ts`, `_shared/result-merger.ts`, `recruiting-lens-merger.ts`, `interview-prep-validation.ts`) | in-repo | Existing strict-validation precedents (required fields, score-range, sum reconciliation, clamping) | Pattern to generalize into a shared validator; some can be re-expressed as zod schemas, others (e.g. LinkedIn deterministic score sum) stay as `.superRefine`. |
| `_shared/cors.ts` (`corsHeaders`, `handleOptionsRequest`) | in-repo | CORS source of truth (currently single-origin) | The Q2 work **rewrites this module's internals** — same exported surface, multi-origin allowlist behavior. |
| `_shared/auth.ts`, `_shared/rate-limiter.ts`, `_shared/logger.ts`, `_shared/supabase-client.ts` | in-repo | Auth, abuse limiting, structured logging, service client | Lifecycle orchestration calls these unchanged. |
| `_shared/cache-fingerprint.ts` + `analysis_cache` | in-repo | Deterministic SHA-256 cache key (user_id-salted) | The lifecycle's "deliberate new run = new record, duplicate = reuse" semantics layer on the existing precheck/cache-hit short-circuit in `withMerits`. |

### Development Tools (no change)

| Tool | Purpose | Notes |
|------|---------|-------|
| `verify:baseline` (vitest + deno + Playwright) | Blocking regression gate | v5.0 EXTENDS this (add lifecycle/CORS/validation tests). Do not bypass; `-SkipVerify` is emergency-only. |
| Deno test (`deno task test:ci`) | Edge-unit coverage (704 tests) | New `_shared/lifecycle.ts`, `_shared/cors.ts`, `_shared/llm-validation.ts` get colocated `.test.ts` files in the same task list. |
| Supabase migrations + preview→prod operator gate | Schema changes | Every v5.0 migration is additive + roll-forward + rollback-documented (the v4.0 Phase-8 discipline). Claude is read-only on prod. |

## Installation

```bash
# NOTHING to install for the runtime. The three capabilities add no npm/deno deps.
#
# Frontend (already satisfied): zod ^3.25.76 is in package.json.
# Edge (already satisfied): https://esm.sh/zod@3.25.76 already imported by
#   supabase/functions/_shared/types/interviewPrep.ts
#
# v5.0 net-new artifacts are CODE, not packages:
#   - supabase/migrations/<new>_*.sql        (additive lifecycle columns/indexes/CHECK + RPCs)
#   - supabase/functions/_shared/lifecycle.ts        (orchestration helper)   [new]
#   - supabase/functions/_shared/llm-validation.ts   (zod + json-repair glue) [new]
#   - supabase/functions/_shared/cors.ts             (rewrite internals)      [edit]
```

---

## Capability 1 — Shared persistent AI-analysis lifecycle / state machine

**Verdict: extend `analysis_jobs` + the Merit RPCs. Add NO queue, NO Redis, NO workflow engine.**

### What ALREADY exists and should be REUSED (do not rebuild)

| Existing artifact | What it already gives you | v5.0 reuse |
|-------------------|---------------------------|------------|
| `public.analysis_jobs` (migration `20260225160000` + extensions) | A persistent job row with `status text + CHECK`, `payload jsonb`, `result jsonb`, `error jsonb`, `attempts`/`max_attempts`, `available_at`/`claimed_at`/`completed_at`/`created_at`/`updated_at`, `last_http_status`, `last_error_message`, `function_version`, `worker_id`, **`merit_transaction_id uuid`** | This **IS** the lifecycle table. The v5.0 state machine is a superset of its current columns. |
| OCC claim pattern (`process-resume-analysis-job` claim loop) | Concurrency-safe claim via compare-and-swap: `UPDATE … WHERE id=? AND status=? AND attempts=?` returns a row only to the winning worker | The lifecycle's state transitions reuse this exact optimistic-lock pattern. **No `SELECT … FOR UPDATE SKIP LOCKED` needed** (though it's available if a true puller is later wanted). |
| `merit_transactions.idempotency_key` + partial UNIQUE index (`20260512000003`) `WHERE source='feature-deduct' AND idempotency_key IS NOT NULL` | Server-side dedup of double-clicks/retries at the **Merit** layer | "Two tabs cannot double-charge" is **already solved** at the deduction layer. The lifecycle adds a parallel idempotency key at the **record** layer (see below). |
| `check_and_deduct_merits(uuid,text,text,text)` 4-arg overload | Reserve EXACTLY ONCE — entry-time pre-check + inner `EXCEPTION WHEN unique_violation` race absorber; returns `already_deducted:true` with the prior `transaction_id` | The `reserving_merits` state calls this with the lifecycle's idempotency key. |
| `refund_merits(uuid,uuid)` | Settle/refund EXACTLY ONCE — idempotent: second call returns `{error:'already_refunded'}` and performs **zero** mutations (checks for an existing `balance_type='refund'` row sharing `deduction_id`) | The `refunded` state calls this (or `refundMeritsForJob`). Exactly-once refund is **already guaranteed by the RPC**, not by application logic. |
| `withMerits()` / `refundMeritsForJob()` (`merit-gateway.ts`) | The single reserve→run→classify→refund control-flow surface, with the canonical refundable-error taxonomy | The lifecycle's generate/validate legs run *inside* this wrapper (sync path) or call `refundMeritsForJob` (async worker path). |
| `pg_advisory_xact_lock(hashtext(p_user_id::text))` (`20260411000002`) | Proven per-user advisory-lock precedent in this DB | Available if the lifecycle needs a per-(user,feature) critical section beyond the unique-index guard. Prefer the unique index first; advisory lock only where a multi-row invariant must be serialized. |
| `analysis_cache` (`20260512000000`) + `cache-fingerprint.ts` | User-salted SHA-256 cache, service-role write, RLS select-own; `withMerits` precheck short-circuit | "Duplicate deliberate input = cache hit (no charge)" already wired; the lifecycle's `completed` state writes through this. |

### What must be ADDED (additive, roll-forward migrations + one helper)

The current `analysis_jobs.status` CHECK is the coarse 5-state set
`('pending','retrying','processing','completed','failed')` and `job_type` is restricted to
`('resume_analysis','career_compass_analysis','recruiting_lens')`. v5.0 needs a richer, *shared* model:

1. **Widen the lifecycle vocabulary (text + CHECK, NOT a native `enum`).**
   - Add the v5.0 status values: `created, validating_inputs, reserving_merits, extracting_data,
     generating, validating_output, saving, completed, retryable_failed, failed, refunded`.
   - **Use `text` + a `CHECK` constraint**, mirroring the existing `analysis_jobs_status_check` /
     `analysis_jobs_job_type_check` drop-and-recreate pattern (`20260225222000`, `20260409000001`).
     **Do NOT use a Postgres native `ENUM` type:** adding a value requires `ALTER TYPE … ADD VALUE`
     (can't run inside a transaction in older PG, cannot be removed/reordered), which fights the
     additive roll-forward migration discipline this repo enforces. `text + CHECK` is the established,
     migration-friendly convention here. (LOW-stakes, HIGH-confidence: directly evidenced by two existing
     CHECK-rewrite migrations.)
   - Extend `job_type` (or a new `feature` column) to cover all five features **plus onboarding-resume**.

2. **Add per-analysis operational metadata columns** (all `ADD COLUMN IF NOT EXISTS`, nullable for
   backfill safety — the exact pattern of `20260429000000` adding `merit_transaction_id`):
   `feature`, `tier`, `idempotency_key`/`request_key`, `model`, `retry_count` (or reuse `attempts`),
   `failure_code`, `failure_stage`, and version stamps (`input_version`, `prompt_version`,
   `schema_version`, `calc_version`). `started_at`/`updated_at`/`completed_at` already exist; add
   `started_at` if a distinct "generation began" timestamp is wanted. `merit_transaction_id` already
   exists and is the refund handle.

3. **Idempotency at the record layer** — a partial UNIQUE index mirroring the merit one:
   `CREATE UNIQUE INDEX … ON analysis_jobs (user_id, feature, idempotency_key)
    WHERE idempotency_key IS NOT NULL` (and/or a "one active run per (user,feature,input)" partial index
    scoped to in-progress statuses). Semantics:
   - **Duplicate click / two tabs** → same client idempotency key → unique-violation absorbed →
     reuse the in-progress record (this generalizes the existing "reuse active job" SELECT in
     `submit-resume-analysis-job`).
   - **Deliberate new run** → frontend mints a fresh idempotency key → new record.
   - Double-charge is independently blocked by the **merit** idempotency key, so even a race that slips
     past the record index cannot deduct twice.

4. **(Optional) wrap the transitions in an RPC** for the multi-column atomic "reserve + insert lifecycle
   row" step, so the merit deduction and the lifecycle insert commit together (today
   `submit-resume-analysis-job` does deduction-then-insert with a `MeritRefundable` compensation on
   insert failure — that compensation pattern is acceptable and can be reused, but a single
   `SECURITY DEFINER` RPC is cleaner and matches the Merit-RPC house style).

5. **One new `_shared/lifecycle.ts`** orchestration helper (pure TypeScript, no deps): a typed state-name
   union, `transition(jobId, from, to, patch)` built on the OCC compare-and-swap, and helpers to map an
   Anthropic failure → `retryable_failed` vs `failed` using `isRefundableAnthropicError`.

**Postgres primitives used (all already in this DB):** `text + CHECK` status, partial UNIQUE indexes,
`SECURITY DEFINER` RPC transactions with `FOR UPDATE` row locks, OCC compare-and-swap claims,
`pg_advisory_xact_lock` (only if a multi-row critical section appears). No extension installs.

---

## Capability 2 — Centralized multi-origin CORS allowlist

**Verdict: rewrite the *internals* of `_shared/cors.ts`. Add NO CORS library. Keep the exported surface
(`corsHeaders`, `handleOptionsRequest`) so the 14+ callers don't change.**

### The gap (confirmed in `_shared/cors.ts`)

Today `corsHeaders({type:'user'})` reflects a **single** origin — `APP_URL` (trailing-slash stripped) —
and `throw`s if `APP_URL` is unset. That is why `https://www.strivoai.net` is rejected: only the apex (or
whichever single value `APP_URL` holds) is ever echoed. There is no allowlist, no `Vary: Origin`, no
`Access-Control-Allow-Methods`, and preflight reuses the same single-origin header map.

### Canonical Deno/Supabase pattern to adopt (origin-reflection-with-validation)

No third-party package — this is ~40 lines of standard Deno using `req.headers.get('Origin')`, an
env-driven allowlist, and a `Response`:

1. **Env-driven allowlist.** Read a comma-separated `CORS_ALLOWED_ORIGINS` (new) — or evolve `APP_URL`
   into a list — into a parsed array at module cold-start (the `merit-gateway.ts` cold-start env-read
   pattern). Document the policy in `docs/ENVIRONMENT.md` (the canonical env reference already exists).
2. **Validate the request `Origin` against the allowlist**, supporting:
   - exact matches: `https://strivoai.net`, `https://www.strivoai.net`, dev/localhost
     (`http://localhost:8080`, `http://localhost:5173`, etc.);
   - a **scoped** Vercel-preview rule — match `https://<project>-*.vercel.app` via an explicit, narrow
     regex anchored to the project slug (NOT a blanket `*.vercel.app`, which would allow any Vercel app).
3. **Reflect only a validated origin** into `Access-Control-Allow-Origin` (echo the exact request origin
   when it matches). **Never** emit `Access-Control-Allow-Origin: *` together with credentials — that is
   the credential-bearing-wildcard anti-pattern the requirement forbids and browsers reject anyway.
4. **Always add `Vary: Origin`** (so caches don't serve the wrong origin's header), plus
   `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers` (keep the existing
   `authorization, x-client-info, apikey, content-type` + per-call extras), and
   `Access-Control-Max-Age` on preflight.
5. **Consistent headers on success AND failure AND preflight.** The helper must be applied to the error
   `Response`es too (today some error paths spread `corsHeaders`, but the function must keep returning a
   coherent map even when the origin is *not* allowed — emit the safe baseline headers WITHOUT an
   `Allow-Origin` echo so the browser cleanly blocks, rather than throwing/500-ing). Replace the
   `throw new Error` on missing config with **fail-closed but header-consistent** behavior.
6. **Unapproved origins are safely rejected** (no `Allow-Origin` echo) rather than crashing the function.

**Keep `type: 'internal' | 'webhook'` returning `{}`** (no CORS — not browser-reachable), exactly as now.

**Regression tests** (the requirement demands the mismatch "cannot recur"): table-driven `cors.test.ts`
cases for apex / www / preview / localhost / disallowed origin / missing-Origin / OPTIONS-preflight, each
asserting the exact echoed origin + `Vary`. This extends the existing `_shared/cors.test.ts`.

**Why no library:** Deno/Supabase edge has no canonical CORS middleware the way Express has `cors`;
importing one adds a dep + supply-chain surface for logic that is a dozen lines. Origin-reflection-with-
allowlist is the documented, framework-agnostic pattern and is trivially testable.

---

## Capability 3 — Strict LLM output validation

**Verdict: reuse zod 3.25.76 (already in both surfaces) + `json-repair.ts`. Add NO validation library.**

### What's already true (this de-risks the whole capability)

- **zod is already a Deno edge dependency** at the exact pin the frontend uses:
  `_shared/types/interviewPrep.ts:4` imports `https://esm.sh/zod@3.25.76`; `package.json` has
  `zod ^3.25.76`. The file header even documents the convention: *"Deno uses esm.sh; frontend uses npm
  zod."* So a shared validator needs **no new install** and can share schema shapes across the wire.
- **`json-repair.ts`** already does formatting-wrapper stripping (markdown fences, `"Here is the JSON:"`
  preamble), control-char escaping, and truncation repair — i.e. the "stripping + truncation detection"
  the requirement lists.
- **Hand-rolled strict validators already exist** as precedent: `grade-linkedin/validation.ts` (required
  fields, exact section set, per-section score range, **rawScore == sum reconciliation**, status enum,
  tier-conditional shape) and `_shared/result-merger.ts` / `recruiting-lens-merger.ts`. The LinkedIn one
  is the template for "feature-specific semantic checks" and the deterministic-score requirement in
  workstream 4.

### Recommended shape: one `_shared/llm-validation.ts`

A thin pipeline that composes existing pieces — same order the requirement names:

1. `repairTruncatedJSON(raw)` → strip wrappers / fix truncation (existing).
2. `JSON.parse` (with a typed failure → non-refundable taxonomy, matching `merit-gateway`'s rule that
   parse failures are **not** refundable).
3. **zod `.parse` / `.safeParse`** against a per-feature schema for required-field + type + range + enum
   checks (zod `.min/.max/.int/.enum/.nullable` — exactly as `interviewPrep.ts` already does).
4. **Feature-specific semantic checks** via zod `.refine` / `.superRefine` (missing-section, empty,
   generic-text, score-sum/determinism) — port the `grade-linkedin/validation.ts` rules into refinements
   (or keep the imperative validator and call it post-parse; both are fine, zod-native is preferred for
   new schemas).
5. On failure: a structured internal error (the requirement's "error taxonomy"), classified
   **non-refundable** (it's a model-quality failure, not a transient infra failure) and routed to
   `validating_output → failed` (or a bounded `retryable_failed` if you choose to re-prompt once — a
   product decision, not a stack one).

**Version guidance:** **stay on zod 3.25.76. Do NOT migrate to zod 4 in this milestone.** zod 4 is stable
(latest 4.4.x as of mid-2026) and ships *alongside* v3 under the `zod/v4` subpath, but it has API/behavior
changes and migrating mid-trust-milestone adds risk for zero v5.0 benefit. The pin is already consistent
across both surfaces; keep it.

---

## What NOT to Use (explicit — for the roadmapper)

| Avoid | Why it's wrong here | Use instead |
|-------|---------------------|-------------|
| External queue (SQS, BullMQ, Cloud Tasks, pg-boss, Inngest, Trigger.dev) | Violates the no-new-infra constraint; `analysis_jobs` + OCC claim + status CHECK already is the durable queue/state-machine | Extend `analysis_jobs` |
| Redis / Upstash for idempotency, locks, or rate state | Postgres partial UNIQUE indexes + `pg_advisory_xact_lock` + the existing `rate_limit_counters` table already cover dedup, locking, and limiting transactionally | Postgres primitives already in the schema |
| A native Postgres `ENUM` type for lifecycle status | `ALTER TYPE … ADD VALUE` can't run in a tx (older PG) / values can't be removed — fights additive roll-forward migrations | `text` + `CHECK` (the repo's existing convention) |
| `SELECT … FOR UPDATE SKIP LOCKED` puller as a *new requirement* | Unneeded — the OCC compare-and-swap claim (`UPDATE … WHERE id+status+attempts`) already prevents double-claim | Reuse existing OCC claim (SKIP LOCKED is available later if a true multi-worker puller is wanted) |
| A CORS middleware package | No canonical Deno edge middleware; the logic is ~40 lines and needs zero supply-chain surface | Origin-reflection-with-allowlist in `_shared/cors.ts` |
| `Access-Control-Allow-Origin: *` (with credentials) | Forbidden by the requirement and rejected by browsers when credentials are present | Echo a validated origin + `Vary: Origin` |
| `ajv` / `joi` / `yup` / `valibot` / a JSON-Schema validator | zod 3.25.76 is already vendored in BOTH surfaces with a working Deno precedent | Reuse zod + `json-repair.ts` |
| Migrating to **zod 4** | Stable but API-breaking; no v5.0 upside; adds risk in a trust milestone | Stay on `3.25.76` |
| Anthropic SDK / a new model provider | `_shared/anthropic.ts` direct-fetch already returns the `{ok:false;status;error}` shape the retry/refund taxonomy needs | Keep direct fetch |
| A realtime service (Supabase Realtime / websockets) for job status | The status is already pollable via `get-analysis-job-status`; the requirement explicitly allows "no realtime if pollable" | Keep polling (`pollAfterMs` is already returned) |
| A new ORM / query builder | `@supabase/supabase-js` + raw SQL migrations are the established access pattern | Keep supabase-js + migrations |

---

## Version Compatibility

| Package / pin | Compatible with | Notes |
|---------------|-----------------|-------|
| `zod@3.25.76` (edge `esm.sh`) | `zod@^3.25.76` (frontend npm) | **Same minor.minor.patch** — schemas/types can be mirrored across the wire (precedent: `src/types/interviewPrep.ts` ↔ `_shared/types/interviewPrep.ts`). Pin the edge import EXACTLY (`@3.25.76`), never `@3` or `@latest`, to avoid silent esm.sh drift. |
| `npm:@supabase/supabase-js@2` (edge) | `^2.108.2` (frontend) | Both major 2; service-role client in edge, anon/auth in frontend. |
| Deno `std@0.168.0` `serve` | existing functions | Keep — not part of the 3 capabilities. (If a function is touched, leaving the import as-is is the zero-risk choice.) |
| `text + CHECK` status column | existing `analysis_jobs` CHECK rewrite migrations | New status values added by drop-and-recreate CHECK (idempotent DO-block guard), exactly as `20260225222000` / `20260409000001`. |
| Partial UNIQUE index for record-idempotency | existing `merit_transactions_idempotency_key_unique` | Mirror the proven `WHERE … IS NOT NULL` partial-index pattern; pair with an `EXCEPTION WHEN unique_violation` absorber rather than ON-CONFLICT inference (the repo's documented anti-pattern note). |

## Stack Patterns by Variant

**If the lifecycle needs a single atomic "reserve merits + create lifecycle record":**
- Wrap it in one `SECURITY DEFINER` RPC (house style), so deduction + insert commit together.
- Because the existing two-step (deduct then insert, with `MeritRefundable` compensation on insert
  failure) works but leaves a refund-compensation window the RPC eliminates.

**If a future true multi-worker puller is wanted (not required for v5.0):**
- Add `SELECT … FOR UPDATE SKIP LOCKED` in a claim RPC.
- Because it scales better than OCC under high contention — but it is premature now; OCC is sufficient and
  already battle-tested.

**If output validation needs to re-prompt once on a model-quality failure:**
- Use the existing `retryable_failed` state + a bounded counter, but classify it NON-refundable and
  caller-driven — not via the Anthropic transient-error taxonomy.
- Because a malformed-but-delivered response is a quality issue, distinct from a 5xx/timeout.

## Sources

- Live codebase (HIGH): `_shared/cors.ts`, `_shared/anthropic.ts`, `_shared/json-repair.ts`,
  `_shared/merit-gateway.ts`, `_shared/auth.ts`, `_shared/types/interviewPrep.ts`,
  `grade-linkedin/validation.ts`, `submit-resume-analysis-job/index.ts`,
  `process-resume-analysis-job/index.ts`, `get-analysis-job-status/index.ts`, `deno.json`, `package.json`.
- Migrations (HIGH): `20260225160000_add_analysis_jobs_queue.sql`,
  `20260225222000_extend_analysis_jobs_for_career_queue.sql`,
  `20260409000001_add_recruiting_lens_job_type.sql`,
  `20260429000000_add_merit_transaction_id_to_analysis_jobs.sql`,
  `20260512000000_analysis_cache_table.sql`, `20260512000003_merit_transactions_idempotency.sql`,
  `20260415000000_merit_rpcs.sql` (`refund_merits` idempotency), `20260411000002_atomic_check_and_record_usage.sql`
  (`pg_advisory_xact_lock` precedent).
- `docs/ENVIRONMENT.md` (HIGH): `APP_URL` is the current single-origin CORS source of truth (edge,
  fail-closed); env-policy surface table for where a new `CORS_ALLOWED_ORIGINS` would be set.
- zod current version (MEDIUM, web-verified): npmjs.com/package/zod + zod.dev — latest `4.4.x` (mid-2026),
  zod 4 ships under `zod/v4` subpath alongside `[email protected]`; **recommendation: stay on 3.25.76** (the
  repo's existing dual-surface pin). https://www.npmjs.com/package/zod , https://zod.dev/v4

---
*Stack research for: v5.0 Platform Trust, Reliability & Intelligence (brownfield reliability hardening)*
*Researched: 2026-06-25*
