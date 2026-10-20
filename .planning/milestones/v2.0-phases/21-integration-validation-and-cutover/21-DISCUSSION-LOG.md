# Phase 21: integration-validation-and-cutover - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `21-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-19 (session resumed from interrupted checkpoint dated 2026-04-18)
**Phase:** 21-integration-validation-and-cutover
**Areas discussed:** Test strategy & harness, Legacy analysis_results lock (MIG-02), Cutover sequence & rollback, SC-5 verification

---

## Test strategy & harness

### Q1: What harness style for TEST-04/05/06?

| Option | Description | Selected |
|--------|-------------|----------|
| Offline mocks (like TEST-07) | Deno tests with in-memory mock of Phase 11 RPC contracts + mock Stripe webhook events. Runs in CI with zero external deps. | ✓ |
| Live integration tests vs staging DB | Real Supabase staging + Stripe test mode. Higher fidelity, brittle. | |
| Hybrid: offline state machine + live smoke | Offline assertions + thin live staging smoke. | |

**User's choice:** Offline mocks (like TEST-07)
**Notes:** Matches the TEST-07 precedent; proves business logic deterministically without external creds.

### Q2: How should Stripe webhook flows be simulated in these tests?

| Option | Description | Selected |
|--------|-------------|----------|
| Invoke stripe-webhook-handler with crafted signed events | Build fixture payloads (checkout.session.completed, invoice.paid, customer.subscription.updated) with valid HMAC signatures; call the handler directly. | ✓ |
| Mock the webhook handler entirely | Call credit_shop_merits / reset_subscription_merits RPCs directly. | |
| Stripe CLI `stripe trigger` against a live listener | Exercises real listener but binds tests to Stripe network. | |

**User's choice:** Invoke stripe-webhook-handler with crafted signed events
**Notes:** Deterministic, offline, exercises the real idempotency + signature code path — the highest-risk webhook surface.

### Q3: For TEST-06 (yearly plan → reset after 30 days), how should the 30-day clock advance be simulated?

| Option | Description | Selected |
|--------|-------------|----------|
| Directly invoke reset-subscription-merits for the user | Simulate monthly cadence by calling the Phase 11 reset RPC via the reset-subscription-merits edge function. | ✓ |
| Backdate subscription anniversary + let scheduled job run | Requires cron-state manipulation. | |
| Mock Date.now() inside the test | Cleanest in unit, doesn't exercise real reset entry point. | |

**User's choice:** Directly invoke reset-subscription-merits for the user
**Notes:** Proves the real reset path without clock manipulation.

### Q4: Where should TEST-04/05/06 live?

| Option | Description | Selected |
|--------|-------------|----------|
| supabase/functions/_tests/ as scenario files | test-04-free-signup-to-shop.test.ts, test-05-upgrade-proration.test.ts, test-06-yearly-reset.test.ts. Matches _tests/ convention (merit_rls_test.ts). | ✓ |
| Colocated under each feature function | Splits a cross-feature scenario. | |
| New top-level directory | Requires new test runner wiring. | |

**User's choice:** supabase/functions/_tests/ as scenario files
**Notes:** Registered in run-edge-tests.ps1. Consistent with existing _tests/ location for cross-function tests.

---

## Legacy analysis_results lock (MIG-02)

### Q1: How should the read-only lock on analysis_results be enforced?

| Option | Description | Selected |
|--------|-------------|----------|
| Drop user INSERT/UPDATE/DELETE policies | Remove the user-write policy. Keep SELECT. Service role (edge functions) writes unrestricted. Matches MIG-04 pattern for usage_tracking. | ✓ |
| Replace INSERT with WITH CHECK (false) | Explicit deny visible in schema diff. | |
| Add trigger that blocks writes unless session claim set | Overengineered. | |

**User's choice:** Drop user INSERT/UPDATE/DELETE policies
**Notes:** Clean schema diff; service role in edge functions bypasses RLS as designed.

### Q2: src/lib/analysisHelpers.ts:129 calls .from('analysis_results').insert() from the browser — what's the plan?

| Option | Description | Selected |
|--------|-------------|----------|
| Move all writes into edge functions | Each gated feature inserts via service role AFTER Merit deduction succeeds. Frontend helper reduced to SELECT-only or deleted. | ✓ |
| Keep helper, call a new RPC that verifies a recent merit_transactions row | Racy. | |
| Keep helper, rely on flag | User-visible errors at flip time. | |

**User's choice:** Move all writes into edge functions
**Notes:** Only path that enforces "cannot regenerate without spending Merits." Frontend-side insert is the exact bypass MIG-02 must close.

### Q3: Should users be able to DELETE their own analysis_results rows after the lock?

| Option | Description | Selected |
|--------|-------------|----------|
| Block all user DELETE | Consistent with read-only framing. Preserves audit trail. admin-delete-user retains service-role delete. | ✓ |
| Allow user DELETE on own rows | Not in scope. | |
| You decide | | |

**User's choice:** Block all user DELETE
**Notes:** No dashboard UI depends on user-initiated delete.

### Q4: When does the MIG-02 migration land relative to MERIT_SYSTEM_ENABLED=true?

