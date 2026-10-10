---
phase: 02-ai-token-cost-optimization
plan: 10
status: gaps_found
requirements: [TOK-08]
updated: 2026-07-29
deploy_started_at: 2026-07-28T06:55:24Z
soak_started_at: null
soak_ended_at: null
---

# Phase 02 Final-Cap Production Verification

This record proves whether the operator-approved caps implemented by Plan 02-09 are live and
reliable on production. Record telemetry columns, request IDs, counts, and timing only. Do not paste
resume/profile text, job descriptions, production user IDs, credentials, or secrets.

## 1. Production deploy runbook

Production project: `zjpjapgraoxdukdvpjes`.

The planned cap deployment has no Phase-02 schema change: the permanent
`public.ai_call_telemetry` table landed in Plan 02-06. However, the first operator deploy attempt
exposed an unrelated client-write grant regression in Preview. The immutable repair migration
`20260728010000_reconcile_client_write_column_grants.sql` was added in commit `09cd4969`; it must
be applied to Preview after migration-history reconciliation and to Production through the
operator database path. `deploy.ps1` deploys Edge Functions only and does not push migrations.

There is still **no frontend/Vercel deployment**: Plan 02-05 proved that `maxTokensOutput` has no
runtime frontend consumer outside `src/config`; the cap changes ship in the Edge Function bundles.

From the repository root in PowerShell, the operator runs exactly:

```powershell
.\scripts\deploy.ps1 -Env production
```

Do not pass `-SkipVerify`.

`deploy.ps1` runs `npm run verify:baseline` as a **HARD precondition before `supabase link`**. If any
baseline leg is red, the script exits 1 before linking or deploying anything. Preserve the complete
command output and record the result below.

| Deploy evidence | Result |
| --- | --- |
| Started at (UTC) | Operator start not captured; first observed function update `2026-07-28T06:55:24Z` |
| Commit / source HEAD | Current/deploy-window HEAD `d5e1679e376e9d590f82216f46af69f485314f99`; exact operator source SHA was not separately attested |
| `verify:baseline` | **GREEN** on independent post-deploy rerun, exit 0; includes repaired Preview remote lane, 9 Playwright passed / 4 quarantined, and production build |
| Production link target | Confirmed `zjpjapgraoxdukdvpjes` |
| Function deploy result | All listed functions `ACTIVE`; target versions: Resume `253`, Career `257`, LinkedIn `218`, Recruiting Lens `167` |
| Completed at (UTC) | Latest target-function update observed `2026-07-28T06:56:50Z` |

### Blocked deploy attempt and grant-repair prerequisite

The operator ran the exact production command on 2026-07-27 PT. Its hard baseline gate stopped
before `supabase link` or any function deployment:

- remote lane result: **18 passed, 4 failed**;
- all four failures were `42501 permission denied for table resumes`;
- the failing success expectations were authenticated resume INSERT/UPDATE operations;
- the protected-field rejection still passed, but only because the table-wide denial rejected
  everything;
- script result: `verify:baseline FAILED -- aborting deploy (no functions linked or deployed)`.

Diagnosis found conflicting applied migrations:

- `20260726130000` removed authenticated INSERT/UPDATE from `resumes` and `career_targets`;
- `20260727120000` restored blanket table writes, which also reopened server-owned columns;
- `20260728010000` now revokes either starting posture and grants only the exact legitimate client
  columns, with transactional postconditions and a registered regression guard.

Local verification for the repair is green:

- focused grant guard: **4 passed, 0 failed**;
- registered `deno task test:ci`: **1,441 passed, 0 failed, 12 ignored**;
- source commit: `09cd4969`.

The first read-only Preview history audit found:

| Preview migration history | State |
| --- | --- |
| Local-only | `20260727120000`, `20260728000000`, `20260728010000` |
| Remote-only | `20260727145547` |

Do not run `supabase db push` and do not use `migration repair` until the owner of remote-only
`20260727145547` supplies/synchronizes its canonical migration file. After synchronization:

