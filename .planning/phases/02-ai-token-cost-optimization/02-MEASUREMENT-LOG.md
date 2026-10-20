# Phase 02 Production Measurement Log

**Status:** Tasks 1-2 complete; Task 2 was accepted from live production telemetry evidence (not direct command observation). Task 3 is operator-pending. Formal Run 1 and its first post-deploy replacement are excluded timeout groups; a clean replacement is still required before Run 1 can enter the matrix.

This artifact is the operator runbook and the durable per-run record for the temporary-cap measurement window. Record counts and timing only. Do not paste resume text, LinkedIn profile text, job descriptions, passwords, tokens, service keys, or production user IDs here.

## Production runbook

Production project: `zjpjapgraoxdukdvpjes`.

The order below is load-bearing:

1. Apply the telemetry migration to production.
2. Deploy the instrumented, TEMP-capped Edge Functions.
3. Run one smoke analysis and prove telemetry rows land.
4. Only after the smoke passes, execute the remaining measurement matrix.

The migration must land before the Edge Function deploy. If the functions run first, `recordAiCall` warns and continues when its insert cannot find `public.ai_call_telemetry`; the user analysis can still succeed, but the measurement data is permanently lost.

### Step 1: Apply the production migration

Migration:

`supabase/migrations/20260721000000_ai_call_telemetry.sql`

Rollback, only if rollback is explicitly required:

`supabase/migrations/rollback/20260721000000_ai_call_telemetry.rollback.sql`

Use exactly one of the following methods.

#### Method A — production SQL Editor

1. Open `https://supabase.com/dashboard/project/zjpjapgraoxdukdvpjes/sql/new`.
2. Copy the complete contents of `supabase/migrations/20260721000000_ai_call_telemetry.sql` into the editor.
3. Run the SQL once. Success includes the notice that `public.ai_call_telemetry` is active with RLS on, at least one policy, and two generated columns.
4. If the migration must be rolled back, open the same SQL Editor, paste the complete contents of `supabase/migrations/rollback/20260721000000_ai_call_telemetry.rollback.sql`, and run it. The rollback destroys accumulated telemetry; export required measurement data first.

#### Method B — Supabase CLI `db push`

Run these commands from the repository root in PowerShell:

```powershell
.\node_modules\.bin\supabase.cmd link --project-ref zjpjapgraoxdukdvpjes
.\node_modules\.bin\supabase.cmd db push --linked --dry-run
```

HARD GATE: inspect the dry-run output. It must list `20260721000000_ai_call_telemetry.sql` and no unexpected migration. If any other migration is listed, stop; do not run the write command until the pending set is reconciled.

When the dry-run contains only the intended pending migration, run:

```powershell
.\node_modules\.bin\supabase.cmd db push --linked
```

Use the operator's authenticated Supabase CLI session. If the CLI requests the production database password, enter it interactively; never paste that credential into this file or a shell-history-bearing command.

The rollback SQL is not part of `db push`. If rollback is required, run the rollback file through the production SQL Editor using Method A.

### Step 2: Deploy the instrumented TEMP-capped Edge Functions

From the repository root in PowerShell, run exactly:

```powershell
.\scripts\deploy.ps1 -Env production
```

Do not use `-SkipVerify`.

The script runs `npm run verify:baseline` as a HARD precondition before its own `supabase link` or any `supabase functions deploy`. A red suite exits with code 1 before the script links or deploys anything. Let the complete seven-layer gate run.

No frontend/Vercel redeploy is required for this measurement window. Plan 02-05 found no runtime `maxTokensOutput` consumer outside `src/config`; the affected cap values are delivered by the Edge Function deploy.

### Step 3: Run one production smoke analysis

1. Run one analysis through the real production UI using a genuinely distinct input.
2. Immediately run the verification query in the next section.
3. Confirm the returned rows match the expected call names and minimum count for that feature.
4. If the query returns zero rows, STOP. Do not burn the other 20 runs. First verify that the migration landed and the instrumented functions deployed; if both are correct, treat the result as a cache hit and rerun with a genuinely different input.
5. Record the smoke analysis in its assigned row below only after telemetry is visible.

## Per-run telemetry verification query

Run this exact block in the production SQL Editor immediately after each analysis. Record the UI
submission time before running the analysis. `created_at` identifies when each telemetry event landed,
and `req_id` groups all Anthropic calls from one analysis without exposing the production `user_id` or
any input content. Do not assign rows to a numbered run when more than one request overlaps the time
window until the intended `req_id` is identified.

```sql
select created_at, req_id, feature, tier, call_name, attempt, model,
       input_tokens, cache_creation_input_tokens, cache_read_input_tokens,
       output_tokens, max_tokens, stop_reason, truncated, headroom_pct,
       duration_ms, http_status, ok
from public.ai_call_telemetry
where created_at > now() - interval '15 minutes'
order by created_at desc, req_id, call_name, attempt;
```

For one analysis, the expected analysis rows must share one non-null `req_id`. Utility extraction rows
may have their own call names; keep them visible but do not mix them into the feature's first-attempt
statistics. If a paste omits `created_at` or `req_id`, it is insufficient to distinguish a new run from
stale rows returned by the time window.

### One-time production controls and model/token-accounting verification

Run this read-only block once during the measurement window. It preserves the required RLS/grant
check and exposes the model plus cache-token accounting needed to settle assumptions A1 and A4. The
expected results are: `rls_enabled = true`; both grant booleans are `false` for both roles; and the
measurement rows use the intended `claude-haiku-4-5-20251001` model rather than an environment
override. Assumption A4 is now resolved from production row evidence: all six correlated Resume Free
rows returned on 2026-07-21 use `claude-haiku-4-5-20251001`. This is observed telemetry, not an
inspection of the production environment secret. The RLS/grant result is still required.

```sql
select c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'ai_call_telemetry';

with checked_roles(role_name) as (
  values ('anon'::name), ('authenticated'::name)
)
select role_name,
       has_table_privilege(role_name, 'public.ai_call_telemetry', 'SELECT')
         or has_table_privilege(role_name, 'public.ai_call_telemetry', 'INSERT')
         or has_table_privilege(role_name, 'public.ai_call_telemetry', 'UPDATE')
         or has_table_privilege(role_name, 'public.ai_call_telemetry', 'DELETE')
         as any_table_grant,
       has_sequence_privilege(role_name, 'public.ai_call_telemetry_id_seq', 'USAGE')
         or has_sequence_privilege(role_name, 'public.ai_call_telemetry_id_seq', 'SELECT')
         or has_sequence_privilege(role_name, 'public.ai_call_telemetry_id_seq', 'UPDATE')
         as any_sequence_grant
from checked_roles;

select created_at, req_id, feature, tier, call_name, model, max_tokens,
       input_tokens, cache_creation_input_tokens, cache_read_input_tokens
from public.ai_call_telemetry
where created_at > now() - interval '24 hours'
order by created_at desc, req_id, call_name
limit 50;
```

