---
phase: 03-cross-device-reliability-and-compatibility
plan: 14
subsystem: ui
tags: [realtime, supabase-realtime, websocket, connectivity, visibilitychange, polling, recovery, playwright, cross-device]

# Dependency graph
requires:
  - phase: 03-12
    provides: the frozen 9-code client error taxonomy (`CLIENT_REALTIME_DEGRADED`, `CLIENT_OFFLINE`) and the shared leak-guard pattern
  - phase: 03-06
    provides: `reportDiagnostic` — the fire-and-forget, never-throws client diagnostics seam and the closed `realtime_degraded` category
  - phase: 03-13
    provides: the precedent that offline is never a moment to reload or retry into
provides:
  - "`src/lib/platform/network-status.ts` — the first online / offline / visibilitychange seam in `src/`, reference-counted to one listener per event type with a coalesced catch-up signal"
  - "A `(status, err) => …` callback on BOTH `.subscribe()` sites, so `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED` are observable for the first time"
  - "A muted, informational `CLIENT_REALTIME_DEGRADED` line on the analysis waiting surface — never a toast, never an error state"
  - "The UI-SPEC D6 R4 reconnect note and a forced catch-up poll on `online` and on a tab becoming visible"
  - "`realtimeDegraded` on `AnalysisRunSnapshot`, so plan 03-15 consumes the flag with no signature change"
  - "`e2e/cross-device/realtime-fallback.spec.ts` — OT-10 / OT-11 on five engines, with a realtime-healthy control"
affects: [03-15 waiting overlay, 03-16 submit guard, any future surface that needs connectivity or visibility events]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reference-counted global event seam: one registration per event type shared by all subscribers, removed when the last detaches, returning an idempotent unsubscribe"
    - "Coalesced catch-up: `online` and `visibilitychange -> visible` collapse into ONE signal inside a 400ms window, so a waking laptop cannot produce a poll storm"
    - "One side effect per TRANSITION, not per event, when the underlying library retries unboundedly"

key-files:
  created:
    - src/lib/platform/network-status.ts
    - src/lib/platform/network-status.test.ts
    - e2e/cross-device/realtime-fallback.spec.ts
  modified:
    - src/hooks/useAnalysisRun.ts
    - src/pages/Results.tsx
    - .planning/phases/03-cross-device-reliability-and-compatibility/03-DEFECT-REGISTER.md

key-decisions:
  - "The realtime socket is blocked in the E2E spec by an `addInitScript` `WebSocket` stub, NOT by `page.route('**/realtime/v1/**').abort()` — `page.route` does not intercept a WebSocket handshake, so the plan's literal route-abort recipe would have aborted nothing and produced a vacuously green spec. The route abort is kept as a belt-and-braces second layer."
  - "`onCatchUp` is a distinct, coalesced handler rather than coalescing `onOnline` / `onVisible` against each other. Which of two collapsed callbacks 'wins' would otherwise be arbitrary; separating the STATE notifications from the single NETWORK-WORK signal makes the contract unambiguous and directly assertable."
  - "The degraded / offline / reconnect note is rendered as a sibling layered above `UniversalAnalyzing` (z-[61] over its z-[60] overlay) rather than as a new prop, because 03-15 owns that component and a prop change would collide with it."
  - "One catch-up poll and one diagnostic per TRANSITION into a degraded state, not per `CHANNEL_ERROR` event — realtime-js retries unboundedly in the background, so per-event reaction is a self-inflicted request storm from every affected tab."
  - "The E2E drives the results route entirely from `page.route` fixtures. No start CTA is clicked, so no Merit is spent and no Anthropic call is made, and the poll cadence becomes scriptable."
  - "`isOffline` is seeded from a lazy `useState` initialiser rather than a `setState` in the effect body — same first-paint honesty, no cascading render and no new lint warning."

patterns-established:
  - "Event seam with reference counting + idempotent unsubscribe (`network-status.ts`), unit-tested by COUNTING live registrations rather than spying on `addEventListener`, so 'never added' and 'added then removed' are distinguishable"
  - "Realtime status observation: `SUBSCRIBED` clears, `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED` degrade — the identical callback body at both call sites so the live and dormant implementations cannot drift"
  - "Anti-vacuity controls in a fallback spec: a counted request total, a proof that the surface ADVANCED on the fallback alone, and a healthy-path control asserting the degraded affordance is ABSENT"

requirements-completed: [XRUN-04, XRUN-03]

# Metrics
duration: 42min
completed: 2026-07-29
---

# Phase 03 Plan 14: Realtime Fallback and Connectivity Recovery Summary

**A blocked WebSocket now resolves the run by polling behind a single muted line instead of looping invisibly forever, and a backgrounded or reconnecting tab forces a catch-up poll instead of sitting on a dead socket.**

## Performance

- **Duration:** ~42 min
- **Tasks:** 3 / 3
- **Files created:** 3
- **Files modified:** 3 (2 source, 1 register)

