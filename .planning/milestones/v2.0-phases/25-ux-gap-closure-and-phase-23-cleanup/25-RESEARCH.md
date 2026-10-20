# Phase 25: ux-gap-closure-and-phase-23-cleanup — Research

**Researched:** 2026-04-28
**Domain:** Frontend UX wiring + cleanup (React 18 / TS / shadcn / Vitest); shared validator cleanup (Deno); PowerShell runbook edit
**Confidence:** HIGH

## Summary

Phase 25 is a wire-up + cleanup phase, not a design phase. CONTEXT.md (D-01..D-23) is exhaustive and locked; this research confirms each surface against the real codebase and surfaces three concrete drift findings the planner must absorb before splitting plans.

**Key drift findings (HIGH confidence):**

1. **`useMerits` does not export `affordable(feature)` or `cheapestApplicableCost`** — the existing surface is `canAfford(cost: number)`. The SC-6 / D-19 unit test must target `canAfford(cost)`, not `affordable(feature)`. CONTEXT.md D-19 already softens this to "or the equivalent surface" so no plan change is needed, but the test signature is locked by the existing hook.
2. **`useMerits.isLow` is computed against subscription cap (20%), NOT the spec's `total < 2× cheapest applicable cost`** — `useMerits.ts:73` reads `cap > 0 && subscription / cap <= 0.2`. The Phase 25 D-06 trigger must therefore be computed inside `LowBalanceWarning` (or a new helper), NOT by reading `isLow` off `useMerits`. Treat `useMerits.isLow` as the existing 20% Phase 24 nudge — it stays as-is.
3. **`InterviewPrep.test.tsx` has NO 5 form-submission `it()` blocks to convert to `it.skip()`** — the file deliberately omits them per the comment at lines 4–7 and the closing comment at lines 180–183 ("Form-submission path is covered via reducer contract in SUMMARY.md Deviations"). The 5 hung tests CONTEXT.md / v2.0-MILESTONE-AUDIT references were never written; they were skipped during Phase 23 by exclusion, not by `it.skip`. **D-14 is therefore a no-op for the test file** — there is nothing to mark. The cleanup work for SC-8b is reduced to: (a) extend the existing comment block with the backlog ticket reference (D-15), or (b) recognize the gap is already documented in-file and only the backlog ticket itself needs creation. Recommend (a) for explicit traceability.

**Primary recommendation:** Three plans, matching the ROADMAP suggestion:

- **Plan 25-01** — UX wiring (CareerCompass MeritCostPreview + LowBalanceWarning + UpgradeModal removal + V2 trigger color states + orphan delete). 6 SCs, 1 wave, ~10 files.
- **Plan 25-02** — useMerits affordability invariant test (Vitest, 1 file).
- **Plan 25-03** — Phase 23 cleanup (validator stub delete + backlog-ticket file + InterviewPrep.test.tsx comment update + Phase 21 runbook reminder + 25-AUDIT-TRAIL.md).

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Orphan MeritBalanceBadge resolution (SC-7, UX-01):**
- D-01: Delete `src/components/MeritBalanceBadge.tsx` AND `src/components/MeritBalanceBadge.test.tsx`. `MeritBalanceHeaderV2` (already wired in `TopBar.tsx:9,151`) becomes the single header source.
- D-02: Port `isLow` (amber: `bg-amber-500/10 text-amber-500 border-amber-500/30`) and `isZero` (red: `bg-destructive/10 text-destructive border-destructive/30`) trigger styling from the orphan into `MeritBalanceHeaderV2.tsx`.
- D-03: V2's amber/red trigger color is the ONLY UX-03 change to the header. The full warning banner lives in a separate `LowBalanceWarning` component (D-04).

**Shared low-balance warning component (SC-2, UX-03):**
- D-04: Create `src/components/LowBalanceWarning.tsx` — amber banner with "Running low — X Merits left" + `[Buy Merits]` (→ `/shop`) + `[Upgrade]` (→ `/pricing`).
- D-05: Mounted in TWO places — (a) under `TopBar` on dashboard layouts (above main content, conditional on `isLow`), (b) above the Analyze CTA on each feature page (next to `MeritCostPreview`, conditional on `isLow`).
- D-06: Trigger threshold = `total < 2 × min(applicable feature costs)`. "Applicable" set excludes features the user's tier cannot run (Free excludes recruiting-lens / interview-prep).
- D-07: When `isZero`, component switches copy to "Out of Merits" with the same two CTAs. Complementary to OutOfMeritsModalV2 (modal vs. inline).

**OutOfMeritsModal wiring + UpgradeModal removal (SC-3, UX-04):**
- D-08: Wire `useOutOfMeritsModal` into `Upload.tsx` and `usePaywallGuard.ts` (replacing `showUpgradeModal` boolean).
- D-09: Replace generic upgrade CTAs in `TopBar.tsx:211,234`, `Navbar.tsx:508,596,624`, `Profile.tsx:39,825` with `<Link to="/pricing">` (or `useNavigate` push).
- D-10: After D-08 + D-09 land, delete `src/components/UpgradeModal.tsx`. Verify zero imports remain.
- D-11: `OutOfMeritsModalV2`'s `{feature, cost, balance}` contract is preserved.

**Phase 23 cleanup — stub validators (SC-8a):**
- D-12: Delete throwing stubs at `interview-prep-validation.ts:192-197` (`validateFlashcards`, `validateQuizQuestions`). Pre-flight grep confirms zero live callers.
- D-13: Update `__tests__/interview-prep-validation.test.ts` if it exercises the deleted stubs.

**Phase 23 cleanup — InterviewPrep.test.tsx (SC-8b):**
- D-14: Mark 5 form-submission tests with `it.skip(...)` + TODO comment.
- D-15: Create tracking ticket capturing root-cause hypothesis, repro, candidate fixes.

