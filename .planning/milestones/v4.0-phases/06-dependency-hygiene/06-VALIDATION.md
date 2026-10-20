---
phase: 06
slug: dependency-hygiene
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-20
---

# Phase 06 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> This is a **zero-functional-change dependency phase**: its automated verification is the existing regression net (`verify:baseline`) sampled per-commit, plus the `npm ci` reproducibility gate. No new behavior was introduced, so no new behavior tests were generated — version-assertion unit tests would test the lockfile, not behavior (the build + regression net already catch a broken import or behavioral drift). Reconstructed State-B from artifacts (no prior VALIDATION.md).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x (frontend) + deno test:ci (edge) + Playwright 1.61 (E2E) |
| **Config file** | `vitest.config.ts`, `supabase/functions/deno.json`, `playwright.config.ts` |
| **Quick run command** | `npm test` (vitest run — 457 green) |
| **Full suite command** | `npm run verify:baseline` (= `test` && `test:edge` && `test:e2e`) |
| **Reproducibility gate** | `rm -rf node_modules && npm ci` (DEP-05 — hard-fails on lock/manifest drift) |
| **Static gates** | `npm run build` (exit 0), `npm run lint` (exit 0), `npm run type-check` |
| **Estimated runtime** | vitest ~10s · deno ~30s · Playwright ~3–5min · full ~5min |

---

## Sampling Rate

- **After every task commit:** Run `npm run verify:baseline` (every risky bump was its own atomic commit gated on a green baseline — high sampling rate, bounded blast radius)
- **After every plan wave:** Run `npm run verify:baseline` + a targeted operator smoke for behavioral majors (D-02)
- **Closing gate (06-06):** `rm -rf node_modules && npm ci && npm run verify:baseline` (reproducibility + integrity proof)
- **Before `/gsd:verify-work`:** Full suite green + the two env-deferred E2E legs run once the TEST Supabase project is unpaused
- **Max feedback latency:** ~5 minutes (full baseline)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure / Preserved Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------------------|-----------|-------------------|-------------|--------|
| 06-01 | 01 | 1 | DEP-02 | T-06-01/02/03 | 4 unused deps removed + `dotenv` declared with zero live-consumer breakage | regression + build | `npm run build && npm run verify:baseline` | ✅ | ✅ green |
| 06-02 | 02 | 2 | DEP-03 | T-06-04/05/06 | recharts 2→3 + date-fns 3→4 render/format unchanged | regression + manual visual smoke | `npm run verify:baseline` (+ operator chart/date smoke) | ✅ | ✅ green |
| 06-03 | 03 | 3 | DEP-03 | T-06-07/08/09 | 9 contained majors + eslint set preserve runtime + keep lint gate intact | regression + lint + type | `npm run verify:baseline && npm run lint && npm run type-check` | ✅ | ✅ green |
| 06-04 | 04 | 4 | DEP-03 | T-06-10/11/12 | grouped minor/patch batches; Stripe + Supabase payment/auth paths preserved | regression + E2E | `npm run verify:baseline` | ✅ | ✅ green (Stripe checkout reconcile leg env-deferred — M4) |
| 06-05 | 05 | 5 | DEP-04 | T-06-13/14/15/16 | vite/react-router-dom/ws advisories cleared, no new prod vuln; realtime behavior preserved | regression + `npm audit` re-check | `npm run verify:baseline` + `npm audit` | ✅ | ✅ green (realtime live smoke env-deferred — M5) |
| 06-06 | 06 | 6 | DEP-05, NFR-02 | T-06-17/18/19 | lockfiles reproducible + clean install deterministic; every change has a revert SHA | reproducibility + integrity | `rm -rf node_modules && npm ci && npm run verify:baseline` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new framework, config, or stub files were needed — vitest, deno `test:ci`, and Playwright were already present and green at phase start. NFR-02's rollback path is a git-history property (atomic commit + revert SHA in `06-DEP-CHANGES.md`), verified by inspection, not a runtime test.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions | Status |
|----------|-------------|------------|-------------------|--------|
| recharts@3 / date-fns@4 visual + label correctness | DEP-03 (T-06-04) | Pixel/axis/tooltip + Today/Yesterday label drift is invisible to the offline + E2E net | Operator views a chart-bearing page and a date-formatted surface; confirm axes/tooltips render and relative-date labels are correct | ✅ operator PASS 2026-06-20 |
| sonner@2 toast fires + auto-dismisses | DEP-03 (T-06-07) | Toast timing/auto-dismiss + Toaster mount is a visual/timing behavior | Trigger a toast; confirm it appears, auto-dismisses, and the Toaster is mounted | ✅ operator PASS 2026-06-20 |
| @hookform/resolvers@5 dialog-form validation | DEP-03 (T-06-09) | Form-validation UX across the 3 zodResolver dialogs | Open each zodResolver dialog; confirm invalid input is blocked and valid input submits | ✅ operator PASS 2026-06-20 |
| Stripe checkout reconcile E2E (`stripe-checkout:56`) | DEP-03 (T-06-10) | **Env-deferred** — blocked on paused TEST Supabase project `cimjltzovkahkqecpwgi` (DI-06-04-01); not a coverage gap (the Playwright spec exists) | Re-run `npx playwright test stripe-checkout` once the TEST project is unpaused; expect the `?checkout=complete` reconcile leg green | ⬜ pending (env-deferred) |
| Realtime websocket update (ws override on prod path) | DEP-04 (T-06-14) | **Env-deferred** — blocked on the same paused TEST project (DI-06-05-01); `ws@^8.21.0` on `@supabase/realtime-js`, polling-backstopped at `Results.tsx:409` | With the TEST project live, exercise the Results realtime path; confirm websocket updates arrive (5s DB-poll fallback covers degraded mode) | ⬜ pending (env-deferred) |

---

## Validation Sign-Off

- [x] All tasks have an automated verify command (or a documented manual/env-deferred exception)
- [x] Sampling continuity: every risky change sampled per-commit by `verify:baseline` — no 3 consecutive un-sampled commits
- [x] Wave 0 covers all MISSING references (none — existing infrastructure sufficient)
- [x] No watch-mode flags (all commands are single-run: `vitest run`, `playwright test`, `npm ci`)
- [x] Feedback latency < 5 min (full baseline)
- [x] `nyquist_compliant: true` set in frontmatter (every requirement has automated verification; 3 manual smokes operator-PASS, 2 E2E legs env-deferred not coverage-missing)

**Approval:** approved 2026-06-20 (automated; 2 env-deferred E2E legs to confirm in `/gsd:verify-work` once TEST Supabase project is unpaused)