Expected analysis-row counts per successful run:

| Feature | Tier | Expected rows and call names |
| --- | --- | --- |
| Resume Analysis | free | 1: `free-single` |
| Resume Analysis | elite | 4: `criteria-1`, `criteria-2`, `summary`, `rewrites` |
| Career Compass | free | 1: `base`, plus any distinct `docx-extract` / `ocr-extract` utility rows |
| Career Compass | elite | 3: `base`, `growth`, `elite-extras`, plus any distinct `docx-extract` / `ocr-extract` utility rows |
| LinkedIn Grader | free or elite | 1: `linkedin-grade` |
| Recruiting Lens | elite | 3: `rl-call-1`, `rl-call-2`, `rl-call-3` |

These are the expected first-attempt analysis rows. Utility extraction rows and explicit attempt-2 retry rows are additional; record them as anomalies and do not mix them into first-attempt statistics.

## Mandatory anomaly rules

1. **ZERO rows for a run = a cache hit.** `analysis_cache`, `LINKEDIN_CACHE_VARIANT`, or `RECRUITING_LENS_CACHE_VARIANT` returned a stored result without an Anthropic call. The run does not count. Rerun with a genuinely different input. During the initial smoke only, first rule out a missing migration or stale function deploy before classifying zero rows as a cache hit.
2. **`stop_reason = 'max_tokens'` on a TEMP-capped run means the cell is deeply undersized and its true peak is UNKNOWN.** Do not record `output_tokens == max_tokens` as the peak. Flag the cell; it needs a higher TEMP cap and a rerun.
3. **`http_status = 408` or an abort is a MEASUREMENT FAILURE, not a data point.** Record and flag it as a wall-clock finding for the report, then rerun. Do not widen timeouts in this phase.
4. **Attempt-2 rows use a different effective cap and must never be mixed into first-attempt statistics.** Record the retry as an anomaly and keep report statistics scoped to `attempt = 1`.
5. **A request group containing both a failed and successful row for the same call does not count as a clean sample, even when every row says `attempt = 1`.** The current onboarding lifecycle can internally retry a transient failure without propagating its retry number into Anthropic telemetry. Exclude the entire contaminated group from clean statistics and obtain a replacement.

## Account assignment

Use the six locked account slots from `02-PREREQS.md`. `ADMIN_EMAIL` is not used for any measurement run. The three Elite slots are ordinary accounts upgraded through the admin panel, so their tier is a database fact rather than the `_shared/auth.ts` admin-elevation path.

- `FREE_ACCOUNT_1`, `FREE_ACCOUNT_2`, and `FREE_ACCOUNT_3`: each performs exactly one Resume, one LinkedIn, and one Career run. Each free triad costs 9 of 10 Merits.
- `ELITE_ACCOUNT_1`, `ELITE_ACCOUNT_2`, and `ELITE_ACCOUNT_3`: each performs one Resume, one LinkedIn, one Career, and one Recruiting Lens run.
- `FREE_ACCOUNT_2`, `FREE_ACCOUNT_3`, and all three Elite account identities are operator-supplied at run time. Keep personal email addresses out of this tracked log; record only the stable slot name below.
- If a failed free run consumes Merits without a refund, confirm the refund before continuing. The 1-Merit spare cannot fund a repeat; be prepared to use a fourth free account.

For each feature/tier triple, vary the real input shape: one short-and-sparse, one typical, and one long-and-dense. The input description must include approximate length plus density/sparsity, but no user content.

## Measurement matrix

Fill the five operator-result columns after each run. `duration range` is the minimum-to-maximum `duration_ms` across that run's telemetry rows.

| Run # | Feature | Tier | Account | Input description (length / density / sparsity) | Rows written | Stop reasons seen | Duration range | Anomalies |
| ---: | --- | --- | --- | --- | ---: | --- | --- | --- |
| 1 | Resume Analysis | free | `FREE_ACCOUNT_1` |  |  |  |  |  |
| 2 | Resume Analysis | free | `FREE_ACCOUNT_2` |  |  |  |  |  |
| 3 | Resume Analysis | free | `FREE_ACCOUNT_3` |  |  |  |  |  |
| 4 | Resume Analysis | elite | `ELITE_ACCOUNT_1` |  |  |  |  |  |
| 5 | Resume Analysis | elite | `ELITE_ACCOUNT_2` |  |  |  |  |  |
| 6 | Resume Analysis | elite | `ELITE_ACCOUNT_3` |  |  |  |  |  |
| 7 | LinkedIn Grader | free | `FREE_ACCOUNT_1` |  |  |  |  |  |
| 8 | LinkedIn Grader | free | `FREE_ACCOUNT_2` |  |  |  |  |  |
| 9 | LinkedIn Grader | free | `FREE_ACCOUNT_3` |  |  |  |  |  |
| 10 | LinkedIn Grader | elite | `ELITE_ACCOUNT_1` |  |  |  |  |  |
| 11 | LinkedIn Grader | elite | `ELITE_ACCOUNT_2` |  |  |  |  |  |
| 12 | LinkedIn Grader | elite | `ELITE_ACCOUNT_3` |  |  |  |  |  |
| 13 | Career Compass | free | `FREE_ACCOUNT_1` |  |  |  |  |  |
| 14 | Career Compass | free | `FREE_ACCOUNT_2` |  |  |  |  |  |
| 15 | Career Compass | free | `FREE_ACCOUNT_3` |  |  |  |  |  |
| 16 | Career Compass | elite | `ELITE_ACCOUNT_1` |  |  |  |  |  |
| 17 | Career Compass | elite | `ELITE_ACCOUNT_2` |  |  |  |  |  |
| 18 | Career Compass | elite | `ELITE_ACCOUNT_3` |  |  |  |  |  |
| 19 | Recruiting Lens | elite | `ELITE_ACCOUNT_1` |  |  |  |  |  |
| 20 | Recruiting Lens | elite | `ELITE_ACCOUNT_2` |  |  |  |  |  |
| 21 | Recruiting Lens | elite | `ELITE_ACCOUNT_3` |  |  |  |  |  |

## Operator results for Task 2

