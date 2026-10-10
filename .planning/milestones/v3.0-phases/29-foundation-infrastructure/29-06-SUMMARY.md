---
phase: 29
plan: 06
subsystem: merit-gateway
tags: [phase-29, merit-gateway, cache-precheck, wave-2]
requires: ["29-01 (analysis_cache table)", "29-03 (record_ai_usage 4-arg overload + usage_tracking.analysis_id column)"]
provides: ["MeritGatewayOptions<T> interface", "withMerits 4th-arg precheck_cache short-circuit branch", "transactionId: 'cache-hit' sentinel"]
affects: ["Phase 37+ per-feature opt-in to analysis_cache reads (no existing call-site modified)"]
tech-stack:
  added: []
  patterns: ["pre-rate-limit short-circuit", "swallow-on-analytics-write-failure (D-08)", "defensive throw-as-miss (D-12)", "sentinel transactionId for downstream gating"]
key-files:
  created: [".planning/phases/29-foundation-infrastructure/29-06-SUMMARY.md"]
  modified:
    - "supabase/functions/_shared/merit-gateway.ts (+72 lines): MeritGatewayOptions<T> export + [0] CACHE PRECHECK block + 4th-arg signature"
    - "supabase/functions/_shared/merit-gateway.test.ts (+243 lines): 5 new Deno.test cases covering hit / error-swallow / throw / null-miss / back-compat"
decisions:
  - "Sentinel transactionId is the literal string 'cache-hit' — typed as string in MeritGatewayResult<T> so MeritGatewayResult shape unchanged. Phase 37+ callers gate on `=== 'cache-hit'` to skip refund-attempt logic."
  - "Precheck block placed BEFORE the existing checkRateLimit call (line 121) per CACHE-09 / D-15 — cache hits bypass the pooled 60/hr `ai-analyses-all` limiter because cache reads do not consume Claude tokens."
  - "record_ai_usage RPC errors on the cache-hit path are SWALLOWED (logged at warn, not propagated) per D-08 — the user already has the cached value; losing one analytics row is non-critical."
  - "A precheck_cache callback that throws is caught defensively (log.warn + treat as miss) per D-12 — production cache-implementation bugs do NOT take down the deduct path."
  - "Did NOT promote getServiceClient import to top-of-file — it was ALREADY at line 19 in the existing file. The plan's read_first noted line 127 as the import site but that turned out to be the call site, not a separate import. No change needed."
  - "Mocking strategy in tests: materialize getServiceClient() singleton via env vars, then monkey-patch `.rpc` on the live client object. Covers all three RPCs (record_ai_usage, increment_rate_limit, check_and_deduct_merits) without a live Supabase instance — robust enough that all 5 new tests are ACTIVE (none .skip)."
metrics:
  duration: "~25 min wall-clock (read + edit + test + commit + summary)"
  completed: "2026-05-12"
---

# Phase 29 Plan 06: Merit-Gateway Precheck Extension Summary

One-liner: Extended `withMerits` with an optional 4th `MeritGatewayOptions<T>.precheck_cache` callback that short-circuits rate-limit + check_and_deduct_merits on a cache hit, writes a credits=0 usage_tracking row for Activity History (CACHE-10), and returns the sentinel `transactionId: 'cache-hit'` — fully backwards-compatible with the 14 existing 3-arg call-sites in the codebase.

## Objective

Phase 29 Wave 1 (29-01 / 29-03) shipped the analysis_cache substrate + 4-arg record_ai_usage overload. This Wave 2 plan wires the gateway-level opt-in so Phase 37+ feature handlers can pass a `precheck_cache` callback that, on a hit, makes the gateway bypass both the pooled rate-limit (D-15) and the deduct RPC, while still surfacing the cache read in Activity History via a credits=0 usage_tracking write (D-13).

No edge handler changes — Phase 37+ will start passing the 4th arg per-feature.

## Implementation

### `supabase/functions/_shared/merit-gateway.ts` (+72 lines)

1. **Added export `MeritGatewayOptions<T>`** (between `MeritGatewayResult<T>` and the `withMerits` function): a single optional generic-typed `precheck_cache` member returning `Promise<{ cached: T; analysis_id: string } | null>`. JSDoc references D-04 / D-12 / D-13 / D-15.

2. **Altered `withMerits` signature** to accept `options?: MeritGatewayOptions<T>` as the 4th parameter. The `?:` optionality is the entire backwards-compat guarantee — existing 3-arg call-sites compile unchanged.

3. **Inserted `[0] CACHE PRECHECK` block** at the very top of the function body, BEFORE the existing line-121 `checkRateLimit` call. The block:
   - Skips entirely if `options?.precheck_cache` is undefined.
   - Wraps the callback in `.catch()` — any throw logs at warn (`'precheck_cache failed — treating as miss'`) and resolves to null. Defensive per D-12 — production cache-implementation bugs do NOT take down the deduct path.
   - On a non-null `{ cached, analysis_id }` result:
     - Calls `supabase.rpc('record_ai_usage', { p_user_id, p_action_type, p_credits: 0, p_analysis_id })` — the 4-arg overload from Plan 29-03. CACHE-10 / D-13.
     - Swallows RPC errors per D-08 (logs warn, does NOT propagate). User already has the cached value.
     - Logs `'cache-hit'` at info level.
     - Returns `{ ok: true, value: hit.cached, transactionId: 'cache-hit' }` — the sentinel string.
   - On `null`: falls through to the existing rate-limit + deduct path.

