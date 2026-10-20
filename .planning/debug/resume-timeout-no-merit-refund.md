---
slug: resume-timeout-no-merit-refund
status: investigating
trigger: "Onboarding analysis failed twice with Supabase IDLE_TIMEOUT / 504 after two 50-second Anthropic 408 rows per request; Merits were not refunded and no analysis succeeded."
created: 2026-07-21
updated: 2026-07-21
phase: "02"
environment: production (zjpjapgraoxdukdvpjes)
severity: critical
---

# Debug: Resume timeout with missing Merit refund

## Symptoms

- **Expected:** Onboarding Resume Analysis completes synchronously. If all Anthropic attempts fail before a durable result is saved, the reserved/deducted Merits are restored exactly once and the user can retry safely.
- **Actual:** Two separate production submissions both failed. Each request produced two 50-second Anthropic `408` rows, then the Supabase Edge Function returned `504 Gateway Timeout` / `IDLE_TIMEOUT` at 150 seconds. No result was delivered and the account's Merits were not refunded.
- **Errors:** `{"code":"IDLE_TIMEOUT","message":"Request idle timeout limit (150s) reached"}`; `Onboarding analysis failed: Error: Request timed out. Please try again.`; POST `/functions/v1/analyze-resume` returned 504.
- **Timeline:** Reproduced during Phase 02 production token-measurement work after the TEMP Resume Free output cap (`9000`) and telemetry instrumentation were deployed.
- **Reproduction:** On production, submit onboarding/resume analysis for `scripts/test-docs/Free/FREE_ACCOUNT_1_newResume.pdf` plus `scripts/test-docs/Free/FREE_ACCOUNT_1_newLinkedIn.pdf`; wait for the request to fail, then repeat. Do not include document content in debug artifacts.

## Production Evidence

- Request `46d47d08`: two `resume_analysis/free/free-single` rows, both `attempt=1`, `max_tokens=9000`, `http_status=408`, `ok=false`, durations `50008ms` and `50001ms`.
- Request `461d468f`: two matching failure rows, durations `50008ms` and `50001ms`.
- All four rows use model `claude-haiku-4-5-20251001`; all usage/stop fields are null because no Anthropic response completed.
- UI/edge terminal result: 504 `IDLE_TIMEOUT` after 150 seconds for both submissions.
- Billing symptom reported by operator: failed submissions were not refunded.

## Current Focus

- status: resolved
- hypothesis: confirmed. The enabled onboarding lifecycle inherited three outer transient retries, while the provider helpers also owned inner retry/fallback behavior. Free could exceed 200 seconds and Elite had a 155-second single-call wall; both could outlive the 120-second browser wait and 150-second Edge ceiling before the pre-save refund branch.
- test: onboarding now runs exactly one provider batch, caps every provider call at 100 seconds (Free stays at 50 seconds), disables nested provider retries/fallback, and records `refunded=true` only after the idempotent refund RPC succeeds.
- expecting: a provider timeout returns to lifecycle refund control while the worker is alive; durable success still crosses `saving -> completed` with no reachable refund; refund transport failure remains eligible for the reaper instead of being falsely marked refunded.
- next_action: post-deploy observation only: correlate request `77461c33` to the unique lifecycle row using the telemetry-owned account and provider start time, then prove a linked 3-Merit refund landed immediately. The original unbounded-timeout/refund bug remains resolved; a successful refund closes this observation, while the repeated provider 408 remains a separate product-reliability finding.
- reasoning_checkpoint: the paired 50-second rows followed by a 150-second kill are exactly explained by two completed outer attempts plus a third in flight. Removing both retry layers from synchronous onboarding is smaller and safer than widening any wall; retries remain available as a deliberate user action after refund.
- tdd_checkpoint: complete. New guard failed 0/2 before the fix, then passed; focused money/lifecycle suite passed 45/45 with one remote-only case ignored.

## Evidence

- timestamp: 2026-07-21T18:48:43-07:00
  observation: production telemetry contains two separate request IDs with two 50-second 408 failures each, followed by platform 504/IDLE_TIMEOUT and no successful analysis.
- timestamp: 2026-07-21T18:48:43-07:00
  observation: operator reports the failed requests consumed Merits without restoring them.
- timestamp: 2026-07-22T00:00:00-07:00
  observation: `getTimeout('free')` is passed into the Free Anthropic call and production evidence shows that timeout is 50 seconds; `runAnalysisLifecycle` defaults `maxRetries` to 3, meaning four total generate attempts plus 1s/2s/3s backoffs are possible.
- timestamp: 2026-07-22T00:00:00-07:00
  observation: the lifecycle calls `refundAndFail` only when a transient failure arrives with `attempt >= maxRetries`; with the default, it cannot refund after the second 408 and starts a third call, matching the 150-second platform kill.
- timestamp: 2026-07-22T00:00:00-07:00
  observation: onboarding calls `runAnalysisLifecycle` without a `maxRetries` override; its `generate` callback receives no attempt context, while `executeFreeAnalysis` hardcodes telemetry `attempt: 1` for its first internal call. Re-entering the callback therefore records every lifecycle-level retry as attempt 1.
- timestamp: 2026-07-22T00:00:00-07:00
  observation: the Merit transaction id is persisted before generation and `refundMeritsForJob` calls the idempotent `refund_merits` RPC; the missing refund is a worker-lifetime problem, not absence of a refund primitive.
- timestamp: 2026-07-21T19:06:14-07:00
  observation: independent review found `maxRetries: 1` was still unsafe because Free has an inner quality-floor retry, and Elite's 155-second core timeout already exceeds the platform ceiling. The final fix uses `maxRetries: 0`, disables provider-level retry/fallback for onboarding, and caps the onboarding provider wall at 100 seconds.
