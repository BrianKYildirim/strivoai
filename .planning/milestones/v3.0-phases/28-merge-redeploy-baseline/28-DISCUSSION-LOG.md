# Phase 28: Merge & Redeploy Baseline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-28
**Phase:** 28-merge-redeploy-baseline
**Areas discussed:** Merge strategy, Deploy sequencing, Legacy delete timing, 503 verification + rollback

---

## Gray area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Merge strategy | FF / merge commit / squash / rebase. 174 commits is a lot — squash collapses GSD per-phase commit history; merge-commit preserves history with one --no-ff cap; FF is cleanest if main hasn't diverged. | ✓ |
| Deploy sequencing | Staging-first with a soak/smoke gate before prod, or both environments together? deploy-staging.ps1 and deploy-production.ps1 already exist as separate scripts. | ✓ |
| Legacy delete timing | Order of `supabase functions delete interview-prep-coach` relative to redeploy — before / after smoke / concurrent. Affects whether there's a brief window with no IPC backend at all. | ✓ |
| 503 verification + rollback | How exactly we prove SC #3 (what repro defines a passing IPC 200 vs persistent 503) and what triggers revert vs hand-off to Phase 41 with new evidence. | ✓ |

**User's choice:** All four selected.

---

## Merge strategy

### How should `by/env-fixes` (174 commits) land on `main`?

| Option | Description | Selected |
|--------|-------------|----------|
| Fast-forward | If main has no commits beyond the by/env-fixes fork point, FF gives the cleanest history — every per-plan commit lands on main as-is. | ✓ |
| --no-ff merge commit | One merge commit caps the 174 — preserves all sub-commits, makes the v3.0 baseline a single revertable point. | |
| Squash merge | Collapses all 174 into one commit on main. Loses GSD per-plan granularity — violates the workflow's atomic-commit pattern. | |
| Rebase by/env-fixes onto main, then FF | Rewrites history if main has diverged. Linear history without a merge commit, but force-rewrites 174 commits. | |

**User's choice:** Fast-forward.

### Pre-merge dirty working tree handling

| Option | Description | Selected |
|--------|-------------|----------|
| Stash + restore after merge | git stash -u --keep-index, run FF, then pop. Keeps ephemeral changes out of the merge but preserves them locally. | ✓ |
| Reset/discard before merge | These files are .planning/ deletions and supabase/.temp/ artifacts. Discard cleanly. | |
| Commit to by/env-fixes first | BLOCKED: CLAUDE.md and memory rule explicitly forbid committing anything under .planning/. | |

**User's choice:** Stash + restore after merge.

### FF preflight gate

| Option | Description | Selected |
|--------|-------------|----------|
| Confirm `git log by/env-fixes..main` empty + dry-run merge | Verifies main hasn't diverged so FF is actually possible. Plus a `git merge --ff-only --no-commit` dry run we abort to confirm no conflicts. | ✓ |
| Just attempt FF and let git refuse | Lighter — if main has diverged, `git merge --ff-only` errors and we replan. | |
| Skip preflight — push directly | Faster but gives up the safety net. | |

**User's choice:** Confirm `git log by/env-fixes..main` empty + dry-run merge.

### Push policy

| Option | Description | Selected |
|--------|-------------|----------|
| Operator runs push manually | Phase 28 is explicitly operator-led per ROADMAP. Claude does NOT push without explicit per-step authorization. | ✓ |
| Claude runs push when plan reaches that step | Faster execution; requires per-phase pre-authorization. | |
| Open a PR instead of pushing direct | Slower; adds GitHub round-trip for an operator-led prerequisite gate. | |

**User's choice:** Operator runs push manually.

---

## Deploy sequencing

### Environment ordering

| Option | Description | Selected |
|--------|-------------|----------|
| Staging first → smoke gate → production | Run deploy-staging.ps1, smoke-test, only then run deploy-production.ps1. Catches regressions before they touch real users. | ✓ |
| Staging + prod in parallel | Faster but loses the gate. | |
| Production first, staging after | Inverts the safety guarantee. | |

