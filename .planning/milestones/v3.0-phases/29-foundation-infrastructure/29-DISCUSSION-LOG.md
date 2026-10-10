# Phase 29: Foundation Infrastructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-12
**Phase:** 29-foundation-infrastructure
**Areas discussed:** Cache-key scoping + RLS shape, Cache-write timing post-response, Idempotency key strategy for MER-04, Cache-hit Activity History contract

---

## Cache-key scoping + RLS shape

### Q1: How should user-scoping be enforced on `analysis_cache`?

| Option | Description | Selected |
|--------|-------------|----------|
| user_id IN cache_key | SHA-256(user_id || feature || tier || variant || input_hashes). Cross-user reads structurally impossible. RLS becomes defense-in-depth. | ✓ |
| RLS predicate only | cache_key omits user_id; UNIQUE on (cache_key, user_id); RLS enforces auth.uid() match. | |
| Both — user_id in key AND in RLS | Belt + suspenders; two-column UNIQUE. | |

### Q2: What columns get a UNIQUE/index?

| Option | Description | Selected |
|--------|-------------|----------|
| UNIQUE(cache_key) only | Single UNIQUE btree; O(log n) lookup; matches NFR-02 <100ms p95. | ✓ |
| UNIQUE(cache_key, user_id) composite | Pairs with RLS-only option. | |
| UNIQUE(cache_key) + idx(user_id, last_hit_at DESC) | Adds secondary index for future per-user telemetry. | |

### Q3: Should the RLS policy match the v2.0 `analysis_results` MIG-02 lock?

| Option | Description | Selected |
|--------|-------------|----------|
| Match MIG-02 exactly | RLS SELECT where user_id=auth.uid(); no user INSERT/UPDATE/DELETE; service role writes. | ✓ |
| Service role only — no user SELECT | Frontend never reads cache directly. | |
| User SELECT + user DELETE (self-cleanup) | Anticipates per-user cache invalidation UI. | |

### Q4: How is the cache lookup integrated with `withMerits`?

| Option | Description | Selected |
|--------|-------------|----------|
| Optional precheck_cache callback on withMerits | Gateway runs precheck BEFORE rate-limit + deduct; short-circuits on hit. | ✓ |
| Feature-level pre-check, gateway untouched | Each feature calls lookupCache() before withMerits. | |
| Wrap with withCacheAndMerits composite | New helper chains cache + merits. | |

**Notes:** User picked all recommended options. Centralizing cache logic in the gateway eliminates duplication across 5 feature functions in Phases 37–40.

---

## Cache-write timing post-response

### Q1: What's the cache-write timing primitive?

| Option | Description | Selected |
|--------|-------------|----------|
| Deno EdgeRuntime.waitUntil | Defer past jsonResponse(); standard Supabase Edge pattern. | ✓ |
| Promise.allSettled after response | Build response, return, then .then() the write. Simpler; less robust if worker terminates. | |
| Inline before response | Simplest; violates NFR-06. | |

### Q2: When does the cache row get written?

| Option | Description | Selected |
|--------|-------------|----------|
| After Claude success AND after per-feature persist | Per CACHE-12. Partial responses never poison cache. | ✓ |
| After Claude success, parallel to persist | Faster; risks orphan cache pointing at non-existent analysis_id. | |
| After Claude success, independent of persist outcome | Maximizes coverage; creates orphans. Not recommended. | |

### Q3: What does `withMerits.precheck_cache` return on a hit?

| Option | Description | Selected |
|--------|-------------|----------|
| `{ cached: raw_response, analysis_id }` | Frontend treats hit like a fresh response; deep-link works. | ✓ |
| Just `{ cached: raw_response }` | Simpler contract; loses deep-link. | |
| `{ cached, was_cache_hit: true, analysis_id }` | Explicit hit indicator for optional UI badge. | |

### Q4: What happens when cache-write fails?

| Option | Description | Selected |
|--------|-------------|----------|
| Log + silently swallow | Cache is best-effort; UNIQUE collisions naturally tolerate retry storms. | ✓ |
| Retry once with backoff | Single retry on transient. Probably overkill. | |
| Log + emit metric for monitoring | Same as silent-swallow + counter for ops alerting. | |

**Notes:** Caveat captured in CONTEXT.md D-05 — research must verify `EdgeRuntime.waitUntil` availability in deployed Supabase runtime; fallback to `Promise.allSettled` if missing.

---

## Idempotency key strategy for MER-04

### Q1: Who generates the idempotency key?

