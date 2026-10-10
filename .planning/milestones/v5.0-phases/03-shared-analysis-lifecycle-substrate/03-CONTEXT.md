# Phase 3: Shared Analysis Lifecycle Substrate - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship **ONE persistent, idempotent, financially-safe analysis lifecycle** as shared
infrastructure — **dormant / flag-gated, with legacy paths byte-identical** — ready for the
five features (Onboarding Resume, Resume Analysis, LinkedIn Grader, Career Compass, Recruiting
Lens) to adopt in Phases 4–6. This is the **W3 spine** W4/W5 depend on, and it wires the
existing-but-unwired 4-arg idempotent `check_and_deduct_merits` RPC end-to-end.

**Requirements:** LIFE-01..09.

This phase clarifies **HOW** the substrate is built and bounded. It ships **no product behavior
change** (substrate dormant, no feature routed through it), must keep `verify:baseline` green,
and must not weaken any v4.0 protection (security advisor floor 15, RLS least-privilege,
preview→prod operator gate).

**Locked by ROADMAP.md / REQUIREMENTS.md (carried in, not re-debated):**
- Evolve `analysis_jobs` **additively** (in-place, operator-gated preview→prod migration) to the
  11-state model (`created → validating_inputs → reserving_merits → extracting_data → generating
  → validating_output → saving → completed | retryable_failed | failed | refunded`) + the required
  operational metadata (feature, tier, idempotency/request context, merit transaction, input/prompt/
  schema/calculation version, model, retry count, failure code+stage, timestamps).
- `create_or_recover_analysis_run()` + `transition_analysis_run()` **CAS RPCs**; partial-unique
  **active-per-feature** index; `CHECK (NOT (merit_settled AND refunded))`; legacy `status` dual-write.
- Wire the 4-arg idempotent `check_and_deduct_merits` end-to-end through `withMerits`; deno test
  driving the full `withMerits` path with a repeated idempotency key proves exactly one deduction.
- `_shared/analysis-lifecycle.ts` **ordered executor** (authenticate → validate inputs →
  create/recover → atomically reserve Merits → extract → generate → strictly validate output →
  save → settle → complete); refund/release exactly once ONLY on a post-reserve pre-settle failure;
  never double-charges/refunds; never charges for missing input / invalid output / unsaved result.
- `_shared/llm-validation.ts` **strict no-masking** output validation (wrapper removal, JSON parse,
  required-field/type/range, missing-section, empty/generic, truncation, feature-specific semantic
  checks); an invalid response is NEVER silently replaced with a fixed score / empty object /
  generic / fabricated result.
- Structured internal error taxonomy (INPUT_MISSING, FILE_NOT_FOUND, FILE_EXTRACTION_FAILED,
  PROFILE_PARSE_FAILED, MERIT_RESERVATION_FAILED, MODEL_TIMEOUT, MODEL_RATE_LIMITED,
  MODEL_INVALID_RESPONSE, MODEL_OUTPUT_TRUNCATED, SCHEMA_VALIDATION_FAILED, DATABASE_SAVE_FAILED,
  MERIT_SETTLEMENT_FAILED, UNKNOWN_ANALYSIS_ERROR); safe user-facing messages only — no technical
  details / payloads / prompts / secrets exposed.
- `get-analysis-run-status` endpoint; `useAnalysisRun` recovery hook (subscribe-first/poll-fallback,
  `run_id` persistence, refresh/navigation recovery, retry-only-retryable, preserve-previous-success,
  Merit reserve/charge/release/refund messaging); `src/lib/analysisError.ts`.
- Ships **dormant / flag-gated / unwired** — no feature routed through it yet.

</domain>

<decisions>
## Implementation Decisions

**Operator stance (carried from Phase 2): MAXIMAL thoroughness / complete-the-spine.** Every gray
area below was resolved to the most-complete option. Phase 3 builds the full substrate (reaper +
realtime + end-to-end idempotency + persisted retry) DORMANT — not a scope-minimized skeleton.
Plan for a larger phase (more plans + operator DB checkpoints) accordingly.