## Accomplishments

- **XRUN-04 / defect XD-18 closed.** Both `.subscribe()` call sites were bare at HEAD, so `CHANNEL_ERROR`, `TIMED_OUT` and `CLOSED` were never seen. Because `realtime-js` v2 has **no long-poll transport** and reconnects unboundedly, a blocked-WebSocket environment was a permanent, entirely invisible loop: the UI could never say polling was in use and the cadence never adapted. Both sites now take a status callback; the live path additionally forces a catch-up poll and reports a `realtime_degraded` diagnostic.
- **XRUN-03 / defect XD-19 closed.** `src/` contained zero `online`, `offline` and `visibilitychange` handlers. `src/lib/platform/network-status.ts` is the seam: one reference-counted registration per event type, an idempotent unsubscribe, a zero-leak guarantee asserted by counting live registrations, and a single coalesced `onCatchUp` so a waking laptop produces one poll per surface rather than two.
- **The recovery is not an error.** `CLIENT_REALTIME_DEGRADED` renders as a 14px `text-muted-foreground` note. No toast, no error state, no destructive colour, nothing blocked — asserted on five engines alongside the presence of the line, because turning a common mobile socket drop into a visible failure is precisely the false failure this phase exists to remove.
- **XD-03's offline-affordance half partially closed,** honestly scoped: the analysis waiting surface now tells the user they are offline and recovers when they return, but the lazy-route navigation case remains 03-15's via R-26.
- **Proof on five engines.** 6 new tests × 5 projects, all green, with a realtime-healthy control that makes an always-on degraded line fail.

## Task Commits

1. **Task 1: The network and visibility seam** — `46efca0f` (feat)
2. **Task 2: Status callbacks at both subscribe sites, plus forced catch-up polls** — `2382d737` (feat)
3. **Task 3: Five-project proof of polling fallback and reconnect restore** — `ee4ab7ce` (test)

## Files Created/Modified

- `src/lib/platform/network-status.ts` — the event source. `getNetworkStatus()` (defaults to ONLINE when `navigator.onLine` is absent) and `subscribeNetworkStatus({ onOnline, onOffline, onVisible, onCatchUp })`. No `fetch`, no Supabase, no run state, never throws.
- `src/lib/platform/network-status.test.ts` — 16 cases: one-listener-per-event, the zero-leak assertion, unsubscribe idempotence, visible-only delivery, cross-subscriber coalescing, the post-window re-arm, the missing-`navigator.onLine` default, and a hostile environment where `addEventListener` is unavailable.
- `src/hooks/useAnalysisRun.ts` — the dormant site's status callback, `realtimeDegraded` added to `AnalysisRunSnapshot`. `analysisRunChannelSeq` and the early-return dormancy are untouched.
- `src/pages/Results.tsx` — the live site's status callback, the seam wired with a matching unsubscribe on unmount, the forced catch-up (which re-arms the single poll chain and never runs while offline), and the three connectivity notes.
- `e2e/cross-device/realtime-fallback.spec.ts` — OT-10, the OT-10 healthy control, and four OT-11 recovery cases.
- `.planning/phases/03-cross-device-reliability-and-compatibility/03-DEFECT-REGISTER.md` — XD-18 and XD-19 given regression slots and marked CLOSED; XD-03 amended.

## Register Rows Closed

| Row | Status after this plan |
| --- | --- |
| **XD-18** — both `.subscribe()` call sites are bare | **CLOSED.** Regression slot: `realtime-fallback.spec.ts::… › OT-10: a blocked socket resolves the run by polling, with only a muted line`, plus its healthy control. |
| **XD-19** — zero `online` / `offline` / `visibilitychange` handlers in `src/` | **CLOSED.** Regression slots: `… › OT-11: offline → online shows the reconnect note, then clears it` and `… › OT-11: a hidden → visible tab forces a catch-up poll` (which counts status calls, so a handler that exists but does nothing cannot pass), with the 2000ms budget held by the reload and navigate-back cases. |
| **XD-03** — offline white screen / no offline affordance | **Offline-affordance half PARTIALLY closed** on the analysis waiting surface. The lazy-route navigation half stays OPEN and stays 03-15's (R-26). |

## Verification

| Gate | Result |
| --- | --- |
| `npm run test` (vitest) | **1112 passed / 0 failed** (baseline 1096; +16 from `network-status.test.ts`) |
| `npm run type-check` | exit 0 |
| `npm run lint` | exit 0 (0 errors; no new warnings — the one candidate was removed by using a lazy `useState` initialiser) |
| `npm run build` | exit 0 |
| `realtime-fallback.spec.ts`, all five projects | **31 passed / 0 failed** (6 tests × 5 projects + setup) |
| Full `@xdev` lane | **251 passed / 0 failed / 30 skipped** (baseline 221 passed / 0 failed / 30 skipped; +30 = the 6 new tests × 5 projects). **The lane is still fully green.** |

