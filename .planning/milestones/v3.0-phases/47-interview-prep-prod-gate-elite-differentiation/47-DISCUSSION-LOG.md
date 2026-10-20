# Phase 47: Interview Prep Production Gate + Elite Tier Differentiation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-05
**Phase:** 47-interview-prep-prod-gate-elite-differentiation
**Areas discussed:** Coming Soon scope + pricing copy, Flag mechanism, Elite differentiator strategy, Backend gating + Phase 41 status

---

## Up-front user brief

> "This phase includes the effective removal of interview prep for now, as I have future plans for interview prep that will change everything. So, I need to defer everything to a later milestone that is currently under construction for interview prep, but I need the logic to maintain intact. For production, it should show a 'Coming Soon' display. For staging, it should have the feature fully as is in the staging branch, not covered by a 'Coming Soon' display."

This brief locked the high-level approach (Coming Soon on prod, fully exposed on staging, code stays in repo) before discussion began. The four selected areas refined the implementation specifics.

---

## Coming Soon scope + pricing copy

### Surface placement (multi-select)

| Option | Description | Selected |
|--------|-------------|----------|
| Route page (/interview-prep) | Replace InterviewPrep page with Coming Soon placeholder so direct URLs / bookmarks land on a meaningful page. | ✓ |
| Dashboard / Explore tile (visible badge) | Keep tile visible but disabled with "Coming Soon" badge. | ✓ |
| Nav link with "Coming Soon" tooltip | Keep nav item visible but disabled with tooltip. | ✓ |
| Pricing feature list "Coming Soon" tag | Keep Interview Prep bullet in Pro/Elite lists with "Coming Soon" badge. | ✓ |

**User's choice:** All four selected. Coming Soon treatment goes everywhere, not just the route.
**Notes:** This overrides ROADMAP success criterion #1 (which said redirect/404). Roadmap text needs updating.

### Pricing config (single-select)

| Option | Description | Selected |
|--------|-------------|----------|
| Leave config untouched, hide in UI only | pricing-config.ts unchanged; UI conditionally renders rows when flag is on. | ✓ |
| Strip Interview Prep rows from pricing UI on prod | UI omits rows; config stays as source of truth. | |
| Replace Interview Prep row with "Coming Soon" line | UI shows placeholder bullet without merit cost. | |

**User's choice:** Leave config untouched, hide in UI only.
**Notes:** Re-enable path is a single flag flip — config doesn't need editing.

### History entries (single-select)

| Option | Description | Selected |
|--------|-------------|----------|
| Hide Interview Prep entries from history list on prod | Filter out interview_prep type entries. Records stay in DB. | ✓ |
| Show entries but disable open/re-run actions | Records visible with "read-only" badge. | |
| Show entries normally, allow viewing past results read-only | Bypass gate for historical detail views. | |

**User's choice:** Hide entries entirely on prod when flag off.

---

## Flag mechanism

### Flag source (single-select, asked twice — first round answers were freeform context, second round picked an option)

