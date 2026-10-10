---
phase: 4
slug: dead-code-refactor-cleanup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-13
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> **Governing proof:** "the same `verify:baseline` that passed at Phase 1/2/3 still passes." This is a zero-functional-change deletion/correction phase — validation is *behavior-preservation*, not new-feature coverage. No new test files are authored; the existing baseline + audit + type-check/lint are the sampling instruments.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x (frontend) + Deno test (edge, offline) + Playwright (e2e) — the `verify:baseline` triad |
| **Config file** | `vitest.config.ts` · `supabase/functions/deno.json` · `playwright.config.ts` (all present — no install needed) |
| **Quick run command** | `npm run type-check && npm run test` (CLEAN-06 type gate + vitest behavior; fastest legs) |
| **Full suite command** | `npm run verify:baseline` (vitest && test:edge && test:e2e) + `npm run audit:deadcode` |
| **Estimated runtime** | quick ~30–60s · full ~3–5 min (Playwright dominates) |

> **Catalog instrument:** `npm run audit:deadcode` is a first-class validation signal here — after each removal cluster the dead-list must shrink by *exactly* the removed set with **no new entries**. `npm run lint` is the CLEAN-06 second gate (scope per the Open Question — see Manual-Only).

---

## Sampling Rate

- **After every task commit:** Run `npm run type-check && npm run test` (vitest). For an edge `_shared` removal, also `npm run test:edge`.
- **After every removal cluster / plan wave:** Run `npm run verify:baseline` (must be green BEFORE and AFTER — D-13) **and** `npm run audit:deadcode` (confirm dead-list shrank as expected, no new findings).
- **Before `/gsd:verify-work`:** Full `verify:baseline` green + `type-check` exit 0 + `lint` per agreed scope.
- **Max feedback latency:** ~60s for the per-task type+vitest signal; ~5 min for the per-cluster full baseline.

---

## Per-Task Verification Map

> Draft per-requirement/per-cluster map (plans not yet sliced — executor refines to per-task IDs). Every CLEAN-0x requirement has an automated observable signal; the only manual items are the two external operator gates + the one D-11 deviation decision (see Manual-Only).

| Cluster / Requirement | Wave | Requirement | Threat Ref | Secure / Preserved Behavior | Test Type | Automated Command | File Exists | Status |
|-----------------------|------|-------------|------------|------------------------------|-----------|-------------------|-------------|--------|
| 5-safe baseline removals (React + Deno pair) | 1 | CLEAN-02 | — | No routed page/edge entrypoint loses an importer; HowItWorks **page** kept | behavior | `npm run verify:baseline` exit 0 · `audit:deadcode` list −5 | ✅ existing | ⬜ pending |
| Lock-primitive surface (route + sandbox + primitives + ProFeatureBlur) | — | CLEAN-02 | — | `/dev/locked-sections` was DEV-gated; zero remaining importers post-route-delete | behavior | `npm run verify:baseline` exit 0 (vitest −co-located tests) | ✅ existing | ⬜ pending |
| IP superseded cluster (~10 components, full-path only) | — | CLEAN-02 | — | Live `InterviewPrep → QuizRunner` + `-analyze`/`-evaluate` + zod schemas untouched | behavior | `npm run verify:baseline` exit 0 · build green | ✅ existing | ⬜ pending |
| Deno `_shared` (errors+handler pair, resolve-tier collision, Ollama leg) | — | CLEAN-03 / CLEAN-04 | — | Deno reachable-set drops ONLY by removed modules; `document-extraction` mistral→textract chain intact | behavior | `npm run test:edge` exit 0 · `audit:deadcode` Deno reachability recomputed | ✅ existing | ⬜ pending |
| Unused-export prune + `AnalysisComparisonModal` consolidation + CLEAN-05 clutter | — | CLEAN-04 / CLEAN-05 | — | `pricing-config.ts` exports KEPT (cross-layer edge consumer); only comment/dead lines deleted | behavior | `npm run verify:baseline` exit 0 · `git diff` no logic lines | ✅ existing | ⬜ pending |
| `tsconfig` `ignoreDeprecations` fix + 14 source type fixes + `vitest/globals` config + lint scope | — | CLEAN-06 | — | Behavior-preserving type corrections only; **no new** `@ts-ignore`/`as any`/`eslint-disable` | source + behavior | `npm run type-check` exit 0 · `npm run lint` (agreed scope) · `git diff` zero new suppressions · `verify:baseline` green | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.* No new test files, fixtures, or framework installs — `verify:baseline`, `audit:deadcode`, `type-check`, and `lint` are all present and the regression net is already green (vitest 468/468 confirmed at HEAD; deno 284/0, Playwright 5+1skip per Phase 02/03 close).

> One CLEAN-06 in-scope correction touches test config (`vitest/globals` to close the ~109 test-globals-gap type errors). That is a **fix delivered by this phase**, not a Wave-0 prerequisite — it is verified by `type-check` exit 0, not by authoring new tests.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Ollama extraction leg liveness (D-07 operator gate) | CLEAN-03 | Live-prod fact, not knowable from repo | Operator checks prod for `OLLAMA_BASE_URL` presence AND extraction logs ever showing `provider:'ollama'`. Confirmed dead/unset → remove the leg (`ollama` entry in `_shared/document-extraction.ts` chain + `ollama-client.ts` + env reads). Not confirmable → DEFER to residual register with exact removal criteria. Never remove on unproven-dead. |
| `AuthCallback.tsx` Supabase redirect allow-list | CLEAN-02 | Supabase dashboard is external to repo | Repo-side already clear (no `/auth/callback` string; redirects go to `/`/`/auth`). Operator confirms no `/auth/callback` URL in the dashboard auth redirect allow-list before delete; else DEFER the row. |
| `SkillsGapAnalysis.tsx` Navbar — latent runtime bug (D-11 checkpoint) | CLEAN-06 | The "fix" is a **behavior change** (adds a missing import that changes a shipping runtime error) — zero-functional-change rule forbids silently applying it | Executor MUST surface as a deviation/checkpoint: either fix-with-explicit-acknowledgement OR track as a known error with reason. NOT silently changed, NOT suppressed. |

---

## Validation Sign-Off

- [ ] All clusters have an automated `verify:baseline` / `audit:deadcode` / `type-check` signal (or a listed Manual-Only operator gate)
- [ ] Sampling continuity: every removal cluster gated by `verify:baseline` green before AND after (D-13)
- [ ] Wave 0 covers all MISSING references *(none — existing infra suffices)*
- [ ] No watch-mode flags (`vitest run`, not `vitest`; `test:edge` offline `DENO_TEST_SUPABASE_REMOTE=0`)
- [ ] Feedback latency < ~60s (per-task type+vitest) / < ~5min (per-cluster full)
- [ ] `nyquist_compliant: true` set in frontmatter (at execution sign-off)

**Approval:** pending
