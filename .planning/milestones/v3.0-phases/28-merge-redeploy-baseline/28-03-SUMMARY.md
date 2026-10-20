---
phase: 28-merge-redeploy-baseline
plan: 03
subsystem: production-deploy + smoke
tags: [merge-baseline, production, ipc, sc3-deferred, sc4-3of3, d17-not-fired, w4-unblock]
dependency_graph:
  requires: [28-00, 28-01, 28-02]
  provides: [prod-redeployed-from-main, sc4-prod-surfaces, sc3-operator-deferred, w4-unblock]
  affects: [28-04, 28-05]
tech_stack:
  added: []
  patterns: [supabase-functions-deploy-use-api, server-side-bundling]
key_files:
  created:
    - .planning/phases/28-merge-redeploy-baseline/28-W3-EVIDENCE.md
    - C:/Users/yildi/strivo-ipc-payload/deploy-production.log (LOCAL ONLY)
    - C:/Users/yildi/strivo-ipc-payload/sc4-meritcostpreview-prod.png (LOCAL ONLY screenshot)
  modified: []
decisions:
  - Checkout switched from `staging` to `main` + `git pull --ff-only` before deploy — origin/main had moved 17 commits past staging branch (HEAD now `33ae586`).
  - Wave 2 staging re-soak scoped against new HEAD then operator-skipped — only 1 edge-fn delta (`send-notification-email` auth/CORS shift) and 20 frontend files (Phase 47 gating already env-flagged off on prod Vercel scope).
  - SC #3 IPC verdict deferred — operator declined JWT capture; D-16 `phase-41-handoff` working assumption holds because Phase 47 gates Interview Prep OFF on prod (functions deployed but unreachable from prod-user UI).
  - SC #4 Surface 2 (`alreadyRefunded`) used static + Wave 2 test reuse — worker code byte-identical between `03811aa..33ae586` (empty diff).
  - Optional $0.50 Stripe live shop test (D-17.3) deferred — operator skipped.
metrics:
  prod_functions_deployed: 35
  prod_deploy_exit_code: 0
  sc4_surfaces_passed: 3
  sc4_surfaces_total: 3
  d09_features_passed: 5
  d09_features_total: 5
  d17_revert_triggers_fired: 0
  sc3_verdict_rendered: false
  completed: "2026-05-11T11:30:00Z"
---

# Phase 28 Plan 03: Wave 3 Production Redeploy + Smoke — Summary

35-function production redeploy from `origin/main` HEAD `33ae586` completed via `supabase functions deploy --use-api`, exit 0, footer `Production deploy complete.` confirmed (T-28-01 wrong-project guard satisfied). SC #4 prod surfaces 3/3 PASS. SC #3 IPC verdict operator-deferred — Phase 47 gating makes this non-release-blocking. 5/5 features PASS on prod smoke + 5-min log soak clean. Zero D-17 revert triggers fired. **Wave 4 (legacy `interview-prep-coach` delete) promotion: GO.**

## What Was Done

### Task 1: Production redeploy (35 functions)

Operator executed `pwsh -File scripts/deploy-production.ps1` from local checkout of `main` HEAD `33ae586` (post-FF; 17 commits ahead of the prior Wave 2 staging baseline `03811aa`). All 35 functions deployed successfully via `--use-api --no-verify-jwt`; both IPC functions (`interview-prep-analyze`, `interview-prep-evaluate`) confirmed in deploy log; `send-notification-email` (the only edge-fn code delta since Wave 2 — commit `2a35534`, user-CORS+JWT shift) deployed cleanly. Final footer `Production deploy complete.` present (T-28-01 mitigation); exit code 0. All per-function confirmations read `Deployed Functions on project zjpjapgraoxdukdvpjes` — no staging-project reference appeared anywhere in the log.

`interview-prep-coach` (legacy IPC fn) remained deployed on prod — already excluded from the 35-function array per Phase 23 retire; awaits Wave 4 delete per D-10.

### Task 2: SC #4 Phase 25/26/27 prod surfaces

All three surfaces verified observable post-deploy:

