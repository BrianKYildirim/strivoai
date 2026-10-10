# Phase 25: ux-gap-closure-and-phase-23-cleanup - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Close 7 outstanding UX-* REQ-IDs (UX-01/02/03/04/09/10/11) surfaced by the v2.0 milestone audit and clean up Phase 23's deferred items so v2.0 can archive without orphan components or dangling test debt. Nine Success Criteria (SC-1..SC-9) lock the WHAT — this phase only decides HOW to wire and what to delete.

Concrete surface delivered:

1. **CareerCompass MeritCostPreview wiring** (SC-1, UX-02) — `src/pages/CareerCompass.tsx` imports and renders `<MeritCostPreview />` above the Analyze CTA matching the pattern used by the other 5 feature pages.
2. **Shared low-balance warning component** (SC-2, UX-03) — New `<LowBalanceWarning />` consumed by both the dashboard header (under TopBar) and each feature page (above Analyze CTA, beside MeritCostPreview). Trigger condition `total < 2× cheapest available feature cost` per spec §7.1.
3. **OutOfMeritsModal rewire** (SC-3, UX-04) — `useOutOfMeritsModal` wired into all feature flows currently calling legacy `UpgradeModal` (Upload, usePaywallGuard). Generic upgrade CTAs in TopBar/Navbar/Profile swapped for `<Link to="/pricing">`. `UpgradeModal.tsx` deleted entirely.
4. **MeritBalanceHeaderV2 amber/red states + orphan delete** (SC-4 + SC-7, UX-01) — Port `isLow`/`isZero` color states from the orphan `MeritBalanceBadge.tsx` into the canonical `MeritBalanceHeaderV2.tsx` trigger label. Then delete `MeritBalanceBadge.tsx` and `MeritBalanceBadge.test.tsx`. Back-register UX-01 in plan SUMMARY frontmatter + 25-AUDIT-TRAIL.md.
5. **UX-09 / UX-10 back-registration** (SC-5) — No new code. Document that Phase 23's `StreakDisplay` (`InterviewStreakDisplay.tsx`) and Interview Prep Elite UI close UX-09 and UX-10 in the plan SUMMARY frontmatter and 25-AUDIT-TRAIL.md.
6. **useMerits affordability invariant test** (SC-6, UX-11) — Vitest unit test asserting (a) `affordable(feature)` reactively flips false when balance drops below cost, and (b) post-deduction balance is consistent within 5s.
7. **Phase 23 stub validator cleanup** (SC-8a) — Delete `validateFlashcards` and `validateQuizQuestions` throwing stubs in `supabase/functions/_shared/interview-prep-validation.ts:192-197` (zero live callers).
8. **Phase 23 test hang cleanup** (SC-8b) — Mark the 5 hung form-submission tests in `InterviewPrep.test.tsx` with `it.skip`, add a TODO referencing a backlog ticket explaining the jsdom/rhf/framer-motion interaction.
9. **Phase 21 runbook reminder** (SC-9) — Add a `supabase functions delete interview-prep-coach --project-ref <STAGING and PROD>` operator reminder to `scripts/phase21-runbook.ps1` Gate D4-Finalize, written idempotently so a later Phase 27 edit becomes a no-op.

Closes: UX-01, UX-02, UX-03, UX-04, UX-09, UX-10, UX-11.

**Out of scope for this phase:**

- Async-job merit refund wiring (MER-11) — Phase 26 owns this.
- Stripe-webhook 410-Gone shim, Stripe URL pin, Phase 21 cutover notes — Phase 27 owns these.
- Operator execution of `supabase functions delete interview-prep-coach` itself — runbook reminder only; operator runs the command.
- Test-infra surgery on the jsdom/rhf/framer-motion hang itself — deferred via `it.skip` ticket.
- Any new UX surfaces, tier changes, or merit-economy retuning — locked by Phase 24.

</domain>

<decisions>
## Implementation Decisions

### Orphan MeritBalanceBadge resolution (SC-7, UX-01)

