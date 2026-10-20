# Concerns — v3.0 Investigation

**Analysis Date:** 2026-04-28
**Scope:** Production failures, suspect code, and tech debt likely to surface during v3.0 (analysis-persistence-merit-fixes-pricing-ux-feature-output-parity).

---

## 1. Interview Prep Production 503 (BLOCKER)

**1a. Model-routing — `sonnet-4` log vs Haiku-4.5 spec.** `supabase/functions/interview-prep-analyze/index.ts:342` calls `getModel(tier, 'interview')`. `supabase/functions/_shared/tier-config.ts:55-67` hard-codes `FREE_MODEL = 'claude-haiku-4-5-20251001'` and `DEFAULT_PRO_ELITE_MODEL = FREE_MODEL`. No `sonnet` string anywhere in the repo. Conclusion: the deployed function is older than the `260419-hku` Haiku migration. **Indicates production deploy drift — main branch likely behind `by/env-fixes` HEAD by 174 commits. Severity: High.**

**1b. Post-Claude DB write paths.** After Anthropic returns, the handler does:
- `INSERT interview_quizzes` (lines 498-516) — refundable 500 on error, NOT 503
- `INSERT interview_quiz_answers` (lines 532-538) — non-blocking error log
- `UPSERT interview_streaks` (lines 576-588) — non-blocking
- `record_ai_usage` RPC (lines 602-610) — non-blocking
- Final `jsonResponse(response, 200)` (line 648)

None of these emit 503. A 503 with TTFB 8.91s after Claude success points to **Supabase platform routing** (router timeout, OOM, response-size limit, cold-start crash on egress) rather than handler code. **Severity: High.**

**1c. `MERIT_SYSTEM_ENABLED=false` defensive 503** at `interview-prep-analyze/index.ts:303-312` — not the cause (flag was on; Claude succeeded). Documented in Phase 27 SC-3 ack as a rollback footgun. **Severity: Medium.**

**1d. Function timeout.** `supabase/config.toml:72-73` has only `verify_jwt = false` for this function — no `max_lifetime` override. Anthropic timeout = 80s (`tier-config.ts:31`). Wall-clock far below 150s default. **Severity: Nice-to-fix.**

**1e. CORS preflight** — handled at line 105 before any work, not implicated.

**Suggested in v3.0:** First action — redeploy `interview-prep-analyze` from current main (post-merge of `by/env-fixes`). Pull production Supabase router logs to determine whether 503 was emitted by handler or router. Check response-payload size against Supabase response-body limits.

---

## 2. Phase 27 Unmerged Commits on `by/env-fixes` (HIGH)

`git log main..HEAD` shows **174 commits** on `by/env-fixes` not on main.

**Phase 27 (cutover-safety-net):**
- `cd4e582` — `feat(27-01)` 410-Gone shim replaces legacy `stripe-webhook` (GREEN)
- `79e6fb3` — `test(27-01)` 410-Gone shim tests (RED)
- `008ba6f` — delete orphan Phase 07 stripe-webhook/price-resolver files
- `551c933` — remove deleted price-resolver test from edge-test registration
- `36a266e` — `docs(27-01)` deprecation notice replaces DEPLOY_RUNBOOK
- `e1c34ea` / `0b62d46` / `93da3c3` — runbook D1/D2/D4 ack ceremonies (SC-2/3/4)

**File:** `supabase/functions/stripe-webhook/index.ts:1-40` is the shim, not deployed to production today.

**Phase 26 (async-job merit refund):**
- `d34d4fa` — add `merit_transaction_id` to analysis_jobs
- `6fec179`, `c311ea5` — submitters persist txn id
- `9031c88`, `8549266` — `refundMeritsForJob` `already_refunded` recognition
- `fdb8f51`, `0e366bc` — wire refund into both async workers
- `d6e0fd4` — refund-on-failure tests

DB migration `20260429000000_add_merit_transaction_id_to_analysis_jobs.sql` IS applied to production per audit line 42, but worker code wiring is NOT.

**Phase 25 (UX gap closure):** `e20fd87`, `877cd5c`, `87495c8`, `1d5653c`, `ddf0c3e`, `3a2e2e6`, plus `4a207fb`, `4bd0937`, `0870f73` Phase 23 cleanup.

**v3.0 dependency impact:**
- Stripe shop bug fix and webhook idempotency hardening MUST merge `by/env-fixes` first.
- v3.0 sync-path "refund on AI failure" inherits the refund flow — sync `refund_merits` RPC is on main, but Phase 26 helper additions (`already_refunded` recognition) are not.
- v3.0 CareerCompass Pro/Elite bug fix touching `CareerCompass.tsx` will conflict with Phase 25's `1d5653c` (mounts MeritCostPreview) if main is the base.

---

## 3. BUDGET-03 Input-Guard Not Wired (MEDIUM)