1. re-run `supabase migration list --linked` against Preview and require zero remote-only versions;
2. apply the ordered pending migrations to Preview through the normal migration path;
3. run the complete baseline/remote lane and require the five resume-grant cases to pass;
4. restore/audit the Production link, apply only the pending grant repair through the operator
   database path, then run `.\scripts\deploy.ps1 -Env production`;
5. continue with the four-feature smoke and R1-R7 evidence below.

**Preview resolution verified 2026-07-28:** the canonical
`20260727145547_client_error_diagnostics.sql` file is now in the checkout; Preview records both
`20260727145547` and the grant repair `20260728010000`. Its migration history has no local-only or
remote-only versions. The complete baseline is green, proving the original four `42501` failures
are closed on Preview.

**Production database closeout resolved 2026-07-28.** Before reconciliation, Production recorded
the diagnostics schema under earlier version `20260728000000`, while the checkout used canonical
version `20260727145547`. The two diagnostics files were compared after stripping comments and
whitespace and had statement-identical SQL (normalized length `2549` each). The operator performed
the history-only reconciliation and applied grant repair `20260728010000`:

```powershell
.\node_modules\.bin\supabase.cmd migration repair 20260727145547 --status applied --linked
.\node_modules\.bin\supabase.cmd migration repair 20260728000000 --status reverted --linked
.\node_modules\.bin\supabase.cmd migration list --linked
.\node_modules\.bin\supabase.cmd db push --dry-run --linked
```

The pre-apply dry run listed only
`20260728010000_reconcile_client_write_column_grants.sql`, so the operator applied and verified it:

```powershell
.\node_modules\.bin\supabase.cmd db push --linked
.\node_modules\.bin\supabase.cmd migration list --linked
```

Post-operator read-only verification shows local and Production histories aligned through
`20260728010000`; a second `db push --dry-run --linked` reports
`Remote database is up to date.` The grant repair's transactional postconditions therefore
completed successfully. The repository remains linked to Production
(`zjpjapgraoxdukdvpjes`). No Production mutation was performed by the execution agent.

### Immediate four-feature smoke

After deployment, submit one request to each feature. A structured non-503 rejection (for example,
an expected auth/input response) proves the route booted; it is not a successful analysis and does
not replace the re-run evidence below.

| Feature | Endpoint / flow | HTTP result | `sb-error-code` | Boot verdict |
| --- | --- | ---: | --- | --- |
| Resume Analysis | `analyze-resume` unauthenticated POST | `400` | none | **PASS** — structured non-503 rejection; production ACAO present |
| LinkedIn Grader | `grade-linkedin` unauthenticated POST | `401` | none | **PASS** — structured non-503 rejection; production ACAO present |
| Career Compass | `analyze-career` unauthenticated POST | `401` | none | **PASS** — structured non-503 rejection; production ACAO present |
| Recruiting Lens | `recruiting-lens` unauthenticated POST | `400` | none | **PASS** — structured non-503 rejection; production ACAO present |

**Abort rule:** any `503`, including an `OPTIONS`/preflight `503`, carrying
`sb-error-code: BOOT_ERROR` is a routing/module-load failure caused by a missed lockstep surface. Do
not retry it as a prompt/model failure and do not add a retry loop. Stop the rollout and restore the
last known-good Edge bundles through the normal operator rollback/deploy path before investigating.

## 2. Post-deploy re-run subset

The minimum subset is six distinct production analyses. The operator elected to run seven: the
required six plus a Free Resume regression run. Together they cover every cell whose final cap
changed, every Group-B cell whose output shape was flagged as unbounded, and the unchanged/trusted
Resume `free-single` cell. Pro mirrors Elite and does not require separate runs.

Use the same account tier policy as the measurement epoch: non-admin accounts for Free; ordinary
admin-panel-upgraded accounts for Elite. Use genuinely different inputs if a request returns zero
telemetry rows, because zero rows is a cache hit and not a pass.

