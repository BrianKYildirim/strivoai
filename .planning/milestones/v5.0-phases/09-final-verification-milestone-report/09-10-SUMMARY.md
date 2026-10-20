---
phase: 09-final-verification-milestone-report
plan: 10
subsystem: verification / staging activation / adversarial security
tags: [VER-01, VER-05, D-01, D-03, D-07, D-08, lifecycle-activation, promptfoo, staging]
requires:
  - 09-03 (activation preconditions + pre-flip baseline)
  - 09-09 (the seven-layer verify:baseline gate wired into deploy.ps1)
provides:
  - "A real staged deploy proving the extended gate (VER-01 deployment validation)"
  - "The lifecycle-ON posture PROVEN on staging for 4 of 5 features (D-01)"
  - "One-shot adversarial evidence for VER-05 report item 3 (D-07)"
  - "TWO blocking findings that 09-11 must resolve before the first production flip"
affects:
  - "09-11 (production activation) — BLOCKED on D9-06; its D-04 abort criteria are disarmed by D9-07"
  - "09-12 (VER-05 milestone report) — items 3, 4 and 14"
tech-stack:
  added: []
  patterns:
    - "Known-plaintext digest verification of edge secrets: `supabase secrets list` returns SHA-256 of the value, so for a flag whose domain is {true,false} the digest PROVES the exact bytes with zero disclosure — a typo-proof check for exact-lowercase 'true' semantics"
    - "Positive-control-first smoke design: never record a fail-closed result as a pass until an origin/input that SHOULD succeed is shown to succeed"
    - "model-answered vs error-body accounting for LLM assertion suites — a not-contains assertion passes trivially on an error body"
