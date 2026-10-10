# Phase 18: recruiting-lens-gating - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Make Recruiting Lens accessible only to Pro/Elite, with Pro seeing a deliberately limited preview and Elite seeing the full output, auto-detecting the user's last resume:

1. **Free tier gate** (RCL-01) — Free users see `<ProFeatureGate>` and cannot trigger analysis. Already partially implemented at `recruiting-lens/index.ts:175` with a 403 response.
2. **Pro limited preview** (RCL-02/03) — Pro gets `overallMatch`, full `recruiterVerdict`, `experienceAlignment` + `skillAlignment` as title+score only, first 2 `topGaps` with title/severity/whyItMatters (howItShowsUp and fixPriority locked), first 2 `resumeEdits`. Omits: `quickStrategicFixes`, `roadmap`, `matchedKeywords`, `missingKeywords`, `linkedinImprovements`, `finalAdvice`.
3. **Elite full output** (RCL-04) — All fields, full output, saved to `analysis_results` (already implemented).
4. **Tier-gated prompts** — Refactor `recruiting-lens-prompts.ts` to use conditional sections per tier, register with `loadPromptVariant` from Phase 14.
5. **Server-side tier shaper** — `applyRecruitingLensTierShape(merged, tier)` strips Elite-only fields from Pro responses as defense-in-depth.
6. **Auto-resume detection** (RCL-06) — Frontend queries `analysis_results` for the most recent resume analysis and pre-fills the textarea.
7. **Merit deduction** (RCL-05) — 8 Merits (Pro) / 5 Merits (Elite) via `withMerits` (already wired in handler).
8. **Per-tier maxTokens** — Pro 8000 / Elite 20000 (RCL-05, already partially in CALL_CONFIGS).

Closes: RCL-01, RCL-02, RCL-03, RCL-04, RCL-05, RCL-06, BACK-11.

**Out of scope for this phase:**

- Tier gating for any other feature — Phases 15 (resume), 16 (linkedin), 17 (career), 19 (interview prep).
- Phase 14's loader, tier-config, LockedSection/LockedListItem, ProFeatureGate — consumed, not modified.
- Phase 13's `withMerits`, `MERIT_SYSTEM_ENABLED`, refund taxonomy — consumed, not modified.
- Dashboard layout for Elite results — Phase 20 handles Merit UX and dashboard presentation.
- `/pricing` route destination — Phase 20.
- Changes to `recruiting-lens-merger.ts` beyond adding the tier shaper step.

</domain>

<decisions>
## Implementation Decisions

### Pro Output Shaping (Defense in Depth)

- **D-01:** Pro output shape is enforced at **both layers**: (a) Pro prompt variant instructs the model to produce only Pro-allowed fields, and (b) a server-side `applyRecruitingLensTierShape(merged, tier)` step strips any Elite-only keys from the merged JSON before returning. Matches Phase 15's `applyTierShape` pattern. A leaky prompt regression cannot reach a Pro user.
- **D-02:** `applyRecruitingLensTierShape` lives in `supabase/functions/_shared/recruiting-lens-merger.ts` as a new final step inside the merge function, receiving `tier` as a parameter. Single exit point means every caller benefits without remembering to invoke it.
- **D-03:** Pro allowed fields whitelist: `overallMatch` (full), `recruiterVerdict` (full), `subScores.experienceAlignment` and `subScores.skillAlignment` (score only, rationale stripped), first 2 `topGaps` (title/severity/whyItMatters only — `howItShowsUp` and `fixPriority` stripped), first 2 `resumeEdits`, `preAnalysis` (full). Everything else is stripped for Pro.
- **D-04:** Elite allowed fields: all fields, no stripping. The shaper is a no-op for Elite tier.

### Tier-Prompt Variant Structure

- **D-05:** Tier variants use **conditional sections within existing call suffixes**, not separate Pro/Elite suffix functions. The existing `buildCall3Suffix(isElite)` pattern already does this for LinkedIn improvements — extend across all three suffixes with a `tier` parameter. Less code duplication, single maintenance surface.
- **D-06:** Register the Recruiting Lens feature with Phase 14's `loadPromptVariant` loader under key `'recruiting_lens'`. The loader dispatches to the existing `buildRecruitingLensSystemBlock` with the resolved tier. No `_free` variant is needed since Free users are blocked entirely.
- **D-07:** `STRIVO_GLOBAL_AI_PRINCIPLES` auto-prepend for Pro/Elite is handled by the Phase 14 loader (D-03 from 14-CONTEXT) — Recruiting Lens does NOT manually inject it.

### Auto-Resume Detection (RCL-06)

