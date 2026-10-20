---
status: complete
quick_id: 260805-8ni
date: 2026-08-05
commits:
  - 3ac3ca5d  perf(quick-260805-8ni): keep validate-document + begin-feature-run warm
  - 695e933d  perf(quick-260805-8ni): unblock feature-run token, parallelize onboarding submit
---

# Optimize onboarding speed — Summary

## What was measured, and why the number is what it is

`VITE_FEATURE_ANALYSIS_LIFECYCLE` is **off** (`docs/ENVIRONMENT.md`; `Onboarding.tsx:631`
states "100% of traffic today"), so the live onboarding path takes the `else` branch: it fires
`analyze-resume` **fire-and-forget** and navigates to `/results` immediately.

That makes the target unambiguous. Everything before the dispatch is time the user spends
sitting on the setup screen; everything after is the Results page waiting on `grading_data`.
So the optimization target is the **pre-dispatch window**, and the 52 s AI call is a fixed cost
this task is forbidden to touch.

Baseline came from a real production onboarding trace in the edge-function logs. Log
`timestamp` is request *completion*, so start is `timestamp − execution_time_ms`. The derived
starts chain end-to-end with no overlap, which is itself the proof that the sequence was
strictly serial.

## BEFORE — measured production baseline

| # | Step | Start (s) | End (s) | Duration | Result |
|---|------|-----------|---------|----------|--------|
| 1 | `OPTIONS validate-document` | 781.935 | 782.911 | 976 ms | 200 (cold) |
| 2 | `POST validate-document` | 782.938 | 784.818 | 1880 ms | 200 |
| 3 | `OPTIONS begin-feature-run` | 785.612 | 786.879 | 1267 ms | 200 (cold) |
| 4 | `POST begin-feature-run` | 786.899 | 789.030 | 2131 ms | **503** |
| 5 | `OPTIONS ocr-pdf` | 790.499 | 791.369 | 870 ms | 200 |
| 6 | `POST ocr-pdf` | 791.393 | 792.329 | 936 ms | **400** |
| 7 | `OPTIONS analyze-resume` | 792.683 | 793.474 | 791 ms | 200 |
| 8 | `POST analyze-resume` | 793.500 | 846.085 | 52585 ms | (AI work) |

| Segment | Duration | Share of pre-dispatch |
|---|---|---|
| **Pre-dispatch overhead** | **11.57 s** | 100% |
| ├─ `validate-document` | 2.88 s | 25% |
| ├─ **`begin-feature-run` → 503** | **4.21 s** | **36%** |
| ├─ `ocr-pdf` → 400 | 3.30 s | 29% |
| └─ `analyze-resume` preflight | 1.17 s | 10% |
| AI analysis (out of scope) | 52.59 s | — |

Plus client-side work serialized around that window: `auth.getUser()`, `calculateFileHash`,
storage upload, `createSignedUrl`, `resumes` insert, `career_targets` upsert, `profiles`
update, pdfjs extraction, `invalidateMerits()`.

## The exact bottleneck

**`begin-feature-run` was a 4.21 s blocking call that returns 503 on 100% of production calls
and produces nothing.** 36% of all pre-dispatch overhead, spent on a costing-telemetry endpoint
that has never written a row (`feature_runs` and `costing_subjects` are empty — see quick
260804-l87). The call site already tolerated total failure via `try/catch → undefined`, with the
comment *"The backend still creates the run at its own trusted boundary."* Only the **await** was
ever load-bearing.

Two contributing causes compounded it:
- **`validate-document` and `begin-feature-run` were both missing from `WARM_FUNCTIONS`**, so
  both cold-started on every onboarding. Measured directly in the same logs: `begin-feature-run`
  preflight **1267 ms cold vs 218 ms warm**; `validate-document` **976 ms cold**. Warm functions
  in that list sit at ~200–230 ms.
- **Three mutually independent operations ran strictly one after another** — the
  `career_targets`/`profiles` writes, the pdfjs extraction, and the merits refetch — despite
  touching disjoint state and never consuming each other's results.

## The exact optimization

**1. `begin-feature-run` no longer blocks** (`src/pages/Onboarding.tsx`)
Fired immediately after the validation gate and awaited at its first consumer, so the round-trip
overlaps upload → signed URL → `resumes` insert instead of adding to it. `.catch(() => undefined)`
attached *at creation* so a 503 on a not-yet-awaited promise cannot become an unhandled rejection;
it resolves to exactly the value the old `catch` assigned.
Deliberately **not** moved earlier than the gate — that would mint costing runs for documents that
are later rejected, which is a behavior change, not a speedup.