- Production migration result: **INFERRED LIVE, NOT DIRECTLY OBSERVED.** The production query returned rows from `public.ai_call_telemetry`, which proves that the table exists and accepts the instrumented service-role write path. The operator did not paste the migration command output.
- Production Edge Function deploy result: **INFERRED LIVE, NOT DIRECTLY OBSERVED.** The returned rows use `feature = resume_analysis`, `tier = free`, `call_name = free-single`, and the approved TEMP `max_tokens = 9000`, which is strong evidence that the instrumented TEMP-capped Resume Analysis bundle is live. The operator did not paste the deploy command output.
- Smoke feature/tier: Resume Analysis / Free.
- Smoke account slot and input description: the operator later identified a new candidate run as
  `FREE_ACCOUNT_1` using `scripts/test-docs/Free/FREE_ACCOUNT_1_resume.pdf`. Read-only local shape
  inspection found 6 pages, 54,332 bytes, approximately 2,120 extracted words / 16,570 characters;
  classify it as long/dense. This identifies the input but does not by itself correlate the pasted
  telemetry rows to that request.
- Read-only verification limitation: no production Supabase MCP or production database credential is available in this execution session. Table existence and the TEMP Resume Free cap are evidenced by live rows. Assumption A4 is resolved from the operator's correlated row output: the observed production model is `claude-haiku-4-5-20251001`; this is row evidence, not environment-secret inspection. RLS state and `anon`/`authenticated` grants remain unverified and the one-time verification query above is still outstanding.
- Assumption A1 remains unresolved. The observed success rows report `input_tokens = 6,312` and both cache-token columns as zero, but zero cache usage does not establish whether `input_tokens` would include or exclude non-zero cache-creation/read tokens. Task 4 still requires a known-prompt-size sanity check (and preferably a non-zero cache-token example) before any cost calculation relies on the accounting interpretation.

### Unassigned Resume Free smoke observations

These rows are recorded as checkpoint evidence only. They are deliberately not copied into the numbered matrix without account, input-shape, timestamp, or request-correlation evidence.

| Observation | Attempt | Output tokens | Max tokens | Stop reason | Duration | HTTP status | OK | Classification |
| --- | ---: | ---: | ---: | --- | ---: | ---: | --- | --- |
| A | 1 | 4,996 | 9,000 | `end_turn` | 49,064 ms | null | true | Clean first-attempt observation; unassigned |
| B | 1 | 4,083 | 9,000 | `end_turn` | 41,296 ms | null | true | Clean first-attempt observation; unassigned |
| C | 1 | null | 9,000 | null | 50,002 ms | 408 | false | **MEASUREMENT FAILURE**; wall-clock anomaly; never count as a sample |
| D | 1 | null | 9,000 | null | 50,007 ms | 408 | false | **MEASUREMENT FAILURE**; wall-clock anomaly; never count as a sample |

Task 2 smoke verdict: **PASS with anomalies.** Telemetry lands and the Resume Free TEMP cap is visible. The two 408 rows remain reportable wall-clock findings and require clean replacement runs; they must never enter first-attempt output-token statistics.

Task 3 matrix credit remains **0 of 3 assigned clean Resume Free runs**, so **3 assigned clean Resume Free samples remain**. Observation A may be credited later only if the operator supplies enough provenance to map it to a distinct account slot and input shape without guesswork. Observation B is part of the contaminated `96efa6ca` request group documented below and is excluded.

### Formal Run 1 correlated outcome: excluded, replacement required

Input/account: `scripts/test-docs/Free/FREE_ACCOUNT_1_resume.pdf` / `FREE_ACCOUNT_1`; 6 pages,
54,332 bytes, approximately 2,120 extracted words / 16,570 characters; long/dense.

The correlation query conclusively tied the following rows to one production request. Both rows share
`req_id = ed5d9568`, so the 4,762-token success is not a separate clean request and must not enter the
Resume Free peak/headroom statistics.

| Created at (PT) | Request | Attempt label | Input tokens | Cache create/read | Output / cap | Stop reason | Truncated | Duration | HTTP | OK | Classification |
| --- | --- | ---: | ---: | --- | --- | --- | --- | ---: | ---: | --- | --- |
| 2026-07-21 17:14:50.515138 | `ed5d9568` | 1 | null | null / null | null / 9,000 | null | null | 50,006 ms | 408 | false | **MEASUREMENT FAILURE**; wall-clock finding |
| 2026-07-21 17:15:39.473922 | `ed5d9568` | 1 | 6,312 | 0 / 0 | 4,762 / 9,000 | `end_turn` | false | 47,401 ms | null | true | Successful internal retry observation, but **EXCLUDED** because its request group contains the 408 |

The contaminated request consumed approximately 97.4 seconds of Anthropic wall time across the two
telemetry rows (50,006 + 47,401 ms), excluding lifecycle backoff and non-model work. This is a material
wall-clock finding: one UI analysis can span multiple near-50-second provider attempts even though the
telemetry labels both as `attempt = 1`.

Bounded source inspection classifies the duplicate label as an unresolved telemetry/retry defect, not
two independently attributable UI submissions:

- `analyze-resume/index.ts` creates `reqId` once per Edge Function request and threads it through the onboarding lifecycle.
- Onboarding calls `runAnalysisLifecycle`; its transient-error loop invokes the same `generate` closure again after a 408.
- `executeFreeAnalysis` supplies `telemetry: { ...telemetryBase, attempt: 1 }` on every first model call made by that closure. The lifecycle retry count is not passed into this telemetry field.
- Consequently, same-request internal lifecycle retries preserve the correct `req_id` but can repeat `call_name = free-single, attempt = 1`. No product-source change is made during this production measurement checkpoint.

Formal Run 1 remains blank in the matrix and Task 3 credit remains **0 of 3 assigned clean Resume Free
runs**. The historical `884f8dcc` success remains unassigned. The `96efa6ca` group (two 408 rows plus
one success, all labeled attempt 1) has the same contamination signature and also remains excluded.

### Post-deploy Run 1 replacement attempt 1: excluded provider timeout

Input/account: `scripts/test-docs/Free/FREE_ACCOUNT_1_newResume.pdf` / `FREE_ACCOUNT_1`.
Read-only local inspection found 4 pages, approximately 1,963 words / 15,105 extracted characters,
267 PDF text items (191 non-empty), and no painted images. The PDF has a healthy text layer; classify
it as medium-length but dense. The mapped `FREE_ACCOUNT_1_newLinkedIn.pdf` is 6 pages, approximately
2,456 words / 19,297 characters, making the new account pair approximately 4,419 words overall. The
telemetry row is specifically `resume_analysis/free-single`, so only the resume's shape is used to
interpret this timeout; the LinkedIn file remains untouched by this log update.

