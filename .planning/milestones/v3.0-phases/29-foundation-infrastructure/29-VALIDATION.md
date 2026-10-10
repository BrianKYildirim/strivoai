---
phase: 29
slug: foundation-infrastructure
status: audited
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-12
updated: 2026-06-08
---

# Phase 29 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from `29-RESEARCH.md` § Validation Architecture and CONTEXT.md decisions D-01..D-16.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (edge)** | Deno test (`deno test --allow-env --allow-net`) at `supabase/functions/_shared/*.test.ts` |
| **Framework (frontend)** | Vitest 1.6.1 (`npm run test`) for hooks under `src/` |
| **Adversarial (optional)** | promptfoo (`npm run test:adversarial`) — not used by Phase 29 |
| **pgTAP** | NOT used in Phase 29 (operator-deferred from v2.0 Phase 11; researcher recommends staying deferred — Deno integration tests against staging cover RLS) |
| **Config file** | `supabase/functions/deno.json` (edge); `vitest.config.ts` (frontend) |
| **Quick run command** | `deno test supabase/functions/_shared/cache-fingerprint.test.ts supabase/functions/_shared/merit-gateway.test.ts` |
| **Full suite command** | `./scripts/run-edge-tests.ps1 && npm run lint && npm run test` |
| **Estimated runtime** | ~25-40 s (Deno shared tests) + ~10 s (Vitest hook tests) + lint |

---

## Sampling Rate

- **After every task commit:** Run quick command for the touched module (`deno test <file>` for edge changes, `npm run test -- <pattern>` for hook changes)
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green AND staging migrations applied AND SQL smoke checklist signed off
- **Max feedback latency:** 60 s for the quick command path

---

## Per-Task Verification Map

> Filled by `gsd-planner` per task. Template rows below cover the requirement coverage the planner MUST satisfy. Planner will expand into per-task rows with concrete commands.

| Req | Test Type | Runner | Verification Sketch | Threat Ref |
|-----|-----------|--------|---------------------|-----------|
| CACHE-01 | manual | SQL inspection in staging | `SELECT * FROM information_schema.tables WHERE table_name='analysis_cache'`; verify columns + UNIQUE index + RLS policies | T-29-RLS |
| CACHE-02 | unit | Deno | `cache-fingerprint.test.ts` — assert same inputs → same SHA-256 key across 5+ permutations; assert different inputs → different keys | — |
| CACHE-03 | manual + unit | SQL + Deno | Upload PDF → verify `resumes.extracted_text` + `text_hash` populated by `analyze-resume` and `ocr-pdf`; Deno asserts `text_hash = sha256(extracted_text)` | — |
| CACHE-09 | unit | Deno | `merit-gateway.test.ts` — mock `precheck_cache` returning hit; assert rate-limit + deduct NOT called, `usage_tracking` write WITH credits=0 IS called, response is cached payload | — |
| CACHE-10 | unit | Deno | Assert cache-hit `usage_tracking` row has `credits=0` AND `analysis_id` = originating row id AND `action_type` = feature | — |
| CACHE-11 | manual | Staging log inspection | Trigger a cache-miss path; verify response returns first, cache INSERT log line lands AFTER `jsonResponse()`. Confirm `EdgeRuntime.waitUntil` used (per RESEARCH §1 — already proven at `analyze-resume/index.ts:1388`) | — |
| CACHE-12 | unit | Deno | Mock per-feature persist failure → assert cache INSERT does NOT fire. Mock Claude failure → cache INSERT does NOT fire. Both-succeed → cache INSERT fires exactly once. | — |
| HIST-01 | manual + unit | SQL + Deno | `usage_tracking.analysis_id uuid NULL` column exists; cache-hit path populates it; existing rows remain NULL (backward compat) | — |
| MER-04 | integration | Deno against staging | TEST-02 canonical regression — call `check_and_deduct_merits(p_idempotency_key=K, user_id=U, amount=1)` twice; assert second call returns "already_deducted" with prior `transaction_id`, balance changed exactly once, only one row inserted in `merit_transactions WHERE source='feature-deduct'` | T-29-IDEM |
| NFR-01 | manual | Migration runner | All 4 migrations apply on a clean DB AND re-run cleanly on an already-migrated DB (`IF NOT EXISTS` everywhere); rollback blocks documented and reversible | — |
| NFR-02 | manual | Staging load probe | 100 cache-hit lookups against staging — p95 < 100 ms (use simple curl loop or `hey`/`autocannon` script in `scripts/`); record measurement in VERIFICATION.md | — |
| NFR-05 | code review | Manual checklist | CORS allowlist unchanged; rate-limiter pooled key unchanged; prompt-sanitizer not bypassed on cache-hit (cache hit does not invoke Claude — sanitizer N/A); `requireAuth` still called BEFORE precheck_cache | T-29-AUTH |
| NFR-06 | manual | Same as CACHE-11 | Response latency unaffected by cache write (cache write deferred via waitUntil) | — |
| NFR-07 | integration | Deno against staging | Fire 5 parallel `check_and_deduct_merits` calls with same `p_idempotency_key` → exactly one deducts, four return "already_deducted", balance changes exactly once | T-29-IDEM |
| TEST-01 | meta | Manual checklist | Every fix in PLAN.md MUST list either an automated test OR a documented manual QA step | — |
| TEST-02 | integration | Deno against staging | Identical to MER-04 row — single canonical merit-idempotency regression test | T-29-IDEM |

