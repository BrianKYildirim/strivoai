# Phase 21: integration-validation-and-cutover - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Prove the end-to-end Merit system with integration tests across every tier-and-purchase path, lock legacy `analysis_results` to read-only, and flip `MERIT_SYSTEM_ENABLED=true` in production to cut the platform over from legacy credits to the Merit path.

In scope:
- TEST-04 (Free signup → shop purchase path), TEST-05 (Free → Pro → Elite upgrade path), TEST-06 (yearly subscribe → monthly reset) integration tests.
- MIG-02: analysis_results read-only lock + migration of the last frontend write path.
- Production cutover choreography (pre-flip checklist, staging soak, flip mechanics, post-flip soak, rollback trigger + procedure).
- SC-5 verification evidence (flag=true AND every gated feature routed through the Merit path).

Out of scope (handled in prior phases or explicitly future):
- TEST-07/08 (Phase 13), TEST-09/10/11 (Phase 14).
- MIG-01 seed-Merits, MIG-03 Stripe mapping, MIG-04 legacy retention, MIG-05 flag plumbing (owned by 10-13).
- Slack/Sentry/APM integrations for alerts (Phase 13 D-15 locks in email-only).
- Observability beyond what Phase 13 D-13 shipped (v_conversion_funnel / v_merit_balance_health views + alert_state).

</domain>

<decisions>
## Implementation Decisions

### Test Strategy & Harness (TEST-04/05/06)
- **D-01:** Offline mock harness, matching the TEST-07 precedent. Deno tests with in-memory mocks of Phase 11 RPC contracts (`check_and_deduct_merits`, `credit_shop_merits`, `reset_subscription_merits`) + mocked Stripe webhook events. Zero external deps; runs in CI alongside existing unit tests.
- **D-02:** Stripe webhook flows simulated by invoking `stripe-webhook-handler` directly with crafted signed fixture payloads (`checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`) carrying valid HMAC signatures. Exercises the real idempotency + signature verification code path — the highest-risk webhook surface.
- **D-03:** TEST-06's 30-day reset simulated by directly invoking the `reset-subscription-merits` edge function for the test user. No `Date.now()` mocking, no cron-state manipulation — exercises the real reset entry point.
- **D-04:** Scenario files live in `supabase/functions/_tests/`: `test-04-free-signup-to-shop.test.ts`, `test-05-upgrade-proration.test.ts`, `test-06-yearly-reset.test.ts`. Matches the `merit_rls_test.ts` convention. Registered in `scripts/run-edge-tests.ps1` so they run with the existing edge test task.

### Legacy analysis_results Lock (MIG-02)
- **D-05:** Enforce the read-only lock by dropping the user `INSERT/UPDATE/DELETE` policies on `analysis_results`. Keep the `SELECT "Users can view their own"` policy. Service role (edge functions) writes unrestricted via RLS bypass. Mirrors the MIG-04 pattern applied to `usage_tracking`.
- **D-06:** Close the frontend bypass at `src/lib/analysisHelpers.ts:120-150` (`saveAnalysisResult`). All `analysis_results` writes move into edge functions that insert via service role **after** a successful `check_and_deduct_merits` call. The frontend helper is reduced to SELECT-only (or deleted if no read path uses it). This is the exact bypass MIG-02 exists to close — without this change the lock is cosmetic.
- **D-07:** Block all user `DELETE` on `analysis_results`. Audit trail preserved. `admin-delete-user` retains service-role delete for account cleanup.
- **D-08:** MIG-02 migration ships and is verified with `MERIT_SYSTEM_ENABLED=false` **before** the flag flip. Lets us prove the new service-role write path works independently of flag-routing behavior.

### Cutover Sequence & Rollback
- **D-09:** Full pre-flip checklist is MANDATORY before touching prod secrets. Runbook with ticked items:
  - TEST-04/05/06/07/08 green in CI on `main`
  - MIG-01 (lifetime Merits seeded to all existing users) verified in prod via query
  - MIG-03 (pre-existing Stripe subscribers mapped + first allowance credited) verified in prod via query
  - Admin-metrics views from Phase 13 D-13 (`v_merit_balance_health`, `v_conversion_funnel`) queryable in prod
  - `alert_state` table present + `check-merit-alerts` scheduled and verified firing (dry-run test alert)
  - MIG-02 migration applied to prod (see D-08) and frontend no longer writes `analysis_results`
