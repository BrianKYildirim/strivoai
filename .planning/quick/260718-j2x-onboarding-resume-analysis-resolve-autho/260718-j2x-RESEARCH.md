# Quick Task 260718-j2x: Onboarding resume analysis — authoritative current tier + restore spinner - Research

**Researched:** 2026-07-18
**Domain:** React onboarding flow + Stripe entitlement freshness + Supabase edge tier authority
**Confidence:** HIGH (all findings from repo source with file:line evidence)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Root cause is entitlement FRESHNESS, not client tier plumbing.** Backend `analyze-resume`
  already resolves tier server-side from `profiles.subscription_tier` and discards `rawBody.tier`
  (index.ts:1095-1097). The hardcoded `tier:'free'` in Onboarding.tsx (362, 389) is NOT causal —
  it is ignored. Do NOT add client-tier plumbing. Keep backend authority as-is.
- **Fix locus = entitlement freshness.** On checkout return during onboarding, refresh + WAIT for
  entitlement before Finish/analysis can run. Add a pre-invoke freshness guard so analysis is never
  dispatched while entitlement is known-stale. Remove the misleading hardcoded `tier:'free'`
  (cleanup — pass resolved/known tier or omit).
- **Freshness mechanism = refresh + bounded poll.** On checkout return, invalidate+refetch the
  entitlement source and refresh auth session as needed; POLL `profiles.subscription_tier` (via the
  existing entitlement read path) until it reflects the purchased tier. Bounded timeout + clear
  fallback message on lag. Finish DISABLED until entitlement resolved.
- **Spinner = hold until navigation.** Keep Finish disabled + animated-spinner continuously from
  click through entitlement resolution → upload → extraction → invoke → persistence → navigate.
  Never flip back to idle mid-flight. Prevent duplicate submits (re-entrancy guard). Preserve
  accessible loading state + existing terminal-failure toasts. Results page keeps post-nav progress UI.

### Claude's Discretion
- Exact refresh/poll timeout + interval values (sane bounded defaults consistent with webhook latency; document them).
- Enforce freshness via an existing hook/context (`useTierAccess`/`useMerits`/subscription query) vs.
  a small dedicated helper — PREFER reusing the existing entitlement read path (per CLAUDE.md, no new abstraction).
- Test layer split (vitest component vs. deno edge) per the codebase's layered testing model.

### Deferred Ideas (OUT OF SCOPE)
- (none captured in CONTEXT.md)
</user_constraints>

## Summary

The entire mechanism this task needs **already exists and is battle-tested** — it just isn't wired
into onboarding. `useMerits()` (src/hooks/useMerits.ts) is the canonical frontend entitlement source:
it holds a React Query cache keyed `['merit-balance', userId]` whose `queryFn` reads
`profiles.subscription_tier` directly (useMerits.ts:58-73) and exposes **`reconcileTierUpgrade(expectedTier?)`**
(useMerits.ts:161-189) — a bounded poll (1.5s interval, 10s ceiling) that invalidates+refetches until
the cached tier reflects the upgrade, then resolves silently. `Dashboard.tsx` already uses this exact
pattern on `?checkout=complete` return (Dashboard.tsx:168-196). The backend `analyze-resume` reads the
SAME `profiles.subscription_tier` server-side via `requireInternalOrUserAuth` → `resolveTierForUserId`
(auth.ts:158, 235-259), so once the frontend poll observes the new tier, a subsequently-dispatched
analysis will resolve authoritatively to Elite.

**The gap:** Onboarding.tsx does NOT import `useMerits`, has NO checkout-return detection, and dispatches
analyze-resume with zero freshness guarantee. The checkout `return_url` is hardcoded to
`/dashboard?checkout=complete` or `/pricing?checkout=complete` (create-checkout-session/index.ts:345,375,416,450)
— **there is no return path back to `/onboarding`**, and no upgrade CTA lives inside Onboarding today.
So the realistic stale-tier window is: onboarding tab left open (or navigated back to) after an upgrade
completed elsewhere, then Finish clicked before the webhook's `profiles.subscription_tier` write propagated.

