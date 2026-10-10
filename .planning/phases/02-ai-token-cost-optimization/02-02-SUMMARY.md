---
phase: 02-ai-token-cost-optimization
plan: 02
subsystem: edge-shared
tags: [telemetry, tokens, observability, rls, tdd]
requires:
  - "_shared/logger.ts (createLogger)"
  - "_shared/supabase-client.ts (getServiceClient, dynamically imported)"
provides:
  - "public.ai_call_telemetry (migration + rollback, unapplied)"
  - "_shared/ai-telemetry.ts :: recordAiCall, AiCallTelemetryRow"
  - "AnthropicInvokeParams.telemetry — the opt-in context that turns the seam on"
affects:
  - "_shared/anthropic.ts invokeAnthropicText (3 guarded write points)"
  - "supabase/functions/deno.json test:ci"
tech-stack:
  added: []
  patterns:
    - "never-throws side-channel writer (memoised client AND memoised disable)"
    - "dynamic await import() to keep a hot-path module dependency-free at load"
    - "STORED generated columns for derived report metrics (headroom_pct, truncated)"
key-files:
  created:
    - supabase/migrations/20260721000000_ai_call_telemetry.sql
    - supabase/migrations/rollback/20260721000000_ai_call_telemetry.rollback.sql
    - supabase/functions/_shared/ai-telemetry.ts
    - supabase/functions/_shared/ai-telemetry.test.ts
    - .planning/phases/02-ai-token-cost-optimization/deferred-items.md
  modified:
    - supabase/functions/_shared/anthropic.ts
    - supabase/functions/_shared/anthropic.test.ts
    - supabase/functions/deno.json
decisions:
  - "recordAiCall is awaited, not floated — a floating promise in a reclaimed Deno isolate silently loses exactly the rows this phase needs; fire-and-forget is satisfied by the never-throws contract"
  - "max_tokens records the CLAMPED effective cap, never params.maxTokens"
  - "streamAnthropicText left uninstrumented (no live caller) with an in-source comment so the gap is not 'fixed'"
  - "user_id carries no FK; stop_reason is unconstrained text; no prompt/response text is ever stored"
metrics:
  duration: 34min
  tasks: 3
  files: 8
  completed: 2026-07-21
---

# Phase 02 Plan 02: AI Call Token Telemetry Instrument — Summary

Permanent per-call Anthropic token telemetry: a service-role-only Postgres table with
generated `headroom_pct`/`truncated` columns, a never-throws `recordAiCall` writer that
resolves its Supabase client by dynamic import, and three guarded write points inside
`invokeAnthropicText` that stay completely inert until a caller passes a telemetry context.

## What Was Built

### Task 1 — `public.ai_call_telemetry` migration + rollback (`ac34fc3b`)

`supabase/migrations/20260721000000_ai_call_telemetry.sql` creates an append-only
`bigserial` table: context columns (`feature`, `tier`, `call_name`, `attempt`, `req_id`,
`user_id`), budget columns (`model`, `max_tokens`), nullable usage columns
(`input_tokens`, `output_tokens`, both cache token counters, `stop_reason`), and outcome
columns (`ok`, `http_status`, `duration_ms`, `ttfb_ms`, `output_chars`). Two STORED
generated columns — `headroom_pct` and `truncated` (`stop_reason = 'max_tokens'`) — make
the report SQL and any future near-cap alert one-liners.

Load-bearing constraints, each preserved with its reason stated in-file:

- **No FK on `user_id`.** `user_deletion_cascade_fks` (20260719120000) plus the
  auth-delete cleanup trigger (20260719120001) mean an FK here would either
  cascade-delete measurement history or block user deletion.
- **`stop_reason` is plain `text`** — not an enum, not CHECK-constrained. The
  constrained-output path may report a different stop vocabulary and losing it would be
  worse than recording an unexpected value (RESEARCH Open Q4).
- **No prompt text, no response text, ever.** `output_chars` is a count.

