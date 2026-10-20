# Phase 25: ux-gap-closure-and-phase-23-cleanup — Pattern Map

**Mapped:** 2026-04-28
**Files analyzed:** 19 (5 NEW/extended, 11 MODIFY, 3 DELETE-only)
**Analogs found:** 16 / 16 non-delete files (100%)

> **Note for the planner:** RESEARCH.md drift findings are honored throughout. Notably:
> - `src/hooks/useMerits.test.ts` ALREADY EXISTS with 11 tests (canAfford, isLow boundary, isZero); D-19 work is **extending** it, not creating it.
> - `src/pages/InterviewPrep.test.tsx` has NO 5 form-submission `it()` blocks; D-14 reduces to a comment-block update at lines 4-7 / 180-183.
> - `useMerits.isLow` is a 20%-of-cap signal — `LowBalanceWarning` must compute its own `total < 2 × min(applicable cost)` threshold inline, NOT reuse `isLow`.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/components/LowBalanceWarning.tsx` | component (banner) | render-only (consumes `useMerits`) | `src/components/MeritBalanceBadge.tsx` (orphan, color tokens) + `src/components/topup/MeritBalanceHeaderV2.tsx` (Link CTA pattern) | exact |
| `src/components/LowBalanceWarning.test.tsx` | test (RTL component) | render-assertion | `src/components/MeritBalanceBadge.test.tsx` (orphan, deleted same plan) and `src/components/topup/MeritBalanceHeaderV2.test.tsx` | exact |
| `src/hooks/useMerits.test.ts` (EXTEND) | test (RTL hook) | render-assertion + fake timers | `src/hooks/useMerits.test.ts` (existing canAfford block) + `src/hooks/useFeatureCosts.test.ts` (fixture style) | exact |
| `docs/tech-debt/IPC-JSDOM-001.md` | doc | static markdown | `.planning/phases/20-…/20-VERIFICATION.md` (only existing repo precedent) | partial — first tech-debt doc |
| `.planning/phases/25-…/25-AUDIT-TRAIL.md` | doc | static markdown | `.planning/phases/20-…/20-VERIFICATION.md` (truth/artifact tables) | partial — first AUDIT-TRAIL |
| `src/components/topup/MeritBalanceHeaderV2.tsx` (MODIFY) | component | render-only | `src/components/MeritBalanceBadge.tsx:15-19` (port the recipe) | exact |
| `src/components/topup/MeritBalanceHeaderV2.test.tsx` (EXTEND) | test | render-assertion | self (existing 5 tests) | exact |
| `src/pages/CareerCompass.tsx` (MODIFY) | page | render-only | `src/pages/Upload.tsx:432-436` (`<MeritCostPreview />` placement); `src/pages/LinkedInGrader.tsx:647` (inline `getCostForFeature` call) | exact |
| `src/pages/Upload.tsx` (MODIFY) | page | render + 402 trigger | `src/hooks/useOutOfMeritsModal.ts` consumer pattern (header docstring lines 11-16) | exact |
| `src/hooks/usePaywallGuard.ts` (MODIFY) | hook | state | `src/hooks/useOutOfMeritsModal.ts` (replacement contract) | role-match |
| `src/components/TopBar.tsx` (MODIFY) | component | render-only + nav | self (TopBar.tsx:189-207 — existing `<Link to="/pricing" asChild>` `DropdownMenuItem` pattern) | exact (in-file) |
| `src/components/Navbar.tsx` (MODIFY) | component | render-only + nav | self (Navbar.tsx:580-592 — existing `<Link to="/pricing" asChild>` `DropdownMenuItem` pattern) | exact (in-file) |
| `src/pages/Profile.tsx` (MODIFY) | page | render-only + nav | TopBar.tsx:189-207 (cross-file `<Link to="/pricing">` pattern) | role-match |
| `supabase/functions/_shared/interview-prep-validation.ts` (DELETE LINES 185-198) | utility | n/a | n/a (deletion only) | n/a |
| `supabase/functions/_shared/__tests__/interview-prep-validation.test.ts` (VERIFY) | test | n/a | self (lines 1-7 confirm it imports only the canonical `validateInterviewPrepPayload`) | exact (no-op verify) |
| `src/pages/InterviewPrep.test.tsx` (COMMENT EXTEND) | test | n/a | self (existing comment lines 4-7 + 180-183) | exact (in-file extend) |
| `scripts/phase21-runbook.ps1` (APPEND in `Stage-D4-Finalize`) | runbook | side-effect (PS host) | self (lines 700-723 — `Stage-D3-Soak1`/`Soak2` `Write-Step`/`Write-Note` voice) | exact (in-file extend) |
| `src/components/MeritBalanceBadge.tsx` (DELETE) | n/a | n/a | n/a | DELETE |
| `src/components/MeritBalanceBadge.test.tsx` (DELETE) | n/a | n/a | n/a | DELETE |
| `src/components/UpgradeModal.tsx` (DELETE) | n/a | n/a | n/a | DELETE |

---

## Pattern Assignments

### `src/components/LowBalanceWarning.tsx` (NEW — component, render-only)

**Primary analog:** `src/components/MeritBalanceBadge.tsx` (lines 15-19 — exact Tailwind token recipe)
**Secondary analog:** `src/components/topup/MeritBalanceHeaderV2.tsx` (lines 80-94 — Link CTA dual-button pattern)

**What to copy from analog 1:** the EXACT amber + destructive token strings — preserve visual parity with the orphan and the Phase 25 D-02 V2 color states.

**Imports pattern** (match V2 + orphan):

```typescript
import { AlertTriangle, Gem } from 'lucide-react';            // orphan line 1 + V2 line 15
import { Link } from 'react-router-dom';                       // orphan line 4
import { useMerits } from '@/hooks/useMerits';                 // orphan line 5 + V2 line 24
import { MERIT_COST_PER_FEATURE, type Tier } from '@/config/pricing-config';  // NEW for tier-applicable filter
```

**Color token recipe to lift verbatim** (`MeritBalanceBadge.tsx:15-19`):

```typescript
const badgeClassName = isZero
  ? 'bg-destructive/10 text-destructive border-destructive/30'
  : isLow
    ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
    : 'bg-primary/10 text-primary border-primary/20';
