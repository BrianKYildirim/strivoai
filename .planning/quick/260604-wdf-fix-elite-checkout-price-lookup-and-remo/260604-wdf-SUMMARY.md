---
status: complete
quick_id: 260604-wdf
slug: fix-elite-checkout-price-lookup-and-remo
commit: beb94cc
completed: 2026-06-05
---

# Quick Task 260604-wdf Summary

## Completed

- Fixed active Elite checkout price resolution by moving `create-checkout-session` to the shared Stripe price resolver.
- Added paid-tier fallback behavior: `STRIPE_PRICE_ELITE_<INTERVAL>` wins, `STRIPE_PRICE_PAID_<INTERVAL>` is supported, and legacy `STRIPE_PRICE_PRO_<INTERVAL>` is treated as Elite only when it is the only paid-tier price configured for that interval.
- Kept webhook renewal/subscription tier resolution aligned with checkout fallback behavior.
- Removed the `/shop` and `/settings/billing` routes, imports, standalone pages, and direct page tests.
- Retargeted old shop/billing links and Stripe return URLs to `/pricing`.
- Normalized header tier labels through `getTierDisplayName()` so legacy Pro profile values display as Elite in the active two-tier UI.

## Verification

- PASS: `npm.cmd run test -- LowBalanceWarning MeritCostPreview Pricing`
- PASS: `deno.cmd test --allow-env --allow-net --no-check supabase/functions/_shared/price-resolver.test.ts`
- PASS: `deno.cmd test --allow-env --allow-net --no-check supabase/functions/create-checkout-session/index.test.ts`
- PASS: `deno.cmd test --allow-env --allow-net --no-check supabase/functions/create-stripe-portal/index.test.ts`
- PASS: `deno.cmd check supabase/functions/_shared/price-resolver.ts supabase/functions/_shared/price-resolver.test.ts supabase/functions/create-checkout-session/index.ts supabase/functions/create-checkout-session/index.test.ts supabase/functions/create-stripe-portal/index.ts supabase/functions/create-stripe-portal/index.test.ts supabase/functions/stripe-webhook-handler/index.ts supabase/functions/send-strivo-email/index.ts`
- PASS: `npx.cmd eslint src/App.tsx src/components/AppSidebar.tsx src/components/Navbar.tsx src/components/TopBar.tsx src/components/LowBalanceWarning.tsx src/components/LowBalanceWarning.test.tsx src/components/MeritCostPreview.tsx src/components/MeritCostPreview.test.tsx src/pages/Pricing.tsx src/pages/Pricing.test.tsx`
- PASS: `npm.cmd run build -- --outDir dist-codex --emptyOutDir=true`
- PARTIAL: `npm.cmd run type-check` still fails on unrelated pre-existing errors in `PriorAnalysisSelector`, `PriorLinkedInSelector`, feature-flag/paywall/tier tests, `CareerCompass`, `Dashboard`, `Onboarding`, `SkillsGapAnalysis`, and `Upload`.

## Notes

- Running multiple Deno test files in parallel caused a Windows `Deno.serve` port collision; rerunning the modified suites individually passed.
- `.planning/` artifacts were intentionally left uncommitted because project instructions prohibit committing `.planning/`.
