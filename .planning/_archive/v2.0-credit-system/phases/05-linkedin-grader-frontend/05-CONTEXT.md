# Phase 5: LinkedIn Grader — Frontend - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Update `src/pages/LinkedInGrader.tsx` (and its support types/components) to render the v3.0 backend schema produced by Phase 4, add new UI for `profileInsights` and `rewrites`, enforce the "1 free scan per billing cycle, then 1 AI credit per scan" entitlement for Pro/Elite, and remove the dead client-side `previousGrade` pre-fetch. Scope is limited to the LinkedIn Grader page, its directly-coupled components (`AnalysisComparisonModal` for the LinkedIn path only), and a minimal backend edit in `grade-linkedin/index.ts` to enforce the free-scan rule. Free-tier gating and overall page shell (navbar, input form, PDF upload) remain as-is.

</domain>

<decisions>
## Implementation Decisions

### Schema Migration & Types

* **D-01:** Hard break the `AnalysisResult` interface in `LinkedInGrader.tsx` to match the v3.0 schema exactly: `rawScore`, `scoreJustification`, `profileInsights[]`, `nextBestAction {action, reason, expectedImpact}` (flat — no `primaryAction`/`secondaryActions`), `sectionBreakdown[4]`, `topFixes[*]` with `suggestedFix` (not `suggestedRewrite`), `keyStrengths[]`, `rewrites[4]`. Delete legacy fields (`overall_score`, `categories`, `suggestedRewrite`, `primaryAction`, `secondaryActions`, `scoreDrivers`, `detailedFeedback`, `strengths`, `weaknesses`, `tips`). The validator in `supabase/functions/grade-linkedin/validation.ts` is the authoritative shape.
* **D-02:** Remove the dead client-side `previousGrade` pre-fetch (lines \~248-268 of `LinkedInGrader.tsx`) and drop `previousSuggestions`/`previousScore` from the request body. Backend already fetches the previous grade in step 7 of `grade-linkedin/index.ts` — the client pre-fetch is wasted compute and is listed explicitly in the phase gap closure notes.

### Cached Grade Handling

* **D-03:** Ignore pre-v3.0 cached grades on mount. In `checkAccessAndLoadCache`, detect legacy shape (missing `sectionBreakdown` or `rawScore` in `grading_data`) and treat as "no cache" — show the input form as if the user had no prior analysis. No legacy rendering paths, no adapter, no banner. Users re-scan once to see v3.0 results.

### profileInsights UI (new)

* **D-04:** Render `profileInsights` as a dedicated block directly under the score hero and above Key Strengths. Heading: "What's Working" (or similar "exceptional elements" framing). 2-column grid on desktop, stacked on mobile.
* **D-05:** Each insight renders as a quoted-text callout card: an italicized quote block showing the profile text the insight references, followed by a short "Why this matters to recruiters" line. Emerald/gold accent to signal standout strength. Visual treatment mirrors the existing Key Strengths card styling but with the quoted-text block added.

### rewrites UI (new)

* **D-06:** Render `rewrites` as a dedicated "Paste-Ready Rewrites" section positioned below Section Breakdown and above (or replacing part of) the existing "Ready-to-Paste Improvements" block. 4 stacked cards — index 0 gets top-priority styling (rose/amber gradient banner, "Headline" label) and indices 1-3 get generic labels. Each card has a Copy button using the existing `navigator.clipboard.writeText` + toast pattern already present in the file.
* **D-07:** `rewrites` and `topFixes` remain visually distinct: rewrites = "paste this", topFixes = "change this" (carries D-04 from Phase 4 into the UI). The existing "Ready-to-Paste Improvements" block renders `topFixes` with the old before/after card layout, now bound to `topFixes[*].suggestedFix` instead of `suggestedRewrite`.

### Section Breakdown Rendering

* **D-08:** Simplify section cards to render only what v3.0 provides: `name`, `score`, `maxScore`, `status` (icon), progress bar, `scoreJustification`-style summary line, and the `feedback: string[]` array as numbered bullet points (reusing the existing numbered-bullet visual already used for `detailedFeedback`). Delete all legacy nested rendering (`scoreDrivers.positive/negative`, `strengths`, `weaknesses`, `tips`, `detailedFeedback`).

### Entitlement (LIG-11)

