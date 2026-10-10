---
phase: 47-interview-prep-prod-gate-elite-differentiation
plan: "04"
subsystem: frontend-pricing-surfaces
tags:
  - phase-47
  - interview-prep
  - production-gate
  - pricing
  - coming-soon
  - tdd
  - d-04-lock
requirements:
  - IPC-PROD-PRICING
dependency_graph:
  requires:
    - "src/config/feature-flags.ts (plan 47-00 — isInterviewPrepEnabled)"
    - "src/components/ComingSoonBadge.tsx (plan 47-01 — visual primitive)"
  provides:
    - "Decorated Interview Prep bullets in TierCardV2 (active /pricing page)"
    - "Decorated Interview Prep bullets in PricingTable (defensive — for Phase 33 rewire)"
  affects: []
tech_stack:
  added: []
  patterns:
    - "Substring-based bullet matching (/interview prep/i for TierCardV2, /interview (prep|quiz)/i for PricingTable) — smallest diff, fails loudly on rename"
    - "Component-top flag hoist (one isInterviewPrepEnabled() call per render, reused across all bullet maps)"
    - "D-04 lock: config-vs-display separation — pricing-config.ts untouched, UI components decide decoration"
key_files:
  created:
    - "src/components/pricing/__tests__/TierCardV2.interviewPrep.test.tsx"
    - "src/components/__tests__/PricingTable.interviewPrep.test.tsx"
  modified:
    - "src/components/pricing/TierCardV2.tsx"
    - "src/components/PricingTable.tsx"
decisions:
  - "Use substring matching (regex on bullet text) rather than restructuring bullets to {text, gateTag} objects — keeps diff small per CONTEXT line 152"
  - "Use /interview (prep|quiz)/i in PricingTable to catch Elite's 'Interactive interview quiz' bullet which does NOT contain 'Interview Prep' literally"
  - "TierCardV2 uses simpler /interview prep/i — Pro tier's 'All 5 AI features unlocked' bullet intentionally NOT tagged (no literal IP mention)"
  - "Hoist isInterviewPrepEnabled() to component-top (one call per render) rather than inside the .map callback"
  - "pricing-config.ts NOT opened or modified — D-04 hard lock verified by `git diff --stat` showing zero changes to that file"
metrics:
  duration_minutes: 6
  completed_date: "2026-05-11"
  tasks_completed: 2
  files_created: 2
  files_modified: 2
  tests_added: 9
---

# Phase 47 Plan 04: Pricing Surface Gates Summary

Decorated all 5 Interview Prep references across the two pricing components (`PricingTable.tsx` + `pricing/TierCardV2.tsx`) with `<ComingSoonBadge />` when the production flag is off, while preserving every bullet's original text verbatim and leaving `src/config/pricing-config.ts` byte-identical to pre-Phase-47 (D-04 hard lock).

## One-liner

Substring-based UI decoration of 5 Interview Prep bullets (2 in TierCardV2, 3 in PricingTable) behind `isInterviewPrepEnabled()`, with `pricing-config.ts` deliberately untouched per D-04 — re-enable is a one-flag Vercel flip.

## Completed Tasks

| Task | Name                                                | RED commit | GREEN commit | Files                                                                                                       |
| ---- | --------------------------------------------------- | ---------- | ------------ | ----------------------------------------------------------------------------------------------------------- |
| 1    | Gate Interview Prep bullets in `TierCardV2.tsx`     | `9d28f2d`  | `7905b94`    | `src/components/pricing/TierCardV2.tsx`, `src/components/pricing/__tests__/TierCardV2.interviewPrep.test.tsx` |
| 2    | Gate Interview Prep bullets in `PricingTable.tsx`   | `0c06289`  | `c0027bc`    | `src/components/PricingTable.tsx`, `src/components/__tests__/PricingTable.interviewPrep.test.tsx`           |

## Bullet Inventory — Exact Strings Receiving the Badge (Flag Off)

### TierCardV2.tsx (2 bullets)

| Tier  | Bullet string (from `TIER_COPY`, lines 21 & 41)         | Regex match    |
| ----- | ------------------------------------------------------- | -------------- |
| free  | `Interview Prep + Recruiting Lens locked`               | /interview prep/i |
| elite | `Premium support + Interview Prep Quiz`                 | /interview prep/i |

Pro tier copy contains no literal "Interview Prep" substring — no badge (deliberate: plan 47-04 says copy rewrites for Pro are out of scope, see PLAN line 122).

### PricingTable.tsx (3 bullets)

| Tier  | Source             | Bullet string                                | Regex match              |
| ----- | ------------------ | -------------------------------------------- | ------------------------ |
| free  | excludedFeatures[0] | `Interview Prep`                            | /interview (prep|quiz)/i |
| pro   | features[3]         | `Interview Prep flashcards (8 Merits)`      | /interview (prep|quiz)/i |
| elite | features[3]         | `Interactive interview quiz (5 Merits)`     | /interview (prep|quiz)/i |

## Regex Pattern Rationale

- **TierCardV2:** `/interview prep/i` — both IP-bearing bullets in this surface contain the exact substring "Interview Prep". A simpler pattern works.
- **PricingTable:** `/interview (prep|quiz)/i` — Elite tier's "Interactive interview quiz (5 Merits)" bullet does NOT contain "Interview Prep" as a substring (it says "interview quiz"). Two-word alternation `(prep|quiz)` catches both IP variants without false positives. Verified by scanning all bullet strings in `PLANS`: no other bullet contains "interview prep" or "interview quiz" substrings, so no over-matching risk.
- A bare `/interview/i` was rejected — it would match too aggressively if any future marketing copy added unrelated "interview-related" bullets.
- A bullet rename without an explicit Phase 47 update will fail the test loudly (`expect(badges).toHaveLength(N)` asserts an exact count) — acceptable trade-off per PLAN lines 107-108.

