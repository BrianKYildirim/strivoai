# Phase 47: Interview Prep Production Gate + Elite Tier Differentiation - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Hide Interview Prep Coach from production via a build-time/Vercel-environment flag while keeping it fully functional on staging/preview. Production users see "Coming Soon" placeholders on every Interview Prep surface (route, nav, dashboard tile, pricing list, history); staging users see the feature exactly as today, with no overlay. All Interview Prep code, prompts, and edge functions stay in repo and stay deployed everywhere — this is a UI gating + copy + planning change, not a deletion.

**Scope reduction from ROADMAP.md:** Roadmap success criterion #3 (ship a new Elite-vs-Pro differentiator in this phase) is **descoped**. Phase 47 ships gate-only. Elite differentiator selection moves to a follow-up phase (47.1) or v4.0 entry. Roadmap text needs updating to reflect this descope. Phase 41 (Interview Prep Production Fix) is **superseded entirely** by Phase 47 — no staging-only verification scope retained.

</domain>

<decisions>
## Implementation Decisions

### Gating treatment on production

* **D-01:** Production shows "Coming Soon" treatment on **every** Interview Prep surface — not just the route. Specifically:
  * `/interview-prep` route renders a Coming Soon page (not a 404 / not a redirect)
  * Dashboard / Explore tile (`src/components/ExploreFeatures.tsx`) keeps the Interview Prep card visible but in disabled state with a "Coming Soon" badge
  * Navbar (`src/components/Navbar.tsx`) and AppSidebar (`src/components/AppSidebar.tsx`) keep the Interview Prep nav item visible but disabled with a "Coming Soon" tooltip
  * Pricing feature lists (`src/components/PricingTable.tsx`, `src/components/pricing/TierCardV2.tsx`) keep the Interview Prep bullet but tag it with "Coming Soon"
* **D-02:** This **overrides ROADMAP.md success criterion #1** which mandated "redirect or 404." The roadmap text needs updating during PLAN.md or roadmap update step.
* **D-03:** Staging/preview environments show the feature as-is in the staging branch — no Coming Soon treatment, no banners, no overlay. Phase 47 must not introduce any new visual artifact on staging.

### Pricing config and history

* **D-04:** `src/config/pricing-config.ts` `interviewPrepCoach` entries (merits, costs, tokens) stay **untouched**. The pricing UI conditionally renders / hides / re-tags rows based on the feature flag. Re-enabling Interview Prep is a flag flip, not a config change.
* **D-05:** Existing Interview Prep history records on production (from before the gate ships) are **filtered out** of `src/pages/AnalysisHistory.tsx` when the flag is off. Records remain in the DB; they just don't render. No read-only viewing of past results on prod.

### Flag mechanism

* **D-06:** Use **`VITE_FEATURE_INTERVIEW_PREP`** env var, set per-Vercel-environment in the project settings:
  * Vercel "Production" scope: `VITE_FEATURE_INTERVIEW_PREP=false`
  * Vercel "Preview" scope: `VITE_FEATURE_INTERVIEW_PREP=true`
  * Vercel auto-applies the right value based on which branch is being built (main → Production scope; preview/staging → Preview scope).
* **D-07:** Single source of truth: a new helper `isInterviewPrepEnabled()` (location TBD by planner — likely `src/config/feature-flags.ts` or similar) reads `import.meta.env.VITE_FEATURE_INTERVIEW_PREP === 'true'`. Every surface imports from this helper. No inline `import.meta.env` checks scattered across components.
* **D-08:** **Default OFF (fail closed).** If the env var is missing/unset, treat as production (hide). Protects against misconfigured environments from leaking the feature.
* **D-09:** Do **not** rely on `import.meta.env.MODE` or `import.meta.env.PROD`. Both are `production` for every Vercel build (including preview/staging) because Vite's mode is set at build time, not by Vercel's branch routing. The explicit env var per Vercel environment scope is the only reliable signal.

### Elite differentiator (DESCOPED from this phase)

* **D-10:** Phase 47 **does not** ship a new Elite-vs-Pro differentiator. Roadmap success criterion #3 is removed from this phase's scope.
* **D-11:** While the differentiator decision is open, Elite users on production lean on **existing differences**: higher merit cap (150/mo vs Pro's 75/mo) and full Recruiting Lens (vs Pro's preview). Pricing copy on prod simply removes/tags the Interview Prep bullet — no replacement bullet is added in its place beyond what's already in those tiers.
* **D-12:** A new follow-up phase (provisional ID **47.1**) or v4.0 backlog entry is added for "Identify and ship new Elite-vs-Pro differentiator." Planner / roadmap update should create this entry so the Elite tier doesn't drift indefinitely.

### Backend gating

