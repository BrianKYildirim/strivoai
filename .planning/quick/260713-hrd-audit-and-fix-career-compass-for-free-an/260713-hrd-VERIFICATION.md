---
phase: quick-260713-hrd
verified: 2026-07-13T00:00:00Z
status: human_needed
score: 13/13 must-haves verified statically (6 require a live Anthropic run to close)
re_verification: false
human_verification:
  - test: "Read the [PERF] out= line for one Free and one Elite run on preview."
    expected: "Free output sits comfortably under 4800; Elite under 10000. If Free lands within ~10% of 4800, re-tune — that margin is how RC-2 happened."
    why_human: "Requires a real Anthropic call. No API key in this environment; actual per-tier output token counts CANNOT be asserted offline."
  - test: "Run a real Elite Career Compass analysis."
    expected: "Full 7-tab report: roadmap + skillGaps + compensationIntelligence all present."
    why_human: "External service (Anthropic) + real DB. Only the tier/budget/whitelist WIRING is provable offline."
  - test: "Run a real Free analysis with a resume ONLY (no LinkedIn PDF, no prior Resume Analysis, no prior LinkedIn Grade)."
    expected: "Completes. Career DNA + <=3 fields + <=3 roles + <=2 surprise fits + readiness score. NO roadmap/skillGaps/salary."
    why_human: "End-to-end runtime behavior; the gate removal is proven statically but the successful generation is not."
  - test: "Check merit_transactions + analysis_results after one deliberate run, then after a double-click resubmit."
    expected: "Exactly 3 merits deducted, exactly one analysis_results row. Resubmit replays the same idempotency key (already_deducted), no second charge."
    why_human: "Requires real DB + the check_and_deduct_merits RPC. Idempotency key derivation is verified statically; the RPC dedupe behavior is not exercised offline."
  - test: "Force a terminal failure (e.g. truncation) and inspect the refund."
    expected: "Merit refunded exactly once; no double-refund; job goes terminal on the FIRST response, not after 8 attempts."
    why_human: "Runtime money path against the live worker."
  - test: "Reopen a completed analysis via ?id= and via the latest-result restore."
    expected: "Both render the same result."
    why_human: "Runtime persistence/hydration."
---

# Quick Task 260713-hrd: Career Compass (Free + Elite) — Verification Report

**Goal:** Audit and fix Career Compass for Free and Elite — tier resolution, token budgets,
entitlement, merit charging/refunds, duplicate calls/charges, loading/error honesty, persistence.
**Verified:** 2026-07-13
**Status:** human_needed (all offline-provable checks PASS; 6 items need a live Anthropic run)
**Re-verification:** No — initial verification

## Headline

I could not find an overclaim in the SUMMARY. Every load-bearing number it cites, I
reproduced independently — including the RED-before proof, which I re-ran myself against
the pre-fix source rather than taking it on trust. The single highest-risk regression
(a bare `MeritRefundable` being swept into a terminal 422) **did not happen**.

