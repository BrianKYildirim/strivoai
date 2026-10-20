# Architecture Research

**Domain:** Shared persistent AI-analysis lifecycle + centralized CORS / structured-error contract, integrated into an existing Supabase Edge (Deno) + React/Vite platform
**Researched:** 2026-06-25
**Confidence:** HIGH for existing-architecture facts (direct code reads); MEDIUM-HIGH for the design recommendations (they extend patterns already proven in this repo: CAS job claim, partial-unique idempotency index, idempotent refund RPC, advisory locks)

> Scope note: this is a *subsequent-milestone integration design*, not an ecosystem survey. The base stack (React 18 + Vite, Supabase Edge/Deno, Anthropic Claude, the dual streaming+queue path, `_shared/` utilities, v4.0 RLS + preview→prod migration gate) is taken as fixed. Everything below is the NEW/CHANGED v5.0 surface and how it bolts onto what exists without breaking the other four production behaviors.

---

## Standard Architecture

### What exists today (the substrate we integrate into)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  FRONTEND (React/Vite SPA)                                                 │
│  useResumeStream (SSE+optimistic deduct)   CareerCompass poll loop         │
│  grade-linkedin / recruiting-lens = synchronous invoke (NO recovery)       │
│  useIdempotencyKey · useAnalysisGuard · useMerits · Results Realtime sub   │
├──────────────────────────────────────────────────────────────────────────┤
│  EDGE FUNCTIONS (Deno)                                                      │
│  analyze-resume (SSE)   grade-linkedin   recruiting-lens   analyze-career  │
│  submit-*-job → process-*-job (queue)    get-analysis-job-status (poll)    │
│  _shared/: merit-gateway · cors · auth · anthropic · cache-fingerprint ·   │
│            document-extraction/-persistence · result-merger · rate-limiter │
├──────────────────────────────────────────────────────────────────────────┤
│  POSTGRES                                                                   │
│  analysis_jobs (5-state queue: resume + career only)   analysis_cache      │
│  analysis_results (history)   merit_transactions (idempotency_key)         │
│  user_merits · merit_feature_costs   RPCs: check_and_deduct_merits(3/4-arg),│
│  refund_merits (idempotent), record_ai_usage                               │
└──────────────────────────────────────────────────────────────────────────┘
```

### The five features today — and why they diverge

| Feature | Path today | Persistent lifecycle record? | Refresh-recoverable? | Financially safe? |
|---------|-----------|------------------------------|----------------------|-------------------|
| Onboarding Resume | calls `analyze-resume` / `ocr-pdf` inline | No | No (the "Taking Longer" hang) | Frontend-optimistic only |
| Resume Analysis | DUAL: `analyze-resume` SSE **or** `submit/process-resume-analysis-job` | Only on the **queue** branch (`analysis_jobs`) | Only via in-memory `jobId` | Queue path: yes (submit-time deduct + worker refund). **Streaming path: no server record** |
| LinkedIn Grader | synchronous `grade-linkedin` (`withMerits` inline) | No | No | `withMerits` deduct+refund, but dies if frontend times out |
| Career Compass | queue: `submit/process-career-analysis-job` | Yes (`analysis_jobs`) | In-memory `jobId` only | Yes |
| Recruiting Lens | synchronous `recruiting-lens` (`withMerits` inline) | No (`job_type` enum entry exists but **no** submit/process functions) | No | `withMerits` deduct+refund only |

**Root problem the v5.0 lifecycle solves:** the state machine, idempotency, and Merit-exactly-once semantics exist in *fragments* — `analysis_jobs` covers 2 of 5 features at a coarse 5-state granularity; the synchronous features and the streaming resume path have **no persistent record at all**, so a refresh, navigation, slow provider, or frontend timeout silently loses the run (and on the sync features the user may be left charged with no result rendered if the tab closes mid-call). The fix is **one** lifecycle record + **one** ordered executor that every feature drives, while each feature keeps its own prompts / schemas / mergers / score math.

### Component responsibilities (target state)

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| `analysis_jobs` (evolved → "analysis runs") | Single persistent lifecycle ledger for **all 5** features; survives refresh/navigation | Add lifecycle columns + widen state; keep table name (roll-forward, no destructive rename) |
| `create_or_recover_analysis_run()` RPC | Atomic idempotent create / recover / supersede under an advisory lock | New SECURITY DEFINER plpgsql RPC |
| `transition_analysis_run()` RPC | Guarded compare-and-swap state transition (no lost updates across worker/inline/retry) | New SECURITY DEFINER plpgsql RPC |
| `_shared/analysis-lifecycle.ts` | The ordered executor: enforces request ordering, drives state, integrates Merit reserve/settle/refund, classifies retry vs permanent | New shared helper; features pass feature-specific hooks |
| `check_and_deduct_merits` / `refund_merits` | Atomic reserve + exactly-once refund (already idempotent) | **Reused unchanged** |
| `_shared/cors.ts` (+ `withCors`, `jsonError`) | Origin-aware allow-list, structured error envelope, CORS on **every** response incl. failures | Substantially rewritten |
| `get-analysis-run-status` | Generalized status/recovery endpoint for all features/states | Evolve `get-analysis-job-status` |
| `useAnalysisRun(runId)` | Subscribe-first + poll-fallback recovery hook, retry-only-retryable, preserve-previous | New frontend hook generalizing `useResumeStream` settle logic |

---

## 1 · The shared state model

### Where it lives — recommendation: **evolve `analysis_jobs` into the canonical "analysis runs" ledger** (do NOT create a parallel table, do NOT add a separate transitions table)

Three options were weighed:

| Option | Verdict | Why |
|--------|---------|-----|
| **(A) New `analyses`/`analysis_runs` table** | Rejected as primary | Duplicates the worker, RLS, `archive_path`, `get-analysis-job-status`, and the proven CAS-claim machinery that already live on `analysis_jobs`. The milestone's explicit goal is "without duplicating infrastructure." |
| **(B) Extend `analysis_jobs` (status column + new lifecycle columns)** | **Recommended** | Reuses everything; resume + career already ride it; add columns is roll-forward-safe and fits the v4.0 operator-gated migration gate. Synchronous features get a *row* (ledger) without needing a worker — a `driver` column distinguishes `inline` vs `queue`. |
| **(C) Separate `analysis_run_events` transitions table** | Deferred / optional | A separate append-only events table is real audit infrastructure but is **not required for recovery** — recovery only needs the *current* state, which is a single column. Use a bounded `retry_history jsonb` for the audit you actually need (retries). Add an events table later only if forensic per-stage audit becomes a requirement (YAGNI now). |

Keep the physical table name `analysis_jobs` (renaming a live, RLS-protected, worker-referenced table on an operator-gated prod is gratuitous risk). Optionally expose a `public.analysis_runs` *view* aliasing it for readability. All new helper/endpoint/hook names use "run" vocabulary.

### State set (the v5.0 machine, one `state` column)

```
created
  → validating_inputs
    → reserving_merits
      → extracting_data
        → generating
          → validating_output
            → saving
              → completed        (terminal: charged + result saved)
  ↘ retryable_failed             (transient failure, retries remain → resumable)
  ↘ failed                       (terminal: permanent failure, NO charge to undo)
  ↘ refunded                     (terminal: charge was made, then released)