| Option | Description | Selected |
|--------|-------------|----------|
| Frontend UUID per submit attempt | crypto.randomUUID() on each user-initiated submit; reused on retry of same logical submit. | ✓ |
| Backend-derived from input hash + time window | hash(user_id || feature || input_hash || floor(now/5min)). | |
| Frontend UUID + backend window fallback | Belt + suspenders during rollout. | |

### Q2: How is the key transmitted?

| Option | Description | Selected |
|--------|-------------|----------|
| Request body field `idempotency_key` | Consistent with existing body fields; no CORS changes. | ✓ |
| HTTP header `Idempotency-Key` | Stripe-style; requires CORS allowlist update. | |
| Either — body wins on conflict | Doubles validation surface. | |

### Q3: What's the uniqueness scope of `merit_transactions.idempotency_key`?

| Option | Description | Selected |
|--------|-------------|----------|
| Partial UNIQUE on (idempotency_key) where source='feature-deduct' | Refunds/shop credits stay outside the unique check. | ✓ |
| Partial UNIQUE on (user_id, idempotency_key) | Belt + suspenders against UUID collision. | |
| Partial UNIQUE on (user_id, feature, idempotency_key) | Tightest scope; same key reusable across features. | |

### Q4: How does idempotency interact with cache short-circuit?

| Option | Description | Selected |
|--------|-------------|----------|
| Cache check BEFORE idempotency check | precheck_cache → on hit, no idempotency consumed. On miss → rate-limit → check_and_deduct_merits. | ✓ |
| Idempotency first, cache second | Check merit_transactions for prior deduct with same key; requires storing result. | |
| Idempotency key is also the cache write key | Conflates two concepts. Don't do this. | |

**Notes:** Open question captured in CONTEXT.md Specifics — what `withMerits` does when `check_and_deduct_merits` returns "already_deducted" with a prior transaction_id. Planner decides during phase planning.

---

## Cache-hit Activity History contract

### Q1: What date does a cache-hit history tile show?

| Option | Description | Selected |
|--------|-------------|----------|
| Hit timestamp — each visit gets its own row | New usage_tracking row with created_at=now, credits=0, analysis_id=originating. Matches "when did I look at this" intuition. | ✓ |
| Originating analysis date only — dedupe in UI | Less noisy; loses visit timeline. | |
| Originating date + separate "Recently viewed" section | Two-section history. Richer model; more Phase 36 UI work. | |

### Q2: Do cache-hit rows get a visual marker?

| Option | Description | Selected |
|--------|-------------|----------|
| No marker — identical to fresh | Cache is invisible to users. | ✓ |
| Subtle 'cached' badge | Transparency/QA; adds UI surface. | |
| Distinct icon | Strongest signal; most cluttered. | |

### Q3: Does a cache hit count against the pooled 60/hr rate limit?

| Option | Description | Selected |
|--------|-------------|----------|
| No — hits bypass rate limit entirely | Rate limit throttles Claude calls, not DB lookups. | ✓ |
| Yes — hits and misses both consume budget | Defends against telemetry inflation. | |
| Soft — hits count but with separate higher pool | Maximum flexibility; operational complexity. | |

### Q4: What does AnalysisHistory show for orphan rows (analysis_id present but originating row deleted)?

| Option | Description | Selected |
|--------|-------------|----------|
| Filter out at query time | LEFT JOIN with NULL check; silent skip; cleanest UX. | ✓ |
| Show as 'Analysis no longer available' tombstone | Honest but cluttered. | |
| Cascade DELETE — usage_tracking goes when analysis goes | Loses audit history. | |

**Notes:** Cache-hit semantics align with the "cache should be invisible to user" design goal. AnalysisHistory orphan-row handling is Phase 36's concern; Phase 29 just documents the contract.

---

## Claude's Discretion

- Migration file naming/numbering (one per concern recommended for clean rollback per NFR-01)
- `cache-fingerprint.ts` API surface (single function vs feature-specific builders)
- Test split between Deno / Vitest / pgTAP for TEST-01/TEST-02
- `EdgeRuntime.waitUntil` availability + fallback shape (research must verify)
- Hash input ordering inside `cache-fingerprint.ts` (per-input pre-hash vs single concatenated hash)

## Deferred Ideas

- Cache analytics dashboard (REQUIREMENTS.md "Future" — internal telemetry only)
- Per-user cache invalidation UI ("Re-run without cache") — REQUIREMENTS.md "Future"
- pgTAP CI runner (operator-deferred from v2.0 Phase 11) — flag in plan if needed
- `analysis_jobs.merit_transaction_id` extended async integration — Phases 37–40, not Phase 29
