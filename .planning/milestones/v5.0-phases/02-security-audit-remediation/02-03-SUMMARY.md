---
phase: 02-security-audit-remediation
plan: 03
subsystem: security
tags: [security-audit, rls, db-function-permissions, merit-billing-integrity, webhook-replay, advisor-floor, sec-12, sec-13, sec-14]

# Dependency graph
requires:
  - phase: 02-01
    provides: SECURITY-AUDIT.md 17-domain index + SEC-11 disposition + severity rubric + no-secret-leak guard
  - phase: 02-02
    provides: CODE-EDGE-FINDINGS.md (sibling code/edge sweep; confirmed no new crit/high in code surface)
provides:
  - Classified findings for DB/RLS/DB-function domains (3,4,15) at current HEAD, against the delegated read-only prod advisor pull
  - The operator-delegated read-only confirmed security-advisor floor = 15 (all WARN, all intentional; 0 NEW) — the SEC-14 do-not-weaken baseline
  - Per-residual re-examination of all 15 intentional advisors (D-04): each marked intentional (do-not-weaken)
  - Fix 1 (non-idempotent deduct) + Fix 2 (refund-after-save, all 3 post-save sites) confirmed live at HEAD -> HIGH -> route 02-05
  - Fix 3 (Paddle no replay-window + 500 config-leak) confirmed live -> MEDIUM -> route 02-06; Stripe insert-first idempotency = preserve
  - Byte-preservation KEEPs enumerated (grade-linkedin pre-save throw; Paddle HMAC/timingSafeEqual/event_id dedup; Stripe constructEventAsync)
affects: [02-05, 02-06, 02-08, security-remediation, merit-idempotency, refund-after-save, webhook-replay]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-domain DB/billing/webhook findings doc mirroring .planning/audit/ shape, KEEP-LIST-gated, names-only"
    - "Operator-delegated read-only prod advisor pull adopted as the confirmed do-not-weaken security floor (draft==confirmed via Option A delegation)"

key-files:
  created:
    - .planning/phases/02-security-audit-remediation/audit/DB-BILLING-WEBHOOK-FINDINGS.md
  modified: []

key-decisions:
  - "Advisor floor CONFIRMED = 15 security advisors (all WARN, all intentional; 0 NEW) via the operator-delegated read-only prod re-pull (Option A). Task-3 human-verify checkpoint is SATISFIED by the delegated pull; draft==confirmed, no separate operator reply owed."
  - "All 15 residuals re-examined individually (D-04): 11 kept authenticated EXECUTE grants (R-DB-05 load-bearing, do-not-revoke) + 2 rls_policy_always_true (paddle_webhook_events, scheduled_emails — service-role-by-design) + public-assets bucket listing + auth leaked-password toggle. Zero NEW findings — floor is exactly the v4.0 intentional set."
  - "linkedin_grades 'Anyone can view' CONFIRMED DROPPED (absent from the current advisor floor) -> owner-scoped SELECT remains; domain 3/4 clean, re-confirmed not assumed."
  - "Fix 1 confirmed at merit-gateway.ts:201-205 (3 named args, no p_idempotency_key) -> HIGH -> 02-05 (money-path autonomous:false)."
  - "Fix 2 confirmed at all 3 post-save sites (grade-linkedin L554-559 merit, L518-522 free, L822-828 legacy) -> HIGH -> 02-05; pre-save throw L459-462 = byte-preserve KEEP."
  - "Fix 3 confirmed (paddle-webhook: ts parsed L24 never freshness-checked + 500 leaks env name L105-113) -> MEDIUM -> 02-06; HMAC/timingSafeEqual/event_id dedup + Stripe constructEventAsync/insert-first idempotency = preserve."
  - "No NEW crit/high needing a migration surfaced -> no gap-closure operator-gated migration plan owed; 02-05/02-06 fixes are supabase/functions/** code edits, not DDL."