| Created at (UTC) | Request | Call | Attempt label | Output / cap | Stop reason | Duration | HTTP | OK | Classification |
| --- | --- | --- | ---: | --- | --- | ---: | ---: | --- | --- |
| 2026-07-22 03:17:01 | `77461c33` | `free-single` | 1 | null / 9,000 | null | 50,008 ms | 408 | false | **MEASUREMENT FAILURE**; excluded; no token statistics |

This is a cleanly correlated provider failure, not a clean measurement sample. The exact 50-second
duration matches the Free per-call timeout wall, and the absent input/output/cache usage fields mean
there is no token peak or headroom observation to retain. Because the PDF has an extractable text
layer with no images, the evidence points away from OCR/extraction delay and toward model generation
exceeding the provider wall clock. The prior 6-page long/dense input and this 4-page dense input both
reached that wall, so another similarly dense resume is a poor next replacement choice.

Formal Run 1 remains blank and Task 3 credit remains **0 of 3 assigned clean Resume Free runs**.

### Safe next-run procedure

1. HARD GATE: before another paid analysis, prove the Merit refund/balance outcome for `77461c33`. Do not run another measurement while that failed request may have consumed an unreturned Merit.
2. After refund proof, advance to the mapped `FREE_ACCOUNT_2` input/account rather than spending a third consecutive attempt on `FREE_ACCOUNT_1`. Use `FREE_ACCOUNT_2_resume.pdf` (3 pages, approximately 1,282 words) for the next Resume Analysis and record a clean result as **Run 2**. Its mapped LinkedIn file is also lighter (5 pages, approximately 1,834 words; pair total approximately 3,116 words), preserving the account-to-document mapping for later runs.
3. This account change does not itself fix model latency. It protects the remaining `FREE_ACCOUNT_1` triad and supplies a materially shorter/sparser resume after two dense Free-1 inputs hit the exact 50-second provider wall. Keep Formal Run 1 visibly open; fill it later with a genuinely short/sparse input on `FREE_ACCOUNT_1` only if its balance is safe, otherwise provision and record `FREE_ACCOUNT_4`.
4. Immediately before clicking Analyze, record the wall-clock start time including timezone and seconds. UTC ISO format is preferred, for example `2026-07-22T04:00:00Z`.
5. Immediately after the UI finishes, run the query below. Replace the explicitly marked `<RUN_START_UTC>` with the recorded UTC timestamp; do not widen the query to unrelated historical rows.

```sql
select created_at,
       created_at at time zone 'America/Los_Angeles' as created_at_pt,
       req_id, feature, tier, call_name, attempt, model,
       input_tokens, cache_creation_input_tokens, cache_read_input_tokens,
       output_tokens, max_tokens, stop_reason, truncated, headroom_pct,
       duration_ms, http_status, ok
from public.ai_call_telemetry
where created_at >= timestamptz '<RUN_START_UTC>' -- REQUIRED: replace with recorded start time
  and feature = 'resume_analysis'
  and tier = 'free'
  and call_name = 'free-single'
order by created_at, req_id, call_name, attempt;
```

6. Paste the recorded start time, account slot, UI result, input page/character shape, and query rows. The replacement counts only if one non-null `req_id` has exactly one clean `free-single` row: `attempt = 1`, `ok = true`, `stop_reason = 'end_turn'`, `truncated = false`, and no failure row for that request. Any zero-row/cache-hit, 408, truncation, or mixed failure+success group is excluded and must be handled before proceeding.
7. The one-time RLS/grant verification query in this log remains required; return its result with the replacement if it has not already been run.

## Phase 01.1 Recruiting Lens baseline discontinuity — 2026-07-23

Source: Phase 01.1 (D-21 / RCL-04).

- `getMaxInputChars('recruitingLens')` changed from 48,000 to 51,000 characters for Pro and Elite.
- `getMaxInputTokens('recruitingLens')` changed from 12,000 to 12,750 tokens for Pro and Elite.
- Free remains `null`.
- The per-field job-description cap changes from 3,000 to 6,000 in the same phase, so realistic maximum combined input rises even though the combined-input trimmer becomes unreachable.

Phase 02 executor instruction: do not compare any Recruiting Lens input-token measurement captured before 2026-07-23 directly with a post-Phase-01.1 measurement. Re-baseline Recruiting Lens before deriving its final budget.

The 51,000/12,750 cells are a permanent Phase 01.1 exception. Explicitly exclude them from the 02-09 TEMP revert sweep.

---

## TEMP cap raise #2 — 2026-07-24 (plan 02-06 Task 3 remediation)

### Why

The first production sweep read three cells back as **ceilings, not appetites** — the exact failure
the TEMP window exists to prevent. Per the anomaly rules above, a `truncated` row's peak is UNKNOWN
and its cell cannot be right-sized by plan 02-09. Read-only prod audit (`attempt = 1 and ok`):

| Cell | Old cap | Truncated | New cap |
| --- | ---: | --- | ---: |
| `resume_analysis` / elite / `elite-extras` | 4,000 | **6 of 6 runs** | 9,000 |
| `resume_analysis` / elite / `summary` | 8,000 | 1 of 9 runs | 10,000 |
| `recruiting_lens` / elite / `rl-call-1` | 9,000 | 1 of 5 runs | 12,000 (== `ABSOLUTE_MAX_TOKENS`) |

Aggregate ceilings moved in lockstep: `resumeAnalysis` 34,000 -> 41,000 (elite sum 8000+8000+10000+6000+9000),
`recruitingLens` 27,000 -> 30,000 (12000+9000+9000), SC-12 tier sums Pro/Elite 104,000 -> 114,000.
`rl-call-1` is now AT the per-call clamp — if it truncates again the clamp itself must be lifted before
that cell can be measured.

`RECRUITING_LENS_CACHE_VARIANT` bumped `v37-04` -> `v37-05` in the same change: a cached Recruiting Lens
result makes no Anthropic call and therefore writes NO telemetry row (anomaly rule 1).

### Lockstep file set (all six changed together)

- `src/config/pricing-config.ts` — `maxTokensOutput.resumeAnalysis` / `.recruitingLens`
- `src/config/pricing-config.snapshot.ts` — same two cells + `tierSums.maxTokensOutput`
- `src/config/__tests__/sc12-snapshot.test.ts` — tier-sum test name
- `supabase/functions/analyze-resume/index.ts` — `CALL_CONFIGS` summary + elite-extras
- `supabase/functions/analyze-resume/index.test.ts` — mirrored fixture + boot-assertion sums
- `supabase/functions/recruiting-lens/index.ts` — `CALL_CONFIGS` rl-call-1 + cache variant

