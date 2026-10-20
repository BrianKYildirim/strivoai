---
phase: 10
slug: merit-ledger-foundation
status: verified
threats_open: 0
threats_total: 21
threats_closed: 21
accepted_risks: 3
asvs_level: 1
created: 2026-04-15
verified: 2026-04-15
---

# Phase 10 — Security

> Merit ledger foundation: per-phase security contract verifying threat mitigations from the four-wave PLAN.md threat models against live implementation.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| authenticated_user → merit tables | User JWTs cross on every read; must only see own rows via RLS | merit balances, transaction history, shop purchases |
| service_role → merit tables | Edge functions (merit RPCs, webhooks) bypass RLS; only legitimate write path | balance mutations, grant rows, purchase records |
| `SECURITY DEFINER` trigger → merit tables | Auto-provision function runs as postgres owner; must not be hijackable via search_path | new profile → user_merits + signup-grant transaction |
| CI/operator → Supabase DB | Migration push crosses into live DB; auth via `SUPABASE_ACCESS_TOKEN` / interactive login | migration SQL, backfill writes |
| Stripe webhook → merit_shop_purchases | Replay protection via DB-level UNIQUE constraint on payment intent | `stripe_payment_intent_id`, pack sizes |
| snapshot script → legacy ledger tables | Read-only `psql` hashing path; privileged DB URL via env var | row counts, content hashes (never actual row data) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-10-01-01 | Information Disclosure | `scripts/snapshot-legacy-tables.ps1` | mitigate | Reads `$env:SUPABASE_DB_URL` / `-DatabaseUrl` param only; exits on empty URL; output line 49 writes `# DatabaseUrl: (redacted)`. Zero hardcoded credentials. | closed |
| T-10-01-02 | Tampering | `supabase/functions/_tests/merit_rls_test.ts` | accept | Read-only test code — tampering breaks CI, not production. Rationale in `10-01-PLAN.md` threat_model. | closed |
| T-10-01-03 | Elevation of Privilege | RLS test anon client | mitigate | Test line 24 reads `SUPABASE_ANON_KEY`; `SUPABASE_SERVICE_ROLE_KEY` has zero occurrences in file. Service role would bypass RLS and produce false negatives. | closed |
| T-10-02-SEC06 | Elevation of Privilege | Merit-table RLS policy set | mitigate | Migration grep: `FOR (INSERT\|UPDATE\|DELETE\|ALL)` = 0, `USING (true)` = 0 (case-insensitive). Live `pg_policies` non-SELECT count = 0 (confirmed in 10-04 SC-5 Check 4). | closed |
| T-10-02-02 | Tampering | Client-side balance manipulation | mitigate | Migration: 3× `ENABLE ROW LEVEL SECURITY`, 3× `FOR SELECT USING (auth.uid() = user_id)`, zero write policies. Anon client cannot forge balance rows — empirically proved by 5× 42501 denials in Deno test suite (10-04 SC-2). | closed |
| T-10-02-03 | Tampering | Negative balance via future bug | mitigate | Migration lines 19, 21: `CHECK (subscription_balance >= 0)` and `CHECK (shop_balance >= 0)` on `user_merits`. Empirically exercised in 10-04 SC-3: both `UPDATE ... = -1` attempts raised `check_violation`. | closed |
| T-10-02-04 | Elevation of Privilege | `SECURITY DEFINER` trigger search_path injection | mitigate | Migration line 118: `auto_provision_user_merits()` declares `SECURITY DEFINER SET search_path = public` inline (ASVS V4). Mirrors `handle_new_user` posture. | closed |
| T-10-02-05 | Tampering / EoP | Orphaned merit data on account deletion | mitigate | Migration lines 17, 35, 51: all 3 FKs declare `REFERENCES public.profiles(id) ON DELETE CASCADE`. `public.profiles.id` itself cascades from `auth.users`. GDPR-aligned end-to-end cascade. | closed |
| T-10-02-06 | Repudiation | Stripe webhook replay double-credit | mitigate | Migration line 55: `stripe_payment_intent_id text NOT NULL UNIQUE` on `merit_shop_purchases`. Duplicate webhook delivery errors at the constraint. SHOP-09 gate for Phase 12. | closed |
| T-10-02-07 | Information Disclosure | Cross-user merit data read | mitigate | Migration: 3× `CREATE POLICY ... FOR SELECT USING (auth.uid() = user_id)` (one per new table). Authenticated user can only see own rows. | closed |
| T-10-02-08 | Tampering | `lifetime_granted` mutated by future code | accept | CONTEXT D-03: application-level contract, not DB constraint. Rationale: CHECK "never decreases" would complicate backfill and Phase 11 grant-migration. Audited via `merit_transactions` grant rows at MER-12 reconciliation (live check in 10-04 SC-4 returned `OK`). | closed |
| T-10-02-09 | Denial of Service | Backfill locks profiles on large instance | mitigate | Migration: zero `LOCK TABLE` statements. Backfill uses `INSERT ... SELECT ... ON CONFLICT DO NOTHING` = row-level locks only, bounded by profiles row count. | closed |
| T-10-03-PUSH01 | Tampering | Migration file modified between Plan 02 and Plan 03 | mitigate | Process mitigation: 10-04 SC-5 re-runs grep gates against the on-disk file (forbidden identifiers = 0, `USING (true)` = 0, write-policy grep = 0). Exercised at Plan 04 time. | closed |
| T-10-03-PUSH02 | Repudiation | Partial-apply state if CLI non-transactional | mitigate | Migration lines 169-195: trailing `DO $$` verification block with two `RAISE EXCEPTION` gates on profile/merit count mismatch. At push time the NOTICE fired `Phase 10 verification passed: 6 profiles, 6 user_merits, 6 grant rows` — no rollback. Belt + suspenders: pre/post legacy snapshot diff (10-03 Task 3) caught byte-level drift regardless of CLI transactionality. | closed |
| T-10-03-PUSH03 | Information Disclosure | `$SUPABASE_DB_URL` leaked to logs | mitigate (partial accept) | Script redacts URL in its own output; operator shell-history scrubbing is out-of-scope repo-wide concern accepted in 10-03-PLAN.md threat_model. | closed |
| T-10-03-PUSH04 | Elevation of Privilege | Stale migration push adds permissive policy | mitigate | 10-04 SC-5 Check 4 queries live `pg_policies` row count for non-SELECT policies on the 3 new tables; result = 0 independently of static file grep. | closed |
| T-10-04-VER01 | Spoofing | TEST_USER_JWT forged or expired | mitigate | `merit_rls_test.ts` lines 40-43: `rlsDenied()` helper checks Postgres code `42501` or RLS message regex. Invalid JWT produces 401 (not 42501), which fails the test loudly rather than silently passing. | closed |
| T-10-04-VER02 | Elevation of Privilege | Operator uses service-role key instead of anon | mitigate | Test line 24 reads `SUPABASE_ANON_KEY` explicitly; zero references to service-role key. Substitution would require modifying the test file, which is grep-audited at Plan 04 time. | closed |
| T-10-04-VER03 | Information Disclosure | SC-1 error messages leak column metadata | accept | Columns documented in `10-RESEARCH.md` / `10-CONTEXT.md` anyway; error text is operator-only. Rationale in 10-04-PLAN.md threat_model. | closed |
| T-10-04-VER04 | Tampering | Post-hoc migration edit adding `USING (true)` | mitigate | Two-layer detection: 10-04 SC-5 Check 2/3 static-greps migration file AND Check 4 queries live `pg_policies`. Attacker would need to both edit file AND run a separate `CREATE POLICY` against live DB. | closed |

