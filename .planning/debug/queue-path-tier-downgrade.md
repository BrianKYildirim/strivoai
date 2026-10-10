---
slug: queue-path-tier-downgrade
status: fix-implemented
severity: high
created: 2026-07-18
component: supabase/functions (analyze-resume, submit/process-resume-analysis-job)
affects: all paid (Pro/Elite) users routed through the async resume-analysis queue
related:
  - quick-260718-j2x (onboarding entitlement-freshness — DIFFERENT layer, already on main)
  - .planning/debug/onboarding-analysis-undefined.md
---

# Debug: Resume-analysis queue/worker path silently downgrades paid users to free

## Symptom

Elite user runs onboarding resume analysis; receives a FREE-depth analysis (1 priority
improvement, 1 rewrite suggestion, no locked sections) but is charged their real tier's
merits. UI shows Elite chrome (no paywalls) because the live profile IS Elite. Reported as
"free tier but no paywalls," indistinguishable from the earlier onboarding-freshness symptom
but a DIFFERENT root cause.

## Reproduction (production evidence)

Account: `yildirimkbrian@gmail.com` / id `5ca1f488-b305-4815-b6c2-cd5566bf8fcc`
Prod ref: `zjpjapgraoxdukdvpjes` (read-only MCP).

| Time (UTC) | Event | Tier observed |
|-----------|-------|---------------|
| 22:30:45 | signup, 10 merits granted | free |
| 22:31:32 | admin merit adjustment +140 → balance 150 | — |
| 22:35:08 | resumes row created (onboarding Finish) | — |
| 22:35:21 | profiles.subscription_tier → **elite** (admin panel) | — |
| 22:35:39 | analysis_jobs row created, payload = `{resumeId}` ONLY (no tier) | — |
| 22:35:40 | merit_transactions: `-3 subscription / feature-deduct / resume_analysis`, metadata `tier:"elite"` | **elite** (charged) |
| 22:36:13 | resumes.grading_data written, `_mergeSource:"free-single"`, score 78, 1 priorityImprovement, 1 rewriteSuggestion | **free** (generated) |

- profiles: single clean row, subscription_tier=elite, NO duplicate/orphan (delete→recreate
  did not leave a stale row; "upgrade hit wrong row" hypothesis REFUTED).
- `check_and_deduct_merits` (live prod def) charges/records exactly `p_tier` passed by the
  caller; it does NOT re-read profiles. So metadata `tier:"elite"` ⇒ caller passed elite.

## Root cause (CONFIRMED) — TWO independent defects

### RC-A · Onboarding lifecycle closure HARDCODED free (the operator's staging symptom)

`analyze-resume/index.ts` `origin:'onboarding'` lifecycle path: the `generate` closure ran
under the user's JWT (`userContext` non-null, `resolvedTier` = elite) but was **hardcoded** to
`executeFreeAnalysis` with `promptParams { isElite:false, tier:'free' }`, and `save` recorded
`tier:'free' / MERIT_COST.free` — while `ctx.tier: resolvedTier` charged the run at the REAL
(elite) tier. Net: **elite charge + free-depth analysis** for Elite users onboarding through the
lifecycle path. This is the operator-reported staging repro (frontend AWAITS the invoke →
"Setting up..." screen; free output; elite chrome/no paywalls because the live profile IS elite).
Independent of the admin-panel/internal-worker repro below.

### RC-B · Internal-worker branch defaulted free (the production admin-panel repro)

The async queue path does not carry an authoritative tier to the analysis, and
`analyze-resume`'s internal-auth branch defaults tier to `'free'`:

1. `submit-resume-analysis-job/index.ts:54,116` — reads `tier` from CLIENT `body.tier`
   (default `"free"`) and stores THAT in the job payload. The merit DEDUCTION correctly uses
   `authenticatedUserCtx.tier` (authoritative server read = elite), so the charge is right —
   but the payload tier is client-controlled / wrong / absent.
2. `process-resume-analysis-job/index.ts:185-193` — worker re-invokes `analyze-resume` over
   INTERNAL auth (`x-internal-job-secret`), body = the job payload.
3. `analyze-resume/index.ts:1096-1097` — internal-auth branch:
   `resolvedTier = (userContext?.tier) ?? 'free'` and explicitly REFUSES to trust
   `rawBody.tier` ("Never trust rawBody.tier"). With null userContext (internal worker),
   resolves **'free'** → free-single-call path → free-depth output.

Net: **elite charge + free analysis** for any paid user on the queue path (onboarding, plus
the streaming→queue 529-overload fallback). Not specific to the admin-panel repro.

## Fix plan (primary)

In `analyze-resume`, on the INTERNAL-auth branch, resolve the authoritative tier from the DB
by the trusted internal payload `userId`, instead of defaulting free:

```ts
let resolvedTier: Tier;
if (userContext) {
  resolvedTier = userContext.tier as Tier;                 // user JWT — authoritative
} else {
  // internal worker path: authoritative DB read by trusted userId (NOT default-free,
  // which silently downgrades paid users). Honors "never trust rawBody.tier" — reads DB.
  resolvedTier = (await resolveTierForUserId(serviceClient, userId)) ?? 'free';
}
```

- `resolveTierForUserId` already exists (`_shared/auth.ts:235`).
- Defense-in-depth (optional): `submit-resume-analysis-job` stores `authenticatedUserCtx.tier`
  (not `body.tier`) in the payload.
- Backend edge change → TEST ON PREVIEW (`cimjltzovkahkqecpwgi`) FIRST, add deno coverage,
  then explicit deploy per CLAUDE.md (no unapproved prod edge deploy).

## Secondary threads (tracked, lower priority)

