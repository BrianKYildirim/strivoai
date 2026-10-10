---
slug: career-compass-flag-split-95-hang
status: resolved
trigger: "Career Compass flag-ON path on preview hangs at 95% forever; submit-career and analyze-career disagree on the lifecycle flag at runtime, producing a run-identity split."
created: 2026-07-07
updated: 2026-07-07
phase: "06"
environment: preview (cimjltzovkahkqecpwgi)
---

# Debug: Career Compass 95% hang — lifecycle flag split / run-identity mismatch

## Symptoms

- **Expected:** flag-ON Career Compass submit progresses to 100% and renders results; ONE analysis_jobs row per submit (feature=career_compass, keyed).
- **Actual:** spinner freezes at 95% indefinitely (observed 45+ min); the analysis DOES complete (visible in History). No new analysis_jobs row on repeat submits.
- **Errors:** none surfaced to user; earlier get-analysis-run-status 500 (archive_path) FIXED separately (commit b96fb11f); now all pollers return 200.
- **Timeline:** appeared during Phase-6 06-03 live-smoke on preview once the lifecycle flags were flipped ON.
- **Repro:** on preview with ANALYSIS_LIFECYCLE_ENABLED=true + ANALYSIS_LIFECYCLE_CAREER_COMPASS=true, run a Career Compass analysis; observe 95% hang.

## Root Cause (HIGH confidence, from live DB inspection)

`submit-career-analysis-job` and `analyze-career` disagree on the lifecycle flag at runtime:
- submit-career runs the **LEGACY insert path** (flag reads OFF in its isolate) → inserts a keyless legacy-shaped row (feature=NULL, state=NULL, status=processing, idempotency_key=NULL, max_attempts=8) and returns its id as jobId.
- analyze-career runs the **LIFECYCLE path** (flag reads ON in its isolate) → calls create_or_recover_analysis_run. That RPC recovers only `WHERE idempotency_key=p_key AND state NOT IN (completed,failed,refunded)`. The keyless legacy row cannot match → a NEW lifecycle row is minted (feature=career_compass, keyed, max_attempts=4) and COMPLETED. submit's returned jobId is left stuck at status=processing forever → 95% hang.

**Evidence (preview analysis_jobs, user 2ce242ad-9cbb-474c-aa2b-11e8b6fee4e5, this morning):**
- 4ba3de08 — created 08:36:04 — feature=NULL, state=NULL, status=processing, key=NULL, max_attempts=8 (LEGACY shape; the zombie the frontend polls)
- b08d5c24 — created 08:36:06 — feature=career_compass, state=completed, key=c43c…, max_attempts=4 (LIFECYCLE shape; the row that actually completed)

## Two fix targets

