# Phase 5: Feature Migration B — Resume Analysis + Onboarding - Context

**Gathered:** 2026-07-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Route the **two highest-traffic resume features** onto the **dormant Phase 3 shared analysis
lifecycle** (authenticate → validate inputs → create/recover run → atomically reserve Merits →
extract → generate → strictly validate output → save → settle → complete → recover), flipping each
feature's per-feature flag independently, and **resolve the Onboarding "Analysis Taking Longer Than
Expected" hang** at its root cause.

Like Phase 4, this phase splits into a **preserve-exactly migration** and a **real repair**:

- **Resume Analysis = preserve-exactly** (analogous to Recruiting Lens): the current Free output
  quality + presentation are **byte-preserved**; the migration adds only reliability / persistence /
  idempotency / Merit-safety / recovery / History / structured errors. The twist is the **streaming
  SSE path**, which today has **no server record and no idempotency key** — giving it a persistent
  lifecycle record without latency regression is the one place that needs deeper design.
- **Onboarding Resume = the real repair** (analogous to LinkedIn scoring): the fire-and-forget +
  navigate-away + 120s-frontend-guess pattern is replaced by a **tracked, persisted, recoverable
  lifecycle run** so a slow-but-alive analysis is never abandoned.

**Requirements:** FEAT-01 (Onboarding hang: upload/extraction ordering, correct Free-tier
model/prompt/schema/endpoint/limits, persisted+recovered slow runs, delayed results
stored+displayed, specific terminal failures, safe Merit release/refund, no duplicate
analyses/charges), FEAT-02 (Resume Analysis preserve-exactly + shared reliability + streaming
persistent record + production cross-origin failure corrected + duplicate-active-submission
disabled).

This phase clarifies **HOW** the two features adopt the substrate. It **does not** re-debate the
Phase 3 substrate contracts — those are **LOCKED and carried in**. It must keep `verify:baseline`
green and fold its new scenario coverage in.

**Carried in from Phases 3 & 4 (LOCKED — do not re-open):**
- The 11-state lifecycle, `create_or_recover_analysis_run()` / `transition_analysis_run()` CAS RPCs,
  partial-UNIQUE active-per-feature index, `CHECK (NOT (merit_settled AND refunded))`, legacy
  `status` dual-write.
- **Edge-derived idempotency key** = `hash(user + feature + tier + input-identity + attempt-nonce)`;
  frontend sends an explicit "new run" signal (attemptNonce), edge computes the key; key must be
  **cache-key-stable** (never composed from a save-mutated field — Pitfall 8). `withMerits` already
  forwards `ctx.idempotencyKey ?? null` to the 4-arg `check_and_deduct_merits`; **Phase 5 supplies
  each feature's input-identity and threads the key** (Resume streaming passes NO key today — closing
  that gap is a Phase 5 deliverable).
- Refund/release **exactly once ONLY on a post-reserve pre-`saving` failure**; `saving → completed`
  is the point of no return; never charge for missing input / invalid output / unsaved result.
- Strict **no-masking** `_shared/llm-validation.ts` contract: an invalid/malformed/truncated response
  is NEVER silently replaced with a fixed score / empty object / generic / fabricated result.
- Structured error taxonomy (13 codes) + safe user-facing messages; `useAnalysisRun` recovery hook
  (subscribe-first / poll-fallback, `run_id` persistence, refresh/navigation recovery,
  retry-only-retryable, preserve-previous-success, Merit reserve/charge/release/refund messaging);
  per-feature flags (`ANALYSIS_LIFECYCLE_RESUME`, `ANALYSIS_LIFECYCLE_ONBOARDING` — both exist from
  Phase 3, default OFF, no caller yet) + `ANALYSIS_LIFECYCLE_ENABLED` global kill-switch; frontend
  `VITE_FEATURE_ANALYSIS_LIFECYCLE` gate.
- The Phase 3 **reaper** (`reap-stale-analysis-runs` + pg_cron, terminalize-stale +
  reservation-release exactly once) — armed, the durable safety net for genuinely dead runs.
- **Operator stance (carried from Phases 2–4): MAXIMAL thoroughness / complete-the-migration.** Both
  features ride the full lifecycle end-to-end (no scoped-down skeleton). Operator-gated preview→prod
  for any DB/RLS/realtime/grant touch; rollback SQL per migration; advisor floor 15 must not increase.

