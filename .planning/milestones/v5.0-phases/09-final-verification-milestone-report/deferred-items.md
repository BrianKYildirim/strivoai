# Phase 9 — Deferred Items (out-of-scope discoveries)

Items discovered during execution that are OUTSIDE the current plan's scope. Logged, not fixed.

---

## D9-01 — `npm run type-check` is currently RED (pre-existing) — BLOCKS plan 09-04

**Found during:** 09-01 Task 2 (running `npx tsc -p tsconfig.app.json --noEmit` to confirm the new
registry test type-checks clean).

**Finding:** `npm run type-check` exits non-zero on `main`/`staging` **today**, before any Phase-9
change. Every error is in **`src/components/ui/chart.tsx`** (the shadcn chart wrapper vs. recharts v3
typings): `TS2339 Property 'payload' does not exist`, `TS2339 Property 'label' does not exist`,
`TS7006 implicit any`, `TS2344 type constraint`. **Zero** errors in `src/test/coverage/ver02-matrix.test.ts`
or in any other file.

**Why it matters:** **D-05 requires plan 09-04 to fold `type-check` into `verify:baseline`.** That fold-in
will fail on day one unless `chart.tsx` is fixed or explicitly excluded first. `chart.tsx` is the same
file already allowlisted as the sole permitted `dangerouslySetInnerHTML` sink in
`src/test/security/xss-sink-guard.test.ts` (Phase 02-07), so it is a known-quirky boundary component.