## Scope Guards Honoured

- **D-27:** `VITE_FEATURE_ANALYSIS_LIFECYCLE` is NOT flipped. `git diff src/config/feature-flags.ts` is empty and `useAnalysisRun` still early-returns an inert snapshot. The dormant site received the identical callback so the two implementations cannot drift.
- `src/components/UniversalAnalyzing.tsx` and `src/hooks/useResumeStream.ts` are byte-identical — 03-15 owns them. The degraded flag is exposed through the existing snapshot shape so that plan needs no signature change.
- 03-13's files (`stale-bundle.ts`, `StaleBundleFallback.tsx`, `main.tsx`, `vercel.json`, `stale-bundle.spec.ts`) untouched.
- No tenth taxonomy code was added; `CLIENT_OFFLINE` and `CLIENT_REALTIME_DEGRADED` are read from the frozen table, and every rendered string passes 03-12's leak guard (asserted in-spec via `assertNoLeak`).
- Nothing under `supabase/`. No DB write, no migration, no deploy. No `git stash`, no branch operation, no push. `STATE.md` and `ROADMAP.md` untouched; zero writes under `phases/02-*`.
- R-26 respected: XD-15 (a stalled chunk leaving a spinner forever) was not attempted here.

## Deviations from Plan

### 1. [Rule 3 — Blocking] The plan's socket-blocking recipe could not work

- **Found during:** Task 3
- **Issue:** The plan specifies `page.route('**/realtime/v1/**', r => r.abort())` to block realtime. Playwright's `page.route` intercepts HTTP only — it does not intercept a WebSocket handshake — so this aborts nothing. The spec would have gone green while proving zero, which the plan's own threat model names as the worst possible outcome.
- **Fix:** The socket is blocked inside the page by an `addInitScript` that swaps `window.WebSocket` for a stub which asynchronously fires `error` then `close` (code 1006). The init script runs before any page script, so `supabaseClient.ts` is constructed against the stub. This is a faithful reproduction of the corporate-proxy / captive-portal case, is byte-identical on Blink, Gecko and WebKit, and matches no engine-specific message. The route abort is retained as a second layer.
- **Files:** `e2e/cross-device/realtime-fallback.spec.ts`
- **Commit:** `ee4ab7ce`

### 2. [Rule 3 — Blocking] `ProtectedRoute`'s onboarding probe hijacked the `resumes` fixture

- **Found during:** Task 3
- **Issue:** The first spec run failed all six cases — the route guard redirected away from `/results` before the surface under test ever mounted. `ProtectedRoute` probes `resumes` with `select=id&user_id=eq.<uid>&limit=1` and reads `.length`, while the results page reads the row with `.single()`. A single fixture body cannot satisfy both, and the guard also requires a saved `career_targets.professional_goal`.
- **Fix:** The `resumes` handler branches on `user_id=eq.` in the request URL and returns an array for the guard and the row object for the page; a `career_targets` fixture was added. Documented inline so the next plan reusing this fixture does not rediscover it.
- **Files:** `e2e/cross-device/realtime-fallback.spec.ts`
- **Commit:** `ee4ab7ce`

### 3. [Rule 2 — Missing critical functionality] Poll-chain re-arm in the forced catch-up

- **Found during:** Task 2
- **Issue:** `Results.tsx` keeps its job-status poll in a single `pollTimer` handle re-assigned by each `setTimeout`. Calling `pollJobStatus()` for a catch-up without first clearing that handle leaks the pending timer and leaves the tab with TWO chains hitting `get-analysis-job-status` forever — the poll storm the plan's threat model calls out, self-inflicted by the fix itself.
- **Fix:** The catch-up clears `pollTimer` before re-entering the chain, and is itself rate-limited to one per second on top of the seam's own coalescing. It also returns early while offline, following 03-13's rule that offline is never a moment to retry into.
- **Files:** `src/pages/Results.tsx`
- **Commit:** `2382d737`

## Notes for the Next Plan

- **03-15** should consume `run.realtimeDegraded` from `AnalysisRunSnapshot` (dormant path) and, for the live path, the degraded note that `Results.tsx` renders beneath the overlay. When `UniversalAnalyzing` is rewritten per UI-SPEC D1–D5, that note is the piece to fold into the component as a proper line "beneath the stage list" — it currently sits as a `z-[61]` sibling precisely so this plan did not have to touch a component 03-15 owns.
- The `page.route` results-route fixture in `realtime-fallback.spec.ts` (including the `ProtectedRoute` gotcha) is reusable by any plan that needs the analysis waiting surface without spending a Merit.
- **Pre-existing, not mine:** an untracked `.planning/quick/260729-02a-fix-delayed-dashboard-data-rendering/` directory appeared in the working tree during this session. It was created outside this plan's scope, is not referenced by anything here, and was deliberately left untouched and uncommitted.

## Self-Check: PASSED