The SUMMARY is also honest about its own limits: it explicitly lists the per-tier output
token counts as NOT verified. That is the correct call and I am not overriding it.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Elite queued run analyzed at tier `elite`, not `free` | ✓ VERIFIED | `analyze-career:999` `resolvedTier = await resolveTierForUserId(effectiveUserId)` when userContext is null. `auth.ts:202` returns `Promise<'free'\|'elite'>` from `profiles.subscription_tier` under the service client + admin elevation. |
| 2 | Model call receives `getMaxOutput('careerCompass', tier)`, never 2500/3500 | ✓ VERIFIED (config) / ? RUNTIME | `maxTokens: maxTokensForAnalysis` at **:1919 and :1989** (both live call sites). Only surviving `2500\|3500` match is a comment at :1826. Actual token *consumption* needs a live run. |
| 3 | Truncated / incomplete output = terminal, refunded, NEVER persisted, at any tier | ✓ VERIFIED | `isTruncatedResponse(raw.stop_reason==='max_tokens')` checked at **:1411 and :1986 — before parse/persist**, returning 422 `{retryable:false}`. `assertCareerOutputComplete` runs for every tier (the `tier==='free'` early-return is gone). |
| 4 | Transient `MeritRefundable(500)` KEEPS retryable 5xx — only completeness maps to 422 | ✓ VERIFIED | **The critical one.** Both catch sites (:1448 and :2034) wrap *exactly one* call and name *exactly one* type: `if (completenessError instanceof CareerIncompleteOutput) → 422; throw completenessError`. No `catch (e) { if (e instanceof MeritRefundable) return 422 }` exists anywhere. |
| 5 | Free user with ONLY a resume gets a complete result | ✓ VERIFIED (static) | The 400 `"LinkedIn PDF content is required"` string is **gone from the repo**. Both 412 gates deleted (:1081-1090); the only "412" hits are comments. Resume remains the one legitimate input gate. |
| 6 | Free = DNA/3 fields/3 roles/2 surprise fits/readiness; NO roadmap/roleRoadmaps/skillGaps/comp | ✓ VERIFIED | `roadmap` + `roleRoadmaps` **moved out of** `CAREER_FREE_ALLOWED_FIELDS` into `CAREER_PRO_ADDITIONS` (result-merger:109-122). `applyCareerCompassFreeOutputPolicy` slices fields→3, surpriseFits→2. |
| 7 | Saved `pro` user gets Elite on server AND client; nothing gates on literal `'elite'` | ✓ VERIFIED | Server: `resolveTierForUserId` is *typed* `'free'\|'elite'` — structurally cannot emit `pro`. Client: `CareerCompass.tsx:230` `subscriptionTier = normalizeActiveTier(...)`, so the `=== "elite"` tab checks at :1192+ compare the **already-normalized** value. `normalizeActiveTier` maps `pro→elite`. |
| 8 | Merits are the only paywall; usage_tracking still RECORDS | ✓ VERIFIED | `can_perform_ai_action` / `checkEntitlement` / `createUsageLimitResponse` appear **nowhere** in the career functions (one comment at :1511 marks the removal). `recordUsageWithAnalysis` still called in `persistCareerResultAndRecordUsage` (:471), non-blocking. |
| 9 | Entitlement/usage 429 never retried 8× | ✓ VERIFIED | `isExplicitlyPermanent()` (process-career:34) overrides the status heuristic on `retryable===false` / `usage_limit_reached` / `output_truncated` / `incomplete_output`. 422 is outside `isRetryableHttpStatus` (503/529/408/409/425/429/5xx). |
| 10 | One run = one charge (server key AND client nonce — both required) | ✓ VERIFIED (static) | **Server:** the LIVE (non-lifecycle) `withMerits` at submit:320 now carries `idempotencyKey: liveIdempotencyKey`, derived at :312 from the **server-resolved** `authenticatedUserCtxCareer.tier`. **Client:** `attemptNonceRef` (CareerCompass:219) is minted once and **held**; it is NOT cleared on the timeout branch, so a resubmit re-keys to the same deduction. |
| 11 | Every terminal failure refunds exactly once | ✓ VERIFIED (static) | `refundMeritsForJob(userId, txId, reason)` fires BEFORE the row flips to `status='failed'`; `refund-already-refunded` is a guarded no-op. Terminal-on-first-response now guaranteed by #9. |
| 12 | Exactly ONE loading UI; never a fabricated "refunded" message | ✓ VERIFIED | `UniversalAnalyzing` is the single surface (the duplicate inline step-list is gone). The old `settle.rollback()` + fake 408 toast is **replaced** (:813-839) by: recover-a-landed-result → else `invalidateMerits()` + an honest "Still running" toast. The word "refunded" is only used at :789, where the server genuinely refunded. |
| 13 | Persists to analysis_results; reopens via `?id=` and latest-restore; one row per run | ✓ VERIFIED (static) | `?id=` (:383) and `hydrateLatestCareerResult` (:463) both read the pinned `analysis_results.raw_response`. The 4 `persistCareerResultAndRecordUsage` call sites are on mutually-exclusive branches; only :2164 (legacy live tail) is reachable today. Guarded by `worker-two-writer` + `history-wiring`. |

