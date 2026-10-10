---
phase: 09-final-verification-milestone-report
plan: 09
subsystem: testing / the blocking deploy gate
tags: [VER-01, D-05, D-06, D-07, D9-03, D9-04, gate-composition, fail-loud, mutation-proof, ci-parity]

# Dependency graph
requires:
  - phase: 09-final-verification-milestone-report
    plan: 07
    provides: the fail-loud remote DB lane (preflight + fixture bootstrap) this plan folds into the gate
  - phase: 09-final-verification-milestone-report
    plan: 08
    provides: deno.json test:remote task + the VER-02 registry that assertion-5-guards lane registration
  - phase: 09-final-verification-milestone-report
    plan: 06
    provides: e2e/fixtures/make-unique-resume.ts (built and proven there; wired into the gate here)
provides:
  - "package.json verify:baseline = the SEVEN-layer chain (lint, type-check, vitest, offline-deno, remote-DB, Playwright, build)"
  - "package.json test:edge:remote - the DATABASE lane on the gate (D-06)"
  - "scripts/with-preview-env.mjs - loads .env.test.local for the Deno child so the gate is PASSABLE locally"
  - "scripts/deploy.ps1 -SkipRemoteDbLane - a second, narrower, loud, default-OFF escape hatch"
  - ".github/workflows/regression-gate.yml - CI runs `npm run verify:baseline` ITSELF (true parity)"
  - "e2e/helpers/test-user.ts - one definition of the Node-side admin/seed helpers"
  - "TESTING-STRATEGY.md - the seven-layer contract, the MEASURED cost, the DB-lane contract"
affects: [09-10, 09-11, 09-12, every future deploy, every future PR]

tech-stack:
  added: []
  patterns:
    - "A gate lane must be MUTATION-PROVEN able to fail. Observing green proves nothing - six checks in this phase reported success while proving nothing."
    - "Anti-vacuity assertion: a test that asserts only on rendered output cannot distinguish 'I ran the flow' from 'I was shown a stored result'. Assert a durable DB delta scoped to THIS run's input."
    - "Escape-hatch granularity: a gate whose only escape hatch is 'skip everything' gets used that way. -SkipRemoteDbLane exists so an unreachable preview does not force -SkipVerify."
    - "CI must INVOKE the gate command, not re-implement it. A re-implemented CI gate silently drifts weaker than the deploy gate it mirrors."

key-files:
  created:
    - scripts/with-preview-env.mjs
    - e2e/helpers/test-user.ts
  modified:
    - package.json
    - scripts/deploy.ps1
    - .github/workflows/regression-gate.yml
    - TESTING-STRATEGY.md
    - supabase/functions/_shared/__tests__/history-persistence-remote.ts
    - e2e/resume-analysis.spec.ts
    - e2e/two-tab-concurrency.spec.ts
    - e2e/global-setup.ts

key-decisions:
  - "EXTENDED verify:baseline in place rather than adding a parallel verify:full - deploy.ps1 knows only the one command, so a parallel script would have left the real deploy gate at its old strength (the exact failure VER-01 exists to prevent)."
  - "The remote DB lane needs NO new GitHub secret. staging == test == preview is ONE project, so the SUPABASE_TEST_* secrets (present since 2026-06-10) already point at exactly the project the lane requires. This DISSOLVED the plan's blocking user_setup gate."
  - "Fixed the vacuous resume E2E (D9-03) rather than shipping a gate that contains a test proving nothing - a gate containing a vacuous test is not a gate."
  - "Re-scoped the two-tab financial invariant from a user-wide debit COUNT to 'no idempotency_key may carry more than one debit' - parallel-safe and strictly sharper."
  - "Did NOT re-date the Phase-01 Stripe quarantine row's missing expiry - flagged it instead. Setting an expiry for another phase's acceptance is that owner's call."

# Metrics
duration: ~3h
tasks: 3
files: 9
completed: 2026-07-12
---

# Phase 09 Plan 09: VER-01 — The Gate Extension Summary

`verify:baseline` now covers VER-01's full list — lint, type-check, unit/integration, Edge Function, **database**, browser E2E, security, and the production build — and **every lane in it was proven able to FAIL by mutation**, including the one that had been passing vacuously for a month while sitting in the blocking gate.

## The gate, before and after

