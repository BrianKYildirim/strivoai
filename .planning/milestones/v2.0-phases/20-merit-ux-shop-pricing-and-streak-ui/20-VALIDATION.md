---
phase: 20
slug: merit-ux-shop-pricing-and-streak-ui
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-17
audited: 2026-04-18
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npm run test` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~7 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test`
- **After every plan wave:** Run `npm run test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | Test File | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-----------|--------|
| 20-02-01 | 02 | 1 | UX-11 | T-20-04,05 | Balance read via RPC + RLS | unit | `npm run test` | `src/hooks/useMerits.test.ts` | ✅ green |
| 20-02-02 | 02 | 1 | UX-11 | T-20-06 | Feature cost lookup | unit | `npm run test` | `src/hooks/useFeatureCosts.test.ts` | ✅ green |
| 20-02-03 | 02 | 1 | SHOP-05 | T-20-11 | Embedded checkout invocation | unit | `npm run test` | `src/hooks/useStripeCheckout.test.ts` | ✅ green |
| 20-03-01 | 03 | 2 | UX-01 | T-20-08 | Balance badge render | unit | `npm run test` | `src/components/MeritBalanceBadge.test.tsx` | ✅ green |
| 20-03-02 | 03 | 2 | UX-02, UX-03, UX-04 | T-20-07 | Cost preview states | unit | `npm run test` | `src/components/MeritCostPreview.test.tsx` | ✅ green |
| 20-04-01 | 04 | 2 | UX-08 | T-20-09 | Pricing table pricing + toggle | unit | `npm run test` | `src/components/PricingTable.test.tsx` | ✅ green |
| 20-05-01 | 05 | 2 | UX-05 | T-20-12 | Shop pack card + popular badge | unit | `npm run test` | `src/components/MeritShopCard.test.tsx` | ✅ green |
| 20-05-02 | 05 | 2 | UX-06 | — | Tier-conditional banner logic | unit | `npm run test` | `src/components/UpgradeComparisonBanner.test.tsx` | ✅ green |
| 20-05-03 | 05 | 2 | SHOP-05 | T-20-12,13 | Shop page pack grid | unit | `npm run test` | `src/pages/Shop.test.tsx` | ✅ green |
| 20-06-01 | 06 | 3 | UX-07 | T-20-14 | Billing page empty + CTAs | unit | `npm run test` | `src/pages/Settings/Billing.test.tsx` | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure (vitest + jsdom + React Testing Library) covers all phase requirements. No new test infrastructure was required.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Merit balance badge popover interaction | UX-01 | Popover open/close + keyboard/focus-trap behavior | Click badge in TopBar, verify popover shows subscription vs shop breakdown and reset date |
| Amber warning banner in popover | UX-03 | Threshold-dependent visual state | Reduce merits below 4, open popover, verify amber callout |
| Zero-balance disabled analyze button | UX-04 | Full feature-page rendering + button disabled state | Set balance to 0, navigate each feature page, verify Analyze disabled + two CTAs |
| Stripe Checkout Session launches on Buy | SHOP-05 | External iframe render (cannot assert inside Stripe frame) | Click Buy on 25-pack, verify Stripe Checkout dialog opens and loads |
| Pricing page monthly/yearly visual polish | UX-08 | Crossed-out price styling + animation | Toggle Monthly/Yearly, verify strikethrough + savings badges + current-plan highlight |
| Streak flame visual states | UX-11 | Time-dependent visual states (shipped in Phase 19) | Verify flame at active, 24h cold (dimmed), 48h broken (restart CTA) |
| Shop receipt email delivery | SHOP-08 | Edge function + Resend transport; out of vitest scope | Complete a shop purchase in staging, verify email receipt arrives with pack size, amount, date, billing link |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-04-18

---

## Validation Audit 2026-04-18

| Metric | Count |
|--------|-------|
| Gaps found | 10 |
| Resolved | 10 |
| Escalated | 0 |

All 10 automatable gaps for Phase 20 were filled by the gsd-nyquist-auditor. 33 assertions pass across 10 new test files. Manual-Only list refined to cover genuinely visual/external behaviors (popover interaction, Stripe iframe, email delivery).
