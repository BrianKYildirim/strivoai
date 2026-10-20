# Phase 6: Feature Migration C — Career Compass - Context

**Gathered:** 2026-07-06
**Status:** Ready for planning

> **ERRATUM (2026-07-06, from 06-RESEARCH Open Question 1 — HIGH static confidence, pending live probe):**
> Decisions D-01/D-03/D-07/D-08 below line-reference `analyze-career`'s **merit-branch**
> (`index.ts:854–1321`: prior-analyses 412 gates, Pro/Elite parallel fan-out, elite-extras) as "the live
> path." Static call-graph analysis shows this is likely **wrong**: the LIVE main path (submit → worker →
> `analyze-career` internal via `x-internal-job-secret`) makes `requireInternalAuth` return null →
> `userContext` null → the merit-branch gate (`:854 MERIT_SYSTEM_ENABLED && userContext`) is FALSE and
> `body.tier` is never destructured (`:815`) → the live queue path runs the **LEGACY branch
> (`:1323+`) at `resolvedTier='free'`**, with Merits deducted in **submit** (`:96`). The merit-branch is
> reachable only via a **direct user-auth POST** (the frontend uses that only for multi-role compare,
> D-06). **Plan 06-01 Task 1 must confirm the live branch (read-only, operator-gated) BEFORE the executor
> attaches.** If confirmed (H2), the byte-preserve baseline + executor attachment site is the legacy
> free-tier branch, not the merit-branch — read `06-RESEARCH.md §Open Questions` + `06-01-PLAN.md` Task 1
> as the authority over the merit-branch line-refs below. Do NOT silently "fix" tier resolution inside
> this migration (out of FEAT-05 scope).

<domain>
## Phase Boundary

Route the **most complex feature — Career Compass** onto the **dormant Phase 3 shared analysis
lifecycle** (authenticate → validate inputs → create/recover run → atomically reserve Merits →
extract → generate → strictly validate output → save → settle-on-saved → complete → recover),
behind its per-feature flag (`ANALYSIS_LIFECYCLE_CAREER_COMPASS`, default OFF), so its full pipeline
works reliably across **resume-only / LinkedIn-only / combined** input states, persists every output
structure (Career DNA, career fields, gaps, surprise fits, roadmaps) with backend↔DB↔frontend
alignment, and the confirmed production cross-origin failure is corrected.

Like Phases 4–5, this is a **migration + reliability** phase, not a redesign. Career Compass leans
**preserve-exactly** on product behavior (input gates, output shape, prompts, tiers) while gaining
the shared reliability / persistence / idempotency / Merit-safety / recovery / History / structured
errors, and **one real repair**: the async-queue **180s poll-cap that abandons slow runs** (the
onboarding-hang analog) is replaced by run_id-backed recovery.

**Requirements:** FEAT-05 (correct latest resume+LinkedIn retrieval; product-correct
resume-only/LinkedIn-only/combined; input validation before Merit reservation; compatible
extraction+analysis schemas; correct Free-tier prompt/model/endpoint/limits; complete+valid output
with malformed/truncation detection; persistence of Career DNA/fields/gaps/surprise-fits/roadmaps;
backend↔DB↔frontend alignment; large-result safety; Merit settlement only after successful storage;
no fake personalized result after a real failure; production cross-origin failure corrected).

This phase clarifies **HOW** Career Compass adopts the substrate. It **does NOT** re-debate the
Phase 3 substrate contracts — those are **LOCKED and carried in**. It must keep `verify:baseline`
green and fold its new scenario coverage in.

**Carried in from Phases 3–5 (LOCKED — do not re-open):**
- The 11-state lifecycle, `create_or_recover_analysis_run()` / `transition_analysis_run()` CAS RPCs,
  partial-UNIQUE active-per-feature index, `CHECK (NOT (merit_settled AND refunded))`, legacy
  `status` dual-write, Realtime.
- **Edge-derived idempotency key** = `deriveIdempotencyKey(sha256 over sorted-key JSON of
  {userId, feature, tier, inputIdentity, attemptNonce})`; `inputIdentity` is opaque/caller-supplied
  and **never a save-mutated field** (Pitfall 8). `withMerits` already forwards
  `ctx.idempotencyKey ?? null` to the 4-arg `check_and_deduct_merits`; **Phase 6 supplies Career
  Compass's input-identity + attempt-nonce and threads the key** (career's `withMerits` passes NO
  key today — see D-03).