Gates green pre-deploy: lint 0 errors, type-check clean, vitest 829, `deno task test:ci` 1436 passed /
0 failed / 12 ignored. GATE-09 (Free < 50% Elite) is relaxed, not stressed: Free stays 9,000 against a
41,000 Elite aggregate (50% == 20,500).

### Operator deploy runbook (raise #2)

No migration. Code-only; `ai_call_telemetry` is already live on production.

1. `.\scripts\deploy.ps1 -Env production`
   Runs `npm run verify:baseline` as a HARD precondition BEFORE `supabase link` — a red suite aborts at
   exit 1 with nothing linked and nothing deployed. Do NOT pass `-SkipVerify`.
2. No Vercel redeploy is required: `maxTokensOutput` is read server-side only (plan 02-05 Task 1 found
   no runtime frontend read).
3. Confirm the version bump on `analyze-resume` and `recruiting-lens` before running anything.
4. Smoke: one Elite resume analysis, then the per-run verification query. Expect **5 rows**, and
   specifically `elite-extras` with `max_tokens = 9000` and `summary` with `max_tokens = 10000`. If
   `elite-extras` still shows `max_tokens = 4000` the deploy did not take — STOP.

### Wall-clock risk (accepted, monitor)

At the old caps `summary` already ran 60–72 s and `rl-call-1` 87 s. The raise can extend those
proportionally. Resume Elite calls fan out in parallel, so the run is bounded by its slowest call, not
the sum. Any `http_status = 408` is a MEASUREMENT FAILURE under the existing rule — record it as a
wall-clock finding and re-run; do not silently widen a timeout.

---

## Provenance ledger — clean production runs awaiting account/input assignment

Every row below is a distinct `req_id` already on production with **zero failure rows and
`attempt = 1` only**. They are clean by the sample rule but uncredited because the matrix requires an
account slot and input shape. Fill the two right-hand columns and these become matrix rows — no re-run
needed. `total_out` is the sum across the request's calls.

| req_id | Feature | Tier | Started (UTC) | Calls | total_out | peak_in | Account (fill) | Input shape (fill) |
| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- |
| `884f8dcc` | Resume Analysis | free | 2026-07-21 23:39 | 1 | 4,996 | 6,312 |  |  |
| `25575538` | Resume Analysis | free | 2026-07-22 18:35 | 1 | 4,926 | 4,096 |  |  |
| `c5e9634f` | Resume Analysis | free | 2026-07-23 17:51 | 1 | 4,001 | 4,452 |  |  |
| `662dee50` | Resume Analysis | free | 2026-07-23 18:06 | 1 | 4,848 | 5,274 |  |  |
| `be62b8dc` | Resume Analysis | free | 2026-07-24 04:30 | 1 | 4,338 | 4,395 |  |  |
| `a0e258ec` | Resume Analysis | free | 2026-07-24 04:31 | 1 | 4,472 | 4,395 |  |  |
| `146ffb84` | Resume Analysis | free | 2026-07-24 07:06 | 1 | 4,889 | 4,445 |  |  |
| `601f0ff3` | Career Compass | free | 2026-07-22 18:36 | 1 | 2,204 | 2,752 |  |  |
| `9c760f3a` | Career Compass | free | 2026-07-23 17:53 | 1 | 2,413 | 4,556 |  |  |
| `c60366bb` | Career Compass | free | 2026-07-23 18:08 | 1 | 2,567 | 3,969 |  |  |
| `f33c30b6` | Career Compass | elite | 2026-07-22 18:57 | 3 | 4,674 | 2,838 |  |  |
| `9e6b4744` | Career Compass | elite | 2026-07-22 21:01 | 3 | 5,473 | 3,189 |  |  |
| `3fc9864f` | Career Compass | elite | 2026-07-24 04:39 | 3 | 5,897 | 4,641 |  |  |
| `214062ae` | LinkedIn Grader | elite | 2026-07-22 21:07 | 1 | 5,731 | 1,481 |  |  |
| `b3c1ef45` | Recruiting Lens | elite | 2026-07-23 08:53 | 3 | 11,096 | 4,102 |  |  |
| `5f35f328` | Recruiting Lens | elite | 2026-07-23 16:25 | 3 | 20,296 | 4,373 |  |  |
| `71610969` | Recruiting Lens | elite | 2026-07-24 04:51 | 3 | 22,591 | 4,523 |  |  |
| `1b721fbd` | Recruiting Lens | elite | 2026-07-24 07:39 | 3 | 15,600 | 3,716 |  |  |

**Excluded, do not credit:** `96efa6ca`, `ed5d9568` (mixed failure+success in one request group);
`46d47d08`, `461d468f`, `77461c33` (all-408 measurement failures); `e3f46f30` (contains `attempt = 2`);
`ad88a945` (`rl-call-1` truncated at 9,000); every `resume_analysis`/elite request (`641ecf37`,
`4cc18707`, `4c365a73`, `3f7d721e`, `7d9a98b8`, `4045b5fd`, `10f03aea`, `c3d34e58`) because
`elite-call-extras` truncated in all of them.

### Runs still genuinely required after the raise-#2 deploy

A non-truncated call is unaffected by raising its cap — the cap was never binding — so only truncated
cells need re-measuring. That reduces the outstanding work from 21 runs to **9**:

| # | Feature | Tier | Account | Why |
| ---: | --- | --- | --- | --- |
| 1–3 | Resume Analysis | elite | `ELITE_ACCOUNT_1..3` | `elite-extras` truncated on every prior Elite run |
| 4–6 | LinkedIn Grader | free | `FREE_ACCOUNT_1..3` | zero runs recorded |
| 7–8 | LinkedIn Grader | elite | `ELITE_ACCOUNT_2..3` | only 1 of 3 recorded (`214062ae`) |
| 9 | Recruiting Lens | elite | `ELITE_ACCOUNT_*` | replaces truncated `ad88a945`; use a DENSE job description |

Resume free, Career Compass free, and Career Compass elite need **no new runs** — they are already
covered by the provenance ledger above once the account/input columns are filled.

### Assumption A1 — RESOLVED (2026-07-24)

`input_tokens` **excludes** cache tokens. Evidence: request `214062ae` (`linkedin_grader` / elite /
`linkedin-grade`) recorded `input_tokens = 1,481` alongside `cache_creation_input_tokens = 4,647` on
the same row. Had `input_tokens` been inclusive it could not be smaller than the cache-creation count
for the same call. The report must therefore price input as
`input_tokens + cache_creation_input_tokens + cache_read_input_tokens` at their respective rates —
summing them is additive, not double-counting.

---

## MEASUREMENT RESTART — Epoch 2 (2026-07-24T13:46:58Z)

