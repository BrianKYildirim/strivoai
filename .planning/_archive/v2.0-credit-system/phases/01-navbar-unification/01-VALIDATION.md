---
phase: 1
slug: navbar-unification
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-11
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (if installed) / manual browser verification |
| **Config file** | none — frontend component changes verified via build + lint |
| **Quick run command** | `npm run lint` |
| **Full suite command** | `npm run build && npm run lint` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run lint`
- **After every plan wave:** Run `npm run build && npm run lint`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | NAV-01 | — | N/A | build | `npm run build` | ✅ | ⬜ pending |
| 1-01-02 | 01 | 1 | NAV-02 | — | N/A | build | `npm run build` | ✅ | ⬜ pending |
| 1-01-03 | 01 | 1 | NAV-03 | — | N/A | build | `npm run build` | ✅ | ⬜ pending |
| 1-01-04 | 01 | 1 | NAV-04 | — | N/A | build | `npm run build` | ✅ | ⬜ pending |
| 1-01-05 | 01 | 1 | NAV-05 | — | N/A | build | `npm run build` | ✅ | ⬜ pending |
| 1-01-06 | 01 | 1 | NAV-06 | — | N/A | build | `npm run build` | ✅ | ⬜ pending |
| 1-01-07 | 01 | 1 | NAV-07 | — | N/A | build | `npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Identical navbar layout across all pages | NAV-01 | Visual consistency requires browser inspection | Navigate between 5+ pages, compare navbar layout |
| Dark/light mode toggle works | NAV-03 | Visual theme verification | Toggle theme on 3 different pages, verify no color bleed |
| Mobile hamburger menu | NAV-05 | Responsive behavior requires viewport resize | Resize to <1024px, verify hamburger appears with all links |
| Active page indicator | NAV-04 | Visual indicator verification | Navigate to each feature, verify underline on correct link |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
