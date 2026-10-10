---
phase: 02-security-audit-remediation
plan: 07
subsystem: testing
tags: [prompt-injection, prompt-sanitizer, xss, anthropic, deno, vitest, edge-functions, defense-in-depth]

# Dependency graph
requires:
  - phase: 02-02
    provides: SEC-07 coverage gap confirmed at HEAD (5/8 uncovered; analyze-resume+analyze-career MEDIUM) + SEC-04 chart.tsx sink confirmed clean
  - phase: 02-06
    provides: deno.json test:ci tail (replay-window guard) — the append point for the new sanitizer-coverage guard
provides:
  - analyze-resume + analyze-career sanitize user-role resume/career text before the Anthropic invoke (SEC-07 MEDIUM remediated)
  - static sanitizer-coverage guard (_shared/sanitizer-coverage.test.ts) locking the 5 enrolled ingesters, length-guarded at 5
  - static XSS-sink regression guard (src/test/security/xss-sink-guard.test.ts) locking the single chart.tsx dangerouslySetInnerHTML sink
  - final Low-residual disposition for the 3 low-traffic ingesters (analyze-skills-gap, compare-jobs, chat-agent) — resolves RESEARCH Open Question 2
affects: [02-08, RESIDUAL-REGISTER, verify:baseline]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Class-B static-source coverage guard (cors-audit.test.ts precedent) applied to prompt-sanitizer coverage: table-driven source.includes('sanitize') per enrolled ingester + a === N length guard so a new ingester fails until enrolled"
    - "Vitest static XSS-sink guard: recursive walk of src/ with an explicit posix-relative allowlist (chart.tsx + the guard file itself)"
    - "Pre-ingestion sanitize seam: sanitizeUserContent applied to the user-role text feeding the prompt (never the system prompt), single-word terms preserved"

key-files:
  created:
    - supabase/functions/_shared/sanitizer-coverage.test.ts
    - src/test/security/xss-sink-guard.test.ts
  modified:
    - supabase/functions/analyze-resume/index.ts
    - supabase/functions/analyze-career/index.ts
    - supabase/functions/deno.json
    - .planning/phases/02-security-audit-remediation/audit/CODE-EDGE-FINDINGS.md

key-decisions:
  - "Scoped the sanitizer + coverage guard to the high-traffic five (grade-linkedin, recruiting-lens, interview-prep-analyze, analyze-resume, analyze-career); the 3 low-traffic ingesters stay a justified Low residual (D-01), not remediated"
  - "analyze-resume: sanitize normalizedText feeding buildUserPrompt (the single resume-text ingestion point; promptParams carries only derived metadata)"
  - "analyze-career: sanitize resume/LinkedIn content in both the free single-call and pro/elite paths; length-comparison log kept on the raw trimmed values so its behavior is unchanged"
  - "XSS-sink guard allowlists chart.tsx (benign CSS-var sink, no user data) AND the guard file itself (necessarily references the token); scans all other src/ .ts/.tsx"

patterns-established:
  - "SEC-07 sanitizer-coverage guard: adding a 6th AI ingester fails the === 5 length guard until it is enrolled AND calls the sanitizer"
  - "SEC-04 XSS-sink guard: any new dangerouslySetInnerHTML outside the allowlist fails verify:baseline, forcing an explicit security review"

requirements-completed: [SEC-13, SEC-14]

# Metrics
duration: 9min
completed: 2026-07-02
---

# Phase 2 Plan 07: Prompt-Sanitizer Coverage (SEC-07) + XSS-Sink Regression Lock (SEC-04) Summary

**analyze-resume + analyze-career now strip high-confidence prompt-injection phrases from user resume/career text before the Anthropic call, locked by a static coverage guard; the single chart.tsx dangerouslySetInnerHTML sink is locked against regression by a vitest guard — both fold into verify:baseline.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-07-02T02:36:47Z
- **Completed:** 2026-07-02T02:46:04Z
- **Tasks:** 2
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments
- Brought analyze-resume + analyze-career to the prompt-sanitizer discipline the 3 covered ingesters already have — closing the confirmed SEC-07 MEDIUM defense-in-depth gap (pre-ingestion step only; no schema/wire/tier-model change).
- Added `_shared/sanitizer-coverage.test.ts`: a static, table-driven coverage guard over the 5 enrolled ingesters with a `=== 5` length guard, registered in `deno.json` `test:ci` → `verify:baseline` (SEC-14). Captured RED (analyze-resume/analyze-career failing on pre-fix source) → GREEN.
- Added `src/test/security/xss-sink-guard.test.ts`: a vitest static guard forbidding any `dangerouslySetInnerHTML` in `src/` outside the allowlisted `chart.tsx`; fail-before demonstrated (a temporary second sink drove it RED).
- Recorded the final MEDIUM-vs-Low disposition for the 3 low-traffic ingesters (analyze-skills-gap, compare-jobs, chat-agent) as a justified Low residual — resolving RESEARCH Open Question 2 (carried to RESIDUAL-REGISTER by 02-08).

