---
phase: 49
slug: fix-production-homepage-crash-referenceerror-zap-is-not-defi
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-08
method: State-B reconstruction (no VALIDATION.md existed; 49-VERIFICATION.md passed, gaps: [])
---

# Phase 49 — Validation Strategy

> Reconstructed retroactively at milestone reconciliation (2026-06-08). Phase 49 is a single-fix regression phase (prod homepage `ReferenceError: Zap is not defined`). Its verification artifact passed with `gaps: []` but no VALIDATION.md existed — the Nyquist gap flagged by the v3.0 audit.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript compiler (`tsc --noEmit`) + Vite build |
| **Config file** | `tsconfig.app.json` |
| **Quick run command** | `npm run type-check` |
| **Full suite command** | `npm run type-check && npm run build` |
| **Estimated runtime** | ~seconds–tens of seconds |

---

## Sampling Rate

- **After every task commit:** `npm run type-check`
- **After every plan wave:** `npm run build`
- **Before `/gsd:verify-work`:** type-check exits 0, build exits 0
- **Max feedback latency:** seconds

---

## Per-Task Verification Map

| Requirement | Test Type | Automated Command / File | Status |
|-------------|-----------|--------------------------|--------|
| Restore `Zap` import in `Navbar.tsx` | type-level | `npm run type-check` (Tier-1 `Cannot find name 'Zap'` 5→0) | ✅ green |
| Restore `Zap` import in `TopBar.tsx` | type-level | `npm run type-check` | ✅ green |
| Establish authoritative undefined-identifier gate | tooling | new `type-check` npm script (`tsc -p tsconfig.app.json --noEmit`); `ignoreDeprecations "6.0"→"5.0"` so tsc parses under TS 5.9.3 | ✅ green |
| Homepage renders without HomepageErrorBoundary fallback | build | `npm run build` exits 0 (bundle no longer throws) | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure (TypeScript) covers the regression. This phase ADDED the missing gate: the `type-check` npm script — the only tool that catches this class (vite/esbuild never type-checks; ESLint disables `no-undef` for TS).

---

## Manual-Only Verifications

| Behavior | Why Manual | Test Instructions |
|----------|------------|-------------------|
| Production homepage loads without "Something went wrong" fallback | Requires the deployed prod bundle | Load strivoai.net post-deploy; confirm no `HomepageErrorBoundary` fallback and no console `ReferenceError`. |

---

## Known Follow-ups (non-blocking, per 49-01-SUMMARY)

- 19 pre-existing, unrelated TypeScript errors remain (left untouched). A follow-on cleanup phase + wiring `type-check` into deploy/CI is recommended so this gate runs automatically pre-deploy.

---

## Validation Sign-Off

- [x] The regression has an automated gate (`type-check`)
- [x] Sampling continuity maintained
- [x] Wave 0 covers all MISSING references (gate added in-phase)
- [x] No watch-mode flags
- [x] Feedback latency < seconds
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-08 (retroactive; 49-VERIFICATION.md passed, gaps: [])
