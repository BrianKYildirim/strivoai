---
phase: 260724-5do
plan: 01
subsystem: money-path / analysis-lifecycle
tags: [refund-truth, merits, terminalize-stuck-run, reaper-backstop]
requires:
  - supabase/functions/_shared/merit-gateway.ts (RefundVerdict, refundMeritsForJob)
provides:
  - refundIsOnFile (pure, exported) — outcome-derived analysis_jobs.refunded column write
affects:
  - supabase/functions/process-career-analysis-job/index.ts (persisted column only; return unread)
  - supabase/functions/reap-stale-analysis-runs/index.ts (backstop stays armed on refund failure)
tech-stack:
  added: []
  patterns:
    - "pure exported classifier + source-grep wiring guards (mirrors classifyRefundRpcResult)"
key-files:
  created: []
  modified:
    - supabase/functions/_shared/terminalize-stuck-run.ts
    - supabase/functions/_shared/terminalize-stuck-run.test.ts
decisions:
  - "The persisted refunded COLUMN means 'a refund is ON FILE' (verdict.ok, true for both fresh and already_refunded); TerminalizeStuckRunResult.refunded keeps its distinct meaning 'released by THIS call' (!alreadyRefunded). The two are deliberately NOT collapsed."
metrics:
  duration: ~25 min
  tasks: 2
  files: 2
  completed: 2026-07-24
---

# Quick 260724-5do: Fix the last REFUND-TRUTH violation (terminalize-stuck-run) Summary

Gated `analysis_jobs.refunded` on the refund **outcome** via a new pure exported
`refundIsOnFile(verdict)`, so a genuinely failed `refund_merits` RPC no longer marks the row
refunded and no longer disarms the `reap-stale-analysis-runs` backstop that the surrounding
comment promises.

## What Changed

`supabase/functions/_shared/terminalize-stuck-run.ts`

- Imported `type RefundVerdict` alongside the existing `refundMeritsForJob` import.
- Added pure, exported, documented `refundIsOnFile(verdict: RefundVerdict | null): boolean`
  (`verdict !== null && verdict.ok === true`) above `terminalizeStuckRun`.
- Added `let refundVerdict: RefundVerdict | null = null;` beside `let refunded = false;` and
  assigned `refundVerdict = r;` immediately after the `refundMeritsForJob` call, before the
  `if (r.ok)` branch.
- Replaced `if (canRefund) patch.refunded = true;` with
  `if (refundIsOnFile(refundVerdict)) patch.refunded = true;` plus a REFUND TRUTH comment.

Byte-identical / untouched, as required: `TerminalizeStuckRunResult` and its doc comments,
both `return` statements (`refunded` at lines 178 and 182), `refunded = !r.alreadyRefunded`,
the `refund-failed` `console.error` log-and-continue branch (no `return`/`throw` added — the
failed-refund path still reaches the `transition_analysis_run` CAS), `canRefund`,
`RESOLVED_OR_RECOVERABLE`, the skip guards, and the refund-before-CAS ordering.

`supabase/functions/_shared/terminalize-stuck-run.test.ts`

- Four behavioral cases on the pure helper covering all three verdict outcomes plus the
  not-attempted `null` case.
- Wiring guards: patch must be gated on `refundIsOnFile(refundVerdict)`; must NOT match
  `if (canRefund) patch.refunded`; must NOT match `patch.refunded = refunded`.
- No-hang ordering guard: `refund-failed` appears before `transition_analysis_run` in source.
- Factored the comment-stripping reader into `readStrippedSource()`; the pre-existing
  money-path guard now uses it and still passes unchanged (including
  `/patch\.refunded\s*=\s*true/` and `/!settled\s*&&\s*!alreadyRefunded/`).

Not touched, exactly as the plan predicted after independent re-verification:
`supabase/functions/deno.json` (the test file was already registered in `test:ci`) and
`vitest.config.ts` (vitest's `include` is `_shared/__tests__/*.test.ts`, which does not match
`_shared/terminalize-stuck-run.test.ts`). No discrepancy found.

## RED-before / GREEN-after Evidence

All numbers are actual observed output of
`deno test --allow-all --no-check _shared/terminalize-stuck-run.test.ts` run from
`supabase/functions/`.

**RED stage 1 — tests written, source untouched:**

```
running 0 tests from ./_shared/terminalize-stuck-run.test.ts
error: SyntaxError: The requested module './terminalize-stuck-run.ts'
       does not provide an export named 'refundIsOnFile'
FAILED | 0 passed | 1 failed (12ms)
```

