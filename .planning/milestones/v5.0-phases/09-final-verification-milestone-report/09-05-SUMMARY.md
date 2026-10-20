---
phase: 09-final-verification-milestone-report
plan: 05
subsystem: edge-function-tests
tags: [ver-02, recruiting-lens, grade-linkedin, idempotency, refund-boundary, validation-convergence, cors, d-11-path-a]

# Dependency graph
requires:
  - phase: 09-final-verification-milestone-report
    plan: 01
    provides: src/test/coverage/ver02-matrix.test.ts — the machine-generated gap list that is this plan's work order
provides:
  - "recruiting-lens/__tests__/idempotency-repeated-run.test.ts — S-01a / S-01b / S-08 (+ S-15 / S-18) for recruiting_lens"
  - "recruiting-lens/__tests__/runtime-validation-convergence.test.ts — S-12 / S-13 / S-14 (+ S-10 / S-11 routing) for recruiting_lens, D-11 Path A"
  - "recruiting-lens/__tests__/refund-after-save.test.ts — S-19 for recruiting_lens"
  - "grade-linkedin/__tests__/cors-matrix.test.ts — S-23 for linkedin"
  - "FINDING 09-05-F1: a live refund-after-save defect in the RCL LEGACY path (deferred-items.md D9-02) — carried to VER-05"
