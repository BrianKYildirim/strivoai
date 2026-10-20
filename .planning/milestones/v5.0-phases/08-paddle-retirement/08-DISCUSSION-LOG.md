# Phase 8: Paddle Retirement - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-07-09
**Phase:** 8-Paddle Retirement
**Areas discussed:** Expiration Gate Evidence, Removal vs Safe-Prep Boundary, Billing History Preservation, User-Facing Copy Cleanup, Verification & Rollback Standard

---

## Expiration Gate Evidence

| Question | Options Presented | User's Choice |
| --- | --- | --- |
| What should count as enough evidence before destructive Paddle removal? | Prod app records + Paddle export; Prod app records only; Paddle export only; You decide | Prod app records + Paddle export |
| Should the phase require the operator to re-run the live prod read at execution time? | Yes, re-run at execution time; No, prior evidence is enough; Re-run only if removal touches DB columns | Yes, re-run at execution time |
| How should conflicting evidence be handled if prod app records and Paddle export disagree? | Stop and document blocker; Trust Paddle as billing authority; Trust prod app state; You decide | Stop and document blocker |
| What exact evidence should downstream planners preserve in artifacts without exposing secrets or PII? | Counts + redacted identifiers + query/export provenance; Counts only; Full raw export kept outside repo, repo links to operator note | Counts + redacted identifiers + query/export provenance |

**Notes:** The gate is intentionally conservative. Prior `0 in-flight` evidence is context only, not permission to remove.

---

## Removal vs Safe-Prep Boundary

| Question | Options Presented | User's Choice |
| --- | --- | --- |
| If the gate is clear, how aggressive should Phase 8 be? | Full Paddle retirement; Inert compatibility stubs; Safe-prep only even if clear; You decide | Full Paddle retirement |
| Should the legacy paddle-webhook become a 410-style shim first, or be removed from deployed function config entirely when the gate is clear? | Remove entirely; 410 shim first; Two-step: 410 in preview, remove in prod after smoke | Remove entirely |
| How should database removal be scoped if the gate is clear? | Drop Paddle-only structures; Null columns but keep schema; Remove table only, keep profile columns | Drop Paddle-only structures |
| Should generated Supabase types be regenerated as part of the phase after DB/schema changes? | Yes, regenerate and include types; No, leave generated types until a later schema sync; Only if code references fail | Yes, regenerate and include types |
| If the gate is not clear, what safe-prep should still happen? | Prepare but do not apply destructive changes; Only document the blocker; Apply non-DB cleanup only | Prepare but do not apply destructive changes |

**Notes:** The selected path rejects public inert compatibility endpoints after a clear gate.

---

## Billing History Preservation

| Question | Options Presented | User's Choice |
| --- | --- | --- |
| What should remain after Paddle retirement for audit/support/accounting? | Generic billing facts only; Redacted legacy Paddle identifiers; Raw Paddle identifiers in archive only; You decide | Generic billing facts only |
| Should the paddle_webhook_events.payload history be preserved anywhere before dropping the table? | No repo/live preservation; external operator archive only if legally needed; Summarize counts/statuses in planning docs; Migrate selected payload fields into a generic billing audit table | No repo/live preservation; external operator archive only if legally needed |
| Should historical subscription_tier, subscription_status, and current_period_end remain on profiles after Paddle identifiers are dropped? | Yes, keep generic access state; Keep only tier/status, remove period end; Move all billing state out of profiles | Yes, keep generic access state |
| Should the phase include a data migration that explicitly verifies no user access will change after dropping Paddle fields? | Yes, compare before/after access classification; No, rely on tests after migration; Only for paid users | Yes, compare before/after access classification |

**Notes:** Preserve access state, not provider-specific Paddle identifiers or payloads.

---

## User-Facing Copy Cleanup

| Question | Options Presented | User's Choice |
| --- | --- | --- |
| How much Paddle-facing copy should Phase 8 update? | All user/admin-facing Paddle copy; Only app UI, leave legal/docs for later review; Only docs/env references; You decide | All user/admin-facing Paddle copy |
| What should replace Paddle refund language? | Strivo support + current payment processor-neutral wording; Stripe-specific wording; Strivo support only, no processor named | Strivo support + current payment processor-neutral wording |
| Should obsolete Paddle tests be removed with code, or rewritten as negative guards? | Remove Paddle webhook tests with the function; Keep tests as historical security guards; Rewrite all Paddle tests against a 410 shim | Remove Paddle webhook tests with the function |
| How should docs mention Paddle after retirement? | Historical notes only, no live env/config instructions; Remove every Paddle mention from docs; Keep retired-env entry with do not set warning | Historical notes only, no live env/config instructions |
| Should email templates that default payment_method to Paddle be changed even if that event path may be legacy/admin-only? | Yes, remove Paddle defaults everywhere; Only change templates reachable from current UI; Leave legacy/admin-only templates unchanged | Yes, remove Paddle defaults everywhere |

**Notes:** Processor-neutral wording is preferred over Stripe-specific legal/refund claims.

---

## Verification & Rollback Standard

| Question | Options Presented | User's Choice |
| --- | --- | --- |
| What verification gate should Phase 8 require before considering Paddle retired? | Full preview-to-prod operator ceremony; Targeted local tests + SQL rollback only; Preview only, no prod re-verification; You decide | Full preview-to-prod operator ceremony |
| What rollback artifacts should be required? | Rollback SQL + redeploy instructions + type regeneration reversal notes; Rollback SQL only; Git revert only | Rollback SQL + redeploy instructions + type regeneration reversal notes |
| Which billing smoke checks should be mandatory after Paddle cleanup? | Stripe subscription + access + Merits checks; Access checks only; No billing smoke unless code changes touch Stripe | Stripe subscription + access + Merits checks |
| Should the phase require a negative-reference sweep that fails if live surfaces still mention Paddle? | Yes, with allowlisted historical/audit paths only; Yes, zero Paddle mentions anywhere; No, rely on targeted file review | Yes, with allowlisted historical/audit paths only |
| Should Phase 8 update verify:baseline/edge test allowlists to remove obsolete Paddle tests and add negative guards? | Yes, update the gate; No, keep baseline unchanged; Only remove failing tests | Yes, update the gate |

**Notes:** Verification must prove the absence of live Paddle surfaces and the survival of Stripe/access/Merit behavior.

---

## Agent Discretion

- Exact SQL implementation and migration ordering.
- Redaction format for gate evidence.
- Negative-reference sweep implementation and allowlist mechanics.
- Billing smoke test command selection.

## Deferred Ideas

None.
