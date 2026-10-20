# Phase 36: History Persistence Parity Audit + Repair - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-16
**Phase:** 36-history-persistence-parity-audit-repair
**Areas discussed:** Recruiting Lens overload fallback (HIST-07), Failed-analysis phantom history rows (HIST-06 nuance), Proximity matcher sunset (HIST-05), TEST-05 test mechanism

---

## Recruiting Lens overload fallback (HIST-07)

**Question:** How should Recruiting Lens behave when all 3 parallel Claude calls hit 529 overload?

| Option | Description | Selected |
|--------|-------------|----------|
| Build process-recruiting-lens-job worker | Mirrors the resume/career async pattern: worker drains analysis_jobs rows, persists analysis_results + saved_jobs, fires completion email, frontend polls get-analysis-job-status. ~1 day of code. Resilient under overload but adds a long-tail UX. | ✓ |
| Remove the orphan path; return sync 503 + specific toast | Delete `recruiting-lens/index.ts:329-353`. On all-529 return 503 with a "try again in a few minutes" toast. ~10 lines of code. Loses the analysis if overload persists. | |
| Build worker but skip email + frontend polling | Worker persists analysis_results silently; user retries later sees cached result. Cheaper than full async UX, less user-visible. | |

**User's choice:** Build process-recruiting-lens-job worker (Recommended).

**Follow-up Q1 — completion email behavior:**

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — mirror resume/career | Fire Resend email with deep-link to `/recruiting-lens?id=<run_id>`. Reuses `send-strivo-email`. | ✓ |
| No — frontend polling only | User must keep tab open; analysis lost if user closes tab. | |
| No email and no polling | Worker silently persists; next visit hydrates History. Cheapest UX. | |

**User's choice:** Yes — mirror resume/career (Recommended).

**Follow-up Q2 — saved_jobs scope:**

| Option | Description | Selected |
|--------|-------------|----------|
| Leave saved_jobs for Phase 40 | Phase 36 worker writes only to analysis_results (HIST-03 scope). Phase 40 (RCL-04) extends to saved_jobs. | ✓ |
| Wire saved_jobs now too | Pull RCL-04 forward; reduces worker churn later but is mild scope creep. | |

**User's choice:** Leave saved_jobs for Phase 40 (Recommended).

**Notes:** Net decision: build the worker, send a completion email, keep `saved_jobs` strictly in Phase 40. Resolves the silent-202 misleading-success UX today.

---

## Failed-analysis phantom history rows (HIST-06 nuance)

**Question:** How should failed analyses appear in AnalysisHistory going forward?

| Option | Description | Selected |
|--------|-------------|----------|
| Don't list them — unify on post-success write | Refactor all 4 atomic-pre-write features to call `record_ai_usage(4-arg)` AFTER per-feature row is persisted. Failed runs never appear in History. Cleanest UX. | ✓ |
| List them with a 'failed' visual state | Add a status column (or use `analysis_id = NULL` as the signal); render grayed out / un-clickable. More code, but users see the attempt. | |
| Status quo — list as success, route to nowhere | Keep pre-write. Failed runs appear as normal entries with NULL `analysis_id`; clicking falls through. Cheapest dev effort; worst UX. | |

**User's choice:** Don't list them — unify on post-success write (Recommended).

**Notes:** Implementation impact: split `_shared/usage-checker.ts:checkAndRecordUsage` into `checkEntitlement` (no INSERT) + `recordUsageWithAnalysis` (4-arg post-success). Touches analyze-career:1032, grade-linkedin:444, recruiting-lens:298. Free-tier carve-outs already match the target pattern — they just need to upgrade from 3-arg to 4-arg `record_ai_usage`. Cap-counter implication acknowledged: by Phase 36 ship date, Phase 30 will have removed `can_perform_ai_action` from the paywall path, so `usage_tracking` becomes a History-feed ledger, not a tier-cap source.

---

## Proximity matcher sunset (HIST-05)

**Question:** What happens to the ±5min proximity matcher and pre-Phase-36 history rows?

| Option | Description | Selected |
|--------|-------------|----------|
| Keep matcher as fallback indefinitely | AnalysisHistory tries `analysis_id` first; if NULL, falls back to proximity. Legacy rows stay clickable. No migration. Lowest risk. | ✓ |
| One-time backfill migration + remove matcher | SQL migration populates `analysis_id` for legacy rows via the same ±5min logic; then delete matcher. Cleaner end-state but bad-match risk. | |
| Remove matcher, leave legacy rows un-clickable | Delete the matcher. Legacy rows still list but click does nothing. Cheapest code-wise; breaks UX for old history. | |

**User's choice:** Keep matcher as fallback indefinitely (Recommended).

**Notes:** Backfill migration is captured in Deferred Ideas as a future cleanup-phase candidate after the legacy `analysis_id = NULL` population shrinks to a meaningful tail.

---

## TEST-05 test mechanism

**Question:** How should TEST-05 be implemented?

| Option | Description | Selected |
|--------|-------------|----------|
| Deno integration tests against staging | Mirrors Phase 29 TEST-02. One file per feature in `supabase/functions/<feature>/__tests__/history-persistence.test.ts`. Seeds test user, hits deployed staging function, asserts 3 invariants. Runs via `run-edge-tests.ps1` with `DENO_TEST_SUPABASE_REMOTE=1`. Highest signal. | ✓ |
| Deno unit tests with mocked Supabase client | Faster, no staging dependency. Misses real schema/RLS regressions; catches code-path drift. | |
| Documented manual QA checklist in VERIFICATION.md | Per TEST-01 valid path. Lowest dev cost; relies on operator discipline. | |
| Hybrid: Deno integration for Resume + Recruiting Lens; manual QA for the other 3 | Balanced effort/signal — only features being modified get automated tests. | |

**User's choice:** Deno integration tests against staging (Recommended).

**Notes:** Operator hand-off pattern mirrors Phase 29 TEST-02 — Phase 36 plan must include a `checkpoint:human-action` step so the operator runs the staging tests post-deploy. Includes a negative regression test asserting failed analyses leave NO `usage_tracking` row (guards the post-success-only contract).

---

## Claude's Discretion

- Exact `persistResumeAnalysis` helper signature and location.
- Whether `process-recruiting-lens-job` shares scaffolding with `process-resume-analysis-job` via a common helper or is a clean copy (recommendation: clean copy first).
- `checkEntitlement` underlying mechanism (`can_perform_ai_action` direct call vs. new entitlement-only RPC) — depends on what Phase 30 leaves in place.
- Exact `key_insights` selection for each feature's `analysis_results` rows.
- Whether Interview Prep `?id=` hydration introduces a separate read-only component or augments the existing intake page.
- pgTAP coverage skipped unless schema changes appear (none expected in Phase 36).

---

## Deferred Ideas

- **One-time backfill migration** for legacy `usage_tracking.analysis_id = NULL` rows — future cleanup phase.
- **Frontend polling of `get-analysis-job-status` for Recruiting Lens** — future UX-polish phase if users complain.
- **Read-only `<InterviewPrepReadOnly>` component** — possibly extracted in the future Interview Prep milestone if hydration diverges from the intake form.
- **Cap counter migration** — Phase 30 owns MER-11/12 paywall cutover; Phase 36 assumes that is in flight.
- **pgTAP coverage** for new RPC shape — skip unless schema changes.
