---
status: complete
quick_id: 260713-hrd
date: 2026-07-13
verification: passed
---

# Quick Task 260713-hrd — Career Compass audit + fix (Free + Elite)

## What was actually wrong

Career Compass was not a UI bug. It was four independent defects that compounded, and they were
reproduced against **production data**, not inferred:

| # | Root cause | Production evidence |
|---|---|---|
| RC-1 | `requireInternalAuth()` is typed `Promise<null>` and always returns null. The page always submits through the job queue, so `analyze-career` saw `userContext === null` and collapsed `resolvedTier` to `'free'` for **every** run. Elite users were charged Elite and analyzed as Free. It also skipped the entire `if (MERIT_SYSTEM_ENABLED && userContext)` block — priors, cache, and the parallel fan-out were dead code; the orphaned "legacy path" served 100% of traffic. | Every run ≤2026-04-09 was Elite-shaped (roadmap, skillGaps, 3 roles, 13–15 keys). Every run ≥2026-04-27 was Free-shaped. |
| RC-2 | `maxTokensForAnalysis = getMaxOutput(...)` was computed, logged, and **never passed to the model**. The call hardcoded `maxTokens: isElite ? 3500 : 2500`. With RC-1 forcing `isElite=false`, every run got 2500 tokens for a schema whose complete instances measure ~2,200–3,041 tokens *after* stripping. `repairTruncatedJSON` then closed the braces on the half-written JSON and the stub was persisted as a **billed success**. | The `roles` key is **absent** (not empty) from 100% of post-regression rows. Free shaping *slices* `roles` to 3 — it never deletes it. Payloads collapsed 12,000 → 1,600–3,500 chars; top-level keys 13–15 → 7–8. |
| RC-3 | A second entitlement quota (`can_perform_ai_action`) still gated the live path: Free = **3 AI actions per cycle across ALL features**. Career Compass told Free users to run Resume Analysis + LinkedIn Grader first — and those priors ate 2 of the 3. The feature deadlocked itself. Worse, its denial is a **429**, which `isRetryableHttpStatus` classified as *transient*, so the worker retried a permanent denial **8×**. | Free users sitting at exactly 3 usage rows (`resume_analysis`, `linkedin_grading`), permanently 429'd. Jobs with `last_error='usage_limit_reached', attempts=8`. |
| RC-4 | The live submit path called `withMerits` with **no idempotency key**, so `check_and_deduct_merits` received `p_idempotency_key = NULL` and could not dedupe. Every resubmit charged again. | `idempotency_key` NULL on nearly every career deduction. One Elite user charged **8× (−24 merits)** on 2026-07-11 for one usable result. |

Plus: the page gated tabs on the literal `subscriptionTier === "elite"` (so legacy `pro` users paid
for Elite and saw the Free 2-tab UI); it rendered **two** loading UIs simultaneously with
contradicting copy ("about a minute" vs "about 20 seconds"); and on poll timeout it called
`settle.rollback()` — which restores the on-screen balance and therefore **reads as "you were
refunded"** when nothing had been refunded.

## What changed (5 atomic commits)

| Commit | Task |
|---|---|
| `f4e29b11` | Resolve the real tier on the live worker path; wire the real token budget + timeout ladder |
| `16e35abf` | Truncation is a terminal failure; completeness asserted at EVERY tier; Free is standalone |
| `8f4d233d` | Merits are the only paywall; one run = one charge; permanent failures refund immediately |
| `b56e099d` | Frontend — no Pro, one honest loading UI, one charge, no dead prior-gates |
| `9a8096bf` | Five regression guards (RED-before / GREEN-after) + test:ci registration |

### The locked operator decisions, all honored
- **Free is standalone.** Resume only. LinkedIn optional. Prior Resume Analysis / LinkedIn Grade are
  optional *enrichment* (reused via `readPersistedLinkedInText` when present), **never** a gate. Both
  412s and the 400 "LinkedIn PDF content is required" are deleted.
- **Free scope**: Career DNA, 3 career fields, 3 roles, 2 surprise fits, readiness score. No roadmap,
  no detailed skills gap, no salary. **Elite**: the full report.
- **Merits are the only paywall.** `usage_tracking` rows are still WRITTEN (History/analytics) —
  recorded, never blocking.
- **No Pro.** `normalizeActiveTier` applied in `analyze-career` and `CareerCompass.tsx`.
- **Truncated/incomplete JSON is never persisted as success.**