```

**Dual-CTA pattern to mirror** (`MeritBalanceHeaderV2.tsx:80-94`):

```tsx
<div className="flex items-center justify-center gap-2 text-sm">
  <Link to="/shop" className="text-primary hover:underline">Buy Merits</Link>
  <span className="text-muted-foreground">·</span>
  <Link to="/pricing" className="text-primary hover:underline">Upgrade</Link>
</div>
```

**Loading guard** (orphan line 11-13):

```tsx
if (isLoading) return null;   // banner returns null on load (orphan returns skeleton; banner is non-essential, return null)
```

**Inline threshold helper** (NEW — derive from `MERIT_COST_PER_FEATURE` filtered by tier):

```typescript
function cheapestApplicableCost(tier: Tier): number {
  const applicable = Object.values(MERIT_COST_PER_FEATURE)
    .map((row) => row[tier])
    .filter((c): c is number => c !== null);
  return applicable.length > 0 ? Math.min(...applicable) : 0;
}
// trigger: total < 2 * cheapestApplicableCost(tier)
```

> **One-line note:** Lift the orphan's `isZero/isLow/normal` className ternary verbatim; mirror V2's `<Link to="/shop">` · `<Link to="/pricing">` CTA row; compute the threshold INLINE — do NOT reuse `useMerits.isLow` (Pitfall 1).

---

### `src/components/LowBalanceWarning.test.tsx` (NEW — test, render-assertion)

**Primary analog:** `src/components/topup/MeritBalanceHeaderV2.test.tsx` (full file — Vitest + RTL + MemoryRouter + `useMerits` mock)
**Secondary analog:** `src/components/MeritBalanceBadge.test.tsx` (lines 13-27 — `vi.mock('@/hooks/useMerits')` + `MemoryRouter` wrapper)

**Imports + mock pattern to copy** (`MeritBalanceHeaderV2.test.tsx:9-19`):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

const useMeritsMock = vi.fn();
vi.mock('@/hooks/useMerits', () => ({
  useMerits: () => useMeritsMock(),
}));

import { LowBalanceWarning } from './LowBalanceWarning';
```

**Per-test seeding helper to copy** (`MeritBalanceHeaderV2.test.tsx:21-44`):

```typescript
function setMerits(opts: { total: number; tier: 'free' | 'pro' | 'elite'; isZero?: boolean; isLoading?: boolean }) {
  useMeritsMock.mockReturnValue({
    total: opts.total,
    subscription: opts.total,
    shop: 0,
    cap: 75,
    tier: opts.tier,
    resetDate: null,
    isLow: false,
    isZero: opts.isZero ?? opts.total <= 0,
    isLoading: opts.isLoading ?? false,
    canAfford: () => true,
  });
}

beforeEach(() => { useMeritsMock.mockReset(); });
```

**Render harness pattern** (`MeritBalanceBadge.test.tsx:22-27`):

```typescript
const renderBanner = () =>
  render(
    <MemoryRouter>
      <LowBalanceWarning />
    </MemoryRouter>,
  );
```

**Assertion shape — extend with these new cases:**

| Test | Seed | Assert |
|------|------|--------|
| T1: hides when total > 2× cheapest | `{ total: 100, tier: 'pro' }` | `container.firstChild` is `null` |
| T2: amber banner when low | `{ total: 3, tier: 'pro' }` (cheapest pro = 2 → threshold = 4) | text `/running low/i` + class `text-amber-500` |
| T3: destructive banner on zero | `{ total: 0, tier: 'pro', isZero: true }` | text `/out of merits/i` + class `text-destructive` |
| T4: dual CTA links | any low/zero state | `screen.getByRole('link', { name: /buy merits/i })` + `/upgrade/i` |
| T5: free-tier excludes locked features | `{ total: 6, tier: 'free' }` | with cheapest free = 3 → threshold = 6 → boundary case (test < and =) |

> **One-line note:** Clone the `useMeritsMock` + `setMerits` + `MemoryRouter` harness from `MeritBalanceHeaderV2.test.tsx` verbatim; extend with 5 banner-specific assertions.

---

### `src/hooks/useMerits.test.ts` (EXTEND — test, hook contract)

**Analog:** SELF — file already exists with 11 passing tests including `canAfford` (lines 87-94). D-19 work is appending **2 NEW** test cases for the SC-6 affordability invariant.

**Existing canAfford pattern to extend** (`useMerits.test.ts:87-94`):

```typescript
it('canAfford returns true when total >= cost and false otherwise', async () => {
  seed({ total: 10, subscription: 8, shop: 2, tier: 'free' });
  const { result } = renderHook(() => useMerits(), { wrapper: makeWrapper() });
  await waitFor(() => expect(result.current.total).toBe(10));
  expect(result.current.canAfford(5)).toBe(true);
  expect(result.current.canAfford(10)).toBe(true);
  expect(result.current.canAfford(11)).toBe(false);
});
```

