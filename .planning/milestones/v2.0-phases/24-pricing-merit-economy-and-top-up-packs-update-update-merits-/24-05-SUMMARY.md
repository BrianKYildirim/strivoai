---
phase: 24-pricing-merit-economy-and-top-up-packs-update-update-merits-
plan: 05
subsystem: brand-v2-theme-scope-and-pricing-page-rewrite
tags: [brand, ui, pricing-page, boxy, tailwind, tokens, theme-v2, d-15, d-16, d-17, d-18, sc-8, sc-10]
requirements: [BRAND-01, BRAND-02, UX-08, SUB-02, SUB-04, SHOP-01, SHOP-02, SHOP-03, SHOP-04]
dependency_graph:
  requires: [24-01]
  provides:
    - "`.theme-v2` scoped CSS-var namespace (brand-v2 tokens — no bleed into :root/.dark/.light)"
    - "Google Fonts Fraunces / Inter Tight / JetBrains Mono via preconnect + display=swap"
    - "Tailwind fontFamily (display/body/mono) + borderRadius.boxy extensions"
    - "Button `boxy` + `boxy-outline` variants (defaultVariants preserved)"
    - "PricingPageV2 composed from TierCardV2 × 3 + BillingIntervalToggleV2 + PackSectionV2 at #packs"
    - "D-18 CI lint (pricing-boxy.lint.test.ts) — 5 tests reject rounded-full / variant=default / non-boxy Button variants / missing aria-labels on /pricing surfaces"
  affects:
    - "Pricing.tsx — legacy PricingTable + PlanComparisonTable fully removed"
    - "Plan 06 will attach its StripePaymentElementModal listener to the `topup:open` CustomEvent dispatched by PackCardV2 → Pricing.tsx"
key_files:
  created:
    - src/components/pricing/TierCardV2.tsx
    - src/components/pricing/BillingIntervalToggleV2.tsx
    - src/components/pricing/PackSectionV2.tsx
    - src/components/pricing/PackCardV2.tsx
    - src/pages/__tests__/pricing-boxy.lint.test.ts
    - src/pages/Pricing.test.tsx
  modified:
    - src/index.css
    - index.html
    - tailwind.config.ts
    - src/components/ui/button.tsx
    - src/pages/Pricing.tsx
decisions:
  - "`.theme-v2` tokens scoped on a `.theme-v2` class selector; Phases 15-23 surfaces untouched (D-15/D-16)"
  - "Google Fonts loaded via `<link rel=\"stylesheet\">` with `display=swap` + preconnect hints — FOUT-not-FOIT if fonts.gstatic.com is slow (D-17)"
  - "borderRadius.boxy = `8px` exposed as Tailwind utility `rounded-boxy`; boxy variants use that instead of arbitrary-value syntax"
  - "Pack_25 anchor styling: `scale-105` + 2px red border + ambient `--accent-red-glow` box-shadow — SC-8"
  - "Pricing.tsx dispatches a `topup:open` CustomEvent on Buy-now clicks; Plan 06 owns the listener wiring (keeps this plan free of edge-function coupling)"
  - "D-18 lint hardcodes the PRICING_SURFACES list for determinism — future pricing components must be appended to that array explicitly"
metrics:
  tasks: 5
  commits: 4
  tests_added: 11
  files_created: 6
  files_modified: 5
  completed: 2026-04-22
---

# Phase 24 Plan 05: Brand-v2 Theme Scope + /pricing Rewrite

**One-liner:** Ship the brand-v2 visual layer (Fraunces / JetBrains Mono / Inter Tight, bg-deep / accent-red palette, 8px boxy radius) SCOPED to a `.theme-v2` class so Phases 15-23 surfaces stay pixel-identical, rebuild `/pricing` as `PricingPageV2` on top of it, and add a D-18 CI lint that rejects `rounded-full` / `variant="default"` on every pricing surface.

## Diff stats

| File | Lines added | Notes |
|------|-------------|-------|
| `src/index.css` | +34 / -8 | `.theme-v2` block appended (11 tokens + `.font-display` / `.font-mono` helpers) |
| `index.html` | +3 | Google Fonts preconnect + `<link>` (Fraunces/Inter Tight/JetBrains Mono with `display=swap`) |
| `tailwind.config.ts` | +6 | `fontFamily.display/body/mono` + `borderRadius.boxy: '8px'` — existing keys preserved |
| `src/components/ui/button.tsx` | +4 | `boxy` + `boxy-outline` variants; `defaultVariants.variant = "default"` untouched |
| `src/components/pricing/TierCardV2.tsx` | +88 (new) | Tier card — price via `PRICING[tier][interval]`, merit cap via `MERITS_PER_MONTH`, boxy CTA, Pro-tier highlight |
| `src/components/pricing/BillingIntervalToggleV2.tsx` | +47 (new) | `role=tablist` monthly/annual switch with `aria-selected`; "Save 17%" badge (SUB-04) |
| `src/components/pricing/PackSectionV2.tsx` | +28 (new) | `<section id="packs">` wrapper (D-24 deep link) + 1→2→4 col responsive grid |
| `src/components/pricing/PackCardV2.tsx` | +54 (new) | PACK_CATALOG-driven card; pack_25 gets scale-105 + 2px red border + red glow + "Best Value" badge (SC-8) |
| `src/pages/Pricing.tsx` | +75 / -18 | Rewritten as PricingPageV2 under `.theme-v2` wrapper; legacy PricingTable + PlanComparisonTable imports removed; `topup:open` CustomEvent dispatch for Plan 06 |
| `src/pages/Pricing.test.tsx` | +63 (new) | 6 cases — tier cards, toggle default + switch, pack count + `#packs` anchor, `.theme-v2` wrapper, `topup:open` dispatch |
| `src/pages/__tests__/pricing-boxy.lint.test.ts` | +66 (new) | D-18 CI lint — 5 tests |