- **D-01:** Delete `src/components/MeritBalanceBadge.tsx` and `src/components/MeritBalanceBadge.test.tsx`. The orphan v1 badge is removed entirely; `MeritBalanceHeaderV2` (already wired in `TopBar.tsx:9,151`) becomes the single source of truth for the header balance display.
- **D-02:** Port the `isLow` (amber) and `isZero` (red/destructive) trigger styling from the orphan into `MeritBalanceHeaderV2.tsx` so the canonical header visually flags low/zero balance. Reuse the same Tailwind tokens the orphan uses (`bg-amber-500/10 text-amber-500 border-amber-500/30` for low; `bg-destructive/10 text-destructive border-destructive/30` for zero).
- **D-03:** The amber/red color treatment on V2's trigger is the ONLY UX-03-related change to the header. The actual warning UI (banner + dual CTA buttons) lives in a separate component (D-04) so it can be reused on feature pages.

### Shared low-balance warning component (SC-2, UX-03)

- **D-04:** Create new `src/components/LowBalanceWarning.tsx` — a standalone amber banner rendering "Running low — X Merits left" + `[Buy Merits]` (→ `/shop`) + `[Upgrade]` (→ `/pricing`) CTAs.
- **D-05:** Mounted in two places: (a) under `TopBar` on dashboard layouts (above main content, conditional on `isLow`), (b) above the Analyze CTA on each feature page (next to / above `MeritCostPreview`, conditional on `isLow`).
- **D-06:** Trigger threshold: `total < 2 × min(applicable feature costs)` per spec §7.1. Read costs from the same source `MeritCostPreview` uses (`getCostForFeature` / `merit_feature_costs`). The "applicable" set excludes features the user's tier cannot run (e.g., Free tier excludes recruiting-lens / interview-prep). Researcher to confirm the canonical hook surface.
- **D-07:** When `isZero`, the component switches copy/state to "Out of Merits" with the same two CTAs. This is the SAME component as UX-04's surface — `LowBalanceWarning` covers both UX-03 (amber low) and feeds UX-04's content (`OutOfMeritsModalV2` is the modal; `LowBalanceWarning` is the inline banner). The two are complementary, not duplicates.

### OutOfMeritsModal wiring + UpgradeModal removal (SC-3, UX-04)

- **D-08:** Wire `useOutOfMeritsModal` into all feature-flow consumers of legacy `UpgradeModal`:
  - `src/pages/Upload.tsx` — replace `UpgradeModal` + `showUpgradeModal` state with `useOutOfMeritsModal` + `<OutOfMeritsModalV2 {...modalProps} />`. The 402 trigger calls `openModal({ feature, cost, balance })`.
  - `src/hooks/usePaywallGuard.ts` — replace internal `showUpgradeModal` state with `useOutOfMeritsModal`. All hook consumers receive `modalProps` instead of the boolean toggle.
- **D-09:** Replace generic upgrade CTAs in non-feature surfaces with direct routing to `/pricing`:
  - `src/components/TopBar.tsx:211,234` — swap `setShowUpgradeModal(true)` for `<Link to="/pricing">` (or `useNavigate` push).
  - `src/components/Navbar.tsx:508,596,624` — same swap.
  - `src/pages/Profile.tsx:39,825` — same swap.
- **D-10:** After D-08 and D-09 land, delete `src/components/UpgradeModal.tsx`. Verify zero imports remain (`grep -rn "UpgradeModal" src` returns only the test file or empty).
- **D-11:** `OutOfMeritsModalV2`'s `{feature, cost, balance}` contract is preserved — no changes to the modal component itself.

### Phase 23 cleanup — stub validators (SC-8a)

- **D-12:** Delete the throwing stubs at `supabase/functions/_shared/interview-prep-validation.ts:192-197` (`validateFlashcards`, `validateQuizQuestions`). Pre-flight: grep confirms zero live callers in `supabase/` or `src/`. The deprecation intent is satisfied by the docstring on `validateInterviewPrepPayload` (the canonical replacement, already in the file at the top).
- **D-13:** Update `supabase/functions/_shared/__tests__/interview-prep-validation.test.ts` if it exercises the deprecated stubs — remove or replace those test cases.