key-files:
  created:
    - .planning/phases/09-final-verification-milestone-report/09-STAGING-ACTIVATION.md
    - .planning/phases/09-final-verification-milestone-report/09-ADVERSARIAL-EVIDENCE.md
    - supabase/migrations/20260714000001_add_linkedin_grading_job_type.sql
  modified:
    - src/test/coverage/ver02-matrix.test.ts
    - src/test/security/phase9-pii-guard.test.ts
    - supabase/functions/*/__tests__/fixtures/injection/promptfooconfig*.yaml (6 files)
    - .planning/phases/09-final-verification-milestone-report/deferred-items.md
decisions:
  - "LinkedIn is left OFF on staging deliberately — with its flag ON the Grader 500s on 100% of requests (D9-06)"
  - "The apex+www CORS re-proof is NOT performable on staging and was NOT claimed; it is a 09-11 production assertion"
  - "The job_type migration was written but applied NOWHERE — a verification plan reports, it does not patch (09-05 precedent)"
  - "MERIT_SYSTEM_ENABLED was already ON on preview before this plan; Step D became a confirmation, not a flip"
metrics:
  duration: ~3h
  tasks: 3
  files: 12
  completed: 2026-07-14
---

# Phase 9 Plan 10: Staging Lifecycle Activation + Adversarial Evidence Summary

Proved the lifecycle-ON posture on staging with a real gated deploy, and caught **two blocking
defects plus two broken security-evidence suites** that would each have shipped straight into the
production activation.

---

## What was delivered

1. **A real staged deploy** (`deploy.ps1 -Env staging`, no escape hatches) — 38 functions to the
   preview project, with the gate-GREEN line provably *preceding* `supabase link`. That ordering is
   the VER-01 deployment-validation evidence.
2. **The lifecycle activated and PROVEN on staging** — 4 of 5 features executing real state machines
   with real merit-ledger rows.
3. **One-shot adversarial evidence** for VER-05 item 3, with the gate left deterministic and free.

---

## The headline: five checks that would have passed while proving nothing

This phase has a running tally of checks that report success vacuously. This plan added to it — and,
uncomfortably, **the plan's own prescribed checks were among them.**

| # | The check as written | Why it proved nothing |
|---|---|---|
| **D9-06** | "Flip the flags, smoke the five features" | LinkedIn **500s on 100% of requests** the moment its flag is on. Nothing in the plan would have caught this before production, because nobody had ever turned all six flags on at once. |
| **D9-07** | D-04's (a2)/(a3) merit-anomaly abort queries | Both are gated on `merit_transaction_id IS NOT NULL`, which **the lifecycle never writes**. The four synchronous features — *including flip #1* — are invisible to them. They return 0 no matter what goes wrong. |
| **A9-01** | The six `test:adversarial:*` suites | They interpolate `${VAR}`; promptfoo expands `{{env.VAR}}`. **Every suite errored 100%** — and a 100%-error suite reports *zero failures*, so nothing ever looked wrong. They had never once run. |
| **A9-02** | "20/20 passed" on three of those suites | **Zero model answers.** `not-contains` passes trivially on `{"error":...}`. 60 of 98 fixtures never reached a model. |
| **CORS** | The plan's apex+www staging re-proof | On preview, *every* origin returns no ACAO — apex, www **and** evil alike. Recording "evil fails closed = PASS" would have been indistinguishable from recording a totally broken CORS layer. |

---

## Task 1 — the staged deploy (D-08 / VER-01)

**The gate has teeth, and I can prove it by an abort rather than an assertion.** The *first* deploy
run **aborted at `verify:baseline` before `supabase link`** — the VER-02 anti-drift assertion caught a
registry cell whose mapped test had been renamed by commit `3ad99602` (the D9-02 fix). No project
linked, no function deployed. Fixed (`1eace606`), re-ran, green.

Then: 38 functions deployed to `cimjltzovkahkqecpwgi`.

**CORS.** Rather than record the plan's apex+www assertion, I first established a **positive control**
(`http://localhost:8080` *does* get an ACAO echo on preview). That turned an ambiguous all-fail-closed
result into a real one: the prod origins are simply not in preview's `ALLOWED_ORIGINS`, correctly, because
preview isn't served from them. The staging-correct invariants all hold — **ACAO survives the 401**,
`Vary: Origin` always, evil fail-closed, never `*`. The apex+www re-proof is declared a **production**
assertion for 09-11, not claimed here.

## Task 2 — lifecycle activation (D-01 / D-03)

**Zero-leak, typo-proof flag verification.** `supabase secrets list` returns a **SHA-256 digest** of
each value. For a flag whose whole domain is `{true, false, True, 1, yes}`, that digest is a
*known-plaintext check*: it proves the exact bytes without fetching or disclosing a value. All seven
flags were verified against `sha256('true')` **after** the set — so threat T-09-10-B (a `True`/`1`
typo silently leaving the feature OFF while the smoke measures the legacy path) is closed by
measurement, not by trust.

**Step C carried its own negative control.** The new `analysis_jobs` row has
`state='completed'` + a 64-char `idempotency_key`; the rows immediately below it — pre-flip, same
table — have **both NULL**. That is the lifecycle running, contrasted against the legacy path it
replaced, in one query.

**Steps E/F — 4 of 5 features green:** recruiting_lens, onboarding, resume (streaming SSE),
career_compass (async worker, polled `generating → completed`). Every one: terminal `completed`,
`merit_settled=true`, and **exactly one merit debit** joined on `idempotency_key`. Zero
settle+refund violations, zero double-row submits (the 95%-hang signature), zero stuck rows.

**`MERIT_SYSTEM_ENABLED` was already `true` on preview** (set 2026-07-14 14:34, during the recent
Career-Compass quick task — not by me). Step D became a confirmation.

## Task 3 — adversarial evidence (D-07)

Six suites, once, real Anthropic calls. `package.json` untouched; `verify:baseline` still contains
zero promptfoo references.

**The security result is good — but the evidence apparatus was broken.** Across the 34 fixtures that
actually got a model answer: **zero genuine prompt-injection weaknesses.** No system-prompt
disclosure (anchor assertions 34/34), no tier escalation, no fabricated score. The model *actively
refuses* — Recruiting Lens called the attack "a security and integrity violation"; the LinkedIn
"grant me the elite grade" fixture scored **10, the floor**.

**All 3 failing assertions are false positives** of one over-broad check: `not-contains "system
prompt"` fires when the model quotes the attacker's input back as required `evidence`, or when it
*names the attack while refusing it*. It penalizes correct defensive behavior. The real leak
detectors passed every time.

---

## Deviations from plan

**1. [Rule 3 — Blocking] The VER-02 anti-drift assertion was RED and aborted the deploy**
- **Found during:** Task 1. **Fix:** re-mapped the RCL refund-after-save cell onto the post-`3ad99602`
  test names, and *additionally* mapped the new `[F1-fix]` assertion (which pins the *absence* of the
  post-save throw — the load-bearing half; `[F1]` only pins routing). Rewrote the now-stale "OPEN
  DEFECT" comment. **Commit:** `1eace606`.

**2. [Rule 1 — Bug] Six promptfoo configs used a syntax promptfoo does not interpolate**
- Blocked Task 3 entirely. Fixed `${X}` → `{{env.X}}` in all six; left the JS template literals in the
  distribution config's `javascript` assertion untouched. **Commit:** `282228bd`.

**3. [Rule 2 — Critical] The PII guard went RED on the new artifact — and was NOT weakened**
- The 09-02 guard forbids un-declared UUIDs in phase artifacts. It caught my four staging run_ids
  exactly as designed. I **declared them in `ALLOWED_RUN_IDS` with provenance** (preview project,
  synthetic account) rather than relaxing the assertion. **Commit:** `282228bd`.

**4. [Scope — reported, NOT patched] The `job_type` migration was written and applied NOWHERE**
- `20260714000001_add_linkedin_grading_job_type.sql` exists with rollback SQL, but is applied to
  neither preview nor prod. Preview's migration history carries a remote version with no local file,
  so `db push` refuses; repairing migration history is an operator action, and a *verification* plan
  must not mutate it (the 09-05 precedent: report the finding, don't patch around it). **The defect is
  fully proven without applying the fix** — the INSERT probe is dispositive.

---

## What 09-11 MUST do before the first production flip

| # | Blocker | Action |
|---|---|---|
| **D9-06** | LinkedIn 500s on every request once its flag is on (`job_type='linkedin_grading'` violates `analysis_jobs_job_type_check`) | **HARD BLOCK on flip #2.** Apply `20260714000001` to prod, re-smoke LinkedIn green on staging, *then* flip. Flips #1/#3/#4/#5 are unaffected. |
| **D9-07** | D-04's (a2)/(a3) abort queries cannot see synchronous lifecycle runs | **Replace them with the `idempotency_key` form** (`09-STAGING-ACTIVATION.md` §4.5) *before* flip #1 — otherwise recruiting_lens is policed by two queries that cannot fail. Mind the `MERIT_SYSTEM_ENABLED=false` caveat on prod. |
| — | PROD `MERIT_SYSTEM_ENABLED` names-only read (D-03) | **NOT proven by this plan.** The read was blocked by the production guard and I did not work around it. Operator must run it. |

---

## Production containment (D-03)

**Zero production mutations.** Every `secrets set` / `secrets list` carried an explicit
`--project-ref cimjltzovkahkqecpwgi`. No prod deploy, no prod SQL, no prod secret write. The one prod
*read* the plan asked for was blocked by the operator's own guard and was **not circumvented** — it is
handed back as an operator step, and stated as an honest gap rather than papered over.

Zero secret values written to any artifact. The E2E baseline account was restored to `tier=free`,
`merits=10`.

---

## Self-Check: PASSED

- Files verified present: `09-STAGING-ACTIVATION.md`, `09-ADVERSARIAL-EVIDENCE.md`,
  `20260714000001_add_linkedin_grading_job_type.sql`.
- Commits verified: `1eace606`, `f783234d`, `8d4d566e`, `282228bd`.
- `npx vitest run` — **98 files / 658 tests passed.**
- `npx vitest run src/test/security/phase9-pii-guard.test.ts` — **18/18 passed** over the new artifacts.
- `git diff --stat package.json` — **EMPTY** (D-07 negative invariant intact).

---

# Post-soak addendum (2026-07-14) — flip #2 PROVEN, and D9-07 was worse than I reported

Written after the orchestrator acted on the two findings. The original content above is unchanged.

## What the orchestrator changed

1. **D9-06 migration applied to PREVIEW** (`linkedin_grading` added to the constraint). **Production is
   still on the 3-value constraint** — the operator is applying it.
2. **D9-07 fixed** in `09-ACTIVATION-PRECONDITIONS.md` (`9cf0b850`): D-04's (a2)/(a3) now join on
   `idempotency_key`, plus a new (a4) double-charge detector and a mandatory non-vacuity guard.
3. **D9-08 (HIGH, money) — found by running my corrected queries.** My finding was worse than I
   reported: `reap-stale-analysis-runs/index.ts:200` gates its merit release on
   `const hasMerit = !!row.merit_transaction_id` — **the same column the lifecycle never writes.** So
   the reaper terminalizes lifecycle runs to `failed` and **never releases the reservation**, despite
   its own header promising release "EXACTLY ONCE". Two stranded Career Compass runs on preview prove
   it. Latent on prod (MERIT off, D-03), so not a v5.0 blocker — a live money leak the moment merits
   are enabled. Routed to VER-05 item 14. Not patched (verification phase).

I under-called D9-07: I framed it as *"the abort queries can't see these runs"*. The truth is that the
same missing column also **disables the reaper's refund path**. The blind check and the broken
mechanism share one root cause.

## My task: turn the D9-06 inference into evidence

D9-06 was proven by an **INSERT probe** — static. Nobody had ever run a LinkedIn grade through the
lifecycle. "The migration fixes it" was an inference, and LinkedIn is flip #2 on production.

**Flip #2 is now PROVEN end-to-end** (`09-STAGING-ACTIVATION.md` §7b):

| | Before migration | After |
|---|---|---|
| HTTP | **500** | **200** |
| Latency | **1.6s** (never reached Anthropic) | **41.5s** (real model call) |
| Response `code` | **`UNKNOWN_ANALYSIS_ERROR`** | none |
| `rawScore` | none | **86**, 4 sections (08.3 rubric) |
| `analysis_jobs` rows (`job_type='linkedin_grading'`) | **ZERO — never created** | **1, `state=completed`** |
| `idempotency_key` | n/a | non-null, 64-char |
| Merit debits joined **per-key** | n/a | **exactly 1** (`-3`), balance 200 → 197 |

**run_id `5059547b-352f-427a-bd7c-9b99576d198e`** — the first `linkedin_grading` run ever to complete.

**Non-vacuity, three ways** (this phase's standing tax):
- The constraint was **widened, not dropped**: `bogus_never_valid` is **still REJECTED**. A constraint
  that accepted everything would have "fixed" LinkedIn while destroying the guard.
- The error-class sweep **can** fail: `failure_code` is populated in practice — 6 rows, 3 distinct
  codes observed. A clean LinkedIn sweep is a real result, not an unwritten column.
- The pass **discriminates**: the same probe that previously proved the INSERT was rejected now shows
  the run reaching `completed`.

**One honest nuance worth carrying to 09-11:** `UNKNOWN_ANALYSIS_ERROR` was **never persisted** to
`analysis_jobs` — not even during the outage — because the failure *was* the row INSERT. A **DB-only
sweep could never have caught D9-06.** A soak that watches only the `failure_code` histogram is blind
to any failure occurring *before* the run row exists. It took an actual request.

**D9-07/D9-08 independently re-confirmed on this run:** the new LinkedIn row carries a real -3 debit
with `merit_transaction_id = NULL`, exactly as predicted — so the original (a2)/(a3) would not have
seen it, and the reaper's `hasMerit` check would read `false` for it.

## Staging end state

**All seven flags ON, all five features green.** `ANALYSIS_LIFECYCLE_LINKEDIN` is **ON** (flipped back
on and proven, reversing my earlier deliberate OFF). E2E account restored to `tier=free`, `merits=10`,
`free_linkedin_scan_used=false`.

## Still blocking 09-11

**PRODUCTION IS STILL ON THE 3-VALUE CONSTRAINT.** Flip #2 remains **HARD BLOCKED** until the operator
applies `20260714000001` to prod. The staging proof makes that flip safe *once the migration lands*; it
is not a substitute for landing it. Zero production mutations in this addendum.
