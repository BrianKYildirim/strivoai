# Phase 06 — Deferred / Out-of-Scope Items (discovered during execution)

Append-only log of issues discovered during plan execution that are OUT OF SCOPE
for the current task (pre-existing, not caused by the task's changes). Per the
executor SCOPE BOUNDARY rule these are logged here, NOT fixed.

---

## DI-06-03-01 — 2 pre-existing E2E infra-reds at pristine HEAD `cb864966` (Plan 06-03)

**Discovered:** 2026-06-20, at the start of Plan 06-03 execution, BEFORE any dependency bump.

**What:** `npm run verify:baseline` at pristine HEAD `cb864966` (06-02 complete, zero
local changes) is RED on the Playwright/E2E layer with **2 deterministic failures**
(reproduced on two consecutive runs):

1. `e2e/resume-analysis.spec.ts:25` — "upload → analyze (AI stubbed) → results render" —
   `locator('#file-input').setInputFiles(...)` times out at 120s (the upload page /
   file-input never reaches the staged state). This is the live-infra-dependent resume
   flow against the shared TEST Supabase project (`cimjltzovkahkqecpwgi`).
2. `e2e/stripe-checkout.spec.ts:56` — "post-checkout reconcile fires on ?checkout=complete" —
   `getByText(/upgrade processing/i)` not visible within 30s.

**Why out of scope:** These are **live-infra/environment-dependent** E2E flows, not code
regressions. STATE.md (Blockers/Concerns) documents these exact flows as historically
gated on the shared TEST project's APP_URL/CORS + AI_TEST_MODE + Stripe-test-secrets +
network reachability (Plan 01-03 Blockers A/B; Flow 2/3 CORS gate). They fail **identically
at pristine HEAD before any Plan 06-03 dependency change** — so no dependency bump in this
plan caused them, and no dependency bump can fix them (they require the operator's TEST-env
provisioning, which is external to the repo).

**Deterministic layers ARE green at pristine HEAD (the machine-independent proof):**
- vitest: **457 passed (79 files)** — exactly the baseline.
- deno offline `test:ci`: **699 passed | 0 failed | 11 ignored** — exactly the CURRENT-HEAD
  baseline (the +1 over the Phase-5-close 698 is the pre-existing WR-04/05/06 drift documented
  in 06-01).
- `npm run build`: **exit 0**.

**Per-bump gate adopted for Plan 06-03 (in light of this pre-existing red):** after each
atomic/coupled bump, the gate is **build exit 0 + vitest 457 + deno 699/0/11 + E2E with NO
NEW reds beyond these 2 pre-existing infra failures** (i.e. still exactly `3 passed + 1 skip
+ 2 infra-red`, same as pristine HEAD). A bump that breaks vitest/deno, fails the build, or
introduces a *3rd* E2E failure = revert that single major and report. type-check exit 0 also
gates the resolvers@5 bump; lint exit 0 gates the eslint coupled set.

**Action:** NONE (logged, not fixed). The operator owns re-provisioning the TEST Supabase
env if a fully-green E2E layer is wanted; that is not a Plan 06-03 dependency-hygiene concern.

---

## DI-06-03-02 — BLOCKING (Rule 4 architectural): every `npm install` in this plan trips a pre-existing `date-fns@4` / `react-day-picker@8` peer conflict that destructively prunes 31 packages from the lock (Plan 06-03)

**Discovered:** 2026-06-20, during Task 1 bump (a) `@hookform/resolvers@5`, BEFORE any commit.

**What:** Every `npm install <pkg>` in this plan fails or corrupts the lockfile because of a
**pre-existing peer conflict introduced by 06-02's `date-fns` 3→4 bump:**

- The deferred `react-day-picker@8.10.1` (which MUST stay at v8 — DEFER-flipped in 06-01) declares
  peer `date-fns@"^2.28.0 || ^3.0.0"`.
- The root now has `date-fns@4.4.0` (06-02 commit `6199439b`).
- A plain `npm install <pkg>` → **ERESOLVE error** (`Conflicting peer dependency: date-fns@3.6.0`).
  Even a bare `npm install` (no new package) at pristine HEAD `cb864966` ERESOLVE-errors — confirmed.
- `npm install <pkg> --legacy-peer-deps` → succeeds BUT **destructively prunes 31 packages** from
  `package-lock.json` on this Windows host: ALL `@esbuild/*` cross-platform optional binaries
  (incl. `@esbuild/linux-x64` that CI needs), `react-is@18.3.1` (recharts runtime dep),
  `@testing-library/dom@10.4.1` (vitest test infra), and several promptfoo/mongoose sub-deps.
  This lock would **break the Linux regression-gate `npm ci` and the build**. Verified: the
  pruned entries are genuinely depended-upon (`react-is` ← recharts/prop-types; `@testing-library/dom`
  ← @testing-library/react; `esbuild` ← vite/tsx). Unacceptable to commit.

**Why this is a Rule 4 architectural decision (not an auto-fixable Rule 3 blocker):** The clean
fix that produces a complete, portable, zero-prune lock is to add an **`overrides` entry** to
`package.json` so the stale react-day-picker@8 peer is satisfied by the live date-fns@4:

```jsonc
"overrides": {
  "ws": "8.20.1",                          // existing
  "react-day-picker": { "date-fns": "$date-fns" }   // NEW — satisfies the v8 peer with root date-fns@4
}
```

DIAGNOSTIC-VERIFIED (then reset): with this override, a plain `npm install` (NO `--legacy-peer-deps`)
applies the resolvers@5 bump with **0 pruned / 0 added-loss** — all cross-platform optionals +
react-is + @testing-library/dom preserved. It is the correct, non-destructive path.

BUT adding an `overrides` entry is **out of the plan's stated scope** (the plan assumed clean
`npm install <pkg>@major` per bump, staging ONLY the version line in package.json + lock). It:
  1. Adds a NEW `overrides` key — a structural change to dependency resolution, not a version bump.
  2. Touches the **deferred `react-day-picker` boundary** (06-01 explicitly DEFERs react-day-picker
     8→10; the constraint says it MUST stay at its OLD major and not be modified).
  3. Affects ALL 8+ bumps in Tasks 1 & 2 (each needs `npm install`), so it should be ratified ONCE
     up front, not silently baked into every commit.

