---
phase: 3
slug: interview-prep-coach-frontend
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-11
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual browser verification (no unit test framework for CSS-only changes) |
| **Config file** | none — visual verification |
| **Quick run command** | `npm run build` |
| **Full suite command** | `npm run build && npm run lint` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build`
- **After every plan wave:** Run `npm run build && npm run lint`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | IPC-05 | — | N/A | build | `npm run build` | ✅ | ⬜ pending |
| 03-01-02 | 01 | 1 | IPC-05 | — | N/A | build | `npm run build` | ✅ | ⬜ pending |
| 03-01-03 | 01 | 1 | IPC-06 | — | N/A | build | `npm run build` | ✅ | ⬜ pending |
| 03-01-04 | 01 | 1 | IPC-07 | — | N/A | build | `npm run build` | ✅ | ⬜ pending |
| 03-01-05 | 01 | 1 | IPC-08 | — | N/A | build | `npm run build` | ✅ | ⬜ pending |
| 03-01-06 | 01 | 1 | IPC-11 | — | N/A | build | `npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Indigo color scheme renders correctly in light mode | IPC-05 | Visual verification — CSS classes cannot be tested with build alone | Open /interview-prep, run analysis, verify indigo badges in light mode |
| Indigo color scheme renders correctly in dark mode | IPC-05 | Visual verification — dark mode variant classes | Toggle dark mode, verify no color bleed or unstyled elements |
| Category filter shows only matching questions | IPC-06 | Interactive UI behavior | Click each category filter, verify only matching cards shown |
| Expand/collapse cards toggle correctly | IPC-07 | Interactive UI behavior | Click card header, verify content expands; click again, verify collapse |
| Copy STAR outline to clipboard | IPC-08 | Clipboard API requires browser context | Click copy button, paste in text editor, verify content matches |
| Content not obscured by navbar | IPC-11 | Visual layout verification | Scroll to top, verify no content hidden behind fixed navbar |

*All phase behaviors require manual browser verification as changes are CSS-only.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