- **D-08:** Auto-detection happens on the **frontend**. `RecruitingLens.tsx` queries `analysis_results` on mount via Supabase client: `WHERE analysis_type='resume_analysis' AND user_id=currentUser ORDER BY created_at DESC LIMIT 1`. Extracts resume text from `raw_response` and pre-fills the resume summary textarea.
- **D-09:** The user retains full control — the pre-filled text is editable, and the user can replace it with a manual paste or PDF upload. Auto-detection is a convenience, not a constraint.
- **D-10:** If no prior resume analysis exists, the textarea remains empty with its current placeholder text. No error or warning — the user simply fills it in manually as before.

### Pro Locked-Field UI

- **D-11:** Locked fields within gap cards (`howItShowsUp`, `fixPriority`) render using **inline `<LockedSection>`** per field inside each gap card. Example: `<LockedSection title="How It Shows Up" teaser="Upgrade to Elite for full gap analysis" requiredTier="elite" />`. Reuses the Phase 14 primitive directly — consistent visual language, no new component.
- **D-12:** The 6 omitted top-level sections (roadmap, quickStrategicFixes, keywords.matched, keywords.missing, linkedinImprovements, finalAdvice) each render as individual **`<LockedSection>`** placeholders for Pro users. Each shows its section title, a 1-sentence teaser of what Elite unlocks, and an upgrade CTA. Maximizes upgrade conversion by showing what Pro users are missing.
- **D-13:** `<LockedListItem>` is used for the capped arrays: `topGaps` shows items 1-2 as real content, items 3-5 as `<LockedListItem index={i} total={totalCount} label="Gap" requiredTier="elite" />`. Same for `resumeEdits` — items 1-2 real, remaining as locked items.

### Elite Dashboard Save

- **D-14:** The existing save to `analysis_results` (already implemented at `recruiting-lens/index.ts:244-253`) is sufficient. No new table or dedicated dashboard section needed in Phase 18. Dashboard presentation of Recruiting Lens results alongside other analyses is Phase 20's responsibility.

### Merit Deduction

- **D-15:** Merit costs are `{ pro: 8, elite: 5 }` per spec §4.4. The existing `withMerits` call at line 196-261 is already wired — Phase 18 updates the cost values to match the spec if they differ from what Phase 13 provisioned.
- **D-16:** `MERIT_SYSTEM_ENABLED=false` still runs the tier-gated output path. Only Merit deduction is gated on the flag. Legacy `checkAndRecordUsage` remains the fallback. Matches Phase 15 D-09 pattern.

### Tier Resolution

- **D-17:** Tier is resolved from `userContext.tier` as returned by `requireAuth`. The existing handler already uses this pattern (line 175, 181). If Phase 15 extracts a shared `resolveTier()` utility before Phase 18 executes, use it; otherwise keep the inline pattern.

### Claude's Discretion (Researcher / Planner decides)

- Exact `PRO_ALLOWED_FIELDS` list — planner cross-references RCL-02/03 spec against the actual `RecruitingLensOutput` type.
- Whether `applyRecruitingLensTierShape` is a standalone function or integrated into `mergeRecruitingLensResults` as an optional parameter.
- Exact teaser text for each `<LockedSection>` placeholder (roadmap, quickFixes, keywords, etc.) — planner writes copy.
- How the frontend detects total gap/edit count for `<LockedListItem>` rendering — the backend can include a `_meta.totalGaps` field, or the frontend can use a fixed count from the spec.
- Whether the conditional prompt sections use `if (tier === 'pro')` or `if (tier !== 'elite')` internally — same observable behavior.
- How `resumeSummary` text is extracted from `analysis_results.raw_response` — depends on the actual JSON shape stored by `analyze-resume`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spec (Source of Truth)

- `APIcontextdocuments/STRIVO_GSD_Milestone_Merit_System.docx` SS4.4 (per-tier field tables for Recruiting Lens), SS8.2 (tier maxTokens), SS8.3 (tier prompt variants), SS2.4 (auto-detect resume user flow context)

### Requirements

- `.planning/REQUIREMENTS.md` — RCL-01, RCL-02, RCL-03, RCL-04, RCL-05, RCL-06, BACK-11 (the 7 REQ-IDs Phase 18 closes)
- `.planning/ROADMAP.md` SS"Phase 18: recruiting-lens-gating" — 6 Success Criteria that VERIFICATION.md must prove TRUE

### Prior Phase Context (MUST read)

- `.planning/phases/14-tier-prompts-and-locked-section-primitive/14-CONTEXT.md` — D-01/D-02 (loader is the only import point), D-03 (auto-prepend of GLOBAL_AI_PRINCIPLES), D-05/D-06 (LockedSection/LockedListItem API), D-11/D-12 (tier-config.ts, getTimeout, getModel)
- `.planning/phases/15-resume-analysis-gating/15-CONTEXT.md` — D-01/D-04 (tier resolved server-side from subscriptions table), D-11/D-12 (applyTierShape defense-in-depth pattern), D-15 (allowed-fields whitelist approach)
- `.planning/phases/13-merit-enforcement-and-feature-flag/13-CONTEXT.md` — D-01 (withMerits in merit-gateway.ts), D-03 (gateway owns refund flow), D-06 (flag branching inside handler), D-07 (feature list includes recruiting_lens)

