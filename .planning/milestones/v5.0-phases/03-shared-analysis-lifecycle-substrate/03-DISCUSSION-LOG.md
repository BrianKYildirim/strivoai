# Phase 3: Shared Analysis Lifecycle Substrate - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-02
**Phase:** 3-shared-analysis-lifecycle-substrate
**Areas discussed:** Reaper scope, Idempotency-key derivation, Retry execution model, Dormancy flag granularity, Realtime for subscribe-first, Re-run charge semantics

---

## Gray-area selection

All four presented gray areas were selected for discussion (operator chose all — consistent with
the Phase 2 maximal-thoroughness stance): Reaper scope, Idempotency-key derivation, Retry execution
model, Dormancy flag granularity. Two follow-ups (Realtime, Re-run charge semantics) were then added
to complete the substrate contract.

---

## Reaper scope

| Option | Description | Selected |
|--------|-------------|----------|
| Build it dormant now | Full reaper in Ph3: terminalize-stale transition + reservation-release RPC AND a scheduled sweep, armed but inert while no feature is live | ✓ |
| RPC now, arm cron later | Ship the RPC + ops query in Ph3, arm the sweep when the first feature goes live (Ph4/5) | |
| Defer entirely to Phase 5 | No reaper in the substrate; Phase 5 builds it when the stuck-state symptom is fixed | |

**User's choice:** Build it dormant now
**Notes:** Reuse existing pg_cron precedent + gateway `refundMeritsForJob` for reservation release; arming is operator-gated.

---

## Idempotency-key derivation

| Option | Description | Selected |
|--------|-------------|----------|
| Edge-derived intent hash | Server hashes user+feature+tier+input-identity+attempt-nonce; frontend sends a "new run" signal; edge computes the key | ✓ |
| Client UUID, stable per attempt | Frontend generates a UUID held across retries; deliberate new run mints a new UUID | |
| Hybrid client attempt-id + server hash | key = hash(client attemptId + server input identity) | |

**User's choice:** Edge-derived intent hash
**Notes:** Deterministic, tamper-resistant, cache-key-stable (never composed from save-mutated fields); consumes the `withMerits`→4-arg RPC seam already forwarded in Phase 2 (02-05). Per-feature input-identity source is a Ph4/5/6 concern; substrate defines the contract/shape.

---

## Retry execution model

| Option | Description | Selected |
|--------|-------------|----------|
| In-process backoff, persisted fallback | Retry transient errors in-process (bounded backoff); on exhaustion/death rest in retryable_failed for frontend Retry / reaper. Lifecycle row = single source of truth | ✓ |
| Persist + re-enqueue across invocations | No in-process loop; mark retryable_failed and let a worker/reaper re-pick | |
| In-process only, no cross-invocation retry | Bounded in-process retries; on exhaustion terminal, user-initiated Retry only | |

**User's choice:** In-process backoff, persisted fallback
**Notes:** Reuse `computeBackoffMs`; new states MAP INTO the existing `analysis_jobs` worker (no second state machine); transitions idempotent + monotonic. Permanent failures never auto-retried (LIFE-06).

---

## Dormancy flag granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Global kill-switch + per-feature | Master `ANALYSIS_LIFECYCLE_ENABLED` (default off) + per-feature flags; frontend hook gated by a VITE flag | ✓ |
| Single global flag only | One edge flag + one VITE flag; all features cut over together | |
| Per-feature flags only | Each feature its own flag; no master kill-switch | |

**User's choice:** Global kill-switch + per-feature
**Notes:** Mirrors `MERIT_SYSTEM_ENABLED` module-scope precedent; enables ascending-blast-radius per-feature rollout in Ph4/5/6 + a single incident-rollback lever.

---

## Realtime for subscribe-first (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Enable Realtime now, operator-gated | Add `analysis_jobs` to the realtime publication + realtime RLS in the same migration wave; subscribe-first genuinely works, poll is the true fallback | ✓ |
| Poll-first, subscribe as enhancement | Poller is the guaranteed path; subscribe silently falls back; defer enabling Realtime to Ph4 | |
| Poll-only now, subscribe stubbed | No Realtime this phase; hook polls only | |

**User's choice:** Enable Realtime now, operator-gated
**Notes:** Supabase Realtime is existing infra (not the excluded "new realtime service"); preview `cimjltzovkahkqecpwgi` is unpaused.

---

## Re-run charge semantics (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Charge per deliberate run; no cache in substrate | Every deliberate run charges; free identical-input reuse stays the existing precheck_cache / per-feature concern; accidental resubmit dedup via the idempotency key | ✓ |
| Substrate consults input-identity cache | Bake cache-reuse into the executor: identical input returns stored result free unless force-fresh | |
| Per-feature reuse-policy hook | Executor exposes a reuse-policy hook each feature sets | |

**User's choice:** Charge per deliberate run; no cache in substrate
**Notes:** Keeps the executor's Merit contract simple + honest; avoids coupling the substrate to caching + per-feature product rules (LIFE-05).

---

## Claude's Discretion

- Sub-ordering of the 5 plan sketches (03-01..03-05 is a starting point, not binding).
- Per-state max-age thresholds for the reaper.
- Hash algorithm + canonical serialization for the idempotency-key input-identity.
- Shape of the state-machine/idempotency/refund/retry/supersede test suite.
- Reaper sweep as pg_cron-invoked SQL function vs pg_cron-invoked internal edge endpoint.

## Deferred Ideas

- Per-feature adoption (thread input-identity, flip flags, feature-specific validation) → Ph4/5/6.
- Free identical-input cache-reuse in the Merit path → per-feature precheck_cache (Ph4/5/6).
- LinkedIn deterministic scoring / ~52 declustering (FEAT-03, VER-03) → Phase 4.
- Onboarding "Taking Longer" hang resolution (FEAT-01) → Phase 5.
- Dashboard intelligence reading stored data (DASH-01..06) → Phase 7.
