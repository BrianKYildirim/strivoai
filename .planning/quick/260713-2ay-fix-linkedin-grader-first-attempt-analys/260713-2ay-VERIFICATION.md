---
phase: 260713-2ay
verified: 2026-07-13T00:00:00Z
status: human_needed
score: 9/9 must-have truths verified (static/test-level)
human_verification:
  - test: "Upload a real LinkedIn PDF on Free tier and click Analyze once, live against the deployed edge function"
    expected: "The analysis completes and opens automatically on the first click, with no server-error toast, and exactly one linkedin_grades row + one merit deduction is created"
    why_human: "The edge functions in this commit range (41bf3965, e070d96b, b850bdda) have NOT been deployed to preview or production. All verification below is static source inspection + the automated test gate (vitest/deno/Playwright), which exercises the retry/deadline/idempotency/recovery logic with injected fakes and source-grep guards — it cannot observe real Anthropic latency, a real AbortController firing at the wall, or a live merit debit against the deployed function. A live run is required to close the loop on the actual acceptance test."
  - test: "Trigger a genuine ~50-70s free-tier LinkedIn grade and confirm the 408-retry path actually engages against the real Anthropic API (not the fake invoke in retry-deadline.test.ts)"
    expected: "The first attempt's AbortController may still fire at 90s in rare cases, but the retry consumes the ~72s remaining budget and completes without a client-visible error"
    why_human: "Requires a live deploy + live Anthropic call; the unit tests validate the retry mechanism deterministically but not real-world timing behavior"
---

# Quick Task 260713-2ay: Fix LinkedIn Grader First-Attempt Analysis — Verification Report

**Task Goal:** Fix the LinkedIn Grader first-attempt analysis bug — the first click showed a server-error toast and refunded merits; a second click with the same PDF succeeded. After the fix, the analysis must complete and display on the FIRST click.
**Verified:** 2026-07-13
**Status:** human_needed (all static/test-level checks pass; the runtime acceptance test requires a live deploy that has not happened)
**Re-verification:** No — initial verification

## Method

Read the plan's `must_haves` (truths/artifacts/key_links) and the ROOT-CAUSE doc, then verified each claim against the ACTUAL source at the three named commits (`41bf3965`, `e070d96b`, `b850bdda` on `staging`) — not the SUMMARY's prose. Re-ran the full blocking gate myself rather than trusting the executor's reported numbers.

