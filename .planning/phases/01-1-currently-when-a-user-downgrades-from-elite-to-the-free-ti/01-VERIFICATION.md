---
phase: 01-1-currently-when-a-user-downgrades-from-elite-to-the-free-ti
verified: 2026-07-19T23:59:00Z
status: passed
score: 20/20 must-have truths verified
re_verification:
  previous_status: gaps_found
  previous_score: 12/20
  gaps_closed:
    - "Authoritative profile truth retires provisional cancellation state (CR-01)"
    - "Pricing removes pending controls at the exact period-end instant while mounted (CR-02)"
    - "A Stripe-confirmed renewal never regresses to retryable failure or submits another restore (CR-03)"
    - "A downgrade confirmation cannot submit after the authenticated session changes (WR-01)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Responsive visual matrix"
    expected: "Correct hierarchy, contrast, focus, full-width mobile actions, aligned cards, no clipping/overflow at 320px/768px/desktop, light/dark, 200% zoom"
    why_human: "DOM/class assertions do not prove final visual composition"
  - test: "Real browser-session dismissal lifecycle"
    expected: "Dashboard reminder stays hidden only in the original browser session and returns in a new session"
    why_human: "Unit storage mocks do not prove actual tab/session lifecycle"
  - test: "Deployed Stripe reconciliation"
    expected: "No duplicate controls, tier interruption, or Merit grant; Stripe confirmation is immediate and webhook-backed profile truth clears pending"
    why_human: "Requires deployed Stripe and webhook infrastructure"
---

# Phase 01: Scheduled Elite Downgrade Clarity and Recovery Verification

**Phase Goal:** Make scheduled Elite-to-Free downgrades immediately understandable, persistently visible, duplicate-safe, and reversible before expiration while preserving Elite access through the billing boundary and keeping Stripe/webhooks authoritative.

**Verified:** 2026-07-19T23:59:00Z
**Status:** passed
**Re-verification:** Yes — re-verification #2, after gap-closure plans 01-05, 01-06, 01-07 and round-2 code review 01-REVIEW.md

## Goal Achievement

### Re-Test of the 4 Previously-Failed Gaps

| Gap | Source plan | Status | Evidence |
|-----|------------|--------|----------|
| CR-01 — provisional state must yield to authoritative truth | 01-05 | CLOSED | `src/pages/Pricing.tsx:90-105` retires `provisionalPending`/`provisionalPeriodEnd` in a post-render effect keyed on `subscriptionState.isPendingDowngrade`, suppressed during local Stripe confirmation. After retirement, `isDowngradePending` (line 64-66) is driven solely by authoritative state. Regression test `Pricing.test.tsx:426` ("retires provisional pending once authoritative pending is observed, then lets cleared authoritative truth win (CR-01)") passes. |
| CR-02 — Pricing must expire pending controls at the exact boundary while mounted | 01-07 | CLOSED | `src/hooks/useSubscriptionState.ts:143-158` arms a single clamped one-shot `setTimeout` at the exact `currentPeriodEnd` instant that invalidates the shared query key, forcing `deriveSubscriptionState` to re-sample `now`. Fix is localized to the shared hook so both Pricing and Dashboard inherit it. Regression test `useSubscriptionState.test.ts:159` ("flips pending to false at the exact period-end instant for a mounted consumer") passes, including a no-early-flip assertion at the midpoint. |
| CR-03 — a Stripe-confirmed renewal must never regress to retryable failure or double-submit | 01-06 | CLOSED | `src/components/billing/RenewEliteDialog.tsx:153-216` splits `runRestore`: the provider-mutation try/catch (which sets `restore_error`) ends at explicit Stripe confirmation (`stripeConfirmedRef.current = true`, line 185); reconciliation is awaited in an isolated try/catch afterward (lines 205-215) where a rejection is silently held in `syncing`, never surfacing failure or Retry. `runRestore`'s top guard (line 156) also checks `stripeConfirmedRef.current`, making a second restore invoke structurally impossible. Regression test `RenewEliteDialog.test.tsx:190` ("holds syncing with no Retry when reconciliation rejects after Stripe confirmation") passes. |
| WR-01 — a downgrade confirmation must not submit after the session changes | 01-05 | CLOSED | `src/pages/Pricing.tsx:112-126` closes/resets the dialog when the subscription-derived `userId` changes to a different known identity while the dialog is open. `handleConfirmDowngrade` (lines 199-216) additionally re-reads `supabase.auth.getUser()` immediately before invoking `cancel-subscription` and aborts (zero invokes) on absent/mismatched identity. Two regression tests pass: `Pricing.test.tsx:497` (close-on-change) and `Pricing.test.tsx:533` (pre-invoke identity guard, zero `cancel-subscription` calls). |

