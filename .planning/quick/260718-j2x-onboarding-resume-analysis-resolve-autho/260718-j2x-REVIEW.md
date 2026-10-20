---
review: 260718-j2x-onboarding-resume-analysis-resolve-autho
reviewed: 2026-07-18
depth: quick
files_reviewed: 3
files_reviewed_list:
  - src/pages/Onboarding.tsx
  - src/pages/__tests__/Onboarding.freshness.test.tsx
  - src/pages/__tests__/Onboarding.recovery.test.tsx
findings:
  blocker: 0
  high: 1
  medium: 2
  low: 3
  total: 6
status: issues_found
---

# Code Review: Onboarding entitlement freshness (quick 260718-j2x)

**Scope:** commits `75584a6d` (fix) + `c9b95db3` (tests). Reviewed against the stated goal:
an Elite user who upgrades mid-onboarding must get an Elite-depth analysis on Finish.

The re-entrancy guard, spinner continuity, and `tier:'free'` cleanup are all implemented
correctly (see focus-area confirmations at the bottom). The main concern is that the
freshness mechanism, on the only routing path that actually reaches production, does not
meaningfully close the race it targets.

---

## HIGH

### H-01: The real (only reachable) onboarding path does not wait for the webhook — the target bug can still occur
**File:** `src/pages/Onboarding.tsx:363-376`