### Phase 23 cleanup — InterviewPrep.test.tsx hangs (SC-8b)

- **D-14:** Mark the 5 form-submission click-through tests in `src/.../InterviewPrep.test.tsx` with `it.skip(...)`. Add a `// TODO(<ticket-id>): jsdom/rhf/framer-motion form-submission hang — see docs/tech-debt/<ticket>.md` comment above each.
- **D-15:** Create a tracking ticket / backlog entry capturing: file path, root-cause hypothesis (framer-motion animation hooks awaiting absent rAF; or rhf async resolver), reproduction steps, candidate fixes (mock framer-motion in test setup; stub `requestAnimationFrame`). The ticket is documentation, not implementation. Researcher/planner picks the storage location (gsd-add-todo, .planning/backlog, or repo-local docs) per existing convention.

### Phase 21 runbook reminder (SC-9)

- **D-16:** Modify `scripts/phase21-runbook.ps1` `Stage-D4-Finalize()` (around lines 725-771) to print/include a reminder for the operator to run `supabase functions delete interview-prep-coach --project-ref <staging-ref>` AND `--project-ref <production-ref>`.
- **D-17:** Implementation is idempotent — if Phase 27 SC-4 also ships this edit, the second pass detects the existing reminder text and is a no-op. Idempotency check: grep for `interview-prep-coach` in `Stage-D4-Finalize` body before appending.
- **D-18:** Reminder is text/echo only — does NOT execute the delete. Operator runs the command. SC-9 explicitly says "reminds the operator".

### useMerits affordability invariant test (SC-6, UX-11)

- **D-19:** Add a Vitest unit test (location: `src/hooks/useMerits.test.ts` or co-located test file — researcher to confirm existing convention) that asserts:
  - (a) `affordable(feature)` (or the equivalent surface, e.g., `canAfford(cost)`) reactively flips `false` when the balance drops below the feature cost. Use React Query's test utilities or a manual `QueryClientProvider` wrapper.
  - (b) Post-deduction balance is consistent within 5 seconds — exercises the `staleTime: 5_000` configuration via `act` + `vi.advanceTimersByTime`.
- **D-20:** The test must run via `npm run test` (Vitest). No live Supabase — mock the `get_merit_balance` RPC.

### Audit-trail artifact (SC-4, SC-5)

- **D-21:** Create `.planning/phases/25-ux-gap-closure-and-phase-23-cleanup/25-AUDIT-TRAIL.md` with rows for each UX-* REQ-ID closed in this phase. Columns: `REQ-ID | Closure plan | Evidence file:line | One-line note`. UX-01 evidence cites `src/components/TopBar.tsx:9,151` + `src/components/topup/MeritBalanceHeaderV2.tsx`. UX-09 evidence cites `src/components/InterviewStreakDisplay.tsx` + Phase 23 plan SUMMARYs. UX-10 evidence cites the same StreakDisplay + dashboard mount point.
- **D-22:** Each Phase 25 plan SUMMARY.md frontmatter back-registers its closing REQ-IDs in the `requirements:` field (existing convention seen in 20-XX, 24-XX SUMMARY files).
- **D-23:** Existing `v2.0-MILESTONE-AUDIT.md` is not edited by this phase — it is an audit snapshot. The next milestone audit re-reads REQUIREMENTS.md + SUMMARY frontmatter and will see the back-registrations automatically.

### Claude's Discretion

