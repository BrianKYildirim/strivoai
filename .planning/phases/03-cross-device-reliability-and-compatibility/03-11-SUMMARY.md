---
phase: 03-cross-device-reliability-and-compatibility
plan: 11
subsystem: platform-capability-gate
tags: [XDEV-01, XRUN-01, D-06, D-07, D-08b, surface-b, capability-detection]
requires:
  - "03-06 — src/lib/diagnostics/client-diagnostics.ts (fire-and-forget reporting seam, capability_tier vocabulary)"
  - "03-07 — index.html ES5 pre-bundle guard + public/supported-browsers.html (Surface A owns `unbootable`)"
  - "03-08 — src/lib/platform/storage-probe.ts (probeLocalStorage)"
  - "03-09 — src/lib/polyfills/index.ts barrel (crypto.randomUUID + Map.getOrInsertComputed install first)"
provides:
  - "src/lib/platform/capabilities.ts — CAPABILITY_GROUPS, resolveCapabilityTier(), isAiBlocked(), isCheckoutBlocked(), getBlockedAreas(), supportsModuleWorker()"
  - "src/lib/platform/capability-copy.ts — the frozen Surface B copy table"
  - "src/components/platform/CapabilityGate.tsx — B1 banner, B2/B3 blocked entry points, B4 detail dialog"
  - "src/hooks/useCheckoutCapability.ts — the asynchronous payment-provider half of the checkout verdict"
  - "e2e/cross-device/capability-gate.spec.ts — OT-4 on all five projects"
  - "src/test/platform/capability-gate-wiring.test.ts — tier-independent wiring guard"
affects:
  - "03-16 (wave 8) writes SECOND into Upload/LinkedInGrader/CareerCompass/RecruitingLens — BlockedAiEntryPoint is now in place, as its Task 2 read_first anticipates"
  - "03-20 publishes the support matrix; the gate's floor and Firefox 114 now agree (see R-23 below)"
  - "03-12 renders CLIENT_BROWSER_UNSUPPORTED from this gate's Surface B copy"
tech-stack:
  added: []
  patterns:
    - "WebIDL option-getter probe for module-worker support (the getter firing IS the signal)"
    - "fail-open capability probing: an ambiguous probe reports the capability PRESENT"
    - "block by REPLACING the control, not by disabling it — no handler survives to fire"
key-files:
  created:
    - src/lib/platform/capabilities.ts
    - src/lib/platform/capability-copy.ts
    - src/lib/platform/capabilities.test.ts
    - src/components/platform/CapabilityGate.tsx
    - src/components/platform/CapabilityGate.test.tsx
    - src/hooks/useCheckoutCapability.ts
    - src/test/platform/capability-gate-wiring.test.ts
    - e2e/cross-device/capability-gate.spec.ts
    - .planning/phases/03-cross-device-reliability-and-compatibility/deferred-items.md
  modified:
    - src/pages/Upload.tsx
    - src/pages/LinkedInGrader.tsx
    - src/pages/CareerCompass.tsx
    - src/pages/RecruitingLens.tsx
    - src/pages/InterviewPrep.tsx
    - src/pages/Pricing.tsx
    - src/components/topup/TopUpProvider.tsx
    - src/components/DashboardLayout.tsx
decisions:
  - "The binding constraint is MODULE WORKER SUPPORT, not structuredClone — re-verified 0 occurrences of structuredClone repo-wide"
  - "structuredClone, TextDecoderStream and EventSource are NOT probed, and a test forbids their reintroduction"
  - "Every probe fails OPEN on ambiguity; only the module-worker probe is definitive in the negative direction"
  - "An insecure context blocks CHECKOUT ONLY — never an AI flow"
  - "Restricted localStorage and a missing WebSocket are INFORMATIONAL and can never change the tier"
metrics:
  duration: ~50 min
  tasks: 3
  commits: 4
  completed: 2026-07-28
---

# Phase 03 Plan 11: In-App Capability Gate Summary