**Discrepancy with the 06-02 closeout (operator should know):** 06-02's committed lock IS internally
consistent (`npm ci` works) and was CI-validated, yet a *fresh* `npm install` at HEAD now ERESOLVE-errors.
06-02's date-fns lock diff was a clean 4 lines (no prune), so 06-02 did NOT do a full legacy-peer-deps
recompute — it appears 06-02 either edited the lock surgically or ran on a host/npm-state that resolved
the peer silently. On THIS host (npm 11.4.0, Windows), the conflict is now hard-blocking for every install.

**PROPOSED RESOLUTION (operator decision — Rule 4):** Add the
`"react-day-picker": { "date-fns": "$date-fns" }` override to `package.json` ONCE at the start of
Task 1 (its own small `chore(06-03)` commit, or folded into the first resolvers bump commit with a
ledger note), so all subsequent bumps install cleanly with zero lock prune. The override is a
**pure resolution shim** for an ALREADY-shipped (06-02) peer mismatch on a deferred package — it
introduces no runtime change (react-day-picker@8 already runs against date-fns@4 today; the lock just
needs the peer formally satisfied). It does NOT bump react-day-picker (stays v8) and does NOT alter
date-fns (stays v4). Alternatives considered + rejected:
  - `--legacy-peer-deps` per bump → prunes 31 needed packages, breaks Linux CI/build. REJECTED.
  - `--force` per bump → churns the dev tree (Pitfall 3). REJECTED.
  - Revert 06-02's date-fns@4 → out of scope, undoes a completed+operator-smoked plan. REJECTED.

**Action:** PAUSED. No bump committed. Awaiting operator approval of the override shim (or an
alternative direction) before proceeding with Task 1.

