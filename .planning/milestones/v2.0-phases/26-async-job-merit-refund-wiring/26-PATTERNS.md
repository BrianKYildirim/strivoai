# Phase 26: async-job-merit-refund-wiring - Pattern Map

**Mapped:** 2026-04-28
**Files analyzed:** 7 (1 migration · 4 source modifications · 3 tests; counting both submitters and both processors as separate files = 9 if split, but 4 source mods total since each pair of submit/process files share an analog)
**Analogs found:** 7 / 7 (100%) — every file has an exact in-tree analog. No "no analog" entries.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/migrations/20260429000000_add_merit_transaction_id_to_analysis_jobs.sql` | migration | schema-additive (idempotent ALTER) | `supabase/migrations/20260422000000_phase_24_topup.sql` (lines 18-30) | exact — same `ADD COLUMN IF NOT EXISTS` + `COMMENT ON COLUMN` shape |
| `supabase/functions/_shared/merit-gateway.ts` (modify `refundMeritsForJob`) | utility / gateway | request-response (RPC) | self — extension of existing function at lines 209-225 | exact — extending the function in place |
| `supabase/functions/_shared/__tests__/merit-gateway-already-refunded.test.ts` | test | unit (Deno) | `supabase/functions/_shared/__tests__/interview-prep-validation.test.ts` (Deno-style) AND `interview-prep-analyze/__tests__/merit-refund.test.ts` (asserts merit-gateway behavior) | exact — Deno test, asserts on merit-gateway exports |
| `supabase/functions/submit-resume-analysis-job/index.ts` (modify) | controller / submit-handler | request-response (insert + fire-and-forget) | self — withMerits block at lines 107-161 already structured for the change | exact (in-place edit) |
| `supabase/functions/submit-career-analysis-job/index.ts` (modify) | controller / submit-handler | request-response | `submit-resume-analysis-job/index.ts` (sibling) | exact — mirror site, lines 96-160 |
| `supabase/functions/process-resume-analysis-job/index.ts` (modify) | worker / job-processor | event-driven (queue poll → fetch → status update) | self — terminal-failure branches at 289-312 + 313-343 are the targets | exact (in-place edit) |
| `supabase/functions/process-career-analysis-job/index.ts` (modify) | worker / job-processor | event-driven | `process-resume-analysis-job/index.ts` (sibling) | exact — mirror sites at 195-204 + 220-229 |
| `supabase/functions/process-resume-analysis-job/__tests__/refund-on-failure.test.ts` | test | unit (source-grep, Deno) | `supabase/functions/analyze-resume/merit-branch.test.ts` (source-grep style) | exact — same source-readText + assert pattern |
| `supabase/functions/process-career-analysis-job/__tests__/refund-on-failure.test.ts` | test | unit (source-grep, Deno) | sibling `process-resume-analysis-job/__tests__/refund-on-failure.test.ts` (created in same plan) | exact (mirror) |

## Pattern Assignments

### `supabase/migrations/20260429000000_add_merit_transaction_id_to_analysis_jobs.sql` (migration, schema-additive)

**Analog:** `supabase/migrations/20260422000000_phase_24_topup.sql`

**Header / re-runnability comment pattern** (lines 1-16 of analog):
```sql
-- Phase 24 · Plan 02 — top-up pack additive schema + credit_shop_merits rewrite.
--
-- Sections:
--   1. TOPUP-01: ADD COLUMN pack_id + stripe_payment_intent_id on merit_transactions
--   ...
-- Re-runnability:
--   * Section 1: ADD COLUMN IF NOT EXISTS — safe to re-apply.
--   ...
-- Roll-forward only (D-22): no DROP, no destructive ALTER. If a rollback is
-- required, write a new forward migration.
```

**ALTER TABLE pattern** (lines 21-25 of analog):
```sql
ALTER TABLE public.merit_transactions
  ADD COLUMN IF NOT EXISTS pack_id text NULL;

