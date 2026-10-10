---
slug: deploy-xdev-baseline-failures
status: resolved
trigger: "scripts/deploy.ps1 -Env production aborted in verify:baseline with 162 Playwright cross-device failures"
created: 2026-07-28T10:45:00Z
updated: 2026-07-28T21:20:38Z
---

# Debug Session: deploy-xdev-baseline-failures

## Symptoms

- expected: `.\scripts\deploy.ps1 -Env production` passes `verify:baseline` and reaches the explicit production deployment gate.
- actual: the baseline aborts after 18.5 minutes with 162 failed, 67 passed, and 14 skipped Playwright cross-device tests; no functions are linked or deployed.
- errors: Firefox, WebKit, and mobile-WebKit report missing Playwright browser executables. Chromium also reports genuine assertion failures and timeouts across capability-gate, leak-guard, network-conditions, responsive motion budgets, restricted storage, touch targets, and upload parity.
- timeline: observed 2026-07-28 immediately after the Phase 02 Resume 95-percent hotfix was locally verified; the `staging` branch concurrently advanced through Phase 03 commits.
- reproduction: run `.\scripts\deploy.ps1 -Env production` from `C:\Projects\strive-ai-hired`.

## Current Focus

- hypothesis: confirmed — the failed run combined missing Playwright engines with an intentionally red, incomplete Phase 03 gate and used a Supabase-functions deploy command for a frontend-only release.
- test: verified ancestry and release graph, installed browser revisions, bounded Chromium and non-Chromium lanes, Phase 03 ownership records, CI install contract, and Vercel deployment workflows.
- expecting: satisfied — bcffdad2 is preserved; infrastructure failures disappear once exact engines are installed; the remaining Chromium failure is the registered offline defect owned by unfinished Phase 03 work.
- next_action: release the frontend hotfix only from a detached worktree at bcffdad2, preview-first; do not use current staging/main or scripts/deploy.ps1, and require the explicit `apply production` signal before any production Vercel action.

## Evidence

- timestamp: 2026-07-28T21:15:00Z
  checked: current Git ancestry after the concurrent staging merge
  found: HEAD is merge commit b7d8e6a0 with parents bcffdad2 and 476824f5; `git merge-base --is-ancestor bcffdad2 HEAD` succeeds.
  implication: the Phase 02 refunded-run hotfix is preserved in current HEAD exactly as required.
- timestamp: 2026-07-28T21:16:00Z
  checked: Phase 03 execution state and the committed Playwright matrix contract
  found: HEAD contains Phase 03 summaries only through 03-12, while plans 03-13 through 03-20 remain without summaries. 03-12 records `npx playwright test --grep @xdev` as 197 passed, 4 failed, 30 skipped and explicitly assigns the four known offline failures to unfinished plans 03-13/03-14.
  implication: current staging is an in-progress phase snapshot whose blocking E2E gate was already known red before this deploy attempt.
- timestamp: 2026-07-28T21:17:00Z
  checked: browser installation contract in `playwright.config.ts` versus `.github/workflows/regression-gate.yml`
  found: the default Playwright config now launches Chromium, Firefox, WebKit, mobile WebKit, and mobile Chromium, but the blocking CI gate installs only Chromium with `npx playwright install --with-deps chromium`.
  implication: missing Firefox/WebKit executables are a deterministic gate-contract defect, not an application assertion failure; both local and CI baseline require the full configured engine set.
- timestamp: 2026-07-28T21:18:00Z
  checked: exact Playwright 1.61 browser installation and launchability
  found: `npx playwright install --list` reports Chromium 1228, Firefox 1532, and WebKit 2311 for this repository. A bounded Firefox/WebKit/mobile-WebKit matrix-smoke run passes 4/4.
  implication: the local browser prerequisite is fixed and directly launch-verified; the prior executable errors are not active application failures.