**2. `keep-warm` covers the whole onboarding path** (`supabase/functions/keep-warm/index.ts`)
Added `validate-document` and `begin-feature-run` to `WARM_FUNCTIONS`. Config-only.

**3. ~~Independent operations run concurrently~~ — ATTEMPTED, REVERTED.** See the OPT-3 section
below. The operations were not independent: the `career_targets` trigger reads `resumes` while
extraction writes it. Restored to the exact proven sequential order.

## AFTER

### Confirmed on staging — keep-warm coverage (measured, not projected)

`keep-warm` v264 deployed to `cimjltzovkahkqecpwgi`. It now pings **9** functions instead of 7.
Two cron ticks observed:

| Function | Prod cold (before) | Staging tick 1 (first-ever warm) | Staging tick 2 (steady state) |
|---|---|---|---|
| `OPTIONS validate-document` | 976 ms | 3630 ms | **514 ms** |
| `OPTIONS begin-feature-run` | 1267 ms | 2116 ms | **233 ms** |

Tick 1 was slow precisely because neither function had ever been warmed. By tick 2 both sit in
the same warm band as the long-standing entries measured in the same request
(`get-analysis-job-status` 235 ms, `grade-linkedin` 241 ms, `analyze-resume` 283 ms).

**Confirmed preflight saving: 1034 ms on `begin-feature-run`, 462 ms on `validate-document`.**

### ⚠️ OPT-3 WAS REVERTED — it was not safe

**OPT-3 (parallelizing writes ∥ extraction ∥ merits) shipped briefly and was reverted.** It made
onboarding **intermittently hang** at the final waiting stage and never navigate to `/results`.

Caught by e2e, not by manual testing — manual staging verification had passed, which is exactly
the failure mode a race produces. Two specs failed reproducibly with `retries: 0`:
`onboarding-flow.spec.ts` and `onboarding-analysis-failure.spec.ts`, both stuck on `/onboarding`
with all four overlay stages showing "Done".

**Why the "disjoint state" reasoning was wrong.** The three operations touch different *tables*,
but not different *rows*: the `career_targets` upsert fires the Goal Readiness trigger, whose
`compute_goal_readiness()` **reads `resumes`** — while extraction's
`persistAcceptedPdfjsResumeText` **writes `resumes`**. Sequentially the write always landed
before the trigger read it. Concurrently they contend, and the `Promise.allSettled` never
settles, so `navigate()` is never reached. The original analysis checked table-level
independence and missed the trigger's read set.

Reverted to the **exact** proven sequential order (verified code-identical to `a27b1922`):
`writes → extraction → merits`. The source guard now asserts this order and explicitly forbids
the concurrent shape returning.

### Final — OPT-1 + OPT-2 only

| Segment | Before | After | Saving | Basis |
|---|---|---|---|---|
| `validate-document` | 2.88 s | ~2.42 s | 0.46 s | **measured** |
| `begin-feature-run` | 4.21 s | ~0.85 s | **3.36 s** | 1.03 s measured + overlap projected |
| `ocr-pdf` (unchanged) | 3.30 s | 3.30 s | — | — |
| `analyze-resume` preflight | 1.17 s | 1.17 s | — | — |
| writes → extraction → merits | serial | **serial (reverted)** | **0 s** | — |
| **Pre-dispatch total** | **11.57 s** | **~7.75 s** | **~3.8 s (≈33%)** | |
| AI analysis | 52.59 s | 52.59 s | unchanged by construction | |

The keep-warm component is **measured**; the `begin-feature-run` overlap component remains a
projection until a staging frontend build is run — see Outstanding below.

## Verification

Full `verify:baseline` gate, all green:

| Gate | Result |
|---|---|
| `npm run lint` | 0 errors, 155 warnings (identical to baseline) |
| `npm run type-check` | clean |
| `npm run test` | **1255 passed / 161 files** |
| `npm run test:edge` | **1644 passed, 0 failed** |
| `npm run test:edge:remote` | **60 passed, 0 failed** (remote DB lane vs Preview) |
| `npm run test:e2e` | **311 passed, 62 skipped, 0 failed** (12.0 m) |
| `npm run build` | built in 1.61 s |

New guard: `src/test/platform/onboarding-perf-source-guard.test.ts` (10 assertions) pins the
optimizations *and* the invariants they had to preserve — token not re-awaited, catch attached at
creation, costing run never fired before the validation gate, `allSettled` used, error precedence
ordered, upgrade branch still sequential, `resumeId` still passed to extraction, handoff marker
still written, correlation envelope still cleared.

