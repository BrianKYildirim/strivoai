# Phase 28 Wave 4 — Legacy Function Delete Evidence

> Captures D-12 preflight + per-env `supabase functions delete interview-prep-coach` + post-delete `functions list` raw outputs for SC #2.

---

## D-12: Pre-Delete Grep Preflight

**First-pass capture (2026-05-11, before orphan cleanup):**

```
$ git rev-parse HEAD
33ae58680d5675109edf10a2342f317503b7fbca

$ rg -n "interview-prep-coach" src/ supabase/
src/pages/InterviewPrepCoach.tsx:92:      'interview-prep-coach',
supabase/functions/interview-prep-coach/index.ts:20:  const log = createLogger('interview-prep-coach', reqId);
supabase/functions/interview-prep-coach/index.ts:37:        key: 'interview-prep-coach',
```

3 hits — would normally HALT Wave 4 per D-12 rationale ("live refs would mean code still calls the legacy function; deleting would break prod"). Analysis showed all 3 hits were **orphans**, not live wiring:

- `src/pages/InterviewPrepCoach.tsx` — imported by nothing; not routed in `App.tsx` (which routes `/interview-prep` to `<InterviewPrep />` or `<ComingSoon />`). Tree-shaken from production bundle.
- `supabase/functions/interview-prep-coach/{index,validation,validation.test}.ts` — function source already excluded from `scripts/deploy-{staging,production}.ps1` `$Functions` array since Phase 23 retire; never deployed from Wave 3's `main` HEAD.

### Resolution: orphan cleanup commit before delete

Removed all 4 orphan files via `git rm` and committed in `7c8edda`:

```
chore(phase-28-04): remove orphaned interview-prep-coach source (D-12 cleanup)
- src/pages/InterviewPrepCoach.tsx (495 lines)
- supabase/functions/interview-prep-coach/index.ts (223 lines)
- supabase/functions/interview-prep-coach/validation.ts (67 lines)
- supabase/functions/interview-prep-coach/validation.test.ts (99 lines)
Total: 884 deletions
```

Live-code reference audit: `rg "interview-prep-coach/validation"` returned 0 matches in `src/` or `supabase/` after the cleanup — only `.planning/` planning docs and `.claude/worktrees/` agent residue remained.

### Post-cleanup re-run (passes D-12)

```
$ rg -n "interview-prep-coach" src/ supabase/
(no matches found)
$ echo "rg exit: $?"
rg exit: 1
```

D-12 grep now cleanly returns zero matches in `src/` and `supabase/`. **D-12 preflight: ✅ PASS.**

Benign documentation references remaining: `.planning/` historical artifacts and `scripts/phase21-runbook.ps1` — all explicitly out of D-12's literal scope (`src/`, `supabase/`) per RESEARCH.md §"Live Reference Audit."

Safe to proceed with operator-led delete on staging then production.

---

## D-11+D-13: Staging Delete (interview-prep-coach)

**Outcome:** `interview-prep-coach` was already deleted from staging by the operator in a prior session, before Phase 28 Wave 4 began. SC #2 staging-side is satisfied (the SC asks that the env's functions list excludes `interview-prep-coach`, not that this session's delete CLI made it so).

### Pre-delete `supabase functions list` (2026-05-11)

```
$ supabase functions list --project-ref cimjltzovkahkqecpwgi
```

36 ACTIVE functions returned. `interview-prep-coach` is NOT in the list. The 36 break down as:

- 35 functions from `scripts/deploy-staging.ps1` `$Functions` array (all deployed via Wave 2 at `03811aa`, mostly UPDATED_AT 2026-05-06).
- 1 orphan: `recruiting-lens` (id `7bf238fb-a563-4c68-95b4-244f8ea4fb90`, UPDATED_AT `2026-04-23 20:40:35`) — not in the deploy script; out of Phase 28 scope; flagged as future cleanup candidate.

