# Phase 6: Feature Migration C — Career Compass - Research

**Researched:** 2026-07-06
**Domain:** Adopting the dormant Phase 3 shared analysis lifecycle for Career Compass — a 3-function async dance (submit → worker → analyze-career), cross-feature-memory inputs, multi-input matrix, + one reliability repair (180s poll-cap hang)
**Confidence:** HIGH on substrate contracts + DB schema + save/validation seams; MEDIUM-HIGH on the executor-placement design; **one CRITICAL discrepancy flagged** (live-path tier/branch — see Open Question 1) that the planner MUST reconcile before wiring.

---

<user_constraints>
## User Constraints (from 06-CONTEXT.md)

These are LOCKED. Research investigates HOW to satisfy them, never alternatives. Copy verbatim into planning.

### Locked Decisions (D-01 … D-11)

- **D-01 — Preserve the prior-sourced input model byte-identically.** Career sources from cross-feature memory (latest `resumes.grading_data` + latest `linkedin_grades.grading_data`), not raw text, and enforces product gates BEFORE Merit reservation: Free single-call path requires BOTH priors → `412 missing_prior_analyses` (with `missing[]`); Pro/Elite main path requires a LinkedIn signal (prior OR fresh PDF) unless `allowResumeOnly` → `412 linkedin_prior_missing`. "LinkedIn-only" is NOT a distinct product path today; FEAT-05's "resume-only / LinkedIn-only / combined" is satisfied by keeping these gates correct through the migration. A genuine standalone LinkedIn-only engine is **deferred**.
- **D-02 — Validate-before-reserve is already correct; preserve it.** The 412 prior/input gates + upload-field validation run before `withMerits` (Phase-2 CR-01/CR-02). No charge on any missing-input / 412 response.
- **D-03 — Migration target = the 3-function async dance.** Live main path is the async queue: `submit-career-analysis-job` (withCors + withMerits deducts here, WR-04 active check, inserts `analysis_jobs`) → `process-career-analysis-job` (worker) → worker fetches `analyze-career` internally (internal auth, `userContext` null so its own `withMerits` is skipped) → `analyze-career` runs AI + persists. **The lifecycle run must span this dance with ONE idempotency key.** Career's `withMerits` passes NO key today — closing that gap is a Phase 6 deliverable, mirroring the Phase 5 `analyze-resume:728` fix.
- **D-04 — Poll-cap hang = the real repair (onboarding analog).** `MAX_POLL_MS = 180000` (`CareerCompass.tsx:664`) abandons a slow-but-alive run after 3 min. Replace with `run_id` + `useAnalysisRun` recovery (subscribe-first / poll-fallback, run_id in URL+localStorage, refresh/navigation recovers). Genuine failures reach a specific terminal state — never an endless spinner or fabricated success. Deadness owned by lifecycle terminal states + the Phase-3 reaper, not a frontend timer.
- **D-05 — `analysis_jobs` row ↔ lifecycle ledger reconciliation (critical).** Replace submit's WR-04 SELECT-active-then-INSERT status-window with the atomic `create_or_recover_analysis_run` + partial-UNIQUE active index (N parallel submits → exactly 1 run + 1 deduction). Same as Phase 5 D-11.
- **D-06 — Multi-role compare + `?id=` stay OUTSIDE the lifecycle.** The direct `analyze-career` path is used only for multi-role comparison (`invokeCareerAnalysisDirectWithFailover`, `compareRoles`) and `?id=` read-only hydration. Keep multi-role on its current direct path; do NOT force it through `runAnalysisLifecycle`. The lifecycle owns the main resume+LinkedIn analysis only.
- **D-07 — Strict gate scope = core structures.** "Complete valid output" = `careerDNA`, `careerFields`, `surpriseFits`, `skillGaps`/gaps, `roleRoadmaps`+`roadmap`, `roleReadinessBreakdown`, `roleReadinessScore` — these are save-blocking: malformed/truncated/empty core output fails honestly (specific terminal error + safe Merit refund via `validateModelOutput`), never garbage/fabricated (SC-3). A zod schema + semantic check for career plugs into the LOCKED `_shared/llm-validation.ts` seam (career has none today — only `repairTruncatedJSON` + `JSON.parse`).
- **D-08 — Preserve elite-extras graceful partial.** Elite `compensationIntelligence` is non-fatal today (a second fan-out call that degrades gracefully). Elite extras are best-effort post-core, NOT part of the save-blocking strict gate. Tune the career semantic check so it never rejects a currently-valid output. Success stays byte-identical; strict validation changes FAILURE handling only.
- **D-09 — backend↔DB↔frontend alignment (SC-2).** The strict schema is the single shape of truth the frontend renders from. Frontend reads `analysis_results.raw_response` (pinned, no fallback chain, `CareerCompass.tsx:385`); the validated result must carry every core structure the UI + `src/components/career-compass/types.ts` expect. Large-result safety: verify the full multi-structure payload persists + rehydrates intact.
- **D-10 — Save contract.** `analysis_results` insert IS the authoritative throws-pre-settle `save` (`persistCareerResultAndRecordUsage` → `analysis_results.insert({analysis_type:'career_compass', raw_response, …})`, throws `MeritRefundable(500)`). `profiles` update + `analysis_cache` upsert demoted to post-save best-effort log-and-continue (never refund-after-durable-save; keep structural via settle-on-saved). NOTE: `career_compass_analyses` table named in the worker header comment is a STALE COMMENT — no such table exists; `analysis_results` is the only authoritative store.
- **D-11 — CORS re-proof (not a new fix).** `analyze-career` + `submit-career-analysis-job` already use `withCors(req,'user',…)`. Re-verify live for both `strivoai.net` and `www.strivoai.net` (incl. on 401/412) and guard it. `process-career-analysis-job` stays internal-auth (no browser CORS surface).