The genuine gate — `reconcileTierUpgrade()`, which polls the DB until
`profiles.subscription_tier` actually changes — is placed *behind* `cameFromCheckout`
(`searchParams.get('checkout') === 'complete'`). But per this task's own RESEARCH.md
(lines 69-71: "All return_urls point away from onboarding… **No `/onboarding?checkout=...`
exists**"), every Stripe return_url lands on `/dashboard?checkout=complete` or
`/pricing?checkout=complete` — never on `/onboarding`. Dashboard then consumes and strips
the param. So a user re-entering onboarding arrives with **no** param and always falls into
the `else` branch:

```ts
await invalidateMerits(); // one-shot invalidateQueries(['merit-balance'])
```

`invalidateMerits()` only refreshes the **frontend** React Query cache. The `analyze-resume`
edge resolves tier authoritatively from the **database** and never reads that cache. It does
**not** poll or wait for the still-in-flight `checkout.session.completed` webhook write. So if
the webhook has not yet landed at Finish time, the backend reads `free` and the Elite user
still gets a free-depth analysis — the exact bug the change claims to fix.

In practice this is partially masked because the user usually passes through Dashboard's own
`reconcileTierUpgrade()` (which does wait) before navigating back to onboarding. The fix
therefore relies on that upstream wait, not on anything in this file. A direct return to
onboarding, or a Dashboard poll that hit its silent 10s ceiling, leaves the race open.

**Fix:** Make the reachable path actually wait. Either (a) run the bounded poll
unconditionally when an upgrade is plausible (e.g. when the cached tier is `free` but a
subscription intent exists), or (b) capture the intended tier and `await
reconcileTierUpgrade(expectedTier)` so the reachable `else` path polls-to-match rather than a
no-op cache invalidate. As written, the `cameFromCheckout` branch is effectively dead code and
the effective protection is a frontend-only refresh the backend ignores.

---

## MEDIUM

### M-01: `reconcileTierUpgrade()` with no `expectedTier` burns the full 10s ceiling when the tier already landed
**File:** `src/pages/Onboarding.tsx:371` (mechanism: `src/hooks/useMerits.ts:161-189`)

`reconcileTierUpgrade()` is called with no argument, so it captures `snapshotTier` at call
time and only resolves when the cached tier **changes** from that snapshot. Onboarding is a
multi-step flow; by the time the user reaches Finish, a background refetch (`staleTime: 5s` +
`refetchOnWindowFocus`) has usually already pulled the upgraded tier into the cache. Then
`snapshotTier === 'elite'`, the tier never changes again, `tierReconciled()` never returns
true, and the poll runs the entire `POLL_CEILING_MS` (10s) before resolving silently. Result:
a 10s spinner for the already-upgraded user — directly contradicting the inline comment
"Stops early the instant the upgraded tier lands." (Only bites the `cameFromCheckout` branch,
which per H-01 is currently unreachable, hence MEDIUM not HIGH.)

**Fix:** Pass the expected tier (`await reconcileTierUpgrade(expectedTier)`) so the stop
condition is "matches target," which is satisfied immediately when the tier is already fresh.

### M-02: Recovery-test ordering assertion is vacuous (matches the import/destructure, not the call site)
**File:** `src/pages/__tests__/Onboarding.recovery.test.tsx` (added block, ~line 83-90)

```ts
expect(onboarding.indexOf('reconcileTierUpgrade')).toBeLessThan(dormantInvokeIdx);
```

The test carefully anchors the invoke side to `const analysisPromise =` to avoid matching the
top-of-file import — but makes exactly the mistake it warns about on the other side.
`onboarding.indexOf('reconcileTierUpgrade')` returns the **first** occurrence, which is the
destructuring declaration `const { reconcileTierUpgrade } = useMerits();` at line 57 — far
above any call site. So the assertion passes trivially even if the freshness *call* were moved
after (or deleted from) the dispatch. It proves nothing about ordering. The behavioral
freshness tests (scenarios 5/6/9) do prove real await-before-invoke ordering, so coverage is
not lost — but this source-contract assertion is misleadingly labeled as an ordering guarantee.

**Fix:** Anchor to the call site, e.g. `onboarding.indexOf('await reconcileTierUpgrade(')` /
`onboarding.lastIndexOf('reconcileTierUpgrade')`, and assert that is `< dormantInvokeIdx`.

---

## LOW

### L-01: `await invalidateMerits()` adds a pointless round-trip to 100% of normal onboarding finishes
**File:** `src/pages/Onboarding.tsx:375`

For the common non-upgrader (no checkout, tier unchanged), the awaited `invalidateMerits()`
refetches `['merit-balance', userId]` before dispatch. Since the backend resolves tier from the
DB and never consults this cache, the refetch has no effect on the analysis and only delays
dispatch by one DB round-trip on every single onboarding completion. Harmless but pure latency.

**Fix:** Skip the freshness step entirely when there is no upgrade signal, or drop the `await`.

### L-02: Goal-only (legacy) path has no re-entrancy guard
**File:** `src/pages/Onboarding.tsx:219-232`

`submittingRef` is armed only on the FULL path (line 244, after the goal-only early return), so
the goal-only branch relies solely on the `loading`/`disabled` UI guard. A rapid synchronous
double-fire before the disabled re-render flushes could call `saveGoal()` and `navigate()`
twice. Pre-existing pattern, low blast radius, but the new guard does not cover it.

**Fix:** Move `submittingRef.current = true` above the goal-only branch (still resetting in the
shared/each `finally`), or add the guard to the goal-only try.

### L-03: Lifecycle terminal-failure retry re-uploads the resume and inserts a duplicate `resumes` row
**File:** `src/pages/Onboarding.tsx:409-413` (with 244/457)

On terminal failure the guard is correctly reset in `finally`, re-enabling Finish (good — matches
scenario 10). But a retry re-runs the entire FULL path: a new `Date.now()`-suffixed upload and a
second `resumes` insert, orphaning the first row and its storage object. Pre-existing behavior,
not introduced here, but the freshness/retry loop makes it reachable.

**Fix (optional):** Guard the upload/insert on `resume?.id` already existing for this attempt, or
dedupe by `file_hash`.

---

## Focus-area confirmations (verified correct)

- **Re-entrancy guard (focus 2):** Armed only on the committed FULL path (line 244, after all
  early returns) and reset in the single `finally` (457) that covers the lifecycle
  terminal-failure `return`, both branch successes, and the catch. No path leaves it stuck true.
  ✓
- **Spinner continuity (focus 3):** `setLoading(true)` (245) holds through the freshness await
  and both branches; navigate fires before the `finally` reset in the happy paths; terminal
  failure toasts then releases the spinner without navigating. No spinner-with-no-toast dead end.
  ✓
- **Freshness await is inside `try` (focus 1):** Both `reconcileTierUpgrade()` and
  `invalidateMerits()` sit inside the try (247-451); a throw routes to the catch's
  "Setup failed" toast and the `finally` reset — no stranding. ✓ (Effectiveness caveat: H-01.)
- **Dormant regression (focus 4):** `tier:'free'` removed from both bodies (backend already
  discards it); fire-and-forget shape and `navigate` preserved. Behavioral scenario 11 confirms
  no reconcile poll on the dormant/no-checkout path. ✓
- **Behavioral tests (focus 5):** freshness scenarios 5/6 (deferred gate proves invoke does not
  fire until reconcile resolves) and 9 (synchronous double-click → single invoke via the ref
  guard, since both clicks run before the disabled re-render) are genuine, non-tautological. The
  weak one is the recovery source-contract assertion (M-02).

---

_Reviewer: Claude (gsd-code-reviewer) · Depth: quick · 2026-07-18_