## Goal Achievement — Must-Have Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 408/AbortError is genuinely RETRIED, not returned as non-retryable 4xx | VERIFIED | `supabase/functions/_shared/ai-retry.ts:51-57` — `isRetryableAiStatus` explicitly returns `true` for `status === 408`, with a comment naming the bug. `400/401/403/422` are NOT in the retryable set and fall through unchanged. |
| 2 | ONE deadline spans BOTH of `runTieredAiCall`'s retry loops (not per-loop) | VERIFIED | `grade-linkedin/index.ts:287` computes `deadlineAt` ONCE per request (outside `runTieredAiCall`). `runTieredAiCall` takes `deadlineAt` as a parameter and passes the SAME value to both `invokeWithRetry` calls at line 252 (main) and line 263 (validation-retry). The legacy `MERIT_SYSTEM_ENABLED=false` path (lines 803-811, 845-853) and the dormant lifecycle closure (line 431) also reuse the same request-scoped `deadlineAt`/`getTimeout(tier,'linkedin')`. A per-loop deadline would allow ~330-540s worst case; this is genuinely request-scoped. |
| 3 | Budget invariant: client 180s > server 165s > per-call 90s | VERIFIED | `src/pages/LinkedInGrader.tsx:602` — `invokeWithTimeout(..., 180000)`. `grade-linkedin/index.ts:52` — `LINKEDIN_TOTAL_DEADLINE_MS = 165_000`. `_shared/tier-config.ts:41,43` — `free.linkedin = 90_000`, `elite.linkedin = 90_000`. 180,000 > 165,000 > 90,000 holds. |
| 4 | Grade output (D1) unchanged | VERIFIED | `git diff --stat 5d83a4e6..b850bdda -- src/config/pricing-config.ts supabase/functions/grade-linkedin/prompts.ts` returns empty — neither file appears in the diff at all. |
| 5 | Merit idempotency (D2) fails closed | VERIFIED | `grade-linkedin/index.ts:375-386` — `clientAttemptNonce` is derived ONLY from `meritBody.attemptNonce` (a real client-supplied value) with NO random fallback; `meritIdempotencyKey` is `undefined` when absent. This is a SEPARATE variable from the fail-open `attemptNonce` (line 356-358, which does fall back to `crypto.randomUUID()` but is only used for the dormant lifecycle call, per plan design). The live paid `withMerits` call at line 670 passes `idempotencyKey: meritIdempotencyKey` — never the random-fallback nonce. |
| 6 | Client recovery fires only on ambiguous errors (408/5xx/network), not hard failures (400/402/403/429) | VERIFIED | `src/pages/LinkedInGrader.tsx:689-716` — `isAmbiguousFailure = status === 408 \|\| status >= 500`. Recovery poll (3x, 2s apart) only runs inside that branch; 400/402/403/429 fall straight through to the `settle.rollback()` + honest-toast path with no poll. |
| 7 | No false refund claims | VERIFIED | `src/lib/merit-error-messages.ts` — refund copy is conditional on `meritsRefunded !== false`; unconfirmed siblings (`SERVER_ERROR_UNCONFIRMED` etc.) make no refund claim. `merit-gateway.ts:284-320` attaches `meritsRefunded=true` ONLY after `refund_merits` RPC succeeds; `false` on refund failure, replay (`already_deducted`), and non-refundable branches. `LinkedInGrader.tsx:723` derives `meritsRefunded` from `serverBody?.merits_refunded === true` — defaults false when there's no server body (client timeout/network), which correctly triggers the unconfirmed copy. |
| 8 | No DB migration written | VERIFIED | `git diff --stat 5d83a4e6..b850bdda -- supabase/migrations/` returns empty. |
| 9 | Lifecycle path (D5) still dormant | VERIFIED | `git diff` shows no changes to `_shared/analysis-lifecycle.ts`. `ANALYSIS_LIFECYCLE_LINKEDIN` is gated behind the master `ANALYSIS_LIFECYCLE_ENABLED` flag which default-derives to `false` (`_shared/analysis-flags.test.ts`, `analysis-lifecycle.dormancy.test.ts` — both green). The `runAnalysisLifecycle` call site in `grade-linkedin/index.ts:394-513` is present in this diff range (it predates this fix) and is unmodified by this task's diff — the fix's own changed lines never touch that call site. |

**Score:** 9/9 must-have truths verified at the static/source level.

## Gate Re-Run (independent, not trusting the SUMMARY)

Ran the full blocking gate myself from a clean shell:

```
npm run test          → Test Files 98 passed (98) | Tests 635 passed (635)
npm run test:edge      → 1283 passed | 0 failed | 12 ignored
npm run test:e2e        → 7 passed | 2 skipped (pre-existing QUARANTINE: stripe-checkout real-card fill, two-tab-concurrency S-20)
npm run lint            → 0 errors, 159 warnings (all pre-existing, unrelated to this diff — Date.now() purity in Upload.tsx, no-explicit-any, tailwind require-import)
npx tsc -p tsconfig.app.json --noEmit → exactly 8 errors, all in src/components/ui/chart.tsx (recharts), matching the claimed pre-existing baseline
npm run build            → exit 0, built in 1.56s
```

These numbers are IDENTICAL to what the SUMMARY reported (635 vitest / 1283 deno / 7 Playwright, 8 recharts tsc errors). The gate is genuinely green — this is not a case of a stale SUMMARY claim.

## Onboarding.recovery.test.tsx Deviation — Verified Accurate