* **D-09:** **Backend enforces the free-scan rule.** Add a small edit to `supabase/functions/grade-linkedin/index.ts`: before `checkAndRecordUsage`, count the user's `linkedin_grades` rows in the current billing cycle; if zero, skip the usage decrement (or call a new usage-checker variant that records without decrementing). Frontend state is not authoritative for credit accounting. This pulls a minimal backend change into this frontend phase — acceptable because LIG-11 cannot be met correctly with frontend-only logic.
* **D-10:** Frontend computes the free-scan signal by querying `linkedin_grades` count for the user WHERE `created_at >= current billing cycle start`. Zero rows → free scan available. No new migration, no new hook — a direct Supabase query in `checkAccessAndLoadCache` (or a small sibling function) populates an `entitlementState` piece of component state: `'free-available' | 'will-use-credit' | 'loading'`.
* **D-11:** Entitlement state surfaces as inline helper text directly under the Analyze button: "Free scan available this cycle" (green) or "This will use 1 AI credit" (muted). No confirmation modal, no extra click friction. When `entitlementState === 'will-use-credit'`, include the remaining credit count if `useAiCredits` context already exposes it.

### Comparison Modal

* **D-12:** Rewire `AnalysisComparisonModal` for the LinkedIn code path to accept v3.0-shaped data (`sectionBreakdown`, `topFixes`, `rewrites`, `profileInsights`) instead of the legacy `categories`/`improvements` shape. Only the LinkedIn pathway changes — resume-analysis usage of the same modal is out of scope. If the modal currently does cross-feature rendering from one prop set, introduce a discriminated union or a separate `linkedinAnalysis` prop rather than mutating the resume path.

### Unchanged / Preserved

* **D-13:** Free-tier block (`ProFeatureGate`), PDF upload flow, paste-text flow, optional URL field, `UniversalAnalyzing` loading overlay, `Scan New Profile` button, cache date badge, and post-analysis CTAs ("Analyze Another Profile", "Grade My Resume Too") all stay as-is. No redesign work on these in this phase.

### Claude's Discretion

* Exact Tailwind classes / color tokens for the new profileInsights and rewrites blocks (must use semantic tokens, not hardcoded hex)
* Exact copy for the entitlement helper text and the free-scan section heading
* Whether to extract a `LinkedInResult` type file or keep the interface inline in `LinkedInGrader.tsx`
* Motion/animation delays for the new blocks (match existing framer-motion patterns)
* Whether the legacy-shape detector in D-03 uses a single field check or a type guard function
* Error-state copy when entitlement query fails (graceful degrade: assume `will-use-credit`)

</decisions>

\<canonical\_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v3.0 Runtime Spec

* `APIcontextdocuments/linkedingrader/STRIVOLinkedInGraderFinal.pdf` — Authoritative v3.0 LinkedIn Grader spec (mission, scoring architecture, output schema, entitlement policy)

### Frontend

* `src/pages/LinkedInGrader.tsx` — The page being rewritten. 1007 lines. Contains legacy `AnalysisResult` interface (lines \~24-82), cache-load path (lines \~113-163), handleAnalyze with dead pre-fetch (lines \~197-316), section rendering (lines \~824-894), topFixes rendering (lines \~896-974)
* `src/components/AnalysisComparisonModal.tsx` — Modal to rewire for v3.0 LinkedIn path
* `src/hooks/useTierAccess.ts` — Tier/credit access hook; `linkedin_grading` is already in the `FeatureType` union
* `src/hooks/usePaywallGuard.ts` — Paywall pattern reference for entitlement gating
* `src/contexts/AiCreditsContext.tsx` — AI credits context (for "X remaining" display)
* `src/lib/supabaseClient.ts` — Supabase client for the cycle-start query
* `src/lib/fetchWithTimeout.ts` — `invokeWithTimeout` already used in handleAnalyze

### Backend (touched in this phase)

* `supabase/functions/grade-linkedin/index.ts` — Edit step 6 to enforce free-scan rule before `checkAndRecordUsage`
* `supabase/functions/grade-linkedin/validation.ts` — Authoritative v3.0 schema shape (REQUIRED\_TOP\_LEVEL, EXPECTED\_SECTIONS, TOP\_FIX\_FIELDS, NEXT\_BEST\_ACTION\_FIELDS)
* `supabase/functions/_shared/usage-checker.ts` — `checkAndRecordUsage('linkedin_grading')`; may need a "check without record" variant if the free-scan path can't cleanly skip the call

### Prior Phase Context

* `.planning/phases/04-linkedin-grader-backend/04-CONTEXT.md` — Phase 4 decisions, especially D-04 (rewrites vs topFixes separation), D-06 (profileInsights always required), D-07/D-08/D-09 (follow-up analysis via backend pre-fetch — the reason D-02 removes the client pre-fetch), D-12 (requireAuth is authoritative)
* `.planning/phases/04-linkedin-grader-backend/04-01-PLAN.md`, `04-02-PLAN.md`, `04-03-PLAN.md` — Implementation detail for what the backend actually returns