## Task Commits

Each task was committed atomically:

1. **Task 1: Apply prompt sanitizer to analyze-resume + analyze-career + static coverage guard** - `949b761b` (feat)
2. **Task 2: SEC-04 XSS-sink regression guard + record low-traffic-ingester Low residual** - `00d8eb23` (test)

_Full-suite evidence: `deno task test:ci` 814 passed / 0 failed / 11 ignored (was 808 after 02-06; +6 sanitizer-coverage); security vitest 18 passed._

## Files Created/Modified
- `supabase/functions/_shared/sanitizer-coverage.test.ts` - NEW static coverage guard: 5 enrolled AI ingesters must call the sanitizer; `=== 5` length guard.
- `src/test/security/xss-sink-guard.test.ts` - NEW vitest guard: no `dangerouslySetInnerHTML` in src/ outside the chart.tsx allowlist.
- `supabase/functions/analyze-resume/index.ts` - Import `sanitizeUserContent`; sanitize `normalizedText` before `buildUserPrompt`.
- `supabase/functions/analyze-career/index.ts` - Import `sanitizeUserContent`; sanitize resume/LinkedIn content in both the free single-call and pro/elite paths.
- `supabase/functions/deno.json` - Register `_shared/sanitizer-coverage.test.ts` in `test:ci` after the 02-06 replay-window guard.
- `.planning/phases/02-security-audit-remediation/audit/CODE-EDGE-FINDINGS.md` - Domain 14: mark analyze-resume/analyze-career REMEDIATED, record the 3 low-traffic ingesters as final Low residual (Open Q2 resolved); Domain 9: mark SEC-04 route DONE.

## Decisions Made
- **Enrolled set = high-traffic five only.** The sanitizer + coverage guard cover grade-linkedin, recruiting-lens, interview-prep-analyze, analyze-resume, analyze-career. The 3 low-traffic ingesters (analyze-skills-gap, compare-jobs, chat-agent) are a justified Low residual under D-01 (hard input slice caps; chat-agent forces `role: 'user'` + 2000-char cap + last-message-only; robust system prompts + off-gate promptfoo) — not remediated, carried to RESIDUAL-REGISTER by 02-08. Declined the maximal "cover all five" stance to avoid over-stripping legitimate short chat/compare inputs; the coverage guard makes a later enrollment a one-line change.
- **Sanitize seam placement.** analyze-resume sanitizes `normalizedText` (the sole resume-text ingestion point; `promptParams` carries only derived metadata like wordCount/targetRole). analyze-career sanitizes the resume/LinkedIn content into `profileContent` in both paths, keeping the "Truncated inputs for speed" length comparison on the raw trimmed values so its logging behavior is unchanged.
- **XSS-guard self-reference handled** by allowlisting the guard file itself alongside chart.tsx (the guard necessarily contains the token in its assertion/comments).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `cross-env` is not on PATH in the bash shell; ran `DENO_TEST_SUPABASE_REMOTE=0 deno task test:ci` directly (identical env effect). No functional impact.

## User Setup Required
None - no external service configuration required. Nothing deploys; both guards run in `verify:baseline` locally/CI.

## Next Phase Readiness
- SEC-07 MEDIUM (analyze-resume + analyze-career) remediated and locked; SEC-04 sink locked; both guards in `verify:baseline` (SEC-14).
- **For 02-08 (phase closure):** carry the 3 low-traffic ingesters into `RESIDUAL-REGISTER.md` as a Low residual (clearance criterion: enroll into `_shared/sanitizer-coverage.test.ts` + add `sanitizeUserContent` if any moves to a high-traffic surface). Also still open from earlier plans: the 02-04 operator cron re-point (prod cron host `cimjltzovkahkqecpwgi` → `zjpjapgraoxdukdvpjes`).

---
*Phase: 02-security-audit-remediation*
*Completed: 2026-07-02*

## Self-Check: PASSED

- All 7 created/modified files verified present on disk.
- Both task commits (`949b761b`, `00d8eb23`) verified in git history.
- `_shared/sanitizer-coverage.test.ts` verified registered in `deno.json` `test:ci`.
- `deno task test:ci` 814/0/11; security vitest 18 passed.
