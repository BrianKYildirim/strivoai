# Phase 02 — Deferred / Out-of-Scope Items

## D02-02-A — Preview application of `20260721000000_ai_call_telemetry.sql` (RESOLVED)

**Raised by:** plan 02-02, Task 1.
**Status:** RESOLVED 2026-07-21 by the execute-phase orchestrator (which does hold the
Supabase preview MCP tools the executor lacked). Applied to preview
`cimjltzovkahkqecpwgi` via `apply_migration`; all three probes pass:

- structure/lockdown — 22 columns, 5 indexes, `relrowsecurity = true`, 1 deny-all policy,
  `has_table_privilege('anon'|'authenticated', ..., 'SELECT')` both `false`;
- generated columns — a service-role INSERT (`max_tokens` 1000, `output_tokens` 250,
  `stop_reason` 'max_tokens') returned `headroom_pct = 75.00`, `truncated = true`;
- probe row deleted afterwards, table back to 0 rows. Production untouched.

Original blocker, retained for context:

The plan directs the executor to apply and probe the migration on the PREVIEW project
(`cimjltzovkahkqecpwgi`) via the Supabase preview MCP `apply_migration` / `execute_sql`.
The execution agent had **no MCP tools in its toolset** (only file/shell tools), and the
repo carries no preview Postgres connection string (`.env.test.local` exposes only
`SUPABASE_TEST_URL` + keys — PostgREST endpoints, which cannot run DDL). There is no
`exec_sql` RPC to fall back on.

**Owner:** orchestrator or operator, before plan 02-03 threads any telemetry context.
**Action:**
1. `apply_migration` on preview `cimjltzovkahkqecpwgi` with the committed file.
2. Probe: a service-role `INSERT` succeeds and populates `headroom_pct` / `truncated`.
3. Probe: `ai_call_telemetry` holds no grant for `anon` / `authenticated`
   (`SELECT * FROM information_schema.role_table_grants WHERE table_name='ai_call_telemetry'`).
4. Production stays untouched — prod application is an operator step in plan 02-06.

**Risk while unapplied:** none to production. `recordAiCall` is only reached when a caller
passes `params.telemetry`, and no call site does yet (02-03/02-04 thread it). Even after
threading, a missing table produces a `telemetry-insert-failed` warn and the analysis
still succeeds — that is exactly what the never-throws contract is for.

## D02-02-B — `scripts/check-edge-boot.mjs` cannot spawn `deno` on this machine

Out of scope (pre-existing environment issue, not caused by this plan). `deno` is
installed as an npm shell shim at `/c/Users/yildi/AppData/Roaming/npm/deno`, which
Node's `spawn('deno')` cannot resolve on Windows. Every function reports
`could not spawn deno: spawn deno ENOENT`, including ones this plan never touched.

Equivalent coverage was obtained instead: `deno check */index.ts` (the same check the
boot script wraps) is clean across all edge functions, and `deno task test:ci` is green.

## D02-01-A — `phase9-pii-guard.test.ts` does not scan the Phase-02 directory

**Raised by:** plan 02-01, Task 2.

The 02-01 threat model (T-02-01) mitigates "operator account email recorded in a git-tracked
`.md`" by citing `src/test/security/phase9-pii-guard.test.ts` as an automated sweep of phase-dir
markdown. That premise is **wrong**: the guard's `SCAN_ROOTS` are
`resolvePlanningPhaseDir('09-final-verification-milestone-report')` and `scripts/test-resumes/`
only (`phase9-pii-guard.test.ts:26-30`, `:201`). It never walks
`.planning/phases/02-ai-token-cost-optimization/`.

The guard was run after `02-PREREQS.md` recorded `x9gns@web-library.net` + user_id
`51238564-...` and passed **18/18** — but that pass is vacuous for this file, since the file is
outside the scan roots. Those values are currently protected by manual discipline only.

Mitigating facts: the address is a disposable relay, not a personal one, and no password, token,
service key, or Supabase key is recorded anywhere in the phase directory.

**Deferred because** plan 02-01 is explicitly forbidden from modifying any file under `src/` or
`supabase/` (its own verification asserts this). Widening `SCAN_ROOTS` to every `.planning/phases/*`
dir is a small change but belongs in a plan permitted to touch source, and needs a full
`verify:baseline` run since the guard is vitest auto-discovered and would begin scanning every
historical phase directory at once.

**Owner:** a later Phase-02 plan that already touches `src/`, or a follow-up quick task.

## D02-04-A — `interview-prep-analyze/phase22-contract.test.ts` is RED at HEAD (pre-existing)

**Raised by:** plan 02-04, Task 2.

The targeted `deno test interview-prep-analyze/` run reports 3 failures in
`phase22-contract.test.ts` (`record_ai_usage RPC called on merit path`, `p_action_type
interview_prep present`, `exactly 1 record_ai_usage call site`). Confirmed PRE-EXISTING by
stashing this plan's changes and re-running: still 0 passed / 3 failed at clean HEAD.

The file is a source-probe guard asserting a `record_ai_usage` call shape that
`interview-prep-analyze/index.ts` no longer uses. It is NOT registered in
`supabase/functions/deno.json` `test:ci`, so it is outside `verify:baseline` — which is why
the offline gate is green (1368/0/12) while this file is red.

**Owner:** a follow-up quick task or a later plan that touches Interview Prep. Either
reconcile the guard to the current usage-recording seam or retire it; do not register it in
`test:ci` until it is reconciled.

## D02-04-B — `invokeWithRetry`'s internal retries share one `attempt` label

**Raised by:** plan 02-04, Task 1.

`_shared/ai-retry.ts::invokeWithRetry` spreads the caller's `AnthropicInvokeParams`
(including `telemetry`) into every one of its up-to-3 transport attempts, so a transport
retry writes a telemetry row bearing the CALLER's attempt number. `attempt` therefore
distinguishes explicit call sites (first call vs validation-retry) but not transport
retries within one site.

Not fixed here: `_shared/ai-retry.ts` is outside plan 02-04's declared file list, and 02-03
was editing adjacent shared surface concurrently.

**Impact on the study: none.** Every row still carries true `input_tokens` /
`output_tokens` / `stop_reason` / clamped `max_tokens`, so headroom and truncation analysis
are exact. Only the retry-count-per-label breakdown is coarse.

**Fix if ever wanted (one line):** in `invokeWithRetry`'s loop, pass
`telemetry: params.telemetry ? { ...params.telemetry, attempt: (params.telemetry.attempt ?? 1) + attempt } : undefined`
alongside the existing `timeoutMs` override.