| Option | Description | Selected |
|--------|-------------|----------|
| Migration lands BEFORE flag flip | Deploy migration + edge-function writes first; verify with flag=false; then flip. | ✓ |
| Migration + flag flip in same deploy | Atomic but harder to triage. | |
| Migration AFTER flag flip | Leaves bypass open. | |

**User's choice:** Migration lands BEFORE flag flip
**Notes:** Lets us validate the new write path independently from flag routing behavior.

---

## Cutover sequence & rollback

### Q1: What must be TRUE on production before the MERIT_SYSTEM_ENABLED flip?

| Option | Description | Selected |
|--------|-------------|----------|
| Full pre-flip checklist | TEST-04/05/06/07/08 green in CI + MIG-01 + MIG-03 verified in prod + admin-metrics (D-13 views) queryable + alert_state table live + check-merit-alerts scheduled. Written runbook. | ✓ |
| Tests-green only | Trust Phase 10-20 verifications for MIG/alerting. | |
| Staging soak + CI green | Longest calendar time. | |

**User's choice:** Full pre-flip checklist
**Notes:** Item-by-item sign-off prevents a flip that finds a missing prod migration.

### Q2: How should the production flip actually happen?

| Option | Description | Selected |
|--------|-------------|----------|
| Binary flip, all features at once | `supabase secrets set MERIT_SYSTEM_ENABLED=true` + restart all gated functions. Matches Phase 13 D-05 / D-19. | ✓ |
| Staged per-feature rollout | Adds config surface D-05 avoided. | |
| Percentage-based canary | Significant new code not covered by D-06. | |

**User's choice:** Binary flip, all features at once
**Notes:** Accept the ~30s mixed-state window (Phase 13 D-19). Zero new config surface.

### Q3: What triggers a rollback (flag flip back to false)?

| Option | Description | Selected |
|--------|-------------|----------|
| Hard triggers + human-in-loop | NFR-11 alerts fire AND operator confirms. No auto-rollback. | ✓ |
| Automatic rollback on alert breach | Risks flag-flapping on noisy alerts. | |
| Time-boxed soft window | Subjective, drifts over time. | |

**User's choice:** Hard triggers + human-in-loop
**Notes:** check-merit-alerts emails the admin; admin decides. Avoids flapping.

### Q4: What does a rollback actually do — flag only, or also data cleanup?

| Option | Description | Selected |
|--------|-------------|----------|
| Flag-only rollback, merit_transactions preserved | Flip flag back + restart. Legacy usage-checker resumes (D-18). merit_transactions stay as audit. MIG-02 lock stays. | ✓ |
| Flag flip + MIG-02 reversal | Only needed if frontend still writes; we are closing that path. | |
| Flag flip + merit_transactions reconciliation | Refund RPC re-runs. | |

**User's choice:** Flag-only rollback, merit_transactions preserved
**Notes:** Data is additive; flag flip alone restores legacy behavior. No schema reverts.

### Q5: Does staging need to flip MERIT_SYSTEM_ENABLED=true first, and for how long?

| Option | Description | Selected |
|--------|-------------|----------|
| 24-hour staging soak with flag=true | Scripted walkthrough on staging, no alerts for 24h. | ✓ |
| Short staging verify (2-4h) | Faster, smaller sample. | |
| No staging flip precondition | CI only. | |

**User's choice:** 24-hour staging soak with flag=true
**Notes:** Scripted walkthrough: Free signup → Resume Analysis → Career Compass block → shop purchase → Pro upgrade → yearly reset sim.

### Q6: How long is the production post-flip active monitoring (soak) window?

| Option | Description | Selected |
|--------|-------------|----------|
| 2-hour active soak | Owner watches admin-metrics views + alert_state + logs. Success = zero NFR-11 alerts AND one merit-transaction log per gated feature. | ✓ |
| 24-hour passive soak | No active observation. | |
| Rolling 1-week soak | Slowest. | |

**User's choice:** 2-hour active soak
**Notes:** Success criteria are explicit: zero NFR-11 alerts + at least one merit-transaction log line per gated feature within 2h.

### Q7: Who has authority to flip and to roll back?

| Option | Description | Selected |
|--------|-------------|----------|
| Project owner only | strivolife@gmail.com holds secrets, one hand on the lever. | ✓ |
| Any admin with secrets access | Broader coverage, weaker audit. | |
| Flip by owner, rollback by anyone | Faster MTTR. | |

**User's choice:** Project owner only
**Notes:** Matches current operator reality. Audit trail preserved.

### Q8: When should the production flip happen?

| Option | Description | Selected |
|--------|-------------|----------|
| Low-traffic window, weekday business hours | Weekday morning US-ET; owner available for full 2h soak; avoid Fridays/weekends. | ✓ |
| Weekend maintenance window | User load minimal but owner attention weaker. | |
| Immediately after checklist green | Unscheduled. | |

**User's choice:** Low-traffic window, weekday business hours
**Notes:** Avoid Fridays and weekends. Flip on low-traffic weekday morning.

---

## SC-5 verification