Feature-detected `supported | degraded` tier that blocks only the AI-start and checkout
money paths — proven on five browser projects to issue zero run-creating and zero
session-creating requests while leaving browsing, auth, results and account management
completely untouched.

---

## What shipped

| Piece | File | Role |
| ----- | ---- | ---- |
| Probe set + tier | `src/lib/platform/capabilities.ts` | six frozen groups, `resolveCapabilityTier()`, `isAiBlocked()`, `isCheckoutBlocked()`, `getBlockedAreas()` |
| Frozen copy | `src/lib/platform/capability-copy.ts` | every Surface B string, transcribed from `03-UI-SPEC.md` § Surface B |
| B1–B4 | `src/components/platform/CapabilityGate.tsx` | banner, blocked AI entry point, blocked checkout entry point, detail dialog |
| Async checkout signal | `src/hooks/useCheckoutCapability.ts` | `loadStripe()` resolution, fails open while pending |
| Wiring | 6 pages + `TopUpProvider` + `DashboardLayout` | the gate at all five AI CTAs and both checkout surfaces |
| Proof | `e2e/cross-device/capability-gate.spec.ts` | OT-4a / OT-4b / OT-4c, 5 projects |
| Anti-vacuity | `src/test/platform/capability-gate-wiring.test.ts` | tier-independent "no page left unwired" |

---

## The binding constraint — evidence, not assertion

The carried-forward instruction was to establish what actually binds the support floor
rather than assume `structuredClone`. Independently re-verified at implementation time:

```
$ rg -o "structuredClone" src e2e supabase index.html public | wc -l
0
$ rg -o "TextDecoderStream" src e2e | wc -l
0
$ rg -o "EventSource" src e2e | wc -l
0
```

**`structuredClone` is not probed.** Gating on it would report a capability the app
does not use and produce a false `degraded` verdict — the single most expensive failure
mode available here. `src/test/platform/capability-gate-wiring.test.ts` asserts that
none of the three names appears on a code line of `capabilities.ts`, so a future edit
cannot quietly reintroduce them. (They DO appear in that file's header comment, which
documents *why* they are absent; the plan's `rg` acceptance criterion is therefore
satisfied against code lines only, verified with
`rg … src/lib/platform/capabilities.ts | rg -v "^\s*[0-9]+: \*"` → no matches.)

What each probe corresponds to at HEAD:

| Probe | Real call site |
| ----- | -------------- |
| module worker | `src/lib/extract-pdf-text.ts:30-33` `{ type: 'module' }`, plus `pdfjs-dist/build/pdf.mjs:15641` where the same option is hardcoded and unreachable by configuration |
| `Worker` | same |
| `ReadableStream` + `getReader` | `src/hooks/useResumeStream.ts:255` |
| `TextDecoder` | `src/hooks/useResumeStream.ts:256`, `src/lib/document-extraction.ts:485,499` |
| `AbortController` | `src/hooks/useAnalysisGuard.ts`, `src/hooks/useIdempotencyKey.ts` |
| `crypto.getRandomValues` / `randomUUID` | the six money-path `crypto.randomUUID()` sites (XD-16), polyfilled by 03-09 |
| `localStorage` | `probeLocalStorage()` from 03-08 |
| `isSecureContext` | payment-form embedding only |

---

## Fail direction of every probe (stated explicitly)

The money-path posture is that a false `degraded` is worse than the defect it prevents.

