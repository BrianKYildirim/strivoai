---
phase: 06-feature-migration-c-career-compass
verified: 2026-07-07T00:00:00Z
status: passed
score: 4/4 success-criteria verified (with 2 operator-approved intentional deviations + known out-of-scope deferrals)
re_verification:
  previous_status: null
  note: "Initial verification. 06-03 operator live-smoke was BLOCKED at a 95% hang; resolved via /gsd-debug session .planning/debug/career-compass-flag-split-95-hang.md (status: resolved). This verification treats the debug resolution + LIVE-SMOKE-RESULTS + operator preview/prod evidence as 06-03's completion record."
intentional_deviations:
  - id: DEV-1
    what: "LinkedIn URL made OPTIONAL on the shared analyze-career core (commit 31e53711)"
    scope: "Both URL hard-fails removed (withMerits direct-path ~955-979 AND runCareerLegacyCore closure ~1373-1400). Resume + LinkedIn PDF content REMAIN required. On the SHARED core, so it applies flag-ON and flag-OFF."
    classification: "Operator product directive, not a regression. Not byte-identical to legacy on this one axis (a URL-less resume+PDF submit no longer 400s)."
  - id: DEV-2
    what: "Frontend poll-loop failure-surfacing guard (commit 2ee765b1, CareerCompass.tsx:742)"
    scope: "`if (!statusData || statusData.error) continue` -> `if (!statusData || (!statusData.status && statusData.error)) continue` so terminal status:'failed' (which carries an error payload) falls through to the toast+unlock instead of being swallowed."
    classification: "Strictly-better on BOTH flag paths. Repairs a genuine-failure 95% hang; does not alter success rendering."
gaps: []
human_verification: []
---

# Phase 6: Feature Migration C — Career Compass Verification Report

**Phase Goal (ROADMAP L184):** The most complex feature's full pipeline works on the shared
analysis lifecycle across resume-only / LinkedIn-only / combined inputs, persisting every output
structure with backend↔DB↔frontend alignment — migrating the async 3-function dance
(submit → worker → analyze-career) onto `create_or_recover_analysis_run` single-active-per-key CAS +
`runAnalysisLifecycle` executor + settle-on-saved + refund-before-save, closing the idempotency gaps
and repairing the 95% poll-cap hang. Ships DORMANT behind `ANALYSIS_LIFECYCLE_ENABLED` +
`ANALYSIS_LIFECYCLE_CAREER_COMPASS` + `MERIT_SYSTEM_ENABLED`; flag-OFF byte-identical to legacy.

**Verified:** 2026-07-07
**Status:** PASSED
**Re-verification:** No — initial verification (06-03 live-smoke block resolved via /gsd-debug)

---

## Goal Achievement

### Observable Truths (mapped to ROADMAP Success Criteria)

| # | Success Criterion (truth) | Status | Evidence |
|---|---------------------------|--------|----------|
| 1 | Retrieves latest resume+LinkedIn; product-correct resume-only/LinkedIn-only/combined; input validation BEFORE Merit reservation; compatible extraction+analysis schemas | ✓ VERIFIED | Input gates preserved before `withMerits`; `inputIdentity`/key derived pre-reserve; `careerCompassSchema` seam. See SC-1 below. (Deviation DEV-1: URL now optional.) |
| 2 | Complete valid output (malformed/truncation detection) persisted — Career DNA, careerFields, gaps, surprise fits, roadmaps — backend↔DB↔frontend aligned; large results safe | ✓ VERIFIED | `runAnalysisLifecycle` runs `validateModelOutput(raw, careerCompassSchema, {semanticCheck})`; `analysis_results` authoritative save; frontend hydrates pinned `raw_response`. Operator-confirmed clean run d122b82b (large multi-structure payload intact). |
| 3 | Merit settlement only after successful storage; no fake result after real failure; production cross-origin failure corrected | ✓ VERIFIED | Executor settle-on-saved + refund-before-save; `terminalize-stuck-run` for pre-lifecycle 4xx; strict no-masking; `withCors` preserved + apex+www `cors-matrix.test.ts`. (Deviation DEV-2: frontend surfaces genuine failures.) |
| 4 | Scenario + idempotency + refresh-recovery + History coverage folded into `verify:baseline` | ✓ VERIFIED | 7 new guard suites registered in `deno.json test:ci`; `test:edge` 1122 passed / 0 failed / 12 ignored; frontend `useAnalysisRun.test.ts`. Full `verify:baseline` gate blocked ONLY by unrelated Issue G (Stripe E2E) — noted out-of-scope. |

**Score:** 4/4 success criteria verified.

---

### SC-1 — Input retrieval, product-correct input states, validate-before-reserve

- **Input gates preserved before Merit reservation.** `analyze-career/index.ts` retains the
  resume-required / LinkedIn-PDF-required 400s at both sites (`:960-971` withMerits path, `:1373-1385`
  core closure). Free-both-priors 412 and Pro/Elite `linkedin_prior_missing`/`allowResumeOnly` gates
  are unchanged.
