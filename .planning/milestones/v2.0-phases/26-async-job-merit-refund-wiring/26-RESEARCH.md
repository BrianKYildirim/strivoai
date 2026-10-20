# Phase 26: async-job-merit-refund-wiring - Research

**Researched:** 2026-04-28
**Domain:** Supabase Edge Functions (Deno) + Postgres RPC integration; Merit refund wiring for queued analysis workers
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Idempotency mechanism**
- **D-01:** Rely on the `refund_merits` RPC's existing `already_refunded` guarantee — no new column, no worker-side state. Worker always calls `refundMeritsForJob()`; if already refunded, RPC returns `{"error":"already_refunded"}` with zero mutations (verified at `supabase/migrations/20260415000000_merit_rpcs.sql:184-193`). Trade-off accepted: one no-op RPC roundtrip per re-process.
- **D-02:** Treat `{"error":"already_refunded"}` from `refundMeritsForJob` as a success-equivalent outcome (log at `info` level, NOT `error`). The function currently returns `{ ok: false, error: error.message }` for any RPC error including this string; planning must decide whether to (a) extend `refundMeritsForJob` to recognize this string and return `{ ok: true, alreadyRefunded: true }`, or (b) handle the string at the call site. **Preference: extend the helper** so callers stay simple.

**Refund scope**
- **D-03:** Refund on EVERY transition to `status='failed'`. Invariant: "merit was deducted AND no value was delivered → refund." Covers retry-exhausted refundable errors, immediate non-retryable errors (e.g. 400 from analyze-resume on bad payload), and worker-thrown errors. No branch in either processor that sets `status='failed'` may skip the refund.
- **D-04:** `status='completed'` does NOT refund. `status='retrying'` does NOT refund (the merit stays held until the job either completes or terminally fails).

**Refund-failure handling**
- **D-05:** Best-effort refund. If `refundMeritsForJob()` returns `{ ok: false }`, log a structured `error`-level entry that includes `user_id`, `merit_transaction_id`, `job_id`, `feature` (`resume_analysis` or `career_analysis`), and `reason`, then proceed to write `status='failed'`. Do NOT block the status update.
- **D-06:** Order of operations: call `refundMeritsForJob()` BEFORE the `update analysis_jobs set status='failed'` SQL.

**Worker-error catch path**
- **D-07:** The `catch (processError)` block (`process-resume-analysis-job/index.ts:313-343`, mirror at `process-career-analysis-job/index.ts`) MUST also call `refundMeritsForJob()` when `maxedOut === true` and the resulting `update` writes `status='failed'`.

**Submit-side persistence**
- **D-08:** In both `submit-resume-analysis-job` and `submit-career-analysis-job`, change `async (_txId) =>` to `async (txId) =>` and include `merit_transaction_id: txId` in the `analysis_jobs` insert payload. The insert MUST happen inside the `withMerits` callback so a failed insert triggers refund at submission time — that contract stays unchanged.
- **D-09:** Pre-migration jobs (rows where `merit_transaction_id IS NULL`) — worker MUST short-circuit BEFORE calling `refundMeritsForJob()`. Path: log at `warn` level with `{ job_id, reason: 'pre_migration_null_txid' }` and skip the refund call.

**Migration shape**
- **D-10:** `ALTER TABLE public.analysis_jobs ADD COLUMN IF NOT EXISTS merit_transaction_id uuid NULL`. No FK constraint, no index. RLS inherits — no new policy.

