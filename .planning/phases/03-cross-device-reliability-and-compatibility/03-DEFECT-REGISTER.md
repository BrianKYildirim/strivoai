# Phase 03 — Cross-Device Defect Register

**Created:** 2026-07-28 (plan 03-05, Wave 2 — D-22 matrix-first discovery)
**Rule (D-23):** only REPRODUCED issues are fixed in this phase, and each fix gets a regression
test (XTEST-03). Everything that could not be reproduced here lives in
[`03-RESIDUAL-REGISTER.md`](./03-RESIDUAL-REGISTER.md) with a severity — nothing is dropped.

Every row names **the plan that owns the fix** and **the regression-test slot that will prove it**.
Plan 03-19 audits this file and requires every row to end either closed-with-a-named-test or moved
to the residual register. Plan 03-20's traceability table is asserted against it.

### Plan 03-18 checkout regression proof (XTEST-03)

Checkout was a residual dialog contract rather than a reproduced route defect, so it
has no synthetic `XD-*` row to close. Its automated gap is closed in residual row
R-18 by `e2e/cross-device/checkout-open.spec.ts::Surface G checkout opens without
waiting @xdev`: OT-21/22 prove instant non-blank presentation and bounded pending,
the mobile rapid-tap case proves exactly one session-creating request, the degraded
case proves zero requests, and the mobile-WebKit case proves viewport fit and scroll
restoration. The real-charge boundary remains P-1.

---

## Status of the `@xdev` lane while this register is open

> **The cross-device lane is intentionally RED between 03-05 and the Wave 3–5 fixes.**
> `npm run test:e2e` currently reports **67 failed / 57 passed / 34 skipped**:
> **63** are the discovery failures catalogued below (they ARE the deliverable — a green
> discovery suite would mean the specs assert nothing), and **4** are the pre-existing
> `AI_TEST_MODE` environment failures documented in `03-RESIDUAL-REGISTER.md` § R-10.
> Each closing plan turns its own rows green. Do not silence a row to green the gate.

**Full five-project `@xdev` result (2026-07-28, `npx playwright test --grep @xdev`, 172.9 s):**

| Project | Passed | Failed | Skipped |
| ------- | ------ | ------ | ------- |
| `setup` | 1 | 0 | 0 |
| `chromium` | 11 | 8 | 10 |
| `firefox` | 10 | 9 | 10 |
| `webkit` | 10 | 9 | 10 |
| `mobile-webkit` | 10 | 19 | 0 |
| `mobile-chromium` | 11 | 18 | 0 |
| **Total** | **53** | **63** | **30** |

The 30 skips are `touch-targets.spec.ts` on the three desktop projects — tap targets and iOS
focus-zoom are a device contract, deliberately scoped to `mobile-webkit` + `mobile-chromium`.

---

## Severity scale

| Severity | Meaning |
| -------- | ------- |
| **Critical** | The user sees a blank page or loses access. No workaround inside the app. |
| **High** | A core surface is unusable or a money path can misbehave; a workaround exists but is not discoverable. |
| **Medium** | The surface works but violates the locked contract (layout, touch, honesty). |
| **Low** | Cosmetic or narrow-condition. |

---

## A. Reproduced by the matrix

Each row's "Reproduction" is a spec file plus test name that fails at HEAD **today**.

### XD-01 — Reading `localStorage` throws ⇒ white screen, no error UI, nothing logged

| Field | Value |
| ----- | ----- |
| **Surface** | Every surface (fails before React mounts) |
| **Projects** | **5 / 5** — chromium, firefox, webkit, mobile-webkit, mobile-chromium |
| **Symptom** | `#root` has **0** children. Blank document. No console error reaches any handler. |
| **Reproduction** | `e2e/cross-device/session-storage.spec.ts` :: `Case A — app still boots when the localStorage getter throws` |
| **Injection** | `addInitScript` redefines `window.localStorage` so the **getter** throws a `SecurityError`. The spec asserts the redefinition took effect *before* drawing any conclusion, so an engine that refused it cannot produce a false green. |
| **Root cause** | `src/lib/supabaseClient.ts:16` — `storage: typeof window !== 'undefined' ? localStorage : undefined`. `localStorage` is **referenced during module evaluation**; the throw aborts the module graph before `main.tsx` renders. The `typeof window` guard protects against SSR, not against restricted storage. |
| **Real-world trigger** | Chrome with site data blocked; several managed/enterprise profiles; some privacy extensions. This is literally "works on my machine, blank page on theirs". |
| **Severity** | **Critical** |
| **Owner** | **03-08** |
| **Regression slot** | `e2e/cross-device/session-storage.spec.ts::Case A — app still boots when the localStorage getter throws` (03-08 turns this red→green and records both results) |
| **Status** | **CLOSED by 03-08** (commit `66b7155c`). The `storage` option was DELETED from `createClient` — not wrapped, not replaced with a hand-rolled adapter — so `@supabase/auth-js` runs its own memoized `supportsLocalStorage()` (which try/catches the property access itself) and installs `memoryLocalStorageAdapter`. No `localStorage` identifier is evaluated at module scope any more, and the `createClient` call is inside a try/catch that falls back to the existing `getSafeClient()` mock rather than throwing during module evaluation. Regression proof: `e2e/cross-device/session-storage.spec.ts::restricted storage @xdev › Case A — app still boots when the localStorage getter throws`, **green 5/5** (was red 5/5 at HEAD). Extended by `…› Case A2 — with the getter throwing, a session made in-tab survives in-app navigation`, which walks the AUTHENTICATED shell under the same injection; Case A only exercises the public landing page. Both were re-proven able to fail: with the `ThemeToggle` read guard reverted, Case A2 fails on a blank tree while Case A still passes. |

### XD-02 — Every `localStorage` write throwing ⇒ white screen (worse than predicted)