### DB Schema

* `supabase/migrations/` — `linkedin_grades` table with `user_id`, `overall_score`, `grading_data` (JSONB), `created_at`. Billing cycle start is derived from `profiles.created_at` day-of-month (same pattern used elsewhere in the codebase)

### Requirements

* `.planning/REQUIREMENTS.md` — LIG-01, LIG-08, LIG-09, LIG-11, LIG-13 are the acceptance criteria for Phase 5

\</canonical\_refs>

\<code\_context>

## Existing Code Insights

### Reusable Assets

* `LinkedInGrader.tsx` Input/upload flow (PDF drop, tabs, URL input, sanitization, length validation) — preserved as-is
* `UniversalAnalyzing` overlay + `linkedInSteps` — preserved
* Existing Copy button pattern using `navigator.clipboard.writeText` + `toast.success('Copied to clipboard!')` — reused for each rewrite card
* Existing motion/framer-motion card animations — reused for new blocks
* `useTierAccess` already recognizes `linkedin_grading` as a gated feature
* `AnalysisComparisonModal` exists and is already wired into the results view — just needs v3.0 prop shape

### Established Patterns

* Page-level cache load: `checkAccessAndLoadCache` fetches last row from feature table and populates result state on mount
* API call: `invokeWithTimeout<any>('grade-linkedin', { body: {...} }, 120000)`
* Score color helpers: `getScoreColor`, `getStatusIcon` — reused unchanged
* Loading UX: step-animated progress with `setAnalysisStep` + `stepInterval` — reused
* Error handling: `toast.error(message)` with `invokeWithTimeout` error shape

### Integration Points

* `grade-linkedin` edge function — request body simplifies to `{ profileData: { profileUrl, profileContent } }` after removing `previousSuggestions`/`previousScore`/`userId` (userId is already derived from JWT per Phase 4 D-12)
* `linkedin_grades` table — queried twice on mount (latest-row cache load + cycle-start count for entitlement) — can be combined into a single query that returns all rows this cycle ordered desc, taking row\[0] as cache candidate and `length === 0` as free-scan signal
* `profiles.subscription_tier` — still checked for Pro/Elite gate (unchanged from current code)

### Gotchas

* The legacy interface has `overall_score` but backend returns `rawScore`. Every downstream reference (`result.overall_score`, score circle, getScoreColor calls, confetti trigger, the `AnalysisResult` prop to `AnalysisComparisonModal`) has to be updated in lockstep or the score will render as `NaN`/blank
* `AnalysisComparisonModal` is shared infrastructure — plan must check its other callers before changing its prop shape (resume analysis uses it too per the search results)
* `checkAndRecordUsage` is atomic (Phase 4 CR-01 fix) — the free-scan bypass must not reintroduce a TOCTOU race; prefer a single SQL-side atomic check or a new checker variant

\</code\_context>

<specifics>
## Specific Ideas

* The v3.0 spec framing "Is my LinkedIn profile actually helping me get recruited — or silently costing me opportunities?" should inform the profileInsights section heading and copy (e.g., "What's Working For You", not "Strengths")
* profileInsights are intentionally richer than keyStrengths — they include quoted profile text and recruiter-relevance framing. The UI must surface the quote visibly, not just the analysis line
* The headline rewrite is always `rewrites[0]` — this is enforced by the Phase 4 prompt and is a hard invariant, so index-based rendering is safe
* Phase 4 D-09: score reflects current profile state only; improvement acknowledgment lives in feedback text and profileInsights. The comparison modal should not try to compute improvement deltas on its own — it should render the two snapshots side-by-side
* The "1 free scan per cycle" rule is a Pro/Elite perk — free tier is still blocked entirely by `ProFeatureGate`, unchanged

</specifics>

<deferred>
## Deferred Ideas

* Redesign of post-analysis CTAs or cache indicator — out of scope for Phase 5, no change planned
* Rescan-specific "Free rescan available" prominent CTA — deferred; inline helper under Analyze button is sufficient for LIG-11
* Extending `useAiCredits` with a `linkedinFreeAvailable` field — deferred; direct query is simpler for one feature
* New `linkedin_free_used` column on `profiles` with cycle-reset logic — deferred in favor of counting `linkedin_grades` rows

</deferred>

***

*Phase: 05-linkedin-grader-frontend*
*Context gathered: 2026-04-12*