Operator decision (2026-07-24): start the analyses and logs over. Everything above this line is
**Epoch 1** and is retained as history only. The provenance ledger is WITHDRAWN — no Epoch 1 row
will be credited into the matrix. The raise-#2 caps were pushed and redeployed by the operator
before this epoch opened, so every Epoch 2 run executes at the new TEMP caps.

**Epoch filter — mandatory on every query:** only rows with
`created_at >= timestamptz '2026-07-24T13:46:58Z'` count toward Epoch 2. The prod table still
holds all 88 Epoch 1 rows; never mix epochs in one statistic.

**Deploy confirmation piggybacks on the first Elite resume run:** its `elite-extras` row must show
`max_tokens = 9000` and `summary` must show `max_tokens = 10000`. If `elite-extras` reads 4000, the
deploy did not take — STOP. (Free-tier cells were unchanged by raise #2, so free runs are valid
regardless and may run first.)

### Epoch 2 matrix — 21 runs

| Run # | Feature | Tier | Account | Input description (length / density / sparsity) | Rows written | Stop reasons seen | Duration range | Anomalies |
| ---: | --- | --- | --- | --- | ---: | --- | --- | --- |
| 1 | Resume Analysis | free | `FREE_ACCOUNT_1` | `Free_01_Maya_Patel_Resume.pdf` — 2-page 84.1KB PDF, long/dense (req `57ebc54a`, prompt-total in=5,160) | 1 | `end_turn` | 37,548 ms | none — out 3,727 / cap 9,000 (headroom 58.6%) |
| 2 | Resume Analysis | free | `FREE_ACCOUNT_2` | `Free_02_Jordan_Kim_Resume.pdf` — 2-page 82.6KB PDF, long/dense (req `49bbf366`, in=5,107) | 1 | `end_turn` | 46,986 ms | none — out 4,636 / cap 9,000 (headroom 48.5%) |
| 3 | Resume Analysis | free | `FREE_ACCOUNT_3` | `Free_03_Arjun_Mehta_Resume.pdf` — 2-page 82.9KB PDF, long/dense (req `9552d0fa`, in=5,132) | 1 | `end_turn` | 46,333 ms | Preceding separate request `e1358a66` 408'd at 50,007 ms (wall-clock finding, refunded, excluded); success run itself clean — out 4,944 / cap 9,000 (headroom 45.1%) |
| 4 | LinkedIn Grader | free | `FREE_ACCOUNT_1` | `Free_01_Maya_Patel_LinkedIn.pdf` — 73.1KB LinkedIn export, long/dense (req `ea095aa6`, in=4,633) | 1 | `end_turn` | 44,465 ms | none — out 4,503 / cap 12,000 (headroom 62.5%); zero cache tokens |
| 5 | LinkedIn Grader | free | `FREE_ACCOUNT_2` | `Free_02_Jordan_Kim_LinkedIn.pdf` — 71.5KB LinkedIn export, long/dense (req `32f259f4`, in=4,571) | 1 | `end_turn` | 50,924 ms | none — out 5,303 / cap 12,000 (headroom 55.8%) |
| 6 | LinkedIn Grader | free | `FREE_ACCOUNT_3` | `Free_03_Arjun_Mehta_LinkedIn.pdf` — 3-page 74.2KB LinkedIn export, long/dense (req `c2e4ef46`, in=4,604) | 1 | `end_turn` | 50,102 ms | none — out 5,774 / cap 12,000 (headroom 51.9%); duration crossed the 50s line but completed |
| 7 | Career Compass | free | `FREE_ACCOUNT_1` | Resume + LinkedIn pair above (req `650617eb`, in=5,319) | 1 | `end_turn` | 27,639 ms | none — out 2,405 / cap 9,000 (headroom 73.3%) |
| 8 | Career Compass | free | `FREE_ACCOUNT_2` | Jordan Kim resume + LinkedIn pair (req `225fad86`, in=5,242) | 1 | `end_turn` | 32,184 ms | none — out 2,935 / cap 9,000 (headroom 67.4%) |
| 9 | Career Compass | free | `FREE_ACCOUNT_3` | Arjun Mehta pair (req `774a830f`, in=5,260); succeeded after operator SQL backfill of row B's extracted_text (incident below) | 1 | `end_turn` | 27,943 ms | none — out 2,339 / cap 9,000 (headroom 74.0%); 4 prior INPUT_MISSING submissions all ledger-refunded |
| 10 | Resume Analysis | elite | `ELITE_ACCOUNT_1` | `Elite_04_Elena_Morales_Resume.pdf` — 2-page 83.9KB PDF, long/dense (req `6e140f16`, in≈4,486–4,808/call); account upgraded free→elite pre-run | 5 (+1 attempt-2) | `end_turn` ×5 | 26,467–72,831 ms | Deploy smoke PASSED (summary cap 10000, elite-extras 9000 visible). attempt-1 summary failed schema validation → attempt-2 retry at 12000 clamp succeeded (excluded from stats). elite-extras out 7,162 — real appetite ~1.8× the old 4000 cap. UI hung at 95% during the ~65s retry though server completed + persisted (UX defect, not measurement) |
| 11 | Resume Analysis | elite | `ELITE_ACCOUNT_2` | dense resume (req `48ebbea6`, in≈4,850) | 5 | `end_turn` ×4 + `max_tokens` ×1 | 18,063–96,823 ms | **summary TRUNCATED at 10000** — true peak UNKNOWN; other 4 calls clean |
| 12 | Resume Analysis | elite | `ELITE_ACCOUNT_3` | dense resume (req `c1e69ec9`, in≈4,981) | 5 | `end_turn` ×4 + `max_tokens` ×1 | 20,945–85,581 ms | **elite-extras TRUNCATED at 9000** — true peak UNKNOWN; other 4 calls clean |
| — | Resume Analysis | elite | (over-sample) | clean resume (req `e08a2142`, in≈4,878) | 5 | `end_turn` ×5 | 28,471–67,886 ms | 4th elite resume run, no truncation — bonus data point |
| 13 | LinkedIn Grader | elite | `ELITE_ACCOUNT_1` | LinkedIn PDF (req `5b099211`, in=1,323, cache-create 4,647) | 1 | `end_turn` | 44,560 ms | none — out 4,763 / cap 12,000 (60% headroom); cap is 2.5× appetite |
| 14 | LinkedIn Grader | elite | `ELITE_ACCOUNT_2` | LinkedIn PDF (req `1a55fd9c`, in=1,450) | 1 | `end_turn` | 42,991 ms | none — out 4,853 / cap 12,000 |
| 15 | LinkedIn Grader | elite | `ELITE_ACCOUNT_3` | LinkedIn PDF (req `a1ab7a70`, in=1,337) | 1 | `end_turn` | 42,594 ms | none — out 4,748 / cap 12,000; +1 over-sample `b77a9374` (sparse in=282, out 4,482) |
| 16 | Career Compass | elite | `ELITE_ACCOUNT_1` | resume+LinkedIn (req `7a6e13dc`, in≈5,206) | 3 | `end_turn` ×3 | 24,599–39,786 ms | none — base/growth/elite-extras all well under cap |
| 17 | Career Compass | elite | `ELITE_ACCOUNT_2` | resume+LinkedIn (req `6456b4a4`, in≈5,461) | 3 | `end_turn` ×3 | 13,756–41,782 ms | none — total out 7,277 |
| 18 | Career Compass | elite | `ELITE_ACCOUNT_3` | resume+LinkedIn (req `9977d939`, in≈4,641) | 3 | `end_turn` ×3 | 11,515–29,784 ms | none; +1 over-sample `26fc1538` (in≈5,240, clean) |
| 19 | Recruiting Lens | elite | `ELITE_ACCOUNT_1` | lengthy JD (req `d72a6404`, in≈4,376) | 3 | `end_turn` ×3 | 54,081–64,237 ms | none — total out 18,586; rl-call-1 no longer truncates at 12000 |
| 20 | Recruiting Lens | elite | `ELITE_ACCOUNT_2` | lengthy JD (req `a4b68602`, in≈4,398) | 3 | `end_turn` ×3 | 66,563–100,935 ms | none — **rl-call-1 peaked 10,955 / cap 12,000** (dense JD, closest to clamp); total out 26,401 |
| 21 | Recruiting Lens | elite | `ELITE_ACCOUNT_3` | lengthy JD (req `9bbed2fd`, in≈4,580) | 3 | `end_turn` ×3 | 48,579–79,004 ms | none — total out 20,047 |

