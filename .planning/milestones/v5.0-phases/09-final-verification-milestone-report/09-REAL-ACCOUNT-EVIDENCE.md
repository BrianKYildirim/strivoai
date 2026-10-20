# Phase 9 - Real-Account Evidence (VER-04 / D-13)

**Plan:** 09-11 | **Target:** PRODUCTION `zjpjapgraoxdukdvpjes`
**Companion runbook:** `09-PROD-ACTIVATION.md` (the soak IS this evidence - one activity, D-13/D-14).

> AGGREGATES, NAMES, IDs, STATUS CODES ONLY. Synthetic `scripts/test-resumes/` inputs only. The 09-02
> PII guard scans this directory - no real names, emails, profile text, or model transcripts. ASCII only.

---

## Coverage required (VER-04)

At least a **Free-tier** AND an **Elite-tier** account, exercised across representative **resume-only**
AND **resume+LinkedIn** input states, for the five lifecycle features. Recruiting Lens is Elite-gated:
the Free row records the expected `403 elite_required` as the correct outcome, not a failure.

Each row: capture `run_id` (`analysis_jobs.id`), terminal `state`, `merit_settled`, `refunded`, the
`merit_transactions` delta (joined on `idempotency_key`), and a redacted screenshot path. A healthy
run on prod (MERIT ON) = terminal `completed`, `merit_settled = true`, `refunded = false`, exactly one
debit of the feature's cost.

---

## Evidence rows (operator + Claude fill during each flip's soak)

| Feature | Tier | Input state | run_id | HTTP | Terminal state | merit_settled | refunded | Merit delta (1 debit) | Screenshot |
|---|---|---|---|---|---|---|---|---|---|
| Recruiting Lens | Elite | resume-only | `941bb986-f390-4251-b524-7eef0b9f8575` | 200 | `completed` | true | false | -8, 1 debit | (attach) |
| Recruiting Lens | Elite | resume+LinkedIn | | | | | | | |
| Recruiting Lens | Free | (gated) | n/a | frontend paywall (no input path) | blocked pre-request | n/a | n/a | none (not charged) | (attach) |
| LinkedIn | Free | LinkedIn profile | `41bd6bf8-3eca-4c02-9be0-85fd2860152e` | 200 | `completed` | true | false | -3, 1 debit | (attach) |
| LinkedIn | Elite | LinkedIn profile | `fb4d2801-12ae-4963-8499-10c0fd404489` | 200 | `completed` | true | false | -3, 1 debit | (attach) |
| LinkedIn | Free | LinkedIn profile (Flip-3 re-pass) | `072c79d5-40aa-4b9e-a844-afa5f4506f30` | 200 | `completed` | true | false | -3, 1 debit (SURVIVING) | (attach) |
| LinkedIn | Elite | LinkedIn profile (Flip-3 re-pass) | `7597ab74-82f1-46e2-a9d4-898f5000847f` | 200 | `completed` | true | false | -3, 1 debit (SURVIVING) | (attach) |
| Onboarding | Free | resume-only | `dda6fa21-01d9-4d30-b83c-f3f64eb3e049` | 200 | `completed` | true | false | -3, 1 debit (SURVIVING) | (attach) |
| Onboarding | Elite | resume-only | `162eb183-5b05-445e-a2bd-ca6ebfffd384` | 200 | `completed` | true | false | -3, 1 debit (SURVIVING) | (attach) |
| Resume | Free | resume-only | `c3b2ba20-55e4-4770-880d-4c8b28a76c6a` | 200 | `completed` | true | false | -3, 1 debit (SURVIVING) | (attach) |
| Resume | Free | resume+LinkedIn | `fba82663-2746-47c7-ad44-49fc33a3875a` + `ac371df2-dd34-4108-a6ec-a9fb23ca143e` | 200 | `completed` (both) | true | false | -3 each, 1 debit each (SURVIVING) | (attach) |
| Resume | Elite | resume-only | `462c3fae-2f71-4ce5-8094-4e034ebe711b` | 200 | `completed` | true | false | -3, 1 debit (SURVIVING) | (attach) |
| Resume | Elite | resume+LinkedIn | `a1133436-76e9-45f4-bd41-e3984377d424` (LinkedIn leg) | 200 | `completed` | true | false | -3, 1 debit (SURVIVING) | (attach) |
| Career Compass | Free | resume-only | | | | | | | |
| Career Compass | Elite | resume+LinkedIn | | | | | | | |

