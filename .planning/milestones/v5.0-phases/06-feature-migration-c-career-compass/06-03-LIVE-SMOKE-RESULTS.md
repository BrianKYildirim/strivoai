# 06-03 Live Smoke Results — FEAT-05 Career Compass (operator-gated)

**Status:** AWAITING OPERATOR. Claude prepared the read-only inputs below (curl matrix + preview
SQL). Claude did NOT flip any prod/preview flag, did NOT apply any migration, and did NOT run the
smokes. The operator runs steps 1–5, records every outcome inline, and types **"approved"** (or
lists issues) before Phase 6 closes.

**Environments:** prod (read-only) `zjpjapgraoxdukdvpjes` · preview (flip-first) `cimjltzovkahkqecpwgi`.
**Constraints:** no DB migration expected (Phase-3 ledger/RPCs/active-index already shipped); the
security advisor floor **must stay 15** (read-only prod pull); preview FIRST, then prod
(Onboarding→Resume soak precedent). Flags: `ANALYSIS_LIFECYCLE_ENABLED` (master) +
`ANALYSIS_LIFECYCLE_CAREER_COMPASS` (edge) + `VITE_FEATURE_ANALYSIS_LIFECYCLE` (frontend).

---

## Step 1 — LIVE apex+www CORS re-proof (prod, read-only) · D-11

Prove BOTH origins echo ACAO + `Vary: Origin` (incl. on 401/412), and that an evil origin is
fail-closed, against `analyze-career` AND `submit-career-analysis-job`.

```bash
PROD=https://zjpjapgraoxdukdvpjes.supabase.co/functions/v1

# ── analyze-career ──────────────────────────────────────────────────────────
# 1a. apex OPTIONS preflight → expect 204/200 + ACAO: https://strivoai.net + Vary: Origin
curl -i -X OPTIONS "$PROD/analyze-career" \
  -H "Origin: https://strivoai.net" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization, content-type"

# 1b. www OPTIONS preflight → expect ACAO: https://www.strivoai.net + Vary: Origin
curl -i -X OPTIONS "$PROD/analyze-career" \
  -H "Origin: https://www.strivoai.net" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization, content-type"

# 1c. apex no-auth POST → expect 401 that STILL carries ACAO: https://strivoai.net + Vary: Origin
curl -i -X POST "$PROD/analyze-career" \
  -H "Origin: https://strivoai.net" -H "Content-Type: application/json" -d '{}'

# 1d. www no-auth POST → expect 401 + ACAO: https://www.strivoai.net + Vary: Origin
curl -i -X POST "$PROD/analyze-career" \
  -H "Origin: https://www.strivoai.net" -H "Content-Type: application/json" -d '{}'

# 1e. evil origin OPTIONS → expect NO ACAO echo (fail-closed; never '*', never evil)
curl -i -X OPTIONS "$PROD/analyze-career" \
  -H "Origin: https://evil.example.com" \
  -H "Access-Control-Request-Method: POST"

# ── submit-career-analysis-job (repeat 1a–1e) ───────────────────────────────
curl -i -X OPTIONS "$PROD/submit-career-analysis-job" -H "Origin: https://strivoai.net" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization, content-type"
curl -i -X OPTIONS "$PROD/submit-career-analysis-job" -H "Origin: https://www.strivoai.net" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization, content-type"
curl -i -X POST    "$PROD/submit-career-analysis-job" -H "Origin: https://strivoai.net" -H "Content-Type: application/json" -d '{}'
curl -i -X POST    "$PROD/submit-career-analysis-job" -H "Origin: https://www.strivoai.net" -H "Content-Type: application/json" -d '{}'
curl -i -X OPTIONS "$PROD/submit-career-analysis-job" -H "Origin: https://evil.example.com" -H "Access-Control-Request-Method: POST"
```

Also confirm the edge secret `ALLOWED_ORIGINS` on prod includes BOTH `https://strivoai.net` and
`https://www.strivoai.net`. (Offline guard already green: `analyze-career/__tests__/cors-matrix.test.ts`.)

**Operator result (record ACAO/Vary per call + evil fail-closed):**
- analyze-career apex 200/OPTIONS: `____`  · www: `____`  · apex 401 ACAO+Vary: `____`  · www 401: `____`  · evil fail-closed: `____`
- submit-career apex/www/401/412/evil: `____`
- ALLOWED_ORIGINS includes both origins: `____`

---