| Option | Description | Selected |
|--------|-------------|----------|
| VITE_FEATURE_INTERVIEW_PREP per Vercel env | Set per Vercel environment scope; auto-applied based on branch. | ✓ |
| VITE_VERCEL_ENV (mirror Vercel's VERCEL_ENV) | Generic env-mirror; reusable across feature gates. | |
| Explicit flag + VERCEL_ENV fallback | Defensive layered approach. | |

**User's first-round freeform context:** "Production environment is synched with the main branch. Staging environment is synched with the preview and staging branches. Vercel automatically decides based on what branch was just updated."
**Resolution:** Re-asked the question with that deployment topology framed. User picked the explicit per-Vercel-env flag.

### Helper shape (single-select)

| Option | Description | Selected |
|--------|-------------|----------|
| Single isInterviewPrepEnabled() helper | One function in src/config/feature-flags.ts; all surfaces import from it. | ✓ |
| useFeatureFlag('interviewPrep') hook + flags object | Generic flags map and hook for reuse. | |
| Inline import.meta.env checks per surface | Each surface does its own check. | |

**User's choice:** Single helper. Easy to grep + delete when re-enabling.

### Default behavior (single-select)

| Option | Description | Selected |
|--------|-------------|----------|
| Default OFF (hide — fail closed) | Missing flag = treated as production. | ✓ |
| Default ON (show — fail open) | Missing flag = show feature. | |

**User's choice:** Fail closed.

---

## Elite differentiator strategy

### Differentiator timing (single-select)

| Option | Description | Selected |
|--------|-------------|----------|
| Defer differentiator; ship gate-only in Phase 47 | Phase 47 = gate + Coming Soon + pricing copy only. New differentiator gets a follow-up phase. Roadmap criterion #3 relaxed/split. | ✓ |
| Decide differentiator now in this discussion | Lock new differentiator here; ship together with gate. | |
| Tie differentiator to v4.0 database/outcome-prediction work | Phase 42-46 outcome predictions become Elite-only. | |

**User's choice:** Defer to follow-up.
**Notes:** Roadmap success criterion #3 is descoped from Phase 47.

### Pro/Elite parity (single-select)

| Option | Description | Selected |
|--------|-------------|----------|
| Keep existing differentiators (merit caps, Recruiting Lens depth) | Lean on what already differs between tiers. | ✓ |
| Show "Coming Soon: New Elite Feature" placeholder | Pricing page hints at upcoming differentiator. | |
| No copy change — Elite tier loses Interview Prep silently | Just remove the bullet, no replacement. | |

**User's choice:** Keep existing differentiators.

### Phase 41 status (single-select)

| Option | Description | Selected |
|--------|-------------|----------|
| Supersede Phase 41 entirely | Mark Phase 41 superseded in STATE.md. In-flight work stops. | ✓ |
| Re-scope Phase 41 to staging-only verification | Keep Phase 41 work but verify on staging only. | |
| Defer Phase 41 to future Interview Prep milestone | Phase 41 paused, REQ-IDs move to parking lot. | |

**User's choice:** Supersede entirely.

---

## Backend gating + roadmap

### Backend gate (single-select)

| Option | Description | Selected |
|--------|-------------|----------|
| Frontend gate only — edge functions stay reachable | interview-prep-* functions remain deployed and callable on prod; no UI surfaces them. | ✓ |
| Server-side env-flag check that mirrors frontend | Edge functions return 404/403 on prod based on env var. | |
| Stop deploying interview-prep-* to prod Supabase | Functions only ship to staging Supabase project. | |

**User's choice:** Frontend-only gate. Logic stays intact; re-enable is a one-flag flip.

### Re-enable path (single-select)

| Option | Description | Selected |
|--------|-------------|----------|
| Flip VITE_FEATURE_INTERVIEW_PREP=true in Vercel prod | Single env var change + redeploy. No code change. | ✓ |
| Flip flag + run new milestone's code changes | Future milestone owns its own re-enable mechanics. | |

**User's choice:** One-flag flip.

### Roadmap parking lot (single-select)

| Option | Description | Selected |
|--------|-------------|----------|
| Update ROADMAP.md now (in CONTEXT.md scope) | Refine parking-lot trigger conditions during this phase. | ✓ |
| Leave as-is; refine during PLAN.md | Defer roadmap text edits to planner. | |

**User's choice:** Update now. CONTEXT.md captures the refinements (D-17, D-18); planner / executor applies them to ROADMAP.md.

---

## Claude's Discretion

- Exact filename / location of `isInterviewPrepEnabled()` helper (likely `src/config/feature-flags.ts`)
- Visual design of Coming Soon badge / page / tooltip (semantic design tokens, planner picks specifics)
- Whether to share a single `<ComingSoonBadge />` primitive across surfaces or treat each surface independently
- Test specifics beyond "unit tests for helper + visual surface tests"

## Deferred Ideas

- **Phase 47.1 / v4.0:** Identify and ship new Elite-vs-Pro differentiator. Required before re-enabling Interview Prep on prod.
- **Server-side Interview Prep API lockdown on prod.** Revisit only if direct API exploitation surfaces post-launch.
- **`LowBalanceWarning.tsx` Interview Prep merit-cost references.** Plan-phase to verify no copy leaks on prod.
- **Coming Soon page view telemetry.** Optional analytics signal for re-enable demand. Out of scope.
