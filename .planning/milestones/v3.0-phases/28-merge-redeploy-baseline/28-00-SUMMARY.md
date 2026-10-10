---
phase: 28-merge-redeploy-baseline
plan: 00
subsystem: deploy-scripts + operator-evidence
tags: [merge-baseline, ipc, deploy, operator-gate]
dependency_graph:
  requires: []
  provides: [w1-unblock, deploy-scripts-with-ipc, w0-evidence]
  affects: [28-01, 28-02, 28-03]
tech_stack:
  added: []
  patterns: [operator-gate-checkpoint, evidence-driven-handoff]
key_files:
  created:
    - .planning/phases/28-merge-redeploy-baseline/28-W0-EVIDENCE.md (LOCAL ONLY)
    - C:/Users/yildi/strivo-ipc-payload/payload-synthetic.json (LOCAL ONLY, outside repo)
  modified:
    - scripts/deploy-staging.ps1
    - scripts/deploy-production.ps1
decisions:
  - F1 reconciliation chose option-a (merge main into by/env-fixes, then FF) — but execution path actually completed via GitHub PRs (#430, #433); option-a's mechanics never had to run locally
  - F3 outcome F2 (synthetic payload) — Supabase log retention is 24h; original 503 was 7 days stale, F1 path infeasible
  - JWTs stored in .env.staging.local (gitignored) instead of ~/strivo-ipc-payload/jwts.txt — operator ergonomics, gitignore guarantee equivalent
metrics:
  completed: "2026-05-05T00:00:00Z"
---

# Phase 28 Plan 00: Wave 0 Operator Escalation Gate — Summary

Wave 0 closed all three RESEARCH.md blockers (F1 branch divergence, F2 deploy script gaps, F3 IPC 503 payload recovery) and verified the A2 Supabase Functions URL pattern. The gate was multi-mode: F2 fully claude-executed; F1, F3, A2, and Task 4-A required operator-only work that the operator completed asynchronously across 2026-04-29 → 2026-05-05.

## What Was Done

### Task 1: F1 — Branch reconciliation decision (operator)

Operator captured divergence diagnostic on 2026-04-29 (8 commits on origin/main not on origin/by/env-fixes; 174 commits on origin/by/env-fixes not on origin/main). Decided option-a (merge main → by/env-fixes, then FF main). Documented in `28-W0-EVIDENCE.md` § F1 with raw `git log` output.

**Variance from plan execution path:** option-a was never operationalized locally. The reconciliation completed via GitHub PRs (#430, #433) before Wave 1 ever ran the local FF mechanics. SC #1 is satisfied via the PR-merge path. See 28-01-SUMMARY.md for Wave 1 closeout.

### Task 2: F2 — Add IPC functions to deploy script $Functions arrays

Edited `scripts/deploy-staging.ps1` and `scripts/deploy-production.ps1` to add `"interview-prep-analyze"` and `"interview-prep-evaluate"` after `"check-merit-alerts"` (lines 36–37 in each). Both scripts now enumerate 35 functions. PowerShell parse-check passed. Committed on by/env-fixes; carried into origin/main via PR #430.

### Task 3: F3 — IPC 503 payload recovery (operator + claude)

Operator confirmed Supabase function-log retention is 24h; original 503 (2026-04-28) was 7 days stale at recovery attempt, so F1 (raw replay) was infeasible. Fell back to **F2 path**: claude generated `payload-synthetic.json` (Senior PM Growth role, 30-min mixed-format behavioral, Pro tier, 1,732-byte IntakeForm body) at `C:/Users/yildi/strivo-ipc-payload/payload-synthetic.json`. Combined with `scripts/test-resumes/long.txt` (7,985 bytes ≈ 2,158 input tokens) uploaded as the test-account resume PDF, total LLM input ≈ 2,686 tokens — matches PROJECT.md L37 preserved metadata. Replay protocol documented in 28-W0-EVIDENCE.md § F3.

**Reduced fidelity acknowledged (D-14 deviation):** body content is synthetic, not the original 2026-04-28 request. Token shape matches; semantic content differs.

### Task 4-A: Pro/Elite JWT capture (operator)

Operator pulled all 4 JWTs (staging Pro, staging Elite, prod Pro, prod Elite) from authenticated browser sessions via `sb-<ref>-auth-token` Local Storage extraction. Stored in `.env.staging.local` (gitignored — verified via `git check-ignore -v`). Identity mapping verified from JWT `sub` + `email` claims:

| Var | Tier | Email | Project ref |
| --- | --- | --- | --- |
| STAGING_PRO_JWT | Pro | byildiri@uci.edu | cimjltzovkahkqecpwgi |
| STAGING_ELITE_JWT | Elite | strivolife@gmail.com | cimjltzovkahkqecpwgi |
| PROD_PRO_JWT | Pro | byildiri@uci.edu | zjpjapgraoxdukdvpjes |
| PROD_ELITE_JWT | Elite | strivolife@gmail.com | zjpjapgraoxdukdvpjes |

**Variance from plan storage path:** plan called for `~/strivo-ipc-payload/jwts.txt`. Operator chose `.env.staging.local` for ergonomics (single dotenv source for Wave 2/3 curl probes). Gitignore guarantee equivalent.

### Task 4-B: A2 — Supabase Functions URL pattern verification

Verified via anonymous OPTIONS probes against `keep-warm`. Both primary `<ref>.functions.supabase.co/<fn>` and alternate `<ref>.supabase.co/functions/v1/<fn>` patterns return HTTP 200 in both environments. Canonical bases:

```
STAGING_FUNC_BASE=https://cimjltzovkahkqecpwgi.functions.supabase.co
PROD_FUNC_BASE=https://zjpjapgraoxdukdvpjes.functions.supabase.co
```

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 2 | 53db7a3 | chore(28-00): add interview-prep-analyze + interview-prep-evaluate to deploy script lists for D-06 parity |

(Tasks 1, 3, 4-A, 4-B produced no commits — all evidence lives in `.planning/` LOCAL ONLY artifacts and outside-repo files per CLAUDE.md.)

## Deviations from Plan

### 1. F3 outcome forced to F2 (Supabase log retention)
- **Trigger:** operator-confirmed 24h log retention; 7-day-old 503 unrecoverable
- **Resolution:** synthetic payload built to match token signature (2,686 tokens)
- **Acceptance:** D-14 strict-fidelity replay relaxed to "best-effort F2"; SC #3 verdict in Wave 3 will read accordingly
- **Files:** C:/Users/yildi/strivo-ipc-payload/payload-synthetic.json (LOCAL ONLY)

### 2. JWT storage path
- **Trigger:** operator preference for single dotenv source over dedicated jwts.txt
- **Resolution:** stored in .env.staging.local (gitignored — pattern matches both `.env.*` and `*.local`)
- **Acceptance:** plan's "LOCAL ONLY, NEVER commit" intent satisfied via gitignore

### 3. Wave 0 → Wave 1 path
- **Trigger:** by/env-fixes → main merge completed asynchronously via GitHub PRs (#430, #433) before Wave 1 ever started
- **Resolution:** Wave 1 documents the variance and verifies SC #1 via PR-merge path; no local-FF mechanics needed
- **Acceptance:** see 28-01-SUMMARY.md

## Verification Results

- `28-W0-EVIDENCE.md` contains F1, F2, F3, A2, and Task 4-A sections: ✅
- `grep -c "interview-prep-analyze" scripts/deploy-staging.ps1`: 1 ✅
- `grep -c "interview-prep-evaluate" scripts/deploy-production.ps1`: 1 ✅
- `git log -1 --format=%s 53db7a3` matches `^chore\(28-00\):.*deploy script lists`: ✅
- `git status --porcelain | grep -E "payload.*\.json|jwts\.txt"`: empty (no PII staged) ✅
- `git status --porcelain .planning/`: only `28-W0-EVIDENCE.md` and this file modified locally; never committed ✅
- `git check-ignore -v .env.staging.local`: matches `.gitignore:18:*.local` ✅

## Self-Check: PASSED

- [x] All 4 acceptance criteria from 28-00-PLAN.md verified
- [x] Wave 0 evidence file populated for F1, F3, A2, Task 4-A
- [x] Deploy-script commit `53db7a3` lives in origin/main ancestry (verified via 28-W1-EVIDENCE.md § "SC #1 corollary")
- [x] No PII / JWT files staged for commit
