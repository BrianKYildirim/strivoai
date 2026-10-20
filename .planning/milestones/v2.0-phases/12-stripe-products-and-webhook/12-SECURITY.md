***

phase: 12
slug: stripe-products-and-webhook
status: verified
threats\_open: 0
asvs\_level: 1
created: 2026-04-16
-------------------

# Phase 12 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

**Plans audited:** 12-06, 12-08, 12-09

***

## Trust Boundaries

| Boundary                              | Description                                                                             | Data Crossing                                            |
| ------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Stripe -> webhook handler             | External webhook payload crosses into DB writes                                         | Stripe event JSON (subscription, checkout, invoice data) |
| Metadata -> lookup                    | `session.metadata.user_id` is attacker-controllable if session created outside our flow | User ID string                                           |
| pg\_cron -> reset-subscription-merits | Internal cron invocation triggers balance changes                                       | Merit balance integers                                   |
| Webhook -> DB                         | All writes go through SECURITY DEFINER RPCs or service-role UPDATE on profiles          | Profile fields, merit balances, subscription state       |

***

## Threat Register

| Threat ID  | Category               | Component                            | Disposition      | Status | Evidence                                                                                                                                                                                                                                                           |
| ---------- | ---------------------- | ------------------------------------ | ---------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-12-01    | Spoofing               | webhook entry                        | mitigate         | CLOSED | `stripe.webhooks.constructEventAsync` called at index.ts:126; missing header returns 401 at line 117; constructEventAsync throw returns 400 at line 138                                                                                                            |
| T-12-02    | Tampering              | duplicate webhook -> double credit   | mitigate         | CLOSED | 23505 duplicate-insert branch at index.ts:164; `stripe_payment_intent_id UNIQUE` constraint in 20260414000000\_merit\_ledger\_foundation.sql:55; idempotency check in credit\_shop\_merits RPC at merit\_rpcs.sql:289-301                                          |
| T-12-03    | Tampering              | concurrent upgrade + deduction race  | mitigate         | CLOSED | `FOR UPDATE` row lock in `grant_upgrade_diff` at 20260415000001\_phase\_12\_stripe\_products\_webhook.sql:51                                                                                                                                                       |
| T-12-04    | Information Disclosure | wrong-user credit via metadata spoof | mitigate         | CLOSED | `tryUpdateById(metaUserId)` tried first for checkout events at index.ts:360; `resolvedUserId` only set if `r.matched && r.resolved` (line 362-365); profile row must exist for write to succeed                                                                    |
| T-12-05    | Denial of Service      | Stripe retry storm from 5xx          | mitigate         | CLOSED | Missing profile returns 200 `profileFound:false` at index.ts:423; only DB errors and true RPC failures return 5xx                                                                                                                                                  |
| T-12-06    | Elevation              | hand-rolled HMAC bypass              | accept->mitigate | CLOSED | No hand-rolled HMAC paths in index.ts; only `constructEventAsync` is used (verified: no `createHmac`, no `timingSafeEqual` in handler); comment at line 18 documents D-18 invariant                                                                                |
| T-12-08-01 | Tampering              | profile lookup 500 path              | mitigate         | CLOSED | `dbError?: boolean` in `TryUpdateResult` (index.ts:86); all four `tryUpdateBy*` helpers set `dbError: true` on DB error (lines 287, 306, 328, 347); `dbErrorEncountered` tracking returns 500 at line 411                                                          |
| T-12-08-02 | Denial of Service      | addOneMonth overflow                 | mitigate         | CLOSED | Month-end clamping via `addOneMonthIso` in `_shared/date-utils.ts:14-19`; `targetMonth` clamp logic present; both `reset-subscription-merits/index.ts` (line 88) and `stripe-webhook-handler/index.ts` (lines 451, 573) import and use this shared utility         |
| T-12-09-01 | Repudiation            | Idempotency                          | mitigate         | CLOSED | Test `test-08-duplicate-event-no-double-credit` in index.test.ts:397-448 fires same event twice; asserts `body2.duplicate === true` (line 442) and `rpcCalls.length === 1` after second fire (line 444)                                                            |
| T-12-09-02 | Information Disclosure | Signature verification               | mitigate         | CLOSED | `missing-signature-401` test asserts `res.status === 401` and `body.error === "invalid_signature"` with `insertCalls.length === 0` (lines 330-334); `bad-signature-400` test asserts `res.status === 400` and `body.error === "invalid_signature"` (lines 358-360) |

*Status: open / closed*
*Disposition: mitigate (implementation required) / accept (documented risk) / transfer (third-party)*

***

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
| ------- | ---------- | --------- | ----------- | ---- |
|         |            |           |             |      |

No accepted risks. T-12-06 was originally `accept->mitigate` and is CLOSED as mitigated (SDK-only verification, no custom crypto).

***

## Unregistered Threat Flags

* **12-06-SUMMARY.md:** No threat flags raised.
* **12-08-SUMMARY.md:** "None -- changes are within existing trust boundaries."
* **12-09-SUMMARY.md:** No threat flags raised.

No unregistered flags.

***

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By               |
| ---------- | ------------- | ------ | ---- | -------------------- |
| 2026-04-16 | 10            | 10     | 0    | gsd-security-auditor |

***

## Audit Notes

* `addOneMonthIso` was extracted to `_shared/date-utils.ts` (not inline in `reset-subscription-merits/index.ts` as originally specified in T-12-08-02 mitigation plan). Both consuming functions import from the shared utility, which contains the `targetMonth` clamping logic. Mitigation is satisfied.
* `grant_upgrade_diff` RPC grants `service_role` only (not `authenticated`), consistent with webhook-only invocation path.
* `stripe_webhook_events` table has RLS enabled with zero permissive policies -- service role bypass is the only write path (SEC-06 anti-pattern explicitly avoided per migration comment).

***

## Sign-Off

* [x] All threats have a disposition (mitigate / accept / transfer)
* [x] Accepted risks documented in Accepted Risks Log
* [x] `threats_open: 0` confirmed
* [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-16
