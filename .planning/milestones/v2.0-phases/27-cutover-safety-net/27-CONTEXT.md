# Phase 27: cutover-safety-net - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Close the two cutover-critical concerns surfaced by the v2.0 milestone audit before the operator runs Phase 21-07 production cutover. Make legacy webhook misrouting fail loud, document the Interview Prep rollback caveat in the runbook, and pin the Stripe dashboard URL verification step.

In scope:
- Replace `supabase/functions/stripe-webhook/index.ts` with a 410-Gone JSON shim per ROADMAP §Phase 27 SC-1.
- Update `scripts/phase21-runbook.ps1` Gate D1 (pre-flip URL pin), Gate D2 (rollback caveat ack), and Gate D4-Finalize (interview-prep-coach delete reminder) per SC-2/3/4.
- Hand-author `21-CUTOVER-NOTES.md` in the phase 27 directory summarizing the four safety-net concerns per SC-5.
- Replace `supabase/functions/stripe-webhook/DEPLOY_RUNBOOK.md` with a deprecation notice.
- Plant a follow-up seed for full deletion of the legacy `stripe-webhook/` directory once production logs show 30 days of zero `legacy_endpoint_hit` warnings.

Out of scope (other phases own these):
- Asset deletion of the legacy `stripe-webhook` Supabase function and its deploy-script entries — covered by the planted seed, not this phase. SC-1 explicitly mandates the function continue to deploy as a 410 shim.
- The actual Stripe dashboard URL change — operator action during Gate D1, not code.
- The `interview-prep-coach` Supabase function deletion — Phase 25 SC-9 owns the operator step; Phase 27 SC-4 only adds the reminder.
- Async-job merit refund (Phase 26).
- Any new observability beyond the existing `createLogger` warn lines.

</domain>

<decisions>
## Implementation Decisions

### 410-Gone Shim (SC-1)
- **D-01:** Blanket-reject. The shim does NOT read `STRIPE_WEBHOOK_SECRET` and does NOT call `stripe.webhooks.constructEventAsync`. Any POST returns 410 with the SC-1 body shape. Intent is to fail loud regardless of whether the secret is present on the legacy function — adding signature verification would just delay the loud failure.
- **D-02:** Logging only — no `stripe_webhook_events` insert. The shim emits `log.warn('legacy_endpoint_hit', { req_id, ua: req.headers.get('user-agent'), sig_present: req.headers.has('stripe-signature') })` and otherwise touches no DB. Rationale: `stripe_webhook_events` is for processed events, not rejected misroutes. Keeps the shim pure (zero service-client dependency).
- **D-03:** `req_id` is generated per-request via `crypto.randomUUID()`, included in BOTH the warn log AND the JSON response body so operators triangulating Stripe's delivery dashboard against server logs can match a 410 response to its server-side warn. Response shape: `{ "error": "endpoint_deprecated", "use": "/functions/v1/stripe-webhook-handler", "req_id": "<uuid>" }`.
- **D-04:** Method handling — `OPTIONS` returns the existing `handleOptionsRequest({ type: 'webhook' })` response (per the existing `_shared/cors.ts` webhook policy: no CORS headers, but the helper already serves a no-op response). Non-POST returns 405 with `{ error: 'method_not_allowed' }` (matches existing handler convention). POST falls through to the 410.
- **D-05:** Test strategy is Deno unit test only. New ~30-line `index.test.ts` asserts: (a) POST returns 410, (b) body includes `error`, `use`, `req_id`, (c) `log.warn` was called with `legacy_endpoint_hit` and a `req_id`, (d) `OPTIONS` returns 200 (or whatever `handleOptionsRequest` returns), (e) `GET` returns 405. No runbook smoke step, no probe extension — those add scope without proportional coverage gain for a 30-line file.
- **D-06:** Delete the existing `index.test.ts` (4 fixture-driven Phase 07 tests for the now-replaced handler), `price-resolver.ts`, and `price-resolver.test.ts`. Verify in planning that no other function imports `price-resolver` from `stripe-webhook/`; if `stripe-webhook-handler/` cross-imports it, planner moves the file to `_shared/` first. Same for `_shared/test-helpers/stripe-fixtures.ts` and `_shared/test-helpers/stripe-signature.ts` — these are likely still used by `stripe-webhook-handler/index.test.ts`; leave them alone.
- **D-07:** No `supabase/config.toml` changes. The existing function block (whatever Phase 07 set up) continues to serve the new `index.ts` body. Webhooks already disable JWT verification per Stripe's signature pattern; the shim doesn't read auth so default behavior is fine. Planner verifies no per-function config block constrains `stripe-webhook` in a way the shim breaks.

