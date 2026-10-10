---
status: testing
phase: 22-linkedin-grader-ui-overhaul-cross-feature-memory-history
source:
  - 22-01-SUMMARY.md
  - 22-02-SUMMARY.md
  - 22-03-SUMMARY.md
  - 22-04-SUMMARY.md
  - 22-05-SUMMARY.md
started: 2026-04-20T09:32:29Z
updated: 2026-04-20T09:32:29Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: LinkedIn Grader Free-Tier Results Layout
expected: |
  Sign in on a free-tier account and run or load a LinkedIn analysis. At the top of /linkedin-grader
  results: the container starts with a small top margin (no big empty band). Inside "Section-by-Section
  Breakdown", Profile Completeness is the FIRST card. Inside "Ready-to-Paste Improvements" you see
  1 real fix card on top followed by 4 locked/blurred skeleton cards sharing a single lock overlay
  that CTAs to /pricing on click.
awaiting: user response

## Tests

### 1. LinkedIn Grader Free-Tier Results Layout
expected: Free-tier /linkedin-grader shows container top-aligned (pt-6), Profile Completeness first in Section Breakdown, and Ready-to-Paste Improvements renders 1 real + 4 locked blurred skeleton cards under a single lock overlay that routes to /pricing.
result: [pending]

### 2. LinkedIn Grader Pro/Elite Parity (no locked skeletons)
expected: Sign in on a Pro or Elite account and open /linkedin-grader results. The Ready-to-Paste Improvements section renders ONLY real AI-generated fixes with NO locked/blurred skeleton cards. Profile Completeness still appears first in Section-by-Section Breakdown.
result: [pending]

### 3. Results page Scan-New Header Bar
expected: Open /results/{id} for an existing resume analysis. At the very top of the page there's a header row with "Resume Screening Report" (h2, semibold) on the left and an outline button with a refresh icon labeled "Analyze New Resume" on the right. Clicking the button navigates to /upload. The title appears only once (no duplicate heading below).
result: [pending]

### 4. Career Compass Scan-New Header Bar
expected: Open /career-compass after running an analysis. At the top of the results you see a header row with "Your Career Compass" (semibold) on the left and an outline "Start New Analysis" button with a refresh icon on the right. Clicking the button clears the current analysis and returns you to the input form on the same page (no navigation away).
result: [pending]

### 5. Recruiting Lens Scan-New Header Bar
expected: Open /recruiting-lens after running a match. At the top of the results you see "Your Recruiting Lens Match" (semibold, not bold) on the left and an outline "Run New Match" button with a refresh icon on the right. Clicking it clears the current match and returns you to the job-description/LinkedIn input form.
result: [pending]

### 6. Career Compass Cross-Feature Memory Badge
expected: Have an existing LinkedIn grade on the account, then run a new Career Compass analysis on a Pro/Elite account. When results render, a neutral grey "Used your LinkedIn analysis from {date}" badge appears next to the "Your Career Compass" heading. The analysis completes noticeably faster than a fresh full analysis.
result: [pending]

### 7. Career Compass D-16 Graceful Fallback Dialog
expected: On an account that has a resume prior but NO prior LinkedIn grade, attempt to run Career Compass. A dialog appears with title "Add your LinkedIn analysis" offering two buttons: "Add LinkedIn analysis" (primary — navigates to /linkedin-grader) and "Continue without" (secondary — resubmits the analysis without needing LinkedIn). Clicking "Continue without" proceeds with a resume-only analysis. No merits/credits were charged for the blocked attempt.
result: [pending]

### 8. History Page Shows All 5 Feature Runs
expected: Run one fresh analysis on each of the 5 features (Resume, LinkedIn Grader, Career Compass, Recruiting Lens, Interview Prep) on a free- or pro-tier account, then open /history (or /dashboard history tab). The history list shows one row per feature run in reverse-chronological order. For LinkedIn Grader first-scan-of-cycle the credit badge shows "0 credits"; all other runs show "1 credit". No features are missing and no rows are double-counted.
result: [pending]

### 9. History Row Click Routes to Past Analysis
expected: From /history, click a Resume row → navigates to /results/{uuid} showing that past analysis. Click a LinkedIn row → /linkedin-grader?id={uuid} with past analysis pre-loaded (not input form). Click a Career Compass row → /career-compass?id={uuid} with past analysis pre-loaded. Click an Interview Prep row → /interview-prep?id={uuid} lands on the PAST QUIZ read-only view (not the coach chat or new-session form).
result: [pending]

### 10. Recruiting Lens History Silent Degrade (Free/Pro)
expected: On a Free or Pro tier account that ran Recruiting Lens but has no stored result (tier-gated persistence), click the Recruiting Lens row in /history. The URL becomes /recruiting-lens?id={uuid} but instead of an "Analysis not found" error, an informational toast appears saying "This analysis wasn't saved — run a fresh match to regenerate." and the default input view (job description + LinkedIn fields) shows.
result: [pending]

### 11. Deep-Link Invalid ID Fallback
expected: On each of /linkedin-grader?id=invalid, /career-compass?id=invalid, /recruiting-lens?id=invalid, /interview-prep?id=invalid, and /linkedin-grader?id=00000000-0000-0000-0000-000000000000 (valid UUID shape, no row) — a toast appears ("Analysis not found" or the informational Recruiting Lens variant) and the page falls back to its default input view. No blank screen, no console crash.
result: [pending]

### 12. Deep-Link RLS Cross-User Protection
expected: Copy a deep-link like /linkedin-grader?id={uuid} from User A's history. Sign in as User B and paste that URL. A toast "Analysis not found" appears and User B sees the default input form — no access to User A's analysis. Repeat for career-compass, recruiting-lens, interview-prep. No leak of another user's data.
result: [pending]

### 13. Interview Prep Past Quiz View
expected: Click an Interview Prep row in /history. The page shows a "Past Prep Session" header with role/company/date, a metadata card (mode + tier badges, overall score, job description), and a list of per-question cards each with question text, your answer, a score badge, and coach suggestions. A "Start New Session" button clears the view and returns to the input form. Does NOT render the mock coach chat or live prep input on the id route.
result: [pending]

### 14. No Regression on Default (no ?id=) Routes
expected: Visit each page without a query string — /linkedin-grader, /career-compass, /recruiting-lens, /interview-prep. Each renders its normal input form / fresh-scan flow as before. You can run a new analysis and the results display normally. No stray past-quiz or deep-link banners appear.
result: [pending]

### 15. Consistent Container Width Across Feature Pages
expected: Open /results/{id}, /career-compass, /linkedin-grader, /recruiting-lens at a wide desktop viewport (>=1440px). All four feature-results pages use the same widened container (max-w-7xl) — content looks uniformly centered and proportionate across the four pages, not narrower on some than others.
result: [pending]

## Summary

total: 15
passed: 0
issues: 0
pending: 15
skipped: 0

## Gaps

[none yet]