### The token/timeout ladder (they had to move together)
Raising the output budget without widening the wall would have reproduced the 408-abort bug that
quick task `260713-2ay` had just fixed for LinkedIn Grader (Free ran on `core` = a 50s wall).

```
per-call  90_000ms  (tier-config: new `career` CallType — ADDITIVE, cannot leak into `core`)
   <  server 165_000ms  (analyze-career CAREER_TOTAL_DEADLINE_MS)
   <  client 180_000ms  (CareerCompass.tsx MAX_POLL_MS)

output budget: getMaxOutput('careerCompass', tier) → free 4800 / elite 10000  (was 2500 / 3500)
CAREER_CALL_CONFIGS: base free 4800 (was 12000, which would now throw the boot invariant)
```

## Evidence

### RED-before / GREEN-after (the five new guards)
Run against the **pre-fix** source (`git checkout ed5cd5f9 -- <product files>`):

```
FAILED | 19 passed | 19 failed     ← guards correctly reject the broken code
```

Against the fixed source:

```
ok | 45 passed | 0 failed
```

| Guard | Proves |
|---|---|
| `tier-resolution.test.ts` | Elite resolves to `'elite'` on the internal/worker path; the tier stays SERVER-resolved (a userId goes in, a tier comes out — a tier is never accepted). |
| `token-budget.test.ts` | The model call receives `getMaxOutput('careerCompass', tier)`, not 2500/3500. |
| `truncation-refund.test.ts` | `stop_reason: 'max_tokens'` → terminal 422, refunded, **never persisted**. Includes the containment assertion: **no catch may map a bare `MeritRefundable` to 422**. |
| `resume-only.test.ts` | A resume-only submit has no gate left to hit. |
| `entitlement-not-retryable.test.ts` | A usage/entitlement 429 is terminal, not retried 8×. Carries a **drift guard** proving `process-resume-analysis-job` STILL treats 429 as retryable — i.e. the career-local change did not ripple. |

### Blocking gate
`npm run verify:baseline` — **GREEN**: vitest **649 passed**, edge **1340 passed / 0 failed**,
Playwright **7 passed / 2 skipped** (pre-existing quarantine). Edge went 1284 → 1340 purely from
putting guards *inside* the gate.

Pre-existing reds NOT absorbed into this task: 8 TypeScript errors in `src/components/ui/chart.tsx`
(a recharts typing issue) — confirmed present at the pre-task commit with our changes stashed.

### `_shared/` blast-radius proof (the biggest regression risk)
| File | Change | Why it cannot ripple |
|---|---|---|
| `auth.ts` | **Purely additive** — new `resolveTierForUserId()` export. `git diff` shows **zero** removed lines. | No existing symbol's behaviour changes. |
| `tier-config.ts` | Additive `career` CallType. Existing cells byte-identical: `core: 50_000`, `linkedin: 90_000` unchanged; only `career: 90_000` added. | The widened wall is reachable only via the new `career` CallType. It **cannot** leak into `core`. |
| `result-merger.ts` | Only the `CAREER_*` whitelists. | `applyCareerTierShape` is imported solely by career code. |
| `career-validation.ts` | **Comments only** (its stale premises described the RC-1/RC-2 bugs as if they were design). | Zero code change. |

`analyze-resume`, `grade-linkedin`, `recruiting-lens`, `interview-prep-*`,
`process-resume-analysis-job`, `_shared/usage-checker.ts`, `_shared/merit-gateway.ts`,
`_shared/analysis-lifecycle.ts`, `_shared/ai-retry.ts`, `_shared/career-prompts.ts`, onboarding —
**all byte-unchanged** (verified by `git diff --name-only`).

Two non-`_shared/` config files also changed and are called out here for completeness (the verifier
correctly noted the table above under-reported them):
- `src/config/pricing-config.ts` — `maxTokensOutput.careerCompass` free `12000 → 4800`.
- `src/config/pricing-config.snapshot.ts` + `src/config/__tests__/sc12-snapshot.test.ts` — the
  lockstep snapshot of that table. It must move in the same commit or the snapshot guard goes red.
  This is the guard working as designed, not a weakened assertion.

## Decisions taken during execution