### 1. Reaper scope — **Build the full reaper dormant NOW**
- **D-01:** The stuck-state timeout-sweep ships complete in Phase 3: the **terminalize-stale
  transition + reservation-release RPC** AND a **scheduled sweep** — armed but inert while no
  feature is live. Every non-terminal state carries a timestamp + max-age; the sweep moves stale
  rows to `retryable_failed`/`failed` and releases the stranded Merit reservation exactly once.
- Rationale: the spine must be complete before Ph4 adopts it (Pitfall 4 — two state machines /
  orphan states / stranded reservations / the "Taking Longer" hang class). Chosen over "RPC now,
  arm cron later" and "defer to Phase 5". The **existing pg_cron usage** (prod jobs `keep-warm-ping`
  `*/5`, `extract_catchup_nightly` `*/15`) is the established scheduling precedent — reuse it rather
  than a new scheduled-function mechanism (no new infrastructure).
- **Note:** arming the sweep is an operator-gated change. Reservation release reuses the gateway's
  existing `refundMeritsForJob` export (async-processor refund path).

### 2. Idempotency-key derivation — **Edge-derived intent hash**
- **D-02:** The stable idempotency key is **derived server-side (edge), never trusted from the
  client**: `key = hash(user + feature + tier + input-identity + attempt-nonce)`, where
  input-identity is a content-hash / latest-input id (the exact per-feature identity source is a
  Ph4/5/6 concern — the substrate defines the CONTRACT + shape, features supply their identity).
- The frontend sends an explicit **"new run" signal** (deliberate re-run); the edge computes the key.
  An accidental resubmit of the *same attempt* re-derives the **same** key → `already_deducted` →
  reuse the existing transaction/result (no second charge). A deliberate new run mints a **fresh
  attempt-nonce** → new key → new charged analysis + History record.
- The key must be **cache-key-stable** (never composed from a save-mutated field like
  `prior_grade_id` — Pitfall 8). `withMerits` already forwards `ctx.idempotencyKey ?? null` to the
  4-arg RPC (Phase 2 / 02-05); this phase DERIVES + THREADS the key that seam consumes.
- Rationale: deterministic, tamper-resistant, closes the TOCTOU / two-tabs / completed-job-resubmit
  gaps atomically via the partial-UNIQUE index (Pitfall 1/5). Chosen over client-UUID and hybrid.

### 3. Retry execution model — **In-process bounded backoff, persisted fallback**
- **D-03:** The executor retries **genuinely transient** failures (provider timeout, provider rate
  limit, temporary network interruption, transient DB unavailability) **in-process** with bounded
  exponential backoff (reuse the existing `computeBackoffMs` — base 1000ms, max 3000ms + jitter).
  On exhaustion OR invocation death, the row rests in **`retryable_failed`** for the frontend Retry
  action and/or the reaper (D-01) to pick up. **Permanent** failures (missing files, invalid input,
  auth failure, unsupported document, schema incompatibility, malformed source) are **never**
  auto-retried (LIFE-06).
- The **lifecycle row is the single source of truth** — no parallel worker retry loop; the new
  states MAP INTO the existing `analysis_jobs` worker rather than duplicating a second state machine
  (Pitfall 4). Transitions are idempotent + monotonic (can't go backwards; re-entering a state is a
  no-op) so a re-fired worker can't resurrect a terminal row.
- Rationale: fast recovery for short transient blips without waiting on sweep cadence, with the
  persisted state as the durable safety net. Chosen over pure re-enqueue and in-process-only.