**Tests (SC #5)**
- **D-11:** Deno tests in `supabase/functions/process-resume-analysis-job/__tests__/` and `supabase/functions/process-career-analysis-job/__tests__/`. Cases (a)–(d) per CONTEXT.
- **D-12:** Submit-side persistence test recommended but optional.

### Claude's Discretion
- Plan boundary: roadmap suggests "likely 2 plans (migration + submit-side persist; processor-side refund + tests)." Planner may keep that split or merge.
- `reason` string format: snake_case ≤32 chars (`retry_exhausted`, `non_retryable_error`, `worker_exception`, `pre_migration_null_txid`).

### Deferred Ideas (OUT OF SCOPE)
- Audit/operator-attention surface for failed refunds (`merit_refund_failures` table + admin dashboard).
- Submit-side test for txn id persistence (optional, not required by SC #5).
- Retroactive refund for in-flight pre-migration jobs.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MER-11 | Merit deduction MUST happen BEFORE the AI call; on AI failure the deduction is auto-refunded and logged. | Async-path PARTIAL → satisfied. Submit-side `withMerits` already deducts pre-AI (see `submit-resume-analysis-job/index.ts:107-161`). This phase plumbs the txn id into `analysis_jobs.merit_transaction_id` and wires `refundMeritsForJob()` into every `status='failed'` branch (4 sites: 2 response-path, 2 worker-error-catch across both processors). RPC-level idempotency (`already_refunded`) is the canonical anti-double-refund guard, verified in code below. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Reliability priority:** Resume Analysis and Career Compass are business-critical user flows. This phase directly affects both — code MUST NOT introduce a path where `status='failed'` is written but the merit is silently kept (this is the bug being fixed).
- **No commits under `.planning/`** — this RESEARCH.md and all planning artifacts are gitignored.
- **Edge-function logging style in these workers:** raw `console.log/warn/error` with object payloads (NOT `_shared/logger.ts createLogger`). Stay consistent. (Confirmed across both worker files.)
- **Coding style:** preserve existing TS/React patterns; no unnecessary abstractions; specific user-facing error messages.
- **Migration naming:** `supabase/migrations/<UTC-timestamp>_<snake_case>.sql`.

## Summary

The phase fixes a verified MER-11 async-path leak: `submit-{resume,career}-analysis-job` deduct merits via `withMerits()` and discard the returned `txId` (current source: `async (_txId) => …`), so `analysis_jobs` rows have nowhere to record the deduction. The workers (`process-resume-analysis-job`, `process-career-analysis-job`) consequently have no transaction handle to pass to `refundMeritsForJob()` on terminal failure, and merits are silently kept.

The fix is mechanical and tightly scoped: (1) one nullable column on `analysis_jobs`, (2) one-line submit-side rename + one-field insert in both submitters, (3) a refund call on the FOUR terminal-failure branches across both workers (resume response-path, resume worker-catch maxed-out branch, career response-path, career worker-catch maxed-out branch), (4) a small extension to `refundMeritsForJob` so the `already_refunded` RPC string maps to `{ ok: true, alreadyRefunded: true }`, (5) Deno tests covering SC #5 (a)–(d).

All five locked contracts (`refund_merits` RPC return shape, `refundMeritsForJob` signature, `withMerits` txn-id provenance, submit-time refund-on-insert-fail behavior, worker `analysis_jobs` RLS) are verified intact and unchanged. The migration is forward-only and idempotent (`ADD COLUMN IF NOT EXISTS`), and pre-migration jobs are handled by a null-check short-circuit in the worker (D-09).

**Primary recommendation:** Ship as 2 plans matching the roadmap split (Plan 1: migration + both submit-side `_txId → txId` + insert payload + helper extension for `already_refunded`; Plan 2: both workers' four refund call-sites + delete the obsolete REQUIRED FOLLOW-UP comment + Deno tests). Keep the helper extension in Plan 1 so Plan 2 can rely on the cleaner `{ ok: true, alreadyRefunded: true }` return.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Persist deduction handle on enqueue | API / Backend (submit-* edge functions) | — | Submit-side already calls `withMerits` and owns the insert — adding a column to the insert payload is a one-line change at the existing site. |
| Read deduction handle, call refund RPC on terminal failure | API / Backend (process-* edge workers) | — | Workers are the only code that knows the job hit a terminal-failure branch. Frontend is purely a poller of `status` and has no merit-system role here. |
| Idempotency of the refund | Database / Storage (`refund_merits` RPC) | API / Backend (caller short-circuit on null txid) | Phase 11 RPC is the canonical guard via `already_refunded` (lines 184–193). Worker only adds a NULL-txid pre-check to avoid feeding garbage to the RPC. |
| Schema additive change | Database / Storage (migration) | — | Single nullable column, idempotent ALTER. RLS inherits from base table. |
| Test the refund wiring | API / Backend (Deno tests under `__tests__/`) | — | Workers are Deno; test framework follows the existing source-grep + integration pattern under `supabase/functions/*/__tests__/`. |

**Tier sanity check:** No browser/frontend work is in scope. `useResumeStream.ts` already polls `analysis_jobs.status` and `AiCreditsContext` reads merit balance from `user_merits` on next refresh — both consume the refund passively. CONTEXT confirms "No frontend change required."

## Standard Stack

### Core (already present, no installs needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Deno std assert | `https://deno.land/std@0.224.0/assert/mod.ts` | Test assertions | Existing tests in this repo use this exact import. **[VERIFIED: `supabase/functions/interview-prep-analyze/__tests__/merit-refund.test.ts:38`]** |
| `@supabase/supabase-js` (via `_shared/supabase-client.ts`) | repo singleton | Postgres RPC + table client | Workers already import `getServiceClient`. No change. **[VERIFIED: `process-resume-analysis-job/index.ts:2`]** |
| `_shared/merit-gateway.ts` | repo module | `refundMeritsForJob(userId, transactionId, reason)` | **Already exported and idempotent at the RPC layer** (lines 209–225). Phase only extends it (D-02 preference). **[VERIFIED]** |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Deno `Deno.test` | runtime built-in | Test runner | Match existing worker-adjacent test style. **[VERIFIED]** |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Source-grep / module-shape Deno tests | Full integration tests with stubbed `globalThis.fetch` + mocked `getServiceClient` | The repo has **zero** existing fetch-stub harness for workers (`grep -r "globalThis.fetch =" supabase/functions` → no matches **[VERIFIED]**). Standing one up is out of scope and high-risk. **Recommendation:** mirror the existing source-grep style (`analyze-resume/merit-branch.test.ts`) plus a `live-DB integration` block gated on env vars (`analyze.no-resume.test.ts` style). This satisfies SC #5 with the same honesty model the rest of the repo uses. |

**Installation:** None — all dependencies are already in `deno.lock` and `package.json`.

**Version verification:** Skipped — no new dependencies. Existing `std@0.224.0` is the version used by every test file under `supabase/functions/*/__tests__/` **[VERIFIED via grep]**.

## Architecture Patterns

### System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                              CLIENT                                    │
│  useResumeStream / Career Compass UI — polls analysis_jobs.status      │
│  AiCreditsContext — reads user_merits on next refresh                  │
└──────────────────────┬─────────────────────────────────────────────────┘
                       │ POST /submit-resume-analysis-job (or career)
                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│  submit-{resume,career}-analysis-job (edge fn)                         │
│  ├─ requireAuth (user JWT)                                             │
│  ├─ checkRateLimit                                                     │
│  ├─ withMerits(ctx, feature, async (txId) => { ... })   ◀── D-08       │
│  │    │                                                                │
│  │    ▼ check_and_deduct_merits RPC (Phase 11)                         │
│  │    ▼ returns { transaction_id: <deduction_id uuid> }                │
│  │    ▼ INSERT analysis_jobs (..., merit_transaction_id: txId) ◀── NEW │
│  │    ▼ fire-and-forget POST process-{resume,career}-analysis-job     │
│  └─ on insert failure → withMerits' catch → refund_merits → re-throw   │
└──────────────────────┬─────────────────────────────────────────────────┘
                       │ async worker pickup
                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│  process-{resume,career}-analysis-job (edge fn worker)                 │
│  ├─ claim job (status=processing, attempts++)                          │
│  ├─ fetch /analyze-{resume,career} with payload                        │
│  ├─ branches:                                                          │
│  │    A) resp.ok       → status=completed                  (no refund) │
│  │    B) retryable     → status=retrying                   (no refund) │
│  │    C) terminal-resp → REFUND ─▶ status=failed     ◀── D-03/D-06     │
│  │    D) catch+!maxed  → status=retrying                   (no refund) │
│  │    E) catch+maxed   → REFUND ─▶ status=failed     ◀── D-07          │
│  ├─ refund call sequence (C and E):                                    │
│  │    1. if (job.merit_transaction_id == null) → log warn, skip ◀──D-09│
│  │    2. else refundMeritsForJob(userId, txId, reason)                 │
│  │    3. on { ok:false, !alreadyRefunded } → log error, continue       │
│  │    4. UPDATE analysis_jobs SET status='failed'                      │
└────────────────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Postgres                                                              │
│  ├─ analysis_jobs (NEW: merit_transaction_id uuid NULL)                │
│  ├─ refund_merits RPC (idempotent via metadata->>'deduction_id')       │
│  └─ user_merits (balance restored by RPC)                              │
└────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure (deltas only)