**Phase 21 runbook reminder (SC-9):**
- D-16: Modify `Stage-D4-Finalize()` (lines 725–771) to print reminder for `supabase functions delete interview-prep-coach --project-ref <staging-ref>` AND `--project-ref <production-ref>`.
- D-17: Idempotent — grep before append; second pass (Phase 27 SC-4) is no-op.
- D-18: Reminder is text/echo only — does NOT execute the delete.

**useMerits affordability invariant test (SC-6, UX-11):**
- D-19: Vitest unit test asserting (a) `affordable(feature)` (or `canAfford(cost)`) reactively flips false when balance drops below cost; (b) post-deduction balance consistent within 5 s.
- D-20: Run via `npm run test`. Mock `get_merit_balance` RPC; no live Supabase.

**Audit-trail artifact (SC-4, SC-5):**
- D-21: Create `25-AUDIT-TRAIL.md` with rows for each closed UX-* REQ-ID. Columns: `REQ-ID | Closure plan | Evidence file:line | One-line note`.
- D-22: Each plan SUMMARY.md frontmatter back-registers its closing REQ-IDs in the `requirements:` field.
- D-23: `v2.0-MILESTONE-AUDIT.md` is NOT edited — it's an audit snapshot.

### Claude's Discretion

- Exact Tailwind tokens for `LowBalanceWarning` (semantic CSS vars preferred).
- Whether `LowBalanceWarning` accepts a `feature?` prop or stays generic.
- Whether `usePaywallGuard` migration keeps the legacy `showUpgradeModal` boolean as a deprecated alias for one release, or hard-deletes (recommend hard-delete).
- Backlog-ticket storage mechanism for InterviewPrep.test.tsx hang (gsd-add-todo vs `.planning/backlog` vs `docs/tech-debt/`).
- Test-file location for useMerits affordability test (co-located vs `__tests__/`).
- Runbook reminder voice (`Write-Note` line vs fenced block).
- Plan split order (likely 3 plans).

### Deferred Ideas (OUT OF SCOPE)

- Test-infra fix for jsdom/rhf/framer-motion hang (Phase 25 only documents).
- `UpgradeModal` replacement for non-402 inline upgrade prompts (`<PlanUpsellPrompt />`).
- Animated balance transition on V2 trigger color change.
- Tier-aware `cheapestApplicableCost` helper formalized in `useMerits` (Phase 25 keeps it inline).
- Auto-running `supabase functions delete interview-prep-coach`.
- Stub validator removal in test file via full file rewrite (planner picks prune vs rewrite).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UX-01 | Persistent Merit balance badge in dashboard header | `MeritBalanceHeaderV2` already in `TopBar.tsx:9,151`; D-02 adds `isLow`/`isZero` trigger color states. Back-registered in plan SUMMARY frontmatter (D-22). |
| UX-02 | Every feature page shows Merit cost + balance before Analyze | 5 of 6 feature pages already wired with `<MeritCostPreview featureCost={...} />`. SC-1 adds the 6th: `CareerCompass.tsx`. |
| UX-03 | Low-balance amber warning when total < 2× cheapest cost; CTAs to shop and upgrade | New `LowBalanceWarning` component (D-04). Threshold computed inline (D-06) — `useMerits.isLow` is a different 20%-of-cap signal and cannot be reused. |
| UX-04 | Zero-balance state with two CTAs | `useOutOfMeritsModal` + `OutOfMeritsModalV2` (Phase 24) wired into Upload + usePaywallGuard; `UpgradeModal` deleted. |
| UX-09 | Interview Prep Elite quiz UI | Phase 23 ships this in `src/pages/InterviewPrep.tsx`; back-registration only. |
| UX-10 | Streak display on dashboard | Phase 23 ships `InterviewStreakDisplay.tsx` (was orphan, now wired); back-registration only. |
| UX-11 | useMerits live balance + affordability check, eventually consistent within 5 s | Vitest test asserting `canAfford(cost)` reactivity + 5 s consistency (D-19). |

## Project Constraints (from CLAUDE.md)

- **No commits inside `.planning/`** — `25-AUDIT-TRAIL.md` lives in `.planning/phases/25-…/` and is gitignored. Don't `git add -f`.
- **Small reversible changes** — favored over broad rewrites.
- **Preserve TS/React patterns** — no new abstractions when a single helper suffices.
- **Semantic Tailwind tokens** — D-02 uses `bg-destructive/...` (semantic) and `bg-amber-500/...` (raw). The orphan recipe mixes both; preserve the mix to keep visual parity rather than introduce a new amber CSS var.
- **GSD workflow** — Phase 25 work flows through `/gsd-execute-phase`; no direct edits outside the workflow.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| MeritCostPreview rendering on CareerCompass | Browser / Client | — | Pure React component reading `useMerits` + `useFeatureCosts`. |
| LowBalanceWarning component | Browser / Client | — | Reads `useMerits` + computes tier-applicable threshold inline. |
| Header trigger color states (V2) | Browser / Client | — | `MeritBalanceHeaderV2.tsx` is a Popover trigger; CSS-only change. |
| OutOfMeritsModal trigger flow | Browser / Client | API / Backend (402 origin) | Modal opens reactively to a 402 'insufficient_merits' response from edge functions; Phase 25 only changes the client trigger wiring. |
| Stub validator cleanup | API / Backend (Deno) | — | `supabase/functions/_shared/interview-prep-validation.ts` runs in Deno edge runtime; pure module-level deletion. |
| `it.skip` annotation + comment | Test infrastructure | — | `src/pages/InterviewPrep.test.tsx`; runs under Vitest + jsdom. |
| Phase 21 runbook edit | Operator tooling (PowerShell) | — | `scripts/phase21-runbook.ps1` runs locally on operator workstation. |
| `useMerits` affordability test | Test infrastructure | — | Vitest; mocks `get_merit_balance` RPC; no live Supabase. |
| 25-AUDIT-TRAIL.md artifact | Planning / Documentation | — | Lives under `.planning/phases/25-.../`; never committed. |

## Standard Stack

