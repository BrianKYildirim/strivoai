# Phase 3: Shared Analysis Lifecycle Substrate - Research

**Researched:** 2026-07-02
**Domain:** Brownfield Supabase (Postgres + Deno Edge) + React/Vite lifecycle substrate — additive `analysis_jobs` ledger evolution, CAS RPCs, ordered executor, Merit exactly-once wiring, strict LLM-output validation, reaper (pg_cron), Realtime, dormant/flag-gated
**Confidence:** HIGH (every seam read directly from source with file:line; the only MEDIUM items are discretion-area recommendations — hash algorithm, per-state max-age thresholds — flagged inline)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Operator stance (carried from Phase 2): MAXIMAL thoroughness / complete-the-spine.** Every gray area was resolved to the most-complete option. Phase 3 builds the full substrate (reaper + realtime + end-to-end idempotency + persisted retry) **DORMANT** — not a scope-minimized skeleton.

- **D-01 Reaper — build the full reaper dormant NOW.** Stuck-state timeout-sweep ships complete: **terminalize-stale transition + reservation-release RPC** AND a **scheduled sweep** — armed but inert while no feature is live. Every non-terminal state carries a timestamp + max-age; the sweep moves stale rows to `retryable_failed`/`failed` and releases the stranded Merit reservation exactly once. Reuse the **existing pg_cron usage** (`keep-warm-ping */5`, `extract_catchup_nightly */15`) as the scheduling precedent (no new infrastructure). Arming the sweep is operator-gated. Reservation release reuses the gateway's `refundMeritsForJob`.

- **D-02 Idempotency-key — edge-derived intent hash.** `key = hash(user + feature + tier + input-identity + attempt-nonce)`, derived server-side (edge), **never trusted from the client**. input-identity is per-feature (Ph4/5/6 supply it); the substrate defines the CONTRACT + shape. Frontend sends an explicit **"new run" signal**; edge computes the key. Accidental resubmit of the same attempt → same key → `already_deducted` → reuse. Deliberate new run → fresh attempt-nonce → new key → new charged analysis + History. Key must be **cache-key-stable** (never composed from a save-mutated field — Pitfall 8). `withMerits` already forwards `ctx.idempotencyKey ?? null`; this phase DERIVES + THREADS the key.

- **D-03 Retry model — in-process bounded backoff, persisted fallback.** Executor retries **genuinely transient** failures (provider timeout/rate-limit/network/transient DB) in-process with bounded exponential backoff (reuse `computeBackoffMs` — base 1000ms, max 3000ms + jitter). On exhaustion OR invocation death, the row rests in **`retryable_failed`** for frontend Retry and/or the reaper. **Permanent** failures never auto-retried (LIFE-06). The **lifecycle row is the single source of truth** — no parallel worker retry loop; new states MAP INTO the existing `analysis_jobs` worker (Pitfall 4). Transitions idempotent + monotonic.

- **D-04 Dormancy — global kill-switch + per-feature flags.** Two layers: master edge flag `ANALYSIS_LIFECYCLE_ENABLED` (default OFF, mirrors `MERIT_SYSTEM_ENABLED` module-scope cold-start read) + **per-feature flags** (Recruiting Lens / LinkedIn / Resume / Onboarding / Career Compass) flipped independently in ascending blast-radius. Frontend `useAnalysisRun` gated by a **VITE flag** (`src/config/feature-flags.ts` / `import.meta.env.VITE_FEATURE_*`, exact-lowercase-`'true'`).

- **D-05 Realtime — enable NOW (operator-gated).** Add `analysis_jobs` to the **realtime publication** + realtime RLS in the same operator-gated preview→prod migration wave that evolves the ledger. Subscribe-first genuinely works when the first feature flips; **poll is the true fallback**. Preview `cimjltzovkahkqecpwgi` is UNPAUSED.

- **D-06 Re-run charge — charge per deliberate run; no cache-reuse in the substrate.** Every deliberate run (fresh attempt-nonce) is a charged analysis. Free identical-input reuse stays the existing `precheck_cache` / per-feature concern (Ph4/5/6) — NOT baked into the substrate's Merit path. Accidental resubmit dedup handled by the idempotency key (D-02), not by cache.

### Claude's Discretion
- Exact **sub-ordering of the 5 plan sketches** (03-01..03-05 is a starting point, not binding) — provided the migration (ledger + RPCs + indexes + reaper + realtime) lands before the executor, and the test suite folds into `verify:baseline` last.
- Precise **per-state max-age thresholds** for the reaper — apply a defensible model and state it.
- Exact **hash algorithm + canonical serialization** for the idempotency-key input-identity (stable, collision-resistant, order-independent).
- **Shape of the state-machine/idempotency/refund/retry/supersede test suite** (deno + vitest), following `merit-idempotency.test.ts` + `cors-audit.test.ts`.
- Whether the reaper sweep is a **pg_cron-invoked SQL function vs a pg_cron-invoked internal edge endpoint** (`requireAuth({type:'internal'})` + `INTERNAL_JOB_SECRET`) — reuse whichever matches the existing cron-job pattern with least new surface.