| | Before | After |
|---|---|---|
| `verify:baseline` | `test && test:edge && test:e2e` (3 layers) | `lint && type-check && test && test:edge && **test:edge:remote** && test:e2e && build` (**7 layers**) |
| Database tests on the gate | none | **8 passed, 0 failed, 0 ignored** against the real preview project |
| CI | *re-implemented* the gate as hand-listed steps | **invokes `npm run verify:baseline` itself** |
| Escape hatches | `-SkipVerify` (all-or-nothing) | `-SkipVerify` + `-SkipRemoteDbLane` (narrow, loud, default-OFF) |
| Measured cost | never measured | **393.6 s (6 m 33 s)**, exit 0 |

Full green chain: lint 0 errors / 159 warnings · type-check clean · vitest **614** (96 files) · deno offline **1262** · deno remote/DB **8, 0 ignored** · Playwright **7** (2 quarantined-skip) · build ok.

## Every new lane is mutation-proven RED

The discipline this phase demanded. A lane that cannot go red is not a gate.

| Lane | Mutation | Result |
|---|---|---|
| `lint` | insert a `debugger` statement | **exit 1** (warnings alone do **not** block — 159 exist and it still exits 0) |
| `type-check` | assign `string` to `number` | **exit 2** (TS2322) |
| `build` | unresolvable import in `src/main.tsx` | **exit 1** |
| `test:edge:remote` | point at the **prod** ref | **exit 1** — "REMOTE LANE POINTED AT PRODUCTION" |
| `test:edge:remote` | placeholder URL / unknown project ref / missing service-role key | **exit 1** (each) |
| `test:e2e` | restore the static resume fixture (the pre-09-09 behaviour) | **exit 1** — and *only* the new DB-delta assertion fires |
| `deploy.ps1 -SkipRemoteDbLane` | plant a type error, then deploy | **exit 1** at the type-check lane, **0** occurrences of `supabase link` |

Working tree clean after every mutation.

## Three defects found and fixed (none were in the plan)

### 1. The gate could not have passed on any operator's machine (Rule 3 — blocking)

The remote lane reads `SUPABASE_URL_STAGING` / `SUPABASE_SERVICE_ROLE_KEY_STAGING`. Those names exist in **`.env.test.local.example` and nowhere else**: not in the real `.env.test.local`, not in the machine env, and **not in the GitHub Actions secret set** (`gh secret list` shows only the `SUPABASE_TEST_*` / `STRIPE_TEST_*` / `E2E_TEST_PASSWORD` names, unchanged since 2026-06-10). 09-07/09-08 had run the lane green by hand-exporting them in a shell.

Folding it into the blocking gate as written would have made **every `deploy.ps1` run abort and every PR go red** — and an always-red gate is a *bypassed* gate: operators reach for `-SkipVerify` and the entire chain stops meaning anything. Fixed at source:

- **Name-resolution fallback** (`history-persistence-remote.ts`): `SUPABASE_URL_STAGING` → `STAGING_SUPABASE_URL` → `SUPABASE_TEST_URL` (same chain for the key), mirroring `requireAnonKey()`'s existing pattern. **staging == test == preview is ONE project** (`cimjltzovkahkqecpwgi`), so these are aliases, not different environments. This is a NAME fallback, **never a validation relaxation** — whichever alias supplies the value still runs the full gauntlet (non-empty · not the placeholder · **not production** · positively the preview ref).
- **`scripts/with-preview-env.mjs`**: loads `.env.test.local` for the Deno child. (`deno --env-file` is unusable: it hard-fails with **exit 9** when the file is absent — precisely the CI case.) Existing env always wins, a missing file is not an error, no value is ever printed, and the child's exit code is propagated so the shim cannot fake green.

**This dissolved the plan's blocking `user_setup` gate.** No new GitHub secret is required: CI's existing `SUPABASE_TEST_*` secrets already point at the exact project the lane needs. The workflow still *prefers* dedicated `*_STAGING` secrets via `${{ secrets.X || secrets.Y }}`, so nothing changes here if they are ever added.

### 2. `e2e/resume-analysis.spec.ts` passed vacuously — in the blocking gate (D9-03)

