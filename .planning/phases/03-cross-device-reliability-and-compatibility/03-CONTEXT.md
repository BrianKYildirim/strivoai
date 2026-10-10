# Phase 3: Cross-Device Reliability and Compatibility - Context

**Gathered:** 2026-07-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Make every user-facing surface work from the first click across supported browsers, devices,
screen sizes and normal network conditions — by finding and fixing each device-specific root
cause, guaranteeing one-click/one-job/one-charge integrity with automatic recovery, building a
production-equivalent automated browser/device test suite wired into `verify:baseline`, and
adding privacy-safe client diagnostics that never log user documents.

**Audit surfaces (11):** Resume Analysis · LinkedIn Grader · Career Compass · Recruiting Lens ·
onboarding · dashboard · authentication · uploads and PDF extraction · Stripe checkout · Free
and Elite flows · admin isolation.

**Requirement IDs:** XDEV-01..09, XRUN-01..06, XTEST-01..04, XLOG-01..02 (21 total). Full text
in `03-BRIEF.md` and the ROADMAP Phase 3 section.

**Explicitly NOT in this phase:** new product features, new AI capabilities, cloud device-farm
infrastructure, and any change to Phase 01 / 01.1 / 02 artifacts or in-flight files.

</domain>

<decisions>
## Implementation Decisions

### Device coverage & test matrix (XTEST-01, XTEST-04)

- **D-01:** Playwright runs **5 projects** — `chromium`, `firefox`, `webkit`, plus emulated
  iPhone (WebKit) and Pixel (Chromium). Today `playwright.config.ts` and
  `playwright.prod.config.ts` are **chromium-only**; this is the core XTEST-01 gap.
- **D-02:** A **tagged cross-device subset** runs on all 5 projects; the full functional suite
  stays chromium-only. Rationale: `verify:baseline` is already a seven-layer gate, and a ~5x
  e2e blow-up drives people to `-SkipVerify`, which defeats the gate entirely.
- **D-03:** **Do not automate previous-major (N-1) browsers.** Pinning a second Playwright
  version is brittle and drifts from real-world N-1. Instead the support floor is a concrete
  feature set enforced by feature detection (D-06), with N-1 spot-checked in the manual pass.
- **D-04:** Real-device coverage is a **manual scripted pass** on the operator's Mac + Windows.
  A cloud device farm is **not** adopted now — revisit only if the audit proves gaps that
  emulation structurally could not have caught.
- **D-05:** The final matrix may list a browser as **supported** only with an engine pass **and**
  one real-device spot-check for that browser family. Anything with only one of the two is
  listed **"partially verified"**, never "supported". WebKit-the-engine is not Safari-the-browser
  and the report must say so plainly.

### Supported-browser policy & gate placement (XDEV-01)

- **D-06:** The support floor is enforced by **feature detection against a required-API set**,
  not UA version parsing. A human-readable version list is published as *guidance only*.
  Rationale is evidential, not theoretical: the `Map.prototype.getOrInsertComputed` bug fixed
  on 2026-07-26 shipped in browsers that were otherwise *current* — a version check would not
  have caught it.
- **D-07:** Failure behavior is **tiered** — marketing pages and authentication remain
  accessible; AI flows and Stripe checkout are blocked with a controlled explanation rather
  than being allowed to fail mid-flow. Protects the money paths and the Merit ledger without
  turning a marginal browser into a total wall.
- **D-08:** The gate exists in **both** places: an ES5-safe, dependency-free inline guard in
  `index.html` that runs before the module bundle (this is the only thing that can catch the
  current white-screen-on-parse-failure case), plus a styled in-app check using design tokens
  for the detailed capability test and copy.
- **D-09:** When the audit finds a missing browser API, the default is to **polyfill when safely
  polyfillable**, extending the guarded pattern already proven in
  `src/lib/polyfills/map-get-or-insert.ts` (defers to native when present, installed across all
  realms). Block only where honest emulation is impossible.

### Privacy-safe diagnostics (XLOG-01, XLOG-02)

- **D-10:** Generalize `src/lib/analysis-error-log.ts` — today resume-analysis-only — into a
  **shared client-diagnostics seam adopted across all 11 audit surfaces**. Partial coverage
  guarantees the next unknown-device failure lands somewhere unlogged.
- **D-11:** **Persist to Postgres via a fire-and-forget edge function.** The operative question
  ("which browser/OS combinations fail at which lifecycle stage") cannot be answered against
  console logs. A diagnostics failure must never fail a user flow — same posture as TOK-01.
- **D-12:** Use a **separate table from `ai_call_telemetry`**. That table is Phase 02's,
  server-side, per-Anthropic-call, service-role-only, and **actively in flight under separate
  ownership**. Client device diagnostics is a different actor, lifecycle and retention. This
  decision exists partly to guarantee zero edits to the cofounder's migration and files.