**Score:** 13/13 truths verified to the maximum extent provable offline.

### Key Links

| From | To | Status | Detail |
|------|----|--------|--------|
| analyze-career | `auth.ts::resolveTierForUserId` | ✓ WIRED | imported :11, called :999 |
| analyze-career | `getMaxOutput` → **maxTokens argument** | ✓ WIRED | `maxTokens: maxTokensForAnalysis` :1919, :1989 (the discriminating marker, not a bare `getMaxOutput` grep) |
| analyze-career | `ai-retry::invokeWithRetry` | ✓ WIRED | imported :12, called :1914 |
| analyze-career | `raw.stop_reason` | ✓ WIRED | :211, checked :1411 + :1986 pre-persist |
| analyze-career | `CareerIncompleteOutput → 422` | ✓ WIRED | narrow catch, :1448 + :2034 |
| submit-career | `merit-gateway::withMerits` idempotencyKey | ✓ WIRED | LIVE path :320-325 |
| CareerCompass.tsx | `normalizeActiveTier` | ✓ WIRED | imported :21, applied :230 |

> Note: `gsd-tools verify key-links` reported 4/7 failing. Three were **tool artifacts** (an
> over-escaped `\\(` regex) and one (`maxTokens:\s*maxTokensForAnalysis`) was a false negative —
> the pattern is present twice. All 7 links hold under manual verification.

## Item-by-item against the brief

**1. LOCKED decisions** — all hold. Free standalone (no 400, no 412), Free scope narrowed,
live-path tier resolution fixed, hardcoded 2500/3500 replaced, truncation never persisted,
Merits-only paywall with usage_tracking still recording, no Pro.

**2. D-14 (server-resolved tier)** — **HOLDS.** `rg 'body\.tier|rawBody\.tier|requestBody\.tier|payload\.tier'`
across all three career functions returns **zero hits**. The worker payload explicitly carries no
`tier` field (submit:335-337). A userId goes in; a tier comes out.

**3. Narrow 422 (highest risk)** — **NO REGRESSION.** Verified by reading both catch blocks, not
by trusting the comment above them. `persistCareerResultAndRecordUsage` (:468) and the DOCX/OCR
helpers (:1294, :1297, :1335) all still throw `MeritRefundable(500)` and all still land as
retryable 5xx. A transient DB save blip does **not** become a terminal refunded failure.

**4. Money path** — both halves present (server key + held client nonce). No double-charge or
double-refund path introduced. Runtime RPC dedupe still needs a live check.

**5. Blast radius** — **CLEAN.** `git diff --name-only ed5cd5f9..HEAD` confirms all 10 protected
targets are byte-unchanged: analyze-resume, grade-linkedin, recruiting-lens, interview-prep-*,
process-resume-analysis-job, `_shared/`{usage-checker, merit-gateway, analysis-lifecycle, ai-retry,
career-prompts}, onboarding. The 4 changed `_shared/` files, verified independently:
- `auth.ts` — **zero removed lines** (confirmed by diffing for `^-`). Purely additive.
- `tier-config.ts` — `core: 50_000` and `linkedin: 90_000` byte-identical; only `career: 90_000`
  added + the CallType union extended. The widened wall is reachable **only** via the new
  `career` CallType; it cannot leak into `core`.
- `result-merger.ts` — `CAREER_*` whitelists only; consumed solely by career code.
- `career-validation.ts` — **comments only** (verified by filtering the diff to non-comment lines).

**6. Boot invariant** — **DOES NOT THROW.** free `4800 + 0 = 4800` vs ceiling `4800`; the guard is
`sum > ceiling` (strict), so 4800 passes. Elite `8000 + 2000 = 10000` vs `10000` passes. Proven
empirically too: every suite that imports the module loads it successfully.