## D-04 Compliance — pricing-config.ts Untouched

| Audit                                                                       | Result                                  |
| --------------------------------------------------------------------------- | --------------------------------------- |
| `git diff --stat HEAD~4 -- src/config/pricing-config.ts`                    | **empty output** (zero bytes changed)   |
| Grep `Interview Prep|interview-prep` in `src/config/pricing-config.ts`      | **no matches** (file structurally stores merit/cost data, no bullet copy) |
| Plan's `files_modified` list                                                | Does NOT include `pricing-config.ts`    |
| File NOT opened with Edit/Write tool                                        | Confirmed (Read-only inspection during planning context-gather only) |

The UI decorates; the config is the source of truth for cost. Re-enabling is `VITE_FEATURE_INTERVIEW_PREP=true` in Vercel Production scope + redeploy. No code change required (D-15).

## Verification Results

| Gate                                                                                                                                  | Result               |
| ------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `npx vitest run src/components/pricing/__tests__/TierCardV2.interviewPrep.test.tsx src/components/__tests__/PricingTable.interviewPrep.test.tsx` | **9/9 passing**      |
| `npx eslint` on all four touched files                                                                                                | Clean (no warnings)  |
| `git diff --stat HEAD~4 -- src/config/pricing-config.ts`                                                                              | Empty (D-04 honored) |
| Grep `Interview Prep` in `src/components/PricingTable.tsx` post-change                                                                | 3 bullet strings still present (lines 46, 64) + comment refs |
| Grep `Interview Prep` in `src/components/pricing/TierCardV2.tsx` post-change                                                          | 2 bullet strings still present (lines 21, 41) + comment ref |
| TDD gate sequence (test → feat, twice)                                                                                                | All 4 commits present in correct order |

## Decisions Made

1. **Substring matching, not bullet restructuring** — Per CONTEXT line 152 "don't over-engineer reversibility for the Phase 47 surface code itself." Restructuring `bullets: string[]` to `bullets: { text, gateTag }[]` would have rippled through TIER_COPY definitions, render code, and any callers. Substring matching adds 4 lines per render block and reverts trivially.

2. **Different regexes per surface** — TierCardV2's two bullets both say "Interview Prep" so `/interview prep/i` suffices. PricingTable's Elite bullet says "Interactive interview quiz" so it needs `/interview (prep|quiz)/i`. Using the same regex in both would be tidier but `/interview (prep|quiz)/i` in TierCardV2 has no current matches beyond what `/interview prep/i` already covers — kept them tailored to make the matching intent visible in each component.

3. **Pro tier bullet "All 5 AI features unlocked" intentionally untagged** — User implicitly counts IP as one of the "5 AI features," but plan 47-04 explicitly says (PLAN line 122) Pro copy rewrites are deferred. The literal substring rule means it gets no badge. If product wants a "now 4 features" rewrite, that's a follow-up.

4. **Tests stub `useStripeCheckout` + `useTierAccess` + `supabaseClient.auth.getUser`** — PricingTable mounts those hooks unconditionally in `useEffect`. Test isolation requires mocks. TierCardV2 has no external dependencies beyond shadcn primitives → no mocks needed.

5. **`flex-wrap` on the bullet container** — Added so the badge wraps below the bullet text on narrow viewports rather than overflowing. Doesn't change visual layout when the badge is absent (`flex` with only one child is identical to the prior `flex` row).

## Deviations from Plan

None. Plan executed exactly as written across both tasks. Tests, implementation, regex choices, and D-04 audits all align with the PLAN.md specification.

## Authentication Gates

None — pure frontend UI work. No backend, auth, or external API surface touched.

## Out of Scope (Confirmed Honored)

- `src/config/pricing-config.ts` — UNTOUCHED (D-04). Empty git diff confirmed.
- Interview Prep bullet removal — bullets STAY (D-01), just tagged.
- Merit cost copy in bullets ("8 Merits", "5 Merits") — verbatim.
- Pricing page restyling — Phase 33.
- Pro tier "4 vs 5 AI features" copy rewrite — Phase 47.1 / deferred.
- Pricing CTA button bugs — Phase 33.

## Rollback

Trivial: `git revert c0027bc 0c06289 7905b94 9d28f2d` removes both feat + test commits in both tasks. Bullets render plain strings, same as before Phase 47. No downstream consumer changes required.

## Known Stubs

None. The flag is fully wired through `isInterviewPrepEnabled()` (plan 47-00) and visual primitives are real (plan 47-01). The badge appears when `VITE_FEATURE_INTERVIEW_PREP !== 'true'` at build time — no placeholder data, no TODO markers.

## Self-Check: PASSED

- FOUND: `src/components/pricing/TierCardV2.tsx` (modified)
- FOUND: `src/components/pricing/__tests__/TierCardV2.interviewPrep.test.tsx` (created)
- FOUND: `src/components/PricingTable.tsx` (modified)
- FOUND: `src/components/__tests__/PricingTable.interviewPrep.test.tsx` (created)
- FOUND: commit `9d28f2d` (Task 1 RED)
- FOUND: commit `7905b94` (Task 1 GREEN)
- FOUND: commit `0c06289` (Task 2 RED)
- FOUND: commit `c0027bc` (Task 2 GREEN)
- Verified: 9/9 tests pass after final state
- Verified: `src/config/pricing-config.ts` shows zero git diff across the plan's commit range (D-04 hard lock)
- Verified: All 5 IP bullet strings still present in their source files (D-01 retention)

---
*Phase: 47-interview-prep-prod-gate-elite-differentiation*
*Plan: 04*
*Completed: 2026-05-11*
