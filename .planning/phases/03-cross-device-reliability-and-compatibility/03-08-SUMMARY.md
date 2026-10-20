---
phase: 03-cross-device-reliability-and-compatibility
plan: 08
subsystem: auth-client / platform-capability
tags: [xdev-04, xd-01, xd-02, storage, supabase-auth, white-screen, regression-test]
requires:
  - "03-05 (the discovery spec + defect register rows XD-01 / XD-02)"
  - "03-06 (src/lib/diagnostics/client-diagnostics.ts — the reportDiagnostic seam)"
provides:
  - "src/lib/platform/storage-probe.ts :: probeLocalStorage() — the CLIENT_STORAGE_BLOCKED signal"
  - "e2e/cross-device/session-storage.spec.ts — XTEST-03, 6 cases x 5 projects"
affects:
  - "03-11 (capability tier consumes probeLocalStorage())"
  - "03-12 (renders CLIENT_STORAGE_BLOCKED from the same signal)"
tech-stack:
  added: []
  patterns:
    - "Fix by DELETION: hand storage resolution back to @supabase/auth-js rather than replacing an override with a better override"
    - "Diagnostic-only capability probe, structurally separate from the mechanism it observes"
    - "pushState + synthetic popstate as engine-neutral SPA navigation in Playwright, where page.goto would destroy the thing under test"
key-files:
  created:
    - src/lib/platform/storage-probe.ts
    - src/lib/platform/storage-probe.test.ts
  modified:
    - src/lib/supabaseClient.ts
    - src/components/ThemeToggle.tsx
    - e2e/cross-device/session-storage.spec.ts
    - .planning/phases/03-cross-device-reliability-and-compatibility/03-DEFECT-REGISTER.md
decisions:
  - "The `storage` option is deleted, not guarded — a try/catch'd override would still suppress auth-js's own memoized supportsLocalStorage() fallback"
  - "A pre-existing on-disk session is NOT restored when writes are blocked; that is auth-js behaving correctly, and the delivered contract is one deterministic sign-out, never a loop"
  - "Case A2 / Case B2 sign in live inside the restricted tab, because the seeded storage state is by design invisible under the injection"
metrics:
  tasks: 3 planned + 1 deviation
  commits: 4
  duration: ~35 min
  completed: 2026-07-28
---

# Phase 03 Plan 08: Restricted-Storage White Screen (XDEV-04) Summary

Deleted the Supabase auth `storage` override that white-screened the app on 5/5 engines and
suppressed `@supabase/auth-js`'s own restricted-storage fallback, guarded `ThemeToggle`'s
unguarded storage read/write (the second root-cause site), added a diagnostic-only
`probeLocalStorage()`, and promoted the 03-05 discovery spec into a six-case, five-project
regression test proven able to fail.

## Register rows closed

| Row | Title | Status |
| --- | ----- | ------ |
| **XD-01** | Reading `localStorage` throws ⇒ white screen, no error UI, nothing logged | **CLOSED** — commit `66b7155c` |
| **XD-02** | Every `localStorage` write throwing ⇒ white screen | **CLOSED** — commits `66b7155c` + `a57e9c2a` |

Both rows in `03-DEFECT-REGISTER.md` now carry a `Status` line naming the commit and the
regression test, matching 03-10's convention.

## What was done

**Task 1 — `src/lib/supabaseClient.ts` (`66b7155c`).** The line
`storage: typeof window !== 'undefined' ? localStorage : undefined` is gone. Not wrapped, not
replaced with an adapter — deleted, so `GoTrueClient`'s own branch
(`if (settings.storage) … else if (supportsLocalStorage()) … else memoryLocalStorageAdapter(…)`)
runs. `persistSession` and `autoRefreshToken` are untouched. The `createClient(…)` call is now
inside a try/catch returning `null`, which makes the pre-existing `getSafeClient()` mock path
reachable for a construction failure rather than only for missing env vars. No `localStorage`
identifier is evaluated at module scope.