**Not fixed here because:** it is entirely unrelated to the VER-02 coverage registry (SCOPE BOUNDARY —
only issues directly caused by the current task's changes are auto-fixed). Fixing recharts typings is a
non-trivial UI change that has no business landing in a coverage-registry commit.

**Owner:** plan **09-04** (the VER-01 gate-extension plan). Options: (a) fix the recharts v3 generics in
`chart.tsx`, (b) add a narrowly-scoped `// @ts-expect-error` with a comment, or (c) exclude the file in
`tsconfig.app.json` — (a) is preferred; (c) weakens the gate and should be justified if chosen.

---

## D9-02 / FINDING 09-05-F1 — Recruiting Lens LEGACY path still has the pre-Fix-2 refund-after-save shape

**Found during:** 09-05 Task 1 (writing `recruiting-lens/__tests__/refund-after-save.test.ts`, the
per-feature twin of the guards Phase 02 · 02-05 "Fix 2" produced for analyze-resume, analyze-career and
grade-linkedin).

**Severity:** MEDIUM today / **HIGH in the D-02 intermediate flip state**. Money path.

**Finding:** `persistRecruitingLensResult` (`supabase/functions/recruiting-lens/index.ts:62-125`) still
carries the exact defect shape Phase 02 removed from the other three features. After the durable
`analysis_results` insert **succeeds** (index.ts:77-104), a failing `recordUsageWithAnalysis` throws:

```ts
// recruiting-lens/index.ts:116-122
const usageResult = await recordUsageWithAnalysis(params.userId, 'recruiting_lens', 1, data.id);
if (!usageResult.ok) {
  params.log.error('usage-tracking-insert-failed', { error: usageResult.error });
  throw new MeritRefundable(500, 'Could not record Recruiting Lens usage.');   // <-- POST-SAVE
}
```

That is a **post-save throw**. `grade-linkedin`'s guard asserts the byte-identical analogue string
(`'Could not record LinkedIn grade usage.'`) is **absent**; RCL's is still present.

**Blast radius, by flag state:**

| Flag state | Reached via | Consequence |
|---|---|---|
| `MERIT_SYSTEM_ENABLED=false` (today's dormant posture) | pure-legacy branch, index.ts:883 | A usage-write failure **500s a SAVED + cached analysis**. No refund (no merits deducted), but the user is told the analysis failed while it sits in their History. |
| `MERIT_SYSTEM_ENABLED=true` + `ANALYSIS_LIFECYCLE_RECRUITING_LENS` OFF | `withMerits` legacy branch, index.ts:764 | **True refund-after-save**: `withMerits` refunds the Merit for an already-delivered, already-cached analysis (double benefit) AND returns a 500. |
| `MERIT_SYSTEM_ENABLED=true` + lifecycle RCL ON (the D-02 target state) | lifecycle `save()`, index.ts:690-693 | **CORRECT** — log-and-continue. The helper is never reached. |

The dangerous cell is the middle row: it is exactly the state RCL passes through while a flip is in
progress, and RCL is the **first** feature D-02 flips on production.

**Not fixed here because:** 09-05 is a **verification** plan whose acceptance criteria require
`git diff --stat supabase/functions/recruiting-lens/index.ts` to be **EMPTY** (three separate criteria +
threat T-09-05-A: "a verification phase must not add/modify a production code path"). Plan 09-05 Task 3
also states the disposition explicitly for this case: *"If the test goes RED, that is a real finding —
report it rather than editing the handler to make the test pass."* So it is reported, not patched.

**Containment (locked by a test, not by prose):**
`refund-after-save.test.ts` → `FEAT-06 [F1]: the migrated lifecycle save() never calls
persistRecruitingLensResult (the legacy post-save-throw helper)`. That assertion pins the **routing**
(and stays true after F1 is fixed) — it does NOT pin the defect. No assertion in this repo asserts the
post-save throw is desirable.

**The fix (3 lines, mirrors Phase 02 · 02-05 Fix 2 exactly):** drop the `throw` at index.ts:120, keep
the `log.error('usage-tracking-insert-failed', …)` reason-code line, fall through to the durable success
return — i.e. make the legacy helper match what the lifecycle `save()` already does at index.ts:690-693.
Then flip the RCL guard's `[F1]` containment test into the same absolute assertion grade-linkedin makes:
`assertEquals(source.includes('Could not record Recruiting Lens usage.'), false)`.

**Owner:** VER-05 milestone report (remaining risks + follow-ups) — and it should be resolved **before**
D-02 flips Recruiting Lens on production, since the middle row above is a live money-path defect during
the flip window.

---

## D9-03 — `e2e/resume-analysis.spec.ts` passes VACUOUSLY today (it exercises the dedup path, not an analysis)

**Found during:** 09-06 Task 3 (building the S-20 two-tab spec on top of the existing resume E2E flow;
its DB-delta assertion never converged, which forced an inspection of what the existing spec actually does).

**Severity:** MEDIUM. Not a product defect — a **blocking-gate test that no longer tests what its name claims.**

**Finding:** `src/pages/Upload.tsx` de-duplicates on `file_hash`. If the user has already analyzed a
document with the same content hash, Upload SKIPS the analysis entirely and navigates straight to the
existing result:

```text
GET /rest/v1/resumes?select=id,analyzed_at&user_id=eq.<uid>
    &file_hash=eq.<sha>&grading_data=not.is.null&order=analyzed_at.desc&limit=1
```

That behaviour is CORRECT (reused input → reuse the prior analysis, no second charge — scenario S-08).
But `e2e/resume-analysis.spec.ts` submits the **static** `e2e/fixtures/test-resume.pdf`, which the seeded
E2E user already analyzed on **2026-06-11**. So every run since then hits the dedup path:

- the spec completes in **~3.2s** (a real AI_TEST_MODE analysis takes ~19s);
- it creates **zero** `resumes` rows (verified against the TEST project: no rows dated 2026-07-11 across
  four consecutive runs, while the pre-existing `8e3e40b7` row from 2026-06-11 stayed untouched);
- it renders the "resume screening report" heading — from the **June 11 analysis**, not from any run it
  triggered.

The spec still passes, so the gate is green while the "upload → analyze → results" flow it is named for
has not actually executed since June 11.

**Not fixed here because:** SCOPE BOUNDARY — `resume-analysis.spec.ts` is a pre-existing spec owned by the
VER-01 gate work, not by the VER-02 scenario matrix, and silently rewriting another plan's blocking-gate
test inside a coverage plan is exactly the kind of drift this phase exists to eliminate.

**The fix (already built and proven in this plan — reuse it):** `e2e/fixtures/make-unique-resume.ts`
generates a per-run UNIQUE synthetic PDF (same "Jordan E2E Baseline" persona, D-15-clean, uncompressed).
Point `resume-analysis.spec.ts` at it and the flow executes for real (proven: the two-tab spec now runs a
genuine ~19s analysis and durably lands exactly one new `resumes` row per run).

**Owner:** plan **09-04** (the VER-01 gate-extension plan) or the VER-05 report's remaining-risks item.

---

## D9-04 — The E2E test user's Merit balance is a finite, shared, drainable resource

**Found during:** 09-06 Task 3 (the two-tab spec drained the seeded user from 10 Merits to 1 across a few
runs; Upload's submit button then went `disabled` via `!canAfford(meritCost)`, and the spec failed with
"element is not enabled" rather than a real assertion).

**Severity:** LOW-MEDIUM. Gate reliability.

**Finding:** any E2E that drives a REAL analysis spends real Merits (resume analysis = 3 on free). The
seeded user starts with 10 lifetime Merits, so a handful of gate runs exhausts the balance and every
subsequent run of any merit-spending spec fails for an unrelated, misleading reason.

**Handled in 09-06 (for this spec only, at source):** `two-tab-concurrency.spec.ts` reseeds
`user_merits.subscription_balance` before each run via a Node-side service-role write — the same
determinism-reset pattern `e2e/global-setup.ts` already applies to the user's Stripe billing state.
(NOTE: the `admin_set_user_merits` RPC is NOT usable for this — it rejects the service-role caller with
"Access denied. Admin role required.")

**Why it is still logged:** the reseed lives in ONE spec. The right home is `e2e/global-setup.ts`, so that
EVERY merit-spending E2E starts from a known balance. Moving it there touches the shared setup that all
specs depend on, which is out of scope for a test-authoring plan.

**Owner:** plan **09-04** (VER-01 gate extension) — hoist the merit reseed into `global-setup.ts`.

---

## D9-05 — 32 MORE Deno test files run in NO lane (the dead-lane class is bigger than the five history files)

**Found during:** 09-08 Task 3 (auditing `supabase/functions/deno.json` after registering wave 2, to
confirm no *mapped* test was left out of a lane).

**Severity:** MEDIUM. Not a product defect — an unknown quantity of **coverage that never executes**.

**Finding:** `deno.json` `test:ci` is an **explicit file allowlist**, not a directory walk. 09-07 found
five `history-persistence.test.ts` files rotting outside it. A full walk of `supabase/functions/**` shows
that was not an isolated case: **32 further `*.test.ts` / `*_test.ts` files are in neither `test:ci` nor
`test:remote`**, so they execute in no lane at all:

```
analyze-career/cache.test.ts                     analyze-career/paid-output-validation.test.ts
analyze-resume/cache.test.ts                     analyze-resume/index.test.ts
grade-linkedin/cache.test.ts                     recruiting-lens/cache-saved-jobs.test.ts
recruiting-lens/__tests__/auth-rethrow.test.ts   _shared/tier-validation.test.ts
_shared/usage-checker.test.ts                    _shared/__tests__/cost-map-invariant.test.ts
extract-analysis-structure/__tests__/extract-{resume,linkedin,recruiting-lens}.test.ts
interview-prep-analyze/ (11 files, incl. __tests__/history-persistence.test.ts)
_tests/ (7 files: analysis_results_rls, grandfather-subscriber-stability, rls-interview,
         test-04-free-signup-to-shop, test-05-upgrade-proration, test-06-yearly-reset,
         tier-prompts.interview-prepend)
```

**VER-02 is NOT affected.** Registry assertion 5 (`every mapped supabase/functions test is actually
registered in a deno.json lane`) is GREEN: **zero** of the 120 test-mapped matrix cells depends on any of
these 32 files. This is coverage that exists *outside* the scenario matrix.

**Not fixed here because:** SCOPE BOUNDARY, and blind registration is precisely the vacuous-pass failure
class this phase keeps catching. Several of these are known-hazardous to switch on unexamined:
- `interview-prep-analyze/__tests__/history-persistence.test.ts` — 09-07 FINDING 2: the `interview_prep`
  `AI_TEST_MODE` mock fixture **does not exist**, so the function 500s under test mode. Registering it
  would turn the gate RED for a Coming-Soon feature. It is held out **deliberately, with this reason**,
  never as a silent skip.
- The `_tests/*` RLS / Stripe-lifecycle suites are remote/credentialed and would need lane triage
  (`test:ci` vs `test:remote`), not a bulk append.
- The rest are unaudited: each needs to be run before it is registered, because a suite that has not
  executed in months may be asserting a retired contract (exactly what 09-07 found in the `grade_linkedin`
  mock).

**The fix:** triage the 32 files one lane at a time — run each, fix or retire what is stale, then append.
The permanent guard already exists: **`deno.json` should become a directory walk with an explicit
exclusion list**, inverting the default from "opt in or die quietly" to "opt out loudly". That single
change would have prevented both this and the five-file history rot.

**Owner:** VER-05 milestone report, **remaining risks + follow-ups (report item 14)**. Also a
RESIDUAL-REGISTER candidate.

---

## D9-06 — LinkedIn Grader 500s on EVERY request once `ANALYSIS_LIFECYCLE_LINKEDIN` is on (P0)

**Found during:** 09-10 Task 2 (the staging lifecycle smoke — the first time all six flags were ever
actually ON at once against live endpoints).

**Severity:** **P0 / HARD BLOCKER for 09-11.** `linkedin` is **flip #2** in the D-02 production order.

**Finding:** `grade-linkedin` returns **HTTP 500** in **1.6s** with
`{"code":"UNKNOWN_ANALYSIS_ERROR"}` — the D-04 (c) *unconditional-abort* code. **Zero** `analysis_jobs`
rows are created (`feature='linkedin'` → 0 rows), and the 1.6s proves it never reached Anthropic.

**Root cause (PROVEN by direct INSERT probe on preview, not inferred):** `grade-linkedin` passes
`jobType: 'linkedin_grading'` into the lifecycle (`grade-linkedin/index.ts:401`). That value is **not
in the `analysis_jobs_job_type_check` CHECK constraint**. `create_or_recover_analysis_run` INSERTs it →
constraint violation → the exception escapes classification → the executor fail-closes to
`UNKNOWN_ANALYSIS_ERROR`.

| `job_type` | constraint verdict |
|---|---|
| `resume_analysis` / `career_compass_analysis` / `recruiting_lens` | ALLOWED |
| **`linkedin_grading`** | **REJECTED** |

The other four lifecycle features map onto allowed values. LinkedIn is the only one that does not.
It is a plain omission: `20260409000001_add_recruiting_lens_job_type.sql` performed exactly this
widening for Recruiting Lens when RCL migrated onto the lifecycle; nobody did it for LinkedIn.

**Money path:** SAFE. The failure is pre-reservation, so no merits are charged. The feature is simply
dead.

**Fix (written, applied NOWHERE):** `supabase/migrations/20260714000001_add_linkedin_grading_job_type.sql`
— one-value CHECK widening, same DROP-then-ADD idiom as the precedent, rollback SQL in the header.
Additive and re-runnable.

**Not applied here because:** preview's migration history carries a remote version (`20260714120000`)
with no local file, so `db push` refuses; repairing migration history is an operator action, and a
*verification* plan must not mutate it (the 09-05 precedent). The defect is fully proven without the
fix.

**Owner:** plan **09-11** — apply to prod BEFORE flip #2, then re-smoke LinkedIn green on staging.

---

## D9-07 — The D-04 (a2)/(a3) merit-anomaly abort queries are BLIND to synchronous lifecycle runs (HIGH)

**Found during:** 09-10 Task 2 (a `completed` run carrying a real -8 merit debit had
`merit_transaction_id = NULL`, which should have been impossible if the abort queries meant anything).

**Severity:** HIGH. It disarms two of the three money-path abort criteria for the production soak.

**Finding:** both (a2) and (a3) in `09-ACTIVATION-PRECONDITIONS.md` §7.2 are gated on
`merit_transaction_id IS NOT NULL`. **`runAnalysisLifecycle` never writes that column** — only the
async submit paths (`submit-career-analysis-job`, `submit-resume-analysis-job`) do. The lifecycle links
a run to its ledger row by **`idempotency_key`**. Verified in source (zero writers in
`analysis-lifecycle.ts` / `merit-gateway.ts`) and in the RPC's INSERT column list (`20260702000001`).

Measured on preview: 12 lifecycle rows, only 9 carry the column. (a2)'s scope as written = 4 completed
rows; keyed off `idempotency_key` = 7. `recruiting_lens`: **0/1**.

**Consequence:** the four SYNCHRONOUS features — `recruiting_lens`, `linkedin`, `resume`, `onboarding`,
**including flip #1** — produce runs those two queries cannot see. They would return 0 during the soak
regardless of what went wrong. A check that cannot fail is not a check.

**Fix:** re-key both predicates onto `idempotency_key is not null` (corrected SQL in
`09-STAGING-ACTIVATION.md` §4.5). **Caveat:** on prod `MERIT_SYSTEM_ENABLED=false`, so no reservation
exists and a completed run legitimately has `merit_settled=false` — the corrected (a2) must be joined
to `merit_transactions` on `idempotency_key` (or read against the prod merit posture) rather than
pasted in unqualified.

Criteria (a1) and (b) are unaffected.

**Owner:** plan **09-11** — fix the abort criteria BEFORE the first production flip.

## D9-08 (HIGH, money) - the reaper never releases a lifecycle run's merit reservation

**Found:** 09-10 wave-5 follow-up (2026-07-14), by running D-04's *corrected* merit-anomaly queries.

`reap-stale-analysis-runs/index.ts:200` gates its merit release on
`const hasMerit = !!row.merit_transaction_id;` — but `runAnalysisLifecycle` NEVER writes that
column (it links the ledger by `idempotency_key`). So `hasMerit` is false for EVERY lifecycle run:
the reaper terminalizes the run to `failed` and never releases the reservation, despite its own
header promising release "EXACTLY ONCE".

**Evidence (preview, verified):** 2 Career Compass runs from 2026-07-08 sit `failed` /
`merit_settled=false` / `refunded=false`, each with exactly one `feature-deduct` debit. Merits
taken, never returned. D-04's ORIGINAL abort queries reported 0 for this — they were gated on the
same non-existent column (D9-07).

**Same root cause as D9-07.** One wrong join key disarmed both the detector and the remediation.

- **v5.0 production impact: LATENT.** `MERIT_SYSTEM_ENABLED=false` on prod (D-03) => lifecycle runs
  never reserve merits => nothing to strand. NOT a blocker for the 09-11 activation.
- **Impact once merits are enabled: a live money leak** — every stuck lifecycle run silently eats
  the user's merits.
- **Fix:** release by `idempotency_key` (or have the lifecycle populate `merit_transaction_id`).
- **MUST be fixed before `MERIT_SYSTEM_ENABLED` is ever set true on production.**
- Routed to VER-05 report item 14.

## STATUS UPDATE (2026-07-15): D9-02 + D9-08 fixed and DEPLOYED TO PRODUCTION

Both money defects are fixed, mutation-proven, and now live on prod (operator ran
`deploy.ps1 -Env production`, verify:baseline green, 38 functions deployed):
- **D9-02** (RCL refund-after-save) — commit 3ad99602. Live-reachable in prod's current
  MERIT-on / lifecycle-off posture; the deploy shipped the fix into that path.
- **D9-08** (reaper couldn't refund stuck lifecycle runs) — commit 3c063921. Runtime-proven
  on preview: recruiting_lens + linkedin_grading runs now persist merit_transaction_id on the
  deployed fix. Dormant on prod until the ANALYSIS_LIFECYCLE_* flags flip (09-11).

Post-deploy prod verification (read-only): lifecycle_runs_on_prod = 0 (still dormant, no flags
flipped), edge logs all 200s (no new error class). Prod is fixed-code-deployed and ready for the
gated 09-11 activation.

D9-06 migration is applied on prod (constraint now includes linkedin_grading). D9-07 abort
queries rearmed (join on idempotency_key).

## D9-09 (MEDIUM, gate hygiene) - the blocking-gate E2E silently depends on AI_TEST_MODE

The prod deploy's verify:baseline aborted on a two-tab E2E "heading not visible" timeout. Root
cause was NOT code: the failing run made a LIVE Anthropic call and hit MODEL_TIMEOUT
(failure_code=MODEL_TIMEOUT, failure_stage=generating, correctly refunded). The E2E tests
(two-tab-concurrency, resume-analysis) assume AI is stubbed server-side via AI_TEST_MODE, but the
09-10 staging soak had turned AI_TEST_MODE OFF on the test project (cimjltzovkahkqecpwgi) to drive
REAL analyses, and left it off. So the "deterministic" gate was making live Anthropic calls and
flaked on upstream weather. Operator restored AI_TEST_MODE=true on preview and the deploy went
green.

The durable hazard: a blocking-gate test whose determinism depends on an edge secret, failing as a
mysterious 90s heading-timeout that reads like a code regression (it cost real investigation to
distinguish). Recommended fix (fail-loud): a cheap upfront precondition probe in e2e/global-setup
that drives one tiny stubbed analysis and asserts it completes in <~3s (the stub signature); if it
takes longer, fail setup with "AI_TEST_MODE precondition not met on <project> - the gate would make
live Anthropic calls" instead of letting a mid-suite MODEL_TIMEOUT masquerade as a code break. Also:
09-10/09-11 must RESTORE AI_TEST_MODE=true on the test project after any real-analysis soak.
Not yet implemented. Routed to VER-05 item 14.

---

## D9-13 — `analysis_jobs` has NO FK to `profiles`/`auth.users`: user deletion orphans runs while cascading their ledger

**Found during:** 09-11 / D9-12 Flip 3 verification (reconciling why two completed+settled runs had
no debit rows).

**Finding:** confirmed live on prod via `pg_constraint`:

```
profiles.id            -> auth.users(id) ON DELETE CASCADE
merit_transactions.user_id -> profiles(id)   ON DELETE CASCADE
user_merits.user_id        -> profiles(id)   ON DELETE CASCADE
analysis_jobs              -> NO foreign key at all
```

Deleting an auth user therefore removes the profile, merit balances, and **every merit_transaction**,
while `analysis_jobs` rows survive as ORPHANS pointing at a `user_id` with no `auth.users` row.
Reproduced 2026-07-16: operator deleted a Google test account (~23:49 UTC) and re-signed-up; runs
`773984ef` + `f440b70a` remain with orphan `user_id` 69586487, their debits gone.

**Why it matters (two distinct problems):**

1. **Deletion completeness / PII.** `analysis_jobs` rows outlive the account that created them.
   Whatever run-scoped data the table holds is not covered by account deletion. This is adjacent to
   09-02's VER-04 PII work (which guards EVIDENCE ARTIFACTS, not prod row retention) and is the kind
   of claim a milestone report must not overstate: "user deletion removes user data" is currently
   FALSE for the analysis surface.
2. **Ledger forensics are destructible.** Because debits cascade but runs do not, any post-hoc merit
   audit over a window containing a deleted account will show "completed + settled, no debit" and
   look exactly like a revenue leak. This burned real investigation time during D9-12 and will burn
   it again. It also means a deleted account permanently erases the evidence that it WAS charged.

**Not fixed here because:** adding an FK (or a deletion-time reconciliation) is a schema change with
migration + rollback requirements, landing mid-production-activation. Out of scope for 09-11, whose
contract is flag activation + evidence capture, and explicitly forbidden by the "no prod mutation by
Claude" rule in `09-PROD-ACTIVATION.md`.

**Recommended follow-up (decide, do not default):** the right answer is NOT automatically
`ON DELETE CASCADE` on `analysis_jobs` — that would make problem 2 worse by destroying more audit
history. Options: (a) `ON DELETE SET NULL` + an anonymization pass, preserving aggregate ledger
forensics while dropping the user linkage; (b) explicit deletion-time archival of run rows to a
retention table; (c) leave as-is and DOCUMENT the retention behavior honestly. Route to VER-05 as a
report caveat regardless of which is chosen — the report must not claim deletion completeness it
does not have.

---

## D9-16 — Elite Career Compass returns INCOMPLETE OUTPUT on the lifecycle path (Free unaffected) — Flip 5 BLOCKER

**Found during:** 09-11 Flip 5 (Career Compass) activation, 2026-07-17. Flip ABORTED; feature flag
returned to `false`. Full evidence in `09-PROD-ACTIVATION.md` §10.

**Finding (controlled A/B, not a suspicion):** same user, same `elite` tier, same inputs (resume 3677
chars, LinkedIn PDF 1915 chars), same deploy, ~6 minutes apart:

| `ANALYSIS_LIFECYCLE_CAREER_COMPASS` | Result |
|---|---|
| `true` (07:30, run `ed2c7975`) | FAILED — `output-incomplete`, missing `Surprise Fits, Fields, Roles, Roadmap` |
| `false` (07:36, legacy) | Full-quality output, 63.7 s |

Free on the lifecycle PASSED (`7a54e6e5`, completed, 34.3 s, one -3 debit, legacy `status` dual-write
tracking). The regression is **Elite-specific AND lifecycle-specific**.

**Ruled OUT:** the RC-1 / 260713-hrd tier-derivation hazard. Both runs logged
`tier-resolved … tier=elite source=internal-db`, so `submit-career` and `analyze-career` agree on the
real tier and the idempotency keys do not diverge. That landmine is genuinely defused — this is a
different bug.

**Strongest lead (UNPROVEN):** Elite is the only tier making TWO AI calls — `CAREER_CALL_CONFIGS`
gives Elite `base` (8000 tok) + `elite-extras` (2000 tok); Free gets `maxTokensFree: 0` on
`elite-extras` and makes ONE. The Elite-only/lifecycle-only failure therefore lives in the two-call
path or its merge. Evidence argues AGAINST plain truncation: `careerDNA`, `readiness`, `skillGaps`
were PRESENT while `surpriseFits`, `fields`, `roles`, `roadmap` were missing, and `skillGaps` sits
late in the Elite skeleton — a clean cut-off would not have preserved it. The failed row stored no
`result`, no `error`, and a NULL `input_fingerprint`. `isTruncatedResponse` keys on
`stop_reason === 'max_tokens'`, so a genuine truncation should have been detectable and labelled as
such — it was not.

**Not fixed here because:** 09-11's contract is flag activation + evidence capture, and Claude is
read-only on prod by that runbook. This needs a real diagnosis (a `/gsd-debug` session), not a
speculative patch applied at the end of an activation window.

**Why it matters:** Career Compass is one of the two business-critical flows named in CLAUDE.md, and
this breaks it for the **paying** tier specifically while leaving Free healthy — the worst possible
polarity. VER-05 must NOT claim the lifecycle is fully activated: five of six flags are green, Career
Compass is dormant on legacy by deliberate abort.

**The good news, which belongs in the report too:** the money path handled the failure CORRECTLY —
charged then refunded in 66 s (`-3 feature-deduct` → `+3 feature-refund`, reason
`career_incomplete_output`; `state='failed'`, `merit_settled=false`, `refunded=true`). That is
`5cec5c1b` proven on a REAL production failure rather than a fixture. Had the flip preceded the 07:0x
prod deploy, that Elite user would have been charged 3 Merits for nothing.

---

## D9-17 — `failure_code` mislabels an incomplete-output failure as `FILE_EXTRACTION_FAILED`

**Found during:** diagnosing D9-16.

**Finding:** run `ed2c7975` recorded `failure_code='FILE_EXTRACTION_FAILED'`, `failure_stage='generating'`.
Extraction demonstrably SUCCEEDED — the logs show `Using client-provided resume text content, length:
3677` and `Using LinkedIn PDF content, length: 1915`. The actual condition was `incomplete_output`
(`incompleteOutputResponse` logged `output-incomplete` with the missing sections). The stored code
points at the wrong subsystem.

**Why it matters:** a fabricated-looking failure code is worse than none. It sends the next responder
to the PDF/OCR layer for a model-output bug — it briefly did exactly that in this session, and only
the log line contradicted it. It also corrupts any error-class histogram the activation criteria rely
on (D-04(c) evaluates "new error classes" by `failure_code`), so a miscoded failure can hide inside
the wrong bucket or manufacture a false abort signal.

**Suspected shape:** `incompleteOutputResponse` refunds and returns `error: 'incomplete_output'` but
does not appear to stamp a corresponding `failure_code` on the run, so the row keeps whatever code an
outer/earlier handler set. Needs confirmation.

**Not fixed here because:** same scope boundary as D9-16 — activation window, prod read-only. Bundle
with D9-16 for the debug session; they are one investigation.

---

## D9-18 — RETRACTS D9-16. Elite Career Compass is broken on BOTH paths — a LIVE prod bug, flag-independent

**Supersedes D9-16's causal claim.** Full evidence in `09-PROD-ACTIVATION.md` §11.

**What D9-16 got wrong:** it concluded "the lifecycle breaks Elite Career Compass" from ONE run per
arm against an **intermittent** failure, and labelled it "a FINDING, not a suspicion". A third Elite
run with the flag still `false` failed identically. Final sample: 07:30 lifecycle FAIL, 07:36 legacy
PASS, 07:40 legacy FAIL — **2 of 3 fail regardless of the flag**. The 07:36 success was luck, not a
control. **An A/B against a non-deterministic failure requires repeats in both arms**; n=1 vs n=1
cannot separate "the flag fixed it" from "this run got lucky". The operator's unprompted third run is
the only reason this was caught before it reached VER-05.

**The real bug (smoking gun; mechanism still needs confirmation):**

```
json-repair-applied   originalLen=28905  repairedLen=6509
output-incomplete     tier=elite  missing=[Surprise Fits, Fields, Roles, Roadmap]
[PERF] claude-haiku-4-5  out=8124  maxTokens=10000
```

- The model was **not** token-capped (`out=8124` < `maxTokens=10000`), so `stop_reason` is not
  `max_tokens` and `isTruncatedResponse` (`analyze-career` L277-278, which keys **exclusively** on
  `stop_reason === 'max_tokens'`) returns FALSE. **Blind spot:** a structurally-incomplete but
  UNCAPPED response is demonstrably reachable and is invisible to that detector.
- The response still ends mid-structure (`tail200` stops at `...$1.6M-$2.1M.`, no closing brace).
- `repairTruncatedJSON` then does exactly what its own comment (L271) predicts it does to half-written
  JSON: closes the braces and hands back a parseable **stub — 28905 → 6509 chars, discarding 77% of
  the report**, including the four sections the completeness gate then rejects.

**The completeness gate is not the bug — it is the only component behaving correctly**, refusing to
save a mutilated report and present it as real. That is the D-17 "results are never fabricated"
guarantee doing its job.

**Severity — why this outranks the flip it blocked:** Career Compass is one of the two
business-critical flows named in CLAUDE.md. Elite is the **paying** tier. This is live on the legacy
path serving 100% of users today, at roughly a 2-in-3 failure rate, and **this milestone did not cause
it** — the activation was merely the lens that exposed it. Free is healthy; the paid tier is not.
Worst possible polarity.

**Money is NOT at risk (now proven on both paths):** the lifecycle failure refunded at 07:31:56; the
legacy failure refunded at 07:41:17. Charge-then-refund works on real production Elite failures on
both paths. Users lose the report and their time, not merits.

**Investigate as ONE unit with D9-16 + D9-17:** why the model emits ~29k chars of unparseable JSON
while under its cap; whether `isTruncatedResponse` must consider structural completeness rather than
`stop_reason` alone; and whether `repairTruncatedJSON` should ever return a stub that silently
discards 77% of a report instead of failing loudly. **Do not re-flip Career Compass until Elite is
healthy on the LEGACY path first** — an activation cannot be evaluated against a broken baseline.