- **inputIdentity derived pre-reserve, never a save-mutated field (Pitfall 8).** Submit derives
  `buildCareerInputIdentity` + `deriveIdempotencyKey` at tier='free' (`submit-.../index.ts:145-160`)
  BEFORE `create_or_recover_analysis_run` and the keyed `withMerits`. analyze-career re-derives the
  identical key via `buildCareerCacheKey(... variant ':legacy-main')` (`:1867-1876`).
- **Compatible schemas.** New `_shared/career-validation.ts` (`careerCompassSchema` + permissive
  `.passthrough()` + `careerSemanticCheck` tuned to the universal-safe core) plugs into the LOCKED
  `validateModelOutput` seam. 7-test unit proof present.

### SC-2 — Complete valid output, persistence, alignment, large-result safety

- **Malformed/truncation detection.** Executor calls
  `validateModelOutput(raw, careerCompassSchema, {semanticCheck: careerSemanticCheck})`
  (`analyze-career/index.ts:1916-1917`); empty/truncated core → typed error + safe refund; success
  byte-identical (elite `compensationIntelligence` kept optional/non-fatal — D-08 preserved).
- **Authoritative save.** `runAnalysisLifecycle.save()` routes through
  `persistCareerResultAndRecordUsage` → `analysis_results.insert` as the sole throws-pre-settle write;
  no `profiles`/`analysis_cache` mutation on the legacy path (D-10 satisfied without demotion edits).
- **Large-result safety.** Operator-confirmed preview run d122b82b (resume+PDF, no URL) went
  created→completed, `merit_settled=true`, single keyed row, no keyless sibling — full
  roleRoadmaps/careerFields payload persisted + rehydrated.

### SC-3 — Merit-after-save, no fabrication, CORS

- **Settle-on-saved + refund-before-save** owned by the executor; the worker DEFERS its raw
  status/refund writes when the flag is ON (`process-career-.../index.ts:151` `deferToExecutor`,
  gated `if (!deferToExecutor)` at `:169/:201/:276/:288`) — no double-write/double-refund.
- **No fabricated result after failure (SC-3 core).** Strict no-masking validation surfaces a typed
  `AnalysisErrorCode`, never a fixed/empty/generic result. Pre-lifecycle 4xx orphan repaired by NEW
  `_shared/terminalize-stuck-run.ts` (150L) — the worker CAS-terminalizes the pre-created run to
  `failed` + refunds exactly once (`process-career-.../index.ts:227-235`). Operator preview evidence:
  missing-URL runs → `failed` + refunded, `failure_code=INPUT_MISSING`,
  `failure_stage=worker_terminal_4xx`.
- **CORS corrected + guarded.** `withCors(req,'user',…)` preserved on both entrypoints; new
  `analyze-career/__tests__/cors-matrix.test.ts` proves apex+www ACAO echo + `Vary: Origin` on
  200/401/412 + evil-origin fail-closed. `get-analysis-run-status` 500 (phantom `archive_path`) fixed
  (commit b96fb11f): `RUN_STATUS_COLUMNS` has NO `archive_path`, returns `result_ref: null`
  (`:36-37`, `:109`).

### SC-4 — Coverage folded into verify:baseline

- 7 new guard suites registered in `deno.json test:ci`: `career-validation`, `terminalize-stuck-run`,
  `byte-preserve`, `cors-matrix`, `idempotency-repeated-run`, `runtime-validation-convergence`,
  `worker-two-writer`. Frontend `src/hooks/__tests__/useAnalysisRun.test.ts` (404/state:null/transient
  streak clearing).
- **Re-run confirmed:** `cd supabase/functions && DENO_TEST_SUPABASE_REMOTE=0 deno task test:ci` →
  **1122 passed | 0 failed | 12 ignored (16s)** — matches the reported posture.
- Full `npm run verify:baseline` NOT run here: it is a known-red gate blocked by Issue G
  (Stripe E2E, unrelated to Phase 6) — out-of-scope per task instructions.

---

## The 95% Hang Repair — verified on BOTH sides

| Root cause (peeled back in /gsd-debug) | Fix | Code evidence |
|----------------------------------------|-----|---------------|
| get-analysis-run-status 500 (phantom `archive_path`) | b96fb11f | `RUN_STATUS_COLUMNS` no `archive_path`; `result_ref:null` (`get-analysis-run-status/index.ts:36-37,109`) ✓ |
| Flag split / module-load snapshot | 2e5609c8 | `isAnalysisFeatureEnabled` reads env per-call via `readBoolFlag` at REQUEST time (`analysis-flags.ts:92-93`), NOT a top-level const ✓ |
| `MERIT_SYSTEM_ENABLED` global gate wrapping whole lifecycle block | operator secret-set | Module-load snapshot (`merit-gateway.ts:27-28`) gates `submit-.../index.ts:122`; feature flag nested at `:131` — three paths confirmed ✓ |
| Issue C (stale run_id wedge → isActive stuck) | 9d246f35 | `useAnalysisRun.ts` `fetchStatus` clears on 404 `FILE_NOT_FOUND` / `state:null` / transient streak ≥ `MAX_EMPTY_POLLS=3` (`:326-357`) ✓ |
| Hang-on-4xx worker robustness | 96356a3f | NEW `terminalize-stuck-run.ts` + worker `deferToExecutor` branch calls it (`process-career-.../index.ts:227-235`) ✓ |
| Frontend genuine-failure hang | 2ee765b1 | Poll guard `if (!statusData || (!statusData.status && statusData.error)) continue` (`CareerCompass.tsx:742`) ✓ |