### Core (already in repo — Phase 25 consumes, does not introduce)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `react` | 18.3.1 | Component framework | [VERIFIED: package.json] Existing |
| `react-router-dom` | 6.30.1 | `<Link to="/pricing">` for D-09 swaps | [VERIFIED: package.json] Existing |
| `@tanstack/react-query` | 5.83.0 | `useMerits` cache; SC-6 test mocks via `QueryClientProvider` | [VERIFIED: package.json] Existing |
| `vitest` | 1.6.1 | SC-6 test runner | [VERIFIED: package.json] Existing |
| `@testing-library/react` | 14.3.1 | RTL for SC-6 hook test | [VERIFIED: package.json] Existing |
| `@supabase/supabase-js` | 2.81.1 | RPC mocked in SC-6 test | [VERIFIED: package.json] Existing |
| `lucide-react` | 0.462.0 | `AlertTriangle`, `Gem` icons reused in `LowBalanceWarning` | [VERIFIED: package.json] Existing |
| `tailwindcss` | 3.4.17 | Token classes for D-02 | [VERIFIED: package.json] Existing |
| Deno std `testing/asserts` | 0.168.0 | D-13 validation test cleanup | [VERIFIED: existing test file imports] |

### No new dependencies required for Phase 25.

## Architecture Patterns

### System Architecture Diagram

```
                  ┌─────────────────────────────────────────────────┐
                  │                Dashboard Layout                  │
                  │ ┌─────────────────────────────────────────────┐ │
                  │ │ TopBar                                       │ │
                  │ │  ├─ MeritBalanceHeaderV2 (amber/red trigger) │ │
                  │ │  └─ HeaderTopUpTrigger                       │ │
                  │ ├─────────────────────────────────────────────┤ │
                  │ │ <LowBalanceWarning />  (when isLow)          │ │
                  │ ├─────────────────────────────────────────────┤ │
                  │ │ Page content                                 │ │
                  │ │  ┌────────────────────────────────────────┐  │ │
                  │ │  │ Feature page (CareerCompass / Upload / │  │ │
                  │ │  │ LinkedInGrader / RecruitingLens /      │  │ │
                  │ │  │ SkillsGapAnalysis / InterviewPrep)     │  │ │
                  │ │  │   ↓                                    │  │ │
                  │ │  │ <MeritCostPreview featureCost={n} />   │  │ │
                  │ │  │ <LowBalanceWarning /> (when isLow)     │  │ │
                  │ │  │ <Button>Analyze</Button>               │  │ │
                  │ │  │   ↓ (on 402 'insufficient_merits')     │  │ │
                  │ │  │ openModal({ feature, cost, balance })  │  │ │
                  │ │  │   ↓                                    │  │ │
                  │ │  │ <OutOfMeritsModalV2 {...modalProps} /> │  │ │
                  │ │  └────────────────────────────────────────┘  │ │
                  │ └─────────────────────────────────────────────┘ │
                  └─────────────────────────────────────────────────┘

  Generic upgrade CTAs (TopBar dropdown / Navbar / Profile)
   ─→ <Link to="/pricing">  (D-09 — no modal)
```

### Component Responsibilities

| File | Responsibility | Phase 25 change |
|------|----------------|-----------------|
| `src/components/topup/MeritBalanceHeaderV2.tsx` | Header trigger label + Popover breakdown | Add `isLow`/`isZero` conditional className to the trigger button (line 38) |
| `src/components/MeritBalanceBadge.tsx` + `.test.tsx` | Orphan v1 badge (Phase 20) | DELETE both files |
| `src/components/LowBalanceWarning.tsx` | NEW: amber/red banner + dual CTAs | CREATE — consumed by TopBar layout + 6 feature pages |
| `src/components/MeritCostPreview.tsx` | Inline cost preview above Analyze CTA | NO change — consumed by CareerCompass for SC-1 |
| `src/pages/CareerCompass.tsx` | Career Compass feature page | Import + render `<MeritCostPreview featureCost={...} />` above Analyze button (around line 930); add `<LowBalanceWarning />` (D-05) |
| `src/components/UpgradeModal.tsx` | Legacy modal (Stripe checkout for Pro/Elite) | DELETE after D-08 + D-09 land |
| `src/components/TopBar.tsx` | Top bar with V2 + dropdown | Remove `UpgradeModal` import (line 8), state (line 30), JSX (line 234); swap line 211 onClick for `<Link to="/pricing">`; mount `<LowBalanceWarning />` somewhere on the dashboard layout |
| `src/components/Navbar.tsx` | Marketing/auth navbar | Remove `UpgradeModal` (lines 16, 68, 624); swap setShowUpgradeModal(true) at lines 508, 596 for `<Link to="/pricing">` |
| `src/pages/Profile.tsx` | Profile page | Remove `UpgradeModal` (lines 12, 39, 825); swap CTA to `/pricing` |
| `src/pages/Upload.tsx` | Resume upload page | Replace `UpgradeModal` (lines 17, 32, 33, 487) with `useOutOfMeritsModal` + `OutOfMeritsModalV2`; mount `<LowBalanceWarning />` |
| `src/hooks/usePaywallGuard.ts` | Paywall state hook | Remove `showUpgradeModal` boolean (lines 26, 107, 112, 113); replace with `useOutOfMeritsModal` consumer pattern. Update RecruitingLens + InterviewPrep + Upload callers in same plan. |
| `src/hooks/useMerits.ts` | Merit balance hook | NO change — SC-6 test consumes the existing public surface (`canAfford`) |
| `src/hooks/useMerits.test.ts` (or `__tests__/useMerits.test.ts`) | NEW Vitest unit test | CREATE — D-19 affordability invariant |
| `supabase/functions/_shared/interview-prep-validation.ts` | Zod-backed §10 validator | DELETE lines 192–197 (validateFlashcards + validateQuizQuestions throwing stubs) AND the surrounding "Deprecated legacy shims" comment block (lines 185–198) |
| `supabase/functions/_shared/__tests__/interview-prep-validation.test.ts` | Validator unit tests | Verify no stub-targeting tests; prune if found |
| `src/pages/InterviewPrep.test.tsx` | Page state-machine tests | Update comment block at lines 4–7 + 180–183 to reference the backlog ticket ID; **NO `it.skip` lines exist to add** because the 5 form-submission tests were never written (see Drift Finding 3) |
| `scripts/phase21-runbook.ps1` | Operator runbook | Append idempotent reminder block in `Stage-D4-Finalize()` (between line 744 and line 752 — after `Append-Evidence` + before `if ($reply -eq "ROLLBACK")`) |
| `.planning/phases/25-…/25-AUDIT-TRAIL.md` | NEW | CREATE per D-21 row format |