```
supabase/
├── migrations/
│   └── 20260429000000_add_merit_transaction_id_to_analysis_jobs.sql   # NEW
├── functions/
│   ├── _shared/
│   │   └── merit-gateway.ts                                          # extend refundMeritsForJob
│   ├── submit-resume-analysis-job/index.ts                            # _txId → txId + insert col
│   ├── submit-career-analysis-job/index.ts                            # _txId → txId + insert col
│   ├── process-resume-analysis-job/
│   │   ├── index.ts                                                   # 2 refund call-sites + delete KNOWN GAP comment
│   │   └── __tests__/                                                 # NEW dir
│   │       └── refund-on-failure.test.ts
│   └── process-career-analysis-job/
│       ├── index.ts                                                   # 2 refund call-sites + delete KNOWN GAP comment
│       └── __tests__/                                                 # NEW dir
│           └── refund-on-failure.test.ts
```

### Pattern 1: Extend `refundMeritsForJob` to recognize `already_refunded`

**What:** Map the RPC's `{"error":"already_refunded"}` response to a typed-success return so call sites stay simple (D-02 preference).

**When to use:** This phase. Eliminates the need to string-match RPC error text at every refund site.

**Example (proposed extension to `_shared/merit-gateway.ts`):**
```typescript
// Source: extension of existing refundMeritsForJob (merit-gateway.ts:209-225)
export async function refundMeritsForJob(
  userId: string,
  transactionId: string,
  reason: string,
): Promise<{ ok: true; alreadyRefunded?: boolean } | { ok: false; error: string }> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc('refund_merits', {
    p_user_id: userId,
    p_transaction_id: transactionId,
  });
  if (error) {
    log.error('refundMeritsForJob failed', { userId, transactionId, reason, error: error.message });
    return { ok: false, error: error.message };
  }
  // Phase 11 RPC returns jsonb; idempotent path returns {"error":"already_refunded"}
  if (data && typeof data === 'object' && (data as any).error === 'already_refunded') {
    log.info('merit-refund-already-refunded', { user_id: userId, transaction_id: transactionId, reason });
    return { ok: true, alreadyRefunded: true };
  }
  log.info('merit-refund', { user_id: userId, feature: 'async-job', transaction_id: transactionId, reason });
  return { ok: true };
}
```

> NOTE: The existing function only inspects `error` (the supabase-js Postgres error envelope), not `data`. The RPC's `already_refunded` arrives in `data.error`, NOT in the supabase-js `error` field — confirmed by reading the SQL: `RETURN jsonb_build_object('error', 'already_refunded')` is a successful RPC invocation that returns a JSON body with an `error` key. The current helper would currently fall through to the `log.info('merit-refund', …)` branch and return `{ ok: true }` without distinguishing the no-op. The extension is therefore a **strict observability improvement** and a typed signal, not a bug fix to existing return semantics. **[VERIFIED via SQL at migration 20260415000000:184-193 + helper at merit-gateway.ts:209-225]**

### Pattern 2: Worker terminal-failure refund block

**What:** Standard 4-line block inserted before the `update analysis_jobs set status='failed'` at every terminal-failure call-site.

**Example (response-path branch, `process-resume-analysis-job/index.ts:289`):**
```typescript
// Source: proposed pattern derived from D-03 / D-06 / D-09
// BEFORE the update analysis_jobs set status='failed'
const txId = (job as any).merit_transaction_id as string | null | undefined;
if (!txId) {
  console.warn('refund-skip', { job_id: job.id, reason: 'pre_migration_null_txid' });
} else {
  const reason = retryable ? 'retry_exhausted' : 'non_retryable_error';
  const r = await refundMeritsForJob(userId, txId, reason);
  if (!r.ok) {
    console.error('refund-failed', {
      user_id: userId,
      merit_transaction_id: txId,
      job_id: job.id,
      feature: 'resume_analysis',
      reason: r.error,
    });
  } else if (r.alreadyRefunded) {
    console.info('refund-already-refunded', { job_id: job.id, merit_transaction_id: txId });
  }
}
// existing update analysis_jobs set status='failed' continues here
```