`getMaxInputChars(feature, tier)` exported at `src/config/pricing-config.ts:120-122`, re-exported via `supabase/functions/_shared/tier-config.ts:130`. **No edge function calls it.**

| Edge function | Length check | Source |
|---|---|---|
| `analyze-resume/index.ts:344` | `< 50` floor only | hardcoded |
| `submit-resume-analysis-job/index.ts:58` | `< 50` floor only | hardcoded |
| `analyze-career/index.ts:796/808/832/842/1077/1103/1148/1193` | `< 100` floor; `MAX_CONTEXT_CHARS=12000` slice at line 857 | hardcoded, NOT per-tier |
| `recruiting-lens/index.ts:178` | `< 50` floor only | hardcoded |
| `interview-prep-analyze/index.ts` | none (Zod IntakeFormSchema has no length cap) | none |
| `grade-linkedin/index.ts` | none observed | none |

**Impact for v3.0 caching:** career-compass slices `resumeText` AFTER merit deduction (line 858). If cache hashes raw input, retries produce different hashes than the first run. Hash must be computed AFTER per-tier truncation, ideally before deduction.

---

## 4. Legacy `interview-prep-coach` Function Still Deployed (MEDIUM)

Repo source: gone (no directory under `supabase/functions/`). Deploy state: still live on staging + production per audit line 82 / STATE.md line 44. Operator action needed: `supabase functions delete interview-prep-coach --project-ref <STAGING+PROD>`. Risk during v3.0 Interview Prep work: parallel deploy / patch confusion. Phase 25 SC-9 + Phase 27 SC-4 D4-Finalize ack ceremonies surface the reminder, but those acks are on `by/env-fixes`, not main.

---

## 5. `usage_tracking` Legacy Table — Both Read AND Written (HIGH)

STATE.md line 43 says "retained read-only". Reality:

**Writers (every merit-path feature calls `record_ai_usage`):**
- `analyze-resume/index.ts` (post-success)
- `analyze-career/index.ts:711-713, 940-942` (Phase 22-04 Pitfall 2 fix, both sync + async)
- `grade-linkedin/index.ts:324-326` (free-scan), `:356-358` (merit path)
- `recruiting-lens/index.ts:256-258` (Free + Pro + Elite)
- `interview-prep-analyze/index.ts:602-610`
- `_shared/usage-checker.ts:25-27` (atomic variant `check_and_record_usage`)

**Readers (frontend gates and history):**
- `src/pages/AnalysisHistory.tsx:170-172` — primary history table read
- `src/pages/AnalysisHistory.tsx:251-254` — fragile ±5 min timestamp-proximity matcher (Phase 22-04 D-20)
- `src/hooks/useAchievements.ts`
- `src/hooks/usePaywallGuard.ts:51-53` — calls `can_perform_ai_action`
- `src/hooks/useTierAccess.ts:71-73` — calls `can_perform_ai_action`

**Severity: High for v3.0 history persistence.** Cannot ship "every feature persists results to dashboard history" without choosing canonical source. `usePaywallGuard` / `useTierAccess` are duplicate gates on top of `withMerits` — should migrate to `useMerits`.

---

## 6. Idempotency Surface (MIXED — HIGH)

| Operation | Path | Idempotency | Severity |
|---|---|---|---|
| Subscription monthly grant | `reset_subscription_merits` (`migrations/20260415000000_merit_rpcs.sql:367-424`), called from `stripe-webhook-handler/index.ts:522, 679` | webhook-event-id 23505 dedupe at `:163-179` | OK |
| Shop pack credit | `credit_shop_merits` (`migrations/20260422000000_phase_24_topup.sql:52-158`) | triple defense: event-id UNIQUE + `merit_shop_purchases.stripe_payment_intent_id` SELECT pre-check (line 99-111) + `unique_violation` ledger catch (line 147-156) | OK |
| **Pre-call merit deduction (sync)** | `check_and_deduct_merits` (`migrations/20260415000000_merit_rpcs.sql:75-152`), via `merit-gateway.ts:129-133` | **NONE** — fresh `gen_random_uuid()` per call (line 79); no client-supplied key | **BLOCKER for v3.0** |
| Pre-call merit deduction (async submit) | `submit-resume-analysis-job/index.ts:87-105` | pre-`withMerits` lookup for active job → returns existing `jobId` (WR-04) | OK for queue path; sync path unprotected |
| Refund on AI failure | `refund_merits` (`migrations/20260415000000_merit_rpcs.sql:165-241`) | existing-refund-row check at line 184-193 → `already_refunded` | OK |
| Async-worker refund | `refundMeritsForJob` in `merit-gateway.ts:209+` | wraps `refund_merits` | OK on `by/env-fixes`, partial on main |
| Admin merit grant | `admin_set_user_merits` (`migrations/20260418100000_admin_merit_adjustment.sql:10-62`) | NONE — sets absolute target value | Medium |
| Auto-provision signup | `auto_provision_user_merits` trigger (`migrations/20260414000000_merit_ledger_foundation.sql:115-133`) | `ON CONFLICT (user_id) DO NOTHING` | OK |

