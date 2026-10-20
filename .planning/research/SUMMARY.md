# Project Research Summary

**Project:** Strivo AI v5.0 Platform Trust, Reliability & Intelligence
**Domain:** Brownfield reliability/trust hardening of an AI-analysis SaaS (Supabase Edge/Deno + Postgres + React/Vite + Anthropic Claude)
**Researched:** 2026-06-25
**Confidence:** HIGH (all claims grounded in live codebase + migrations; inferred LinkedIn root-causes MEDIUM pending production score-log confirmation)

---

## Executive Summary

v5.0 is a brownfield trust milestone, not a greenfield build. The most important framing: every capability this milestone delivers is buildable entirely from Postgres primitives and shared utilities already proven in this codebase. Zero new runtime dependencies, zero new infrastructure. The work is new code and migrations on existing substrate: extend `analysis_jobs`, rewrite `_shared/cors.ts` internals, compose `zod@3.25.76` (already vendored in both surfaces), and wire the 4-arg `check_and_deduct_merits` RPC that was shipped but never called. Every recommendation across all four research streams converges on this constraint.

The single most dangerous gap the research uncovered is not missing functionality: it is a seam between built and wired. The Merit idempotency substrate (4-arg `check_and_deduct_merits` + partial-unique index on `merit_transactions`) exists, is unit-tested, and works at the DB layer. But every production call site routes through `withMerits`, which calls the 3-arg overload without forwarding an idempotency key. This means every production Merit deduction is currently non-idempotent: a double-click, a tab refresh, or a concurrent submit each produce independent deductions. The shared lifecycle workstream (W3) must wire this key end-to-end before any feature migration begins. A second confirmed production defect sits in `grade-linkedin`: a post-save `throw MeritRefundable` refunds a Merit for an analysis that was already durably saved and emailed, producing a refund-after-success billing incoherence. Both are pre-existing, live bugs, not theoretical risks.

The recommended build order, validated independently by all four researchers: (1) Security audit and CORS foundation first; (2) Lifecycle substrate (DB migrations, RPCs, shared executor) shipped dormant before any feature touches it; (3) Feature migrations one at a time in ascending blast-radius order: Recruiting Lens first (smallest, already confirmed broken), LinkedIn Grader second (proves deterministic scoring), Resume Analysis + Onboarding third (dual path, highest traffic), Career Compass last (most complex); (4) Dashboard intelligence after features produce the stored data it reads; (5) Paddle retirement last, gated on verified expiration. Each workstream must add new tests into `verify:baseline` - a green baseline only proves existing behavior.

---

## Key Findings

### Recommended Stack

The verdict from STACK.md: reuse, extend, do not add. All three v5.0 capabilities are buildable from tools already in the tree. Net-new artifacts are TypeScript modules and SQL migrations, not packages.

**Core technologies (all already in repo):**

- **PostgreSQL (Supabase-managed, 15.x):** Lifecycle state machine, idempotency, atomic Merit reserve/settle/refund. The existing `analysis_jobs` table, partial-unique indexes, `SECURITY DEFINER` RPCs, OCC compare-and-swap, and `pg_advisory_xact_lock` are all in production. Use `text + CHECK` for status columns (not native `ENUM`, which cannot be removed/reordered and fights additive roll-forward migrations - confirmed by two existing CHECK-rewrite migrations).
- **Deno 2 (Supabase Edge runtime):** All edge logic. No new runtime.
- **zod 3.25.76:** Already vendored in BOTH surfaces at the same pin (`_shared/types/interviewPrep.ts` imports `https://esm.sh/zod@3.25.76`; `package.json` has `^3.25.76`). Do NOT migrate to zod 4 in this milestone - API-breaking, no v5.0 upside.
- **`_shared/cors.ts`:** Rewrite internals only; keep exported surface (`corsHeaders`, `handleOptionsRequest`) so 14+ callers do not change. Add `withCors` wrapper and `jsonError` helper.
- **`_shared/merit-gateway.ts`:** Wire the existing 4-arg `check_and_deduct_merits` (already idempotent) through `withMerits`. Refund taxonomy (`isRefundableAnthropicError`) is the canonical only-transient classifier - promote to the shared executor.
- **`_shared/json-repair.ts`:** Already does markdown-fence stripping, control-char escaping, and truncation repair. Step 1 of the output validation pipeline. Reuse unchanged.

