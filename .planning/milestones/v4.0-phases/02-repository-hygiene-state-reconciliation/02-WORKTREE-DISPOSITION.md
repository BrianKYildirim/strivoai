# 02-04 Worktree Force-Delete Disposition (REPO-02 / D-09)

**Recorded:** 2026-06-13 — BEFORE any worktree removal or branch deletion (D-09 verify-then-remove; Pitfall 1 audit trail).
**Scope:** the 6 locked GSD agent worktrees under `.claude/worktrees/agent-*` (branches `worktree-agent-*`) from shipped phases 24 / 27 / 31 / 47.

## Why a force-delete (`-D`) is required and justified

These 6 `worktree-agent-*` branches are **unreachable from any ref** — not `main`, `origin/main`, `preview`, `origin/preview`, `staging`, nor `origin/staging`. Each carries 2–4 unique tip commits. The reason is **squash-merge**: each GSD agent did its work on a worktree branch, and that work landed on the integration line (and shipped to production on `origin/main`) under **new SHAs**. The original worktree commits therefore became unreachable even though their **content shipped**.

Consequence (research Pitfall 1, verified live this session):
- `git branch --merged main` does **NOT** list these branches (they have unique commits) — a reachability gate would falsely say "unmerged, do not delete."
- `git branch -d worktree-agent-<id>` **WILL refuse** ("not fully merged" / "used by worktree").
- `git branch -D worktree-agent-<id>` (force) is the correct, **justified** action — justified by the per-branch shipped-content disposition recorded below, **not** by a `--merged` rubber-stamp.

Verification that this is the squash-merge artifact (not lost work), confirmed on `origin/main` this session:
- `src/hooks/useFeatureCosts.ts` (24-04) — present on `origin/main`.
- `src/lib/merit-error-messages.ts` + `.test.ts` (31-01) — present on `origin/main`.
- `src/config/feature-flags` `isInterviewPrepEnabled()` (47-00) — present on `origin/main`, wired into `src/App.tsx` `/interview-prep` route.
- `src/components/ComingSoonBadge.tsx` + ComingSoon route fallback (47-01) — present on `origin/main`.
- 31-02 (staging-gated refundable-error fault injector) and 27-02 (Stripe-cutover runbook acks) — closed v3.0 phase artifacts; phases 27/31 shipped to production per STATE.md / their archived SUMMARYs (`.planning/milestones/v3.0-phases/`).

All four owning phases (24, 27, 31, 47) are v3.0 phases that shipped to production (archived under `.planning/milestones/v3.0-phases/`; `v4.0-baseline` @ `fa4ccb6` — the post-ship baseline — is an ancestor of `staging`). No branch tip shows surprising un-shipped product work; all unique commits are attributable to their closed phase.

## Per-branch unique-commit evidence

Each block lists the branch's unique tip commits relative to `origin/main origin/preview origin/staging` (`git log <b> --not origin/main origin/preview origin/staging --oneline`) and the tip's `--stat`. This is the disposition evidence recorded **before** `git branch -D`.

### worktree-agent-a0418fbf02382e929 — phase 47-01 (coming-soon-primitives)
- Worktree: `C:/Projects/strive-ai-hired/.claude/worktrees/agent-a0418fbf02382e929` (locked)
- Tip: `2b6805e docs(47-01): complete coming-soon-primitives plan` (2026-05-11)
- Unique commits (3):
  - `2b6805e` docs(47-01): complete coming-soon-primitives plan
  - `103c470` feat(47-01): add ComingSoon page route fallback
  - `e830c94` feat(47-01): add ComingSoonBadge inline tag primitive
- Tip touched: `47-01-SUMMARY.md` (+135). Feature content (`ComingSoonBadge.tsx`, ComingSoon route fallback) **shipped to `origin/main`**.
- Disposition: phase 47 shipped → **force-delete justified**.

### worktree-agent-a5e298e3 — phase 24-04 (feature-costs / ECON-02)
- Worktree: `C:/Projects/strive-ai-hired/.claude/worktrees/agent-a5e298e3` (locked)
- Tip: `085bf9a feat(24-04): add TS-module fallback to useFeatureCosts (D-03/ECON-02)` (2026-04-22)
- Unique commits (4):
  - `085bf9a` feat(24-04): add TS-module fallback to useFeatureCosts (D-03/ECON-02)
  - `4eeae07` refactor(24-04): replace LOW_BALANCE_THRESHOLD with D-08 20%-of-cap rule
  - `7bfbffe` test(24-04): add verifyCostMap integration test with synthesized DB snapshot
  - `a279862` test(24-04): add SC-7 three-boundary spend-ordering tests