- timestamp: 2026-07-21T19:06:14-07:00
  observation: lifecycle and reaper both previously persisted `refunded=true` without proving refund RPC success. They now preserve `refunded=false` on RPC failure so the idempotent backstop can retry.
- timestamp: 2026-07-21T19:06:14-07:00
  observation: focused tests passed 45/45 with one remote-only case ignored; Deno checks for analyze-resume and reap-stale-analysis-runs passed; repository lint, frontend type-check, full edge suite, and production build all exited 0.
- timestamp: 2026-07-21T19:06:14-07:00
  observation: operator reports commit `75c25412` deployed successfully to production and `reap_stale_analysis_runs` runs every 15 minutes against the correct production URL.
- timestamp: 2026-07-21T19:06:14-07:00
  observation: affected runs `20ce5de7-309a-414e-9433-f62105fa9f5d` and `20079806-c97b-402c-87b5-32e929deebda` are now `retryable_failed` / legacy status `retrying`, with `failure_code=reaper_stale`, `failure_stage=generating`, `merit_settled=false`, `refunded=true`, non-null Merit transaction IDs, and no completion timestamp.
- timestamp: 2026-07-21T19:06:14-07:00
  observation: because the pre-fix reaper persisted `refunded=true` before calling `refund_merits`, lifecycle state alone cannot prove money restoration. The canonical proof is `merit_transactions`: original rows use source `feature-deduct`, negative amounts, and shared `metadata.deduction_id`; successful refunds use source `feature-refund`, positive mirrored amounts, `balance_type=refund`, and `metadata.refund_of` linking each original row.
- timestamp: 2026-07-21T19:06:14-07:00
  observation: final production ledger proof passed for both affected runs. Each has one deduction row totaling 3 Merits, one linked refund row totaling 3 Merits, zero outstanding Merits, and `fully_refunded=true`; aggregate refund is exactly 6 Merits.
- timestamp: 2026-07-21T20:17:01-07:00
  observation: first post-deploy onboarding attempt on the same new Free-account documents failed with exactly one `resume_analysis/free/free-single` telemetry row: request `77461c33`, attempt 1, Haiku 4.5, max_tokens 9000, duration 50008ms, HTTP 408, no token usage. There was no second provider attempt and no reported 150-second Edge `IDLE_TIMEOUT`, matching the deployed bounded-failure control flow.
- timestamp: 2026-07-21T20:17:01-07:00
  observation: the bounded-failure fix is behaving as designed, but user-value success is not restored for this input: Anthropic still cannot complete the 9000-token Free request inside the 50-second provider wall. Treat this as a separate Resume Analysis availability/token-budget finding if the ledger proves the immediate refund.
- timestamp: 2026-07-21T20:17:01-07:00
  observation: the correlated lifecycle row `2b9c2cbf-a3a0-47d3-b77e-44372a181837` reports `refunded=true`, but the first ledger query found zero deduction and zero refund rows through its stored `merit_transaction_id`. This is not accepted as refund proof; Phase 02 production measurements remain paused.
- timestamp: 2026-07-21T20:17:01-07:00
  observation: code inspection found `refundMeritsForJob` treats any transport-successful RPC response as `ok:true` except `already_refunded`; JSON business errors such as `unknown_transaction` and `user_not_found` can therefore persist a false `refunded=true`. A masked idempotency-key/nearby-ledger query is required to distinguish a missing persisted handle from a genuinely missing deduction/refund.

## Eliminated

- hypothesis: the frontend's 120-second Promise.race caused the missing refund.
  reason: a client timeout does not cancel the Edge Function fetch, and both failing requests reached Supabase's later 150-second `IDLE_TIMEOUT`; server-side refund control flow still had not been reached.
- hypothesis: Anthropic returned a non-refundable client error.
  reason: all four provider rows are 408, and `classifyFailure` explicitly classifies status 408 as retryable `MODEL_TIMEOUT`; the lifecycle would refund on exhaustion if allowed to reach that branch.
- hypothesis: increasing the frontend or platform timeout is the right fix.
  reason: it would preserve four long provider calls, worsen UX/cost, and does not create a reliable pre-kill refund margin. The bounded retry budget must fit inside existing ceilings.

## Resolution

- root_cause: unbounded nested retry ownership let synchronous onboarding outlive the Edge worker before its pre-save refund; outer lifecycle re-entry also reset Free telemetry to attempt 1. Refund failure state was additionally recorded optimistically, weakening the stale-run backstop.
- fix: commit `75c25412` gives onboarding one bounded provider batch, caps all tiers below request ceilings, disables nested retry/fallback only on onboarding, preserves legacy/non-onboarding retry behavior, records refund truth from the RPC result, and makes the reaper retry-safe by refunding before persisting `refunded=true`.
- verification: original incident complete: local gates, production deployment, cron target, and exact 6-Merit historical remediation all passed. Post-deploy bounded-failure shape is confirmed by one 50-second 408 and no nested attempt, but lifecycle refund truth is again under investigation because `refunded=true` did not correlate to ledger rows through the stored transaction handle.
- files_changed:
  - supabase/functions/analyze-resume/index.ts
  - supabase/functions/analyze-resume/__tests__/onboarding-timeout-budget.test.ts
  - supabase/functions/_shared/analysis-lifecycle.ts
  - supabase/functions/_shared/analysis-lifecycle.refund-boundary.test.ts
  - supabase/functions/reap-stale-analysis-runs/index.ts
  - supabase/functions/reap-stale-analysis-runs/__tests__/reaper.test.ts