**7. RED-before proof — RE-RAN INDEPENDENTLY.** I reverted the 9 product files to `ed5cd5f9`
(keeping guards + deno.json at HEAD), ran the five guards, and reproduced **`FAILED | 19 passed |
19 failed`** — exactly the SUMMARY's number. Every one of the five guards fails at least one test
against pre-fix source (tier-resolution 1, token-budget 7, truncation-refund 6, resume-only 3,
entitlement-not-retryable 2) — so no guard is vacuous. Restored with `git checkout HEAD --`;
**tree is clean** (only the untracked SUMMARY.md remains).

**8. `npm run verify:baseline` — GREEN**, reproduced:
- vitest **649 passed / 0 failed** (98 files)
- edge **1340 passed / 0 failed** (12 ignored)
- Playwright **7 passed** / 2 skipped
All five new guards + the two previously-unregistered suites (`paid-output-validation`, `cache.test`)
are genuinely registered in `deno.json` `test:ci` — confirmed by reading the task string.

## Anti-Patterns

Scanned all changed product files for TODO/FIXME/XXX/HACK/PLACEHOLDER/"not implemented": **none found.**

| File | Line | Issue | Severity |
|------|------|-------|----------|
| `analyze-career/index.ts` | 1029 | ℹ️ **Stale comment.** Still says "Short-circuits with 412 BEFORE withMerits" in the present tense, above `isFreeSingleCallPath`. The 412s are deleted (:1081-1090 documents this). Misleading only — no live 412 Response is constructed anywhere. Inconsistent with this task's own comment-cleanup of `career-validation.ts`. | Info |

## Observations (not gaps)

1. **`resolveTierForUserId` fails CLOSED to `'free'` on a `profiles` read error** (auth.ts:214-217).
   During a transient DB blip an Elite user would be analyzed as Free while still charged 3 merits.
   Merit cost is flat (3/3) so there is no *overcharge*, and this is strictly better than RC-1 (where
   it was 100% of runs) — but it is a real residual edge case, and it is silent apart from an
   `internal-tier-resolution-failed` warn.
2. **The `pro` timeout row in tier-config has no `career` cell** (`pro: { core, elite-preview }`).
   Unreachable, because `resolveTierForUserId` is typed to never return `'pro'`. Harmless today;
   would matter only if Pro were ever reactivated.
3. **SUMMARY completeness (minor).** Its blast-radius table covers the 4 `_shared/` files but does
   not call out that `src/config/pricing-config.snapshot.ts` also changed. I checked it: the diff
   touches **only** `careerCompass free 12000→4800` and the derived `free` tier-sum `33000→25800`,
   with a lockstep-rationale comment. Legitimate, not a weakened guard — but it is a product-adjacent
   file that the SUMMARY's own framing implies was untouched.
4. **Process smell.** The SUMMARY's frontmatter self-asserts `verification: passed` — written by the
   implementer before any independent verification ran. Harmless here (it happens to be right), but
   it is exactly the kind of claim this step exists to not trust.

## Gaps Summary

**No gaps blocking goal achievement.** Every defect named in CONTEXT.md (RC-1 … RC-7) is closed in
the actual codebase, the LOCKED operator decisions all hold, the blast radius is genuinely clean,
the RED-before proof is real, and the blocking gate is green.

Status is `human_needed` rather than `passed` for one honest reason: **no Anthropic API key exists
in this environment, so not a single live model call was made.** The per-tier output token counts
are therefore **NOT verified** — the budget is proven *wired*, not proven *sufficient*. Free's 4800
cap has only ~48% of Elite's headroom against a schema whose complete instances were measured at
~2,200–3,041 tokens; that is adequate on paper but it is precisely the margin whose miscalculation
caused RC-2. Read `[PERF] out=` on a real Free run before this ships to production.

---

_Verified: 2026-07-13_
_Verifier: Claude (gsd-verifier)_
