# Phase 28 Wave 0 — Operator Evidence (LOCAL ONLY — never committed)

> Per CLAUDE.md: anything in `.planning/` MUST NOT be committed. This file lives on disk only as Wave 0 attestation for Wave 1 unblocking.

---

## F1: Branch Reconciliation Decision

**Decision:** option-a — Merge `main` into `by/env-fixes`, then FF `by/env-fixes` → `main`.

**Rationale:** The 8 commits on `origin/main` not present on `origin/by/env-fixes` are real PR merges containing net-new code (stripe-webhook updates, create-checkout-session, create-payment-intent, multiple migrations, ~thousands of changed lines). Option-b (force-reset main) would destroy that work — its precondition (duplicate content) does not hold. Option-a preserves all 174 commits on `by/env-fixes` and all 8 on `main`, requires no `--force`, and honors D-01 spirit (FF *into* main; one merge commit lives on `by/env-fixes`).

**Diagnostic captured 2026-04-29 (operator workstation):**

```
$ git fetch origin --prune
From https://github.com/kapura3-star/strive-ai-hired
 - [deleted]         (none)     -> origin/ak/linkedin-score-fix
 - [deleted]         (none)     -> origin/ak/navbar-fix
 - [deleted]         (none)     -> origin/chore/27-d19-legacy-stripe-webhook-cleanup

$ git log origin/by/env-fixes..origin/main --oneline
06b9b46 Preview (#432)
9e9d405 Preview (#428)
c6d02b1 Merge branch 'staging' into by/env-fixes (#424)
13f8855 Merge branch 'staging' into by/env-fixes (#421) (#422) (#423)
5707254 squash merge into main
7166aa5 Staging (#419)
1386c58 Staging (#417)
48ecf87 Preview (#334)

$ git log origin/main..origin/by/env-fixes --oneline | wc -l
174

$ git branch -vv | grep -E "^\*|by/env-fixes|^  main"
* by/env-fixes  aa3d696 [origin/by/env-fixes] chore: update cli-latest to v2.95.4 and gotrue-version to v2.189.0
  main          c6d02b1 [origin/main: behind 2] Merge branch 'staging' into by/env-fixes (#424)
```

**Note:** RESEARCH.md captured 6 main-only commits; reality at execution time is **8** (two newer Preview merges landed since plan was written). This does not change the recommendation; option-a still applies.

**Wave 1 implication:** 28-01-PLAN.md operationalizes option-a's mechanics: locally merge origin/main into by/env-fixes (resolve any conflicts), commit the merge, then FF main → by/env-fixes. No revisions needed to 28-01.

---

## F2: Deploy Script IPC Additions

**Commit:** `53db7a3` on `by/env-fixes` (NOT pushed — D-04 operator-only push during Wave 1).

**Subject:** `chore(28-00): add interview-prep-analyze + interview-prep-evaluate to deploy script lists for D-06 parity`

**Diff stat:** `2 files changed, 4 insertions(+)`. Both `scripts/deploy-staging.ps1` and `scripts/deploy-production.ps1` now enumerate 35 functions (33 prior + `interview-prep-analyze` + `interview-prep-evaluate` appended after `check-merit-alerts` at lines 36-37).

**PowerShell parse-check:** ✅ both scripts parse clean.

**Verification (executed 2026-04-29):**

```
$ grep -n "interview-prep-(analyze|evaluate)" scripts/deploy-{staging,production}.ps1
scripts/deploy-production.ps1:36:    "interview-prep-analyze"
scripts/deploy-production.ps1:37:    "interview-prep-evaluate"
scripts/deploy-staging.ps1:36:    "interview-prep-analyze"
scripts/deploy-staging.ps1:37:    "interview-prep-evaluate"

$ git diff HEAD~1 HEAD -- scripts/deploy-staging.ps1 scripts/deploy-production.ps1 \
   | grep -E '^\+\s+"interview-prep-(analyze|evaluate)"' | wc -l
4
```

---

## F3: IPC 503 Payload Recovery

**Outcome: F2** (synthetic payload — production logs unrecoverable; Supabase plan retains only 24h, original 503 was 2026-04-28 = 7 days stale).

**Local payload path:** `C:\Users\yildi\strivo-ipc-payload\payload-synthetic.json` (1,732 bytes; outside repo per CLAUDE.md memory rule).

**Token-signature reconstruction (target: ~2686 input tokens to match PROJECT.md L37 preserved metadata):**

| Component | Source | Bytes | Approx tokens (÷3.7) |
| --- | --- | ---: | ---: |
| IntakeForm body | synthetic JSON, Senior PM Growth role, 30-min mixed-format behavioral, Pro tier targeting | 1,732 | ~468 |
| Resume PDF (server-fetched) | `scripts/test-resumes/long.txt` rendered to PDF and uploaded to test account | 7,985 | ~2,158 |
| **Total LLM input** | (intake + resume + system prompt overhead ~60 tokens) | — | **~2,686** |

**Replay protocol for Wave 2/3 IPC repro (D-14 strict-fidelity replay, F2-degraded acknowledged):**