---

## Per-run ledger verification query (I run read-only, per row)

```sql
select aj.id, aj.feature, aj.state, aj.merit_settled, aj.refunded,
       mt.amount, mt.source, mt.feature as ledger_feature
from public.analysis_jobs aj
left join public.merit_transactions mt
  on mt.idempotency_key = aj.idempotency_key and mt.amount < 0
where aj.id = :run_id;
```

Expect exactly one debit row per completed run, `amount` = the feature's cost (negative),
`merit_settled = true`, `refunded = false`.

---

## Flip 3 (Onboarding) evidence notes - 2026-07-17

**The pre-Flip-4 legacy control (kept deliberately - it is the cleanest proof in this document).**
Before Flip 4, a Free resume analysis from the Upload page at 02:08 UTC produced a real `-3
feature-deduct` for `resume_analysis` but **no `analysis_jobs` lifecycle row** - the backend fell
through to the byte-identical legacy path because `ANALYSIS_LIFECYCLE_RESUME` was still OFF, even
though the GLOBAL frontend flag was already ON and sending the lifecycle signal.

After Flip 4 (05:45 UTC), the same user journey produced `c3b2ba20` WITH a lifecycle row (`state`
non-null + `idempotency_key` present). Same frontend build, same input, same account tier - the ONLY
variable was the backend per-feature secret.

That before/after pair is a controlled experiment, and it EMPIRICALLY SETTLES D9-10's central claim:
**the global frontend flag does not widen execution blast radius; the backend per-feature flags gate
execution.** It also proves Flip 4 actually TOOK rather than silently measuring the legacy path -
which is precisely the trap that made the FIRST prod onboarding attempt (D9-10) a false negative.

**Evidence durability (D9-13/D9-15).** The FIRST four Flip-3 onboarding runs (`773984ef`, `f440b70a`,
`14d21f20`, `eaf30954`) were confirmed correct WHEN MEASURED - each carried exactly one -3 debit - but
their accounts were deleted afterward and `merit_transactions` cascades on `profiles` delete, so their
debit rows are GONE (`surviving_debits = 0`). They are NOT cited above. Every run cited in the table
has `owner_alive = true` and a SURVIVING debit, and is therefore re-verifiable by the per-run query
above at any time. Onboarding is inherently a new-account flow, which is exactly why this kept
self-destructing: each re-test meant a fresh account, and each fresh account meant deleting the last.

**Non-vacuity at sign-off:** `lifecycle_runs_24h = 10`, `runs_joined_to_a_debit = 4` - the 4 are
precisely the cited rows. The gap is the 6 deleted-account runs, not a broken join.

**Anomaly set at sign-off (canonical s2.3/2.4/2.5 forms, `state` not `status` - see D9-15):**
a1 = 0, a2 = 0, a3 = 0, a4 = 0, stuck = 0, `failure_code` in window = 0.

---

## Sign-off

- [x] **Free-tier account exercised** - Onboarding (`dda6fa21`), LinkedIn (`072c79d5`), Resume
      (`c3b2ba20`, `fba82663`) - all durable.
- [ ] Elite-tier account exercised on all five features - Onboarding (`162eb183`), LinkedIn
      (`7597ab74`), Recruiting Lens (`941bb986`), Resume (`462c3fae`) done; **Career Compass pending
      Flip 5**.
- [x] **Both resume-only and resume+LinkedIn input states covered** - both tiers, post-Flip-4.
- [ ] Recruiting Lens Free -> `403 elite_required` recorded as correct.
- [x] **Every completed run cited above: exactly one debit, `merit_settled=true`, `refunded=false`.**
- [ ] E2E baseline account restored (tier=free, merits=10, free_linkedin_scan_used=false) if touched.

**Flip 3 (Onboarding) VER-04 coverage: COMPLETE.** **Flip 4 (Resume) VER-04 coverage: COMPLETE** -
Free + Elite across resume-only AND resume+LinkedIn, every row with a SURVIVING debit (no deletions
this pass, per the D9-15 rule). Remaining unchecked boxes belong to Flip 5 (Career Compass), which
has not run, and the Recruiting Lens Free 403 row.

---

*Zero secret values and zero real-user identifiers by contract. ASCII only.*
