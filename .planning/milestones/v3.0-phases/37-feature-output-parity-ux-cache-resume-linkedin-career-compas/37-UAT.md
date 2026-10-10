---
status: complete
phase: 37-feature-output-parity-ux-cache-resume-linkedin-career-compas
source:
  - 37-01-SUMMARY.md
  - 37-02-SUMMARY.md
  - 37-03-SUMMARY.md
  - 37-04-SUMMARY.md
started: 2026-06-08
updated: 2026-06-08
note: |
  Cache-hit tests (4, 9, 14, 19) depend on Phase 29 analysis_cache infra being live.
  Phase 29-10 is paused at the operator staging-deploy gate — if cache is not yet
  deployed to your test environment, mark those tests "blocked".
---

## Current Test

[testing complete]

## Tests

### 1. Resume Analysis — no "Priority Actions"
expected: Resume Analysis result (any tier) renders "Priority Improvements" and NO "Priority Actions" section. Free shows 1 visible + locked skeletons; Pro/Elite show the full list.
result: pass

### 2. Resume Analysis — legacy payload renders clean
expected: Open an OLD persisted Resume result that still contains a priorityActions/quickActions field. It renders without crashing and shows no orphan/empty "Priority Actions" heading.
result: pass

### 3. Resume Analysis — Pro/Elite full result intact
expected: A Pro or Elite Resume Analysis still renders the full result with "Priority Improvements" visible and no sections missing.
result: pass

### 4. Resume Analysis — cache hit (CACHE-04)
expected: Run the same paid Resume Analysis twice with identical inputs. The 2nd run returns instantly (no Anthropic wait), deducts NO merits, and the Activity History entry links back to the original analysis.
result: pass

### 5. LinkedIn Grader — onboarding PDF pre-populates
expected: As a user who uploaded a LinkedIn PDF during onboarding, open /linkedin-grader. The saved PDF content pre-populates the analyzer without re-uploading.
result: pass

### 6. LinkedIn Grader — replacement persists on success only
expected: Upload a replacement LinkedIn PDF and run a successful grade. profiles.linkedin_pdf_content + filename + timestamp update only AFTER the grade succeeds (not on a failed run).
result: pass

### 7. LinkedIn Grader — no "What's Working For You"
expected: LinkedIn Grader result renders "Key Strengths" but NO "What's Working For You" section. An old grade containing profileInsights still renders with no orphan heading.
result: pass

### 8. LinkedIn Grader — tiered Ready-to-Paste
expected: Free shows exactly 1 visible Ready-to-Paste improvement + 4 locked placeholders. Pro shows 4–7 visible with no locked placeholders. Elite shows the full/highest-tier output.
result: pass

### 9. LinkedIn Grader — cache hit/miss (CACHE-05)
expected: Repeat an identical grade (same profile content, URL, prior grade, tier) → 2nd run returns from cache as a normal successful grade, no merit deduction. Change the prior-grade context → cache misses and a fresh grade generates.
result: pass

### 10. LinkedIn Grader — deep-link hydration
expected: Open /linkedin-grader?id=<grade_id>. The selected grade owns the page; auto-pull/cache-restore does NOT overwrite it.
result: pass

### 11. Career Compass — Free skeleton parity
expected: Run a Free Career Compass analysis. You see: full Career DNA; 3 real + 2 locked Best-Fit Roles; 2+2 Surprise Fits; 3+2 Fields; 3+2 Roles; Readiness score with locked detail; a fully fake locked Roadmap (no real roadmap content).
result: pass

### 12. Career Compass — Pro/Elite all 6 sections (TEST-06)
expected: Run a Pro or Elite Career Compass analysis. All six sections render fully populated: Best-Fit Roles, Surprise Fits, Fields, Roles, Readiness, AND Roadmap.
result: pass

### 13. Career Compass — partial-result recovery UX (CC-11)
expected: Open an old/partial Career Compass result via /career-compass?id=<id>. It shows an amber "This analysis is partial…" warning + per-section fallback cards with "Re-run for full report" — NOT "Couldn't load this analysis".
result: pass

### 14. Career Compass — re-run CTA + cache hit (CACHE-06)
expected: Clicking "Re-run for full report" returns to the editable form with saved inputs, spending NO merits and starting NO AI call. Separately: repeating identical paid inputs returns the 2nd run from cache with no merit spend.
result: pass

### 15. Recruiting Lens — defaults to recent priors
expected: Open /recruiting-lens. It defaults to your most-recent Resume Analysis AND most-recent LinkedIn source, with selectors to pick prior analyses — no re-upload required.
result: pass

### 16. Recruiting Lens — mandatory Company + Role + JD
expected: Submit is disabled until Company name, Role title, and Job Description are all present. Backend rejects a call missing any of the three.
result: pass

### 17. Recruiting Lens — tutorial modal
expected: First valid submit opens RecruitingLensTutorialModal before analysis. "Skip tutorial" and "Start job analysis" both persist dismissal (localStorage); a "View tutorial" affordance remains available afterward.
result: pass

### 18. Recruiting Lens — Saved Jobs tile + deep-link
expected: A successful run creates/refreshes one tile below the form (company + role + match score + date). Clicking the tile opens /recruiting-lens?id=<run_id> and hydrates the cached result.
result: pass

### 19. Recruiting Lens — cache hit (CACHE-07)
expected: Repeat identical company/role/JD/resume/LinkedIn/tier inputs → 2nd run returns a normal successful cache-hit result, refreshes the EXISTING tile (no duplicate), and adds an Activity History row.
result: pass

### 20. Recruiting Lens — queued fallback completes
expected: A queued fallback job completes through process-recruiting-lens-job and its completion email links to /recruiting-lens?id=<run_id> (no orphaned/unworked async job).
result: pass

## Summary

total: 20
passed: 20
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