**User's choice:** Staging first → smoke gate → production.

### Smoke-gate battery (multi-select)

| Option | Description | Selected |
|--------|-------------|----------|
| Interview Prep 503 repro returns 200 | Direct evidence for ROADMAP SC #3. | ✓ |
| Phase 25/26/27 surfaces observable | ROADMAP SC #4 evidence: MeritCostPreview, refundMeritsForJob already_refunded, 410-Gone shim. | ✓ |
| All 5 features run a one-shot smoke | Resume Analysis, LinkedIn Grader, Career Compass, Recruiting Lens, Interview Prep — one analyze call each. | ✓ |
| Edge function logs clean for 5 minutes | Watch Supabase function logs for new error spikes. | ✓ |

**User's choice:** All four.

### Deploy scope

| Option | Description | Selected |
|--------|-------------|----------|
| All edge functions from main | MERGE-02 reads literally: redeploys all edge functions. Removes deploy-drift across the whole surface. | ✓ |
| Only functions changed since last deploy | Faster but defeats the deploy-drift hypothesis. | |
| Only Interview Prep functions | Narrow; MERGE-02 is explicit about all functions. | |

**User's choice:** All edge functions from main.

### Soak window

| Option | Description | Selected |
|--------|-------------|----------|
| ~5 minutes after smoke passes | Long enough to surface error spikes; short enough to keep operator engaged. | ✓ |
| ~30 minutes | More confidence; longer babysit window. | |
| No fixed window — promote as soon as smokes pass | Fastest; loses the rolling-error-rate signal. | |

**User's choice:** ~5 minutes after smoke passes.

---

## Legacy delete timing

### Delete ordering vs redeploy

| Option | Description | Selected |
|--------|-------------|----------|
| After prod redeploy + smoke passes | Safest: legacy stays available until the new deploy is proven good in prod. | ✓ |
| Before any redeploy | Closes parallel-deploy risk earliest, but a MERGE-02 failure leaves a window with no IPC backend. | |
| Concurrent with redeploy | Faster but couples redeploy + delete failure modes. | |
| After staging smoke, before prod redeploy | Two delete calls instead of one batched step. | |

**User's choice:** After prod redeploy + smoke passes.

### Per-environment delete order

| Option | Description | Selected |
|--------|-------------|----------|
| Staging first, then production | Same staging-first principle as the redeploy. | ✓ |
| Both in one batched ceremony | Simpler, but staging never serves as a canary for the delete operation itself. | |
| Production first, staging after | Inverts the safety guarantee. | |

**User's choice:** Staging first, then production.

### Delete verification (SC #2)

| Option | Description | Selected |
|--------|-------------|----------|
| `supabase functions list` excludes interview-prep-coach in both envs | Direct read of SC #2; capture output as the verification artifact. | ✓ |
| Just the delete command's success exit code | Lighter — trust the delete CLI; less evidence. | |
| Hit the legacy URL and confirm 404 | Functional evidence but URL probing relies on guessing the deployed URL pattern. | |

**User's choice:** `supabase functions list` excludes interview-prep-coach in both envs.

### Delete preflight

| Option | Description | Selected |
|--------|-------------|----------|
| Verify zero refs as a delete preflight | Run `rg -n interview-prep-coach src/ supabase/` before delete; only .planning/ refs allowed. | ✓ |
| Skip — trust the codebase | Phase 23 already retired the function; not explicitly verified. | |

**User's choice:** Verify zero refs as a delete preflight.

---

## 503 verification + rollback

### Repro definition (SC #3)

| Option | Description | Selected |
|--------|-------------|----------|
| Replay the original failing payload | The exact payload that produced the original 503 (with sonnet-4 model name despite Haiku-only tier-config). 200 = drift confirmed; 503 = drift ruled out, hand off to Phase 41. | ✓ |
| Run a fresh standard IPC flow end-to-end | Exercises more code but doesn't directly hit the failing path. | |
| Both — replay original + fresh flow | Maximum signal; heavier operator burden. | |