```

Terminal-state semantics enforce the money rules structurally:
- **completed** ⇒ a deduction happened **and** `result_analysis_id IS NOT NULL` (a saved history row exists).
- **failed** ⇒ failure occurred **before** `reserving_merits` succeeded (missing input / invalid input / auth / unsupported doc) ⇒ there is no charge to undo.
- **refunded** ⇒ failure occurred **after** the deduction but **before** `completed` ⇒ `refund_merits` ran exactly once.
- **retryable_failed** ⇒ transient failure with attempts remaining; the only non-dead resting state. The async worker or the frontend "Retry" picks it up and resumes from the recorded stage.

### Operational metadata each run holds (new columns on `analysis_jobs`)

```sql
-- Lifecycle (new)
state             text     NOT NULL DEFAULT 'created'   -- 11-value CHECK (the machine above)
feature           text     NOT NULL                     -- onboarding_resume|resume_analysis|linkedin_grader|career_compass|recruiting_lens
tier              text     NOT NULL                     -- free|pro|elite (cost + truncation routing)
variant           text     NULL                         -- prompt/model variant (mirrors analysis_cache.variant)
driver            text     NOT NULL DEFAULT 'queue'      -- 'queue' (worker) | 'inline' (sync feature runs executor in-request)

-- Idempotency / concurrency (new)
idempotency_key   text     NULL                         -- client UUID (request-level dedup; forwarded to check_and_deduct_merits 4-arg)
input_fingerprint text     NULL                         -- computeCacheKey(...) over post-truncation inputs ("same inputs" identity)
request_key       text     NULL                         -- hash(user_id|feature|input_fingerprint) — drives the active-run unique index
supersedes        uuid     NULL                         -- older run this one replaced (newest-document-wins)
superseded_by     uuid     NULL                         -- set on the older run when a newer one supersedes it

-- Merit exactly-once (new; reuses existing RPCs)
merit_transaction_id uuid  NULL                          -- deduction_id from check_and_deduct_merits (ALREADY exists)
merit_settled     boolean  NOT NULL DEFAULT false        -- charge finalized (set with state=completed)
refunded          boolean  NOT NULL DEFAULT false        -- refund issued (set with state=refunded)
refunded_at       timestamptz NULL

-- Retry / failure taxonomy (new)
attempts          integer  NOT NULL DEFAULT 0            -- ALREADY exists
max_attempts      integer  NOT NULL DEFAULT 8            -- ALREADY exists
available_at      timestamptz                            -- next eligible run time (ALREADY exists; backoff target)
retry_history     jsonb    NOT NULL DEFAULT '[]'         -- [{attempt, stage, code, http_status, at, backoff_ms}]
failure_stage     text     NULL                          -- the state we failed in
failure_code      text     NULL                          -- machine code from the error taxonomy
retryable         boolean  NULL                           -- last failure classification
last_http_status  integer  NULL                          -- ALREADY exists
last_error_message text    NULL                           -- ALREADY exists (safe, non-leaking)