**Net-new code artifacts (3 new + 1 edit + migrations):**
- `supabase/migrations/<ts>_analysis_runs_lifecycle.sql` - lifecycle columns, widened CHECKs, partial unique indexes, RPCs
- `supabase/functions/_shared/analysis-lifecycle.ts` (new)
- `supabase/functions/_shared/llm-validation.ts` (new)
- `supabase/functions/_shared/cors.ts` (edit internals only)

**What not to add:** External queue (SQS, BullMQ, Inngest), Redis for idempotency, a CORS middleware package, `ajv`/`joi`/`yup`, Anthropic SDK, an ORM, Realtime service for job status.

---

### Expected Features

The verdict from FEATURES.md: every insight must trace to stored evidence; the total must be deterministic math; the run must be financially safe.

**Must have (table stakes):**
- **Honest empty states** for both new dashboard sections - no placeholder-as-insight ever; prerequisite for every other section and the cheapest trust win
- **Recruiter First Impression** from stored data: Current Positioning, evidence-backed standouts (2 Free / 3 Elite), top concerns (1 Free / 2 Elite), exactly one of five fixed recruiter-response states chosen deterministically from stored scores, one CTA - never free-text invented by the model
- **Profile Alignment** from stored data: overall score + interpretation, sub-dimensions (Experience + Positioning for Free; all 4 for Elite), concrete sync actions citing named mismatches, mandatory no-score empty states when only one profile exists
- **11-section LinkedIn rubric** with per-section `earned`/`max`/`evidence`/`strengths`/`weaknesses`/`actions`; server computes the weighted total deterministically - model never emits the headline number (fixes ~52/100 clustering + repeat-run drift)
- **Reliable run lifecycle** across all five features: named progress stages, disabled duplicate submit, refresh/navigation recovery via persisted `run_id`, bounded retry of only-transient failures, previous-result preservation on failed re-run, explicit Merit reserve/charged/released/refunded messaging, accurate History
- **No on-load AI calls**: both new dashboard sections derive entirely from already-stored analysis data
- **Merit charged only on `saving -> completed`**: reserve up front, settle only after a verified durable write, refund on any post-reserve pre-settle failure

**Should have (competitive differentiators):**
- Cross-analysis recruiter-eye synthesis (Elite): resume + LinkedIn + Career Compass + Saved Jobs + Recruiting Lens synthesized from stored outputs, no new AI call
- Profile Alignment sub-dimensions with conflicting-evidence callouts ("React is top-3 on LinkedIn but absent from resume")
- Deterministic weight-driven LinkedIn total separating weak/average/strong/exceptional profiles (expected bands: 20-45 / 46-65 / 66-85 / 86-95)
- Explicit Merit lifecycle messaging (reserved / charged / released / refunded) in UI copy and toasts
- Refresh/navigation recovery of an in-flight or completed run

**Defer to v5.x or later:**
- Elite cross-analysis depth weight tuning (needs calibration data)
- Role/job-specific Profile Alignment layer
- Rubric weight calibration pass against a labeled profile set
- Trend views (needs longitudinal data not yet available)

**Hard anti-features (never ship):**
- Fabricated/placeholder insight dressed as personalized analysis
- Model-emitted LinkedIn total (always computed server-side)
- Score floors or curves making weak profiles look stronger
- Retrying non-transient failures (4xx, schema-invalid output)
- Scoring alignment when only one profile exists
- Refunding after a result is durably saved

---

### Architecture Approach

The architecture is evolutionary, not greenfield. Extend `analysis_jobs` in place (add columns, widen CHECK constraints, add partial unique indexes), keep the physical table name, optionally add a `public.analysis_runs` view alias. The shared executor owns exactly one ordered sequence: authenticate -> create/recover record -> validate inputs -> cache precheck -> reserve Merits (4-arg, idempotent) -> extract data -> generate -> validate output strictly -> save -> settle Merit -> mark completed. Each arrow is a committed `transition_analysis_run` CAS update that survives refresh/timeout/worker death. Features inject only per-feature hooks (prompts, schemas, score math) - the lifecycle never sees prompt internals.