**User's choice:** Replay the original failing payload.

### Repro tier coverage (multi-select)

| Option | Description | Selected |
|--------|-------------|----------|
| Tier(s) the original 503 was logged under | Match prod failure conditions exactly. Default to Pro/Elite if tier not captured. | ✓ |
| Free tier | Confirms the cheapest path works. | |
| Pro tier | Most-used paid tier; richest IPC features. | ✓ |
| Elite tier | Largest token budget; most likely to expose model-routing bugs. | ✓ |

**User's choice:** Tier(s) the original 503 was logged under + Pro tier + Elite tier.

### Persistent-503 response

| Option | Description | Selected |
|--------|-------------|----------|
| Hand off to Phase 41 with new evidence | ROADMAP SC #3 explicitly allows this branch. Capture post-redeploy evidence; Phase 28 SC #3 satisfied via alternate branch. | ✓ |
| Revert the merge + redeploy | Aggressive — throws out 174 commits because of one suspected feature bug. | |
| Investigate inline, block phase completion | Conflicts with the "prerequisite gate" framing. | |

**User's choice:** Hand off to Phase 41 with new evidence.

### Revert triggers (multi-select; clarification round resolved IPC-only ambiguity)

| Option | Description | Selected |
|--------|-------------|----------|
| Regression in any of the 5 features beyond IPC | Resume Analysis, LinkedIn Grader, Career Compass, Recruiting Lens broken on staging or prod. | ✓ |
| Phase 25/26/27 surfaces missing post-deploy | SC #4 fails. | ✓ |
| Merit balance / Stripe webhook regression | Stripe Live points only at /stripe-webhook-handler; if shop purchases stop crediting, immediate revert. | ✓ |
| IPC alone still 503ing | NOT a revert trigger per ROADMAP — hands off to Phase 41 instead. | (clarified — see below) |

**User's choice:** First three confirmed. The IPC-only option was initially also checked; clarification round confirmed the user's actual intent matches ROADMAP: **IPC alone still 503ing → hand off to Phase 41, do not revert.**

### Post-prod verification battery

| Option | Description | Selected |
|--------|-------------|----------|
| Same battery as staging gate | Re-run the same 4-item smoke against production for direct SC #1–4 prod evidence. | ✓ |
| Lighter — just IPC + Phase 25/26/27 | Trusts that 5-feature smoke from staging carries to prod. | |
| Heavier — add manual user-flow walkthrough | Highest confidence; likely overkill for a prerequisite gate. | |

**User's choice:** Same battery as staging gate.

### Closing artifact for VERIFICATION

| Option | Description | Selected |
|--------|-------------|----------|
| SC checklist with command outputs inline | VERIFICATION.md lists SC #1–4 with the exact command run + captured output below each. Machine-extractable for downstream audit/intel. | ✓ |
| Operator-narrated runbook recap | Free-form retrospective; less verifiable. | |
| Git tag + deploy log links only | Compact; IPC repro evidence lives elsewhere. | |

**User's choice:** SC checklist with command outputs inline.

---

## Claude's Discretion

- Exact PowerShell incantation / parameter set for `deploy-staging.ps1` / `deploy-production.ps1` invocation.
- Specific log query strings used during the 5-minute log soak.
- Format of the captured `supabase functions list` output (raw paste vs. table reformat).

## Deferred Ideas

- Persistent IPC 503 investigation → Phase 41.
- VERIFICATION backfill for v2.0 phases 10, 19, 22, 24, 27 → standalone tech-debt phase or `/gsd-validate-phase` runs.
- Live tier-output validation harness, Docker pgTAP for Phase 11, perf p99 live-run → operator-deferred ops, not Phase 28 scope.