- The exact Tailwind tokens for `LowBalanceWarning` (amber palette match with V2 trigger; semantic CSS vars preferred over raw colors).
- Whether `LowBalanceWarning` accepts a `feature?` prop to specialize copy on feature pages, or stays generic.
- Whether the `useOutOfMeritsModal` migration in `usePaywallGuard` keeps the legacy `showUpgradeModal` boolean as a deprecated alias for one release, or hard-deletes immediately. Recommend hard-delete; consumers are limited and Phase 24 already shipped the replacement.
- The exact backlog-ticket storage mechanism for the InterviewPrep.test.tsx hang (gsd-add-todo vs .planning/backlog vs docs/tech-debt/).
- Test-file location for the useMerits affordability test (co-located vs `src/hooks/__tests__/`).
- Whether the runbook reminder is a `Write-Note` line or a fenced block — match the existing voice in `Stage-D4-Finalize`.
- Order of plan splits — likely 3 plans per ROADMAP suggestion (UX wiring; useMerits test; Phase 23 cleanup), but planner may regroup.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & Requirements

- `.planning/ROADMAP.md` §"Phase 25: ux-gap-closure-and-phase-23-cleanup (GAP CLOSURE)" — 9 Success Criteria (SC-1..SC-9) that VERIFICATION.md must prove TRUE.
- `.planning/REQUIREMENTS.md` — UX-01, UX-02, UX-03, UX-04, UX-09, UX-10, UX-11 (the 7 REQ-IDs Phase 25 closes). Lines 123-133.
- `.planning/v2.0-MILESTONE-AUDIT.md` — `tech_debt[phase=20]` (lines 158-161), `tech_debt[phase=23]` (lines 169-178). Source of the gaps Phase 25 closes.

### Spec (Source of Truth)

- `APIcontextdocuments/STRIVO_GSD_Milestone_Merit_System.docx` §7.1 (low-balance threshold = 2× cheapest feature cost; persistent header badge; cost previews; out-of-merits CTAs).

### Prior Phase Context (MUST read)

- `.planning/phases/20-merit-ux-shop-pricing-and-streak-ui/20-CONTEXT.md` — D-01..D-08 (TopBar badge + cost preview + low/zero pattern conventions); D-13..D-16 (Shop UX); D-21 (Stripe embedded checkout). Phase 25 inherits all of these conventions.
- `.planning/phases/23-interview-prep-runtime-overhaul/23-CONTEXT.md` — Streak component, Elite UI surfaces, throwing-stub validators (transitional), test hangs.
- `.planning/phases/24-pricing-merit-economy-and-top-up-packs-update-update-merits-/24-CONTEXT.md` — Phase 24 Plan 06 (SC-9a rewire) introduced `useOutOfMeritsModal` + `OutOfMeritsModalV2`. Phase 24 Plan 06 (SC-10) introduced `MeritBalanceHeaderV2`. Phase 25 finishes wiring both.
- `.planning/phases/21-integration-validation-and-cutover/21-CONTEXT.md` — Phase 21 cutover scripts that SC-9 modifies. Coordinate with Phase 27's overlapping edit.

### Existing Code to Modify or Delete

- `src/components/MeritBalanceBadge.tsx` + `src/components/MeritBalanceBadge.test.tsx` — DELETE (D-01).
- `src/components/topup/MeritBalanceHeaderV2.tsx` — modify trigger styling for `isLow`/`isZero` (D-02).
- `src/components/LowBalanceWarning.tsx` — NEW component (D-04).
- `src/components/UpgradeModal.tsx` — DELETE (D-10).
- `src/components/TopBar.tsx:9,211,234` — remove UpgradeModal usage; swap CTAs to `/pricing` link; mount `<LowBalanceWarning />` (D-05, D-09).
- `src/components/Navbar.tsx:16,68,508,596,624` — remove UpgradeModal usage; swap CTAs to `/pricing` (D-09).
- `src/pages/Profile.tsx:12,39,825` — remove UpgradeModal usage; swap CTA to `/pricing` (D-09).
- `src/pages/Upload.tsx:17,32,33,487` — replace UpgradeModal with `useOutOfMeritsModal` + `OutOfMeritsModalV2` (D-08).
- `src/hooks/usePaywallGuard.ts:26,107,112,113` — replace `showUpgradeModal` state with `useOutOfMeritsModal` (D-08).
- `src/pages/CareerCompass.tsx` — import + render `<MeritCostPreview />` above Analyze CTA (SC-1).
- All feature pages (CareerCompass, Upload, LinkedInGrader, RecruitingLens, SkillsGapAnalysis, InterviewPrep) — mount `<LowBalanceWarning />` above the Analyze CTA (D-05).
- `supabase/functions/_shared/interview-prep-validation.ts:192-197` — delete `validateFlashcards` and `validateQuizQuestions` stubs (D-12).
- `supabase/functions/_shared/__tests__/interview-prep-validation.test.ts` — prune any tests targeting the deleted stubs (D-13).
- `src/.../InterviewPrep.test.tsx` (frontend, location TBD by researcher) — `it.skip` 5 form-submission tests + TODO (D-14).
- `scripts/phase21-runbook.ps1` `Stage-D4-Finalize` (lines 725-771) — append idempotent operator reminder (D-16, D-17).
- `src/hooks/useMerits.ts` — no code change; new test file consumes its public surface (D-19).