**Major components:**

1. **`analysis_jobs` (evolved into "analysis runs" ledger):** Single persistent lifecycle table for all 5 features. Gains: `state` (11-value text+CHECK), `feature`, `tier`, `driver` (inline vs queue), `idempotency_key`, `input_fingerprint`, `request_key`, `merit_settled`, `refunded`, `retry_history`, `failure_stage`, `failure_code`, `result_analysis_id`. Dual-writes a derived legacy `status` mapping during migration so existing consumers work byte-for-byte until each feature is cut over.

2. **`create_or_recover_analysis_run()` + `transition_analysis_run()` RPCs:** Atomic idempotent create/recover/supersede under `pg_advisory_xact_lock`; guarded CAS state transitions with a partial unique active-per-feature index (`WHERE state NOT IN ('completed','failed','refunded')`). Replaces the current best-effort SELECT-then-INSERT with a race-free RPC.

3. **`_shared/analysis-lifecycle.ts`:** The ordered executor. Enforces request ordering, integrates Merit reserve/settle/refund, classifies retry vs permanent failures, supports both `inline` driver (sync features) and `queue` driver (async worker). Features pass `AnalysisHooks<I,O>` - validateInputs, fingerprint, cachePrecheck, extract, generate, validateOutput, save.

4. **`_shared/cors.ts` (rewritten internals):** Origin-aware allowlist (`ALLOWED_ORIGINS` env), echo-only validated origins with `Vary: Origin`, `withCors` wrapper guaranteeing CORS on every response including failures and preflight, `jsonError` structured envelope used by auth.ts and all handlers.

5. **`useAnalysisRun.ts`:** Frontend recovery hook. Subscribe-first (Realtime `postgres_changes` on `run_id`) + poll-fallback (`get-analysis-run-status`). Persists `run_id` in URL + localStorage keyed by feature. Preserves last completed result; renders specific error/retry CTA on terminal states.

6. **`_shared/llm-validation.ts`:** `repairTruncatedJSON` (existing) -> `JSON.parse` -> `zod.safeParse` against per-feature schema -> feature-specific `.superRefine` semantic checks. Failure produces a typed error with `failure_code` in the permanent taxonomy - never a substituted result.

**Key data-flow change:** Current sync features (LinkedIn Grader, Recruiting Lens) have no persistent record - a tab close or fetch timeout silently loses the run. Target: `click -> create_or_recover_analysis_run() -> run_id stored in URL+localStorage -> useAnalysisRun subscribes+polls -> executor advances state in committed DB updates -> terminal state triggers result render or specific error`. Identical pattern for inline and queue drivers.

---

### Critical Pitfalls

The six most decision-relevant for the roadmapper (all 12 detailed in PITFALLS.md):

1. **Merit idempotency key never forwarded (Pitfall 1, W3 spine):** The 4-arg RPC exists and is unit-tested but `withMerits` calls the 3-arg overload (confirmed at `merit-gateway.ts` line 201) - every production deduction is non-idempotent. W3 must generate one key per analysis attempt and thread it frontend -> edge -> `withMerits` -> 4-arg RPC. New deno test driving the full `withMerits` path (not just the raw RPC) with a repeated key must prove exactly one deduction end-to-end and enter `verify:baseline`.

2. **Refund-after-save in grade-linkedin (Pitfall 2, live bug):** `storeAndNotify()` saves the result, then a usage-write failure throws `MeritRefundable` (confirmed at lines 554-559), triggering a refund for an already-saved, already-emailed analysis. W3 lifecycle makes `saving -> completed` the point of no return; post-save steps log-and-continue, never throw `MeritRefundable`.