**RED stage 2 (isolated proof of the defect) — helper exported and `refundVerdict` captured,
but the defect line `if (canRefund) patch.refunded = true;` still in place:**

```
money path: the CAS patch is gated on the refund OUTCOME, never on eligibility ... FAILED
error: AssertionError: the CAS patch must be gated on the refund OUTCOME helper
FAILED | 11 passed | 1 failed (20ms)
```

This isolates the failure to exactly the defect: the eligibility-gated column write, and
nothing else.

**GREEN — after flipping the gate to `refundIsOnFile(refundVerdict)`:**

```
ok | 12 passed | 0 failed (13ms)
```

## Caller Impact

Exhaustive: 2 call sites in 1 file. Re-confirmed at HEAD — **neither reads the return
`.refunded`**, so this change is caller-invisible; only the persisted column changes.

| # | Call site | Reads return `.refunded`? | Impact |
|---|-----------|---------------------------|--------|
| 1 | `process-career-analysis-job/index.ts:269` (`deferToExecutor` permanent 4xx) | No — `await terminalizeStuckRun({...});`, result discarded | None |
| 2 | `process-career-analysis-job/index.ts:369` (flag-ON `maxedOut` worker exception) | No — result discarded | None |

`analyze-career/__tests__/worker-two-writer.test.ts` only counts `terminalizeStuckRun(` call
sites — unaffected (green in `test:edge`).

## Gates (actual observed output)

| Gate | Result |
|------|--------|
| `npm run lint` | PASS — `155 problems (0 errors, 155 warnings)`, all pre-existing |
| `npm run type-check` | PASS — clean, no output |
| `npm run test` (vitest) | PASS — **117 files / 829 tests passed, 0 failed** |
| `npm run test:edge` (deno) | PASS — **1436 passed / 0 failed / 12 ignored** |
| `npm run build` | PASS — `built in 40.12s` (pre-existing chunk-size warning only) |

`git diff --stat HEAD -- supabase/migrations/` is empty. No migration, no RLS/GRANT, no
deploy. `.gitignore` untouched. Exactly two files changed, each staged by explicit path.

## Commits

| Commit | Scope |
|--------|-------|
| `f748ca62` | `fix(260724-5do-01)`: outcome-derived `refunded` column via `refundIsOnFile` |
| `c0cc46e7` | `test(260724-5do-02)`: three refund outcomes + wiring / no-hang guards |

## Deviations from Plan

**1. [Method, not behavior] RED proof produced by staged application rather than `git stash`.**
- **Planned:** apply Task 1 in full, then `git stash` it to observe RED.
- **Done:** applied the fix in two steps — (a) export `refundIsOnFile` + capture
  `refundVerdict` while leaving `if (canRefund) patch.refunded = true;` in place, observe RED;
  (b) flip the gate, observe GREEN.
- **Why:** a plain stash produces only a module-load `SyntaxError` (0 tests run), which proves
  nothing about the defect itself. Both RED observations are recorded above; the staged
  variant isolates the failure to the single eligibility-gated line. Final committed source is
  identical to what the plan specifies. Nothing stashed was committed.

No other deviations. No auto-fixes were needed (Rules 1-4 not triggered).

## Out-of-Scope Observation (flagged by the planner; deliberately NOT fixed here)

`refundMeritsForJob` resolves its client via `getServiceClient()`, which **throws** if
`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are unset. That throw would propagate out of
`terminalizeStuckRun`, bypassing the terminal CAS entirely and defeating the log-and-continue
no-hang guarantee this helper exists to provide. It is not reachable in a correctly configured
deployment (a misconfigured RPC returns an error rather than throwing at client construction),
so it was deliberately left alone. Worth a follow-up quick if the operator wants belt-and-braces
(e.g. wrapping the refund call in a try/catch that logs and continues).

## Self-Check: PASSED

- `supabase/functions/_shared/terminalize-stuck-run.ts` — FOUND, exports `refundIsOnFile`,
  `patch.refunded` gated on it (line 163), no `if (canRefund) patch.refunded` remaining.
- `supabase/functions/_shared/terminalize-stuck-run.test.ts` — FOUND, references
  `refundIsOnFile`, 12/12 passing.
- Commit `f748ca62` — FOUND. Commit `c0cc46e7` — FOUND.