- Refund/release **exactly once ONLY on a post-reserve pre-`saving` failure**; `saving → completed`
  is the point of no return; never charge for missing input / invalid output / unsaved result.
- Strict **no-masking** `_shared/llm-validation.ts` (`validateModelOutput`) contract: an
  invalid/malformed/truncated response is NEVER silently replaced with a fixed / empty / generic /
  fabricated result (SC-3: "a fake personalized result is never substituted after a real failure").
- Structured error taxonomy (13 codes) + safe user-facing messages; `useAnalysisRun` recovery hook
  (subscribe-first / poll-fallback, `run_id` persistence, refresh/navigation recovery,
  retry-only-retryable, preserve-previous-success, Merit reserve/charge/release/refund messaging);
  the `career_compass` per-feature flag + `ANALYSIS_LIFECYCLE_ENABLED` kill-switch + frontend
  `VITE_FEATURE_ANALYSIS_LIFECYCLE` gate.
- The Phase 3 **reaper** (`reap-stale-analysis-runs` + pg_cron) — armed, the durable safety net for
  genuinely dead runs (replaces the frontend 180s poll-cap for deadness — see D-04).
- **Proven adoption pattern (Phases 4–5):** derive stable `inputIdentity` + `attemptNonce`, call
  `runAnalysisLifecycle(...)` inside the merit branch, **dormancy fall-through** to the byte-identical
  legacy path when the flag is OFF; `save()` throws-pre-settle, mirror writes post-save
  log-and-continue; strict validation changes FAILURE handling only (success byte-identical); CORS
  re-proof (keep `withCors` + `ALLOWED_ORIGINS` apex+www), not a code fix.
- **Operator stance (carried from Phases 2–5): MAXIMAL thoroughness / complete-the-migration.** The
  feature rides the full lifecycle end-to-end (no scoped-down skeleton). Operator-gated preview→prod
  for any DB/RLS/realtime/grant touch; rollback SQL per migration; advisor floor **15 must not
  increase**. (The lifecycle DB schema already shipped in Phase 3 — new index/grant touches are
  operator-gated.)

</domain>

<decisions>
## Implementation Decisions

### 1. Input-state contract — preserve current gates, formalize (resume-only / LinkedIn-only / combined)
- **D-01:** **Preserve the existing prior-sourced input model byte-identically.** Career Compass
  today sources from **cross-feature memory** (latest prior Resume Analysis `resumes.grading_data` +
  latest LinkedIn Grader `linkedin_grades.grading_data`), not raw text — and enforces product gates
  **before** Merit reservation:
  - **Free single-call path** requires BOTH priors → `412 missing_prior_analyses` (with `missing[]`)
    if either absent (`index.ts:909-919`).
  - **Pro/Elite main path** requires a LinkedIn signal (prior OR fresh PDF) unless `allowResumeOnly`
    → `412 linkedin_prior_missing` gate (`index.ts:933-946`); the frontend surfaces the D-16
    fallback dialog (`CareerCompass.tsx:633-636`).
  - "**LinkedIn-only**" is **not** a distinct product path today; the closest real state is the
    `allowResumeOnly` **resume-only** fallback. FEAT-05's "product-correct resume-only /
    LinkedIn-only / combined behavior" is satisfied by **keeping these gates working correctly
    through the migration** (each input state produces its current correct behavior/412), NOT by
    inventing a new LinkedIn-only analysis. Building a genuine standalone LinkedIn-only Career
    Compass is **deferred**.
- **D-02 (validate-before-reserve is already correct — preserve it):** the 412 prior/input gates and
  the `!isFreeSingleCallPath` upload-field validation (`index.ts:956-975`) already run **before**
  `withMerits` (Phase-2 CR-01/CR-02). The lifecycle's "validate inputs before reserve Merits" step
  maps onto this existing ordering — **no charge on any missing-input / 412 response**.

