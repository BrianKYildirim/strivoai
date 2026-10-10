---
phase: 2
slug: repository-hygiene-state-reconciliation
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-13
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> This is a git-state + documentation phase (zero functional change). Validation is
> primarily **git-state assertions** plus a re-run of the Phase 1 regression baseline
> (`npm run verify:baseline`) to prove no behavior changed.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Git CLI assertions (read-only) + existing layered suite (vitest / deno / Playwright) via the Phase 1 `verify:baseline` wrapper |
| **Config file** | none new — uses existing `package.json` scripts + repo git state |
| **Quick run command** | per-task git assertions (e.g. `git ls-files dist-codex \| wc -l` → 0; `git status --porcelain supabase/.temp` → empty) |
| **Full suite command** | `npm run verify:baseline` (proves zero functional change vs `v4.0-baseline`) |
| **Estimated runtime** | git assertions ~seconds; `verify:baseline` per Phase 1 timings |

---

## Sampling Rate

- **After every task commit:** Run the task's git-state assertion(s) (read-only, instant).
- **After every plan wave:** Re-verify the wave's cumulative git-state assertions.
- **Before `/gsd:verify-work`:** `npm run verify:baseline` must be green (zero-functional-change proof; this phase changes no runtime code, so a regression here means an accidental functional change crept in).
- **Max feedback latency:** seconds for git assertions; `verify:baseline` once per wave / pre-verify.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01.T1 | 02-01 | 1 | REPO-01 | — | quick-task SHAs resolve; 18 dirs enumerated | git-assertion | `git cat-file -t 2ae4ba7`→commit; dir count→18 | ✅ existing | ⬜ pending |
| 02-01.T2 | 02-01 | 1 | REPO-01 | — | 12-missing flag reconciled; v4.0-baseline ancestor confirmed | git-assertion | `merge-base --is-ancestor fa4ccb6 staging`; STATE diff | ✅ existing | ⬜ pending |
| 02-02.T1 | 02-02 | 1 | REPO-05 | T-2-01 | no tracked secret/artifact (only *.example env) | git-assertion | secret-pattern grep→none; `ls-files .env`→2 examples | ✅ existing | ⬜ pending |
| 02-02.T2 | 02-02 | 1 | REPO-05 | T-2-01 | scan evidence recorded with named false positives | git-assertion | `test -f 02-SECRET-SCAN.md`; grep CLEAN/false positive | ✅ existing | ⬜ pending |
| 02-03.T1 | 02-03 | 2 | REPO-03/05 | T-2-01 | dist-codex/+supabase/.temp/ untracked+ignored, on disk | git-assertion | `ls-files dist-codex`→0; `check-ignore`→path; status clean | ✅ existing | ⬜ pending |
| 02-03.T2 | 02-03 | 2 | REPO-03/05 | T-2-01 | pricing.png gone; .planning/ intact+tracked | git-assertion | `ls-files pricing.png`→empty; `check-ignore .planning/STATE.md`→none | ✅ existing | ⬜ pending |
| 02-04.T1 | 02-04 | 2 | REPO-02 | — | main/preview FF to origin; by/env-fixes pruned (-d) | git-assertion | `rev-list --count main..origin/main`→0; branch list empty | ✅ existing | ⬜ pending |
| 02-04.T2 | 02-04 | 2 | REPO-02 | — | 6 worktrees+branches retired; disposition recorded first | git-assertion | `worktree list`→1; `branch --list worktree-agent-*`→empty | ✅ existing | ⬜ pending |
| 02-05.T1 | 02-05 | 3 | REPO-04 | — | CONTRIBUTING.md (5 sections) + CLAUDE.md pointer | git-assertion | `test -f CONTRIBUTING.md`; grep sections; CLAUDE.md ref | ✅ existing | ⬜ pending |
| 02-05.T2 | 02-05 | 3 | NFR-01 | T-2-01 | zero functional change across phase | full-suite | `diff --stat fa4ccb6..HEAD -- src supabase/functions`→empty; `verify:baseline` | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Planned independent verifications (from RESEARCH.md §Validation Architecture):**
- REPO-03/05 (D-01): `git ls-files dist-codex/ | wc -l` → `0`
- REPO-03 (D-02): `git ls-files supabase/.temp/ | wc -l` → `0` AND `git status --porcelain supabase/.temp` → empty; `git check-ignore supabase/.temp/project-ref` → matches
- REPO-03/05 (D-03): `git ls-files pricing.png` → empty
- REPO-02 (D-08): `git branch --list by/env-fixes` → empty after prune
- REPO-02 (D-09): `git worktree list` → only the primary worktree; `git branch --list 'worktree-agent-*'` → empty
- REPO-02 (D-06): local `main`/`preview` refs equal their `origin/*` tips (`git rev-parse main` == `git rev-parse origin/main`)
- REPO-04: `CONTRIBUTING.md` exists at repo root with commit-convention + branch-naming sections; `CLAUDE.md` references it
- REPO-01: STATE.md deferred-item "12 missing quick-task artifacts" flag resolved with per-item present/missing+SHA record; no `.planning/quick/` reconstruction
- REPO-05: re-run of the dependency-free secret/binary scan returns no findings (false positives `secrets.cjs` + `.planning/` scan-docs named/excluded)
- Cross-cutting (zero functional change): `npm run verify:baseline` green

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.* No new test framework or fixtures — validation reuses git CLI + the Phase 1 `verify:baseline` wrapper. (`v4.0-baseline` tag confirmed at `fa4ccb6`, ancestor of `staging` — apples-to-apples re-run.)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Surviving-branch purpose documentation reads accurately | REPO-02 | Prose accuracy is a human judgement, not a git assertion | Operator reads the documented branch model + `by/env-fixes` purpose note and confirms it matches intent |
| The 12-artifact reconciliation record is faithful | REPO-01 | Confirming "this quick task truly has no artifact" needs human cross-read of milestone history | Operator spot-checks 2–3 reconciled entries against `git log` + `.planning/milestones/` |

---

## Validation Sign-Off

- [ ] All tasks have a git-state `<automated>` assertion or are listed Manual-Only with rationale
- [ ] Sampling continuity: no 3 consecutive tasks without an automated git assertion
- [ ] Wave 0 covers all MISSING references (none — existing infra)
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s for git assertions
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved (planning — every task has a git-assertion <acceptance_criteria>; sampling continuity holds, no 3 consecutive tasks without an automated git assertion)