</domain>

<decisions>
## Implementation Decisions

### 1. Streaming path × lifecycle record (Resume Analysis — preserve-exactly)
- **D-01:** The SSE `analyze-resume` path gains a **full persistent lifecycle run created at stream
  start**: `create_or_recover_analysis_run` with the edge-derived idempotency key → reserve Merits via
  `withMerits` **with the key it omits today** (`index.ts:728`) → stream to the browser
  **byte-identically** → strict-validate the accumulated final result → save → **settle-on-saved**.
  Refresh/navigation recovers via `run_id` + `useAnalysisRun`. Financial safety + recovery, **no
  latency regression** (the added work is one insert before the first token + transitions around the
  stream, not in the token path).
- **D-02 (executor tension — the research-flagged deep-design spot):** the Phase-3
  `runAnalysisLifecycle` executor is **request/response-shaped and LOCKED**. Do **NOT** bend it into a
  streaming executor. Instead the **streaming path orchestrates the same lifecycle RPCs + `withMerits`
  seam + `_shared/llm-validation.ts` directly** (a thin streaming-aware lifecycle wrapper) so the
  executor contract stays untouched and streaming latency/UX is unchanged. **Non-streaming** resume
  paths (Pro/Elite direct request/response, worker-invoked) MAY use the full executor unchanged.
- **D-03 (dual-path identity — Pitfall 1/5):** if a streaming attempt and any non-streaming/worker
  retry of the **same** attempt occur, they must derive the **same** idempotency key (same
  user+feature+tier+input-identity+attempt-nonce) so the partial-UNIQUE active index + `already_deducted`
  guarantee **exactly one charge + one run + one History row**. A **deliberate** new run mints a fresh
  attempt-nonce.
- Rationale: satisfies FEAT-02's "streaming path gains a persistent lifecycle record with no latency
  regression" while honoring the LOCKED executor contract; the persistent record also **subsumes the
  never-wired 529→queue fallback** (a mid-stream overload now lands the run in `retryable_failed` for
  Retry instead of silently dying). Chosen over "bend the executor into streaming" (violates the
  LOCKED contract) and "lightweight alongside-record" (misses run_id-backed recovery).

### 2. Onboarding hang fix + wait UX (FEAT-01 — the real repair)
- **D-04:** Migrate Onboarding onto **`runAnalysisLifecycle('onboarding')`** — keep it **non-streaming**
  (it is a background analysis while the user finishes setup; streaming is not the onboarding UX), so
  it is the **clean full-executor adoption** (request/response). It mints an `attemptNonce` + persists
  a `run_id`; the fire-and-forget browser fetch that abandons a slow run (`Onboarding.tsx:372-382`) is
  **removed**.
- **D-05:** The frontend onboarding→Results flow adopts **`useAnalysisRun`**: `run_id` in
  URL/localStorage, subscribe-first / poll-fallback, **refresh/navigation recovers the live run**. The
  hard **120s `MAX_POLLING_TIME` cap is replaced** by the lifecycle's own terminal states + the
  Phase-3 reaper for genuinely dead runs. "Analysis Taking Longer Than Expected" becomes an **honest,
  recoverable progress state** (the run is alive and tracked), and a genuine failure reaches a
  **specific terminal error** (killing the silent-timeout dead-end at `Results.tsx:609`). No fabricated
  success; Merits release/refund safely (already server-side today, made structural by settle-on-saved).
- **D-06 (wait-UX fork — RESOLVED):** during a slow onboarding run the user **stays on the
  results/progress screen with run-id recovery** — NOT a proactive "proceed into the app and
  notify-later" surface. This is the minimal root-cause fix that fully satisfies FEAT-01
  (navigation-away-and-back still recovers via `run_id`) without building a new notification/
  background-completion surface (which drifts toward Phase 7). Proceed-into-app-and-notify → deferred.
- **D-07 (ordering + Free-tier correctness):** preserve the existing **awaited** upload → signed-URL →
  `resumes` insert → text-extraction (incl. OCR) sequence so analysis only starts after the file is
  accessible and extraction completes; confirm the run uses the **correct Free-tier path**
  (`FREE_MODEL` = Haiku 4.5, `getTimeout('free')` = 50s, `FREE_SINGLE_CALL_MAX_TOKENS` = 5000,
  single-consolidated-call + quality-floor retry, `analyze-resume` endpoint). Duplicate onboarding
  interaction cannot create duplicate analyses/charges (idempotency key + active-run index).

