---
title: Phase 6 — Live-Smoke Blockers Handoff
phase: "06"
status: blocked-at-live-smoke
created: 2026-07-07
author: execute-phase orchestrator (session paused at operator session limit)
resume_with: /gsd-resume-work  (or re-open /gsd:execute-phase 6 — 06-03 Task 3 checkpoint)
---

# Phase 6 (Career Compass) — Live-Smoke Blockers Handoff

**READ THIS FIRST next session.** Phase 6 code is written, committed, and unit-green
(`test:edge` 1115/0/12, `vitest` 509/0), but the **live flag-ON path on preview is NOT
working**. Execution is paused at the **06-03 Task 3 operator live-smoke checkpoint**
(NOT approved). Do not mark Phase 6 complete.

---

## 0. TL;DR of where we are

- Waves 1 & 2 (06-01, 06-02) executed + SUMMARYs written. 06-03 Tasks 1–2 done + committed.
- 06-03 Task 3 = operator live smokes on preview → prod. **Blocked** by live bugs found during the smoke.
- The **paused 06-03 executor agent** is `agentId a859062386d294e51` (awaiting literal "approved"; do NOT approve — there are open bugs).
- **Primary open bug:** Career Compass hangs at **95%** on preview; a **run-identity split / dual-write** in the flag-ON path. Root cause most likely a **module-load-time flag snapshot** in `_shared/analysis-flags.ts` causing submit/worker/executor to disagree on the lifecycle flag.
- **Deploy is also blocked:** `./scripts/deploy.ps1 -Env staging` fails because `verify:baseline`'s Playwright leg has **1 failing Stripe E2E test** (unrelated to Phase 6).

---

## 1. Issue inventory (everything currently wrong)

### ISSUE A — Career Compass 95% hang on preview (PRIMARY, OPEN, Phase-6 defect)
**Symptom:** flag-ON Career Compass submit spins to 95% and never renders results; the
analysis actually completes (visible in History).

**Root-cause evidence (preview DB `analysis_jobs`, user `2ce242ad-9cbb-474c-aa2b-11e8b6fee4e5`):**
one submit produced **TWO rows**:
| id | feature | state | status | has_key | merit_settled | created |
|----|---------|-------|--------|---------|---------------|---------|
| `b08d5c24-…` | career_compass | completed | completed | yes | **true** | 08:36:06 |
| `4ba3de08-…` | **null** | null | **processing** | no | false | 08:36:04 |

- `4ba3de08` = **legacy raw insert** → produced by `submit-career-analysis-job` (its `isAnalysisFeatureEnabled('career_compass')` returned **FALSE** → legacy `.insert()` path at submit index ~294/385; returns `jobId = job.id`).
- `b08d5c24` = **`create_or_recover_analysis_run`** row → produced by `analyze-career` executor (flag **TRUE** → lifecycle path). Completed + settled Merit.
- The frontend (`src/pages/CareerCompass.tsx`) polls **`get-analysis-job-status({ jobId: careerJobId })`** where `careerJobId = submitData.jobId` (the legacy row `4ba3de08`). That row never completes → **95% hang**. The real work completed under the *other* row.

**Why the split:** `submit-career` and `analyze-career` call the SAME helper
`isAnalysisFeatureEnabled('career_compass')` (`_shared/analysis-flags.ts`) but disagreed at
runtime. Two hypotheses:
1. **(LEADING) Module-load-time flag snapshot.** `analysis-flags.ts` reads
   `ANALYSIS_LIFECYCLE_ENABLED` (line 53) and the per-feature flags into **top-level `const`s
   at isolate boot**. A warm `submit-career` isolate that booted *before* the preview flags were
   set returns stale `false`, while `analyze-career`'s isolate booted after → `true`. Split-brain.
2. Stale deployed code on `submit-career` (older than the 06-02 create_or_recover code).

**Remediation ATTEMPTED (UNVERIFIED):** redeployed `submit-career-analysis-job`,
`process-career-analysis-job`, and `analyze-career` to preview from the `staging` branch
(fresh isolates + current Phase-6 code). **The operator's subsequent re-run produced NO new
`analysis_jobs` row** (latest is still the 08:36 pair), so we never observed a clean
post-redeploy submit. **The redeploy's effect is unconfirmed.**

**NEXT SESSION — do this to confirm/fix:**
1. Confirm preview edge secrets: `ANALYSIS_LIFECYCLE_ENABLED=true` AND
   `ANALYSIS_LIFECYCLE_CAREER_COMPASS=true` (operator never explicitly confirmed the values).
2. Do a **clean** Career Compass submit on preview (hard-refresh; ensure `localStorage`
   `strivio.analysis.run_id` is empty). Immediately query:
   `select id, feature, state, status, has_key := idempotency_key is not null, created_at
    from analysis_jobs where user_id='2ce242ad-…' order by created_at desc limit 4;`
3. Expect **exactly ONE** new row: `feature='career_compass'`, `has_key=true`. If a
   `feature=null` legacy row ALSO appears → the split persists → the flag snapshot (hyp. 1)
   is confirmed.