**Existing seed helper to reuse** (`useMerits.test.ts:57-77`):

```typescript
function seed(opts: {
  total: number;
  subscription: number;
  shop?: number;
  tier: 'free' | 'pro' | 'elite';
  resetDate?: string | null;
}) {
  rpcMock.mockResolvedValue({
    data: {
      total: opts.total,
      subscription_balance: opts.subscription,
      shop_balance: opts.shop ?? 0,
      next_reset_date: opts.resetDate ?? null,
    },
    error: null,
  });
  profileSingleMock.mockResolvedValue({
    data: { subscription_tier: opts.tier },
    error: null,
  });
}
```

**NEW tests to append (D-19 a + b):**

```typescript
// (a) canAfford reactively flips false when balance drops below cost
it('UX-11: canAfford(cost) flips false after balance drop via invalidation', async () => {
  seed({ total: 10, subscription: 10, tier: 'pro' });
  const { result } = renderHook(() => useMerits(), { wrapper: makeWrapper() });
  await waitFor(() => expect(result.current.total).toBe(10));
  expect(result.current.canAfford(8)).toBe(true);

  // simulate post-deduction balance via mock + invalidate
  seed({ total: 5, subscription: 5, tier: 'pro' });
  // trigger refetch (use queryClient.invalidateQueries inside the wrapper, or rerender)
  // assert: canAfford(8) → false within the staleTime window
});

// (b) post-deduction balance consistent within 5s (staleTime: 5_000)
it('UX-11: post-deduction balance consistent within 5s (staleTime)', async () => {
  // vi.useFakeTimers() + vi.advanceTimersByTime(5000) + assert refetched value
});
```

> **One-line note:** Reuse the existing `rpcMock` / `profileSingleMock` / `seed` infrastructure (lines 19-77); append 2 new `it(...)` blocks under the existing `describe('useMerits', ...)`. Vitest fake timers only needed for case (b). NO new file.

---

### `docs/tech-debt/IPC-JSDOM-001.md` (NEW — doc)

**Analog:** None exist. Closest precedent for a structured tech-debt artifact in the repo is the YAML frontmatter + table style of `.planning/phases/20-…/20-VERIFICATION.md:1-55` (gaps + artifacts + missing).

**Frontmatter shape to mirror** (compact form):

```markdown
---
id: IPC-JSDOM-001
opened: 2026-04-28
phase_origin: 23-interview-prep-runtime-overhaul
phase_documenting: 25-ux-gap-closure-and-phase-23-cleanup
status: open
severity: low
component: src/pages/InterviewPrep.test.tsx
---

# IPC-JSDOM-001 — InterviewPrep form-submission tests hang under jsdom

## Summary
The 5 planned form-submission click-through tests (Generate Prep → flashcard / quiz
result transitions) hang the Vitest runner under jsdom. Coverage of the same surface
is provided via the edge-function contract tests in
`supabase/functions/interview-prep-analyze/__tests__/`.

## Root cause hypothesis
- `framer-motion` animation hooks await `requestAnimationFrame` cycles that jsdom
  does not drive.
- Possible interaction: react-hook-form async resolver + `useReducer` dispatching
  inside an animated `<motion.div>` parent.

## Reproduction
1. Add an `it('Generate Prep submit transitions to flashcard-results', ...)` block
   to `src/pages/InterviewPrep.test.tsx` that fires `userEvent.click` on the
   "Generate Prep" button after `mockTier('pro')`.
2. Run `npm run test -- src/pages/InterviewPrep.test.tsx`.
3. Observe Vitest hang past the 5s default timeout.

## Candidate fixes
- `vi.mock('framer-motion', ...)` returning `<div>` for all motion components in
  the test setup.
- Stub `requestAnimationFrame` with a synchronous fallback in `vitest.setup.ts`.
- Migrate to a real-browser runner (Playwright component testing) for this single
  page.

## Closing criteria
A new commit re-enables the 5 form-submission tests with all assertions green
under `npm run test`.
```

> **One-line note:** No prior tech-debt file exists in `docs/`; planner is creating the directory + first entry. Mirror the YAML-frontmatter convention from `20-VERIFICATION.md` for consistency. ID `IPC-JSDOM-001` is recommended in RESEARCH.md Open Question 2.

---

### `.planning/phases/25-…/25-AUDIT-TRAIL.md` (NEW — doc)

**Analog:** `.planning/phases/20-merit-ux-shop-pricing-and-streak-ui/20-VERIFICATION.md` (lines 67-80 — Truth/Status/Evidence table style).

**Table schema to mirror** (RESEARCH.md row template, D-21):