* **D-13:** **Frontend gate only.** Interview Prep edge functions (`supabase/functions/interview-prep-*`) stay deployed and reachable on production Supabase. Matches the "logic stays intact" intent — re-enabling is purely a Vercel env var flip with no backend redeploy needed.
* **D-14:** Acknowledged trade-off: a user with the API endpoint URL and a valid JWT could still invoke the production-deployed Interview Prep functions directly. Not exposed via UI. Acceptable given (a) no UI surface mentions the endpoints, (b) the goal is hiding from active paid usage, not API-level lockdown, and (c) the future re-enable should be a one-flag flip.

### Re-enable path (forward planning)

* **D-15:** When the future Interview Prep milestone ships, re-enabling production is intended to be: flip `VITE_FEATURE_INTERVIEW_PREP=true` in Vercel Production scope, redeploy. No code change required in Phase 47's own surfaces. The future milestone is responsible for any new UI/logic it introduces; Phase 47's deliverable should not block that.

### Phase 41 reconciliation

* **D-16:** Phase 41 (Interview Prep Production Fix) is **superseded entirely** by Phase 47. STATE.md should record this. Any in-flight Phase 41 work stops. The Phase 41 REQ-IDs (IPC-01..04, CACHE-08, TEST-04) move to the future Interview Prep milestone alongside the parking-lot entry — not retained as staging-only verification.

### Roadmap update (in scope of this phase's CONTEXT)

* **D-17:** ROADMAP.md parking-lot entry for "Future Interview Prep milestone" (line 463) needs refining during PLAN.md / execution:
  * Drop the Phase 41 dependency (Phase 41 is superseded, not blocking re-enable)
  * Keep / refine the production-503 root-cause condition only if still relevant after Phase 28 baseline merge
  * Add: "Re-enable is a single Vercel env var flip; no backend redeploy required"
  * Add: "Elite differentiator decision (Phase 47.1 or v4.0) must be live before re-enabling, so Elite tier doesn't double-count Interview Prep + new differentiator"
* **D-18:** Roadmap success criteria for Phase 47 (lines 437-445) need updating: criterion #1 changes from "redirect or 404" to "Coming Soon placeholder"; criterion #3 (Elite differentiator) is removed from this phase and reassigned to 47.1 / v4.0; criterion #7 (Phase 41 reconciliation) becomes "Phase 41 marked superseded in STATE.md."

### Claude's Discretion

* Exact filename / location of the `isInterviewPrepEnabled()` helper (planner picks — likely `src/config/feature-flags.ts`)
* Visual design of the Coming Soon page / badge / tooltip — should follow existing semantic design tokens; planner / UI work picks specifics
* Whether a single Coming Soon page component is reused across all surfaces or each surface has its own treatment (likely a single shared `<ComingSoonBadge />` or similar primitive)
* Test strategy: at minimum unit tests proving `isInterviewPrepEnabled()` returns `false` when env var is unset/`'false'`/missing, and `true` only when `'true'`; visual surface tests showing each gated surface renders the Coming Soon variant when flag is off

</decisions>

\<canonical\_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 47 source of truth

* `.planning/ROADMAP.md` §"Phase 47: Interview Prep Production Gate + Elite Tier Differentiation" (lines 432-448) — original goal/success criteria/out of scope. **Note:** criteria #1, #3, #7 are revised in this CONTEXT.md (D-02, D-10, D-16).
* `.planning/ROADMAP.md` §"Backlog / Parking Lot" line 463 — Future Interview Prep milestone trigger conditions (to be refined per D-17).
* `.planning/STATE.md` lines 60, 66, 74 — Phase 47 entry, Phase 41 status pending reconciliation, v3.0 milestone context.

### Codebase maps

* `.planning/codebase/STRUCTURE.md` — frontend layout, where Interview Prep components live.
* `.planning/codebase/INTEGRATIONS.md` — feature flag patterns (currently no `VITE_FEATURE_*` precedent in repo; this phase establishes one).
* `.planning/codebase/ARCHITECTURE.md` — how routes / nav / pricing surfaces connect.

### Surfaces to gate (full list — verified in scout)

* `src/App.tsx:74` — `/interview-prep` route registration
* `src/components/Navbar.tsx:157, 245` — top nav link and (likely) command palette entry
* `src/components/AppSidebar.tsx:37` — sidebar nav link
* `src/components/ExploreFeatures.tsx:57-60` — dashboard / Explore feature tile
* `src/components/PricingTable.tsx:44, 62, 84` — Free `excludedFeatures`, Pro feature bullet, Elite feature bullet
* `src/components/pricing/TierCardV2.tsx:19, 39` — pricing tier cards
* `src/config/pricing-config.ts` — `interviewPrepCoach` merit/cost entries (untouched per D-04)
* `src/pages/InterviewPrep.tsx` — page component (mounted only when flag on)
* `src/pages/AnalysisHistory.tsx` — history entries filtered when flag off (D-05)
* `src/components/InterviewPrepInput.tsx`, `src/components/InterviewQuiz.tsx`, `src/components/interviewPrep/*` — feature components (no changes needed; mounted via the route only)
* `src/types/interviewPrep.ts` — types (no changes needed)
* `src/components/LowBalanceWarning.tsx` — verify Interview Prep merit-cost reference doesn't surface on prod when flag off