4. **If split persists → fix `_shared/analysis-flags.ts` to read env at REQUEST time** (mirror
   `_shared/cors.ts`'s re-parse-on-change memoization) instead of module-load consts. Then the
   flag flip takes effect without needing every function redeployed. This is the recommended
   gap fix. Redeploy all lifecycle functions after.

### ISSUE B — Module-load flag snapshot = production rollout risk (OPEN, design)
`_shared/analysis-flags.ts` freezes all lifecycle flags at isolate boot. Consequence: flipping
a flag on prod **without redeploying every lifecycle function** (submit/worker/executor for all 5
features) reproduces Issue A's dual-write/hang in PRODUCTION. This is a v5.0-wide risk, not just
Career Compass. **Fix options:** (a) refactor to request-time env reads (RECOMMENDED — same
pattern as `cors.ts`); or (b) hard operational rule: "flip flag → redeploy ALL lifecycle
functions together." Capture as a Phase-6 gap.

### ISSUE C — 404 → infinite-active hang (OPEN, robustness gap in useAnalysisRun)
`src/hooks/useAnalysisRun.ts` `fetchStatus` (~line 277): on a null/404 result it does
`if (!data) return` — so an unknown/stale `run_id` never transitions to terminal, `isActive`
stays `true` forever → submit button locked + endless `get-analysis-run-status` polling. This was
the earlier "button won't click + constant 404" symptom (cleared by removing the persisted
run_id). **Fix:** a 404 ("Run not found") must resolve the tracked run to idle/cleared (and clear
the persisted run_id). Gap fix. This is squarely in 06-03's D-04 hang-repair remit for the
unknown-run case.

### ISSUE D — get-analysis-run-status archive_path 500 (FIXED on preview; NOT on prod)
Latent Phase-3 (03-05) bug: `get-analysis-run-status` selected a phantom `archive_path` column
from `analysis_jobs` (that column exists only on 7 payload tables per migration
`20260525000007`; the ledger migration `20260702000001` never added it to `analysis_jobs`).
PostgREST errored → `db-read-error` → **500 on every flag-ON poll fallback** (all migrated
features, not just Career Compass).
- **FIXED** in commit `b96fb11f` (removed `archive_path` from `RUN_STATUS_COLUMNS`; return
  `result_ref: null` — matches the documented Phase-4/5 "always null on analysis_jobs" contract).
  Targeted deno suite 8/8 green.
- **Deployed to PREVIEW** (version 9, verified in deployed source).
- **NOT deployed to PROD** — must deploy before the prod smoke leg.

### ISSUE E — Preview CORS ALLOWED_ORIGINS gap (FIXED by operator)
Preview Vercel branch origin (`https://strivoai-git-preview-brians-projects.vercel.app`) was not
in preview Supabase `ALLOWED_ORIGINS` → fail-closed CORS block on `submit-career-analysis-job`.
Operator added it. **Verify it persisted** next session (re-check the preview secret).

### ISSUE F — Prod "sections incomplete / partial" (PRE-EXISTING, NOT Phase 6, OPEN)
On PROD, fresh Career Compass runs render nearly every tab via `PartialSectionFallback`
(`getMissingCareerSections` finds `careerFields`/`roles`/`surpriseFits`/`roleReadinessBreakdown`
missing). This is a v3.0 / Phase-37 feature. Phase 6 ships **dormant on prod** so it did NOT
cause this. It's a separate pre-existing generation/save defect worth its own `/gsd-debug`.
(Operator noted preview shows unrelated mock content — that's `AI_TEST_MODE`, benign; do not
conflate with this.)

### ISSUE G — verify:baseline RED blocks `deploy.ps1 -Env staging` (OPEN, NOT Phase 6)
`./scripts/deploy.ps1 -Env staging` aborts: `verify:baseline FAILED`. Breakdown:
- `test:edge` (deno) **1115/0/12 PASS**.
- Playwright leg: **1 FAILED** — `e2e/stripe-checkout.spec.ts:26` "clientSecret round-trip +
  EmbeddedCheckout iframe mounts" → `TimeoutError: page.waitForResponse` 30s waiting for
  `/functions/v1/create-checkout-session` response. (1 failed, 1 skipped/quarantine, 4 passed.)
- This is a **Stripe test-mode E2E** issue, unrelated to Phase 6 (Phase 6 touched no Stripe
  code). Could be flaky, an env/secret gap for `create-checkout-session` in the E2E env, or a
  real regression. **It blocks the scripted staging deploy.** Triage separately:
  is `create-checkout-session` reachable in the E2E env? Is `.env.test.local` Stripe config
  present? Re-run `npm run test:e2e -- stripe-checkout` in isolation.
- WORKAROUND USED THIS SESSION: preview edge functions were deployed via **direct
  `npx supabase functions deploy <fn> --project-ref cimjltzovkahkqecpwgi`** (bypasses
  deploy.ps1 / verify:baseline). That is fine for preview iteration but the staging/prod
  scripted deploy stays blocked until Issue G is resolved (or `-SkipVerify` emergency switch,
  which is documented as emergency-only — prefer fixing the test).

### ISSUE H — Unexplained commit `2f4ff4b3` (REVIEW)
`2f4ff4b3 "Implement code changes to enhance functionality and improve performance"` sits between
`9da80a05` (06-03 runbook) and `b96fb11f` (my archive_path fix). I did NOT author it. Likely an
operator/editor/tooling commit. **Review its diff** (`git show 2f4ff4b3`) next session to be sure
it didn't introduce unrelated changes.

---

## 2. What IS done & verified

- **Code:** 06-01, 06-02, 06-03 Tasks 1–2 fully implemented + committed on `staging`.
- **Offline gates green:** `test:edge` 1115/0/12, `vitest` 509/0, targeted run-status suite 8/8.
- **CORS re-proof on PROD (Step 1 of smoke) PASSED:** apex + www echo ACAO + `Vary: Origin`
  incl. on 401/400; `evil.example.com` fail-closed — for both `analyze-career` and
  `submit-career-analysis-job`. (Recorded in `06-03-LIVE-SMOKE-RESULTS.md`.)
- **Merit safety observation:** the completed lifecycle run `b08d5c24` shows `merit_settled=true`,
  `refunded=false` — settle-on-saved worked for that run (no refund-after-save).

---

## 3. Commits this session (branch: staging)

```
b96fb11f fix(06-03): get-analysis-run-status no longer selects phantom archive_path on analysis_jobs
2f4ff4b3 (UNKNOWN — review) Implement code changes to enhance functionality and improve performance
9da80a05 docs(06-03): prepare operator live-smoke runbook (CORS matrix + preview ledger SQL)
38b77ba2 test(06-03): fold FEAT-05 scenario matrix into verify:baseline
6c2971b5 feat(06-03): replace CareerCompass 180s poll cap with useAnalysisRun run_id recovery
0be62850 docs(06-02): complete career-compass queue-plumbing plan
badc5eab test(06-02): analyze-career apex+www CORS-matrix guard + register in test:ci
b483c662 feat(06-02): process-career two-writer deferral + fix stale store comment
83a87950 feat(06-02): submit-career create_or_recover + derived key + payload threading
045f1595 docs(06-01): complete Career Compass lifecycle-adoption plan
b9d343d0 feat(06-01): attach runAnalysisLifecycle('career_compass') at legacy branch + close idempotency gap
ae1f76bc feat(06-01): add _shared/career-validation seam
8961141d docs(06-01): resolve RESEARCH Open Q1 — live analyze-career branch is legacy free-tier (static)
```
Working tree: **clean.**

---

## 4. Deploy state

**PREVIEW (`cimjltzovkahkqecpwgi`) — redeployed this session from `staging`:**
- `get-analysis-run-status` (v9, archive_path FIX)
- `submit-career-analysis-job`, `process-career-analysis-job`, `analyze-career` (fresh isolates + Phase-6 code)
- Flags appear ON (analyze-career created a lifecycle row) — **confirm exact values next session.**

**PROD (`zjpjapgraoxdukdvpjes`):**
- **NOTHING from Phase 6 deployed.** Flags OFF (dormant).
- **The archive_path fix (Issue D) is NOT on prod** — deploy `get-analysis-run-status` to prod
  before running the prod smoke leg. (Operator applies prod deploys; Claude read-only on prod.)

---

## 5. Still needed from operator (unanswered)

1. Exact preview flag values (`ANALYSIS_LIFECYCLE_ENABLED`, `ANALYSIS_LIFECYCLE_CAREER_COMPASS`).
2. (If Issue A recurs) the exact `run_id` POSTed to `get-analysis-run-status` from the Network
   tab, to compare against the DB row ids.

---

## 6. Recommended resume sequence

1. `git show 2f4ff4b3` — vet the unknown commit (Issue H).
2. Confirm preview flags ON (Issue A step 1).
3. Clean preview re-run; inspect `analysis_jobs` for single-vs-dual row (Issue A steps 2–3).
4. If split persists → **fix `_shared/analysis-flags.ts` to request-time env reads** (Issues A+B),
   redeploy all lifecycle fns, re-run.
5. Fix **Issue C** (404 → clear run) in `useAnalysisRun.ts`.
6. Re-run offline gates; then continue 06-03 Step 2–4 smokes on preview.
7. Triage **Issue G** (Stripe E2E) so `deploy.ps1` can run — or deploy preview via direct CLI.
8. Deploy archive_path fix + Phase-6 fns to **prod**; run prod smoke leg; then approve 06-03.
9. These are Career Compass **gap-closure** items — consider `/gsd:plan-phase 6 --gaps` if you
   prefer formal gap plans over inline fixes. Route **Issue F** to a separate `/gsd-debug`.

**Carried from earlier phases (still open, unrelated):** SEC-02-08-CRON — re-point prod cron
jobs 1 (`keep-warm-ping`) + 6 (`extract_catchup_nightly`) host `cimjltzovkahkqecpwgi` →
`zjpjapgraoxdukdvpjes` via live `cron.alter_job`.