### Existing Code to Modify or Reuse

- `supabase/functions/recruiting-lens/index.ts` — primary target. Lines 22-33 (CALL_CONFIGS with Pro/Elite token budgets), 68-137 (executeParallelCalls), 175-181 (Free gate + isElite), 195-264 (Merit gateway branch), 266-382 (legacy path)
- `supabase/functions/_shared/recruiting-lens-prompts.ts` — refactor call suffixes with tier-conditional sections, register with loadPromptVariant
- `supabase/functions/_shared/recruiting-lens-merger.ts` — add applyRecruitingLensTierShape step
- `supabase/functions/_shared/tier-config.ts` (Phase 14) — import getModel, getTimeout, TIER_MAX_TOKENS
- `supabase/functions/_shared/tier-prompts.ts` (Phase 14) — register recruiting_lens feature with loadPromptVariant
- `supabase/functions/_shared/merit-gateway.ts` (Phase 13) — withMerits already imported and wired
- `src/pages/RecruitingLens.tsx` — add auto-resume query on mount, add LockedSection/LockedListItem rendering for Pro output, wire ProFeatureGate for Free users

### Design System

- `CLAUDE.md` SS Technology Stack — Radix UI, Tailwind CSS, shadcn/ui, Framer Motion, HSL CSS variables, semantic tokens. All new UI components must follow existing patterns.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`CALL_CONFIGS` + `executeParallelCalls`** (`recruiting-lens/index.ts:25-137`) — existing 3-way parallel fan-out with Pro/Elite token budgets already defined. Phase 18 updates the conditional tier-selection logic.
- **`mergeRecruitingLensResults`** (`_shared/recruiting-lens-merger.ts`) — natural home for the tier shaper step. Single exit point for merged output.
- **`buildRecruitingLensSharedPrefix` / `buildCallNSuffix`** (`_shared/recruiting-lens-prompts.ts`) — already has `isElite` conditional for Elite enhancements and LinkedIn improvements. Extend with `tier` parameter for Pro-specific field restrictions.
- **`<ProFeatureGate>`** (`src/components/ProFeatureGate.tsx`) — already imported in `RecruitingLens.tsx`. Free users are blocked at both frontend and backend.
- **`<LockedSection>` / `<LockedListItem>`** (Phase 14) — used inline for Pro locked fields and capped arrays.
- **`analysis_results` table** — already written to for Elite persistence (line 244-253). Also the source for auto-resume detection.

### Established Patterns

- **Parallel fan-out with merge + json-repair fallback** — existing pattern; Phase 18's tier shaper slots in after the merge step.
- **Phase 13 Merit gateway branching** — `MERIT_SYSTEM_ENABLED` flag branch already exists at line 195. Phase 18 updates cost values.
- **Tier-conditional prompt sections** — `buildCall3Suffix(isElite)` already demonstrates the pattern. Extend to all 3 suffixes.
- **Structured logging** — `log.info('request-start', { ... tier })` already in place.

### Integration Points

- **Phase 14 loader** — register `recruiting_lens` feature key so `loadPromptVariant('recruiting_lens', tier, params)` works.
- **Phase 14 LockedSection/LockedListItem** — consumed for frontend Pro rendering.
- **Phase 13 gateway** — already wired; update cost map if needed.
- **Phase 20** — delivers `/pricing` route that LockedSection CTAs point to, and full dashboard Merit UX.

</code_context>

<specifics>
## Specific Ideas

- The existing `CALL_CONFIGS` at lines 25-33 already define Pro/Elite token splits. Phase 18 keeps this structure and updates values to match the spec's `maxTokens` caps (Pro=8000, Elite=20000). The 3-way split within those caps is already reasonable (5500+5000+5500=16000 for Pro — needs adjustment to total 8000).
- The `isElite` boolean at line 181 becomes a `resolvedTier` that's either `'pro'` or `'elite'` — the Free gate at line 175 ensures only these two values reach the analysis logic.
- Auto-resume detection query on the frontend should use the same Supabase client auth session, so RLS filters to the current user's results automatically. No service-role client needed.
- The `howItShowsUp` and `fixPriority` field-level locks are the most novel UI element in this phase — they demonstrate `<LockedSection>` working at sub-card granularity, which is a pattern Phase 19 and 20 may also need.
- Pro's `subScores` rendering should show `experienceAlignment` and `skillAlignment` with score badges but no rationale text — the other 3 sub-scores (`impactStrength`, `keywordAndLanguageMatch`, `credibilityAndSeniorityFit`) are omitted entirely for Pro, per RCL-02.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 18-recruiting-lens-gating*
*Context gathered: 2026-04-16*