All 4 previously-failed gaps are closed with source-level fixes matching their SUMMARY claims (verified by direct code reading, not SUMMARY trust) and each has a passing, purpose-built regression test.

### Plan Must-Have Truths (all 20, re-scored)

| # | Source | Must-have truth | Status | Evidence |
|---|--------|-----------------|--------|----------|
| 1 | 01-01 | D-15/D-16 authenticated preview plus explicit restore; no portal or price | VERIFIED | Unchanged since round 1; `renew-subscription/index.ts` untouched by 01-05/06/07. |
| 2 | 01-01 | D-17/D-20 stored-subscription, idempotent, literal-false restore | VERIFIED | Unchanged; focused Deno suite still green. |
| 3 | 01-01 | D-18/D-19 immediate Stripe confirmation; webhook owns persistence | VERIFIED | Unchanged; renewal function still performs no profile write. |
| 4 | 01-01 | D-18/D-20 same-tier Elite remains Elite, clears Free, grants no Merits | VERIFIED | Unchanged; webhook regression test still passes. |
| 5 | 01-02 | D-06-D-09 exact local date or null, never estimated | VERIFIED | Unchanged. |
| 6 | 01-02 | D-10/D-13/D-14 0-7 day helpers and exact-instant expiry | VERIFIED | Unchanged. |
| 7 | 01-02 | D-12 user-plus-period dismissal key | VERIFIED | Unchanged. |
| 8 | 01-02 | D-15-D-17 confirmation-first shared dialog with no duplicate submission | VERIFIED | CR-03 closed — `stripeConfirmedRef` re-entry guard now makes the restore mutation exactly-once even across a reconciliation rejection. |
| 9 | 01-02 | D-18-D-20 explicit confirmation, bounded reconciliation, failure preservation | VERIFIED | CR-03 closed — reconciliation rejection isolated from the pre-confirmation error boundary; syncing state persists, no false restore_error. |
| 10 | 01-03 | D-01/D-02 one context-aware Pricing destination | VERIFIED | Unchanged. |
| 11 | 01-03 | D-03-D-05 authoritative pending maps Current/Scheduled and exposes only renewal | VERIFIED | CR-01 closed — provisional retirement effect lets authoritative cleared/inactive/expired/changed-period state win on the same mount. |
| 12 | 01-03 | D-06-D-09 exact or no-estimate Pricing panel | VERIFIED | Unchanged. |
| 13 | 01-03 | D-15-D-17 Pricing shares dialog and cannot submit a second mutation | VERIFIED | CR-03 and WR-01 both closed; shared dialog + session-bound confirmation together close the previously-open duplicate/cross-session paths. |
| 14 | 01-03 | D-18-D-20 confirmed renewal defeats stale pending; failures remain pending | VERIFIED | CR-01 + CR-03 closed. |
| 15 | 01-04 | D-10/D-13/D-14 Dashboard 7-0 day clock and exact expiry | VERIFIED | Unchanged. |
| 16 | 01-04 | D-11 Dashboard warning is first banner | VERIFIED | Unchanged. |
| 17 | 01-04 | D-12 session-only, user-plus-period dismissal | VERIFIED | Unchanged. |
| 18 | 01-04 | D-13/D-15-D-17 shared safe renewal action from alert | VERIFIED | CR-03 closed at the shared dialog, so the Dashboard alert's renewal action inherits the fix without any Dashboard-file change. |
| 19 | 01-04 | D-18-D-20 confirmed removes alert; syncing persists; failures preserve Retry | VERIFIED | CR-03 closed. |
| 20 | 01-04 | D-01-D-20 complete automated phase gate | VERIFIED | All four previously-missing transitions now have dedicated passing regression tests (56 focused tests across the three touched files: 27 Pricing, 10 RenewEliteDialog, 19 useSubscriptionState); `npm.cmd run type-check` and `npm.cmd run lint` are clean (0 errors). |

**Score:** 20/20 plan must-have truths fully verified.

### Locked D-01 Through D-20 Coverage (delta from round 1)