- **D-13:** Record **failures only**, each carrying browser, OS, device type, app version,
  lifecycle stage and sanitized error category. Volume then scales with breakage, not traffic.
  No user documents, resume/LinkedIn content or PII — enforced by a guard test (XLOG-02).

### One-click integrity (XRUN-01, XRUN-02)

- **D-14:** **Audit the 5 AI features first**; extract a shared submit-guard primitive **only
  where 2+ features need the same fix.** Keeps blast radius proportionate to evidence on paths
  that charge real money.
- **D-15:** Enforce at **both layers** — a client submit-lock (stops the duplicate request being
  made, keeps the UI honest on slow devices) and a server idempotency key (the only guarantee
  that survives a second tab, refresh, or restored session).
- **D-16:** **Reuse the existing v5.0 `deriveIdempotencyKey` / stable `inputIdentity` pattern.**
  Do not invent a new keying concept. Duplicate clicks must collapse while a deliberate Elite
  re-run — which users pay for, and which `e2e/elite-rerun-merit.spec.ts` already guards — must
  still create a new attempt.
- **D-17:** Prove it by **extending `e2e/two-tab-concurrency.spec.ts` and
  `e2e/elite-rerun-merit.spec.ts`** with rapid-click cases and running them on the cross-device
  subset. Both specs already target this behavior; reuse their fixtures rather than adding new ones.

### Stale bundles & redeploy recovery (XDEV-07)

- **D-18:** Implement **both** a build-ID stamp and a chunk-load-failure catch. The stamp is
  needed anyway to satisfy XLOG-01's *app version* field, so active version detection is nearly
  free once it exists. The catch covers the user already mid-session at deploy time; the stamp
  covers the long-idle tab.
- **D-19:** On detection, perform a **silent single auto-reload**, guarded against loops via
  `sessionStorage`, preserving the current route and any active run id so XRUN-03 recovery
  restores in-flight work.

### Timeouts & wait experience (XRUN-05, XRUN-03)

- **D-20:** **A client-side timeout may never declare failure.** Only the server's terminal
  lifecycle state can. On timeout the client degrades to polling `get-analysis-run-status` until
  the run reaches a stop state. This is the only option that structurally satisfies "slow devices
  and networks must not show false failures", and `useAnalysisRun` already has the machinery.
- **D-21:** During extended waits, surface the **honest lifecycle stage** (extracting,
  generating, saving) from the existing 11-state lifecycle. No fabricated progress bars, no
  estimated-time-remaining.

### Audit method & triage (XDEV-02)

- **D-22:** **Matrix-first discovery** — stand up the 5-project suite early and let real failures
  drive discovery, then run a targeted static sweep for the categories tests cannot reach
  (device memory limits, extension injection, stale bundles). The suite is needed regardless, so
  this front-loads the asset that keeps paying off, and every finding arrives with a reproduction.
- **D-23:** **Only reproduced issues are fixed in this phase**, and each fix gets a regression
  test (XTEST-03). Unreproduced findings go to a residual register with severity — nothing is
  lost, scope stays bounded and honest. Mirrors how v5.0 handled its 17-domain security audit.

### Verification & rollout

- **D-24:** "Production-equivalent verification" means: **Preview verifies everything except real
  AI output.** The device matrix, browser gates, polyfills, stale-bundle recovery, idempotency
  and diagnostics are all fully verifiable there — none depend on real Anthropic output. Only
  genuinely AI-dependent checks need a scripted operator pass on production, and planning must
  **schedule that pass explicitly** rather than assume it.
- **D-25:** **Staged rollout by ascending blast radius** — (1) diagnostics + test matrix (no
  user-visible change; diagnostics immediately start producing the data that validates
  everything after), (2) browser gate + polyfills, (3) one-click and timeout behavior changes on
  the money paths last. This is the pattern v5.0 used successfully across its feature migrations.

### Naming

- **D-26:** This phase's behavioral requirement IDs use the **`XRUN-*`** prefix, not `RUN-*`.
  v4.0 already shipped `RUN-01..07` (runtime-reliability error taxonomy) and `STATE.md`
  references `RUN-03` in that sense. `XRUN-*` avoids a live traceability collision.

### Post-research amendments (added 2026-07-27 after `03-RESEARCH.md`)

These three resolve blocking/high-leverage findings the research surfaced. They amend the
decisions above and take precedence where they conflict.