### Delete CLI attempt (idempotent re-run)

```
$ supabase functions delete interview-prep-coach --project-ref cimjltzovkahkqecpwgi
Function interview-prep-coach does not exist on the Supabase project: nothing to delete
Try rerunning the command with --debug to troubleshoot the error.

$ echo "Delete exit: $LASTEXITCODE"
Delete exit: 1
```

Exit 1 with the literal message `Function interview-prep-coach does not exist on the Supabase project: nothing to delete` is the Supabase CLI's idempotent-no-op response — semantically equivalent to "post-condition already satisfied." Per Pitfall 6 (RESEARCH.md), do NOT trust exit codes alone; rely on the `functions list` capture (above + below).

### Post-delete `supabase functions list` (re-capture to confirm no state change)

```
$ supabase functions list --project-ref cimjltzovkahkqecpwgi
```

36 ACTIVE functions, identical to pre-delete capture. `interview-prep-coach` count: 0.

`grep -c "interview-prep-coach"` against post-delete output: **0** ✅ (D-13 acceptance threshold met).

### Full staging functions list (post-delete attestation)

| # | NAME | VERSION | UPDATED_AT (UTC) |
|---|------|---------|---------------------|
| 1 | admin-delete-user            | 69  | 2026-05-06 02:32:29 |
| 2 | analyze-career               | 91  | 2026-05-06 02:32:42 |
| 3 | analyze-resume               | 101 | 2026-05-06 02:32:38 |
| 4 | analyze-skills-gap           | 71  | 2026-05-06 02:32:31 |
| 5 | chat-agent                   | 70  | 2026-05-06 02:32:25 |
| 6 | compare-jobs                 | 69  | 2026-05-06 02:32:55 |
| 7 | grade-linkedin               | 75  | 2026-05-06 02:32:57 |
| 8 | notify-admin-activity        | 68  | 2026-05-06 02:32:44 |
| 9 | notify-upgrade-approved      | 68  | 2026-05-06 02:32:49 |
| 10 | notify-upgrade-request      | 67  | 2026-05-06 02:32:51 |
| 11 | ocr-pdf                     | 69  | 2026-05-06 02:32:34 |
| 12 | paddle-webhook              | 68  | 2026-05-06 02:32:46 |
| 13 | process-scheduled-emails    | 68  | 2026-05-06 02:32:27 |
| 14 | send-credits-exhausted-email | 68 | 2026-05-06 02:32:53 |
| 15 | send-feature-email          | 68  | 2026-05-06 02:32:36 |
| 16 | send-notification-email     | 67  | 2026-05-06 02:32:59 |
| 17 | send-strivo-email           | 69  | 2026-05-06 02:32:40 |
| 18 | send-welcome-email          | 68  | 2026-05-06 02:33:00 |
| 19 | test-email                  | 68  | 2026-05-06 02:32:48 |
| 20 | submit-resume-analysis-job  | 77  | 2026-05-06 02:33:02 |
| 21 | get-analysis-job-status     | 74  | 2026-05-06 02:33:05 |
| 22 | process-resume-analysis-job | 74  | 2026-05-06 02:33:07 |
| 23 | keep-warm                   | 74  | 2026-05-06 02:33:12 |
| 24 | process-career-analysis-job | 70  | 2026-05-06 02:33:11 |
| 25 | submit-career-analysis-job  | 72  | 2026-05-06 02:33:09 |
| 26 | recruiting-lens ⚠ orphan    | 41  | 2026-04-23 20:40:35 |
| 27 | stripe-webhook              | 47  | 2026-05-06 02:33:20 |
| 28 | create-checkout-session     | 48  | 2026-05-06 02:33:15 |
| 29 | create-stripe-portal        | 46  | 2026-05-06 02:33:19 |
| 30 | check-merit-alerts          | 38  | 2026-05-06 02:33:27 |
| 31 | stripe-webhook-handler      | 37  | 2026-05-06 02:33:22 |
| 32 | admin-merit-metrics         | 36  | 2026-05-06 02:33:26 |
| 33 | reset-subscription-merits   | 36  | 2026-05-06 02:33:24 |
| 34 | interview-prep-evaluate     | 29  | 2026-05-06 02:33:32 |
| 35 | interview-prep-analyze      | 33  | 2026-05-06 02:33:30 |
| 36 | create-payment-intent       | 16  | 2026-05-06 02:33:17 |