**Worker-catch branch** (`process-resume-analysis-job/index.ts:331`, the `else { }` for `maxedOut`): same block, with `reason = 'worker_exception'`.

### Anti-Patterns to Avoid

- **Calling `refundMeritsForJob` with a null/empty txid and relying on the RPC** — the RPC's `unknown_transaction` path (line 222) does NOT match an empty string; it would return `unknown_transaction`, which trips the helper's `error` branch and emits a noisy `error`-level log. D-09 mandates the null short-circuit. **[VERIFIED via SQL]**
- **Refunding inside the retry branch** (D-04) — D-04 forbids this. Merits stay held during `retrying` and only refund when the row crosses to `failed`.
- **Switching the worker logging style to `_shared/logger.ts createLogger`** — these workers use raw `console.error/warn/log`. Stay consistent within these files (CONTEXT explicit).
- **Adding an FK from `analysis_jobs.merit_transaction_id` → `merit_transactions.id`** — the txn id is the shared **deduction_id** (a UUID minted by `check_and_deduct_merits` and stored in `metadata->>'deduction_id'` on 1–2 transaction rows), NOT a row PK. An FK would be wrong at the relational level and would block submit-time inserts whenever the bucket-split writes 2 transaction rows sharing one deduction_id. D-10 already forbids the FK. **[VERIFIED via SQL at 20260415000000:79, 122–131]**

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Idempotent refund tracking | Worker-side "already-refunded" flag column | `refund_merits` RPC's `already_refunded` return (D-01 locked) | Already implemented in Phase 11 SQL (lines 184–193). Adding a flag would duplicate state and create drift surface. |
| Refund retry / DLQ | A `merit_refund_failures` table + retry cron | Best-effort log + RPC idempotency (D-05) | Explicitly deferred. RPC is idempotent so an operator script can retry safely. |
| Cross-worker mocking harness | Custom Deno `globalThis.fetch` stub framework | Source-grep tests + env-gated live-DB tests (existing repo pattern) | Repo has zero existing fetch-stub harness in workers — verified via grep. Building one is out of scope. |
| Submit-side rollback on insert failure | New compensation logic | The existing `withMerits` catch already throws `MeritRefundable`-equivalent on any thrown error and the gateway calls `refund_merits` — but only if the thrown error is in the refundable taxonomy. For "job insert failed", the current code throws a plain `Error`, which is **NOT** classified as refundable. **(Open observation — see Pitfalls.)** |

**Key insight:** The Phase 11/13 contracts handle 90% of this work already. The phase is genuinely a wiring change.

## Runtime State Inventory

> Phase 26 is a wiring change with one schema migration. The "rename/refactor" runtime checklist still applies for the migration step.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `analysis_jobs` rows queued before the migration runs (any `pending`/`retrying` rows in flight at deploy time) will have `merit_transaction_id IS NULL`. | **Code edit only** — D-09 short-circuit handles this. No data migration. New rows after deploy carry the txid. |
| Live service config | None — workers are stateless edge functions; no external service has the column name baked in. | None. |
| OS-registered state | None — Supabase functions are invoked via HTTP; no Task Scheduler / cron / pm2 entries reference `analysis_jobs` columns. | None. |
| Secrets / env vars | None changed. `SUPABASE_SERVICE_ROLE_KEY`, `INTERNAL_JOB_SECRET` already used by both workers; no new secret. | None. |
| Build artifacts | Supabase functions deploy via `supabase functions deploy` — no local build artifacts; Deno fetches dependencies at deploy. `deno.lock` does not need an update (no new imports). | None. |

**Deployment ordering caveat:** The migration MUST run before either submit-* function is redeployed with the insert-payload change. If submit-* is deployed first, the insert will fail with `column "merit_transaction_id" of relation "analysis_jobs" does not exist`. Standard supabase-cli deploy order (`supabase migration up` then `supabase functions deploy`) handles this correctly. Plan should call this out as an operator note.

## Common Pitfalls

### Pitfall 1: Existing helper already returns `{ ok: true }` for `already_refunded`

**What goes wrong:** Reading `merit-gateway.ts:209-225` superficially, one might assume the helper currently returns `{ ok: false, error: 'already_refunded' }` for the idempotent path. It does not. The supabase-js `error` field is only populated for transport / Postgres errors. The RPC's `{"error":"already_refunded"}` arrives in `data` and the helper's current code path falls through to `return { ok: true }` and emits `log.info('merit-refund', …)` indistinguishably from a real refund.

**Why it happens:** RPC return shape vs supabase-js error envelope are easy to conflate.

**How to avoid:** D-02's helper extension is a **strict improvement** (typed flag + cleaner observability), not a bug fix. Keep the framing accurate in the SUMMARY.md / commit messages. **[VERIFIED via SQL + helper code]**

**Warning signs:** Anyone writing "this fixes a bug where already-refunded was treated as a failure" — that's not the current state.

### Pitfall 2: `withMerits` does NOT refund on `job insert failed`

**What goes wrong:** Both submit-* functions throw a plain `new Error('job insert failed: ...')` from inside the `withMerits` callback when the `analysis_jobs` insert fails (`submit-resume-analysis-job/index.ts:139`, `submit-career-analysis-job/index.ts:132`). This is a **plain `Error`**, not a `MeritRefundable`, and `isRefundableAnthropicError` does not match it (no status, no overload/timeout/network text). The gateway's catch logs `merit-non-refundable-error` and **re-throws without refunding**.