- **`allowResumeOnly` cache-key disposition: KEPT** in the cache-key input set. It is now
  behaviourally a no-op (nothing branches on it), but removing it from the key would be a gratuitous
  cache-identity change and would break three further assertions for no benefit. An old client still
  sending `allowResumeOnly: true` simply keys to a different — equally valid — cache entry.

- **A latent landmine was defused.** The DORMANT lifecycle branch in `submit-career-analysis-job`
  derived its idempotency key at a hardcoded tier `'free'` — and the comment justified that *by the
  RC-1 bug*. With RC-1 fixed, flipping `ANALYSIS_LIFECYCLE_CAREER_COMPASS` would have made submit's
  key diverge from `analyze-career`'s re-derived key and charged **every Elite run twice**. Both
  sides now derive at the real tier. (Flag is still off; this is a landmine removal, not a live
  change.)

- **The dead merit branch at `analyze-career:858` was NOT resurrected.** Activating it on the worker
  path would double-charge, because `submit-career-analysis-job` already calls `withMerits`. The
  LIVE (legacy) path was made correct instead — fixing a dead code path and declaring victory was
  the trap here.

- **Rule-1 flips.** Nine guards encoded the OLD, wrong behaviour and were INVERTED, not weakened —
  they now prove the removal: `failure-branches` (412 must be ABSENT), `paid-output-validation` (the
  Free bypass must be gone), `cache.test`, `career-shape`, `history-wiring` (entitlement gate gone,
  usage still recorded), `CareerCompass.phase22` (the D-16 dialog must stay gone),
  `CareerCompass.recovery` (the nonce must be unconditional), `ver02-matrix`, `runtime-validation-convergence`.

- **Two suites were registered in `test:ci` for the first time.** `paid-output-validation.test.ts`
  and `cache.test.ts` were never in the gate, so they protected nothing — and the Task 2 rename broke
  both **invisibly**. This was caught only because the plan-checker insisted they be run explicitly.

## What I could NOT verify offline — REQUIRES DEPLOY + MANUAL TEST

**No Anthropic API key is available in this environment, so no live model call was made.** Every
claim above is proven by static analysis, unit/contract guards, and production *data* — but the
following need a real run on preview before production:

1. **The actual per-tier output token counts.** Read the `[PERF] out=` line for one Free and one
   Elite run and confirm they sit comfortably under the new caps (4800 / 10000). **If Free lands
   within ~10% of 4800, re-tune it** rather than letting it silently truncate again — that is exactly
   how RC-2 happened. Tracker: `.planning/maxtoken-tuning/TRACKER.md`.
2. **A real Elite run produces the full 7-tab report** (roadmap + skillGaps + compensation present).
3. **A real Free run with a resume ONLY** (no LinkedIn PDF, no priors) completes, and yields Career
   DNA + ≤3 fields + ≤3 roles + ≤2 surprise fits + a readiness score, with **no** roadmap/skillGaps/salary.
4. **Exactly 3 Merits deducted per run, exactly one `analysis_results` row.**
5. **Reopen via `?id=`** and via the latest-result restore renders the same result.
6. **The 90s/165s/180s ladder holds under a real generation** — the Elite budget is now 4× larger, so
   this is the first time a full Elite report is generated under the new wall.

**Zero schema change — no migration is owed by this task. Nothing was applied to production.**

## Follow-ups owed
- Right-size the Free output budget (4800) after reading the real `[PERF] out=` numbers.
- **Residual edge case (raised by the verifier, accepted):** `resolveTierForUserId` **fails closed to
  `'free'`** if the `profiles` read errors (`auth.ts:214`). During a DB blip an Elite user would be
  analyzed as Free while still being charged. The Merit cost is flat across tiers (3/3), so there is
  no *overcharge* — and failing closed is strictly better than RC-1, which did this for **every**
  user on **every** run. But it is silent apart from a `warn` log. Worth either retrying the read or
  surfacing it as a retryable failure rather than degrading the output quietly.
- Production has **6 Elite and 9 `pro` rows** whose stored `raw_response` is a truncated Free-shaped
  stub from the regression window. They will render via `PartialSectionFallback`. Consider whether
  those users should be offered a free re-run (a data decision, not a code one).
- The worker's `fetch` to `analyze-career` still has no `AbortSignal`, and jobs run sequentially with
  `batchSize` 2 — so a full batch is ~330s of worker wall-clock under the new 165s deadline. Accepted
  as pre-existing and matching the shipped `grade-linkedin` precedent (ED-8), but worth revisiting.