- Tip touched: `src/hooks/useFeatureCosts.test.ts` (+122), `src/hooks/useFeatureCosts.ts` (+73). `useFeatureCosts.ts` **shipped to `origin/main`**.
- Disposition: phase 24 shipped → **force-delete justified**.

### worktree-agent-a6d7096e9e9e4f460 — phase 31-01 (merit error taxonomy)
- Worktree: `C:/Projects/strive-ai-hired/.claude/worktrees/agent-a6d7096e9e9e4f460` (locked)
- Tip: `0e25e2f test(31-01): add failing tests for getMeritErrorMessage taxonomy` (2026-05-19)
- Unique commits (2):
  - `0e25e2f` test(31-01): add failing tests for getMeritErrorMessage taxonomy
  - `f957579` feat(31-01): add optimisticDeduct to useMerits with closure-captured snapshot
- Tip touched: `src/lib/merit-error-messages.test.ts` (+97). `src/lib/merit-error-messages.ts` + `.test.ts` **shipped to `origin/main`**.
- Disposition: phase 31 shipped → **force-delete justified**.

### worktree-agent-abddefae9bfb315c8 — phase 47-00 (Interview Prep production-gate flag)
- Worktree: `C:/Projects/strive-ai-hired/.claude/worktrees/agent-abddefae9bfb315c8` (locked)
- Tip: `d29e3ce docs(47-00): complete Interview Prep production-gate feature-flag plan` (2026-05-11)
- Unique commits (3):
  - `d29e3ce` docs(47-00): complete Interview Prep production-gate feature-flag plan
  - `ab92177` test(47-00): lock fail-closed env-coercion semantics for isInterviewPrepEnabled
  - `a99e78f` feat(47-00): add isInterviewPrepEnabled() helper
- Tip touched: `47-00-SUMMARY.md` (+143). `isInterviewPrepEnabled()` helper (`src/config/feature-flags`) **shipped to `origin/main`** and wired into `src/App.tsx`.
- Disposition: phase 47 shipped → **force-delete justified**.

### worktree-agent-af019495180b9353e — phase 31-02 (refundable-error fault injector)
- Worktree: `C:/Projects/strive-ai-hired/.claude/worktrees/agent-af019495180b9353e` (locked)
- Tip: `41d7e7e docs(31-02): complete refundable-error fault injector plan` (2026-05-19)
- Unique commits (2):
  - `41d7e7e` docs(31-02): complete refundable-error fault injector plan
  - `9eb42c0` feat(31-02): add staging-gated refundable-error fault injector
- Tip touched: `31-02-SUMMARY.md` (+72). Staging-gated fault-injector work from closed phase 31.
- Disposition: phase 31 shipped → **force-delete justified**.

### worktree-agent-af9fb2676776f2f86 — phase 27-02 (Stripe cutover runbook)
- Worktree: `C:/Projects/strive-ai-hired/.claude/worktrees/agent-af9fb2676776f2f86` (locked)
- Tip: `e23bd42 docs(27-02): complete cutover runbook and notes plan` (2026-04-28)
- Unique commits (4):
  - `e23bd42` docs(27-02): complete cutover runbook and notes plan
  - `84df17e` feat(27-02): add D4 Phase 25 coordination ack on HOLD branch (SC-4)
  - `8f179e0` feat(27-02): add D2 rollback caveat ack before FLIP PROD banner (SC-3)
  - `0b20f38` feat(27-02): add D1 Stripe webhook URL pin ack (SC-2)
- Tip touched: `27-02-cutover-runbook-and-notes-SUMMARY.md` (+118). Cutover-runbook acknowledgement content from closed phase 27.
- Disposition: phase 27 shipped → **force-delete justified**.

## Retirement sequence applied (per branch)

Per research Pattern 4 (no shell cwd inside any `.claude/worktrees/agent-*`):
1. `git worktree unlock ".claude/worktrees/agent-<id>"`
2. `git worktree remove ".claude/worktrees/agent-<id>"` (`--force` only if a Windows file-lock or dirty state blocks AND the Step-A evidence confirms no wanted changes)
3. `git branch -D worktree-agent-<id>` (force — `-d` refuses per Pitfall 1; justified by the recorded shipped disposition above)
4. After all 6: `git worktree prune`

`.claude/worktrees/` is gitignored, so the worktree removals produce **no tracked-file changes**. This disposition file is the only committable artifact of Task 2.

## Post-retirement assertions (expected)

- `git worktree list` → 1 line (primary only)
- `git branch --list "worktree-agent-*"` → empty
- `git worktree prune --dry-run` → empty
- `git branch -vv` → only `main` / `preview` / `staging`