**Why it happens:** CONTEXT D-08 says "the insert MUST happen inside the `withMerits` callback (current structure) so a failed insert triggers `MeritRefundable` and refunds at submission time — that contract stays unchanged." This statement is **inaccurate** about current behavior. The current code does NOT refund on insert failure; the merit is silently kept.

**How to avoid:** Two options for the planner to consider:
- **(Option A — strict CONTEXT compliance)** Wrap the insert error in `MeritRefundable` (`throw new MeritRefundable(503, 'job insert failed: ...')`) so withMerits refunds. This is a behavior change but matches what CONTEXT D-08 *says* the current behavior is.
- **(Option B — preserve current behavior)** Leave it as-is and document that submit-time insert failures do not refund. Acceptable because (a) Postgres insert failures on this hot path are vanishingly rare, (b) the user gets a 500 response and can retry — and a retry will deduct again, so refund-on-insert-fail is actually the more correct UX.

**Recommendation:** **Option A.** The cost is one line, the contract becomes "any failure inside withMerits refunds," and it removes a real (if narrow) leak class. Surface as an explicit decision for the planner / discuss-phase to confirm — it's outside CONTEXT's locked decisions but inside the same MER-11 fix.

**Warning signs:** A user double-charged because they retried after an insert failure.

### Pitfall 3: Race between worker `claim` and submit-side insert

**What goes wrong:** Workers claim jobs with a CAS update (`.eq("status", candidate.status).eq("attempts", candidate.attempts)`) — safe. But if a single job is somehow processed twice (e.g., duplicate fire-and-forget worker invocation, manual operator re-run), both runs would call `refundMeritsForJob` on terminal failure. **D-01 covers this** — RPC returns `already_refunded` and is a no-op. **[VERIFIED]**

**Why it happens:** Edge function fire-and-forget pattern + chain-depth recursion (`process-resume-analysis-job/index.ts:354–365`).

**How to avoid:** No new code needed; D-01 handles it. The Deno test SC #5 (c) directly covers this.

### Pitfall 4: `analysis_jobs` RLS is on user JWT — service role bypasses

**What goes wrong:** The base table policy "Users can insert their own analysis jobs" requires `auth.uid() = user_id`. Submit-* functions use `requireAuth` (user JWT) but call Supabase via `getServiceClient()` (service role) — service role bypasses RLS, so the insert works regardless. New column `merit_transaction_id` inherits this; **no new RLS policy needed** (D-10 confirmed). MIG-02 (Phase 21-04) only restricts `analysis_results`, NOT `analysis_jobs` — verified in `20260420000000_mig_02_analysis_results_readonly.sql`. **[VERIFIED]**

**Why it happens:** Easy to confuse the two tables.

**How to avoid:** Migration only adds a column; do NOT touch policies.

### Pitfall 5: Worker test isolation — no existing fetch-stub harness

**What goes wrong:** Tempting to reach for `globalThis.fetch = stub` to test the worker's full job-processing loop. The repo has **zero** existing examples of this pattern in any worker test (verified via `grep -r "globalThis.fetch" supabase/functions`). Standing one up is out-of-scope and the resulting test is brittle (timer races, async chain).

**Why it happens:** Standard Node/Vitest reflex.

**How to avoid:** Use the established patterns:
- **Source-grep tests** (cf. `analyze-resume/merit-branch.test.ts`): read `index.ts` as text, assert call-site presence.
- **Live-DB env-gated integration tests** (cf. `analyze.no-resume.test.ts`): `Deno.test({ ignore: !liveEnabled, ... })`. Skipped in CI unless seeded.

The combination satisfies SC #5 (a)–(d) at the structural level, which is the existing repo's honesty model.

### Pitfall 6: `analysis_jobs.merit_transaction_id` column name vs the comment-block in workers

**What goes wrong:** The current `KNOWN GAP` comment in both processors (`process-resume-analysis-job/index.ts:36`, `process-career-analysis-job/index.ts:36`) suggests `merit_transaction_id text` (text, not uuid). D-10 mandates **uuid**. The deduction_id from `check_and_deduct_merits` is `gen_random_uuid()` (verified at `20260415000000:79`), so uuid is correct.

**Why it happens:** The follow-up comment was written before the type was nailed down.

**How to avoid:** Use `uuid NULL` in the migration, not `text`. Delete the entire `KNOWN GAP` comment block (CONTEXT specifics call this out explicitly).

## Code Examples

### Migration (verified pattern from `20260415000000_merit_rpcs.sql`)
```sql
-- Source: proposed migration; pattern derived from migrations/20260420000000_mig_02_analysis_results_readonly.sql
-- File: supabase/migrations/20260429000000_add_merit_transaction_id_to_analysis_jobs.sql

-- Phase 26: async-job-merit-refund-wiring.
-- REQ-ID: MER-11. Adds the deduction handle that workers need to call refund_merits
-- on terminal failure. Nullable to remain backward-compatible with rows queued
-- before this migration (D-09 worker short-circuit handles those gracefully).

ALTER TABLE public.analysis_jobs
  ADD COLUMN IF NOT EXISTS merit_transaction_id uuid NULL;

-- No FK to merit_transactions.id: the txid is the shared deduction_id stored in
-- metadata->>'deduction_id' (1 or 2 rows per deduction, see migration
-- 20260415000000:79,122-131). FK would be relationally incorrect.
-- No index: column is read by single-row primary-key UPDATE on the worker hot
-- path. RLS inherits from base policies in 20260225160000.

-- Post-apply verification:
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'analysis_jobs'
--     AND column_name = 'merit_transaction_id';
-- Expected: ('merit_transaction_id', 'uuid', 'YES')
```