### 3. Orphaned queue path scope
- **D-08:** **Leave `submit-resume-analysis-job` / `process-resume-analysis-job` dormant and
  untouched.** They are dead infra for resume (zero `src/` callers; the advertised 529→queue fallback
  in `useResumeStream.ts` was never implemented). This is not a cleanup milestone, and the **streaming
  lifecycle record (D-01) already covers the overload-recovery case** the queue fallback was meant to
  serve. Reviving it as a real fallback (a whole second lifecycle-integrated path) and retiring it
  (Phase-8/cleanup territory) are both **out of scope** for Phase 5 — recorded as a deferred idea so
  it is not lost.
- Rationale: keeps the phase focused on the streaming-record + onboarding-fix root causes; avoids
  scope creep + risk. Chosen over "wire the 529→queue fallback now" and "retire the dead endpoints."

### 4. Preserve-exactly boundary + duplicate guard (FEAT-02)
- **D-09 (byte-preserve):** Preserve **exactly** — Free single-call prompt/schema/**Haiku 4.5**/
  maxTokens 5000/quality-floor retry; Pro/Elite 4-call parallel + merge; the streaming partial-render
  UX + progress stages; the triple-write persistence targets (`resumes` + `analysis_results` +
  `analysis_cache`). No redesign/simplification/quality reduction.
- **D-10 (validation reconciliation — critical):** strict no-masking validation (LIFE-07) changes
  **failure handling only** — it fails a genuinely malformed / truncated / empty result honestly
  (specific terminal error + safe Merit refund) instead of rendering garbage; a currently-valid
  **success** output stays **byte-identical**. The resume feature-specific semantic check MUST be
  tuned so it never rejects an output the current lenient path accepts. Progressive **partial-summary**
  rendering during streaming is preserved (validation applies to the final accumulated result before
  persistence, not the in-flight partials).
- **D-11 (duplicate-submission disable — two layers, Pitfall 5):** backend **atomic partial-UNIQUE
  active-per-feature index** via `create_or_recover_analysis_run` **replaces the WR-04 status-window
  TOCTOU** (SELECT-active-then-INSERT) so N parallel identical submits yield **exactly 1 run + 1
  deduction**; frontend **submit-lock** (disable the analyze/submit control while a run is active, via
  `useAnalysisRun` state / `AnalysisLockContext`).
- **D-12 (CORS re-proof, not a new fix):** `analyze-resume` already uses `withCors(req,'user',…)`. The
  "confirmed production cross-origin failure" is the **historical apex-vs-`www` outage Phase 1 fixed
  centrally** (`APP_URL` → `ALLOWED_ORIGINS`). Phase 5 **re-verifies** it live for both `strivoai.net`
  and `www.strivoai.net` and guards it (preserve the `withCors` wrapper + deployed `ALLOWED_ORIGINS`
  includes both origins; keep `auth.ts` CORS-attached 401s).

### Claude's Discretion
- The exact **stable input-identity hash + canonical serialization** for Resume/Onboarding
  cache/idempotency identity (resume content-hash + resumeId + tier + variant; order-independent,
  collision-resistant, **never** a save-mutated field) — follows the LOCKED Phase-3 `deriveIdempotencyKey`
  contract; the exact source fields are Claude's.
- The precise shape of the **streaming-aware lifecycle wrapper** (D-02) — how the SSE handler drives
  `create_or_recover` → `transition_analysis_run` around the stream, where the merit reserve/settle
  sits relative to the TransformStream, how the accumulated result is validated before save. The
  invariant is "reserve→stream→validate→save→settle-on-saved, executor contract untouched, UX
  byte-preserved," not a specific wiring.
- Reconciling the executor's single-value `save` contract with `analyze-resume`'s current **triple-write**
  (`resumes` + `analysis_results` + `analysis_cache`) — which write is the authoritative
  throws-pre-settle `save` (recommend `resumes.grading_data` since Results.tsx/History read it) and
  which are post-save best-effort log-and-continue (mirror the Phase-4 `grade-linkedin` save() pattern).