Expected telemetry rows per run: Resume free 1 (`free-single`) · Resume elite 5 (`criteria-1`,
`criteria-2`, `summary`, `rewrites`, `elite-extras`) · LinkedIn 1 (`linkedin-grade`) · Career free 1
(`base`) · Career elite 3 (`base`, `growth`, `elite-extras`) plus any `docx-extract`/`ocr-extract`
utility rows · Recruiting Lens 3 (`rl-call-1..3`).

### Epoch 2 per-run verification query

Run after EACH analysis (all features; the epoch filter is baked in):

```sql
select created_at, req_id, feature, tier, call_name, attempt, model,
       input_tokens, cache_creation_input_tokens, cache_read_input_tokens,
       output_tokens, max_tokens, stop_reason, truncated, headroom_pct,
       duration_ms, http_status, ok
from public.ai_call_telemetry
where created_at >= timestamptz '2026-07-24T13:46:58Z'
order by created_at desc, req_id, call_name, attempt;
```

### Epoch 2 rules (unchanged from the runbook, restated)

1. Distinct input per run — an input identical to ANY prior run (either epoch) risks an
   `analysis_cache` hit: zero Anthropic call, zero telemetry, run does not count.
2. All 9 free runs on non-admin accounts — `_shared/auth.ts:155` force-elevates the admin email to
   elite server-side; the admin account physically cannot produce a free-tier row.
3. Anomalies: zero rows = cache hit (re-run, different input) · `stop_reason='max_tokens'` = cell
   undersized, peak unknown, flag + re-run needed · 408/abort = measurement failure, wall-clock
   finding, re-run · attempt-2 rows never enter first-attempt statistics · a request group with both
   failure and success rows is contaminated and excluded whole.
4. Long/dense Resume FREE inputs repeatedly hit the exact 50-second provider wall in Epoch 1
   (four 408s, zero data). "Long" is fine; pathological density is not — if a free resume run 408s
   twice, switch to a moderately long input rather than burning the account slot again.
5. Note each input's rough length/density/sparsity at run time — outliers are uninterpretable
   without it.

### Incident — Career Compass free permanently 400s after a same-file re-upload (2026-07-24/25)

Run 9 (`FREE_ACCOUNT_3`) failed 3/3 submissions with `failure_code=INPUT_MISSING`,
`stage=generating`, zero telemetry rows (failure is pre-Anthropic). Root cause chain,
diagnosed read-only on prod:

1. First Arjun resume upload (23:26Z) → resumes row A; `ocr-pdf` persisted 8,030 chars.
2. Re-upload of the SAME bytes (23:46Z, after the 408) → NEW resumes row B. `ocr-pdf`'s
   reuse short-circuit found the accepted extraction by `(user_id, document_hash)` and
   returned early — row B's `extracted_text` stayed EMPTY.
3. Career Compass submits only `resumeFilePath` (row B). Server lookup by file_path →
   empty; backend `extractPDFTextWithMetadata` is a deliberate no-op (Phase 51, browser
   pdf.js is the accepted parser) → guaranteed `400` "Unable to extract text from your
   resume" → worker maps 400 → INPUT_MISSING, permanent, no retry.

NOT an input problem: the PDF has a clean 8,140-char text layer (verified locally with
the same pdfjs the browser uses). Affects ANY user who re-uploads an identical resume
then runs Career Compass. Money path held: all three deductions have matching ledger
refunds by `deduction_id` (verified in `merit_transactions`, not from the boolean).

Fix: commit `1e3b6589` — `ocr-pdf` reuse hit now persists the reused extraction onto the
new resumes row before returning, plus a static guard test. deno 1437/0/12 green.
**Requires a production edge deploy (`ocr-pdf`) before run 9 can be re-attempted.**

Related open observation: user `839d44ef` (15:03/15:08Z, same Arjun doc) has TWO resumes
rows with empty extracted_text — likely an abandoned earlier attempt at the account-3
triad; if that account is reused, its career runs will hit the same wall until a fresh
upload lands after the fix.

Wall-clock findings so far (Epoch 2): `e1358a66` resume-free 408 at 50,007 ms; runs 5
(50,924 ms) and 6 (50,102 ms) crossed 50 s but completed.

Incident resolution (2026-07-25): fix `1e3b6589` deployed by operator. A 4th career
submission (03:05Z, job `966231df`) still failed INPUT_MISSING because no re-upload
occurred — the fix backfills only when ocr-pdf runs during an upload. Operator then ran
the approved one-row SQL backfill (row A `960117ce` → row B `61149c45`, guarded on empty
target) and the re-run succeeded (`774a830f`). All 4 failed submissions have matched
ledger refund pairs. NOTE: the deployed fix's persist-on-reuse path has NOT yet been
live-exercised — its evidence is the static guard test + deploy; the next same-file
re-upload on prod will prove it incidentally.