**v3.0-critical:** sync-path deduction has zero idempotency. User refresh / network retry / double-click all double-charge. v3.0 needs `p_idempotency_key` arg on `check_and_deduct_merits` plus a `merit_transactions.idempotency_key` column with partial UNIQUE index where `source='feature-deduct'`.

---

## 7. Free Tier Truth: 5-Lifetime vs 10-Monthly Divergence (HIGH)

PROJECT.md line 11 says "Free 10 / Pro 75 / Elite 150 monthly." STATE.md line 33 says "Free 5 lifetime."

**Source-code state — they don't agree:**
- `src/config/pricing-config.ts:31-35` — `MERITS_PER_MONTH = { free: 10, pro: 75, elite: 150 }`. Frontend cap = 10 for Free.
- `supabase/migrations/20260414000000_merit_ledger_foundation.sql:124, 149` — auto-provision trigger and backfill insert `subscription_balance=5, lifetime_granted=5, subscription_reset_date=NULL` for new users.
- `supabase/migrations/20260415000000_merit_rpcs.sql:382-385` — `reset_subscription_merits` is a NO-OP for Free; only Pro=75 / Elite=150 are reset.

**Production reality today:** Free signup gets 5 merits; no monthly reset; display shows "5 / 10". v3.0 wants "Free 10/month replenishing" — needs migration to lift Free to 10 plus removal of Free no-op in `reset_subscription_merits` and update of `auto_provision_user_merits` trigger. Once landed, PROJECT.md and STATE.md must be reconciled.

---

## 8. Cache Infrastructure Status: Does Not Exist (BLOCKER)

**No cache table, no fingerprint helper, no cache RPC anywhere.** Searched all of `supabase/migrations/` — nothing matching `cache`, `fingerprint`, `input_hash`, `cache_key`.

What exists:
- `src/components/career-compass/CachedResultsBanner.tsx` is a "showing your saved results" UI banner against most-recent `analysis_results` row, not a hash-keyed cache.
- `analysis_results` is read-only-RLS for users (`migrations/20260420000000_mig_02_analysis_results_readonly.sql`); could be extended into a cache index but currently is per-run.
- Per-feature tables (`linkedin_grades`, `interview_quizzes`, `analysis_results`, `saved_jobs`) store single runs, no input-hash key.

v3.0 cache phase must build from scratch. Sibling cache-architecture doc owns the design.

---

## 9. Stripe Shop "75/75 Bug" — Display, Not Credit (MEDIUM)

**Credit RPC is correct.** `migrations/20260422000000_phase_24_topup.sql:120-124` does `UPDATE user_merits SET shop_balance = shop_balance + p_pack_size` — no clamp, no LEAST. Production smoke-tested 2026-04-29 with real `pack_3` confirmed crediting (audit line 38).

**The "never increments" perception is in the display:**
- `src/components/topup/MeritBalanceHeaderV2.tsx:52, 69` shows `{subscription} / {cap}` (e.g. "75 / 75"). Shop merits render only as small `+ {shop} bonus` text in `--accent-red` (lines 57-61) when `shop > 0`. Easy to miss.
- `src/hooks/useMerits.ts:60-64` — `subscription` and `shop` are separate; `cap = MERITS_PER_MONTH[tier]`; `total = subscription + shop` only shown inside popover (line 80).

**Secondary surface:** `useMerits.ts:54` has `staleTime: 5_000`. `useInvalidateMerits` exists at line 89-92 but is not auto-called on Stripe-redirect return.

**v3.0 fix:**
- Frontend should call `useInvalidateMerits()` immediately on `/billing` or `/pricing` mount after Stripe checkout-session redirect.
- Reconsider trigger label so the bonus is more prominent (e.g. "75 / 75 (+3)" inline).
- Add toast on shop-pack credit landing.
- Regression test: at-cap user → run `credit_shop_merits` → assert `shop_balance > 0`.

---

## Carried-Forward v2.0 Tech Debt (Reference)

From `v2.0-MILESTONE-AUDIT.md:48-100` and `STATE.md:39-44` — listed only when v3.0 work surfaces them:
- VERIFICATION.md gaps in Phases 10/19/22/24/27 (production state proves correctness; backfill via `/gsd-validate-phase` if needed)
- Live-run gates accepted as production-validated (Phase 11 pgTAP, Phase 13 perf p99, Phase 14 tier-output harness, Phase 12 Stripe dashboard)
- Operator-deferred: legacy `interview-prep-coach` delete (see section 4)
