---
phase: 09-final-verification-milestone-report
plan: 11
subsystem: production activation / lifecycle flags / VER-04 real-account evidence
tags: [VER-04, D-01, D-02, D-04, D-13, D-14, D-15, lifecycle-activation, production, merit-ledger, vercel]
requires:
  - 09-02 (the PII guard that must exist BEFORE real evidence lands)
  - 09-03 (activation preconditions + pre-flip baseline)
  - 09-10 (staging activation; its two blocking findings resolved before the first prod flip)
provides:
  - "Five of six lifecycle flags ACTIVE on production (master, Recruiting Lens, LinkedIn, Onboarding, Resume) — each soaked >=30 min against the five green criteria"
  - "VER-04 real-account evidence with DURABLE ledger proof: Free + Elite across resume-only and resume+LinkedIn"
  - "A controlled before/after proof that the global FRONTEND flag does not widen execution blast radius (D9-10 settled empirically)"
  - "The charge-then-refund path proven on a REAL production Elite failure, on BOTH lifecycle and legacy paths"
  - "D9-18: a LIVE production bug on Elite Career Compass (~2 in 3 runs), pre-existing and NOT caused by this milestone"
affects:
  - "09-12 (VER-05 milestone report) — must report FIVE of six flags green, Career Compass deliberately dormant; must NOT cite the 3.2-4.3s latency band as a satisfied ceiling (D9-14)"
  - "A future debug session — D9-16/D9-17/D9-18 are ONE investigation"
  - "Any future re-flip of Career Compass — BLOCKED until Elite is healthy on the LEGACY path first"
tech-stack:
  added: []
  patterns:
    - "Read the VALUE, never infer it from a modification timestamp: `vercel env pull` costs ten seconds; a dashboard '2h ago' is equally consistent with true and false (D9-12)"
    - "A step asserted to be a no-op must have its no-op PRECONDITION verified, not assumed — the entire safety argument rests on that precondition"
    - "CLI direct-upload (`vercel --prod`) deploys without GitHub, so a GitHub/Vercel integration outage does not block a frontend deploy or a hotfix"
    - "Verify a deploy by its EFFECT, not its exit code: grep the live bundle for the fix, and check edge function version bumps"
    - "Controlled before/after beats confirmation-only: same build, same input, one variable — but ONLY valid against a DETERMINISTIC failure"
    - "An A/B against an INTERMITTENT failure requires repeats in BOTH arms; n=1 vs n=1 cannot separate 'the flag fixed it' from 'this run got lucky' (D9-18)"
    - "Evidence durability is a property of the EVIDENCE, not the system: deleting a test account cascades merit_transactions away and silently voids the proof for every run it made (D9-13)"
    - "Cite only runs whose owning account still EXISTS, so every row stays re-verifiable against the ledger"
key-files:
  created:
    - .planning/phases/09-final-verification-milestone-report/09-11-SUMMARY.md
  modified:
    - .planning/phases/09-final-verification-milestone-report/09-PROD-ACTIVATION.md
    - .planning/phases/09-final-verification-milestone-report/09-REAL-ACCOUNT-EVIDENCE.md
    - .planning/phases/09-final-verification-milestone-report/deferred-items.md
    - src/test/security/phase9-pii-guard.test.ts
key-decisions:
  - "Abort scope was the FEATURE flag, not the master switch: s5 says master-off on any red, but master-off would revert Flips 1-4, which are green and signed off. The red was confined to one feature; so was the remedy."
  - "Flip 5 recorded as INCONCLUSIVE, not GREEN and not RED-by-lifecycle: Free passed, Elite is UNEVALUABLE because it has no healthy baseline on either path."
  - "D9-16's causal claim was RETRACTED rather than quietly amended — the wrong inference is preserved in the record next to the correction, because the methodology error is the reusable lesson."
  - "The 147.7s Flip-3 outlier was recorded as first-run cold start only AFTER three subsequent runs corroborated it — not asserted from one observation."
  - "The pre-flip latency band (analyze-resume 3.2-4.3s) was declared a BASELINE CAPTURE DEFECT, not a Flip-4 regression: it cannot describe a real ~45s analysis."
  - "Root cause of D9-18 was deliberately NOT guessed at during the activation window; routed to a debug session with the evidence intact."
patterns-established:
  - "Pre-flip deploy check: verify prod runs the build containing the money-path fixes for the feature about to be flipped. This was load-bearing — flipping before the 07:0x deploy would have charged an Elite user 3 Merits for a report that never arrived."
  - "No test-account deletions mid-soak: the no-deletion rule took the non-vacuity guard from 4-of-10 joined to 10-of-16."
  - "The 2.2 non-vacuity guard is ZERO-based and therefore blind to PARTIAL blindness: it reported a pass at 1-of-6 joined while 83% of the window was unevaluable. It should be RATIO-based."
requirements-completed: [VER-04]
duration: ~9h (operator-gated, spanning a GitHub/Vercel outage and a prod edge deploy)
completed: 2026-07-17
---

# Phase 09 Plan 11: Production Activation Summary

**Five of six lifecycle flags are live on production with durable, re-verifiable ledger evidence — and the sixth stayed off because the activation exposed a pre-existing production bug that breaks Career Compass for the paying tier.**

## What shipped