**RESOLVED — 2026-06-20 (Option A, operator-approved).** The operator decided **Option A**: add the
`"react-day-picker": { "date-fns": "$date-fns" }` override shim alongside the existing `"ws": "8.20.1"`
pin so npm resolves the deferred react-day-picker@8 `date-fns` peer to the root `date-fns@4`.
react-day-picker stays at **v8** (deferred — NOT bumped); date-fns stays at **v4**. Implemented as its own
`chore(06-03)` commit (Task 0 of the resumed execution).

**Diagnostic-verified clean (0 prune, confirmed at apply time):** with the shim in `package.json`,
a plain `npm install` (NO `--legacy-peer-deps`) reconciled with **zero lock delta** —
`git diff package-lock.json` was EMPTY; lock counts unchanged vs the pristine `8d46c3cb` snapshot
(1423 `node_modules` entries / 26 `@esbuild/*` optionals / `react-is`=1 / `@testing-library/dom`=1;
`@esbuild/linux-x64` still present for Linux CI). A dry-run `npm install @hookform/resolvers@5 --dry-run`
then resolved cleanly to `5.4.0` with **no ERESOLVE** and **no prune** ("changed 1 package") — proving
the shim is the genuine install-unblock for the subsequent Task 1/2 bumps. Deterministic gate GREEN after
the shim: build exit 0 / vitest 457 / deno 699-0-11. Committed as `chore(06-03): pin react-day-picker
date-fns peer via overrides shim`.

---

## DI-06-03-03 — 10 PRE-EXISTING `tsc` type errors in recharts@3 chart consumers (introduced by 06-02's recharts bump, INVISIBLE to verify:baseline) — OUT OF SCOPE for Plan 06-03

**Discovered:** 2026-06-20, during Plan 06-03 Task 1 bump (a) `@hookform/resolvers@5`, when the bump's
`npm run type-check` gate was run.

**What:** `npm run type-check` (`tsc -p tsconfig.app.json --noEmit`) at the **pristine Plan-06-03 HEAD
`8d46c3cb`** (BEFORE any Plan 06-03 bump) is **exit 2 with 10 errors**, ALL in recharts@3 consumers:

- `src/components/ui/chart.tsx` — 8 errors (custom-tooltip `payload`/`label` props no longer on the
  recharts v3 `TooltipProps`-derived type; `Legend` `verticalAlign`/`payload` content-prop constraint
  tightened; `item`/`index` implicit-any in the v3 payload `.map`).
- `src/components/ScoreProgressChart.tsx:87` + `src/components/EliteScoreHistory.tsx:171` — the Tooltip
  `formatter` signature changed in recharts v3 (`Formatter<ValueType, NameType>` now also requires the
  `(value, name, item, index, payload) => …` overload), so the existing `(value: number) => [string, string]`
  formatter no longer type-matches.

