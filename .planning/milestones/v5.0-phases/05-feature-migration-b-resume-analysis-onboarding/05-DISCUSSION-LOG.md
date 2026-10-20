# Phase 5: Feature Migration B — Resume Analysis + Onboarding - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-05
**Phase:** 5-feature-migration-b-resume-analysis-onboarding
**Areas discussed:** Streaming lifecycle record, Onboarding hang fix + wait UX, Orphaned queue path scope, Preserve-exactly + duplicate guard

---

## Streaming lifecycle record (Resume Analysis)

| Option | Description | Selected |
|--------|-------------|----------|
| Full run at stream start | Create the lifecycle run at stream start, transition during streaming, settle on save; executor untouched, streaming mechanics/partial-render byte-preserved | ✓ |
| Lightweight alongside-record | A record that doesn't drive the stream (write completion only) | |
| Bend the executor into streaming | Make the LOCKED request/response executor streaming-aware | |

**User's choice:** Full run at stream start (executor contract untouched — streaming path orchestrates the lifecycle RPCs + `withMerits` seam + validation directly; non-streaming resume paths use the full executor).
**Notes:** Research (ARCHITECTURE.md L439) flagged this as the one deep-design spot. The SSE path today has no server record and no idempotency key (`analyze-resume/index.ts:728`). The persistent record also subsumes the never-wired 529→queue fallback (overload → `retryable_failed` → Retry).

## Onboarding hang fix + wait UX

| Option | Description | Selected |
|--------|-------------|----------|
| Full lifecycle + stay on results screen | `runAnalysisLifecycle('onboarding')` non-streaming + `useAnalysisRun` run-id recovery; honest progress + specific terminal failures; user stays on the results/progress screen and recovers on refresh/return | ✓ |
| Full lifecycle + proceed into app | Same, but the user can proceed into the app and the result lands/notifies later (adds a result-ready surfacing) | |
| Longer timeout / retry only | Extend the 120s frontend cap without persistence | |

**User's choice:** Full lifecycle + stay on results screen with run-id recovery.
**Notes:** Root cause is frontend abandonment (`Onboarding.tsx:372-382` fire-and-forget + navigate, 120s cap at `Results.tsx:609`), not a backend failure — Pitfall 4. Keep onboarding non-streaming (background analysis). Proceed-into-app-and-notify deferred as beyond the FEAT-01 root-cause fix.

## Orphaned queue path scope

| Option | Description | Selected |
|--------|-------------|----------|
| Leave dormant/untouched | Do not touch `submit/process-resume-analysis-job` (dead infra, zero `src/` callers); the streaming lifecycle record covers overload recovery | ✓ |
| Wire the 529→queue fallback | Implement the never-wired fallback as a real lifecycle-integrated path this phase | |
| Retire the dead endpoints | Remove the orphaned queue functions | |

**User's choice:** Leave dormant/untouched (documented as a deferred idea).
**Notes:** Not a cleanup milestone; reviving = large second path, retiring = Phase-8/cleanup territory. Both out of scope for Phase 5.

## Preserve-exactly boundary + duplicate guard (FEAT-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Byte-preserve success + strict-fail-only + two-layer dup guard + CORS re-proof | Preserve Free output/streaming/progress exactly; strict validation changes failure handling only; disable duplicates via atomic partial-unique index + frontend submit-lock; CORS re-proof apex+www | ✓ |

**User's choice:** As recommended.
**Notes:** Validation reconciliation is the one place preserve-exactly and strict-no-masking could collide — tune the resume semantic check so it never rejects a currently-valid success output. Duplicate guard replaces the WR-04 status-window TOCTOU (Pitfall 5). CORS is the Phase-1 apex-vs-www fix re-proven, not a new code fix.

---

## Claude's Discretion

- Stable input-identity hash + canonical serialization for Resume/Onboarding idempotency identity (never a save-mutated field).
- The exact shape of the streaming-aware lifecycle wrapper (where reserve/settle sits relative to the TransformStream; how the accumulated result is validated before save).
- Reconciling the executor's single-value `save` with `analyze-resume`'s triple-write (which write is authoritative-throws-pre-settle vs post-save best-effort).
- How the one `analyze-resume` endpoint distinguishes `resume` vs `onboarding` runs; how `useResumeStream` and `useAnalysisRun` coexist on the frontend.
- Plan sub-ordering (05-01 Onboarding → 05-02 Resume streaming record → 05-03 scenario coverage is a starting point, not binding).

## Deferred Ideas

- Proactive "proceed into the app + notify when ready" onboarding UX (overlaps Phase 7).
- Reviving the orphaned resume async queue as a real 529→queue fallback.
- Retiring the dead `submit/process-resume-analysis-job` endpoints (Phase 8 / hygiene pass).
- Career Compass full-pipeline migration (FEAT-05 → Phase 6).
- Dashboard intelligence reading stored resume data (DASH-01..06 → Phase 7).
- Any new Resume/Onboarding product capability (redesign, onboarding streaming, new output sections).