| Re-run | Production analysis | Cells covered | Account/input | Request ID | UI/HTTP result |
| --- | --- | --- | --- | --- | --- |
| R1a (incident) | Resume Analysis / Free (extra) | free-single | `FREE_ACCOUNT_1`; `scripts/test-docs-new/free_arjun_mehta_resume.pdf` | `14da92f1` | **FAIL / FINDING** — 2026-07-28 08:58 UTC: HTTP 500 `MODEL_TIMEOUT`; Merit refund succeeded, but the frontend remained indefinitely at 95% with no error or result |
| R1b (hotfix rerun) | Resume Analysis / Free (extra) | free-single | `FREE_ACCOUNT_1`; same operator-selected onboarding input | edge request `019fab40…`; telemetry request `cea71f17` | **PASS** — operator reported result working around 2026-07-28 17:21 PDT; POST returned HTTP 200 at 17:22:51 PDT; lifecycle `completed` at 17:23:38 PDT, durable Free result present, exactly one 3-Merit debit, zero refunds |
| R2 | LinkedIn Grader / Free | linkedin-grade | `FREE_ACCOUNT_1`; `scripts/test-docs-new/free_arjun_mehta_linkedin.pdf` | edge request `019fab4e…`; telemetry request `1274e882` | **PASS** — 2026-07-29 00:37:35 UTC submission; HTTP 200 at 00:38:19 UTC; lifecycle `completed`, durable score 73 present, exactly one 3-Merit debit, zero refunds |
| R3 | Career Compass / Free | base | `FREE_ACCOUNT_1`; Arjun resume + LinkedIn pair from `scripts/test-docs-new/` | submit edge request `019fab53…`; telemetry request `63a4e201` | **PASS** — submitted 2026-07-29 00:43:25 UTC; worker HTTP 200 at 00:44:12 UTC; lifecycle `completed`, durable score 78 present, exactly one 3-Merit debit, zero refunds |
| R4 | Resume Analysis / Elite | criteria-1, criteria-2, summary, rewrites, elite-extras | `ELITE_ACCOUNT_1`; `scripts/test-docs-new/elite_maya_patel_resume.pdf` | edge request `019fab5c…`; telemetry request `cef72efc` | **PASS** — submitted 2026-07-29 00:53:05 UTC; HTTP 200 at 00:54:28 UTC; all five attempt-1 cells ended normally, lifecycle `completed`, durable Elite score 87 present, exactly one 3-Merit debit, zero refunds |
| R5 | LinkedIn Grader / Elite | linkedin-grade | `ELITE_ACCOUNT_1`; `scripts/test-docs-new/elite_maya_patel_linkedin.pdf` | edge request `019fab62…`; telemetry request `4f78eaea` | **PASS** — submitted 2026-07-29 00:59:22 UTC; HTTP 200 at 01:00:15 UTC; lifecycle `completed`, durable score 85 present, exactly one 3-Merit debit, zero refunds |
| R6 | Career Compass / Elite | base, growth, elite-extras | `ELITE_ACCOUNT_1`; Maya resume + LinkedIn pair from `scripts/test-docs-new/` | submit edge request `019fab66…`; telemetry request `72ee980f` | **PASS** — submitted 2026-07-29 01:04:12 UTC; worker HTTP 200 at 01:04:56 UTC; all three attempt-1 cells ended normally, lifecycle `completed`, durable score 82 present, exactly one 3-Merit debit, zero refunds |
| R7 | Recruiting Lens / Elite | rl-call-1, rl-call-2, rl-call-3 | `ELITE_ACCOUNT_1`; Maya resume plus submitted 3,715-character JD (shorter than planned near-6,000 stress input) | edge request `019fab6e…`; telemetry request `166ea040` | **FINDING** — submitted 2026-07-29 01:12:24 UTC; HTTP 200 at 01:13:54 UTC; lifecycle `completed`, durable score 62 present, exactly one current-cost 8-Merit debit, zero refunds; `rl-call-3` had only 9.09% headroom, below the locked 15% floor |

