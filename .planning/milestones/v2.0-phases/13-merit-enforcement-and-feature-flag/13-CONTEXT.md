# Phase 13: merit-enforcement-and-feature-flag - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the universal `check-and-deduct-merits` edge function (BACK-01) into every AI feature with:

- Pre-call Merit deduction via the Phase 11 `check_and_deduct_merits` RPC
- Auto-refund on Anthropic upstream failure via the Phase 11 `refund_merits` RPC
- `MERIT_SYSTEM_ENABLED` feature flag routing new path vs legacy `usage_tracking`
- Per-user hourly rate limiting capped at 60 AI analyses/hour (pooled across features)
- Observability: structured transaction logs, admin metrics surface, threshold alerts
- Integration test (TEST-07) proving deduction + refund round-trip on mocked AI failure

Closes: **BACK-01, MER-11, NFR-01, NFR-02, NFR-03, NFR-05, NFR-09, NFR-10, NFR-11, MIG-05, TEST-07.**

**Out of scope for this phase:**

- Tier-gated prompt variants (`_free.md` / `_pro.md` / `_elite.md`) — Phase 14
- `<LockedSection>` / `<ProFeatureGate>` / `<EliteFeatureGate>` UI primitives — Phase 14
- Per-feature tier output maps (resume, linkedin, career, recruiting lens) — Phases 15–18
- Interview Prep backend rewrite — Phase 19
- Merit balance badge / cost previews / pricing page UI — Phase 20
- Legacy `usage_tracking` table deletion (MIG-04 keeps it read-only)
- Any change to the Phase 11 RPCs themselves (this phase only consumes them)
- Any change to the Phase 12 Stripe webhook (this phase only reads what it writes)

</domain>

<decisions>
## Implementation Decisions

### Gateway Shape & Refund Semantics