- **D-27 (resolves RESEARCH Open Question 1 — was BLOCKING):** `VITE_FEATURE_ANALYSIS_LIFECYCLE`
  is OFF, so `useAnalysisRun` early-returns an inert snapshot in every environment and the
  11-state ledger is unreachable. **Do NOT flip the lifecycle flag in this phase.** XRUN-03/04/05
  target the **live** path — `Results.tsx` (`resumes` realtime + `get-analysis-job-status`) and
  `useResumeStream`. Concretely: add the missing `.subscribe()` status callback at **both** sites
  (`useAnalysisRun.ts:339` and `Results.tsx:478` are currently bare, so `CHANNEL_ERROR` /
  `TIMED_OUT` / `CLOSED` are never observed), add the absent `online` / `offline` /
  `visibilitychange` seam, and build UI-SPEC Surface D's stage mapping to consume **either**
  source — driven live by `useResumeStream`'s already-honest `STAGE_LABELS`, with the 11-state
  map wired but dormant. Flipping the flag is a Merit-ledger activation that Preview
  structurally cannot validate (`MERIT_SYSTEM_ENABLED=false` there); record it as an explicit
  follow-up with its own risk assessment. **This supersedes any reading of D-16/D-20 or UI-SPEC
  Surface D that assumes the 11-state ledger is live.**
- **D-28 (amends D-04 / D-05):** Playwright 1.61 registers real `msedge` / `chrome` chromium
  channels, so **genuine Edge is automatable** on the operator's Windows host — neither D-04 nor
  D-05 assumed this. Add an `msedge` channel project, gated so it skips gracefully where Edge is
  not installed (e.g. the macOS dev machine). Edge therefore moves **out of** XTEST-04's
  manual-only set, shrinking the manual surface and strengthening the published matrix.
- **D-29 (resolves D-14 in the affirmative, ahead of the audit):** D-14's own threshold ("extract
  only where 2+ features need the same fix") is **already met at HEAD**: `useIdempotencyKey`
  exists but is imported by **no page**, while four money-path pages (`Upload.tsx:281`,
  `Onboarding.tsx:86`, LinkedIn Grader, Recruiting Lens) call `crypto.randomUUID()` inline.
  Extract the shared submit-guard primitive. This also fixes the unguarded `crypto.randomUUID()`
  (secure-context + Safari ≥15.4 dependency, invisible to the E2E gate because `localhost` is a
  secure context) in one place instead of four, and gives Elite re-run semantics a single
  definition.

### Claude's Discretion

The following are deliberately left to research and planning, within the decisions above:
- The exact required-API set for feature detection, and the concrete published version list.
- Diagnostics table name, column set, RLS posture and retention policy.
- The tag/grep mechanism used to define the cross-device subset, and which specs carry the tag.
- File layout for the generalized diagnostics seam and the browser-support module.
- All user-facing copy wording (subject to XRUN-06: never raw JS/DB/provider/stack text).
- Whether the shared submit-guard primitive is warranted (D-14 makes this evidence-driven).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope (authoritative)
- `.planning/phases/03-cross-device-reliability-and-compatibility/03-BRIEF.md` — the full
  operator-supplied brief: audit surfaces, test matrix, root-cause categories, required
  behaviours, completion-report contract, and 5 known constraints.
- `.planning/ROADMAP.md` § "Phase 3: Cross-Device Reliability and Compatibility" — goal,
  21 requirement IDs, cross-cutting constraints, v5.1 concurrency note.

### Prior art — the exact bug class this phase generalizes
- `.planning/quick/260726-fix-pdfjs-getorinsertcomputed/SUMMARY.md` — **required reading.**
  A proven, root-caused production instance of this phase's problem
  (`Map.prototype.getOrInsertComputed` absent in stable browsers). Establishes the polyfill
  pattern, the error-boundary pattern, and the leak-free-copy chokepoint.
- `src/lib/polyfills/map-get-or-insert.ts` + `map-get-or-insert.test.ts` — the guarded polyfill
  pattern D-09 extends (defers to native, installed in every realm).
- `src/lib/pdf-worker.ts`, `src/lib/pdfjs.worker.ts`, `src/lib/pdf-extractor.worker.ts` — the
  multi-realm worker install pattern; relevant to XDEV-03 and XDEV-06.

### Diagnostics seam (XLOG)
- `src/lib/analysis-error-log.ts` — the module D-10 generalizes. Already implements browser +
  version detection, script-origin classification (first-party / browser-extension /
  third-party), lifecycle stage, and an explicit no-PII posture.
- `src/components/AnalysisErrorBoundary.tsx` — controlled message, extension-origin isolation,
  auto-recover-once. Relevant to XDEV-08 and XRUN-06.