- **Surface 1 — Phase 25 `MeritCostPreview` on `/career-compass`:** `git show main:src/pages/CareerCompass.tsx | Select-String -Pattern "MeritCostPreview"` returned 2 hits (import line 25, mount line 933). Live render confirmed via Career Compass smoke (Task 4) — screenshot at `~/strivo-ipc-payload/sc4-meritcostpreview-prod.png`. ✅ PASS.
- **Surface 2 — Phase 26 `refundMeritsForJob` `alreadyRefunded` recognition:** Worker files byte-identical between `03811aa..33ae586` (empty diff for both `process-resume-analysis-job/` and `process-career-analysis-job/`). Static re-confirmation against `main` HEAD: 2 hits each. Wave 2 `deno test` results (8/8 + 9/9 pass) transfer forward. ✅ PASS.
- **Surface 3 — Phase 27 410-Gone shim at prod `/stripe-webhook`:** `curl.exe -X POST -i .../stripe-webhook -d "{}"` returned `HTTP/1.1 410 Gone` with body `{"error":"endpoint_deprecated","use":"/functions/v1/stripe-webhook-handler",...}`. Response header `sb-project-ref: zjpjapgraoxdukdvpjes` confirmed prod target (Pitfall 5 / T-28-01 mitigation). ✅ PASS.

**SC #4 production: 3/3 ✅** — D-17 revert trigger #2 NOT fired.

### Task 3: SC #3 IPC 503 prod repro — OPERATOR-DEFERRED

Operator declined to capture `PROD_PRO_JWT` + `PROD_ELITE_JWT` for the curl repro against `interview-prep-analyze`. The literal `VERDICT: drift-resolved | phase-41-handoff | revert-trigger` line required by Plan 28-03 acceptance criteria is therefore intentionally absent — recorded as a known acceptance-criteria gap in `28-W3-EVIDENCE.md` SC #3 section.

Standing directional evidence (from Wave 2, pre-this-redeploy): staging Elite tier returned 200 with valid `quizId`+`flashcards`; prod browser smoke (Pro session) reproduced 503 → drift hypothesis empirically validated.

Working assumption per D-16: SC #3 is on the `phase-41-handoff` branch. Tolerable here because Phase 47 (closed 2026-05-11) gates Interview Prep OFF on prod (`VITE_FEATURE_INTERVIEW_PREP=false` on Vercel Production scope) — IPC surfaces are unreachable from prod-user sessions regardless of drift state. Functions remain deployed on prod (operator-acknowledged trade-off per Phase 47 D-13/D-14).

Resume conditions for re-opening the verdict capture documented inline in `28-W3-EVIDENCE.md`.

### Task 4: D-09 5-feature smoke + 5-min log soak

Operator-driven browser smoke on `https://strivo.ai` (own authenticated session). All 5 features PASS:

| Feature | Verdict | D-17.1 critical |
|---------|:--:|:--:|
| Resume Analysis | ✅ PASS | yes |
| Career Compass | ✅ PASS | yes |
| LinkedIn Grader | ✅ PASS | yes |
| Recruiting Lens | ✅ PASS | yes |
| Interview Prep | ✅ PASS (Coming Soon page renders per Phase 47 gate) | n/a |

5-min Supabase Dashboard prod log soak: **clean** — no error spikes observed. Vercel prod frontend was `Ready` before soak window (Pitfall 4 mitigation).

Optional Stripe live $0.50 test purchase (D-17.3) deferred by operator.

**D-17 revert triggers: 0 fired** — non-IPC features all green, soak clean, no merit-balance/Stripe regression detected.

## Closing Status

| Gate | Status |
|------|:--:|
| Prod deploy 35/35 + footer + exit 0 | ✅ |
| SC #4 surfaces 3/3 on prod | ✅ |
| SC #3 IPC verdict | ⚠ deferred (Phase 47 gating makes this non-blocking) |
| D-09 5-feature smoke | ✅ 5/5 |
| 5-min prod log soak | ✅ clean |
| D-17 revert triggers | 0 fired |
| **Wave 4 promotion gate** | **✅ GO** |
