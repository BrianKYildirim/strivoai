# Phase 2 — DB-BILLING-WEBHOOK-FINDINGS (Plan 02-03)

**Phase:** 02 — Security Audit & Remediation
**Plan:** 02-03 (DB / RLS / DB-function + billing-integrity + webhook sweep — the operator-witnessed,
read-only-prod half of the audit; D-04 says nothing is assumed-closed)
**Run date:** 2026-07-01
**HEAD SHA at sweep:** `b765629e` (branch `staging`)
**Owns domains:** 3 (RLS enforcement), 4 (user+resource ownership), 12 (Merit+billing integrity),
13 (webhook auth+replay), 15 (DB function permissions).
**Routes into:** `SECURITY-AUDIT.md` 17-domain index (each finding cites its Domain # + a rubric severity);
the two High billing findings feed the 02-05 remediation plan; the Medium webhook finding feeds 02-06;
the confirmed advisor floor feeds the SEC-15 record (02-08) as the do-not-weaken baseline.

> ## NAMES-ONLY DISCIPLINE (T-02-07)
>
> This doc is committed to a tracked repo. It records object/policy/function/env NAMES, source line
> anchors, advisor names, findings, and severity classifications ONLY — never a key, token, JWT, price ID,
> webhook secret, connection string, or row VALUE. Project-refs `zjpjapgraoxdukdvpjes` (prod) /
> `cimjltzovkahkqecpwgi` (preview/test) are project IDENTIFIERS, not secrets, and are allowlisted. The
> no-secret-leak static guard (`src/test/security/security-audit-docs.test.ts`) greps this doc and MUST
> return zero.

***

## Verdict / Status

| Field | Value |
| ----- | ----- |
| Sweep type | Read-only. **No DDL, no migration, no `supabase/functions/**`/`src/**` edit** authored — `git status` clean for source. Live prod store inspected read-only (delegated — see below). |
| Domains classified | 3, 4, 15 (RLS / ownership / DB-function — Task 1) + 12, 13 (billing / webhook — Task 2), each with a rubric severity token + route. |
| Advisor floor (SEC-14) | **CONFIRMED = 15 security advisors, all WARN, all intentional** (operator-delegated read-only re-pull, 2026-07-01). The do-not-weaken baseline for the phase. Breakdown + per-residual re-examination below. |
| 15-residual re-examination (D-04) | **DONE** — each of the 15 individually re-examined and marked `intentional (do-not-weaken)` or `NEW finding`. **0 NEW findings** — the floor is exactly the v4.0-documented intentional set; nothing new, nothing weakened. |
| Billing findings (domain 12) | **Fix 1 (non-idempotent deduct) + Fix 2 (refund-after-save, all 3 post-save sites) confirmed live at HEAD → both HIGH → route 02-05.** |
| Webhook findings (domain 13) | **Fix 3 (Paddle no replay-window + 500 config-leak) confirmed live → MEDIUM → route 02-06.** Stripe `constructEventAsync` + insert-first idempotency confirmed correct → **preserve**. |
| NEW crit/high needing a migration | **NONE.** The re-pull surfaced no new advisor and no DB-side crit/high. No gap-closure operator-gated migration plan is required from this sweep. |
| KEEP-LIST gate | Every "looks removable / looks like a finding" candidate cross-checked against `.planning/audit/KEEP-LIST.md`; every gated-but-live item (Paddle remnants, the 11 kept EXECUTE grants, the 2 service-role always-true policies) is recorded do-NOT-touch, never mis-reported as a finding. |
| v4.0 floor | **NOT WEAKENED** — this plan authors docs only; the confirmed floor equals the inherited 15-item intentional set. |

***

## Severity Rubric (from 02-01)

Impact × exploitability, `Severity = max-of-reasoning` (see `SECURITY-AUDIT.md` §Severity Rubric).
`Critical impact × (Easy|Moderate) → Critical`; `High × Easy → Critical`, `× Moderate → High`;
`Medium × Easy → High`, `× Moderate → Medium`; `Low → Low` regardless.
D-01 threshold: **Critical + High + Medium remediated in-phase; only Low → tracked residual.**

***

## Advisor Floor — Operator-Delegated Read-Only Confirmed Floor (2026-07-01)

> **How this was obtained (Task 3 disposition):** at the 02-03 discuss checkpoint the operator **delegated
> the read-only prod advisor re-pull to the orchestrator (Option A)**, which ran it read-only via the
> `supabase-prod-readonly` MCP against canonical prod `zjpjapgraoxdukdvpjes` on 2026-07-01. This executor
> has no MCP access; it treats that delegated read-only pull as the authoritative floor. The plan's Task-3
> `checkpoint:human-verify` (operator confirms the live advisor count) is therefore **SATISFIED by the
> delegated read-only pull** — the recorded candidate floor below **IS** the confirmed floor
> (draft==confirmed; no separate operator reply is owed). Recorded as the "operator-delegated read-only
> confirmed floor (2026-07-01)".

### Security advisors — count = 15 (all WARN, all intentional; the do-not-weaken SEC-14 floor)

| # | Advisor (lint name) | Count | Object(s) — names only | Re-examination verdict (D-04) |
| - | ------------------- | ----- | ---------------------- | ----------------------------- |
| 1–11 | `authenticated_security_definer_function_executable` | **11** | `admin_set_user_merits`, `admin_upgrade_user`, `auth_owns_version`, `can_perform_ai_action`, `get_merit_balance`, `get_admin_usage_stats`, `get_pending_upgrade_requests`, `get_user_usage_breakdown`, `has_role`, `record_feature_usage`, `record_recommendations_shown` | **intentional (do-not-weaken)** — the R-DB-05 load-bearing EXECUTE grants (v4.0 Ph8 revoked 19/30, kept these 11 because a live client/RLS-context path depends on each). `can_perform_ai_action` is still called FE at `Navbar.tsx:109` + `SkillsGapAnalysis.tsx:108` + `usage-checker.ts:74`. Revoking any is a live-path break (Pitfall 2). **Do NOT propose revoking.** |
| 12 | `rls_policy_always_true` | 1 | `public.paddle_webhook_events` — policy "Service role can manage webhook events" (ALL) | **intentional (do-not-weaken)** — service_role bypasses RLS regardless; the always-true `USING(true)` is a service-role "manage" convenience, not a client-reachable exposure. KEEP-LIST Class 2 (gated Paddle remnant; owned by Phase 8). |
| 13 | `rls_policy_always_true` | 1 | `public.scheduled_emails` — policy "Service role can manage all scheduled emails" (ALL) | **intentional (do-not-weaken)** — same service-role-by-design rationale; `scheduled_emails` is written only by the service client / cron, never by an anon/authenticated browser session. |
| 14 | `public_bucket_allows_listing` | 1 | storage bucket `public-assets` (broad SELECT / listing) | **intentional (do-not-weaken)** — operator/storage item; `public-assets` is a deliberately-public asset bucket (no user-private objects). Operator-owned toggle; no code change. Carried as accepted residual. |
| 15 | `auth_leaked_password_protection` | 1 | Auth — leaked-password protection disabled | **intentional (do-not-weaken)** — operator Auth dashboard toggle (HaveIBeenPwned check), not a code/DB surface. Recorded as an operator-owned Low hardening residual (enabling it is a one-click operator action, no migration). |

**Security-advisor floor = 15, all intentional, 0 NEW.** This is the SEC-14 "do-not-weaken" baseline the
whole phase is measured against: 02-08 must confirm the post-remediation count did **not** increase above 15
and that these exact 15 remain the intentional set.

### Performance advisors — recorded for completeness (NOT part of the security floor)

The delegated read-only pull also returned the non-security (performance) advisors. They are recorded here
so 02-08 does not mistake them for a security delta, but they are **NOT** security findings and do **NOT**
enter the do-not-weaken security floor:

- **~48× `unused_index` (INFO).** Expected on the near-empty 1-user prod DB (`usage_tracking` 4 rows etc. —
  see DATABASE.md Phase-8 re-pull). A zero-`idx_scan` reading on a 1-user store is low traffic, NOT proof of
  a droppable index (D-11). A deferred v4.0 perf item, not a Phase-2 security finding.
- **`multiple_permissive_policies` (WARN) on `public.upgrade_requests` SELECT.** One logical finding: the
  admin policy "Admins can view all" and the owner policy "Users can view their own" coexist across roles →
  Postgres evaluates both permissive policies. Perf-only (extra policy evaluation), a deferred v4.0 perf
  item; **NOT a security regression** (both policies are correct least-privilege — admin sees all by design,
  owner sees own; the "multiple permissive" flag is a performance nudge, not an over-exposure).

> **Net:** the security floor is 15 (all intentional); the performance advisors are the expected near-empty-prod
> / deferred-perf set. Nothing new, nothing weakened.

***

## Domain 3 — RLS Enforcement

**Technique:** re-examine each intentional RLS residual against the delegated read-only advisor pull +
the DATABASE.md Phase-8 `pg_policies` re-pull (canonical prod `zjpjapgraoxdukdvpjes`); confirm the v4.0
least-privilege posture is intact and the over-permissive `linkedin_grades` policy stays DROPPED.

**Findings (grounded against the confirmed floor + DATABASE.md Phase-8 block):**

- **`linkedin_grades` "Anyone can view linkedin grades" — CONFIRMED DROPPED (owner-scoped SELECT remains).**
  The current 15-advisor floor contains **no** `linkedin_grades` `rls_policy_always_true` / public-SELECT
  advisor. The over-permissive `SELECT / role public / USING(true)` policy that DATABASE.md flagged (Source C,
  and re-confirmed present on prod at the 2026-06-24 Phase-8 re-pull) was dropped by Phase 8 (08-04); the
  owner-scoped `auth.uid() = user_id` SELECT policy is what remains. Its absence from the current advisor set
  is the positive confirmation. **Verdict: CLEAN (v4.0 remediation intact) — re-confirmed, not assumed.**
- **The 2 `rls_policy_always_true` residuals — intentional (do-not-weaken).** `paddle_webhook_events`
  ("Service role can manage webhook events") + `scheduled_emails` ("Service role can manage all scheduled
  emails"). service_role bypasses RLS regardless, so an always-true "manage" policy on a service-role-only
  table is not a client-reachable exposure. Re-examined per D-04 → **by-design**, not a finding. KEEP-LIST
  Class 2/3-adjacent (paddle_webhook_events is the gated Paddle idempotency store; scheduled_emails is
  cron/service-written).
- **Service-role write tables carry explicit posture (v4.0 Ph8).** The RLS-enabled merit/cache/paddle/
  analysis tables have owner-scoped client policies + service-role management; no `rls_enabled_no_policy`
  advisor appears in the floor (v4.0 cleared it to 0). **Verdict: CLEAN.**

**Domain 3 severity: LOW (re-confirm floor).** No RLS regression; the floor is the intentional set. No
remediation. Route: **clean / accepted residual** (the 2 always-true policies + `public-assets` listing +
leaked-password toggle are carried in the SEC-15 accepted-residual register, each with the justification above).

***

## Domain 4 — User + Resource Ownership

**Technique:** confirm owner-scoping on user-facing reads via the RLS owner policies (SELECT-as-role
reasoning against the `pg_policies` re-pull) + the DATABASE.md code-reference map of frontend reads
(`.eq('user_id', …)` / `.eq('id', userId)`), cross-checked against the v4.0 Ph8 owner-scoping.

**Findings:**

- **User-facing reads are owner-scoped.** Per DATABASE.md's dual read/write call map, frontend reads route
  through owner-scoped surfaces (`AnalysisHistory.tsx:175` on `usage_tracking` under
  `usage_tracking_user_select_policy`; `useAchievements.ts:127`; `Profile.tsx` on own `profiles` row). The
  `linkedin_grades` read path is now owner-scoped (the "Anyone can view" drop, Domain 3) — a user reads only
  their own grades. **Verdict: CLEAN (owner-scoped after v4.0 Ph8; the one historic cross-user exposure —
  linkedin_grades — is closed).**
- **Admin-scoped reads are role-gated, not owner-scoped by design.** `upgrade_requests` "Admins can view all"
  (the perf-advisor's second policy) is a deliberate admin-visibility policy gated on the admin role via
  `has_role`; it coexists with the owner policy "Users can view their own". This is correct least-privilege
  (admin sees all, owner sees own) — the `multiple_permissive_policies` flag on it is a **performance** nudge
  (Domain-15/perf), not an ownership over-exposure. **Verdict: CLEAN.**
- **Service-role writes bypass RLS intentionally** (edge functions use `getServiceClient()` for cross-user
  system writes — usage rows, cache, webhook events); this is the documented architecture, not an ownership
  gap.

**Domain 4 severity: LOW.** No cross-user ownership leak at HEAD. No remediation. Route: **clean.**

***

## Domain 15 — DB Function Permissions

**Technique:** re-examine the 11 kept authenticated EXECUTE grants against the delegated advisor pull +
the SEC-09 search_path posture (v4.0 Ph8 cleared `function_search_path_mutable` DB-wide 1→0) + the
anon-EXECUTE=0 invariant.

**Findings:**

- **anon EXECUTE = 0 — CONFIRMED intact.** The current floor contains **no** anon-executable
  SECURITY-DEFINER advisor (only the `authenticated_*` class for the 11 kept grants). v4.0 Ph8's
  "anon EXECUTE → 0" holds. **Verdict: CLEAN.**
- **search_path pinned on SECURITY DEFINER fns — CONFIRMED intact.** The floor contains **no**
  `function_search_path_mutable` advisor (v4.0 Ph8 pinned `ts_to_utc_date` + `increment_rate_limit` and
  cleared the class DB-wide 1→0). SEC-09 stays `remediated`. **Verdict: CLEAN.**
- **The 11 kept `authenticated` EXECUTE grants — intentional (do-not-weaken), re-examined individually.**
  These are the 11 `authenticated_security_definer_function_executable` advisors enumerated in the floor
  table above. Each is R-DB-05 load-bearing: `can_perform_ai_action` (FE `Navbar.tsx:109` +
  `SkillsGapAnalysis.tsx:108` + `usage-checker.ts:74`), `has_role` (admin gate across functions),
  `get_merit_balance` / `record_feature_usage` / `record_recommendations_shown` (merit + intel RPCs),
  `admin_set_user_merits` / `admin_upgrade_user` / `get_admin_usage_stats` / `get_pending_upgrade_requests` /
  `get_user_usage_breakdown` (admin-gated RPCs that internally enforce `has_role`), `auth_owns_version`
  (ownership helper). Revoking any breaks a live path (Pitfall 2). **Do-not-revoke; recorded do-not-weaken.**

**Domain 15 severity: LOW (re-examine the 11).** No DB-function permission regression. No remediation. Route:
**clean / do-not-weaken** (the 11 kept grants are the accepted residual, load-bearing, in the SEC-15 register).

***

## KEEP-LIST Cross-Check (Task 1 — no gated-but-live item mis-reported)

| Candidate that could look like a finding | KEEP-LIST class | Verdict |
| ---------------------------------------- | --------------- | ------- |
| `paddle_webhook_events` always-true "manage" policy | Class 2 (Paddle gated-but-live) | intentional (do-not-weaken); Phase 8 owns removal |
| `scheduled_emails` always-true "manage" policy | Class 3-adjacent (cron/service-written) | intentional (do-not-weaken) |
| 11 kept `authenticated` EXECUTE grants (incl. `can_perform_ai_action`) | R-DB-05 load-bearing | do-NOT-revoke; live FE + RLS-context callers |
| `public-assets` bucket listing | operator/storage | intentional (deliberately-public asset bucket) |
| `unused_index` ×~48 | (perf / D-11 low-traffic) | NOT a security finding; deferred perf item |

**No gated-but-live structure is mis-reported as a removal or a weakening finding.** Every one is recorded
do-not-touch with its live signal.

***

## Domain 12 — Merit + Billing-Operation Integrity

**Technique:** read `_shared/merit-gateway.ts` + `grade-linkedin/index.ts` at current HEAD (`b765629e`);
confirm the two known billing defects survive byte-for-byte and cite the current-HEAD line anchors (the
research's line numbers move — these are re-confirmed here, not inherited).

### Fix 1 — Merit non-idempotent deduct — **HIGH → route 02-05** (CONFIRMED live at HEAD)

- **Confirmed at `_shared/merit-gateway.ts:201-205`:** `withMerits` calls the deduct RPC with exactly
  **three** named args — `p_user_id`, `p_feature`, `p_tier` — and never forwards `p_idempotency_key`:
  ```ts
  const { data, error } = await supabase.rpc('check_and_deduct_merits', {
    p_user_id: ctx.userId,
    p_feature: feature,
    p_tier: ctx.tier,
  });
  ```
  The sole surviving overload is the 4-arg `check_and_deduct_merits(uuid,text,text,text DEFAULT NULL)`
  (the legacy 3-arg was dropped by `20260520000000_drop_legacy_check_and_deduct_merits_3arg.sql`). Because
  `p_idempotency_key` defaults NULL, the RPC's partial-unique index
  (`WHERE source='feature-deduct' AND idempotency_key IS NOT NULL`) **never engages** → **every production
  Merit deduction is non-idempotent** (double-click / two-tab / refresh-resubmit each deducts independently).
- **Adjacent null-safety note for the fix (not a separate finding):** the post-success transaction log at
  `merit-gateway.ts:226-234` reads `(data as any).deducted_from` / `remaining_balance`, which are `undefined`
  on the 4-arg RPC's `already_deducted` branch — the 02-05 fix that forwards the key must make that log
  null-safe for the replay branch.
- **Classification:** impact **High** (per-user financial incorrectness — double-charge of Merits) ×
  exploit **Moderate** (double-click / two tabs / a refresh race) → **HIGH**.
- **Scope boundary (D-03a):** 02-05 wires the gateway *capability* (forward `p_idempotency_key`) + a guard
  driving `withMerits` with a repeated key → exactly ONE deduction; per-feature key derivation + frontend
  threading is Phase 3 (LIFE-05 / plan 03-02) — the 02-05 seam must be the one Phase 3 EXTENDS, not replaces.
  **Money path → `autonomous:false` operator checkpoint** (v4.0 Ph7.1 precedent).

### Fix 2 — grade-linkedin refund-after-save / hidden-success 500 — **HIGH → route 02-05** (all 3 post-save sites confirmed)

The anti-pattern: a **post-save** `record_ai_usage` / `recordUsageWithAnalysis` failure throws (or 500s)
**after** the `linkedin_grades` row is already durably saved (and the extract-webhook / email fired) — a
refund of an already-delivered analysis (merit path) + a success reported to the user as a 500 (all paths).
All three sites confirmed at HEAD `b765629e`:

1. **Merit-path refund-after-save — `grade-linkedin/index.ts:554-559`** (INSIDE the `withMerits` callback):
   `const stored = await storeAndNotify(result.parsed)` (L554) → `recordUsageWithAnalysis(userId,
   'linkedin_grading', 1, stored.recordId)` (L555) → on `!usageResult.ok`, `throw new MeritRefundable(500,
   'Could not record LinkedIn grade usage.')` (L558). The throw propagates into `withMerits`'s catch →
   **`refund_merits` fires for an already-saved + already-emailed analysis** (double benefit) AND the caller
   surfaces it as a 500 (hidden success). The comment two lines up (L552-553) literally says "Non-blocking —
   a failed insert logs but does NOT fail the user request" while the code throws.
2. **Free-path hidden-success 500 — `grade-linkedin/index.ts:518-522`** (NOT inside `withMerits`, so no
   refund): `storeAndNotify` (L512) → `recordUsageWithAnalysis(...,0,...)` (L518) → `throw new
   MeritRefundable(500, …)` (L521). No deduction to refund, but it still reports a saved+emailed analysis as
   a 500. (Note: the free-scan flag flip at L524-530 is AFTER the throw, so the throw does not itself burn the
   flag — but the user still gets a 500 on a delivered result.)
3. **Legacy non-`withMerits` path hidden-success 500 — `grade-linkedin/index.ts:822-828`:** after the
   `linkedin_grades` insert (L792-802) + `persistLinkedInAnalysis` (L812) + `triggerExtractWebhook` (L820),
   `recordUsageWithAnalysis(...)` (L822) → on `!ok`, `return new Response(JSON.stringify({ error: 'Could not
   record LinkedIn grade usage.' }), { status: 500 })` (L825-828). Same anti-pattern via a `return 500`
   instead of a throw: the row is durably saved + extract-webhook fired before the 500 (the email block at
   L831+ is gated after, so this path's 500 skips the email but still hides a saved analysis behind a 500).
   Routed to 02-05 as a same-class billing finding (log-and-continue).

- **KEEP (byte-preserve) — the legitimate pre-save throw at `grade-linkedin/index.ts:459-462`:** inside
  `storeAndNotify`, `if (insertError || !record?.id) { … throw new MeritRefundable(500, 'Could not save
  LinkedIn grade history.') }`. This throws **before** the row is durable → a refund is correct here.
  **Preserve byte-identical.** The 02-05 fix converts ONLY the three post-save sites (1/2/3 above) to
  log-and-continue (fall through to `return stored.response` / the saved 200), never this pre-save throw.
- **Classification:** impact **High** (refund-on-success + double benefit + success-reported-as-failure) ×
  exploit **Moderate** (a post-save usage-write failure — a race / transient DB error) → **HIGH**.
- **Money path → `autonomous:false` operator checkpoint.**

**Domain 12 verdict: 2 HIGH findings (Fix 1 + Fix 2's 3 sites) → route 02-05; the pre-save throw (L459-462)
is a byte-preserve KEEP.**

***

## Domain 13 — Webhook Auth + Replay

**Technique:** read `paddle-webhook/index.ts` + `stripe-webhook-handler/index.ts` at HEAD; confirm the
signature/dedup mechanics that must be preserved and the replay/leak gaps to remediate.

### Fix 3 — Paddle webhook: no replay-window + 500 config-leak — **MEDIUM → route 02-06** (CONFIRMED live)

- **PRESERVE — signature auth is correct** (`paddle-webhook/index.ts:12-59`): HMAC-SHA256 over
  `${ts}:${payload}` (L28) with the secret, compared via `timingSafeEqual` from `std@0.224.0` (L54),
  length-guarded (`if (computedBytes.length !== h1Bytes.length) return false` at L53). **Byte-preserve.**
- **PRESERVE — `event_id` idempotency dedup** (`paddle-webhook/index.ts:144-171`): reads
  `paddle_webhook_events` by `event_id` (L152-156), short-circuits with 200 "Already processed" on a hit
  (L158-164), else inserts the event (L167-171). Because `event_id` is inside the signed body, this already
  blocks replay of a *captured identical* event. **Byte-preserve.**
- **GAP (the fix) — `ts` parsed but never freshness-checked:** the timestamp `ts` is extracted at
  `paddle-webhook/index.ts:24` and used ONLY to build the signed payload (L28); there is **no replay-window /
  freshness bound** on it. A valid-signature payload with a stale `ts` (outside the `event_id`-dedup window,
  or before the event was ever recorded) is accepted. The 02-06 fix adds a `|now - ts|` bound (~5 min, the
  Paddle-recommended pattern), keeping the `event_id` dedup.
- **SECONDARY GAP — 500 body leaks config state** (`paddle-webhook/index.ts:105-113`): when
  `PADDLE_WEBHOOK_SECRET` is unset the handler returns `status: 500` with body
  `{ error: 'webhook_secret_not_configured', message: 'PADDLE_WEBHOOK_SECRET environment variable is not
  set' }` — the message **names the env var** (config disclosure). The 02-06 fix makes the missing-secret
  (and keeps the invalid-signature) response a **generic, non-leaky** body (reason code to the structured log
  only, per the `_shared/auth.ts` reason-code discipline). Note the missing-signature (L119-125) and
  invalid-signature (L132-138) responses are already generic — only the missing-secret path leaks the name.
- **Live-state note (does not lower the code obligation):** `PADDLE_WEBHOOK_SECRET` is currently **UNSET on
  prod** (ENV-04 remediation, 2026-06-23), so the endpoint **fail-closes today** (it returns the 500 and does
  no processing). That lowers the live exploitability (borderline Medium), but the code path must be safe if
  the secret is ever restored while in-flight Paddle subs expire (Phase 8 owns the expiration gate + removal).
- **Classification:** impact **Medium** (replay of a stale signed event within the event-id-dedup gap is
  narrow + the 500 config-leak) × exploit **Moderate** (needs a captured valid-signature payload; secret
  currently unset → fail-closed) → **MEDIUM**.
- **Scope boundary (D-03c):** harden in place (replay-window + non-leaky error). **Do NOT remove Paddle**
  (Phase 8 owns the expiration gate). `type: 'webhook'` returns `{}` CORS by design — keep. Webhook edits are
  operator-relevant but not a money-path deduction — 02-06 owns the guard.

### Stripe webhook — **PRESERVE** (correct at HEAD)

- **`stripe-webhook-handler/index.ts` is correct and must be preserved:** signature verify via
  `stripe.webhooks.constructEventAsync` (SDK-only, never hand-rolled — L135); **insert-first idempotency**
  into `stripe_webhook_events` with `event_id = event.id` (L163-166) that catches the `23505`
  unique-violation → returns `200 { received: true, duplicate: true }` (L172-175); unknown event types
  short-circuit BEFORE the idempotency insert (L150-153); idempotency-row delete-on-downstream-failure so a
  retry can re-execute the grant (L181-202). **No finding — record preserve.** (The separate
  `stripe-webhook` function is the Phase-27 410-Gone shim; not in scope here.)

**Domain 13 verdict: 1 MEDIUM finding (Fix 3 — Paddle replay-window + 500 config-leak) → route 02-06;
Paddle HMAC/`timingSafeEqual`/`event_id` dedup + Stripe `constructEventAsync`/insert-first idempotency are
byte-preserve KEEPs.**

***

## Routing Summary (what 02-05 / 02-06 / 02-08 consume)

| Finding | Domain | Severity | Route | Byte-preserve KEEPs (do not over-reach) |
| ------- | ------ | -------- | ----- | --------------------------------------- |
| Fix 1 — Merit non-idempotent deduct (`merit-gateway.ts:201-205`) | 12 | **HIGH** | **02-05** (money-path, `autonomous:false`) | the deduct call SHAPE + the post-success log (make null-safe, don't remove) |
| Fix 2 — refund-after-save / hidden-success 500 (grade-linkedin L554-559, L518-522, L822-828) | 12 | **HIGH** | **02-05** (money-path, `autonomous:false`) | the pre-save throw at L459-462; the `log.error('usage-tracking-insert-failed', …)` reason-code line |
| Fix 3 — Paddle no replay-window + 500 config-leak (`paddle-webhook` L24/L105-113) | 13 | **MEDIUM** | **02-06** | Paddle HMAC over `${ts}:${payload}` + `timingSafeEqual` + length-guard (L12-59); `event_id` dedup (L144-171); Stripe `constructEventAsync` + insert-first idempotency |
| RLS / ownership / DB-fn (domains 3,4,15) | 3,4,15 | LOW | clean / accepted residual | the 11 kept EXECUTE grants; the 2 service-role always-true policies; owner-scoped linkedin_grades |
| Advisor floor = 15 (all intentional) | — | — | **02-08** SEC-15 do-not-weaken baseline | the exact 15-item intentional set |

**No NEW crit/high needing a migration surfaced** — no gap-closure operator-gated migration plan is required
from this sweep. The 02-05 fixes are `supabase/functions/**` code edits (gateway plumbing + grade-linkedin
log-and-continue), not DDL; 02-06 is a `paddle-webhook` code edit. No `supabase/migrations/*.sql` is owed by
this phase for the confirmed findings.

***

## Cross-References

- **`SECURITY-AUDIT.md`** — the 17-domain coverage index (this doc owns 3,4,12,13,15) + the SEC-11
  disposition table + the severity rubric this sweep applies.
- **`audit/CODE-EDGE-FINDINGS.md` (02-02)** — the sibling code/edge sweep (domains 1,2,5,6,7,9,10,11,14);
  confirmed NO new crit/high in the code surface, so the crit/high set lives here + is fully enumerated.
- **`.planning/audit/DATABASE.md`** — the v4.0 DB inventory + the Phase-8 (2026-06-24) canonical-prod
  (`zjpjapgraoxdukdvpjes`) re-pull that the `linkedin_grades` drop + 1-user-prod-truth readings come from.
- **`.planning/audit/RESIDUAL-REGISTER.md` / `KEEP-LIST.md`** — the R-DB-05 kept-EXECUTE grants + the Paddle
  Class-2 gated remnants + DEP residuals; the do-not-weaken gate.
- **`.planning/phases/02-security-audit-remediation/02-RESEARCH.md` / `02-PATTERNS.md`** — the three targeted
  fix seams + the guard patterns; this sweep re-confirmed the seams at HEAD `b765629e` (line anchors updated).
- **02-05 (remediation A — money-path)** consumes Fix 1 + Fix 2; **02-06 (remediation B)** consumes Fix 3;
  **02-08 (SEC-15 record)** consumes the confirmed 15-advisor floor as the do-not-weaken baseline.

*This file records object/policy/function/env names, source line anchors, advisor names, findings, and
classifications only — no secret VALUE is pasted anywhere in it. Project-refs are identifiers, not secrets.*