| Group | Blocks | Fails… | Why |
| ----- | ------ | ------ | --- |
| `documentExtraction` — `Worker`, `supportsModuleWorker()`, `Map.getOrInsertComputed` tripwire | AI | **CLOSED** (the only one) | `supportsModuleWorker()` is definitive in both directions: WebIDL converts the argument list before the constructor runs, so an engine that declares `type` in `WorkerOptions` always reads the getter, and one that does not never can. A construction throw (a `data:` refusal, a strict `worker-src` CSP) does not change the verdict — the flag was already set. |
| `streaming` — `ReadableStream`/`getReader`/`TextDecoder`/`AbortController` | AI | OPEN | positive-presence checks; a throwing probe reports the capability present |
| `idempotency` — `crypto.getRandomValues` + `randomUUID` | AI **and** checkout | OPEN | ditto — a booby-trapped `crypto` object is treated as working, asserted by a test |
| `paymentEmbedding` — `window.isSecureContext !== false` | **checkout only** | OPEN | an ABSENT flag reads as secure; only an explicit `false` blocks. A plain-http origin must never take AI away too. |
| `persistentSession` — `probeLocalStorage()` | **nothing** | n/a | 03-08 removed the auth `storage:` override precisely so auth-js runs its own fallback; restricted storage is a warning, not a reason to take a paying user's analysis away |
| `realtime` — `WebSocket` | **nothing** | n/a | realtime failure is network-shaped and already degrades to polling (XRUN-04) |
| payment provider script (`loadStripe`) | checkout | OPEN **while pending** | briefly blocking a paying customer because a script had not resolved would be worse than the defect guarded against; only a settled negative blocks |

A missing `VITE_STRIPE_PUBLISHABLE_KEY` is deliberately **not** a capability verdict —
it is a deployment fault, and calling it "your browser can't check out" would send the
user chasing a browser upgrade for a problem on our side.

---

## Agreement with Firefox 114 / `supported-browsers.html` / R-23

**They agree, and the agreement is exact.** `03-WORKER-FLOOR-FINDING.md` and R-23 both
name module-worker support as what actually binds, and the gate blocks on exactly that.
Firefox added module workers in **114**; Chrome/Edge 80, Safari 15. So the gate's
effective floor and the number pinned in `public/supported-browsers.html` are the same
number for the same reason. No discrepancy to report; neither side was changed.

**One tension recorded rather than papered over.** The finding notes that both
extraction layers fall back to the main thread, so Firefox 94–113 *may* degrade
gracefully rather than break — which would make this probe's block conservative rather
than accurate. That reasoning is **from source, never executed** (Playwright 1.61 ships
only Firefox 151). The gate therefore keeps the conservative, published-matrix-agreeing
behaviour. If **XTEST-04** ever confirms graceful degradation on a real Firefox 94–113,
the correct follow-up is to demote `documentExtraction` from blocking to informational
and lower the published floor — a one-line change to `CAPABILITY_GROUPS.blocks` plus
the exhaustive table test, not a redesign.

---

## Only the money paths are blocked

| Still fully usable in `degraded` | Blocked |
| -------------------------------- | ------- |
| marketing pages, `/pricing` browsing, auth and sign-in, dashboard, history, saved results, `/profile` account management, billing **reads**, subscription **downgrade** (cancel is not checkout) | starting a new AI run on all five features; creating a Stripe Checkout Session; creating a PaymentIntent |

The block is implemented by **replacing** the live CTA with `BlockedAiEntryPoint`, not by
disabling it — so there is no handler left to fire, rather than a handler that is trusted
to return early. `Pricing.handleTierCta` and `TopUpProvider.handleOpenTopUp` additionally
return before any network call, as defence in depth.

`Pricing.handlePackBuy` deliberately still dispatches `topup:open` when blocked, so the
pack button answers with the B3 explanation instead of being a dead control; the
guarantee is enforced one level down in `TopUpProvider`, which is the last point before
`create-payment-intent`.

Accessibility: the blocked CTA is `aria-disabled="true"` and **not** `disabled`, keeps
the host page's label, carries `aria-describedby` to a `role="note"` card, and moves
focus to the card heading on click, Enter and Space. Nothing here is `destructive` or
`role="alert"` — an unsupported browser is a limitation, not a failure.

---

## Verification

