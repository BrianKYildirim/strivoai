---
phase: 36
slug: history-persistence-parity-audit-repair
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-08
method: State-B reconstruction (no VALIDATION.md existed; 36-VERIFICATION.md passed)
---

# Phase 36 — Validation Strategy

> Reconstructed retroactively at milestone reconciliation (2026-06-08). Phase 36 shipped with full per-feature + remote test coverage but no VALIDATION.md — the Nyquist gap flagged by the v3.0 audit. This documents the existing automated verification. No MISSING gaps were found; no new tests required.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Deno test (edge functions) + Vitest (frontend) |
| **Config file** | `supabase/functions/deno.json`, `vitest.config.ts` |
| **Quick run command** | `deno test --allow-read --allow-env --allow-net supabase/functions/<fn>/history-persistence.test.ts` |
| **Full suite command** | `.\scripts\run-edge-tests.ps1` (remote TEST-05 block gated on `DENO_TEST_SUPABASE_REMOTE=1` + staging secrets) |
| **Estimated runtime** | ~local Deno suite 251 tests; remote suite 5 feature tests + negative regression |

---

## Sampling Rate

- **After every task commit:** Run the per-feature `history-persistence.test.ts`
- **After every plan wave:** Run `.\scripts\run-edge-tests.ps1`
- **Before `/gsd:verify-work`:** Full edge suite green (251/251 local confirmed)
- **Max feedback latency:** local suite seconds; remote suite requires staging deploy

---

## Per-Task Verification Map

| Requirement | Plan | Test Type | Automated Command / File | Status |
|-------------|------|-----------|--------------------------|--------|
| HIST-02 — Resume → `analysis_results` insert | 36-02 | integration | `analyze-resume/history-persistence.test.ts` | ✅ green |
| HIST-03 — Recruiting Lens Pro persistence | 36-04 | integration | `recruiting-lens/history-persistence.test.ts` | ✅ green |
| HIST-04 — Interview Prep `?id=` hydration | 36-03, 36-05 | integration + frontend | `interview-prep-analyze/history-persistence.test.ts` + `InterviewPrep.tsx:214-320` hydration (staging-only surface — Phase 47 gates prod) | ✅ green (prod surface manual-only) |
| HIST-05 — AnalysisHistory parity across 5 features | 36-05 | integration | remote suite + `AnalysisHistory.tsx` flag-gated listing | ✅ green |
| HIST-06 — All 5 features write `analysis_id` | 36-02..05 | integration | per-feature `history-persistence.test.ts` (×5) | ✅ green |
| HIST-07 — Recruiting Lens orphan async path removed | 36-04 | code + test | orphan async-queue path removed; verified in 36-VERIFICATION | ✅ green |
| TEST-05 — Per-feature history-persistence regression | 36-02..06 | integration (remote) | `_shared/__tests__/history-persistence-remote.ts` (5 tests + negative no-phantom-row regression) | ✅ green (operator-confirmed staging 2026-05-31) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. All 5 features carry a `history-persistence.test.ts`; the shared remote suite covers cross-feature TEST-05.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Interview Prep `?id=` deep-link rendering on a real browser | HIST-04 | Production surface is gated off by Phase 47 (`VITE_FEATURE_INTERVIEW_PREP`); verifiable on staging/preview only | On staging with flag ON, open `/interview-prep?id=<quiz_id>` and confirm past content hydrates. Rides with the future Interview Prep milestone for prod. |
| Remote TEST-05 suite execution | TEST-05 | Requires deployed staging + `DENO_TEST_SUPABASE_REMOTE=1` + staging secrets; can't run from source alone | `.\scripts\run-edge-tests.ps1` with remote env set. Operator-confirmed pass 2026-05-31. |

---

## Validation Sign-Off

- [x] All requirements have automated verification (per-feature + remote suites)
- [x] Sampling continuity: no 3 consecutive requirements without automated verify
- [x] Wave 0 covers all MISSING references (none — existing infra sufficient)
- [x] No watch-mode flags
- [x] Feedback latency acceptable (local suite seconds)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-08 (retroactive reconstruction; 36-VERIFICATION.md passed; local Deno 251/251 + operator-confirmed remote TEST-05)
