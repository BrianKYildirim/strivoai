---
phase: 49-fix-production-homepage-crash-referenceerror-zap-is-not-defi
plan: 01
subsystem: frontend-navigation
tags: [regression-fix, production-crash, lucide-react, type-check, tooling]
requires: []
provides:
  - "Navbar.tsx with Zap restored to lucide-react import"
  - "TopBar.tsx with Zap restored to lucide-react import"
  - "type-check npm script (authoritative undefined-identifier gate)"
  - "tsconfig.app.json parseable under TypeScript 5.9.3"
affects:
  - src/components/Navbar.tsx
  - src/components/TopBar.tsx
  - tsconfig.app.json
  - package.json
tech-stack:
  added: []
  patterns:
    - "tsc --noEmit as the only type-level regression gate (vite/esbuild never type-checks; ESLint disables no-undef for TS)"
key-files:
  created: []
  modified:
    - src/components/Navbar.tsx
    - src/components/TopBar.tsx
    - tsconfig.app.json
    - package.json
decisions:
  - "ignoreDeprecations set to '5.0' (was '6.0', rejected as TS5103 by installed TypeScript 5.9.3) — restores intended deprecation suppression and makes tsc parse"
  - "Tier-3 smoke taken via type-check + build proof, not an added render test — Navbar render test requires a non-existent supabase/router/theme/credits provider mock harness (out of scope per plan)"
metrics:
  duration: "~15 min"
  tasks: 3
  files: 4
  completed: "2026-06-05"
---

# Phase 49 Plan 01: Restore Zap Import + Type-Check Gate Summary

Restored the `Zap` lucide-react import to `Navbar.tsx` and `TopBar.tsx` (dropped in Phase 48 commit 58cbe85 while five `<Zap />` JSX usages remained), eliminating the `ReferenceError: Zap is not defined` that tripped the `HomepageErrorBoundary` on strivoai.net for logged-in users — and added the `type-check` npm script (the regression gate the project lacked).

## What Was Done

### Task 1 — Restore Zap import (commit 872df3d)
- `src/components/Navbar.tsx` line 3: added `Zap` to the existing `lucide-react` named import (4 `<Zap />` JSX usages at lines 517/544/606/633 left intact).
- `src/components/TopBar.tsx` line 3: added `Zap` to the existing `lucide-react` named import (1 `<Zap />` JSX usage at line 207 left intact).
- Single import statement per file; no JSX touched. Verified via regex `import \{[^}]*\bZap\b[^}]*\} from "lucide-react"` matching both files, and `<Zap className=` counts unchanged (Navbar 4, TopBar 1).

### Task 2 — tsconfig fix + type-check gate (commit 1c64664)
- `tsconfig.app.json` line 5: `ignoreDeprecations` `"6.0"` → `"5.0"`. TypeScript 5.9.3 (installed) rejects `"6.0"` with `error TS5103`, which aborted `tsc` at config load — so the project had no working type-check at all. `"5.0"` is accepted and matches the evident intent (suppress 5.x deprecation warnings).
- `package.json` scripts: added `"type-check": "tsc -p tsconfig.app.json --noEmit"`. All eight pre-existing scripts (`dev`, `build`, `build:dev`, `lint`, `preview`, `test`, `test:watch`, `test:adversarial`) unchanged.

### Task 3 — Three-tier verification (verified; no code change)
- **Tier 1 (authoritative) — `npm run type-check`:** `Cannot find name 'Zap'` count = **0** (was 5 before the fix). `TS5103` count = **0** (config now parses). Total `error TS` count = **19** — these are the documented PRE-EXISTING unrelated errors (PriorAnalysisSelector, CareerCompass, Dashboard, several test files), explicitly out of scope; the non-zero overall exit is expected and is NOT a phase failure. The Zap-scoped gate passes.
- **Tier 2 — `npm run build`:** exits **0** in ~6.3s. Only chunk-size / plugin-timing warnings (pre-existing), no errors.
- **Tier 3 — homepage render smoke (documented manual/static path):** Confirmed the render path in `src/components/HomepageRouter.tsx`: logged-out users render `<Navbar />` unconditionally; logged-in users render `DashboardLayout` → `TopBar`. Both reference `<Zap />`. With `Zap` now a defined binding in each module (Tier 1 proof) and a clean production build (Tier 2), the JSX usages resolve to a valid imported identifier and can no longer throw `ReferenceError: Zap is not defined` at render — so the `HomepageErrorBoundary` "Something went wrong / Please refresh" fallback no longer triggers for a logged-in free-tier user, and the `Zap` credit icon + amber "Upgrade Plan" link render. A live `npm run preview` visual click-through remains available to the operator as confirmation, but the authoritative proof is the Tier-1 type-check (an added Navbar render test was declined: it requires a non-existent supabase/router/theme/credits provider mock harness, explicitly out of scope per the plan).

## Deviations from Plan

None — plan executed exactly as written. Tier-3 took the plan-sanctioned manual/static path (not an added render test) for the documented scope reason above.

## Follow-on Notes (recommended, out of scope here)

1. **Wire `npm run type-check` into the deploy pipeline as a pre-deploy gate** — add it to `scripts/deploy-production.ps1`, `scripts/deploy-staging.ps1`, and/or CI so a Zap-class undefined-identifier regression cannot ship again. (Note: the script currently exits non-zero due to the 19 pre-existing errors, so a CI gate should scope to "no NEW errors" or block only after item 2 below clears them.)
2. **Separate cleanup phase for the 19 pre-existing project-wide type errors** now surfaced by the working type-check (PriorAnalysisSelector, CareerCompass, Dashboard, test files). Clearing these unblocks a strict zero-error pre-deploy gate.

## Self-Check: PASSED

- src/components/Navbar.tsx — Zap in lucide-react import: FOUND
- src/components/TopBar.tsx — Zap in lucide-react import: FOUND
- tsconfig.app.json — ignoreDeprecations "5.0": FOUND
- package.json — type-check script: FOUND
- Commit 872df3d (Task 1): FOUND
- Commit 1c64664 (Task 2): FOUND
- Tier-1 `Cannot find name 'Zap'` count: 0
- Tier-2 build exit: 0
