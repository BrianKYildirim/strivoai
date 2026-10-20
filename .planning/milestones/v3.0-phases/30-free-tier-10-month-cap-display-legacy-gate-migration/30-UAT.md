***

status: complete
phase: 30-free-tier-10-month-cap-display-legacy-gate-migration
source:

* 30-01-SUMMARY.md
* 30-03-SUMMARY.md
* 30-04-SUMMARY.md
* 30-05-SUMMARY.md
  started: 2026-05-19T22:15:00Z
  updated: 2026-05-19T22:15:00Z

***

## Current Test

All tests complete. Phase 30 UAT: 10/10 passed.

## Tests

### 1. Free-tier merit balance header (single-value trigger)

expected: Free user sees `{total} / 10 merits` in the navbar pill — single value, no bonus chip. Aria-label reads "Merit balance: {total} of 10 merits".
result: pass
source: 30-03 (D-09/D-17 single-value trigger)

### 2. Merit popover body still shows full breakdown

expected: Clicking the merit pill opens the popover. Body shows three lines — Monthly (subscription balance, e.g. "7 / 10"), Top-up (shop balance, e.g. "0"), Total available (sum). The bonus/breakdown visibility moved into this popover, not the trigger.
result: pass
source: 30-03 (D-10 popover body preserved)

### 3. Low-balance warning fires on TOTAL, not just subscription

expected: A Free user at `2 / 10` subscription + `0` shop sees the low-balance warning (the pill turns warning-colored / icon shows). If the same user has `2 / 10` subscription + `8` shop (total = 10), the warning is GONE — the warning state now follows total, matching the displayed ratio.
result: pass
source: 30-03 (D-11 isLow on total)

### 4. Free signup → 10 merits with monthly reset

expected: Create a brand-new Free account (or inspect `user_merits` for a recent signup). Row should read `subscription_balance = 10`, `subscription_cap = 10`, `subscription_reset_date ≈ now() + 1 month` (non-NULL). The signup-grant ledger row in `merit_transactions` shows amount = 10.
result: pass
source: 30-01 (Migration #1 — auto\_provision\_user\_merits Free arm)

### 5. Existing Free users backfilled to ≥10 merits

expected: Pick an existing Free user that pre-dated Phase 30. Their `user_merits.subscription_balance` is now ≥ 10 and `subscription_reset_date` is non-NULL (clamped to last day of target month if their signup-day overflows). A `phase-30-free-backfill` source-literal row exists in `merit_transactions` for that user.
result: pass
source: 30-01 (Migration #2 backfill)

### 6. reset-subscription-merits cron sweeps Free tier

expected: Run `supabase functions invoke reset-subscription-merits` (or wait for the cron). A Free user whose `subscription_reset_date <= now()` has their `subscription_balance` SET to 10 (not added) and `subscription_reset_date` advanced by 1 month. The Deno regression test for this passes (`supabase/functions/reset-subscription-merits/index.test.ts`).
result: pass
source: 30-01 (Migration #3 reset RPC Free arm + cron filter)

### 7. usePaywallGuard powered by useMerits — no can\_perform\_ai\_action calls

expected: Open DevTools Network tab. Trigger any feature that previously hit the paywall guard (e.g. opening Resume Analysis as a Free user near the cap). No request to `can_perform_ai_action` RPC fires. The paywall trigger fires when total merits = 0; passes when total > 0.
result: pass
source: 30-04 (usePaywallGuard rewrite — MER-12)

### 8. useTierAccess + AdminTierTestContext respects MERITS\_PER\_MONTH

expected: As an admin, open the AdminTierTestContext tier switcher. Toggle Free → Pro → Elite. The merit cap displayed in the header changes 10 → 75 → 150 (matching `MERITS_PER_MONTH` in `pricing-config.ts`). TIER\_FEATURES gating still works for each tier.
result: pass
source: 30-04 (useTierAccess rewrite + admin override)

### 9. analyze-resume runs merit gateway unconditionally

expected: Free user with merits remaining (e.g. 5 / 10) submits a resume. Analysis completes and 1 merit is deducted via `withMerits`. No `can_perform_ai_action` 402 path fires. Same user at 0 merits is blocked with the merit-gateway 402 (not the legacy `createUsageLimitResponse` shape). `MERIT_SYSTEM_ENABLED` env-var has no effect on behavior for this function.
result: pass
source: 30-05 (D-15 legacy branch rip — MER-12)

### 10. Doc reality matches shipped behavior

expected: `grep -i "bonus chip retained"` in REQUIREMENTS.md + ROADMAP.md returns no matches. `grep "Free 10 monthly"` in STATE.md matches line 73. PROJECT.md "Current State" describes Free as 10 monthly replenishing (no contradictory "lifetime grant" wording).
result: pass (auto-verified via grep at UAT close)
source: 30-06 (D-17 doc reconciliation)

## Summary

total: 10
passed: 10
issues: 0
