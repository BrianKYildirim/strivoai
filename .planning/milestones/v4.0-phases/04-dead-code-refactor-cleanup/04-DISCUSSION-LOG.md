# Phase 4: Dead Code & Refactor Cleanup - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-13
**Phase:** 4-dead-code-refactor-cleanup
**Areas discussed:** Cleanup risk posture, Interview Prep cluster, Obsolete Ollama path, Type-error backlog

---

## Cleanup risk posture

| Option | Description | Selected |
|--------|-------------|----------|
| Investigate-and-clear all | Attempt to resolve EVERY needs-investigation row; clear the signal, remove what clears, document what can't. Largest diff; each removal still proven by baseline. | ✓ |
| Tiered: easy wins now | Clear low-risk rows; leave genuinely ambiguous ones documented for later. Moderate diff, lowest residual risk. | |
| Confirmed-safe only | Remove just the 5 safe rows + obvious cheap clears; defer the rest. Smallest diff/risk. | |

**User's choice:** Investigate-and-clear all
**Notes:** Maximal-cleanup posture chosen; the larger diff is the point of the phase. Every removal remains gated by `verify:baseline` + KEEP-LIST + the multi-signal bar.

---

## Lock primitives (follow-up within risk posture)

| Option | Description | Selected |
|--------|-------------|----------|
| Remove the whole surface | Delete /dev/locked-sections route + LockedSection/LockedListItem + ProFeatureBlur + co-located tests. Sectional locking abandoned. | ✓ |
| Keep primitives, drop ProFeatureBlur | Keep LockedSection/LockedListItem + sandbox as the intended future primitive; remove only deprecated ProFeatureBlur. | |
| Keep all, document only | Leave sandbox + all primitives untouched; just record them. | |

**User's choice:** Remove the whole surface
**Notes:** Treated as abandoned/superseded. After the sandbox route is gone the primitives have zero reachable references, so removal is behavior-preserving.

---

## Interview Prep cluster

| Option | Description | Selected |
|--------|-------------|----------|
| Remove superseded cluster | Remove the ~10 old components + tests AFTER confirming the live InterviewPrep→QuizRunner path never imports them and no flag variant re-activates the old quiz. | ✓ |
| Preserve whole gated surface | Keep ALL Interview Prep components untouched because the feature is being revived later. Document dead cluster as deferred. | |
| Remove safe leaves only | Remove zero-risk leaves; keep anything with slight ambiguity. Middle ground. | |

**User's choice:** Remove superseded cluster
**Notes:** The re-enable milestone revives the CURRENT QuizRunner feature, not the old components. Hard preconditions recorded (D-05): live path clear, no flag variant, tests removed together; never touch `-analyze`/`-evaluate` or the zod schemas.

---

## Obsolete Ollama path

| Option | Description | Selected |
|--------|-------------|----------|
| Operator-confirm, then remove | Operator checks prod (OLLAMA_BASE_URL + logs); remove the leg if confirmed dead, else auto-fall back to document-and-defer. Matches conditional-removal rule. | ✓ |
| Document-as-gated, defer | Don't touch it; record as obsolete-but-unproven with removal criteria; defer. Zero risk. | |
| Remove now regardless | Treat Phase 50→51 supersession as sufficient and remove without a prod check. Not recommended. | |

**User's choice:** Operator-confirm, then remove
**Notes:** Mirrors Phase 3 D-10 operator-gated prod check. Repo-side verdict recorded; live-prod fact is the operator step. Never remove on unproven-dead evidence.

---

## Type-error backlog

| Option | Description | Selected |
|--------|-------------|----------|
| Fix behavior-safe, track the rest | Resolve provably behavior-preserving errors; track latent-bug ones with reason + flag for a future debug pass. | |
| Fix all 19 | Drive type-check fully clean; make any required logic change carefully behind the baseline. Most thorough. | ✓ |
| Fix cheap, track the rest | Fix trivial ones only; track the remainder. | |

**User's choice:** Fix all 19
**Notes:** No new suppressions (hard rule). Zero-functional-change override (D-11): if a proper fix would change runtime behavior, surface it as a deviation/checkpoint rather than silently changing behavior or masking with a suppression.

---

## Claude's Discretion

- Plan/commit slicing (e.g. one plan per domain), order of removals, format of the "documented-but-not-removed" residual register, and CLEAN-05 clutter-removal scope (preserve load-bearing "why" comments / real-obligation TODOs).
- Unused-export pruning depth (D-09): prune on live files only where the multi-signal gate clears; keep public-API/parity exports, shadcn `ui/**` parity, gated IP zod schemas, deliberate test seams.

## Deferred Ideas

- `usage_tracking` retirement + Paddle removals → Phase 8 (DB-04, gated).
- Dependency pruning/bumps → Phase 6. Env consolidation → Phase 7. Perf refactors + measurement → Phase 9.
- Dead CSS / static-asset audit → optional fold into CLEAN-05, else future pass.
- CI enforcement of the audit → out of scope.
- Re-fixing latent bugs revealed by type errors → `/gsd-debug` / future pass, not a silent behavior change here.
