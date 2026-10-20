---
status: passed
phase: 35-cross-feature-input-context-selectors-linkedin-auto-pull
source:
  - 35-QA-CHECKLIST.md (Manual Route Smoke — blocked rows)
  - 37-UAT.md (cross-coverage for CTX-01/02 / LIG-01/02 / RCL-01)
started: 2026-06-08
updated: 2026-06-08
note: |
  Scaffold for the authenticated route smoke that 35-VERIFICATION flagged "blocked".
  Several 35 checklist rows were already exercised in the Phase 37 UAT (2026-06-08) —
  recorded below as pass-by-reference. Only the 5 genuinely-uncovered rows are live tests.
  Reply yes/next (pass), blocked, skip, or describe the issue. When all resolve,
  I'll write 35-VERIFICATION.md from the results.
---

## Current Test

number: 1
name: RCL — resume-only, LinkedIn empty-state non-blocking
expected: |
  As a user WITH a resume analysis but NO LinkedIn source, open /recruiting-lens.
  The resume prior defaults in; the LinkedIn slot shows a non-blocking empty-state
  (no LinkedIn required to proceed). Submit becomes available once Company+Role+JD
  are filled.
awaiting: complete

## Covered by Phase 37 UAT (pass-by-reference, 2026-06-08)

- CTX-01 / LIG-01 — LinkedIn onboarding PDF auto-pull → 37-UAT Test 5 (pass)
- LIG-02 — replacement persists on success → 37-UAT Test 6 (pass)
- CTX-02 / RCL-01 — Recruiting Lens defaults to most-recent resume + LinkedIn, selectors present → 37-UAT Tests 15 & 16 (pass)

## Tests

### 1. RCL — resume-only, LinkedIn empty-state non-blocking
route: /recruiting-lens
fixture: user with resume analysis, no LinkedIn source
expected: Resume prior defaults; LinkedIn empty-state is non-blocking; analyze enabled after Company+Role+JD.
result: pass - operator smoke attestation 2026-06-08.

### 2. RCL — no resume, blocking /upload CTA
route: /recruiting-lens
fixture: user with NO resume analysis
expected: A blocking "/upload" CTA appears; submit is disabled until a resume prior exists.
result: pass - operator smoke attestation 2026-06-08.

### 3. LIG — replacement FAILURE leaves source unchanged
route: /linkedin-grader
fixture: upload a replacement PDF, then force the grade to FAIL after extraction
expected: profiles.linkedin_pdf_content / filename / timestamp remain UNCHANGED (the prior source is preserved; only a successful grade overwrites it). This is the failure-path complement to 37-UAT Test 6.
result: pass - operator smoke attestation 2026-06-08.

### 4. CC — selectors default saved state with priors
route: /career-compass
fixture: user with resume + LinkedIn priors
expected: Resume and LinkedIn selectors default to the saved prior state; submit is available with the resume prior. (The existing `linkedin_prior_missing` fallback still shows when no LinkedIn prior exists.)
result: pass - operator smoke attestation 2026-06-08.

### 5. IP — selector parity (STAGING/DEV only)
route: /interview-prep (with VITE_FEATURE_INTERVIEW_PREP enabled)
fixture: Pro/Elite user with a resume prior
expected: PriorAnalysisSelector appears in the Interview Prep form and the form remains usable. NOTE: staging/preview only — production gates Interview Prep via Phase 47, so there is no prod surface. If you can't reach a flag-enabled env, reply "blocked".
result: pass - operator smoke attestation 2026-06-08 in a flag-enabled staging/dev environment.

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

None. Remaining authenticated route smoke was operator-confirmed passed on 2026-06-08.
