# Phase 30: Free Tier 10/Month + Cap Display + Legacy Gate Migration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-16
**Phase:** 30-free-tier-10-month-cap-display-legacy-gate-migration
**Areas discussed:** Free backfill grant semantics, First reset_date backfill strategy, MER-12 scope (frontend only or backend too), Cap display format when shop>0

---

## Area 1 — Free backfill grant semantics

### Q1.1 — Backfill amount

| Option | Description | Selected |
|--------|-------------|----------|
| Top up to 10 (add `10 − current`) | User with current=2 becomes 10. User with current=5 becomes 10. Everyone lands at 10. | |
| Add 5 to everyone (parallel grant) | User with current=2 becomes 7. Symmetrical "tier doubled" grant. | |
| Set to 10 only if currently <10 | Functionally equivalent to top-up but expressed as a guard. | ✓ |

**User's choice:** Set to 10 only if currently <10 → captured as D-02 (`subscription_balance = GREATEST(10, subscription_balance)`).

### Q1.2 — `lifetime_granted` handling

| Option | Description | Selected |
|--------|-------------|----------|
| Add the backfill delta (preserves historical total) | Honest record; matches `reconcile_merit_balance` invariant. | ✓ |
| Leave `lifetime_granted` untouched | Minimal migration; risks reconciliation drift if downstream reads it as authoritative. | |
| Bump everyone to flat 10 | Loses tenure signal; probably wrong for future analytics. | |

**User's choice:** Add delta → captured as D-02/D-03 (`lifetime_granted = lifetime_granted + (new - old)`).

---

## Area 2 — First `reset_date` backfill strategy

### Q2.1 — Backfill strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Anniversary of `profile.created_at` | Spreads cron load naturally; matches "renewal day" UX. Edge case: recent-created users get a near-term reset. | ✓ |
| Uniform `now() + 1 month` for everyone | Simplest mental model; all-Free cron spike on the same monthly day. | |
| Staggered random within 30 days | Smooth load forever; arbitrary reset day, hard to explain to users. | |

**User's choice:** Anniversary → captured as D-04.

### Q2.2 — Anniversary edge: day-of-month already passed this cycle

| Option | Description | Selected |
|--------|-------------|----------|
| Next occurrence of anniversary day (may be <30 days) | Strict anniversary semantics. Tiny cohort gets reset within days; acceptable because MER-01 backfill already gave them 10. | ✓ |
| `MAX(next_anniversary, now()+30 days)` | Guaranteed full first month; cleaner optics; resumes anniversary on cycle 2. | |

**User's choice:** Next occurrence, may be <30 days → captured as D-04 + Specifics note about no-op-then-cron-tick behavior.

---

## Area 3 — MER-12 scope (frontend only or backend too)

### Q3.1 — Initial scope question

| Option | Description | Selected |
|--------|-------------|----------|
| Frontend only (per spec wording) — leave edge-function legacy path alone | Lowest blast radius; preserves Phase-29 kill-switch. | |
| Frontend + edge function (full rip) | Merit-system-only; deletes operator rollback safety net. | ✓ (initial) |
| Frontend + flag edge-function rip for follow-up phase | Documents inconsistency without acting. | |

**User's choice:** Full rip (initial) — but I flagged that the edge-function legacy branch is the `MERIT_SYSTEM_ENABLED` operator kill-switch (default false) and asked for confirmation.

### Q3.2 — Confirm rip after kill-switch context

| Option | Description | Selected |
|--------|-------------|----------|
| Still rip it — merit system is the only path | No flip-back; only code-revert + redeploy if merit system breaks. | ✓ |
| Revise to frontend-only + flag for follow-up | Safe — defer rip until merit system has weeks of clean prod telemetry. | |
| Rip frontend now + rip edge function as separate plan in this phase | Both land in Phase 30 as separable plans. | |

**User's choice:** Still rip → captured as D-15/D-16. Phase 29 just landed but user accepts the post-bake risk profile.

### Q3.3 — Disposition of `can_perform_ai_action` SQL function

| Option | Description | Selected |
|--------|-------------|----------|
| Leave the RPC in DB (deferred cleanup) | Defends against hidden callers (operator scripts, support tooling). | ✓ |
| Drop in same migration | Atomic; risks breaking any undiscovered caller. | |

**User's choice:** Leave in DB → captured under Deferred Ideas + noted as MER-12 "interim step" per spec wording.

---

## Area 4 — Cap display format when shop>0

### Q4.1 — Header label format

| Option | Description | Selected |
|--------|-------------|----------|
| `{subscription+shop} / {cap}` + chip `+ {shop} bonus` (when shop>0) | Spec example match; bonus chip retained as secondary indicator. | |
| `{subscription+shop} / {cap}` only — drop the bonus chip entirely | Truly single value. Shop only visible in popover. Conflicts with spec wording. | ✓ |
| `{subscription+shop} / {cap}` + popover chip in body only | Trigger monolithic, bonus moves into popover body. | |

**User's choice:** Drop the chip entirely.

### Q4.2 — Visual state color logic

| Option | Description | Selected |
|--------|-------------|----------|
| Compute `isLow`/`isZero` on total (sub+shop) | Matches the displayed value. | ✓ |
| Keep computing on subscription only | Color contradicts the displayed number when shop covers depleted sub. | |
| Hybrid: destructive on total=0, amber on subscription ≤ 20% of cap | Informationally rich but more rules to explain. | |

**User's choice:** Compute on total → captured as D-11.

### Q4.3 — Spec conflict resolution (raised by me after Q4.1)

| Option | Description | Selected |
|--------|-------------|----------|
| Override the spec — drop the chip + update REQUIREMENTS.md + ROADMAP.md | Treat as deliberate amendment; CONTEXT.md and source docs aligned. | ✓ |
| Keep chip per spec | Spec-compliant; revert Q4.1 choice. | |
| Move chip to popover body only | Spec-compatible compromise. | |

**User's choice:** Override + update docs → captured as D-17 + Specifics commit-message guidance.

---

## Claude's Discretion

The following were left to the planner:

- Migration filenames/numbering (split vs. collapse the trigger update, RPC update, backfill, and test changes).
- Test approach for free backfill: Deno test (default, no pgTAP runner in CI) vs. pgTAP.
- Whether to delete or correct the stale `TIER_LIMITS` constant in `useTierAccess.ts:39-43`.
- Exact derivation of `usageInfo.used` / `analysisCount` in the hook rewrites (proxy from `cap - subscription`, ledger aggregate, or drop the field).
- Whether `useMerits` `staleTime` (5000ms) needs adjustment given three new consumers — recommend leave alone.

---

## Deferred Ideas

- Drop `can_perform_ai_action` SQL function after ~30 days of clean prod telemetry (Phase 30 only removes callers).
- Drop `usage_tracking` table entirely once all read/write call-sites are migrated (MER-12 explicitly self-describes as an interim step).
- Free-tier cron throttling if Free user base outgrows single-batch capacity at the current 15-min cadence.
- `TIER_LIMITS` cleanup in `useTierAccess.ts` if not handled in Phase 30 (Claude's Discretion).
- Feb-29-created-user "anniversary" UX (clamped to Feb 28 in non-leap years — acceptable, not worth dedicated surface).