Confirmed the executor's account:
- `git show e8fa2e2b -- src/pages/Onboarding.tsx` shows commit `e8fa2e2b` introduced `disabled={loading || professionalGoal.trim().length === 0}`, replacing a bare `disabled={loading}` — a strictly stronger guard.
- The current `src/pages/Onboarding.tsx:748` confirms this tightened guard is live.
- `src/pages/__tests__/Onboarding.recovery.test.tsx:64` now asserts `/disabled=\{loading(\s*\|\|[^}]*)?\}/` — a regex that matches both the old exact literal and the new tightened guard, with an inline comment explaining the reconciliation and citing this quick task.
- This preserves the test's INTENT (loading gates the button — a duplicate click cannot mint a second run) without weakening it: the regex still requires `loading` to be present in the disabled expression; it does not, for example, accept `disabled={false}` or drop the loading check entirely.
- This is a faithful, narrowly-scoped fix to a rotted assertion, not a masked regression.

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/functions/_shared/ai-retry.ts` | Deadline-bounded, 408-retrying retry helper | VERIFIED | New file, exports `invokeWithRetry`, `AiRetryOptions`, `isRetryableAiStatus`, `computeAiBackoffMs`. Injectable invoke/now/sleep/random for tests. |
| `supabase/functions/_shared/tier-config.ts` | `'linkedin'` CallType @ 90s, free+elite, no `pro` cell | VERIFIED | Lines 17, 41, 43 — no `pro.linkedin` cell present, matches D6. |
| `supabase/functions/_shared/merit-gateway.ts` | `meritsRefunded` signal on re-thrown error | VERIFIED | Lines 284-320. |
| `supabase/functions/grade-linkedin/index.ts` | One deadline, idempotencyKey, honest status/body | VERIFIED | See truths 2, 3, 5, 7 above. |
| `src/lib/fetchWithTimeout.ts` | Real HTTP status on Error; client timeout tagged 408 | VERIFIED | Lines 35-39 (client-side tag), 73-88 (server error status propagation). |
| `src/lib/merit-error-messages.ts` | Conditional refund copy | VERIFIED | See truth 7 above. |
| `src/pages/LinkedInGrader.tsx` | 180s budget, watermark, recovery, honest status | VERIFIED | Lines 541-716; regex status-scrape confirmed gone (`rg '4\d\d|5\d\d' src/pages/LinkedInGrader.tsx` finds nothing in active code — only doc-comment references stripped by the test's comment-stripping guard). |
| `supabase/functions/grade-linkedin/__tests__/retry-deadline.test.ts` | RED-before proof suite | VERIFIED | 18 `Deno.test` blocks present, including the static source guard (`source: BOTH of runTieredAiCall's retry loops share the SAME deadline`), registered in `deno.json`'s `test:ci`. |

## Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| `grade-linkedin/index.ts` | `_shared/ai-retry.ts` | `invokeWithRetry(params, log, { deadlineAt })`, same `deadlineAt` at both call sites | WIRED |
| `grade-linkedin/index.ts` | `_shared/merit-gateway.ts` | `withMerits({..., idempotencyKey: meritIdempotencyKey })` | WIRED |
| `_shared/merit-gateway.ts` | `LinkedInGrader.tsx` | `err.meritsRefunded` → `{merits_refunded}` body → `getMeritErrorMessage(status, {meritsRefunded})` | WIRED |
| `LinkedInGrader.tsx` | `linkedin_grades` table | pre-submit watermark select + post-failure recovery select | WIRED |
| `fetchWithTimeout.ts` | `LinkedInGrader.tsx` | `error.status` propagation | WIRED |

## Anti-Patterns Found

None. No TODO/FIXME/placeholder markers in the changed files; no stub returns; the "impure Date.now()" lint warning in `Upload.tsx` is pre-existing and unrelated to this task's file list.

## Human Verification Required

This fix cannot be fully closed by static/test-level verification alone, because the acceptance test is explicitly a RUNTIME one (upload a PDF, click once, grade opens) and the edge functions have not been deployed to any environment yet. See the `human_verification` block in the frontmatter for the two items that need a live deploy + live click-through:

1. Upload a real LinkedIn PDF (Free tier ideally, since that's where the bug was observed) and click Analyze once against the deployed function. Confirm: no error toast, analysis opens automatically, exactly one `linkedin_grades` row, exactly one merit deduction.
2. Ideally trigger the actual ~50-70s generation window on Free tier to confirm the 90s per-call wall + 165s total deadline behave as designed under real Anthropic latency (the unit tests exercise this deterministically with a fake clock, but real network/model timing is unobserved here).

## Gaps Summary

No gaps at the code/test level — every must-have truth in the plan's frontmatter is genuinely present and correctly wired in the current `staging` source, and the full blocking gate (`verify:baseline`) is independently confirmed green with numbers matching the SUMMARY exactly. The only reason this is not marked `passed` is that the plan's actual success criteria ("upload a valid LinkedIn PDF, click once, analysis completes and opens") is a live-runtime behavior that has not been exercised against a deployed edge function in this environment, and per the task instructions that is properly classified as `human_needed` rather than a gap.

---

*Verified: 2026-07-13*
*Verifier: Claude (gsd-verifier)*