**Primary recommendation:** In `handleFinishSetup`, before the analyze-resume invoke, add `useMerits()`
and `await` a bounded entitlement-freshness step that reuses `reconcileTierUpgrade`. Hold `loading` true
across it (never clear before navigate). Remove the hardcoded `tier:'free'`. The dormant path (100% of
traffic today) is the PRIMARY target.

## Key Findings (per focus question)

### 1. Checkout-return flow
- **No upgrade CTA inside Onboarding.tsx** (grep confirms). A mid-onboarding upgrade happens by leaving
  onboarding (e.g. to `/pricing`), where `StripeCheckoutWrapper` mounts an embedded `EmbeddedCheckout`
  modal (StripeCheckoutWrapper.tsx:80-86; Pricing.tsx:50-55).
- **All return_urls point away from onboarding:** subscription → `/dashboard?checkout=complete`;
  swap → `navigate('/dashboard?checkout=complete')` (Pricing.tsx:61); top-up → `/pricing?checkout=complete`
  (create-checkout-session/index.ts:345,375,416,450). **No `/onboarding?checkout=...` exists.**
- **Existing return refresh:** ONLY on `/dashboard` (Dashboard.tsx:171-196) — a one-shot `useRef`-guarded
  effect that fires `reconcileTierUpgrade()` on `?checkout=complete`, then strips the param. Onboarding
  has no equivalent.

### 2. Entitlement read + refresh path (canonical)
- **Canonical frontend tier source = `useMerits()`** (src/hooks/useMerits.ts). `useTierAccess` and
  `usePaywallGuard` are thin wrappers over it (useTierAccess.ts:63; usePaywallGuard.ts:40). It reads
  `profiles.subscription_tier` via React Query key `['merit-balance', userId]`, `staleTime: 5s`,
  `refetchOnWindowFocus: true` (useMerits.ts:49-73).
- **Force-refresh helpers already exported:**
  - `reconcileTierUpgrade(expectedTier?)` — bounded poll, invalidates+refetches until tier changes/matches (useMerits.ts:161-189).
  - `useInvalidateMerits()` — one-shot `invalidateQueries(['merit-balance'])` (useMerits.ts:208-211).
- **What updates `profiles.subscription_tier`:** `stripe-webhook-handler` on `checkout.session.completed`
  (index.ts:249-264) and `customer.subscription.updated` (index.ts:694-737). Latency: the write "often
  lands AFTER the redirect back" — documented in useMerits.ts:154-160 — hence the 1.5s/10s poll bounds.
- **`resetDate`/tier come from `get_merit_balance` RPC + a parallel `profiles` select** (useMerits.ts:58-61).

### 3. Freshness guarantee mechanism (recommended shape — REUSE, no new abstraction)
- Add `const merits = useMerits();` to Onboarding. In the FULL-path branch of `handleFinishSetup`,
  BEFORE `invokeWithTimeout('analyze-resume', …)`, `await merits.reconcileTierUpgrade(expectedTier)`.
- **Stop condition caveat (IMPORTANT):** `reconcileTierUpgrade()` with NO `expectedTier` and no pending
  change polls the FULL 10s ceiling (tier never changes → `tierReconciled()` never true — useMerits.ts:169-188).
  That would add 10s to EVERY onboarding Finish for non-upgraders. Two clean options:
  1. **Only poll when a stale-upgrade is possible** — gate the poll behind a checkout-return signal
     (add `?checkout=complete` handling to onboarding, OR pass the intended tier through). If no signal,
     do a single `useInvalidateMerits()` + await refetch (fast, closes the common race) rather than a full poll.
  2. **Pass `expectedTier`** captured from the checkout intent so the poll stops the instant the tier matches.
  Recommended: reuse the Dashboard `?checkout=complete` idiom — if onboarding is (re)entered with that
  param, run the bounded poll with a toast; otherwise a single invalidate+refetch pre-invoke suffices.
- **Poll defaults already chosen by the codebase:** `POLL_INTERVAL_MS=1500`, `POLL_CEILING_MS=10000`
  (useMerits.ts:30-31). Reuse them for consistency; document the bounded-fallback message on ceiling.
