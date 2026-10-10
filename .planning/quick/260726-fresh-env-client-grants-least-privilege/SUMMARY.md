---
task: Fresh-env anon/authenticated grants vs prod (least-privilege) + prove escalation invariants
slug: 260726-fresh-env-client-grants-least-privilege
status: complete
date: 2026-07-26
branch: staging
commits:
  - 5f9fee3f fix(db): fresh-env client grants (least-privilege) + close tier self-upgrade gap
---

# What was done

Compared a fresh replay's client-role grants against **production (read-only)**, applied
least-privilege grants on fresh envs matching prod, preserved RLS, and **proved** users
cannot escalate tier/merits/admin or read another user's data — closing a live prod gap in
the process.

## Production comparison (read-only, via prod MCP)
- Every public table has RLS enabled (0 without) → RLS is the security boundary.
- Prod grants anon/authenticated broad table access on all public tables EXCEPT backend-only
  lockdowns: `ai_call_telemetry` (no client access), `goal_taxonomy` (authenticated
  read-only, no anon), `resumes` + `career_targets` (no authenticated table INSERT/UPDATE —
  writes are server-mediated).
- A fresh replay had NONE of these grants (frontend 403s everywhere).

## Fix (migration 20260726130000 + rollback, commit 5f9fee3f)
- Least-privilege base client grants (RLS-gated) reproducing prod's posture incl. the
  backend-only lockdowns. No-op on prod if ever deployed; RLS untouched.
- **Security finding + fix (live on prod):** authenticated holds column UPDATE on
  `profiles.subscription_tier`, the profiles UPDATE RLS policy has no WITH CHECK, and no
  trigger guarded it → a user could self-upgrade tier (and touch stripe/billing columns) via
  direct PostgREST. Added a BEFORE UPDATE trigger blocking CLIENT roles from changing
  server-managed billing/entitlement columns (service_role + migrations unaffected).

## Proof (scripts/prove-security-invariants.mjs, fresh local stack, real user JWTs) — 9/9
- cannot change subscription_tier / stripe billing columns → 403, unchanged (trigger)
- cannot change merit balance → RLS default-deny (no UPDATE policy), 0 rows, unchanged
- cannot grant self admin → user_roles RLS requires has_role('admin'), 403, no row, not admin
- cannot read another user's profile / resume / merits → owner-scoped RLS, 0 rows
- CAN edit own allowed profile columns + read own data → positive controls pass
- **RED confirmed load-bearing:** with the trigger dropped, the same tier self-upgrade
  succeeds (200, free→elite); with it, 403 + unchanged.

## Verification
- Clean `supabase db reset` (all migrations incl. the two new grant migrations): exit 0.
- Proof 9/9 PASS. node --check on the proof script: pass.
- Production untouched: read-only prod MCP for the comparison only; all writes/tests →
  http://127.0.0.1:54321; the migration is NOT deployed anywhere; synthetic users purged;
  local stack stopped.

## Live prod finding (flagged, not deployed)
Prod currently allows tier self-upgrade — the committed trigger closes it. **Deploying
migration 20260726130000 (or just the trigger) to prod would close the live gap.** Recorded
in memory [[prod-profiles-tier-self-upgrade]].

## Known follow-up (not in this task)
load-testing scenario 10 seeds a resumes row via the USER JWT, but prod (and now fresh envs)
correctly forbid authenticated INSERT on resumes (server-mediated upload) — that seed should
move to a service-role pre-seed step. Flagged, not changed here.