Upload de-duplicates on `file_hash`. The seeded E2E user analyzed the static committed fixture on **2026-06-11**, so every run since short-circuited to that stored analysis: ~3.2 s (a real AI_TEST_MODE analysis is ~10–19 s), **zero** new rows, every assertion satisfied by a month-old report.

Fixed structurally: submit a **per-run unique** synthetic PDF (dedup path unreachable by construction) **and** assert a **durable DB delta** — exactly one completed analysis *for the document this run submitted*. Pixel assertions cannot tell "I ran an analysis" from "I was shown a stored one"; the delta assertion can.

**Proof it is no longer vacuous:** restoring the static fixture leaves **every pixel assertion green** and fails **only** the new delta assertion. That is exactly the vacuity, now caught.

### 3. Two shared-user races the D9-03 fix exposed (Rule 1)

The moment a *second* spec drove a real analysis for the same seeded user in a parallel Playwright worker, two latent defects surfaced. Both fixed at source, not by serializing the suite:

- **Row count.** Both specs counted the user's *global* `resumes` rows, so each saw the other's analysis and its "exactly one" invariant read **2**. Re-scoped to the run's unique `file_name` — strictly stronger ("exactly one analysis of the document I submitted").
- **The financial invariant rested on a false claim.** The two-tab spec asserted a user-wide debit delta `<= 1`, justified in-source by *"when the merit system is dormant no debit rows are written at all"*. **That is false on the TEST project** — a free-tier resume analysis really writes a `-3` `feature-deduct` row (verified directly against the ledger). It only ever looked green because one spec was charging. Re-scoped to where the invariant actually lives: **no `idempotency_key` may carry more than one debit** (the key is derived from input identity, so a cross-tab re-fire of the *same* submit reuses it). Immune to any number of parallel specs; fails on a genuine double-charge and nothing else. A **non-vacuity guard** was added alongside it (the ledger must have charged *something* in the window) — both proven RED.

**D9-04 closed** as a prerequisite: the Merit reseed + `analyze-resume` rate-limit reset are hoisted into `e2e/global-setup.ts`, so **every** merit-spending spec starts from a known balance. A real analysis spends 3 of the user's 10 lifetime Merits and 1 of 5 hourly analyses; both are resource-exhaustion time-bombs once the E2E lane gates every deploy.

## D-07 re-verified (not merely left standing)

Mandatory, because this plan **edited** `verify:baseline` — an invariant asserted against a value that has since changed is not an invariant.

```
gate values referencing promptfoo/adversarial: 0
verify:baseline = npm run lint && npm run type-check && npm run test && npm run test:edge
                  && npm run test:edge:remote && npm run test:e2e && npm run build
adversarial scripts still present (off-gate): 6
```

All eight gate script values are clean; the six `test:adversarial:*` scripts remain present and **off** the gate; the only hit in `regression-gate.yml` is a prose comment stating they are deliberately off it. `git diff tsconfig*.json eslint.config.js` is **EMPTY** — no strictness was reduced to green the gate, and no new dependency was added.

## deploy.ps1

- **`-SkipRemoteDbLane`** (new): default OFF, loud `Write-Warning` banner, EMERGENCY-ONLY in the header. It exists because a gate whose sole escape hatch is "skip everything" gets used that way. It still aborts before `supabase link` on any red lane (proven).
- **The stale `PINNED COMPOSITION (WR-01)` comment** asserted `verify:baseline` MUST remain the **three**-layer chain. That was wrong as of this phase. Rewritten to pin all **seven** layers by name, with the instruction to update it in the same commit as any future chain change. A stale pin comment inside the deploy gate is precisely the drift this phase exists to eliminate.
- **Neither escape hatch is reachable through the shims** (`deploy-staging.ps1` / `deploy-production.ps1` accept only `-Functions`), so a shim deploy is **always fully gated**. Documented rather than changed.
- **PURE ASCII verified:** 0 bytes > 0x7F, 0 `\xe2` lead bytes, no BOM; parses under real Windows PowerShell with **0 errors** (the Phase-05-07 "missing terminator" regression guard).

## Deviations from Plan