1. **ZOMBIE (symptom):** 4ba3de08 stuck at status=processing poisons every later submit — submit-career's LEGACY path has an "existing pending job" dedup (`jobId: existingJob.id`, ~lines 264/372 of submit-career-analysis-job/index.ts) that keeps returning the zombie, so no fresh run is created. Mark the zombie terminal on preview (operator/read-write) to unblock.
2. **FLAG SPLIT (root cause):** submit-career STILL takes the legacy path after a same-session redeploy, even though both flags are confirmed = true. Leading hypothesis: `_shared/analysis-flags.ts` reads env at MODULE LOAD into top-level consts (ANALYSIS_LIFECYCLE_ENABLED line ~53 + FEATURE_ENABLED map ~57-61; readBoolFlag ~49; isAnalysisFeatureEnabled ~78) → a warm isolate that booted before the flags were set returns stale false; submit and analyze-career have independent isolates that can disagree. **Recommended fix:** refactor analysis-flags.ts to read env at REQUEST time (mirror _shared/cors.ts's re-parse-on-change memoization), then redeploy all lifecycle functions. **VERIFY first** — e.g. add a boot/flag log to submit-career, or confirm whether the redeploy's isolate actually reads true.

## Related (separate, lower priority)

- Issue C: useAnalysisRun.fetchStatus (src/hooks/useAnalysisRun.ts ~277-290) ignores a 404/null (`if(!data)return`) → unknown/stale run_id never goes terminal → isActive stays true → button lock + endless poll. A 404 must resolve the run to idle/cleared.
- Issue D (FIXED): get-analysis-run-status phantom archive_path 500 — commit b96fb11f, deployed preview v9 only, NOT prod.
- Issue G: deploy.ps1 -Env staging blocked by a failing Stripe E2E (verify:baseline red, unrelated to Phase 6).

## Environment / commands

- Preview project cimjltzovkahkqecpwgi (linked). Deploy: `npx supabase functions deploy <fn> --project-ref cimjltzovkahkqecpwgi`.
- Prod zjpjapgraoxdukdvpjes (Claude read-only; operator applies prod changes).
- Career functions: submit-career-analysis-job, process-career-analysis-job, analyze-career.
- Frontend: src/pages/CareerCompass.tsx (submit handler ~507-830; in-page poll loop line 727+ polls get-analysis-job-status).
- Full context: .planning/phases/06-feature-migration-c-career-compass/06-HANDOFF-live-smoke-blockers.md
- Phase 6 executed but BLOCKED at 06-03 operator live-smoke checkpoint; this bug must be fixed before Phase 6 can be verified.

## Current Focus

- status: verifying — THREE root causes now fixed + offline-verified. Core flow CONFIRMED WORKING end-to-end on preview (operator: clean keyed run d122b82b created->completed, merit_settled, no keyless sibling) after the real Bug-1 gate (MERIT_SYSTEM_ENABLED) was set true. Bug 3 (hang-on-4xx) fix committed (96356a3f), needs a preview edge redeploy + a bad-input re-test.
- next_action: operator redeploys process-career-analysis-job (+ optionally the flag-layer bundle siblings) to preview, then submits a BAD-INPUT career analysis (e.g. missing LinkedIn URL) to confirm it now FAILS FAST (run -> failed + refund) instead of hanging at 95%. On pass, archive session to .planning/debug/resolved/.

## Evidence

- timestamp 2026-07-07: preview analysis_jobs shows the two-row split (4ba3de08 legacy processing + b08d5c24 lifecycle completed) from a single submit; create_or_recover_analysis_run definition confirmed to recover only keyed non-terminal rows.
- timestamp 2026-07-07: fresh submits create NO new row; edge logs show continuous get-analysis-job-status + get-analysis-run-status 200s, no submit-career/analyze-career POST in window → frontend re-polling the zombie via submit's legacy existing-job dedup.
- timestamp 2026-07-07: operator confirmed ANALYSIS_LIFECYCLE_ENABLED + ANALYSIS_LIFECYCLE_CAREER_COMPASS both = true in preview edge secrets.
- timestamp 2026-07-07 CODE VERIFICATION of root cause:
  - analysis-flags.ts reads env at MODULE LOAD into top-level consts: `ANALYSIS_LIFECYCLE_ENABLED` (line 53) and the `FEATURE_ENABLED` map (lines 65-71), both via `readBoolFlag` (line 48). `isAnalysisFeatureEnabled` (line 78) returns those cached snapshots — NO request-time read. A warm isolate booted before the flags were set is frozen at `false` for its whole life.
  - submit-career-analysis-job/index.ts: imports `isAnalysisFeatureEnabled` (line 7); lifecycle branch gated at line 131 `if (isAnalysisFeatureEnabled('career_compass'))` inside the MERIT_SYSTEM_ENABLED block (line 122). When the snapshot is stale-false it falls through to the LEGACY insert path with the existing-pending-job dedup returning the zombie jobId (lines 360-380, and a parallel merit-path dedup at 262-272).
  - analyze-career/index.ts: imports `isAnalysisFeatureEnabled` (line 24); lifecycle branch gated at line 1870 `if (isAnalysisFeatureEnabled('career_compass') && authenticatedUserId)`. A fresher isolate reads true → runs lifecycle → create_or_recover_analysis_run mints a keyed row. Confirmed the two functions can disagree because each has an independent isolate with an independent module-load snapshot.
  - Contrast: _shared/cors.ts::allowedOrigins (lines 41-53) reads env at REQUEST time with re-parse-on-change memoization — the correct pattern to mirror.
  - Existing tests: _shared/analysis-flags.test.ts + analysis-lifecycle.dormancy.test.ts use cache-busting `import('./analysis-flags.ts?case=N')` and set env BEFORE import, so request-time reads keep them green (they also still assert the exported `ANALYSIS_LIFECYCLE_ENABLED` const default-derives false).

## Resolution

TWO independent bugs on the flag-ON path. BOTH now fixed in code + offline-verified.

### Bug 1 — FLAG SPLIT (backend, root cause of the two-row split)
- root_cause: `isAnalysisFeatureEnabled` gated on module-load env snapshots. A warm isolate booted before the flags were set stayed frozen at `false`; submit-career (stale-false → legacy keyless insert) and analyze-career (fresh-true → keyed lifecycle run) disagreed on the same flag, splitting one submit into two rows → the legacy row the frontend polls never completes.
- fix (committed 2e5609c8): analysis-flags.ts `isAnalysisFeatureEnabled` now reads env at REQUEST time (mirrors _shared/cors.ts::allowedOrigins). Flag-OFF byte-identical (still exact literal 'true'). `ANALYSIS_LIFECYCLE_ENABLED` const retained only as back-compat export + dormancy static guard.
- verification (offline): `npm run test:edge` → 1115 passed | 0 failed | 12 ignored.
- files_changed: [supabase/functions/_shared/analysis-flags.ts]
- STATUS: committed + 6 preview fns redeployed by operator; zombie 4ba3de08 marked failed on preview. BUT re-test STILL hung → surfaced Bug 2 as the now-primary blocker.

### Bug 2 — ISSUE C (frontend, now-primary cause of the 95% hang)
- root_cause (confirmed in code + live logs): useAnalysisRun recovers a persisted run_id from `?run_id=` (persistRunId writes URL + localStorage at ~line 197-200, so clearing localStorage alone does not clear it). The recovered run_id pointed at legacy row 4ba3de08, whose lifecycle `state` column is NULL. get-analysis-run-status projects `state` (not `status`) → returns a 200 with state:null. `isStopState(null)===false` (line 143) + `coerceState(null)===null` → isTerminal FALSE forever → `isActive = enabled && runId!==null && !isTerminal` TRUE forever → CareerCompass.handleAnalyze early-returns at line 528 (`if (lifecycleOn && (isLocked || analysisRun.isActive)) return;`) → the submit click is swallowed, NO submit-career POST fires (confirmed: live logs show only get-analysis-*-status 200s, DB shows no new row), endless poll, spinner stuck at the 95% animation ceiling.
- fix (committed 9d246f35): fetchStatus now resolves a tracked run terminal + clears it (run_id released from state + URL + localStorage via clearTracking) when the status endpoint reports it non-recoverable:
  - authoritative 404 (FILE_NOT_FOUND envelope) → clear on first signal;
  - 200 with a genuine run_id but null/absent lifecycle state (legacy/non-lifecycle row) → clear immediately;
  - bare transient empty (null data WITH an error: timeout/network) → clear only after MAX_EMPTY_POLLS=3 consecutive (a single blip cannot nuke a live run);
  - benign empty (null data, no error) → inert (prior `if(!data)return` guard preserved).
- dormancy preserved: hook still early-returns inert when the VITE flag is off.
- verification (offline): `npm run test` → 513 passed (84 files); `npm run test:edge` → 1115 passed | 0 failed | 12 ignored. 4 new unit tests: 404→cleared, state:null→cleared, transient-streak (no clear on one blip, clear after 3), benign-empty inert.
- files_changed: [src/hooks/useAnalysisRun.ts, src/hooks/__tests__/useAnalysisRun.test.ts]

### Bug 1b — THE ACTUAL FLAG GATE (backend, found by operator)
- The run-identity split's true cause was a THIRD gate: submit-career/index.ts line 122 `if (MERIT_SYSTEM_ENABLED && authenticatedUserCtxCareer)`. `MERIT_SYSTEM_ENABLED` was UNSET (false) on BOTH preview and prod edge secrets, so submit never entered the lifecycle branch (took legacy). Operator set it true in both + redeployed. submit now takes the lifecycle path; a clean keyed run (d122b82b) went created->completed, merit_settled=true, no keyless sibling. CONFIRMED WORKING. (Bug 1's request-time-read fix 2e5609c8 remains correct + necessary for warm-isolate consistency.)