- Session refresh: `supabase.auth.getUser()` is already called (Onboarding.tsx:230); a
  `supabase.auth.refreshSession()` is only needed if JWT tier claims were used — they are NOT (tier is a
  DB read, not a JWT claim), so a session refresh is optional. The DB poll is the authoritative signal.

### 4. Spinner / loading state (why it "disappears" + minimal fix)
- Current: `setLoading(true)` at 227, `finally { setLoading(false) }` at 418-420. Button shows spinner
  while `loading` (Onboarding.tsx:768-780).
- **Dormant path (100% traffic, lines 382-414):** `navigate('/results/…')` fires at line 392 while the
  `analysisPromise` is still in flight; the `finally` then runs `setLoading(false)` — but navigation has
  already unmounted the page, so the spinner "ending" is invisible. The REAL user-visible gap is BEFORE
  the toast at 340: the flow does upload → signed URL → resumes insert → extraction (each awaited) with the
  spinner up, which is correct. The perceived "missing spinner" is most likely (a) the immediate navigate
  on the dormant path handing off to Results' own progress UI, and/or (b) any early `return` (e.g. lines
  192-196, 221-225 guards) that leaves `loading` false. Adding an entitlement-poll step LENGTHENS the
  pre-navigate window, making a continuous spinner more important.
- **Minimal change:** (1) keep `setLoading(true)` as the FIRST statement after the goal/resume guards;
  (2) add a re-entrancy guard so a second click while `loading` is a no-op (button `disabled={loading||…}`
  at 768 already covers UI clicks, but a `useRef` in-flight guard hardens against programmatic/double-fire);
  (3) do NOT clear loading before `navigate` on the dormant path (it already doesn't — the `finally` clears
  after navigate, which is fine); (4) ensure the new await-entitlement step runs INSIDE the `try` with
  loading held. **Dormant path is the primary target.**

### 5. Testing surface (per TESTING-STRATEGY layered model)
- **vitest (component/source-contract):** extend `src/pages/__tests__/Onboarding.recovery.test.tsx`
  (static source-contract style — greps Onboarding.tsx for wiring). Add assertions: `useMerits` imported,
  freshness step awaited before invoke, `tier:'free'` literal removed, loading held across poll. Also
  `Dashboard.test.tsx` is the template for behavioral reconcile tests (mocks `reconcileTierUpgrade`,
  asserts called once on `?checkout=complete` — Dashboard.test.tsx:106-124). A new
  `Onboarding.freshness.test.tsx` can mirror it with router `useSearchParams` + `useMerits` mocks.
- **deno (edge tier authority):** `analyze-resume` already resolves tier server-side; assert-tier-authority
  coverage belongs beside analyze-resume deno tests. No edge change is required for this fix (backend is
  already correct per locked root cause), so edge tests likely need NO new cases — confirm the existing
  "never trust rawBody.tier" contract test still passes after the client stops sending `tier:'free'`.
- **Playwright:** full Stripe checkout → onboarding finish cannot be unit-tested. Fake it by mocking the
  `useMerits` entitlement source (return stale-then-fresh tier across poll iterations) at the vitest layer;
  the live-Stripe leg is covered by existing e2e/stripe-checkout.spec.ts and is an operator smoke, not CI.
- **CANNOT unit-test without live Stripe:** actual webhook propagation timing. Fake via mocked
  `reconcileTierUpgrade` resolving after N invalidations / a mocked React Query cache that flips tier.

### 6. Pitfalls
- **`normalizeActiveTier` collapses `pro`→`elite`; only `free`/`elite` are active** (pricing-config.ts:41-46;
  ActiveTier type line 22). `past_due`/`canceled`/unknown → `free`. So the poll's stop condition should
  compare NORMALIZED tiers (`reconcileTierUpgrade` already does — useMerits.ts:165). Don't compare raw strings.
- **Full-ceiling poll on non-upgraders** (see §3) — the #1 correctness trap. Do not unconditionally
  `await reconcileTierUpgrade()` with no expected tier / no return signal.
- **Admin tier override:** admin email → `elite` server-side regardless of `subscription_tier`
  (auth.ts:157-158, 253-256) and `getEffectiveTier` on the frontend. Poll must not fight the admin override
  (admin already reads elite; poll resolves immediately or is skipped).
