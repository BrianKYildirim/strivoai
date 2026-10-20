---
phase: 9
slug: final-verification-milestone-report
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-10
updated: 2026-07-11
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Populated by the planner from `09-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x (frontend + static guards) + `deno test` (edge functions, offline AND remote lanes) + Playwright 1.x (browser) + promptfoo 0.120.13 (off-gate, evidence-only) |
| **Config file** | `vitest.config.ts`, `supabase/functions/deno.json`, `playwright.config.ts` |
| **Quick run command** | `npm run test` (vitest — auto-discovers `src/**/*.test.ts`, incl. the D-12 registry and the PII guard, with NO registration step) |
| **Full suite command (current)** | `npm run verify:baseline` = `test && test:edge && test:e2e` |
| **Full suite command (post-09-09)** | `npm run verify:baseline` = `lint && type-check && test && test:edge && test:edge:remote && test:e2e && build` |
| **Estimated runtime** | Current baseline: vitest (~498 tests) + offline-deno (~1121 tests) + Playwright (5+1skip). Post-09-09 adds lint + type-check + a preview network round-trip + `vite build`. **09-09 Task 3 MUST record the measured wall-clock via `Measure-Command`.** If it exceeds ~10 min, the sanctioned mitigation is to accept the deploy latency, NOT to drop a lane. |
| **Deno registration** | `supabase/functions/deno.json` is an EXPLICIT allowlist. A Deno test not listed in `test:ci` (or the new `test:remote`) runs in NO lane. This is how the five `history-persistence.test.ts` files became dead code. Plan **09-08 is the single owner** of this file. |

---

## Sampling Rate

- **After every task commit:** run the task's `<verify>` command (each task has one).
- **After every plan wave:** run `npm run verify:baseline`.
- **Known intentional RED window:** the vitest lane goes RED at the end of **09-01** (the D-12 registry's gap assertion — that RED output IS the authoritative gap list) and returns GREEN at **09-08**. This is by design. **Do not weaken the gap assertion to green the gate mid-phase.**
- **Before `/gsd:verify-work`:** the full extended suite must be green.
- **Max feedback latency:** one task. No task in this phase lacks an automated verify except the four operator checkpoints, each of which is explicitly enumerated under Manual-Only below.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 09-01-T1 | 09-01 | 1 | VER-02 | T-09-01-C | No PII/secrets in the audit artifact | doc/static | `cat 09-COVERAGE-AUDIT.md` (5 decisions present) | ❌ new | ⬜ pending |
| 09-01-T2 | 09-01 | 1 | VER-02 | T-09-01-A, T-09-01-B | Registry cannot silently un-cover a cell; renames go RED | vitest static guard | `npx vitest run src/test/coverage/ver02-matrix.test.ts` (expect RED on gap assertion only) | ❌ new | ⬜ pending |
| 09-02-T1 | 09-02 | 1 | VER-04 | T-09-02-A, T-09-02-C, T-09-02-D | PII/secrets in Phase 9 evidence turn the gate RED | vitest security guard | `npx vitest run src/test/security/phase9-pii-guard.test.ts` | ❌ new | ⬜ pending |
| 09-02-T2 | 09-02 | 1 | VER-04 | T-09-02-B | Fixtures proven synthetic (incl. the binary Profile.pdf) | doc + guard assertion | `npx vitest run src/test/security/phase9-pii-guard.test.ts` (fixture-enrollment assertion) | ❌ new | ⬜ pending |
| 09-03-T1 | 09-03 | 1 | VER-04 | T-09-03-A, T-09-03-B, T-09-03-D | Prod reaper targets prod + succeeds; no secret printed | **MANUAL** (operator applies cron.alter_job) | read-only `select * from cron.job` (Claude) | ❌ new | ⬜ pending |
| 09-03-T2 | 09-03 | 1 | VER-01 | T-09-03-A | Names-not-values; no secret in docs | doc/static | `grep -c "ANALYSIS_LIFECYCLE" docs/ENVIRONMENT.md` >= 6; `npx vitest run src/test/security/security-audit-docs.test.ts` | ✅ exists | ⬜ pending |
| 09-03-T3 | 09-03 | 1 | VER-04 | T-09-03-C | Aggregates only; no raw log lines / user ids | **MANUAL** (operator runs prod log queries) | `npx vitest run src/test/security/phase9-pii-guard.test.ts` (post-capture) | ❌ new | ⬜ pending |
| 09-04-T1 | 09-04 | 1 | VER-05 | T-09-04-B | Backfill is evidence-cited + self-limiting | deno | `cd supabase/functions && deno test --allow-all --no-check _shared/career-shape.test.ts` | ❌ new | ⬜ pending |
| 09-04-T2 | 09-04 | 1 | VER-05 | T-09-04-A | Every checkbox flip cites an artifact on disk | doc/static | `git diff .planning/ROADMAP.md .planning/REQUIREMENTS.md`; `grep -n "PADL-0\|VER-0" .planning/REQUIREMENTS.md` | ✅ exists | ⬜ pending |
| 09-05-T1 | 09-05 | 2 | VER-02 | T-09-05-B | No refund after durable save | deno | `deno test --allow-all --no-check recruiting-lens/__tests__/idempotency-repeated-run.test.ts recruiting-lens/__tests__/refund-after-save.test.ts` | ❌ new | ⬜ pending |
| 09-05-T2 | 09-05 | 2 | VER-02 | T-09-05-A, T-09-05-C | Malformed model output -> typed error, never a fabricated result; NO change to anthropic.ts | deno | `deno test --allow-all --no-check recruiting-lens/__tests__/runtime-validation-convergence.test.ts`; `git diff --stat supabase/functions/_shared/anthropic.ts` EMPTY | ❌ new | ⬜ pending |
| 09-05-T3 | 09-05 | 2 | VER-02 | T-09-05-D | CORS present even on a thrown 401; unapproved origin fails closed | deno | `deno test --allow-all --no-check grade-linkedin/__tests__/cors-matrix.test.ts` | ❌ new | ⬜ pending |
| 09-06-T1 | 09-06 | 2 | VER-02 | — | Each feature proven WIRED to the recovery substrate | vitest | `npx vitest run src/pages/__tests__/{Upload,Onboarding,LinkedInGrader,RecruitingLens}.recovery.test.tsx` | ❌ new | ⬜ pending |
| 09-06-T2 | 09-06 | 2 | VER-02 | T-09-06-B, T-09-06-C | 5 consecutive runs -> 5 distinct keys -> 5 debits; replacement upload re-keys | deno | `deno test --allow-all --no-check _shared/__tests__/consecutive-runs.test.ts _shared/__tests__/replacement-upload.test.ts` | ❌ new | ⬜ pending |
| 09-06-T3 | 09-06 | 2 | VER-02 | T-09-06-A, T-09-06-D, T-09-06-E | Two tabs cannot double-charge; deterministic (AI_TEST_MODE); synthetic fixtures only | Playwright | `npx playwright test e2e/two-tab-concurrency.spec.ts` (x3 for flake) | ❌ new | ⬜ pending |
| 09-07-T1 | 09-07 | 2 | VER-02 | — | One History contract per feature (no divergent copy) | deno | `rg -l "history-persistence" supabase/functions` (6 files); `deno task test:ci` exits 0 | ✅ exists (deleting 5) | ⬜ pending |
| 09-07-T2 | 09-07 | 2 | VER-01 | T-09-07-A, T-09-07-B, T-09-07-C | Remote lane cannot pass vacuously, silently degrade, or target PROD | deno (negative + positive) | `deno test --allow-all --no-check _tests/remote-preflight.test.ts` — must FAIL without `DENO_TEST_SUPABASE_REMOTE=1`, FAIL on the prod ref, PASS with preview creds | ❌ new | ⬜ pending |
| 09-07-T3 | 09-07 | 2 | VER-01, VER-02 | T-09-07-D | The dead History lane executes against a real DB | deno (remote) | `cross-env DENO_TEST_SUPABASE_REMOTE=1 deno test --allow-all --no-check _tests/remote-preflight.test.ts <5 history files>` — non-zero EXECUTED count | ✅ exists (5, never run) | ⬜ pending |
| 09-08-T1 | 09-08 | 3 | VER-02 | T-09-08-A, T-09-08-D | Every new test actually runs in a lane (Pitfall 12) | deno | `deno task test:ci` (pass count > BEFORE); `DENO_TEST_SUPABASE_REMOTE=1 deno task test:remote` exits 0; `deno task test:remote` (no env) FAILS | ✅ exists | ⬜ pending |
| 09-08-T2 | 09-08 | 3 | VER-02 | T-09-08-B, T-09-08-C | Zero unclosed gaps; every mapped Deno test is registered in a lane | vitest static guard | `npx vitest run src/test/coverage/ver02-matrix.test.ts` (5/5 GREEN); `rg "kind: 'gap'"` -> 0 | ✅ exists | ⬜ pending |
| 09-08-T3 | 09-08 | 3 | VER-02 | T-09-08-B | A waiver is a product decision, not an implementation shortcut | **MANUAL** (only if a NEW waiver is needed; skip otherwise) | registry assertion 4 (reason + approver non-empty) | — | ⬜ pending |
| 09-09-T1 | 09-09 | 4 | VER-01 | T-09-09-A, T-09-09-B, T-09-09-E | Gate EXTENDED not replaced; promptfoo stays off; no lane weakened to green it | npm | `npm run verify:baseline` exits 0; `rg "promptfoo\|adversarial" package.json` -> 0 hits inside the gate value | ✅ exists | ⬜ pending |
| 09-09-T2 | 09-09 | 4 | VER-01 | T-09-09-C, T-09-09-D | deploy.ps1 stays pure ASCII; secrets are `secrets.*` refs only | byte check + parse | `grep -c $'\xe2' scripts/deploy.ps1` == 0; PowerShell parse (no "missing terminator") | ✅ exists | ⬜ pending |
| 09-09-T3 | 09-09 | 4 | VER-01 | T-09-09-B, T-09-09-D, T-09-09-E | GitHub secrets present + pointing at PREVIEW; wall-clock accepted | **MANUAL** (operator confirms secrets) | `Measure-Command { npm run verify:baseline }` recorded in TESTING-STRATEGY.md | ✅ exists | ⬜ pending |
| 09-10-T1 | 09-10 | 5 | VER-01 | — | A deploy reaching `supabase link` IS the proof the gate passed | deploy | `.\scripts\deploy.ps1 -Env staging` exits 0 (no -SkipVerify, no -SkipRemoteDbLane) | ✅ exists | ⬜ pending |
| 09-10-T2 | 09-10 | 5 | VER-01 | T-09-10-A, T-09-10-B, T-09-10-C | MERIT on STAGING only; positive lifecycle confirmation before any soak clock | **MANUAL** (operator) | `select id, state, idempotency_key from public.analysis_jobs ...` (non-null state + key) | ❌ new | ⬜ pending |
| 09-10-T3 | 09-10 | 5 | VER-01 | T-09-10-D, T-09-10-E | promptfoo runs ONCE as evidence and never joins the gate | promptfoo (off-gate) | 6x `npm run test:adversarial*`; `git diff --stat package.json` EMPTY | ✅ exists | ⬜ pending |
| 09-11-T1 | 09-11 | 6 | VER-04 | T-09-11-C | Test-account emails allowlisted; evidence schema targets the REAL tables | vitest | `npx vitest run src/test/security/phase9-pii-guard.test.ts`; `rg "analysis_runs" 09-PROD-ACTIVATION.md` -> 0 | ❌ new | ⬜ pending |
| 09-11-T2 | 09-11 | 6 | VER-04 | T-09-11-A..F | Claude never flips a prod flag; no real user data; abort criteria evaluated per flip | **MANUAL** (operator, PRODUCTION) | post-hoc: `npm run verify:baseline` exits 0 (PII guard green over all evidence) | ❌ new | ⬜ pending |
| 09-12-T1 | 09-12 | 7 | VER-05 | T-09-12-A, T-09-12-C | Every claim cites evidence by path; no PII/secrets | doc/static | `npx vitest run src/test/security/phase9-pii-guard.test.ts` | ❌ new | ⬜ pending |
| 09-12-T2 | 09-12 | 7 | VER-05 | T-09-12-B, T-09-12-D | Report completeness is gate-enforced; ledger closes on evidence | vitest static guard | `npx vitest run src/test/coverage/ver05-report.test.ts` (4/4); `npm run verify:baseline` exits 0 | ❌ new | ⬜ pending |
| 09-12-T3 | 09-12 | 7 | VER-05 | — | Operator signs off on the milestone | **MANUAL** (operator) | `npm run verify:baseline` green on the operator's machine | ✅ exists | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Requirement coverage:** VER-01 (09-03, 09-07, 09-09, 09-10) · VER-02 (09-01, 09-05, 09-06, 09-07, 09-08) · VER-04 (09-02, 09-03, 09-11) · VER-05 (09-04, 09-12). All four appear.

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. **No Wave 0 harness is needed** — and building one would be an anti-pattern here. Every mechanism this phase needs already exists in the repo and has a shipped precedent:

- [x] **Static-source guard idiom** (for the D-12 registry, the PII guard, the report guard) — three precedents: `src/test/security/security-audit-docs.test.ts` (vitest, `node:fs`, regex table, allowlist escape valve), `supabase/functions/_shared/no-paddle-live-surface.test.ts` (deno, explicit file list), `supabase/functions/_shared/cors-audit.test.ts` (deno, 21-function sweep).
- [x] **Fail-loud remote env validation** (for D-06) — `supabase/functions/_shared/__tests__/history-persistence-remote.ts` `skipRemote()` (L5-22) ALREADY throws on a misconfigured remote run "so a misconfigured remote run cannot pass vacuously." 09-07 GENERALIZES it (adds reachability + a prod-ref rejection); it does not reinvent it.
- [x] **Deterministic AI for E2E / remote runs** — `AI_TEST_MODE` (`_shared/anthropic.ts:575`), recorded fixtures with a per-resume hash-derived score offset. Already the Playwright + remote seam.
- [x] **Live refundable-error injection** (S-10 / S-11) — `MERIT_TEST_FORCE_REFUNDABLE_ERROR` (`_shared/anthropic.ts:541-562`), staging-host-gated (inert in prod even if set), takes a configurable 3-digit status: `408` = provider timeout, `429` = provider rate-limit.
- [x] **Two-tab harness** (S-20) — Playwright `browser.newContext()` + the existing `e2e/auth.setup.ts` storage-state pattern. No custom harness.
- [x] **Failure classification vocabulary** — `_shared/analysis-error-taxonomy.ts` (13 codes). These ARE the D-04 "error class" vocabulary; do not invent a second one.
- [x] **Stuck-run reaping** — `reap-stale-analysis-runs` + `REAP_CONFIG`, cron'd every 15 min. **Its prod TARGET is verified in 09-03 (a hard precondition, not an assumption).**
- [x] **Operator-gated soak template** — `.planning/phases/06-*/06-03-LIVE-SMOKE-RESULTS.md` (step-numbered, curl+SQL, outcomes recorded inline, operator types "approved"). 09-10 and 09-11 copy it.

**⚠️ NOT available, and deliberately NOT built (D-11 Path A):** there is **no seam that can force a malformed model SUCCESS body.** `MERIT_TEST_FORCE_REFUNDABLE_ERROR` and `AI_FORCE_FAILURE` both return `{ ok: false, status }`. "Invalid model JSON" (S-12) and "truncated output" (S-13) are therefore **not live-injectable** and are proven DETERMINISTICALLY at the validation boundary instead (`runtime-validation-convergence.test.ts`). `supabase/functions/_shared/anthropic.ts` must NOT be modified in this phase — adding a fault branch to a production code path during a verification phase is exactly the kind of change the milestone's guardrails exist to prevent.

---

## Manual-Only Verifications

| Behavior | Plan/Task | Requirement | Why Manual | Test Instructions |
|----------|-----------|-------------|------------|-------------------|
| Re-point the production reaper cron (`cron.alter_job`) + the two carried Phase-2 cron jobs | 09-03 T1 | VER-04 (enables D-04 (b)) | Claude is **READ-ONLY on production** (CLAUDE.md access policy); `cron.alter_job` is a live prod mutation. Claude proposes the SQL; the operator applies it. | Claude runs read-only `select * from cron.job` + `cron.job_run_details` and writes the proposed `cron.alter_job` into `09-ACTIVATION-PRECONDITIONS.md`. Operator applies it, confirms the reaper's `net.http_post` host is `zjpjapgraoxdukdvpjes` (not the preview ref), confirms recent runs SUCCEEDED (not 401), and confirms edge `INTERNAL_JOB_SECRET` ≡ Vault `internal_job_secret` **without printing either value**. |
| Pre-flip production edge-log baseline capture | 09-03 T3 | VER-04 (enables D-04 (c)/(d)) | **One-shot and non-reproducible.** Once the master flag is on, the pre-flip baseline can never be taken again and "any new error class not present in the pre-flip baseline" becomes permanently unevaluable. | Operator runs the prepared read-only queries against prod and records AGGREGATES ONLY (status-class histogram, 13-code taxonomy histogram, p50/p95, `analysis_jobs` state distribution, stuck-row count). **The stuck-row count must be 0** — a non-zero value means the reaper is not working and activation must not proceed. |
| GitHub Actions secrets present + pointing at PREVIEW | 09-09 T3 | VER-01 (D-06) | Repository secrets cannot be read or set from the repo. Merging the `regression-gate.yml` change without them turns **every PR red**. | Operator confirms `SUPABASE_URL_STAGING` + `SUPABASE_SERVICE_ROLE_KEY_STAGING` exist in GitHub -> Settings -> Secrets and point at `cimjltzovkahkqecpwgi` (preview), NOT prod. Values are never pasted into any file. |
| Accept the extended gate's wall-clock cost | 09-09 T3 | VER-01 | A product/process trade-off, not a technical one. | Operator reviews the `Measure-Command` result recorded in `TESTING-STRATEGY.md`. If it exceeds ~10 min: **accept the deploy latency, do NOT drop a lane.** The failure mode of a slow gate is operators reaching for `-SkipVerify`, so the mitigation is social, not technical. |
| A NEW registry waiver (only if 09-08 needs one) | 09-08 T3 | VER-02 (D-11) | A waiver is a permanent, gate-enforced statement that a scenario will never be tested for a feature. That is a product decision. | Skip entirely if every cell closed with a real test. Otherwise the operator approves the `reason` + `approvedBy` text, which is then also routed to report item 14. |
| Staging lifecycle + `MERIT_SYSTEM_ENABLED` activation and 5-feature smoke | 09-10 T2 | VER-01 (D-01, D-03) | `MERIT_SYSTEM_ENABLED` is a **GLOBAL gate across 10+ AI functions** (module-load snapshot). Turning it on in production in Phase 6 flipped platform-wide behavior and had to be reverted. Even the staging flip is operator-confirmed. | Steps A-F in `09-STAGING-ACTIVATION.md`. **Step C is a hard stop:** positively confirm a new `analysis_jobs` row with a non-null `state` AND a non-null `idempotency_key` before ANY soak clock starts (Pitfall 8 — the flags accept EXACT lowercase `'true'` only; a `True`/`1`/`yes` typo means nothing activates and the smoke silently measures the legacy path). Production `MERIT_SYSTEM_ENABLED` is re-confirmed false before and after. |
| **PRODUCTION staged flag activation (6 flips) + Free/Elite real-account pass** | 09-11 T2 | **VER-04** (D-01, D-02, D-04, D-13, D-14) | **The single highest-risk activity in the milestone.** Claude is read-only on production and **never flips a production flag**. Per standing project guidance, an `autonomous: false` checkpoint PAUSES for a human even though auto-mode is ON, and is **never auto-approved**. | `09-PROD-ACTIVATION.md`, six numbered flips in D-02 order (master -> recruiting_lens -> linkedin -> onboarding -> resume -> career_compass). Per flip: operator sets the exact lowercase `true`; re-confirms prod `MERIT_SYSTEM_ENABLED` is still false; POSITIVELY confirms the lifecycle is running; exercises the feature with BOTH the Free and Elite test accounts across resume-only and resume+LinkedIn using ONLY `scripts/test-resumes/` synthetic fixtures; captures `run_id` + merit-ledger delta + a **PII-redacted** screenshot; appends the `run_id` to the PII guard's `ALLOWED_RUN_IDS`; soaks **>= 30 min** (one full ~20-min reaper worst-case window + margin); evaluates all five numeric green criteria. **Any D-04 abort criterion -> master flag OFF immediately** (instant, request-time reads, byte-identical legacy restore). |
| Operator sign-off on the v5.0 milestone | 09-12 T3 | VER-05 | The milestone close is the operator's call. | Read `09-MILESTONE-REPORT.md` end to end; follow any `**Evidence:**` citation you doubt; scrutinize **Item 14 (remaining risks)** — if it is comfortable to read, it is probably incomplete. Confirm `verify:baseline` green and prod `MERIT_SYSTEM_ENABLED` still false. |

**No silent gaps (D-11):** every scenario cell not covered by an automated test carries an explicit `kind:'waiver'` with a `reason` and an `approvedBy` in `src/test/coverage/ver02-matrix.test.ts`, enforced by registry assertion 4. Every manual verification above is enumerated here and produces a durable, reproducible record under the phase directory.

---

## Validation Gaps / Risks

1. **The remote lane makes every deploy AND every PR depend on the preview project being unpaused.** Preview (`cimjltzovkahkqecpwgi`) was paused for all of v4.0; project memory records it unpaused as of 2026-06-24. If it pauses again, `deploy.ps1` blocks and CI goes red. **That is the INTENDED fail-loud behavior** — the escape hatch (`-SkipRemoteDbLane`) is emergency-only, and the real fix is to unpause preview. Documented in `TESTING-STRATEGY.md` by 09-09.
2. **The prod reaper may be pointing at preview.** Until 09-03 verifies it, D-04 criterion (b) is unenforceable on production. **Hard precondition to the first prod flip** — 09-11 `depends_on: 09-03`.
3. **The pre-flip edge-log baseline is one-shot.** If it is not taken before the master flag goes on, D-04 criterion (c) is permanently unevaluable for this milestone. Sequenced first (09-03, wave 1).
4. **`VITE_FEATURE_ANALYSIS_LIFECYCLE` is build-time.** A Vercel redeploy is required; it does not flip with the edge secrets. **Frontend and backend flags flip on different clocks — a window exists where they disagree.** Sequenced explicitly in 09-10 and 09-11.
5. **The vitest lane is intentionally RED between 09-01 and 09-08.** The D-12 registry's gap assertion is the gap list. Executors must not weaken it to green the gate mid-phase.
6. **The five `history-persistence.test.ts` files have never executed in any lane.** Treat them as STALE hypotheses, not coverage, until 09-07 T3 proves them against a real database. Expect drift from Phases 3/4/5/6/08.x (renamed tables, removed fields, the 11->4 section LinkedIn change).

---

## Validation Sign-Off

- [x] All tasks have a `<verify>` command or are an enumerated Manual-Only verification
- [x] Sampling continuity: no 3 consecutive tasks without an automated verify (the four operator checkpoints are each adjacent to automated tasks and each produce a durable recorded artifact)
- [x] Wave 0 covers all MISSING references (none — every mechanism has a shipped in-repo precedent; the one genuinely-missing seam is deliberately NOT built, per D-11 Path A)
- [x] No watch-mode flags (`vitest run`, `deno test`, `playwright test` — all single-shot)
- [x] Feedback latency recorded (one task; wall-clock of the extended gate to be measured in 09-09 T3)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planner-signed 2026-07-11. Operator approval pending at 09-12 T3.