- **Merit over-charge / refund:** whether past queue-path paid-but-free-served analyses
  warrant merit refunds (this run overpaid 3 elite merits). Scope: query merit_transactions
  for feature-deduct rows whose corresponding resumes.grading_data._mergeSource='free-single'
  while charged tier != free.
- **Results-page progress spinner:** no progress UI during the long analysis on Results
  (dormant path navigates immediately after dispatch; Results owns progress UI). Separate from
  the onboarding-button spinner hardened in quick-260718-j2x.

## Status

Root cause CONFIRMED via production data + code trace.

### Fix implemented (2026-07-18)

**RC-A (onboarding lifecycle — the operator's symptom):**
- New side-effect-free helper `assembleResumeResult({ resolvedTier, isElite, promptParams,
  userPrompt, model, fallbackModel, log })` in `analyze-resume/index.ts`: Free → single
  consolidated call; Elite → 3-call parallel + merge with single-fallback recovery (mirrors the
  non-streaming withMerits assembly, throws plain status-bearing Errors so the request/response
  lifecycle executor owns refunds).
- The `origin:'onboarding'` `generate` closure now builds prompt context via
  `buildResumePromptContext({ resolvedTier, isElite, ... })` and calls `assembleResumeResult` —
  no more hardcoded free path. `save` now records `tier: resolvedTier` +
  `credits: MERIT_COST[resolvedTier]`. Cache key already included `tier: resolvedTier` (no
  poisoning). Elite onboarding now returns Elite-depth analysis for the Elite charge.

**Spinner / progress UX (the operator's second ask):**
- `src/pages/Onboarding.tsx` now renders the shared `UniversalAnalyzing` full-screen overlay
  during the committed full-path analysis wait (new `analyzing` state, distinct from `loading`
  so the fast goal-only path is unaffected). The user gets continuous rich progress feedback
  instead of a bare "Setting up..." button, and the same component drives the Results overlay so
  the animation is seamless across the post-analysis navigation. Test harness wrapped in
  `AnalysisLockProvider`; freshness (8) + recovery (6) suites green; type-check + lint clean.

**RC-B (internal-worker path), mirroring the proven analyze-career RC-1 pattern:**
- `analyze-resume/index.ts` (~line 1095): the internal-auth branch now resolves the tier via
  `resolveTierForUserId(userId)` (service-client DB read of `profiles.subscription_tier`, admin
  elevation, `normalizeActiveTier` collapses pro->elite, fails CLOSED to 'free') instead of
  `userContext?.tier ?? 'free'`. JWT callers still use their server-read `userContext.tier`.
- `resolveTierForUserId` imported from `_shared/auth.ts` (already existed, used by analyze-career).
- Defense-in-depth: `submit-resume-analysis-job/index.ts` now stores `authenticatedUserCtx.tier`
  (server-authoritative) in the job payload, not the client `body.tier`; the unused `const tier`
  read of `body.tier` was removed.
- Tests: new `analyze-resume/__tests__/tier-resolution.test.ts` (4 tests, all green) — locks the
  onboarding tier-aware assembly (RC-A), the internal-branch DB resolution (RC-B), the D-14
  no-client-tier guard, and the authoritative payload tier. Registered in `deno.json` `test:ci`.
  `deno check` clean on both functions; related submit/merit/failure tests still pass (19 green).
  Frontend: `Onboarding.freshness` (8) + `Onboarding.recovery` (6) green; `type-check` + `lint`
  (0 errors) clean.

Local verification only. NOT yet deployed — backend edge change requires preview test
(`cimjltzovkahkqecpwgi`) + explicit operator-approved deploy per CLAUDE.md. Frontend
(`Onboarding.tsx`) ships via the normal Vercel build.

### Deploy log (2026-07-18, session resume)

- **Preview (`cimjltzovkahkqecpwgi`): DONE.** `deploy.ps1 -Env test -Functions analyze-resume,
  submit-resume-analysis-job` — `verify:baseline` GREEN (lint 0-err, type-check, vitest, deno
  offline, remote-DB lane vs preview, Playwright, build), linked, both functions deployed. exit 0.
- **Production (`zjpjapgraoxdukdvpjes`): DONE (operator-approved).**
  `deploy.ps1 -Env production -Functions analyze-resume,submit-resume-analysis-job` — third
  attempt GREEN. First two aborted at the gate on a PRE-EXISTING flaky e2e assertion
  (`stripe-checkout.spec.ts:56`, unrelated to this fix): it asserted `toBeVisible` on the
  transient "Upgrade processing" toast, which fires on mount and auto-dismisses within seconds
  (failed 3/3 in isolation). Root-caused + fixed at source in commit `1d920748`: assert the
  DURABLE reconcile signal (checkout param stripped from URL) instead of the racy toast; an
  intermediate `Dashboard.tsx` toast-duration change (`bf59ed55`) was counterproductive and was
  reverted. Reworked e2e is 5/5 green in isolation (~1.5s) and passed the prod gate at 7.0s.
  `verify:baseline` GREEN → linked prod → both functions deployed. exit 0.

### Open

- **Frontend overlay:** the `Onboarding.tsx` UniversalAnalyzing overlay (commit `fb3e136c`) and
  the e2e/Dashboard commits are on the `staging` branch. Prod EDGE functions are now live
  (deployed directly via the script, branch-independent), but the frontend onboarding overlay
  reaches prod users only once `staging` is merged to the Vercel-connected branch and rebuilt —
  NOT triggered this session.
- **Merit refund sweep** (secondary, above): quantify/refund past queue-path overcharges (both
  RC-A onboarding and RC-B worker runs where charged tier != served depth).
- **Spinner:** RESOLVED — onboarding now shows the `UniversalAnalyzing` overlay during the
  analysis wait (was a bare "Setting up..." button).