### 2. Live dual path — migrate the async worker + fix the poll-cap hang; keep multi-role compare outside
- **D-03 (the migration target — the 3-function async dance):** Career's **LIVE main path is the
  async queue**, a three-function dance, NOT the direct call:
  `submit-career-analysis-job` (**`withCors` + `withMerits('career_compass')` deducts here**, WR-04
  active-job check, inserts an `analysis_jobs` row) → triggers `process-career-analysis-job` (worker)
  → worker `fetch`es `analyze-career` internally (`TARGET_FUNCTION`, internal auth, `userContext`
  null so its own `withMerits` is skipped) → `analyze-career` runs AI + persists. **The lifecycle run
  must span this dance with ONE idempotency key.** Career's `withMerits` passes **no key today**
  (submit `index.ts:96`; analyze-career `index.ts:1000-1002` ctx = `{userId,tier,corsType}` only) —
  **closing that gap is a Phase 6 deliverable**, mirroring the Phase 5 `analyze-resume:728` fix.
- **D-04 (poll-cap hang = the real repair, onboarding analog):** the frontend
  `MAX_POLL_MS = 180000` (`CareerCompass.tsx:664`) abandons a slow-but-alive run after 3 min — the
  same class as the onboarding 120s hang (Pitfall 4). Replace it with **`run_id` + `useAnalysisRun`
  recovery** (subscribe-first / poll-fallback, `run_id` in URL+localStorage, refresh/navigation
  recovers the live run); genuine failures reach a **specific terminal state** (never an endless
  spinner or fabricated success). Deadness is owned by the lifecycle terminal states + the Phase-3
  reaper, not a frontend timer.
- **D-05 (existing `analysis_jobs` row ↔ lifecycle ledger reconciliation — critical):** submit
  already creates an `analysis_jobs` row (WR-04 SELECT-active-then-INSERT + status window) and
  deducts Merits. The lifecycle's `create_or_recover_analysis_run` **is** the `analysis_jobs` ledger
  (Phase 3 maps INTO it) + a **partial-UNIQUE active-per-feature index**. Phase 6 **reconciles these
  onto the atomic `create_or_recover_analysis_run`** so the WR-04 status-window TOCTOU is replaced by
  the atomic index (N parallel submits → exactly 1 run + 1 deduction), same as Phase 5 D-11.
- **D-06 (multi-role compare + `?id=` stay OUTSIDE the lifecycle):** the **direct** `analyze-career`
  path is used only for **multi-role comparison** (`invokeCareerAnalysisDirectWithFailover`,
  `CareerCompass.tsx:246-247`, `compareRoles`) — a lightweight sub-path with **no PDF ingest and a
  merit-worthy-but-distinct shape** — and for **`?id=` deep-link hydration** (read-only). Keep
  multi-role compare on its current direct path (it may keep its existing in-`withMerits` handling);
  do **not** force it through `runAnalysisLifecycle`. The lifecycle owns the **main
  resume+LinkedIn analysis** only.

### 3. Output rigor — core structures mandatory-for-save, elite-extras best-effort
- **D-07 (strict gate scope):** define "complete valid output" as the **core structures**
  (`careerDNA`, `careerFields`, `surpriseFits`, `skillGaps`/gaps, `roleRoadmaps`+`roadmap`,
  `roleReadinessBreakdown`, `roleReadinessScore`) — these are **save-blocking**: malformed / truncated
  / empty core output fails **honestly** (specific terminal error + safe Merit refund via
  `validateModelOutput`), never rendering garbage or a fabricated result (SC-3). A **zod schema +
  semantic check** for career plugs into the LOCKED `_shared/llm-validation.ts` seam (career has none
  today — only `repairTruncatedJSON` + `JSON.parse` at `index.ts:1047/1254/1772`).
- **D-08 (preserve elite-extras graceful partial):** the **elite `compensationIntelligence`** block
  is today **explicitly non-fatal** (`index.ts:1264-1268` "elite-extras-parse-failed … non-fatal") —
  a second fan-out call that degrades gracefully. **Preserve that**: elite extras are **best-effort
  post-core**, NOT part of the save-blocking strict gate. A missing/failed elite-extras block yields
  a valid core result (current behavior); it does not fail the run or refund. This mirrors Phase 5
  D-10 "strict validation changes FAILURE handling only; a currently-valid success stays
  byte-identical" — tune the career semantic check so it never rejects a currently-valid output.