| Gate | Result |
| ---- | ------ |
| `npx vitest run src/lib/platform/capabilities.test.ts` | **36 passed** |
| `npx vitest run src/components/platform/CapabilityGate.test.tsx` | **13 passed** |
| `npx vitest run src/test/platform/capability-gate-wiring.test.ts` | **9 passed** |
| `npm run test` (full) | **1033 passed / 1 failed** — the single failure is DF-01, pre-existing at HEAD (proved by stashing every 03-11 change and re-running) |
| `npm run type-check` | exit 0 |
| `npm run lint` | exit 0 — **151 warnings, 0 errors**, byte-identical to the recorded baseline |
| `npm run build` | exit 0 |
| `capability-gate.spec.ts` × 5 projects | **16 passed** (chromium, firefox, webkit, mobile-webkit, mobile-chromium) |
| `e2e/stripe-checkout.spec.ts` | **3 passed / 1 quarantine-skipped** — the supported checkout path is untouched |
| `npx playwright test --grep @xdev` | **182 passed / 4 failed / 30 skipped** |

**The `@xdev` number, read honestly.** The recorded baseline at dispatch was
166 / 5 / 30. This plan adds 16 passing rows → 182. Failures went 5 → **4**: all four
remaining are the XD-03 offline rows in `network-conditions.spec.ts`, owned by 03-13 /
03-14 and not mine. The fifth (the `mobile-chromium` row of the same test) passed this
run; it was not touched by this plan and is most plausibly flaky. It is called out here
so nobody later reads 4 ≠ 5 as evidence that something was silently "fixed".

`AI_TEST_MODE` was **not** set, no `.env*` was edited, and no assertion was weakened.

### What OT-4 actually observed, per page

Non-vacuity matters more than a green tick, so the branch each page took is recorded:

| Page | Branch | Meaning |
| ---- | ------ | ------- |
| `/upload` | `blocked-cta` | B2 card visible, CTA `aria-disabled`, focus moved on all three activations |
| `/linkedin-grader` | `blocked-cta` | reached via `Scan New Profile` (the seeded account lands on its result view) |
| `/career-compass` | `blocked-cta` | reached via `Start New Analysis` |
| `/recruiting-lens` | `no-start-cta` | free tier ⇒ `ProFeatureGate` renders before any start CTA exists |
| `/interview-prep` | `no-start-cta` | `VITE_FEATURE_INTERVIEW_PREP` is off in this environment ⇒ `ComingSoon` |
| `/pricing` (subscribe) | `blocked-checkout` | B3 section visible; the shipped tier CTA is also inert |
| `/pricing` (top-up) | `blocked-checkout` | pack click opens the B3 explanation, never a PaymentIntent |

On the two `no-start-cta` pages the spec proves the negative rather than assuming it: it
asserts the degraded **banner** is visible (so the gate demonstrably evaluated on that
page) and that no **live** control with the start-CTA label exists — where "live" means
`button:not([data-capability-blocked])`, because the gate preserves the host label and a
bare name match would otherwise report the blocked control as proof of non-wiring. The
tier-independent proof that all five pages are wired is
`src/test/platform/capability-gate-wiring.test.ts`, which reads source and has no
account or feature-flag dependency.

Request counting is anchored on `/functions/v1/` — an unanchored function-name regex
counted `page.goto('/recruiting-lens')`, the SPA route itself, as a money-path call.
`js.stripe.com` is explicitly excluded: loading the provider script is not a Strivo
session-creating call.

---

## Deviations from plan

**1. [Rule 3 — Blocking] The plan's probe list included `structuredClone`; it was not implemented.**
The plan text at Task 1 lists `structuredClone` inside `documentExtraction`. The
carried-forward finding, `03-WORKER-FLOOR-FINDING.md` and residual **R-23** all
explicitly forbid it (0 occurrences repo-wide ⇒ a guaranteed false-positive block). The
registers win over the stale plan text. A guard test now prevents its return.
Files: `src/lib/platform/capabilities.ts`, `src/test/platform/capability-gate-wiring.test.ts`. Commits `df00feff`, `59625d0d`.

