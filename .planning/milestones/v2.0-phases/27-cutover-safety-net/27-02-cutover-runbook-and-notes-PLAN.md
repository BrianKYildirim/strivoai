---
phase: 27-cutover-safety-net
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/phase21-runbook.ps1
  - .planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md
autonomous: true
requirements: []
gap_closure: true
must_haves:
  truths:
    - "Operator running `Stage-D1-Preflip` is forced to type the literal phrase `STRIPE URL VERIFIED` (case-sensitive) immediately after the cutover log skeleton is created and before any read-only production state inspection or checklist confirm in D1; mistyped phrase aborts the runbook with exit 1."
    - "Operator running `Stage-D2-Flip` is forced to type the literal phrase `ACK INTERVIEW PREP ROLLBACK BRICKS 503` BEFORE the existing red FLIP PROD banner is displayed; ack appears as a separate ceremony from the FLIP PROD authorization."
    - "Operator running `Stage-D4-Finalize` with a HOLD outcome is forced to type the literal phrase `ACK INTERVIEW PREP COACH DELETE` before the git-add evidence commit; the ROLLBACK branch is NOT prompted (early exit at the existing rollback path)."
    - "Each of the three new prompts emits a `Write-Note` line pointing at a specific section of `21-CUTOVER-NOTES.md` so the operator can read the background mid-runbook."
    - "Each of the three new prompts appends a stable-heading evidence block to `21-CUTOVER-LOG.md` via the existing `Append-Evidence` helper, capturing operator + timestamp + ack phrase typed."
    - "`21-CUTOVER-NOTES.md` exists in `.planning/phases/27-cutover-safety-net/` with H1 title and four H2 concern sections (Legacy Webhook Risk, Interview Prep Rollback Caveat, Stripe URL Pin, Phase 25 Dependency)."
    - "The notes file cross-references `21-CUTOVER-LOG.md`, `v2.0-MILESTONE-AUDIT.md`, `phase21-runbook.ps1`, the shim source, and the active handler source per D-16."
    - "No existing helper, gate function, or unrelated stage logic in `phase21-runbook.ps1` is modified — the three insertions are additive only."
  artifacts:
    - path: "scripts/phase21-runbook.ps1"
      provides: "Three new Confirm-Or-Exit + Append-Evidence ceremonies in Stage-D1-Preflip / Stage-D2-Flip / Stage-D4-Finalize"
    - path: ".planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md"
      provides: "Hand-authored operator-facing memo summarizing the four safety-net concerns"
      contains: "Phase 21 Cutover Notes"
      min_lines: 40
  key_links:
    - from: "scripts/phase21-runbook.ps1 Stage-D1-Preflip"
      to: ".planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md"
      via: "Write-Note pointer + Confirm-Or-Exit STRIPE URL VERIFIED"
      pattern: "STRIPE URL VERIFIED"
    - from: "scripts/phase21-runbook.ps1 Stage-D2-Flip"
      to: ".planning/phases/21-integration-validation-and-cutover/21-CUTOVER-LOG.md"
      via: "Append-Evidence ## Rollback Caveat Ack block"
      pattern: "ACK INTERVIEW PREP ROLLBACK BRICKS 503"
    - from: "scripts/phase21-runbook.ps1 Stage-D4-Finalize HOLD branch"
      to: ".planning/phases/21-integration-validation-and-cutover/21-CUTOVER-LOG.md"
      via: "Append-Evidence ## Phase 25 Coordination Ack block"
      pattern: "ACK INTERVIEW PREP COACH DELETE"
---

<objective>
Add three additive operator-typed acknowledgment ceremonies to `scripts/phase21-runbook.ps1` (Gate D1 Stripe-URL pin, Gate D2 rollback caveat, Gate D4 Phase-25 coordination reminder) and hand-author the operator-facing memo `21-CUTOVER-NOTES.md` in the Phase 27 directory. Closes Phase 27 SC-2, SC-3, SC-4, and SC-5.