- timestamp: 2026-07-28T21:19:00Z
  checked: bounded current-HEAD Chromium `@xdev` lane
  found: 36 passed, 10 intentionally skipped, and 1 failed. The sole failure is `network-conditions.spec.ts` offline navigation emptying `#root`, whose assertion names plans 03-13/03-14 as owner.
  implication: the original 162-row report collapses to one known shared application defect after removing missing-engine fan-out; it is not 162 independent regressions.
- timestamp: 2026-07-28T21:20:00Z
  checked: exact frontend release graph and deployment surfaces
  found: bcffdad2 changes only six frontend/test files for the refunded-run recovery hotfix and is the first parent of the Phase 03 merge. It is already an ancestor of origin/main, but origin/main also contains merge b7d8e6a0 with incomplete Phase 03. `scripts/deploy.ps1` only links and deploys Supabase Edge Functions; frontend production uses Vercel.
  implication: neither current staging/main nor `scripts/deploy.ps1` is a safe frontend-only release source. The exact clean boundary is a detached worktree at bcffdad2, verified and previewed independently.
- timestamp: 2026-07-28T21:20:30Z
  checked: durable CI browser prerequisite
  found: `.github/workflows/regression-gate.yml` installed only Chromium although `playwright.config.ts` launches Firefox and WebKit; the workflow now installs `chromium firefox webkit`, and the exact command resolves all three Playwright 1.61 revisions in dry-run.
  implication: future CI runs will not reproduce the deterministic missing-executable fan-out once this narrow workflow change is carried forward.
- timestamp: 2026-07-28T21:27:00Z
  checked: full seven-layer `npm run verify:baseline` from detached worktree `C:\Projects\strive-ai-hired-hotfix-bcffdad2`, with test variables loaded process-only from the main workspace
  found: exit 0 after 353.6 seconds across lint, type-check, full Vitest, offline Deno, remote preview DB, the pre-Phase-03 Playwright gate, and production build.
  implication: commit bcffdad2 is a fully green and isolated release candidate for the Resume recovery hotfix; no `-SkipVerify` exception or incomplete Phase 03 code is needed.
- timestamp: 2026-07-28T21:38:00Z
  checked: authorized Vercel production release from the detached bcffdad2 worktree
  found: production-target deployment `dpl_5axd38jBPnEpx1d2x5NTT1Q8pDSK` was created without domain promotion, verified against production flags/ref and recovery chunks, then promoted without rebuilding. `www.strivoai.net` serves `index-DXmerinn.js`; apex redirects 308 to `www`.
  implication: the frontend hotfix shipped without bypassing the gate and without including unfinished Phase 03 code. R1 behavior verification, not deployment, is now the remaining gate.

## Eliminated

- hypothesis: the concurrent staging merge dropped commit bcffdad2
  evidence: bcffdad2 is HEAD's first parent and is confirmed reachable by `git merge-base --is-ancestor`.
  conclusion: eliminated

## Resolution

root_cause: The attempted release ran a five-project Playwright gate with missing Firefox/WebKit engines against an intentionally incomplete Phase 03 staging snapshot, while `scripts/deploy.ps1` is a Supabase-functions deploy path and cannot release the frontend-only bcffdad2 hotfix.
fix: Installed and launch-verified the exact Playwright 1.61 Firefox/WebKit engines; corrected the CI gate to install all configured engines; established bcffdad2 as the isolated frontend release boundary using a detached worktree and Vercel preview-first flow, with production still untouched pending explicit `apply production`.
verification: bcffdad2 remains in HEAD and origin/main ancestry; exact detached bcffdad2 seven-layer verify:baseline exits 0 in 353.6 seconds; Firefox/WebKit/mobile-WebKit smoke 4/4; Chromium @xdev 36 passed/10 skipped/1 known offline failure; CI install command dry-run resolves Chromium 1228, Firefox 1532, WebKit 2311; git diff --check clean.
files_changed: .github/workflows/regression-gate.yml; .planning/debug/deploy-xdev-baseline-failures.md