```markdown
| REQ-ID | Closed by plan | Evidence file:line | Note |
|--------|----------------|--------------------|------|
| UX-01  | 25-01-PLAN     | src/components/topup/MeritBalanceHeaderV2.tsx (amber/red states); src/components/TopBar.tsx:9,151 | Header badge wired in Phase 24; Phase 25 adds isLow/isZero color states + deletes orphan v1 badge |
| UX-02  | 25-01-PLAN     | src/pages/CareerCompass.tsx (MeritCostPreview added) | CareerCompass was the only missing of 6 feature pages |
| UX-03  | 25-01-PLAN     | src/components/LowBalanceWarning.tsx; mounted in TopBar + 6 feature pages | 2× cheapest-applicable-cost threshold computed inline |
| UX-04  | 25-01-PLAN     | src/hooks/useOutOfMeritsModal.ts; src/pages/Upload.tsx; src/hooks/usePaywallGuard.ts | UpgradeModal deleted; generic CTAs route to /pricing |
| UX-09  | 25-03-PLAN (back-reg only) | src/pages/InterviewPrep.tsx (Phase 23 ship) | Elite quiz UI shipped Phase 23 |
| UX-10  | 25-03-PLAN (back-reg only) | src/components/InterviewStreakDisplay.tsx (Phase 23 ship) | Streak component shipped Phase 23 |
| UX-11  | 25-02-PLAN     | src/hooks/useMerits.test.ts (extended) | Affordability invariant + 5s consistency |
```

> **One-line note:** First `*-AUDIT-TRAIL.md` in the repo. Use the truth/artifact two-column flavor from `20-VERIFICATION.md` lines 67-80 as the visual reference; the row schema (REQ-ID | Plan | Evidence | Note) is locked by D-21.

---

### `src/components/topup/MeritBalanceHeaderV2.tsx` (MODIFY — controller of trigger className)

**Analog:** `src/components/MeritBalanceBadge.tsx:15-19` (exact ternary + tokens — port verbatim).

**Existing trigger className to augment** (`MeritBalanceHeaderV2.tsx:36-41`):

```tsx
<PopoverTrigger asChild>
  <button
    type="button"
    className="flex items-center gap-2 px-2 py-1 rounded-[--radius-boxy] hover:bg-white/5 transition-colors"
    aria-label={...}
  >
```

**Pattern to copy from orphan** (`MeritBalanceBadge.tsx:15-19`):

```typescript
const triggerStateClass = isZero
  ? 'bg-destructive/10 text-destructive border border-destructive/30'
  : isLow
    ? 'bg-amber-500/10 text-amber-500 border border-amber-500/30'
    : '';
```

**Apply via template-literal concatenation** (matches V2 in-file convention at line 39):

```tsx
className={`flex items-center gap-2 px-2 py-1 rounded-[--radius-boxy] hover:bg-white/5 transition-colors ${triggerStateClass}`}
```

**Hook destructure update** (`MeritBalanceHeaderV2.tsx:28`):

```typescript
// Before:
const { subscription, shop, cap, resetDate, isLoading } = useMerits();
// After (add isLow + isZero):
const { subscription, shop, cap, resetDate, isLoading, isLow, isZero } = useMerits();
```

> **One-line note:** Surgical 3-line change — destructure `isLow` + `isZero`, derive `triggerStateClass` ternary lifted from orphan lines 15-19, append to the existing template-literal `className` at V2 line 39. NO `cn()` helper — V2 already uses raw template literals; preserve the convention.

---

### `src/components/topup/MeritBalanceHeaderV2.test.tsx` (EXTEND — test)

**Analog:** SELF — file already has 5 tests covering the format string. Add 2 tests for the NEW trigger color states.

**Existing seeding shape to reuse** (`MeritBalanceHeaderV2.test.tsx:21-40`):

```typescript
function setMerits(opts: { subscription: number; shop: number; cap: number; isLoading?: boolean; resetDate?: string | null }) {
  useMeritsMock.mockReturnValue({
    total: opts.subscription + opts.shop,
    // ...
    isLow: false,
    isZero: opts.subscription + opts.shop <= 0,
    // ...
  });
}
```

**Pattern to extend — `setMerits` should accept `isLow` / `isZero` overrides**:

```typescript
function setMerits(opts: { ...; isLow?: boolean; isZero?: boolean }) {
  useMeritsMock.mockReturnValue({
    // ...
    isLow: opts.isLow ?? false,
    isZero: opts.isZero ?? (opts.subscription + opts.shop <= 0),
  });
}
```

**NEW tests to append** (mirror existing T5 style at line 94-103 — `className` regex match):

```typescript
it('T6: isLow=true → trigger button has amber-500 className', () => {
  setMerits({ subscription: 10, shop: 0, cap: 75, isLow: true });
  render(<MemoryRouter><MeritBalanceHeaderV2 /></MemoryRouter>);
  const button = screen.getByRole('button');
  expect(button.className).toMatch(/bg-amber-500\/10/);
  expect(button.className).toMatch(/text-amber-500/);
});

it('T7: isZero=true → trigger button has destructive className', () => {
  setMerits({ subscription: 0, shop: 0, cap: 75, isZero: true });
  render(<MemoryRouter><MeritBalanceHeaderV2 /></MemoryRouter>);
  const button = screen.getByRole('button');
  expect(button.className).toMatch(/bg-destructive\/10/);
  expect(button.className).toMatch(/text-destructive/);
});
```

> **One-line note:** Loosen `setMerits` signature with optional `isLow` / `isZero`; append T6 + T7 mirroring existing T5's `className` regex assertion style at lines 94-103.

---

### `src/pages/CareerCompass.tsx` (MODIFY — page)

**Primary analog:** `src/pages/Upload.tsx:432-436` (wrapping div + `featureCost` prop).
**Secondary analog:** `src/pages/LinkedInGrader.tsx:647` (inline `getCostForFeature` resolution).

**Imports to add** (mirror Upload.tsx:11-13):

