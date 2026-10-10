# Phase 25 Discussion Log

**Date:** 2026-04-28
**Mode:** default (interactive)
**Phase:** 25 — ux-gap-closure-and-phase-23-cleanup

This log is a human-readable record of the discuss-phase Q&A. CONTEXT.md is the canonical artifact consumed by downstream agents.

---

## Area selection

**Question:** Which gray areas to discuss for Phase 25?

**Options presented:**
- Orphan MeritBalanceBadge (SC-7)
- Shared low-balance warning (SC-2)
- OutOfMeritsModal wiring (SC-3)
- Phase 23 cleanup choices (SC-8)

**User selected:** All four.

---

## Area 1 — Orphan MeritBalanceBadge (SC-7)

**Q:** MeritBalanceBadge.tsx is the older v1 badge with amber/red low-balance styling. MeritBalanceHeaderV2 (already wired in TopBar) is the canonical header per Phase 24 SC-10 but doesn't visually flash amber/red. Pick the simpler path.

**Options:**
- Delete orphan, port amber/red into V2 (Recommended)
- Repurpose orphan as UX-03 shared warning
- Delete orphan, build separate LowBalanceWarning

**User selected:** Delete orphan, port amber/red into V2.

**Notes:** Single source of truth in the header. Smallest blast radius. Captured as D-01, D-02, D-03 in CONTEXT.md.

---

## Area 2 — Shared low-balance warning (SC-2)

**Q:** Where does the shared amber warning UI (banner with dual CTAs) live, given V2 already carries the trigger color?

**Options:**
- New `<LowBalanceWarning />` banner component (Recommended)
- Fold into `MeritCostPreview`
- Inside V2 popover only (violates SC-2)

**User selected:** New `<LowBalanceWarning />` banner component.

**Notes:** Standalone, mounted under TopBar on dashboard + above Analyze CTA on each feature page. Threshold = `total < 2× cheapest applicable feature cost`. Captured as D-04, D-05, D-06, D-07 in CONTEXT.md.

---

## Area 3 — OutOfMeritsModal wiring (SC-3)

**Q:** UpgradeModal lives in Upload (feature flow), usePaywallGuard (feature flow), TopBar/Navbar/Profile (generic CTAs). useOutOfMeritsModal needs `{feature, cost, balance}`. How do we treat the non-feature surfaces?

**Options:**
- Replace generic CTAs with `/pricing` link, delete UpgradeModal (Recommended)
- Keep UpgradeModal scoped to non-feature surfaces only
- Make UpgradeModal a thin forwarder to OutOfMeritsModalV2

**User selected:** Replace generic CTAs with `/pricing` link, delete UpgradeModal.

**Notes:** Cleanest closure. No dead modal hanging around. Feature flows route through useOutOfMeritsModal; generic CTAs become `<Link to="/pricing">`. Captured as D-08, D-09, D-10, D-11 in CONTEXT.md.

---

## Area 4 — Phase 23 cleanup (SC-8)

### Sub-question 4a — Stub validators

**Q:** validateFlashcards/validateQuizQuestions throwing stubs in interview-prep-validation.ts:192-197. Replace or document?

**Options:**
- Delete the throwing stubs (Recommended)
- Replace with real validators that delegate
- Keep stubs, add explicit no-op shim docs + ticket

**User selected:** Delete the throwing stubs.

**Notes:** Zero live callers. Captured as D-12, D-13 in CONTEXT.md.

### Sub-question 4b — Test hangs

**Q:** 5 hung form-submission tests in InterviewPrep.test.tsx — fix the hang or it.skip + ticket?

**Options:**
- it.skip with TODO + tracking ticket (Recommended)
- Investigate and fix the hang
- Delete the 5 tests entirely

**User selected:** it.skip with TODO + tracking ticket.

**Notes:** Phase 25 is gap closure, not test-infra surgery. Captured as D-14, D-15 in CONTEXT.md.

---

## Continuation — meta-decisions

### SC-9 runbook overlap with Phase 27

**Q:** SC-9 runbook reminder overlaps with Phase 27 SC-4. How should Phase 25 treat this?

**Options:**
- Add the step in Phase 25, idempotent (Recommended)
- Defer SC-9 to Phase 27
- Add full delete invocation, not just a reminder

**User selected:** Add the step in Phase 25, idempotent.

**Notes:** Idempotent edit (grep-before-append) keeps both phases safe regardless of ship order. Captured as D-16, D-17, D-18 in CONTEXT.md.

### Audit-trail artifact location

**Q:** Where does the audit-trail artifact live for SC-4 and SC-5 evidence?

**Options:**
- Single 25-AUDIT-TRAIL.md + plan SUMMARY frontmatter (Recommended)
- Inline in 25-VERIFICATION.md only
- Per-plan SUMMARY frontmatter only

**User selected:** Single 25-AUDIT-TRAIL.md + plan SUMMARY frontmatter.

**Notes:** Matches existing convention from phases 20+. Captured as D-21, D-22, D-23 in CONTEXT.md.

---

## Closing

**Q:** Ready for context, or explore more gray areas?

**User selected:** I'm ready for context.

CONTEXT.md written. STATE.md updated. Phase 25 ready for `/gsd-plan-phase 25`.

---

## Deferred Ideas (carry-forward)

- Test-infra fix for the jsdom/rhf/framer-motion hang (real fix, not skip).
- Generic `<PlanUpsellPrompt />` replacement for non-feature upgrade surfaces.
- Animated balance transition on V2 trigger color change.
- Tier-aware `cheapestApplicableCost` helper formalized in `useMerits`.
- Auto-running `supabase functions delete interview-prep-coach` from the runbook.

## Claude's Discretion (carry-forward)

- Exact Tailwind tokens for `LowBalanceWarning` (semantic CSS vars vs raw).
- `LowBalanceWarning` `feature?` prop (specialized vs generic copy).
- Hard-delete vs deprecated-alias for `usePaywallGuard.showUpgradeModal`.
- Backlog-ticket storage mechanism for the InterviewPrep.test.tsx skip.
- Test-file location for the useMerits affordability test.
- Runbook reminder voice (`Write-Note` line vs fenced block).
- Plan split granularity (3 plans suggested by ROADMAP, planner may regroup).