### Bug 3 — HANG-ON-4xx (backend, D-04 robustness gap)
- root_cause (verified in code + live DB): submit-career pre-creates the lifecycle run via create_or_recover_analysis_run (state='created'); the worker invokes analyze-career. analyze-career's input-validation 400s (index.ts ~1373-1400: resumeFilePath + acceptedLinkedinPdfContent + linkedinUrl each `return new Response(...,{status:400})`) are EARLY RETURNS BEFORE the `if (isAnalysisFeatureEnabled('career_compass') && authenticatedUserId)` executor block at line 1870 — so runAnalysisLifecycle never runs its CAS transitions. Under Pattern 2 (06-02) the worker DEFERS status/refund writes to the executor (`if (!deferToExecutor)` gates every raw write) — but the executor never ran, so nobody terminalizes. The keyed run is orphaned at 'created' with a live reservation; the frontend polls forever (95% hang). Live: rows 704067b6 + 1872f368 sat at 'created' 5-12 min; state_updated_at only moved on the operator's manual SQL fail.
- reaper analysis: reap-stale-analysis-runs DOES cover created->failed @60s, and create_or_recover DOES set state_updated_at=now() on insert (migration line 252), so the reaper's filter would have matched. It is a CORRECT backstop but minutes-latency (60s budget + cron interval; and per MEMORY preview cron/internal-secret has had wiring issues) — NOT the deterministic fast-fail the flow needs. Fix makes failure instant + deterministic; the reaper remains the safety net.
- fix (committed 96356a3f): new shared helper _shared/terminalize-stuck-run.ts. On a PERMANENT worker-observed failure while deferring, the career worker (process-career-analysis-job) now drives the run to 'failed' via the transition_analysis_run CAS + releases the reservation EXACTLY ONCE (refund-before-fail, idempotent). Guarded no-op when the executor already resolved the run (terminal / retryable_failed off-ramp) or on a legacy state:null row — preserves the two-writer contract + flag-OFF byte-identical dormancy. Money rule honored: non-2xx ⟹ durable save did not complete ⟹ refund is pre-save-safe. No new migration (reuses transition_analysis_run + refund_merits).
- sibling audit: gap is CAREER-SPECIFIC. Only the career worker has the deferToExecutor pattern; submit-resume-analysis-job does not pre-create a lifecycle run; resume/linkedin/recruiting/onboarding create the run INSIDE the executor (a pre-lifecycle 4xx creates no run to orphan). Fix is a SHARED helper for any future submit-precreate feature.
- verification (offline): `npm run test:edge` → 1122 passed | 0 failed | 12 ignored (+7 new). No frontend touched → `npm run test` not required.
- files_changed: [supabase/functions/_shared/terminalize-stuck-run.ts, supabase/functions/_shared/terminalize-stuck-run.test.ts, supabase/functions/process-career-analysis-job/index.ts, supabase/functions/analyze-career/__tests__/worker-two-writer.test.ts, supabase/functions/deno.json]