```typescript
import { useFeatureCosts, getCostForFeature } from '@/hooks/useFeatureCosts';
import { MeritCostPreview } from '@/components/MeritCostPreview';
import { LowBalanceWarning } from '@/components/LowBalanceWarning';
// useMerits already imported at CareerCompass.tsx:23
```

**Inside the component body — add after existing `useMerits` destructure**:

```typescript
const { data: featureCosts } = useFeatureCosts();
// existing: useMerits already destructures isZero / canAfford
```

**Placement pattern from Upload.tsx:432-436** (apply at CareerCompass.tsx ~line 925, just BEFORE the `<TooltipProvider>` wrapping the Analyze button at line 927):

```tsx
<div className="mt-6">
  <MeritCostPreview featureCost={getCostForFeature(featureCosts, 'career_compass', tier) ?? 0} />
</div>
<LowBalanceWarning />

<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <div className="w-full">
        <Button onClick={handleAnalyze} ...>...</Button>
```

**Inline featureCost pattern from LinkedInGrader.tsx:647** (use `subscriptionTier ?? 'free'` if `tier` not in scope at the call site):

```tsx
<MeritCostPreview featureCost={getCostForFeature(featureCosts, 'career_compass', subscriptionTier ?? 'free') ?? 0} />
```

> **One-line note:** Drop `<MeritCostPreview featureCost={...} />` inside an `<div className="mt-6">` wrapper directly above the existing `<TooltipProvider>` at CareerCompass.tsx line 927; immediately follow with `<LowBalanceWarning />`. Feature key `career_compass` (lowercase + underscore — verified by RESEARCH §"MeritCostPreview integration").

---

### `src/pages/Upload.tsx` (MODIFY — page)

**Analog:** `src/hooks/useOutOfMeritsModal.ts` header docstring (lines 11-16 — exact consumer pattern).

**Replace import** (Upload.tsx:17):

```typescript
// Before:
import { UpgradeModal } from '@/components/UpgradeModal';
// After:
import { useOutOfMeritsModal } from '@/hooks/useOutOfMeritsModal';
import { OutOfMeritsModalV2 } from '@/components/topup/OutOfMeritsModalV2';
import { LowBalanceWarning } from '@/components/LowBalanceWarning';
```

**Replace `usePaywallGuard` destructure** (Upload.tsx:32-33 — drop `showUpgradeModal` / `setShowUpgradeModal`):

```typescript
const { canAnalyze, tier, loading: paywallLoading, triggerPaywall, refresh: refreshPaywall, ... } = usePaywallGuard();
const { openModal, modalProps } = useOutOfMeritsModal();
```

**Trigger swap inside 402 handler** (replace setShowUpgradeModal(true) wherever it appears):

```typescript
// On HTTP 402 'insufficient_merits' response:
openModal({ feature: 'Resume Analysis', cost: meritCost, balance: total });
```

**JSX swap** (Upload.tsx:487 — replace UpgradeModal mount):

```tsx
// Before:
<UpgradeModal open={showUpgradeModal} onOpenChange={setShowUpgradeModal} />
// After:
<OutOfMeritsModalV2 {...modalProps} />
```

**Mount LowBalanceWarning above MeritCostPreview** (after Upload.tsx:435, inside the same `<div className="mt-6">` block):

```tsx
<div className="mt-6">
  <LowBalanceWarning />
  <MeritCostPreview featureCost={meritCost} />
</div>
```

> **One-line note:** Mirror the `useOutOfMeritsModal` consumer pattern documented in the hook's docstring lines 11-16. Mount `<OutOfMeritsModalV2 {...modalProps} />` in place of `<UpgradeModal ... />` at line 487. Hard-delete the `showUpgradeModal` / `setShowUpgradeModal` references — Phase 24 already shipped the replacement.

---

### `src/hooks/usePaywallGuard.ts` (MODIFY — hook, BREAKING contract change)

**Analog:** `src/hooks/useOutOfMeritsModal.ts` (full file — replacement contract).

**Pre-change contract** (`usePaywallGuard.ts:26, 106-115`):

```typescript
const [showUpgradeModal, setShowUpgradeModal] = useState(false);
// ...
const triggerPaywall = () => { setShowUpgradeModal(true); };
return { ...status, showUpgradeModal, setShowUpgradeModal, triggerPaywall, refresh: checkPaywallStatus };
```

**Post-change contract** (consume `useOutOfMeritsModal` internally):

```typescript
import { useOutOfMeritsModal } from './useOutOfMeritsModal';
// ...
const { openModal, modalProps } = useOutOfMeritsModal();
// ...
const triggerPaywall = (args?: { feature: string; cost: number; balance: number }) => {
  if (args) openModal(args);
  else openModal({ feature: 'Analysis', cost: 0, balance: 0 });  // legacy fallback for lifetime-limit path
};
return { ...status, modalProps, openModal, triggerPaywall, refresh: checkPaywallStatus };
```

**Atomic ripple — 3 consumers to update in same plan** (verified by RESEARCH Pitfall 5):

- `src/pages/RecruitingLens.tsx:376` — replace `showUpgradeModal` consumer
- `src/pages/Upload.tsx:39` — already touched in D-08 above; modal mount swap
- `src/pages/InterviewPrep.tsx:189` — replace `showUpgradeModal` consumer

> **One-line note:** Hard-delete the `showUpgradeModal` / `setShowUpgradeModal` boolean tuple; return `modalProps` + `openModal` instead. All three consumers must mount `<OutOfMeritsModalV2 {...modalProps} />` in place of their `<UpgradeModal ... />` JSX in the SAME plan to keep the build green.

