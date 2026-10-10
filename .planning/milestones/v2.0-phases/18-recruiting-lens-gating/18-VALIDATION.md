---
phase: 18
slug: recruiting-lens-gating
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Deno test (edge functions) / vitest (frontend) |
| **Config file** | `supabase/functions/deno.json` / `vite.config.ts` |
| **Quick run command** | `deno test supabase/functions/_shared/recruiting-lens-merger.test.ts` |
| **Full suite command** | `deno test supabase/functions/ --allow-env --allow-read` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | RCL-01 | — | Free users blocked at gate | integration | manual | — | ⬜ pending |
| TBD | TBD | TBD | RCL-02 | — | Pro sees allowed fields only | unit | `deno test` | — | ⬜ pending |
| TBD | TBD | TBD | RCL-03 | — | Pro cannot see Elite fields | unit | `deno test` | — | ⬜ pending |
| TBD | TBD | TBD | RCL-04 | — | Elite sees full output | unit | `deno test` | — | ⬜ pending |
| TBD | TBD | TBD | RCL-05 | — | Merit deduction correct | unit | `deno test` | — | ⬜ pending |
| TBD | TBD | TBD | RCL-06 | — | Auto-resume loads | integration | manual | — | ⬜ pending |
| TBD | TBD | TBD | BACK-11 | — | Backend tier enforcement | unit | `deno test` | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `supabase/functions/_shared/recruiting-lens-merger.test.ts` — unit tests for applyRecruitingLensTierShape
- [ ] Existing test infrastructure covers remaining phase requirements

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Free user sees ProFeatureGate | RCL-01 | Frontend rendering behavior | Navigate to Recruiting Lens as Free user, verify gate renders |
| Pro locked sections render correctly | RCL-02/03 | Frontend visual verification | Analyze as Pro, verify LockedSection/LockedListItem render |
| Auto-resume pre-fills textarea | RCL-06 | Frontend mount behavior | Navigate to Recruiting Lens with prior analysis, verify pre-fill |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