- **D-09 (backend↔DB↔frontend alignment, SC-2):** the strict schema is the **single shape of truth**
  the frontend renders from. The frontend reads `analysis_results.raw_response` (**pinned, no
  fallback chain**, `CareerCompass.tsx:385`); the validated result written to `raw_response` must
  carry every core structure the UI + `src/components/career-compass/types.ts` expect. **Large-result
  safety**: verify the full multi-structure payload (roleRoadmaps 3×5 phases, careerFields,
  compensationIntelligence) persists + rehydrates intact.

### 4. Save contract — analysis_results authoritative, profiles + cache post-save best-effort
- **D-10:** the **`analysis_results` insert IS the authoritative throws-pre-settle `save`**
  (`persistCareerResultAndRecordUsage` → `analysis_results.insert({analysis_type:'career_compass',
  raw_response, …})`, throws `MeritRefundable(500)` on failure, `index.ts:312-329`) — the frontend +
  AnalysisHistory read it (`analysis_type='career_compass'`, `raw_response`). The **`profiles`
  update** (`index.ts:349`) and **`analysis_cache` upsert** (`index.ts:284-285`) are demoted to
  **post-save best-effort log-and-continue** (never refund-after-durable-save — the Phase-2 CR-02
  refund-after-save fix is already in place; keep it structural via settle-on-saved). NOTE: the
  `career_compass_analyses` table named in the `process-career-analysis-job` header comment
  (`index.ts:16,22`) is a **STALE COMMENT — no such table exists**; `analysis_results` is the real
  and only authoritative store.

### 5. CORS re-proof (not a new fix)
- **D-11:** `analyze-career` + `submit-career-analysis-job` already use `withCors(req,'user',…)`
  (analyze-career `index.ts:804`; submit `index.ts:28`). The "confirmed production cross-origin
  failure" is the **historical apex-vs-`www` outage Phase 1 fixed centrally** (`APP_URL` →
  `ALLOWED_ORIGINS`). Phase 6 **re-verifies it live** for both `strivoai.net` and `www.strivoai.net`
  (incl. on 401/412) and guards it (preserve the `withCors` wrappers; `ALLOWED_ORIGINS` includes both
  origins). `process-career-analysis-job` is an internal worker (`handleOptionsRequest` only, no
  browser CORS surface) — confirm it stays internal-auth.

### Claude's Discretion
- **Where `runAnalysisLifecycle('career_compass')` physically lives across the 3-function dance**
  (D-03): whether the executor is driven from `analyze-career` (where extract/generate/validate/save
  happen) with submit/process reduced to thin queue+trigger shells threading the run_id+key, or
  orchestrated from the process worker. The invariant is "one run, one key derived from submit's
  merit reservation, spanning submit→process→analyze-career; validate→save→settle-on-saved; executor
  contract untouched," not a specific wiring.
- The exact **stable `inputIdentity` + canonical serialization** for career cache/idempotency identity
  — must key off the **prior-analyses identity** the current cache uses (prior resume grading hash +
  prior linkedin grading hash + tier + variant + `allowResumeOnly`/`compareRoles`; see
  `buildCareerCacheKey` `index.ts:985-998`), **never** a save-mutated field (Pitfall 8), following the
  LOCKED `deriveIdempotencyKey` contract. Exact source fields are Claude's.
- The precise **career zod schema + semantic check** shape (D-07/D-08) — which fields are required vs
  optional, how the elite-extras non-fatal boundary is expressed, how `repairTruncatedJSON` composes
  with strict validation on the assembled final object. Contract: core save-blocking, elite-extras
  best-effort, success byte-identical.
- Reconciling the executor's single-value `save` with career's `analysis_results` insert + `profiles`
  update + `analysis_cache` upsert (D-10) — mirror the Phase-4/5 `save()` pattern (authoritative
  throws-pre-settle + post-save log-and-continue mirrors).
- Whether the **short-circuit / reuse paths** (Free single-call from priors; Pro/Elite both-priors
  short-circuit `index.ts:1017`) each get their own cache variant threaded through the run identity,
  or share one — provided each deterministic path derives a stable, non-mutating key.