1. **[Rule 3 — blocking] The remote lane's env wiring** (defect 1 above). The plan assumed `test:edge:remote` would simply work; it could not have, on any machine. Fixed at source. Changed one file the plan did not list (`history-persistence-remote.ts`) and added one script.
2. **[Rule 1 — bug] Fixed D9-03 + D9-04 and the two races they exposed** (defects 2–3). The plan did not schedule this, but the orchestrator directed it and it is load-bearing: folding a vacuous test into a strengthened gate would have been theatre.
3. **The blocking `user_setup` gate is dissolved, not satisfied.** The plan required the operator to add `SUPABASE_URL_STAGING` + `SUPABASE_SERVICE_ROLE_KEY_STAGING` before merging the workflow change. Because staging/test/preview are one project, the existing secrets suffice and the workflow falls back to them. Safety remains **structural**: `requireRemoteConfig()` rejects the production ref outright, so a mis-set secret fails the lane loudly rather than writing test rows to production.
4. **Quarantine register.** The plan expected it empty-or-one-row; it holds **two** genuine rows. The Phase-01 Stripe row carries **no expiry**, violating the register's own mandatory-expiry rule. Flagged in-doc rather than silently re-dated — setting an expiry for another phase's acceptance is that owner's call.

## Deferred / still open

- **D9-05** (32 Deno test files in no lane) — unchanged, out of scope, still routed to report item 14. The durable fix remains inverting `deno.json` from an allowlist into a directory walk with an explicit exclusion list ("opt out loudly" instead of "opt in or die quietly").
- **D9-02** (Recruiting Lens legacy post-save `MeritRefundable`) — unchanged; still owed **before** D-02 flips RCL on production.
- The two-tab merit assertion's note: if the merit ledger is ever activated *in the E2E environment*, the quarantined recovery half must be un-skipped (D-01/D-02).

## Operator items (surfaced, not assumed)

Both are approvals, not actions — no work is blocked on them, and nothing was auto-approved:

1. **Accept the gate's wall-clock.** `Measure-Command { npm run verify:baseline }` → **393.6 s (6:33)**, exit 0 (a second run: 431 s). Budget **~6.5–7.5 min** on every deploy and every PR. Recommendation: **accept**. It is under the plan's ~10-minute concern threshold, deploys are infrequent and operator-gated, and the sanctioned response to a slow gate is deploy latency — never dropping a lane.
2. **GitHub secrets: no action required.** `SUPABASE_URL_STAGING` / `SUPABASE_SERVICE_ROLE_KEY_STAGING` do **not** exist, and the gate no longer needs them. Optionally add them later for explicitness; the workflow already prefers them if present. **Preview is confirmed UNPAUSED** — proven empirically, not asserted: the remote lane ran 8/8 against `cimjltzovkahkqecpwgi` repeatedly during this plan.

## Task Commits

| Task | Commit | Description |
|---|---|---|
| pre-1 | `3efc2ff1` | Make the remote DB lane runnable outside a hand-exported shell |
| pre-1 | `356d03a1` | Kill the vacuous resume E2E + the shared-user races it exposed (D9-03, D9-04) |
| 1 | `4cdd91af` | Extend `verify:baseline` to the seven-layer chain (D-05, D-06) |
| 2 | `00787e6a` | `deploy.ps1 -SkipRemoteDbLane` + CI runs the identical gate |
| 3 | `c0deae8b` | TESTING-STRATEGY: seven-layer gate, measured cost, DB-lane contract |

## Verification

- [x] `npm run verify:baseline` → **exit 0**, all seven lanes visibly executing
- [x] `Measure-Command` → **393.6 s**, recorded in `TESTING-STRATEGY.md` (a real number, not an estimate)
- [x] Every newly gated lane **mutation-proven able to FAIL** (7 mutations, all reverted, tree clean)
- [x] `scripts/deploy.ps1` **pure ASCII** (0 bytes > 0x7F, no BOM) and parses under Windows PowerShell with 0 errors
- [x] `-SkipRemoteDbLane` still aborts **before** `supabase link` on a red lane
- [x] D-07 re-verified: **0** gate references to promptfoo/`test:adversarial`; 6 adversarial scripts still present and off-gate
- [x] No `tsconfig`/`eslint` strictness reduced (`git diff` EMPTY); no new npm dependency
- [x] No secret VALUE in any file, log, or commit; CI uses `${{ secrets.* }}` references only

## Self-Check: PASSED

All created/modified files exist on disk; all five commits (`3efc2ff1`, `356d03a1`, `4cdd91af`, `00787e6a`, `c0deae8b`) are present in `git log`.