1. On a Pro-tier staging test account, upload `scripts/test-resumes/long.txt` (rendered to PDF — any text-PDF tool is fine; the byte signature is what matters) as the active resume.
2. Capture STAGING_PRO_JWT (Wave 0 Task 4-A) and resolved STAGING_FUNC_BASE.
3. POST the synthetic body:

   ```bash
   curl -i -X POST "${STAGING_FUNC_BASE}/interview-prep-analyze" \
     -H "Authorization: Bearer ${STAGING_PRO_JWT}" \
     -H "Content-Type: application/json" \
     --data @"$HOME/strivo-ipc-payload/payload-synthetic.json"
   ```

4. Repeat for Pro tier on PROD (`PROD_FUNC_BASE`, `PROD_PRO_JWT`) and for Elite on both envs (D-15 tier matrix).

**Reduced fidelity acknowledged (D-14 deviation):** body content (role/JD/categories) is synthetic, not the original 2026-04-28 request. Token shape matches; semantic content differs. SC #3 verdict therefore reads as "best-effort repro on F2-equivalent payload" rather than literal replay.

---

## A2: Supabase Functions URL Pattern

**Primary canonical bases (verified via anonymous OPTIONS probe to `keep-warm`, 2026-04-29):**

```
STAGING_FUNC_BASE=https://cimjltzovkahkqecpwgi.functions.supabase.co
PROD_FUNC_BASE=https://zjpjapgraoxdukdvpjes.functions.supabase.co
```

Both primary `<ref>.functions.supabase.co/<fn>` and alternate `<ref>.supabase.co/functions/v1/<fn>` patterns return `HTTP/1.1 200 OK` on OPTIONS in both envs. The canonical pattern (per RESEARCH.md A2) — `<ref>.functions.supabase.co/<fn>` — is what Wave 2/3 smoke probes will use.

**Raw status lines:**

```
STAGING primary  : HTTP/1.1 200 OK
STAGING alternate: HTTP/1.1 200 OK
PROD primary     : HTTP/1.1 200 OK
PROD alternate   : HTTP/1.1 200 OK
```

---

## Task 4-A: Pro/Elite JWT Capture

**All 4 JWTs captured 2026-05-05.** Stored locally at `C:\Projects\strive-ai-hired\.env.staging.local` (gitignored — matches both `.env.*` and `*.local` patterns in `.gitignore`; `git check-ignore -v` confirms; `git status --porcelain` shows `.env.staging.local` is NOT staged).

**Variance from plan:** plan called for `~/strivo-ipc-payload/jwts.txt`. Operator chose to colocate JWTs with other env secrets in `.env.staging.local` for ergonomics (single-source dotenv loadable via `Get-Content .env.staging.local | ...` for the Wave 2/3 curl probes). Acceptable: the gitignore guarantee equals the spirit of "LOCAL ONLY, NEVER commit" stated in 28-00-PLAN.md Task 4 acceptance criteria.

**Identity mapping (verified from JWT `sub` + `email` claims):**

| Var | Tier | Email | Project ref |
| --- | --- | --- | --- |
| `STAGING_PRO_JWT` | Pro | byildiri@uci.edu | cimjltzovkahkqecpwgi (staging) |
| `STAGING_ELITE_JWT` | Elite | strivolife@gmail.com | cimjltzovkahkqecpwgi (staging) |
| `PROD_PRO_JWT` | Pro | byildiri@uci.edu | zjpjapgraoxdukdvpjes (production) |
| `PROD_ELITE_JWT` | Elite | strivolife@gmail.com | zjpjapgraoxdukdvpjes (production) |

**Token lifetime:** all 4 JWTs have `exp` ≈ 1778034000 (Unix; expires within ~1 hour of capture per Supabase Auth default). Wave 2 + Wave 3 smoke probes must run within that window OR the operator must re-pull tokens (re-running login → DevTools extraction). For longer-lived sessions, switch to `refresh_token` flow — but D-15 tier matrix is short enough that fresh capture is fine.

**Post-Phase-28 hygiene reminder:** when Phase 28 closes, prune the 4 `*_JWT=` lines from `.env.staging.local` (or simply let them expire — they're access tokens, not refresh tokens). The other secrets in that file are unrelated to Phase 28 and remain operationally needed.

---

## All Wave 0 prerequisites green

| Task | Status | Evidence |
| --- | --- | --- |
| F1 (branch reconciliation) | ✅ | option-a documented above |
| F2 (deploy script edits) | ✅ | commit `53db7a3` on `by/env-fixes`; carried into origin/main via PR #430 |
| F3 (IPC 503 payload) | ✅ (F2-degraded) | `~/strivo-ipc-payload/payload-synthetic.json`; replay protocol documented |
| Task 4-A (JWTs) | ✅ | 4 tokens in `.env.staging.local` (gitignored) |
| A2 (URL bases) | ✅ | STAGING/PROD function bases verified via OPTIONS probe |

Wave 1 (28-01-PLAN.md) is unblocked. **Note:** Wave 1's planned local-FF mechanics are now moot — the by/env-fixes → main reconciliation already completed via GitHub PRs (#430, #433); `git log origin/main..origin/by/env-fixes --oneline` returns 0. SC #1 is satisfied via the PR-merge path. See `28-01-SUMMARY.md` for variance write-up.