ALTER TABLE public.merit_transactions
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text NULL;
```

**COMMENT ON COLUMN pattern** (lines 27-30 of analog):
```sql
COMMENT ON COLUMN public.merit_transactions.pack_id IS
  'Phase 24 TOPUP-01: Stripe top-up pack id (pack_3|pack_10|pack_25|pack_50). NULL for non-topup rows.';
```

**Phase-26 file should follow this shape:**
- Top comment block: phase + REQ-ID (`MER-11`) + re-runnability note + roll-forward-only stance
- Single `ALTER TABLE public.analysis_jobs ADD COLUMN IF NOT EXISTS merit_transaction_id uuid NULL;`
- `COMMENT ON COLUMN` documenting that the value is the deduction_id from `check_and_deduct_merits` (Phase 11), nullable for backward compat with pre-migration jobs (D-09)
- No FK (D-10), no index (D-10), no policy change (RLS inherits)
- Optional post-apply verification SELECT in a SQL comment (matches RESEARCH § Code Examples lines 363-368)

---

### `supabase/functions/_shared/merit-gateway.ts` — extend `refundMeritsForJob` (utility, request-response)

**Analog:** self — existing `refundMeritsForJob` at lines 209-225, `withMerits`'s refund branch at lines 173-187.

**Existing function shape to extend** (lines 209-225):
```typescript
export async function refundMeritsForJob(
  userId: string,
  transactionId: string,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getServiceClient();
  const { error } = await supabase.rpc('refund_merits', {
    p_user_id: userId,
    p_transaction_id: transactionId,
  });
  if (error) {
    log.error('refundMeritsForJob failed', { userId, transactionId, reason, error: error.message });
    return { ok: false, error: error.message };
  }
  log.info('merit-refund', { user_id: userId, feature: 'async-job', transaction_id: transactionId, reason });
  return { ok: true };
}
```

**Existing log emission pattern from `withMerits`** (lines 181-186 — copy this format for the `merit-refund-already-refunded` info line):
```typescript
log.info('merit-refund', {
  user_id: ctx.userId,
  feature,
  transaction_id: transactionId,
  reason: err?.status ?? 'unknown',
});
```

**Extension to apply (D-02, derived from RESEARCH § Pattern 1, lines 188-213):**
- Change return type to `Promise<{ ok: true; alreadyRefunded?: boolean } | { ok: false; error: string }>`
- After the supabase-js `error` check passes, **read `data`** (the RPC body): if `data?.error === 'already_refunded'`, return `{ ok: true, alreadyRefunded: true }` and emit `log.info('merit-refund-already-refunded', { user_id, transaction_id, reason })`
- Otherwise emit existing `merit-refund` log and return `{ ok: true }`
- Crucial nuance from RESEARCH Pitfall 1 (lines 282-290): the current code only inspects `error`; it does NOT read `data`. The extension must add `const { data, error } = await supabase.rpc(...)` (currently `const { error } = ...`).

**Reason: log-level discipline (D-02):**
- `already_refunded` → `log.info` (NOT `log.error`)
- transport / Postgres error → `log.error` (unchanged)

---

### `supabase/functions/_shared/__tests__/merit-gateway-already-refunded.test.ts` (test, unit)

**Analog:** `supabase/functions/_shared/__tests__/interview-prep-validation.test.ts` (Deno-test convention in this folder) and `supabase/functions/interview-prep-analyze/__tests__/merit-refund.test.ts` (asserts merit-gateway exports).

**Imports / test-runner pattern** (from `interview-prep-validation.test.ts` lines 1-7):
```typescript
// supabase/functions/_shared/__tests__/<name>.test.ts
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  /* exports under test */
} from "../<module-name>.ts";
```

> NOTE: `cost-map-invariant.test.ts` in the same folder uses **vitest** (`import { describe, it, expect } from 'vitest'`) — that file is the outlier. Three of four files in `_shared/__tests__/` use **Deno test**. Match the Deno style for this phase since the `merit-gateway` module imports Deno-only `getServiceClient`/`Deno.env` and must run via `deno test`. (Verified by Grep + reading both files.)

**Test approach (since `refundMeritsForJob` calls a real Supabase client):**
- Cannot easily mock `getServiceClient()` without a fetch-stub harness (RESEARCH Pitfall 5: repo has zero such harness).
- Two viable shapes:
  1. **Source-grep style** — read `merit-gateway.ts` as text, assert (a) `data?.error === 'already_refunded'` branch exists, (b) `alreadyRefunded: true` literal is present, (c) log line `merit-refund-already-refunded` is emitted. Mirrors `analyze-resume/merit-branch.test.ts`.
  2. **Type/contract pin** — import the function and assert TypeScript-discriminated return shape via dummy assignments. Lighter, less informative.
- Recommend (1): structurally pins the change without standing up a fetch-stub harness.

**Source-grep test shape** (mirror `analyze-resume/merit-branch.test.ts` lines 1-26):
```typescript
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const src = await Deno.readTextFile(
  new URL("../merit-gateway.ts", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
);

Deno.test("D-02: refundMeritsForJob recognizes already_refunded", () => {
  assert(src.includes("already_refunded"), "Expected 'already_refunded' string match");
  assert(/alreadyRefunded\s*:\s*true/.test(src), "Expected alreadyRefunded: true return field");
});

Deno.test("D-02: already_refunded path logs at info level", () => {
  assert(/log\.info\([^)]*['\"]merit-refund-already-refunded['\"]/.test(src),
    "Expected log.info('merit-refund-already-refunded', ...)");
});
```

---

### `supabase/functions/submit-resume-analysis-job/index.ts` (controller, request-response)

**Analog:** self — `withMerits` block at lines 107-161 is the exact site.

**Imports already present** (lines 1-7):
```typescript
import { MERIT_SYSTEM_ENABLED, withMerits, MeritRefundable } from '../_shared/merit-gateway.ts';
```
> `MeritRefundable` is already imported but currently unused in this file — D-08a uses it.

**Current site (lines 107-140) — change `_txId` → `txId`, add column to insert, wrap insert error:**
```typescript
const gated = await withMerits(
  { userId: authenticatedUserId, tier: ..., corsType: 'user' as const },
  'resume_analysis',
  async (_txId) => {                              // ◀── rename: _txId → txId (D-08)
    const nowIso = new Date().toISOString();
    const payload = { /* ... */ };

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
        // merit_transaction_id: txId,            // ◀── ADD (D-08)
      })
      .select("id, status, created_at")
      .single();

    if (insertError || !job) {
      // NOT a refundable Anthropic error — rethrow as generic error
      throw new Error(`job insert failed: ${insertError?.message ?? 'unknown'}`);
      // ◀── REPLACE with: throw new MeritRefundable(503, `job insert failed: ${insertError?.message ?? 'unknown'}`); (D-08a)
    }
    // ... rest unchanged ...
  },
);
```

**Reference for `MeritRefundable` use** (existing pattern at `merit-gateway.ts` lines 73-80 + caller pattern at lines 108-110 doc comment):
```typescript
//   const r = await invokeAnthropicText(...);
//   if (!r.ok) throw new MeritRefundable(r.status, r.error);
```

**D-08a rationale:** `withMerits` catch (lines 168-197) only refunds when `err.name === 'MeritRefundable'` OR `isRefundableAnthropicError(err.status, ...)` matches. A plain `new Error(...)` falls into the `merit-non-refundable-error` branch (line 189) and is re-thrown without refund. Wrapping in `MeritRefundable(503, ...)` makes the catch path refund. Status 503 is per RESEARCH recommendation (refundable taxonomy includes any 5xx).

**Worker SELECT projection update (Assumption A2 in RESEARCH):**
- The worker reads jobs via `select("id, user_id, job_type, status, payload, attempts, max_attempts, available_at, created_at")` — TWO sites in `process-resume-analysis-job/index.ts` (lines 120 and 153) and TWO in career mirror. **Both must add `, merit_transaction_id`** so the column is available on the `job` row passed into the failure branches.

---

### `supabase/functions/submit-career-analysis-job/index.ts` (controller, request-response)

**Analog:** `submit-resume-analysis-job/index.ts` (sibling) — line-for-line mirror.

**Site (lines 96-133):** identical structure to resume submitter — same `_txId` → `txId` rename, same `merit_transaction_id: txId` field addition, same `throw new Error(...)` → `throw new MeritRefundable(503, ...)` swap on insert failure (line 132).

**Apply identical patterns** as the resume site above. The career version uses `feature: 'career_compass'` and `job_type: 'career_compass_analysis'` — those are unchanged.

---

### `supabase/functions/process-resume-analysis-job/index.ts` (worker, event-driven)

**Analog:** self — terminal-failure branches at lines 289-312 (response-path) and 313-343 (worker-catch). Reuses Pattern 2 from RESEARCH lines 217-244.

**Imports to add:**
```typescript
import { refundMeritsForJob } from '../_shared/merit-gateway.ts';
```

**SELECT projection update** — TWO sites need `, merit_transaction_id` added (lines 120 + 153):
```typescript
.select("id, user_id, job_type, status, payload, attempts, max_attempts, available_at, created_at, merit_transaction_id")
```

**Type update** — `AnalysisJobRow` type (lines 45-55) needs `merit_transaction_id: string | null;` added.

**Comment block to DELETE** (lines 28-43): the entire `KNOWN GAP (follow-up)` paragraph in the `RESILIENCE CONTRACT` JSDoc. Replace with a one-liner pointing at `refundMeritsForJob`. Per CONTEXT § specifics line 110 + Pitfall 6 line 340.

**Refund block to insert BEFORE response-path failed UPDATE** (immediately before line 289 `const { error: failUpdateError } = await supabase.from("analysis_jobs").update({ status: "failed", ... })`):
```typescript
// MER-11 Phase 26 D-03/D-06/D-09: refund merits on terminal failure BEFORE
// flipping the row to status='failed'.
const txId = job.merit_transaction_id;
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
// (existing) const { error: failUpdateError } = await supabase.from("analysis_jobs").update({ status: "failed", ... })
```

**Refund block to insert in worker-catch maxedOut branch** (before line 332 `await supabase.from("analysis_jobs").update({ status: "failed", error: { error: errorMessage, retryable: false }, ... })`):
- Same block as above
- Difference: `reason = 'worker_exception'` (no retryable/non-retryable distinction here — D-07)
- Use the `userId` variable (already in scope at line 187)

**Existing logging style to match** (line 306-312):
```typescript
console.error("Resume analysis job failed", {
  jobId: job.id,
  status: resp.status,
  retryable,
  maxedOut,
  error: failurePayload.error,
});
```
> Style: raw `console.error/warn/log` with object payloads. NOT `_shared/logger.ts createLogger`. Stay consistent (CONTEXT § Established Patterns line 99).

**Reason-string vocabulary** (CONTEXT § Specifics + Claude's Discretion):
- `retry_exhausted` — response-path, retryable + maxedOut
- `non_retryable_error` — response-path, non-retryable
- `worker_exception` — worker-catch maxedOut branch
- `pre_migration_null_txid` — D-09 warn-skip path (no actual refund call)

---

### `supabase/functions/process-career-analysis-job/index.ts` (worker, event-driven)

**Analog:** `process-resume-analysis-job/index.ts` (sibling).

**Mirror sites:**
- SELECT projection at lines 97 + 127 — add `merit_transaction_id`
- `AnalysisJobRow` type (lines 43-53) — add `merit_transaction_id: string | null;`
- KNOWN GAP comment (lines 28-41) — DELETE
- Imports (top) — add `import { refundMeritsForJob } from '../_shared/merit-gateway.ts';`
- Response-path failed UPDATE (line 195) — insert refund block immediately before
- Worker-catch maxedOut UPDATE (line 221) — insert refund block immediately before

**Differences from resume worker (apply consistently):**
- `feature: 'career_compass'` (matches submit-side feature key — line 98 of submit-career)
- The career version has a third field on `error` payload (`retryReason: "worker_exception"` at line 223) — keep it; refund block does not interact with the `error` jsonb, only with merit RPC.
- `userId` is on `job.user_id` here (the resume worker derives it from `payload.userId || job.user_id` at line 187 — career worker should mirror that resilience: `const userId = String(job.payload?.userId || job.user_id || "");`).

---

### `supabase/functions/process-resume-analysis-job/__tests__/refund-on-failure.test.ts` (test, unit/source-grep)

**Analog:** `supabase/functions/analyze-resume/merit-branch.test.ts` (lines 1-26) — same source-readText pattern.

**File-loading pattern** (analog lines 6-10):
```typescript
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const src = await Deno.readTextFile(
  new URL("../index.ts", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
);
```

**Test shape (analog lines 12-26):**
```typescript
Deno.test("descriptive test name", () => {
  assert(
    src.includes("...") && src.includes("..."),
    "Expected explanation",
  );
});
```

**SC #5 case mapping (CONTEXT D-11, RESEARCH § Code Examples lines 410-471):**

| SC | Test name (suggested) | Assertion |
|---|---|---|
| 5(a) | `SC#5(a): completed branch does NOT call refundMeritsForJob` | regex match the `if (resp.ok)` block; assert `refundMeritsForJob` is NOT inside it |
| 5(b) | `SC#5(b): response-path failed branch calls refundMeritsForJob with txId` | assert `refundMeritsForJob(...txId...)` regex matches; assert `pre_migration_null_txid` literal exists |
| 5(b)' | `SC#5(b)bis: worker-catch maxedOut branch calls refundMeritsForJob (D-07)` | match `catch (processError)[\s\S]*?status: ?"failed"` segment; assert `refundMeritsForJob` appears within |
| 5(c) | `SC#5(c): worker imports refundMeritsForJob (idempotency delegated to RPC)` | assert `refundMeritsForJob` import + `already_refunded` or `alreadyRefunded` literal acknowledged |
| 5(d) | `SC#5(d): pre-migration null txid → warn, skip refund` | assert `console.warn(...pre_migration_null_txid...)` regex |

**Run command** (RESEARCH § Validation Architecture lines 528-532):
```text
deno test --no-check --allow-env --allow-read \
  supabase/functions/process-resume-analysis-job/__tests__/ \
  supabase/functions/process-career-analysis-job/__tests__/
```

---

### `supabase/functions/process-career-analysis-job/__tests__/refund-on-failure.test.ts` (test, unit/source-grep)

**Analog:** `supabase/functions/process-resume-analysis-job/__tests__/refund-on-failure.test.ts` (sibling, created in same plan).

**Apply identical structure**, with two adjustments:
- The `feature` literal in the refund-failed log assertion is `'career_analysis'` (NOT `'resume_analysis'`) — RESEARCH § Pattern 2 line 236.
- Worker uses `console.error/warn/log` raw — same style assertion applies.

---

## Shared Patterns

### Logging (raw console + object payloads, NOT createLogger)

**Source:** `process-resume-analysis-job/index.ts` lines 306-312 (existing failure log) and `submit-resume-analysis-job/index.ts` line 153 (existing fire-and-forget error log).
**Apply to:** All worker-side refund logs in both processors.
```typescript
console.error("Resume analysis job failed", {
  jobId: job.id,
  status: resp.status,
  retryable,
  maxedOut,
  error: failurePayload.error,
});
```
> CONTEXT § Established Patterns line 99 + Anti-Patterns line 252: do NOT switch these workers to `_shared/logger.ts createLogger`. Raw `console.error/warn/log` with object payloads is the convention in `process-{resume,career}-analysis-job/index.ts`. (The `_shared/merit-gateway.ts` module DOES use `createLogger('merit-gateway')` — that's its own convention; do not propagate to the workers.)

### Refund call-site (D-03, D-06, D-09 unified block)

**Source:** RESEARCH § Pattern 2 (lines 217-244), derived from D-03/D-06/D-09.
**Apply to:** Both response-path failed branches AND both worker-catch maxedOut branches (4 sites total).

```typescript
// MER-11 Phase 26: refund merits BEFORE the status='failed' UPDATE. D-09: short-
// circuit on null txid (pre-migration jobs) with warn log — do NOT pass null to
// the RPC.
const txId = job.merit_transaction_id;
if (!txId) {
  console.warn('refund-skip', { job_id: job.id, reason: 'pre_migration_null_txid' });
} else {
  const reason = /* one of: 'retry_exhausted' | 'non_retryable_error' | 'worker_exception' */;
  const r = await refundMeritsForJob(userId, txId, reason);
  if (!r.ok) {
    console.error('refund-failed', {
      user_id: userId,
      merit_transaction_id: txId,
      job_id: job.id,
      feature: /* 'resume_analysis' | 'career_analysis' */,
      reason: r.error,
    });
  } else if (r.alreadyRefunded) {
    console.info('refund-already-refunded', { job_id: job.id, merit_transaction_id: txId });
  }
}
```

### Migration header convention

**Source:** `supabase/migrations/20260422000000_phase_24_topup.sql` lines 1-16.
**Apply to:** the new migration file.
- Phase + plan + REQ-ID line at the top
- "Re-runnability" comment block listing each section's idempotency primitive
- "Roll-forward only" stance (no DROP, no destructive ALTER)
- Optional post-apply verification SELECT in a SQL comment

### `MeritRefundable` for catchable refundable errors inside `withMerits` callbacks

**Source:** `_shared/merit-gateway.ts` lines 73-80 (class) + lines 108-110 (caller comment).
**Apply to:** Both submit-side insert-failure paths (D-08a).
```typescript
if (insertError || !job) {
  throw new MeritRefundable(503, `job insert failed: ${insertError?.message ?? 'unknown'}`);
}
```
> Status 503 is the canonical "service-side, refundable" status (matches the refund taxonomy at `merit-gateway.ts` line 53: `if (status >= 500) return true`).

### Test imports — Deno standard assert

**Source:** Two valid in-tree variants — both work, prefer the newer `std@0.224.0/assert/mod.ts` for new tests since it's the dominant pattern across `__tests__/` folders.
```typescript
// Newer (preferred for new tests, used in 5+ recent test files):
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Older (still in use in some _shared/__tests__ files):
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
```

## No Analog Found

None. Every file in this phase has at least one in-tree analog with exact role + data-flow match. The phase is genuinely a wiring change.

## Metadata

**Analog search scope:**
- `supabase/migrations/` (10 files matching `ADD COLUMN IF NOT EXISTS`)
- `supabase/functions/_shared/` and `supabase/functions/_shared/__tests__/`
- `supabase/functions/submit-{resume,career}-analysis-job/`
- `supabase/functions/process-{resume,career}-analysis-job/`
- `supabase/functions/analyze-resume/` (test patterns)
- `supabase/functions/interview-prep-analyze/__tests__/` (merit-refund test pattern)

**Files scanned:** ~12 source files + ~6 test files + 3 migrations.

**Key patterns identified:**
- Migrations follow a consistent header + idempotent `ADD COLUMN IF NOT EXISTS` + `COMMENT ON COLUMN` shape (Phase 24 top-up migration is the freshest analog).
- Both submitters (`submit-resume-analysis-job`, `submit-career-analysis-job`) and both processors (`process-{resume,career}-analysis-job`) are byte-for-byte structural mirrors — drift between them is the most likely defect class. Plans MUST mirror changes lockstep.
- Worker logging uses raw `console.{log,warn,error}` with object payloads (NOT `_shared/logger.ts createLogger`). The merit-gateway module uses `createLogger` internally — do not export that style to the workers.
- The repo has zero existing `globalThis.fetch` stub harness for workers — the established test convention is **source-grep** (read `index.ts` as text + assert) plus optional **env-gated live-DB integration**. Source-grep tests satisfy SC #5 at the repo's existing honesty level.
- `MeritRefundable` is the contract for "throw inside `withMerits` and refund" — `withMerits` only refunds errors with `name === 'MeritRefundable'` or matching `isRefundableAnthropicError(status, msg)`. Plain `Error` is NOT refundable (this is the leak D-08a closes).
- The `refund_merits` RPC's `already_refunded` arrives in `data.error`, NOT in the supabase-js `error` envelope — the helper extension must read `data` (currently it does not). RESEARCH Pitfall 1.

**Pattern extraction date:** 2026-04-28