affects: [09-08, 09-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "D-11 Path A: malformed-model-output classes are proven at the VALIDATION BOUNDARY by driving the real seam directly — never by adding a fault-injection branch to a production code path during a verification phase"
    - "Identity tests rebuild the REAL inputIdentity with the REAL shared primitives (computeCacheKey/sha256Hex + deriveIdempotencyKey), so a change to either primitive turns the guard RED — a literal stand-in identity would not"
    - "Anti-strawman positive control: every convergence suite proves a REAL success body (and the REAL tier-shaped subset) converges ok:true through the same seam the handler threads — the 04-GAP-01 lesson"
    - "Report-don't-patch: a RED finding in a verification phase is surfaced as a finding + a containment assertion that pins the ROUTING (stays true after the fix), never an assertion that pins the defect"

key-files:
  created:
    - supabase/functions/recruiting-lens/__tests__/idempotency-repeated-run.test.ts
    - supabase/functions/recruiting-lens/__tests__/runtime-validation-convergence.test.ts
    - supabase/functions/recruiting-lens/__tests__/refund-after-save.test.ts
    - supabase/functions/grade-linkedin/__tests__/cors-matrix.test.ts
  modified:
    - .planning/phases/09-final-verification-milestone-report/deferred-items.md

key-decisions:
  - "FINDING 09-05-F1 reported, NOT patched: recruiting-lens/index.ts:116-122 still throws MeritRefundable AFTER its durable analysis_results insert (the pre-Fix-2 shape Phase 02 removed from the other three features). The plan forbids touching index.ts (3 acceptance criteria + threat T-09-05-A) and explicitly directs 'report it rather than editing the handler'. Fixed scope: containment locked by test, defect carried to VER-05."
  - "The refund-after-save guard is scoped to the MIGRATED lifecycle save() — the path D-02 flips first — rather than making a global claim about index.ts that is currently FALSE on the legacy branches. A green global claim would have been the coverage theatre this phase exists to eliminate."
  - "S-10/S-11 for RCL asserted as a per-feature ROUTING claim (RCL's status-bearing MeritRefundable -> classifyFailure -> retryable MODEL_TIMEOUT/MODEL_RATE_LIMITED), not a re-test of the classifier (D-09 forbids re-proving a one-branch shared seam per feature)."
  - "Zero production code changed. git diff --stat over _shared/anthropic.ts, recruiting-lens/index.ts, grade-linkedin/index.ts and deno.json is EMPTY across all three commits."

# Metrics
duration: 38min
tasks: 3
files: 5
completed: 2026-07-11
---

# Phase 09 Plan 05: Recruiting Lens + LinkedIn VER-02 Gap Closure Summary

Closed the highest-priority VER-02 gap cluster with 75 new deterministic Deno tests across four files — Recruiting Lens (the thinnest matrix column, and the first feature D-02 flips on production) now has the idempotency, validation-convergence and refund-boundary proof every other migrated feature has, and grade-linkedin gets the behavioral per-feature CORS matrix it was missing — while changing zero production code and surfacing one live money-path defect (FINDING 09-05-F1).

## What Shipped

| Task | File | Tests | Gap cells closed |
|---|---|---|---|
| 1 | `supabase/functions/recruiting-lens/__tests__/idempotency-repeated-run.test.ts` | 11 | S-01a, S-01b, S-08 (x recruiting_lens) |
| 1 | `supabase/functions/recruiting-lens/__tests__/refund-after-save.test.ts` | 9 | S-19 (x recruiting_lens) |
| 2 | `supabase/functions/recruiting-lens/__tests__/runtime-validation-convergence.test.ts` | 18 | S-12, S-13 (x recruiting_lens) |
| 3 | `supabase/functions/grade-linkedin/__tests__/cors-matrix.test.ts` | 37 | S-23 (x linkedin) |

That is the complete 09-05 slice of the machine-generated gap list emitted by `src/test/coverage/ver02-matrix.test.ts` assertion 4 (7 cells: S-01a/RCL, S-01b/RCL, S-08/RCL, S-12/RCL, S-13/RCL, S-19/RCL, S-23/linkedin).

## Cited Seams (the plan required these to be named, not guessed)

**RCL `inputIdentity` (Task 1).** `recruiting-lens/index.ts:592` threads `inputIdentity: cacheKey`, where `cacheKey` comes from `buildRecruitingLensCacheKey` (index.ts:307-334) = `computeCacheKey` over `{resumeSummary_hash, jobDescription_hash, linkedinText_hash, company, role_title}` — pure request content. **No save-mutated field is reachable** (no `analysis_id`, no `analyzed_at`, no `raw_response`); test `FEAT-06 (1d)` asserts that statically over the builder's body, so the Pitfall-8 regression is guarded at its source, not just in a fixture. `attemptNonce` is index.ts:577 (client per-submit nonce, fail-closed to a fresh UUID). The suite rebuilds this identity with the REAL `computeCacheKey`/`sha256Hex` and feeds it through the REAL `deriveIdempotencyKey`.

**RCL validation seam (Task 2).** `recruiting-lens/index.ts:629` passes `schema: recruitingLensOutputSchema` into `runAnalysisLifecycle`, whose `validating_output` step is the single call **`validateModelOutput(raw, params.schema, params.validationOpts)` at `_shared/analysis-lifecycle.ts:326`**. RCL supplies no `semanticCheck`. That is the seam the suite drives, and test `FEAT-06: recruiting-lens/index.ts threads recruitingLensOutputSchema into the runAnalysisLifecycle validation seam` pins the wiring so the test cannot drift into a strawman (the 04-GAP-01 lesson).

**Positive control (Task 2).** A real merged Elite output AND the real Pro subset produced by running `applyRecruitingLensTierShape` both converge `ok:true` through that seam, byte-faithfully. This is what proves the suite drives the live validator.

## Fail-RED Demonstration (required by acceptance criteria)

Temporarily injected the post-save throw into the lifecycle `save()` (the exact F1 shape):

```ts
if (!usageResult.ok) {
  log.error('usage-tracking-insert-failed', { error: usageResult.error });
  throw new MeritRefundable(500, 'Could not record Recruiting Lens usage.');  // injected
}
```

Result: `refund-after-save.test.ts` went **RED on 2 assertions** (`FEAT-06: the lifecycle save() has EXACTLY ONE MeritRefundable throw…` and `FEAT-06: no post-save usage-write FAILURE branch throws MeritRefundable…`), 7 passed. Reverted with `git checkout --`; `git diff --stat supabase/functions/recruiting-lens/index.ts` is empty. The guard genuinely fails if a refund-after-save regression is introduced on the migrated path.

## Deviations from Plan

### Finding, not a deviation of scope — FINDING 09-05-F1 (the plan's premise met reality)

The plan's must-have truth *"Recruiting Lens never refunds after a durable save"* is **FALSE on the legacy branches today.**

`persistRecruitingLensResult` (`recruiting-lens/index.ts:62-125`) still carries the pre-Fix-2 shape: after the durable `analysis_results` insert **succeeds** (index.ts:77-104), a failing `recordUsageWithAnalysis` throws `MeritRefundable(500, 'Could not record Recruiting Lens usage.')` (index.ts:116-122). This is the identical defect Phase 02 · 02-05 "Fix 2" removed from analyze-resume, analyze-career and grade-linkedin — RCL was missed.

| Flag state | Path | Consequence |
|---|---|---|
| `MERIT_SYSTEM_ENABLED=false` (today) | pure-legacy, index.ts:883 | 500s a **saved + cached** analysis. No refund (no merits deducted), but the user is told it failed while it sits in History. |
| `MERIT=true` + lifecycle RCL **OFF** | `withMerits` legacy, index.ts:764 | **True refund-after-save**: refunds a delivered, cached analysis (double benefit) + a 500. |
| `MERIT=true` + lifecycle RCL **ON** (D-02 target) | lifecycle `save()`, index.ts:690-693 | **CORRECT** — log-and-continue. Helper never reached. |

The middle row is exactly the state RCL passes through **during a D-02 flip**, and RCL is the first feature flipped.

**Why not auto-fixed (Rule 1 would normally apply):** the plan forbids it in three separate acceptance criteria (`git diff --stat supabase/functions/recruiting-lens/index.ts` must be EMPTY) plus threat T-09-05-A ("a verification phase must not modify a production code path"), and Task 3 states the disposition verbatim: *"If the test goes RED, that is a real finding — report it rather than editing the handler to make the test pass."* Patching would also have shipped an unreviewed money-path change inside a coverage commit.

**What was done instead:**
1. The refund guard asserts the invariant **where it genuinely holds** — the migrated lifecycle `save()` (the D-02 path): exactly one `MeritRefundable` throw, lexically between the insert call and the usage write (i.e. pre-durable); post-save usage write is log-and-continue with the operator log retained; post-save side-writes (application auto-create, History cache) are non-fatal.
2. `FEAT-06 [F1]: the migrated lifecycle save() never calls persistRecruitingLensResult (the legacy post-save-throw helper)` **locks the containment**. It pins the ROUTING, so it stays true after F1 is fixed — no assertion in this repo pins the defect as desirable.
3. Logged as **D9-02 / FINDING 09-05-F1** in `deferred-items.md` with the 3-line fix (mirror the Phase-02 Fix 2: drop the throw, keep the `usage-tracking-insert-failed` log line, fall through) and the follow-up (flip `[F1]` into grade-linkedin's absolute `assertEquals(source.includes('Could not record Recruiting Lens usage.'), false)`).

**Recommended:** resolve F1 **before** D-02 flips Recruiting Lens on production.

### No CORS regression found

Task 3 warned a RED `grade-linkedin/cors-matrix.test.ts` would be a genuine defect. It is **green on the first run** — 37/37, including the Pitfall-7 thrown-401 case and fail-closed for an unapproved origin. The shared wrapper holds; `grade-linkedin/index.ts` carries no hand-rolled `Access-Control-Allow-Origin` literal.

### Auto-fixed issues

None. Zero production code changed; no Rule 1/2/3 fixes were needed.

## Verbatim `Deno.test` Titles for 09-08 Registry Mapping

A rename turns the registry cell RED — these are the exact inner title strings on disk. Unicode arrows (→) and em-dashes (—) are literal.

**`supabase/functions/recruiting-lens/__tests__/idempotency-repeated-run.test.ts`**
- `FEAT-06 (1a): the same attemptNonce re-derives the SAME key (accidental resubmit → one deduction)`  **[S-01a]**
- `FEAT-06 (1b): the derived key is a stable 64-char lowercase hex digest`
- `FEAT-06 (1c): a save-mutated field cannot shift the key — stable inputIdentity → stable key (Pitfall 8)`  **[S-08]**
- `FEAT-06 (1d): the RCL inputIdentity is the content-hashed cacheKey (no save-mutated field is reachable)`  **[S-08]**
- `FEAT-06 (2a): a fresh attemptNonce derives a DIFFERENT key (deliberate new run)`  **[S-01b]**
- `FEAT-06 (2b): the same content re-analyzed on a new nonce keys ONLY on the nonce (History preserved)`  **[S-01b]**
- `FEAT-06 (2c): tier is part of the identity — the same content on a different tier keys separately`  **[S-08]**
- `FEAT-06 (2d): a different job description is a different run (the JD is part of the identity)`
- `FEAT-06 (3a): a save-throw routes to refund + retryable_failed BEFORE the point of no return`  **[S-15]**
- `FEAT-06 (3b): the merit is SETTLED only at/after the saving -> completed CAS (no settle on save-throw)`  **[S-18]**
- `FEAT-06 (3c): NO refund is reachable after the point of no return (Pitfall 2)`

**`supabase/functions/recruiting-lens/__tests__/refund-after-save.test.ts`**
- `FEAT-06 [KEEP]: the pre-save throw (before the analysis_results row is durable) is preserved byte-identical`
- `FEAT-06 [KEEP]: the pre-save model-failure throws (all-overloaded 529 / all-calls-failed 500) remain refundable`
- `FEAT-06: the lifecycle save() has EXACTLY ONE MeritRefundable throw and it is the pre-save insert failure`  **[S-19]**
- `FEAT-06: no post-save usage-write FAILURE branch throws MeritRefundable (a delivered analysis is never refunded)`  **[S-19]**
- `FEAT-06: the post-save usage-write failure still LOGS (log-and-continue, not silent)`
- `FEAT-06: the post-save best-effort side-writes (application auto-create, History cache) are non-fatal`
- `FEAT-06 [F1]: the migrated lifecycle save() never calls persistRecruitingLensResult (the legacy post-save-throw helper)`
- `FEAT-06: RCL routes its money path through runAnalysisLifecycle (inherits the Pitfall-2 boundary)`
- `FEAT-06: NO refundMeritsForJob / MeritRefundable is reachable after the saving -> completed CAS (Pitfall 2)`  **[S-19]**

**`supabase/functions/recruiting-lens/__tests__/runtime-validation-convergence.test.ts`**
- `FEAT-06: a real merged Elite result converges (ok) through validateModelOutput — the seam the lifecycle drives`
- `FEAT-06: convergence is BYTE-FAITHFUL — the validated value deep-equals the merged object`
- `FEAT-06: the REAL Pro tier-shaped subset also converges (the shaper cannot be validated away)`
- `FEAT-06: garbage (non-JSON) output → MODEL_INVALID_RESPONSE`  **[S-12]**
- `FEAT-06: empty model output → MODEL_INVALID_RESPONSE (never a substituted body)`  **[S-12]**
- `FEAT-06: an empty object {} → MODEL_INVALID_RESPONSE (empty/generic)`  **[S-12]**
- `FEAT-06: a TRUNCATED (clipped) body → MODEL_OUTPUT_TRUNCATED (rejected, never repaired-and-accepted)`  **[S-13]**
- `FEAT-06: a body clipped mid-string is NOT silently completed into an accepted result`  **[S-13]**
- `FEAT-06: missing overallMatch.score → SCHEMA_VALIDATION_FAILED`  **[S-14]**
- `FEAT-06: an out-of-range overallMatch.score → SCHEMA_VALIDATION_FAILED (never a clamped score)`  **[S-14]**
- `FEAT-06: an empty topGaps array → SCHEMA_VALIDATION_FAILED (min(1) non-empty guard)`  **[S-14]**
- `FEAT-06: a missing recruiterVerdict → SCHEMA_VALIDATION_FAILED (the product headline is never fabricated)`  **[S-14]**
- `FEAT-06: a half-generated strategicAdvice (present but missing summary) → SCHEMA_VALIDATION_FAILED`  **[S-14]**
- `FEAT-06: recruiting-lens/index.ts threads recruitingLensOutputSchema into the runAnalysisLifecycle validation seam`
- `FEAT-06: a 408 provider timeout on the RCL path classifies as MODEL_TIMEOUT / retryable (S-10)`  **[S-10]**
- `FEAT-06: a 429 provider rate-limit on the RCL path classifies as MODEL_RATE_LIMITED / retryable (S-11)`  **[S-11]**
- `FEAT-06: the RCL all-overloaded 529 throw classifies as retryable (the Merit is returned, not burned)`
- `FEAT-06: a VALIDATION failure is PERMANENT — never auto-retried into a second charge (LIFE-06)`

**`supabase/functions/grade-linkedin/__tests__/cors-matrix.test.ts`** (37 tests; 4 templated loops + 3 singles)
- Templated: `` FEAT-04 [${origin}] status ${status} (handler return) carries ACAO + Vary: Origin `` — origins `https://strivoai.net` / `https://www.strivoai.net`, statuses 200/401/402/403/429/500
- Templated: `` FEAT-04 [${origin}] status ${status} (jsonError envelope) carries ACAO + Vary: Origin ``
- Per origin: `` FEAT-04 [${origin}] a 401 THROWN by auth still carries ACAO + Vary (Pitfall 7) ``  **[S-23 — the load-bearing one]**
- Per origin: `` FEAT-04 [${origin}] OPTIONS preflight echoes ACAO + Vary ``
- Templated: `` FEAT-04 [evil] status ${status} is fail-closed (no ACAO) but keeps Vary ``
- `FEAT-04 [evil] a jsonError to an evil origin is fail-closed (no ACAO)`
- `FEAT-04 [evil] an OPTIONS preflight from an evil origin is fail-closed (never a wildcard)`
- `FEAT-04: grade-linkedin/index.ts routes through withCors(req, 'user', …)`  **[S-23 — the static anchor 09-08 should map]**

> **09-08 note:** these files are NOT registered in `supabase/functions/deno.json` `test:ci`. Plan 09-08 owns that registration (three wave-2 plans would have collided on the file); `git diff --stat supabase/functions/deno.json` is EMPTY here, as required.

## Verification

```
cd supabase/functions
deno test --allow-all --no-check recruiting-lens/__tests__/ grade-linkedin/__tests__/cors-matrix.test.ts
→ ok | 111 passed | 0 failed
```

- The four new files alone: **75 tests, 0 failed** (11 idempotency + 9 refund-after-save + 18 convergence = 38 RCL, plus 37 grade-linkedin CORS). The 111 figure additionally sweeps RCL's pre-existing `__tests__/cors-matrix.test.ts`.
- `npx vitest run src/test/security/phase9-pii-guard.test.ts` → **18 passed** (09-02 gate green; no real-person markers in the new fixtures).
- **Production-diff guard:** `git diff --stat HEAD~3 HEAD -- supabase/functions/_shared/anthropic.ts supabase/functions/recruiting-lens/index.ts supabase/functions/grade-linkedin/index.ts supabase/functions/deno.json` → **EMPTY**. The three commits touch only the four new test files.
- `src/test/coverage/ver02-matrix.test.ts` remains intentionally RED (09-01 by design; 09-08 closes it). Not weakened, not touched.

## Self-Check: PASSED
