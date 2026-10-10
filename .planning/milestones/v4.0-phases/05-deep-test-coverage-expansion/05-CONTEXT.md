# Phase 5: Deep Test Coverage Expansion - Context

**Gathered:** 2026-06-14
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase **deepens test coverage of the existing (post-Phase-4-cleanup) system** so the upcoming risky phases (6 deps, 8 DB, 9 perf) have real coverage of the surfaces they touch. It delivers three requirements (TEST-03, TEST-05, TEST-08) plus ROADMAP success-criterion #3 (adversarial extension):

1. **TEST-03** — Deno edge-function tests cover shared utilities, auth, usage/merit logic, and per-feature analyze handlers **including failure and error paths**.
2. **TEST-05** — Tests cover edge cases, failure states, permissions/tier-gating, and environment-specific behavior.
3. **Success-criterion #3** — Adversarial / prompt-injection coverage (promptfoo) is **extended** across the active AI features (TEST-07 was *retained* in Phase 1; Phase 5 *extends* it).
4. **TEST-08** — A documented command set runs the full suite repeatably locally + in CI and is wired into deploy gating where feasible.

**Governing constraint (unchanged): zero functional change.** This is a test-*writing* phase, not a fix phase. New tests assert *current* behavior — they characterize and lock the regression net; they do **not** change product behavior. The Phase 1 `verify:baseline` gate stays green throughout.

**NOT in this phase:** frontend vitest expansion (that was Phase 1 TEST-02 — already shipped); env-var consolidation/removal + canonical `.env.example` (Phase 7 — Phase 5 only *tests* current env-dependent behavior, it does not change config); dependency bumps (Phase 6); DB removals / RLS changes (Phase 8); performance refactors + before/after latency measurement (Phase 9). Adding any new product capability is out of scope (brownfield hardening milestone).

</domain>

<decisions>
## Implementation Decisions

### Coverage breadth, priority & test depth (TEST-03)

* **D-01: Risk-prioritized, not exhaustive.** Cover **business-critical flows (Resume Analysis, Career Compass) + the exact surfaces Phases 6/8/9 will touch + the merit/auth/tier core FIRST**, lower-risk tail as time allows. This matches the ROADMAP goal verbatim ("so the upcoming risky dependency and database changes have real coverage of the surfaces they touch"). Chosen over exhaustive-all-40 (would force low-value tests on rarely-changing utilities and balloon the phase) and over live-features-only (would leave workers/senders ungated where Phase 6/8 may touch them).
* **D-02: Handler-level depth via the AI\_TEST\_MODE seam.** For the priority analyze functions, construct **real** **`Request`s against the handler with Anthropic stubbed** (the Phase 1 `AI_TEST_MODE` seam in `_shared/anthropic.ts`, D-02 of Phase 1) and assert the full wiring: **auth-reject, merit deduct/refund, tier-gating, parse/merge, persistence shape, AND error/failure branches** (bad input, AI failure, 402/429/timeout). This directly satisfies TEST-03's "failure and error paths" — a step up from the existing pure-utility deno style, which stays valid for isolated logic. (The deeper handler tests are the new work.)
* **D-03: Must-cover set (this phase) = the priority CORE + the full opt-in list.** The CORE (always in): business-critical resume/career analyze + merit/auth/tier + the DB-facing logic Phase 8 touches. PLUS **all four** opt-in groups the operator selected:
  * **Other live AI features** — `grade-linkedin`, `recruiting-lens`, `analyze-skills-gap`, `compare-jobs`, `chat-agent` (handler-level).
  * **Async job workers** — `submit-resume-analysis-job`, `process-resume-analysis-job`, `submit-career-analysis-job`, `process-career-analysis-job`, `get-analysis-job-status` (the queue path mirroring streaming; Phase 9 may touch).
  * **Shared extraction/merge utils** — `document-extraction`, `ocr-pdf`, `result-merger`, `recruiting-lens-merger`, `prompt-sanitizer` (the parse/merge seams the business-critical flows depend on; Phase 9 may refactor).
  * **Gated-off Interview Prep handlers** — `interview-prep-analyze` / `interview-prep-evaluate` (operator explicitly opted these in despite being gated OFF production; revived in a future milestone).
  * **Deferred tail (time-permitting, NOT must-cover):** email/notify senders (`send-*`, `notify-*`), admin functions (`admin-delete-user`; `admin-merit-metrics` is already covered), `keep-warm`, `test-email`, legacy `paddle-webhook` (gated), `lifecycle-archive-writer`, `extract-analysis-structure`.