-- Result linkage (new + existing)
result_analysis_id uuid    NULL                          -- FK → analysis_results.id (the saved history row; save-once guard)
result            jsonb    NULL                          -- ALREADY exists (inline/transient payload; archive_path offloads large)
archive_path      text     NULL                          -- ALREADY exists (Storage offload)
```

Keep the legacy `status` column (`pending|retrying|processing|completed|failed`) during migration and **dual-write** a derived mapping from `state` (`reserving_merits/extracting_data/generating/validating_output/saving → processing`, `retryable_failed → retrying`, `refunded → failed`) so `get-analysis-job-status`, the existing worker, and current frontends keep working byte-for-byte until each feature is cut over. This is the same MIG-05 "legacy path byte-identical behind a flag" discipline already used in `submit-*-job`.

### How transitions persist (survives refresh / navigation / slow provider / timeout)

Every state change is a **committed UPDATE** to the run row via `transition_analysis_run(run_id, expected_from_state, to_state, patch)` — a compare-and-swap that only applies if `state = expected_from_state` (otherwise it returns "stale", so a late worker or a duplicate inline attempt can't clobber a newer state). Because the authoritative state lives in Postgres (not component memory or an SSE buffer), **any** client — the original tab, a refreshed tab, a second device — recovers by reading the row. A slow provider or a frontend `fetch` timeout no longer loses the run: the executor (inline or worker) keeps advancing the row server-side; the frontend re-attaches by `run_id`.

---

## 2 · Mandatory request ordering (the executor contract)

`_shared/analysis-lifecycle.ts` exposes one entry point that every feature drives; the *only* per-feature variation is the injected hooks (which carry each feature's own prompts/schemas/score math):

```ts
type AnalysisHooks<I, O> = {
  validateInputs: (raw: unknown) => Result<I, PermanentError>;     // missing file / bad input → permanent
  fingerprint:    (i: I) => Promise<string>;                       // computeCacheKey over truncated inputs
  cachePrecheck?: (key: string) => Promise<O | null>;              // reuse analysis_cache (no charge, no Claude)
  extract:        (i: I) => Promise<Result<I, FailureCode>>;       // OCR / document-extraction (transient vs permanent)
  generate:       (i: I, txId: string) => Promise<Result<Raw, FailureCode>>; // Anthropic calls + merger (feature-owned)
  validateOutput: (raw: Raw) => Result<O, PermanentError>;         // strict schema/calc validation → permanent if invalid
  save:           (o: O) => Promise<Result<{ analysisId: string }, FailureCode>>; // analysis_results insert (+ saved jobs etc.)
};

runAnalysis(ctx: { userId; tier; feature; corsType; idempotencyKey }, hooks): Promise<RunOutcome>;
```

Enforced order (the executor refuses to reorder these):

```
authenticate (caller did requireAuth)         ── precondition
   │
1  create / RECOVER record  ───────────────────  create_or_recover_analysis_run()  (state=created)
2  validate inputs ────────────────────────────  state=validating_inputs
        └─ invalid/missing → state=failed (NO charge — we have not reserved yet)   ← "never charge for missing input"
3  cache precheck (optional) ──────────────────  hit → save history row (credits=0) → state=completed (no charge)
4  reserve Merits ATOMICALLY ──────────────────  state=reserving_merits
        check_and_deduct_merits(user, feature, tier, idempotency_key)              ← atomic + idempotent
        └─ insufficient/tier_locked → state=failed (NO charge)
        store merit_transaction_id on the row