**R1 incident gate cleared 2026-07-28:** production logs proved the original R1a request was
terminal and refunded rather than still running. The deployed frontend had handed that coded
failure to Results without a lifecycle `run_id`; Results then suppressed its bounded fallback based
on the global lifecycle flag and polled only for `grading_data`, creating a deterministic permanent
95% state. Isolated commit `bcffdad2` corrected both client guards. The R1b production rerun passed:
the operator saw the result, edge request `019fab40…` returned HTTP 200, lifecycle run `58852263…`
reached `completed` with `merit_settled=true` and `refunded=false`, the result was durable on the
Free resume row, and the matching Merit deduction had one `feature-deduct` row totaling `-3` with
zero refund rows. R2-R7 are released. The soak start remains blocked until all R1-R7 rows pass.

Release candidate `bcffdad2` was isolated in detached worktree
`C:\Projects\strive-ai-hired-hotfix-bcffdad2`; its exact seven-layer `verify:baseline` passed in
353.6 seconds on 2026-07-28. It was deployed as Vercel production deployment
`dpl_5axd38jBPnEpx1d2x5NTT1Q8pDSK` and promoted without rebuilding. Live verification:
`www.strivoai.net` serves `index-DXmerinn.js`; the Onboarding and Results chunks return 200 with
the terminal and bounded-timeout recovery markers; apex redirects 308 to `www`. Do not use
`scripts/deploy.ps1` for this frontend-only hotfix: that
script deploys Supabase functions, and the current `staging` snapshot contains intentionally red,
unfinished Phase 03 discovery tests. R1 production behavior and ledger verification are complete.

### Cell-by-cell expectations and observed evidence

Reference headroom is `(final cap - measured peak) / final cap`, computed from the locked Plan 02-09
pairs. For the two lower-bound Resume cells, the true peak is unknown, so the reference is an upper
bound rather than a promised margin.

| Cell | Final cap | Measured peak used for approval | Reference headroom | Observed out / cap | Observed headroom | First-attempt verdict |
| --- | ---: | ---: | ---: | --- | ---: | --- |
| Resume free `free-single` | 9,000 | 4,944 | 45.1% | 4,710 / 9,000 | 47.67% | **PASS** — attempt 1, `end_turn`, not truncated, 46,275 ms |
| Resume elite `criteria-1` | 6,000 | 4,312 | 28.1% | 3,994 / 6,000 | 33.43% | **PASS** — attempt 1, `end_turn`, not truncated, 42,013 ms |
| Resume elite `criteria-2` | 7,000 | 4,883 | 30.2% | 4,185 / 7,000 | 40.21% | **PASS** — attempt 1, `end_turn`, not truncated, 47,856 ms |
| Resume elite `summary` | 12,000 | >=10,000 lower bound | <=16.7%; true margin unknown | 4,538 / 12,000 | 62.18% | **PASS** — attempt 1, `end_turn`, not truncated, 51,274 ms |
| Resume elite `rewrites` | 4,000 | 2,705 | 32.4% | 2,279 / 4,000 | 43.03% | **PASS** — attempt 1, `end_turn`, not truncated, 23,642 ms |
| Resume elite `elite-extras` | 12,000 | >=9,000 lower bound | <=25.0%; true margin unknown | 8,296 / 12,000 | 30.87% | **PASS** — attempt 1, `end_turn`, not truncated, 80,135 ms |
| Career free `base` | 4,800 | 2,935 | 38.9% | 2,550 / 4,800 | 46.88% | **PASS** — attempt 1, `end_turn`, not truncated, 43,160 ms |
| Career elite `base` | 5,000 | 3,523 | 29.5% | 2,341 / 5,000 | 53.18% | **PASS** — attempt 1, `end_turn`, not truncated, 40,696 ms |
| Career elite `growth` | 4,000 | 2,798 | 30.1% | 2,553 / 4,000 | 36.18% | **PASS** — attempt 1, `end_turn`, not truncated, 41,839 ms |
| Career elite `elite-extras` | 2,000 | 983 | 50.9% | 1,004 / 2,000 | 49.80% | **PASS** — attempt 1, `end_turn`, not truncated, 22,400 ms |
| LinkedIn free `linkedin-grade` | 9,000 | 5,774 | 35.8% | 4,460 / 9,000 | 50.44% | **PASS** — attempt 1, `end_turn`, not truncated, 40,959 ms |
| LinkedIn elite `linkedin-grade` | 9,000 | 4,853 | 46.1% | 5,566 / 9,000 | 38.16% | **PASS** — attempt 1, `end_turn`, not truncated, 51,698 ms |
| Recruiting Lens elite `rl-call-1` | 12,000 | 10,955 | 8.7% | 5,267 / 12,000 | 56.11% | **PASS** — attempt 1, `end_turn`, not truncated, 53,889 ms |
| Recruiting Lens elite `rl-call-2` | 12,000 | 8,669 | 27.8% | 5,397 / 12,000 | 55.03% | **PASS** — attempt 1, `end_turn`, not truncated, 55,991 ms |
| Recruiting Lens elite `rl-call-3` | 12,000 | 8,280 | 31.0% | 10,909 / 12,000 | 9.09% | **FINDING** — attempt 1 and not truncated, but below the permanent 15% watch floor; 87,688 ms |