3. **Two CORS defects (Pitfalls 6+7, W2):** `corsHeaders()` returns a single static `APP_URL` (rejects www/preview/localhost) AND 401/error responses are built without CORS headers (browser swallows structured errors). Both fixed in the same `_shared/cors.ts` rewrite (`withCors`/`jsonError`). Regression test: full status matrix (200/401/402/429/500) per function x (apex/www/preview/localhost/disallowed).

4. **LinkedIn ~52 clustering + second-run drift (Pitfall 8, W4+W3):** Two confirmed root causes: (a) section-level central tendency - temperature 0.3 + unanchored rubric pushes Haiku toward average scores with no discriminating evidence anchors; (b) cache key includes `prior_grade_id` which mutates after every save, so identical input never cache-hits and each rerun gets a different prompt context. Fix: evidence-anchored 11-section rubric with explicit band definitions; server-computed weighted total; stable input-identity cache key excluding save-mutated fields.

5. **Status-window dedup is not idempotency (Pitfall 5, W3):** `submit-resume-analysis-job` WR-04 check (SELECT active job then INSERT) is a TOCTOU race and only guards active-window duplicates - a completed-job resubmit sails through and charges again. Replace with atomic partial-unique index + `create_or_recover_analysis_run()` RPC; concurrency test asserting N parallel identical submits yield exactly 1 deduction, 1 row.

6. **Six-workstream blast radius + false-confidence gate (Pitfall 12, sequencing):** W2 touches every edge function; W3 re-plumbs the Merit deduction seam in 5 features; W1 touches RLS client read paths; W6 touches billing. `verify:baseline` proves existing behavior only - it does not cover new behavior. Each workstream adds its own new tests into the gate as an exit criterion; use feature flags for lifecycle migration; never edit a shared utility without reviewing which other workstreams depend on it.

---

## Implications for Roadmap

All four research streams independently converged on the same build order: a low-risk independent foundation first (CORS + security), then the shared lifecycle substrate shipped dormant, then feature migrations in ascending blast-radius, then dashboard intelligence (which only reads what the migrated features now store), then Paddle removal last behind its expiration gate. The suggested phase structure below maps the six workstreams onto that order. The roadmapper has latitude to split (security and the resume/career migrations are the likeliest split points).

### Phase 1: Cross-Origin & Error-Contract Foundation (W2)
**Rationale:** Independent, low-risk, and the only workstream fixing a confirmed live production outage (`www.strivoai.net` rejected). Touches the shared edge surface every later workstream builds on, so it must land first and clean. No behavior change beyond the fix - fully regression-testable.
**Delivers:** `_shared/cors.ts` rewrite (env-driven `ALLOWED_ORIGINS` allowlist, origin-reflection-with-validation, `Vary: Origin`, no credential-bearing wildcard), a `withCors` wrapper + `jsonError` envelope so CORS headers (and structured errors) ride EVERY response including 401/preflight/failures, an audit of all active edge functions for the same pattern, and a table-driven `cors.test.ts` (status matrix x origin set) added into `verify:baseline`.
**Addresses:** Resume/Career/LinkedIn/Recruiting production access; the 401-swallow defect.
**Avoids:** Pitfalls 6 + 7 (single-origin reflection; error bodies swallowed by missing CORS).

### Phase 2: Security Audit & Remediation (W1)
**Rationale:** The deferred SEC-01..10 plus a current full-surface audit. Sequenced right after CORS because both work the auth/edge/RLS surface; remediations are regression-testable without product behavior change and must not weaken v4.0's hardening.
**Delivers:** A documented audit across the 17 required domains, every confirmed critical/high finding remediated + evidenced, and a regression test per high-risk finding folded into `verify:baseline`. Final security record (scope / findings / severity / remediation / verification / accepted residual).
**Uses:** v4.0's preview->prod operator-gated migration discipline for any RLS/DB-function change; never weakens existing protections.
**Avoids:** Pitfall (security remediation that breaks legitimate behavior or weakens v4.0).

