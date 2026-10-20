---
phase: 34
slug: celebrations-light-dark-polish
status: passed
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-01
validated: 2026-06-01
requirements: [CELEB-01, CELEB-02, CELEB-03]
source:
  - 34-01-PLAN.md
  - 34-01-SUMMARY.md
  - 34-VERIFICATION.md
---

# Phase 34 - Validation Strategy

Per-phase validation contract for Nyquist coverage on `/celebrations` light/dark polish.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x + ESLint 9 |
| **Config file** | Vite/Vitest defaults via `vite.config.ts`; ESLint via `eslint.config.js` |
| **Quick run command** | `npx.cmd vitest run src/pages/__tests__/celebrations-token-guard.test.ts` |
| **Full suite command** | `npx.cmd eslint src/pages/Celebrations.tsx src/pages/__tests__/celebrations-token-guard.test.ts` |
| **Estimated runtime** | ~6 seconds for scoped validation |

---

## Sampling Rate

- **After every task commit:** Run `npx.cmd vitest run src/pages/__tests__/celebrations-token-guard.test.ts`
- **After every plan wave:** Run scoped Vitest and scoped ESLint for the phase files
- **Before `$gsd-verify-work`:** Scoped Vitest, scoped ESLint, forbidden-token grep, build, and light/dark visual smoke must be green
- **Max feedback latency:** ~10 seconds for scoped checks

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 34-01-01 | 01 | 1 | CELEB-01 | - | `/celebrations` uses semantic theme tokens with no legacy black/white glass classes | static source guard + grep | `npx.cmd vitest run src/pages/__tests__/celebrations-token-guard.test.ts`; `rg -n "bg-black\|text-white\|bg-white/\|border-white/\|backdrop-blur-xl" src/pages/Celebrations.tsx` | yes | green |
| 34-01-01 | 01 | 1 | CELEB-02 | - | Light/dark readability invariants stay anchored to semantic text tokens, theme-aware gradient stops, primary accents, and dimmer light-mode ambient glows | static source guard + visual smoke evidence | `npx.cmd vitest run src/pages/__tests__/celebrations-token-guard.test.ts` | yes | green |
| 34-01-02 | 01 | 1 | CELEB-03 | - | Audio player, letter surface, and action tiles keep Card primitive adoption, primary CTA treatment, and Link navigation | static source guard | `npx.cmd vitest run src/pages/__tests__/celebrations-token-guard.test.ts` | yes | green |
| 34-01-03 | 01 | 1 | CELEB-01, CELEB-02, CELEB-03 | - | Rendered light/dark page preserves parity, readable surfaces, action navigation, audio play state, and delayed sections | Playwright smoke + human checkpoint | Recorded in `34-VERIFICATION.md` and `34-01-SUMMARY.md` | yes | green |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

All phase behaviors have automated verification. The original human light/dark checkpoint remains supporting visual evidence for CELEB-02, but the repeatable CELEB-02 source guard now blocks the specific theme/readability regressions introduced by this phase.

---

## Validation Audit 2026-06-01

| Metric | Count |
|--------|-------|
| Gaps found | 1 |
| Resolved | 1 |
| Escalated | 0 |

### Gap Resolution

- **CELEB-02:** Added repeatable assertions to `src/pages/__tests__/celebrations-token-guard.test.ts` for light and dark gradient parity, semantic text-token usage without opacity-reduced text hacks, primary CTA/audio/action accents, light-vs-dark ambient glow strength, focus treatment, card surfaces, and navigation preservation.

### Commands Run

- `npx.cmd vitest run src/pages/__tests__/celebrations-token-guard.test.ts` - passed, 13 tests.
- `npx.cmd eslint src/pages/Celebrations.tsx src/pages/__tests__/celebrations-token-guard.test.ts` - passed.

### Known Boundary

- `npm run lint` was already documented as globally noisy because ESLint traverses existing `.claude/worktrees/...` snapshots with unrelated lint errors. Phase 34 validation uses the scoped ESLint command above.

---

## Validation Re-Audit 2026-06-01

Re-verification pass: confirmed every requirement's automated coverage still runs green and committed the previously uncommitted CELEB-02 parity assertions.

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

### Commands Run

- `npx.cmd vitest run src/pages/__tests__/celebrations-token-guard.test.ts` — passed, 13/13 tests green.
- `rg -n "bg-black|text-white|bg-white/|border-white/|backdrop-blur-xl" src/pages/Celebrations.tsx` — no matches.

### Note

- The CELEB-02 parity assertions (103 lines) added by the prior audit were still uncommitted in the working tree; this pass commits them so the Nyquist coverage matches the recorded validation contract.

---

## Validation Sign-Off

- [x] All tasks have automated verify coverage
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all missing references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-01