`rl-call-1` is intentionally visible as a pre-existing near-cap risk: its approved reference
headroom (8.7%) is already below the permanent 15% watch floor and its cap is at the 12,000 hard
clamp. Do not lower the watch threshold or relabel a similar post-deploy row merely to make the soak
green. It is a finding unless the new real-input row clears 15%.

### Query after each re-run

Replace the explicitly marked `<DEPLOY_STARTED_AT_UTC>` with the recorded deployment start
timestamp. Run immediately after each analysis and correlate by the new non-null `req_id`.

```sql
select created_at, req_id, feature, tier, call_name, attempt, model,
       input_tokens, cache_creation_input_tokens, cache_read_input_tokens,
       output_tokens, max_tokens, stop_reason, truncated, headroom_pct,
       duration_ms, http_status, ok
from public.ai_call_telemetry
where created_at >= timestamptz '<DEPLOY_STARTED_AT_UTC>' -- REQUIRED replacement
order by created_at desc, req_id, call_name, attempt;
```

### Hard re-run pass criteria

- Every new row must show the approved `max_tokens` value in the table above; otherwise the final
  bundle did not land.
- Every first-attempt successful row must have `output_tokens < max_tokens`.
- There must be zero `stop_reason = 'max_tokens'` rows and zero `truncated = true` rows.
- There must be zero HTTP `422 output_truncated` results.
- There must be no new `408`/abort outside the already recorded wall-clock findings. A new one is a
  failure/finding, not a token data point.
- Attempt-2 rows never substitute for a failing first attempt. Record them as self-heal evidence,
  but judge the first-attempt cell separately.
- A zero-row request is a cache hit and must be repeated with a different input.
- A row below 15% headroom is a near-cap finding even when `output_tokens < max_tokens`.

| Criterion | Result | Evidence |
| --- | --- | --- |
| Approved caps observed in production rows | **PASS** | R1b-R7 telemetry rows match every approved cap in the cell table |
| All first attempts below cap | **PASS** | Every observed attempt-1 row used fewer output tokens than its cap |
| Zero `max_tokens` stop reasons / truncations | **PASS** | All observed rows ended with `end_turn`; all `truncated=false` |
| Zero 422s | **PASS** | R1b-R7 returned successful user-visible results; no output-truncated response |
| No new 408/abort | **PASS** | No final rerun produced a 408 or abort |
| No unexplained near-cap row below 15% | **FAIL / FINDING** | R7 `rl-call-3`: 10,909 / 12,000, 9.09% headroom on a 3,715-character JD |

## 3. Real-traffic production soak

Soak window: **at least seven complete calendar days after the deploy/re-run subset passes**, and
until production has produced at least 20 successful first-attempt analysis calls with all four
features represented. If the coverage floor is not reached in seven days, extend the window; do not
declare a low-traffic empty window clean.