### 4. Dormancy flag granularity — **Global kill-switch + per-feature flags**
- **D-04:** Dormancy is enforced by **two layers**: one master edge flag
  (`ANALYSIS_LIFECYCLE_ENABLED`, default OFF — mirrors the `MERIT_SYSTEM_ENABLED` module-scope
  cold-start read precedent) as an incident kill-switch, PLUS **per-feature flags** (one per
  Recruiting Lens / LinkedIn / Resume / Onboarding / Career Compass) so Ph4/5/6 flip each feature
  **independently** in ascending blast-radius order. The frontend `useAnalysisRun` hook is gated by
  a **VITE flag** (follows the `src/config/feature-flags.ts` / `import.meta.env.VITE_FEATURE_*`
  convention, exact-lowercase-`'true'` semantics).
- Rationale: maximal staged-rollout control + a single "disable everything" lever for rollback.
  Chosen over single-global and per-feature-only.

### 5. Realtime for subscribe-first — **Enable Realtime NOW (operator-gated)**
- **D-05:** Add `analysis_jobs` to the **realtime publication** + realtime RLS in the same
  operator-gated preview→prod migration wave that evolves the ledger, so `useAnalysisRun`'s
  **subscribe-first** path genuinely works when the first feature flips; **poll is the true
  fallback**. (Supabase Realtime is existing infra — NOT the "new realtime service" the milestone
  excludes.) Preview `cimjltzovkahkqecpwgi` is UNPAUSED (lifts the env-deferred realtime smokes).
- Rationale: completes the hook contract rather than shipping a poll-only stub; matches the
  complete-the-spine stance. Chosen over "poll-first / subscribe-as-enhancement" and "poll-only".

### 6. Re-run charge semantics — **Charge per deliberate run; no cache-reuse in the substrate**
- **D-06:** Every **deliberate** run (fresh attempt-nonce, D-02) is a **charged** analysis. Free
  identical-input reuse stays the **existing `precheck_cache` / per-feature concern**, layered in
  Ph4/5/6 — it is **NOT** baked into the substrate's Merit path. **Accidental** resubmit dedup is
  handled by the idempotency key (D-02), not by cache.
- Rationale: keeps the executor's Merit contract simple + honest ("reserve → settle only on verified
  durable save"); avoids coupling the substrate to caching + per-feature product rules (LIFE-05
  "reusing unchanged input remains a valid intentional run where product rules allow"). Chosen over
  substrate-consults-cache and per-feature-reuse-policy-hook.

### Claude's Discretion
- The exact **sub-ordering of the 5 plan sketches** (03-01..03-05 in ROADMAP.md is a starting point,
  not binding) — provided the migration (ledger + RPCs + indexes + reaper + realtime) lands before
  the executor, and the test suite folds into `verify:baseline` last.
- The precise **per-state max-age thresholds** for the reaper (e.g. `generating`/`extracting_data`
  keyed off the function timeout; `reserving_merits`/`saving` tighter) — apply a defensible model and
  state it in the migration/executor.
- The exact **hash algorithm + canonical serialization** for the idempotency-key input-identity
  (stable, collision-resistant, order-independent over the input set).
- The **shape of the state-machine/idempotency/refund/retry/supersede test suite** (deno +
  vitest), following the existing `merit-idempotency.test.ts` + `cors-audit.test.ts` precedents.
- Whether the reaper sweep is a pg_cron-invoked SQL function vs a pg_cron-invoked internal edge
  endpoint (`requireAuth({type:'internal'})` + `INTERNAL_JOB_SECRET`) — reuse whichever matches the
  existing cron-job pattern with least new surface.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### This phase's requirements + roadmap
- `.planning/ROADMAP.md` (Phase 3 section) — goal, 4 success criteria (the 11-state model, RPC names,
  executor sequence, error taxonomy, hook), plan sketch 03-01..03-05.
- `.planning/REQUIREMENTS.md` — LIFE-01..09 full text + Traceability.

### Research inputs (the WHY behind every decision above — line-cited)
- `.planning/research/PITFALLS.md` — **primary design input.** Pitfall 1 (idempotency key never
  forwarded → D-02), 2 (refund-after-save / settle-on-saved), 3 (settle-before-save), 4 (stuck
  non-terminal states + reaper → D-01/D-03), 5 (status-window dedup ≠ idempotency / TOCTOU → D-02),
  8 (cache key mutated by saving → D-02/D-06), 9 (validation masking), plus the "Looks Done But
  Isn't" checklist.