### Design System

- `CLAUDE.md` § Coding Style — preserve existing TS/React patterns; semantic Tailwind tokens.
- `CLAUDE.md` § Reliability Priorities — small reversible changes, no new abstractions when a single helper suffices.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`MeritBalanceHeaderV2.tsx`** (Phase 24, SC-10) — already wired in `TopBar.tsx:9,151`. Carries the cap-format display ("47 / 75 + 15 bonus"). Phase 25 only adds `isLow`/`isZero` trigger color states.
- **`useMerits()` hook** (Phase 20, D-06) — already exposes `total`, `subscription`, `shop`, `isLow`, `isZero`, `cap`, `resetDate`. `LowBalanceWarning` and `MeritBalanceHeaderV2` both consume it. SC-6's affordability test exercises the `canAfford` surface.
- **`MeritCostPreview.tsx`** (Phase 20) — already mounted on 5 of 6 feature pages. Pattern is: `<MeritCostPreview feature="..." />` above the Analyze button. CareerCompass is the missing one (SC-1).
- **`useOutOfMeritsModal.ts`** (Phase 24 Plan 06) — feature-flow modal manager. Returns `{ openModal, closeModal, modalProps }`. Phase 25 wires it into Upload + usePaywallGuard.
- **`OutOfMeritsModalV2`** (Phase 24 Plan 06) — the modal component itself. No changes in Phase 25.
- **`InterviewStreakDisplay.tsx`** — Phase 23's streak surface. Phase 25 only back-registers UX-10 against it; no code change.
- **`scripts/phase21-runbook.ps1`** — operator runbook. `Stage-D4-Finalize` is the SC-9 mount point. Existing voice uses `Write-Step`, `Write-Note`, `Write-Ok`.

### Established Patterns

- **Semantic Tailwind tokens** — `bg-amber-500/10 text-amber-500 border-amber-500/30` (low) and `bg-destructive/10 text-destructive border-destructive/30` (zero) per the orphan badge convention. Match these in V2 + LowBalanceWarning.
- **React Query + RPC** — `useMerits` is a `useQuery` over `get_merit_balance`. SC-6 test mocks the RPC, no live Supabase.
- **Feature page composition** — `<MeritCostPreview />` then `<LowBalanceWarning />` (when `isLow`) directly above the `<Button>Analyze</Button>` CTA. Order matters for visual hierarchy.
- **PowerShell idempotent edit** — grep before append; existing patterns in scripts/ check for sentinel strings before appending blocks.

### Integration Points

- **Phase 24's `useOutOfMeritsModal` + `OutOfMeritsModalV2`** — Phase 25 consumes; no API change.
- **Phase 24's `MeritBalanceHeaderV2`** — Phase 25 augments trigger styling; format string preserved.
- **Phase 23's `InterviewStreakDisplay` + Elite quiz UI** — back-registration only; no edit.
- **Phase 27's runbook edit (SC-4)** — overlapping edit on same `Stage-D4-Finalize` block. D-17 idempotency keeps both passes safe regardless of ship order.
- **Phase 26 (async-job merit refund)** — independent; no shared surfaces with Phase 25.

</code_context>

<specifics>
## Specific Ideas