- Whether Onboarding invokes the lifecycle **in the edge function** (`analyze-resume` calls
  `runAnalysisLifecycle('onboarding')` when the run originates from onboarding) vs a distinct trigger —
  provided onboarding gets a persisted `run_id` the frontend re-attaches to. The feature flag split
  (`resume` vs `onboarding`) is already defined; Claude decides how the one `analyze-resume` endpoint
  distinguishes the two features' runs.
- The **plan sub-ordering** (ROADMAP sketch 05-01 Onboarding → 05-02 Resume streaming record → 05-03
  scenario coverage is a starting point) — provided Onboarding's full-executor adoption + hang fix
  lands, the streaming path gets its record + idempotency key without latency regression, and the
  FEAT-01/FEAT-02 scenario matrix folds into `verify:baseline` last.
- The exact **frontend recovery wiring** for the streaming path (how `useResumeStream` and
  `useAnalysisRun` coexist — whether `useResumeStream` gains run_id/recovery or `useAnalysisRun`
  wraps it) — the contract is "run_id-backed refresh/navigation recovery + preserve-previous-success +
  submit-lock," the composition is Claude's.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### This phase's requirements + roadmap
- `.planning/ROADMAP.md` (Phase 5 section, L154-172) — goal, 4 success criteria (onboarding hang
  resolution list, preserve-exactly + streaming persistent record, CORS + duplicate-submission,
  scenario coverage), plan sketch 05-01..05-03.
- `.planning/REQUIREMENTS.md` — FEAT-01 (full onboarding-hang criteria) + FEAT-02 (preserve-exactly +
  reliability + CORS); Traceability (FEAT-01/FEAT-02 → Phase 5).

### The substrate this phase adopts (LOCKED contracts — read first)
- `.planning/phases/03-shared-analysis-lifecycle-substrate/03-CONTEXT.md` — every substrate contract
  (D-02 edge-derived idempotency key, D-03 in-process bounded-retry + persisted fallback, D-04
  two-level dormancy flags, D-06 charge-per-deliberate-run, reaper, recovery hook).
- `.planning/phases/04-feature-migration-a-recruiting-lens-linkedin-grader/04-CONTEXT.md` — the proven
  adoption pattern (preserve-exactly wiring + save-before-settle Merit-bug fixes + CORS re-proof) this
  phase mirrors for Resume/Onboarding.
- `supabase/functions/_shared/analysis-lifecycle.ts` — `runAnalysisLifecycle` executor (L212), dormancy
  early-return, mandatory CAS sequence, single-source idempotency key (L233-239), refund-exactly-once
  pre-saving (`refundAndFail` L291-304), settle-on-saved (L366), transient-only retry (`classifyFailure`
  L108-141). **Reserved for non-streaming resume + onboarding; NOT to be made streaming-aware.**
- `supabase/functions/_shared/analysis-flags.ts` — `AnalysisFeature` union incl. `'resume'` +
  `'onboarding'` (L37-42); env map `ANALYSIS_LIFECYCLE_RESUME` / `ANALYSIS_LIFECYCLE_ONBOARDING`
  (L56-62), fail-closed exact-`'true'` two-level gate (L48-53).
- `supabase/functions/_shared/merit-gateway.ts` — `withMerits` (forwards `p_idempotency_key`), 4-arg
  `check_and_deduct_merits`, `MeritRefundable`, `refundMeritsForJob`, `MERIT_SYSTEM_ENABLED`.
- `supabase/functions/_shared/llm-validation.ts` — strict no-masking validation the resume
  feature-specific semantic check plugs into (D-10).
- `supabase/functions/get-analysis-run-status/index.ts` + `src/hooks/useAnalysisRun.ts`
  (subscribe-first/poll-fallback, run_id URL+localStorage, retry-only-retryable, preserve-previous) +
  `src/lib/analysisError.ts` + `src/config/feature-flags.ts` (`isAnalysisLifecycleEnabled`, L43).

