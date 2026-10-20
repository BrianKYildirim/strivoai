# Phase 03 — Cross-Device Residual Register

**Created:** 2026-07-28 (plan 03-05, Wave 2 — D-23 triage)
**Companion to:** [`03-DEFECT-REGISTER.md`](./03-DEFECT-REGISTER.md)

D-23: **only reproduced issues are fixed in this phase.** Everything that could NOT be reproduced
here is recorded below with a **severity**, an explicit **reason it could not be reproduced**, and
an **owner** — so scope stays bounded without anything being quietly dropped. This mirrors how
v5.0 handled its 17-domain security audit.

Every row states where it goes next: **XTEST-04** (the manual scripted pass on the operator's real
Mac + Windows devices), **P-1** (the scripted operator pass on production, D-24), or **ACCEPTED**
(a permanent, documented limitation that plan 03-20's published matrix must disclose).

**Severity scale is the defect register's.** A residual row's severity is what it *would* be if
confirmed, not a discount for being unverified.

---

## 0. Environment preconditions — read before trusting any suite result

These are **not** cross-device defects. They are properties of the environment the suite runs in.
A later plan (especially **03-19**, whose whole job is production-equivalent verification) that
mistakes one of these for a device defect will chase a ghost.

### R-10 — `AI_TEST_MODE` is a CI-only secret, so four `chromium` specs fail on any dev machine

| Field | Value |
| ----- | ----- |
| **What** | `npm run test:e2e` exits non-zero on the operator's macOS host for a reason that predates Phase 03 entirely. Four `chromium` specs — `e2e/resume-analysis.spec.ts`, `e2e/onboarding-flow.spec.ts`, `e2e/onboarding-analysis-failure.spec.ts`, `e2e/two-tab-concurrency.spec.ts` — time out waiting for `/results/`. |
| **Why** | `AI_TEST_MODE` is set **transiently during CI only** (TESTING-STRATEGY.md § Secrets). Without it a local run drives a **live Anthropic call**, which exceeds the spec's wait. |
| **Proof it is not a Phase-03 regression** | Plan 03-03 reproduced the identical four failures against the **pre-plan project set** (`--project=setup --project=chromium`, i.e. the config exactly as it was before the matrix existed). Plan 03-05 re-confirmed the same four, unchanged, in both timing runs. |
| **Reproducible here?** | N/A — it is the *absence* of a secret, not a device behaviour. |
| **Severity** | **High as an operational hazard** (it masks real red), **not a product defect** |
| **Required action for 03-19** | **The production-equivalent verification pass in plan 03-19 MUST be run with `AI_TEST_MODE` supplied in the environment.** Without it these four specs produce **false failures that are not cross-device defects**, and any conclusion drawn from that run about device compatibility is invalid. Do **not** set `AI_TEST_MODE` globally on a dev machine, do **not** edit `.env*` to work around it, and do **not** modify those four specs to make the suite green. |
| **Owner** | Operator / **03-19** (environment provisioning for the verification pass) |
| **Goes to** | **P-1** — supplied for the scripted operator pass; otherwise ACCEPTED as a known local-red |

### R-20 — The `@xdev` lane is deliberately RED between 03-05 and the Wave 3–5 fixes

| Field | Value |
| ----- | ----- |
| **What** | 63 `@xdev` tests fail at HEAD. They are the discovery evidence catalogued in the defect register, not flake and not regressions. Combined with R-10, `npm run test:e2e` reports **67 failed / 57 passed / 34 skipped**. |
| **Why this is correct** | A green discovery suite would mean the specs assert nothing (this plan's threat model calls that "the most damaging possible outcome"). Plan 03-08 explicitly requires the storage spec to have FAILED against pre-fix code; plan 03-10 explicitly promotes the layout/touch specs from discovery to regression once its fixes land. |
| **Severity** | **High as an operational hazard** — a red `verify:baseline` blocks `scripts/deploy.ps1`, and the sanctioned escape hatch (`-SkipVerify`) disables the entire seven-layer gate |
| **Required action** | **Do not deploy from `staging` with `-SkipVerify` to work around this.** The lane returns to green as Waves 3–5 close their rows; 03-19 re-audits. If a deploy is genuinely needed mid-phase, that is an operator decision to make explicitly, not a habit to acquire. |
| **Owner** | Waves 3–5 (each closing plan turns its own rows green); audited by **03-19** |
| **Goes to** | Closes naturally — tracked by the defect register |

---

## 1. Real devices vs emulation (D-05: engine ≠ browser)

### R-01 — WebKit-the-engine is not Safari-the-browser

| Field | Value |
| ----- | ----- |
| **Severity** | **High** |
| **Why not reproduced** | Playwright's `webkit` build is WebKit compiled for automation. It does **not** carry Safari's ITP, its Keychain/password-manager integration, its extension model, its PDF viewer, its `-webkit-` prefixed quirks, or Apple's own patches. A pass here is evidence about WebKit, not about Safari. |
| **Consequence for the published matrix** | Per **D-05**, Safari may be listed **"supported"** only with an engine pass **and** a real-device spot-check. Until then it is **"partially verified"** — plan 03-20 must say so plainly rather than implying blanket coverage. |
| **Owner** | **XTEST-04** manual pass, then **03-20** |
| **Goes to** | XTEST-04 |

### R-02 — Real iPhone Safari viewport, safe-area and focus-zoom

| Field | Value |
| ----- | ----- |
| **Severity** | **High** |
| **Why not reproduced** | Three separate emulation limits. (a) `env(safe-area-inset-*)` resolves to `0px` under emulation because there is no notch, and `getComputedStyle` returns the **resolved** value, not the `env()` expression — a computed-style safe-area assertion is meaningless (03-RESEARCH Pitfall 7). (b) The collapsing URL bar that makes `100vh` differ from `100dvh` does not exist in a headless viewport. (c) The **actual** focus-zoom behaviour behind XD-13 is a Safari-on-iOS behaviour; the matrix can only measure the 14 px font that triggers it. |
| **What IS covered instead** | XD-13 measures the trigger (font-size) on both mobile projects. Safe-area and `dvh` correctness get **static-source guards** in 03-10 rather than a false browser assertion. |
| **Owner** | **XTEST-04** manual pass on a real notched iPhone |
| **Goes to** | XTEST-04 |

### R-03 — Real Android Chrome memory and CPU limits

| Field | Value |
| ----- | ----- |
| **Severity** | Medium |
| **Why not reproduced** | `mobile-chromium` emulates a Pixel 7's viewport, DPR and touch — **not** its memory ceiling, thermal throttling or GPU. A page that composites four `blur-3xl` layers renders identically on a desktop CPU and janks on the device. Playwright has no memory-pressure emulation. |
| **What IS covered instead** | XD-24 records the motion/blur budget violations statically (`useReducedMotion` used in 2 files; `blur-3xl` on animated elements in `UniversalAnalyzing.tsx`). |
| **Owner** | **XTEST-04**; fix ownership 03-10 / 03-15 |
| **Goes to** | XTEST-04 |

### R-04 — WebKit ITP's script-writable-storage cap

| Field | Value |
| ----- | ----- |
| **Severity** | **High** |
| **Why not reproduced** | ITP is absent from Playwright's WebKit build (R-01), so the eviction cannot be triggered. Separately, **public sources on the exact cap and its trigger conditions conflict and are dated** — this is flagged as a **documented matrix limitation**, not something this phase attempts to fix or model. Guessing at a threshold and coding to it would be worse than declaring it unknown. |
| **Relationship to XD-01/XD-02** | 03-08's fix (stop overriding `storage`, let auth-js fall back to memory) is the correct response to *any* storage restriction including eviction — so the fix is robust even though the trigger is unverifiable here. |
| **Owner** | **ACCEPTED** as a documented limitation; **03-20** must disclose it in the published matrix |
| **Goes to** | ACCEPTED + disclosed |

### R-05 — Real browser extensions

| Field | Value |
| ----- | ----- |
| **Severity** | Medium |
| **Why not reproduced** | Playwright browser contexts ship with **no** extensions, and persistent-context extension loading is Chromium-only and brittle. Content scripts that mutate the DOM, block storage, or inject failing script frames cannot be simulated faithfully. |
| **What IS covered instead** | `src/lib/analysis-error-log.ts:44` already classifies the five extension URL schemes correctly; XD-21 records that this classifier is wired to one of eleven surfaces and writes nowhere durable. Fixing that (03-06) makes real-world extension failures *observable* even though they are not reproducible. |
| **Owner** | **XTEST-04** spot-check with a common ad-blocker + password manager; **03-06 / 03-12** for observability and isolation |
| **Goes to** | XTEST-04 |

---

## 2. Deployment and environment

### R-06 — Real redeploy chunk skew

| Field | Value |
| ----- | ----- |
| **Severity** | **High** |
| **Why not reproduced** | The suite runs against one immutable local `vite preview` build. There is no second deployment, so no chunk is ever actually deleted out from under an open tab. `network-conditions.spec.ts` simulates the **shape** (a stalled request), and XD-15 records what that produces, but it cannot reproduce the `200 text/html` response that XD-17 identifies as the real-world form. |
| **Owner** | **03-13** builds the recovery; **P-1** verifies it with a genuine redeploy while a tab is open |
| **Goes to** | **P-1** |

### R-07 — The Merit ledger contract is structurally unprovable on Preview

| Field | Value |
| ----- | ----- |
| **Severity** | **Critical** (it is the money path) |
| **Why not reproduced** | `MERIT_SYSTEM_ENABLED = false` on Preview and `true` on Production. Charge, refund and idempotency are therefore **never exercised pre-prod**. Compounded by `VITE_FEATURE_ANALYSIS_LIFECYCLE` being off (D-27), so the 11-state ledger is unreachable too. The actual debit count cannot be asserted honestly in this lane. |
| **What IS proven here** | Plan **03-17** proves one genuine submit creates one job/request and one attempt; rapid, keyboard and in-flight re-activations create no second attempt; a deliberate Elite rerun after terminal completion creates exactly one new attempt whose nonce differs from the prior attempt. The browser test captures nonces in memory and never logs or attaches them. |
| **What is NOT proven** | The corresponding Merit ledger contains exactly one debit. Preview's disabled Merit system would make such an assertion vacuous. |
| **Owner** | Automated request/attempt half **closed by 03-17** → actual ledger debit count remains **P-1**, using a real Free and a real Elite account |
| **Goes to** | **P-1** |

### R-13 — `vercel.json`'s `ignoreCommand` skips the build on `preview` and `main`

| Field | Value |
| ----- | ----- |
| **Severity** | **High as an operational hazard** |
| **HEAD evidence** | `vercel.json` → `"ignoreCommand": "if [ \"$VERCEL_GIT_COMMIT_REF\" = \"preview\" ] || [ \"$VERCEL_GIT_COMMIT_REF\" = \"main\" ]; then exit 1; else exit 0; fi"` — exit 1 means *skip the build*. |
| **Why it is here** | This is the environment/deployment-mismatch half of D-22's static sweep. Merging to `preview` builds **nothing**, silently, so a Preview frontend can be arbitrarily stale relative to the Preview edge functions and database. Any "verified on Preview" claim in Waves 3–5 is only as current as the last **manual** Preview build. |
| **Not a Phase-03 defect** | It is deliberate configuration and out of this phase's boundary. Recorded so nobody in 03-19 concludes "the fix is deployed to Preview" from a merge. |
| **Owner** | Operator; **03-19** must state which build it verified against |
| **Goes to** | **ACCEPTED** + must be disclosed in 03-19's evidence |

### R-24 — The `vercel.json` `/assets` rewrite exclusion was NOT applied (03-13)

| Field | Value |
| ----- | ----- |
| **Severity** | **Low** (cosmetic-of-the-failure, not the failure) |
| **What was skipped** | Plan 03-13 Task 3 proposed excluding `/assets/` from the catch-all rewrite so a chunk a redeploy deleted returns an honest **404** instead of `200 text/html` (the response that produces the three divergent engine messages, 03-RESEARCH § Pitfall 3). `vercel.json` is unchanged at HEAD. |
| **Why it was skipped, not guessed** | 03-RESEARCH Open Question 3 rates the exact exclusion syntax **LOW confidence / UNVERIFIED**, and the plan's own instruction is explicit: *"If the correct syntax cannot be confirmed with confidence, DO NOT guess."* It could not be confirmed here — this environment has no access to current Vercel documentation, and the locally installed `path-to-regexp` is **v8**, which rejects custom-pattern groups outright: it throws on the EXISTING, working `"/(.*)"` source, so it is not a faithful oracle for Vercel's matcher and validating against it would have produced a confident wrong answer. |
| **Why the risk is asymmetric** | A malformed `source` 404s **every deep link in production**. The upside is only a tidier failure shape. `vite:preloadError` is an engine-independent detector that fires either way, so the exclusion is an improvement, never a dependency — and `stale-bundle.spec.ts` proves recovery works on all five engines with `vercel.json` exactly as it stands, using a simulated `200 text/html` response that is faithful to today's production behaviour. |
| **The exact proposed patch, for whoever verifies it** | Replace the single rewrite `{"source": "/(.*)", "destination": "/index.html"}` with `{"source": "/((?!assets/).*)", "destination": "/index.html"}`, leaving the `/version.json` header block and the `ignoreCommand` untouched. **Verify against current Vercel `rewrites` documentation first**, then confirm on a preview deployment that (a) a deep SPA route still resolves and (b) `/assets/does-not-exist.js` returns 404. `e2e/cross-device/stale-bundle.spec.ts::control: a deep SPA link still resolves` is the standing tripwire for (a) — note it runs against `vite preview`, which does **not** read `vercel.json`, so it can only catch an app-side regression, never a Vercel-side one. |
| **Owner** | Operator (documentation check) → **P-1** |
| **Goes to** | **P-1** — verified and applied during the scripted production pass, or **ACCEPTED** |

---

## 3. Findings the matrix structurally cannot assert

### R-08 — `document.getAnimations()` cannot see framer-motion

| Field | Value |
| ----- | ----- |
| **Severity** | Medium |
| **Why not reproduced** | framer-motion drives most transforms through `requestAnimationFrame`, not the Web Animations API. An animation-count assertion under `reducedMotion: 'reduce'` **passes while a RAF loop is still running** — a textbook vacuous green, which is exactly why no such assertion was written into the `@xdev` subset. |
| **What IS covered instead** | XD-24's static evidence: `useReducedMotion()` in 2 files, infinite `animate-*` counts per file, `blur-3xl` on animated elements. UI-SPEC F6 therefore needs **two** proofs and only one of them can be a browser assertion. |
| **Owner** | **03-10** / **03-15** (static-source guard) |
| **Goes to** | Covered by a static guard, not a browser assertion — **ACCEPTED** as a method limitation |

### R-09 — `env(safe-area-inset-*)` is not assertable from computed style

| Field | Value |
| ----- | ----- |
| **Severity** | Medium |
| **Why not reproduced** | Under emulation there is no notch, `env()` resolves to `0px`, and `getComputedStyle` returns the resolved value rather than the expression. The same applies to the viewport meta tag: its `content` **string** is assertable, its **effect** is not. |
| **Owner** | **03-10** (static guard on the CSS/className and on the meta tag's `content`); **XTEST-04** for real-notch verification |
| **Goes to** | XTEST-04 |

### R-11 — `crypto.randomUUID()` can never throw in this suite

| Field | Value |
| ----- | ----- |
| **Severity** | **High** (this is XD-16, the money path) |
| **Why not reproduced** | `crypto.randomUUID` requires a **secure context**. `localhost` **is** a secure context and production is HTTPS, so neither the E2E gate nor the operator's machine can ever reach the throwing branch. It fires only on a pre-Safari-15.4 / pre-Firefox-95 / pre-Chrome-92 browser, or on a non-HTTPS host. |
| **What IS covered instead** | 03-16 now has the required Vitest proof: native `crypto.randomUUID` is deleted, the plan-03-09 CSPRNG polyfill is installed, and `useSubmitGuard` still emits an RFC-4122 v4 nonce. A mutation-proven static guard also forbids inline page nonces and requires all six money paths to use the shared primitive. |
| **Owner** | **03-16** |
| **Goes to** | Covered by a unit-level guard — **ACCEPTED** as a browser-test limitation |

### R-12 — Elite-gated surfaces are unreachable by the seeded Free user

| Field | Value |
| ----- | ----- |
| **Severity** | Medium |
| **Why not reproduced** | `e2e/global-setup.ts` seeds `subscription_tier: 'free'`. `/recruiting-lens` therefore renders the `EliteFeatureGate` teaser, not its input form — so the job-description `<textarea>` at `src/pages/RecruitingLens.tsx:861` (and every Elite result view) is never mounted in the matrix. XD-13 had to be reproduced through `/profile` instead. |
| **Consequence** | The overflow and tap-target results for `recruiting-lens` describe the **locked** view (which is how a Free user experiences it — see XD-08, a genuine finding). The **unlocked** Elite views of Recruiting Lens, LinkedIn Grader and Career Compass are **not covered by any width, tap-target or font-size assertion**. |
| **Owner** | **03-10** must not assume Elite views are clean; **XTEST-04** / **P-1** with a real Elite account |
| **Goes to** | **XTEST-04** and **P-1** |

### R-17 — Admin isolation is not audited

| Field | Value |
| ----- | ----- |
| **Severity** | Medium |
| **Why not reproduced** | The seeded user is non-admin by construction, so `/admin/usage` renders an access denial rather than the surface under test. Auditing it would require seeding an admin account, which widens the blast radius of the E2E fixture on a surface whose whole point is that it is inaccessible. |
| **Note** | `/admin/usage` also carries the highest infinite-animation count in the app (6 `animate-*` occurrences, XD-24), so it is likely to have F6 violations nobody has measured. |
| **Owner** | **XTEST-04** (operator is an admin and can audit it manually) |
| **Goes to** | XTEST-04 |

### R-18 — Stripe checkout automated presentation coverage

| Field | Value |
| ----- | ----- |
| **Severity** | **High** |
| **Status** | **AUTOMATED GAP CLOSED by 03-18.** `e2e/cross-device/checkout-open.spec.ts` stalls both `create-checkout-session` and `create-payment-intent` indefinitely and proves same-tick visible presentation, non-empty pending bodies, the 15000ms safe timeout, rapid-tap request count, degraded zero-request blocking, focus, mobile fit and scroll restoration across the five-project matrix. |
| **Partial coverage that does exist** | `/pricing`'s layout and tap targets ARE audited — and XD-05 and XD-11 both found violations there, including on all four `Buy N-merit pack` buttons and `Upgrade to Elite`. |
| **Remaining boundary** | The automated suite deliberately never completes a payment. A real test-mode/production charge and provider-hosted payment UI remain **P-1** operator evidence. |
| **Owner** | Automated ownership complete; **P-1** owns the real-charge boundary |
| **Goes to** | **P-1** for a real charge |

### R-25 — WebKit poisons a failed subresource URL for the whole session, so a same-URL "recovery" cannot be simulated (03-13)

| Field | Value |
| ----- | ----- |
| **Severity** | **Low** (a property of the SIMULATION, not of the product) |
| **What** | In `e2e/cross-device/stale-bundle.spec.ts::OT-14` the lazy-route chunk is broken exactly once and the recovery reload is expected to fetch a working copy. On `webkit` and `mobile-webkit` the reloaded document is served the same broken response **without the request reaching Playwright's route handler at all** (`served=0`, and with `route.abort()` the request is not even re-issued: `requests=1`). Chromium and Firefox both re-fetch normally. |
| **Why it is not a product defect** | It is an artefact of re-using ONE URL. A real redeploy changes the chunk's content hash, so the recovered document asks for a **different file** and the poisoned entry is irrelevant. `Cache-Control: no-store` on the simulated response does not change WebKit's behaviour here. |
| **How the spec handles it honestly** | OT-14 does not name an engine. It branches on an OBSERVABLE fact — whether the recovered document actually got a working chunk — and asserts something strong on BOTH sides: recovery renders the route with zero `stale-bundle-fallback`, or the loop guard produces **exactly one** E2 surface with no loop, no blank page and no leak. The UI-SPEC E1 absence assertion (no `[role="alert"]` ever attached) is scoped to the detection document and holds on all five projects either way. |
| **What is therefore NOT proven here** | That a WebKit tab which reloads into a genuinely repaired deploy renders the route. Only **R-06**'s real redeploy can prove that. |
| **Owner** | **P-1** (real redeploy while a WebKit/Safari tab is open) |
| **Goes to** | **P-1**, alongside R-06 |

### R-26 — XD-15's *stalled* chunk is NOT closed by 03-13

| Field | Value |
| ----- | ----- |
| **Severity** | Medium (spinner-forever) |
| **What** | The defect register lists XD-15 (a `page.route` that never settles ⇒ `RouteFallback`'s spinner stays up indefinitely) under owner **03-13**, and notes "a `vite:preloadError` listener alone does not bound the pending case". That is correct, and 03-13 did not bound it. |
| **Why** | The two failures are different mechanisms. A **rejected** import dispatches `vite:preloadError`, which is what 03-13 handles (XD-03, XDEV-07). A **pending** import dispatches nothing at all — there is no event to listen for, and bounding it requires a timeout on `src/App.tsx`'s single `<Suspense fallback={<RouteFallback />}>`, i.e. an honest waiting state with an escape. 03-13's plan text, tasks and `files_modified` cover only the deleted-chunk case and do not include `src/App.tsx`. |
| **Where it belongs** | **03-15** (UI-SPEC Surface D — honest waiting states), which already owns XD-14's missing waiting affordance on the same spec file and is the plan that introduces bounded waits with an escape. |
| **Owner** | **03-15** |
| **Goes to** | Tracked — reassigned from 03-13 to 03-15 by 03-13, with the reason above |

---

## 4. Coverage the matrix deliberately does not attempt

### R-14 — Previous-major (N-1) browsers are not automated

| Field | Value |
| ----- | ----- |
| **Severity** | Medium |
| **Why not** | **D-03**, unchanged. Pinning a second Playwright version is brittle and drifts from real-world N-1. The support floor is enforced by **feature detection** (D-06), not version parsing — a decision the `Map.prototype.getOrInsertComputed` incident already justified, since that bug shipped in browsers that were otherwise *current*. |
| **Owner** | **XTEST-04** spot-check; **03-09 / 03-11** own the feature-detection floor |
| **Goes to** | XTEST-04 |

### R-15 — Real Edge and real Chrome channels did not run in this plan

| Field | Value |
| ----- | ----- |
| **Severity** | Medium |
| **Why not** | `edge` (`channel: 'msedge'`) and `chrome-real` (`channel: 'chrome'`) are appended only under `STRIVO_REAL_CHANNELS=1` (D-28), and this discovery run was executed on the macOS host without Edge. Absence is by design: a `channel:` project **throws at launch** where the browser is not installed, so the failure mode is "not run", never "red". |
| **Action** | On the Windows host, `STRIVO_REAL_CHANNELS=1 npm run test:e2e:xdev` runs genuine Edge and Chrome against every spec in this register. That run is what moves Edge out of XTEST-04's manual-only set. |
| **Owner** | Operator (Windows host); recorded by **03-20** |
| **Goes to** | XTEST-04 → then the published matrix |

### R-21 — The reduced-motion browser count is scoped to 4 of the 10 surfaces (03-10)

| Field | Value |
| ----- | ----- |
| **Severity** | Low |
| **What was cut** | `e2e/cross-device/responsive.spec.ts::reduced-motion budget @xdev` runs over `landing`, `dashboard`, `career-compass` and `recruiting-lens` only. The other six audit surfaces are not re-loaded under `prefers-reduced-motion: reduce`. |
| **Why** | Measured on a live page, those six run **zero** infinite animations in BOTH modes, so 30 extra page loads across five projects would buy a re-assertion of `0 === 0`. Under 03-05's standing instruction the sanctioned remedy for budget pressure is to cut cases and record the cut here — never to drop a project — and no project was dropped: all five still run the scoped subset. |
| **Why this is not a coverage hole** | The **source** guard is not scoped. `src/test/platform/responsive-source-guard.test.ts` walks the real import graph of all ten surfaces (126 files) and asserts the `useReducedMotion()` gate on every one. Since that guard covers the half `getAnimations()` structurally cannot see (R-08), the scoped browser count is the *weaker* of the two proofs, and it is the weaker one that was narrowed. |
| **Re-widen if** | A surface outside the subset gains an infinite animation. The default-mode `<= 2` budget still runs on **all ten** surfaces on every project, so such a surface shows up as a rising `infinite-animations` annotation before it can hide. |
| **Owner** | **03-17** (budget re-measure), **03-19** (closeout audit) |
| **Goes to** | Tracked |

### R-22 — The testimonial marquee runs 3 concurrent infinite animations at `lg`+ (03-10)

| Field | Value |
| ----- | ----- |
| **Severity** | Low |
| **Finding** | UI-SPEC F6's budget is "at most 2 concurrent infinite animations per screen". The landing page's testimonial wall is three columns, each a `translateY` marquee, so at `lg`+ the desktop viewport runs three. |
| **Why ACCEPTED rather than fixed** | F6 sits under **XDEV-09 — low-memory / slow-CPU**, and 03-10 fixed the constrained-device case properly: below `md` the two decorative columns are no longer **mounted**, so a phone runs **one**. (`hidden lg:block` is `display: none`, which hides a framer-motion loop without stopping it — the 390 px phone was driving three marquees to render one.) The residue is a desktop-only cost on the device class F6 is *not* about, and collapsing the wall to two columns is a visual-design change outside this plan's remit. |
| **Also mitigated** | The marquee is gated behind `useReducedMotion()`, so the count is **zero** under `prefers-reduced-motion: reduce` on every viewport — asserted 5/5. |
| **Detectability** | It is framer-motion RAF motion, so `getAnimations()` does not count it and the `<= 2` browser assertion does not trip on it (R-08). Recorded here rather than left to be rediscovered as a false green. |
| **Owner** | Design call — surfaced to **03-19** for the closeout audit |
| **Goes to** | **ACCEPTED** |

### R-23 — The Firefox floor stays at **114**, set by pdf.js's hardcoded module-worker spawn (03-09)

| Field | Value |
| ----- | ----- |
| **Severity** | **Medium** — it excludes Firefox 94-113 from the published matrix, which is ~20 releases of an evergreen browser |
| **Finding** | `03-RESEARCH.md` § *Open Questions* item 2 asked whether the floor could drop from 114 to 94 by emitting the pdf.js worker as a classic worker. Plan 03-09 timeboxed the investigation. **Verdict: not viable as a configuration change; keep 114.** Full evidence in [`03-WORKER-FLOOR-FINDING.md`](./03-WORKER-FLOOR-FINDING.md). |
| **Why the research premise was wrong** | The worker bundles are **already** classic IIFE scripts — `worker: { format: 'iife' }` produced a **byte-identical** build (same md5, same content hash) because `iife` is Vite's default. No `importScripts` prelude is needed and the polyfill barrel is already inlined into both worker chunks. |
| **What actually sets the floor** | `node_modules/pdfjs-dist/build/pdf.mjs:15641` — the library's ONLY `new Worker(` site — passes a literal `{ type: "module" }`. No `GlobalWorkerOptions` flag, `getDocument` parameter, or build define reaches it. It is the **spawn option**, not the script format, that Firefox < 114 rejects. |
| **Why ACCEPTED rather than fixed** | A supported escape hatch exists (`GlobalWorkerOptions.workerPort` takes a caller-constructed classic `Worker`), so this is not permanent. It was not taken because (a) the payoff is **unproven** — the "94" figure assumed `structuredClone`, which `rg` shows is **never used** in `src/`, so the next binding constraint is unknown until 03-11's probe set enumerates it; and (b) it is worker-lifecycle surgery on the business-critical extraction path in three places, including a nested-worker realm. |
| **Possibly conservative** | Both layers already fall back to the main thread — pdf.js via `#setupFakeWorker()` (`pdf.mjs:15683`) and ours via `extractPdfTextOnMainThread()` (`src/lib/extract-pdf-text.ts:1-9`) — so Firefox 94-113 may **degrade (slower extraction) rather than break**. That is read from source, **not executed**, and must not be published as fact. |
| **Why the matrix cannot see it** | Playwright 1.61.0 ships exactly one Firefox (**151.0**). No Firefox in the 94-113 range can be driven from this matrix at all, so neither the floor nor the graceful-degradation hypothesis is machine-checkable here. |
| **Owner** | **03-11** (probe set — do **not** probe `structuredClone`; module-worker support is what binds) · **03-20** (publishes `Firefox 114+`) |
| **Goes to** | **ACCEPTED** and disclosed in 03-20's published matrix; the 94-113 degradation hypothesis goes to **XTEST-04** for a real-device check |

### R-16 — Discovery cases cut for budget: **none**

| Field | Value |
| ----- | ----- |
| **Severity** | — |
| **Status** | The ≤ +3 min budget **holds**, so nothing was cut. Measured twice on a quiet macOS host: `npm run test:e2e` **193 s / 184 s → mean 188.5 s**, against plan 03-03's pre-plan baseline of **82.8 s**. Delta **+105.7 s** of a **180 s** budget — **~41 % headroom remaining**, down from ~97 % after 03-03. |
| **Standing instruction** | Roughly **74 s** of budget remains for every `@xdev` spec added by plans 03-07 through 03-18. The sanctioned remedy if it is breached is to **cut discovery cases and record each cut in this row** — **never** to drop a project. Plan 03-17 re-measures and owns the final number. |
| **03-10 draw-down** | **+31 s** (conservative). The added `reduced-motion budget @xdev` block measured **31.2 s** for 26 cases across all five projects, and that figure *includes* webServer start and the `setup` project, so the true marginal cost is lower. The `<= 2` default-motion assertion cost **0 extra navigations** — it was folded into the page load `no horizontal overflow — <surface>` had already paid for, which is why the draw-down is this small. Cases cut to stay inside it are recorded as **R-21**. Remaining headroom: **~43 s**. |
| **Not re-measured end-to-end** | A fresh `npm run test:e2e` total was deliberately NOT taken by 03-10: the full lane is red for two recorded environment reasons (**R-10** and **R-20**), so a wall-clock from it would time a partially-aborted run and misreport the budget. 03-17 owns the authoritative re-measure once Wave 3–5 lands. |
| **03-15 long-wait scope** | OT-9's 150-second observation runs on `chromium`, `mobile-webkit`, and `mobile-chromium`. OT-8 and the reduced-motion case remain selected by all five projects. This keeps both mobile engines in the slow-run proof while avoiding two additional 150-second workers; no project was removed from the matrix. |
| **Owner** | **03-17** |
| **Goes to** | Tracked |

---

## 5. Final milestone dispositions

This index gives every residual exactly one Phase 3 close disposition. “Deferred”
means evidence or activation remains for a future operator decision; “Accepted”
means the limitation is understood and does not block the qualified release.

| Residual | Disposition | Owner / close rationale |
| --- | --- | --- |
| R-01 | DEFERRED | Operator; real Safari/macOS evidence was not claimed |
| R-02 | DEFERRED | Operator; physical iPhone/iPad evidence was not claimed |
| R-03 | DEFERRED | Operator; physical Android pressure evidence was not claimed |
| R-04 | DEFERRED | Operator; long-duration Safari ITP evidence was not claimed |
| R-05 | DEFERRED | Operator; real-extension walkthrough was not claimed |
| R-06 | DEFERRED | Operator; real customer-domain redeploy skew was not run |
| R-07 | DEFERRED | Operator; production Merit-ledger P-1 was not run |
| R-08 | ACCEPTED | Static guard is the valid proof for RAF-driven motion |
| R-09 | DEFERRED | Operator; real-notch safe-area proof was not claimed |
| R-10 | ACCEPTED | Environment precondition is documented and satisfied in CI/release gates |
| R-11 | ACCEPTED | Unit/static guard covers the unreachable legacy-browser branch |
| R-12 | DEFERRED | Operator; unlocked Elite physical walkthrough was not claimed |
| R-13 | ACCEPTED | Manual Preview deployment procedure is documented and passed |
| R-14 | ACCEPTED | Capability detection governs support; N-1 is not pinned |
| R-15 | DEFERRED | Operator; real Chrome/Edge channel host evidence was not claimed |
| R-16 | ACCEPTED | No discovery case was cut for the runtime budget |
| R-17 | DEFERRED | Operator; admin-only visual audit was not claimed |
| R-18 | ACCEPTED | Automated presentation is closed; payment completion remains operator-only |
| R-20 | ACCEPTED | Temporary discovery red state was closed by subsequent plans |
| R-21 | ACCEPTED | Static plus focused motion evidence is recorded |
| R-22 | ACCEPTED | Remaining decorative marquee is a documented low-risk limitation |
| R-23 | ACCEPTED | Firefox 114 floor is explicit in both support documents |
| R-24 | ACCEPTED | App-side stale-bundle guard is tested; host rewrite remains documented |
| R-25 | ACCEPTED | WebKit same-URL poisoning is a simulation limitation |
| R-26 | ACCEPTED | Bounded honest waiting/escape behavior was completed in 03-15 |
| R-27 | DEFERRED | Lifecycle checklist flag remains deliberately default-off |
| R-28 | ACCEPTED | Operator deliberately deferred Vercel customer-domain cutover; non-code operational follow-up |

Customer-domain cutover does not reopen a product defect. The immutable build is
release-ready, the existing customer-domain frontend remains in place, P-9 did not
start, and no rollback is required.

## Summary

| Category | Rows |
| -------- | ---- |
| Environment preconditions (not defects) | R-10, R-20 |
| Real device vs emulation | R-01, R-02, R-03, R-04, R-05 |
| Deployment / environment | R-06, R-07, R-13, R-24 |
| Structurally unassertable by the matrix | R-08, R-09, R-11, R-12, R-17, R-18, R-25, R-26 |
| Deliberately out of the automated matrix | R-14, R-15, R-16, R-21 |
| Accepted residue after a fix | R-22 |
| Accepted platform floor | R-23 |
| **Total** | **25** |

**Destinations:** XTEST-04 manual pass — R-01, R-02, R-03, R-05, R-09, R-12, R-14, R-15, R-17, R-23
(the Firefox 94-113 degradation hypothesis only). Operator production pass **P-1** — R-06, R-07,
R-10, R-12, R-18, R-24, R-25. **ACCEPTED** and disclosed in 03-20's published matrix — R-04, R-08, R-11, R-13,
R-22, R-23. Tracked to **03-17 / 03-19** — R-16, R-21. Reassigned to **03-15** — R-26.

---

*Phase: 03-cross-device-reliability-and-compatibility*
*Register opened by plan 03-05 · extended by 03-09, 03-10, 03-13, 03-17 · closed out by 03-19*