* **D-03a: LOCKED INVARIANT — every new deno test MUST be added to the** **`supabase/functions/deno.json`** **`test:ci`** **offline allowlist.** The gate runs an *explicit allowlist*, never `deno test ./` recursion (Phase 1 determinism rule). A new test file that is written but not added to `test:ci` **never runs on the gate** — a silent footgun. Each new offline-safe test must be appended to the allowlist in the same change; live-Supabase tests stay behind `DENO_TEST_SUPABASE_REMOTE=1` and off the offline gate.

### Adversarial coverage (success-criterion #3 — TEST-07 extension)

* **D-04: Real-AI promptfoo extends to the high-risk user-text ingesters only.** Add promptfoo injection suites for the four live features that ingest raw user/JD/resume text into the prompt: **`analyze-resume`,** **`analyze-career`,** **`grade-linkedin`,** **`recruiting-lens`.** That is where injection risk actually lives. Chosen over all-live-AI (`analyze-skills-gap`/`compare-jobs`/`chat-agent` add per-run cost + fixtures for lower marginal risk) and over keep-current-only (would leave live production AI without adversarial coverage). promptfoo calls **real Anthropic** and therefore stays **OFF the per-PR gate** — scheduled/label only (Phase 1 D-09, unchanged).
* **D-05: Two-layer adversarial structure.** (a) **Deterministic, \$0, ON** **`verify:baseline`:** deepen the existing `_shared/prompt-sanitizer.test.ts` with an injection corpus → assert our defense strips the high-confidence phrases; this scales cheaply across features and runs on every gate. (b) **Real-AI, costed, OFF the gate:** extend the promptfoo end-to-end suites (per D-04) asserting no system-prompt leak, no tier/variant escalation, valid-JSON-no-fail-open. Broad cheap coverage on the gate + deep real-AI spot checks on schedule. `prompt-sanitizer.ts` is already wired into `grade-linkedin`/`recruiting-lens`/`interview-prep-analyze`/`anthropic.ts`/`merit-gateway`/`tier-prompts`, so the deterministic layer has a real seam to assert against.

### CI / deploy-gating (TEST-08)

* **D-06: Gate the deploy scripts.** Wire `verify:baseline` as a **hard precondition** into `scripts/deploy-staging.ps1` / `scripts/deploy-production.ps1` (and/or the deploy CI) so a **red suite blocks an actual deploy**, not just a PR merge. This is the real teeth TEST-08's "deploy gating where feasible" asks for. Also (re)document the operator branch-protection enablement (the required-status-check step from TESTING-STRATEGY.md) so the PR gate from Phase 1 actually blocks. Chosen over extend-PR-gate-only (leaves "deploy gating" aspirational).
* **D-07: One gate, grow it — single source of truth.** `verify:baseline` stays **THE** single gate (vitest + deno-offline + Playwright). Every new deep test is added to the deno `test:ci` allowlist (per D-03a) so it runs automatically — the gate grows in place, no second umbrella command. promptfoo stays a separate scheduled/label command (never folded into `verify:baseline`). The deploy gate (D-06) runs `verify:baseline`. The full command reference is documented/updated in `TESTING-STRATEGY.md` (and per NFR-03, reconciled in Phase 7). Chosen over a two-tier `verify:full` (more commands to maintain; the operator wanted one source of truth).

### Behavior-pinning under zero-functional-change (TEST-05 / NFR-01)

* **D-08: Pin-and-log by default; escalate critical.** When a new test of an existing handler reveals current behavior *looks like* a latent bug: **DEFAULT** = write a **characterization test asserting CURRENT behavior** (gate stays green, zero functional change) AND log it to a **"suspected-behavior" register** (file + handler + suspected issue + what would confirm it) for a future `/gsd-debug` pass. **ESCALATE** to a deviation/checkpoint for operator decision **only** if the suspected bug touches a **business-critical flow** (resume / career / merit / auth / billing) **or a security boundary**. This blends momentum (a coverage phase will hit many minor surprises) with safety (real critical bugs get raised, not silently catalogued). Consistent with Phase 4 D-11's "never silently change behavior, never paper over with a suppression" — escalation, when triggered, follows that pattern.

### Claude's Discretion

* **Coverage reporting (operator declined to deep-dive):** global line/branch coverage stays **ADVISORY** per Phase 1 D-05 — **no hard numeric threshold**. The planner MAY wire a cheap visible coverage-report artifact (`vitest --coverage` / `deno coverage`) if low-cost, to make erosion visible, but it is **not required** and must not become a blocking gate.
* **Env-specific depth / Phase 5↔7 boundary (operator declined to deep-dive):** Phase 5 **TESTS** current environment-dependent behavior as characterization — CORS allow-list (`APP_URL` fail-closed), required-secret fail-closed validation (`ANTHROPIC_API_KEY` etc.), and the `AI_TEST_MODE` branch — i.e. asserts what the code does today. Phase 7 owns **CHANGING/consolidating** env config and producing the canonical `.env.example`. No double-coverage: Phase 5 = tests of current behavior; Phase 7 = config edits (re-run the same tests as its gate).
* Plan/commit slicing (e.g. one plan per domain: business-critical analyze / other live AI / workers / shared utils / adversarial / CI-deploy-gating), the AI\_TEST\_MODE fixture-recording/extension mechanism, exact deno test-file layout, and the suspected-behavior register format are left to research + planning, consistent with the decisions above.