### Submit-side change (one-line rename + one-field insert)
```typescript
// Source: derived from submit-resume-analysis-job/index.ts:107-161
const gated = await withMerits(
  { userId: authenticatedUserId, tier: ..., corsType: 'user' as const },
  'resume_analysis',
  async (txId) => {                              // ◀── was _txId
    const nowIso = new Date().toISOString();
    const { data: job, error: insertError } = await supabase
      .from("analysis_jobs")
      .insert({
        user_id: authenticatedUserId,
        job_type: "resume_analysis",
        status: "pending",
        payload,
        attempts: 0,
        max_attempts: 8,
        available_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
        merit_transaction_id: txId,              // ◀── NEW
      })
      .select("id, status, created_at")
      .single();

    if (insertError || !job) {
      // (See Pitfall 2 — planner decides Option A vs B.)
      throw new Error(`job insert failed: ${insertError?.message ?? 'unknown'}`);
    }
    // ... fire-and-forget worker invocation unchanged ...
  },
);
```

### Worker terminal-failure refund block

(See Pattern 2 above — drop-in block before each `status='failed'` UPDATE.)

### Worker test (source-grep style)
```typescript
// Source: pattern derived from analyze-resume/merit-branch.test.ts
// File: supabase/functions/process-resume-analysis-job/__tests__/refund-on-failure.test.ts

import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const src = await Deno.readTextFile(
  new URL("../index.ts", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
);

// SC #5 (a): success path does not refund — verified by absence of refund call
//            inside the `if (resp.ok) { ... }` branch (response-path completed).
Deno.test("SC#5(a): completed branch does NOT call refundMeritsForJob", () => {
  const completedBranch = src.match(/if \(resp\.ok\)[\s\S]*?continue;/)?.[0] ?? "";
  assert(completedBranch.length > 0, "completed branch must exist");
  assert(
    !completedBranch.includes("refundMeritsForJob"),
    "completed branch must not call refundMeritsForJob",
  );
});

// SC #5 (b): terminal failure on response path calls refundMeritsForJob.
Deno.test("SC#5(b): response-path failed branch calls refundMeritsForJob with txId", () => {
  // The failed branch begins after the retry branch and includes status: 'failed'.
  // Match the segment from the maxedOut/failed UPDATE back to the preceding refund block.
  assert(
    /refundMeritsForJob\([^)]*txId[^)]*\)/.test(src),
    "expected refundMeritsForJob(... txId ...) call",
  );
  assert(
    /pre_migration_null_txid/.test(src),
    "expected D-09 short-circuit reason code",
  );
});

// SC #5 (c): re-process of already-failed job → covered by RPC idempotency.
//            Pinned via comment + import presence; full integration left to live-DB.
Deno.test("SC#5(c): worker imports refundMeritsForJob (idempotency delegated to RPC)", () => {
  assert(src.includes("refundMeritsForJob"), "worker must import refundMeritsForJob");
  assert(src.includes("already_refunded") || src.includes("alreadyRefunded"),
    "worker or helper must acknowledge the already_refunded path",
  );
});

// SC #5 (d): pre-migration null-txid → warn skip, no refund call.
Deno.test("SC#5(d): pre-migration null txid → warn, skip refund", () => {
  assert(/console\.warn\([^)]*pre_migration_null_txid/.test(src),
    "expected console.warn with reason 'pre_migration_null_txid'",
  );
});

// SC #5 (b) — worker-error catch path also refunds when maxedOut.
Deno.test("SC#5(b)bis: worker-error catch maxedOut branch calls refundMeritsForJob", () => {
  // The catch block contains an else-branch that writes status='failed' (line ~331).
  // Assert refundMeritsForJob appears between the catch and the failed UPDATE.
  const catchToFailed = src.match(/catch \(processError\)[\s\S]*?status: ?"failed"/)?.[0] ?? "";
  assert(
    catchToFailed.includes("refundMeritsForJob"),
    "worker-catch maxedOut branch must call refundMeritsForJob (D-07)",
  );
});
```

A mirror file under `process-career-analysis-job/__tests__/` covers the same matrix for the career worker.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Workers had no refund mechanism (KNOWN GAP comment from 2026-04-19, quick task 260419-20o) | RPC + helper exist; this phase wires them | Phase 11 (RPC) → Phase 13 (helper) → Phase 26 (wiring) | Closes MER-11 PARTIAL → satisfied for async path. |

**Deprecated/outdated:**
- The `KNOWN GAP` comment block in both workers (resume `:28–43`, career `:28–41`) becomes inaccurate the moment this phase ships. CONTEXT specifics require deletion. Replace with a 1–2 line note pointing at `refundMeritsForJob`.

## Assumptions Log