### Q1: What artifact proves "all features route through the Merit path" for SC-5?

| Option | Description | Selected |
|--------|-------------|----------|
| merit-transaction log lines, one per gated feature | Phase 13 D-11 already emits `createLogger('merit-gateway').info('merit-transaction', ...)` on every deduction. Evidence = at least one such log per feature name. | ✓ |
| merit_transactions rows grouped by feature | Query rows post-flip. More auditable; same signal. | |
| Synthetic canary + real traffic combined | Scripted post-flip walkthrough + organic traffic. | |

**User's choice:** merit-transaction log lines, one per gated feature
**Notes:** Zero new code. Grepable, durable.

### Q2: How do we handle gated features that might not receive organic traffic in the 2-hour soak?

| Option | Description | Selected |
|--------|-------------|----------|
| Scripted synthetic probe per unused feature | Owner runs a script at T+90min invoking each feature at least once with a test account. | ✓ |
| Accept gap, rely on merit-branch unit tests (Phase 13) | Weaker real-world evidence. | |
| Extend soak until all features organically hit | Could take days. | |

**User's choice:** Scripted synthetic probe per unused feature
**Notes:** New `scripts/sc5-probe.ps1` registered for this.

### Q3: How is the "flag = true in prod" side of SC-5 proven?

| Option | Description | Selected |
|--------|-------------|----------|
| Log attestation line at cold start | Each gated handler emits `merit-flag: enabled=true` at boot. Soak evidence = one log per function. | ✓ |
| Direct `supabase secrets list` check + screenshot | Manual, one-shot. | |
| Dedicated admin edge function returns flag status | Reusable but adds one more surface. | |

**User's choice:** Log attestation line at cold start
**Notes:** ~1 line per gated handler. Testable and auditable.

### Q4: Where does the SC-5 evidence get captured for audit / VERIFICATION.md?

| Option | Description | Selected |
|--------|-------------|----------|
| Single SC-5-EVIDENCE.md with timestamped log excerpts | `.planning/phases/21-integration-validation-and-cutover/21-SC5-EVIDENCE.md`. Human-readable, committed. | ✓ |
| Structured JSON evidence file collected by script | More automated; more code to build. | |
| Inline in VERIFICATION.md only | Skip a separate evidence file. | |

**User's choice:** Single SC-5-EVIDENCE.md with timestamped log excerpts
**Notes:** Committed artifact cited by VERIFICATION.md.

### Q5: What happens if a gated feature produces zero merit-transaction logs during the 2h soak even after the synthetic probe?

| Option | Description | Selected |
|--------|-------------|----------|
| Treat as SC-5 failure, do not declare success | Investigate and fix before declaring Phase 21 done. No partial-credit. | ✓ |
| Mark as partial, document gap in VERIFICATION.md | Weaker guarantee. | |
| Rollback and retry | Heavier-handed. | |

**User's choice:** Treat as SC-5 failure, do not declare success
**Notes:** Root-cause: did the merit branch run? Did the log get suppressed?

### Q6: How long is SC-5 evidence retained?

| Option | Description | Selected |
|--------|-------------|----------|
| Committed to repo indefinitely | Lives in git history. UUIDs, no PII. Zero infra cost. | ✓ |
| 30-day retention then rotate | Summary-only after 30 days. | |
| Raw logs only (no committed artifact) | Rely on Supabase log retention. | |

**User's choice:** Committed to repo indefinitely
**Notes:** Permanent audit trail.

### Q7: Is SC-5 verification re-run after later deploys that touch gated handlers?

| Option | Description | Selected |
|--------|-------------|----------|
| No — one-time SC-5 gate at launch | Post-launch guarded by Phase 13 unit tests + NFR-11 alerts. | ✓ |
| Yes — re-run full soak after any handler edit | High friction. | |
| Re-run on merit-gateway or flag-read changes only | Narrow re-verification. | |

**User's choice:** No — one-time SC-5 gate at launch
**Notes:** Launch milestone, not a regression test.

### Q8: Who writes the SC-5 evidence file and when?

| Option | Description | Selected |
|--------|-------------|----------|
| Owner during the 2h soak, committed before declaring Phase 21 done | Single operator authority per D-15. | ✓ |
| gsd-verifier synthesizes it from logs at verification time | Adds verifier-agent coupling to prod logs. | |
| Split: owner captures raw; verifier assembles | Two-step handoff. | |

**User's choice:** Owner during the 2h soak, committed before declaring Phase 21 done
**Notes:** Matches single-operator authority decided in Cutover area.

---

## Claude's Discretion

- Exact fixture shapes for crafted Stripe events in TEST-04/05/06 (event payload JSON, HMAC signing helper implementation).
- Script language for the SC-5 synthetic probe (PowerShell vs bash) — default to PowerShell to match existing `scripts/deploy-*.ps1` conventions unless bash is strongly preferred.
- Log line format for the boot-time flag attestation — keep it greppable.
- Whether to delete `src/lib/analysisHelpers.ts` entirely in MIG-02 or keep a SELECT-only helper — executor decides based on read callers.

## Deferred Ideas

None — discussion stayed within phase scope.
