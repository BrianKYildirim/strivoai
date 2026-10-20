---
phase: 17
slug: career-compass-gating
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (frontend) / deno test (edge functions) |
| **Config file** | `vite.config.ts` (vitest) / `supabase/functions/deno.json` (deno) |
| **Quick run command** | `npm run test` |
| **Full suite command** | `npm run test && powershell ./scripts/run-edge-tests.ps1` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test`
- **After every plan wave:** Run `npm run test && powershell ./scripts/run-edge-tests.ps1`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | CC-01 | — | Free tier output shape enforced | unit | `npm run test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | CC-02 | — | Free tier fields omitted | unit | `npm run test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | CC-03 | — | Pro tier output shape correct | unit | `npm run test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | CC-04 | — | Elite tier output complete | unit | `npm run test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | CC-05 | — | maxTokens enforced per tier | unit | `npm run test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | BACK-10 | T-17-01 | Server-side tier resolution | unit | `npm run test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Tier shaping unit tests for career-specific `applyTierShape` rules
- [ ] Server-side tier resolution test (no client-supplied tier trusted)
- [ ] maxTokens enforcement test per tier

*Existing vitest and deno test infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end Career Compass analysis for each tier | CC-01..CC-04 | Requires live Anthropic API + Supabase auth | Upload resume, trigger analysis as Free/Pro/Elite user, verify output fields |
| Dashboard save for Elite | CC-04 | Requires authenticated Elite session | Run Elite analysis, verify result appears in dashboard |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
