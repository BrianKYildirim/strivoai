---
task: Prepare the load-testing harness for execution WITHOUT preview (local + throwaway)
slug: 260726-prepare-load-harness-local-and-throwaway
status: in-progress
date: 2026-07-26
branch: staging
mode: quick (build/prepare + docs; NO generated traffic, NO real-provider calls, NO prod)
---

# Task

Operator has no access to the existing preview environment. Prepare the harness so it
can be executed against (1) a LOCAL Supabase stack for correctness, and (3) a NEW
throwaway cloud environment — and (2) support small, gated real-provider calibration.

# Hard blocker discovered

- **Docker is DOWN** on this machine → `supabase start` cannot bring up the local stack.
- **k6 is not installed.**
Therefore the LIVE Part-1 validation cannot be executed in this session. I will PREPARE
everything (harness local support + a correctness validator + exact commands) and report
the live run as blocked-on-Docker — no fabricated results.

# Constraints (from the request)

- Do NOT modify or load-test production. Do NOT send generated traffic this task.
- Do NOT make any real-provider call unless explicitly approved.
- No secret VALUES committed or printed. Synthetic data only. MERIT_SYSTEM_ENABLED=true
  locally (merit paths CAN be tested locally, unlike preview).
- Do not present local laptop performance as Strivo's hosted capacity (correctness only).

# Deliverables

## Part 1 — local functional validation (prepared, runnable once Docker is up)
- MODIFY `load-testing/config/environments.js`: add a `local` traffic target (loopback
  URL 127.0.0.1/localhost → ref `local`), keep the production ref hard-blocklist.
- NEW `load-testing/tools/validate-local.mjs`: single-request correctness validator using
  @supabase/supabase-js + service role against the LOCAL stack. Asserts, in order:
  one submission → one job row created → one merit deduction (cost read from the ledger,
  not hardcoded) → duplicate submission reuses the same job/attempt (no double-charge) →
  completed result stored + retrievable → polling recovery works → permanent failure
  (AI_FORCE_FAILURE) refunds correctly → and records that ZERO production requests occur
  (loopback-only, prod ref refused).
- NEW `load-testing/LOCAL.md`: exact `supabase start`, migrate, `functions serve`
  (env-file names only), fixture provisioning, and validate commands.

## Part 2 — real-provider calibration support (no calls made)
- NEW `load-testing/tools/real-run-guard.mjs`: persistent CUMULATIVE $5 cap ledger +
  typed human-confirmation gate. Refuses if cumulative+projected > $5 or confirmation
  phrase absent. Makes NO provider call; only vets + prints the exact command and reserves
  spend. Never prints/stores the key (name-only check of ANTHROPIC_API_KEY presence).

## Part 3 — throwaway environment instructions
- NEW `load-testing/TEMP-ENVIRONMENT.md`: exact Supabase (new project) + Vercel (new
  project / CLI) steps, env-var NAMES, migration + edge-deploy + frontend-deploy commands,
  fixture provisioning, validate command, first load-test rung command, cleanup/deletion.

## Cross-cutting
- MODIFY `load-testing/.env.load.example`: add `local`, real-provider (names only), and
  throwaway sections.
- MODIFY `load-testing/README.md`: link LOCAL.md + TEMP-ENVIRONMENT.md; note the `local`
  target.

# Verification (build-only; no traffic)
- `node --check` on all new/modified JS; `npx eslint load-testing/` clean.
- Secret scan clean (names only; no values).
- Confirm production ref still hard-blocked in every entry point (incl. the new `local`
  path and validator).
- Commit ONLY `load-testing/`; leave `.planning/` uncommitted per policy.