### Phase 3: Shared Analysis Lifecycle Substrate (W3 core, shipped dormant)
**Rationale:** The foundational, highest-risk core. Everything in W4/W5 depends on it. Ship it dormant (flag-gated, legacy paths byte-identical) before any feature touches it.
**Delivers:** additive migration evolving `analysis_jobs` into the canonical runs ledger (11-value `state` text+CHECK, feature/tier/driver/idempotency_key/input_fingerprint/merit_settled/refunded/retry_history/failure_stage/failure_code/result_analysis_id); `create_or_recover_analysis_run()` + `transition_analysis_run()` advisory-locked CAS RPCs with a partial-unique active-per-feature index; `_shared/analysis-lifecycle.ts` ordered executor (auth -> create/recover -> validate -> reserve Merits -> extract -> generate -> validate output -> save -> settle -> complete); `_shared/llm-validation.ts` (json-repair -> JSON.parse -> zod -> superRefine); **wiring the existing 4-arg idempotent `check_and_deduct_merits` through `withMerits`** with an end-to-end idempotency test in `verify:baseline`; the structured error taxonomy; and `useAnalysisRun.ts` (subscribe + poll-fallback, refresh recovery).
**Implements:** ARCHITECTURE.md components 1-6.
**Avoids:** Pitfalls 1 (idempotency key never forwarded), 2 (refund-after-save), 5 (status-window dedup != idempotency).

### Phase 4: Feature Migration A - Recruiting Lens + LinkedIn Grader (W4 + W3 adoption)
**Rationale:** Smallest blast radius first. Recruiting Lens is already confirmed broken in prod; LinkedIn proves deterministic scoring on the new lifecycle.
**Delivers:** both features cut onto the lifecycle behind their flags; LinkedIn 11-section evidence-anchored rubric with **server-computed weighted total** (model never emits the headline number), stable input-identity cache key excluding save-mutated `prior_grade_id`, and tests proving weak/average/strong/exceptional profiles differentiate; repeated-run + idempotency + refresh-recovery coverage.
**Avoids:** Pitfall 8 (~52 clustering + second-run drift).

### Phase 5: Feature Migration B - Resume Analysis + Onboarding + Career Compass (W4 + W3 adoption)
**Rationale:** Highest traffic and most complex last, once the lifecycle is proven on A. Resume is the dual streaming/queue path; Onboarding has the "Taking Longer" hang; Career Compass is the most complex schema.
**Delivers:** resume streaming path gains a persistent lifecycle record (financial safety without latency regression); Onboarding hang resolved (upload/extraction confirmed before generation, persisted + recovered, specific terminal failure); full Career Compass pipeline (resume-only / LinkedIn-only / combined; persist Career DNA / fields / gaps / surprise fits / roadmaps); Resume Analysis output quality preserved exactly.
**Avoids:** Pitfall 4 (dual-state-machine orphan); frontend-timeout abandonment.

### Phase 6: Dashboard Intelligence (W5)
**Rationale:** Reads the stored data the migrated features now produce - must come after W4/W5. No new AI calls on load.
**Delivers:** *Recruiter First Impression* (replaces Live Career Profile; deterministic 5-state recruiter response from stored signals), *Profile Alignment* (replaces Activity Stream; no-score empty states when a profile is missing), deletion of Progress & Achievements; Free/Elite depth; fixed final section order; protected areas untouched; honest empty states everywhere.
**Avoids:** fabricated/placeholder-as-insight; on-load AI calls; alignment score with one profile missing.

### Phase 7: Paddle Retirement (W6)
**Rationale:** Last and gated. Destructive removal only after the subscription-expiration gate is verified by authoritative billing + a prod read; otherwise complete safe prep + document the blocker.
**Delivers:** gate verification evidence; if satisfied, removal of Paddle app behavior / webhook / Paddle-only columns+functions / env config / obsolete types-tests-docs (copying the existing `stripe-webhook` 410-shim precedent), preserving required billing history; billing regression tests pass.
**Avoids:** removing before the gate; dropping required billing history; leaving a live webhook or configured secret.