| Decision | Round-1 status | Round-2 status | Evidence |
|----------|----------------|-----------------|----------|
| D-03 | FAILED (CR-01) | VERIFIED | Provisional retirement effect (`Pricing.tsx:90-105`) lets authoritative truth win. |
| D-14 | FAILED (CR-02) | VERIFIED | Exact-boundary timer in `useSubscriptionState.ts:143-158`. |
| D-17 | FAILED (CR-03) | VERIFIED | `stripeConfirmedRef` guard on `runRestore` (line 156). |
| D-18 | FAILED (CR-01/CR-03) | VERIFIED | Both underlying defects closed. |
| D-19 | FAILED (CR-03) | VERIFIED | Reconciliation rejection isolated from restore_error boundary (lines 201-215). |
| D-20 | FAILED (WR-01) | VERIFIED | Pre-invoke `getUser` re-check + close-on-change effect (`Pricing.tsx:112-126`, 205-216). |
| All others (D-01, D-02, D-04-D-13, D-15, D-16) | VERIFIED | VERIFIED | Unaffected by gap-closure plans; unchanged since round 1. |

All 20 locked decisions are now VERIFIED. No decision is blocked or contradicted by the two new review warnings (WR-01/WR-02 in `01-REVIEW.md`, both edge-case residuals, discussed below).

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/functions/renew-subscription/index.ts` | Authenticated preview/restore API | VERIFIED | Unchanged since round 1. |
| `src/lib/subscription-downgrade.ts` | Date/countdown/timer/key helpers | VERIFIED | Unchanged; `getSafeTimerDelay` reused by the new CR-02 fix. |
| `src/hooks/useSubscriptionState.ts` | Real-profile query and bounded reconciliation | VERIFIED | Now includes the exact-boundary invalidation effect; 19/19 tests pass. |
| `src/components/billing/RenewEliteDialog.tsx` | Shared renewal state machine | VERIFIED (was PARTIAL) | Split error boundary + re-entry guard close CR-03; 10/10 tests pass. |
| `src/pages/Pricing.tsx` | Authoritative persistent Billing orchestration | VERIFIED (was PARTIAL) | Provisional retirement + session-bound confirmation close CR-01/WR-01; 27/27 tests pass. |
| `src/components/dashboard/SubscriptionEndingAlert.tsx` | Clock-driven, session-dismissible alert | VERIFIED | Unchanged; inherits the shared hook's exact-boundary fix automatically. |
| `src/pages/Dashboard.tsx` | Topmost real-state integration | VERIFIED | Unchanged. |
| All other round-1 VERIFIED artifacts | — | VERIFIED | Untouched by gap-closure plans; no regression found in the focused suites re-run for this verification. |

**Artifact accounting:** 14/14 fully verified (was 12/14 with 2 partial). Both previously-partial artifacts (`RenewEliteDialog.tsx`, `Pricing.tsx`) are now fully verified.

## Key Link Verification (delta)

| From | To | Via | Round-1 | Round-2 | Details |
|------|----|-----|---------|---------|---------|
| Explicit Stripe confirmation | bounded reconciliation | callback then query polling | PARTIAL | WIRED | Reconciliation rejection no longer rewinds state; connection is now fail-safe in both directions (reconciled advances, rejection/timeout hold syncing). |
| `Pricing` | `useSubscriptionState` | real state plus provisional cancel state | PARTIAL | WIRED | Provisional state is now retired once authoritative pending is observed, and the shared hook re-derives at the exact boundary; authoritative truth always eventually wins on the mount. |

All other round-1 WIRED links remain WIRED and unaffected. **Key-link accounting:** 12/12 fully wired (was 10/12).

## Round-2 Code Review Findings — Blocking Assessment

`01-REVIEW.md` (round 2) confirmed 0 critical findings and reproduced no round-1 defect. Two new WARNING-level findings were raised in the fixed code:

1. **WR-01 (review numbering, `useSubscriptionState.ts:143-158`) — timer never re-arms when effect deps are value-identical.** Affects only (a) a mount that outlives the ~24.8-day `setTimeout` clamp before the real period end, or (b) a failed boundary refetch. Neither scenario produces a duplicate mutation, incorrect tier grant, or financial-safety violation — worst case is a stale pending panel that self-heals on the next unrelated refetch (focus, navigation, manual refresh). **Does not block D-14** (D-14 requires exact-instant expiry for the common case, which the passing regression test demonstrates); this is a residual edge case, not a contradiction of the locked decision.
2. **WR-02 (review numbering, `Pricing.tsx:90-105`/`64-66`) — provisional pending can persist forever if authoritative pending is never observed true on this mount** (e.g., renewed in another tab before this tab's query ever caught the pending state). The review itself notes any resulting action is an idempotent restore, so there is no duplicate-charge or entitlement risk — worst case is a stale "downgrade scheduled" panel with a safe no-op renewal CTA. **Does not block D-03/D-18** for the on-mount cancel→(wait)→authoritative-catch-up path that the regression test covers; this is a narrower cross-tab/cross-channel race than the original CR-01 finding (which made provisional permanently override *any* later truth, including on the same mount after normal cancellation flow).

Both are accepted as residuals: real but bounded edge cases with no financial-safety, duplicate-mutation, or entitlement impact, consistent with the phase's constraint to prioritize production reliability over exhaustive edge-case elimination. They are not new gaps against the phase goal or against D-01..D-20 as re-scored above. Three INFO findings (IN-01/IN-02/IN-03) are cosmetic/UI-staleness items with no functional or financial impact and are likewise non-blocking.

## Automated Evidence

| Check | Result |
|-------|--------|
| Focused re-run: `Pricing.test.tsx` + `RenewEliteDialog.test.tsx` + `useSubscriptionState.test.ts` | PASS — 3 files, 56 tests, 0 failures |
| `npm.cmd run type-check` | PASS — 0 errors |
| `npm.cmd run lint` | PASS — 0 errors, 152 pre-existing warnings (none introduced by phase 01 files) |
| Regression test for CR-01 | PASS — `Pricing.test.tsx:426` |
| Regression test for CR-02 | PASS — `useSubscriptionState.test.ts:159` |
| Regression test for CR-03 | PASS — `RenewEliteDialog.test.tsx:190` |
| Regression test for WR-01 (round 1) | PASS — `Pricing.test.tsx:497`, `Pricing.test.tsx:533` |
| Round-2 code review (`01-REVIEW.md`) | issues_found — 0 critical, 2 warning (accepted residuals), 3 info |

These commands, together with direct source reading of `Pricing.tsx`, `RenewEliteDialog.tsx`, and `useSubscriptionState.ts` (not SUMMARY-trust), confirm the gap-closure plans' claims match the actual codebase.

## Human Verification Required

Unchanged from round 1 — none of these were affected by the gap-closure plans and remain genuinely out of automated reach:

### 1. Responsive visual matrix

**Test:** Inspect Pricing panel/cards/dialog and Dashboard alert at 320px, 768px, desktop, light/dark, and 200% zoom.
**Expected:** Correct hierarchy, contrast, focus, full-width mobile actions, aligned cards, and no clipping or overflow.
**Why human:** DOM/class assertions do not prove final composition.

### 2. Real browser-session dismissal lifecycle

**Test:** Dismiss the Dashboard reminder, reload/navigate in the same tab, then open a new browser session while still eligible.
**Expected:** It stays hidden only in the original browser session and returns in the new session.
**Why human:** Unit storage mocks do not prove actual tab/session lifecycle.

### 3. Deployed Stripe reconciliation

**Test:** In preview/test Stripe, schedule a downgrade and restore it through pending -> syncing -> confirmed.
**Expected:** No duplicate controls, tier interruption, or Merit grant; Stripe confirmation is immediate and webhook-backed profile truth clears pending.
**Why human:** Requires deployed Stripe and webhook infrastructure.

These three items are judged non-blocking for automated phase-gate status: they are visual/session/deployed-infrastructure checks that were always out of static-verification scope, not new gaps introduced or left open by this phase's code. Status is `passed` with these items carried forward as standing human-verification recommendations before a production release announcement, per the operator's own instruction that only genuinely blocking items should force `human_needed`.

## Gaps Summary

None. All four round-1 gaps (CR-01, CR-02, CR-03, WR-01) are closed with source-level fixes verified directly against the codebase (not SUMMARY claims) and each has a dedicated, passing regression test. The round-2 code review's two new warnings are accepted, bounded, non-financial-safety residuals that do not block any locked decision D-01 through D-20. The phase goal — immediately understandable, persistently visible, duplicate-safe, reversible-before-expiration scheduled downgrades with Stripe/webhooks remaining authoritative — is achieved.

---

_Verified: 2026-07-19T23:59:00Z_
_Verifier: Claude (gsd-verifier)_