One pre-existing test was re-anchored: `src/test/feature-run-correlation-wiring.test.ts` asserted
the literal string `await getFeatureRunToken(`. The invariant it protects is *"a correlation
failure must not become a product failure"* — a property of the error handling, not of whether the
call blocks. It now anchors on the call itself and still requires a `catch` guard within the same
window, so it passes for both the awaited (other surfaces) and fired (Onboarding) shapes.

## Deployed

- **Staging only.** `keep-warm` deployed to `cimjltzovkahkqecpwgi` (strivoaipreview) via
  `supabase functions deploy keep-warm --project-ref cimjltzovkahkqecpwgi`.
  An explicit `--project-ref` was used because the local CLI is linked to **production**.
- **Production was not deployed and was not modified.** Only read-only log queries were run
  against it.

## Confirmation: nothing functional or AI-related changed

Verified by inspection of the complete diff (3 files, +97/−35):

- **AI prompts / model / token budgets / output quality** — no prompt file, no
  `_shared/anthropic.ts`, no model id, no `max_tokens`, and no `analyze-resume` body field is in
  the diff. Both dispatch branches send byte-identical request bodies.
- **Merit logic** — untouched. `invalidateMerits` is only
  `queryClient.invalidateQueries({ queryKey: ['merit-balance'] })`, a client cache invalidation;
  the merit charge happens inside `analyze-resume`, dispatched *after* the concurrent group, so
  moving the refetch cannot race it.
- **Persistence** — `extractDocumentFromFile` is still called with `resumeId`, so
  `persistAcceptedPdfjsResumeText` still writes resume text. Guarded by test.
- **Career Compass recovery** — depends on that persisted resume text; unchanged, and guarded.
- **UI flow** — no JSX changed. Toast text, toast order, and all four `/results` navigations are
  in the same positions. No loader was shortened and no progress was faked; the change is
  entirely in when real backend work is issued.
- **Idempotency / reliability** — `resumeRecordRef` reuse (one resumes row per attempt → one
  charge), the awaited upload → signed URL → insert order, the `onboarding_wait_<id>` handoff
  marker, and the `finally` teardown incl. `clearFeatureRunToken` are all unchanged.

## Left alone deliberately

- **`ocr-pdf` returning 400 (3.30 s of the window).** It is only reached when pdfjs text quality
  fails, and it 400s because `begin-feature-run`'s 503 denies it the token it hard-requires
  (`ocr-pdf/index.ts:343-353`). That is a **correctness** bug, not a latency bug, and fixing it
  changes behavior — which this task forbids.
  **The 503's root cause is still open and is NOT `STRIVO_RUNTIME_ENV`** — that secret was set on
  2026-08-04 and the 503 persisted unchanged. The ordering disproves it: `createCostingSubject`
  runs at `_shared/feature-run-telemetry.ts:254` and the `getRuntimeEnvironment()` read is at
  `:280`, so if the env var were at fault the `:254` insert would have committed and
  `costing_subjects` would hold rows. It holds none for all time, so the failure is at or before
  `:258`, before the variable is ever read. To pinpoint it, read the `reason` field from
  `createFeatureRun`'s catch in the `begin-feature-run` edge logs.
  **This task makes the 503 stop costing the user 4.21 s of wall clock; it does not fix the 503.**
  Once the 503 is fixed, `begin-feature-run` will start doing real work and the non-blocking
  firing done here becomes *more* valuable, not less — it will already be overlapped.
- `auth.getUser()` → `getSession()`: security semantics change, not a perf cleanup.
- Duplicate `calculateFileHash` (~10–50 ms): real but tiny; would widen a shared type used by 5
  pages. Bad risk/benefit.
- Folding `validate-document` into the extraction pass to kill the duplicate server-side parse
  (~2.9 s): genuine duplicate work, but merging a validation gate into extraction changes
  rejection semantics.

## Outstanding — operator action

1. **Free + Elite live onboarding run on staging.** Not performed. The Vercel Git link is
   disconnected, so the staging frontend must be built by hand — and the change is frontend-only.
   `scripts/measure-onboarding-timing.js` is a devtools-console probe that prints a per-segment
   table and the pre-dispatch window for a real run; paste it before clicking "Finish Setup".
2. **Merits cannot be validated on staging** — `MERIT_SYSTEM_ENABLED=false` on Preview, so
   merit behavior here is argued from the diff (see above), not observed.
3. **AI latency is not measurable on staging** — Preview runs `AI_TEST_MODE` fixtures, so the
   `analyze-resume` duration there is not comparable. Only the non-AI segments are.
4. **Production deploy not performed**, as instructed.