### Epoch 2 observations after run 10 (2026-07-25)

- **Free 408 #2 (unassigned):** onboarding attempt at 05:20Z (`990f576d`) hit the provider
  wall at 50,013 ms. Refunded with a persisted merit_transaction_id (streaming-twin Gate A
  observed working live). Free triad already complete — excluded, wall-clock finding only.
- **Zombie retrying jobs:** `58ffa6e8` (05:20Z) and `b5ab43b0` (07-24 23:26Z) sit at
  status='retrying', refunded=true. Money-safe (refund on file; reaper skips refunded
  rows), but if the queue worker ever picks them up they will emit stray free-single
  telemetry. Any late free-single row on those accounts must be checked against these
  job ids before crediting anything.
- **95% UI hang (UX defect, candidate for /gsd-debug):** the elite streaming client did
  not surface completion when the server's validation-aware summary retry extended the
  run to ~2m20s; job completed, merit settled, result row persisted with score. The
  operator saw a hang at 95% for a run that succeeded.

---

## Epoch 2 dataset reconciliation — 2026-07-26 (all runs complete)

Read-only prod audit, epoch filter `created_at >= 2026-07-24T13:46:58Z`. Coverage target is
3 clean first-attempt (`attempt=1 and ok and not truncated`) requests per (feature, tier) cell.

| Feature / tier | Clean reqs | Target | Cells with UNRESOLVED peak |
| --- | ---: | ---: | --- |
| resume_analysis free | 5 | 3 | none |
| resume_analysis elite | 4 | 3 | **summary** (trunc 1/4 @10000), **elite-extras** (trunc 1/4 @9000) |
| linkedin_grader free | 3 | 3 | none |
| linkedin_grader elite | 4 | 3 | none |
| career_compass free | 5 | 3 | none |
| career_compass elite | 4 | 3 | none |
| recruiting_lens elite | 3 | 3 | none (rl-call-1 resolved at 12000) |

**Coverage COMPLETE.** Every cell has ≥3 clean first-attempt runs. The two truncations do NOT
eat into the required 3 — each affected cell still has 3 other clean untruncated runs. But per
anomaly rule 2 a truncated run means the cell's TRUE appetite is ≥ its cap, so those two cells
cannot be right-sized down to their clean-run peak without re-introducing the truncation.

### Per-call peaks at the raise-#2 caps (clean first-attempt only)

| Feature | tier | call | cap | clean peak_out | avg_out | verdict |
| --- | --- | --- | ---: | ---: | ---: | --- |
| resume | elite | criteria-1 | 8000 | 4,312 | 3,639 | resolved — deep headroom |
| resume | elite | criteria-2 | 8000 | 4,883 | 4,224 | resolved |
| resume | elite | summary | 10000 | (≥10,000, 1 trunc) | 6,843 | **UNRESOLVED — appetite ≥10000** |
| resume | elite | rewrites | 6000 | 2,705 | 2,264 | resolved — deep headroom |
| resume | elite | elite-extras | 9000 | (≥9,000, 1 trunc) | 7,387 | **UNRESOLVED — appetite ≥9000** |
| resume | free | free-single | 9000 | 4,944 | 4,288 | resolved |
| linkedin | free | linkedin-grade | 12000 | 5,774 | 5,193 | resolved — cap 2× appetite |
| linkedin | elite | linkedin-grade | 12000 | 4,853 | 4,712 | resolved — cap 2.5× appetite |
| career | free | base | 9000 | 2,935 | 2,490 | resolved — deep headroom |
| career | elite | base | 9000 | 3,523 | 2,577 | resolved |
| career | elite | growth | 6000 | 2,798 | 2,616 | resolved |
| career | elite | elite-extras | 4000 | 983 | 935 | resolved — 4× headroom |
| rcl | elite | rl-call-1 | 12000 | 10,955 | 7,515 | resolved but NEAR clamp |
| rcl | elite | rl-call-2 | 9000 | 8,669 | 7,318 | resolved — near cap |
| rcl | elite | rl-call-3 | 9000 | 8,280 | 6,845 | resolved — near cap |

### Two open cells (resume/elite summary + elite-extras) — decision for 02-08

Both truncated once even at the raise-#2 caps. Their appetite is ≥ current cap; true peak unknown.
There are only two honest ways to close them, since ABSOLUTE_MAX_TOKENS = 12000 is the hard
per-call ceiling:

1. **Accept + rely on the existing self-heal.** analyze-resume already runs a validation-aware
   attempt-2 retry at the 12000 clamp (observed live: run 10 `6e140f16` summary retry succeeded).
   A rare attempt-1 truncation is auto-recovered. Final caps set at/near 12000 for these two calls.
   No further runs. Note the aggregate elite ceiling would then be criteria 8000×2 + summary 12000
   + rewrites 6000 + elite-extras 12000 = 46000 (all ≤ ABSOLUTE_MAX per call).
2. **Raise #3 to 12000 for summary + elite-extras, one more dense elite resume run.** Captures the
   true untruncated peak if it lies in 10000–12000, or confirms clamp-bound. Costs one redeploy +
   one run; cannot measure any appetite above 12000 regardless (hard clamp).

**Recommendation: Option 1.** rl-call-1 already sits at 12000 with a 10,955 peak and self-recovers;
summary/elite-extras behave identically and already have a proven attempt-2 safety net. Raising to
12000 and re-running can only tell us whether the tail peak is 11k vs ≥12k — which does not change
the final cap (it lands at 12000 either way). 02-08 sets summary and elite-extras final caps at
12000 with the retry as the documented safety net; every other cell has clean, comfortable peaks to
right-size DOWN from.

### Wall-clock findings (Epoch 2, for the report)

- Resume FREE hit the exact ~50s provider wall on 3 requests (`e1358a66`, `990f576d`, `76a828b4`),
  all 408, all refunded (streaming-twin Gate A persisted the handle each time). Dense free resume
  input is the risk; clean free runs completed 37–47s.
- Longest successful calls: rcl `a4b68602` rl-call-1 100,935 ms; resume `48ebbea6` summary 96,823 ms;
  resume `c1e69ec9` elite-extras 85,581 ms. All under the Edge ceiling but the raised caps clearly
  extend dense-input wall-clock — a report caveat, not a failure.

### Assumption A1 — CONFIRMED again

LinkedIn elite `5b099211`/`1a55fd9c` show `input_tokens` (1,323/1,450) far below
`cache_creation_input_tokens` (4,647). `input_tokens` excludes cache tokens; price input as the sum
of the three token columns.
