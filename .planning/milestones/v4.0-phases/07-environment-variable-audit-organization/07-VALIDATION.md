---
phase: 7
slug: environment-variable-audit-organization
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-20
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> **Phase nature:** docs + audit with a near-empty code diff (ENV-02 code diff = zero; an ENV-05 guard is the only *possible* edge change, and the research finds none currently needed). Validation is therefore mostly **artifact checks** (re-runnable `rg`, secret-grep guard, `git check-ignore`, `git diff`) plus **baseline preservation**, not behavior tests.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x (frontend) + deno test (edge) + Playwright (E2E) — the existing `verify:baseline` stack; NO new framework |
| **Config file** | `package.json` scripts (`verify:baseline` = `test && test:edge && test:e2e`) |
| **Quick run command** | `rg` artifact checks (see Per-Task map) — sub-second |
| **Full suite command** | `npm run verify:baseline` |
| **Estimated runtime** | artifact checks ~seconds; `verify:baseline` ~several min |

---

## Sampling Rate

- **After every task commit:** Run the task's artifact check (`rg` / `git check-ignore` / secret-grep guard) — see Per-Task map.
- **After every plan wave:** Run `npm run verify:baseline` (must stay green: vitest **457**, deno **699/0/11**, Playwright **4 pass + 1 skip + 1 documented env-red**).
- **Before `/gsd:verify-work`:** Full `verify:baseline` green AND `git diff v4.0-baseline..HEAD -- src supabase/functions` empty (unless a single smoked ENV-05 guard was added).
- **Max feedback latency:** artifact checks < 5s; full suite a few minutes.

---

## Per-Task Verification Map

> Task IDs are filled by the planner. Rows below are the per-requirement validation contract the planner maps tasks onto.

| Req | Validation method | Pass criterion | Test Type | Automated Command | Automated | Status |
|-----|-------------------|----------------|-----------|-------------------|-----------|--------|
| ENV-02 | Re-run edge enumeration → matches documented set minus `OLLAMA_*`; confirm no dead read in code | enumeration parity; zero dead reads | artifact | `rg -o "Deno\.env\.get\(['\"]([A-Z_0-9]+)['\"]" -r '$1' supabase/functions --no-filename \| sort -u` (→ 52) | YES | ⬜ pending |
| ENV-03 | Secret-grep guard over `.env.example` + `.env.test.local.example` + `docs/ENVIRONMENT.md` = ZERO; `git check-ignore -v` proves templates trackable; `git status` shows them staged | zero secret matches; both templates tracked | artifact | corrected secret-grep (drop `-E`) + `git check-ignore -v .env.example .env.test.local.example` | YES | ⬜ pending |
| ENV-04 | Operator runs the 4 listing commands (names only); reconciliation matrix built; findings classified; operator fix list produced | matrix complete across 4 surfaces; anomalies classified | manual | operator: `supabase secrets list` ×2 + `gh secret list` + `vercel env ls` | NO (operator checkpoint, `autonomous:false`) | ⬜ pending |
| ENV-05 | Coverage matrix confirms each of the 6 critical secrets fails closed (file:line); IF a guard is added, deploy-smoke on staging (env-deferred if test project paused) | all 6 documented fail-closed; any added guard smoked-or-deferred | matrix + (cond.) behavior | source-read matrix; `verify:baseline` if any code touched | PARTIAL | ⬜ pending |
| NFR-03 | `rg "config.toml.*swap"` README → 0; `rg "RAPIDAPI_KEY"` README/CLAUDE/AGENTS → 0 (or footnoted); merge-marker `rg "^>{7}"` README/CLAUDE → 0; pointers to `docs/ENVIRONMENT.md` present | each stale spot fixed | artifact | re-runnable `rg` checks | YES | ⬜ pending |
| Governing (zero-functional-change) | `git diff v4.0-baseline..HEAD -- src supabase/functions` EMPTY (unless one smoked ENV-05 guard); `verify:baseline` green | empty source diff OR single smoked guard; baseline green | artifact + suite | `git diff` + `npm run verify:baseline` | YES | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure (`verify:baseline` + `rg`/git) covers all phase requirements. No new test framework, no test stubs needed — this phase produces docs + templates + an audit, validated by artifact checks and baseline preservation.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cross-surface secret-NAME reconciliation | ENV-04 | Edge-function secrets live in the Supabase secrets store + GitHub Actions + Vercel — none readable by the agent (prod is read-only via MCP; secrets store not MCP-reachable) | Operator runs `supabase secrets list --project-ref zjpjapgraoxdukdvpjes` (prod) + `supabase secrets list --project-ref cimjltzovkahkqecpwgi` (preview/test) + `gh secret list` + `vercel env ls`, pastes NAMES (no values); agent reconciles the matrix + emits the fix list |
| ENV-02 live-store un-set list | ENV-02 | We never write prod secrets; un-setting `OLLAMA_*`/orphans is operator-confirmed | Operator applies (or declines) the names-only un-set list against the live stores on their schedule |
| ENV-05 guard deploy-smoke (only if a guard is added) | ENV-05 | Offline `--no-check` can't prove an edge change safe; the test/preview project is currently PAUSED (DI-06-*) | If a guard is added, smoke on staging when the test project is restored; otherwise defer via a RESIDUAL-REGISTER entry (Phase-6 realtime-smoke precedent) |

---

## Validation Sign-Off

- [ ] All tasks have an `<automated>` artifact check OR an explicit operator-checkpoint (ENV-04) / Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without an automated check
- [ ] Wave 0 covers all MISSING references (none — existing infra suffices)
- [ ] No watch-mode flags
- [ ] Feedback latency < a few minutes (full suite)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** ready (per-requirement validation maps onto plans 07-01..07-04; existing verify:baseline + rg/git artifact checks cover all reqs; no new framework)