Purpose: Close the operator-surprise gaps from `.planning/v2.0-MILESTONE-AUDIT.md` (concerns #1, #2, and the Operational rollback caveat) BEFORE the Phase 21-07 production cutover runs. Each prompt forces a typed-phrase, case-sensitive acknowledgment via the existing `Confirm-Or-Exit` helper, mirrors the `FLIP PROD` precedent, and produces a permanent audit-trail line in `21-CUTOVER-LOG.md` via `Append-Evidence`. The notes file is the linked-from-runbook documentation glue that explains the why.

Output:
- 3 new prompt blocks added to `phase21-runbook.ps1` (one per stage) — each ~12 lines: `Write-Step`, `Write-Note` pointer, optional `Write-Warn2` context, `Confirm-Or-Exit`, here-string `$stamp`, `Append-Evidence`.
- 1 new file `21-CUTOVER-NOTES.md` (~50-70 lines) with H1 + four H2 concern sections + cross-reference block.
</objective>

<execution_context>
@C:/Projects/strive-ai-hired/.claude/get-shit-done/workflows/execute-plan.md
@C:/Projects/strive-ai-hired/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@C:/Projects/strive-ai-hired/CLAUDE.md
@.planning/phases/27-cutover-safety-net/27-CONTEXT.md
@.planning/phases/27-cutover-safety-net/27-RESEARCH.md
@.planning/ROADMAP.md
@.planning/v2.0-MILESTONE-AUDIT.md
@scripts/phase21-runbook.ps1

<interfaces>
<!-- Verified PowerShell helper signatures from scripts/phase21-runbook.ps1. -->
<!-- Reuse exactly — do NOT introduce new helpers. -->

```powershell
# Line 90 — section banner
function Write-Step($msg) { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }

# Line 95 — dim gray side note (used for Write-Note pointers to 21-CUTOVER-NOTES.md per D-11)
function Write-Note($msg) { Write-Host "    $msg" -ForegroundColor DarkGray }

# Line 99 — green success
function Write-Ok($msg) { Write-Host "    [ok] $msg" -ForegroundColor Green }

# Line 103 — yellow caution (use for the D2 rollback-caveat warning lines)
function Write-Warn2($msg) { Write-Host "    [warn] $msg" -ForegroundColor Yellow }

# Line 107 — typed-phrase ack, case-sensitive, exits 1 on mismatch
function Confirm-Or-Exit($prompt, $expected = "y") {
  $reply = Read-Host "    $prompt [type '$expected' to continue, anything else aborts]"
  if ($reply -ne $expected) { Write-Host "    Aborted by operator." -ForegroundColor Yellow; exit 1 }
}

# Line 127 — UTC ISO-8601 Zulu timestamp
function Iso-Now() { return (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ") }

# Line 131 — append a here-string section to a file, creating parent dir if missing
function Append-Evidence($path, $section) { ... ; Add-Content -Path $path -Value $section -Encoding UTF8 }
```

`$cutoverLog` is defined at top-of-script (around line 84) as the path to `21-CUTOVER-LOG.md`.

`Ensure-Cutover-Log` (line 456-485) creates `21-CUTOVER-LOG.md` on demand from a skeleton; called by `Stage-D1-Preflip` at line 489. By the time D1's URL-pin ack runs (proposed: just AFTER `Ensure-Cutover-Log`), the file exists.

Stage entry-point line numbers (verified — RESEARCH §Code-Context Finding #2):
- `Stage-D1-Preflip` — line 487. `Ensure-Cutover-Log` call line 489. Existing checklist `Confirm-Or-Exit` line 514.
- `Stage-D2-Flip` — line 519. Red FLIP PROD banner block lines 526-534. FLIP PROD `Confirm-Or-Exit` line 535.
- `Stage-D4-Finalize` — line 725. Outcome `Read-Host` line 729. ROLLBACK early-exit lines 746-750. Commit block from line 752.

Phase 23 503 path (verified literal — RESEARCH §Code-Context Finding #8): `interview-prep-analyze/index.ts:303-312` returns `{ error: 'merit_system_required', message: ... }` with status 503 when `MERIT_SYSTEM_ENABLED` is false. So the D2 ack phrase referencing "503" is verifiable, not aspirational.

`config.toml:93` — `[functions.stripe-webhook]` has only `verify_jwt = false`. NOT modified by this plan.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Insert D1 Stripe-URL-pin ack in Stage-D1-Preflip (SC-2)</name>
  <read_first>
    - scripts/phase21-runbook.ps1 lines 487-517 (Stage-D1-Preflip body)
    - scripts/phase21-runbook.ps1 lines 456-485 (Ensure-Cutover-Log creates the file the ack writes to)
    - scripts/phase21-runbook.ps1 lines 90-135 (helper signatures: Write-Step, Write-Note, Confirm-Or-Exit, Iso-Now, Append-Evidence)
    - .planning/phases/27-cutover-safety-net/27-CONTEXT.md (D-08, D-11, D-12)
    - .planning/phases/27-cutover-safety-net/27-RESEARCH.md (Recommendation #3 placement; placement: between `Ensure-Cutover-Log` call and the existing `Write-Step "Verifying production prerequisites (read-only)"`)
  </read_first>
  <action>
    Insert the new ack block in `Stage-D1-Preflip` IMMEDIATELY AFTER the `Ensure-Cutover-Log` call (currently at line 489) and BEFORE the existing `Write-Step "Verifying production prerequisites (read-only)"` (currently at line 491). This places the URL pin as the FIRST operator-facing prompt of the cutover — wrong URL means the entire cutover is unsafe regardless of any read-only state inspection.

    The current scaffolding:
    ```powershell
    function Stage-D1-Preflip() {
      Write-Step "Gate D1 -- Plan 21-07 Task 1: production pre-flip checklist"
      Ensure-Cutover-Log

      Write-Step "Verifying production prerequisites (read-only)"   # line 491 — KEEP
      ...
    }
    ```

    Insert this block between `Ensure-Cutover-Log` and `Write-Step "Verifying production prerequisites (read-only)"`:

    ```powershell
      # ── Phase 27 SC-2: Stripe webhook URL pin ───────────────────────────────
      Write-Step "Stripe webhook URL pin (Phase 27 SC-2)"
      Write-Note "Background: see .planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md (Stripe URL Pin)"
      Confirm-Or-Exit "Confirm Stripe production webhook URL ends in /functions/v1/stripe-webhook-handler" "STRIPE URL VERIFIED"
      $stamp = @"

    ---
    ## Stripe URL Pin Ack @ $(Iso-Now)

    Operator typed: STRIPE URL VERIFIED
    "@
      Append-Evidence $cutoverLog $stamp
    ```

    Notes:
    - The phrase MUST be exactly `STRIPE URL VERIFIED` (matches D-08 / RESEARCH Recommendation #3). Case-sensitive — `Confirm-Or-Exit` does `-ne` comparison (line 109).
    - The `$stamp` variable name is reused locally inside the function and shadows nothing — `Stage-D1-Preflip` already declares `$stamp` later (line 499). The scoping is fine because each `$stamp =` reassigns; PowerShell function-scoped variables.
    - DO NOT modify any line in `Stage-D1-Preflip` outside this insertion. Existing `Show-MeritFlagState`, `Invoke-MeritFlagRollback -WhatIf`, the existing `$stamp` block (line 499-510), and the existing checklist `Confirm-Or-Exit` (line 514) all remain untouched and run AFTER the new URL-pin ack.

    Use a focused edit (PowerShell here-string in the file is unchanged elsewhere). The block adds approximately 11 new lines.
  </action>
  <verify>
    <automated>powershell -NoProfile -Command "& { Set-Location 'C:\Projects\strive-ai-hired'; & .\scripts\phase21-runbook.ps1 -Stage list }" && grep -c "STRIPE URL VERIFIED" scripts/phase21-runbook.ps1 | grep -q "^2$" && grep -c "Stripe webhook URL pin (Phase 27 SC-2)" scripts/phase21-runbook.ps1 | grep -q "^1$" && echo "ok"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "STRIPE URL VERIFIED" scripts/phase21-runbook.ps1` returns exactly 2 (the prompt string and the evidence stamp).
    - `grep -c "Stripe URL Pin Ack" scripts/phase21-runbook.ps1` returns exactly 1.
    - `grep -n "Stripe webhook URL pin (Phase 27 SC-2)" scripts/phase21-runbook.ps1` shows the line number is between the `Ensure-Cutover-Log` call and the `Write-Step "Verifying production prerequisites (read-only)"` line.
    - Running `.\scripts\phase21-runbook.ps1 -Stage list` (the read-only stage list, no prompts) exits 0 — confirms PowerShell parsing didn't break.
    - The new block uses `Confirm-Or-Exit`, `Write-Step`, `Write-Note`, `Iso-Now`, and `Append-Evidence` — no new helpers introduced (grep confirms zero new `function ` definitions).
  </acceptance_criteria>
  <done>D1 Stripe-URL-pin ack inserted; runbook still parses; phrase is exactly `STRIPE URL VERIFIED`.</done>
</task>

<task type="auto">
  <name>Task 2: Insert D2 rollback-caveat ack in Stage-D2-Flip (SC-3)</name>
  <read_first>
    - scripts/phase21-runbook.ps1 lines 519-545 (Stage-D2-Flip up to and including the FLIP PROD confirm)
    - .planning/phases/27-cutover-safety-net/27-CONTEXT.md (D-09, D-11, D-12)
    - .planning/phases/27-cutover-safety-net/27-RESEARCH.md (Recommendation #4 placement; locked phrase `ACK INTERVIEW PREP ROLLBACK BRICKS 503`)
    - supabase/functions/interview-prep-analyze/index.ts (lines 295-312 — the literal `merit_system_required` 503 response that the phrase references; READ for context only — NOT modified)
  </read_first>
  <action>
    Insert the new ack block in `Stage-D2-Flip` BETWEEN line 525 (`Write-Host ""`) and line 526 (the start of the red FLIP PROD banner: `Write-Host "  +================...` in red). The caveat fires as a separate ceremony BEFORE the visual flip authorization.

    Current scaffolding:
    ```powershell
    function Stage-D2-Flip() {
      Write-Step "Gate D2 -- Plan 21-07 Task 2: PRODUCTION FLIP"
      if (-not (Test-Path $cutoverLog)) { Write-Error "Missing $cutoverLog -- Gate D1 must run first."; exit 1 }

      Write-Host ""                             # line 525 — KEEP

      Write-Host "  +==================...     # line 526 — KEEP (red banner top)
      ... red banner block ...
      Write-Host "  +==================...     # line 534 — KEEP (red banner bottom)
      Confirm-Or-Exit "Type 'FLIP PROD' to authorize" "FLIP PROD"   # line 535 — KEEP
      ...
    }
    ```

    Insert this block between line 525 and line 526:

    ```powershell
      # ── Phase 27 SC-3: Interview Prep rollback caveat ack ───────────────────
      Write-Step "Rollback caveat acknowledgment (Phase 27 SC-3)"
      Write-Note "Background: see .planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md (Interview Prep Rollback Caveat)"
      Write-Warn2 "Invoke-MeritFlagRollback will return 503 merit_system_required from interview-prep-analyze"
      Write-Warn2 "until a hotfix lands. Phase 23 was rebuilt as merit-only by intent."
      Confirm-Or-Exit "Type 'ACK INTERVIEW PREP ROLLBACK BRICKS 503' to acknowledge" "ACK INTERVIEW PREP ROLLBACK BRICKS 503"
      $stamp = @"

    ---
    ## Rollback Caveat Ack @ $(Iso-Now)

    Operator typed: ACK INTERVIEW PREP ROLLBACK BRICKS 503
    "@
      Append-Evidence $cutoverLog $stamp

    ```

    Notes:
    - The phrase is exactly `ACK INTERVIEW PREP ROLLBACK BRICKS 503` (RESEARCH Recommendation #1: locked because the 503 reference is verified literal at `interview-prep-analyze/index.ts:303-312`, not aspirational).
    - The `Write-Warn2` lines name the active production handler (`interview-prep-analyze`) and the literal HTTP code (`503`) and the literal error string (`merit_system_required`) so the operator reading the prompt understands the exact failure mode being acknowledged.
    - The new `$stamp` variable LOCAL to this function position; the existing `$stamp` (line 561+) reassigns later for the flip transcript and is unaffected.
    - DO NOT inline the caveat INSIDE the red banner. Two distinct decisions = two distinct prompts (D-09). Operator first acks the rollback caveat (calmly), THEN sees the red FLIP PROD banner (high-ceremony).
    - DO NOT modify the red banner block, the FLIP PROD confirm, or any of the post-flip transcript logic.

    Approximately 14 new lines.
  </action>
  <verify>
    <automated>powershell -NoProfile -Command "& { Set-Location 'C:\Projects\strive-ai-hired'; & .\scripts\phase21-runbook.ps1 -Stage list }" && grep -c "ACK INTERVIEW PREP ROLLBACK BRICKS 503" scripts/phase21-runbook.ps1 | grep -q "^2$" && grep -c "Rollback Caveat Ack" scripts/phase21-runbook.ps1 | grep -q "^1$" && echo "ok"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "ACK INTERVIEW PREP ROLLBACK BRICKS 503" scripts/phase21-runbook.ps1` returns exactly 2 (the line containing both prompt text + expected-phrase argument collapses into one line, plus the evidence stamp line — `grep -c` counts LINES not occurrences).
    - `grep -c "Rollback Caveat Ack @" scripts/phase21-runbook.ps1` returns exactly 1.
    - `grep -n "Rollback caveat acknowledgment (Phase 27 SC-3)" scripts/phase21-runbook.ps1` returns a line number that is BEFORE the line containing `PRODUCTION FLIP CONFIRMATION` (i.e., the new ack precedes the red banner).
    - The existing `Confirm-Or-Exit "Type 'FLIP PROD' to authorize" "FLIP PROD"` line is still present and unmodified (`grep -c "FLIP PROD" scripts/phase21-runbook.ps1` returns the same count as before — the FLIP PROD confirm line + the red banner inner copy).
    - Running `.\scripts\phase21-runbook.ps1 -Stage list` exits 0.
  </acceptance_criteria>
  <done>D2 rollback-caveat ack inserted; phrase exactly matches; positioned BEFORE the red banner; existing FLIP PROD ceremony untouched.</done>
</task>

<task type="auto">
  <name>Task 3: Insert D4 Phase-25 coordination ack in Stage-D4-Finalize HOLD branch (SC-4)</name>
  <read_first>
    - scripts/phase21-runbook.ps1 lines 725-771 (Stage-D4-Finalize body)
    - .planning/phases/27-cutover-safety-net/27-CONTEXT.md (D-10, D-11, D-12)
    - .planning/phases/27-cutover-safety-net/27-RESEARCH.md (Recommendation #2 phrase, Recommendation #5 placement)
    - .planning/ROADMAP.md §"Phase 25" SC-9 (the overlapping `interview-prep-coach delete` step)
  </read_first>
  <action>
    Insert the new ack block AFTER the ROLLBACK early-exit (currently lines 746-750) and BEFORE the existing `Write-Step "Committing evidence files via D-22 exception (git add -f)"` (currently line 752). This ensures the ack ONLY fires on HOLD outcomes — RESEARCH Recommendation #5: rollback emergencies don't need the cleanup reminder; the planted seed (D-19) and Phase 25 SC-9 cover the rollback case durably.

    Current scaffolding:
    ```powershell
    function Stage-D4-Finalize() {
      ...
      Append-Evidence $sc5Evidence $stamp                          # line 744

      if ($reply -eq "ROLLBACK") {                                  # line 746
        Write-Warn2 "ROLLBACK outcome recorded. Skipping the D-22 commit."
        Write-Note "File a Phase 21.1 gap-closure plan and leave production MERIT_SYSTEM_ENABLED=false."
        exit 0                                                      # line 749
      }                                                             # line 750

      Write-Step "Committing evidence files via D-22 exception (git add -f)"   # line 752 — KEEP
      ...
    }
    ```

    Insert this block between line 750 (the closing `}` of the ROLLBACK if-branch) and line 752 (`Write-Step "Committing evidence files..."`):

    ```powershell
      # ── Phase 27 SC-4: Phase 25 coordination -- interview-prep-coach delete ──
      Write-Step "Phase 25 coordination -- interview-prep-coach delete (Phase 27 SC-4)"
      Write-Note "Background: see .planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md (Phase 25 Dependency)"
      Write-Note "Staging: supabase functions delete interview-prep-coach --project-ref $STAGING_REF"
      Write-Note "Prod:    supabase functions delete interview-prep-coach --project-ref $PROD_REF"
      Confirm-Or-Exit "Confirm interview-prep-coach was deleted (STAGING + PROD) or Phase 25 SC-9 will run it" "ACK INTERVIEW PREP COACH DELETE"
      $stamp = @"

    ---
    ## Phase 25 Coordination Ack @ $(Iso-Now)

    Operator typed: ACK INTERVIEW PREP COACH DELETE
    "@
      Append-Evidence $cutoverLog $stamp

    ```

    Notes:
    - Phrase exactly `ACK INTERVIEW PREP COACH DELETE` (RESEARCH Recommendation #2). Names `interview-prep-coach` explicitly to distinguish from the active `interview-prep-analyze` handler — operator must NEVER delete the latter.
    - The two `Write-Note` lines listing both project refs use the existing `$STAGING_REF` and `$PROD_REF` constants (defined around lines 79-80 of the runbook). RESEARCH §R6 specifically calls this out — making both refs explicit removes ambiguity for the operator.
    - The block writes its evidence to `$cutoverLog` (`21-CUTOVER-LOG.md`), not `$sc5Evidence` — D-12 specifies `21-CUTOVER-LOG.md` for all three new acks for unified audit trail.
    - The block is INSIDE `Stage-D4-Finalize` but AFTER the ROLLBACK early-exit, so a ROLLBACK outcome has already called `exit 0` before reaching this block. Verified by reading lines 746-750.
    - DO NOT modify the existing `$reply`-branching, the `$summary` capture, the `Append-Evidence $sc5Evidence` block, the ROLLBACK early-exit, or the git-add-f commit block.

    Approximately 13 new lines.
  </action>
  <verify>
    <automated>powershell -NoProfile -Command "& { Set-Location 'C:\Projects\strive-ai-hired'; & .\scripts\phase21-runbook.ps1 -Stage list }" && grep -c "ACK INTERVIEW PREP COACH DELETE" scripts/phase21-runbook.ps1 | grep -q "^2$" && grep -c "Phase 25 Coordination Ack" scripts/phase21-runbook.ps1 | grep -q "^1$" && echo "ok"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "ACK INTERVIEW PREP COACH DELETE" scripts/phase21-runbook.ps1` returns exactly 2 (the line containing both prompt text + expected-phrase argument collapses into one line, plus the evidence stamp line — `grep -c` counts LINES not occurrences).
    - `grep -c "Phase 25 Coordination Ack @" scripts/phase21-runbook.ps1` returns exactly 1.
    - `grep -n "Phase 25 coordination" scripts/phase21-runbook.ps1` returns a line number AFTER the ROLLBACK early-exit `exit 0` (line ~749) and BEFORE `Committing evidence files via D-22` (line ~752 + offset).
    - `grep -c "interview-prep-coach" scripts/phase21-runbook.ps1` returns at least 3 (prompt text + 2 Write-Note hint lines for staging/prod commands).
    - The phrase MUST NOT mention `interview-prep-analyze` (the active handler) — `grep -c "interview-prep-analyze" scripts/phase21-runbook.ps1` should be unchanged from baseline (0 in the runbook before this plan; D2's caveat in Task 2 references it inside the Write-Warn2 lines but Task 3 should NOT).
    - Running `.\scripts\phase21-runbook.ps1 -Stage list` exits 0.
  </acceptance_criteria>
  <done>D4 Phase-25 coordination ack inserted in HOLD branch only; phrase exactly matches; both project refs surfaced via Write-Note; rollback path preserved.</done>
</task>

<task type="auto">
  <name>Task 4: Hand-author 21-CUTOVER-NOTES.md (SC-5)</name>
  <read_first>
    - .planning/phases/27-cutover-safety-net/27-CONTEXT.md (D-13, D-14, D-15, D-16 — location, structure, source, cross-refs)
    - .planning/phases/27-cutover-safety-net/27-RESEARCH.md (Recommendation #6 — H1 + four H2 hierarchy; suggested skeleton)
    - .planning/v2.0-MILESTONE-AUDIT.md §"Top cross-phase concerns" (concerns #1, #2) and §"Operational rollback caveat (Concern G)"
    - .planning/ROADMAP.md §"Phase 25: ux-gap-closure-and-phase-23-cleanup" SC-9 (the overlap acknowledged in section 4 of the notes)
    - supabase/functions/interview-prep-analyze/index.ts (lines 295-312) — for accurate description of the 503 path
  </read_first>
  <action>
    Create the file `.planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md` with the structure below. H1 + four H2 sections. Hand-authored prose — NOT a template; this is operator-facing documentation that ships with Phase 27 PR and is never mutated by code.

    Use this exact skeleton (sections 1-4 are mandatory; cross-reference block in the blockquote at top is mandatory; expand each section's prose to ~5-10 substantive lines so the file totals roughly 50-70 lines):

    ```markdown
    # Phase 21 Cutover Notes — Operator Safety Net

    > Closes audit concerns #1, #2, and §"Operational rollback caveat (Concern G)"
    > from `.planning/v2.0-MILESTONE-AUDIT.md`. Authored as part of Phase 27.
    >
    > Cross-references:
    > - Canonical evidence: `.planning/phases/21-integration-validation-and-cutover/21-CUTOVER-LOG.md`
    > - Audit findings: `.planning/v2.0-MILESTONE-AUDIT.md` §"Top cross-phase concerns" (#1, #2) and §"Operational rollback caveat (Concern G)"
    > - Operator runbook: `scripts/phase21-runbook.ps1` (Stages D1-Preflip, D2-Flip, D4-Finalize)
    > - 410-Gone shim source: `supabase/functions/stripe-webhook/index.ts`
    > - Active handler source: `supabase/functions/stripe-webhook-handler/index.ts`

    ## 1. Legacy Webhook Risk

    The Stripe production dashboard's webhook endpoint URL is the single config that
    decides whether merit grants and tier syncs land. Two `stripe-webhook` deployments
    coexist in `supabase/functions/`: the active handler at `stripe-webhook-handler/`
    and the legacy directory at `stripe-webhook/`. Phase 27 SC-1 replaces the legacy
    `index.ts` with a 410-Gone shim that emits a `legacy_endpoint_hit` warn log per
    misrouted request. If `legacy_endpoint_hit` fires post-cutover: (a) check the
    Stripe dashboard immediately and update the URL to end in
    `/functions/v1/stripe-webhook-handler`; (b) every misroute the dashboard delivered
    while the URL was wrong returned HTTP 410 — Stripe will retry per its own delivery
    policy, so the merit grants land once the URL is corrected; (c) capture the
    timestamps of the warn lines in the next phase retrospective.

    ## 2. Interview Prep Rollback Caveat

    Phase 23 rebuilt `interview-prep-analyze` as merit-only by design. The function
    contains a defensive guard at `supabase/functions/interview-prep-analyze/index.ts`
    lines 295-312: when `MERIT_SYSTEM_ENABLED` is false (or unset), the handler
    returns HTTP 503 with body `{ error: 'merit_system_required', message: ... }`.
    Calling `Invoke-MeritFlagRollback` therefore intentionally bricks
    `interview-prep-analyze` until a hotfix lands. The Gate D2 ack
    (`ACK INTERVIEW PREP ROLLBACK BRICKS 503`) acknowledges this trade-off BEFORE
    the operator types `FLIP PROD`, so the rollback path's behavior is not a
    surprise during an emergency. If a rollback IS triggered post-flip, the
    operator should immediately raise a Phase 21.1 gap-closure plan to either
    short-term re-enable merit on `interview-prep-analyze` or restore a
    legacy-credit fallback.

    ## 3. Stripe URL Pin

    The production Stripe dashboard webhook endpoint URL MUST end in
    `/functions/v1/stripe-webhook-handler` — not `/functions/v1/stripe-webhook`.
    Gate D1 enforces this with a typed `STRIPE URL VERIFIED` ack at the top of
    `Stage-D1-Preflip` (immediately after `Ensure-Cutover-Log` creates the
    evidence file, before any read-only state inspection runs against
    production). If the URL is wrong: DO NOT FLIP. Update the Stripe dashboard
    endpoint, wait 30 seconds for the dashboard to settle, then restart Gate D1
    from the top. The 410 shim makes the wrong-URL condition observable both at
    the Stripe delivery dashboard (HTTP 410 in the response code column) and in
    Supabase logs (`legacy_endpoint_hit` warn).

    ## 4. Phase 25 Dependency

    The legacy `interview-prep-coach` Supabase function is stale and should be
    deleted from BOTH staging (project ref `cimjltzovkahkqecpwgi`) and production
    (project ref `zjpjapgraoxdukdvpjes`) once Phase 23's `interview-prep-analyze`
    overhaul is live. Roadmap §Phase 25 SC-9 owns the deletion. Phase 27 SC-4
    adds a runbook reminder at Gate D4-Finalize (HOLD outcome only — rollback
    paths skip the reminder per design) so whichever phase ships first deploys
    the operator forcing-function. The Gate D4 ack
    (`ACK INTERVIEW PREP COACH DELETE`) accepts overlap with Phase 25 SC-9: the
    operator may type the ack having already run the delete, OR confirm Phase 25
    will run it. CRITICAL: do NOT delete `interview-prep-analyze` (the active
    handler) — only `interview-prep-coach`.
    ```

    Tighten or extend the prose in each section as needed to land the document at roughly 50-70 lines while keeping every fact verifiable against the source files cross-referenced in the header. Do not introduce facts that are not already established in `27-CONTEXT.md`, `27-RESEARCH.md`, `v2.0-MILESTONE-AUDIT.md`, or the live source files (`interview-prep-analyze/index.ts`, the runbook stages, the shim).

    Reminder per CLAUDE.md: this file lives under `.planning/` which is gitignored. Phase 27 inherits the Phase 21 D-22 `git add -f` exception for committing this evidence-glue artifact in the Phase 27 PR. Do NOT silently `git add` it — the operator commits with `git add -f` per the same precedent. The plan does NOT include a commit task; the operator committing the file is part of the Phase 27 PR review.
  </action>
  <verify>
    <automated>test -f .planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md && grep -c "^# " .planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md | grep -q "^1$" && grep -c "^## " .planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md | grep -q "^4$" && grep -q "Legacy Webhook Risk" .planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md && grep -q "Interview Prep Rollback Caveat" .planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md && grep -q "Stripe URL Pin" .planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md && grep -q "Phase 25 Dependency" .planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md && ! grep -qE "^```(sh|ps|powershell|bash)" .planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md && echo "ok"</automated>
  </verify>
  <acceptance_criteria>
    - File exists at `.planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md`.
    - Exactly one H1 line (`^# `) — the title `Phase 21 Cutover Notes — Operator Safety Net`.
    - Exactly four H2 lines (`^## `): `1. Legacy Webhook Risk`, `2. Interview Prep Rollback Caveat`, `3. Stripe URL Pin`, `4. Phase 25 Dependency`.
    - Header blockquote includes ALL FIVE cross-reference paths from D-16: `21-CUTOVER-LOG.md`, `v2.0-MILESTONE-AUDIT.md`, `phase21-runbook.ps1`, `stripe-webhook/index.ts`, `stripe-webhook-handler/index.ts`.
    - Section 2 references the literal `merit_system_required` error string and HTTP 503.
    - Section 3 references both the correct path (`/functions/v1/stripe-webhook-handler`) and the wrong path (`/functions/v1/stripe-webhook`).
    - Section 4 names BOTH `interview-prep-coach` (the function being deleted) AND `interview-prep-analyze` (the function being preserved), with explicit "do NOT delete" guidance.
    - File total length is between 40 and 80 lines (target ~50-70 per D-14 "five to ten lines each" allowing for prose expansion).
    - No code fences referencing executable shell or PS — this is a memo, not a runbook.
    - File is NOT committed by this plan; it is hand-authored and the operator commits via `git add -f` in the Phase 27 PR.
  </acceptance_criteria>
  <done>21-CUTOVER-NOTES.md authored with H1 + four H2 sections + cross-reference block; every claim is verifiable against the cross-referenced sources.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Operator → runbook (interactive PowerShell) | Typed-phrase acks must match exactly (case-sensitive); mismatches abort the cutover |
| Runbook → `21-CUTOVER-LOG.md` | Append-only audit trail, no read-back / decision logic depends on its content |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-27-06 | Tampering | operator types lowercase or near-miss phrase to "skip" the ack | mitigate | All three new prompts use `Confirm-Or-Exit` with case-sensitive `-ne` comparison (line 109). Mismatch prints "Aborted by operator" and `exit 1` mid-cutover. Operator must re-run the gate with the exact phrase. |
| T-27-07 | Repudiation | operator skips reading the caveat and types ack reflexively | accept | The `Write-Warn2` lines and `Write-Note` pointers print BEFORE the `Confirm-Or-Exit`. Each ack lands a permanent line in `21-CUTOVER-LOG.md` with timestamp. The runbook cannot enforce comprehension — the audit trail is the forcing function for post-incident review. |
| T-27-08 | Information Disclosure | the typed phrase contains sensitive data | accept | Phrases are public English words. No secrets, project refs (which are written by `Write-Note` from already-defined `$STAGING_REF`/`$PROD_REF` constants — already in the runbook), or PII enter the typed input. `21-CUTOVER-LOG.md` is committed via the Phase 21 D-22 git-add-f exception with the rest of the cutover evidence; access controls match. |
| T-27-09 | Denial of Service | operator runs `Stage-D2-Flip` directly without `Stage-D1-Preflip` to skip the URL-pin ack | accept | Pre-existing guard at `Stage-D2-Flip:521-524` checks `Test-Path $cutoverLog` and exits 1 if absent. `Ensure-Cutover-Log` (called only from `Stage-D1-Preflip`) creates the file. So D1 must run before D2 — pre-existing behavior, not a new attack surface. |
| T-27-10 | Elevation of Privilege | added prompts touch new auth surfaces | accept | Zero new auth surfaces. All three acks use existing helpers (`Confirm-Or-Exit`, `Write-Note`, `Append-Evidence`) and existing paths (`$cutoverLog`, `$STAGING_REF`, `$PROD_REF`). No new env vars, no new CLI flags, no new file paths outside `21-CUTOVER-NOTES.md`. |
</threat_model>

<verification>
- `.\scripts\phase21-runbook.ps1 -Stage list` exits 0 (PowerShell parses without syntax error after all three insertions).
- Grep counts in each task's acceptance_criteria all return the documented values.
- All three new ack ceremonies share a uniform structure: `Write-Step` banner → `Write-Note` pointer to notes file → optional `Write-Warn2` context → `Confirm-Or-Exit` → here-string `$stamp` → `Append-Evidence $cutoverLog $stamp`.
- `21-CUTOVER-NOTES.md` exists in the phase 27 directory, has H1 + four H2 sections, and cross-references all five paths from D-16.
- No existing helper, gate function, or unrelated stage logic in `phase21-runbook.ps1` is modified — additions only.
- Manual smoke (RESEARCH §Validation Architecture): operator runs `.\scripts\phase21-runbook.ps1 -Stage D1-Preflip -DryRun` and confirms the URL-pin prompt appears as the first interactive ceremony; runs `-Stage D2-Flip -DryRun` and confirms the rollback caveat appears BEFORE the red FLIP PROD banner; cannot DryRun D4 (outcome is a Read-Host) but can read the source diff and trace the HOLD branch path.
</verification>

<success_criteria>
- SC-2 closed: D1 cannot proceed past `Ensure-Cutover-Log` without typed `STRIPE URL VERIFIED` ack; ack landed as `## Stripe URL Pin Ack` block in `21-CUTOVER-LOG.md`.
- SC-3 closed: D2 cannot reach the red FLIP PROD banner without typed `ACK INTERVIEW PREP ROLLBACK BRICKS 503`; ack landed as `## Rollback Caveat Ack` block.
- SC-4 closed: D4 HOLD outcome cannot reach the git-add-f commit without typed `ACK INTERVIEW PREP COACH DELETE`; ack landed as `## Phase 25 Coordination Ack` block; ROLLBACK outcomes skip the prompt as designed.
- SC-5 closed: `21-CUTOVER-NOTES.md` exists with H1 + four H2 sections covering legacy webhook risk, IP rollback caveat, Stripe URL pin, and Phase 25 dependency, with full cross-reference header.
- The runbook file remains parseable; existing checklist confirm, FLIP PROD ceremony, ROLLBACK early-exit, and git-add-f commit block are all unmodified.
</success_criteria>

<output>
After completion, create `.planning/phases/27-cutover-safety-net/27-02-cutover-runbook-and-notes-SUMMARY.md` documenting:
- Three insertion points and exact line ranges in the modified runbook (post-edit).
- The three locked ack phrases (verbatim).
- Confirmation that `Stage-D4-Finalize` ROLLBACK branch was preserved (still exits 0 before the new ack).
- `21-CUTOVER-NOTES.md` final line count and section list.
- Reminder that operator commits the notes file via `git add -f` per Phase 21 D-22 precedent.
</output>