| Flip | Feature | Verdict | Evidence |
|---|---|---|---|
| 0 | master | ON | n/a |
| 1 | Recruiting Lens (Elite) | **GREEN** | `941bb986` |
| 2 | LinkedIn | **GREEN** | `fb4d2801` (Elite), `41bd6bf8` (Free) |
| 3 | Onboarding | **GREEN + signed off** | `dda6fa21` (Free), `162eb183` (Elite) |
| 4 | Resume (streaming SSE) | **GREEN + signed off** | `c3b2ba20`, `fba82663`, `462c3fae` |
| 5 | Career Compass | **INCONCLUSIVE — flag stays `false`** | `7a54e6e5` (Free passed); Elite unevaluable |

VER-04 coverage is COMPLETE for Onboarding and Resume: Free + Elite, resume-only and resume+LinkedIn, every cited row carrying a SURVIVING debit. Nine production run ids are declared in `ALLOWED_RUN_IDS`; the PII guard is green at 18/18.

## The two proofs worth keeping

**Flip 4 is the only flip proven by a controlled before/after rather than by confirmation alone.** A pre-flip Free resume run (02:08) produced a `-3` debit with NO lifecycle row — the backend fell through to the byte-identical legacy path even though the GLOBAL frontend flag was already ON and sending the lifecycle signal. Post-flip, the same journey on the same build produced `c3b2ba20` WITH a lifecycle row. One variable: the backend per-feature secret. That settles D9-10's central claim — **the global frontend flag does not widen execution blast radius** — and independently proves the flip took rather than silently measuring legacy, which is the exact false negative that made the first prod onboarding attempt misleading.

**The money path is sound, proven against reality rather than fixtures.** A real Elite Career Compass failure was charged and refunded in 66s on the lifecycle path (`-3 feature-deduct` -> `+3 feature-refund`, `career_incomplete_output`), and the legacy path refunded an identical failure at 07:41:17. Both paths. Real failures. That is `5cec5c1b` demonstrated live.

## The finding that outranks the flip it blocked (D9-18)

**Elite Career Compass is broken on production RIGHT NOW**, on the legacy path serving 100% of users, at roughly a 2-in-3 failure rate — and **this milestone did not cause it**. The activation was merely the lens that exposed it. From the 07:40 log:

```
out=8124  maxTokens=10000          <- NOT token-capped
json-repair-applied  28905 -> 6509 <- 77% of the report discarded
output-incomplete    missing=[Surprise Fits, Fields, Roles, Roadmap]
```

The model was under its cap, so `stop_reason !== 'max_tokens'`, so `isTruncatedResponse` — which keys exclusively on that — returns false. The response nevertheless ends mid-structure, so `repairTruncatedJSON` does precisely what its own comment at L271 predicts: closes the braces and returns a parseable stub, dropping the four sections the completeness gate then rejects. **The gate is the only component behaving correctly**, refusing to save a mutilated report and present it as real (D-17). Free is healthy; the PAID tier is not — the worst possible polarity.

## Deviations

- **D9-12** — Flip 3 was re-enabled UNINTENTIONALLY. A "deploy the fix with the flag still off" step was asserted to be a no-op on an INFERENCE from a dashboard timestamp instead of a read of the value; the flag was actually `true`, so the CLI build baked the lifecycle ON. Outcome was green on its merits (the deployed build was the FIXED one; zero runs occurred in the exposure window), but the gate was bypassed. Binding lesson recorded: never infer a flag's VALUE from its modification time.
- **D9-13** — `analysis_jobs` has NO FK to `profiles`/`auth.users`. Account deletion cascades the ledger away while orphaning run rows: evidence for a green flip was destroyed within the hour by a routine test-account deletion.
- **D9-14** — the pre-flip `analyze-resume` band (3.2-4.3s) cannot describe a real ~45s analysis. Baseline CAPTURE defect; criterion 5 was evaluated against live flip-1/2 comparators instead.
- **D9-15** — the five criteria were FIRST run against `status` (the legacy queue column) instead of `state` (the lifecycle column). Re-run verbatim; verdict held. The legacy dual-write keeps the two agreeing on the happy path, which is exactly why the wrong instrument still looked green.
- **D9-16 (RETRACTED by D9-18)** — claimed the lifecycle broke Elite Career Compass, from n=1 per arm against an intermittent failure. A third run with the flag still `false` failed identically. The operator's unprompted re-run is the only reason the wrong claim did not reach VER-05.
- **D9-17** — `failure_code` recorded `FILE_EXTRACTION_FAILED` for an incomplete-output failure while extraction demonstrably succeeded.

## Self-Check

- [x] Five of six flags active, each confirmed on `state` + `idempotency_key` (not `status`)
- [x] Every flip soaked >=30 min against the canonical criteria; a1-a4 = 0, stuck = 0, `UNKNOWN_ANALYSIS_ERROR` = 0 throughout
- [x] VER-04 durable evidence for Onboarding + Resume, both tiers, both input states
- [x] Nine prod run ids declared in `ALLOWED_RUN_IDS`; PII guard green (18/18); zero real-user identifiers in evidence
- [x] No production mutation by Claude — read-only queries and edge-log reads only; every secret set and deploy was operator-run
- [ ] **Flip 5 NOT signed off** — Career Compass dormant on legacy by deliberate decision (D9-18)
- [ ] **Recruiting Lens Free 403 row** — still unrecorded in `09-REAL-ACCOUNT-EVIDENCE.md`
- [ ] **E2E baseline account restoration** — not verified this pass