### Runbook Updates (SC-2, SC-3, SC-4)
- **D-08:** **D1 Stripe URL pin** is a `Confirm-Or-Exit` typed-phrase prompt: `Confirm-Or-Exit "Type 'STRIPE URL VERIFIED' to confirm the production webhook endpoint URL ends in /functions/v1/stripe-webhook-handler" "STRIPE URL VERIFIED"`. Inserted in `Stage-D1-Preflip` BEFORE the existing checklist `Confirm-Or-Exit`. Typo-protected, matches the `FLIP PROD` pattern in D2. Operator cannot proceed without explicit ack.
- **D-09:** **D2 rollback caveat** is a separate `Confirm-Or-Exit` typed-phrase prompt placed BEFORE the existing red `FLIP PROD` banner. Phrase: `ACK INTERVIEW PREP ROLLBACK BRICKS 503` (or similar locked phrase chosen during planning). Single typed ack — no two-phrase ACCEPT/ROLL FORWARD branching. Decisions about whether to roll back IF an alert fires belong to the rollback moment, not the flip moment. Phrase + typed-input shows up in the existing `.tmp-flip-transcript.txt` capture, giving a clean audit trail in the cutover log.
- **D-10:** **D4-Finalize delete reminder** is a `Confirm-Or-Exit` ack (run-or-deferred-OK). Operator may type the ack without actually running the delete IF they confirm Phase 25 covers it. Prompt phrasing: `Confirm: 'supabase functions delete interview-prep-coach' was run for STAGING and PROD, OR Phase 25 SC-9 will run it. Type ACK.` Roadmap §Phase 27 SC-4 already accepts this overlap with Phase 25 SC-9.
- **D-11:** Each new prompt (D1 URL pin, D2 caveat, D4 delete reminder) prints a `Write-Note` pointer to the relevant section of the notes file: `Write-Note "Background: see .planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md §<concern>"`. Discoverable in-flow without bloating the runbook.
- **D-12:** All three new prompts also append a single line to `21-CUTOVER-LOG.md` via the existing `Append-Evidence` helper, capturing the timestamp and ack phrase typed. Mirrors how D1's existing checklist confirmation is logged. Provides a permanent audit trail in the canonical cutover-evidence file.

### 21-CUTOVER-NOTES.md (SC-5)
- **D-13:** **Location: `.planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md`** per roadmap (NOT planning root, NOT phase 21 directory — the artifact is co-authored in phase 27 by design).
- **D-14:** **Structure: per-concern markdown memo, four short sections** (~5-10 lines each):
  1. Legacy webhook risk — what the misroute looked like, what the 410 shim does about it, what to do if `legacy_endpoint_hit` fires post-cutover.
  2. Interview Prep rollback caveat — Phase 23 is merit-only by design; rollback bricks `interview-prep-analyze` until hotfix; D2 ack acknowledges this.
  3. Stripe URL pin — what URL the dashboard MUST point at, what the D1 prompt enforces, what to do if the URL is wrong (DO NOT FLIP).
  4. Phase 25 dependency — `interview-prep-coach` deletion overlap; whichever phase ships first deploys the reminder; D4 ack accepts the overlap.
- **D-15:** **Source: hand-written, ships in the Phase 27 PR, never mutated by the runbook.** It is documentation glue, not evidence. Evidence lives in `21-CUTOVER-LOG.md` and `21-SC5-EVIDENCE.md`.
- **D-16:** **Header cross-references** with full relative paths:
  - `.planning/phases/21-integration-validation-and-cutover/21-CUTOVER-LOG.md` (canonical evidence)
  - `.planning/v2.0-MILESTONE-AUDIT.md` §Top cross-phase concerns (source of the two concerns being closed)
  - `scripts/phase21-runbook.ps1` (D1/D2/D4 stages where each concern surfaces operationally)
  - `supabase/functions/stripe-webhook/index.ts` (the 410 shim itself) and `supabase/functions/stripe-webhook-handler/index.ts` (the active handler)