- **D-10:** Binary flip, all features at once. `supabase secrets set MERIT_SYSTEM_ENABLED=true --project-ref <prod>` + restart all gated functions. Matches Phase 13 D-05 / D-06 and explicitly accepts Phase 13 D-19's ~30s mixed-state window. No per-feature override env vars — Phase 13 D-05 already rejected that surface area.
- **D-11:** 24-hour staging soak with `MERIT_SYSTEM_ENABLED=true` on staging precedes the production flip. During the soak:
  - Run a scripted walkthrough: Free signup → Resume Analysis (3 Merits) → Career Compass blocked at 2 → shop 3-pack purchase → Career Compass succeeds → Pro upgrade (75 Merits) → Recruiting Lens (8) → Elite upgrade (diff credited) → yearly-reset simulation via `reset-subscription-merits`.
  - `alert_state` must remain clean (zero NFR-11 alert rows for 24h).
  - Any alert fire or walkthrough failure aborts the prod flip until root-caused.
- **D-12:** 2-hour active post-flip soak on production. Owner actively watches:
  - `merit-transaction` log stream across all gated functions
  - `v_conversion_funnel` and `v_merit_balance_health` views
  - `alert_state` table for any new rows
  - Stripe webhook success rate
  - **Success = zero NFR-11 alerts fired AND at least one `merit-transaction` log line observed for every gated feature in the Phase 13 D-07 list** (`analyze-resume`, `analyze-career`, `grade-linkedin`, `recruiting-lens`, `analyze-skills-gap`, `compare-jobs`, interview-prep-* endpoints, `submit-resume-analysis-job`, `submit-career-analysis-job`).
- **D-13:** Rollback trigger = hard + human-in-loop. An NFR-11 alert firing is a **signal**, not an automatic action. `check-merit-alerts` emails the owner; owner decides whether to roll back. No auto-rollback: avoids flag-flapping on transient spikes (e.g., one Stripe retry burst tripping the 2% shop failure threshold).
- **D-14:** Rollback procedure is flag-only: `supabase secrets set MERIT_SYSTEM_ENABLED=false --project-ref <prod>` + restart gated functions. Legacy `usage-checker.ts` path resumes per Phase 13 D-18 (untouched, provably unchanged). `merit_transactions` rows written during the flip window are preserved as durable audit — do NOT reverse them. MIG-02's read-only lock on `analysis_results` stays in place (legacy path doesn't write it anyway after D-06). No schema reverts.
- **D-15:** Flip authority rests with the project owner (`strivolife@gmail.com`) only. Same operator executes both flip and any rollback. Single point of responsibility; clean audit trail.
- **D-16:** Flip timing: low-traffic weekday morning US-ET. Owner available for the full 2h soak; full business-day cushion if rollback is needed. **Avoid Fridays and weekends** — no launches into a window with reduced operator attention.

