# Phase 03 — Deferred items (out of scope for the plan that found them)

Discoveries that are real but are NOT owned by the plan that tripped over them. Per the
executor scope boundary: log, do not fix.

---

## DF-01 — `responsive-source-guard.test.ts` is RED at HEAD for `src/components/BelowFold.tsx`

| Field | Value |
| ----- | ----- |
| **Found during** | plan **03-11**, Task 3 (full `npm run test` run) |
| **Symptom** | `src/test/platform/responsive-source-guard.test.ts:208` fails with offender list `["src/components/BelowFold.tsx"]` — the file runs a framer-motion infinite animation without branching on `useReducedMotion()`. |
| **Pre-existing?** | **Yes.** Confirmed by stashing every 03-11 change and re-running the single spec at HEAD: identical failure. Plan 03-11 touches no file the guard inspects for this rule. |
| **Owner** | The responsive/motion contract is plan **03-10**'s (UI-SPEC F6, XDEV-09). `BelowFold.tsx` is not in 03-11's `files_modified` and fixing it here would be an unrelated behaviour change on the marketing surface. |
| **Action** | Left untouched. Raise with 03-10 / the 03-19 closeout audit. |

*Opened by plan 03-11 · 2026-07-28*