### Pattern: MeritCostPreview integration on feature pages

**What:** Inline `<MeritCostPreview featureCost={n} />` directly above the Analyze button.

**API contract:** `MeritCostPreview` takes `featureCost: number` (NOT `feature: string`). The page resolves cost via `getCostForFeature(featureCosts, '<feature_key>', tier) ?? 0`.

**Verified call sites (all use this pattern):**
- `src/pages/Upload.tsx:435` — `<MeritCostPreview featureCost={meritCost} />` (resume_analysis)
- `src/pages/RecruitingLens.tsx:675` — `<MeritCostPreview featureCost={getCostForFeature(featureCosts, 'recruiting_lens', tier) ?? 0} />`
- `src/pages/LinkedInGrader.tsx:647` — `<MeritCostPreview featureCost={getCostForFeature(featureCosts, 'linkedin_grader', subscriptionTier ?? 'free') ?? 0} />`
- `src/pages/SkillsGapAnalysis.tsx:600,688` — same pattern (skills_gap)
- `src/pages/InterviewPrep.tsx` — already wired (Phase 23)

**CareerCompass plan (SC-1):** Use `getCostForFeature(featureCosts, 'career_compass', tier) ?? 0`. The feature key is `career_compass` (lowercase + underscore — matches the DB convention seen in CareerCompass.tsx:209, 275).

**Placement:** Inside the upload/intake form Card, directly above the primary `<Button onClick={handleAnalyze}>` near line 931 of `CareerCompass.tsx`. Follow the Upload.tsx wrapping div pattern: `<div className="mt-6"><MeritCostPreview ... /></div>`.

### Pattern: TopBar / Navbar / Profile generic-CTA → /pricing swap (D-09)

**Before:**
```tsx
<DropdownMenuItem onClick={() => setShowUpgradeModal(true)} ...>Upgrade Plan</DropdownMenuItem>
```

**After (recommended — uses Link asChild for client-side routing):**
```tsx
<DropdownMenuItem asChild>
  <Link to="/pricing" className="flex items-center gap-2 cursor-pointer text-amber-500">
    <Zap className="w-4 h-4" />
    Upgrade Plan
  </Link>
</DropdownMenuItem>
```

The dropdown item already uses `asChild` for /profile and /pricing nav (TopBar.tsx:189, 199). Match that convention.

### Pattern: Hand-rolled idempotent edit in PowerShell

```powershell
# Idempotency sentinel: if reminder already exists, skip
$d4Body = Get-Content $PSCommandPath -Raw  # or read $scriptPath
if ($d4Body -notmatch 'interview-prep-coach') {
  # Append reminder
}
```

For runtime use inside `Stage-D4-Finalize()`, simpler approach: just emit the `Write-Note` lines unconditionally — the script is idempotent because re-running `D4-Finalize` against an already-committed phase exits at the `if (-not (Test-Path $sc5Evidence))` check. The "idempotency" D-17 requires is on the **source file** (so Phase 27 SC-4's edit doesn't double-paste), not the script's output.

**Concrete idempotency strategy:** Add a sentinel comment `# SC-9: interview-prep-coach delete reminder` directly above the `Write-Note` block. Phase 27 SC-4's plan-checker greps for the sentinel and skips. This is simpler than runtime detection.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Modal open/close state | New useState boolean | `useOutOfMeritsModal` (Phase 24) | Already returns `{isOpen, openModal, closeModal, modalProps}` |
| Merit cost lookup | Hardcoded `MERIT_COST_PER_FEATURE[...]` | `getCostForFeature(featureCosts, key, tier)` | Includes loading/error semantics (undefined / null / number per useFeatureCosts.ts:24-37) |
| Tier-applicable cost set | Custom filter logic | Iterate `MERIT_COST_PER_FEATURE[feature][tier]`, drop nulls (free tier excludes recruiting/interview-prep automatically) | Already encoded in `pricing-config.ts:39-45` |
| Upgrade CTA modal | New inline component | `<Link to="/pricing">` | The /pricing page IS the upgrade CTA per D-09; no inline duplicate |
| Color recipe | Custom palette | Lift `bg-amber-500/10 text-amber-500 border-amber-500/30` and `bg-destructive/10 text-destructive border-destructive/30` from `MeritBalanceBadge.tsx:15-19` | Phase 20 visual convention |
| Backlog-ticket file system | New custom format | `docs/tech-debt/<id>.md` (recommended — `.planning/backlog/` does not exist; `.claude/skills/gsd-add-todo` is unavailable in this repo per Glob) | Repo-local, traceable, survives `.planning/` gitignore |

**Key insight:** Phase 25 is mostly deletion + back-registration. The new code is `LowBalanceWarning.tsx` (~50 LOC) and the SC-6 test (~80 LOC). Everything else is wire-up.

## Runtime State Inventory

> Phase 25 is wire-up + cleanup. Limited runtime state. Documented for completeness.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — Phase 25 changes no schemas, no DB rows. | None |
| Live service config | `interview-prep-coach` edge function still deployed on staging + production Supabase projects (per v2.0-MILESTONE-AUDIT.md line 175). | SC-9 reminder in runbook; **operator** runs `supabase functions delete` |
| OS-registered state | None | None |
| Secrets / env vars | None | None |
| Build artifacts | None — Phase 25 is source-only changes. | None |