### Lifecycle, idempotency & recovery (XRUN)
- `src/hooks/useAnalysisRun.ts` — **already implements subscribe-first + poll-fallback (D-05
  in that file's own numbering)**, with consecutive-empty-streak handling and terminal-state
  stop. XRUN-04 is largely already built; the work is verifying coverage, not creating it.
- `src/hooks/useIdempotencyKey.ts` — existing client-side key derivation.
- `e2e/two-tab-concurrency.spec.ts`, `e2e/elite-rerun-merit.spec.ts` — the specs D-17 extends.

### Test infrastructure (XTEST)
- `playwright.config.ts` — currently `chromium` only; D-01 adds 4 projects here.
- `playwright.prod.config.ts` — currently `prod-smoke` on Desktop Chrome only.
- `TESTING-STRATEGY.md` — the layered model, the blocking `verify:baseline` gate, coverage
  philosophy, and the quarantine register convention.
- `package.json` § `verify:baseline` — the seven-layer gate the matrix must be wired into.

### Environment & deployment
- `docs/ENVIRONMENT.md` — authoritative per-name env matrix and which surface sets each.
- `scripts/deploy.ps1` — runs `verify:baseline` as a hard precondition before `supabase link`.

### Known-stale — do NOT trust
- `.planning/codebase/TESTING.md` (generated 2026-04-11) — claims no frontend test framework
  and zero `src/` tests. **Superseded by v4.0**, which shipped Playwright + vitest.
- `.planning/codebase/CONCERNS.md` (2026-04-28) — v3.0-era; many listed concerns were closed
  in v4.0/v5.0. Verify against HEAD before acting on anything in it.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/lib/analysis-error-log.ts`** — a working prototype of XLOG-01/02. Generalize rather
  than replace: it already has browser/version parsing, extension-scheme detection, stage typing
  and a documented no-PII contract.
- **`src/lib/polyfills/`** — established guarded-polyfill pattern plus a test, proven in
  production across three pdf.js realms.
- **`src/hooks/useAnalysisRun.ts`** — subscribe-first/poll-fallback recovery, already wired.
- **`AnalysisErrorBoundary` / `HomepageErrorBoundary`** — controlled-message + extension-isolation
  precedent for XDEV-08 and XRUN-06.
- **16 existing Playwright specs** (8 in `e2e/`, 8 in `e2e-prod/`) plus `auth.setup.ts` storage-state
  fixtures — the matrix reuses these rather than authoring new flows.

### Established Patterns
- **Fire-and-forget telemetry** — Phase 02's TOK-01 established that a telemetry failure must
  never fail the surrounding operation. D-11 follows it.
- **Ascending blast radius rollout** — v5.0 migrated 5 features in risk order; D-25 follows it.
- **Reproduction-gated remediation** — v5.0's security audit fixed only confirmed findings and
  documented the rest; D-23 follows it.
- **Shared `_shared/` edge utilities + `withCors` wrapper** — any new edge function for
  diagnostics ingest must adopt these (all 21 active functions do).

### Integration Points
- `playwright.config.ts` / `playwright.prod.config.ts` — new projects.
- `package.json` § `verify:baseline` — where the cross-device subset is wired in.
- `index.html` — new pre-bundle browser guard (D-08).
- `src/main.tsx` — existing polyfill install site; the in-app support check and build stamp
  land nearby.
- `supabase/functions/` + `supabase/config.toml` + `scripts/deploy.ps1` + `deno.json` — a new
  diagnostics-ingest function must be registered in all three places (the Phase 01.1 precedent).
- `supabase/migrations/` — one new table for client diagnostics (D-12), with rollback SQL.

</code_context>

<specifics>
## Specific Ideas

- The 2026-07-26 `getOrInsertComputed` fix is the **explicit template** for what "find and fix
  each root cause" means here: prove the failing call site, classify the category, fix at source
  (polyfill in every realm), add a guard test, and add a controlled-message boundary — rather
  than wrapping the symptom in a retry.
- The completion report is a hard deliverable with 8 named items plus a final verdict of
  **READY / READY WITH WARNINGS / NOT READY**. It must include commit hashes and deployment +
  rollback steps.
- Honest reporting is a first-class requirement: the matrix must distinguish "supported" from
  "partially verified", and must list remaining unsupported environments explicitly rather than
  implying blanket coverage.

</specifics>

<deferred>
## Deferred Ideas

- **Cloud device farm (BrowserStack / Sauce Labs / LambdaTest)** — would give genuine iOS Safari,
  Edge-on-Windows and Android Chrome in CI and make real-device coverage non-optional. Deferred
  by D-04: it is new paid infrastructure and a deliberate break from the "no new infrastructure"
  stack constraint. Revisit as its own phase **only if** this phase's audit proves device-specific
  gaps that engine + emulation coverage structurally could not have caught.
- **A third environment with live Anthropic calls** — would close the Preview `AI_TEST_MODE` gap
  permanently. Substantial new infrastructure and recurring AI spend; well outside this phase.

</deferred>

---

*Phase: 03-cross-device-reliability-and-compatibility*
*Context gathered: 2026-07-27*