> All claims tagged `[ASSUMED]` — to be validated before plan execution.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The next migration timestamp `20260429000000` is unused. (Latest current is `20260422000000_phase_24_topup.sql`; any UTC after that sorts correctly.) | Migration | LOW — planner can pick `20260430...` or any later slot. |
| A2 | `analysis_jobs.merit_transaction_id` does not need to be added to the `analysis_jobs` SELECT projection in either submit-side existing-job-reuse query (lines 90–98 resume, 74–82 career) — those queries return `(id, status, created_at)` only and the new column is read only by the worker, which already does `select("...")` with explicit columns. | Submit-side | LOW — worker SELECT projection just needs to be expanded to include `merit_transaction_id` (one column added to two SELECTs in each worker — claim + initial candidate fetch). Planner must remember this. |
| A3 | No CI / type-checker references the `analysis_jobs` row shape via codegen (`Database` type) — supabase-js typed client uses inferred Database type. If a generated `Database` type exists, the new column will need to land in the type generation. | Submit-side / worker | MEDIUM — if the project uses `supabase gen types`, that file must be regenerated. Quick scan: did not find a checked-in `Database` type beyond `src/integrations/supabase/types.ts`; planner should grep for `analysis_jobs` in that file before edits. |
| A4 | Source-grep tests are an acceptable interpretation of SC #5 (a)–(d). CONTEXT D-11 specifies the cases but not the test fidelity level; the repo's dominant pattern is source-grep + env-gated live integration. | Tests | MEDIUM — if the user expects functional unit tests with stubbed fetch + supabase, scope balloons. Surface in discuss-phase. |

## Open Questions

1. **Submit-time insert-failure refund (Pitfall 2): Option A or Option B?**
   - What we know: Current code throws plain `Error` on insert fail; `withMerits` catch does NOT refund plain Errors. CONTEXT D-08 *says* the contract is "failed insert triggers `MeritRefundable` and refunds" — this is not the current behavior.
   - What's unclear: Does the user want to fix this leak in the same phase or accept it as out-of-scope (a tiny additional MER-11 gap)?
   - Recommendation: Option A (one-line `throw new MeritRefundable(503, ...)`). Adds a sentence to the SUMMARY but keeps MER-11 truly closed.

2. **Helper extension OR call-site handling for `already_refunded` (D-02 (a) vs (b))?**
   - What we know: CONTEXT states "Preference: extend the helper" — soft preference.
   - What's unclear: Is the soft preference firm enough to lock?
   - Recommendation: Lock (a) (extend helper). Smaller diff at every call-site, single observability point.

3. **Plan boundary — 1 or 2 plans?**
   - What we know: Roadmap suggests 2; CONTEXT permits merge.
   - What's unclear: Risk appetite for shipping migration + submit + worker + tests in a single plan.
   - Recommendation: **2 plans.** Migration + submit-side + helper extension is one logical unit (deployable independently and reversible — column is nullable). Worker + tests is the second. Each plan is small (~3–4 tasks).

## Environment Availability

Phase has no new external dependencies. All required tools/services are already in use:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase CLI | migration apply, function deploy | ✓ (existing) | 2.92.0 (per `package.json`) | — |
| Deno | edge function runtime + tests | ✓ (existing) | per `deno.json` | — |
| Postgres `refund_merits` RPC | refund call | ✓ (deployed Phase 11) | n/a | — |

## Validation Architecture

> `.planning/config.json` was not inspected; assuming nyquist_validation enabled (default).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Deno test (`Deno.test` + `https://deno.land/std@0.224.0/assert/mod.ts`) |
| Config file | `supabase/functions/deno.json` (existing — no changes needed) |
| Quick run command | `deno test --no-check --allow-env --allow-read supabase/functions/process-resume-analysis-job/__tests__/ supabase/functions/process-career-analysis-job/__tests__/` |
| Full suite command | `.\scripts\run-edge-tests.ps1` (existing repo runner per README) |

### Phase Requirements → Test Map

| Req ID / SC | Behavior | Test Type | Automated Command | File Exists? |
|-------------|----------|-----------|-------------------|-------------|
| SC #5 (a) | Completed branch does NOT refund | source-grep / unit | `deno test ... refund-on-failure.test.ts` | ❌ Wave 0 |
| SC #5 (b) | Response-path terminal failure refunds exactly once with persisted txid + reason | source-grep / unit | same | ❌ Wave 0 |
| SC #5 (b)′ | Worker-error catch path on `maxedOut` refunds (D-07) | source-grep / unit | same | ❌ Wave 0 |
| SC #5 (c) | Re-process of failed job → zero additional mutations (idempotency) | source-grep + env-gated live-DB | same; live-DB block ignored unless `SUPABASE_URL` + service key env set | ❌ Wave 0 |
| SC #5 (d) | Pre-migration null txid → warn log, no refund call | source-grep / unit | same | ❌ Wave 0 |
| SC #1 | Migration adds `merit_transaction_id uuid NULL` | post-apply SQL verification (operator) | manual SELECT in Supabase SQL editor | n/a |
| SC #2 | Submit-* persist txid | source-grep on submit-* `index.ts` (optional per D-12) | `deno test ... submit-persists-txid.test.ts` (optional) | ❌ Wave 0 (optional) |
| SC #3 | Workers refund on every terminal failure path | covered by SC #5 (b), (b)′ | — | — |
| SC #4 | Idempotency | covered by SC #5 (c) | — | — |
| SC #6 | Migration is idempotent + backward-compatible | manual `supabase migration up` twice | operator verification | — |

### Sampling Rate
- **Per task commit:** `deno test --no-check --allow-env --allow-read supabase/functions/process-resume-analysis-job/__tests__/`
- **Per wave merge:** `.\scripts\run-edge-tests.ps1` (full edge suite)
- **Phase gate:** Full suite green + manual SC #1/#6 SQL verification before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `supabase/functions/process-resume-analysis-job/__tests__/refund-on-failure.test.ts` — covers SC #5 (a)–(d) for resume worker
- [ ] `supabase/functions/process-career-analysis-job/__tests__/refund-on-failure.test.ts` — covers SC #5 (a)–(d) for career worker
- [ ] (Optional) `supabase/functions/submit-resume-analysis-job/__tests__/persists-txid.test.ts` — D-12
- [ ] (Optional) `supabase/functions/submit-career-analysis-job/__tests__/persists-txid.test.ts` — D-12
- [ ] No new framework install needed; `deno.json` already has the test task scaffold