- `.planning/research/SUMMARY.md` — convergent build order + the wired-vs-built Merit seam.

### Merit / lifecycle seam (code — the integration points)
- `supabase/functions/_shared/merit-gateway.ts` — `withMerits` (already forwards
  `p_idempotency_key: ctx.idempotencyKey ?? null` to the 4-arg `check_and_deduct_merits`, L206-217);
  `MERIT_SYSTEM_ENABLED` module-scope flag precedent (L27-28); `MeritRefundable` class;
  `refundMeritsForJob` export (D-01 reservation release, L318+).
- `supabase/migrations/20260225160000_add_analysis_jobs_queue.sql` +
  `20260225222000_extend_analysis_jobs_for_career_queue.sql` +
  `20260409000001_add_recruiting_lens_job_type.sql` +
  `20260429000000_add_merit_transaction_id_to_analysis_jobs.sql` — the current `analysis_jobs` ledger
  being evolved (already has `merit_transaction_id`).
- `supabase/migrations/20260512000003_merit_transactions_idempotency.sql` +
  `supabase/functions/.../merit-idempotency.test.ts` — the 4-arg RPC + partial-UNIQUE index + the
  test to EXTEND (drive the full `withMerits` path with a repeated key → exactly one deduction).
- `supabase/functions/submit-resume-analysis-job/` + `process-resume-analysis-job/` +
  `get-analysis-job-status/` — the existing async job queue + status poller the new states MAP INTO
  (not duplicate — Pitfall 4).

### Shared layer + patterns to reuse
- `supabase/functions/_shared/` — `auth.ts` (requireAuth user/internal), `cors.ts`
  (`withCors`/`jsonError` — the structured-error envelope the taxonomy rides), `anthropic.ts`
  (`computeBackoffMs` for D-03; `MERIT_TEST_FORCE_REFUNDABLE_ERROR` test-flag precedent),
  `logger.ts` (reason-code-not-secret logging), `json-repair.ts`, `usage-checker.ts`.
- `supabase/functions/_shared/cors-audit.test.ts` — static-source-assertion drift-guard precedent.
- `src/config/feature-flags.ts` (+ `__tests__/feature-flags.test.ts`) — the frontend
  `import.meta.env.VITE_FEATURE_*` flag convention for the `useAnalysisRun` VITE gate (D-04).
- `src/hooks/useResumeStream.ts` — the existing streaming/recovery hook whose patterns
  (`invokeWithTimeout`, partial-summary extraction, refresh handling) inform `useAnalysisRun`.
- `TESTING-STRATEGY.md` + `deno.json` `test:ci` allowlist — where the new test suite folds into
  `verify:baseline` (LIFE + the do-not-weaken gate).

### Prior-phase contracts
- `.planning/phases/02-security-audit-remediation/02-CONTEXT.md` — the 02-05 idempotency-key seam +
  refund-after-save invariant this phase EXTENDS end-to-end.
- `.planning/phases/01-cross-origin-error-contract-foundation/01-CONTEXT.md` — the `jsonError`/CORS
  envelope the error taxonomy (LIFE-08) rides.

### Operator / DB gate
- `CLAUDE.md` (Supabase MCP rules) + `.planning/audit/DATABASE.md` — Claude read-only on prod
  (`zjpjapgraoxdukdvpjes`); operator applies every prod migration; **pause for operator checkpoint on
  any RLS / DB-function / realtime-publication change**; test on preview `cimjltzovkahkqecpwgi` first;
  rollback SQL per migration; advisor floor 15 must not increase.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`withMerits` + the 4-arg `check_and_deduct_merits` seam** — capable but unfed; this phase derives
  + threads the key. `refundMeritsForJob` = the reaper's reservation-release path.