### Deferred Ideas (OUT OF SCOPE)
- **Per-feature adoption** (thread each feature's input-identity, flip its flag, feature-specific strict-validation semantics) → Phases 4 (Recruiting Lens + LinkedIn), 5 (Resume + Onboarding), 6 (Career Compass). Phase 3 ships the substrate dormant + unwired.
- **Free identical-input cache-reuse** in the Merit path → per-feature `precheck_cache` in Ph4/5/6 (D-06).
- **LinkedIn deterministic evidence-based scoring / ~52 declustering** → Phase 4. Phase 3 supplies the strict `_shared/llm-validation.ts` contract.
- **Onboarding "Taking Longer" hang resolution** → Phase 5. Phase 3 supplies the reaper + persisted-recovery + terminal-failure machinery.
- **Dashboard intelligence reading stored analysis data** → Phase 7.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LIFE-01 | Shared persistent lifecycle, 11-state model, transitions persisted (survive refresh/nav/slow provider/timeout/transient failure) | §Ledger Evolution (03-01): additive `state text + CHECK` on `analysis_jobs`; `transition_analysis_run()` CAS; Realtime + `run_id` recovery hook (03-04) |
| LIFE-02 | Record retains operational metadata (user, feature, tier, idempotency/request ctx, merit txn, input/prompt/schema/calc version, model, retry count, failure code+stage, timestamps) | §Ledger Evolution: additive metadata columns; `merit_transaction_id` already present (`20260429000000`) |
| LIFE-03 | Ordered lifecycle (authenticate+validate → create/recover → reserve Merits → extract → generate → parse+validate → save → settle → completed) | §Executor (03-03): ordered sequence in `_shared/analysis-lifecycle.ts`; each arrow a committed `transition_analysis_run` CAS |
| LIFE-04 | On failure: record stage+code, preserve previous valid result, release/refund exactly once, never charge missing-input/invalid-output/unsaved, no double charge/refund, safe message, Merit integrity via backend+DB | §Executor refund boundary (pre-`saving` only); `refundMeritsForJob` idempotent; `CHECK (NOT (merit_settled AND refunded))` |
| LIFE-05 | Idempotency & concurrency (duplicate clicks reuse; deliberate new run = new analysis+History; two tabs can't double-charge; success once; failure refunds once; retry can't duplicate; newest input; unchanged-input reuse where rules allow) + wire 4-arg `check_and_deduct_merits` through `withMerits` | §Merit Seam (03-02): key derivation + threading; partial-unique active-per-feature index; `merit-gateway.idempotency-forward.test.ts` EXTEND |
| LIFE-06 | Retry only genuinely transient (provider timeout/rate-limit/network/transient DB), bounded backoff + preserved history; never permanent | §Executor: `isRefundableAnthropicError`/`isRetryableHttpStatus` classifier + `computeBackoffMs`; permanent → `failed` (no retry) |
| LIFE-07 | Strict model-output validation (wrapper removal, JSON parse, required-field, type+range, missing-section, empty/generic, truncation, semantic checks, safe logging); never substitute fixed/empty/generic/fabricated | §LLM Validation (03-03): `_shared/llm-validation.ts` = `json-repair` → `JSON.parse` → `zod.safeParse` → `.superRefine`; Pitfall 9 no-masking |
| LIFE-08 | Structured internal error taxonomy (13 codes); safe messages, no leakage | §Error Taxonomy (03-04): code→(status, safeMessage, retryable) table riding `jsonError`; `src/lib/analysisError.ts` frontend mirror |
| LIFE-09 | Frontend recovery hook behaviors (disable dup submit, progress stages, poll/subscribe, refresh recovery, delayed result, terminal stop, retry-only-retryable, preserve previous, Merit messaging, reset stale, accurate History, no permanent stuck) | §Recovery Hook (03-04): `useAnalysisRun` subscribe-first (Results.tsx pattern) + poll-fallback (`get-analysis-run-status`); reaper (D-01) kills permanent-stuck |
</phase_requirements>

## Summary

This is a **brownfield substrate** phase, not a greenfield build. Every capability is buildable from Postgres primitives and shared utilities already proven in this tree — **zero new runtime dependencies, zero new infrastructure**. The net-new artifacts are one additive migration wave, two new `_shared/` TypeScript modules (`analysis-lifecycle.ts`, `llm-validation.ts`), one new internal edge function (the reaper), one new user edge function (`get-analysis-run-status`), one new frontend hook (`useAnalysisRun`) + `src/lib/analysisError.ts`, plus the flag plumbing — all shipped **dormant** (no feature routed through them).

The single most load-bearing fact: **the Merit idempotency seam is already wired** at the gateway. `withMerits` forwards `p_idempotency_key: ctx.idempotencyKey ?? null` to the 4-arg `check_and_deduct_merits` RPC (`merit-gateway.ts:217`), `MeritGatewayContext` carries `idempotencyKey?: string` (`:95`), the replay branch is null-safe and suppresses double-refund (`:259-315`), and the 4-arg RPC + partial-UNIQUE index shipped in Phase 2 (`20260512000003`). Phase 2 explicitly named this the "Phase-3-extensible seam." So 03-02 is **not** re-plumbing the gateway — it is **deriving the intent-hash key edge-side and threading it into `ctx.idempotencyKey`**, then extending the already-existing `merit-gateway.idempotency-forward.test.ts` to drive the full path.

The `analysis_jobs` table already IS a persistent lifecycle ledger with an async worker, a CAS claim pattern (`.eq('status',…).eq('attempts',…)` — `process-resume-analysis-job/index.ts:138-140`), a status poller (`get-analysis-job-status`), a Realtime-adjacent frontend (`Results.tsx:408-423` subscribes to `postgres_changes` on `resumes`), and a refund-before-`failed` invariant (`process-resume-analysis-job/index.ts:277-297`). Phase 3 **evolves this table additively** (widen the `status` CHECK precedent from `20260225222000`, add an 11-value `state` column + metadata + partial-unique index + `merit_settled`/`refunded` + `CHECK (NOT (merit_settled AND refunded))`), maps the new states INTO the existing worker (Pitfall 4 — do not build a second state machine), and dual-writes legacy `status` so the current worker + poller + `Results.tsx` stay byte-identical.

**Primary recommendation:** Keep the physical table `analysis_jobs`; use `text + CHECK` (never native `ENUM`); model every RPC on the shipped `check_and_deduct_merits` (SECURITY DEFINER + `SET search_path = public, pg_temp` + REVOKE/GRANT + verification DO-block); model the reaper cron on `extract_catchup_nightly` (pg_cron + pg_net + vault secret → internal edge endpoint with `requireAuth({type:'internal'})`); enforce dormancy with the `MERIT_SYSTEM_ENABLED` module-scope-flag precedent; prove everything with static-source deno guards (registered in `deno.json` `test:ci`) + gated-remote runtime twins (`DENO_TEST_SUPABASE_REMOTE=1`, NOT in `test:ci`).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 11-state lifecycle persistence + transition atomicity | Database (Postgres) | — | Survives worker death/refresh/timeout; DB is the single source of truth (D-03). CAS + advisory-lock RPCs |
| Idempotency / exactly-once accounting | Database (partial-UNIQUE index + 4-arg RPC) | API/Edge (key derivation) | The index is the atomic guarantee (Pitfall 5 TOCTOU); edge derives the intent hash (D-02) |
| Intent-hash key derivation | API/Edge (Deno) | — | Must never be client-trusted (D-02); `crypto.subtle` over canonical serialization |
| Ordered executor (reserve→…→settle) + refund-exactly-once | API/Edge (`_shared/analysis-lifecycle.ts`) | Database (Merit RPCs) | Orchestration logic; refunds gateway-owned via `refundMeritsForJob` |
| Strict LLM-output validation (no masking) | API/Edge (`_shared/llm-validation.ts`) | — | `json-repair` → `JSON.parse` → `zod` → `superRefine`; never substitute (LIFE-07/Pitfall 9) |
| Structured error taxonomy | API/Edge (`jsonError`) | Browser (`src/lib/analysisError.ts`) | Backend emits `code`+safe message; frontend maps to copy/retry affordance |
| Reaper (stale-state sweep + reservation release) | Database (pg_cron scheduler) | API/Edge (reaper endpoint reusing `refundMeritsForJob`) | Reuses `extract_catchup_nightly` precedent; TS logic reuses gateway refund |
| Realtime status push | Database (publication + RLS) | Browser (`useAnalysisRun` subscribe) | Supabase Realtime respects table SELECT RLS; existing `postgres_changes` precedent |
| Recovery hook (subscribe-first/poll-fallback, `run_id`) | Browser (`useAnalysisRun`) | API/Edge (`get-analysis-run-status`) | Refresh/nav recovery; poll is true fallback (D-05) |
| Dormancy gating | API/Edge (env flags) + Browser (VITE flag) | — | `ANALYSIS_LIFECYCLE_ENABLED` module-scope + per-feature; `isAnalysisLifecycleEnabled()` frontend |

## Project Constraints (from CLAUDE.md)

Treat these with the same authority as locked decisions:

- **GSD workflow enforcement:** file-changing tools only through a GSD command. (This research is read-only.)
- **Supabase MCP rules:** Claude is **read-only on prod** (`zjpjapgraoxdukdvpjes`). May inspect prod advisories/logs/schema; may generate SQL/migrations; **may NOT** run destructive SQL, drop tables, delete columns, **alter RLS**, **deploy Edge Functions**, or **alter realtime publication** on prod without explicit operator confirmation. Test on **preview `cimjltzovkahkqecpwgi`** first. **Rollback SQL for every migration.** Never print/store service-role keys.
- **No new infrastructure** (Supabase Edge/Deno + React only). No new npm packages.
- **AI:** Claude via `_shared/anthropic.ts` (no SDK, direct fetch).
- **Semantic design tokens, not hardcoded colors** (frontend hook UI copy is minimal/dormant — low surface).
- **Do not commit anything in `.planning/` or modify `.gitignore`.**
- **`verify:baseline` is a HARD gate** (`deploy.ps1`): vitest + offline-deno + Playwright must be green before any deploy. Phase 3 must keep it green AND fold its new tests into it.
- **TypeScript strict mode** (both `src/` and edge functions); explicit return types; discriminated-union fallible results (`{ ok: true } | { ok: false }`).
- **Security:** `timingSafeEqual` for secret comparison; secrets never logged (reason codes only); `requireAuth`/`requireInternalOrUserAuth` on every endpoint; CORS fail-closed via `ALLOWED_ORIGINS`.
- **Advisor floor 15 must not increase.**

## Standard Stack

**Verdict: reuse, extend, do not add.** No `npm install`, no new Deno imports beyond what's vendored.

### Core (all already in repo)
| Library / Primitive | Version | Purpose | Why Standard |
|---------------------|---------|---------|--------------|
| PostgreSQL (Supabase-managed) | 15.x | Lifecycle state machine, idempotency, atomic reserve/settle/refund, reaper cron | `text+CHECK`, partial-UNIQUE, `SECURITY DEFINER` RPCs, CAS, `pg_advisory_xact_lock`, pg_cron+pg_net all already in prod `[VERIFIED: supabase/migrations/]` |
| Deno 2 (Supabase Edge runtime) | — | All edge logic (executor, reaper, status endpoint, key derivation) | Existing runtime; no new runtime `[VERIFIED: supabase/functions/deno.json]` |
| zod | 3.25.76 (`^3.25.76` in `package.json`; esm.sh pinned in edge) | `_shared/llm-validation.ts` schema + `.superRefine` semantic checks | Vendored in BOTH surfaces at same pin; do NOT migrate to zod 4 (breaking, no upside) `[VERIFIED: package.json]` |
| `_shared/json-repair.ts` | in-repo | Step 1 of output validation (markdown-fence strip, control-char escape, truncation repair) | Reuse unchanged; already the streaming-repair helper `[VERIFIED: deno.json test:ci registers json-repair.test.ts]` |
| `_shared/merit-gateway.ts` | in-repo | `withMerits` reserve/settle seam; `refundMeritsForJob` reservation release; `MeritRefundable`; `isRefundableAnthropicError` transient classifier | Idempotency seam already wired (`:217`); gateway-owns-refund contract (D-03) `[VERIFIED: merit-gateway.ts:51,73,149,217,327]` |
| `_shared/cors.ts` | in-repo | `withCors` wrapper + `jsonError` envelope the taxonomy rides | CORS-by-construction on every response incl. errors `[VERIFIED: cors.ts:149,202]` |
| `_shared/auth.ts` | in-repo | `requireAuth(req,{type:'user'\|'internal'})` — internal-secret `timingSafeEqual` for the reaper endpoint | Existing internal-auth gate on every worker `[VERIFIED: auth.ts:73,148,163]` |
| pg_cron + pg_net + Vault | in-repo | Reaper scheduling (D-01) | `keep-warm-ping */5`, `extract_catchup_nightly */15` precedents `[VERIFIED: 20260310000000, 20260525000003]` |
| Supabase Realtime (`postgres_changes`) | in-repo | `useAnalysisRun` subscribe-first channel (D-05) | Existing infra; `Results.tsx:408-423` precedent `[VERIFIED]` |

### Alternatives Considered (rejected — per SUMMARY.md "what not to add")
| Instead of | Rejected Alternative | Why |
|------------|----------------------|-----|
| `text + CHECK` status | native Postgres `ENUM` | ENUM values cannot be removed/reordered; fights additive roll-forward; two existing CHECK-rewrite migrations set the precedent |
| Partial-UNIQUE index idempotency | Redis / external idempotency store | New infra; DB index is atomic and already proven |
| pg_cron reaper | external queue (SQS/BullMQ/Inngest) | New infra; milestone forbids |
| Supabase Realtime | "new realtime service" | Existing infra explicitly permitted; milestone excludes only NEW realtime service |
| `zod@3.25.76` | ajv/joi/yup / zod 4 | Already vendored; migration is breaking with no v5.0 upside |

**Installation:** none. No packages added.

## Package Legitimacy Audit

**Not applicable — this phase installs zero external packages.** All artifacts are net-new TypeScript modules + SQL migrations built on already-vendored primitives. No `npm install`, no new Deno remote imports beyond the std/esm.sh pins already in the tree. (slopcheck gate skipped: no packages to verify.)

## Architecture Patterns

### System Architecture Diagram (dormant substrate; data flow when a feature later flips its flag)

```
                          ┌─────────────────────────── FRONTEND (Browser) ───────────────────────────┐
  user click ──"new run   │  useAnalysisRun (VITE-gated: isAnalysisLifecycleEnabled())               │
   signal"(no key)        │    ├─ persist run_id (URL + localStorage)                                │
                          │    ├─ subscribe-first: supabase.channel().on('postgres_changes',         │
                          │    │        {table:'analysis_jobs', filter:'id=eq.<run_id>'})            │
                          │    └─ poll-fallback: get-analysis-run-status  ◀── true fallback (D-05)   │
                          │         terminal state → render result | analysisError(code)→retry CTA   │
                          └────────────────────────────────┬─────────────────────────────────────────┘
                                                           │ (Ph4/5/6 wire this; dormant now)
        ┌──────────────────────────────── EDGE (Deno) ────▼───────────────────────────────────────┐
        │  feature handler (gated: ANALYSIS_LIFECYCLE_ENABLED && per-feature flag)                 │
        │    1. requireAuth(user) + validate inputs                                                │
        │    2. DERIVE key = sha256(canonical(user+feature+tier+input-identity+attempt-nonce))     │  D-02
        │    3. _shared/analysis-lifecycle.ts  ── ordered executor ──────────────────────────────┐ │
        │         create_or_recover_analysis_run() ─────────────────────────────► [DB]           │ │
        │         reserve: withMerits(ctx{idempotencyKey}, feature, fn) ─► 4-arg check_and_deduct │ │
        │         extract → generate (retry transient: computeBackoffMs) → validate_output        │ │  D-03
        │           (_shared/llm-validation.ts: json-repair→JSON.parse→zod→superRefine; no mask)  │ │  LIFE-07
        │         save (durable) ──POINT OF NO RETURN── settle(merit_settled=true) → completed    │ │  Pitfall 2/3
        │         on pre-saving failure ONLY: refundMeritsForJob(exactly once) + retryable_failed │ │  LIFE-04
        │       each arrow = transition_analysis_run() CAS (idempotent + monotonic) ──► [DB]       │ │
        │    ────────────────────────────────────────────────────────────────────────────────────┘ │
        └───────────────────────────────────────────────┬─────────────────────────────────────────┘
                                                         │
        ┌──────────────────────────────── DATABASE (Postgres) ────▼──────────────────────────────┐
        │  analysis_jobs (evolved ledger): state text+CHECK(11) + legacy status dual-write        │
        │    metadata: feature,tier,idempotency_key,input_fingerprint,versions,model,retry_count,  │
        │              failure_code,failure_stage,merit_settled,refunded,*_at timestamps           │
        │    partial-UNIQUE(active-per-feature) WHERE state NOT IN(completed,failed,refunded)       │  Pitfall 5
        │    CHECK (NOT (merit_settled AND refunded))                                               │  LIFE-04
        │    RLS: owner SELECT (governs Realtime authz)   ── in supabase_realtime publication (D-05)│
        └───────────────────────────────────────────────▲─────────────────────────────────────────┘
                                                         │ net.http_post + x-internal-job-secret (Vault)
        ┌──────────────── pg_cron reaper (armed but inert; operator-gated) ───┘
        │  reap-stale-analysis-runs (internal edge, requireAuth internal):
        │    per-state max-age → terminalize stale → refundMeritsForJob (exactly once)          D-01
        └──────────────────────────────────────────────────────────────────────────────────────
```

### Recommended plan structure (03-01..03-05 — discretion honored: migration before executor, tests last)

```
03-01  Additive lifecycle migration wave (operator-gated preview→prod)
         ├─ widen job_type + add `state` text+CHECK(11) + legacy status dual-write
         ├─ metadata columns (LIFE-02) + merit_settled/refunded + CHECK(NOT(settled AND refunded))
         ├─ partial-UNIQUE active-per-feature index
         ├─ create_or_recover_analysis_run() + transition_analysis_run() CAS RPCs (SECURITY DEFINER)
         ├─ D-05: ALTER PUBLICATION supabase_realtime ADD TABLE + REPLICA IDENTITY + realtime RLS
         └─ rollback SQL per change; verification DO-block; advisor floor 15 unchanged
03-02  Merit seam wiring: edge key-derivation (crypto.subtle canonical hash) → ctx.idempotencyKey
         └─ EXTEND merit-gateway.idempotency-forward.test.ts (drive full path, repeated key → 1 deduction)
03-03  _shared/analysis-lifecycle.ts ordered executor + retry/permanent classifier + refund-exactly-once
         └─ _shared/llm-validation.ts strict no-masking validation (json-repair→JSON.parse→zod→superRefine)
         └─ promote computeBackoffMs to _shared/
03-04  Error taxonomy (13 codes → jsonError) + get-analysis-run-status endpoint
         └─ useAnalysisRun hook (subscribe-first/poll-fallback, run_id, VITE flag) + src/lib/analysisError.ts
03-04b D-01 reaper: pg_cron (extract_catchup precedent) → reap-stale-analysis-runs internal edge endpoint
         └─ per-state max-age; terminalize-stale + reservation-release exactly once (armed but inert)
03-05  Test suite into verify:baseline: state-machine/idempotency/refund/retry/supersede/reaper
         └─ register static guards in deno.json test:ci; gated-remote runtime twins skip-by-default
```
*(D-01 reaper can be its own plan 03-04b or fold into 03-03/03-04 — the migration half MUST be in 03-01's wave; the endpoint + cron arming is edge/operator work.)*

### Pattern 1: Additive ledger evolution — widen CHECK, add `state`, dual-write legacy `status`

**What:** Evolve `analysis_jobs` in place. Current schema (`20260225160000_add_analysis_jobs_queue.sql:1-22`): `status text default 'pending' CHECK(status in ('pending','retrying','processing','completed','failed'))`, `job_type text CHECK(...)` (widened to `resume_analysis`, `career_compass_analysis` by `20260225222000`, `recruiting_lens` by `20260409000001`), plus `merit_transaction_id uuid NULL` (`20260429000000`), `archive_path` (Phase 42). Indexes: `idx_analysis_jobs_queue_lookup`, `idx_analysis_jobs_user_created`, `idx_analysis_jobs_resume_id`. RLS: owner SELECT + owner INSERT only (no UPDATE policy — workers use service role, bypassing RLS).

**When to use:** The 11-state model. Add a NEW `state` column (don't repurpose `status`); dual-write `status` from `state` via a mapping so the existing worker/poller/`Results.tsx` are byte-identical.

**Example (the CHECK-widen precedent — copy this shape):**
```sql
-- Source: supabase/migrations/20260225222000_extend_analysis_jobs_for_career_queue.sql:1-15
do $$
begin
  if exists (select 1 from pg_constraint
             where conname = 'analysis_jobs_job_type_check'
               and conrelid = 'public.analysis_jobs'::regclass) then
    alter table public.analysis_jobs drop constraint analysis_jobs_job_type_check;
  end if;
end $$;
alter table public.analysis_jobs add constraint analysis_jobs_job_type_check
  check (job_type in ('resume_analysis','career_compass_analysis'));  -- + recruiting_lens
```
```sql
-- NEW (03-01): 11-state additive column + financial invariant
alter table public.analysis_jobs add column if not exists state text;   -- nullable until dual-write backfill
alter table public.analysis_jobs add constraint analysis_jobs_state_check
  check (state is null or state in (
    'created','validating_inputs','reserving_merits','extracting_data','generating',
    'validating_output','saving','completed','retryable_failed','failed','refunded'));
alter table public.analysis_jobs add column if not exists merit_settled boolean not null default false;
alter table public.analysis_jobs add column if not exists refunded boolean not null default false;
alter table public.analysis_jobs add constraint analysis_jobs_settle_refund_excl
  check (not (merit_settled and refunded));
-- LIFE-02 metadata (additive, nullable):
alter table public.analysis_jobs add column if not exists feature text;
alter table public.analysis_jobs add column if not exists tier text;
alter table public.analysis_jobs add column if not exists idempotency_key text;
alter table public.analysis_jobs add column if not exists input_fingerprint text;
-- + input_version / prompt_version / schema_version / calculation_version / model /
--   retry_count int default 0 / failure_code text / failure_stage text / state_updated_at timestamptz
```
```sql
-- Pitfall 5: partial-UNIQUE active-per-feature index (mirrors merit_transactions_idempotency_key_unique
--            from 20260512000003:62-64). Prevents two concurrent ACTIVE runs for the same intent.
create unique index if not exists analysis_jobs_active_idem_unique
  on public.analysis_jobs (idempotency_key)
  where idempotency_key is not null and state not in ('completed','failed','refunded');
```

**Legacy `status` dual-write mapping (byte-identical guarantee):**
`created/validating_inputs/reserving_merits/extracting_data/generating/validating_output/saving → the pre-existing 'pending'|'processing'` vocabulary; `retryable_failed → 'retrying'`; `completed → 'completed'`; `failed/refunded → 'failed'`. Write BOTH columns on every transition so `get-analysis-job-status` and `Results.tsx` keep reading `status` unchanged.

### Pattern 2: SECURITY DEFINER RPC with verification DO-block (model both new RPCs on this)

**What:** `create_or_recover_analysis_run()` (atomic create/recover/supersede under `pg_advisory_xact_lock(hashtext(idempotency_key))`) and `transition_analysis_run()` (CAS guarded, idempotent + monotonic). Copy the exact ceremony from the shipped 4-arg deduct RPC.

**Example (the shipped RPC ceremony — replicate verbatim structure):**
```sql
-- Source: supabase/migrations/20260512000003_merit_transactions_idempotency.sql:93-248
CREATE OR REPLACE FUNCTION public.check_and_deduct_merits(
  p_user_id uuid, p_feature text, p_tier text, p_idempotency_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$ ... $$;
REVOKE ALL ON FUNCTION public.check_and_deduct_merits(uuid,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.check_and_deduct_merits(uuid,text,text,text) TO authenticated, service_role;
DO $$ BEGIN /* RAISE EXCEPTION if column/index/fn missing or not SECURITY DEFINER; RAISE NOTICE on pass */ END $$;
```

**CAS + monotonic transition (the claim precedent is already in the worker):**
```typescript
// Source: supabase/functions/process-resume-analysis-job/index.ts:127-142 (optimistic CAS claim)
.update({ status: "processing", attempts: candidate.attempts + 1, ... })
.eq("id", candidate.id)
.eq("status", candidate.status)      // ── compare-and-swap guard
.eq("attempts", candidate.attempts)  // ── stale claim loses
```
`transition_analysis_run(p_run_id, p_from_state, p_to_state, ...)` performs this as an RPC: `UPDATE ... WHERE id=p_run_id AND state=p_from_state`; 0 rows updated ⇒ someone else moved it (no-op idempotent return, never resurrect a terminal row). Enforce monotonicity by rejecting `p_to_state` that precedes `p_from_state` in the ordered enum (or is terminal→non-terminal).

### Pattern 3: Merit key derivation + threading (03-02) — the seam is already open

**What:** `withMerits` already forwards the key. 03-02 only derives it edge-side and sets `ctx.idempotencyKey`.
```typescript
// Source: supabase/functions/_shared/merit-gateway.ts:84-96 (context) + :206-218 (forward)
export interface MeritGatewayContext { userId; tier; corsType; idempotencyKey?: string; }
// ...
const { data, error } = await supabase.rpc('check_and_deduct_merits', {
  p_user_id: ctx.userId, p_feature: feature, p_tier: ctx.tier,
  p_idempotency_key: ctx.idempotencyKey ?? null,   // ← already wired (Phase 2)
});
```
**Key derivation (D-02, discretion — recommended):** SHA-256 via `crypto.subtle.digest` over a **canonical serialization** (sorted-key JSON) of `{user, feature, tier, inputIdentity, attemptNonce}` → hex. `inputIdentity` is a per-feature content-hash (Ph4/5/6 supply); the substrate defines a `deriveIdempotencyKey(parts): Promise<string>` contract in `_shared/analysis-lifecycle.ts`. **Never** compose from a save-mutated field (Pitfall 8 — e.g. `prior_grade_id`). `attemptNonce` is minted fresh only on a deliberate "new run" signal from the frontend; an accidental resubmit re-derives the same key → `already_deducted` (RPC `:118-133`).

### Pattern 4: Reaper via pg_cron → internal edge endpoint (D-01)

**What:** Recommended: **pg_cron-invoked internal edge endpoint** (over a pure-SQL cron function) so the reaper reuses the TS `refundMeritsForJob` reservation-release and is unit-testable. Copy the `extract_catchup_nightly` shape exactly.
```sql
-- Source: supabase/migrations/20260525000003_phase42_layer2_extract_catchup_cron.sql:19-37
PERFORM cron.schedule('reap_stale_analysis_runs', '*/15 * * * *', $job$
  SELECT net.http_post(
    url := 'https://<ref>.supabase.co/functions/v1/reap-stale-analysis-runs',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-internal-job-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_job_secret' LIMIT 1)),
    body := '{"invocation_source":"pg_cron_reaper"}'::jsonb);
$job$);
```
The endpoint `reap-stale-analysis-runs/index.ts` guards with `requireAuth(req,{type:'internal'})` (`process-resume-analysis-job/index.ts:86` precedent), selects non-terminal rows older than per-state max-age, calls `transition_analysis_run(...→retryable_failed|failed)` then `refundMeritsForJob(userId, merit_transaction_id, 'reaper_stale')` (idempotent via `already_refunded` — `merit-gateway.ts:342`). **Dormant:** with no feature writing rows and flags OFF, the cron runs but finds nothing. Arming the cron on prod is an operator-gated step.

**Per-state max-age (discretion — recommended defensible model):**
| State | Max-age | Rationale |
|-------|---------|-----------|
| `extracting_data`, `generating` | 2× the analyze function timeout (~300s) | These call Anthropic; must exceed worst-case provider latency |
| `reserving_merits`, `saving`, `validating_output` | 90–120s | DB/validation-bound; a stall here is a crash, not slow provider |
| `created`, `validating_inputs` | 60s | Pure edge work; anything longer is a dropped invocation |

Terminalize transient-looking stalls (`extracting_data`/`generating`) → `retryable_failed`; hard stalls (`saving` — post-generate) → `failed` (never auto-retry once past generation; preserve any partial). Release reservation exactly once.

### Pattern 5: Realtime enablement (D-05)

**What:** No migration currently touches `supabase_realtime` (grep found zero `ALTER PUBLICATION` — the `resumes` channel in `Results.tsx:411` was enabled via dashboard). 03-01 adds it explicitly in the migration wave:
```sql
-- NEW (03-01, operator-gated — realtime-publication change = checkpoint)
alter table public.analysis_jobs replica identity full;   -- so UPDATE payloads carry old+new
alter publication supabase_realtime add table public.analysis_jobs;
```
**Realtime RLS:** Supabase Realtime `postgres_changes` authorizes via the table's SELECT RLS. The existing `"Users can view their own analysis jobs"` owner-SELECT policy (`20260225160000:33-37`) already scopes pushes to the owner — verify it covers the new columns (it does; RLS is row-level). Frontend subscribe pattern:
```typescript
// Source: src/pages/Results.tsx:408-423 (adapt table→analysis_jobs, filter→id=eq.<run_id>)
const channel = supabase.channel(`analysis-run-${runId}`)
  .on("postgres_changes",
    { event: "UPDATE", schema: "public", table: "analysis_jobs", filter: `id=eq.${runId}` },
    (payload) => { /* setState(payload.new); terminal → resolve */ })
  .subscribe();
// cleanup: supabase.removeChannel(channel)  (Results.tsx:518)
```

### Pattern 6: Dormancy — module-scope flag + per-feature + VITE

```typescript
// Source: supabase/functions/_shared/merit-gateway.ts:27-28 (replicate for the master flag)
export const ANALYSIS_LIFECYCLE_ENABLED =
  (Deno.env.get('ANALYSIS_LIFECYCLE_ENABLED') ?? '').toLowerCase() === 'true';   // default OFF
// per-feature: ANALYSIS_LIFECYCLE_RESUME / _LINKEDIN / _RECRUITING_LENS / _ONBOARDING / _CAREER_COMPASS
```
```typescript
// Source: src/config/feature-flags.ts:22-26 (replicate for the frontend gate)
export function isAnalysisLifecycleEnabled(): boolean {
  return import.meta.env.VITE_FEATURE_ANALYSIS_LIFECYCLE === 'true';   // exact-lowercase-'true', fail-closed
}
```

### Anti-Patterns to Avoid
- **Second state machine** (Pitfall 4): do NOT add a parallel status column set the worker can disagree with. `state` is the source of truth; `status` is a derived dual-write.
- **Native `ENUM`** for `state`: use `text + CHECK` (additive roll-forward).
- **Composing the idempotency key from a save-mutated field** (Pitfall 8): key must be stable input-identity.
- **Refund/error after durable save** (Pitfall 2): `saving → completed` is the point of no return; post-save best-effort steps `log-and-continue`, never `throw MeritRefundable`.
- **Settle on "AI returned" instead of "durably saved"** (Pitfall 3): settle is gated on a verified write.
- **`CREATE OR REPLACE` a view/fn without re-stating `security_invoker`/`search_path`/grants** (Pitfall 10): silently re-opens a v4.0-closed advisor.
- **Status-window dedup as idempotency** (Pitfall 5): the `WR-04` `SELECT ... IN ('pending','retrying','processing')` check (`submit-resume-analysis-job/index.ts:94`) is a TOCTOU race — the partial-UNIQUE index is the atomic guarantee.
- **Substituting a fixed/empty/generic result on validation failure** (Pitfall 9/LIFE-07): typed error + refund, never a fabricated body.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Exactly-once Merit deduction | New dedup logic in the executor | 4-arg `check_and_deduct_merits` + partial-UNIQUE (`20260512000003`) via `withMerits` | Already atomic, unit-tested, race-absorbing (`EXCEPTION WHEN unique_violation`) |
| Reservation release / refund | Direct `refund_merits` call from executor/reaper | `refundMeritsForJob` (`merit-gateway.ts:327`) | Gateway-owned refund (D-03); idempotent via `already_refunded` |
| Transient-error classification | New retry taxonomy | `isRefundableAnthropicError` (`merit-gateway.ts:51`) + `isRetryableHttpStatus` (`process-resume-analysis-job/index.ts:51`) | Canonical narrow classifier (5xx/529/408/network) |
| Bounded backoff | New backoff math | `computeBackoffMs` (`analyze-resume/index.ts:265`, base 1000/max 3000+jitter) — promote to `_shared/` | D-03 names it; already 3 inline copies |
| JSON repair / truncation | New parser | `_shared/json-repair.ts` | Existing markdown-fence/control-char/truncation repair |
| CORS + structured errors | Per-endpoint headers | `withCors` + `jsonError` (`cors.ts:149,202`) | CORS on every response incl. errors; taxonomy rides `jsonError` |
| Internal-secret auth | New HMAC | `requireAuth(req,{type:'internal'})` (`auth.ts:73`) | `timingSafeEqual`, reason-code logging |
| Cron scheduling | New scheduler | pg_cron + pg_net + Vault (`extract_catchup_nightly`) | Existing infra; operator-gated |
| Realtime push | New websocket/poll infra | Supabase Realtime `postgres_changes` (`Results.tsx:408`) | Existing infra; RLS-scoped |
| Idempotent create/recover | `SELECT-then-INSERT` (TOCTOU) | `create_or_recover_analysis_run()` under `pg_advisory_xact_lock` | Replaces the racy `WR-04` window check |

**Key insight:** The substrate's job is to *thread and orchestrate* primitives that already exist and are tested — not to invent accounting, retry, or dedup logic. The one genuinely new piece is the ordered executor's *sequencing discipline* (refund boundary, settle-on-saved), which is enforcement, not new mechanism.

## Runtime State Inventory

> This is an additive-migration phase with cron/realtime/env runtime state. Included because these are NOT captured by a file grep.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `analysis_jobs` table exists with live rows (resume + career + recruiting-lens queue). New columns are additive/nullable — no backfill of `state` required (dual-write starts writing it only when a feature flips; legacy rows stay legacy). | Migration (additive only); NO data migration of existing rows |
| Live service config (not in git) | **pg_cron jobs** `keep-warm-ping`, `extract_catchup_nightly` live in the `cron.job` table per-environment (applied via SQL editor, not `db push`). The new `reap_stale_analysis_runs` cron is the same class. **Realtime publication** membership lives in the DB (`supabase_realtime`), also not in git historically. | Operator applies cron + `ALTER PUBLICATION` on preview then prod (checkpoint) |
| OS-registered state | None — no OS-level registrations involved. | None |
| Secrets / env vars | New edge flags `ANALYSIS_LIFECYCLE_ENABLED` + 5 per-feature flags + frontend `VITE_FEATURE_ANALYSIS_LIFECYCLE` must be set per surface (default OFF). Reaper reuses existing `INTERNAL_JOB_SECRET` (already in Vault as `internal_job_secret`). No new secret values. | Set flags in Vercel + Supabase (prod/preview) — names, not values; document in `docs/ENVIRONMENT.md` |
| Build artifacts / packages | None — no packages added, no build-artifact renames. | None |

**The canonical question — after every file is written, what runtime systems still need changing?** The pg_cron `reap_stale_analysis_runs` job and the `supabase_realtime` publication membership are DB-resident and require operator SQL on preview then prod; the six edge/VITE flags require per-surface env configuration. Everything else is code.

## Common Pitfalls (mapped to the mitigating decision + the concrete guard the plan MUST include)

### Pitfall 1: Idempotency key never forwarded → non-idempotent production deductions
**Mitigated by:** D-02. **Status:** Gateway seam ALREADY wired (`merit-gateway.ts:217`) in Phase 2. **Concrete guard:** 03-02 derives the key edge-side and threads `ctx.idempotencyKey`; **EXTEND** `merit-gateway.idempotency-forward.test.ts` — its gated-remote twin (`:159-200`) already drives `withMerits` with a repeated key asserting exactly one feature-deduct row; add the executor-level derivation path. Static half (`:42-62`) stays in `test:ci`.

### Pitfall 2: Refund/error AFTER durable save (charge-released-on-success)
**Mitigated by:** LIFE-04 + the "saving → completed = point of no return" specific (already enforced in 3 ingesters — see `analyze-resume/refund-after-save.test.ts`, `grade-linkedin/refund-after-save.test.ts` in `deno.json`). **Concrete guard:** executor refunds ONLY from pre-`saving` states; post-save steps `log-and-continue`. Add a static guard asserting `_shared/analysis-lifecycle.ts` never calls `refundMeritsForJob`/`throw MeritRefundable` after the `saving` transition (model on `process-resume-analysis-job/__tests__/refund-on-failure.test.ts:8-17` "completed branch does NOT call refundMeritsForJob").

### Pitfall 3: Settle before save (charge-then-lose)
**Mitigated by:** LIFE-03 ordering. **Concrete guard:** `merit_settled=true` transition is gated on the `saving`→`completed` CAS succeeding (a verified durable write), NOT on the AI response. Invariant test: a settled row (`merit_settled=true`) implies exactly one durable result reference.

### Pitfall 4: Stuck / never-terminal states (two state machines, orphan rows, stranded reservations)
**Mitigated by:** D-01 (reaper) + D-03 (map-don't-duplicate). **Concrete guard:** new `state` maps INTO the existing worker; reaper terminalizes non-terminal rows older than per-state max-age and calls `refundMeritsForJob` exactly once. Test: simulate a worker death mid-`generating`, assert reaper → `retryable_failed`/`failed` + one refund (model on `refund-on-failure.test.ts`).

### Pitfall 5: Status-window dedup mistaken for idempotency (TOCTOU + completed-job re-charge)
**Mitigated by:** D-02 + partial-UNIQUE active-per-feature index. **Concrete guard:** `create_or_recover_analysis_run()` under `pg_advisory_xact_lock` replaces the racy `WR-04` `SELECT ... IN ('pending','retrying','processing')` window check (`submit-resume-analysis-job/index.ts:94`). Concurrency test: N parallel identical submits → exactly one active row, one deduction.

### Pitfall 8: Cache key mutated by saving
**Mitigated by:** D-02 + D-06. **Concrete guard:** `deriveIdempotencyKey` input-identity is stable content-identity; a static/unit test asserts the derivation never reads a save-mutated field. (Substrate defines the contract; features supply identity — Ph4/5/6.)

### Pitfall 9: Validation that silently substitutes a value (masking)
**Mitigated by:** LIFE-07. **Concrete guard:** `_shared/llm-validation.ts` returns a typed error (`SCHEMA_VALIDATION_FAILED` / `MODEL_OUTPUT_TRUNCATED` / `MODEL_INVALID_RESPONSE`) → executor → `retryable_failed`|`failed` + refund; NEVER a fabricated body. Test: feed truncated/empty/garbage output → typed error + refund, never a 200-with-body. `grade-linkedin/validation.ts` is the strict precedent (never fabricates).

### Pitfall 10: `CREATE OR REPLACE` silently re-opens a v4.0-closed advisor
**Mitigated by:** CLAUDE.md operator gate + established pattern. **Concrete guard:** every new/replaced RPC re-states `SECURITY DEFINER` + `SET search_path = public, pg_temp` + explicit `REVOKE ALL ... FROM public` + `GRANT EXECUTE ... TO authenticated, service_role`, and asserts them in the migration's verification DO-block (copy `20260512000003:246-310`). Advisor floor 15 must not increase — snapshot before/after on preview.

### Pitfall 12: False-confidence gate (baseline proves only existing behavior)
**Mitigated by:** 03-05 folds NEW tests into `verify:baseline`. **Concrete guard:** register every new static guard in `deno.json` `test:ci`; a green baseline alone does not cover the new substrate. Dormancy guard: assert no live feature routes through the substrate yet (flags OFF), and baseline counts (deno 832 / vitest 475) are unchanged by the dormant addition.

## Code Examples

### Verification DO-block (assert the migration landed; copy for 03-01)
```sql
-- Source: supabase/migrations/20260512000003_merit_transactions_idempotency.sql:255-310
DO $$
DECLARE v_pronargs smallint; v_prosecdef boolean; v_indexdef text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='analysis_jobs' AND column_name='state')
  THEN RAISE EXCEPTION 'Phase 3 03-01 failed: analysis_jobs.state column missing'; END IF;
  SELECT indexdef INTO v_indexdef FROM pg_indexes
    WHERE schemaname='public' AND indexname='analysis_jobs_active_idem_unique';
  IF v_indexdef IS NULL OR position('WHERE' IN v_indexdef)=0
  THEN RAISE EXCEPTION 'Phase 3 03-01 failed: active-per-feature partial UNIQUE index missing/not partial'; END IF;
  SELECT pronargs, prosecdef INTO v_pronargs, v_prosecdef FROM pg_proc
    WHERE pronamespace='public'::regnamespace AND proname='transition_analysis_run' LIMIT 1;
  IF v_pronargs IS NULL THEN RAISE EXCEPTION 'transition_analysis_run missing'; END IF;
  IF NOT v_prosecdef THEN RAISE EXCEPTION 'transition_analysis_run not SECURITY DEFINER'; END IF;
  RAISE NOTICE 'Phase 3 03-01 verification passed';
END $$;
```

### Static-source drift guard (model 03-05 guards on this; enters test:ci)
```typescript
// Source: supabase/functions/_shared/cors-audit.test.ts:43-77 + merit-gateway.idempotency-forward.test.ts:38-46
// Windows leading-slash idiom (both files use it):
const rawPath = new URL('./analysis-lifecycle.ts', import.meta.url).pathname;
const P = rawPath.startsWith('/') && rawPath[2] === ':' ? rawPath.slice(1) : rawPath;
const src = Deno.readTextFileSync(P);
Deno.test('executor never refunds after saving', () => {
  const afterSaving = src.match(/transition.*'saving'[\s\S]*$/)?.[0] ?? '';
  assertEquals(/refundMeritsForJob|throw new MeritRefundable/.test(afterSaving), false);
});
```

### Gated-remote runtime twin (NOT in test:ci; operator runs on staging)
```typescript
// Source: supabase/functions/_shared/merit-idempotency.test.ts:48,206-286 + idempotency-forward.test.ts:159-200
const GATED = () => Deno.env.get('DENO_TEST_SUPABASE_REMOTE') === '1';
Deno.test('create_or_recover: N parallel identical submits → 1 active row', async () => {
  if (!GATED()) { console.log('SKIP — set DENO_TEST_SUPABASE_REMOTE=1'); return; }
  // provision user, fire Promise.all of create_or_recover_analysis_run() with same key,
  // assert exactly one active row + one deduction (mirrors merit-idempotency retry-storm).
});
```

## State of the Art

| Old Approach | Current (Phase 3) Approach | When Changed | Impact |
|--------------|----------------------------|--------------|--------|
| Sync features with no persistent record (tab-close loses run) | Every run is a persisted `analysis_jobs` row with an 11-state lifecycle | This phase (dormant) | Refresh/nav recovery becomes possible (LIFE-01/09) |
| `WR-04` `SELECT`-window dedup (TOCTOU, completed-job re-charge) | `create_or_recover_analysis_run()` + partial-UNIQUE index | 03-01 | Closes race + completed-job gap (Pitfall 5) |
| 3-arg `check_and_deduct_merits` (non-idempotent) | 4-arg with `p_idempotency_key`, forwarded by `withMerits` | Phase 2 (`20260512000003`); Phase 3 derives+threads the key | Exactly-once deduction (Pitfall 1) |
| Poll-only job status (`get-analysis-job-status`) | Subscribe-first Realtime + poll fallback | 03-04/03-05 (D-05) | Faster, lower-latency status; poll is safety net |
| Fire-and-forget worker with no timeout sweep | pg_cron reaper terminalizes stale + releases reservation | 03-04b (D-01) | Kills the "Taking Longer" hang class (Pitfall 4) |

**Deprecated/outdated:** the 3-arg `check_and_deduct_merits` was **dropped** in `20260520000000_drop_legacy_check_and_deduct_merits_3arg.sql` — only the 4-arg overload remains live. Do not reference the 3-arg signature.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | SHA-256 via `crypto.subtle` over sorted-key JSON is an acceptable idempotency-key derivation | Pattern 3 | LOW — discretion area; any stable collision-resistant order-independent hash satisfies D-02. Confirm serialization is canonical (sorted keys) before locking |
| A2 | Per-state max-age thresholds (300s generate / 90-120s save / 60s created) | Pattern 4 | MEDIUM — discretion area; a too-tight threshold could terminalize a legitimately-slow provider call once features are live (Ph5). Tune against real function timeouts before arming on prod |
| A3 | Supabase Realtime `postgres_changes` authorizes via the table's SELECT RLS policy (existing owner-SELECT suffices for realtime RLS) | Pattern 5 | MEDIUM — if Realtime authz semantics differ (e.g. requires an explicit realtime policy), the subscribe path leaks nothing (fail-closed) but may not deliver. Verify on preview `cimjltzovkahkqecpwgi` (unpaused) before prod |
| A4 | `REPLICA IDENTITY FULL` is needed so UPDATE payloads carry prior column values for the hook | Pattern 5 | LOW — `DEFAULT` (PK only) also works for `new`-row reads; `FULL` is safer for diffing. Confirm hook only needs `payload.new` (it does per `Results.tsx:415`) |
| A5 | Legacy `status` dual-write mapping keeps `get-analysis-job-status` + `Results.tsx` byte-identical | Pattern 1 | MEDIUM — must be validated by running the existing job-contract tests unchanged; a wrong mapping (e.g. `retryable_failed`→`failed` instead of `retrying`) would change poller UX |

## Open Questions

1. **Does Supabase Realtime require an explicit `realtime` schema policy, or does the table SELECT RLS suffice?**
   - What we know: existing `resumes` realtime works with owner-SELECT RLS (`Results.tsx:408`); the owner-SELECT policy on `analysis_jobs` exists (`20260225160000:33-37`).
   - What's unclear: whether current Supabase Realtime authz needs an additional grant/policy for the publication.
   - Recommendation: verify on preview during 03-01; the migration is operator-gated regardless. Fail-closed either way (no leak).

2. **Should the reaper be one plan (03-04b) or fold into 03-03/03-04?**
   - What we know: the reaper's *migration half* (max-age columns, terminalize transition) MUST be in 03-01's wave; the *endpoint + cron arming* is edge/operator work.
   - What's unclear: purely a planning-granularity call (discretion).
   - Recommendation: keep the reaper endpoint + cron as its own small plan for a clean operator checkpoint; the DB columns ride 03-01.

3. **Does `create_or_recover_analysis_run` also perform the Merit reserve, or does the executor call `withMerits` separately?**
   - What we know: SUMMARY flags this as a Phase-3 design decision both patterns support ("single atomic RPC vs deduct-then-compensate").
   - What's unclear: atomic-reserve-in-RPC couples the run row and the deduction; separate keeps the gateway as the single Merit surface (D-03).
   - Recommendation: keep them separate — `create_or_recover_analysis_run()` creates/recovers the row, then the executor calls `withMerits` (gateway owns all Merit control flow per D-03). The idempotency key ties them together.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL (Supabase) | Ledger, RPCs, reaper | ✓ | 15.x | — |
| pg_cron + pg_net | Reaper schedule | ✓ | in prod (keep-warm, extract-catchup) | — |
| Supabase Vault | `internal_job_secret` for reaper | ✓ | `internal_job_secret` seeded | — |
| Supabase Realtime | subscribe-first | ✓ | existing infra | poll fallback (`get-analysis-run-status`) |
| Deno 2 (Edge) | executor, reaper, status endpoint | ✓ | Supabase runtime | — |
| zod | `llm-validation.ts` | ✓ | 3.25.76 (both surfaces) | — |
| Preview project `cimjltzovkahkqecpwgi` | migration + realtime + advisor verification | ✓ | UNPAUSED (D-05) | — |

**Missing dependencies with no fallback:** none. **Missing dependencies with fallback:** Realtime → poll (already the true fallback per D-05).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (edge) | Deno test (`https://deno.land/std@0.224.0/assert`) |
| Framework (frontend) | Vitest 4.1.9 + Testing Library |
| Config file | `supabase/functions/deno.json` (`test:ci` allowlist) ; `package.json` scripts |
| Quick run (edge) | `npm run test:edge` (`cross-env DENO_TEST_SUPABASE_REMOTE=0 deno task test:ci`) |
| Quick run (frontend) | `npm run test` (vitest run) |
| Full suite (blocking gate) | `npm run verify:baseline` (vitest + deno test:ci + Playwright) |
| Gated-remote runtime | `DENO_TEST_SUPABASE_REMOTE=1` + `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (operator, staging; NOT in `test:ci`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| LIFE-05 | Repeated key → 1 deduction end-to-end | gated-remote runtime | `DENO_TEST_SUPABASE_REMOTE=1 deno test _shared/merit-gateway.idempotency-forward.test.ts` | ✅ EXTEND |
| LIFE-05 | N-parallel create_or_recover → 1 active row | gated-remote runtime | new `_shared/analysis-lifecycle.idempotency.test.ts` | ❌ Wave 0 |
| LIFE-03/04 | Executor never refunds after `saving` | static-source | new `_shared/analysis-lifecycle.refund-boundary.test.ts` (in `test:ci`) | ❌ Wave 0 |
| LIFE-06 | Transient→retry, permanent→failed (no retry) | static/unit | new `_shared/analysis-lifecycle.classifier.test.ts` | ❌ Wave 0 |
| LIFE-07 | Truncated/empty/garbage → typed error, never substitute | unit | new `_shared/llm-validation.test.ts` (in `test:ci`) | ❌ Wave 0 |
| LIFE-01 | Transition idempotent + monotonic (no terminal resurrection) | gated-remote runtime | new `_shared/analysis-lifecycle.transition.test.ts` | ❌ Wave 0 |
| D-01 | Reaper terminalizes stale + refunds exactly once | gated-remote/static | new `reap-stale-analysis-runs/__tests__/*.test.ts` | ❌ Wave 0 |
| D-04 | Dormancy: no live feature routed through substrate; baseline counts unchanged | static | new `_shared/analysis-lifecycle.dormancy.test.ts` | ❌ Wave 0 |
| LIFE-08 | Taxonomy → jsonError, no leakage | unit | new `_shared/analysis-error-taxonomy.test.ts` | ❌ Wave 0 |
| LIFE-09 | `useAnalysisRun` subscribe/poll/recover; VITE flag fail-closed | vitest | new `src/hooks/__tests__/useAnalysisRun.test.ts` + `src/config/__tests__/feature-flags.test.ts` extend | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test:edge` (offline deno) and/or `npm run test` (vitest) for the touched surface.
- **Per wave merge:** `npm run verify:baseline`.
- **Phase gate:** full `verify:baseline` green + advisor floor 15 unchanged + operator-verified preview migration before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] Register every new static guard in `supabase/functions/deno.json` `test:ci` (03-05).
- [ ] `_shared/llm-validation.test.ts` — LIFE-07 no-masking (truncated/empty/garbage).
- [ ] `_shared/analysis-lifecycle.*.test.ts` — refund-boundary (static), classifier, transition/idempotency (gated-remote).
- [ ] `reap-stale-analysis-runs/__tests__/*` — reaper terminalize + refund-exactly-once (model on `process-resume-analysis-job/__tests__/refund-on-failure.test.ts`).
- [ ] `src/hooks/__tests__/useAnalysisRun.test.ts` — subscribe/poll/recovery; extend `src/config/__tests__/feature-flags.test.ts` for the new VITE flag.
- [ ] Dormancy guard — assert baseline counts (deno 832 / vitest 475) unchanged by the dormant substrate.

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes | `requireAuth(user)` on `get-analysis-run-status`; `requireAuth(internal)` + `INTERNAL_JOB_SECRET` `timingSafeEqual` on the reaper (`auth.ts:73,163`) |
| V3 Session Management | yes | Supabase JWT via `getUser(token)`; owner-scoped RLS on `analysis_jobs` (Realtime authz) |
| V4 Access Control | yes | Owner-SELECT RLS governs both PostgREST reads and Realtime pushes; workers use service role (bypass by design) |
| V5 Input Validation | yes | Edge input validation before create/recover; `zod` + `superRefine` for LLM output (`llm-validation.ts`); idempotency key derived server-side, never client-trusted (D-02) |
| V6 Cryptography | yes | `crypto.subtle` SHA-256 for key derivation (never hand-roll); `timingSafeEqual` for the reaper secret |
| V7 Error Handling / Logging | yes | Taxonomy → safe user messages only (no payloads/prompts/secrets); reason-code logging (`logger.ts`); `jsonError` no-leak envelope |
| V9 Data Protection | yes | `CHECK (NOT (merit_settled AND refunded))` financial invariant; refund exactly once; advisor floor 15 unchanged |

### Known Threat Patterns for Supabase Edge + Postgres
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client-forged idempotency key (double-spend or reservation-strand) | Tampering | Derive key server-side from intent (D-02); never accept from client |
| TOCTOU double-charge (two tabs / concurrent submit) | Tampering | Partial-UNIQUE index + `pg_advisory_xact_lock` in `create_or_recover` (Pitfall 5) |
| Unauthenticated reaper invocation | Elevation of Privilege | `requireAuth(internal)` `timingSafeEqual` (`auth.ts:163`); cron passes Vault secret |
| `CREATE OR REPLACE` re-opening a closed advisor | Tampering | Re-state `security_invoker`/`search_path`/grants + verification DO-block (Pitfall 10) |
| Realtime over-broadcast (cross-user run visibility) | Information Disclosure | Owner-SELECT RLS scopes `postgres_changes`; verify on preview (A3) |
| Error-body leakage (prompts/payloads/secrets) | Information Disclosure | Taxonomy safe-message table; `jsonError` top-level `error` string only; secrets never logged |
| Result masking (fabricated score to "look done") | Repudiation / integrity | Strict `llm-validation.ts` typed-error, never substitute (LIFE-07/Pitfall 9) |

## Sources

### Primary (HIGH confidence — direct code read, 2026-07-02)
- `supabase/functions/_shared/merit-gateway.ts` — `withMerits` (:149), key forward (:206-218), `MeritGatewayContext.idempotencyKey` (:95), `MERIT_SYSTEM_ENABLED` (:27-28), `MeritRefundable` (:73), `isRefundableAnthropicError` (:51), `refundMeritsForJob` (:327), replay-refund suppression (:259-315).
- `supabase/migrations/20260225160000_add_analysis_jobs_queue.sql` — base ledger + status CHECK + RLS + indexes.
- `supabase/migrations/20260225222000_extend_analysis_jobs_for_career_queue.sql` — CHECK-widen precedent (:1-15).
- `supabase/migrations/20260429000000_add_merit_transaction_id_to_analysis_jobs.sql` — `merit_transaction_id` column.
- `supabase/migrations/20260512000003_merit_transactions_idempotency.sql` — 4-arg RPC (:93-236), partial-UNIQUE (:62-64), REVOKE/GRANT (:246-248), verification DO-block (:255-310).
- `supabase/migrations/20260520000000_drop_legacy_check_and_deduct_merits_3arg.sql` — 3-arg dropped.
- `supabase/migrations/20260310000000_add_keep_warm_cron.sql` + `20260525000003_phase42_layer2_extract_catchup_cron.sql` — pg_cron + pg_net + Vault precedent.
- `supabase/functions/process-resume-analysis-job/index.ts` — CAS claim (:127-142), refund-before-`failed` (:277-297), internal auth (:86), `computeRetryBackoffMs` (:45).
- `supabase/functions/get-analysis-job-status/index.ts` — status poller shape, `withCors(req,'user')`, worker-trigger.
- `supabase/functions/analyze-resume/index.ts:265-269` — `computeBackoffMs` (base 1000/max 3000+jitter).
- `supabase/functions/_shared/cors.ts` — `withCors` (:149), `jsonError` (:202-216, explicitly defers the LIFE-08 nested taxonomy to Phase 3).
- `supabase/functions/_shared/auth.ts` — `requireAuth` internal secret `timingSafeEqual` (:73,148,163).
- `supabase/functions/_shared/merit-idempotency.test.ts` + `merit-gateway.idempotency-forward.test.ts` + `cors-audit.test.ts` + `process-resume-analysis-job/__tests__/refund-on-failure.test.ts` — test precedents.
- `supabase/functions/deno.json` — `test:ci` allowlist (the fold-into-baseline registry).
- `src/config/feature-flags.ts:22-26` — VITE flag exact-`'true'` convention.
- `src/pages/Results.tsx:408-423,518` — `postgres_changes` subscribe + `removeChannel` precedent.
- `supabase/functions/submit-resume-analysis-job/index.ts:94` — `WR-04` window-dedup (the TOCTOU to replace).
- `.planning/config.json` — `nyquist_validation: true`, `commit_docs: true`, no brave/firecrawl/exa.

### Secondary (design inputs)
- `.planning/research/PITFALLS.md` — Pitfalls 1,2,3,4,5,8,9,10,12 + "Looks Done But Isn't" checklist.
- `.planning/research/SUMMARY.md` — convergent build order, wired-vs-built seam, `text+CHECK` over ENUM, "what not to add."
- `.planning/phases/03-shared-analysis-lifecycle-substrate/03-CONTEXT.md` — locked decisions D-01..D-06.

### Tertiary (LOW confidence — flagged in Assumptions Log)
- Realtime RLS authz semantics (A3) — verify on preview.
- Per-state max-age thresholds (A2) — tune against live function timeouts in Ph5.

## Metadata

**Confidence breakdown:**
- Ledger evolution / RPCs (03-01): HIGH — every column, CHECK-widen, partial-UNIQUE, and RPC ceremony read directly from shipped migrations.
- Merit seam (03-02): HIGH — seam already wired and tested; only key derivation is net-new (discretion, A1).
- Executor / validation (03-03): HIGH — all primitives (`withMerits`, `refundMeritsForJob`, classifiers, `computeBackoffMs`, `json-repair`, `zod`) exist; sequencing is enforcement.
- Reaper (03-04b): HIGH for the cron/auth pattern (extract-catchup precedent); MEDIUM for max-age thresholds (A2).
- Realtime (D-05): MEDIUM — publication membership is net-new (no migration precedent); authz semantics need preview verification (A3).
- Error taxonomy / hook (03-04): HIGH — `jsonError`, `feature-flags`, `postgres_changes` precedents all present.
- Dormancy proof (D-04): HIGH — `MERIT_SYSTEM_ENABLED` byte-identical-legacy precedent is exact.

**Research date:** 2026-07-02
**Valid until:** 2026-08-01 (stable brownfield; the only external-facing item is Supabase Realtime authz semantics — re-verify if Supabase platform changes)

## RESEARCH COMPLETE

**Phase:** 3 - Shared Analysis Lifecycle Substrate

**Confidence:** HIGH

### Key Findings
- The Merit idempotency seam is **already wired** (`merit-gateway.ts:217` forwards `p_idempotency_key`; the 4-arg RPC + partial-UNIQUE shipped in Phase 2; `merit-gateway.idempotency-forward.test.ts` already drives the full path). 03-02 is key **derivation + threading**, not gateway re-plumbing.
- `analysis_jobs` already IS a persistent lifecycle ledger with a CAS claim pattern (`process-resume-analysis-job:138-140`), a status poller, a refund-before-`failed` invariant (`:277-297`), and a `postgres_changes` frontend precedent (`Results.tsx:408`). Evolve it additively with `text+CHECK` (never ENUM) + legacy `status` dual-write for byte-identical legacy paths.
- Every RPC copies the shipped `check_and_deduct_merits` ceremony (SECURITY DEFINER + `search_path` + REVOKE/GRANT + verification DO-block, `20260512000003`); the reaper copies `extract_catchup_nightly` (pg_cron + pg_net + Vault → internal edge endpoint with `requireAuth(internal)`).
- **Realtime is the only net-new DB surface with no migration precedent** — `ALTER PUBLICATION supabase_realtime ADD TABLE` + `REPLICA IDENTITY` + verify authz semantics on preview (A3, operator-gated).
- Dormancy is proven via the `MERIT_SYSTEM_ENABLED` module-scope-flag precedent (`:27-28`) + per-feature flags + a `VITE_FEATURE_*` frontend gate; test suite folds into `verify:baseline` via `deno.json` `test:ci` (static guards) + gated-remote runtime twins (skip-by-default).

### File Created
`.planning/phases/03-shared-analysis-lifecycle-substrate/03-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | All reuse; zero new packages; every artifact read from source |
| Architecture (ledger/RPC/executor) | HIGH | Direct migration + code reads; mirrors shipped conventions |
| Pitfalls | HIGH | Code-grounded (line-cited) to the exact seams + guards |
| Realtime (D-05) | MEDIUM | Publication membership net-new; authz semantics need preview verification (A3) |
| Reaper max-age (A2) | MEDIUM | Discretion thresholds; tune against live function timeouts in Ph5 |

### Open Questions
1. Realtime authz — does the owner-SELECT RLS suffice, or is an explicit realtime policy needed? Verify on preview `cimjltzovkahkqecpwgi` (A3).
2. Reaper granularity — its own plan (03-04b) vs folded; DB columns MUST ride 03-01's wave regardless.
3. Reserve-in-RPC vs separate `withMerits` — recommend separate (gateway owns all Merit control flow, D-03).

### Ready for Planning
Research complete. Planner can now create the ~5 PLAN.md files (03-01 migration wave → 03-02 merit seam → 03-03 executor+validation → 03-04 taxonomy/endpoint/hook + 03-04b reaper → 03-05 test-into-baseline), honoring the discretion constraint (migration before executor, tests last) and the operator-gated preview→prod checkpoints on every RLS / DB-function / realtime-publication change.