All 6 fix commits exist in git history on `staging` (verified via `git cat-file`/`git log`).

---

## Dormancy Confirmation (flag-OFF byte-identical, except 2 intentional deviations)

- **Backend dormancy structurally enforced.** New lifecycle sub-branches sit at the TOP of the
  existing merit block with the legacy path left byte-identical BELOW; `isAnalysisFeatureEnabled`
  OFF → falls straight through. `analysis-lifecycle.dormancy.test.ts` reconciles the three career
  functions (submit/process flag-gated + executor-import-absent guard; analyze-career migrated
  entrypoint) — green in the 1122-pass suite.
- **Prod rolled out DORMANT (operator-confirmed).** All prod (`zjpjapgraoxdukdvpjes`) career
  `analysis_jobs` rows are legacy-shaped (`state=null, feature=null, idempotency_key=null`), ZERO
  lifecycle/keyed rows; Merit ledger balanced (no orphaned deductions).
- **Two intentional deviations from strict byte-identity** (see frontmatter `intentional_deviations`):
  DEV-1 (URL optional on shared core — operator product directive) and DEV-2 (frontend
  failure-surfacing guard — strictly-better on both paths). Both are deliberate and
  operator-approved; NEITHER is a regression.

---

## Known-Deferred / Out-of-Scope Items

| Item | Disposition |
|------|-------------|
| Issue G — Stripe E2E red on `verify:baseline` / `deploy.ps1 -Env staging` | Pre-existing, unrelated to Phase 6. Blocks the FULL gate; the Phase-6-owned edge (1122) + frontend vitest slices are green. Out-of-scope. |
| Genuine standalone LinkedIn-only Career Compass engine | Deferred (D-01). Current `allowResumeOnly` fallback + PDF-gating remain; a URL-less **resume-only** submit is still PDF-gated (LinkedIn PDF content required at `:1382`). |
| Two pre-existing prod legacy "zombie" `analysis_jobs` rows | Pre-existing stuck legacy rows on prod; not created by this phase (prod is dormant). Reaper is the durable backstop. Noted, not remediated here. |
| R-06-01 — internal-worker tier resolves to 'free' | Logged to RESIDUAL-REGISTER; out-of-FEAT-05-scope; a separate decision owns it. |
| Cross-hop key-match edge cases (DB-persisted-LinkedIn fallback; replication drift submit↔analyze-career) | Documented in 06-02-SUMMARY Deferred Issues; common path matches; executor's own `create_or_recover` recovers/creates on its re-derived key. |
| Pre-existing `npm run type-check` recharts 3.x failures (10) | Unrelated charting typings; `tsc` not on the blocking gate (deferred-items.md). |

---

## Anti-Patterns Scanned

No blocker anti-patterns found in the phase-modified files. The `status: 400` early returns in
`analyze-career` are legitimate input-validation gates (surfaced to the executor as status-bearing
Errors for pre-saving refund), not stubs. The stale `career_compass_analyses` table comment was
corrected to `analysis_results` (D-10, commit b483c662). `deno check` TS5095/TS5109 noise is a
pre-existing root-tsconfig/deno tooling condition (authoritative gate is `test:edge --no-check`,
green).

---

## Overall Verdict

**PASSED.** All 4 ROADMAP success criteria are verified against the actual codebase, not merely
claimed. The Career Compass async 3-function dance is migrated onto the shared lifecycle
(create_or_recover single-active-per-key in submit → two-writer deferral in the worker →
runAnalysisLifecycle executor in analyze-career), the idempotency gaps are closed with ONE key
threaded submit→worker→analyze-career (attemptNonce forwarded), and the 95% hang is repaired on BOTH
the backend (terminalize-stuck-run + request-time flag reads + get-analysis-run-status column fix)
and the frontend (poll-loop guard + Issue-C stale-run clearing). Flag-OFF dormancy is preserved
(structurally enforced + prod-confirmed legacy-shaped rows) EXCEPT for two deliberate,
operator-approved product changes (URL-optional, failure-surfacing). Offline gate re-confirmed green
(`test:edge` 1122/0/12). The only red on the full `verify:baseline` is the unrelated, pre-existing
Issue G (Stripe E2E), explicitly out of Phase 6 scope.

---

_Verified: 2026-07-07_
_Verifier: Claude (gsd-verifier)_
