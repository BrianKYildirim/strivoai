# Phase 27: cutover-safety-net - Research

**Researched:** 2026-04-28
**Domain:** Operator-runbook safety net + legacy-webhook deprecation shim
**Confidence:** HIGH (all locked decisions verified against live code; only minor adjustments to "Claude's Discretion" items)

## Summary

Phase 27 closes two cutover-critical concerns from `v2.0-MILESTONE-AUDIT.md` (concerns #1, #2, and §"Operational rollback caveat") before the operator runs Phase 21-07 production cutover. The implementation is small (one ~30-line shim, one new test file, three runbook prompt insertions, one hand-written notes file) and surgical — Phase 27 does NOT modify any code that handles real Stripe traffic, never touches `stripe-webhook-handler/`, never modifies deploy scripts, and never modifies `config.toml`.

This research **verifies all 20 locked decisions in 27-CONTEXT.md against the live codebase** and surfaces the exact line numbers, helper signatures, and file shapes the planner needs to write task actions without ambiguity. Two minor "Claude's Discretion" gaps are answered with concrete recommendations below.

**Primary recommendation:** Hold the two-plan structure suggested in D-20. Plan 1 = `stripe-webhook/` directory mutation (shim + test + deletions + DEPLOY_RUNBOOK.md rewrite + `run-edge-tests.ps1` registration update). Plan 2 = `phase21-runbook.ps1` D1/D2/D4 prompt insertions + `21-CUTOVER-NOTES.md`.

## User Constraints (from CONTEXT.md)

### Locked Decisions

#### 410-Gone Shim (SC-1)
- **D-01:** Blanket-reject. Shim does NOT read `STRIPE_WEBHOOK_SECRET`, does NOT verify signatures. Any POST returns 410.
- **D-02:** Logging only — no `stripe_webhook_events` insert. Single `log.warn('legacy_endpoint_hit', { req_id, ua, sig_present })`. Zero service-client dependency.
- **D-03:** `req_id` is `crypto.randomUUID()`, included in BOTH the warn log AND the 410 JSON body. Body shape: `{ "error": "endpoint_deprecated", "use": "/functions/v1/stripe-webhook-handler", "req_id": "<uuid>" }`.
- **D-04:** OPTIONS → `handleOptionsRequest({ type: 'webhook' })`. Non-POST → 405 `{ error: 'method_not_allowed' }`. POST → 410.
- **D-05:** Deno unit test only. ~30 lines. Asserts (a) POST→410, (b) body has `error`/`use`/`req_id`, (c) `log.warn` called with `legacy_endpoint_hit` + `req_id`, (d) OPTIONS→200 (or whatever `handleOptionsRequest` returns), (e) GET→405. No probe extension.
- **D-06:** Delete `index.test.ts`, `price-resolver.ts`, `price-resolver.test.ts`. Verify no cross-imports first; `_shared/test-helpers/stripe-fixtures.ts` and `stripe-signature.ts` are still used by `stripe-webhook-handler/` so leave them.
- **D-07:** No `supabase/config.toml` changes. Existing function blocks already serve the new body. Webhook JWT-disable already correct.

#### Runbook Updates (SC-2/3/4)
- **D-08:** D1 Stripe URL pin = `Confirm-Or-Exit "Type 'STRIPE URL VERIFIED' to confirm the production webhook endpoint URL ends in /functions/v1/stripe-webhook-handler" "STRIPE URL VERIFIED"`. Inserted in `Stage-D1-Preflip` BEFORE the existing checklist `Confirm-Or-Exit`.
- **D-09:** D2 rollback caveat = separate `Confirm-Or-Exit` typed-phrase prompt placed BEFORE the existing red `FLIP PROD` banner. Single typed ack.
- **D-10:** D4-Finalize delete reminder = `Confirm-Or-Exit` ack ("run-or-deferred-OK"). Operator may type ack without actually running the delete IF Phase 25 SC-9 covers it.
- **D-11:** Each new prompt prints a `Write-Note` pointer to the relevant section of `21-CUTOVER-NOTES.md`.
- **D-12:** All three new prompts append a single line to `21-CUTOVER-LOG.md` via the existing `Append-Evidence` helper.

#### 21-CUTOVER-NOTES.md (SC-5)
- **D-13:** Location: `.planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md` — NOT planning root, NOT phase 21 dir.
- **D-14:** Structure: per-concern markdown memo, four short sections (~5-10 lines each): legacy-webhook risk, IPC rollback caveat, Stripe URL pin, Phase 25 dependency.
- **D-15:** Hand-written, ships in Phase 27 PR, never mutated by runbook. Documentation glue, not evidence.
- **D-16:** Header cross-references with full relative paths (canonical evidence file, milestone audit, runbook, shim source, active handler source).

#### Deploy + Deprecation Surface
- **D-17:** No changes to `scripts/deploy-staging.ps1` or `scripts/deploy-production.ps1`. Both already include `stripe-webhook` at line 31.
- **D-18:** Replace `supabase/functions/stripe-webhook/DEPLOY_RUNBOOK.md` with ~10-line deprecation notice.
- **D-19:** Plant follow-up seed via `/gsd-plant-seed` for full deletion of the legacy directory + deploy entries (trigger: 30 consecutive days of zero `legacy_endpoint_hit`). Not a plan task.

#### Plan Structure
- **D-20:** Two-plan split (1 = shim source replacement, 2 = runbook + notes).

### Claude's Discretion
- Exact phrase wording for D2's typed ack.
- Exact phrase wording for D4's delete-reminder ack.
- Where in `Stage-D1-Preflip` the URL-pin prompt slots.
- Whether D2 caveat ack lives inside `Stage-D2-Flip` or as a new helper function.
- Whether `21-CUTOVER-NOTES.md` uses H1+H2 or H2+H3 heading hierarchy.
- Whether to add a one-line summary of the safety-net to `21-CUTOVER-LOG.md` template.

### Deferred Ideas (OUT OF SCOPE)
- Full deletion of legacy `stripe-webhook/` directory + deploy-script entries (planted seed).
- `stripe_webhook_events` audit query for legacy hits.
- Two-phrase ACCEPT / ROLL FORWARD ack for D2.
- Auto-detect-and-skip for D4 delete reminder.
- `sc5-probe.ps1` extension to verify the 410 shim.
- `# DEPRECATED` comment marker in deploy-{staging,production}.ps1.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| (none new) | Closes integration-check concerns #1 + #2 + Concern G from `.planning/v2.0-MILESTONE-AUDIT.md` | Audit lines 401-413 verified verbatim — all three are real, current, and not yet closed by another phase |

---

## Locked-Decision Validation Matrix

Every decision in 27-CONTEXT.md was verified against live code. Where adjustment is needed, the row says so explicitly.

| # | Decision | Status | Evidence / Reason |
|---|----------|--------|-------------------|
| D-01 | Blanket-reject (no signature verify) | **Verified** | Confirmed against `stripe-webhook-handler/index.ts:43-51` HANDLED_EVENTS — handler has 7 event types now and shim should not duplicate that surface. Blanket-reject is correct. |
| D-02 | Log-only, no DB insert | **Verified** | `stripe_webhook_events` is keyed on `event_id` (real Stripe events). Inserting misroute rows would pollute idempotency dedupe. Pure shim has zero service-client cost. |
| D-03 | `req_id` via `crypto.randomUUID()` in log + body | **Verified** | Deno built-in. No import. Shim body shape matches SC-1 with the additive `req_id` field. |
| D-04 | OPTIONS → `handleOptionsRequest({type:'webhook'})`; non-POST → 405 | **Verified** | `_shared/cors.ts:62-68` — `handleOptionsRequest` for `type:'webhook'` returns `new Response(null, { headers: {} })` (status 200, empty body, no CORS headers). Matches existing `stripe-webhook/index.ts:58-60` and `stripe-webhook-handler/index.ts:31` exactly. |
| D-05 | Deno unit test, ~30 lines, 5 assertions | **Verified** | Pattern matches existing single-file test convention. Mock `log.warn` via spy on `createLogger` import OR via injected dep — see Recommendation #5 below. |
| D-06 | Delete `index.test.ts`, `price-resolver.ts`, `price-resolver.test.ts` | **Verified, with one follow-up** | **Cross-import audit clear:** `grep -r "stripe-webhook/"` returns only self-references plus `stripe-webhook-handler/` and the `_tests/` integration tests, none of which import `./price-resolver`. The active handler imports from `_shared/price-resolver.ts` (line 38: `import { resolveTier } from "../_shared/price-resolver.ts"`). The `_shared/price-resolver.ts` module **already exists** — `stripe-webhook/price-resolver.ts` is a true orphan and safe to delete. **Follow-up:** `_shared/test-helpers/stripe-fixtures.ts` and `_shared/test-helpers/stripe-signature.ts` are referenced by both `stripe-webhook/index.test.ts` (being deleted) and `stripe-webhook-handler/index.test.ts` (NOT being modified). Confirmed via `grep -l "stripe-fixtures\|stripe-signature"` — `stripe-webhook-handler/index.test.ts` retains both imports. **DO NOT delete the helpers.** |
| D-07 | No `config.toml` changes | **Verified** | All three `config*.toml` files have `[functions.stripe-webhook]` block at line 93 with only `verify_jwt = false` — exactly what the shim needs (no JWT, accept POST, return 410). No additional knobs. |
| D-08 | D1 URL pin = typed `STRIPE URL VERIFIED` ack BEFORE existing checklist confirm | **Verified** | `Stage-D1-Preflip` is at line 487. Existing `Confirm-Or-Exit` (line 514) reads "Confirm every checklist item is verified and intended flip window is clear". Inserting the URL-pin prompt **between line 513 (Write-Note) and 514 (Confirm-Or-Exit)** gives the operator the URL-pin ack before they check off the rest of the list. **Recommendation #3 below** answers "where exactly" with a more nuanced placement. |
| D-09 | D2 rollback caveat = separate prompt BEFORE red banner | **Verified** | Red `FLIP PROD` banner is lines 526-534, existing `Confirm-Or-Exit "Type 'FLIP PROD'..."` is line 535. Inserting the new caveat ack at line 525 (before the banner) — or alternatively **after** the banner but **before** line 535 (the "FLIP PROD" confirm) — both satisfy "BEFORE the existing red FLIP PROD banner." See Recommendation #1 for the locked phrase choice. |
| D-10 | D4 delete reminder ack | **Verified** | `Stage-D4-Finalize` is at line 725. The `if ($reply -eq "ROLLBACK")` early-exit is at line 746. The new ack should go **AFTER line 743 (Append-Evidence outcome)** but **BEFORE the rollback early-exit at 746** so a HOLD outcome still hits the reminder. Better location: as the **final operator-facing prompt before line 752 (`Write-Step "Committing evidence..."`)** so it never blocks a ROLLBACK. See Recommendation #4. |
| D-11 | Each prompt → `Write-Note` pointer to notes file | **Verified** | `Write-Note` signature at line 95: `function Write-Note($msg) { Write-Host "    $msg" -ForegroundColor DarkGray }`. One-arg, prints dimmed gray. Trivial to add. |
| D-12 | Each prompt → `Append-Evidence` line to `21-CUTOVER-LOG.md` | **Verified** | `Append-Evidence` at line 131 takes `($path, $section)`. Pattern: build a here-string with `Iso-Now` timestamp + ack phrase, call `Append-Evidence $cutoverLog $stamp`. **Note:** `21-CUTOVER-LOG.md` is created on demand by `Ensure-Cutover-Log` (line 456) which is called from `Stage-D1-Preflip` line 489. So D1's URL-pin ack appends after that file exists. D2 and D4 also have the file (D1 ran first). |
| D-13 | Notes file location | **Verified** | `.planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md` is correct. The phase 27 directory currently contains only `27-CONTEXT.md` and `27-DISCUSSION-LOG.md`. |
| D-14 | Four-section per-concern memo | **Verified** | Section count and content alignment with audit concerns #1/G/etc. is good. See Recommendation #2 for heading hierarchy. |
| D-15 | Hand-written, never mutated | **Verified** | No code path writes `21-CUTOVER-NOTES.md` — runbook only emits `Write-Note` pointers TO it, never INTO it. |
| D-16 | Cross-references | **Verified** | All five referenced paths exist: `21-CUTOVER-LOG.md` (created at D1 runtime, template-known), `v2.0-MILESTONE-AUDIT.md` (verified, lines 403-413 contain target sections), `phase21-runbook.ps1` (verified, lines 487/519/725), shim path (Phase 27 creates it), active handler path (`stripe-webhook-handler/index.ts` exists). |
| D-17 | No deploy script changes | **Verified** | Both scripts list `stripe-webhook` at line 31 and `stripe-webhook-handler` at line 32. The shim deploying to the same name is the entire point — Stripe traffic to the legacy URL must hit the shim. |
| D-18 | Replace `DEPLOY_RUNBOOK.md` with deprecation notice | **Verified** | Existing `DEPLOY_RUNBOOK.md` is 232 lines of Phase 07 setup instructions — fully obsolete. The 10-line replacement is correct. The notice should explicitly call out the active handler path (`supabase/functions/stripe-webhook-handler/`) and link to `21-CUTOVER-NOTES.md`. |
| D-19 | Planted seed for cleanup | **Verified** | Operator-driven `/gsd-plant-seed` step. Not a plan task — confirmed. |
| D-20 | Two-plan split | **Verified** | Suggested seam is clean: Plan 1 owns `stripe-webhook/` directory + `run-edge-tests.ps1` registration; Plan 2 owns `phase21-runbook.ps1` + new notes file. **Note:** `run-edge-tests.ps1` is implicated in Plan 1 — see Code-Context Finding #5 below. |

---

## Code-Context Findings

### 1. Cross-import audit (D-06): CLEAR

**Method:** `grep -rln "from.*['\"]\.\.?/stripe-webhook/"` against `supabase/`.

**Result:** Zero matches outside `stripe-webhook/` itself. The active handler at `stripe-webhook-handler/index.ts:38` imports `resolveTier` from `../_shared/price-resolver.ts` — a separate, already-extracted module. **No cross-import to migrate.** D-06's deletion list is safe to execute as-is.

**Test-helper survival:** `_shared/test-helpers/stripe-fixtures.ts` and `_shared/test-helpers/stripe-signature.ts` are imported by both files being deleted (`stripe-webhook/index.test.ts`) AND by `stripe-webhook-handler/index.test.ts` (which is NOT being modified — verified by reading line 38 of `stripe-webhook/index.test.ts` and confirming both imports). **Leave both helpers in place.**

### 2. Runbook helper signatures (verified at line numbers)

| Helper | Line | Signature | Used For |
|--------|------|-----------|----------|
| `Write-Step` | 90 | `Write-Step($msg)` — cyan `==> $msg` header | Section banners |
| `Write-Note` | 95 | `Write-Note($msg)` — dim gray `    $msg` | Side notes (D-11 pointers) |
| `Write-Ok` | 99 | `Write-Ok($msg)` — green `[ok]` | Success tags |
| `Write-Warn2` | 103 | `Write-Warn2($msg)` — yellow `[warn]` | Cautions |
| `Confirm-Or-Exit` | 107 | `Confirm-Or-Exit($prompt, $expected = "y")` — case-sensitive `Read-Host` ne-compare; mismatch = `exit 1` | All three new acks (D-08/09/10) |
| `Iso-Now` | 127 | `Iso-Now()` — `(Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")` | Timestamp for evidence stamps |
| `Append-Evidence` | 131 | `Append-Evidence($path, $section)` — creates parent dir if missing, `Add-Content -Encoding UTF8` | All three new acks log to `$cutoverLog` |
| `Ensure-Cutover-Log` | 456 | builds `21-CUTOVER-LOG.md` skeleton if absent | Called by `Stage-D1-Preflip:489` — file exists by the time D1's URL-pin ack runs |

**Stage entry-point line numbers:**
- `Stage-D1-Preflip` — line 487. Existing checklist `Confirm-Or-Exit` at line 514. Existing `Write-Note` cluster at lines 512-513.
- `Stage-D2-Flip` — line 519. Red banner block lines 526-534. `FLIP PROD` confirm at line 535.
- `Stage-D4-Finalize` — line 725. Outcome `Read-Host` at line 729. Outcome `Append-Evidence` at line 743. ROLLBACK early-exit at line 746-750. Final commit block 752-770.

### 3. `createLogger` and `log.warn` shape (`_shared/logger.ts`)

```typescript
export function createLogger(functionName: string, requestId?: string): Logger
log.warn(msg: string, data?: Record<string, unknown>): void
```

The logger merges `{ level, ts, msg, fn: functionName, reqId?, ...data }` and emits via `console.error()` for warn/error levels. The shim's planned warn line:

```typescript
log.warn('legacy_endpoint_hit', {
  req_id,                                    // from crypto.randomUUID()
  ua: req.headers.get('user-agent'),         // string | null
  sig_present: req.headers.has('stripe-signature'), // boolean
});
```

emits exactly:
```json
{"level":"warn","ts":"2026-...","msg":"legacy_endpoint_hit","fn":"stripe-webhook","req_id":"...","ua":"...","sig_present":false}
```

Note `fn` defaults to `"stripe-webhook"` from `createLogger("stripe-webhook")`. The `req_id` field name uses snake_case (matches D-03 wording); the logger's optional `reqId` constructor arg is camelCase but the **per-event field name is operator-chosen** via the data object — there is no name collision. Use `req_id` consistently as locked in D-03.

### 4. `handleOptionsRequest({ type: 'webhook' })` exact return

`_shared/cors.ts:33` for `type: 'webhook'` returns `{}` from `corsHeaders`, then `_shared/cors.ts:67` does `new Response(null, { headers: {} })`. This is **HTTP 200, empty body, no CORS headers**. The shim test (D-05 assertion d) should assert `res.status === 200` for OPTIONS, not 204.

### 5. `run-edge-tests.ps1` is an EXPLICIT LIST, not a glob

This is a **planning-critical finding** that 27-CONTEXT.md does not call out:

```powershell
# scripts/run-edge-tests.ps1 lines 33-34 (current):
  stripe-webhook/price-resolver.test.ts `
  stripe-webhook/index.test.ts `
```

Both lines must be **edited in Plan 1**:
- Delete `stripe-webhook/price-resolver.test.ts` line entirely (file being deleted per D-06).
- Replace `stripe-webhook/index.test.ts` line content (file is being **rewritten** per D-05, not deleted) — keep the registration line; the new test file at the same path slots in.

If this edit is missed, the harness will fail on a missing path. **The "Code-Context: Established Patterns" line in 27-CONTEXT.md says "new `index.test.ts` for the shim slots in alongside the existing edge tests automatically" — that is INACCURATE.** Registration must be updated explicitly. Planner must add this as a task in Plan 1.

### 6. `21-CUTOVER-LOG.md` template

The file does NOT exist yet — created on demand by `Ensure-Cutover-Log` (line 456-485) which `Stage-D1-Preflip` calls at line 489. Existing template:

```
# Phase 21 -- Production Cutover Log

Operator: <name>
Intended flip timestamp (planned): <ISO 8601>
Production project ref: zjpjapgraoxdukdvpjes

## Pre-Flip Checklist (D-09)

- [ ] Staging soak GO confirmed ...
- [ ] ... (8 more checklist items)

## Pre-Flip Verifications
(populated by Gate D1)

## Flip Transcript
(populated by Gate D2)
```

`Stage-D1-Preflip:499-510` already appends a `## Pre-Flip Verifications @ <iso>` block. New D1/D2/D4 acks should append similar blocks with stable headings so post-cutover grep finds them. Suggested heading shape (matches existing pattern):

```
---
## Stripe URL Pin Ack @ <iso>

Operator typed: STRIPE URL VERIFIED
```

```
---
## Rollback Caveat Ack @ <iso>

Operator typed: <D-09 phrase>
```

```
---
## Phase 25 Coordination Ack @ <iso>

Operator typed: <D-10 phrase>
```

### 7. `config.toml` audit (D-07): CLEAN

All three configs (`config.toml`, `config.staging.toml`, `config.production.toml`) have identical `[functions.stripe-webhook]` blocks at line 93:

```toml
[functions.stripe-webhook]
verify_jwt = false
```

Only `verify_jwt = false` is set. No `entrypoint`, no `import_map`, no constraints the shim could break. D-07 is verified — **no config changes needed**.

### 8. Phase 23 503 error path: VERIFIED LITERAL

`supabase/functions/interview-prep-analyze/index.ts:303-312`:

```typescript
if (!MERIT_SYSTEM_ENABLED) {
  // Defensive guard — Phase 23 is merit-path only.
  return jsonResponse(
    {
      error: 'merit_system_required',
      message: 'This function requires the Merit system.',
    },
    503,
  );
}
```

The audit's claim ("rolling back via `Invoke-MeritFlagRollback` will cause `interview-prep-analyze` to return 503 `merit_system_required`") is **literal, not aspirational**. D2's ack phrase can reference `503 merit_system_required` truthfully. The error string is `merit_system_required` (no spaces, no caps).

---

## Recommendations for "Claude's Discretion" Items

### Recommendation #1: D2 ack phrase

**Locked candidate:** `ACK INTERVIEW PREP ROLLBACK BRICKS 503`

**Recommendation:** **Keep the locked candidate.** Reasoning:

1. The 503 reference is verified literal (Code-Context Finding #8) — not aspirational, won't drift.
2. Length (`5 words, 36 chars`) is in-band with `FLIP PROD` (2 words, 9 chars) and `STRIPE URL VERIFIED` (3 words, 19 chars) — all-caps, type-once. Operator who is alert enough to type this is alert enough to pause.
3. The shorter alternative `ACK ROLLBACK CAVEAT` is too generic — it could refer to any caveat. The 503-specific phrasing forces the operator to read the caveat banner before typing.
4. `Confirm-Or-Exit` is case-sensitive (verified line 109: `if ($reply -ne $expected)`) — so SHOUTY caps lock the cognitive load to "I am acknowledging something specific."

### Recommendation #2: D4 ack phrase

**Recommendation:** `ACK INTERVIEW PREP COACH DELETE`

Reasoning: matches the SHOUTY pattern, names the function being deleted, and is unambiguously about Phase 25 SC-9's `interview-prep-coach` cleanup (NOT `interview-prep-analyze`, which is the active production handler that must NOT be deleted). The exact runbook prompt:

```powershell
Confirm-Or-Exit "Type 'ACK INTERVIEW PREP COACH DELETE' to confirm: 'supabase functions delete interview-prep-coach' was run for STAGING and PROD, OR Phase 25 SC-9 will run it." "ACK INTERVIEW PREP COACH DELETE"
```

### Recommendation #3: D1 URL-pin insertion point

**Recommendation:** Insert as the **first operator-facing prompt** in `Stage-D1-Preflip`, BEFORE `Ensure-Cutover-Log` opens the cutover log. Specifically, between line 488 (`Write-Step "Gate D1 -- ..."`) and line 489 (`Ensure-Cutover-Log`).

Rationale:
- If the URL is wrong, the entire cutover is unsafe — there is no point creating an evidence-log skeleton or running the read-only `Show-MeritFlagState` if the operator is about to flip a flag while Stripe is pointed at a 200-ignoring shim.
- The `Append-Evidence` for the URL-pin ack can land **after** `Ensure-Cutover-Log` runs (at line 495 area, between the existing two `Write-Step` calls). This requires either a two-phase placement (prompt at line 489-pre, evidence stamp later) OR moving `Ensure-Cutover-Log` to run BEFORE the prompt and using a separate `Append-Evidence` at the same time as the prompt.
- **Cleanest implementation:** Move `Ensure-Cutover-Log` to the very top of `Stage-D1-Preflip` (no behavioral change — file is created idempotently), then run URL-pin prompt + `Append-Evidence` together immediately after.

```powershell
function Stage-D1-Preflip() {
  Write-Step "Gate D1 -- Plan 21-07 Task 1: production pre-flip checklist"
  Ensure-Cutover-Log

  # NEW: Phase 27 SC-2 — Stripe URL pin (must precede checklist verifications)
  Write-Step "Stripe webhook URL pin (Phase 27 SC-2)"
  Write-Note "Background: see .planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md (Stripe URL Pin)"
  Confirm-Or-Exit "Type 'STRIPE URL VERIFIED' to confirm the production webhook endpoint URL ends in /functions/v1/stripe-webhook-handler" "STRIPE URL VERIFIED"
  $stamp = @"

---
## Stripe URL Pin Ack @ $(Iso-Now)

Operator typed: STRIPE URL VERIFIED
"@
  Append-Evidence $cutoverLog $stamp

  Write-Step "Verifying production prerequisites (read-only)"
  # ... existing flow continues ...
}
```

### Recommendation #4: D2 caveat ack — inline vs helper function

**Recommendation:** **Inline inside `Stage-D2-Flip`, not a new helper.** Reasoning:

- `Stage-D2-Flip` is currently 68 lines (519-587). Adding ~12 lines for the caveat block keeps it under 80 — well within the project's "10-50 lines, complex up to 80" function-design convention.
- The caveat is single-purpose and only ever runs in the flip context. Extracting it to `Stage-D2-Flip-PrintCaveat` adds indirection without reuse.
- The existing red `FLIP PROD` banner (lines 526-534) is also inlined for the same reason.

**Placement:** Insert the new ack block **between line 525 (blank `Write-Host ""`) and line 526 (red banner top)**, so the caveat appears as a separate ceremony before the visual flip authorization:

```powershell
Write-Host ""

# NEW: Phase 27 SC-3 — IPC rollback caveat ack (precedes red FLIP PROD banner)
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

Write-Host ""
Write-Host "  +==================================================================+" -ForegroundColor Red
# ... existing red banner continues ...
```

### Recommendation #5: D4 placement

**Recommendation:** Insert the delete-reminder ack as the **last operator-facing prompt before the git-commit confirm at line 763**, gated INSIDE the `if ($reply -eq "ROLLBACK")` early-exit.

Rationale:
- ROLLBACK outcomes early-exit at line 749 — the `interview-prep-coach` cleanup is irrelevant if rolling back. Don't hassle the operator.
- HOLD outcomes proceed to commit. Adding the reminder before the commit confirms makes the ack part of the same evidence push.

```powershell
function Stage-D4-Finalize() {
  # ... existing flow through line 750 (rollback early-exit) ...

  # NEW: Phase 27 SC-4 — Phase 25 coordination reminder (HOLD outcomes only)
  Write-Step "Phase 25 coordination — interview-prep-coach delete (Phase 27 SC-4)"
  Write-Note "Background: see .planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md (Phase 25 Dependency)"
  Confirm-Or-Exit "Type 'ACK INTERVIEW PREP COACH DELETE' to confirm: 'supabase functions delete interview-prep-coach' was run for STAGING and PROD, OR Phase 25 SC-9 will run it." "ACK INTERVIEW PREP COACH DELETE"
  $stamp = @"

---
## Phase 25 Coordination Ack @ $(Iso-Now)

Operator typed: ACK INTERVIEW PREP COACH DELETE
"@
  Append-Evidence $cutoverLog $stamp

  Write-Step "Committing evidence files via D-22 exception (git add -f)"
  # ... existing commit block continues at line 752 ...
}
```

### Recommendation #6: `21-CUTOVER-NOTES.md` heading hierarchy

**Recommendation:** **H1 + four H2 sections.** Reasoning:

- The notes file is standalone, not embedded in another markdown stream. H1 = file title is canonical.
- The existing `21-SC5-EVIDENCE.md` template uses H1 + H2 structure (verified lines 593-652).
- Operator reads this file alone (via the `Write-Note` pointers from the runbook). H1 makes the document type unambiguous.

**Suggested skeleton:**

```markdown
# Phase 21 Cutover Notes — Operator Safety Net

> Closes audit concerns #1, #2, and §"Operational rollback caveat (Concern G)"
> from `.planning/v2.0-MILESTONE-AUDIT.md`. Authored as part of Phase 27.
>
> Cross-references:
> - Canonical evidence: `.planning/phases/21-integration-validation-and-cutover/21-CUTOVER-LOG.md`
> - Audit: `.planning/v2.0-MILESTONE-AUDIT.md` §"Top cross-phase concerns"
> - Runbook: `scripts/phase21-runbook.ps1` (Stages D1-Preflip, D2-Flip, D4-Finalize)
> - Shim: `supabase/functions/stripe-webhook/index.ts` (410-Gone)
> - Active handler: `supabase/functions/stripe-webhook-handler/index.ts`

## 1. Legacy Webhook Risk

What the misroute looked like: ...
What the 410 shim does about it: ...
What to do if `legacy_endpoint_hit` fires post-cutover: ...

## 2. Interview Prep Rollback Caveat

Phase 23 is merit-only by design. ...
Rollback bricks `interview-prep-analyze` to `503 merit_system_required` until hotfix. ...
The D2 ack acknowledges this. ...

## 3. Stripe URL Pin

The dashboard MUST point at `/functions/v1/stripe-webhook-handler`. ...
The D1 prompt enforces this with a typed `STRIPE URL VERIFIED` ack. ...
What to do if the URL is wrong: DO NOT FLIP. Update Stripe dashboard, restart Gate D1.

## 4. Phase 25 Dependency

`interview-prep-coach` deletion is owned by Phase 25 SC-9, but Phase 27 SC-4 adds a reminder ...
Whichever phase ships first deploys the reminder. ...
The D4 ack accepts the overlap. ...
```

### Recommendation #7: Add safety-net summary line to `21-CUTOVER-LOG.md` template?

**Recommendation:** **No.** Keep the notes file standalone. Reasoning:

- `Ensure-Cutover-Log` (line 456-485) is owned by Phase 21, not Phase 27. Modifying its skeleton is a scope expansion that touches Phase 21 code beyond what SC-2/3/4 require.
- The three new `Append-Evidence` blocks (URL-pin, rollback-caveat, phase-25-coordination) will appear naturally in the log as they fire — no template change needed.
- Cross-references already point readers from the runbook to `21-CUTOVER-NOTES.md` via `Write-Note`. Adding a top-of-file pointer in the log skeleton is duplicate signal.

---

## Test Strategy (D-05 expansion)

The unit test file at `supabase/functions/stripe-webhook/index.test.ts` (newly written, replacing the deleted Phase 07 test):

```typescript
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleStripeWebhook } from "./index.ts";

Deno.test("legacy webhook shim: POST returns 410 with deprecation body", async () => {
  const req = new Request("https://example.test/stripe-webhook", {
    method: "POST",
    headers: { "stripe-signature": "t=1,v1=abc", "user-agent": "Stripe/1.0" },
    body: '{"any":"json"}',
  });
  const res = await handleStripeWebhook(req);
  assertEquals(res.status, 410);
  const body = await res.json();
  assertEquals(body.error, "endpoint_deprecated");
  assertEquals(body.use, "/functions/v1/stripe-webhook-handler");
  assert(typeof body.req_id === "string" && body.req_id.length > 0);
});

Deno.test("legacy webhook shim: OPTIONS returns 200 (handleOptionsRequest)", async () => {
  const req = new Request("https://example.test/stripe-webhook", { method: "OPTIONS" });
  const res = await handleStripeWebhook(req);
  assertEquals(res.status, 200);
});

Deno.test("legacy webhook shim: GET returns 405 method_not_allowed", async () => {
  const req = new Request("https://example.test/stripe-webhook", { method: "GET" });
  const res = await handleStripeWebhook(req);
  assertEquals(res.status, 405);
  const body = await res.json();
  assertEquals(body.error, "method_not_allowed");
});
```

**Note on log-warn assertion:** Capturing `console.error` output to verify `legacy_endpoint_hit` warn is doable but adds setup. Two options:
1. Capture via `console.error` monkey-patch (simple, brittle).
2. Add an injected `log` dep to `handleStripeWebhook` (clean, but changes function signature).

**Recommendation:** Skip the warn assertion in unit tests (D-05 lists it but it's the lowest-value of the five). The shape `log.warn('legacy_endpoint_hit', { req_id, ua, sig_present })` is a single hard-coded line in a 30-line function — visual review covers it. The high-value assertions are status codes + body shape, which the test above covers fully.

If the planner insists on coverage, use `console.error` capture with a try/finally restore — pattern exists in `_shared/logger.test.ts`.

---

## Risks / Open Questions for the Planner

| # | Risk | Mitigation |
|---|------|------------|
| R1 | **`run-edge-tests.ps1` registration is an explicit list, not glob.** Plan 1 must edit lines 33-34. The 27-CONTEXT.md "tests slot in automatically" wording is misleading. | Add a Plan 1 task: "Update `scripts/run-edge-tests.ps1` line 33 (delete `stripe-webhook/price-resolver.test.ts` reference) and verify line 34 (`stripe-webhook/index.test.ts`) still resolves to the new shim test." |
| R2 | **`Ensure-Cutover-Log` runs at line 489 BEFORE the URL-pin prompt** in the recommended insertion. Either move `Ensure-Cutover-Log` first (no behavior change) or accept a small ordering swap. | Recommendation #3 above shows the cleanest ordering: keep `Ensure-Cutover-Log` at the very top, then run URL-pin prompt + evidence stamp immediately after. |
| R3 | **Operator running `Stage-D2-Flip` directly without first running `Stage-D1-Preflip`** would skip the URL-pin ack. Existing line 521-524 guard checks for `$cutoverLog` existence and exits if absent — so D1 must run before D2 — but this is the pre-existing behavior, not new. | No new mitigation needed; the file-existence guard is sufficient. |
| R4 | **`crypto.randomUUID()` requires Deno's standard runtime context.** Should be available in the Supabase Edge Runtime, but worth verifying. | `crypto.randomUUID()` is a Web Crypto API standard and is supported in Deno 1.40+. Supabase Edge Runtime tracks Deno LTS. Confirmed used elsewhere in this codebase: `grep -r "crypto.randomUUID" supabase/functions/` returns multiple hits in shared utilities. **No risk.** |
| R5 | **Phase 25 SC-9 has not yet shipped** — D-10's "OR Phase 25 SC-9 will run it" depends on Phase 25 closing the deletion. If Phase 25 lands first, D4's reminder becomes redundant noise. If Phase 27 lands first (current plan), the reminder is the only forcing function for the cleanup. | The roadmap explicitly accepts this overlap. No mitigation needed beyond the locked decision in D-10. |
| R6 | **`STAGING_REF` is only referenced in the runbook, not in D4's delete reminder.** The reminder mentions both staging AND prod deletion. Operator must run two commands (one per env). | Recommendation #2's prompt phrasing makes this explicit ("STAGING and PROD"). Planner can additionally add `Write-Note` lines listing both project refs from the existing `$STAGING_REF` / `$PROD_REF` constants (lines 79-80) to remove ambiguity. |
| R7 | **No phase-27-specific test for the runbook changes.** The runbook is interactive PowerShell — running it in CI is not tractable. | Verification is manual (planner can mark these as `human_verification` per CLAUDE.md operator-runbook gates pattern). The existing Phase 21 verification framework covers cutover acceptance. |

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OPTIONS preflight response | A new no-CORS responder | `handleOptionsRequest({ type: 'webhook' })` from `_shared/cors.ts` | Already exists, used by 30+ functions, returns identical body for webhook type |
| Per-request UUID | `crypto.subtle.digest()` based ID, custom format | `crypto.randomUUID()` | Deno built-in, RFC 4122 v4, no import |
| Structured warn log | `console.error(JSON.stringify(...))` directly | `createLogger('stripe-webhook').warn(...)` | Existing logger merges `level/ts/msg/fn` automatically and routes warn → stderr |
| Operator-typed confirm | New `Read-Host` block with custom validation | `Confirm-Or-Exit "<prompt>" "<expected>"` | Exists at line 107, case-sensitive ne-compare, exits-1 on mismatch |
| Evidence-log append | New `Add-Content` block with manual dir creation | `Append-Evidence $cutoverLog $stamp` | Exists at line 131, creates parent dir, UTF8-safe |
| ISO timestamp | `Get-Date \| Out-String \| ...` ad-hoc | `Iso-Now` | Exists at line 127, returns `yyyy-MM-ddTHH:mm:ssZ` (Z-form, not local) |

---

## Common Pitfalls

### Pitfall 1: Deleting test-helper files prematurely
**What goes wrong:** D-06 lists three files for deletion. If the planner also deletes `_shared/test-helpers/stripe-fixtures.ts` or `_shared/test-helpers/stripe-signature.ts`, `stripe-webhook-handler/index.test.ts` will fail to compile.
**How to avoid:** Plan 1 must explicitly state "DELETE only the three files listed in D-06; DO NOT touch `_shared/test-helpers/`."
**Warning signs:** `deno test` fails on `stripe-webhook-handler/index.test.ts` with module-not-found errors.

### Pitfall 2: Forgetting to update `run-edge-tests.ps1`
**What goes wrong:** Test harness fails on path-not-found for the deleted `price-resolver.test.ts`.
**How to avoid:** Plan 1 task list must include the registration edit.
**Warning signs:** CI test runner errors out on `Path does not exist: stripe-webhook/price-resolver.test.ts`.

### Pitfall 3: Inserting D1 URL-pin prompt AFTER `Show-MeritFlagState`
**What goes wrong:** Read-only state inspection runs against prod before the operator confirms the URL is correct. Wastes API calls if the URL is wrong (bug-bounty: low; cosmetic).
**How to avoid:** Insert at the top of `Stage-D1-Preflip`, immediately after `Ensure-Cutover-Log`.

### Pitfall 4: Runbook hot-replacement during a live cutover
**What goes wrong:** Operator runs Phase 21 cutover while Phase 27 PR is in flight. The new ack prompts haven't been deployed yet, so the safety net is missing.
**How to avoid:** Phase 27 must merge BEFORE Phase 21-07 production cutover begins. Planner should annotate this dependency in `27-VERIFICATION.md` when it's authored.
**Warning signs:** Runbook output doesn't show `Phase 27 SC-2/3/4` annotations during D1/D2/D4 stages.

### Pitfall 5: `Confirm-Or-Exit` case-sensitivity
**What goes wrong:** Operator types `stripe url verified` (lowercase). Comparison fails, runbook exits with code 1, mid-cutover.
**How to avoid:** All three new ack phrases use SHOUTY caps, matching `FLIP PROD` precedent. The prompt text explicitly shows the exact phrase. Operator CapsLock is the operator's responsibility.
**Warning signs:** `Aborted by operator.` message in cutover transcript when operator did not intend to abort.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Deno test runner (built-in), invoked via `scripts/run-edge-tests.ps1` |
| Config file | None — `--no-check --allow-all` flags inline in `run-edge-tests.ps1` |
| Quick run command | `deno test --no-check --allow-all supabase/functions/stripe-webhook/index.test.ts` |
| Full suite command | `.\scripts\run-edge-tests.ps1` |

### Phase Requirements → Test Map

| Concern | Behavior | Test Type | Automated Command | File Exists? |
|---------|----------|-----------|-------------------|-------------|
| SC-1 | POST returns 410 with deprecation body | unit | `deno test ... stripe-webhook/index.test.ts` | ❌ Wave 0 (new shim test) |
| SC-1 | OPTIONS returns 200 | unit | (same) | ❌ Wave 0 |
| SC-1 | GET returns 405 | unit | (same) | ❌ Wave 0 |
| SC-2 | D1 URL-pin prompt fires | manual (interactive PowerShell) | `.\scripts\phase21-runbook.ps1 -Stage D1-Preflip -DryRun` (does NOT actually skip the prompt — `-DryRun` only suppresses destructive ops) | n/a — manual op-test |
| SC-3 | D2 caveat ack fires | manual | `.\scripts\phase21-runbook.ps1 -Stage D2-Flip -DryRun` | n/a — manual op-test |
| SC-4 | D4 delete reminder fires | manual | `.\scripts\phase21-runbook.ps1 -Stage D4-Finalize` (no DryRun support for outcome prompt) | n/a — manual op-test |
| SC-5 | `21-CUTOVER-NOTES.md` exists with required sections | static | `Test-Path .planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md` | ❌ Wave 0 (planner authors) |

### Sampling Rate

- **Per task commit:** `deno test --no-check --allow-all supabase/functions/stripe-webhook/index.test.ts`
- **Per wave merge:** `.\scripts\run-edge-tests.ps1`
- **Phase gate:** Full suite green + manual runbook walk-through (DryRun mode for Stages D1/D2; D4 outcome is a Read-Host)

### Wave 0 Gaps

- [x] `supabase/functions/stripe-webhook/index.test.ts` — replace existing Phase 07 test with ~30-line shim test (D-05)
- [x] `supabase/functions/stripe-webhook/index.ts` — replace with shim (SC-1)
- [x] `supabase/functions/stripe-webhook/DEPLOY_RUNBOOK.md` — replace with deprecation notice (D-18)
- [x] `.planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md` — hand-author (SC-5, D-13/14/15/16)
- [x] `scripts/run-edge-tests.ps1` — line 33 deletion (registration update for deleted `price-resolver.test.ts`)

---

## Project Constraints (from CLAUDE.md)

Following CLAUDE.md project memory:

- **Working agreement:** Small, reversible change — Phase 27 is exactly that (one shim, three runbook insertions, one notes file).
- **Reliability priority:** "Treat repeated `OPTIONS`/preflight `503` responses as platform routing failures." The shim returns 200 for OPTIONS, 410 for POST — neither is the failure mode CLAUDE.md warns about.
- **Coding style:** 2-space indent, semicolons, named exports, `[FunctionName] message` log prefix → the shim is a Deno function and uses `createLogger('stripe-webhook')` which produces the equivalent structured `fn: 'stripe-webhook'` field (verified line 17 of `_shared/logger.ts`).
- **Repository conventions:** Frontend in `src/` (untouched); edge functions in `supabase/functions/` (Phase 27 only modifies `stripe-webhook/`); deployment scripts in `scripts/` (Phase 27 modifies `phase21-runbook.ps1` and `run-edge-tests.ps1` only).
- **Git:** Do NOT commit anything in `.planning/` — verified; `21-CUTOVER-NOTES.md` lives in `.planning/phases/27-cutover-safety-net/` so it MUST be `git add -f`'d via the same D-22 exception used by Phase 21 evidence files. **Planner must call this out** as a known exception, not an oversight.
- **GSD workflow:** Phase 27 work MUST start through `/gsd-execute-phase` (planned phase work).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| (none) | All claims in this research were verified against the live codebase via Read/Grep tools. | — | — |

**No `[ASSUMED]` claims.** Every line number, helper signature, file path, error string, and config value was directly verified by reading the relevant file. The only judgment calls are the "Claude's Discretion" recommendations (Recommendations #1-7), which are clearly labeled as opinions, not facts.

---

## Open Questions

1. **Should `21-CUTOVER-NOTES.md` be committed under the `.planning/` git-block exception?**
   - What we know: `.planning/` is gitignored; CLAUDE.md states "NEVER commit anything within the .planning/ directory."
   - What's unclear: Phase 21 already has a `git add -f` exception (D-22) for evidence files. SC-5 says the notes file ships in the Phase 27 PR — implying it must be committed.
   - Recommendation: Phase 27 inherits the D-22 `git add -f` exception. Add a one-line note to the planner: "Use `git add -f .planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md` per the Phase 21 D-22 precedent." User feedback memory file confirms `.planning/` exclusion is strict by default; D-22 explicitly creates an exception for cutover-evidence and similar artifacts.

2. **Should the unit test capture and assert the `legacy_endpoint_hit` warn log line?**
   - What we know: D-05 lists this as one of five assertions.
   - What's unclear: Capturing `console.error` output requires monkey-patching, which adds ~10 lines of test setup for low-value coverage of a hard-coded one-liner.
   - Recommendation: **Skip the warn assertion** in the unit test; rely on visual review. If planner wants coverage, use `console.error` capture pattern (template available from `_shared/logger.test.ts`).

3. **Does `Stage-D4-Finalize` ROLLBACK path need a Phase 25 reminder too?**
   - What we know: D-10 is silent on ROLLBACK outcomes. Recommendation #5 above places the ack INSIDE the `if ($reply -eq "ROLLBACK")` early-exit (so it does NOT fire on rollback).
   - What's unclear: If a rollback happens, does the operator still need to delete `interview-prep-coach`?
   - Reasoning: Yes, because `interview-prep-coach` is a stale function regardless of merit-flag state. But in a rollback scenario the operator is likely doing other emergency work; a post-rollback cleanup ticket is a better forcing function than a runbook prompt.
   - Recommendation: Keep the ack HOLD-only as in Recommendation #5; the planted seed (D-19) and Phase 25 SC-9 cover the rollback case durably.

---

## Sources

### Primary (HIGH confidence — verified via Read/Grep tools)

- `supabase/functions/stripe-webhook/index.ts` (Phase 07 handler being replaced)
- `supabase/functions/stripe-webhook/index.test.ts` (Phase 07 tests being deleted)
- `supabase/functions/stripe-webhook/price-resolver.ts` + `price-resolver.test.ts` (Phase 07 module being deleted)
- `supabase/functions/stripe-webhook/DEPLOY_RUNBOOK.md` (Phase 07 doc being replaced)
- `supabase/functions/stripe-webhook-handler/index.ts:1-80` (active handler — confirmed imports `_shared/price-resolver`, NOT `stripe-webhook/price-resolver`)
- `supabase/functions/_shared/logger.ts` (createLogger and Logger interface signatures)
- `supabase/functions/_shared/cors.ts` (handleOptionsRequest for `type: 'webhook'`)
- `supabase/functions/interview-prep-analyze/index.ts:295-312` (literal 503 `merit_system_required` path)
- `scripts/phase21-runbook.ps1:1-90, 456-485, 487-587, 725-787` (helper signatures + stage entry points)
- `scripts/deploy-staging.ps1` + `scripts/deploy-production.ps1` (line 31 `stripe-webhook` entries confirmed)
- `scripts/run-edge-tests.ps1:33-34` (explicit registration list — NOT glob)
- `supabase/config.toml` + `config.staging.toml` + `config.production.toml` (line 93 — only `verify_jwt = false`)
- `.planning/phases/27-cutover-safety-net/27-CONTEXT.md` (D-01..D-20)
- `.planning/v2.0-MILESTONE-AUDIT.md:395-413` (Concern G + Top cross-phase concerns)
- `.planning/ROADMAP.md:550-565` (Phase 27 SC-1..SC-5)
- `.planning/phases/21-integration-validation-and-cutover/21-CONTEXT.md` (D-09, D-13, D-14, D-15, D-19, D-22)
- `.planning/phases/13-merit-enforcement-and-feature-flag/13-CONTEXT.md:69` (D-07 gated handler list)

### Secondary (cross-referenced — no external docs needed)

This is a pure refactor + operator-runbook phase. No external library research required. The Deno standard library (`std@0.224.0/assert/mod.ts`), `crypto.randomUUID()` (Web Crypto API), and Supabase Edge Runtime conventions are all already in use across this codebase.

---

## Metadata

**Confidence breakdown:**
- Locked-decision validation: **HIGH** — every D-01..D-20 verified against live code with line numbers
- Code context (cross-imports, helpers, line numbers): **HIGH** — all verified by direct Read/Grep
- Recommendations for Claude's Discretion items: **HIGH** — opinions backed by explicit reasoning + matching existing patterns
- Test strategy: **HIGH** — pattern matches existing `_shared/*.test.ts` and `stripe-webhook-handler/index.test.ts` conventions
- Risk register: **HIGH** — R1 (`run-edge-tests.ps1` registration) is the most important new finding the planner must absorb

**Research date:** 2026-04-28
**Valid until:** 2026-05-28 (or until any of: `phase21-runbook.ps1`, `_shared/cors.ts`, `_shared/logger.ts`, or `interview-prep-analyze/index.ts` is materially modified — whichever comes first)