### SC-5 Verification
- **D-17:** "All features route through the Merit path" is proven by `merit-transaction` log lines, one per gated feature. Phase 13 D-11 already emits `createLogger('merit-gateway').info('merit-transaction', { user_id, amount, source, feature, transaction_id })` on every successful deduction — no new code needed. Evidence = grep of function logs shows ≥1 such line per feature name in the D-07 list during the soak.
- **D-18:** Any gated feature that sees zero organic traffic in the first 90 minutes of the 2h soak is exercised by a **scripted synthetic probe**. Owner runs a PowerShell/bash script (`scripts/sc5-probe.ps1`) that invokes each D-07 feature at least once with a dedicated test account. No refund needed — the flag is already the new reality.
- **D-19:** "Flag = true in prod" is proven by a boot-time log attestation line. Each gated handler emits `merit-flag: enabled=true` at cold start (≈1 added line per handler, reads the existing module-scope `MERIT_SYSTEM_ENABLED` per Phase 13 D-05). Evidence = one such log per function in post-flip logs.
- **D-20:** Evidence captured in `.planning/phases/21-integration-validation-and-cutover/21-SC5-EVIDENCE.md`. Contains: timestamped `merit-transaction` log excerpts grouped by feature, `merit-flag: enabled=true` excerpts per function, `supabase secrets list --project-ref <prod>` confirmation, and the synthetic-probe script output.
- **D-21:** Missing `merit-transaction` log for any D-07 feature = **SC-5 failure**. Do not declare Phase 21 complete. Investigate: did the merit branch actually run? Did the log get suppressed? Was the feature never invoked? Fix root cause before declaring success. No partial credit.
- **D-22:** `21-SC5-EVIDENCE.md` is committed to the repo indefinitely. Log excerpts are plain text; user_ids are UUIDs (no PII). Zero infra cost, permanent audit trail.
- **D-23:** SC-5 is a one-time launch gate, not a regression test. Post-launch changes to gated handlers are guarded by `merit-branch.test.ts`-style unit tests (Phase 13) + NFR-11 alerts. No re-soak on subsequent deploys.
- **D-24:** Owner writes `21-SC5-EVIDENCE.md` during the active 2h soak and commits it **before** `gsd-verifier` runs for Phase 21. Matches D-15's single-operator authority.

### Claude's Discretion
- Exact fixture shapes for the crafted Stripe events in D-02 (event payload JSON, HMAC signing helper). Use `stripe-webhook-handler` test precedent if any exists; otherwise compose from Stripe's documented payload schema.
- Script language for D-18's synthetic probe (PowerShell vs bash) — whichever matches the owner's deploy-script conventions. `scripts/deploy-production.ps1` is PowerShell, so default to PowerShell unless bash is strongly preferred.
- Log line format for D-19's attestation — keep it greppable (single line, stable key).
- Whether to delete `src/lib/analysisHelpers.ts` entirely in D-06 or keep a SELECT-only helper. Depends on how many read callers exist; executor decides.