- **`computeBackoffMs`** (`_shared/anthropic.ts`) — the bounded-backoff helper for D-03 in-process retry.
- **`MERIT_SYSTEM_ENABLED`** module-scope cold-start env flag — the precedent for
  `ANALYSIS_LIFECYCLE_ENABLED` (D-04).
- **`src/config/feature-flags.ts`** — the VITE-flag pattern for the frontend hook gate.
- **`merit-idempotency.test.ts` + `cors-audit.test.ts`** — the test precedents (runtime idempotency +
  static drift-guard) for the LIFE test suite.
- **Existing `analysis_jobs` queue + `get-analysis-job-status` poller** — the substrate the new states
  extend (one source of truth), and the poll-fallback the hook degrades to.
- **Existing pg_cron jobs** — the scheduling mechanism the reaper reuses.

### Established Patterns
- **Operator-gated preview→prod migration** with rollback SQL per change; advisor-clears + SELECT-as-role
  verified on preview first (v4.0 Ph8). The ledger evolution + realtime enablement follow this.
- **Byte-identical legacy path behind an env flag** (`MERIT_SYSTEM_ENABLED`) — the dormancy model.
- **`CREATE OR REPLACE` re-states every attribute** (security_invoker, search_path, grants) — required
  for any view/fn touched (do not silently re-open a v4.0-closed advisor — Pitfall 10).
- **Idempotent + monotonic state transitions** via CAS RPC (`transition_analysis_run`).

### Integration Points
- `withMerits(ctx, feature, fn, { idempotencyKey })` — the reserve/settle seam the executor drives.
- `analysis_jobs` ledger (+ partial-unique active-per-feature index) — the persisted lifecycle row.
- `get-analysis-run-status` (new) alongside the existing `get-analysis-job-status` poller.
- The realtime publication on `analysis_jobs` — the subscribe-first channel for `useAnalysisRun`.
- `deno.json` `test:ci` + `verify:baseline` — where every new LIFE guard registers.

</code_context>

<specifics>
## Specific Ideas

- The operator chose the **complete-the-spine / maximal** option on all six gray areas — treat
  "build the full substrate DORMANT (reaper + realtime + end-to-end idempotency + persisted retry),
  not a skeleton" as the governing intent when the planner faces a scope judgment call.
- The substrate must be designed so Ph4/5/6 **flip a feature flag and thread an input-identity**,
  with **no rip-out** of anything Phase 3 builds — every decision above is a stable contract, not a
  placeholder the migrations will replace.
- `saving → completed` is the **point of no return** (already enforced in the 3 merit-gated ingesters
  by Phase 2). The executor makes this structural: refunds fire **only** from pre-`saving` states.

</specifics>

<deferred>
## Deferred Ideas

- **Per-feature adoption** (thread each feature's input-identity, flip its flag, feature-specific
  strict-validation semantics) → **Phases 4 (Recruiting Lens + LinkedIn), 5 (Resume + Onboarding),
  6 (Career Compass)**. Phase 3 ships the substrate dormant + unwired.
- **Free identical-input cache-reuse** in the Merit path → per-feature `precheck_cache` concern in
  Ph4/5/6 (D-06) — not the substrate.
- **LinkedIn deterministic evidence-based scoring / ~52 declustering** (FEAT-03, VER-03) → **Phase 4**.
  Phase 3 supplies the strict `_shared/llm-validation.ts` contract it will use.
- **Onboarding "Taking Longer" hang resolution** (FEAT-01) → **Phase 5**. Phase 3 supplies the
  reaper + persisted-recovery + terminal-failure machinery that fixes it.
- **Dashboard intelligence reading stored analysis data** (DASH-01..06) → **Phase 7** (after features
  store genuine data).

### Reviewed Todos (not folded)
None — `todo.match-phase 3` returned 0.

</deferred>

---

*Phase: 03-shared-analysis-lifecycle-substrate*
*Context gathered: 2026-07-02*