## Common Pitfalls

### Pitfall 1: `useMerits.isLow` ≠ Phase 25 `isLow`
**What goes wrong:** Reusing `useMerits.isLow` for `LowBalanceWarning` trigger condition.
**Why it happens:** The hook exports `isLow`, and naming suggests it matches the spec.
**Reality:** `useMerits.ts:73` computes `cap > 0 && subscription / cap <= 0.2` — a 20%-of-subscription-cap test introduced by Phase 24 D-08 for the header `+` icon nudge. Phase 25 D-06 needs `total < 2 × min(applicable feature costs)` — totally different.
**How to avoid:** Compute the threshold inside `LowBalanceWarning` using `total` from `useMerits` + `MERIT_COST_PER_FEATURE` from `pricing-config.ts` filtered by tier. Do NOT call this exported boolean `isLow` to avoid confusion — name it `isBelowThreshold` or compute inline.

### Pitfall 2: `MeritCostPreview` API mismatch
**What goes wrong:** Plans assume `<MeritCostPreview feature="career_compass" />` per CONTEXT.md `code_context` line 159.
**Reality:** The component takes `featureCost: number` (`MeritCostPreview.tsx:5-7`). The CONTEXT.md `feature="..."` shorthand is NOT the literal API.
**How to avoid:** Read cost from `useFeatureCosts` + `getCostForFeature` and pass the resolved number.

### Pitfall 3: 5 InterviewPrep form-submission `it()` tests don't exist
**What goes wrong:** D-14 says "Mark the 5 form-submission click-through tests with `it.skip(...)`".
**Reality:** `src/pages/InterviewPrep.test.tsx` has 6 `it(...)` blocks; NONE of them are form-submission click-throughs. The 5 form-submission tests were never written — they were excluded by comment (lines 4–7, 180–183) during Phase 23.
**How to avoid:** Plan 25-03 should NOT add `it.skip` lines. Instead it should: (a) extend the existing comment at lines 180–183 to cite the new backlog ticket ID, and (b) ensure the audit trail accurately reflects that the tests are documented-as-skipped, not literally `it.skip`'d.

### Pitfall 4: PowerShell idempotency at runtime vs. source
**What goes wrong:** Implementing idempotency by checking script *output* (the markdown evidence file).
**Reality:** D-17 requires source-file idempotency so Phase 27 SC-4's static edit pass is a no-op.
**How to avoid:** Use a sentinel comment line in `Stage-D4-Finalize` body. Phase 27's plan-checker greps for the sentinel.

### Pitfall 5: usePaywallGuard breaking change ripples
**What goes wrong:** Replacing `{ showUpgradeModal, setShowUpgradeModal }` with `{ modalProps, openModal }` breaks every consumer.
**Reality:** Live consumers verified: `src/pages/RecruitingLens.tsx:376`, `src/pages/Upload.tsx:39`, `src/pages/InterviewPrep.tsx:189`. All three must be updated atomically.
**How to avoid:** Same plan touches the hook + all 3 consumers + Upload's modal swap. Don't split across plans.

### Pitfall 6: Worktree noise in glob results
**What goes wrong:** `Glob` returns 7 copies of `InterviewPrep.test.tsx` (6 worktrees + canonical).
**Reality:** Only `src/pages/InterviewPrep.test.tsx` is the live file. The `.claude/worktrees/agent-*/` copies are agent scratch — ignore.
**How to avoid:** Always read paths under `src/`, `supabase/`, `scripts/`. Skip `.claude/worktrees/`.

### Pitfall 7: `interview-prep-coach` already mentioned in `phase21-runbook.ps1`
**What goes wrong:** D-17 says "grep for `interview-prep-coach` to detect existing reminder".
**Reality:** The string already appears at `phase21-runbook.ps1:621` in the SC-5 evidence template's "Intentionally Ungated" note.
**How to avoid:** Scope idempotency check to the `Stage-D4-Finalize()` function body specifically, not the whole file. Recommend a sentinel comment `# SC-9 reminder` inside the function body.

## Code Examples

### LowBalanceWarning skeleton (D-04, D-05, D-06, D-07)

```tsx
// src/components/LowBalanceWarning.tsx
import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMerits } from '@/hooks/useMerits';
import { MERIT_COST_PER_FEATURE, type Tier } from '@/config/pricing-config';

function cheapestApplicableCost(tier: Tier): number {
  // Filter null entries (feature locked on this tier), pick min remaining.
  const applicable = Object.values(MERIT_COST_PER_FEATURE)
    .map((row) => row[tier])
    .filter((c): c is number => c !== null);
  return applicable.length > 0 ? Math.min(...applicable) : 0;
}

export function LowBalanceWarning() {
  const { total, tier, isZero, isLoading } = useMerits();
  if (isLoading) return null;
  const threshold = 2 * cheapestApplicableCost(tier);

  // Zero state — D-07
  if (isZero) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 mb-3">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm font-medium">Out of Merits</span>
        </div>
        <div className="flex items-center gap-2 mt-2 text-sm">
          <Link to="/shop" className="text-primary hover:underline">Buy Merits</Link>
          <span className="text-muted-foreground">·</span>
          <Link to="/pricing" className="text-primary hover:underline">Upgrade Plan</Link>
        </div>
      </div>
    );
  }

  // Low state — D-06
  if (threshold > 0 && total < threshold) {
    return (
      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 mb-3">
        <div className="flex items-center gap-2 text-amber-500">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm font-medium">Running low — {total} Merits left</span>
        </div>
        <div className="flex items-center gap-2 mt-2 text-sm">
          <Link to="/shop" className="text-primary hover:underline">Buy Merits</Link>
          <span className="text-muted-foreground">·</span>
          <Link to="/pricing" className="text-primary hover:underline">Upgrade</Link>
        </div>
      </div>
    );
  }

  return null;
}
```

### MeritBalanceHeaderV2 trigger color states (D-02)

