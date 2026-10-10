---
id: 260717-8tn
status: complete-local
date: 2026-07-17
---

# Retirement summary

## Shipped locally

- Career Comparison now renders only the saved single-role readiness score, benchmark,
  verdict, strengths/gaps, and skill assessments. The multi-role selector, dialog, request
  state, and comparison handler were removed.
- The three retired nested readiness subsections were removed from TypeScript contracts,
  Haiku strict schemas, prompt skeletons, prompt rules, fixtures, and frontend rendering.
  `applyCareerTierShape` defensively strips their legacy keys at every tier before a cached
  or saved result is returned.
- The direct and queued Career Compass endpoints reject legacy comparison-only inputs with
  HTTP 400 `unsupported_input` before rate limiting, Merit deduction, or AI work. Comparison
  inputs no longer participate in cache/idempotency identities.
- Career-field match explanations remain intact (`careerFields[].whyMatch` and
  `whyMatchDetails`). Inline role skill gaps, readiness gaps, qualification steps, and
  roadmap actions also remain intact.
- Removed the standalone Skills Gap page/route/tab and both retired Edge function source
  directories. Removed active entitlements, fixtures, usage labels, History reopen routes,
  pricing/landing copy, keep-warm/CORS inventories, Supabase config, deploy/cutover/probe
  lists, environment documentation, and obsolete tech-debt documentation.
- Legacy usage rows are hidden from user History. Historical migrations and generated DB
  enum types were intentionally retained only to preserve existing audit-row compatibility.
- Added a compact retirement surface regression test and replaced the Career Comparison UI
  tests with single-role/legacy-payload negative coverage.

## Verification

- `npm.cmd run type-check` — passed.
- Focused `deno check` for Career Compass handlers, prompt/schema, and tier shaper — passed.
- Focused Deno tests — 124 passed before two stale-count/path assertions were corrected;
  corrected rerun: 56 passed, 0 failed.
- Focused Vitest (`ReadinessTab` and Career Compass recovery): 35 passed, 0 failed.
- Active-source retirement search: zero matches for retired route/function/comparison
  identifiers (generated DB types excluded as planned).
- Career-field match explanation search confirms those surviving fields remain in schema,
  prompts, and frontend types.
- `git diff --check` could not produce a clean repository-wide result because the shared
  worktree currently contains unrelated unresolved conflict markers in
  `supabase/functions/analyze-resume/index.ts` (lines 674, 676, 678). This task did not edit
  or resolve that overlapping work.

Broad lint/test/build gates were left for the root session after focused verification, as
the shared worktree contains concurrent Stripe and Resume Analysis debug changes.

## Required operator rollout step

Repository deletion does not undeploy functions already present in Supabase. After merge:

1. Delete the two retired function deployments from both Preview and Production.
2. Verify both retired function URLs return HTTP 404 in each environment.
3. Deploy the updated Career Compass function/frontend and verify a normal Career Compass
   analysis completes, Career Comparison shows one target-role readiness result, and legacy
   comparison inputs return HTTP 400 without a Merit deduction.

No live endpoint deletion or deployment was performed during this task.