- The orphan `MeritBalanceBadge.tsx:15-19` carries the exact Tailwind token recipe to port into V2: `bg-destructive/10 text-destructive border-destructive/30` for zero, `bg-amber-500/10 text-amber-500 border-amber-500/30` for low, `bg-primary/10 text-primary border-primary/20` for normal. Lift these directly so V2's "neutral" trigger only differs from the orphan in the format string, not the color treatment.
- `LowBalanceWarning` should NOT have its own `useMerits` call when consumed inside a page that already calls `useMerits` — but the simplest implementation IS to call the hook internally (React Query deduplicates by `queryKey`). Trade clarity over micro-optimization.
- The "applicable feature costs" set for the threshold (D-06) is tier-dependent: Free excludes recruiting-lens + interview-prep; Pro/Elite include everything. Researcher to confirm whether `useMerits` already returns `cheapestApplicableCost` or if `LowBalanceWarning` needs to compute it from `merit_feature_costs` + tier.
- `usePaywallGuard.ts` returns `{ showUpgradeModal, setShowUpgradeModal }` to its consumers (line 112-113). Migrating to `useOutOfMeritsModal` changes the contract — the hook will return `modalProps` and `openModal` instead. All callers of `usePaywallGuard` must be updated in the same plan to keep the build green.
- The `MeritBalanceBadge.test.tsx` exists but tests an orphan. After deleting both files, run `npm run test` to confirm no other test imports the badge.
- The Phase 27 SC-4 runbook edit modifies the same Gate D4-Finalize block. Phase 25 D-17 mandates idempotency (grep-before-append). Concretely: search for `interview-prep-coach` in the Stage-D4-Finalize function body; if absent, append the reminder block; if present, skip.
- `validateInterviewPrepPayload` (the canonical replacement for the throwing stubs) is in the SAME file as the stubs (`interview-prep-validation.ts` top of file). Confirm via Read before deleting the stubs.
- The 5 `it.skip` annotations in `InterviewPrep.test.tsx` should preserve test names and structure so the next test-infra pass can flip `it.skip` → `it` without rewriting the test bodies.
- For SC-6 affordability test: use Vitest's `describe`/`it` + `@testing-library/react` + a `QueryClientProvider` wrapper. Mock `useMerits` indirectly via `vi.mock('@/lib/supabase')` returning a stub `get_merit_balance` response. The `5s consistency` assertion uses `vi.useFakeTimers()` + `vi.advanceTimersByTime(5000)`.
- The `25-AUDIT-TRAIL.md` artifact is a new file in this phase's directory, NOT in `.planning/` root. Format follows the existing Phase 20-VERIFICATION audit-trail rows.

</specifics>

<deferred>
## Deferred Ideas

- **Test-infra fix for the jsdom/rhf/framer-motion hang** — Phase 25 only marks tests `it.skip`. Real fix requires investigating framer-motion's animation hooks under jsdom; deferred to a future phase or a dedicated test-infra ticket.
- **`UpgradeModal` replacement for the `/pricing` redirect** — if a future surface needs an inline upgrade prompt that ISN'T tied to a 402 response, a new generic `<PlanUpsellPrompt />` could be introduced. Not in scope for Phase 25.
- **Animated balance transition on V2 trigger color change** — when balance crosses the threshold, a brief flash/transition on the V2 trigger. Nice-to-have, deferred.
- **Tier-aware `cheapestApplicableCost` helper in `useMerits`** — if not already present, formalize as a hook surface. Phase 25 adds it inline to `LowBalanceWarning` if absent; future phase can promote.
- **Auto-running `supabase functions delete interview-prep-coach`** — SC-9 deliberately keeps this operator-gated. Future automation could ship a `Confirm-Or-Exit` block that runs the delete, but it's not in spec.
- **Stub validator removal in test file** — if the test file is large, just prune the deprecated test cases; if minimal, full file rewrite. Planner picks.

</deferred>

---

*Phase: 25-ux-gap-closure-and-phase-23-cleanup*
*Context gathered: 2026-04-28*