Four indexes (recency, the `(feature, tier, call_name, created_at DESC)` cell index, and
partial indexes on `req_id` and `truncated`), RLS enabled, the repo's verbatim deny-all
`DO $$ … EXCEPTION WHEN duplicate_object` policy for `authenticated`, and
`REVOKE ALL … FROM anon, authenticated` on both the table and its sequence. A trailing
`DO $$` block asserts the table, RLS, the policy, and both generated columns landed.
Retention is documented as a one-line operator-run `DELETE` snippet — no `pg_cron`, which
would be scope creep. The sibling rollback drops policy, indexes, and table, then verifies.

### Task 2 — `_shared/ai-telemetry.ts` never-throws writer (`087a3e3c` RED → `6a0cd1d9` GREEN)

`recordAiCall(row)` wraps its entire body in try/catch and short-circuits before any
client resolution when `AI_TEST_MODE=true`. The client is resolved through
`await import('./supabase-client.ts')` — mandatory, not stylistic: a static import would
pull `npm:@supabase/supabase-js@2` into every offline Deno test that touches the Anthropic
helper and risk a network fetch under `--offline` CI. Both the success and the failure are
memoised, so a misconfigured environment costs one warn line rather than one per AI call.
Warn logs carry `code` + `msg` only, never the row (which holds `user_id` / `req_id`).

Two test-only seams (`__setAiTelemetryClientFactoryForTest`, `__resetAiTelemetryForTest`)
make the failure modes deterministically assertable without a real database.

8 tests, all green: client-unavailable, PostgREST insert error, synchronous getter throw,
insert-call throw, `AI_TEST_MODE` no-op (asserts the factory is called **zero** times),
memoised disable (factory called exactly once across three calls), memoised success, and a
static-source guard that fails on any static `supabase-client` / `@supabase/supabase-js`
import and requires the dynamic `await import()` to be present.

### Task 3 — the seam in `invokeAnthropicText` (`589ef47a` RED → `f432aa29` GREEN)

`AnthropicInvokeParams.telemetry?: { feature, tier, callName, reqId?, userId?, attempt? }`
is optional, so all ~14 existing call sites compile and behave identically — **no call site
was edited**. A `_telemetryBase` object is built once (null when the field is absent) and
spread into three write points, each guarded by `if (_telemetryBase)`:

1. **Success**, right after the `[PERF]` log: usage from `data.usage`, `stop_reason` from
   the **top-level** `data.stop_reason`, `duration_ms = _tParsed - _t0`,
   `ttfb_ms = _tResponse - _t0`, `output_chars = text.length`, and `max_tokens =
   clampedMaxTokens` — recording the unclamped request would make every headroom figure wrong.
2. **`!response.ok`**: `ok:false` with the HTTP status and null usage columns.
3. **catch**: `ok:false`, `http_status` 408 for an AbortError and 500 otherwise. Not
   optional — a timeout under a raised cap is a first-class finding (a widened token budget
   without a widened wall clock produced a 408 mid-generation in quick task 260713-2ay).

`streamAnthropicText` is deliberately left uninstrumented and now carries a comment saying
so, with the evidence (no feature function calls it; the SSE `message_delta` events that
carry `usage`/`stop_reason` are discarded by its reader), so a future reader does not
"fix" the apparent gap.

9 new tests in `anthropic.test.ts`: inert without telemetry (zero writes), identical result
with telemetry, a **rejecting** writer changes neither the result nor throws out, the
clamped-`max_tokens` row assertion (`maxTokens: 99999` → `12000`) plus every mapped column,
the `!response.ok` row, both catch rows, and a static guard on the stream helper.

## Verification

| Check | Result |
| --- | --- |
| `deno test _shared/ai-telemetry.test.ts` | 8 passed / 0 failed |
| `deno test _shared/anthropic.test.ts _shared/ai-telemetry.test.ts _shared/prompt-sanitizer.test.ts` | 72 passed / 0 failed |
| `deno task test:ci` (full offline suite) | **1365 passed / 0 failed / 12 ignored** (was 1356; +9 new) |
| `deno check */index.ts` | clean across all edge functions |
| No static supabase-js import in the hot path | `grep -c "^import.*supabase-client" _shared/ai-telemetry.ts` = 0; offline suite still 25s |
| Call sites unchanged | `git diff --stat` for Task 3 touches only `_shared/anthropic.ts` |