---

### `src/components/TopBar.tsx` (MODIFY — component)

**Analog:** SELF — `TopBar.tsx:189-207` (existing `<DropdownMenuItem asChild><Link to="/profile">` and `<Link to="/pricing">` pattern).

**Existing in-file pattern to mirror** (`TopBar.tsx:199-207`):

```tsx
<DropdownMenuItem asChild>
  <Link
    to="/pricing"
    className="flex items-center gap-2 cursor-pointer"
  >
    <CreditCard className="w-4 h-4" />
    Billing / Membership
  </Link>
</DropdownMenuItem>
```

**Replace upgrade dropdown item** (`TopBar.tsx:209-217`):

```tsx
// Before:
{profile?.subscription_tier === "free" && (
  <DropdownMenuItem onClick={() => setShowUpgradeModal(true)} className="flex items-center gap-2 cursor-pointer text-amber-500">
    <Zap className="w-4 h-4" />
    Upgrade Plan
  </DropdownMenuItem>
)}

// After (mirror lines 199-207 with text-amber-500 color preserved):
{profile?.subscription_tier === "free" && (
  <DropdownMenuItem asChild>
    <Link to="/pricing" className="flex items-center gap-2 cursor-pointer text-amber-500">
      <Zap className="w-4 h-4" />
      Upgrade Plan
    </Link>
  </DropdownMenuItem>
)}
```

**Drop import + state + JSX**:

- Line 8: remove `import { UpgradeModal } from "@/components/UpgradeModal";`
- Line 30: remove `const [showUpgradeModal, setShowUpgradeModal] = useState(false);`
- Line 234: remove `<UpgradeModal open={showUpgradeModal} onOpenChange={setShowUpgradeModal} />`

**Mount `<LowBalanceWarning />`** — RESEARCH Open Question 1 recommends mounting directly below `</header>` close inside TopBar so every authenticated route inherits it. Verify during plan-task work.

> **One-line note:** Mirror the existing `<DropdownMenuItem asChild><Link to="/pricing">` block at TopBar.tsx:199-207. Preserve the `text-amber-500` className on the upgrade item. Hard-delete the UpgradeModal import + state + mount.

---

### `src/components/Navbar.tsx` (MODIFY — component)

**Analog:** SELF — `Navbar.tsx:580-592` (existing `<DropdownMenuItem asChild><Link to="/pricing">` pattern in the mobile dropdown).

**Existing in-file pattern to mirror** (`Navbar.tsx:587-592`):

```tsx
<DropdownMenuItem asChild disabled={isLocked}>
  <Link to="/pricing" className="flex items-center gap-2 cursor-pointer">
    <CreditCard className="w-4 h-4" />
    Billing / Membership
  </Link>
</DropdownMenuItem>
```

**Two replacement sites** (Navbar.tsx:506-515 desktop, 594-603 mobile — same swap):

```tsx
// Before (line 506-515):
{profile?.subscription_tier === "free" && (
  <DropdownMenuItem onClick={() => setShowUpgradeModal(true)} disabled={isLocked} className="flex items-center gap-2 cursor-pointer text-amber-500">
    <Zap className="w-4 h-4" />
    Upgrade Plan
  </DropdownMenuItem>
)}

// After:
{profile?.subscription_tier === "free" && (
  <DropdownMenuItem asChild disabled={isLocked}>
    <Link to="/pricing" className="flex items-center gap-2 cursor-pointer text-amber-500">
      <Zap className="w-4 h-4" />
      Upgrade Plan
    </Link>
  </DropdownMenuItem>
)}
```

**Drop**: line 16 import, line 68 state, line 624 mount.

> **One-line note:** Two `<DropdownMenuItem>` swaps (desktop + mobile dropdowns) — both mirror the existing line 587-592 pattern. Preserve `disabled={isLocked}` and `text-amber-500` color. Hard-delete UpgradeModal import + state + mount.

---

### `src/pages/Profile.tsx` (MODIFY — page)

**Analog:** `src/components/TopBar.tsx:199-207` (cross-file `<Link to="/pricing">` `DropdownMenuItem` pattern).

**Same swap shape as TopBar** — replace `onClick={() => setShowUpgradeModal(true)}` with `asChild` + `<Link to="/pricing">`. Drop import + state + JSX mount.

> **One-line note:** Cross-file mirror of TopBar's swap. Lines 12 / 39 / 825 per CONTEXT.md D-09.

---

### `supabase/functions/_shared/interview-prep-validation.ts` (DELETE LINES 185-198)

**Analog:** N/A — pure deletion (already verified via direct Read above, lines 185-198):

```typescript
// ---------------------------------------------------------------------------
// Deprecated legacy shims (Phase 19 — removed in Phase 23 rewrite)
// ---------------------------------------------------------------------------
// ... comment block ...
export function validateFlashcards(_parsed: unknown): ValidationResult {
  throw new Error("deprecated — use validateInterviewPrepPayload");
}

export function validateQuizQuestions(_parsed: unknown): ValidationResult {
  throw new Error("deprecated — use validateInterviewPrepPayload");
}
```

**Pre-flight grep gate** (must return zero before delete):

```bash
rg "validateFlashcards|validateQuizQuestions" supabase src
```

> **One-line note:** Delete lines 185-198 inclusive (full comment block + both throwing exports). Pre-flight grep returns zero outside the file itself.

---

### `supabase/functions/_shared/__tests__/interview-prep-validation.test.ts` (VERIFY — no-op)