### REMAINING (operator-gated — see CHECKPOINT)
- Bug 2 is a FRONTEND fix: it reaches the preview site via a Vercel REBUILD of the branch the preview deployment tracks (commit 9d246f35 on `staging`), NOT via `supabase functions deploy`. Operator must confirm the preview Vercel deployment rebuilds from a branch containing 9d246f35.
- Immediate manual unblock (workaround, not the fix): navigate to a clean `/career-compass` URL with `?run_id=` stripped.
- Live re-test one flag-ON Career Compass submit → confirm single keyed row + spinner reaches 100%.

## Eliminated

- hypothesis: flags are OFF on preview — ELIMINATED (operator confirmed both = true).
- hypothesis: get-analysis-run-status 500 is the cause — ELIMINATED (that was the archive_path bug, fixed in b96fb11f; pollers now 200).

## RESOLUTION (2026-07-07 — verified green on preview)

Root causes, in the order they were peeled back, all confirmed via live preview DB
inspection (user 2ce242ad-9cbb-474c-aa2b-11e8b6fee4e5):

1. **get-analysis-run-status 500 (phantom archive_path)** — fixed b96fb11f (preview v9).
2. **Flag split / module-load snapshot** — `_shared/analysis-flags.ts` now reads env at
   REQUEST time (2e5609c8), so submit-career and analyze-career agree per request.