### Resume Analysis — current code (preserve-exactly + streaming record)
- `supabase/functions/analyze-resume/index.ts` (~1093L) — `withCors(req,'user',…,{extraHeaders:
  'x-internal-job-secret'})` wrapper (L632-1093, preserve); `withMerits` at L729 with **NO idempotency
  key** — `meritCtx` L728 is `{userId,tier,corsType}` only (gap to close); per-tier merit cost L336
  (`{free:3,pro:2,elite:3}`); streaming branch `rawBody.stream===true` (L800) TransformStream chunk/
  complete/error (L801-965); Free single-call `executeFreeAnalysis` (L562-630, L814); Pro/Elite 4-call
  `executeParallelCalls` (L849); non-streaming mirror (L967-1071); `precheck_cache` (L1074-1078);
  triple-write `persistAndCacheResumeResult` → `completeAndRecordSuccess` (L71): `resumes`
  (`grading_data`/`overall_score`, owner-scoped L90-94), `analysis_results` (`analysis_type:
  'resume_analysis'`, `source_reference:resumeId`, L26/L39-57), `analysis_cache`
  (`writeResumeAnalysisCache` L224); usage log-and-continue no-refund (L108-120); server-side merit
  refund on failure (L986).
- `src/hooks/useResumeStream.ts` — streaming-only `fetch` of `analyze-resume` `stream:true`
  (L147-163) + hand-parsed SSE loop (L208-338); `extractPartialSummary` progressive render;
  **529→queue fallback comment at L111-117 is a LIE (never implemented)** — `!response.ok` just
  `rollback`+error (L193-206); does NOT reference `useAnalysisRun` / `VITE_FEATURE_ANALYSIS_LIFECYCLE`.
- `src/pages/Upload.tsx` — always writes `sessionStorage['stream_params_<id>']` + navigates to
  `/results/<id>?stream=true` (L204-218) — the streaming-vs-queue decision (always streams).
- `src/pages/Results.tsx` — runs `useResumeStream` only when `?stream=true` + params present
  (L235-237); on refresh strips `?stream` → DB polling fallback (L221-233); **owns "Analysis Taking
  Longer Than Expected"** (L604-625, fires on `analysisTimedOut && !resume?.grading_data`); hard
  `MAX_POLLING_TIME=120000` timer (L213, L506-511); distinct job-failure (L575-602, needs `jobId`) +
  stream-error (L629-657, needs `?stream`) screens onboarding never reaches; 90s stuck safeguard +
  Realtime subscription on `resumes` (L264-291, L408-423).

### Onboarding — current code (the hang, being repaired)
- `src/pages/Onboarding.tsx` — `handleFinishSetup` (L253-389): awaited upload → signed URL → `resumes`
  insert (L267-297); optional LinkedIn PDF (L304-315); awaited `extractDocumentFromFile` incl. OCR
  (L360-365); **fire-and-forget `invokeWithTimeout('analyze-resume',{body:{resumeText,resumeId,userId,
  tier:'free'}},120000)`** with NO `stream`/jobId/run_id (L372-376); **navigates immediately** to
  `/results/${resume.id}` with NO query params (L379) + `.catch()` that only `console.error`s (L382).
- `src/lib/document-extraction.ts` — `extractDocumentFromPdf` → `ocr-pdf` fallback (L207-221),
  accepted-text persistence round-trip (L245-259), awaited before navigation.
- `src/lib/fetchWithTimeout.ts` — `invokeWithTimeout` uses `Promise.race` + `setTimeout`, **no
  AbortController** (L30-42) — nothing tracks/resumes the request server-side (root of the abandonment).
- `supabase/functions/_shared/tier-config.ts` — `FREE_MODEL='claude-haiku-4-5-20251001'` (L55,
  L107-111, hard-locked); `getTimeout('free')=50_000` (L28); Free single-call model routing.

### Persistence + History
- `src/pages/AnalysisHistory.tsx` — reads `analysis_results` filtered `analysis_type==='resume_analysis'`
  (L200-212); `getEntryRoute` → `/results/${source_reference}` (L293-308); `AnalysisHistory.phase22.test.ts`
  asserts `/results/{id}` routing (must stay green).
- DB: `analysis_results` (`analysis_type`, `source_reference`, `primary_score`, `raw_response`) +
  `resumes` (`grading_data`, `overall_score`) + `analysis_cache` + `analysis_jobs` (lifecycle row).