- The **plan sub-ordering** (ROADMAP sketch 06-01 migrate onto lifecycle → 06-02 persist+render
  alignment + CORS → 06-03 scenario coverage is a starting point) — provided the async-worker
  migration + poll-cap hang fix + idempotency key land, output alignment + large-result safety hold,
  and the FEAT-05 scenario matrix folds into `verify:baseline` last.
- The exact **frontend recovery wiring** — how the existing poll loop (`CareerCompass.tsx:666-689`)
  and `useAnalysisRun` coexist (whether the poll loop is replaced by `useAnalysisRun` or wrapped);
  contract is "run_id-backed refresh/navigation recovery + preserve-previous-success + submit-lock,"
  composition is Claude's.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### This phase's requirements + roadmap
- `.planning/ROADMAP.md` (Phase 6 section, L182-200) — goal, 4 success criteria, plan sketch
  06-01..06-03.
- `.planning/REQUIREMENTS.md` — FEAT-05 (L47, full pipeline criteria); Traceability (FEAT-05 → Phase 6).

### The substrate this phase adopts (LOCKED contracts — read first)
- `.planning/phases/03-shared-analysis-lifecycle-substrate/03-CONTEXT.md` — every substrate contract
  (edge-derived idempotency key, in-process bounded-retry + persisted fallback, two-level dormancy
  flags, charge-per-deliberate-run, reaper, recovery hook).
- `.planning/phases/05-feature-migration-b-resume-analysis-onboarding/05-CONTEXT.md` — the closest
  precedent: onboarding hang-fix via run_id recovery (D-04/D-05 there → D-04 here), streaming/dual-path
  identity, byte-preserve + strict-validation reconciliation (D-10 there → D-07/D-08 here), save
  contract (D-09 there → D-10 here), CORS re-proof (D-12 there → D-11 here).
- `.planning/phases/04-feature-migration-a-recruiting-lens-linkedin-grader/04-CONTEXT.md` — the proven
  `runAnalysisLifecycle` adoption shape + dormancy fall-through + save-before-settle pattern.