### Edge functions (NOT gated server-side per D-13)

* `supabase/functions/interview-prep-*` — stay deployed on prod. No code changes in Phase 47.

### Vercel deployment topology

* Production deployments build from `main` branch → Vercel "Production" environment scope
* Preview deployments build from `preview` and `staging` branches → Vercel "Preview" environment scope
* Phase 47 sets `VITE_FEATURE_INTERVIEW_PREP` per scope in Vercel project settings (D-06)

\</canonical\_refs>

\<code\_context>

## Existing Code Insights

### Reusable Assets

* **No existing** **`VITE_FEATURE_*`** **flag pattern.** Only `import.meta.env.DEV` is used in 2 places (`src/App.tsx:85`, `src/components/topup/StripePaymentElementModal.tsx:54`). Phase 47 establishes the convention.
* Tier-gated UI primitives `<LockedSection>` (Phase 14) and `<ProFeatureBlur>` exist for tier-locked content. They are **not** the right primitive for "Coming Soon" — those are about paywalling, not feature-deferring. Plan likely needs a new small primitive (`<ComingSoonBadge />` or similar).
* Existing pricing-config separates merit/cost/token data from rendering. UI components import from `pricing-config.ts` and decide what to render. Conditional rendering based on `isInterviewPrepEnabled()` fits this pattern cleanly.

### Established Patterns

* Components import from `@/config/*` for cross-cutting config (pricing, feature flags). New `feature-flags.ts` follows this convention.
* ESLint flat config + strict TypeScript — flag helper must have explicit return type and not rely on env-string coercion bugs.
* `import.meta.env.PROD` and `import.meta.env.MODE` are unreliable for Vercel branch routing (both equal `production` for every `vite build`). Phase 47 must avoid these.

### Integration Points

* **Vercel project settings (out-of-repo configuration):** Phase 47 plan needs to document the env var setup explicitly so the flag actually behaves correctly per environment. Operator must add `VITE_FEATURE_INTERVIEW_PREP=false` to Production scope and `=true` to Preview scope before deploy. Without this step the gate is a no-op.
* **Vercel environment scopes apply on deploy** — flipping the flag without redeploying does nothing for already-built bundles. Re-enable path (D-15) requires a redeploy.

\</code\_context>

<specifics>
## Specific Ideas

* User explicitly said: "future plans for interview prep that will change everything" — implies the future Interview Prep milestone will replace logic, prompts, schemas significantly. Phase 47 should not invest in preserving anything beyond "code stays in repo, exercisable on staging." Don't over-engineer reversibility for the Phase 47 surface code itself.
* "Logic to maintain intact" means: don't delete, don't rip out merit costs, don't rewrite components. Just gate visibility.
* "Coming Soon" is the user's chosen UX vocabulary — not "Disabled," not "Locked," not "Pro-only." Copy should consistently say "Coming Soon" (or close variants like "Coming back soon").

</specifics>

<deferred>
## Deferred Ideas

* **Phase 47.1 (or v4.0 entry): New Elite-vs-Pro differentiator.** Identify and ship a new Elite differentiator since Interview Prep is no longer the distinction. Candidates: outcome-prediction beta access (ties into Phase 42-46 database work), exclusive analysis depth, priority queue, premium support tier, higher monthly merit cap. Decision needed before the future Interview Prep milestone re-enables the feature, otherwise Elite tier double-counts.
* **Server-side Interview Prep API lockdown on prod.** Currently deferred (D-13). If, post-launch, anyone exploits direct API access, revisit and add a server-side env-flag check in the edge functions.
* **Cleanup of** **`LowBalanceWarning.tsx`** **Interview Prep references.** If the warning surface mentions Interview Prep merit costs, that reference might leak through on prod. Plan-phase to verify.
* **Telemetry for Coming Soon page views.** If product team wants to know how many users hit the gated route on prod (signal of demand for re-enable), add analytics. Not in scope for Phase 47.

### Reviewed Todos (not folded)

None — no todos surfaced via cross-reference for this phase.

</deferred>

***

*Phase: 47-interview-prep-prod-gate-elite-differentiation*
*Context gathered: 2026-05-05*