**Why this is PRE-EXISTING and OUT OF SCOPE for Plan 06-03:** these 10 errors are a **direct artifact of
06-02's `recharts` ^2.15.4 → ^3.8.1 bump** (recharts v3 reshaped its TS types). They reproduce **identically
at the pristine Plan-06-03 HEAD before any 06-03 dependency change** (verified by stashing the 06-03 work and
re-running `tsc`: 10 errors, byte-identical list). No Plan 06-03 bump caused them. They went unnoticed at
06-02 close because **`verify:baseline` does NOT run `type-check`** (it is `test && test:edge && test:e2e`);
`type-check` is off the gate, so the recharts v3 type drift never surfaced. `vite build` (rolldown/esbuild
transpile, no type-check) is exit 0, and `vitest` 457 / `deno` 699-0-11 are green — the app **runs and renders
correctly** (06-02's operator chart smoke PASSED); this is a **type-surface-only** drift, not a runtime defect.

**Proof resolvers@5 itself is type-clean (zero NEW errors):** with resolvers@5 installed, `tsc` initially
showed **14** errors = the 10 recharts pre-existing + **4 NEW** in the 2 zodResolver dialogs
(`AddApplicationDialog.tsx`, `ReportOutcomeDialog.tsx`) — the resolvers-v5 input/output `Resolver<>` /
`SubmitHandler` signature split (Open Question 3 / threat T-06-09 materializing). Those **4 resolvers-v5
errors were auto-fixed in scope** (Rule 3 — a blocking, bump-caused signature break) by typing `useForm`
with the v5 three-generic form `useForm<z.input<schema>, unknown, z.output<schema>>` (type-only; zero runtime
change). After that fix `tsc` is back to **exactly the 10 pre-existing recharts errors** — i.e. resolvers@5
adds **0 net new** type errors. (IntakeForm.tsx, the 3rd zodResolver consumer, has no `.default()` fields so
its `useForm<IntakeFormType>` stayed clean.)

**Gate adopted for Plan 06-03 (consistent with DI-06-03-01's E2E carve-out):** since pristine HEAD is already
`tsc` exit-2 from this pre-existing recharts drift, each bump's "type-check" gate is read as **NO NEW `tsc`
errors beyond these 10 pre-existing recharts ones** (and build exit 0 + vitest 457 + deno 699-0-11). A bump
that introduces an 11th+ error is a real regression → fix-or-revert.

**Action:** NONE in Plan 06-03 (logged, not fixed — out of scope per the executor SCOPE BOUNDARY: only
auto-fix issues DIRECTLY caused by the current task's changes). **Recommended owner:** a follow-up that
re-vendors the shadcn `ui/chart.tsx` to the recharts v3 tooltip/legend types + adapts the two chart
`formatter` callbacks to the v3 5-arg `Formatter` signature, gated by `tsc` exit 0 + a green `verify:baseline`
+ a chart-render smoke. Could fold into the Phase-6 closeout or a dedicated recharts-v3-types task. (The
recharts@3 ledger row `7c4fca0b` remains `taken` — the runtime smoke passed; this is a type-surface follow-up,
not a recharts revert.)

---

## DI-06-04-01 — @stripe/* minor batch Stripe-checkout E2E proof DEFERRED-to-TEST-env-restoration (Plan 06-04)

**Discovered:** 2026-06-20, during Plan 06-04 Group C (`@stripe/react-stripe-js` 6.2.0→6.6.0,
`@stripe/stripe-js` 9.2.0→9.8.0) — the business-critical payment-path minor batch.

**What:** Normally the `@stripe/*` batch gates on the 3 Stripe-checkout E2E assertions
(`clientSecret` round-trip / `EmbeddedCheckout` iframe mount / `?checkout=complete` reconcile) in
`e2e/stripe-checkout.spec.ts`. That spec is **one of the 2 known pre-existing env-reds** logged in
DI-06-03-01: the shared TEST Supabase project (`cimjltzovkahkqecpwgi`) is currently unavailable/paused,
so the post-checkout reconcile (`getByText(/upgrade processing/i)`) cannot become visible and the upstream
`create-checkout-session` / live Stripe flow cannot be exercised. A local manual smoke would hit the SAME
paused TEST project and the SAME env wall — there is no in-repo, machine-independent way to prove the live
Stripe-checkout round-trip while the TEST env is down.

**Why DEFERRED (not a green-E2E claim):** the @stripe/* bump was still **taken** as its own isolated
grouped commit, gated on the DETERMINISTIC layers (build exit 0 / vitest 457 / deno 699-0-11) — all green.
But per the degraded-E2E gate (operator-approved), this plan does NOT claim the Stripe-checkout E2E passed.
The end-of-wave full Playwright run confirms the @stripe bump introduced **no NEW red** (the stripe-checkout
spec stays exactly its pre-existing env-red, no 3rd/regression red). The live clientSecret/iframe/reconcile
proof is **deferred to TEST-env restoration**.

**Clearance criterion:** when the operator re-provisions / un-pauses the shared TEST Supabase project (and
its Stripe TEST-mode secrets / APP_URL CORS), re-run `npm run test:e2e` and confirm `e2e/stripe-checkout.spec.ts`
goes GREEN on the @stripe@6.6.0/9.8.0 lock — closing the deferred payment-path E2E proof for this batch.

**Action:** NONE in Plan 06-04 beyond recording this defer (the @stripe ledger row notes
"Stripe E2E = env-deferred (DI-06-04-01)" instead of a green-E2E claim). The @stripe commit is an independent
`git revert` unit if the deterministic gate or the end-of-wave Playwright ever surfaces a regression.

---

## DI-06-05-01 — `ws@^8.21.0` LIVE realtime websocket smoke env-deferred to TEST-project restoration; accepted via polling-backstop rationale (Plan 06-05)

**Discovered:** 2026-06-20, at Plan 06-05 Task 3 (the `checkpoint:human-verify` realtime smoke after the
`ws` override `8.20.1 → ^8.21.0` bump — commit `3b887498`).

**What:** The `ws` override bump touches the production `@supabase/realtime-js` websocket, so Task 3 calls for a
LIVE realtime-path smoke (exercise a Supabase realtime/live-update feature, confirm it still connects + updates).
That live smoke is **env-deferred**: the shared TEST Supabase project (`cimjltzovkahkqecpwgi`) is currently
**paused** — the SAME paused-TEST-project root cause that makes the env-red E2E items **DI-06-03-01**
(`resume-analysis.spec.ts:25` upload-timeout + `stripe-checkout.spec.ts:56` reconcile) and **DI-06-04-01**
(@stripe Stripe-checkout E2E) un-runnable. There is no in-repo, machine-independent way to exercise the live
Supabase realtime socket while the TEST env is down (a local `npm run dev` smoke would hit the same paused project).

**Operator decision (2026-06-20) — ACCEPT the polling-backstop:** rather than block the phase on a paused
external env, the operator **ACCEPTED** the `ws` override as **low-risk on the realtime axis**. Rationale:

1. The app uses **exactly ONE** realtime channel — `src/pages/Results.tsx:409`
   `.channel('resume-updates-${id}').on('postgres_changes', UPDATE on `resumes`).subscribe()` (it detects
   resume-analysis completion). That consumer is **polling-backstopped**: a one-time fetch on mount + a
   `get-analysis-job-status` poll + a **5s fallback DB poll**. So even a realtime-socket failure degrades to
   polling — it does NOT break the results flow.
2. `ws` `8.20.1 → 8.21.0` is a **stable in-8.x security patch** (a single minor, no `ws` public-API change),
   not a major/behavioral move.
3. The deterministic gate was green (build exit 0 / vitest 457 / deno 699-0-11) and the full Playwright run after
   the bump introduced **no new red** (4 pass / 1 skip / 1 env-red = only the documented stripe `:56`; auth-session
   GREEN).

**Why DEFERRED (not a green-realtime claim):** the `ws` bump was still **taken** (`3b887498`) as its own atomic
`git revert` unit, gated on the deterministic layers. But this plan does NOT claim a LIVE realtime websocket smoke
passed — it claims the realtime axis is **accepted as low-risk** via the polling-backstop, with the live check
**deferred to TEST-env restoration**.

**Clearance criterion:** when the operator un-pauses / re-provisions the shared TEST Supabase project (and its
APP_URL/CORS + AI_TEST_MODE), run the Task-3 realtime smoke against it (or a deployed staging build) — exercise the
`Results.tsx` resume-completion realtime path and confirm the `resume-updates` channel connects + receives the
`postgres_changes` UPDATE with no websocket/console error on `ws@^8.21.0`. This closes the deferred live-realtime
proof. (Same TEST-env-restoration event that clears DI-06-03-01 / DI-06-04-01.) On a future FAIL, the one-line
override is `git revert 3b887498` and the ws/engine.io HIGHs move to the accepted-risk residue.

**Action:** NONE beyond recording this defer + flipping the `06-DEP-CHANGES.md` ws smoke note from PENDING to
"operator ACCEPT 2026-06-20 (polling-backstop)". Cross-references the env-red E2E items **DI-06-03-01** and
**DI-06-04-01** as the same paused-TEST-project root cause.