**Analog:** SELF — direct read confirms imports are clean (`lines 1-7`):

```typescript
import {
  findDroppedOptionalFields,
  validateInterviewPrepPayload,
} from "../interview-prep-validation.ts";
```

The deleted symbols (`validateFlashcards`, `validateQuizQuestions`) are NOT imported. RESEARCH §"Sources" line 582 confirmed via direct read.

> **One-line note:** No edit required. Plan task is a verification grep + checkbox. If grep finds any unexpected reference, prune that test case (deletion only — no rewrite).

---

### `src/pages/InterviewPrep.test.tsx` (COMMENT EXTEND — test)

**Analog:** SELF — `InterviewPrep.test.tsx:1-8` and `:180-183` (existing comment blocks documenting the deliberate exclusion).

**Existing comment to extend** (lines 4-7):

```typescript
// Note: form-submission flow (status transitions to flashcard/quiz results after
// invokeWithTimeout success) is covered by the edge-function contract tests in
// supabase/functions/interview-prep-analyze/__tests__/ — jsdom's event-loop
// interplay with react-hook-form + useReducer + framer-motion can hang those
// tests without a real browser. We assert the reducer/render surface via
// data-status attribute in the input-form + error paths here.
```

**Extension pattern (D-15) — append a backlog ticket reference**:

```typescript
// Note: form-submission flow ... (existing 6 lines preserved) ...
//
// TODO(IPC-JSDOM-001): see docs/tech-debt/IPC-JSDOM-001.md for repro,
// root-cause hypothesis, and candidate fixes. Re-enable form-submission
// it() blocks once jsdom + framer-motion + rhf interaction is unblocked.
```

**Existing closing comment to extend** (lines 180-183):

```typescript
// Form-submission path (generating → flashcard-results / quiz-active / error)
// is covered via reducer contract in SUMMARY.md Deviations; jsdom hang with
// rhf+useReducer+framer-motion prevented reliable assertion. Status transitions
// verified via data-status attribute snapshots in the input-form/error states.
// TODO(IPC-JSDOM-001): see docs/tech-debt/IPC-JSDOM-001.md
```

> **One-line note:** No `it.skip` lines to add (RESEARCH Drift Finding 3). Just append the `TODO(IPC-JSDOM-001):` reference to BOTH existing comment blocks — one at the top of the file, one before the SC-14 test at line 180.

---

### `scripts/phase21-runbook.ps1` (APPEND — runbook, in `Stage-D4-Finalize`)

**Analog:** SELF — `scripts/phase21-runbook.ps1:712-722` (Stage-D3-Soak2 voice and `Write-Step` / `Write-Note` cadence).

**Existing voice to mirror** (lines 712-722):

```powershell
function Stage-D3-Soak2() {
  Write-Step "Gate D3-Soak2 -- Plan 21-07 Task 4: T=2h final probe + alert_state"
  if (-not (Test-Path $sc5Evidence)) { Write-Error "Missing $sc5Evidence -- D3-Soak0 first."; exit 1 }
  $rc = Run-Prod-Probe "T=2h"
  if ($rc -ne 0) {
    Write-Host "  PROBE FAILED at T=2h. INVOKE ROLLBACK NOW." -ForegroundColor Red
    exit 1
  }
  Write-Ok "T=2h probe exit 0."
  Write-Note "Capture final T=2h alert_state row count in $sc5Evidence."
  Write-Note "Soak window complete. Run: .\scripts\phase21-runbook.ps1 -Stage D4-Finalize"
}
```

**Append-block to inject in `Stage-D4-Finalize`** — between `Append-Evidence` (line 744) and the `if ($reply -eq "ROLLBACK")` block (line 746):

```powershell
  # SC-9: interview-prep-coach delete reminder (idempotency sentinel)
  Write-Step "SC-9 -- Operator action: delete the dead 'interview-prep-coach' edge function"
  Write-Note "  Run BOTH commands manually (script does NOT execute these for you):"
  Write-Note "    supabase functions delete interview-prep-coach --project-ref <STAGING_REF>"
  Write-Note "    supabase functions delete interview-prep-coach --project-ref <PRODUCTION_REF>"
  Write-Note "  This function does not exist in the repo (Phase 23 cleanup) but is still"
  Write-Note "  deployed in Supabase. Removing it closes Phase 23's tech-debt entry."
```