</decisions>

\<canonical\_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements (locked)

* `.planning/ROADMAP.md` §"Phase 5: Deep Test Coverage Expansion" — goal, depends-on (Phase 1, Phase 4), the 4 success criteria (note SC#3 = adversarial extension).
* `.planning/REQUIREMENTS.md` §"Production-Ready Testing Model (TEST)" — TEST-03, TEST-05, TEST-08 (this phase) + TEST-07 (retained Phase 1, extended here) + the governing zero-functional-change constraint; §"Cross-Cutting Guardrails" NFR-01.
* `.planning/PROJECT.md` §"Current Milestone: v4.0" — hard constraint (zero functional change), risk appetite, brownfield-no-new-features.

### The testing net this phase extends (PRIMARY — read first)

* `TESTING-STRATEGY.md` (repo root) — the authoritative layered model: the 4 layers, `verify:baseline` composition, D-05 coverage philosophy (critical-path-REQUIRED / global-ADVISORY), the 8 validation checkpoints, promptfoo-off-the-gate rationale, the quarantine register, the secrets list (incl. `AI_TEST_MODE`), and the branch-protection enablement steps. **Update this doc as the command set grows (D-07).**
* `supabase/functions/deno.json` — the `test:ci` **offline allowlist** (single source of truth; currently 34 files). Every new offline deno test is appended here (D-03a).
* `.planning/phases/01-testing-strategy-regression-baseline/01-CONTEXT.md` — the locked upstream decisions Phase 5 inherits: D-02 (AI stubbed at boundary), D-05 (coverage philosophy), D-06 (blocking gate), D-07 (quarantine), D-09 (per-PR gate composition + promptfoo off-gate). **Do not re-litigate these.**
* `.planning/phases/01-testing-strategy-regression-baseline/deferred-items.md` — the 7 pre-existing deterministic failures tracked at Phase 1 (deterministic content/source drift, NOT flakiness); cross-check before treating any red as new.

### Source seams the new tests target (verify at HEAD before acting)

* `supabase/functions/_shared/anthropic.ts` — the `AI_TEST_MODE` stub seam (D-02 handler-level tests build on this).
* `supabase/functions/_shared/prompt-sanitizer.ts` (+ `prompt-sanitizer.test.ts`) — the deterministic adversarial layer (D-05); consumers: `grade-linkedin`, `recruiting-lens`, `interview-prep-analyze`, `anthropic.ts`, `merit-gateway`, `tier-prompts`.
* `supabase/functions/interview-prep-analyze/__tests__/fixtures/injection/promptfooconfig.yaml` + `fixtures.yaml` — the existing promptfoo pattern to replicate for the four high-risk features (D-04).
* The priority handlers (D-03): `analyze-resume`, `analyze-career`, `grade-linkedin`, `recruiting-lens`, `analyze-skills-gap`, `compare-jobs`, `chat-agent`, the `submit-*`/`process-*-job` + `get-analysis-job-status` workers, `interview-prep-analyze`/`-evaluate`; shared utils `document-extraction`, `ocr-pdf`, `result-merger`, `recruiting-lens-merger`.

### CI / deploy gating (TEST-08)

* `.github/workflows/regression-gate.yml` — the Phase 1 PR gate (runs `verify:baseline` on PRs to `main`/`staging`); extend, don't replace.
* `scripts/deploy-staging.ps1`, `scripts/deploy-production.ps1` — the deploy scripts to gate on `verify:baseline` (D-06).
* `scripts/run-edge-tests.ps1` — the existing local deno runner (PowerShell); note CI runners are Linux (cross-platform `deno test` invocation already handled via `npm run test:edge`).

### Repo conventions & policy

* `CONTRIBUTING.md` (repo root) — commit-message + branch conventions.
* `CLAUDE.md` — git rules (never `git add -f`/`-A`; `.planning/` IS tracked — stage specific paths), reliability priorities (Resume Analysis / Career Compass business-critical → extra care).

**No external ADRs/specs govern this phase** — the binding inputs are `TESTING-STRATEGY.md` + the scope docs + the Phase 1 context above; all implementation decisions are captured in `<decisions>`.

\</canonical\_refs>

\<code\_context>

## Existing Code Insights

### Reusable Assets

* **`verify:baseline`** (vitest + offline deno + Playwright) — the gate Phase 5 grows in place (D-07). Last green at Phase 4 close (457/457 frontend; deno 284/0 offline; Playwright 5+1skip).
* **`AI_TEST_MODE`** **seam** in `_shared/anthropic.ts` — returns deterministic recorded fixtures instead of calling Anthropic; the foundation for D-02 handler-level tests with \$0/deterministic AI.
* **\~104 existing deno test files** (34 on the offline gate) — the new handler/edge-case tests extend this corpus; reuse the console-capture + direct `new Request()` construction pattern.
* **`prompt-sanitizer.test.ts`** — the deterministic adversarial unit seam to deepen (D-05).
* **promptfoo config** at `interview-prep-analyze/__tests__/fixtures/injection/` — the replicable pattern for the four high-risk features (D-04).

### Established Patterns

* **Deno offline allowlist, never recursion** — new tests MUST be registered in `deno.json` `test:ci` or they don't run on the gate (D-03a).
* **AI stubbed at the boundary; real Supabase TEST project + real Stripe test mode** for E2E (Phase 1 D-02/D-04) — only Anthropic is stubbed.
* **Fallible ops use discriminated unions** (`{ ok: true … } | { ok: false; error }`); `requireAuth`/`requireInternalOrUserAuth` guards every endpoint — handler tests assert these contracts (auth-reject branch).
* **Pin current behavior, escalate critical** (D-08) mirrors Phase 4 D-11's surface-don't-silently-change discipline.

### Integration Points

* **Deploy scripts** (`deploy-staging.ps1`/`deploy-production.ps1`) gain a `verify:baseline` precondition (D-06) — the new wiring point.
* **`regression-gate.yml`** — extend with the grown suite (and a scheduled/label promptfoo lane), keeping `verify:baseline` as the single gate command (D-07).
* **Live-Supabase deno suites** stay behind `DENO_TEST_SUPABASE_REMOTE=1`, off the offline gate (not added in Phase 5 — operator chose deploy-script gating over a live-Supabase CI lane).

\</code\_context>

<specifics>
## Specific Ideas

* The operator opted EVERYTHING into the must-cover set including the gated-off Interview Prep handlers — Phase 5 is intentionally broad coverage, ordered risk-first. The only explicit deferral is the low-risk tail (email/notify/admin/keep-warm/legacy-paddle/lifecycle-archive).
* Two-layer adversarial is deliberate: the deterministic sanitizer layer is the *gate* signal (cheap, every PR), promptfoo is the *spot-check* signal (real AI, scheduled) — never conflate them.
* "Deploy gating with teeth" means the deploy scripts themselves abort on a red `verify:baseline`, not merely a PR status check.
* The "suspected-behavior register" (D-08) is the Phase 5 analogue of Phase 3/4's evidence catalogs — a clean handoff so a future debug pass inherits the findings without re-discovery.

</specifics>

<deferred>
## Deferred Ideas

* **Frontend vitest expansion** — was Phase 1 (TEST-02), already shipped; not re-opened here.
* **Adversarial coverage for** **`analyze-skills-gap`** **/** **`compare-jobs`** **/** **`chat-agent`** — deferred from the promptfoo extension (D-04 covers the four high-risk text ingesters); the deterministic sanitizer layer (D-05a) still covers them cheaply on the gate. Real-AI promptfoo for these is a future scheduled add.
* **Low-risk tail handler tests** — email/notify senders, admin functions, `keep-warm`, `test-email`, legacy `paddle-webhook`, `lifecycle-archive-writer`, `extract-analysis-structure` — time-permitting this phase, otherwise a future pass.
* **Live-Supabase CI lane** (running the `DENO_TEST_SUPABASE_REMOTE=1` suites in CI) — considered and deferred; operator chose deploy-script gating over the extra CI lane.
* **Env-var consolidation + canonical** **`.env.example`** — Phase 7 (ENV-02..05); Phase 5 only *tests* current env-dependent behavior.
* **Hard numeric coverage threshold** — explicitly NOT adopted (global coverage stays advisory per Phase 1 D-05).
* **Fixing latent bugs surfaced by new tests** — Phase 5 pins-and-logs (or escalates if critical, D-08); the actual bugfix is a `/gsd-debug` / future-pass concern, not a silent behavior change here.

None of the above is scope creep — discussion stayed within Phase 5's test-coverage-expansion boundary.

</deferred>

***

*Phase: 5-deep-test-coverage-expansion*
*Context gathered: 2026-06-14*
