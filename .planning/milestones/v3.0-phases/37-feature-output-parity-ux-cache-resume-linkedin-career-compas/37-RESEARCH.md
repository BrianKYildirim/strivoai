# Phase 37 Research: Feature Output Parity, UX, and Cache

## RESEARCH COMPLETE

Phase 37 is a consolidated brownfield phase. The plan should not introduce new architecture. It should repair feature output contracts first, then add cache integration through the existing Phase 29 substrate, while preserving Phase 35 selector/deep-link semantics and Phase 36 `analysis_id` history linkage.

## Planning Findings

### Shared cache and history substrate

- `supabase/functions/_shared/merit-gateway.ts` already exposes `withMerits(..., options?: { precheck_cache })`. A cache hit returns the cached value with `transactionId: 'cache-hit'`, writes `record_ai_usage` with `credits=0`, and bypasses both pooled rate limiting and merit deduction.
- `supabase/functions/_shared/cache-fingerprint.ts` already exposes `computeCacheKey({ user_id, feature, tier, variant, inputs })`. Inputs must be post-truncation and output-affecting only.
- `supabase/functions/_shared/usage-checker.ts` already exposes `recordUsageWithAnalysis(userId, actionType, credits, analysisId)`. Phase 37 cache writes should happen after durable per-feature persistence and after the linked usage row is recorded.
- `analysis_cache` stores `cache_key`, `feature`, `tier`, `variant`, `user_id`, `raw_response`, `created_at`, `last_hit_at`, and `hit_count`. Feature handlers should query by exact `cache_key`, update hit metadata on reads, and write best-effort cache rows only after validated successful output.

### Resume Analysis

- `src/pages/Results.tsx` still derives `quickActions` and renders a `Priority Actions` block. The plan must remove this rendering and wiring while preserving `Priority Improvements`.
- `supabase/functions/analyze-resume/index.ts` already has post-success persistence helpers from Phase 36 and a comment noting Phase 37 cache-key work. The plan should add `computeCacheKey`, an `analysis_cache` precheck passed to `withMerits`, and a best-effort cache write after `completeAndRecordSuccess`.
- The cache key must include `text_hash`, `targetRole`, `targetIndustry`, `previousScore`, `previousSuggestions`, and tier. If the handler only receives a resume id, it must read `resumes.text_hash` or compute/persist the hash from extracted text before cache lookup.

### LinkedIn Grader

- `src/pages/LinkedInGrader.tsx` already reads `profiles.linkedin_pdf_content` and can persist replacement PDF metadata after success. Phase 37 should preserve those Phase 35 semantics and avoid overwriting `?id=` hydration.
- The UI still renders `profileInsights` as "What's Working For You". Remove that output from rendering and make old payloads harmless.
- Prompt/validation code still references `profileInsights` for Pro/Elite. The plan must remove generation and required validation for `profileInsights`, while keeping `keyStrengths` and Ready-to-Paste output.
- Free-tier Ready-to-Paste must generate only one real fix. The remaining four locked items must be presentational `BlurredLockCard` placeholders, not hidden Claude content.
- The cache key must include `profileContent_hash`, `profileUrl`, `prior_grade_id`, and tier. A different `prior_grade_id` must miss even for identical profile text because prior grade JSON changes the prompt.

### Career Compass

- `src/pages/CareerCompass.tsx` has a strict deep-link hydration guard requiring `careerFields`, `roles`, `roadmap`, and `careerDNA`. This can reject older or partial persisted rows with "Couldn't load this analysis" instead of rendering a recoverable partial report.
- Career Compass tab components already use `BlurredLockCard`, but current free gating does not exactly match Phase 37 requirements in all tabs. `SurpriseFits` is the clearest mismatch: tests describe a single overlay/hiding behavior while Phase 37 requires two real plus two locked placeholders.
- Paid output strictness belongs in the edge function after output repair: Pro and Elite successful responses must include all six core sections: Best-Fit Roles, Surprise Fits, Fields, Roles, Readiness, and Roadmap.
- Defensive rendering belongs in the frontend: old partial results show one global warning and per-tab fallback cards with "Re-run for full report". The CTA returns to the form with available inputs prefilled and must not immediately call AI.
- CACHE-06 must cover all four subpaths: Free single-call, Pro/Elite short-circuit, Pro/Elite full, and multi-role compare. Cache writes must happen only after strict validation and persistence.

### Recruiting Lens

- `src/pages/RecruitingLens.tsx` already imports `PriorAnalysisSelector` and `PriorLinkedInSelector`, supports `?id=` hydration from `analysis_results`, and sends `resumeSummary`, `jobDescription`, and optional `linkedinText`.
- The page does not yet require company and role title, does not surface saved job tiles below the form, and has no tutorial timing/localStorage surface.
- `supabase/functions/recruiting-lens/index.ts` currently requires resume summary and job description but not company/role. It persists `analysis_results` for Pro/Elite through `persistRecruitingLensResult`, but it does not write or update `saved_jobs`.
- `supabase/functions/process-recruiting-lens-job/index.ts` exists from Phase 36 and sends completion links. Phase 37 should extend the sync path and worker path to carry company/role metadata, saved-jobs persistence, and cache parity.
- CACHE-07 must key on `resumeSummary_hash`, `jobDescription_hash`, `linkedinText_hash`, company, role title, and tier. Cache hits must update/refresh the existing saved tile for the same company/role/JD cache key instead of creating duplicates.

## Recommended Plan Shape

Use four independent feature plans. Each feature plan should sequence:

1. Output correctness, validation, and defensive rendering.
2. Durable persistence or saved-work behavior needed by that feature.
3. Cache lookup/write through `withMerits` and `computeCacheKey`.
4. Targeted automated tests and one manual QA path.

This keeps the consolidated phase parallelizable without letting cache reuse preserve broken output.

## Verification Recommendations

- Resume: targeted lint/test for `Results.tsx` and `analyze-resume`; Deno source tests asserting no `priorityActions`/`quickActions` prompt output; cache-hit test asserting `withMerits` precheck and no Anthropic call.
- LinkedIn: Vitest around old `profileInsights` rendering and free Ready-to-Paste placeholders; Deno prompt/validation tests for removed `profileInsights` and `prior_grade_id` cache miss.
- Career Compass: component tests for fallback cards and free skeleton counts; Deno validation tests for strict paid sections; TEST-06 staging/live or fixture-backed regression for Pro/Elite all-six-section output.
- Recruiting Lens: UI tests for mandatory company/role/JD, tutorial localStorage, and saved tile click hydration; Deno tests for backend input rejection, saved_jobs upsert/update, cache-hit saved state, and worker parity.

## Risks

- Cache-key drift is the main integration risk. Plans must name exact key inputs and test misses when output-affecting inputs change.
- Legacy partial payloads can be displayed defensively, but new paid outputs must fail validation when incomplete. Mixing these two concerns is the most likely Career Compass regression.
- Recruiting Lens has two execution paths. Any saved-jobs or cache integration in the sync handler must be mirrored in `process-recruiting-lens-job` if the async fallback remains.
- Full repo lint may still be noisy in this checkout. Verification should start with targeted tests/lint and report any repo-wide failures separately.