| Field | Value |
| ----- | ----- |
| **Surface** | `/dashboard` (and every surface that persists anything) |
| **Projects** | **5 / 5** |
| **Symptom** | `#root` is **empty**. Predicted symptom was a silent logout loop; the observed symptom is a full blank page. |
| **Reproduction** | `e2e/cross-device/session-storage.spec.ts` :: `Case B — app still boots when every localStorage write throws` |
| **Injection** | Getter intact, `setItem` throws `QuotaExceededError` — the Safari private-browsing shape (quota ≈ 0). |
| **Root cause** | Two compounding sites. (1) `src/lib/supabaseClient.ts:16` makes `settings.storage` truthy, so `GoTrueClient` skips its own `supportsLocalStorage()` probe and never installs `memoryLocalStorageAdapter` — auth-js **would** have degraded correctly on its own. (2) `src/components/ThemeToggle.tsx:24` calls `localStorage.setItem(...)` unguarded inside a `useEffect`, so the throw escapes into React and unmounts the tree. |
| **Severity** | **Critical** |
| **Owner** | **03-08** (both sites — the second is one line and belongs with the first) |
| **Regression slot** | `e2e/cross-device/session-storage.spec.ts::Case B — app still boots when every localStorage write throws` |
| **Status** | **CLOSED by 03-08** (commits `66b7155c` — the `storage` override deleted; `a57e9c2a` — `ThemeToggle`'s read AND write extracted into guarded `readStoredTheme()` / `persistTheme()`). Regression proof: `e2e/cross-device/session-storage.spec.ts::restricted storage @xdev › Case B — app still boots when every localStorage write throws` plus `…› Case B2 — with writes blocked, a session made in-tab survives in-app navigation`, both **green 5/5**. **Case B2 is the one that bites** — proven by reverting only the `persistTheme` guard, which turns B2 red (blank tree, no heading) while B stays green. The reason is worth recording: with writes blocked, auth-js correctly reports the store unusable, so the on-disk seeded session is invisible and `/dashboard` degrades to `/auth`, a surface that renders no `ThemeToggle`. Only a session established INSIDE the tab reaches the authenticated shell, which is exactly what `memoryLocalStorageAdapter` buys and what B2 exercises. |
| **Correction to this row's prediction** | The row expected the fix to make a PRE-EXISTING on-disk session survive a write failure. It does not, and must not: `supportsLocalStorage()` treats a non-writable store as unusable, so auth-js reads from memory and a disk session is deliberately not restored. The delivered contract is "signed out ONCE, deterministically, never a loop" (asserted by Case B: zero main-frame re-navigations and a stable URL over an observation window) plus "a session made in-tab keeps working" (Case B2). Explaining that single sign-out to the user is `CLIENT_STORAGE_BLOCKED`, owned by **03-12**; 03-08 supplies the signal via `src/lib/platform/storage-probe.ts` (commit `8b55873c`). |

> **Controls prove these two are real, not artefacts.** `Case C` (normal storage survives a
> reload) and `Case D` (a signed-out visitor is redirected off `/dashboard`) pass on **5 / 5**
> projects in the same run.

### XD-03 — Offline in-app navigation ⇒ white screen, and no offline affordance at all

| Field | Value |
| ----- | ----- |
| **Surface** | Any lazy route reached by in-app navigation (reproduced dashboard → `/career-compass`) |
| **Projects** | **5 / 5** |
| **Symptom** | `root-child-count-offline = 0` on every project. `offline-affordance = false` on every project — the app says nothing at all. |
| **Reproduction** | `e2e/cross-device/network-conditions.spec.ts` :: `offline: an in-app navigation neither white-screens nor leaks engine text` |
| **Simulation** | `context.setOffline(true)` (honoured by all three engines), then a **SPA** link click — never a `page.goto`, which would render the browser's own error page and say nothing about this app. |
| **Root cause** | `src/App.tsx:72` wraps 20+ `lazy()` routes in a single `<Suspense fallback={<RouteFallback />}>` with **no error boundary above it**. A rejected dynamic import therefore unmounts the whole tree. Compounded by zero `online` / `offline` / `visibilitychange` handlers anywhere in `src/` (see XD-19). |
| **Notable** | The leak guard **passed** — no raw engine text reached the user. The failure is the blank page, not the wording. |
| **Severity** | **Critical** |
| **Owner** | **03-13** (chunk/lazy-import failure recovery) with **03-14** (connectivity seam + offline affordance) |
| **Regression slot** | `e2e/cross-device/network-conditions.spec.ts::offline: an in-app navigation neither white-screens nor leaks engine text` |
| **Status** | **White-screen half CLOSED by 03-13** (commit `13cae508`). `src/lib/platform/stale-bundle.ts` calls `preventDefault()` on `vite:preloadError`, so the rejected import no longer escapes `App.tsx`'s boundary-less `<Suspense>` and unmounts the tree; while offline the recovery deliberately does NOT reload (that would replace the SPA with the browser's own error page) and hands over to `StaleBundleFallback`, which renders through the SAME React root — so `#root` is never emptied. The row's own regression slot is now **green on 5/5** (the `@xdev` lane went from 197 passed / 4 failed to 221 passed / 0 failed). The *offline affordance* half — telling the user they are offline and recovering when they return — remains **03-14**'s, and the copy for it is `CLIENT_OFFLINE` in the frozen taxonomy.<br><br>**Offline-affordance half: PARTIALLY CLOSED by 03-14** (commit `2382d737`). The connectivity SEAM that this half depends on now exists (`src/lib/platform/network-status.ts`, XD-19), and the analysis waiting surface — the one place a user is stranded mid-run, and the surface UI-SPEC D6 governs — renders the `CLIENT_OFFLINE` note while offline, the D6 R4 `Back online. Checking your analysis…` note on reconnect, and forces a catch-up poll; proven on 5/5 by `realtime-fallback.spec.ts::… › OT-11: offline → online shows the reconnect note, then clears it`. **STILL OPEN:** an offline affordance on a *lazy-route navigation* (this row's own `network-conditions.spec.ts` slot) is NOT delivered here — that is a route-shell concern on `App.tsx`'s single `<Suspense>`, which 03-15 already owns via R-26. The seam this plan shipped is what that work will subscribe to. |

### XD-04 — Horizontal overflow on the landing surface, **engine-divergent**

| Field | Value |
| ----- | ----- |
| **Surface** | `landing` (`/`) |
| **Projects** | **firefox, webkit, mobile-webkit** — chromium and mobile-chromium are CLEAN. This row is the single clearest proof that a chromium-only suite could not have found these. |
| **Widths** | 320 px, both themes |
| **Reproduction** | `e2e/cross-device/responsive.spec.ts` :: `no horizontal overflow — landing` |
| **Offending elements** | `src/components/DashboardHome.tsx:114` `<div class="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] … blur-[120px]">` (measured **800 px**); `src/components/DashboardHome.tsx:164` `<div class="absolute top-0 right-0 w-64 h-64 … blur-3xl -translate-y-1/2 translate-x-1/2">` (**256 px**); plus a "View all" `<a>` + its chevron `<svg>` whose right edge lands at **340 px** against a 320 px client width |
| **Severity** | Medium |
| **Owner** | **03-10** |
| **Regression slot** | `e2e/cross-device/responsive.spec.ts::no horizontal overflow — landing` |
| **Status** | **CLOSED by 03-10** (commit `49135689`). Regression proof: `e2e/cross-device/responsive.spec.ts::responsive overflow discovery @xdev › no horizontal overflow — landing`, green on all five projects including the firefox/webkit/mobile-webkit trio that originally failed. |

### XD-05 — Horizontal overflow on `/pricing` at exactly 767 px

| Field | Value |
| ----- | ----- |
| **Surface** | `pricing` |
| **Projects** | **5 / 5** |
| **Widths** | 767 px only (the last width below the `md` breakpoint), both themes |
| **Reproduction** | `e2e/cross-device/responsive.spec.ts` :: `no horizontal overflow — pricing` |
| **Offending element** | `src/components/pricing/PackCardV2.tsx:19-23` — the highlighted plan `<article>` carries `scale-105`, so its **transformed** width is 772 px inside a 767 px viewport (`scrollWidth=769`). A transform-based emphasis has no layout box to clamp. |
| **Severity** | Medium |
| **Owner** | **03-10** |
| **Regression slot** | `e2e/cross-device/responsive.spec.ts::no horizontal overflow — pricing` |
| **Status** | **CLOSED by 03-10** (commit `49135689`). `scale-105` became `md:scale-105`. Regression proof: `e2e/cross-device/responsive.spec.ts::responsive overflow discovery @xdev › no horizontal overflow — pricing`, green 5/5 at 767 px in both themes. |

### XD-06 — A `Badge` cannot wrap, so AI-generated copy widens the page to 857 px

| Field | Value |
| ----- | ----- |
| **Surface** | `linkedin-grader` |
| **Projects** | **5 / 5** |
| **Widths** | 320, 375, 414 px, both themes (`scrollWidth=453` at all three) |
| **Reproduction** | `e2e/cross-device/responsive.spec.ts` :: `no horizontal overflow — linkedin-grader` |
| **Offending element** | `src/components/ui/badge.tsx:7` — `badgeVariants` base is `inline-flex items-center rounded-full … whitespace`-unconstrained with **no** `break-words` / `whitespace-normal`. Filled from `src/pages/LinkedInGrader.tsx:1154-1156` with `result.nextBestAction.expectedImpact`, an AI-generated sentence. Measured **857 px** wide. |
| **Why it matters beyond layout** | This is UI-SPEC F3's "any user-supplied or model-supplied string must not widen the page" rule. The width is a function of model output, so it will vary per user and per run — the operator's "works for me" is partly a shorter string. |
| **Severity** | **High** |
| **Owner** | **03-10** |
| **Regression slot** | `e2e/cross-device/responsive.spec.ts::no horizontal overflow — linkedin-grader` |
| **Status** | **CLOSED by 03-10** (commit `49135689`). `badge.tsx` gained `max-w-full break-words`. Regression proof: `e2e/cross-device/responsive.spec.ts::responsive overflow discovery @xdev › no horizontal overflow — linkedin-grader`, green 5/5. |

### XD-07 — Fixed-width readiness bar row overflows Career Compass below 640 px

| Field | Value |
| ----- | ----- |
| **Surface** | `career-compass` |
| **Projects** | **5 / 5** |
| **Widths** | 320, 375, 414 px, both themes |
| **Reproduction** | `e2e/cross-device/responsive.spec.ts` :: `no horizontal overflow — career-compass` |
| **Offending elements** | `src/components/career-compass/BestFitRoles.tsx:61` `<div class="w-16 h-2 rounded-full bg-muted overflow-hidden">` (fixed 64 px) inside a `flex items-center gap-3` row measured at **131 px** past the client width; the inner `h-full rounded-full transition-all duration-500` fill and an `ml-2 inline-flex … rounded-full border border-primary/30` `<span>` badge (62 px) ride along |
| **Severity** | Medium |
| **Owner** | **03-10** |
| **Regression slot** | `e2e/cross-device/responsive.spec.ts::no horizontal overflow — career-compass` |
| **Status** | **CLOSED by 03-10** (commit `49135689`). Regression proof: `e2e/cross-device/responsive.spec.ts::responsive overflow discovery @xdev › no horizontal overflow — career-compass`, green 5/5 at 320/375/414 px. |

### XD-08 — The Elite-gate shimmer is 5910 px wide and overflows at 7 of 8 widths

| Field | Value |
| ----- | ----- |
| **Surface** | `recruiting-lens` (the locked/teaser view a Free user sees) |
| **Projects** | **5 / 5** |
| **Widths** | 320, 375, 414, 640, 767, 768, **1024** px — everything except 1280 px, both themes. The widest breakage in the phase. |
| **Reproduction** | `e2e/cross-device/responsive.spec.ts` :: `no horizontal overflow — recruiting-lens` |
| **Offending elements** | `src/components/EliteFeatureGate.tsx:103` `<div class="absolute -inset-[200%] opacity-30">` measured **5910 px**; `src/components/ProFeatureGate.tsx:80` carries the identical class and must be fixed with it. Supporting: `absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent` (563 px) and `absolute -bottom-32 -right-32 w-96 h-96 … blur-[120px]` (384 px). |
| **Why it matters commercially** | This is the surface shown to every **Free** user considering Elite. It is horizontally scrolled on a phone at the moment of the upsell. |
| **Severity** | **High** |
| **Owner** | **03-10** |
| **Regression slot** | `e2e/cross-device/responsive.spec.ts::no horizontal overflow — recruiting-lens` |
| **Status** | **CLOSED by 03-10** (commit `49135689`). The decorative orb is clipped at the full-width section in BOTH `EliteFeatureGate.tsx` and its twin `ProFeatureGate.tsx`. Regression proof: `e2e/cross-device/responsive.spec.ts::responsive overflow discovery @xdev › no horizontal overflow — recruiting-lens`, green 5/5 at all eight widths. |

### XD-09 — `/profile` overflows at 320 px

| Field | Value |
| ----- | ----- |
| **Surface** | `profile` (account management) |
| **Projects** | **5 / 5** |
| **Widths** | 320 px, both themes |
| **Reproduction** | `e2e/cross-device/responsive.spec.ts` :: `no horizontal overflow — profile` |
| **Offending elements** | `src/pages/Profile.tsx:503` and `:580` `<div class="p-4 border border-border rounded-lg bg-secondary/30">` (251 px past), and a `<button class="inline-flex items-center justify-center gap-2 whitespace-nowrap …">` at 217 px — `whitespace-nowrap` on a button whose label exceeds the gutter-reduced content width |
| **Severity** | Medium |
| **Owner** | **03-10** |
| **Regression slot** | `e2e/cross-device/responsive.spec.ts::no horizontal overflow — profile` |
| **Status** | **CLOSED by 03-10** (commit `49135689`). `button.tsx` labels wrap below `md`. Regression proof: `e2e/cross-device/responsive.spec.ts::responsive overflow discovery @xdev › no horizontal overflow — profile`, green 5/5 at 320 px. |

### XD-10 — Viewport-anchored `w-full` containers overflow only on `mobile-chromium`

| Field | Value |
| ----- | ----- |
| **Surface** | `pricing`, `career-compass`, `recruiting-lens`, `profile` |
| **Projects** | **mobile-chromium only** (Pixel 7, DPR 2.625) |
| **Symptom** | Once a page already scrolls horizontally, three viewport-anchored elements extend to the full **visual** viewport rather than the reduced client width and appear as additional offenders |
| **Reproduction** | Same four `responsive.spec.ts` tests, `mobile-chromium` rows |
| **Offending elements** | `src/components/ui/toast.tsx:17` — the Radix toast viewport, `fixed top-0 z-[100] … w-full … p-4` (measured up to 863 px); `src/components/Navbar.tsx` — `fixed z-50 w-full … px-4` (769 px on `/pricing`); an unclassed `<iframe>` that does **not** exist in `src/` (`rg '<iframe' src/` → 0 matches), so it is injected by a third-party script — Stripe.js and the two Vercel analytics scripts are the only injectors this app loads. 03-10 must confirm which before changing anything. |
| **Severity** | Low (secondary — these follow the primary overflow rather than causing it, but they must be re-checked after XD-05/07/08/09 are fixed) |
| **Owner** | **03-10** |
| **Regression slot** | The same four `responsive.spec.ts` tests, asserted on `mobile-chromium` |
| **Status** | **CLOSED by 03-10** (commit `49135689`). Confirmed secondary as suspected: once XD-05/07/08/09 were fixed the page no longer scrolls horizontally and all three viewport-anchored elements fall back inside the client width. No change was made to `toast.tsx`, `Navbar.tsx` or the third-party `<iframe>`. Regression proof: the same four `responsive.spec.ts` tests, green on `mobile-chromium`. |

### XD-11 — 49 distinct interactive elements are smaller than 44 × 44 CSS px

| Field | Value |
| ----- | ----- |
| **Surface** | All 10 audited surfaces |
| **Projects** | **mobile-webkit + mobile-chromium** (both, consistently) |
| **Reproduction** | `e2e/cross-device/touch-targets.spec.ts` :: `tap targets and control font size — <surface>` (10 tests × 2 projects; every one fails) |
| **Worst offenders (present on 16–18 surface/project combinations each)** | the theme toggle `<button aria-label="Switch to light mode">` at **32 × 32**; the avatar/account `<button role=…>` at **32 × 32**; the merit-balance `<button aria-label="Merit balance: …">` at **101.53 × 28** |
| **Per-surface examples** | `/pricing` — `Monthly`, `AnnualSave 17%`, `Current plan`, `Upgrade to Elite` and all four `Buy N-merit pack …` buttons; `/dashboard` — `Upgrade`, `Set goal`, `Analyze resume`, `Grade LinkedIn`, `Run lens`, `Upload resume`, `Explore jobs`; `/linkedin-grader` — `Scan New Profile`, `Compare to Previous`, `Copy`; `/career-compass` — `Start New Analysis`, `Refresh Analysis` |
| **Note** | Several are **money-path CTAs** (`Upgrade to Elite`, the four merit packs). A missed tap on a purchase button is revenue, not polish. |
| **Severity** | **High** |
| **Owner** | **03-10** |
| **Regression slot** | `e2e/cross-device/touch-targets.spec.ts::tap targets and control font size — <surface>` (all 10) |
| **Status** | **CLOSED by 03-10** (commit `3e247b99`). Regression proof: `e2e/cross-device/touch-targets.spec.ts::touch target discovery @xdev › tap targets and control font size — <surface>`, all ten green on `mobile-webkit` and `mobile-chromium`. |

### XD-12 — Adjacent tap targets sit 4 px apart where the contract requires 8 px

| Field | Value |
| ----- | ----- |
| **Surface** | Every surface inside `DashboardLayout`, plus `/pricing` |
| **Projects** | **mobile-webkit + mobile-chromium** |
| **Reproduction** | Same tests as XD-11 (28 distinct crowded pairs across the run) |
| **Offending elements** | The sidebar rail links — `<a class="flex items-center rounded-xl transition-all duration-200 w-11 h-11 justify-center …">` for `Home`, `Resume Analysis`, `Career Compass`, `LinkedIn Grader`, `Interview Prep`, `Recruiting Lens`, `Celebrations`, `History`, `Pricing`, `Settings` — consecutive pairs are **4 px** apart vertically. The top-bar cluster (merit balance ▸ theme toggle ▸ account) is **4 px** apart horizontally. `/pricing`'s `Monthly` / `AnnualSave 17%` toggle pair likewise. |
| **Note** | The rail links are exactly `w-11 h-11` = 44 × 44, so the SIZE contract holds and only the SEPARATION contract fails. Fixing it is a spacing change, not a resize. |
| **Severity** | Medium |
| **Owner** | **03-10** |
| **Regression slot** | `e2e/cross-device/touch-targets.spec.ts::tap targets and control font size — <surface>` |
| **Status** | **CLOSED by 03-10** (commit `3e247b99`) as a spacing change, not a resize, exactly as this row predicted. Regression proof: same ten `touch-targets.spec.ts` tests. |

### XD-13 — `textarea` and `select` compute 14 px, so iOS Safari zooms on focus

| Field | Value |
| ----- | ----- |
| **Surface** | `profile` (the only surface a **Free** seeded user can reach that renders either primitive — see residual R-12) |
| **Projects** | **mobile-webkit + mobile-chromium**, measured at 390 px |
| **Reproduction** | `e2e/cross-device/touch-targets.spec.ts` :: `tap targets and control font size — profile` |
| **Measured** | `<button#year role="combobox">` **14 px**, `<button#graduation_year role="combobox">` **14 px**, `<textarea#career_goals>` **14 px** — contract is ≥ 16 px below `md` |
| **Root cause** | `src/components/ui/textarea.tsx:11` and `src/components/ui/select.tsx:20` are `text-sm`. The contract (UI-SPEC § Typography / F5) is `text-base md:text-sm`. `src/components/ui/input.tsx:11` is already correct and is the pattern to copy. |
| **Probe correction recorded here** | shadcn's `SelectTrigger` renders `<button role="combobox">`, **never** a native `<select>`. A probe written as `input, textarea, select` inspects zero select triggers and reports a confident green — the discovery spec uses `input, textarea, select, [role=combobox]` for exactly this reason. |
| **Severity** | **High** (a focus-zoom on a phone both breaks the layout and strands users) |
| **Owner** | **03-10** |
| **Regression slot** | `e2e/cross-device/touch-targets.spec.ts::tap targets and control font size — profile` |
| **Status** | **CLOSED by 03-10** (commit `3e247b99`). `textarea.tsx` and `select.tsx` now carry `text-base md:text-sm`. Proven TWICE: `e2e/cross-device/touch-targets.spec.ts::touch target discovery @xdev › tap targets and control font size — profile` (computed >= 16px at 390 px) and `src/test/platform/responsive-source-guard.test.ts::F5/XD-13: textarea and select compute >= 16px below `md`` (static, mutation-proven). WCAG 1.4.4 was NOT traded away — the same guard asserts the viewport meta carries neither `user-scalable` nor `maximum-scale`. |

### XD-14 — A merely SLOW backend shows no waiting affordance on any engine

| Field | Value |
| ----- | ----- |
| **Surface** | `/dashboard` (representative of every data-backed surface) |
| **Projects** | **5 / 5** — `waiting-affordance = false` on every one |
| **Reproduction** | `e2e/cross-device/network-conditions.spec.ts` :: `slow API: the surface shows a waiting state rather than an error` — currently PASSES its asserted leak guard; the missing affordance is recorded as an annotation |
| **Simulation** | `page.route()` + a 3 000 ms delay before `route.continue()` on `**/rest/v1/**`, `**/functions/v1/**`, `**/auth/v1/**`. Deliberately **not** DevTools-Protocol throttling, which is Chromium-only and would have no-opped on firefox and webkit. |
| **Finding** | The shell renders and no raw engine text leaks (both good, both asserted), but nothing with `aria-busy`, `role="status"` or a spinner is present and no waiting copy appears. On a genuinely slow phone this is indistinguishable from a hung page — the precondition for the double-submit XD-16 protects against. |
| **Severity** | Medium |
| **Owner** | **03-15** (UI-SPEC Surface D honest waiting states), with **03-14** for the connectivity half |
| **Regression slot** | `e2e/cross-device/network-conditions.spec.ts::slow API: the surface shows a waiting state rather than an error` — 03-15 promotes the recorded annotation into an assertion |

### XD-15 — A *stalled* chunk and a *failed* chunk have opposite symptoms

| Field | Value |
| ----- | ----- |
| **Surface** | Any lazy route |
| **Projects** | **5 / 5** (identical behaviour) |
| **Reproduction** | `e2e/cross-device/network-conditions.spec.ts` :: `stalled lazy chunk: the user is not left with a blank document` — currently PASSES |
| **Observed** | 18 `/assets/*.js` requests hang, `root-child-count-stalled = 4`, `waiting-affordance = true`. The `RouteFallback` spinner (`src/App.tsx:53-58`, `aria-busy` + `sr-only "Loading…"`) stays up **indefinitely** — there is no timeout and no escape. |
| **Contrast with XD-03** | A **pending** import leaves an infinite spinner; a **rejected** import (offline, or a redeployed-away chunk) unmounts the tree into a blank page. Both are 03-13's, and the fix must handle both — a `vite:preloadError` listener alone does not bound the pending case. |
| **Severity** | Medium (spinner-forever) — the rejected case is XD-03, Critical |
| **Owner** | **03-15** — REASSIGNED from 03-13 |
| **Regression slot** | `e2e/cross-device/network-conditions.spec.ts::stalled lazy chunk: the user is not left with a blank document` — the bounded-wait assertion is still owed |
| **Status** | **OPEN, reassigned by 03-13.** The two halves are different mechanisms: a *rejected* import dispatches `vite:preloadError` (closed by 03-13, see XD-03), a *pending* import dispatches **nothing at all**, so there is no event to listen for. Bounding it means putting a timeout and an escape on `src/App.tsx`'s single `<Suspense fallback={<RouteFallback />}>` — an honest waiting state, which is UI-SPEC Surface D and therefore **03-15**, the same plan that already owns XD-14's missing waiting affordance on this very spec file. Rationale recorded as **R-26** in the residual register. |

---

## B. Seeded from HEAD (static evidence, not matrix-reachable)

D-22 requires a targeted static sweep for the categories tests structurally cannot reach. Every
row below was read from the working tree on 2026-07-28 and cites its own file and line — not the
research summary. Each also has a residual-register row explaining **why** the matrix cannot see it.

### XD-16 — Six unguarded `crypto.randomUUID()` call sites on the money paths

| Field | Value |
| ----- | ----- |
| **HEAD evidence** | `src/pages/Onboarding.tsx:86`, `src/pages/Upload.tsx:281`, `src/pages/CareerCompass.tsx:254`, `src/pages/RecruitingLens.tsx:579`, `src/pages/LinkedInGrader.tsx:522`, `src/hooks/useEliteRerun.ts:189` |
| **Correction to 03-RESEARCH.md** | The research records **four** sites (D-29). HEAD has **six**: `CareerCompass.tsx` and `useEliteRerun.ts` were not counted. The extraction in 03-16 must cover all six. |
| **Dead primitive** | `src/hooks/useIdempotencyKey.ts:25,28` already derives the key — and `rg 'useIdempotencyKey' src/` returns **only that file**. No page imports it. D-29's "extract only where 2+ features need the same fix" threshold is met six times over. |
| **Why it throws** | `crypto.randomUUID` requires a **secure context** and is absent before Safari 15.4 / Firefox 95 / Chrome 92. The throw happens *before* the request is built, so the submit aborts with no request and no error surface. |
| **Why the matrix cannot see it** | `localhost` **is** a secure context and production is HTTPS. See residual **R-11**. |
| **Severity** | **High** |
| **Owner** | **03-16** |
| **Regression slot** | `src/hooks/__tests__/useSubmitGuard.test.ts` deletes native `crypto.randomUUID` and proves the installed CSPRNG fallback still produces a v4 nonce; `src/test/platform/submit-guard-source-guard.test.ts` forbids inline page nonces and requires all six paths to use the shared primitive. Cross-engine rapid-click proof remains **03-17**. |
| **Status** | **CLOSED by 03-16.** All six inline call sites were removed; nonce creation now flows through `useIdempotencyKey` inside `useSubmitGuard`. |

### XD-17 — `vercel.json`'s catch-all turns a deleted chunk into `200 text/html`

| Field | Value |
| ----- | ----- |
| **HEAD evidence** | `vercel.json` — `"rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]`. There is **no** `/assets` exclusion. (The `headers` block added by 03-02 covers `/version.json` only.) |
| **Consequence** | A chunk removed by a redeploy does not 404 — it returns HTML with a 200, and each engine reports the resulting module-script failure with **different** text (chromium: "Failed to load module script … MIME type of \"text/html\""; firefox: "was blocked because of a disallowed MIME type"; webkit: "Unexpected token '<'"). Any user-facing string derived from that text is engine-dependent by construction. |
| **Severity** | **High** |
| **Owner** | **03-13** |
| **Regression slot** | `e2e/cross-device/stale-bundle.spec.ts::stale-bundle recovery @xdev › OT-14: a deleted chunk reloads silently, with zero visible error surface` — it asserts on `vite:preloadError`, never on message text, and simulates the deleted chunk as the `200 text/html` response this row describes |
| **Status** | **NEUTRALISED, not removed** (commit `13cae508`). Detection no longer depends on the response shape at all, so the three divergent engine strings are irrelevant to the user-facing outcome, and OT-14/OT-15 pass on 5/5 with `vercel.json` exactly as it stands. The `/assets` rewrite exclusion that would make the response an honest 404 was **deliberately not applied** — the syntax could not be confirmed against current Vercel documentation and a malformed `source` 404s every deep link. The exact proposed patch and its verification steps are recorded as **R-24** in the residual register. |

### XD-18 — Both `.subscribe()` call sites are bare, so realtime failure is unobservable

| Field | Value |
| ----- | ----- |
| **HEAD evidence** | `src/pages/Results.tsx:478` and `src/hooks/useAnalysisRun.ts:339` are both `.subscribe();` with no status callback |
| **Consequence** | `SUBSCRIBED` / `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED` are never observed. The UI can never render `CLIENT_REALTIME_DEGRADED`; the poll cadence never adapts; and a blocked-WebSocket environment produces a silent, unbounded reconnect loop (`realtime-js` walks `RECONNECT_INTERVALS` then a fallback forever, and v2 has **no** long-poll transport — polling is the only recovery). |
| **Live path note (D-27)** | `useAnalysisRun` is DORMANT (`VITE_FEATURE_ANALYSIS_LIFECYCLE` is off). The **live** path is `Results.tsx`. Both sites are still in scope; only one is currently reachable. |
| **Severity** | **High** |
| **Owner** | **03-14** |
| **Regression slot** | `e2e/cross-device/realtime-fallback.spec.ts::realtime fallback and reconnect recovery @xdev › OT-10: a blocked socket resolves the run by polling, with only a muted line` — with the RUN's realtime-healthy control `… › OT-10 control: with realtime healthy the degraded line is ABSENT`, so the spec cannot pass by always rendering the line. The socket is blocked by an `addInitScript` `WebSocket` stub rather than a route abort, because `page.route` does not intercept a WebSocket handshake and a route-only simulation would be vacuously green. |
| **Status** | **CLOSED by 03-14** (commit `2382d737`). Both sites now take a `(status) => …` callback: `SUBSCRIBED` clears the degraded flag, `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED` set it, force ONE coalesced catch-up poll and emit ONE `realtime_degraded` diagnostic per TRANSITION (not per event — realtime-js retries unboundedly and a poll per retry is a self-inflicted storm). The user sees `CLIENT_REALTIME_DEGRADED` as a 14px `text-muted-foreground` line: no toast, no error state, nothing destructive, nothing blocked. Neither the status string nor the error object reaches diagnostics or the DOM. D-27 is intact — `VITE_FEATURE_ANALYSIS_LIFECYCLE` is unchanged and `useAnalysisRun` still early-returns; the dormant site got the identical callback so the two cannot drift. |

### XD-19 — Zero `online` / `offline` / `visibilitychange` handlers exist in `src/`

| Field | Value |
| ----- | ----- |
| **HEAD evidence** | `rg "navigator\.onLine\|addEventListener\('online\|addEventListener\('offline\|visibilitychange" src/` returns **one** match, and it is a *comment* in `src/lib/platform/build-id.ts:79` describing work plan 03-13 will do. No handler exists. |
| **Consequence** | On iOS Safari a backgrounded tab is frozen and its WebSocket severed; Chrome's bfcache does the same. A user who switches apps mid-analysis returns to a dead socket and a throttled timer, and nothing forces a poll. This is the mechanism behind XD-03's total absence of any offline affordance. |
| **Severity** | **High** |
| **Owner** | **03-14** |
| **Regression slot** | `e2e/cross-device/realtime-fallback.spec.ts::realtime fallback and reconnect recovery @xdev › OT-11: offline → online shows the reconnect note, then clears it` and `… › OT-11: a hidden → visible tab forces a catch-up poll` — the second counts `get-analysis-job-status` calls across the visibility transition, so a handler that exists but does nothing cannot pass. `… › OT-11: reload restores …` and `… › OT-11: navigating away and back restores …` hold the UI-SPEC D6 2,000ms restore budget. |
| **Status** | **CLOSED by 03-14** (commit `2382d737`). `src/lib/platform/network-status.ts` is the seam: ONE reference-counted `online` / `offline` / `visibilitychange` registration shared by all subscribers, removed when the last one detaches (zero-leak asserted in `network-status.test.ts`), with `online` + `visible` coalesced into a SINGLE `onCatchUp` so a waking laptop produces one poll per surface rather than two. `Results.tsx` consumes it: an offline note (`CLIENT_OFFLINE`), the UI-SPEC D6 R4 reconnect banner, and a forced catch-up poll that re-arms the single poll chain instead of starting a second one. Following 03-13's rule, the catch-up NEVER runs while offline. |

### XD-20 — Zero global `window.onerror` / `unhandledrejection` handlers exist

| Field | Value |
| ----- | ----- |
| **HEAD evidence** | `rg "window\.onerror\|unhandledrejection" src/` returns **0** matches. The only match for `addEventListener('error'` is `src/lib/extract-pdf-text.ts:44`, a worker-scoped listener. Only React error boundaries exist, and a boundary cannot see a module-evaluation throw or a rejected promise. |
| **Consequence** | XD-01, XD-02 and XD-03 all produce a blank page with **nothing logged anywhere**. That is precisely why the operator has reports without reproductions. |
| **Severity** | **High** |
| **Owner** | **03-06** (global capture + the shared diagnostics seam it feeds) |
| **Regression slot** | Named by 03-06 |

### XD-21 — The diagnostics log is console-only and resume-only, including its extension classifier

| Field | Value |
| ----- | ----- |
| **HEAD evidence** | `src/lib/analysis-error-log.ts` — a single `console.error("[AnalysisError]", record)`, no network. Consumed only by `AnalysisErrorBoundary`. Its `EXTENSION_SCHEMES` list (`:44`) already classifies `chrome-extension://`, `moz-extension://`, `safari-web-extension://`, `safari-extension://`, `ms-browser-extension://` correctly. |
| **Consequence (extension-injection sweep)** | The one asset that could distinguish "our bug" from "their extension" is wired to one of eleven surfaces and writes nowhere durable. The `client_error_diagnostics` table exists (03-01) and its ingest endpoint is 03-04 — but until 03-06 generalizes this module, nothing writes to either. |
| **Severity** | **High** |
| **Owner** | **03-06**, with **03-12** for the user-facing extension isolation (XDEV-08) |
| **Regression slot** | Named by 03-06 / 03-12 |

### XD-22 — No `vite:preloadError` listener exists anywhere

| Field | Value |
| ----- | ----- |
| **HEAD evidence** | `rg "vite:preloadError\|preloadError" src/ vite.config.ts index.html` → **0** matches |
| **Consequence** | Vite injects a **cancelable** `vite:preloadError` event into every build and re-throws unless `defaultPrevented`. Nothing listens, so every chunk-load failure becomes an uncaught throw — the mechanism behind XD-03. |
| **Severity** | **High** |
| **Owner** | **03-13** |
| **Regression slot** | `e2e/cross-device/stale-bundle.spec.ts::stale-bundle recovery @xdev › OT-14: a deleted chunk reloads silently, with zero visible error surface` and `… › OT-15: when the loop guard proves the reload already failed, exactly one honest fallback` (XDEV-07 / XTEST-03) |
| **Status** | **CLOSED by 03-13** (commit `13cae508`). `src/lib/platform/stale-bundle.ts` installs the listener from `src/main.tsx` before the first render; it calls `preventDefault()`, guards against a reload loop on `sessionStorage` (degrading to a `_v` URL marker where storage throws), and performs a single silent reload that preserves `pathname` + `search` + `hash` and the run id under `ANALYSIS_RUN_STORAGE_KEY`. Both error boundaries render `null` while recovery is engaged, so no fallback frame can paint (UI-SPEC E1). |

### XD-23 — `UniversalAnalyzing` fabricates progress, duration, stage and copy

| Field | Value |
| ----- | ----- |
| **HEAD evidence** | `src/components/UniversalAnalyzing.tsx` — (1) the asymptotic progress curve `MAX_PROGRESS_PRE_COMPLETE * (1 - Math.exp(-elapsed / tau))` driven purely by `performance.now()` (RAF loop, ~L99-108); (2) `expectedDurationMs = DEFAULT_EXPECTED_MS` default; (3) `subtitle = 'This usually takes about 20 seconds'` (L33); (4) `currentStep` derived from the same curve, not from any server signal (~L112-116) |
| **Consequence** | UI-SPEC D1's Honest Progress Rule and D-21 are both violated: the bar advances while nothing is happening, and it asymptotes at 95 % regardless of the real state. On a slow device this is what makes a working run look failed. |
| **Severity** | Medium |
| **Owner** | **03-15** |
| **Regression slot** | `src/test/platform/universal-analyzing-source-guard.test.ts` (OT-7) and `e2e/cross-device/waiting-surface.spec.ts` (OT-8/OT-9) |
| **Status** | **CLOSED by 03-15.** The wall-clock curve, percentage, ETA and timer-derived checklist are gone. `analysis-stage-copy.ts` accepts only the lifecycle ledger or the exported live stream labels and otherwise renders one indeterminate `Working on your analysis` row. OT-8 freezes the server for 60 seconds; the visible line remains byte-identical. OT-9 holds the client for 150 seconds and observes no alert or destructive transition. |

### XD-24 — No device-capability signal is read, and reduced-motion is honoured in 2 files

| Field | Value |
| ----- | ----- |
| **HEAD evidence (device-memory sweep)** | `rg "deviceMemory\|hardwareConcurrency\|saveData\|effectiveType" src/` → **0** matches. Nothing in the app knows it is on a constrained device. |
| **HEAD evidence (motion budget, UI-SPEC F6)** | `useReducedMotion()` is used in exactly **two** files — `src/components/EliteFeatureGate.tsx:45` and `src/components/interviewPrep/StreakDisplay.tsx:29`. Infinite `animate-*` utilities are concentrated in `src/pages/AdminUsage.tsx` (6), `src/pages/Auth.tsx` (4), `src/pages/Profile.tsx` (3), `src/pages/LinkedInGrader.tsx` (3) — all above F6's "at most 2 concurrent infinite animations per screen". `blur-3xl` sits on animated elements in `src/components/UniversalAnalyzing.tsx` (3 occurrences), which F6 forbids outright. |
| **Why the matrix cannot fully see it** | `document.getAnimations()` does not observe framer-motion's RAF-driven transforms, so an animation-count assertion under `reducedMotion: 'reduce'` passes while a RAF loop still runs. See residual **R-08**. |
| **Severity** | Medium |
| **Owner** | **03-15** (motion budget + `blur-3xl`), **03-10** (F6 static guard across the audit surfaces) |
| **Regression slot** | `src/test/platform/responsive-source-guard.test.ts`, `src/test/platform/universal-analyzing-source-guard.test.ts`, and `e2e/cross-device/waiting-surface.spec.ts::reduced motion leaves zero infinite animations on the surface` |
| **Status — 03-10's half: CLOSED** | The motion budget is enforced by **two independent proofs that fail for different reasons**. (1) STATIC: `src/test/platform/responsive-source-guard.test.ts` walks the real import graph of all ten audit surfaces (126 files) and fails if any `repeat: Infinity` is not gated behind `useReducedMotion()`. At 03-10 exactly one named exclusion remained (`UniversalAnalyzing.tsx`); 03-15 fixed it and removed that exclusion. (2) BROWSER: `e2e/cross-device/responsive.spec.ts::reduced-motion budget @xdev › zero infinite animations under reduce — <surface>` asserts a hard zero, plus a `<= 2` budget folded into every `no horizontal overflow — <surface>` test. Both green 5/5. |
| **What 03-10 actually changed** | The row's counts were *static grep* counts; the *concurrent* counts measured on a live page were different, and the real breaches were elsewhere. `AdminUsage.tsx` is not an audit surface (the seeded user is non-admin). The `animate-*` hits in `Auth/Profile/LinkedInGrader` are conditional `Loader2` spinners and loading skeletons that do not run at rest — and gating a waiting affordance behind `useReducedMotion()` would be wrong, so they are closed by the blanket `@media (prefers-reduced-motion: reduce)` reset in `src/index.css` instead. The genuine breaches were: `EliteFeatureGate` **6** concurrent loops and its untouched twin `ProFeatureGate` **6**; `BlurredLockCard` **2 x up to 3 instances** on one Career Compass screen; `BelowFold` **2** decorative pulses plus **3** testimonial marquees — and the two `hidden lg:block` marquee columns kept running under `display: none`, so a 390 px phone paid for three marquees to render one. Fixed by removing decoration, gating the survivors, and not mounting the off-breakpoint columns. |
| **Status — 03-15's half: CLOSED** | `UniversalAnalyzing.tsx` no longer contains blurred orbs, conic-gradient motion, orbiters, `blur-3xl`, or emerald completion colours. Its only infinite motion is gated by `useReducedMotion`; the 03-10 import-graph exclusion has been removed. The device-capability signal remains outside this waiting-surface correction and is not needed to satisfy the binding reduced-motion and concurrency budgets. |

### XD-25 — One submit remounts the shared waiting surface across Upload → Results

| Field | Value |
| ----- | ----- |
| **Surface** | Resume Analysis, Upload → Results transition |
| **Projects** | **4 / 4 observed before the required run was stopped** — chromium, firefox, webkit, mobile-webkit all returned `overlayMounts = 2`; the run was interrupted before mobile-chromium rather than spending another timeout on a confirmed structural failure |
| **Symptom** | One genuine click creates exactly one `analyze-resume` request and leaves exactly one overlay in the final DOM, but a `MutationObserver` sees two distinct `UniversalAnalyzing` dialog mounts: Upload mounts its local waiting surface, then navigation unmounts it and Results mounts another. This violates UI-SPEC D6's “no second overlay / no flicker” contract even though request deduplication succeeds. |
| **Reproduction** | `e2e/two-tab-concurrency.spec.ts` :: `one-click integrity @xdev › rapid double activation creates one request and one waiting surface` |
| **Root cause** | The waiting surface is shared in appearance but not in ownership: `Upload.tsx` and `Results.tsx` each own a route-local `UniversalAnalyzing` instance. Navigation necessarily replaces the first React subtree with the second, so a single analysis attempt produces two mounts. |
| **Related harness finding** | The approved 03-17 keyboard/mid-flight wording assumes the start CTA remains reachable after the run-creating request begins. On Resume Analysis the request begins only after navigation to Results, so the Upload CTA no longer exists at that point. The guard can still be exercised while Upload work is in flight, but that requires a pre-navigation fixture seam rather than locating the CTA after `analyze-resume` starts. |
| **Severity** | **Medium** — the money-path invariant holds, but the locked no-flicker presentation contract does not |
| **Owner** | **03-16 follow-up** for the cross-route ownership correction; **03-17** reruns and completes the five-engine proof after that fix |
| **Regression slot** | The existing failing `@xdev` case above; it already asserts one request, one final DOM element, zero toasts, and exactly one observed mount |
| **Status** | **RESOLVED by the 03-16 follow-up.** `AnalysisWaitingHost` owns one route-independent surface above Upload and Results, so navigation adopts the same attempt instead of remounting the overlay. The lifecycle checklist is forwarded only when `VITE_FEATURE_ANALYSIS_LIFECYCLE` is enabled; default-off renders one honest stream stage or the indeterminate fallback. Regression proof: focused host/unit tests plus the `one-click integrity @xdev` suite on all five projects (one request, one mount, zero duplicate toasts), OT-8 on all five projects, and the complete Playwright gate. |

---

## C. Harness findings from this plan (already closed here)

These are not product defects, but a later plan that does not know them will reproduce them.

| # | Finding | Evidence | Resolution |
| - | ------- | -------- | ---------- |
| H-1 | **`/auth` was never actually being audited.** Every project shares `.auth/user.json`, so an authenticated visit to `/auth` is redirected away and the spec silently re-measured the **landing page** — the offender lists for `auth` and `landing` were byte-identical before this was caught. | First `responsive.spec.ts` run, 2026-07-28 | Closed in 03-05: `Surface.anonymous` + `signOutLocally()` in `e2e/cross-device/surfaces.ts`. Any future `@xdev` spec touching a signed-out surface **must** set the flag. |
| H-2 | **`input, textarea, select` inspects zero shadcn selects.** `SelectTrigger` is a `<button role="combobox">`. | XD-13 | Closed in 03-05: the F5 probe selector includes `[role=combobox]`, and surfaces declared `hasFormControls` assert the probe found at least one control. |
| H-3 | **Recruiting Lens's job-description textarea is unreachable for the seeded Free user**, so `/profile` had to be added as a tenth surface to reproduce XD-13 at all. | XD-13, residual R-12 | Closed in 03-05 by adding `/profile`. Recorded as residual **R-12** because the Elite-gated instances remain unverified. |
| H-4 | **`test.use({ reducedMotion: 'reduce' })` silently no-ops in this config.** The documented top-level form does not reach the page — `matchMedia('(prefers-reduced-motion: reduce)').matches` stays `false` on all five projects. Every assertion written under it would have measured the DEFAULT state and reported it as a reduced-motion pass: a green run over the exact contract it claims to check. | Found by plan 03-10 while promoting `responsive.spec.ts`. Caught **only** because the spec asserts `matchMedia` before asserting the count; without that guard the block would have shipped green and meaningless. Verified: `test.use({ contextOptions: { reducedMotion } })` and `page.emulateMedia()` both work. | Closed in 03-10: `e2e/cross-device/responsive.spec.ts` calls `page.emulateMedia({ reducedMotion: 'reduce' })` **before the first navigation** and asserts the preference landed. **Any future `@xdev` spec asserting a media preference must carry the same `matchMedia` precondition** — the no-op is silent and this is the only thing that detects it. |

---

*Phase: 03-cross-device-reliability-and-compatibility*
*Register opened by plan 03-05 · audited for closure by plan 03-19*