### Deploy + Deprecation Surface
- **D-17:** **No changes to `scripts/deploy-staging.ps1` or `scripts/deploy-production.ps1`.** Both already include `stripe-webhook` in the deploy list (line 31 in each). SC-1 explicitly says "function continues to deploy" — keeping the entry is the entire point: misrouted Stripe traffic must hit the deployed shim and fail loud.
- **D-18:** **Replace `supabase/functions/stripe-webhook/DEPLOY_RUNBOOK.md`** with a short deprecation notice (~10 lines): "DEPRECATED — this is a 410-Gone shim. The active webhook handler is `supabase/functions/stripe-webhook-handler/`. Stripe dashboard endpoint URL MUST end in `/functions/v1/stripe-webhook-handler`. See `.planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md` for the full safety-net rationale." Existing Phase 07 deploy notes are obsolete and should not co-exist with the shim.
- **D-19:** **Plant follow-up seed via `/gsd-plant-seed`** for full deletion of the legacy `stripe-webhook/` directory and its two deploy-script entries. Trigger condition: `production logs show zero 'legacy_endpoint_hit' warnings for 30 consecutive days post-cutover`. Surfaces automatically at the right milestone; keeps Phase 27 scoped to safety-net only. (Operator runs `/gsd-plant-seed` AFTER this CONTEXT.md lands; planner does not need to schedule it as a plan task.)

### Plan Structure
- **D-20:** Roadmap suggests two plans (410-shim + tests; runbook updates + cutover notes). Hold to that split during planning unless the planner finds a sharper boundary. Suggested seams:
  - Plan 1: 410-shim source replacement, unit test, file deletions in `stripe-webhook/`, deprecation `DEPLOY_RUNBOOK.md` rewrite. All under `supabase/functions/stripe-webhook/`.
  - Plan 2: `phase21-runbook.ps1` D1/D2/D4 prompt additions + `Append-Evidence` calls + `Write-Note` pointers, AND hand-authored `21-CUTOVER-NOTES.md` in the phase 27 directory.