**Task 2 — `src/lib/platform/storage-probe.ts` + test (`8b55873c`).** `probeLocalStorage()`
returns `'available' | 'blocked'` from a write-read-remove round trip inside one try/catch that
also covers the property *access*. Memoized for the session; the first `'blocked'` result emits
`storage_blocked` to the 03-06 seam exactly once, wrapped so a seam failure cannot become the
caller's failure. It writes one short fixed non-identifying key and removes it. The header states
the hard rule — this must never configure the auth client — and nothing in the file imports
`supabaseClient`. Nine unit tests: getter throw, `setItem` throw, `getItem` throw, silent-discard
read-back mismatch, memoization (accessor touched exactly once), once-per-session emit, surface
pass-through, key cleanup, throwing-diagnostics containment.

**Task 3 — `e2e/cross-device/session-storage.spec.ts` (`8f988289`).** Discovery → regression
(XTEST-03), six cases, `@xdev`, all five projects. Cases A and B now assert the fixed contract:
the app boots, no raw engine text reaches the user (`rawEngineLeaks`), and the main frame does
not re-navigate over a bounded observation window with a stable URL — i.e. no reload or bounce
loop. Cases A2 and B2 are new. Case C (session survives a reload) and Case D (signed-out visitor
is redirected) are retained unchanged as the anti-vacuity controls. No coverage was removed. No
storage value, cookie, header or token is read or logged; the sign-in password comes from the
environment and only the token endpoint's *status* is inspected.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 1 — Bug] `src/components/ThemeToggle.tsx` read and write guarded** — commit `a57e9c2a`

- **Found during:** Task 3, and pre-assigned by the register.
- **Issue:** `03-DEFECT-REGISTER.md` XD-02 names *two* root-cause sites and assigns **both** to
  03-08, but `03-08-PLAN.md`'s `files_modified` lists only the first. `ThemeToggle` renders in
  both `Navbar` and `TopBar`, i.e. on the boot path of every authenticated surface. Its
  `useState` initializer read `localStorage.getItem("theme")` and its `useEffect` wrote
  `localStorage.setItem(...)`, both unguarded — either throw escapes into React and unmounts the
  tree. `typeof window` does not help: it guards SSR, not a browser that refuses storage.
- **Fix:** extracted `readStoredTheme()` / `persistTheme()`, each with a try/catch. The theme
  still applies for the tab's lifetime; it is simply not persisted when storage is refused.
- **Verified load-bearing:** reverting `persistTheme`'s guard turns **Case B2 red** (blank tree,
  no heading) while Case B stays green; reverting `readStoredTheme`'s guard turns **Case A2 red**
  while Case A stays green. Both guards restored and re-run green afterwards.

**2. [Rule 1 — Bug] Two cases added to the spec (A2, B2) rather than rewriting Case B's assertion**

- **Found during:** Task 3, first run.
- **Issue:** the plan's Case B contract said "navigating between two authenticated routes does
  not bounce to the auth screen". After the Task 1 fix that is **not achievable and should not
  be**: with writes blocked, `supportsLocalStorage()` correctly reports the store unusable, so
  auth-js reads from memory and the seeded *on-disk* session is deliberately invisible.
  `/dashboard` therefore degrades to `/auth` — a surface that renders no authenticated shell at
  all, so the original spec's `not.toHaveURL(/\/auth/)` failed against correct behaviour, and a
  boot-only Case B never touches `ThemeToggle`.
- **Fix:** Case B keeps the blank-page and loop assertions (`#root` non-empty, zero main-frame
  re-navigations, stable URL). Cases A2/B2 sign in through the real form *inside* the restricted
  tab — the only session that can exist under the injection — and then walk two authenticated
  routes. This is precisely what `memoryLocalStorageAdapter` buys, and it is the only path that
  exercises the authenticated shell.
- **Recorded:** as a `Correction to this row's prediction` line on XD-02 in the defect register,
  so the register does not keep asserting an outcome the library will never produce.

**3. [Rule 3 — Blocking] `settle()` inserted before every post-`pushState` URL assertion**