## Security Domain

> `security_enforcement` config not explicitly inspected; treating as enabled by default.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `requireAuth({type:'user'})` on submit-*; `requireAuth({type:'internal'})` on workers — both unchanged. |
| V3 Session Management | no | No session changes. |
| V4 Access Control | yes | RLS on `analysis_jobs` unchanged; new column inherits SELECT/INSERT policies. Service role bypass on writes (workers + submit-*). |
| V5 Input Validation | partial | New column accepts `uuid` only — type system enforces. No user input flows directly into the column (txid comes from Phase 11 RPC, not request body). |
| V6 Cryptography | no | No crypto. |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| User-forged refund (call refund_merits with stolen txid) | Tampering / Elevation | RPC is `SECURITY DEFINER` and is granted only to `authenticated, service_role` (verified at `20260415000000:243-244`). User JWTs hitting the RPC directly is theoretically possible — but `refund_merits` only operates on rows where `metadata->>'deduction_id' = p_transaction_id::text` AND `user_id = p_user_id` (the function's own filter). A user can only refund their own deductions, and idempotency prevents double-refund. **No new threat introduced by this phase.** |
| Replay of submit-side request | Tampering | Existing reuse-active-job logic (lines 90–98) prevents same-resumeId from creating a second active job. Unchanged. |
| Worker triggered from browser | Spoofing | `requireAuth({type:'internal'})` requires `INTERNAL_JOB_SECRET` header (`process-resume-analysis-job/index.ts:98`). Unchanged. |

**No new attack surface.** The migration only adds a nullable column; no new RPC, no new endpoint.

## Sources

### Primary (HIGH confidence)
- **[VERIFIED: codebase]** `supabase/migrations/20260415000000_merit_rpcs.sql:159-244` — `refund_merits` RPC, `already_refunded` at lines 184-193, return shape `RETURN jsonb_build_object('error', 'already_refunded')`
- **[VERIFIED: codebase]** `supabase/migrations/20260415000000_merit_rpcs.sql:67-152` — `check_and_deduct_merits` returns `transaction_id: v_deduction_id` (line 144), where `v_deduction_id := gen_random_uuid()` (line 79), and is also the value persisted as `metadata->>'deduction_id'` on the merit_transactions rows (lines 122–131)
- **[VERIFIED: codebase]** `supabase/functions/_shared/merit-gateway.ts:209-225` — `refundMeritsForJob` signature, current return semantics, log emissions
- **[VERIFIED: codebase]** `supabase/functions/_shared/merit-gateway.ts:115-198` — `withMerits` flow, refund classification, `merit-non-refundable-error` log on plain Errors (Pitfall 2 evidence)
- **[VERIFIED: codebase]** `supabase/functions/submit-resume-analysis-job/index.ts:107-161` — `_txId` discard + insert payload site
- **[VERIFIED: codebase]** `supabase/functions/submit-career-analysis-job/index.ts:96-160` — mirror site
- **[VERIFIED: codebase]** `supabase/functions/process-resume-analysis-job/index.ts:289-312, 313-343` — response-path failed branch + worker-catch maxedOut branch
- **[VERIFIED: codebase]** `supabase/functions/process-career-analysis-job/index.ts:195-204, 220-229` — mirror sites
- **[VERIFIED: codebase]** `supabase/migrations/20260225160000_add_analysis_jobs_queue.sql` — base table schema + RLS policies (unchanged by this phase)
- **[VERIFIED: codebase]** `supabase/migrations/20260420000000_mig_02_analysis_results_readonly.sql` — confirms MIG-02 affects `analysis_results`, NOT `analysis_jobs`
- **[VERIFIED: codebase grep]** No `globalThis.fetch` stub harness in any worker test (`grep -r "globalThis.fetch" supabase/functions` → 0 hits)
- **[VERIFIED: codebase]** Test patterns in `supabase/functions/interview-prep-analyze/__tests__/merit-refund.test.ts`, `analyze.no-resume.test.ts`, and `analyze-resume/merit-branch.test.ts`

### Secondary (MEDIUM confidence)
- `.planning/ROADMAP.md` § Phase 26 — goal, depends-on, SC #1–6
- `.planning/REQUIREMENTS.md` § MER-11 — root requirement
- `.planning/phases/26-async-job-merit-refund-wiring/26-CONTEXT.md` — locked decisions

### Tertiary (LOW confidence)
- None. All factual claims in this research are sourced from the repo.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; all confirmed in tree
- Architecture: HIGH — call-sites and contracts verified line-by-line
- Pitfalls: HIGH for #1, #2, #4, #6 (verified); MEDIUM for #3, #5 (reasoning + grep)
- Tests: MEDIUM — repo lacks fetch-stub harness for workers; source-grep is the established pattern but the planner / discuss-phase should confirm test fidelity expectation (Open Q #3 / A4)
- Security: HIGH — no new attack surface

**Research date:** 2026-04-28
**Valid until:** ~2026-05-28 (30 days; stable contracts, no fast-moving deps). Re-verify if `merit-gateway.ts` or `refund_merits` RPC is touched by another phase before execution.

## RESEARCH COMPLETE
