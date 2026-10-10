---
slug: queue-path-tier-downgrade-refunds
status: resolved
severity: medium
created: 2026-07-18
parent: queue-path-tier-downgrade
prod_ref: zjpjapgraoxdukdvpjes
---

# Merit refund sweep — queue-path-tier-downgrade

Read-only production sweep (prod `zjpjapgraoxdukdvpjes`) for paid resume-analysis charges that
were served FREE-depth analysis (`resumes.grading_data->>'_mergeSource' = 'free-single'`) while
charged at a paid tier. Correlated by `user_id` + analyzed_at within [-2m, +20m] of the charge.

## Findings

> **Re-verified 2026-07-18 (read-only prod sweep, session resume):** identical result —
> same 3 Elite users, 3 subscription merits each (9 total), `already_refunded = false` for all,
> balances 141 / 141 / 147 (unreset). Numbers below still stand; still awaiting operator approval.


- Non-free `resume_analysis` feature-deduct rows: **19**
- Charged paid / served free-depth (overcharged): **3** — total **9 subscription merits**
- Already refunded: **0**
- Unmatched (no resume analyzed near the charge — failed/reused/refunded run): 5
- Correctly served paid depth: 11

| user_id | orig tx_id | resume_id | tier | merits | charged_at (UTC) | sub_balance now |
|---------|-----------|-----------|------|--------|------------------|-----------------|
| 5ca1f488-b305-4815-b6c2-cd5566bf8fcc | 3482da58-80a8-4ef0-a54e-6b9617e4c9a8 | 392f5f5d-689b-41a8-956b-82e0ed4904c1 | elite | 3 | 2026-07-18 22:35:40 | 147 |
| aca0368c-9ee8-496e-8d80-9fe8af5b4729 | c8959f64-61c5-43c1-99a8-4615df3f6202 | e4e3f214-486b-4e82-9b9d-011b46ddb866 | elite | 3 | 2026-07-17 21:58:49 | 141 |
| f027792b-2298-45e2-8803-56950ebc5f65 | 99f5c76f-7fa8-442b-9ade-c6f2816d3211 | 9d3952d3-3eac-4f4f-bc60-ecd9d7743eff | elite | 3 | 2026-07-17 02:01:26 | 141 |

All three `subscription_reset_date` values are in Aug 2026 (balances have NOT reset since the
charge), so a +3 credit lands cleanly.

## APPLIED 2026-07-19 06:51 UTC (operator-run, verified read-only)

Operator ran the three `refund_merits` RPC calls in the prod SQL editor (Claude's prod MCP is
read-only). Read-only verification confirms all three refund rows landed with `balance_type='refund'`,
`source='feature-refund'`, correct `refund_of`/`deduction_id`, and balances incremented +3 each:
f027792b 141→144, aca0368c 141→144, 5ca1f488 147→150 (+9 subscription merits total). Idempotent —
re-run returns `already_refunded`. Refund thread RESOLVED. (Optional product follow-up below still open.)

## Remediation (REQUIRES OPERATOR APPROVAL — production write; Claude's prod MCP is read-only)

> **CORRECTED 2026-07-18 (session resume).** The original hand-rolled `INSERT` below DRIFTED
> from the app's refund convention and was NOT applied. Inspecting the live prod
> `refund_merits(p_user_id, p_transaction_id)` def revealed it: (a) locates the deduction by
> `metadata->>'deduction_id' = p_transaction_id` — NOT by the ledger row's `id`; (b) writes the
> credit as `balance_type='refund'` (the earlier SQL used `'subscription'`); (c) keys idempotency
> off `balance_type='refund' AND metadata.deduction_id`. So the earlier `INSERT` (balance_type
> `subscription`, `idempotency_key='refund:qptd:<row_id>'`) would have been INVISIBLE to
> `refund_merits`' idempotency guard → a future legitimate `refund_merits` on the same deduction
> would DOUBLE-refund, plus it miscategorizes the credit bucket. Use the RPC instead.
>
> Also confirmed: the doc's `orig_tx_id` values are ledger ROW ids, and `refund_merits` needs the
> `metadata.deduction_id`. Resolved mapping (read-only prod query):
>
> | user_id | deduction row id (orig_tx_id) | deduction_id (pass to RPC) |
> |---------|------------------------------|----------------------------|
> | f027792b-2298-45e2-8803-56950ebc5f65 | 99f5c76f-7fa8-442b-9ade-c6f2816d3211 | fa10a2ef-6d87-4df2-848e-6fb7960c2a6e |
> | aca0368c-9ee8-496e-8d80-9fe8af5b4729 | c8959f64-61c5-43c1-99a8-4615df3f6202 | e4b3f8e7-5456-4ebc-a476-eb3c8d6789ba |
> | 5ca1f488-b305-4815-b6c2-cd5566bf8fcc | 3482da58-80a8-4ef0-a54e-6b9617e4c9a8 | 6d257370-cdca-4e41-8c1f-5d622e5fcb6e |
>
> Re-verified before apply: `already_refunded_rpc_convention = false` for all three (RPC returns
> `already_refunded` on re-run — inherently idempotent, so no `idempotency_key` bookkeeping needed).

**Apply via the app's authoritative RPC** (each call restores +3 subscription merits, drift-free):

```sql
select u.user_id,
       u.deduction_id,
       public.refund_merits(u.user_id, u.deduction_id) as result
from (values
  ('f027792b-2298-45e2-8803-56950ebc5f65'::uuid,'fa10a2ef-6d87-4df2-848e-6fb7960c2a6e'::uuid),
  ('aca0368c-9ee8-496e-8d80-9fe8af5b4729'::uuid,'e4b3f8e7-5456-4ebc-a476-eb3c8d6789ba'::uuid),
  ('5ca1f488-b305-4815-b6c2-cd5566bf8fcc'::uuid,'6d257370-cdca-4e41-8c1f-5d622e5fcb6e'::uuid)
) as u(user_id, deduction_id);
```

Expected result per row: `{"success": true, "refunded_to": {"subscription": 3, "shop": 0}}`.
A re-run returns `{"error": "already_refunded"}` (idempotent no-op).

### Rollback (only if the forward RPC ran — reverses the refund rows it wrote)

```sql
begin;
-- decrement balances by the refunded amounts, then delete the refund ledger rows
update public.user_merits um
set subscription_balance = um.subscription_balance - agg.total, updated_at = now()
from (
  select user_id, sum(amount) total
  from public.merit_transactions
  where balance_type = 'refund'
    and (metadata->>'deduction_id') in (
      'fa10a2ef-6d87-4df2-848e-6fb7960c2a6e',
      'e4b3f8e7-5456-4ebc-a476-eb3c8d6789ba',
      '6d257370-cdca-4e41-8c1f-5d622e5fcb6e'
    )
  group by user_id
) agg
where um.user_id = agg.user_id;

delete from public.merit_transactions
where balance_type = 'refund'
  and (metadata->>'deduction_id') in (
    'fa10a2ef-6d87-4df2-848e-6fb7960c2a6e',
    'e4b3f8e7-5456-4ebc-a476-eb3c8d6789ba',
    '6d257370-cdca-4e41-8c1f-5d622e5fcb6e'
  );
commit;
```

## Optional follow-up (product decision)

Each affected user still has a FREE-depth result saved on the resume_id above. Now that the fix
routes onboarding through the tier-aware path, they could be offered / triggered a re-analysis at
Elite depth. Not required for the refund; flagged for product.