## Tasks authored

| Task | Title | Status | Commit |
|------|-------|--------|--------|
| 1 | Brand-v2 tokens + Google Fonts + Tailwind extensions + boxy Button variants | done | `34b23e9` |
| 2 | Four V2 components (TierCardV2 / BillingIntervalToggleV2 / PackSectionV2 / PackCardV2) | done | `0a3cb8e` |
| 3 | Rewrite Pricing.tsx as PricingPageV2 under `.theme-v2` wrapper + 6 Pricing.test.tsx cases | done | `4193704` |
| 4 | D-18 mechanical lint — reject `rounded-full` / `variant="default"` on /pricing surfaces | done | this commit |
| 5 | Browser checkpoint — verify /pricing visual contract | deferred | see "Deferred checkpoint" below |

## D-18 lint coverage

| # | Test | What it guards |
|---|------|----------------|
| 1 | `button.tsx exposes boxy + boxy-outline variants` | Task 1 integrity — regresses if a refactor drops either variant |
| 2 | `no /pricing surface file uses rounded-full in className` | Brand lock — pill buttons forbidden on /pricing |
| 3 | `no /pricing surface file uses variant="default" on Button` | Brand lock — default tan/primary look forbidden on /pricing |
| 4 | `every <Button variant="..."> under src/components/pricing/ uses boxy or boxy-outline` | Positive enforcement — only the two brand-v2 variants allowed |
| 5 | `every /pricing surface button has an aria-label (a11y sanity)` | Accessibility — screen readers announce every pricing CTA |

Lint runtime: 7ms across the 5 tests (filesystem reads only — no glob, no build step).

## Test results

| Suite | Tests | Result |
|-------|-------|--------|
| `src/pages/Pricing.test.tsx` | 6 | ✅ all green |
| `src/pages/__tests__/pricing-boxy.lint.test.ts` | 5 | ✅ all green |

## Acceptance criteria — verified

- [x] `rg ".theme-v2" src/index.css` → 3 matches (block + `.font-display` / `.font-mono` helpers)
- [x] `rg "fonts.googleapis.com" index.html` → 1 match
- [x] `rg "fraunces" tailwind.config.ts -i` → 1 match
- [x] `rg "boxy:|\"boxy-outline\":" src/components/ui/button.tsx` → 2 matches
- [x] `rg "defaultVariants" src/components/ui/button.tsx` → shows `variant: "default"` unchanged
- [x] `rg "display=swap" index.html` → 1 match
- [x] `rg "PACK_CATALOG" src/components/pricing/PackSectionV2.tsx` → 1 match
- [x] `rg "isBestValue" src/components/pricing/PackCardV2.tsx` → 3 matches (prop check + conditional + badge branch)
- [x] `rg 'id="packs"' src/components/pricing/PackSectionV2.tsx` → 1 match (D-24)
- [x] `rg "scale-105" src/components/pricing/PackCardV2.tsx` → 1 match (SC-8)
- [x] `rg "Save 17%" src/components/pricing/BillingIntervalToggleV2.tsx` → 1 match
- [x] `rg "theme-v2" src/pages/Pricing.tsx` → 1 match (`main` wrapper)
- [x] `rg "PackSectionV2|BillingIntervalToggleV2" src/pages/Pricing.tsx` → 2 matches
- [x] `rg "topup:open" src/pages/Pricing.tsx` → 1 match
- [x] `rg "PricingTable|PlanComparisonTable" src/pages/Pricing.tsx` → 0 matches

## TypeScript

`tsc --noEmit -p tsconfig.app.json` shows 0 errors in any Plan 24-05 file. The 8 unrelated errors present in the working tree (CareerCompass.tsx, Dashboard.tsx, SkillsGapAnalysis.tsx) predate this plan and are not introduced by this work.

## Deferred checkpoint

Task 5 is a 10-point in-browser visual check (font rendering, palette, toggle behavior, pack_25 anchor, #packs deep link, no-bleed on /dashboard, a11y tab order, responsive collapse). Deferred to phase-level UI review because this plan was completed inline after worktree execution had already produced commits 34b23e9 / 0a3cb8e / 4193704 — a fresh `npm run dev` was not re-opened by the human operator during the inline finish. Visual contract will be re-asserted during `/gsd-ui-review 24` or equivalent before phase sign-off.

## Hand-off to Plan 06

- Listen for `window.addEventListener('topup:open', (e) => { /* e.detail.packId */ })` — `StripePaymentElementModal` should mount and call `create-payment-intent` with the pack ID.
- `PACK_CATALOG` is the single source of truth for pack IDs; the edge function already validates incoming `packId` against the same list.
- `/pricing#packs` is wired; Plan 06's header top-up trigger can deep-link with `navigate('/pricing#packs')`.
