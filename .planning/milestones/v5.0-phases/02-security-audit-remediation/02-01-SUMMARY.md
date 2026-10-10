---
phase: 02-security-audit-remediation
plan: 01
subsystem: testing
tags: [security, audit, asvs, threat-model, vitest, static-guard, sec-11, sec-12, sec-14]

# Dependency graph
requires:
  - phase: 01-cross-origin-error-contract-foundation
    provides: CORS domain remediation (cross-origin marked VERIFY-ONLY in the coverage index)
provides:
  - SECURITY-AUDIT.md catalog — SEC-11 10-row disposition table + severity rubric + 17-domain coverage index
  - 02-SECURITY.md — Phase-2 ASVS-L1 threat register (T-02-01..08) + trust boundaries + accepted-risk log
  - security-audit-docs.test.ts — the first D-05 automated guard (SEC-11 completeness, SEC-12 coverage, no-secret-leak)
affects: [02-02, 02-03, 02-04, 02-05, 02-06, 02-07, 02-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Static-source doc guard (node:fs, process.cwd()-relative, vitest auto-discovered) — extends the cors-audit.test.ts / pricing-token-guard.test.ts precedent to audit-doc completeness + secret-leak prevention"
    - "Names-only audit-doc discipline enforced by a committed static assertion (not a documented claim)"

key-files:
  created:
    - .planning/phases/02-security-audit-remediation/SECURITY-AUDIT.md
    - .planning/phases/02-security-audit-remediation/02-SECURITY.md
    - src/test/security/security-audit-docs.test.ts
  modified: []

key-decisions:
  - "SEC-07 dispositioned needs-decision -> remediate-MEDIUM (routed to plan 02-07); SEC-10 re-scoped/accepted (currency, not a vuln)"
  - "No-secret-leak guard uses VALUE-tuned patterns (full key body / JWT {30,} / PEM PRIVATE KEY header) so pattern-documentation prose in sibling planning docs does not trip it, letting the guard scan every .md in the phase dir"

patterns-established:
  - "Doc-guard = static assertion over the committed audit record (SEC-11 10 rows, SEC-12 17 domains, secret-grep = 0), folded into verify:baseline via vitest auto-discovery"

requirements-completed: [SEC-11, SEC-12, SEC-14, SEC-15]

# Metrics
duration: 12min
completed: 2026-07-01
---

# Phase 2 Plan 01: Security Audit Apparatus Summary

**Stood up the Phase-2 audit apparatus — a SEC-11 10-row disposition table + impact x exploitability severity rubric + 17-domain coverage index (SECURITY-AUDIT.md), an ASVS-L1 threat register T-02-01..08 (02-SECURITY.md), and the first D-05 automated doc-completeness / no-secret-leak vitest guard (15 assertions green).**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-01T22:52:05Z
- **Completed:** 2026-07-01T23:05:05Z
- **Tasks:** 3
- **Files modified:** 3 (all created)

## Accomplishments
- **SEC-11 essentially closed:** the deferred v1.0 SEC-01..10 obligations now have a confirmed 10-row disposition table (8 remediated/accepted, SEC-07 needs-decision->remediate-MEDIUM, SEC-10 re-scoped/accepted), each with a disposition token + non-blank evidence pointer, plus the naming-collision warning (v2.0 phase "SEC-06" != v1.0 milestone SEC-06).
- **Severity rubric established** as the single source of truth for in-phase classification: impact x exploitability, `Severity = max-of-reasoning`, D-01 threshold (`Critical + High + Medium` remediated in-phase, only `Low` deferred), and the five worked classifications.
- **17-domain coverage index** routes every audit domain to its owning sweep (02-02 / 02-03 / 02-04) or `VERIFY-ONLY (Phase 1)` for cross-origin — scaffolds SEC-12 for the later sweeps.
- **Phase ASVS-L1 threat register** enrolls T-02-01..08 (STRIDE + disposition=mitigate + remediation-plan + guard pointer); T-02-07/08 closed by this plan's guard, `threats_open: 6`.
- **First D-05 guard green in-gate:** `security-audit-docs.test.ts` asserts (not claims) SEC-11 completeness, SEC-12 coverage, and no-secret-leak; 15 assertions pass; full vitest suite 472 passed (457 baseline + 15 new), no regressions.

## Task Commits

Each task was committed atomically:

1. **Task 1: Author SECURITY-AUDIT.md (SEC-11 + rubric + 17-domain index)** - `6b08e988` (docs)
2. **Task 2: Author 02-SECURITY.md phase threat register (ASVS L1)** - `b773f0ab` (docs)
3. **Task 3: Author + run doc-completeness / no-secret-leak vitest guard** - `3f36688c` (test)

**Plan metadata:** (final docs commit — SUMMARY + STATE)

## Files Created/Modified
- `.planning/phases/02-security-audit-remediation/SECURITY-AUDIT.md` - The durable Phase-2 audit catalog: SEC-11 disposition table (10 rows), severity rubric, 17-domain coverage index, how-to-re-run, cross-references.
- `.planning/phases/02-security-audit-remediation/02-SECURITY.md` - Phase ASVS-L1 threat register (T-02-01..08), trust boundaries, accepted-risk log (seeded, pending 02-08), sign-off (deferred to 02-08).
- `src/test/security/security-audit-docs.test.ts` - Vitest static guard: SEC-11 disposition completeness (10 rows, none blank), SEC-12 17-domain coverage (length-guarded ===17), no-secret-leak sweep over every phase-dir `.md` (tuned VALUE patterns, project-refs allowlisted).

## Decisions Made
- **SEC-07 / SEC-10 dispositions:** SEC-07 (prompt-sanitizer coverage gap) marked `needs-decision -> remediate-MEDIUM` and routed to plan 02-07; SEC-10 (Deno stdlib drift) marked `re-scoped/accepted (currency, not a vuln)` per the RESEARCH disposition map. All other eight SEC-0x are `remediated`/`accepted-with-justification`, confirm-then-record by their owning sweep.
- **Guard pattern tuning:** the no-secret-leak patterns match secret VALUES (full key body, JWT `{30,}`, `-----BEGIN ... PRIVATE KEY-----`, `postgres://<alnum>`), not the bare pattern NAMES that planning docs (PLAN/RESEARCH) legitimately document. This lets the guard recursively scan every `.md` in the phase dir (incl. the future `audit/` subdir + SEC-15 record) without false-positiving on pattern-documentation prose, while still catching a real pasted secret. Verified zero offenders across all existing phase docs before wiring.
- **T-02-07/08 closed this plan:** the two threats whose mitigation IS this plan's guard are marked `closed`; the six remediation threats (T-02-01..06) stay `open` with their owning-plan pointers, so `threats_open: 6`.

## Deviations from Plan

None - plan executed exactly as written. (The guard scans every `.md` in the phase dir per Task 3's glob instruction; the VALUE-tuned pattern choice is the plan's own "secret-pattern regexes from ENV-SEPARATION.md" applied precisely, and returns zero offenders as required — no behavioral deviation.)

## Issues Encountered
None. The one pre-authoring risk — that sibling planning docs (02-01-PLAN.md line 183 documents the secret patterns, incl. `-----BEGIN`) could trip a loose secret grep — was headed off by using ENV-SEPARATION.md's VALUE-tuned patterns; a pre-authoring grep over the whole phase dir with the tuned set returned zero, confirmed again by the green guard.

## User Setup Required
None - no external service configuration required. (Live advisor / names-only env re-pulls are operator-gated but belong to plans 02-03 / 02-04, not this one.)

## Next Phase Readiness
- **02-02 (code/edge sweep), 02-03 (DB/RLS/billing/webhook sweep), 02-04 (env/supply-chain/isolation sweep)** each have a durable home to write classified findings (the `audit/` subdir + this catalog) and a stated severity rubric to classify against.
- **02-05/06/07 remediations** each have a threat-register row + a named guard target; the no-secret-leak guard auto-enrolls any new audit doc they add.
- **02-08 (SEC-15 record)** inherits the SEC-11 table, the coverage index, and the accepted-risk log (finalizes the `pending 02-08` rows + the sign-off checklist).
- No blockers. Honor operator checkpoints (autonomous:false) for the money-path (02-05) and RLS/DB (02-03) changes downstream.

## Self-Check: PASSED
- FOUND: `.planning/phases/02-security-audit-remediation/SECURITY-AUDIT.md`
- FOUND: `.planning/phases/02-security-audit-remediation/02-SECURITY.md`
- FOUND: `src/test/security/security-audit-docs.test.ts`
- FOUND commit: `6b08e988` (Task 1)
- FOUND commit: `b773f0ab` (Task 2)
- FOUND commit: `3f36688c` (Task 3)

---
*Phase: 02-security-audit-remediation*
*Completed: 2026-07-01*