```tsx
// MeritBalanceHeaderV2.tsx — modify lines 27-54
export function MeritBalanceHeaderV2() {
  const { subscription, shop, cap, resetDate, isLoading, isLow, isZero } = useMerits();
  if (isLoading) return <Skeleton className="h-5 w-28" />;
  const hasBonus = shop > 0;

  // D-02: amber/red state on the trigger button
  const triggerStateClass = isZero
    ? 'bg-destructive/10 text-destructive border border-destructive/30'
    : isLow
    ? 'bg-amber-500/10 text-amber-500 border border-amber-500/30'
    : '';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`flex items-center gap-2 px-2 py-1 rounded-[--radius-boxy] hover:bg-white/5 transition-colors ${triggerStateClass}`}
          aria-label={...}
        >
          ...
```

### useMerits affordability test (D-19, D-20)

```ts
// src/hooks/useMerits.test.ts (recommended location)
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMerits } from './useMerits';

vi.mock('@/lib/supabaseClient', () => {
  const balance = { total: 5, subscription_balance: 5, shop_balance: 0, next_reset_date: null };
  const rpcMock = vi.fn().mockResolvedValue({ data: balance, error: null });
  return {
    supabase: {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u-1' } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
      rpc: rpcMock,
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { subscription_tier: 'free' }, error: null }) }) }),
      }),
    },
  };
});

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

describe('useMerits — affordability invariant (UX-11)', () => {
  it('canAfford(cost) flips false when balance < cost', async () => {
    const { result } = renderHook(() => useMerits(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canAfford(3)).toBe(true);   // total=5, cost=3
    expect(result.current.canAfford(8)).toBe(false);  // total=5, cost=8
  });

  it('balance is consistent within 5s after invalidation', async () => {
    // Use vi.useFakeTimers + vi.advanceTimersByTime(5000) + invalidateQueries.
    // Assert refetch fires and updated value propagates.
  });
});
```

### Phase 21 runbook reminder (D-16, D-17, D-18)

```powershell
# Insert in Stage-D4-Finalize() between line 744 (Append-Evidence call) and
# line 746 (the if $reply ROLLBACK block).

  # SC-9: interview-prep-coach delete reminder (idempotency sentinel)
  Write-Step "SC-9 -- Operator action: delete the dead 'interview-prep-coach' edge function"
  Write-Note "  Run BOTH commands manually (script does NOT execute these for you):"
  Write-Note "    supabase functions delete interview-prep-coach --project-ref <STAGING_REF>"
  Write-Note "    supabase functions delete interview-prep-coach --project-ref <PRODUCTION_REF>"
  Write-Note "  This function does not exist in the repo (Phase 23 cleanup) but is still"
  Write-Note "  deployed in Supabase. Removing it closes Phase 23's tech-debt entry."
```

### 25-AUDIT-TRAIL.md row template (D-21)