### Claude's Discretion
- Where `runAnalysisLifecycle('career_compass')` physically lives across the 3-function dance (executor driven from analyze-career with submit/process as thin queue+trigger shells, or orchestrated from the worker). Invariant: "one run, one key derived from submit's merit reservation, spanning submit→process→analyze-career; validate→save→settle-on-saved; executor contract untouched."
- The exact stable `inputIdentity` + canonical serialization (key off prior-analyses identity: prior resume grading hash + prior linkedin grading hash + tier + variant + allowResumeOnly/compareRoles; see `buildCareerCacheKey`), never a save-mutated field.
- The precise career zod schema + semantic check (which fields required vs optional; how the elite-extras non-fatal boundary is expressed; how `repairTruncatedJSON` composes with strict validation on the assembled final object).
- Reconciling the executor's single-value `save` with the `analysis_results` insert + `profiles` update + `analysis_cache` upsert (mirror Phase-4/5 save pattern).
- Whether the short-circuit/reuse paths each get their own cache variant threaded through run identity, or share one — provided each deterministic path derives a stable, non-mutating key.
- The plan sub-ordering (ROADMAP sketch 06-01 → 06-02 → 06-03 is a starting point).
- The exact frontend recovery wiring — whether the poll loop is replaced by `useAnalysisRun` or wrapped; contract is "run_id-backed refresh/navigation recovery + preserve-previous-success + submit-lock."

### Deferred Ideas (OUT OF SCOPE)
- A genuine standalone LinkedIn-only Career Compass engine (D-01 alt).
- Routing multi-role compare + `?id=` through the full lifecycle (D-06 alt).
- All-or-nothing strict validation including elite `compensationIntelligence` (D-08 alt).
- Retiring/consolidating the 3-function async dance into a single lifecycle function (Phase 8 / future hygiene).
- Dashboard intelligence reading stored career data (DASH-01..06 → Phase 7).
- Any new Career Compass product capability (new output sections, redesign, new input surfaces).
</user_constraints>

---

## Summary

Career Compass is the third and final feature migration onto the Phase 3 lifecycle. The substrate is fully built and dormant: `runAnalysisLifecycle` (request/response, so no streaming twist), the `create_or_recover_analysis_run` + `transition_analysis_run` CAS RPCs, the partial-UNIQUE active index, `withMerits`' idempotency-key seam, the strict `validateModelOutput` seam, `useAnalysisRun`, `get-analysis-run-status`, and the `career_compass` flag all shipped in Phases 3–5 and are proven by the Phase 4/5 adoptions. **The migration is code-only: no new migration, index, or grant is required** (D-05's atomic index + RPC already exist in `20260702000001_analysis_lifecycle_ledger.sql`). That is the single most important de-risking finding.

Career's genuinely hard parts are (1) threading ONE idempotency key across the 3-function dance so submit's deduction, the run row, and analyze-career's reservation all key off the same value; (2) reconciling the two writers of the `analysis_jobs` row (the worker's raw `status` writes vs. the executor's CAS `state`/`status` dual-writes); (3) replacing the frontend 180s poll cap with `run_id` recovery; and (4) adding a career zod schema + semantic check that is strict on the core structures yet keeps a currently-valid success byte-identical and elite-extras best-effort.

**There is a critical discrepancy the planner must resolve first (Open Question 1):** static call-graph analysis shows the live queue path (`worker → analyze-career` internal, `x-internal-job-secret`) lands in `analyze-career`'s **legacy branch at `resolvedTier='free'`** — because `requireInternalAuth` returns `null` (verified `auth.ts:141`) so `userContext` is null, `resolvedTier` defaults to `'free'` (`index.ts:831-834`), the merit-branch gate `MERIT_SYSTEM_ENABLED && userContext` (L854) is false, and `body.tier` is never destructured (L815). This conflicts with CONTEXT D-01/D-03/D-07/D-08 line-references that point at the merit-branch (L854–1321: parallel fan-out, prior-analyses 412 gates, elite-extras). Confirm the true live path before choosing where the executor attaches and what "preserve-exactly" covers.