Row absence verified: no row for `interview-prep-coach`. **SC #2 staging-side: ✅ satisfied.**

Future-cleanup flag: `recruiting-lens` is an orphan on staging (not in deploy script, last updated 2026-04-23). Out of Phase 28 scope; should be deleted in a separate cleanup wave alongside any analogous prod orphan (see prod check in next section).

---

## D-11+D-13: Production Delete (interview-prep-coach)

**Outcome: ✅ deleted in this session.** Unlike staging (which had been pre-cleaned), prod still had the legacy function active (version 6, last touched 2026-04-24 during Phase 23 era).

### Pre-delete `supabase functions list` (2026-05-11)

```
$ supabase functions list --project-ref zjpjapgraoxdukdvpjes
```

**38 ACTIVE functions returned, including `interview-prep-coach`:**

```
   a2a736cf-2c3f-4583-8d4b-2627c2a49723 | interview-prep-coach         | interview-prep-coach         | ACTIVE | 6  | 2026-04-24 01:28:47
```

`grep -c "interview-prep-coach"` against pre-delete output: **1** ✅ (meets Plan 28-04 acceptance "Pre-delete prod count ≥ 1 captured").

The 38 break down as:
- 35 functions from `scripts/deploy-production.ps1` `$Functions` array (deployed via Wave 3 from `33ae586`, UPDATED_AT 2026-05-11 11:07-11:08).
- 1 legacy: `interview-prep-coach` (the Wave 4 target).
- 2 prod-side orphans (flagged for future cleanup, out of Phase 28 scope):
  - `recruiting-lens` (id `8817de30-...`, version 9, UPDATED_AT `2026-04-29 05:36:40`).
  - `analyze-career-v2` (id `44060bf3-...`, version 6, UPDATED_AT `2026-03-04 05:58:53`).

### Delete CLI

```
$ supabase functions delete interview-prep-coach --project-ref zjpjapgraoxdukdvpjes
Deleted Function interview-prep-coach from project zjpjapgraoxdukdvpjes.

$ echo "Delete exit: $LASTEXITCODE"
Delete exit: 0
```

CLI success literal `Deleted Function interview-prep-coach from project zjpjapgraoxdukdvpjes.` + exit 0 ✅.

### Post-delete `supabase functions list`

```
$ supabase functions list --project-ref zjpjapgraoxdukdvpjes
```

**37 ACTIVE functions returned** (1 fewer than pre-delete). Row for `interview-prep-coach` is gone.

`grep -c "interview-prep-coach"` against post-delete output: **0** ✅ (D-13 acceptance threshold met).

### Full production functions list (post-delete attestation)

