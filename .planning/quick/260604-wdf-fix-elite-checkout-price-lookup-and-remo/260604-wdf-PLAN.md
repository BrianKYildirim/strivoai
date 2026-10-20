---
status: in_progress
created: 2026-06-05
quick_id: 260604-wdf
slug: fix-elite-checkout-price-lookup-and-remo
---

# Quick Task 260604-wdf: Fix Elite Checkout and Remove Shop/Billing Routes

## Goal

Fix checkout failure for the active paid Elite tier when deployment secrets still use the legacy paid-tier price names, and remove the standalone `/shop` and `/settings/billing` page routes so the only shop/pricing surface is `/pricing`.

## Must Haves

- Elite subscription checkout resolves an active paid-tier price id even when `STRIPE_PRICE_ELITE_<INTERVAL>` is unset but the legacy `STRIPE_PRICE_PRO_<INTERVAL>` paid price is configured.
- Stripe webhook tier resolution treats a legacy paid Pro price as Elite when no explicit Elite price exists for that interval.
- `/shop` and `/settings/billing` route entries and page imports are removed from the app route table.
- Existing UI links/buttons to `/shop` or `/settings/billing` point to `/pricing`.
- Removed standalone shop/billing page files and direct page tests are deleted.
- Focused checkout, pricing, and link tests are updated and run.

## Implementation Notes

- Keep Pro as a legacy accepted request/body tier for backend compatibility, but active frontend navigation should expose only Free and Elite.
- Keep top-up packs on `/pricing` through the existing pricing pack section and top-up modal.
- Update checkout success/cancel return URLs away from `/shop` and `/billing/success`.