### Research (the WHY — line-cited)
- `.planning/research/PITFALLS.md` — Pitfall 1 (idempotency key never forwarded → D-01/D-03), Pitfall 4
  (L82-99: stuck non-terminal states + reaper = the "Taking Longer Than Expected" hang, "W4
  specifically for the Onboarding hang" → D-04/D-05), Pitfall 5 (status-window dedup ≠ idempotency /
  TOCTOU → D-11), Pitfall 8 (save-mutated cache key → idempotency identity), Pitfall 9 (validation
  masking → D-10).
- `.planning/research/ARCHITECTURE.md` — L41 (Resume dual-path table: "Streaming path: no server
  record"), L319/L381 ("streaming resume gains a lifecycle record at stream start"; onboarding fixed
  by run-id re-attach), **L439 ("Streaming resume path + lifecycle record … the one place the dual
  path needs care … Flag this phase for deeper design" → D-01/D-02)**.
- `.planning/research/SUMMARY.md` — L115 (`submit-resume-analysis-job` WR-04 status-window TOCTOU →
  replace with atomic partial-unique + `create_or_recover_analysis_run` → D-11).
- `src/components/UniversalAnalyzing.tsx` — the named-stage / asymptotic-progress component (honest
  progress pattern for D-05).

### Operator / DB gate + tests
- `CLAUDE.md` (Supabase MCP rules): Claude read-only on prod (`zjpjapgraoxdukdvpjes`); test preview
  (`cimjltzovkahkqecpwgi`) first; operator applies prod migrations; pause for operator checkpoint on
  any RLS / DB-function / realtime / grant change; rollback SQL per migration; advisor floor 15 must
  not increase. (Adoption is flag + code; the lifecycle DB schema already shipped in Phase 3 — any
  new index/grant touch is operator-gated.)
- `TESTING-STRATEGY.md` + `supabase/functions/deno.json` `test:ci` allowlist + `deploy.ps1`
  `verify:baseline` gate — where the FEAT-01/FEAT-02 scenario matrix (first/second/consecutive,
  duplicate-click, refresh, navigation, missing/corrupted/large/reused/replacement input, provider
  timeout/rate-limit, invalid/truncated output, save failure, Merit reserve/settle/release/refund)
  folds in (a green baseline only proves pre-existing behavior — new guards mandatory).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **The whole Phase 3 lifecycle** (`analysis-lifecycle.ts` executor + `llm-validation.ts` +
  `useAnalysisRun` + `get-analysis-run-status` + `analysis-flags.ts` `resume`/`onboarding` flags) —
  dormant, waiting to be flipped. Onboarding = clean full-executor adoption.
- **The Phase-4 `grade-linkedin` / `recruiting-lens` adoption pattern** — derive stable `inputIdentity`
  + `attemptNonce`, call `runAnalysisLifecycle(...)` inside the merit branch, dormancy fall-through to
  the byte-identical legacy path when the flag is OFF. Mirror it for Onboarding (executor) and adapt it
  for the streaming path (direct RPC orchestration, D-02).
- **`analyze-resume` triple-write + `withCors` wrapper + Free/Pro/Elite prompt paths** — CORS-correct
  and product-approved; preserve verbatim, add only the idempotency key + lifecycle record.
- **`withMerits` 4-arg idempotent seam** — supports the key; the streaming path just needs to derive +
  pass it (the concrete gap at `index.ts:728`).
- **`useAnalysisRun` + `get-analysis-run-status`** — the recovery machinery both features flip onto;
  already wired (dormant) into LinkedIn/RecruitingLens as the reference.
- **`UniversalAnalyzing`** — the honest named-stage progress component for the onboarding wait UX (D-05).

### Established Patterns
- **`withCors(req,'user',handler)` wrapper** — the CORS contract; the resume re-proof is "keep intact +
  `ALLOWED_ORIGINS` has apex+www," not a code fix (D-12).
- **`runAnalysisLifecycle(feature, {inputIdentity, attemptNonce, extract, generate, schema,
  validationOpts, save})` + dormancy fall-through** — the Phase-4 adoption shape (grade-linkedin
  L344-510, recruiting-lens L565-684).
- **save() throws-pre-settle; mirror writes post-save best-effort log-and-continue** — the Pitfall 2/3
  fix pattern to apply to the resume triple-write (D-09 discretion).
- **Strict no-masking validation fails FAILURE only, success byte-identical** (D-10).
- **Per-feature flag flip in ascending blast-radius order** — Resume + Onboarding (higher traffic than
  Phase 4's Recruiting Lens + LinkedIn), each independently.

### Integration Points
- Per-feature lifecycle flags `ANALYSIS_LIFECYCLE_RESUME` / `ANALYSIS_LIFECYCLE_ONBOARDING` +
  `ANALYSIS_LIFECYCLE_ENABLED` kill-switch + frontend `VITE_FEATURE_ANALYSIS_LIFECYCLE`.
- `withMerits(ctx, feature, fn, { idempotencyKey })` — Phase 5 supplies each feature's **input-identity**
  (resume content-hash + resumeId + tier), never a save-mutated field.
- `analysis_jobs` lifecycle row + `create_or_recover_analysis_run` partial-UNIQUE active index (the
  duplicate-submission backstop, D-11) + `get-analysis-run-status` + `useAnalysisRun`.
- `analyze-resume` streaming TransformStream — the persistent record wraps it without touching the
  token path (D-01/D-02).
- `deno.json` `test:ci` + `verify:baseline` — FEAT-01/FEAT-02 scenario + idempotency + refresh-recovery
  + preserve-exactly guards register here.

</code_context>

<specifics>
## Specific Ideas

- **Onboarding is the product repair; Resume Analysis is a preserve-exactly wiring job with one hard
  spot (the streaming record).** Weight planning effort accordingly.
- **The "dual path" is streaming-only in practice** — `analyze-resume` SSE is live; the async queue
  (`submit/process-resume-analysis-job`) is orphaned backend infra (zero `src/` callers; the 529→queue
  fallback was never wired). Do NOT treat the queue as a live path to migrate (D-08).
- **The onboarding hang is a frontend-abandonment bug, not a backend failure** — the analysis often
  completes and persists moments after the 120s cap fires; Merits are already refunded server-side, so
  credits aren't lost — the fix is **run-id-backed persistence + recovery + honest terminal states**,
  not a longer timeout (Pitfall 4).
- **The persistent streaming record subsumes the never-wired 529→queue fallback** — a mid-stream
  overload lands the run in `retryable_failed` for `useAnalysisRun` Retry, which is why reviving the
  queue path is unnecessary (D-01/D-08).
- **Preserve-exactly means the SUCCESS output is byte-identical; strict validation only changes FAILURE
  handling** — tune the resume semantic check so it never rejects a currently-valid output (D-10). This
  is the one place preserve-exactly and strict-no-masking could collide.
- **Do NOT make the LOCKED request/response executor streaming-aware** — the streaming path orchestrates
  the lifecycle RPCs directly (D-02); the executor is reserved for non-streaming resume + onboarding.
- Fix the streaming path's missing idempotency key (`index.ts:728`) as part of the migration — today
  every resume deduction is non-idempotent (dedup relies only on `analysis_cache`).

</specifics>

<deferred>
## Deferred Ideas

- **Proactive "proceed into the app + notify when ready" onboarding UX** (D-06 alt) — a slow onboarding
  run lets the user leave the results screen and surfaces the result via notification/History later.
  Deferred as scope beyond the FEAT-01 root-cause fix; overlaps Phase 7 dashboard surfacing.
- **Reviving the orphaned resume async queue as a real 529→queue overload fallback** (D-08 alt) — wire
  `submit-resume-analysis-job` into `useResumeStream` on 529 as a lifecycle-integrated second path.
  Deferred — the streaming lifecycle record covers overload recovery; revisit only if overload
  resilience becomes a priority.
- **Retiring the dead `submit/process-resume-analysis-job` endpoints** — a cleanup concern, not this
  trust-milestone's scope (candidate for Phase 8 / a future hygiene pass).
- **Career Compass full-pipeline migration** (FEAT-05) → **Phase 6** (migrated last, most complex).
- **Dashboard intelligence reading the stored resume analysis data** (DASH-01..06) → **Phase 7** (after
  features store genuine data).
- **Any new Resume Analysis / Onboarding product capability** (new output sections, redesign,
  streaming for onboarding) — out of scope; this phase is migration + hang-repair + preserve-exactly.

### Reviewed Todos (not folded)
None — `todo.match-phase 5` returned 0 matches.

</deferred>

---

*Phase: 05-feature-migration-b-resume-analysis-onboarding*
*Context gathered: 2026-07-05*
