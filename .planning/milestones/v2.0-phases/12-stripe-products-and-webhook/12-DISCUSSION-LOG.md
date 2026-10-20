# Phase 12: stripe-products-and-webhook - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-14
**Phase:** 12-stripe-products-and-webhook
**Areas discussed:** Yearly Merit grant mechanism, Webhook handler structure, Upgrade differential + MIG-03 backfill, Shop credit path + promo coupon

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Yearly Merit grant mechanism | SUB-11/12: yearly plans billed once but must grant 75/150 Merits monthly | ✓ |
| Webhook: extend vs new handler | BACK-05 literal vs extending Phase 07's stripe-webhook | ✓ |
| Upgrade differential + backfill | SUB-14 diff math location + MIG-03 existing-subscriber first grant | ✓ |
| Shop credit path + promo coupon | Which event credits shop + MIG-06 promo preservation | ✓ |

**User's choice:** All four selected.

---

## Yearly Merit Grant Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid: webhook day-0 + pg_cron refills | checkout.session.completed grants month-0; nightly pg_cron sweep for subsequent months. Recommended. | ✓ |
| Pure pg_cron (webhook just sets reset_date) | All grants including day-0 come from cron sweep; day-0 Merits delayed up to 24h | |
| Scheduled edge function (Deno cron) | Same hybrid shape but sweep runs as Supabase scheduled edge function | |
| Invoice-derived only | Rely solely on invoice.payment_succeeded; broken for yearly plans | |

**User's choice:** Hybrid: webhook day-0 + pg_cron refills
**Notes:** Locked as D-01. Hot-path purchase flow stays webhook-driven, cold-path refills live in one self-healing sweep.

### Follow-up: pg_cron enablement

| Option | Description | Selected |
|--------|-------------|----------|
| Enable pg_cron in this phase's migration | CREATE EXTENSION + cron.schedule in Phase 12 migration. Self-contained. Recommended. | ✓ |
| Invoke an edge function from cron (BACK-03 shape) | pg_cron → pg_net.http_post → reset-subscription-merits edge function | |
| Pure SQL sweep inside a pg_cron job | cron.schedule runs PL/pgSQL loop directly, no edge function | |

**User's choice:** Enable pg_cron in this phase's migration (locked as D-02).

### Follow-up: Batching ownership

| Option | Description | Selected |
|--------|-------------|----------|
| Edge function batches, cron invokes repeatedly | cron fires every N minutes; fn selects up to 1k due users. Bounded memory, backpressure. Recommended. | ✓ |
| Single nightly cron tick, edge function loops internally | One cron fire per night; fn loops until zero remain; timeout risk at scale | |
| Cron handles it in SQL, no edge function batching | pg_cron does the sweep in a single SQL statement; drifts from BACK-03 literal | |

**User's choice:** Edge function batches, cron invokes repeatedly (locked as D-03).

---

## Webhook Handler Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Extend existing stripe-webhook in place | Add new events to HANDLED_EVENTS, reuse scaffolding; zero cutover risk. Recommended. | |
| Build new stripe-webhook-handler alongside | Literal BACK-05 compliance; double sig-verify during overlap; dashboard URL swap | ✓ |
| Extend + rename to stripe-webhook-handler | Move existing file, update deploys, one URL swap | |

**User's choice:** Build new stripe-webhook-handler alongside
**Notes:** Locked as D-06. Keeps Phase 07's v1.0 handler untouched; v2.0 logic lives in its own function.

### Follow-up: Overlap model

| Option | Description | Selected |
|--------|-------------|----------|
| New handler takes over ALL events immediately | Stripe dashboard URL swaps at Phase 12 deploy; new handler re-implements everything. Single source of truth. Recommended. | ✓ |
| Split: old handles legacy, new handles Merit events | Two Stripe webhook endpoints; two sig-verify surfaces; double-fire complexity | |
| Flag-gated forwarding via MERIT_SYSTEM_ENABLED | New handler forwards to old when flag is false; re-sign-verify risk | |

**User's choice:** New handler takes over ALL events immediately (locked as D-07).

---

## Upgrade Differential + Existing-Subscriber Backfill

### Upgrade diff location

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated RPC grant_upgrade_diff | New atomic SQL function; prevents TOCTOU between read and credit. Recommended. | ✓ |
| Inline in webhook TS code | Read balance via get_merit_balance, compute diff in TS, call credit RPC; not atomic | |
| Overload reset_subscription_merits | Reset RPC learns an 'upgrade_to' arg; bleeds tier-transition logic into reset | |

**User's choice:** Dedicated RPC grant_upgrade_diff (locked as D-13).
**Notes:** Added as a Phase 11 contract ask in CONTEXT.md canonical_refs.

### MIG-03 backfill strategy

| Option | Description | Selected |
|--------|-------------|----------|
| One-shot backfill migration | PL/pgSQL block at deploy time; source='phase-12-backfill' trace. Recommended. | ✓ |
| Lazy: next invoice.payment_succeeded fires it | No backfill; yearly subs wait up to 365 days | |
| Synthetic webhook replay | Deploy script POSTs synthetic events to the handler; reuses webhook path | |

**User's choice:** One-shot backfill migration (locked as D-15).
**Notes:** Creates migration ordering dependency on Phase 11 — the RPCs must exist before the Phase 12 backfill runs.

---

## Shop Credit Path + Promo Coupon

### Shop credit event source

| Option | Description | Selected |
|--------|-------------|----------|
| checkout.session.completed (payment mode) | Session metadata carries user_id + pack_size; two-layer idempotency. Recommended. | ✓ |
| payment_intent.succeeded | Fires slightly earlier but metadata lives on the session, requiring re-fetch | |
| Both (belt + braces) | Handler processes whichever fires first; extra resilience, extra complexity | |

**User's choice:** checkout.session.completed (payment mode) (locked as D-16).

### Promo coupon provisioning

| Option | Description | Selected |
|--------|-------------|----------|
| Scripted provisioning | scripts/provision-stripe-coupon.mjs idempotent by coupon id. Recommended. | ✓ |
| Manual Stripe dashboard + runbook note | Operator creates coupon once per env; drift risk | |
| SQL migration writes coupon ID to config table | Coupon still manual in Stripe; over-engineered | |

**User's choice:** Scripted provisioning (locked as D-20).

---

## Claude's Discretion

Captured in CONTEXT.md under "Claude's Discretion" subsection. Key items:
- pg_cron tick frequency (recommend 15 min)
- `pending_downgrade_tier` column vs table
- Reuse `stripe_webhook_events` table vs new
- `create-checkout-session` single-function vs split
- Provisioning script language (.mjs recommended)
- pg_net auth header for cron → edge function calls

## Deferred Ideas

Captured in CONTEXT.md `<deferred>` section. Key items:
- SHOP-08 email receipt → Phase 20
- Additional Stripe events (invoice.paid, trial_will_end, etc.)
- Stripe Subscription Schedules as an alternative to pg_cron
- Deleting Phase 07 stripe-webhook → Phase 21
- Pro-rated Merit grants on mid-cycle upgrades (spec §3.4 ambiguity — planner to flag)
