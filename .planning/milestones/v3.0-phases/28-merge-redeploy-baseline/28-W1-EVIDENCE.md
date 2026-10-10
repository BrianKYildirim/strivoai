# Phase 28 Wave 1 — Merge Evidence (LOCAL ONLY — never committed)

> Per CLAUDE.md: anything in `.planning/` MUST NOT be committed. This file lives on disk only as Wave 1 attestation for SC #1 / MERGE-01.

**Variance from 28-01-PLAN.md:** the plan operationalized a local FF merge (`git merge --ff-only by/env-fixes` then `git push origin main`). In reality, the by/env-fixes → main reconciliation completed asynchronously via GitHub PRs #430 (`By/env fixes`), #426, #418, etc., culminating in PR #433 (`Merge pull request #433 from kapura3-star/by/env-fixes`). origin/main now strictly contains every commit that was on origin/by/env-fixes. SC #1 is satisfied via the PR-merge path rather than the local-FF path. No re-execution needed; the merge already happened.

---

## SC #1: by/env-fixes fully contained in origin/main

**Captured 2026-05-05 after `git fetch origin --prune`:**

```
$ git log origin/main..origin/by/env-fixes --oneline
(empty)
```

Empty output = by/env-fixes has no commits that origin/main lacks. **SC #1 verified.**

```
$ git log origin/by/env-fixes..origin/main --oneline | head
03811aa Merge pull request #435 from kapura3-star/preview
1121a0a Merge pull request #434 from kapura3-star/staging
c9ad608 Merge pull request #433 from kapura3-star/by/env-fixes
06b9b46 Preview (#432)
46444bf Staging (#431)
19b051f By/env fixes (#430)
9e9d405 Preview (#428)
772b767 Staging (#427)
4dc15db By/env fixes (#426)
c6d02b1 Merge branch 'staging' into by/env-fixes (#424)
```

Reverse direction shows origin/main has moved **forward** independently of by/env-fixes (more recent preview/staging promotions); this is expected and does NOT invalidate SC #1.

---

## SC #1 corollary: Wave 0 deploy-script edits carried into origin/main

The Wave 0 Task 2 commit must reach origin/main so Wave 2 staging deploy includes IPC functions:

```
$ git log --oneline --all origin/main -- scripts/deploy-staging.ps1 scripts/deploy-production.ps1 | head
53db7a3 chore(28-00): add interview-prep-analyze + interview-prep-evaluate to deploy script lists for D-06 parity
6ff0a50 chore(quick-260409-sbl-02): resolve merge conflicts and remove match-job from deploy scripts
```

```
$ git show origin/main:scripts/deploy-staging.ps1 | grep -nE "interview-prep-(analyze|evaluate)"
36:    "interview-prep-analyze"
37:    "interview-prep-evaluate"

$ git show origin/main:scripts/deploy-production.ps1 | grep -nE "interview-prep-(analyze|evaluate)"
36:    "interview-prep-analyze"
37:    "interview-prep-evaluate"
```

Both deploy scripts on origin/main enumerate 35 functions including the two IPC entries.

---

## origin/main HEAD at Wave 1 closeout

```
$ git log origin/main --oneline -3
03811aa Merge pull request #435 from kapura3-star/preview
1121a0a Merge pull request #434 from kapura3-star/staging
c9ad608 Merge pull request #433 from kapura3-star/by/env-fixes
```

The local working branch at closeout is `staging` (ahead of origin/staging by 1 commit: `2a35534 fix(send-notification-email): switch to user CORS + JWT auth`). The by/env-fixes branch still exists locally and on origin but is no longer the integration target — origin/main is the canonical post-merge tip.

---

## Wave 2 readiness

All preconditions for Wave 2 (staging redeploy from main) are green:

- `git rev-parse origin/main` resolves cleanly
- Local checkout of origin/main exposes deploy-script with 35 functions including IPC pair
- Wave 0 evidence (JWTs, synthetic payload, URL bases) is captured
- No conflicts pending; no `behind N` on origin/main from any branch in scope

Wave 2 (28-02-PLAN.md) is unblocked.