### Claude's Discretion
- Exact phrase wording for D2's typed ack (`ACK INTERVIEW PREP ROLLBACK BRICKS 503` is the leading candidate but planner may shorten to e.g. `ACK ROLLBACK CAVEAT` if 503-specific phrasing feels brittle).
- Exact phrase wording for D4's delete-reminder ack.
- Where in `Stage-D1-Preflip` the URL-pin prompt slots (before secrets-state print? After? Right before the existing checklist confirm?).
- Whether the D2 caveat ack lives inside `Stage-D2-Flip` or as a new helper function (avoids inflating `Stage-D2-Flip`).
- Whether `21-CUTOVER-NOTES.md` uses an H1 + four H2 concern sections, or H2 + four H3 (depends on how it's read alongside the runbook).
- Whether to add a one-line summary of the safety-net to `21-CUTOVER-LOG.md` template too (currently only references checklist + flip transcript), or keep the notes file standalone.

### Folded Todos
None — `gsd-sdk query todo.match-phase` was unavailable in this environment; planner should re-run the todo cross-reference at plan time.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & Audit (the source of truth)
- `.planning/ROADMAP.md` §"Phase 27: cutover-safety-net" — the 5 Success Criteria that VERIFICATION.md must prove TRUE; the canonical scope.
- `.planning/v2.0-MILESTONE-AUDIT.md` §"Top cross-phase concerns" (concerns #1 and #2) and §"Operational rollback caveat (Concern G)" — the audit findings Phase 27 closes. Read concerns #1 and #2 in full before planning the shim.
- `.planning/v2.0-MILESTONE-AUDIT.md` §"E2E flow implementability" Flow G — Phase 23 rebuilt as merit-only; rollback bricks `interview-prep-analyze` to 503; this is the rollback caveat being documented.

### Prior Phase Contracts (read first — these lock the contract Phase 27 must honor)
- `.planning/phases/21-integration-validation-and-cutover/21-CONTEXT.md` — especially D-09 (pre-flip checklist mandatory), D-13 (rollback is human-in-loop, not auto), D-14 (rollback procedure), D-15 (single-operator authority), D-19 (boot-time merit-flag attestation).
- `.planning/phases/21-integration-validation-and-cutover/21-VERIFICATION.md` (when present) — operator-evidence shape Phase 27 must not break.
- `.planning/phases/12-stripe-products-and-webhook/12-CONTEXT.md` — webhook handler contract that Phase 27 is protecting (the active handler at `supabase/functions/stripe-webhook-handler/`).
- `.planning/phases/13-merit-enforcement-and-feature-flag/13-CONTEXT.md` D-07 — the gated handler list; `interview-prep-analyze` is one of them.
- `.planning/phases/23-interview-prep-runtime-overhaul/23-CONTEXT.md` — Phase 23 was rebuilt merit-only by design (the rollback caveat exists because of these decisions).
- `.planning/ROADMAP.md` §"Phase 25: ux-gap-closure-and-phase-23-cleanup" SC-9 — the overlapping `interview-prep-coach delete` step that D4 ack must coordinate with.

### Source Files (the code/scripts being changed)
- `supabase/functions/stripe-webhook/index.ts` — current Phase 07 handler being replaced with the 410 shim.
- `supabase/functions/stripe-webhook/index.test.ts` — to be deleted.
- `supabase/functions/stripe-webhook/price-resolver.ts` and `price-resolver.test.ts` — to be deleted (verify no cross-imports first).
- `supabase/functions/stripe-webhook/DEPLOY_RUNBOOK.md` — to be replaced with deprecation notice.
- `supabase/functions/stripe-webhook-handler/index.ts` — the active handler (NOT modified by Phase 27; referenced by the shim's response body).
- `supabase/functions/_shared/logger.ts` — `createLogger('stripe-webhook')` and `log.warn` API used by the shim.
- `supabase/functions/_shared/cors.ts` — `handleOptionsRequest({ type: 'webhook' })` for OPTIONS handling.
- `scripts/phase21-runbook.ps1` — Gate D1 (`Stage-D1-Preflip`, ~line 487), Gate D2 (`Stage-D2-Flip`, ~line 519), Gate D4-Finalize (`Stage-D4-Finalize`, ~line 725); helpers `Confirm-Or-Exit`, `Write-Step`, `Write-Note`, `Append-Evidence`, `Iso-Now`.
- `scripts/deploy-staging.ps1` line 31 and `scripts/deploy-production.ps1` line 31 — `stripe-webhook` deploy entries (NOT modified, but planner should re-verify no related cleanup gets accidentally rolled in).

### Operator-Facing Artifacts (Phase 27 produces or links to these)
- `.planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md` — to be hand-authored per SC-5 and D-13/14/15/16.
- `.planning/phases/21-integration-validation-and-cutover/21-CUTOVER-LOG.md` — runbook appends evidence here for D1/D2/D4 acks (D-12).
- `scripts/cutover-production.ps1` — `Invoke-MeritFlagFlip` / `Invoke-MeritFlagRollback` referenced from D2's red banner (NOT modified by Phase 27, but the rollback caveat references its rollback path).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `createLogger('stripe-webhook')` from `_shared/logger.ts`: shim emits its single warn line through this helper — no new logger surface needed. Each entry includes `level`, `msg`, `fn`, `ts`, plus our custom `req_id`, `ua`, `sig_present` fields.
- `handleOptionsRequest({ type: 'webhook' })` from `_shared/cors.ts`: webhook CORS policy is no-CORS (Stripe servers, not browsers). The shim reuses this for the `OPTIONS` branch with zero new code.
- `crypto.randomUUID()` (Deno built-in): no import needed.
- `Confirm-Or-Exit "<message>" "<expected-phrase>"` in `scripts/phase21-runbook.ps1`: typo-protected typed-phrase confirmation pattern. D-08/09/10 reuse it directly.
- `Append-Evidence $cutoverLog $stamp` helper in the runbook: appends a here-string block with a `---` separator and ISO timestamp to the cutover log. D-12 reuses it for each new ack.

### Established Patterns
- **Webhook handler shape**: read raw body (or skip in shim's case), verify, branch by event type, return JSON with stable shape, log.info/warn with structured fields. The shim is a degenerate version: skip verify, no branching, log.warn + return 410.
- **Operator-runbook gates**: each gate is a function (`Stage-D1-Preflip`, `Stage-D2-Flip`, etc.). Confirmations use `Confirm-Or-Exit`. Evidence is appended via `Append-Evidence` to phase-21-owned files. Phase 27 hooks INTO existing gates rather than adding new ones.
- **Phase-evidence file naming**: `21-CUTOVER-LOG.md`, `21-SC5-EVIDENCE.md`, `21-STAGING-SOAK.md` all live under `.planning/phases/21-integration-validation-and-cutover/`. SC-5 mandates `21-CUTOVER-NOTES.md` lives in the phase 27 directory instead — **DO NOT auto-relocate** during planning.
- **Test convention**: Deno unit tests run via `scripts/run-edge-tests.ps1`; new `index.test.ts` for the shim slots in alongside the existing edge tests automatically.

### Integration Points
- Stripe production dashboard webhook URL → `/functions/v1/stripe-webhook` (legacy, becomes 410 shim) OR `/functions/v1/stripe-webhook-handler` (active). The dashboard URL is the single config that determines whether merit grants/credits land — Phase 27 makes the wrong URL fail loud instead of silently 200-ignoring.
- `phase21-runbook.ps1` Gate D1/D2/D4 → existing checklist confirm + red-banner flip + finalize commits. Phase 27 inserts new prompts BEFORE existing confirms (D1, D2) and AFTER existing finalize logic (D4). No re-ordering of existing logic.
- `21-CUTOVER-LOG.md` → existing pre-flip checklist template + flip transcript appender. New ack lines append to this same file via the existing `Append-Evidence` helper. Operator reading the log post-cutover sees all four safety-net acks in order.
- `21-CUTOVER-NOTES.md` (new) → not loaded by any code path; pure operator-facing reference. Linked from runbook `Write-Note` pointers and from the shim's deprecation `DEPLOY_RUNBOOK.md`.

</code_context>

<specifics>
## Specific Ideas

- The shim's response body should match SC-1 exactly: `{ "error": "endpoint_deprecated", "use": "/functions/v1/stripe-webhook-handler" }`. `req_id` is added per D-03 but the SC-1-mandated keys must remain.
- The D2 ack should sit visually BEFORE the red `FLIP PROD` banner, not nested inside it. Two distinct decisions = two distinct prompts.
- Project refs in `phase21-runbook.ps1` are HARD-CODED (`$STAGING_REF = "cimjltzovkahkqecpwgi"`, `$PROD_REF = "zjpjapgraoxdukdvpjes"`) — Phase 27 does NOT touch these.
- Operator typing pattern: lowercase phrases get rejected. `Confirm-Or-Exit` does case-sensitive comparison; new D1/D2/D4 ack phrases follow the SHOUTY convention (`STRIPE URL VERIFIED`, `ACK INTERVIEW PREP ROLLBACK BRICKS 503`, `ACK`).

</specifics>

<deferred>
## Deferred Ideas

- **Full deletion of legacy `stripe-webhook/` directory + deploy-script entries.** Trigger: production logs show zero `legacy_endpoint_hit` warnings for 30 consecutive days post-cutover. Captured via `/gsd-plant-seed` follow-up; not part of Phase 27. (D-19)
- **`stripe_webhook_events` audit query for legacy hits.** The shim doesn't insert misroute rows by design (D-02). If we later want SQL-countable forensics, that's an additive Phase 28+ change to the shim (or a separate observability phase). Not in Phase 27.
- **Two-phrase ACCEPT / ROLL FORWARD ack for D2.** Rejected in favor of single-phrase ack (D-09). Operator decisions about rollback-vs-roll-forward belong to the rollback moment, not the flip moment.
- **Auto-detect-and-skip for D4 delete reminder.** Rejected in favor of unconditional ack (D-10). Adds CLI surface and noise without proportional value — operator typing one ack phrase is cheaper than maintaining a Supabase functions-list query.
- **sc5-probe.ps1 extension to verify the 410 shim during staging soak.** Rejected (D-05) — unit test coverage is sufficient for a 30-line file; if regression is a concern, the planted seed for cleanup also covers it.
- **Adding a `# DEPRECATED` comment marker in deploy-{staging,production}.ps1.** Rejected (D-17) — `DEPLOY_RUNBOOK.md` deprecation notice + `21-CUTOVER-NOTES.md` cross-ref are sufficient discoverability.

### Reviewed Todos (not folded)
None reviewed — todo cross-reference unavailable in this environment. Planner should run `gsd-sdk query todo.match-phase 27` at plan time and fold any matches.

</deferred>

---

*Phase: 27-cutover-safety-net*
*Context gathered: 2026-04-28*