**Primary recommendation:** Attach `runAnalysisLifecycle('career_compass')` inside `analyze-career` (where extract/generate/validate/save live), reduce `submit` to derive-key + `create_or_recover_analysis_run` + trigger, thread `{run_id, idempotencyKey, attemptNonce, inputIdentity}` through the worker payload, and make the worker defer its raw `status`/refund writes to the executor when the flag is ON. Keep the flag-OFF dormancy path byte-identical. But gate all of this on resolving Open Question 1.

---

## Standard Stack

No new dependencies. Everything is in-repo (`_shared/`) and version-frozen. Phase 6 imports the existing modules; it does NOT add packages (Out-of-Scope guardrail: no new infra, no zod 3→4).

### Core (already vendored, LOCKED)
| Module | Purpose | Why used here |
|--------|---------|---------------|
| `_shared/analysis-lifecycle.ts` | `runAnalysisLifecycle` executor | Career is request/response → fits directly (no streaming wrapper needed, unlike Phase 5 resume) |
| `_shared/analysis-flags.ts` | `isAnalysisFeatureEnabled('career_compass')`, two-level gate | Dormancy fall-through; `career_compass` already in the union (L42) + `ANALYSIS_LIFECYCLE_CAREER_COMPASS` (L61) |
| `_shared/merit-gateway.ts` | `withMerits` (forwards `p_idempotency_key`), `deriveIdempotencyKey`, `MeritRefundable`, `refundMeritsForJob` | Idempotency-key thread (D-03) + save-contract refund boundary |
| `_shared/llm-validation.ts` | `validateModelOutput(raw, schema, {semanticCheck})` strict no-masking seam | Career zod schema + semantic check plug in here (D-07/D-08) |
| `_shared/idempotency-key.ts` | `deriveIdempotencyKey(sha256 over sorted-key JSON of {userId,feature,tier,inputIdentity,attemptNonce})` | The ONE key for the dance |
| `src/hooks/useAnalysisRun.ts` | run_id recovery surface (subscribe-first/poll-fallback, URL+localStorage) | Replaces the 180s poll cap (D-04) |
| `supabase/functions/get-analysis-run-status/index.ts` | owner-scoped run-status poll endpoint | `useAnalysisRun`'s poll fallback |
| `src/lib/analysisError.ts` + `src/config/feature-flags.ts` | 13-code taxonomy mirror + `isAnalysisLifecycleEnabled()` | Structured errors + frontend gate |

### Supporting (career-specific, PRESERVE)
| Module | Purpose |
|--------|---------|
| `_shared/career-prompts.ts` | `buildFreePriorAnalysesPrompt`, `buildEliteExtrasPrompt`, `FREE_SINGLE_CALL_MAX_TOKENS`, `CareerPromptParams` |
| `analyze-career` helpers | `buildCareerCacheKey` (L132), `assertPaidCareerOutputComplete` (L103), `applyCareerCompassFreeOutputPolicy` (L117), `CAREER_CORE_SECTION_CHECKS` (L82-89), `repairTruncatedJSON` |
| `src/components/career-compass/types.ts` | The frontend render shape (D-09 alignment target) |

### Alternatives Considered
| Instead of | Could Use | Verdict |
|------------|-----------|---------|
| Executor inside `analyze-career` | Executor inside the `process-career-analysis-job` worker | Discussed under Architecture Pattern 1 — analyze-career is recommended because extract/generate/validate/save already live there and the executor's callbacks map 1:1 |
| Reusing `runAnalysisLifecycle` as-is | A streaming wrapper like Phase 5's `runResumeStreamingLifecycle` | NOT needed — career is request/response; the plain executor fits |

**Installation:** none.

---

## Architecture Patterns

### Recommended repo layout (unchanged; edits in place)
```
supabase/functions/
├── submit-career-analysis-job/index.ts   # thin: derive key + create_or_recover + trigger (flag ON)
├── process-career-analysis-job/index.ts  # worker: defer status/refund to executor when flag ON
├── analyze-career/index.ts               # host runAnalysisLifecycle here (recommended)
└── _shared/
    ├── career-validation.ts (NEW)        # careerCompassSchema + careerSemanticCheck (mirror resume-validation.ts)
    └── analysis-lifecycle.ts (LOCKED)
src/pages/CareerCompass.tsx               # run_id recovery via useAnalysisRun; kill the 180s cap
```

### Pattern 1: Where the executor lives across the 3-function dance (D-03, Claude's Discretion) — RECOMMENDED

The executor is designed to run in ONE invocation: it internally does `create_or_recover_analysis_run` → `validating_inputs` → `reserving_merits` (`withMerits`) → `extracting_data` → `generating` → `validating_output` → `saving` → `completed`, with a single-value `save()` (`analysis-lifecycle.ts:212-373`). Career splits merit-reservation (submit) from analysis (analyze-career). The idempotency key is what makes this safe to span:

**Recommended wiring (executor in `analyze-career`):**
1. **submit** — derive `idempotencyKey = deriveIdempotencyKey({userId, feature:'career_compass', tier, inputIdentity, attemptNonce})`. Call `create_or_recover_analysis_run(p_idempotency_key=key, …)` → `run_id` (this REPLACES the raw `analysis_jobs.insert` at L114 AND the WR-04 SELECT-window at L74-82 — D-05). Thread `{run_id, idempotencyKey, attemptNonce, inputIdentity}` into the job payload. Trigger the worker. Return `{ jobId: run_id }` (note: `run_id === analysis_jobs.id === jobId` — the frontend's `careerJobId` IS the run_id, so `useAnalysisRun.startRun(jobId)` is natural).
2. **worker** — unchanged claim/fetch mechanics; forwards the enriched payload to analyze-career. When the flag is ON it must NOT do its own `status`/refund writes (see Pattern 2).
3. **analyze-career (internal)** — call `runAnalysisLifecycle` with the SAME `inputIdentity` + `attemptNonce` (read from payload). The executor re-derives the SAME key → `create_or_recover` RECOVERS the same run row → `withMerits` with the same key is idempotent (recovers the existing merit transaction, no double charge — proven in Phase 3 03-02) → extract/generate/validate/save/settle.

**Why the same key deducts exactly once:** the 4-arg `check_and_deduct_merits` returns the existing transaction on a repeated key (`already_deducted`), so submit's reservation and the executor's `reserving_merits` step collapse to one deduction. This is the SEC-13 seam wired in 02-05 and proven end-to-end in 03-02.

**Merit-reservation placement decision the planner must make:** either (a) submit reserves synchronously (fast 402 UX preserved, executor's `reserving_merits` is an idempotent no-op recovery), or (b) submit only seeds the run and the executor performs the single reservation in the worker (cleaner single-owner, but merit failure becomes async — a terminal `MERIT_RESERVATION_FAILED` run instead of a synchronous 402 at submit). Recommendation: **(a)** to preserve current synchronous 402 behavior; both are financially safe because of the key.

### Pattern 2: Two-writer reconciliation on the `analysis_jobs` row (THE hard integration point)

The worker currently drives the row with raw `status` updates: `processing` on claim (L105-113), `completed`/`retrying`/`failed` after the fetch (L144-217), plus `refundMeritsForJob` before `failed` (L187-207, L235-255). The executor drives the row via `transition_analysis_run`, which ALSO dual-writes `status` from the `state` mapping and sets `merit_settled`/`refunded`. **When the flag is ON, both write the same row → conflicts.** Resolution options for the planner:

- **Recommended:** when career lifecycle is ON, make the worker's post-fetch branch defer to the executor: on a 2xx from analyze-career, do NOT overwrite `status`/`state` (the executor already CAS'd `saving→completed` + `merit_settled=true`); on non-2xx, do NOT independently refund (the executor already refunded pre-saving and CAS'd to `failed`/`retryable_failed`). The worker's `refundMeritsForJob` is idempotent (`alreadyRefunded`) so a residual call is safe, but a raw `status='failed'` write could stomp the executor's `state`. Prefer skipping the raw write behind the flag.
- The worker's initial claim (`status='processing'`, `attempts+1`) can remain — it does not touch `state`, and `transition_analysis_run` dual-writes `status='processing'` for all mid-pipeline states anyway (byte-compatible).

This is the career analog of Phase 5's streaming-wrapper reconciliation (05-02) and Phase 4's save-before-settle worker interplay. Plan a dedicated deterministic guard for it (see Validation Architecture).

### Pattern 3: The `save()` reconciliation (D-10)
The executor takes a single `save(value: T): Promise<void>` that throws on failure (`analysis-lifecycle.ts:173, 354-361`). Map it exactly like Phase 4 linkedin (04-04) and Phase 5 resume (05-01):
```
save = async (value) => {
  // AUTHORITATIVE — throws pre-settle → executor refunds + retryable_failed
  await insertAnalysisResults({ analysis_type:'career_compass', raw_response: value, primary_score, key_insights });
  // MIRRORS — post-save best-effort, log-and-continue, NEVER throw/refund
  //   profiles update (index.ts:349), analysis_cache upsert (index.ts:284), usage row, feature email
}
```
The existing `persistCareerResultAndRecordUsage` (L301-379) already does this shape (authoritative insert throws `MeritRefundable(500)`; usage-write failure logs-and-continues per CR-02, L338-345; profiles/email fire-and-forget). Refactor it into the executor's `save()` closure; `analysis_cache` upsert (`writeCareerAnalysisCache`, L264-299) is already log-and-continue. `settle-on-saved` (`merit_settled=true` in the `saving→completed` CAS) makes CR-02 structural.

### Pattern 4: Frontend run_id recovery replaces the 180s poll cap (D-04)
`useAnalysisRun` (fully read) already does: subscribe-first to `analysis_jobs` postgres_changes filtered `id=eq.<run_id>` + poll `get-analysis-run-status` fallback; `run_id` in URL+localStorage; `startRun` dup-guard; `previousResult` preserved across a later failure; `canRetry` only when `retryable_failed` AND mapped-retryable; `meritStatus` derived from the row. **Recommended:** REPLACE the `while (Date.now() - pollStart < MAX_POLL_MS)` loop (`CareerCompass.tsx:666-689`) with `startRun(jobId)` after submit, then render from the hook snapshot. On `isCompleted`, fetch/hydrate the result from `analysis_results` (or the completed run projection) exactly as the `?id=` path does (L374-395). Keep the flag-OFF branch byte-identical (legacy poll loop retained). Mirror the Phase 4 linkedin (04-05) / Phase 5 (05-01/05-02) frontend wiring precisely — including submit-lock via `AnalysisLockContext` + `useAnalysisRun.isActive`.

### Anti-Patterns to Avoid
- **Do NOT write a new migration/index for D-05.** `create_or_recover_analysis_run`, `transition_analysis_run`, `analysis_jobs_active_idem_unique` (partial UNIQUE), and the `CHECK(NOT(merit_settled AND refunded))` all already exist (`20260702000001_analysis_lifecycle_ledger.sql`). Adding them again risks a duplicate/floor regression.
- **Do NOT route multi-role compare / `?id=` through the executor** (D-06). They are direct/read-only.
- **Do NOT let strict validation reject a currently-valid success** — semantic check must be tuned to today's real outputs (byte-identical success; failure-handling only).
- **Do NOT keep the elite `compensationIntelligence` block in the save-blocking gate** (D-08) — it is a non-fatal second fan-out (`index.ts:1262-1269`).
- **Do NOT key idempotency/cache off a save-mutated field** (Pitfall 8) — key off the prior-analyses identity (`buildCareerCacheKey` inputs, L132-157).

---

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Atomic single-active-run dedup | A new SELECT-then-INSERT or new index | `create_or_recover_analysis_run` + `analysis_jobs_active_idem_unique` (shipped) | Advisory-lock + partial-UNIQUE already closes the WR-04 TOCTOU |
| Idempotency key | A custom hash | `deriveIdempotencyKey` (LOCKED contract) | Same key must feed create_or_recover AND withMerits |
| Strict output validation | Ad-hoc field checks / silent repair | `validateModelOutput` + a career zod schema + `semanticCheck` | No-masking guarantee (SC-3); truncation rejected not repaired-and-accepted |
| Refund/settle discipline | Manual refund calls in the worker | The executor's `refundAndFail` (pre-saving only) + `merit_settled` in the `saving→completed` CAS | Refund-exactly-once + settle-on-saved are structural |
| Refresh/navigation recovery | A longer/custom poll timer | `useAnalysisRun` run_id recovery | Terminal-state + reaper own deadness, not a frontend clock |
| Merit status for the UI | Optimistic client state | `deriveMeritStatus` from the run row | Financial trust from persisted state (LIFE-04) |

**Key insight:** every hard primitive Career Compass needs was built + tested dormant in Phases 3–5. Phase 6 is wiring + reconciliation + a schema, not new machinery.

---

## Common Pitfalls (career-specific, mapped to `.planning/research/PITFALLS.md`)

### Pitfall 1 — Idempotency key never forwarded (→ D-03)
**What goes wrong:** submit's `withMerits` (L96) and analyze-career's `withMerits` (L1000-1002) pass NO key today; two tabs / a retry could double-charge. **Avoid:** derive ONE key from a stable `inputIdentity` + `attemptNonce`, set `meritCtx.idempotencyKey` before every `withMerits`, and pass it to `create_or_recover`. **Warning sign:** any `withMerits` call whose ctx lacks `idempotencyKey`.

### Pitfall 4 — Stuck non-terminal / frontend-timeout abandonment (→ D-04, the repair)
**What goes wrong:** the 180s cap (`CareerCompass.tsx:664`) drops a slow-but-alive run; the user sees no result though the backend may still complete. **Avoid:** `run_id` recovery + terminal states + reaper. **Warning sign:** any `MAX_POLL_MS`/wall-clock abandonment in the submit flow.

### Pitfall 5 — Status-window dedup ≠ idempotency / TOCTOU (→ D-05)
**What goes wrong:** WR-04 `SELECT active THEN INSERT` (submit L74-91) races under parallel submits → duplicate rows/charges. **Avoid:** `create_or_recover_analysis_run` under the advisory lock + partial-UNIQUE index.

### Pitfall 8 — Save-mutated cache/identity key
**What goes wrong:** keying identity off a field the save mutates (e.g. an inserted `analysis_id`) makes a resubmit look "new." **Avoid:** key off `buildCareerCacheKey` inputs (prior grading hashes + tier + variant + linkedinUrl + compareRoles + allowResumeOnly).

### Pitfall 9 — Validation masking (→ D-07/D-08)
**What goes wrong:** today career only does `repairTruncatedJSON` + `JSON.parse` (L1047, L1254, L1772) — a truncated body can be silently accepted. **Avoid:** run `validateModelOutput` on the ASSEMBLED FINAL object (base + folded elite-extras + domain metadata), which REJECTS truncation rather than accepting the repaired partial (`llm-validation.ts:87-89`). Keep elite-extras fold non-fatal BEFORE validation so a failed extras parse doesn't fail the core.

### Pitfall (new) — Worker/executor double-writing `status` (Pattern 2)
Covered above; the highest-risk integration bug for this phase.

---

## Code Examples (verified from the repo)

### The executor's single-source key + create_or_recover + reserve (the contract to satisfy)
```typescript
// _shared/analysis-lifecycle.ts:233-287 — derive ONCE, feed BOTH dedups
const idempotencyKey = await deriveIdempotencyKey({
  userId: ctx.userId, feature: params.meritFeature, tier: ctx.tier,
  inputIdentity: params.inputIdentity, attemptNonce: params.attemptNonce,
});
await supabase.rpc('create_or_recover_analysis_run', { p_idempotency_key: idempotencyKey, /* … */ });
meritCtx.idempotencyKey = idempotencyKey;
const gated = await withMerits(meritCtx, params.meritFeature, async (txId) => txId);
```

### The save() shape to reconcile onto (D-10)
```typescript
// analyze-career/index.ts:301-330 — authoritative insert THROWS pre-settle; mirrors log-and-continue
const { data, error } = await supabase.from('analysis_results').insert({
  user_id, analysis_type: 'career_compass', primary_score, key_insights, raw_response: analysisResultSnapshot,
}).select('id').single();
if (error || !data?.id) throw new MeritRefundable(500, 'Could not save career analysis history.');
// usage-write failure logs-and-continues (CR-02, L338-345); profiles/email fire-and-forget
```

### Core save-blocking structures (D-07 schema target)
```typescript
// analyze-career/index.ts:82-89 — CAREER_CORE_SECTION_CHECKS (paid-tier assertion source)
// careerFields (bestFitRoles/fields), surpriseFits, roles, roleReadinessBreakdown, roadmap||roleRoadmaps
// assertPaidCareerOutputComplete (L103-115) throws MeritRefundable(500) for paid tiers on any missing core section.
```
The career zod schema should encode these as required (for the save-blocking core), mark `compensationIntelligence` optional (D-08), and the `semanticCheck` should assert the same non-empty-array invariants `assertPaidCareerOutputComplete` uses — tuned so a currently-valid Free/Pro/Elite output passes byte-identically. Model it on `_shared/resume-validation.ts` (05-01: permissive `.passthrough()` + `resumeSemanticCheck` mirroring the existing quality floor).

### Idempotency-key gap sites to close
```typescript
// submit-career-analysis-job/index.ts:96-98  → withMerits ctx has NO idempotencyKey
// analyze-career/index.ts:1000-1002          → withMerits ctx = {userId,tier,corsType} only
```

---

## State of the Art (repo-internal precedent)

| Old approach (career today) | Current approach (Phases 4–5 pattern) | Impact |
|---|---|---|
| Frontend 180s poll cap abandons slow runs | `useAnalysisRun` run_id recovery + terminal states + reaper | D-04 repair |
| WR-04 SELECT-active + raw INSERT | `create_or_recover_analysis_run` + partial-UNIQUE | D-05, atomic dedup |
| `withMerits` with no key (double-charge risk) | one `deriveIdempotencyKey` threaded to create_or_recover + withMerits | D-03 |
| `repairTruncatedJSON`+`JSON.parse` only | `validateModelOutput` + zod schema + semanticCheck | D-07/D-08 |
| Merit refund scattered in worker | executor refund-pre-saving + settle-on-saved | D-10 |

**Direct precedents to copy:** Phase 5 05-01 (onboarding run_id recovery, save-contract demotion, `resume-validation.ts` seam), 05-02 (idempotency-gap closure, submit-lock, validate-on-final-object), 05-03 (5 deterministic guards folded into `test:ci`); Phase 4 04-04 (linkedin `runAnalysisLifecycle` adoption + save-before-settle), 04-05 (frontend dormant recovery), 04-06 (CORS matrix + idempotency guards + live prod CORS re-proof).

---

## Validation Architecture (for VALIDATION.md / Nyquist)

Career's existing guards (all in `deno.json test:ci`): `analyze-career/{index,cache,failure-branches,history-persistence,paid-output-validation,phase22-contract,refund-after-save}.test.ts`, `submit-career-analysis-job/job-contract.test.ts`, `process-career-analysis-job/__tests__/refund-on-failure.test.ts`, `_shared/career-shape.test.ts`; frontend vitest `CareerCompass.phase22.test.ts` + `__tests__/CareerCompass.prior-selectors.test.ts`. These must stay green (byte-preserve proof).

**New guards to fold into `verify:baseline` (mirror Phase 5's 5-guard set), mapping the FEAT-05 / VER-02 scenario matrix to seams:**

| Scenario (FEAT-05 / VER-02) | Seam | Type |
|---|---|---|
| Idempotency: duplicate-click / two tabs → 1 run + 1 deduction; deliberate new run (fresh nonce) → new run | Deno `analyze-career/__tests__/idempotency-repeated-run.test.ts` (model on analyze-resume's) | Deterministic guard |
| Pitfall-8 stable identity (resubmit unchanged input → same key; save-mutated field never in key) | Deno idempotency guard | Deterministic guard |
| Executor refund boundary (refund only pre-saving; no refund after `saving→completed`) | Deno `_shared/analysis-lifecycle.refund-boundary.test.ts` (already registered) + a career-save guard | Deterministic guard |
| Validation convergence: valid Free/Pro/Elite → typed success; invalid/truncated/empty/all-zero core → typed `AnalysisErrorCode` (never fabricated) | Deno `analyze-career/__tests__/runtime-validation-convergence.test.ts` | Deterministic guard |
| Elite-extras non-fatal: missing/failed `compensationIntelligence` → still valid core (no fail/refund) | Deno validation-convergence guard | Deterministic guard |
| Byte-preserve success (Free/Pro/Elite deep-equal flag-ON vs legacy) | Deno `analyze-career/__tests__/byte-preserve.test.ts` | Deterministic guard |
| apex+www CORS status matrix (200/401/412) + evil origin fail-closed | Deno `analyze-career/__tests__/cors-matrix.test.ts` | Deterministic guard |
| Worker↔executor two-writer reconciliation (flag ON → worker defers status/refund; no double-refund) | Deno worker guard (new; model on streaming-wrapper-ordering) | Deterministic guard |
| Input-matrix: resume-only (`allowResumeOnly`) / Free both-priors 412 / Pro-Elite `linkedin_prior_missing` 412 → no charge | Deno gate guard + `submit-career-analysis-job/job-contract.test.ts` | Deterministic guard |
| create_or_recover replaces WR-04 (N parallel submits → 1 row) | Deno submit guard (gated-remote twin skip-by-default) | Deterministic (+ gated remote) |
| Refresh / navigation recovery; submit-lock; preserve-previous-success; History `?id=` hydration | vitest `CareerCompass.*.test.ts` (run_id recovery + `useAnalysisRun.isActive` lock) | Deterministic (vitest) |
| Large-result safety (roleRoadmaps 3×5, careerFields, compensationIntelligence persist + rehydrate intact) | vitest hydration + Deno persist guard | Deterministic guard |
| First / second / five-consecutive; provider timeout/rate-limit auto-retry; DB save failure → retryable_failed | Deno failure-branches + classifier (`analysis-lifecycle.classifier.test.ts` exists) | Deterministic guard |
| Live apex+www CORS re-proof on prod (incl. 401/412); flag-flip soak; Merit reserve/settle/release/refund on a real account | Playwright / operator live smoke | **Operator-gated live smoke** (autonomous:false) |
| Real Free + Elite account resume-only + resume+LinkedIn (VER-04) | Manual/operator | **Operator-gated live smoke** |

Registration: append new Deno suites to `supabase/functions/deno.json` `test:ci` (Pitfall 12 — a green baseline only proves pre-existing behavior; new guards are mandatory). Promptfoo `test:adversarial:career` stays OFF the gate. Honor operator checkpoints for any live/DB-touching smoke (MEMORY: honor-operator-checkpoints-over-automode).

---

## Open Questions

1. **CRITICAL — Which analyze-career branch does the LIVE queue path actually execute, and at what tier?** (blocks executor placement + "preserve-exactly" scope)
   - What we know (verified static call graph): the worker sends `x-internal-job-secret`; `requireInternalOrUserAuth` → `requireInternalAuth` returns `null` (`auth.ts:141,185-202`); in analyze-career `userContext` is null, so `resolvedTier` defaults to `'free'` (`index.ts:831-834`), the merit-branch gate `MERIT_SYSTEM_ENABLED && userContext` is false (L854), `body.tier` is never destructured (L815), and the frontend main path uses the queue (`invokeCareerAnalysisDirectWithFailover` is used ONLY for `compareRoles`, `CareerCompass.tsx:246,433-435`). This implies the live main analysis runs the **legacy single-call branch (L1323-1839) at free tier**, and the merit-branch (parallel fan-out, prior-analyses 412 gates L909-946, elite-extras L1262-1269) is reachable only via a DIRECT user-auth POST.
   - What's unclear: this conflicts with CONTEXT D-01/D-03/D-07/D-08, which line-reference the merit-branch as the live path. Either (H1) there is a tier/auth nuance the static read misses (e.g., a deployment where the frontend calls analyze-career directly, or an intended DB tier re-lookup that does not exist in code), or (H2) the queue path genuinely runs legacy free-tier and Pro/Elite output via the queue is a latent limitation.
   - Recommendation: BEFORE planning executor attachment, confirm the live path with a read-only prod/preview probe (inspect recent `analysis_jobs` career rows' payload + resulting `analysis_results` tier-shape, and function logs for `request-start`/`career.reuse`). If H1: attach the executor in the merit-branch and preserve its gates/fan-out. If H2: attach the executor around the legacy branch, treat legacy single-call output as the byte-preserve baseline, and note the tier limitation as a separate finding (not necessarily in-scope for FEAT-05, which foregrounds Free-tier correctness). Do NOT silently "fix" tier resolution inside this migration without an explicit decision.

2. **Merit-reservation placement (submit synchronous vs executor-in-worker).** Recommendation (a) synchronous-at-submit for UX parity; the key makes the executor's reserve an idempotent no-op. Confirm with the planner. (Financially safe either way.)

3. **Cache-variant threading for the short-circuit/reuse paths.** `buildCareerCacheKey` already produces 4 variants (multi-role / free-single-call / pro-elite-short-circuit / pro-elite-full, L978-984). Decide whether each deterministic path threads its own variant into `inputIdentity` or they share one — provided each stays stable/non-mutating (Claude's Discretion).

4. **DB touch confirmation.** Expected NONE (D-05 index/RPC already shipped). Verify no advisor-floor change (must stay 15). If Open Question 1 forces any grant/index change, it becomes operator-gated (preview→prod, rollback SQL). Confidence this stays code-only: HIGH.

---

## Sources

### Primary (HIGH confidence — read in full or at cited lines)
- `_shared/analysis-lifecycle.ts` (executor, full) — sequence, single-source key, refund boundary, settle-on-saved, save() contract.
- `20260702000001_analysis_lifecycle_ledger.sql` (full) — `create_or_recover_analysis_run`, `transition_analysis_run`, partial-UNIQUE `analysis_jobs_active_idem_unique`, financial CHECK, service_role-only grants. **Confirms no new migration needed.**
- `submit-career-analysis-job/index.ts` (full) — WR-04 L74-91, withMerits-no-key L96, insert L114, trigger L141.
- `process-career-analysis-job/index.ts` (full) — internal auth L72, fetch L130, refund L187-207/L235-255, self-chain L270-289, stale `career_compass_analyses` comment L16-22.
- `analyze-career/index.ts` (L60-379, 790-1360, 1640-1850) — save L301-330, cache L264-299, core-section checks L82-115, cache key L132-157, input gates L909-975, withMerits L1000, parallel fan-out L1233, elite-extras non-fatal L1262-1269, tier resolution L831-834, legacy branch L1323-1839, validation L1772.
- `_shared/llm-validation.ts` (full) — strict no-masking seam, truncation rejection.
- `_shared/analysis-flags.ts` (full) — `career_compass` flag, two-level gate.
- `_shared/auth.ts:141-202` — `requireInternalAuth` returns null (Open Question 1 evidence).
- `src/hooks/useAnalysisRun.ts` (full) — recovery surface.
- `src/pages/CareerCompass.tsx` (L246, 360-435, 560-720) — direct-compare-only, `?id=` pinned read L385, 180s cap L664-689.
- `src/components/career-compass/types.ts` (full) — render shape.
- `supabase/functions/deno.json` `test:ci` — current allowlist (career suites present).
- `06-CONTEXT.md`, `REQUIREMENTS.md` (FEAT-05, VER-02), `STATE.md` (Phase 3/4/5 decision log).

### Secondary (MEDIUM — precedent, inferred pattern)
- Phase 4 (04-04/04-05/04-06) + Phase 5 (05-01/05-02/05-03) decision log entries in STATE.md — the proven adoption/guard shape (not re-read file-by-file; the pattern is consistent across both and matches the substrate code).

## Metadata
**Confidence breakdown:**
- Standard stack + DB schema (no new migration): HIGH — read the migration + executor + flags directly.
- Save/validation/idempotency wiring: HIGH — seams read; Phase 4/5 precedent is consistent.
- Executor placement design: MEDIUM-HIGH — sound given the key, but contingent on Open Question 1.
- Live-path tier/branch: flagged as CRITICAL open question — static analysis HIGH, but conflicts with CONTEXT; needs a read-only live probe.

**Research date:** 2026-07-06
**Valid until:** ~2026-08-05 (stable in-repo substrate; re-verify Open Question 1 against live before planning executor attachment).