## Step 2 — Flag-flip soak + Merit safety (PREVIEW FIRST) · exactly-once / settle-after-save / refund-once

1. On **preview** `cimjltzovkahkqecpwgi`, set `ANALYSIS_LIFECYCLE_ENABLED=true` +
   `ANALYSIS_LIFECYCLE_CAREER_COMPASS=true` (edge secrets) + `VITE_FEATURE_ANALYSIS_LIFECYCLE=true`
   (frontend) and redeploy the frontend/functions as needed.
2. Run a real Career Compass analysis on a preview account. Then inspect the ledger (read-only SQL):

```sql
-- (a) EXACTLY-ONCE deduction: one settled deduction transaction for this run's idempotency key.
--     Replace :run_id with the analysis_jobs.id returned by submit.
select id, user_id, feature, amount, idempotency_key, status, created_at
from merit_transactions
where user_id = :user_id and feature = 'career_compass'
order by created_at desc limit 5;
-- EXPECT: a single deduction row for the run's derived key (no duplicate deduction on resubmit).

-- (b) SETTLE-AFTER-SAVE: the analysis_results row is written BEFORE merit_settled flips true.
select j.id as run_id, j.state, j.merit_settled, j.refunded,
       r.id as analysis_results_id, r.created_at as saved_at, j.updated_at as run_updated_at
from analysis_jobs j
left join analysis_results r
  on r.user_id = j.user_id and r.analysis_type = 'career_compass'
where j.id = :run_id;
-- EXPECT: state='completed', merit_settled=true, an analysis_results row exists (saved_at <= run settle).

-- (c) On a FORCED failure (malformed model / save failure): refund EXACTLY once, NO fabricated result.
select id, state, failure_code, failure_stage, merit_settled, refunded
from analysis_jobs where id = :failed_run_id;
select count(*) as refund_count
from merit_transactions
where user_id = :user_id and feature = 'career_compass' and status = 'refunded'
  and idempotency_key = :failed_run_key;
-- EXPECT: state in (failed|retryable_failed|refunded), refunded=true, merit_settled=false,
--         refund_count = 1, and NO analysis_results row for the failed run (no fabrication, SC-3).
```

**Operator result:**
- (a) exactly-once deduction (incl. accidental-resubmit dedup): `____`
- (b) settle-after-save (results row before merit_settled): `____`
- (c) forced-failure refund-exactly-once + no fabricated result: `____`

---

## Step 3 — Slow-run recovery (D-04)

On preview (flag ON), start a genuinely slow Career run; mid-run **refresh** the page and
**navigate away/back**. Confirm `run_id` recovery (URL `?run_id=` + localStorage) re-attaches and
resolves to the REAL result — no endless spinner, no fabricated success, no 3-minute abandonment
(the 180s cap is now short-circuited when the lifecycle owns the run).

**Operator result:** `____`

---

## Step 4 — Free + Elite end-to-end (VER-04)

Run BOTH tiers through **resume-only** (`allowResumeOnly`) AND **resume+LinkedIn**. Confirm
product-correct output + full persistence (Career DNA / careerFields / gaps / surprise-fits /
roleRoadmaps) to `analysis_results.raw_response` + History `?id=` round-trip re-hydrates intact.

**Operator result:**
- Free resume-only: `____`  · Free resume+LinkedIn: `____`
- Elite resume-only: `____`  · Elite resume+LinkedIn: `____`
- History `?id=` round-trip (large multi-structure payload intact): `____`

---

## Step 5 — No migration + advisor floor 15 (read-only prod)

Confirm NO DB migration was applied for this phase and the prod security advisor floor is still
**15** (read-only pull). After preview is clean, stage the prod flag-flip per the operator cadence.
(Claude can run the read-only prod advisor pull on request.)

**Operator result:**
- No migration applied: `____`
- Advisor floor still 15 (no increase): `____`
- Prod flag-flip staged per cadence: `____`

---

## Sign-off

- [ ] Step 1 apex+www CORS (incl. 401/412) + evil fail-closed — PASS
- [ ] Step 2 exactly-once deduction + settle-after-save + refund-once + no fabrication — PASS
- [ ] Step 3 slow-run run_id recovery — PASS
- [ ] Step 4 Free+Elite resume-only+combined end-to-end + History round-trip — PASS
- [ ] Step 5 no migration + advisor floor 15 — PASS

**Operator decision (type "approved" or list issues):** `____`