```markdown
| REQ-ID | Closed by plan | Evidence file:line | Note |
|--------|----------------|-------------------|------|
| UX-01  | 25-01-PLAN     | src/components/topup/MeritBalanceHeaderV2.tsx (amber/red states); src/components/TopBar.tsx:9,151 | Header badge wired in Phase 24; Phase 25 adds isLow/isZero color states + deletes orphan v1 badge |
| UX-02  | 25-01-PLAN     | src/pages/CareerCompass.tsx (MeritCostPreview added); 5 other feature pages already wired | CareerCompass was the only missing page |
| UX-03  | 25-01-PLAN     | src/components/LowBalanceWarning.tsx; mounted in TopBar + 6 feature pages | 2× cheapest-applicable-cost threshold computed inline |
| UX-04  | 25-01-PLAN     | src/hooks/useOutOfMeritsModal.ts (Phase 24); src/pages/Upload.tsx, src/hooks/usePaywallGuard.ts (Phase 25 wires) | UpgradeModal deleted; generic CTAs route to /pricing |
| UX-09  | 25-03-PLAN (back-reg only) | src/pages/InterviewPrep.tsx (Phase 23) | Elite quiz UI shipped Phase 23 SC-* |
| UX-10  | 25-03-PLAN (back-reg only) | src/components/interviewPrep/StreakDisplay.tsx (Phase 23) | Streak component shipped Phase 23 SC-* |
| UX-11  | 25-02-PLAN     | src/hooks/useMerits.test.ts | Affordability invariant + 5s consistency |
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `MeritBalanceBadge` (orphan v1) | `MeritBalanceHeaderV2` (Phase 24 SC-10) | Phase 24 | V2 ships cap-format display; Phase 25 deletes orphan |
| `UpgradeModal` for 402 errors | `useOutOfMeritsModal` + `OutOfMeritsModalV2` | Phase 24 Plan 06 (SC-9a) | Phase 25 finishes the wire-up; deletes UpgradeModal |
| `validateFlashcards` / `validateQuizQuestions` | `validateInterviewPrepPayload` | Phase 23 D-09 | Phase 25 deletes the throwing stubs |
| `setShowUpgradeModal(true)` for generic upgrades | `<Link to="/pricing">` | Phase 25 | No modal — direct navigation |

**Deprecated/outdated:**
- `MeritBalanceBadge.tsx` + `.test.tsx` — replaced by V2; delete this phase.
- `UpgradeModal.tsx` — replaced by /pricing page; delete this phase.
- `validateFlashcards`, `validateQuizQuestions` (lines 192–197 of interview-prep-validation.ts) — throwing stubs; delete this phase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Backlog-ticket storage path `docs/tech-debt/<id>.md` is appropriate | Don't Hand-Roll table; Pitfall 6 | Low — `.planning/backlog/` doesn't exist (verified Glob); `gsd-add-todo` skill not present (verified Glob); planner picks any of the three options per CONTEXT.md Claude's Discretion |
| A2 | `LowBalanceWarning` mount under TopBar is acceptable as a sibling element | System Architecture Diagram | Low — D-05 explicitly allows "under TopBar"; visual placement is Claude's Discretion |
| A3 | The feature key for CareerCompass is `career_compass` | MeritCostPreview pattern | Low — verified by CareerCompass.tsx:209,275 (`analysis_type='career_compass'`) and the pattern matches LinkedInGrader's `linkedin_grader` |
| A4 | `tier` from `useMerits` is reliable for filtering MERIT_COST_PER_FEATURE | LowBalanceWarning skeleton | Low — `useMerits.ts:50,59` defaults to `'free'` on missing profile row |

## Open Questions

1. **Where does `<LowBalanceWarning />` mount on the dashboard?**
   - What we know: D-05 says "under TopBar on dashboard layouts (above main content, conditional on `isLow`)".
   - What's unclear: Strivo has multiple dashboard layouts (`Dashboard.tsx`, `DashboardHome.tsx`, possibly Profile shell). Which layout owns the slot?
   - Recommendation: Mount once in the shared layout that wraps `/dashboard`, `/upload`, `/career-compass`, etc. If no shared shell exists, mount in `TopBar.tsx` directly below the `</header>` close — TopBar is currently included in every authenticated route. Planner verifies during 25-01.

2. **Backlog ticket ID format**
   - What we know: D-15 wants a tracking ticket; D-14 wants a TODO comment referencing it.
   - What's unclear: ID convention (e.g., `TD-001`, `IPC-TEST-001`, year-prefixed).
   - Recommendation: Use `IPC-JSDOM-001` to match the v2.0 REQ-ID convention (e.g., `IPC-01..10` exist). File at `docs/tech-debt/IPC-JSDOM-001.md`.

3. **Should `usePaywallGuard` keep a deprecation alias?**
   - What we know: CONTEXT.md Claude's Discretion recommends hard-delete.
   - What's unclear: Whether any out-of-tree consumer (e.g., a worktree branch in flight) depends on `showUpgradeModal`.
   - Recommendation: Hard-delete — verified consumers are exactly 3 (`Upload`, `RecruitingLens`, `InterviewPrep`) and all three are touched in Plan 25-01.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Vitest test (D-19) | ✓ | 22+ per CLAUDE.md | — |
| npm | dependency install | ✓ | bundled | — |
| Vitest | SC-6 test runner | ✓ | 1.6.1 (package.json) | — |
| @testing-library/react | SC-6 test | ✓ | 14.3.1 | — |
| @tanstack/react-query | SC-6 test wrapper | ✓ | 5.83.0 | — |
| Deno | D-13 test cleanup | ✓ | 2+ per project conventions | — |
| PowerShell | D-16 runbook edit | ✓ | Tool available | — |
| Supabase CLI | D-18 operator command (NOT executed by Phase 25) | n/a | n/a | Operator runs |

**No blocking missing dependencies.**

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Frontend Framework | Vitest 1.6.1 + @testing-library/react 14.3.1 + jsdom 24.1.3 |
| Frontend config | `package.json` scripts (`vitest run` / `vitest`); no dedicated `vitest.config.*` checked in |
| Edge framework | Deno test stdlib `https://deno.land/std@0.168.0/testing/asserts.ts` |
| Edge config | `supabase/functions/deno.json` |
| Quick run command (frontend) | `npm run test -- src/hooks/useMerits.test.ts` |
| Full suite command (frontend) | `npm run test` |
| Edge utility tests | `.\scripts\run-edge-tests.ps1` (PowerShell — Windows host) |
| Lint | `npm run lint` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UX-02 | CareerCompass renders MeritCostPreview above Analyze | smoke (manual UI verify) | `npm run dev` + visit `/career-compass` | ✗ Wave 0 (no automated assertion needed; file-presence + render check sufficient) |
| UX-03 | LowBalanceWarning renders amber when total < 2× cheapest applicable | unit | `npm run test -- src/components/LowBalanceWarning.test.tsx` | ❌ Wave 0 (NEW component test) |
| UX-04 | Upload + usePaywallGuard route through useOutOfMeritsModal; UpgradeModal deleted | smoke | `npm run lint` (catches missing imports); `grep -rn "UpgradeModal" src` returns ∅ | n/a |
| UX-01 | MeritBalanceHeaderV2 applies amber/red trigger className when isLow/isZero | unit | `npm run test -- src/components/topup/MeritBalanceHeaderV2.test.tsx` | ✓ test file exists; extend it |
| UX-09 / UX-10 | Back-registration only (no test) | manual | Read 25-AUDIT-TRAIL.md row | n/a |
| UX-11 | useMerits.canAfford(cost) reactive + 5s consistency | unit | `npm run test -- src/hooks/useMerits.test.ts` | ❌ Wave 0 (NEW test file — D-19) |
| SC-7 (orphan delete) | MeritBalanceBadge + .test.tsx no longer in repo | smoke | `git ls-files src/components/MeritBalanceBadge*` returns ∅ | n/a |
| SC-8a (validator stubs) | validateFlashcards / validateQuizQuestions deleted | smoke | `grep -rn "validateFlashcards\|validateQuizQuestions" supabase src` returns ∅ | ✓ existing validation test file |
| SC-8b (test hangs) | Comment block updated in InterviewPrep.test.tsx with backlog ID | manual | Read file diff | ✓ |
| SC-9 (runbook reminder) | Stage-D4-Finalize prints reminder; idempotent | smoke | `Select-String "interview-prep-coach" scripts/phase21-runbook.ps1` shows ≥2 matches (existing line 621 + new) | ✓ |