### Folded Todos
None folded.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` §Testing (TEST-04/05/06) and §Migration (MIG-02) — the four REQ-IDs this phase owns.
- `.planning/ROADMAP.md` §"Phase 21: integration-validation-and-cutover" — the 5 Success Criteria that `VERIFICATION.md` must prove TRUE.
- `APIcontextdocuments/STRIVO_GSD_Milestone_Merit_System.docx` §10 (MIG-02, MIG-05), §11.2 (TEST-04/05/06) — source spec.

### Prior Phase Contracts (read first — these lock the contract Phase 21 must honor)
- `.planning/phases/13-merit-enforcement-and-feature-flag/13-CONTEXT.md` — especially D-05 (env-var flag + module-scope cache), D-06 (in-handler branching shape), D-07 (gated feature list), D-11 (merit-transaction log format), D-13 (admin-metrics views), D-15 (alert transport), D-18 (legacy path untouched), D-19 (mixed-state window).
- `.planning/phases/10-merit-ledger-foundation/` — `merit_transactions` schema and RLS.
- `.planning/phases/11-merit-rpcs-and-reconciliation/` — RPC contracts mocked in TEST-04/05/06.
- `.planning/phases/12-stripe-products-and-webhook/` — webhook handler + `credit_shop_merits` and `reset_subscription_merits` bindings.

### Code Targets & Precedents
- `supabase/functions/analyze-resume/test-07.test.ts` — precedent harness for D-01 (offline mock style).
- `supabase/functions/_tests/merit_rls_test.ts` — directory convention for D-04.
- `supabase/functions/stripe-webhook-handler/index.ts` — target for D-02 crafted-signed-event tests.
- `supabase/functions/reset-subscription-merits/index.ts` — direct invocation target for D-03.
- `supabase/functions/_shared/merit-gateway.ts` — emits the `merit-transaction` log line that D-17 depends on.
- `supabase/functions/_shared/usage-checker.ts` — legacy path that D-14's rollback restores (Phase 13 D-18 guarantees it's unchanged).
- `supabase/migrations/20251222223116_8abce0df-2f95-472e-a9e5-dca9a6d69c53.sql` — `analysis_results` table + current INSERT RLS policy (MIG-02 migration target).
- `src/lib/analysisHelpers.ts:120-150` (`saveAnalysisResult`) — frontend insert path closed by D-06.
- `scripts/run-edge-tests.ps1` — registration point for D-04 scenario files.
- `scripts/deploy-production.ps1`, `scripts/deploy-staging.ps1` — cutover execution scripts; secrets-set invocation lives here.

### Observability Targets (Phase 13 D-13)
- `v_conversion_funnel`, `v_merit_balance_health` — views watched during D-12 soak.
- `alert_state` table + `check-merit-alerts` scheduled function — D-13 rollback trigger source.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`supabase/functions/_shared/merit-gateway.ts` + `createLogger('merit-gateway')`:** Phase 13 D-11 already emits the exact `merit-transaction` log line that D-17 uses as SC-5 evidence. No additional logging code needed.
- **`supabase/functions/analyze-resume/test-07.test.ts`:** Phase 13's refund test is the direct template for TEST-04/05/06 (offline Deno harness, mocked RPCs, mocked Stripe events). Copy the fixture patterns.
- **`supabase/functions/_tests/merit_rls_test.ts`:** Establishes the `_tests/` cross-function scenario-file convention; three new files land there.
- **Phase 13 D-13 admin-metrics views (`v_merit_balance_health`, `v_conversion_funnel`):** Live Postgres views watched during the 2h post-flip soak (D-12).
- **Phase 13 D-15 `check-merit-alerts` + `alert_state` table:** The rollback trigger source for D-13. Already emails the admin.
- **`scripts/deploy-production.ps1` / `scripts/deploy-staging.ps1`:** Cutover execution scripts; the flip command (`supabase secrets set MERIT_SYSTEM_ENABLED=true`) is added here, not in a new script.

### Established Patterns
- **Service-role-only writes on ledger tables** (Phase 10 D-17; MIG-04 for `usage_tracking`). MIG-02 follows the same pattern.
- **Env-var feature flags cached at module scope** (Phase 13 D-05; precedents `ANTHROPIC_MODEL_TEXT`, `INTERNAL_JOB_SECRET`). D-10's flip is a single `supabase secrets set` + restart.
- **Offline Deno tests with in-memory mocks** (TEST-07 in `analyze-resume/test-07.test.ts`). TEST-04/05/06 follow verbatim.
- **Inline `if (MERIT_SYSTEM_ENABLED) { new_path } else { legacy_path }` branching at the top of every gated handler** (Phase 13 D-06). D-19's boot-time attestation log sits next to that branch.

### Integration Points
- `supabase/migrations/` — new MIG-02 migration file dropping user INSERT/UPDATE/DELETE on `analysis_results`.
- `supabase/functions/_tests/` — three new scenario files for TEST-04/05/06.
- `scripts/run-edge-tests.ps1` — registration line for the new scenario files.
- `scripts/deploy-production.ps1` — cutover orchestration (checklist verification helpers, secrets-set invocation).
- `scripts/sc5-probe.ps1` (new) — D-18 synthetic probe for low-traffic gated features.
- Every gated handler in Phase 13 D-07 — add one `merit-flag: enabled=true` boot-time log line (D-19) + migrate any remaining frontend `analysis_results.insert()` call sites (D-06).

</code_context>

<specifics>
## Specific Ideas

- **TEST-07 is the template, not a reference.** Copy its fixture layout, module-mock shape, and assertion style into TEST-04/05/06. Avoid inventing a second harness convention.
- **MIG-04 (legacy usage_tracking lock) is the template for MIG-02.** Same RLS-policy-drop approach applied to `analysis_results`.
- **The 24-hour staging soak and 2-hour production soak are not optional.** The walkthrough script and the grep-for-merit-transaction-logs step both run against real environments. No "simulated" soak.
- **Do not wire auto-rollback.** The NFR-11 alert is a signal; the owner decides. Automation here risks flag-flapping.
- **SC-5 evidence is a committed repository artifact** (`21-SC5-EVIDENCE.md`). It is the audit-of-record — treat it like any other phase output.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 21-integration-validation-and-cutover*
*Context gathered: 2026-04-19*
