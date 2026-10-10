---
phase: 05
slug: linkedin-grader-frontend
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-12
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Deno test (edge functions); no frontend test runner |
| **Config file** | `supabase/functions/deno.json` |
| **Quick run command** | `npm run lint` (frontend) / `deno test supabase/functions/grade-linkedin/` (backend) |
| **Full suite command** | `npm run lint && npm run build && deno test supabase/functions/grade-linkedin/` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run lint` (frontend tasks) OR `deno test supabase/functions/grade-linkedin/` (backend tasks)
- **After every plan wave:** Run `npm run lint && npm run build`
- **Before `/gsd-verify-work`:** Full suite must be green + manual browser smoke of LinkedInGrader page
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

Filled in by planner. Each task must have either an `<automated>` verify command or explicit Wave 0 test dependency.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | LIG-08/09/13 | — | N/A | build | `npm run build` | ✅ | ⬜ pending |
| TBD | TBD | TBD | LIG-11 | T-05-01 | Free scan bypass must not reintroduce TOCTOU | unit | `deno test supabase/functions/grade-linkedin/` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `supabase/functions/grade-linkedin/entitlement.test.ts` — test harness for free-scan branch (zero rows in cycle → skip usage decrement; non-zero → record usage)
- [ ] Existing `grade-linkedin` test file extended with fixtures for `linkedin_grades` cycle-count query

*No frontend test runner exists in this repo — LIG-08/09/13 rendering checks are covered by TypeScript build (`npm run build`) + manual browser smoke.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| v3.0 result rendering (score circle, section grid, topFixes, profileInsights, rewrites) | LIG-08, LIG-09, LIG-13 | No frontend test runner | Load `/linkedin-grader` as Pro user, run a scan, visually verify all blocks render without NaN/blank states |
| Free-scan helper text under Analyze button | LIG-11 | UX signal only | As Pro user with 0 scans this cycle, verify "Free scan available this cycle" appears; after 1 scan, verify it flips to "This will use 1 AI credit" |
| Comparison modal v3.0 data | LIG-08/09 | Visual comparison | Open AnalysisComparisonModal from LinkedIn results → verify sectionBreakdown/topFixes/rewrites/profileInsights render correctly; confirm resume-analysis modal still works |
| Legacy cache ignored on mount (D-03) | — | DB state dependent | Load page with a pre-v3.0 row in `linkedin_grades` → verify input form shows (not cached result) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (entitlement test)
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