### Sampling Rate
- **Per task commit:** `npm run test -- <changed-file-test>` + `npm run lint`
- **Per wave merge:** `npm run test` (full Vitest suite) + `.\scripts\run-edge-tests.ps1` (Deno)
- **Phase gate:** Full Vitest suite green, `npm run lint` clean, `npm run build` clean before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src/hooks/useMerits.test.ts` — NEW file for SC-6 (UX-11). Plan 25-02 owns.
- [ ] `src/components/LowBalanceWarning.test.tsx` — NEW file for SC-2 (UX-03). Plan 25-01 owns.
- [ ] Extend `src/components/topup/MeritBalanceHeaderV2.test.tsx` (existing file) for SC-7 trigger color states. Plan 25-01 owns.
- [ ] `docs/tech-debt/IPC-JSDOM-001.md` (or chosen location) — NEW backlog ticket for SC-8b. Plan 25-03 owns.
- [ ] `.planning/phases/25-…/25-AUDIT-TRAIL.md` — NEW audit-trail file for SC-4 + SC-5. Plan 25-03 owns (or shared across plans).

## Sources

### Primary (HIGH confidence)
- `src/hooks/useMerits.ts` (full file read) — confirmed `canAfford(cost)` API, 20%-of-cap `isLow` semantics, 5_000ms staleTime, `MeritBalance` interface.
- `src/components/MeritCostPreview.tsx` (full file read) — confirmed `featureCost: number` API, 4 render states.
- `src/components/MeritBalanceBadge.tsx` (full file read) — confirmed exact Tailwind tokens for orphan port (lines 15–19).
- `src/components/topup/MeritBalanceHeaderV2.tsx` (full file read) — confirmed trigger className location (line 39).
- `src/components/UpgradeModal.tsx` (full file read) — confirmed component is the legacy Stripe-checkout modal (240 lines).
- `src/hooks/usePaywallGuard.ts` (full file read) — confirmed showUpgradeModal contract (lines 26, 107, 112–113); 3 live consumers.
- `src/hooks/useOutOfMeritsModal.ts` (full file read) — confirmed `{isOpen, openModal, closeModal, modalProps}` API, replaces UpgradeModal in feature flows.
- `src/hooks/useFeatureCosts.ts` (full file read) — confirmed `getCostForFeature` undefined/null/number semantics.
- `src/config/pricing-config.ts` (relevant lines 30–127) — confirmed `MERIT_COST_PER_FEATURE` shape (`null` = locked on tier).
- `src/pages/InterviewPrep.test.tsx` (full file read) — **DRIFT FINDING:** 6 it() blocks; ZERO are form-submission tests; comment at lines 4–7 + 180–183 documents the deliberate exclusion.
- `supabase/functions/_shared/interview-prep-validation.ts` (full file read) — confirmed throwing stubs at lines 192–197; `validateInterviewPrepPayload` at line 100; `findDroppedOptionalFields` and `validateEvaluationScores` are unrelated and stay.
- `supabase/functions/_shared/__tests__/interview-prep-validation.test.ts` (lines 1–80 read) — confirmed test imports only `findDroppedOptionalFields` + `validateInterviewPrepPayload`; NO references to deleted stubs.
- `scripts/phase21-runbook.ps1` (lines 600–640 + 700–789 read) — confirmed `Stage-D4-Finalize` body is lines 725–771; existing `interview-prep-coach` mention at line 621 is in a different function's evidence template, not D4-Finalize body.
- `src/pages/CareerCompass.tsx` (lines 1–60 + 920–980 read) — confirmed Analyze button at line 931, `useMerits` already imported at line 23, `analysis_type='career_compass'` is the canonical feature key.
- `src/pages/Upload.tsx` (lines 420–494 read) — confirmed `<MeritCostPreview featureCost={meritCost} />` placement pattern at line 435.
- `src/components/TopBar.tsx` (lines 1–50 + 140–238 read) — confirmed UpgradeModal usage at lines 8/30/211/234; V2 already mounted at line 151.
- `.planning/v2.0-MILESTONE-AUDIT.md` (lines 150–190) — confirmed Phase 23 tech-debt items including the InterviewPrep.test.tsx hang note.
- `.planning/phases/20-merit-ux-shop-pricing-and-streak-ui/20-VERIFICATION.md` (lines 1–100 read) — confirmed Phase 20 evidence row format for 25-AUDIT-TRAIL.
- `.planning/phases/24-…/24-06-PLAN.md` (lines 1–30 read) — confirmed Phase 24 Plan 06 introduced V2 + useOutOfMeritsModal + OutOfMeritsModalV2.
- Glob `**/InterviewPrep.test.tsx` — confirmed canonical file at `src/pages/`; 6 worktree copies are noise.
- Glob `.planning/phases/**/AUDIT*.md` — **no prior AUDIT*.md files exist**; 25-AUDIT-TRAIL.md is the first.
- Glob `.planning/backlog/**` — directory does not exist.
- Glob `.claude/skills/**/SKILL.md` — no project skills in this repo.
- Grep `UpgradeModal` across `src/` — exhaustive 8-file consumer list verified.
- Grep `MeritCostPreview` — verified 5 of 6 feature pages already wired; CareerCompass missing.

### Secondary (MEDIUM confidence)
- CONTEXT.md `code_context` line 159 ("`<MeritCostPreview feature="..." />`") — shorthand notation; the literal API is `featureCost: number` per direct file read.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every dependency verified in `package.json`, no new packages.
- Architecture: HIGH — every component / hook / file location read directly.
- Pitfalls: HIGH — Pitfalls 1–3 are corroborated by direct file reads (the source code contradicts CONTEXT.md / audit assumptions in three places).
- Cleanup scope (validators + tests): HIGH — direct reads of both files; CONTEXT.md is accurate for SC-8a but Drift Finding 3 applies to SC-8b.
- Runbook idempotency: HIGH — direct read of D4-Finalize body (lines 725–771) confirms no existing `interview-prep-coach` mention inside the function.
- AUDIT-TRAIL row format: MEDIUM — no prior `*-AUDIT-TRAIL.md` exists; format derived from Phase 20-VERIFICATION's truth/artifact tables. Planner should match the SUMMARY frontmatter `requirements:` convention which IS verified.

**Research date:** 2026-04-28
**Valid until:** 2026-05-28 (30 days; codebase touchpoints frozen by CONTEXT.md)

## RESEARCH COMPLETE
