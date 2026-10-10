# Phase 29: Foundation Infrastructure - Context

**Gathered:** 2026-05-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Stand up the substrate that Phases 30–40 will wire into. No user-facing behavior change, no feature output changes. Phase 29 delivers:

1. **`analysis_cache` table** with deterministic, user-scoped fingerprinting (CACHE-01).
2. **`_shared/cache-fingerprint.ts`** helper — single SHA-256 builder reused by every feature in 37–41 (CACHE-02).
3. **`resumes.extracted_text` + `resumes.text_hash`** columns + analyze-resume/ocr-pdf wiring so resume fingerprints are deterministic across re-OCRs (CACHE-03).
4. **`usage_tracking.analysis_id`** column + per-feature population so AnalysisHistory stops relying on ±5 min proximity matching (HIST-01).
5. **Sync-path idempotency** on `check_and_deduct_merits` via `merit_transactions.idempotency_key` partial UNIQUE index + frontend UUID-per-submit (MER-04).
6. **`withMerits` extension** — optional `precheck_cache` callback that short-circuits before rate-limit + deduct on cache hit (CACHE-09).
7. **NFRs** — idempotent migrations + documented rollback (NFR-01); cache lookup <100ms p95 (NFR-02); CORS/rate-limit/sanitizer/JWT preserved (NFR-05); cache writes never block response (NFR-06); idempotency tolerates retry storms (NFR-07).
8. **Test contract** — every fix lands with automated test OR documented manual QA (TEST-01); merit-idempotency regression (TEST-02).