patterns-established:
  - "Performance advisors (~48 unused_index + 1 multiple_permissive on upgrade_requests) recorded for completeness as non-security/deferred-perf — NOT part of the do-not-weaken security floor."
  - "KEEP-LIST cross-check table proves no gated-but-live item (Paddle remnants, 11 EXECUTE grants, 2 always-true policies, public-assets) is mis-reported as a finding."

requirements-completed: [SEC-12, SEC-13, SEC-14]

# Metrics
duration: 4min
completed: 2026-07-01
---

# Phase 2 Plan 03: DB / RLS / Billing / Webhook Security Sweep Summary

**Read-only DB/RLS/DB-function + billing + webhook sweep at HEAD `b765629e`: the operator-delegated read-only prod advisor pull confirms the do-not-weaken security floor = 15 (all intentional, 0 NEW), each of the 15 residuals re-examined per D-04; the two HIGH billing findings (non-idempotent deduct + refund-after-save's 3 post-save sites) and the MEDIUM Paddle replay/leak finding are all confirmed live at current HEAD with fresh line cites and routed to 02-05/02-06 — no NEW crit/high, no migration owed.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-07-01T23:36:14Z
- **Completed:** 2026-07-01T23:40:18Z
- **Tasks:** 3 (Task 3 = human-verify checkpoint, satisfied by the delegated read-only floor)
- **Files modified:** 1 (created)

## Accomplishments
- Produced `audit/DB-BILLING-WEBHOOK-FINDINGS.md` (355 lines) classifying domains 3, 4, 12, 13, 15 against current-HEAD source + the delegated read-only prod advisor pull, each with a rubric severity + route.
- Recorded the **operator-delegated read-only confirmed security-advisor floor = 15** (all WARN, all intentional; 0 NEW) as the SEC-14 do-not-weaken baseline, with a full per-advisor breakdown (names only).
- Re-examined **each of the 15 intentional residuals individually (D-04)** — 11 kept EXECUTE grants + 2 service-role always-true policies + public-assets listing + leaked-password toggle — every one marked `intentional (do-not-weaken)`; **zero NEW findings**.
- Confirmed **Fix 1** (Merit non-idempotent deduct) live at `merit-gateway.ts:201-205` (3 named args, no `p_idempotency_key`) → HIGH → 02-05.
- Confirmed **Fix 2** (refund-after-save / hidden-success 500) at **all 3 post-save sites** (grade-linkedin L554-559 merit-path, L518-522 free-path, L822-828 legacy-path) → HIGH → 02-05; noted the pre-save throw (L459-462) as a byte-preserve KEEP.
- Confirmed **Fix 3** (Paddle no replay-window: `ts` parsed L24, never freshness-checked; + 500 config-leak L105-113) → MEDIUM → 02-06; confirmed Stripe `constructEventAsync` + insert-first idempotency correct → preserve.
- Confirmed `linkedin_grades` "Anyone can view" stays **DROPPED** (absent from the current floor) → owner-scoped SELECT remains (domains 3/4 clean); anon EXECUTE = 0 and search_path pinned intact (domain 15 clean).

## Task Commits

Each task was committed atomically:

1. **Task 1: Classify RLS / ownership / DB-function domains (3,4,15) + the confirmed 15-advisor floor + 15-residual re-examination** — `e2f42028` (docs)
2. **Task 2: Confirm + classify billing (12) + webhook (13) findings at current HEAD** — `9a1c546d` (docs)
3. **Task 3: Operator confirms live read-only advisor floor** — SATISFIED by the operator-delegated read-only pull (Option A); floor=15 all-intentional recorded in Task 1's commit. No code/commit of its own.

**Plan metadata:** _(this commit)_ (docs: complete plan)

## Files Created/Modified
- `.planning/phases/02-security-audit-remediation/audit/DB-BILLING-WEBHOOK-FINDINGS.md` — Classified findings for domains 3,4,12,13,15; the confirmed 15-advisor do-not-weaken floor + per-residual re-examination; the two HIGH billing findings + the MEDIUM webhook finding with current-HEAD line cites; byte-preservation KEEPs; KEEP-LIST cross-check; routing summary.

## Decisions Made
- **Task-3 operator-confirm satisfied by delegation (Option A).** The operator delegated the read-only prod advisor re-pull to the orchestrator, which ran it read-only via `supabase-prod-readonly` MCP against prod `zjpjapgraoxdukdvpjes` (2026-07-01). This executor (no MCP) adopts that as the authoritative floor; the plan's `checkpoint:human-verify` is satisfied — draft==confirmed floor=15, all-intentional. The plan completed without stopping to wait for a separate operator reply, per the orchestrator's explicit instruction.
- **Floor = 15, all intentional, 0 NEW.** 11× `authenticated_security_definer_function_executable` + 2× `rls_policy_always_true` + `public_bucket_allows_listing` + `auth_leaked_password_protection`. Nothing new, nothing weakened; this is the SEC-14 baseline for 02-08.
- **Performance advisors are NOT the security floor.** ~48× `unused_index` (INFO, expected on the near-empty 1-user prod) + `multiple_permissive_policies` on `upgrade_requests` SELECT (perf-only, deferred v4.0 perf) recorded for completeness, explicitly excluded from the do-not-weaken security count.
- **No NEW crit/high needing a migration.** The re-pull surfaced no new advisor and no DB-side crit/high → no gap-closure operator-gated migration plan owed. The confirmed fixes (1/2 → 02-05, 3 → 02-06) are `supabase/functions/**` code edits, not DDL.

## Deviations from Plan
None - plan executed exactly as written. This was a read-only sweep (no DDL, no migration, no `supabase/functions/**`/`src/**` edit; `git status` clean for source). No Rule 1-3 auto-fixes applied. Task 3's `checkpoint:human-verify` was resolved via the orchestrator-provided operator-delegated read-only advisor pull (Option A) rather than a blocking pause, per the orchestrator's explicit `orchestrator_provided_live_data` instruction — recorded as the confirmed phase floor, not a deviation.

## Issues Encountered
None. The no-secret-leak + doc-completeness guard (`src/test/security/security-audit-docs.test.ts`) was re-run after the findings doc landed → **15 passed / 0 failed** (the new `audit/` doc is auto-enrolled in the secret-VALUE sweep and returns zero; names-only discipline held — Paddle price IDs referenced by the `PRICE_TO_TIER` map name only, never by value).

## Authentication Gates
None - the sweep required no external service login. The live prod advisor pull was operator-delegated to the orchestrator (read-only, names-only); this executor consumed the results.

## User Setup Required
None from this plan. (Operator-owned residuals carried into the SEC-15 register: enabling Auth leaked-password protection and reviewing the `public-assets` bucket listing are one-click operator toggles, not code — Low hardening, no migration.)

## Next Phase Readiness
- **02-05 remediation inputs ready (money-path, `autonomous:false`):** Fix 1 (forward `p_idempotency_key` through `withMerits` + null-safe the already_deducted log) and Fix 2 (convert the 3 post-save throws/500s to log-and-continue; preserve the pre-save throw L459-462).
- **02-06 remediation input ready:** Fix 3 (Paddle replay-window + non-leaky missing-secret 500; preserve HMAC/`timingSafeEqual`/`event_id` dedup + Stripe path).
- **02-08 SEC-15 baseline ready:** the confirmed 15-advisor do-not-weaken floor + the per-residual intentional classification; 02-08 asserts the post-remediation count did not increase above 15.
- **No 02-05 DB-fix split needed:** no NEW DB-side crit/high; 02-05 is a code-fix plan only.

## Self-Check: PASSED

- FOUND: `audit/DB-BILLING-WEBHOOK-FINDINGS.md` (355 lines, > min 60; contains "advisor"; covers domains 3,4,12,13,15 + the 15-residual re-examination + the confirmed floor)
- FOUND commit `e2f42028` (Task 1) · FOUND commit `9a1c546d` (Task 2)
- Guard green: `security-audit-docs` vitest **15/15** (no secret leak in the new findings doc; doc-completeness intact)

---
*Phase: 02-security-audit-remediation*
*Completed: 2026-07-01*