- `supabase/functions/_shared/analysis-lifecycle.ts` — `runAnalysisLifecycle` executor
  (request/response-shaped; career is request/response so it fits — unlike Phase 5's streaming twist),
  mandatory CAS sequence, single-source idempotency key, refund-exactly-once pre-saving,
  settle-on-saved, transient-only retry (`classifyFailure`).
- `supabase/functions/_shared/analysis-flags.ts` — `AnalysisFeature` includes `'career_compass'`
  (L42); `FEATURE_ENV.career_compass = 'ANALYSIS_LIFECYCLE_CAREER_COMPASS'` (L61); fail-closed
  exact-`'true'` two-level gate; `isAnalysisFeatureEnabled('career_compass')`.
- `supabase/functions/_shared/merit-gateway.ts` — `withMerits` (forwards `p_idempotency_key`), 4-arg
  `check_and_deduct_merits`, `MeritRefundable`, `refundMeritsForJob`, `MERIT_SYSTEM_ENABLED`,
  `deriveIdempotencyKey`.
- `supabase/functions/_shared/llm-validation.ts` — the strict no-masking `validateModelOutput` seam
  the new career zod schema + semantic check plug into (D-07/D-08).
- `supabase/functions/get-analysis-run-status/index.ts` + `src/hooks/useAnalysisRun.ts` +
  `src/lib/analysisError.ts` + `src/config/feature-flags.ts` (`isAnalysisLifecycleEnabled`) — the
  recovery machinery Career Compass flips onto (D-04).

### Career Compass — current code (migrate + preserve-exactly)
- `supabase/functions/submit-career-analysis-job/index.ts` (264L) — **the merit-deducting entry of
  the LIVE async path**: `withCors(req,'user',…)` (L28); WR-04 active-job SELECT-then-INSERT on
  `analysis_jobs` (L72-91, → replace with atomic `create_or_recover_analysis_run`, D-05);
  `withMerits('career_compass', …)` (L96, **NO idempotency key** — gap to close, D-03); inserts
  `analysis_jobs` row (L114); triggers the worker.
- `supabase/functions/process-career-analysis-job/index.ts` (309L) — **the worker**: internal-auth
  (`requireAuth`), `fetch`es `TARGET_FUNCTION='analyze-career'` (L9, L130), `refundMeritsForJob`,
  self-continuation `fetch` (L278). **Stale comment** references a nonexistent
  `career_compass_analyses` table (L16, L22) — real store is `analysis_results` (D-10).
- `supabase/functions/analyze-career/index.ts` (1851L) — the AI core: `withCors(req,'user',…)` (L804,
  preserve); `withMerits('career_compass', {userId,tier,corsType})` (L1000-1002, **NO key** for the
  direct/legacy path); **input gates before withMerits** — Free-both-priors 412 (L909-919), Pro/Elite
  `linkedin_prior_missing` 412 + `allowResumeOnly` (L933-946), upload-field validation (L956-975);
  cross-feature-memory prior fetch (`resumes.grading_data` + `linkedin_grades.grading_data`,
  L878-906); path branches — Free single-call (L1018), Pro/Elite short-circuit (L1017), Pro/Elite full
  parallel fan-out (base L1254 + elite-extras **non-fatal** L1264-1268), multi-role compare
  (`handleMultiRoleComparison`, L1006); `scrapeLinkedInProfile` Firecrawl (L641); output schema in
  prompt JSON template (L1667) — `careerDNA`, `whatYouHave`, `skillGaps`, `resumeImprovements`,
  `roleReadinessBreakdown`, `careerFields`, `surpriseFits`, `roles`, `roleRoadmaps`, `roadmap`, elite
  `compensationIntelligence`; validation = `repairTruncatedJSON`+`JSON.parse` only (L1047/1254/1772,
  no zod today); persistence `persistCareerResultAndRecordUsage` → `analysis_results.insert` throws
  `MeritRefundable` (L312-329, authoritative) + `profiles` update (L349) + `analysis_cache` upsert
  (L284); `buildCareerCacheKey` (L985-998); per-tier model `getModel(tier,'career')` (L687, L841).
- `supabase/functions/_shared/career-prompts.ts` + `analyze-career/__tests__/career-shape.test.ts` —
  prompt builders + the existing output-shape contract test (preserve).

### Career Compass — frontend (preserve-exactly + recovery wiring)
- `src/pages/CareerCompass.tsx` (1372L) — LIVE async submit flow: optimistic `optimisticDeduct`
  (L588), `submit-career-analysis-job` (L591), **`MAX_POLL_MS=180000` poll loop** (L664-689, → replace
  with `useAnalysisRun` run_id recovery, D-04); 412 handling `missing_prior_analyses` (L622) +
  `linkedin_prior_missing` D-16 dialog (L633); **direct multi-role** `invokeCareerAnalysisDirectWithFailover`
  (L246, L433, `compareRoles`, stays outside lifecycle, D-06); `?id=` deep-link hydration (L272-296,
  L360); result read from `analysis_results.raw_response` **pinned** (L375-385); no `useAnalysisRun` /
  `run_id` / `attemptNonce` yet.
- `src/components/career-compass/types.ts` + `CareerDNACard.tsx` — the rendered output shape (D-09
  alignment target).
- `src/pages/CareerCompass.phase22.test.ts` + `__tests__/CareerCompass.prior-selectors.test.ts` —
  contract tests (prior-analyses selectors, phase22 shape) that must stay green.

### Persistence + History
- DB: `analysis_results` (`analysis_type='career_compass'`, `raw_response` jsonb, `primary_score`,
  `source_reference`) = authoritative; `resumes.grading_data` + `linkedin_grades.grading_data` =
  prior-analyses input source; `analysis_cache` = best-effort cache; `analysis_jobs` = lifecycle
  ledger (already used by submit).
- `src/pages/AnalysisHistory.tsx` — reads `analysis_results` filtered `analysis_type='career_compass'`;
  `?id=` route back into `CareerCompass` — keep green.

### Research (the WHY — line-cited)
- `.planning/research/PITFALLS.md` — Pitfall 1 (idempotency key never forwarded → D-03), Pitfall 4
  (stuck non-terminal / frontend-timeout abandonment → the 180s poll-cap hang, D-04), Pitfall 5
  (status-window dedup ≠ idempotency / TOCTOU → D-05), Pitfall 8 (save-mutated cache key → identity),
  Pitfall 9 (validation masking → D-07/D-08).
- `.planning/research/ARCHITECTURE.md` — Career Compass = "migrated last, most complex" (multi-input
  matrix + cross-feature memory + async queue).

### Operator / DB gate + tests
- `CLAUDE.md` (Supabase MCP rules): Claude read-only on prod (`zjpjapgraoxdukdvpjes`); test preview
  (`cimjltzovkahkqecpwgi`) first; operator applies prod migrations; pause for operator checkpoint on
  any RLS / DB-function / realtime / grant change; rollback SQL per migration; advisor floor 15 must
  not increase. (Adoption is flag + code; lifecycle schema shipped in Phase 3 — any new index/grant
  touch is operator-gated.) Honor operator checkpoints over auto-mode for live smokes.
- `TESTING-STRATEGY.md` + `supabase/functions/deno.json` `test:ci` allowlist + `deploy.ps1`
  `verify:baseline` gate — where the FEAT-05 scenario matrix (resume-only/LinkedIn-only/combined,
  first/second/consecutive, duplicate-click, refresh, navigation, missing/reused/replacement input,
  provider timeout/rate-limit, invalid/truncated/large output, save failure, Merit
  reserve/settle/release/refund, History, apex+www CORS) folds in (a green baseline only proves
  pre-existing behavior — new guards mandatory). Career's existing tests: `analyze-career/__tests__/`
  (failure-branches, refund-after-save, cache, phase22-contract, paid-output-validation).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **The whole Phase 3 lifecycle** (`analysis-lifecycle.ts` executor + `llm-validation.ts` +
  `useAnalysisRun` + `get-analysis-run-status` + `analysis-flags.ts` `career_compass` flag) —
  dormant, waiting to be flipped. Career is **request/response**, so the executor fits directly
  (no streaming twist like Phase 5).
- **The Phase-4/5 adoption pattern** — derive stable `inputIdentity` + `attemptNonce`, call
  `runAnalysisLifecycle(...)` inside the merit branch, dormancy fall-through to the byte-identical
  legacy path when OFF. Career adds the wrinkle that merit deduction lives in **submit** and analysis
  in **analyze-career** (the 3-function dance, D-03).
- **`analyze-career` prior-analyses fetch + 412 gates + prompt paths + `withCors`** — CORS-correct
  and product-approved; preserve verbatim, add only the idempotency key + lifecycle run + strict
  validation.
- **`withMerits` 4-arg idempotent seam** — supports the key; submit + analyze-career just need to
  derive + pass it (gaps at submit `index.ts:96` and analyze-career `index.ts:1000`).
- **`useAnalysisRun` + `get-analysis-run-status`** — the recovery machinery replacing the 180s poll
  cap (D-04); already wired dormant into LinkedIn/RecruitingLens/Resume/Onboarding as reference.
- **`repairTruncatedJSON`** — keep; compose it with the new strict zod validation on the assembled
  final object.

### Established Patterns
- **`withCors(req,'user',handler)` wrapper** — the CORS contract; career re-proof is "keep intact +
  `ALLOWED_ORIGINS` has apex+www," not a code fix (D-11).
- **`runAnalysisLifecycle(feature, {inputIdentity, attemptNonce, extract, generate, schema,
  validationOpts, save})` + dormancy fall-through** — the Phase-4 adoption shape.
- **save() throws-pre-settle; mirror writes post-save best-effort log-and-continue** — apply to
  `analysis_results` (authoritative) + `profiles`/`analysis_cache` (mirrors), D-10.
- **Strict no-masking validation fails FAILURE only, success byte-identical** (D-07/D-08); elite
  extras stay non-fatal.
- **Atomic `create_or_recover_analysis_run` replaces WR-04 status-window TOCTOU** — D-05, mirrors
  Phase 5 D-11.

### Integration Points
- Per-feature flag `ANALYSIS_LIFECYCLE_CAREER_COMPASS` + `ANALYSIS_LIFECYCLE_ENABLED` kill-switch +
  frontend `VITE_FEATURE_ANALYSIS_LIFECYCLE`.
- `withMerits(ctx, 'career_compass', fn, { idempotencyKey })` — Phase 6 supplies the prior-analyses
  input-identity (prior resume + linkedin grading hashes + tier + variant), never a save-mutated
  field; the key must span submit→process→analyze-career (D-03).
- `analysis_jobs` lifecycle row via `create_or_recover_analysis_run` (reconciling submit's existing
  insert) + partial-UNIQUE active index (duplicate-submission backstop, D-05) +
  `get-analysis-run-status` + `useAnalysisRun`.
- `analysis_results.raw_response` (pinned frontend read) — the validated core-structure shape must
  align (D-09).
- `deno.json` `test:ci` + `verify:baseline` — FEAT-05 scenario + idempotency + refresh-recovery +
  input-matrix + byte-preserve guards register here.

</code_context>

<specifics>
## Specific Ideas

- **Career Compass is a preserve-exactly migration with ONE real repair** (the 180s async poll-cap
  hang, D-04) — like Phase 5's Resume(preserve) + Onboarding(repair) split, but here both live in one
  feature. Weight planning effort toward the async-path migration + poll-cap fix + the 3-function
  idempotency-key thread.
- **The LIVE path is the async queue, NOT the direct call** — `submit → process worker → analyze-career`.
  Merits are deducted in **submit** (`withMerits` L96), analysis runs in **analyze-career** (called
  internally, merits skipped there). The direct `analyze-career` call is only **multi-role compare +
  `?id=` hydration** (D-06). Do not mistake analyze-career's own `withMerits` (L1000) for the live
  main-path deduction.
- **The input model is cross-feature memory, not raw text** — Career Compass reads the latest prior
  `resumes.grading_data` + `linkedin_grades.grading_data`. "resume-only / LinkedIn-only / combined"
  maps onto the Free-both-priors gate + Pro/Elite `linkedin_prior_missing`/`allowResumeOnly` fallback,
  NOT three independent analysis engines. Preserve those gates; a genuine LinkedIn-only engine is
  deferred (D-01).
- **Elite `compensationIntelligence` is deliberately non-fatal today** — a second fan-out call that
  degrades gracefully (L1264-1268). Strict no-masking applies to the **core** result; keep elite
  extras best-effort so the migration doesn't regress graceful partial output (D-08).
- **`career_compass_analyses` does not exist** — it's a stale comment in the worker header
  (`process-career-analysis-job/index.ts:16,22`). The authoritative store is `analysis_results`
  (`analysis_type='career_compass'`, `raw_response`), which the frontend reads pinned (D-10).
- **Career is request/response** — the Phase-3 executor fits directly; there is **no streaming twist**
  (that was Phase 5's Resume-specific hard spot). The hard spot here is the **3-function merit/analysis
  split** + the **existing `analysis_jobs` row reconciliation** (D-03/D-05).
- **Refund-after-save is already fixed for career** (Phase-2 CR-02) — post-save usage writes are
  log-and-continue; keep it structural via settle-on-saved.

</specifics>

<deferred>
## Deferred Ideas

- **A genuine standalone LinkedIn-only Career Compass engine** (D-01 alt) — a real analysis path that
  runs on LinkedIn input alone (no resume), distinct from the current `allowResumeOnly` fallback.
  Deferred as new product behavior beyond FEAT-05's "keep the input gates product-correct through the
  migration."
- **Routing multi-role compare + `?id=` through the full lifecycle** (D-06 alt) — uniform lifecycle
  coverage for the no-PDF compare sub-path. Deferred; the lightweight direct path works and adding
  lifecycle overhead there is scope creep.
- **All-or-nothing strict validation incl. elite compensationIntelligence** (D-08 alt) — dropping the
  graceful elite partial-tolerance. Deferred; would regress current behavior for a marginal
  no-masking gain on an already-best-effort block.
- **Retiring / consolidating the 3-function async dance** into a single lifecycle function — a
  cleanup/architecture concern (Phase 8 / future hygiene), not this trust-milestone's scope.
- **Dashboard intelligence reading the stored career analysis data** (DASH-01..06) → **Phase 7**
  (after Career Compass stores genuine data).
- **Any new Career Compass product capability** (new output sections, redesign, new input surfaces) —
  out of scope; this phase is migration + poll-cap-repair + preserve-exactly.

### Reviewed Todos (not folded)
None checked — no `todo.match-phase 6` run.

</deferred>

---

*Phase: 06-feature-migration-c-career-compass*
*Context gathered: 2026-07-06*