4. **Did NOT touch** anything from line 121 onward — rate-limit code, check_and_deduct_merits RPC call (still 3-arg), merit-transaction logging, fn invocation, refund-on-throw classification, response helpers — all preserved verbatim.

5. **`MeritGatewayResult<T>` unchanged** — `transactionId` is already typed as `string`, so the `'cache-hit'` sentinel fits the existing shape with no type widening.

### `supabase/functions/_shared/merit-gateway.test.ts` (+243 lines)

Added 5 new Deno.test cases, all ACTIVE (no `.skip`):

| Test case | What it asserts |
|---|---|
| `precheck_cache: hit short-circuits…` | rate-limit + deduct RPCs NOT consulted; record_ai_usage called with `p_credits=0` + `p_analysis_id`; returns `transactionId: 'cache-hit'`; fn NOT invoked |
| `precheck_cache: record_ai_usage error is swallowed (D-08)` | When the usage_tracking write errors, gateway STILL returns the cached value with cache-hit sentinel |
| `precheck_cache: throwing callback is treated as miss (D-12)` | When the callback throws, gateway falls through to the existing rate-limit + deduct path (verified by observing both RPCs were called) |
| `precheck_cache: null result falls through…` | Miss path identical to throw path; fn NOT invoked when deduct denies |
| `3-arg call (no options) compiles and runs unchanged` | Back-compat: omitting the 4th arg runs the existing path identically |

**Mocking strategy**: materialize the `getServiceClient()` singleton once (via env var stubs), then monkey-patch its `.rpc` method on the live object with a deterministic stub that records every `(name, args)` call. Because both `rate-limiter.ts` and the gateway itself share the same singleton, the patch covers all three RPCs the gateway hits: `record_ai_usage`, `increment_rate_limit`, `check_and_deduct_merits`. This eliminated the planner-anticipated need for a `.skip` on the fall-through case.

## Verification

| Gate | Result |
|---|---|
| File-content + ordering grep (8 required tokens; precheck_block index < checkRateLimit index) | PASS — 13 token occurrences; ordering verified |
| `deno test --no-check --allow-env --allow-net supabase/functions/_shared/merit-gateway.test.ts` | PASS — 15 passed, 0 failed (10 existing + 5 new) in 23 ms |
| Existing 3-arg call-sites still compile | PASS — none modified; 14 call-sites across `supabase/functions/` untouched (`git diff --stat` shows only 2 files changed, both plan-listed) |

## Deviations from Plan

None. Plan executed exactly as written. No Rule 1/2/3 auto-fixes applied; no Rule 4 architectural escalations.

One minor finding worth noting (NOT a deviation):

- The plan's `<action>` block in Task 1 said to "promote `getServiceClient` to a top-of-file import" if it was not already there. Inspection showed it WAS already imported at the top of the file (line 19) — only the call site lives lower down (line 127). No promotion needed; original line 19 import is reused by the new precheck-hit branch.

## Threat IDs Mitigated

| Threat ID | Disposition in plan | How addressed |
|---|---|---|
| T-29-AUTH | mitigate | NFR-05 invariant preserved: gateway assumes `ctx.userId` is auth-verified before invocation. The new precheck branch does not introduce any new auth surface; it uses the same `ctx.userId` that the caller already validated. |
| T-29-RATE-BYPASS | accept (D-15) | Cache hits intentionally bypass the pooled `ai-analyses-all` 60/hr limit — cache reads do not consume Claude tokens. NFR-05 preserved on miss path. |
| T-29-CACHE-POISON | mitigate | Gateway only short-circuits on hit; the cache WRITE timing per CACHE-12 is the caller's responsibility (enforced in Phase 37+ per-feature plans). |
| T-29-SWALLOW-USAGE-WRITE | accept (D-08) | record_ai_usage RPC errors on the cache-hit path are logged at warn but do NOT propagate. User gets the cached value. |
| T-29-INPUT | mitigate | Defensive `.catch()` on the precheck callback — any exception is logged at warn and treated as a miss; existing rate-limit + deduct path runs as if no callback was provided. |

## Threat Flags

None. The plan introduces no new auth path, network endpoint, schema change, or file-access surface. The only new outbound surface is a Postgres RPC call to `record_ai_usage` — already an authenticated service-role RPC added in Plan 29-03; the gateway uses the same service-client singleton already used by `check_and_deduct_merits` and `refund_merits`.

## Self-Check: PASSED

- File `supabase/functions/_shared/merit-gateway.ts` contains all 8 required tokens (verified by Grep: 13 occurrences across the file).
- File `supabase/functions/_shared/merit-gateway.test.ts` contains 5 new `Deno.test(` declarations mentioning `precheck_cache` and the `'cache-hit'` literal.
- `deno test` run: 15 passed / 0 failed.
- Commits `dc7f010` (feat) and `c97f9d4` (test) both present on the current `worktree-agent-ae05ff930837ecca0` branch — verified via `git log --oneline -2`.