- **Lifecycle flag:** `isAnalysisLifecycleEnabled()` gates migrated (355-381) vs dormant (382-414) paths;
  DORMANT is 100% of traffic. Fix MUST cover the dormant branch. Keep the flag-OFF branch byte-identical
  except for the inserted freshness step + spinner hold (the recovery test at lines 74-88 pins dormancy).
- **`Onboarding.recovery.test.tsx` is a source-contract grep test** — it asserts exact literals
  (`origin: 'onboarding',`, `attemptNonce`, `disabled={loading…}` regex, the fire-and-forget generic).
  Removing `tier:'free'` and adding a freshness step must not break those greps; update the test in lockstep.
- **MERIT_SYSTEM_ENABLED:** global submit-time merit gate (see MEMORY). Not directly in scope, but the
  merit gateway is the backend enforcement layer; onboarding analysis costs 3 merits (resumeAnalysis,
  pricing-config.ts:55). A freshly-upgraded Elite user has merits reset by the same webhook — the poll that
  waits for tier also (via the same `['merit-balance']` refetch) picks up the reset balance. No extra work.
- **verify:baseline gate:** `npm run verify:baseline` (lint + type-check + vitest + deno + deno-remote +
  playwright + build) is a HARD pre-deploy gate. Any new vitest/deno cases must pass it.
- **Staging-only:** NO edge redeploy is needed (backend unchanged). This is a pure frontend change —
  ships via Vercel; `VITE_*` flags are build-time inlined (redeploy required if any flag changes, but none should).

## Recommended implementation shape (planner → 1-2 atomic tasks)

**Task A (frontend, primary):** Wire entitlement freshness + spinner hold into `Onboarding.tsx`.
- Import `useMerits`; capture `const { reconcileTierUpgrade } = useMerits();`.
- In `handleFinishSetup` FULL path: keep `setLoading(true)` first; add re-entrancy `useRef` guard; before
  the analyze-resume invoke, `await` a bounded freshness step (reuse `reconcileTierUpgrade` bounds
  1.5s/10s). Prefer gating the full poll behind a checkout-return/`?checkout=complete` signal (mirror
  Dashboard.tsx:171-196); otherwise a single `useInvalidateMerits()`+await refetch. Show bounded-timeout
  fallback toast. Remove `tier:'free'` from BOTH invoke bodies (362, 389) — omit or pass known tier.
- Hold `loading` continuously through navigate on both paths.

**Task B (tests):** Extend `Onboarding.recovery.test.tsx` (update stale literals) + add
`Onboarding.freshness.test.tsx` modeled on `Dashboard.test.tsx` (mock `useMerits`/`reconcileTierUpgrade`,
assert awaited-before-invoke, spinner held, `tier:'free'` gone). No edge test changes expected.

## Sources (all HIGH — repo source)
- src/pages/Onboarding.tsx (handleFinishSetup 190-421; invoke bodies 362,389; button 764-782)
- src/hooks/useMerits.ts (queryFn 49-73; reconcileTierUpgrade 161-189; bounds 30-31; useInvalidateMerits 208-211)
- src/pages/Dashboard.tsx (checkout-return reconcile 168-196)
- src/pages/Dashboard.test.tsx (reconcile behavioral test template 106-124)
- src/hooks/useTierAccess.ts:63 / usePaywallGuard.ts:40 (wrappers over useMerits)
- supabase/functions/analyze-resume/index.ts:1095-1112 (server-side tier authority, discards rawBody.tier)
- supabase/functions/_shared/auth.ts:146-164, 235-259 (resolveTierForUserId, normalizeActiveTier, fail-closed 'free')
- supabase/functions/create-checkout-session/index.ts:345,375,416,450 (return_urls → /dashboard | /pricing, never /onboarding)
- supabase/functions/stripe-webhook-handler/index.ts:249-264, 694-737 (subscription_tier writes; propagation latency)
- src/config/pricing-config.ts:41-46 (normalizeActiveTier pro→elite; past_due/canceled→free)
- src/components/StripeCheckoutWrapper.tsx (embedded checkout modal)
- src/pages/__tests__/Onboarding.recovery.test.tsx (source-contract grep test to update)