5  extract data ───────────────────────────────  state=extracting_data
6  generate ───────────────────────────────────  state=generating   (feature's own prompts/merger)
7  validate output STRICTLY ────────────────────  state=validating_output
        └─ invalid schema/calc → REFUND → state=refunded               ← "never charge for invalid output"
8  save ─────────────────────────────────────────  state=saving  (result_analysis_id set; save-once guard)
        └─ save fails → REFUND → state=refunded                        ← "never charge for unsaved result"
9  settle Merit ───────────────────────────────  merit_settled=true
10 mark completed ─────────────────────────────  state=completed
```

On failure at any post-reserve stage:
1. Record `failure_stage` + `failure_code` + `last_error_message` (safe, specific, non-leaking) + append `retry_history`.
2. **Preserve previous valid result** — `save` is the *only* writer of `analysis_results`/`grading_data`; a failed run never overwrites a prior success (and `result_analysis_id IS NULL` until step 8, so there is nothing to clobber).
3. **Release/refund exactly once** — refund fires only when (a) a deduction happened (`merit_transaction_id IS NOT NULL`), (b) `merit_settled = false`, and (c) `refunded = false`. The refund flips `refunded=true` in the *same* `transition_analysis_run` CAS that sets `state=refunded`, so a concurrent retry/worker cannot double-fire; `refund_merits` is itself idempotent (`already_refunded`) as the second safety net.
4. **No double charge / double refund** — a run can be `completed` (⇒ `merit_settled`) XOR `refunded`, never both. Add a row `CHECK (NOT (merit_settled AND refunded))`. Re-deduction is structurally impossible because the merit layer keys on `idempotency_key` (a retry reuses the same key → `already_deducted`).
5. **Safe specific user message** — every terminal/transient state maps to a machine `failure_code` → the frontend taxonomy renders a specific message ("We couldn't read that PDF", "Provider was busy — retrying", "No charge was made"), never a raw stack or a generic "error."

The "settle" step is a row flag, **not** a new RPC: the deduction was already committed at step 4; settling just declares the charge permanent because a saved result was delivered. This avoids inventing a two-phase Merit hold.

---

## 3 · Idempotency & concurrency (concrete Postgres mechanisms)

Four requirements, four concrete mechanisms — all atomic, none relying on best-effort SELECT-then-INSERT (which is the race the current `submit-*-job` "existing active job" lookup has):

**(a) Duplicate clicks for the same active request reuse the in-progress run.**
- Mechanism: `create_or_recover_analysis_run()` runs inside `pg_advisory_xact_lock(hashtext(user_id || ':' || feature))`, then:
  - If an active run exists with the **same** `idempotency_key` **or** the **same** `input_fingerprint` → return it (recover, no new row, no new charge).
- Backed by a **partial UNIQUE index** so even without the advisory lock the DB refuses a second active run:
  ```sql
  CREATE UNIQUE INDEX analysis_runs_active_per_feature
    ON public.analysis_jobs (user_id, feature)
    WHERE state NOT IN ('completed','failed','refunded');   -- "at most one active run per feature"
  ```

**(b) A deliberate new run = new analysis + new History record.**
- The frontend calls `useIdempotencyKey().regenerate()` (already exists) to roll a fresh key, and clears the stored `run_id`. Because the prior run is terminal (or gets superseded — see (d)), the active-per-feature index no longer blocks, so a new row + a new `analysis_results` history row is created. Cache may still short-circuit *generation*, but a fresh History entry is recorded (the existing `credits=0` cache-hit usage row pattern).

**(c) Two tabs cannot double-charge.**
- Both tabs share the same active run (index in (a)) → one `merit_transaction_id`. Even if both race into `check_and_deduct_merits`, the **partial UNIQUE index on `merit_transactions(idempotency_key) WHERE source='feature-deduct'`** (already shipped, migration `20260512000003`) collapses them: the loser catches `unique_violation` and returns the winner's `deduction_id` with `already_deducted=true`. Genuinely different inputs ⇒ different `request_key` ⇒ two runs ⇒ two charges, which is correct.

**(d) Retrying a transient failure can't duplicate a saved result or a Merit txn; newest uploaded document wins.**
- Retry: the run is reused (same row, same `merit_transaction_id`); `save` is guarded by `result_analysis_id IS NULL` (write-once), and reserve is never re-run on a row that already has `merit_transaction_id`. So a retry resumes from `failure_stage` without re-charging or re-saving.
- Newest-document-wins: a new upload produces a different `input_fingerprint` ⇒ different `request_key`. `create_or_recover_analysis_run()` (under the advisory lock) detects the existing active run has a *different* fingerprint and **supersedes** it: sets the old run `superseded_by = new.id`, transitions it to a terminal `failed` (code `superseded`) — refunding it if it had reserved — then inserts the new active run. The advisory lock makes the supersede+insert atomic, so two near-simultaneous uploads can't both think they won.

This replaces the current best-effort pattern (`.select(...).in('status', active).maybeSingle()` then `.insert()` in `submit-resume-analysis-job`) with one race-free RPC.

---

## 4 · Bounded retry of ONLY transient failures

Reuse the taxonomy that already exists (`isRefundableAnthropicError` in `merit-gateway.ts`, `isRetryableHttpStatus`/`computeRetryBackoffMs` in `process-resume-analysis-job`) — promote it to `_shared/analysis-lifecycle.ts` as the single classifier:

| Class | Examples | `failure_code` family | Action |
|-------|----------|----------------------|--------|
| **Transient → retry** | provider timeout (408/AbortError), rate-limit (429), 5xx incl. 529 overloaded, ECONNRESET/network, transient DB (deadlock `40P01`, serialization `40001`, connection) | `provider_timeout`, `provider_overloaded`, `provider_rate_limited`, `network`, `db_transient` | `state=retryable_failed`; `available_at = now() + computeRetryBackoffMs(attempts)` (exp + jitter, cap 5 min); append `retry_history`. Resumed by worker (queue) or "Retry" CTA (inline). Capped at `max_attempts` (8) → then `failed`/`refunded`. |
| **Permanent → NO retry** | missing file, invalid input (length/Zod), auth (401/403), unsupported doc / `all_providers_failed` extraction, schema-incompatible or malformed output, malformed source | `missing_input`, `invalid_input`, `unauthorized`, `unsupported_document`, `extraction_failed`, `output_invalid` | Terminal immediately. If before reserve → `failed` (no charge). If after reserve → `refunded`. Never scheduled for retry. |

Key invariant: **classification happens in exactly one place** (the executor), so the sync features (which today retry ad-hoc inside `grade-linkedin`'s `invokeWithRetry`) and the async worker share identical rules. The worker stops being the retry authority — it becomes a *driver* that calls `runAnalysis()` and honors the `state`/`available_at` the executor wrote.

---

## 5 · Frontend recovery

`useAnalysisRun(runId)` generalizes the proven pieces (`useResumeStream`'s `settle` closure, `Results.tsx`'s Realtime subscription, `CareerCompass.tsx`'s poll loop) into one hook:

- **Poll vs subscribe → do both: subscribe-first, poll-fallback.** Subscribe to `postgres_changes` on `analysis_jobs` filtered `id=eq.{runId}` (already used in `Results.tsx`), because it gives near-instant terminal detection. But Realtime has historically been env-gated, so **always** start a `get-analysis-run-status` poll with `pollAfterMs` backoff as the fallback. Whichever observes a terminal state first wins; the other is torn down. This removes the dependency risk of Realtime while keeping its latency benefit when enabled.
- **Recover an active analysis after refresh.** Persist `run_id` in the URL (`?run=<id>` or route param — survives refresh, shareable, already the pattern for resume `Results/:id?jobId=`) **and** mirror it to `localStorage` keyed by `feature` (survives full navigation away). On mount, if a `run_id` is present and its state is non-terminal, re-attach and resume the loading UI from the persisted `state` — this is what fixes the Onboarding "Taking Longer Than Expected" hang (the run keeps progressing server-side; the UI just re-attaches).
- **Show delayed result.** On `state=completed`, read `result_analysis_id` and fetch the saved row from `analysis_results` (RLS-scoped) — the result renders even if the original request `fetch` already timed out client-side.
- **Stop at terminal state.** Hook unsubscribes/stops polling on `completed | failed | refunded`. `retryable_failed` keeps a "retrying…" indicator (queue) or surfaces a **Retry** button (inline).
- **Retry-only-retryable.** The Retry CTA is rendered **only** when `state=retryable_failed` (or `failed` with `retryable=true` and attempts remaining). Permanent `failed`/`refunded` show the specific reason + (for refunded) "No charge was made," with no retry affordance.
- **Preserve previous success.** The hook keeps the last `completed` result in state; a subsequent failed run never clears it (mirrors the current resume-stream behavior that only sets error state, never wipes a prior render).
- **Reset stale state before a deliberate new run.** Starting a new analysis: `regenerate()` the idempotency key, clear `run_id` from URL+localStorage, call `create_or_recover_analysis_run()` (which supersedes any lingering active run per §3d) → guarantees a clean fresh run rather than re-attaching to a stale one.

---

## 6 · Centralized CORS + frontend-readable structured-error contract

Two distinct bugs, one centralized fix in `_shared/cors.ts`:

**Bug 1 — single-origin CORS rejects `https://www.strivoai.net`.** `corsHeaders()` today returns `Access-Control-Allow-Origin: <APP_URL>` (one exact origin). Apex vs `www`, preview, and dev are all rejected.

**Bug 2 — errors get swallowed by CORS.** `auth.ts`'s `unauthorizedResponse()` and several `catch` blocks return `Response`s **without** CORS headers. The browser then blocks the body, so the frontend sees an opaque "CORS error" instead of the real 401/402/500 — errors don't render.

Recommended architecture:

```ts
// _shared/cors.ts — origin-aware allow-list (NOT wildcard, because requests are credentialed)
const ALLOWED = (Deno.env.get('ALLOWED_ORIGINS') ?? '')   // env policy per environment
  .split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);

export function corsHeaders(req: Request, type: CorsType, extra?: string): Record<string,string> {
  if (type !== 'user') return {};                          // internal/webhook unchanged
  const origin = (req.headers.get('origin') ?? '').replace(/\/$/, '');
  const allow = ALLOWED.includes(origin) ? origin : ALLOWED[0]; // echo matched origin; safe default otherwise
  return {
    'Access-Control-Allow-Origin': allow,                  // exact echo, never '*', never '*'+credentials
    'Vary': 'Origin',                                      // correct caching across the allow-list
    'Access-Control-Allow-Headers': `authorization, x-client-info, apikey, content-type${extra ? ', '+extra : ''}`,
  };
}

// withCors wrapper — guarantees CORS on EVERY response, incl. thrown Response/Error and OPTIONS
export function withCors(req: Request, type: CorsType, handler: () => Promise<Response>): Promise<Response> { ... }

// jsonError — single structured, frontend-readable envelope (always CORS-tagged)
export function jsonError(req: Request, status: number, code: string, message: string, extra?: object): Response {
  return new Response(JSON.stringify({ error: { code, message, retryable: isRetryable(status), ...extra } }),
    { status, headers: { ...corsHeaders(req, 'user'), 'Content-Type': 'application/json' } });
}
```

- **Structured error envelope** (stable across all functions): `{ error: { code, message, retryable, stage?, requestId? } }`. `code` is the machine `failure_code` from §4; the frontend `src/lib/analysisError.ts` maps it to specific copy (extends the existing `merit-error-messages.ts`).
- `auth.ts`'s 401/403 responses are rebuilt through `jsonError(req, 401, 'unauthorized', ...)` so even auth failures carry CORS headers and render.
- Keep fail-closed: an unrecognized origin still gets a deterministic response (no `*`-with-credentials), but the **error body is still readable** for the approved origins, which is the whole point — errors render, they don't disappear.
- Add a regression test (deno) asserting every active function returns CORS headers on success **and** on 4xx/5xx, and that apex + approved www + preview + localhost are accepted while an unapproved origin is not (closes the "cannot recur" requirement).

---

## NEW vs MODIFIED (file / table level)

### NEW

| Artifact | Location | Purpose |
|----------|----------|---------|
| Lifecycle migration | `supabase/migrations/<ts>_analysis_runs_lifecycle.sql` | Add lifecycle columns to `analysis_jobs`, widen `feature`/state CHECK to 5 features + 11 states, partial unique indexes (active-per-feature, merit already exists), `CHECK (NOT (merit_settled AND refunded))`. Roll-forward, operator-gated prod. |
| `create_or_recover_analysis_run()` | same migration | Advisory-locked atomic create / recover / supersede (idempotency + newest-wins). SECURITY DEFINER. |
| `transition_analysis_run()` | same migration | Guarded CAS state transition (no lost updates). SECURITY DEFINER. |
| `_shared/analysis-lifecycle.ts` | `supabase/functions/_shared/` | The ordered executor + classifier + failure taxonomy + hook interface. |
| `get-analysis-run-status` | `supabase/functions/` | Generalized status/recovery endpoint (evolves `get-analysis-job-status`). |
| `useAnalysisRun.ts` | `src/hooks/` | Subscribe+poll recovery hook (run_id persistence, retry-only-retryable, preserve-previous). |
| `src/lib/analysisError.ts` | `src/lib/` | Structured-error envelope → user-message taxonomy. |
| `withCors` / `jsonError` | inside `_shared/cors.ts` | Always-CORS wrapper + structured error helper. |

### MODIFIED

| Artifact | Change |
|----------|--------|
| `_shared/cors.ts` | Origin-aware allow-list (`ALLOWED_ORIGINS`), `Vary: Origin`, `withCors`, `jsonError`. |
| `_shared/auth.ts` | `unauthorizedResponse()` → CORS-tagged `jsonError` (frontend-readable 401/403). |
| `_shared/merit-gateway.ts` | Executor reuses `check_and_deduct_merits` (4-arg, idempotency_key) + `refund_merits` directly; `withMerits` stays for not-yet-migrated callers. No RPC changes. |
| `analyze-resume`, `grade-linkedin`, `recruiting-lens`, `analyze-career`, onboarding caller | Refactor each to implement the hook interface (keep their prompts / schemas / mergers / score math) and route through `runAnalysis()`. Sync features run `inline`; streaming resume gains a lifecycle record at stream start. |
| `submit-*-job` / `process-*-job` | Worker becomes a *driver* that calls `runAnalysis()`; replace the racy "existing active job" SELECT with `create_or_recover_analysis_run()`; honor executor-written `state`/`available_at`. |
| `get-analysis-job-status` | Fold into / alias `get-analysis-run-status`; emit new `state` + legacy `status` during migration. |
| All ~20 active edge functions | Wrap responses with `withCors`/`jsonError` (CORS workstream). |
| `src/hooks/useResumeStream.ts`, `CareerCompass.tsx`, `Results.tsx`, LinkedIn/RecruitingLens pages | Adopt `useAnalysisRun` + run_id persistence incrementally. |

---

## Data-flow changes

### Before (Recruiting Lens, representative of the sync gap)
```
click → recruiting-lens (withMerits: deduct → 3 Claude calls → merge → persist analysis_results → record usage)
        │  (if tab closes / fetch times out here: user charged-or-refunded, but NO record to recover; UI dead)
        └→ JSON back to a single awaiting fetch
```

### After (every feature, uniform)
```
click → create_or_recover_analysis_run() ── advisory lock ── returns run_id (state=created)
        │   (frontend stores run_id in URL + localStorage; useAnalysisRun subscribes+polls)
        ▼
   runAnalysis(): validating_inputs → reserving_merits(check_and_deduct, idempotency_key)
        → extracting_data → generating(feature prompts/merger) → validating_output
        → saving(analysis_results, result_analysis_id) → settle → completed
        │   (each arrow = committed transition_analysis_run CAS; survives refresh/timeout)
        └─ any transient failure → retryable_failed(+backoff); permanent → failed/refunded
        ▼
   useAnalysisRun observes terminal state → renders saved result OR specific error/retry
```

---

## Integration points

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Executor ↔ Merit layer | `check_and_deduct_merits(…, idempotency_key)` / `refund_merits(deduction_id)` | Reused unchanged; both already idempotent. Reserve at step 4, refund only on post-reserve failure. |
| Executor ↔ run row | `create_or_recover_analysis_run` / `transition_analysis_run` (CAS) | All state durability + concurrency safety lives here. |
| Executor ↔ feature | injected `AnalysisHooks` | The ONLY place feature-specific prompts/schemas/score math live — shared lifecycle never sees prompt internals. |
| Executor ↔ cache | `cachePrecheck` hook → `analysis_cache` (via `computeCacheKey`) | Cache hit short-circuits generation (no charge, no Claude) but still records a History row. |
| Executor ↔ extraction | `extract` hook → `document-extraction.ts`/`document-persistence.ts` | `all_providers_failed` = permanent; OCR provider timeouts = transient. |
| Worker ↔ executor | worker = thin driver calling `runAnalysis()` | Worker no longer owns retry/refund logic. |
| Frontend ↔ run | Realtime `postgres_changes(id=run_id)` + `get-analysis-run-status` poll | Subscribe-first, poll-fallback (Realtime env-gated). |
| All functions ↔ browser | `withCors`/`jsonError` | CORS on every response; structured envelope renders errors. |

---

## SUGGESTED BUILD ORDER (maps ~1:1 to phases)

Sequence chosen so the lowest-risk, most-independent work lands first, the substrate ships dormant before anything depends on it, and the five features migrate **one at a time** behind per-feature flags (the MIG-05 "legacy path byte-identical until flag flips" discipline already in the repo) — each validated on staging + operator-approved to prod before the next.

1. **Central CORS + structured-error contract.** Rewrite `cors.ts` (origin allow-list, `withCors`, `jsonError`), fix `auth.ts` 401 CORS, roll to all active functions, add the success-and-failure CORS regression test. *Independent, unblocks `www.strivoai.net` immediately, and every later lifecycle error rides on this envelope.* Dependency for everything; no dependency on the lifecycle.

2. **Lifecycle substrate (DB only, dormant).** Migration: lifecycle columns + widened CHECKs + partial unique indexes + `CHECK (NOT (merit_settled AND refunded))` + `create_or_recover_analysis_run` + `transition_analysis_run`. Nothing reads/writes the new columns yet (exactly how `analysis_cache` shipped substrate-first). Operator-gated preview→prod; `verify:baseline` green. *No behavior change.*

3. **Shared executor + status endpoint + recovery hook (unwired).** Ship `_shared/analysis-lifecycle.ts`, `get-analysis-run-status`, `useAnalysisRun`, `analysisError.ts` behind flags, with deno/vitest coverage for the state machine, idempotency, refund-exactly-once, retry-vs-permanent classification, and supersede. *Not yet attached to any feature.*

4. **Migrate Recruiting Lens FIRST.** Smallest blast radius (Pro/Elite only, low traffic), it's the confirmed-broken production path, and it's synchronous so it proves the `inline` driver + idempotency + refund-exactly-once + refresh recovery end-to-end without worker coupling. Keep the legacy path behind the flag; flip on staging, soak, operator-approve prod.

5. **Migrate LinkedIn Grader.** Also synchronous; proves the strict `validateOutput` gate and a deterministic-compute hook (fixes the ~52/100 clustering by computing the score mathematically inside `validateOutput`/`generate` rather than trusting the model).

6. **Migrate Onboarding Resume + Resume Analysis (dual path).** Highest traffic + business-critical, done only after the pattern is proven on the two sync features. The streaming path gains a lifecycle record at stream start (financial safety + recovery); the onboarding hang is fixed by run-id re-attach. Preserve Resume Analysis output quality exactly (reliability-only change).

7. **Migrate Career Compass last.** Most complex inputs (resume-only / LinkedIn-only / combined) and already async-queue — migrate after the executor is battle-tested on simpler features.

8. **Contract & decommission.** Once all five ride the executor: fold `get-analysis-job-status` into `get-analysis-run-status`, retire divergent ad-hoc retry/refund code, drop the legacy `status` dual-write, and add a guard test asserting no feature reserves Merits or saves results outside `runAnalysis()`.

**Dependency spine:** 1 → 2 → 3 → (4 → 5 → 6 → 7 each independent behind a flag, orderable but recommended in this risk order) → 8. Steps 1 and 2 can proceed in parallel; 3 needs 2; each feature migration needs 3; 8 needs all features done.

---

## Anti-Patterns

### Anti-Pattern 1: A second parallel `analyses` table
**What people do:** create a fresh table for the new lifecycle and leave `analysis_jobs` for the queue.
**Why it's wrong:** duplicates the worker, RLS, archive offload, status endpoint, and CAS-claim machinery; creates two sources of truth for "is this analysis done"; doubles the migration surface on an operator-gated prod.
**Do this instead:** evolve `analysis_jobs` in place; distinguish sync vs async with a `driver` column.

### Anti-Pattern 2: Best-effort "SELECT active run then INSERT"
**What people do:** the current `submit-*-job` pattern — query for an active job, then insert if none. There's a race window between the two.
**Do this instead:** `create_or_recover_analysis_run()` under `pg_advisory_xact_lock` + a partial-unique active-per-feature index. Atomic, race-free.

### Anti-Pattern 3: Refund driven by control flow alone
**What people do:** call `refund_merits` in a catch block and hope it fires once.
**Why it's wrong:** a worker retry + an inline retry + a late timeout can each enter the catch path → double refund attempts.
**Do this instead:** refund guarded by row flags (`merit_transaction_id IS NOT NULL AND NOT merit_settled AND NOT refunded`) flipped in the same CAS transition, with the idempotent `refund_merits` (`already_refunded`) as the backstop. `CHECK (NOT (merit_settled AND refunded))`.

### Anti-Pattern 4: Reserving Merits before validating inputs
**What people do:** deduct first, validate later.
**Why it's wrong:** charges users for missing files / malformed input that never had a chance to produce a result.
**Do this instead:** the executor's fixed order — `validating_inputs` precedes `reserving_merits`; pre-reserve failures end in `failed` (no charge), never `refunded`.

### Anti-Pattern 5: Returning errors without CORS headers
**What people do:** `new Response(JSON.stringify({error}), {status:401})` with no CORS headers (today's `auth.ts`).
**Why it's wrong:** the browser blocks the body; the frontend sees an opaque CORS failure and renders nothing useful.
**Do this instead:** `jsonError(req, …)` — every response (success and failure, incl. thrown Responses and OPTIONS) carries origin-aware CORS headers and the structured envelope.

### Anti-Pattern 6: Retrying permanent failures
**What people do:** a blanket retry loop (today's `grade-linkedin` `invokeWithRetry` retries on any non-4xx).
**Why it's wrong:** burns Merits/time re-running malformed-input or schema-incompatible cases that will never succeed.
**Do this instead:** one classifier in the executor; only the transient family schedules `retryable_failed` + backoff; the permanent family terminates immediately.

---

## Scaling Considerations

| Scale | Adjustments |
|-------|-------------|
| 0–1k users | Current design is sufficient. Inline driver for sync features; existing worker chain for async. Partial indexes keep the active-run lookup O(1). |
| 1k–100k | Watch `analysis_jobs` growth — `result` jsonb offloads to Storage via the existing `archive_path`/`lifecycle-archive-writer`. Add a periodic vacuum of terminal runs older than N days into an archive table. Realtime subscription fan-out becomes the first thing to monitor; the poll-fallback caps blast radius if Realtime is disabled. |
| 100k+ | Move the async worker from fire-and-forget HTTP chaining to a real queue (pg_cron + `SELECT … FOR UPDATE SKIP LOCKED`, or Supabase Queues) — the CAS-claim already models this. The lifecycle table stays the source of truth; only the *driver* changes. |

**First bottleneck:** the fire-and-forget worker trigger (`fetch` to `process-*-job`) is best-effort; under load some triggers drop. The status-poll already re-triggers due jobs (`get-analysis-job-status` does this today) — keep that, and add `SELECT … FOR UPDATE SKIP LOCKED` claiming when traffic warrants.
**Second bottleneck:** Realtime connection count. Mitigated by subscribe-first/poll-fallback — degrade to poll under pressure.

---

## Integration risks / open questions for the roadmapper

- **Streaming resume path + lifecycle record.** The SSE path currently has no server record; adding `create_or_recover_analysis_run` at stream start and transitions during streaming is the one place the dual path needs care to stay financially safe without regressing latency. Flag this phase for deeper design.
- **`ALLOWED_ORIGINS` per environment.** The CORS allow-list must be set distinctly on staging vs prod Supabase secrets (apex + approved www + that env's preview/localhost). This is an operator env task riding the existing env-separation discipline (`docs/ENVIRONMENT.md`).
- **Table-name decision.** Keep `analysis_jobs` physical name (recommended) vs add an `analysis_runs` view alias — a naming call for the roadmap, not a blocker.
- **Optional `analysis_run_events` audit table.** Deferred; revisit only if per-stage forensic audit becomes a requirement beyond `retry_history`.

## Sources

- Direct code reads (HIGH confidence): `_shared/merit-gateway.ts`, `_shared/cors.ts`, `_shared/auth.ts`, `_shared/cache-fingerprint.ts`, `_shared/document-extraction.ts`, `_shared/document-persistence.ts`; `submit-resume-analysis-job`, `process-resume-analysis-job`, `get-analysis-job-status`, `submit-career-analysis-job`, `grade-linkedin`, `recruiting-lens` index files; `src/hooks/useResumeStream.ts`, `useIdempotencyKey.ts`, `useAnalysisGuard.ts`; `src/pages/CareerCompass.tsx`, `Results.tsx`.
- Migrations (HIGH): `20260225160000_add_analysis_jobs_queue.sql`, `20260225222000_extend_analysis_jobs_for_career_queue.sql`, `20260409000001_add_recruiting_lens_job_type.sql`, `20260429000000_add_merit_transaction_id_to_analysis_jobs.sql`, `20260512000000_analysis_cache_table.sql`, `20260512000003_merit_transactions_idempotency.sql`, `20260415000000_merit_rpcs.sql`, `20251222223116_*.sql` (analysis_results).
- `.planning/PROJECT.md` v5.0 milestone scope (workstreams 2 & 3).

---
*Architecture research for: v5.0 shared persistent AI-analysis lifecycle + central CORS/error contract*
*Researched: 2026-06-25*
