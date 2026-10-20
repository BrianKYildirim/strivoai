# TEST-07 — Stripe Boundary End-to-End Operator Checklist

> Phase 33 (Pricing / Checkout / Billing Routes + Strivo Design Unification). The automated
> content/static portion of TEST-07 is covered by `pricing-token-guard.test.ts` + the SC-12
> content snapshot. This artifact records the **inherently-manual** portion: the four live
> Stripe-boundary e2e flows the harness cannot self-verify.

| Field | Value |
|-------|-------|
| Phase | 33 — pricing-checkout-billing-routes-strivo-design-unification |
| Date executed | 2026-05-21 |
| Staging environment / build | staging (commit `5eced81` under test) |
| Stripe mode | TEST mode confirmed: ☑ yes |
| Stripe test card | `4242 4242 4242 4242`, any future expiry, any CVC/ZIP |

---

## Flows

| # | Flow | Steps | Expected | Result (PASS/FAIL) | Stripe Dashboard evidence | Notes |
|---|------|-------|----------|--------------------|---------------------------|-------|
| 1 | Free→Pro | On `/pricing` click **Upgrade to Pro** → embedded Stripe modal opens → complete with test card | Redirect to `/dashboard?checkout=complete` → "Upgrade processing…" toast → `subscription_tier=pro` + Pro merit cap reconciled within ~10s (no manual refresh) | **PASS** | Active subscription created (Pro price item) | Tier + merit cap reconciled on `/dashboard` within ~10s, no manual refresh. |
| 2 | Free→Elite | On `/pricing` click **Upgrade to Elite** → embedded modal → complete with test card | Redirect to `/dashboard?checkout=complete` → processing toast → `subscription_tier=elite` + Elite merit cap within ~10s | **PASS** | Active subscription created (Elite price item) | Tier=elite + Elite merit cap reconciled within ~10s. |
| 3 | Pro→Elite (swap) | As a **Pro** subscriber, on `/pricing` click **Upgrade to Elite** | Server-side swap (NO modal) → `/dashboard` reconciles to `elite`; **AND** Stripe Dashboard shows exactly **ONE** active subscription (item swapped, not a 2nd subscription) — TEST-08 tie-in | **PASS** | Active-subscription count = **1** (existing subscription item swapped Pro→Elite; no second subscription created) | No modal — server-side swap as designed. `/dashboard` reconciled to elite. Stripe Dashboard confirmed exactly ONE active subscription (TEST-08 satisfied). |
| 4 | Shop pack regression | On `/pricing` pack section click **Buy now** on a Top-Up pack → embedded checkout → complete | Return to `/shop?checkout=complete` (or current return) → merit balance increments via `reconcileShopCredit` | **PASS** | One-time payment captured (pack purchase) | Merit balance incremented via `reconcileShopCredit`; checkout wiring (Plan 03) unaffected by the restyle. |

---

## Sign-Off

- Operator name: strivolife (operator)
- Date: 2026-05-21
- Overall result: ☑ PASS  ☐ FAIL

All four TEST-07 e2e flows executed against staging in Stripe TEST mode and confirmed PASS,
including exactly ONE active subscription remaining in the Stripe Dashboard after the
Pro→Elite swap (TEST-08 tie-in satisfied).

> If any flow FAILs, record it as FAIL with notes above. Do NOT mark the phase complete on a
> FAIL — the failure feeds gap closure.
