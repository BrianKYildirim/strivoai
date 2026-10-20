---
phase: 28
slug: merge-redeploy-baseline
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-28
validated: 2026-06-01
---

# Phase 28 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

This phase ships no new feature code — it is an operator-led merge + redeploy + legacy-delete runbook. "Validation" here means: every Success Criterion (SC #1–4) is proven by a deterministic command whose output is captured inline in VERIFICATION.md per D-18.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual operator runbook + targeted Deno test invocations + curl probes |
| **Config file** | None — PLAN.md IS the runbook |
| **Quick run command** | Per-step in PLAN.md (no aggregator) |
| **Full suite command** | None — runbook is sequential and manual |
| **Estimated runtime** | ~30–45 min end-to-end (merge + 2 deploys + 2 smoke batteries + 2 deletes + verification capture) |

---

## Sampling Rate

- **After every task commit:** N/A — phase ships no commits (operator-only `git push origin main` after FF; no Claude commits except optional plan/research artifacts)
- **After every plan wave:** Each wave's gate commands run inline; their output is captured for VERIFICATION.md
- **Before `/gsd-verify-work`:** All SC #1–4 commands below must produce expected output and be inlined in VERIFICATION.md per D-18
- **Max feedback latency:** Per-step (no aggregation); each gate fails loudly inline

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | SC | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----|------------|-----------------|-----------|-------------------|-------------|--------|
| 28-W0-01 | TBD | 0 | MERGE-01 | (preflight) | — | Branch divergence reconciled before FF attempt | smoke | `git fetch origin && git log origin/by/env-fixes..origin/main --oneline` (must be empty) | ✅ | ✅ green |
| 28-W0-02 | TBD | 0 | MERGE-02 | (preflight) | — | Deploy scripts include IPC functions | smoke | `grep -c "interview-prep-analyze\|interview-prep-evaluate" scripts/deploy-staging.ps1 scripts/deploy-production.ps1` (≥4 hits total) | ✅ | ✅ green |
| 28-W0-03 | TBD | 0 | MERGE-02 | SC #3 prep | — | IPC 503 repro payload recovered or fallback documented | manual | Operator pulls Supabase prod logs for 2026-04-28 503 entries → writes `payload.json` (or documents F2 synthetic fallback) | ✅ synthetic fallback | 🔶 manual (F2 `payload-synthetic.json` fallback used; original 503 body unrecoverable) |
| 28-W1-01 | TBD | 1 | MERGE-01 | SC #1 | — | FF merge succeeds; commit history preserved | smoke | `git log main..by/env-fixes --oneline` (must produce no output post-merge) | ✅ | ✅ green (SC #1 PASS) |
| 28-W1-02 | TBD | 1 | MERGE-01 | (D-03 gate) | — | Pre-FF preflight passes | smoke | `git log by/env-fixes..main --oneline` empty AND `git merge --ff-only --no-commit by/env-fixes && git merge --abort` exits 0 | ✅ | ✅ green |
| 28-W1-03 | TBD | 1 | MERGE-01 | (D-02) | — | Dirty tree stashed before merge, dropped after | smoke | `git status --porcelain` (clean before FF; stash entry exists; stash drop after merge confirmed) | ✅ | ✅ green |
| 28-W2-01 | TBD | 2 | MERGE-02 | (D-05/D-06) | — | Staging redeploy of all 35 functions succeeds | smoke | `scripts/deploy-staging.ps1` exits 0; output shows each function deployed | ✅ | ✅ green (W2-EVIDENCE) |
| 28-W2-02 | TBD | 2 | MERGE-02 | SC #4 (P25) | — | `MeritCostPreview` mounts on `/career-compass` post-redeploy | static + UI | `git show main:src/pages/CareerCompass.tsx \| grep -c "MeritCostPreview"` (≥2 hits — import+mount) + browser visit `/career-compass` shows preview | ✅ | ✅ green (static=2; UI confirmed via operator screenshot `sc4-meritcostpreview-prod.png`) |
| 28-W2-03 | TBD | 2 | MERGE-02 | SC #4 (P26) | — | `refundMeritsForJob` recognizes `already_refunded` in resume worker | static + unit | `git show main:supabase/functions/process-resume-analysis-job/index.ts \| grep -c "already_refunded\|alreadyRefunded"` (≥1) + `deno test supabase/functions/process-resume-analysis-job/__tests__/refund-on-failure.test.ts` exits 0 | ✅ | ✅ green (static=2; deno 8/8 pass) |
| 28-W2-04 | TBD | 2 | MERGE-02 | SC #4 (P26) | — | Same for career worker | static + unit | `git show main:supabase/functions/process-career-analysis-job/index.ts \| grep -c "already_refunded\|alreadyRefunded"` (≥1) + `deno test supabase/functions/process-career-analysis-job/__tests__/refund-on-failure.test.ts` exits 0 | ✅ | ✅ green (static=2; deno 9/9 pass) |
| 28-W2-05 | TBD | 2 | MERGE-02 | SC #4 (P27) | — | 410-Gone shim responds at legacy `/stripe-webhook` (staging) | smoke (curl) | `curl -X POST -i https://cimjltzovkahkqecpwgi.functions.supabase.co/stripe-webhook -d '{}' \| head -1` returns `HTTP/1.1 410` | ✅ A2 URL pattern confirmed | ✅ green |
| 28-W2-06 | TBD | 2 | MERGE-02 | SC #3 | — | IPC 503 repro returns 200 (staging) | smoke (curl × 2 tiers) | `curl -X POST <staging>/interview-prep-analyze -H "Authorization: Bearer <pro_jwt>" -d @payload.json \| jq '.quizId'` non-null AND same for elite_jwt | ✅ | ✅ green (staging Elite returned 200 + valid quizId/flashcards, W2-EVIDENCE Task 3) |
| 28-W2-07 | TBD | 2 | MERGE-02 | (D-07.3) | — | All 5 features 200 on one-shot smoke (staging) | manual UI | Operator drives staging.strivo.ai through Resume Analysis, LinkedIn Grader, Career Compass, Recruiting Lens, Interview Prep | n/a | 🔶 manual (operator 5/5 green, W2-EVIDENCE) |
| 28-W2-08 | TBD | 2 | MERGE-02 | (D-07.4 / D-08) | — | No new error spikes in 5-min log soak post-staging | manual | Supabase Dashboard staging function-logs view, ~5 min observation | n/a | 🔶 manual (log soak clean, W2-EVIDENCE) |
| 28-W3-01 | TBD | 3 | MERGE-02 | (D-09) | — | Production redeploy of all 35 functions succeeds | smoke | `scripts/deploy-production.ps1` exits 0; output shows each function deployed | ✅ | ✅ green (W3-EVIDENCE) |
| 28-W3-02 | TBD | 3 | MERGE-02 | SC #4 (P27) | — | 410-Gone shim responds at legacy `/stripe-webhook` (prod) | smoke (curl) | `curl -X POST -i https://zjpjapgraoxdukdvpjes.functions.supabase.co/stripe-webhook -d '{}' \| head -1` returns `HTTP/1.1 410` | ✅ A2 URL pattern confirmed | ✅ green (SC #4 PASS — `410 Gone` + `endpoint_deprecated`) |
| 28-W3-03 | TBD | 3 | MERGE-02 | SC #3 | — | IPC 503 repro returns 200 (prod) — D-09 same-battery-against-prod | smoke (curl × 2 tiers) | `curl -X POST <prod>/interview-prep-analyze -H "Authorization: Bearer <pro_jwt>" -d @payload.json \| jq '.quizId'` non-null AND same for elite_jwt | ✅ | 🔶 deferred (direct curl operator-deferred; SC #3 satisfied via D-16 alternate branch → Phase 41 supersession + Phase 47 prod gating) |
| 28-W3-04 | TBD | 3 | MERGE-02 | (D-09 surfaces) | — | All 5 features 200 + Phase 25/26/27 surfaces re-verified against prod | manual UI | Operator drives prod through each feature + re-runs static checks against `main` HEAD | n/a | 🔶 manual (operator 5/5 green on prod, W3-EVIDENCE Task 4) |
| 28-W4-01 | TBD | 4 | MERGE-03 | (D-12) | — | No live refs to `interview-prep-coach` in src/ or supabase/ | smoke | `rg -n "interview-prep-coach" src/ supabase/` returns no matches | ✅ verified pre-merge | ✅ green (re-run 2026-06-01: 0 matches) |
| 28-W4-02 | TBD | 4 | MERGE-03 | SC #2 | — | `interview-prep-coach` absent from staging functions list | smoke | `supabase functions list --project-ref cimjltzovkahkqecpwgi \| grep -c interview-prep-coach` returns 0 | ✅ | ✅ green (SC #2 PASS — count 0) |
| 28-W4-03 | TBD | 4 | MERGE-03 | SC #2 | — | `interview-prep-coach` absent from prod functions list | smoke | `supabase functions list --project-ref zjpjapgraoxdukdvpjes \| grep -c interview-prep-coach` returns 0 | ✅ | ✅ green (SC #2 PASS — count 0) |
| 28-W5-01 | TBD | 5 | MERGE-01..03 | (D-18) | — | VERIFICATION.md SC #1–4 checklist with inline command output (machine-extractable) | doc | `test -f .planning/phases/28-merge-redeploy-baseline/28-VERIFICATION.md && grep -c "^### SC #" 28-VERIFICATION.md` ≥ 4 | ✅ | ✅ green (re-run 2026-06-01: 4 SC sections) |

*Status: ⬜ pending · ✅ green · 🔶 manual / deferred (intrinsically non-automatable or D-16 alternate branch) · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] **Operator decision: branch divergence reconciliation strategy** — resolved; FF merge consumed `by/env-fixes` (SC #1 PASS, `git log main..by/env-fixes` empty). Remote source branch deleted post-PR #433.
- [x] **Pre-merge edit to deploy scripts** — `interview-prep-analyze` / `interview-prep-evaluate` present in both deploy scripts (W0-02 grep ≥4 hits).
- [x] **Operator-recovered IPC 503 request body file** — original 503 body unrecoverable from prod logs; F2 synthetic fallback (`payload-synthetic.json`) adopted with documented reduced SC #3 fidelity.
- [x] **Operator-captured Pro and Elite test-account JWTs** — staging tier matrix exercised (Elite 200 captured, W2-EVIDENCE Task 3); prod direct repro operator-deferred → SC #3 via D-16 alternate branch.
- [x] **Verified Supabase Functions URL pattern (A2 from RESEARCH.md)** — `https://<project_ref>.functions.supabase.co/<function_name>` confirmed at runtime (410-shim probes returned correct status + `sb-project-ref` headers).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Operator runs `git push origin main` (D-04) | MERGE-01 | Per CLAUDE.md + harness git safety, Claude does NOT push. Operator-authorized only. | After successful FF merge locally, operator runs `git push origin main` from local terminal; verify push succeeds via `git log origin/main -1 --oneline`. |
| 5-feature one-shot smoke (D-07.3, D-09) on staging + prod | MERGE-02 | UI flows; no headless harness. | Operator opens staging.strivo.ai (then prod), exercises each of 5 features end-to-end, confirms 200 responses + result rendering. |
| 5-min function-log soak (D-07.4 / D-08) | MERGE-02 | Subjective inspection of error rate trend in Supabase Dashboard. | Operator watches Supabase Dashboard function-logs view for ~5 min post-staging-deploy; aborts promotion to prod if new error spike observed. |
| Original-tier capture for IPC 503 D-15 matrix | MERGE-02 | The original 503 tier was not preserved in repo; if logs surface it, operator updates the tier matrix. | Operator notes original tier from recovered Supabase log line (if present); else default matrix is Pro + Elite per D-15. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies → see Per-Task Verification Map above
- [x] Sampling continuity: no 3 consecutive tasks without automated verify → satisfied (every wave has at least one automated gate)
- [x] Wave 0 covers all MISSING references → all 5 Wave 0 items closed (see above)
- [x] No watch-mode flags
- [x] Feedback latency < 30s per gate (curl + grep) — with manual gates explicitly flagged in Manual-Only Verifications
- [x] `nyquist_compliant: true` set in frontmatter — Wave 0 closed; all automatable gates green

**Approval:** validated 2026-06-01 (BY) — every automatable gate COVERED-green; manual-only + D-16-deferred rows explicitly flagged

---

## Validation Audit 2026-06-01

Retroactive Nyquist audit (State A). VALIDATION.md was the pre-execution draft (2026-04-28); reconciled against `28-VERIFICATION.md` (all 4 SCs PASS, 2026-05-11) and W0–W4 evidence files. Re-ran every automatable gate fresh on `main` HEAD.

| Metric | Count |
|--------|-------|
| Gaps found (MISSING automated tests) | 0 |
| Map rows reclassified pending → green | 17 |
| Map rows reclassified pending → manual/deferred | 5 |
| New test files generated | 0 |
| Resolved | 22 |
| Escalated | 0 |

**Why 0 generated tests:** Phase 28 ships no feature code — it is an operator merge/redeploy/legacy-delete runbook. The only automatable feature-level checks (refund-on-failure for both async workers) already have test files (`refund-on-failure.test.ts` × 2) that pass **17/17** (8 resume + 9 career). Re-verified this session: static greps (`MeritCostPreview`=2, `already_refunded`=2/2), `rg interview-prep-coach`=0 matches, VERIFICATION.md SC-section count=4.

**Manual/deferred carve-outs (intrinsically non-automatable — no headless harness):** W0-03 (synthetic-payload fallback), W2-07/W3-04 (5-feature UI smoke), W2-08 (5-min log soak), W3-03 (SC #3 prod direct curl operator-deferred → satisfied via D-16 alternate branch: Phase 41 supersession + Phase 47 prod feature-gate). These are flagged in Manual-Only Verifications, not Nyquist-blocking.