3. **MERIT_SYSTEM_ENABLED unset** — the line-122 gate in submit-career wraps the ENTIRE
   lifecycle block; with MERIT off, submit forced the legacy keyless-insert path.
   Operator set MERIT_SYSTEM_ENABLED=true on BOTH preview and prod. This was the last
   piece of the run-identity split — after it, run d122b82b completed cleanly (single
   keyed row, merit_settled=true, no keyless sibling).
4. **Issue C (stale run_id wedge)** — useAnalysisRun now terminalizes+clears a dead/404
   run (9d246f35).
5. **Hang-on-4xx (worker robustness)** — terminalize-stuck-run.ts (96356a3f): a
   pre-lifecycle 4xx from analyze-career now CAS-terminalizes the run to failed+refunds
   in ~1.3s. VERIFIED in DB: missing-URL submits 2f8cdc7d / ac0cccee / f9162d10 went
   failed+refunded, failure_code=INPUT_MISSING, failure_stage=worker_terminal_4xx.

### Operator product change + final frontend gap (this session)
6. **LinkedIn URL made OPTIONAL** (31e53711, analyze-career) — the missing-URL 400 was a
   product-validation choice the operator reversed: the URL should never have been
   required. Removed both hard-fails (withMerits direct path + runCareerLegacyCore
   closure). Resume + LinkedIn PDF content remain required; URL is optional (never
   scraped when a PDF is present — scrapeLinkedInProfile is dead code — only a cache-key
   hash input). Deployed to preview via CLI. **Test A (resume+PDF, no URL) → GREEN.**
7. **95%-hang-on-genuine-failure** (2ee765b1, CareerCompass.tsx) — the in-page poll
   loop's skip guard `if (!statusData || statusData.error) continue` swallowed
   `status:'failed'` responses (get-analysis-job-status returns a terminal failure WITH
   an `error` payload) BEFORE the status==='failed' handler ran; under the lifecycleOn
   unbounded loop this hung at 95% with no toast. Now skips only on a real transport
   miss (`!statusData.status && statusData.error`). A terminal failure surfaces a toast +
   unlocks the button. **VERIFIED green on preview** (resume-only forced-failure case).

### Deploy status at resolution
- Preview edge: analyze-career, submit-career-analysis-job, process-career-analysis-job,
  get-analysis-run-status, _shared/analysis-flags.ts — all deployed to cimjltzovkahkqecpwgi.
- Preview frontend: 2ee765b1 (+ 9d246f35) reach preview via PR #559 (staging→preview)
  Vercel rebuild.
- PROD: NOT yet rolled out. Runbook pending (edge redeploys + staging→main frontend PR +
  confirm prod flags + read-only merit sanity check).

### Known residual (by design, flagged to operator)
- LinkedIn PDF content is STILL required backend-side; resume-only now fails GRACEFULLY
  (toast, no hang) rather than being allowed. Fully-optional LinkedIn (resume-only
  analysis) is a larger, separate change (prompt + cache path assume LinkedIn signal).
