# Phase 6: Dependency Hygiene - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-19
**Phase:** 6-dependency-hygiene
**Areas discussed:** Major-bump appetite, Vulnerability remediation (DEP-04), Deno consolidation, Validation & rollback (NFR-02)

---

## Major-bump appetite (DEP-03)

### Q1 — How aggressive should the major-version bumps be under zero-functional-change?

| Option | Description | Selected |
|--------|-------------|----------|
| Risk-tiered (defer frameworks) | Take the ~17 contained majors now (each gated); defer migration-grade framework majors (React 18→19 + @types/react/react-dom, Tailwind 3→4, Zod 3→4, TS 5→6, react-router 6→7) as documented/gated for a dedicated migration milestone. | ✓ |
| All majors this phase | Bump everything to latest incl. React 19 / Tailwind 4 / Zod 4 / TS 6; each gated by verify:baseline + manual smoke. Max currency, highest regression risk. | |
| Security/blocking only | Only take majors required to clear a vuln or unblock another change; defer all others. Smallest blast radius; under-delivers DEP-03. | |

**User's choice:** Risk-tiered (defer frameworks)
**Notes:** Framework majors are migrations, not bumps — they conflict with zero-functional-change and the verify:baseline net can't prove no behavior change across them. → CONTEXT D-01.

### Q2 — How to handle the behavioral-surface contained majors vs the mechanical/devDep ones?

| Option | Description | Selected |
|--------|-------------|----------|
| Take all, extra smoke on behavioral | Take every contained major; behavioral-surface (recharts, date-fns, react-day-picker, lucide) get a targeted manual smoke ON TOP of verify:baseline; mechanical/devDep ride the baseline alone. | ✓ |
| Promote behavioral to deferred | Move recharts/date-fns/react-day-picker/lucide into the deferred bucket too; take only mechanical/devDep/internal majors. Most conservative. | |
| Planner classifies per rule | Give the planner the rule (defer if changelog flags breaking runtime/visual behavior with no codemod; take if types/build/internal-only) and apply per-package. | |

**User's choice:** Take all, extra smoke on behavioral
**Notes:** Captures a clear per-package classification rule for the planner. → CONTEXT D-02.

---

## Vulnerability remediation (DEP-04)

### Q1 — How to handle the 4 dev-only transitive highs alongside the easy wins?

| Option | Description | Selected |
|--------|-------------|----------|
| Fix easy wins, accept dev residue | Take react-router-dom in-6.x patch (prod) + promptfoo 0.120.19 (clears 3 moderate) + clean npm audit fix; formally accept the remaining dev-only transitive highs with documented rationale (off-gate, zero prod exposure). | ✓ |
| Force-fix to zero | `npm audit fix --force` to drive all 9 to zero, accepting a possible promptfoo major + dev-toolchain churn; re-validate adversarial suites. | |
| Prod-runtime only | Fix only react-router-dom; accept the entire promptfoo dev tree (incl. skipping the cheap promptfoo bump) with rationale. | |

**User's choice:** Fix easy wins, accept dev residue
**Notes:** The 4 highs are all transitive under promptfoo's subtree, dev/test-only, off the verify:baseline gate, with zero production-runtime exposure. DEP-04 explicitly allows documented accepted-risk. → CONTEXT D-03.

---

## Deno consolidation (DEP-03 Deno side + DEP-05)

### Q1 — How far should the Deno/edge dependency work go?

| Option | Description | Selected |
|--------|-------------|----------|
| Lockfile-reconcile + defer consolidation | Regenerate root deno.lock + package-lock for reproducible installs (DEP-05 core); take only low-risk/necessary edge changes; defer std-version + zod-style consolidation across the 27 live functions as documented/gated finding. | ✓ |
| Full consolidation now | Introduce a central deno.json import map, pin one std version, normalize zod, regenerate — touching every edge function; staging deploy-smoke per function. Largest, riskiest scope. | |
| Import map only, std/zod next | Introduce the import map + single std pin (deploy-smoke per fn), leave zod split alone. Middle path. | |

**User's choice:** Lockfile-reconcile + defer consolidation
**Notes:** Offline deno test:ci runs --no-check and won't catch an http/server API change; the only real proof is a per-function staging deploy-smoke across 27+ live payment/AI/webhook functions — out of proportion to a currency win under zero-functional-change. → CONTEXT D-04.

---

## Validation & rollback (NFR-02)

### Q1 — How should per-change validation + rollback be structured?

| Option | Description | Selected |
|--------|-------------|----------|
| Atomic per-major + bump ledger | Each major (or coupled set) = its own commit, verify:baseline green recorded, commit SHA = rollback unit; a phase ledger records package/from→to/validation evidence/revert SHA/status; minors+patches batched. | ✓ |
| Batched-by-theme, coarser rollback | Group bumps into a few thematic commits, each gated; rollback = revert the batch commit. Fewer commits, per-batch rollback granularity. | |
| Planner sets slicing | Capture the principle (every major individually gated + revertible, documented rollback) and let the planner decide exact slicing + ledger format. | |

**User's choice:** Atomic per-major + bump ledger
**Notes:** Cleanest mapping to NFR-02 "individually validated + rollback path"; the commit SHA is the rollback unit. → CONTEXT D-07.

---

## Claude's Discretion

* Exact plan/commit slicing, bump-ledger filename + format, per-package contained-vs-defer classification mechanics, the precise in-6.x react-router-dom target, the reproducible-install command form, and the `@hookform/resolvers` 3→5 zod-3 peer check — left to research + planning.

## Deferred Ideas

* Framework-grade major migrations (React 19, Tailwind 4, Zod 4, TS 6, react-router 7) — dedicated future migration milestone.
* Deno std-version unification + zod import-style normalization across the 27+ live edge functions — documented/gated finding (closer to Phase 9).
* Dev-only transitive vuln highs (axios/esbuild/tsx/ibm-cloud-sdk-core under promptfoo) — formally accepted-with-rationale this phase.
* `ws` override pin (8.20.1) — left as-is.