| # | NAME | VERSION | UPDATED_AT (UTC) |
|---|------|---------|---------------------|
| 1 | chat-agent                   | 50 | 2026-05-11 11:07:25 |
| 2 | process-scheduled-emails     | 50 | 2026-05-11 11:07:28 |
| 3 | admin-delete-user            | 51 | 2026-05-11 11:07:30 |
| 4 | analyze-skills-gap           | 52 | 2026-05-11 11:07:32 |
| 5 | ocr-pdf                      | 52 | 2026-05-11 11:07:36 |
| 6 | send-feature-email           | 49 | 2026-05-11 11:07:39 |
| 7 | analyze-resume               | 89 | 2026-05-11 11:07:42 |
| 8 | send-strivo-email            | 50 | 2026-05-11 11:07:44 |
| 9 | analyze-career               | 95 | 2026-05-11 11:07:47 |
| 10 | notify-admin-activity       | 50 | 2026-05-11 11:07:50 |
| 11 | paddle-webhook              | 50 | 2026-05-11 11:07:52 |
| 12 | test-email                  | 51 | 2026-05-11 11:07:55 |
| 13 | notify-upgrade-approved     | 51 | 2026-05-11 11:07:57 |
| 14 | notify-upgrade-request      | 52 | 2026-05-11 11:07:59 |
| 15 | send-credits-exhausted-email | 50 | 2026-05-11 11:08:01 |
| 16 | compare-jobs                | 52 | 2026-05-11 11:08:04 |
| 17 | grade-linkedin              | 55 | 2026-05-11 11:08:08 |
| 18 | send-notification-email     | 50 | 2026-05-11 11:08:10 |
| 19 | send-welcome-email          | 52 | 2026-05-11 11:08:11 |
| 20 | submit-resume-analysis-job  | 45 | 2026-05-11 11:08:13 |
| 21 | get-analysis-job-status     | 47 | 2026-05-11 11:08:14 |
| 22 | process-resume-analysis-job | 46 | 2026-05-11 11:08:16 |
| 23 | submit-career-analysis-job  | 42 | 2026-05-11 11:08:18 |
| 24 | process-career-analysis-job | 43 | 2026-05-11 11:08:19 |
| 25 | analyze-career-v2 ⚠ orphan  | 6  | 2026-03-04 05:58:53 |
| 26 | keep-warm                   | 27 | 2026-05-11 11:08:21 |
| 27 | recruiting-lens ⚠ orphan    | 9  | 2026-04-29 05:36:40 |
| 28 | stripe-webhook              | 18 | 2026-05-11 11:08:27 |
| 29 | create-checkout-session     | 15 | 2026-05-11 11:08:23 |
| 30 | create-stripe-portal        | 17 | 2026-05-11 11:08:26 |
| 31 | create-payment-intent       | 14 | 2026-05-11 11:08:25 |
| 32 | stripe-webhook-handler      | 14 | 2026-05-11 11:08:30 |
| 33 | reset-subscription-merits   | 14 | 2026-05-11 11:08:31 |
| 34 | admin-merit-metrics         | 14 | 2026-05-11 11:08:32 |
| 35 | check-merit-alerts          | 13 | 2026-05-11 11:08:34 |
| 36 | interview-prep-evaluate     | 9  | 2026-05-11 11:08:39 |
| 37 | interview-prep-analyze      | 9  | 2026-05-11 11:08:36 |

Row absence verified: no row for `interview-prep-coach`. **SC #2 prod-side: ✅ satisfied.**

Future-cleanup flag (carries from staging analysis): both envs have `recruiting-lens` orphan; prod additionally has `analyze-career-v2`. Out of Phase 28 scope; recommend a follow-on cleanup phase or `gsd-add-todo` capture.

---

## Wave 4 Closing Status

| Gate | Status |
|------|:--:|
| D-12 pre-delete grep preflight (after orphan cleanup commit `7c8edda`) | ✅ |
| Staging delete (idempotent — already gone) | ✅ |
| Prod delete (succeeded; exit 0) | ✅ |
| SC #2 staging-side (`functions list` excludes `interview-prep-coach`) | ✅ |
| SC #2 prod-side (`functions list` excludes `interview-prep-coach`) | ✅ |
| **Wave 5 promotion gate (VERIFICATION.md assembly)** | **✅ GO** |

**Out-of-scope discoveries for follow-on cleanup phase:**

| Env | Orphan | Last touched |
|-----|--------|--------------|
| staging | `recruiting-lens` | 2026-04-23 |
| prod | `recruiting-lens` | 2026-04-29 |
| prod | `analyze-career-v2` | 2026-03-04 |
