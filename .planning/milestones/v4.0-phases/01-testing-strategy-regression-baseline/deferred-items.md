# Phase 01 — Deferred Items

Out-of-scope discoveries logged during execution (not fixed in the discovering plan, per the executor scope boundary).

## From Plan 01-01 (2026-06-09)

The vitest suite has **7 pre-existing, DETERMINISTIC failures** across 4 files. These
are stable run-to-run (verified across 3 consecutive `npm test` runs after the
TEST-02 fix) and are content/source-drift assertions — NOT the cross-worker
non-determinism (TEST-02) that Plan 01-01 fixed, and none involve
`OutcomeOverdueBanner`. They are out of Plan 01-01's scope (which was: async-effect
guard + mock factory + rejection-surfacing + tier-config reconciliation).

| File | Failing test(s) | Apparent cause |
|------|-----------------|----------------|
| `src/components/BlurredLockCard.test.tsx` | 2 — "renders children inside a blurred container with aria-hidden"; "renders a clickable overlay with role=button and aria-label" | Component markup/aria drift vs. the test's expected structure. |
| `src/config/__tests__/req-coverage.test.ts` | 2 — "REQUIREMENTS.md registers the 13 expected Phase 24 REQ-IDs"; "every Phase 24 plan frontmatter requirement is registered or allow-listed" | Stale Phase-24 requirement-coverage assertions vs. the current REQUIREMENTS.md (v4.0 reset). |
| `src/pages/__tests__/LinkedInGrader.linkedin-pdf-source.test.ts` | 2 — "loads stored onboarding PDF content only through the no-deep-link mount path"; "persists replacement PDF source only after successful grade handling" | Source-string contract test out of sync with the current `LinkedInGrader` page source (string-index assertions return -1). |
| `supabase/functions/_shared/__tests__/cost-map-invariant.test.ts` | 1 — "verifyCostMap catches a single drifted cell" | Test fixture expects `ts: 2` for `resume/pro` but `MERIT_COST_PER_FEATURE.resumeAnalysis.pro` is now `3`. |

**Disposition:** These belong to the broader TEST-06 regression-baseline reconciliation
(later plans in this phase / strategy doc) or to the relevant feature's own
source-drift fix. They are NOT flaky — the blocking gate can treat them as a known,
deterministic RED set until reconciled. Plan 01-02 (depends on the TEST-02 fix landing
first) inherits this exact, stable failure set.

## From Plan 01-03 (2026-06-10) — TEST-project edge-function CORS blocks the localhost E2E origin

**Environmental blocker (NOT a spec defect; outside Plan 01-03's authority to fix —
requires a TEST-project secret/redeploy, which the plan forbids: "Do NOT deploy anything").**

The Supabase TEST project (`cimjltzovkahkqecpwgi`) has its user-facing edge functions
deployed with `APP_URL = https://strivoai-git-preview-kapura3-stars-projects.vercel.app`.
The shared `_shared/cors.ts` is **fail-closed single-origin** (`Access-Control-Allow-Origin: APP_URL`),
so EVERY `type:'user'` edge function rejects the Playwright preview origin
`http://localhost:8080` (D-03) at the CORS preflight. Reproduced live (playwright-cli console):

```
Access to fetch at 'https://cimjltzovkahkqecpwgi.supabase.co/functions/v1/analyze-resume'
from origin 'http://localhost:8080' has been blocked by CORS policy: ... 'Access-Control-Allow-Origin'
header has a value 'https://strivoai-git-preview-kapura3-stars-projects.vercel.app' that is not equal
to the supplied origin.
```

Same block hits `ocr-pdf` and `create-checkout-session`. **Consequence:** of the 3 E2E flows,
- **Flow 1 (auth/session) PASSES** — Supabase Auth/GoTrue has permissive CORS, not gated by `APP_URL`.
- **Flow 2 (resume analysis) FAILS** — `analyze-resume` (and the `ocr-pdf` fallback) preflight-blocked → the stream never completes → Results shows "Analysis Taking Longer Than Expected".
- **Flow 3 (Stripe) — 1 of 3 blocking assertions PASSES** (the `?checkout=complete` reconcile, which is pure client routing) — the clientSecret round-trip + iframe-mount assertions FAIL because `create-checkout-session` is preflight-blocked.

**The specs are correct and unweakened** — verified the full Flow-2 path works up to the
`analyze-resume` CORS wall by interactive driving (PDF.js extraction ACCEPTED → upload → navigate to
`/results/:id?stream=true`). They go green the instant the TEST project allows the localhost origin.

**Fix (operator / infra, one of):**
1. Set `APP_URL=http://localhost:8080` on the TEST project's function env and redeploy the user functions (TEST project ONLY — never production); OR
2. Make the TEST project's user-CORS allow an allowlist that includes the localhost preview origin (multi-origin `_shared/cors.ts` is a larger change — Phase 5/CI-env scope); OR
3. Point the gate's preview at the already-allowed Vercel preview origin (tensions with D-03's "local preview").

This is the precondition Task 0/Task 4 (human-verify) surfaces to the operator. Until resolved,
the resume + Stripe-clientSecret blocking assertions cannot be green from the localhost preview.