Record the exact window:

| Soak evidence | Value |
| --- | --- |
| Start (UTC; after R1-R7 pass) | pending |
| End (UTC) | pending |
| Complete days | pending |
| Successful first-attempt rows | pending |
| Features represented | pending |

The permanent watch is Block 4 of `supabase/queries/ai_call_telemetry_report.sql`. For this phase
closeout, use the same query with the exact soak start substituted so pre-deploy/TEMP-cap rows cannot
contaminate the verdict:

```sql
select created_at, req_id, feature, tier, call_name,
       output_tokens, max_tokens, headroom_pct, truncated,
       stop_reason, duration_ms
from public.ai_call_telemetry
where created_at >= timestamptz '<SOAK_STARTED_AT_UTC>' -- REQUIRED replacement
  and attempt = 1
  and ok
  and (
        truncated is true
     or headroom_pct < 15
      )
order by truncated desc, headroom_pct asc, created_at desc;
```

Run the explicit soak counts over the same window:

```sql
select
  count(*) filter (where attempt = 1 and ok) as successful_first_attempt_rows,
  count(*) filter (where truncated is true) as truncated_rows,
  count(*) filter (where http_status = 422) as http_422_rows,
  count(*) filter (
    where attempt = 1 and ok and headroom_pct < 15
  ) as near_cap_rows,
  count(distinct feature) filter (where attempt = 1 and ok) as features_represented
from public.ai_call_telemetry
where created_at >= timestamptz '<SOAK_STARTED_AT_UTC>'; -- REQUIRED replacement
```

A clean soak has zero truncated rows, zero 422 rows, and zero successful first-attempt rows below the
15% headroom floor. Any returned watch row is a finding and stays visible in the phase verdict.

| Soak criterion | Result | Evidence |
| --- | --- | --- |
| Coverage floor reached | pending | pending |
| Zero truncated rows | pending | pending |
| Zero HTTP 422 rows | pending | pending |
| Zero first-attempt rows below 15% headroom | pending | pending |

## 4. Residual findings

Task 4 is partial because the re-run gate did not release the soak:

- **Blocking output-budget finding:** R7 `rl-call-3` used 10,909 / 12,000 output tokens,
  leaving 9.09% headroom. It ended normally and the user received a durable result, but it violates
  the permanent 15% watch floor.
- **Stress-input gap:** the submitted R7 JD was 3,715 characters, not the planned dense near-6,000
  input. Since the shorter input already produced the blocking row, a denser rerun is not evidence
  that can make the current budget safe; it is likely to apply at least as much pressure.
- **Remediation constraint:** all three Recruiting Lens cells are already at the 12,000 hard clamp.
  The next correction must bound/reduce the `rl-call-3` output shape or otherwise reduce generation
  demand; raising the cap or lowering the watch threshold is not an available closeout.
- **Wall-clock observation:** `rl-call-3` was also the slowest R7 cell at 87,688 ms. It remained
  below the 165-second server deadline, so output headroom—not the current wall—is the blocking gate.
- The remaining planned residual audit—Group-B output-shape notes, input/cache/model cost levers,
  untuned Interview Prep telemetry, and non-automated alerting—remains due after the affected
  production rerun passes and the soak completes.

## 5. Phase-goal verdict

**Gaps found; soak blocked.** The final-cap bundles are live and R1b-R7 all delivered durable,
financially settled results on their first attempt. R7 nevertheless violates the permanent near-cap
criterion: `rl-call-3` produced 10,909 / 12,000 output tokens (9.09% headroom) on a 3,715-character
JD, already shorter than the planned near-6,000 stress input. The hard clamp prevents a simple cap
increase above 12,000, and the verification contract explicitly forbids lowering the 15% threshold
or relabeling the row to make the matrix green. TOK-08 remains incomplete and the seven-day
real-traffic soak must not start until this Recruiting Lens output-budget finding is remediated and
the affected production evidence is rerun.