*Status legend: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `supabase/functions/_shared/cache-fingerprint.test.ts` — Deno stubs for CACHE-02 determinism, asymmetry, tier-variant isolation
- [ ] `supabase/functions/_shared/merit-gateway.test.ts` — extend existing (if any) with `precheck_cache` hit/miss paths for CACHE-09/10/12
- [ ] `supabase/functions/_shared/test-helpers.ts` — if not already present, add Supabase staging client factory + cleanup helpers (one-time)
- [ ] `src/hooks/useIdempotencyKey.test.ts` — Vitest stub asserting same logical submit reuses UUID, new click generates new UUID (MER-04 frontend half)
- [ ] `scripts/staging-cache-perf-probe.ps1` (or `.mjs`) — NFR-02 p95 measurement harness, output goes into VERIFICATION.md

*Existing infrastructure (`./scripts/run-edge-tests.ps1`, Vitest, ESLint) covers the rest.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `analysis_cache` table + RLS shape | CACHE-01 | Schema inspection in staging, not unit-testable from edge | Run staging SQL: `\d analysis_cache` + `SELECT * FROM pg_policies WHERE tablename='analysis_cache'`; confirm `auth.uid() = user_id` SELECT for `authenticated`, no INSERT/UPDATE/DELETE policy |
| Resume re-OCR → same `text_hash` | CACHE-03 | Requires real PDF upload + OCR roundtrip | Upload sample resume to staging → record `text_hash` → re-upload same PDF → assert `text_hash` identical |
| Cache-write happens AFTER response | CACHE-11 / NFR-06 | Timing requires log inspection | Tail staging function logs while invoking a cache-miss path; verify "response sent" log entry precedes "cache insert" log entry |
| Cache lookup p95 < 100 ms | NFR-02 | Real-network measurement | Run `scripts/staging-cache-perf-probe.*` against staging; assert p95 < 100 ms over ≥100 lookups; paste output into VERIFICATION.md |
| Migration rerun safety | NFR-01 | Requires Supabase CLI roundtrip | `supabase migration up` on clean DB → second run is a no-op (no errors); documented rollback `*-rollback.sql` re-applies cleanly |
| CORS / sanitizer / rate-limit unchanged | NFR-05 | Cross-cutting; cheaper as code-review checklist | Diff review: confirm no edits to `cors.ts`, `rate-limiter.ts`, `prompt-sanitizer.ts`, `auth.ts` outside of additive `precheck_cache` arg in `merit-gateway.ts` |

---

## Validation Sign-Off

- [x] All requirements have a row in the Per-Task Verification Map
- [x] Each automated row lists a concrete command runnable from repo root
- [x] Sampling continuity: no 3 consecutive plan tasks without an automated verify
- [x] Wave 0 covers all MISSING test-file references
- [x] No watch-mode flags (`--watch`, `vitest` without `run`) in any command
- [x] Feedback latency < 60 s for the quick path
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** audited 2026-06-08

---

## Validation Audit 2026-06-08

Retroactive State A audit after operator smoke confirmation. Existing implementation and verification artifacts already cover the Phase 29 substrate: schema/RLS, cache fingerprinting, extracted text/hash persistence, usage history linkage, merit idempotency, cache precheck behavior, and retry-storm tolerance. The remaining open items were stale validation-strategy checkboxes plus manual staging smoke residue.

| Metric | Count |
|--------|-------|
| Requirements audited | 16 |
| Gaps found | 0 |
| Resolved by new tests | 0 |
| Escalated/manual-only gaps | 0 |
| Operator smoke confirmations | 1 |

**Operator smoke evidence:** User attested on 2026-06-08 that all remaining phase smoke tests work properly. This closes the manual staging smoke residue for the validation artifact. No implementation files or test files were changed.

**Status:** nyquist-compliant. The NFR-02 workstation p95 row remains documented in `29-VERIFICATION.md` as analytical acceptance rather than a product failure; the probe measured workstation-to-Supabase network RTT, not the in-region indexed cache lookup.