The offline suite neither slowed nor began fetching, which is the practical proof that the
Supabase client is not statically imported.

## Deviations from Plan

### Blocked (documented, not worked around)

**1. [Rule 4 — Environment/Access] Preview application of the migration could not be performed**

- **Found during:** Task 1.
- **Issue:** the plan directs the executor to `apply_migration` + `execute_sql` on preview
  `cimjltzovkahkqecpwgi` via the Supabase preview MCP. The execution agent had **no MCP
  tools in its toolset** (file/shell tools only), and the repo carries no preview Postgres
  connection string — `.env.test.local` exposes only `SUPABASE_TEST_URL` + keys, which are
  PostgREST endpoints and cannot run DDL. No `exec_sql` RPC exists as a fallback.
- **Action taken:** the migration and rollback are authored, reviewed against the repo's
  conventions, and committed. The application step is recorded as **owed** in
  `deferred-items.md` (D02-02-A) with the exact probe steps, rather than silently skipped
  or faked. Production was not touched.
- **Risk while unapplied:** none. `recordAiCall` is only reachable when a caller passes
  `params.telemetry`, and no call site does yet (02-03/02-04 thread it). Even after
  threading, a missing table yields a `telemetry-insert-failed` warn and the analysis still
  succeeds — precisely what the never-throws contract exists for.
- **Owner:** orchestrator/operator, before 02-03 threads any telemetry context.

### Out of scope (logged, not fixed)

**2. `scripts/check-edge-boot.mjs` cannot spawn `deno` on this machine** — `deno` is an npm
shell shim that Node's `spawn('deno')` cannot resolve on Windows, so *every* function
reports `ENOENT`, including ones this plan never touched. Pre-existing environment issue.
Equivalent coverage obtained via `deno check */index.ts` (the same check the script wraps),
which is clean. Logged as D02-02-B.

### Minor implementation choices not spelled out in the plan

- **`_t0` hoisted out of the `try`.** The plan requires the catch branch to write a row,
  but `_t0` was declared *inside* the try and therefore out of scope in the catch. Hoisting
  it (one line moved, no behavior change) was the minimum needed to satisfy write point 3.
- **`_telemetryBase` extracted** so the context columns are constructed once and are
  provably identical across all three write points.
- **Two `__*ForTest` seams exported** from `ai-telemetry.ts`. The six required behaviors are
  otherwise untestable offline (they all hinge on how the *real* client fails). Neither seam
  can throw at module load and neither is referenced by any production path.
- **Two extra tests beyond the six required behaviors** (insert-call throws; successful
  client is memoised and reused) — cheap, and they pin the memo in both directions.

## No Authentication Gates

None occurred.

## Commits

| Commit | Type | Description |
| --- | --- | --- |
| `ac34fc3b` | feat | ai_call_telemetry migration + rollback |
| `087a3e3c` | test | RED — ai-telemetry never-throws contract |
| `6a0cd1d9` | feat | GREEN — recordAiCall writer + deno.json registration |
| `589ef47a` | test | RED — invokeAnthropicText telemetry seam contract |
| `f432aa29` | feat | GREEN — the three guarded write points |

## Follow-ups for Later Plans

- **02-03 / 02-04** thread `telemetry: { feature, tier, callName, reqId, userId, attempt }`
  into the per-feature call sites. `tier` MUST come from the server-resolved tier, never a
  request body (T-02-07).
- **02-06** owns the operator-executed production application of the migration.
- D02-02-A (preview apply + probe) must clear before telemetry rows can be observed anywhere.

## Self-Check: PASSED

All 6 claimed artifacts exist on disk, all 5 claimed commits exist in git, and all 3
must_haves key_links verified: `anthropic.ts` -> `recordAiCall`, `ai-telemetry.ts` ->
dynamic `await import('./supabase-client.ts')`, and `ai-telemetry.test.ts` registered in
`deno.json` `test:ci`.

One must_haves truth is **partially** satisfied and is honestly qualified above: "one row
lands in `ai_call_telemetry`" is proven at the write seam (the row is constructed and
handed to the client on every guarded path, asserted column-by-column), but not yet
end-to-end against a live table — the migration is unapplied. See D02-02-A.