### Phase Ordering Rationale
- **Dependency-driven:** W3 substrate must exist before W4 features migrate; W5 dashboard reads what migrated features store; so W5 cannot precede W4.
- **Risk-ascending feature migration:** Recruiting Lens/LinkedIn (small, already broken) before Resume/Onboarding/Career (high-traffic, dual-path, complex) limits blast radius while the lifecycle stabilizes.
- **Independent foundation first:** CORS (W2) is the only confirmed live outage and is self-contained, so it ships first; security (W1) shares the edge/RLS surface and is regression-testable without behavior change.
- **Gate-bound work last:** Paddle (W6) is externally gated on subscription expiration, so it is sequenced last and may end in "safe-prep + documented blocker" rather than destructive removal.
- **Gate discipline throughout:** every phase folds its NEW tests into `verify:baseline` (Pitfall 12) - a green baseline only proves pre-existing behavior.

### Research Flags

Phases likely needing deeper research/design during planning:
- **Phase 3 (lifecycle):** the streaming resume path gaining a lifecycle record without latency regression; the exact reserve+create-record contract (single SECURITY DEFINER RPC vs deduct-then-compensate); whether `validating_output` re-prompts once (bounded `retryable_failed`) or fails straight to `failed`.
- **Phase 4 (LinkedIn rubric):** exact 11-section weights (sum-to-100 vs normalized) + per-tier calibration bands; the deterministic decision function mapping stored signals -> one of the 5 recruiter-response states (also used in Phase 6).
- **Phase 7 (Paddle):** requires a prod read to confirm whether any `profiles` row still has an active future-dated Paddle `current_period_end` before the gate can be evaluated.

Phases with established patterns (lighter research):
- **Phase 1 (CORS):** conventional allowlist-echo pattern; root cause already confirmed in code.
- **Phase 6 (dashboard):** derives from stored data with the codebase's existing defensive-rendering + entitlement-gating patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Every reused artifact (analysis_jobs, Merit RPCs, partial-unique index, advisory lock, zod-in-Deno, json-repair) read directly from migrations + source; only "latest zod version" is web-sourced |
| Features | MEDIUM-HIGH | Recruiter triage + resume/LinkedIn discrepancy dimensions validated by multiple market sources; exact 5-state mapping, sub-dimension boundaries, and rubric weights are internal spec needing calibration |
| Architecture | HIGH | Existing-architecture facts from direct code reads; the evolve-`analysis_jobs` design mirrors shipped CHECK/index/RPC conventions; feature-migration order is an opinionated (not forced) recommendation |
| Pitfalls | HIGH | Code-grounded (line-cited) for the wired-vs-built Merit gap, both CORS defects, the refund-after-save bug, and the cache-key-mutation; LinkedIn ~52 temperature/anchoring root cause is MEDIUM (inferred, pending prod score-log confirmation) |

**Overall confidence:** HIGH

### Gaps to Address

- **LinkedIn ~52 clustering** is inferred from code (temperature 0.3 + unanchored rubric); confirm against real production score logs during Phase 4 before finalizing the rubric calibration.
- **Paddle expiration gate input** needs a prod read (active future-dated `current_period_end`) before Phase 7 can decide removal vs safe-prep.
- **11-section rubric weights + the deterministic recruiter-response decision function** are spec-level and need REQ precision before Phase 4/6 implementation.
- **Reserve+create-record contract** (single atomic RPC vs deduct-then-compensate) is a Phase-3 design decision both patterns support.

## Sources

### Primary (HIGH confidence)
- Strivo AI live codebase + `supabase/migrations/` - every architecture, stack, and pitfall claim (line-cited in the per-dimension files)
- `_shared/cors.ts`, `_shared/auth.ts`, `_shared/merit-gateway.ts`, `grade-linkedin/` - CORS, auth-swallow, Merit-wiring, and refund-after-save defects
- Context7 - current `zod` version verification

### Secondary (MEDIUM confidence)
- Recruiter-triage / resume-vs-LinkedIn consistency market sources - the two dashboard sections' table-stakes vs anti-features
- LinkedIn scoring market references (~6-pillar / 30-signal) - the 11-section rubric as a defensible superset

### Tertiary (LOW confidence)
- Inferred LinkedIn temperature/anchoring root cause - needs prod score-log validation

---
*Research completed: 2026-06-25*
*Ready for roadmap: yes*