**2. [Rule 2 — Missing critical functionality] Added `src/lib/platform/capability-copy.ts` and `src/hooks/useCheckoutCapability.ts`.**
Neither is in `files_modified`. The copy table is required by UI-SPEC § Downstream
Obligations ("no user-facing string literal inside a Phase-3 component"), and the plan
itself permits "an adjacent module". The hook exists because the plan requires deriving
checkout capability from `loadStripe()`, which is asynchronous and cannot live in the
synchronous probe module. Commits `df00feff`, `d2c93634`.

**3. [Rule 2] Added `src/components/DashboardLayout.tsx` (one line).**
The plan requires `CapabilityBanner` "inside the app shell under the navbar" but names
no file. `DashboardLayout` is the authenticated app shell; the banner sits directly
after `<TopBar />`, in normal document flow. Commit `70342f89`.

**4. [Rule 2] Added `src/test/platform/capability-gate-wiring.test.ts`.**
The plan's acceptance criterion "assert `capability-blocked-analysis` is VISIBLE on each
of the five AI pages" is unachievable for the seeded FREE-tier account: two of the five
render a tier/flag gate before any start CTA exists, so a browser-only assertion cannot
distinguish "gated" from "unwired". The static guard restores the property the criterion
was protecting, without a tier dependency. Commit `59625d0d`.

**5. [Rule 1 — Bug] `Pricing.handlePackBuy` no longer short-circuits.**
The first implementation blocked at both Pricing and `TopUpProvider`, which made the
pack button dead with no explanation — a worse outcome than the one B3 exists to fix.
The event is now dispatched and blocked in the provider, which is the last point before
`create-payment-intent`. Commit `59625d0d`.

**6. Playwright `force: true` on blocked-control clicks.**
Playwright's actionability check treats `aria-disabled="true"` as "not enabled" and
refuses to click. A real browser dispatches the click — which is the whole point of the
assertion — so `force` is the faithful simulation, not a workaround. Visibility is
asserted separately so nothing is skipped silently. Commit `59625d0d`.

---

## Register rows

| Row | Status |
| --- | ------ |
| **R-23** (Firefox floor stays 114) | **Owner obligation discharged.** 03-11 was named as the plan that must establish the next binding constraint. Verdict: the constraint is module-worker support itself; `structuredClone` is confirmed unused and is not probed. The gate and the published `114` agree. The row stays **ACCEPTED** — this plan does not close it, and 03-20 should publish 114 with the untested 94–113 caveat exactly as the finding advises. |
| `03-DEFECT-REGISTER.md` | **No row closed.** Plan 03-11 builds a new surface under XDEV-01 / XRUN-01; the XD-* rows it touches conceptually (XD-01/02 storage, XD-16 `crypto.randomUUID`) were already closed by 03-08 and 03-09. Nothing is claimed here. |
| **DF-01** (new, `deferred-items.md`) | `responsive-source-guard.test.ts` is RED at HEAD for `src/components/BelowFold.tsx`. Pre-existing, proved by stash-and-rerun. Owned by 03-10 / the 03-19 closeout. Not fixed here. |

---

## Notes for the next plan

- **03-16 (wave 8)** writes second into `Upload`, `LinkedInGrader`, `CareerCompass`,
  `RecruitingLens`. `BlockedAiEntryPoint` is in place at each start CTA and the submit
  handlers are structurally unchanged, so the D-29 guard is a small insertion. The
  capability branch is *outside* the handler (the control is replaced), so
  `beginSubmit()` is never reached in `degraded` tier without any extra work.
  `InterviewPrep.tsx` and `Onboarding.tsx` are untouched by this plan as specified.
- **03-12** should render `CLIENT_BROWSER_UNSUPPORTED` from `CAPABILITY_COPY`, not a new
  literal — the table is exported and frozen.
- **03-20** needs three artifacts to agree; two of them (this gate and
  `public/supported-browsers.html`) now do, at **114**.

---

## Self-Check: PASSED

All nine created files verified present on disk; all four commits verified in
`git log`. Working tree clean.

*Phase: 03-cross-device-reliability-and-compatibility · plan 03-11*