**Idempotency sentinel** (D-17 — Phase 27 SC-4's static-edit pass must no-op):

The literal sentinel comment line `# SC-9: interview-prep-coach delete reminder (idempotency sentinel)` IS the grep target. Phase 27's plan-checker greps for `SC-9: interview-prep-coach delete reminder` inside the `Stage-D4-Finalize` body and skips the append if found.

**Concrete idempotency check before plan-task append**:

```powershell
# Pre-append check (run in plan-task verification, NOT runtime):
$body = Get-Content scripts/phase21-runbook.ps1 -Raw
if ($body -match 'SC-9: interview-prep-coach delete reminder') {
  Write-Host "Sentinel already present — skipping append (idempotent)"
}
```

> **One-line note:** Mirror the `Write-Step` + `Write-Note` cadence from Stage-D3-Soak2 (lines 712-722). Use `Write-Step` for the title line and `Write-Note` for each indented body line — matches the existing voice. Sentinel comment `# SC-9: interview-prep-coach delete reminder (idempotency sentinel)` is the grep target Phase 27 SC-4 uses to no-op.

---

## Shared Patterns

### Cross-cutting Pattern 1 — `<Link to="/pricing">` swap (D-09)

**Source:** `src/components/TopBar.tsx:199-207` (canonical in-repo example)
**Apply to:** TopBar.tsx (1 site), Navbar.tsx (2 sites), Profile.tsx (1 site)

```tsx
<DropdownMenuItem asChild>
  <Link to="/pricing" className="flex items-center gap-2 cursor-pointer text-amber-500">
    <Zap className="w-4 h-4" />
    Upgrade Plan
  </Link>
</DropdownMenuItem>
```

**Rule:** Always preserve the `text-amber-500` color class (visual continuity with the legacy modal trigger). Always preserve any `disabled={isLocked}` prop on the `<DropdownMenuItem>` (Navbar.tsx case).

---

### Cross-cutting Pattern 2 — `useOutOfMeritsModal` consumer wiring (D-08)

**Source:** `src/hooks/useOutOfMeritsModal.ts:11-16` (header docstring shows the exact consumer pattern)
**Apply to:** Upload.tsx, usePaywallGuard.ts (and atomically: RecruitingLens.tsx:376, InterviewPrep.tsx:189)

```typescript
const { openModal, modalProps } = useOutOfMeritsModal();
// on 402 response:
openModal({ feature: 'Resume Analysis', cost: 3, balance: 1 });
// in JSX:
<OutOfMeritsModalV2 {...modalProps} />
```

**Rule:** Hard-delete the `showUpgradeModal` boolean. Phase 24 shipped the replacement; legacy alias is unnecessary (RESEARCH Open Question 3).

---

### Cross-cutting Pattern 3 — Color tokens (D-02 + LowBalanceWarning)

**Source:** `src/components/MeritBalanceBadge.tsx:15-19` (the orphan's parting gift — port verbatim before deletion)
**Apply to:** MeritBalanceHeaderV2.tsx (D-02) + LowBalanceWarning.tsx (D-04)

```typescript
// LOW (amber):
'bg-amber-500/10 text-amber-500 border-amber-500/30'
// ZERO (destructive):
'bg-destructive/10 text-destructive border-destructive/30'
// NORMAL (primary):
'bg-primary/10 text-primary border-primary/20'
```

**Rule:** Preserve the raw `amber-500` Tailwind name (NOT a semantic CSS var) — the orphan and Phase 20 convention use it directly; introducing a new amber CSS var is out of scope (CLAUDE.md: "no new abstractions when a single helper suffices").

---

### Cross-cutting Pattern 4 — Vitest hook test wrapper

**Source:** `src/hooks/useMerits.test.ts:24-55` (`vi.mock('@/lib/supabaseClient', ...)` + `QueryClientProvider` wrapper)
**Apply to:** any new/extended hook test in this phase

```typescript
const rpcMock = vi.fn();
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: { getUser: () => getUserMock(), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) },
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (_t: string) => ({ select: () => ({ eq: () => ({ single: () => profileSingleMock(), maybeSingle: () => profileSingleMock() }) }) }),
  },
}));

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}
```

**Rule:** Reuse the existing wrapper if extending `useMerits.test.ts`. New hook tests under `src/hooks/` follow the same shape (precedent: useFeatureCosts.test.ts, useCreatePaymentIntent.test.ts, useStripeCheckout.test.ts).

---

### Cross-cutting Pattern 5 — Vitest component test wrapper (RTL + MemoryRouter + useMerits mock)

**Source:** `src/components/topup/MeritBalanceHeaderV2.test.tsx:9-44`
**Apply to:** LowBalanceWarning.test.tsx (NEW) + MeritBalanceHeaderV2.test.tsx (EXTEND)

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const useMeritsMock = vi.fn();
vi.mock('@/hooks/useMerits', () => ({ useMerits: () => useMeritsMock() }));

beforeEach(() => { useMeritsMock.mockReset(); });

// in test body:
render(<MemoryRouter><Component /></MemoryRouter>);
```

**Rule:** Components consuming `useMerits` + `<Link>` must mock the hook via `vi.fn()` and wrap in `<MemoryRouter>`. Match the file-local `setMerits` helper convention.

---

## No Analog Found

| File | Role | Reason |
|------|------|--------|
| `docs/tech-debt/IPC-JSDOM-001.md` | doc | First tech-debt artifact in `docs/`. Closest schema reference is `.planning/phases/20-…/20-VERIFICATION.md` YAML frontmatter; planner adopts a compact subset. |
| `.planning/phases/25-…/25-AUDIT-TRAIL.md` | doc | First `*-AUDIT-TRAIL.md` in the planning tree. Row schema (REQ-ID / Plan / Evidence / Note) is locked by D-21; visual reference is `20-VERIFICATION.md` lines 67-80. |

Both files are documentation-only and do not require runtime patterns.

---

## Metadata

**Analog search scope:** `src/`, `src/components/`, `src/hooks/`, `src/pages/`, `supabase/functions/_shared/`, `scripts/`, `.planning/phases/20-…/`, `docs/`.
**Files scanned:** 19 modified/created + 7 cross-referenced (Upload.tsx, LinkedInGrader.tsx, Navbar.tsx, useFeatureCosts.test.ts, MeritBalanceBadge.test.tsx, useMerits.ts, useOutOfMeritsModal.ts).
**Pattern extraction date:** 2026-04-28.
**Worktree noise:** Skipped `.claude/worktrees/agent-*/**` per RESEARCH Pitfall 6.