**Out of scope for Phase 29:** Wiring any specific feature to the cache (that's Phases 37–40); writing the per-feature `analysis_results`/`saved_jobs` inserts (Phase 36); changing prompt content; UI changes to AnalysisHistory (Phase 36).

</domain>

<decisions>
## Implementation Decisions

### Cache-key scoping + RLS shape

- **D-01:** `cache_key` is `SHA-256(user_id || feature || tier || variant || canonical_input_hashes)`. `user_id` is baked into the key — cross-user reads are structurally impossible. RLS is defense-in-depth.
- **D-02:** Single UNIQUE btree index on `cache_key`. No composite. NFR-02 <100ms p95 met via direct hash lookup.
- **D-03:** RLS policy matches the v2.0 MIG-02 lock used on `analysis_results`: `SELECT WHERE user_id = auth.uid()` for `authenticated` role; no INSERT/UPDATE/DELETE policy. Service role writes only (via `getServiceClient()`).
- **D-04:** `withMerits` gains an optional `precheck_cache: () => Promise<{ cached, analysis_id } | null>` callback. Gateway runs the precheck BEFORE rate-limit and deduction. On hit, gateway short-circuits, writes a `usage_tracking` row with `credits=0` + `analysis_id` referencing the originating row, and returns the cached `raw_response` to the caller. No new `withCacheAndMerits` wrapper — the precheck callback is a one-line extension to the existing gateway contract.

### Cache-write timing post-response

- **D-05:** Cache writes use `EdgeRuntime.waitUntil(promise)` to defer past `jsonResponse()`. Verify availability in deployed Supabase Edge runtime during research; fall back to `Promise.allSettled` post-response if `waitUntil` is unavailable.
- **D-06:** Cache write happens AFTER Claude success AND AFTER the per-feature persist target writes successfully (CACHE-12). Order: Claude → per-feature persist (`resumes` / `analysis_results` / `linkedin_grades` / `saved_jobs` / `interview_quizzes`) → cache write. Partial responses or failed persists never poison cache.
- **D-07:** `precheck_cache` hit returns `{ cached: raw_response, analysis_id }`. Frontend treats it like a fresh response — no special hit-vs-miss branching at the rendering layer. The `analysis_id` keeps deep-links in AnalysisHistory functional.
- **D-08:** Cache-write failures (DB transient, UNIQUE collision) are logged at `warn` and silently swallowed. The user already got a successful response; the cache is best-effort. UNIQUE collisions are the expected NFR-07 behavior under retry storms — another worker wrote the row first.

### Idempotency key strategy (MER-04)

- **D-09:** Frontend generates a `crypto.randomUUID()` per user-initiated submit (the click that triggers `analyze`). Retries of the SAME logical submit (network retry, double-click, AbortController re-fire) reuse the same UUID. A new user click generates a new UUID.
- **D-10:** Idempotency key is transmitted in the request body as `idempotency_key`. Validated alongside other body fields via the existing Zod-friendly handler pattern. No new CORS header.
- **D-11:** `merit_transactions` gains an `idempotency_key text` column with a **partial UNIQUE index** on `(idempotency_key) WHERE source = 'feature-deduct'`. Refunds and shop credits stay outside the unique check. UUID entropy is enough that `user_id` scoping isn't required.
- **D-12:** Execution order inside an edge function with cache + idempotency + merits:
  1. `withMerits(ctx, feature, fn, { precheck_cache })` is the only call from the feature
  2. Inside `withMerits`: run `precheck_cache()` FIRST. On hit → write `usage_tracking` credits=0 row → return cached. **Cache hits do NOT consume idempotency keys.**
  3. On miss → pooled rate-limit check → `check_and_deduct_merits(p_idempotency_key)` RPC → Claude call → per-feature persist → cache write (waitUntil).
  4. On `check_and_deduct_merits` idempotency hit (same key already deducted): RPC returns "already_deducted" with the prior transaction_id. Edge function MUST then re-run the analysis or return a cached prior result — open question for research (see Specific Ideas).

### Cache-hit Activity History contract

- **D-13:** Every cache hit writes a NEW `usage_tracking` row with `created_at = now()`, `credits = 0`, `analysis_id = <originating row id>`, `action_type = <feature>`. AnalysisHistory shows one row per visit chronologically.
- **D-14:** Cache-hit rows are visually IDENTICAL to fresh-analysis rows in AnalysisHistory. No "cached" badge, no distinct icon. The cache is invisible to users by design. (If Phase 36 needs a debug-mode flag for QA, that's Phase 36's call, not Phase 29's contract.)
- **D-15:** Cache hits BYPASS the pooled `ai-analyses-all` 60/hr rate limit. The limit exists to throttle Claude calls and the merit gateway short-circuits before the rate-limit check on hit. NFR-05 preserved on misses.
- **D-16:** Orphan `usage_tracking` rows (where the referenced `analysis_id` row was deleted) are filtered at query time in Phase 36 — LEFT JOIN with NULL check, silent skip in the UI. No cascade DELETE on the FK; audit history preserved.

### Claude's Discretion

- Migration file naming/numbering (single migration vs. one per concern). Recommendation during planning: one migration per concern (`*_analysis_cache_table.sql`, `*_resumes_extracted_text.sql`, `*_usage_tracking_analysis_id.sql`, `*_merit_transactions_idempotency.sql`) for clean rollback paths per NFR-01.
- `cache-fingerprint.ts` API surface — single `computeCacheKey(opts)` function or feature-specific builders. Planner picks based on what reads cleanest across the 5 call-sites.
- Test split between Deno (`deno test` edge unit), Vitest (frontend hook tests for idempotency UUID + AbortController), and pgTAP (RLS + UNIQUE constraint regressions). TEST-02 (merit idempotency) is the canonical regression — at minimum a Deno test against a seeded `merit_transactions` row.
- Exact `EdgeRuntime.waitUntil` availability + fallback shape. Research confirms or surfaces alternative.
- Whether `cache-fingerprint.ts` hashes individual inputs separately before concatenation or hashes the concatenated canonical string once. Planner picks deterministic option that's easiest to debug.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements + roadmap (source of truth)
- `.planning/REQUIREMENTS.md` — full v3.0 spec; Phase 29 owns CACHE-01/02/03/09/10/11/12, HIST-01, MER-04, NFR-01/02/05/06/07, TEST-01/02
- `.planning/ROADMAP.md` Phase 29 row — phase scope + dependencies (depends on Phase 28; blocks Phases 31, 36, 37–40)
- `.planning/PROJECT.md` Current Milestone section — v3.0 goals

### Codebase intel (current state)
- `.planning/codebase/ARCHITECTURE.md` §"Cross-cutting facts" + §"Master persistence + read map" + §"AnalysisHistory dashboard read path" + §"OCR / PDF normalization" + §"Cache infrastructure"
- `.planning/codebase/CONCERNS.md` — known fragilities (the ±5min proximity matcher, the `resumeHash` dead code at `analyze-resume/index.ts:389-392`)
- `.planning/codebase/INTEGRATIONS.md` — external deps; Supabase Edge Function `EdgeRuntime` availability notes if present

### Reusable substrate
- `supabase/functions/_shared/merit-gateway.ts` (Phase 13 D-01..D-12) — `withMerits`, `MeritRefundable`, refund classification. Phase 29 extends with `precheck_cache`.
- `supabase/functions/_shared/rate-limiter.ts` — pooled 60/hr `ai-analyses-all`. Cache hits short-circuit before this check.
- `supabase/functions/_shared/auth.ts` — `requireAuth()` / `requireInternalOrUserAuth()`; tier resolution is server-side, body.tier never trusted.
- `supabase/functions/_shared/supabase-client.ts` — `getServiceClient()` for all RLS-bypassing writes.
- `supabase/migrations/20260415000000_merit_rpcs.sql` — current `check_and_deduct_merits` / `refund_merits` RPCs. MER-04 modifies the deduct RPC to accept `p_idempotency_key`.
- `supabase/migrations/20260420000000_mig_02_analysis_results_readonly.sql` — RLS template for `analysis_cache`.
- `supabase/migrations/20260411000002_atomic_check_and_record_usage.sql` — `record_ai_usage` RPC; cache-hit and miss paths both call it (credits=0 on hit, real credits on miss).
- `supabase/functions/analyze-resume/index.ts:389-392` — dead `resumeHash` (32-bit fold) marked for replacement by deterministic SHA-256 fingerprint.

### Carry-forward locked decisions
- `.planning/phases/28-merge-redeploy-baseline/28-CONTEXT.md` — Phase 28 (shipped 2026-05-11): `by/env-fixes` merged; legacy `interview-prep-coach` deleted; redeploy baseline established. Phase 29 builds on a clean prod/staging.
- v2.0 Phase 13 D-01..D-12 — merit gateway design contract. Documented inline in `merit-gateway.ts:1-19`.
- v2.0 Phase 24 — Free 5 / Pro 75 / Elite 150 tier caps (Phase 30 raises Free to 10).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`withMerits` gateway** (`supabase/functions/_shared/merit-gateway.ts:115`): single deduct/refund surface across all 5 features. Phase 29 adds a 4th argument (`precheck_cache` callback) without forking. Existing `MeritRefundable` taxonomy stays untouched.
- **Pooled rate limiter** (`rate-limiter.ts`, key `ai-analyses-all`, 60/hr): cache hits bypass via the precheck callback short-circuit; no rate-limiter code change needed.
- **`record_ai_usage` RPC**: already populated by every feature. Phase 29 adds an `analysis_id` parameter; cache-hit path calls with `credits=0`.
- **`resumes.file_hash`** (existing SHA-256 of bytes): keeps file-level dedup at upload. Cache uses the new `text_hash` for output-affecting fingerprinting.
- **Dead `resumeHash` 32-bit fold** at `analyze-resume/index.ts:389-392`: marked for replacement by `cache-fingerprint.ts` SHA-256.

### Established Patterns
- **Migrations:** one concern per migration file, ISO-prefixed (`20260YYY00000_<name>.sql`). NFR-01 rollback: every migration ships with a matching `down` block in the same file or sibling `*-rollback.sql`.
- **RLS posture:** service-role-write, user-SELECT-only on analytics tables (MIG-02 lock on `analysis_results`). Phase 29 replicates this on `analysis_cache`.
- **Shared edge helpers:** `_shared/*.ts` named-export utilities (`createLogger`, `getServiceClient`, `requireAuth`). New `cache-fingerprint.ts` follows the same shape.
- **Deno tests** at `_shared/*.test.ts` alongside source; `npm run test` for frontend (Vitest); no pgTAP runner in CI yet (operator-deferred from v2.0 Phase 11 — flag if Phase 29 needs it).

### Integration Points
- **`merit-gateway.ts` `withMerits` signature** — backwards-compatible 4th-arg options object (`precheck_cache?: () => Promise<{cached, analysis_id} | null>`). No call-site break for existing features that don't opt in.
- **`check_and_deduct_merits` RPC** — new `p_idempotency_key text` parameter (nullable for backwards compat during rollout). MER-04 partial UNIQUE handles dedup at the row level.
- **`usage_tracking` table** — new `analysis_id uuid NULL` column (loose FK to per-feature tables; loose because the referenced table varies by `action_type`). Index on `(user_id, action_type, created_at DESC)` already exists per ARCHITECTURE.md.
- **`resumes` table** — two new columns (`extracted_text text`, `text_hash text`). Backfill plan: NULL on existing rows; populated on next analyze for any resume.
- **`ocr-pdf` edge function** — populates `extracted_text` + `text_hash` on its return path so analyze-resume can read them on the next call.

</code_context>

<specifics>
## Specific Ideas

### Open question for research

- **`check_and_deduct_merits` idempotency-hit replay shape.** When the RPC returns "already_deducted" with the prior `transaction_id`, what should `withMerits` do? Options:
  - (a) Look up the prior analysis via `analysis_id` linkage (requires the original deduction to have recorded an `analysis_id`, which it doesn't today) and replay the cached output.
  - (b) Throw a 409 to the frontend with "duplicate submit" so the frontend can re-fetch from history.
  - (c) Treat as a fresh Claude call (don't replay) — only the deduct is idempotent, the Claude work isn't. Loses the original analysis but doesn't double-charge.
  - Recommendation: planner picks based on which feature flows benefit most. Resume analysis is most exposed (longest call, most retry-prone).

### Specific anchor points
- The 5 analyze entry points in `supabase/functions/analyze-resume/`, `analyze-career/`, `grade-linkedin/`, `recruiting-lens/`, `interview-prep-analyze/` — each is a downstream consumer of Phase 29's substrate. Phase 29 does NOT modify any of them; Phases 37–40 do.
- The async-job processors (`process-resume-analysis-job/`, `process-async-analysis-job/`) — also get the `precheck_cache` and `idempotency_key` plumbing in Phases 37–40, not Phase 29.

</specifics>

<deferred>
## Deferred Ideas

- **Cache analytics dashboard** (hit rate, popular fingerprints, cost savings) — listed in REQUIREMENTS.md "Future (deferred from v3.0)". Internal telemetry only.
- **Per-user cache invalidation UI** ("Re-run analysis without using cache") — REQUIREMENTS.md "Future". Design later if users complain. The RLS posture (D-03) means a future UI needs an RPC, not a direct DELETE.
- **Test contract split decision** (Deno vs Vitest vs pgTAP) — flagged in Claude's Discretion. Planner decides.
- **pgTAP CI runner** — operator-deferred from v2.0 Phase 11. Flag in Phase 29 plan if any TEST-01/02 work needs pgTAP and Docker isn't available.
- **`analysis_jobs.merit_transaction_id` deeper integration** — Phase 26 wired refund on async failure; Phase 29 doesn't extend the async path. Phases 37–40 will plumb idempotency_key + precheck_cache through `submit-*-job` + `process-*-job` paths.

</deferred>

---

*Phase: 29-foundation-infrastructure*
*Context gathered: 2026-05-12*