- **Issue:** `pushState` makes `page.url()` the target *immediately*, so
  `expect(page).toHaveURL(/\/dashboard/)` straight afterwards is vacuous — it would pass even if
  `ProtectedRoute` bounced to `/auth` a tick later. First draft of Case B2 passed in 2.4 s for
  exactly that reason.
- **Fix:** `settle()` (root non-empty + first heading visible) runs first, so the URL read
  afterwards is the route the user actually landed on. Case B2's runtime went 2.4 s → 8.3 s,
  which is what a real assertion costs.

### Deliberately not done (out of scope)

- The `CLIENT_STORAGE_BLOCKED` card and copy — Surface B/C, owned by **03-11 / 03-12**. A
  clearly-marked follow-up stub referencing 03-12 sits at the end of Case A.
- The other unguarded `localStorage` / `sessionStorage` call sites found while grepping
  (`useEliteRerun.ts`, `RecruitingLens.tsx`, `Results.tsx`, `Upload.tsx`, `Auth.tsx`,
  `pendingUpgrade.ts`). Most already carry their own try/catch or a `typeof` guard, none is named
  by a register row owned by 03-08, and none is on the boot path. Not touched.
- `src/App.tsx`'s single-`Suspense` offline white screen (XD-03), the browser gate (03-07), the
  polyfills (03-09), the capability gate (03-11), the error taxonomy (03-12).

## Verification

| Check | Result |
| ----- | ------ |
| `npm run type-check` | exit 0 |
| `npm run lint` | exit 0 (151 pre-existing warnings, 0 errors) |
| `npm run test` | **943 passed / 126 files**, exit 0 (includes the 9 new probe tests) |
| `npx playwright test e2e/cross-device/session-storage.spec.ts` | **31 passed** — 6 cases x 5 projects + setup, 45.7 s |
| `npx playwright test e2e/auth-session.spec.ts --project=chromium` | passed — the happy path did not regress |
| `rg "localStorage" src/lib/supabaseClient.ts` | comment only; **no code reference** (see note below) |
| `rg "supabaseClient\|createClient" src/lib/platform/storage-probe.ts` | comment only; no import |
| `rg "console.log" e2e/cross-device/session-storage.spec.ts` | no matches |

**Red → green, recorded.** Case A was red on **5/5** projects at HEAD (03-05, defect XD-01); it is
green on 5/5 now. Case B was red on **5/5** at HEAD (XD-02); green on 5/5 now. The two new cases
were each independently proven able to fail during this session by reverting one guard at a time
(see deviation 1). A test that was always green proves nothing; none of these were.

`npm run test:e2e` (the full suite) was **not** run: it is knowingly red for R-10 (four chromium
specs need the CI-only `AI_TEST_MODE`) and R-20 (the `@xdev` lane stays red until the remaining
wave 4-5 fixes land). Verification was targeted, per the phase's operating constraint.

**Note on one acceptance criterion.** Task 1's literal criterion was
`rg -n "localStorage" src/lib/supabaseClient.ts` returning *no* matches, but Task 1 action item 4
requires a comment explaining that the old option "evaluates `localStorage` at module scope".
Those two cannot both hold. The comment was kept — grep-ability is the point of a warning comment
— so the file matches three times, all inside the block comment. The substantive contract
("no `localStorage` identifier is evaluated at module scope") holds.

## Constraints honoured

`supabase/functions/deno.json` untouched. No migration touched, no `supabase db` command, no DB
write, no deploy. `STATE.md` and `ROADMAP.md` byte-identical — this SUMMARY is the completion
record. Zero writes under `phases/02-*`. All work on `staging`, four commits, nothing pushed. No
destructive git. Working tree clean.

## Commits

| Hash | Message |
| ---- | ------- |
| `66b7155c` | `fix(03-08): delete the Supabase auth storage override that white-screens restricted browsers` |
| `8b55873c` | `feat(03-08): add an independent, diagnostic-only localStorage probe` |
| `a57e9c2a` | `fix(03-08): guard ThemeToggle's localStorage read and write` |
| `8f988289` | `test(03-08): promote the XDEV-04 storage spec from discovery to regression (XTEST-03)` |