- **D-01:** `check-and-deduct-merits` is implemented as a **shared helper module** under `supabase/functions/_shared/merit-gateway.ts` that every AI feature imports directly. BACK-01 names it as an "edge function" — we interpret that as "a single authoritative gateway abstraction," not a cross-function HTTP hop. In-process imports avoid an extra network round-trip (NFR-01's <100 ms budget) and keep error-handling explicit. If BACK-01 is later re-read as requiring literal HTTP invocation, a thin `check-and-deduct-merits/index.ts` wrapper can expose the same helper over HTTP without changing callers.

- **D-02:** Refund trigger is **narrow**: auto-refund fires ONLY on Anthropic upstream failures — 5xx, 429-overload, network timeout, connection reset. Do NOT refund on:
  - JSON parse failures (the model returned *something*, cost was real)
  - Prompt-sanitizer rejections (input was adversarial)
  - Zod / validation failures downstream of a successful upstream response
  - User-cancelled streams (partial Anthropic billing already incurred)
  - Rate-limit rejections (no deduction happens in the first place — see D-07)

  This keeps the contract clean: "we charged you but the upstream model failed to respond." TEST-07 is the canonical proof.

- **D-03:** Gateway **owns** refund control flow via a `withMerits(userId, feature, cost, async () => anthropicCall())` wrapper. The gateway deducts first, awaits the callback inside a try/catch, inspects the error against the D-02 taxonomy, and either returns the successful result or calls `refund_merits` + re-throws. Features never call `refund_merits` directly. This is the single failure-handling surface for MER-11.

- **D-04:** Every deduction returns a `transaction_id` (from the Phase 11 RPC). The gateway holds it for the full callback lifetime so refunds are correctly idempotent via Phase 11's `refund_merits(transaction_id)` contract. On duplicate refund attempts (network retry during error handling) the RPC is idempotent by design — D-02 of Phase 11.

### Feature Flag Mechanism

- **D-05:** `MERIT_SYSTEM_ENABLED` is a **Supabase function secret** (env var), default `false`, read at function cold start and cached in module scope. Flipping it requires `supabase secrets set MERIT_SYSTEM_ENABLED=true` + a functions restart (~30 s propagation window). Matches the repo's existing env-var pattern (`ANTHROPIC_MODEL_TEXT`, `INTERNAL_JOB_SECRET`, `PADDLE_WEBHOOK_SECRET`). No new config table is introduced.

- **D-06:** Flag branching lives **inside each AI feature handler**, not inside the gateway. Canonical shape at the top of every gated feature:
  ```ts
  if (MERIT_SYSTEM_ENABLED) {
    return withMerits(userId, 'resume_analysis', tierCost, async () => { /* existing body */ });
  } else {
    const usage = await checkAndRecordUsage(userId, 'resume_analysis');
    if (!usage.allowed) return createUsageLimitResponse(...);
    /* existing body */
  }
  ```
  Legacy path is untouched and remains the fallback. Grep-friendly for cutover. Both paths are testable side-by-side. No duplicate handlers.

- **D-07:** Feature list that must be gated in this phase (the "new path" surface): `analyze-resume`, `analyze-career`, `grade-linkedin`, `recruiting-lens`, `analyze-skills-gap`, `compare-jobs`, plus Interview Prep entry points when they exist. Async job processors (`process-resume-analysis-job`, `process-career-analysis-job`) deduct **at submission time** (submit-\* function) not at processing time, so the user cannot exhaust Merits mid-queue.

### Rate Limiting

- **D-08:** NFR-05's "max 60 AI analyses per user per hour" is implemented as a **single pooled counter** shared across all AI features. Key = `ai-analyses-all`. Reuses the existing `supabase/functions/_shared/rate-limiter.ts` (Postgres fixed-window, 3600 s). The 60-cap is the same for all tiers (Free/Pro/Elite all share it) — this is abuse protection, not tier metering.

- **D-09:** Rate limit runs **before** Merit deduction inside `withMerits`. If the user is rate-limited, no merit DB writes happen and the function returns 429 with `{ error: 'rate_limit_exceeded', retryAfterSeconds }`. Fail-cheap ordering: the rate limiter's existing fail-open-on-DB-error semantics are preserved (availability > strict enforcement if rate_limit table is down).

- **D-10:** Rate limiter error code stays distinct from Merit errors:
  - `429 rate_limit_exceeded` — hit 60/hr pool
  - `402 insufficient_merits` — balance too low (NEW, returned by gateway on Phase 11 RPC failure)
  - `429 usage_limit_reached` — legacy path only (kept for when `MERIT_SYSTEM_ENABLED=false`)

  Frontend handlers for these three codes live in Phase 20 UX; this phase only defines the wire format.

### Observability: Transaction Logs

- **D-11:** Every successful deduction and every refund is logged by the gateway via `createLogger('merit-gateway').info('merit-transaction', { user_id, amount, source, feature, transaction_id })`. This satisfies NFR-09. Logs go to Supabase function stdout and are structured JSON; no new infra.

- **D-12:** The `merit_transactions` table (Phase 10 / 11) is the durable record — logs are ephemeral audit. If log and table disagree, the table wins. Gateway does NOT log before the RPC succeeds (avoids false-positive audit entries).

### Observability: Admin Metrics

- **D-13:** NFR-10 metrics are exposed via **Postgres views + a single admin edge function**:

  New views (in the Phase 13 migration):
  - `v_merits_in_circulation` — `SUM(subscription_balance + shop_balance)` from `user_merits`
  - `v_feature_consumption_daily` — `merit_transactions` GROUP BY (feature, date_trunc('day', created_at))
  - `v_shop_purchases_daily` — `merit_shop_purchases` WHERE status = 'succeeded' GROUP BY day
  - `v_conversion_funnel` — Free→Pro / Pro→Elite transitions joined from `profiles` + `subscription_events` (or whatever Phase 12 creates)

  New edge function: `supabase/functions/admin-merit-metrics/index.ts`. Gated by `requireInternalOrUserAuth` with an admin-email allowlist check. Returns a single JSON aggregate of all views on a GET.

- **D-14:** Views are **live** (not materialized). Refresh cost is acceptable — these are admin-only and low-QPS. A future perf phase can materialize if dashboards demand sub-second reads.

### Observability: Alerts

- **D-15:** NFR-11 alerts are delivered via **Resend email to a configured admin address** (reuse `RESEND_API_KEY` + existing `send-strivo-email` pattern). New scheduled edge function `check-merit-alerts` runs every 15 minutes and emails the admin on threshold breach. No Slack, no Sentry, no external log drain in this phase.

- **D-16:** Three alert conditions hard-coded in the checker:
  1. `negative_balance` — `SELECT COUNT(*) FROM user_merits WHERE subscription_balance < 0 OR shop_balance < 0` > 0. This should be impossible given Phase 10 CHECK constraints; if it fires, it's a bug alert, and it fires IMMEDIATELY, not debounced.
  2. `ai_failure_rate_high` — over the trailing 1 h, (refund rows / (deduction + refund rows)) > 0.05. Debounced: only re-alert every 1 h while the condition persists.
  3. `shop_failure_rate_high` — over the trailing 1 h, `shop_purchases` with status = 'failed' / total > 0.02. Debounced similarly.

- **D-17:** Alert state is tracked in a small `alert_state` table (`alert_name`, `last_fired_at`, `last_ok_at`) so the debounce logic survives function cold starts. Table ships in the Phase 13 migration.

### Legacy Path Preservation (MIG-05)

- **D-18:** While `MERIT_SYSTEM_ENABLED=false`, every AI feature continues to call `_shared/usage-checker.ts` unchanged. Phase 13 does NOT modify `usage-checker.ts`, `check_and_record_ai_usage` RPC, or the `usage_tracking` table. The legacy path must be provably unchanged — a regression test proves this in CI before merging.

- **D-19:** When `MERIT_SYSTEM_ENABLED=true` is set for the first time in production, we accept a small "mixed state" window where some already-in-flight requests land on the legacy path and new ones land on the merit path. This is considered safe because: (a) legacy usage_tracking is still writable, (b) merit deductions are additive and cannot corrupt legacy state, (c) no user can double-spend because the two paths count different things.

### Claude's Discretion (Planner / Researcher decides)

- Exact file locations: `_shared/merit-gateway.ts` vs `_shared/merits.ts` naming.
- The exact shape of the `withMerits` callback return type — whether it wraps a `Response` or plain data.
- How to thread rate-limit config through `withMerits` (constant vs parameter).
- Whether the Phase 13 migration is one file or two (core migration + views/alert-state split).
- Cron schedule for `check-merit-alerts` (suggested: `*/15 * * * *`).
- Whether admin metrics views also track `merit_transactions.source = 'phase-10-backfill'` separately or in aggregate.
- Test fixture strategy for TEST-07 — real mocked Anthropic 5xx vs a feature-flag `FORCE_AI_FAILURE` env.
- Whether alert email subject lines include severity prefix or use Resend tags.

### Folded Todos

_None._ No pending todos matched Phase 13 scope during this discussion.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spec (Source of Truth)

- `APIcontextdocuments/STRIVO_GSD_Milestone_Merit_System.docx` §2.4 (pre-call deduction + auto-refund), §8.1 (`check-and-deduct-merits` gateway), §9.1 (NFR-01 <100 ms), §9.2 (NFR-03 server-side only + NFR-05 60/hr rate limit), §9.3 (MER-11 refund semantics), §9.4 (NFR-09/10/11 observability + alerts), §10 (MIG-05 feature flag), §11.2 (TEST-07).

### Requirements

- `.planning/REQUIREMENTS.md` — BACK-01 (line 137), MER-11 (line 22), NFR-01/02/03/05/09/10/11 (lines 152–162), MIG-05 (line 170), TEST-07 (line 181). These are the 11 REQ-IDs Phase 13 closes.
- `.planning/ROADMAP.md` §"Phase 13: merit-enforcement-and-feature-flag" — the seven Success Criteria that VERIFICATION.md must prove TRUE.

### Prior Phase Context (Load-Bearing)

- `.planning/phases/10-merit-ledger-foundation/10-CONTEXT.md` — table shapes, RLS posture, `merit_transactions.amount` signed-integer convention, reconciliation invariant.
- `.planning/phases/11-merit-rpcs-and-reconciliation/` — `check_and_deduct_merits` and `refund_merits` RPC contracts. This phase is a direct consumer; any mismatch between D-03/D-04 here and the actual RPC signatures is a phase-11 plan bug that must be fixed in 11, not 13.
- `.planning/phases/12-stripe-products-and-webhook/` — `credit_shop_merits` + `reset_subscription_merits` drive the metrics in D-13 (`v_conversion_funnel` depends on whatever subscription_events / webhook_events table Phase 12 creates).

### Existing Code (Pattern to Follow / Extend)

- `supabase/functions/_shared/usage-checker.ts` — the legacy path that `MERIT_SYSTEM_ENABLED=false` falls back to. Do NOT modify. D-06's branching snippet mirrors its call shape.
- `supabase/functions/_shared/rate-limiter.ts` — Postgres fixed-window limiter, already has per-tier config, fail-open semantics. Phase 13's D-08/D-09 reuse it as-is with a new pooled key.
- `supabase/functions/_shared/anthropic.ts` — existing 529/overload detection is the exact set of errors D-02 refunds for. Any expansion of the refund taxonomy must match the error classification here.
- `supabase/functions/_shared/logger.ts` — `createLogger('merit-gateway')` is the NFR-09 transport per D-11.
- `supabase/functions/_shared/auth.ts` — `requireInternalOrUserAuth` is the admin-metrics gate per D-13.
- `supabase/functions/send-strivo-email/index.ts` — the Resend transport `check-merit-alerts` will call per D-15.
- `supabase/functions/_shared/handler.ts` — `handleRequest` wrapper + Zod validation pattern all Phase 13 edge functions must use.

### Existing Migrations (Reference)

- `supabase/migrations/20260412000000_stripe_migration.sql` — single-file migration style; Phase 13's new migration (views + alert_state table) follows the same structure.
- `.planning/phases/10-merit-ledger-foundation/10-PATTERNS.md` — migration naming convention, RLS enable pattern.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`_shared/rate-limiter.ts`** — Drop-in for NFR-05; just needs a new `RateLimitConfig { key: 'ai-analyses-all', limits: { free: 60, pro: 60, elite: 60 } }`.
- **`_shared/usage-checker.ts`** — The legacy fallback target for D-18. Untouched in this phase.
- **`_shared/anthropic.ts`** — Already returns classified errors for 5xx/overload; the refund trigger can key off the same classification.
- **`_shared/logger.ts`** — `createLogger('merit-gateway')` satisfies NFR-09 without any new logging infra.
- **`_shared/supabase-client.ts`** — `getServiceClient()` is the only RPC-callable client (service role bypasses RLS; user-authenticated clients cannot call `check_and_deduct_merits` per MER-04 / Phase 10 D-17).
- **`send-strivo-email` edge function** — Reused verbatim by `check-merit-alerts` per D-15.
- **`_shared/handler.ts`** — `handleRequest` wrapper with Zod validation + CORS + requireAuth for `admin-merit-metrics`.

### Established Patterns

- **Env-var feature flags read at module scope** — `ANTHROPIC_MODEL_TEXT`, `INTERNAL_JOB_SECRET` set the precedent for D-05.
- **Inline legacy-vs-new branching at the top of handlers** — D-06 mirrors the existing `stream: true/false` branching in `analyze-resume`.
- **Service-role-only writes on ledger tables** — Phase 10 D-17; Phase 13 honors it by routing all RPC calls through `getServiceClient()`.
- **RLS-enabled tables with zero permissive write policies** — `alert_state` table (D-17) follows the same pattern; admin-metrics edge function reads via service role.
- **Structured JSON logging with `createLogger(fn, reqId?)`** — NFR-09 transport.

### Integration Points

- **Every gated AI feature** (`analyze-resume`, `analyze-career`, `grade-linkedin`, `recruiting-lens`, `analyze-skills-gap`, `compare-jobs`, plus `submit-*-job` async entry points) — touched by D-06/D-07 to add the `if (MERIT_SYSTEM_ENABLED)` branch. No other feature logic changes.
- **Phase 11 RPCs** — `check_and_deduct_merits`, `refund_merits` are the only legitimate write calls from `withMerits`.
- **Phase 12 tables** — `v_conversion_funnel` reads whatever subscription-events table Phase 12 creates; contract must be agreed before Phase 13 implements the view.
- **Phase 14+ tier prompts** — Phase 13's `withMerits` wraps whatever Anthropic call the feature makes; Phase 14 will later swap in the tier-variant prompt loader inside the callback body. No contract change required.

</code_context>

<specifics>
## Specific Ideas

- The `withMerits` helper is the single most important API surface in this phase. Its signature should be small and boring: `withMerits(ctx, feature, cost, fn) => Promise<T>`. The temptation to add retries, metrics sidecars, or a builder pattern should be resisted until a concrete second use case forces it.
- TEST-07 is the canonical proof that MER-11 works end-to-end. It should mock Anthropic to return a 529, assert a refund row exists in `merit_transactions` with `metadata.refund_of = <original_transaction_id>`, and assert the user's balance is exactly restored. This test is the acceptance gate for the phase, not a nice-to-have.
- The 100 ms NFR-01 budget is for the Merit check + deduction round-trip only, NOT the Anthropic call. The gateway should log the RPC duration so perf regressions are visible.
- D-16 debounce state matters — without it, a 30-minute AI outage produces 120 duplicate alert emails. The `alert_state` table exists specifically to prevent that.
- The migration is small (views + `alert_state` table) and should be a single file following the Phase 07/10 convention. Views are pure SQL, no RLS needed on views that only service role reads.

</specifics>

<deferred>
## Deferred Ideas

- **Slack/Sentry/external APM integrations for alerts** — D-15 locks in email-only; if ops wants richer transport later, it's a new phase (or extension of NFR-11).
- **Materialized views for admin metrics** — D-14 keeps views live; if query time becomes a problem, a perf phase materializes them.
- **Runtime-flippable feature flag (DB-backed)** — rejected in favor of env var (D-05); if rollback speed becomes a blocker, a future phase adds a DB override with a cache layer.
- **Per-feature rate limits** — rejected in favor of a pooled 60/hr (D-08); if per-feature abuse patterns emerge, a future phase layers per-feature caps under the pool.
- **Expanding refund taxonomy to parse failures or user cancellations** — rejected by D-02 for abuse resistance; if UX feedback demands it, a future phase revisits with abuse controls.
- **Admin UI for alert acknowledgment** — alerts are email-only; if operators need a dashboard, that's Phase 20+ or a dedicated admin-tools phase.
- **Metrics beyond NFR-10** (cohort retention, ARPU, churn) — out of scope; analytics overhaul is explicitly deferred in PROJECT.md.

### Reviewed Todos (not folded)

_None._ No pending todos were reviewed for Phase 13 scope.

</deferred>

---

*Phase: 13-merit-enforcement-and-feature-flag*
*Context gathered: 2026-04-14*