*Status: closed (all 21)*
*Disposition: 18 mitigate · 3 accept · 0 transfer*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-10-01 | T-10-01-02 | Test file tampering breaks CI only, not production. RLS test scaffold contains no runtime privilege; modifying it surfaces immediately on next `deno test` run as a red test or missing assertions. | Plan 01 author (10-01-PLAN.md threat_model) | 2026-04-15 |
| AR-10-02 | T-10-02-08 | `lifetime_granted` treated as application-level monotonic contract, not DB-level. Adding a `>= OLD.lifetime_granted` CHECK would block legitimate backfill and Phase 11 grant-migration edge cases. Audited indirectly via `merit_transactions` grant-row SUM during MER-12 reconciliation — live spot check at Plan 04 time returned `OK` on every profile. | Phase 10 CONTEXT.md D-03 | 2026-04-15 |
| AR-10-03 | T-10-04-VER03 | SC-1 assertion error text (column name + data type) only visible to the operator running the verification DO block. Same metadata is already published in `10-RESEARCH.md` § "Architecture Patterns" and `10-CONTEXT.md`. No new disclosure surface. | Plan 04 author (10-04-PLAN.md threat_model) | 2026-04-15 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-15 | 21 | 21 | 0 | gsd-security-auditor (sonnet) — /gsd-secure-phase 10 |

### 2026-04-15 — Initial audit (State B → verified)

- **Input state:** State B (no prior SECURITY.md; PLAN.md + SUMMARY.md complete across all 4 waves).
- **Register source:** Four `<threat_model>` blocks across `10-01-PLAN.md` through `10-04-PLAN.md`. Consolidated into 21 namespaced entries `T-10-{plan}-{seq}`.
- **Verification method:** `gsd-security-auditor` read all 4 PLAN + SUMMARY files plus implementation (`20260414000000_merit_ledger_foundation.sql`, `merit_rls_test.ts`, `snapshot-legacy-tables.ps1`). For each mitigate disposition, confirmed concrete code evidence via line-level grep. For each accept disposition, confirmed documented rationale in originating plan.
- **Key empirical evidence:**
  - Migration grep gates: `FOR (INSERT|UPDATE|DELETE|ALL)` = 0, `USING (true)` = 0, `ENABLE ROW LEVEL SECURITY` = 3, `ON DELETE CASCADE` = 3, `CHECK (...balance >= 0)` = 2, `SECURITY DEFINER SET search_path = public` = 1, `stripe_payment_intent_id text NOT NULL UNIQUE` = 1.
  - Live staging (10-04-SUMMARY.md): RLS suite `ok | 5 passed | 0 failed`; wire-level 42501 probed; `pg_policies` non-SELECT count = 0; 7/7/7 backfill + trigger invariant; MER-12 reconciliation `OK`; legacy-ledger snapshot diff empty.
  - §9 `DO $$` verification block at lines 169-195 intact (distinct from the Phase 11-04 merit-RPCs §9 block added in commit `443e3f1`).
- **Unregistered flags:** None. All 4 SUMMARY.md files report zero new threat flags.
- **Result:** SECURED — `threats_open: 0`.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-15
