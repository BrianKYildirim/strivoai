# Phase 27: cutover-safety-net - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-28
**Phase:** 27-cutover-safety-net
**Areas discussed:** 410-Gone shim shape, Runbook prompt severity, 21-CUTOVER-NOTES.md format, Deploy + deprecation surface

---

## 410-Gone shim shape

### Q1 — Signature verification policy

| Option | Description | Selected |
|--------|-------------|----------|
| Blanket-reject, no verify (Recommended) | Drop signature/secret read entirely; any POST → 410. Simplest possible shim; we want it loud regardless of whether STRIPE_WEBHOOK_SECRET happens to be set. | ✓ |
| Verify, then 410 | Keep signature verification so unauthenticated probes get 401, only legit Stripe traffic gets 410. | |
| You decide | Defer to planner/executor. | |

**User's choice:** Blanket-reject, no verify
**Notes:** Aligned with "fail loud" intent. Stripe retries on 410 are acceptable and informative.

### Q2 — Forensic DB write

| Option | Description | Selected |
|--------|-------------|----------|
| Skip the table (Recommended) | log.warn legacy_endpoint_hit only; no stripe_webhook_events insert. Pure 410 with zero DB dependency. | ✓ |
| Insert with type='legacy_endpoint_hit' | Persist forensic rows so we can SQL-count misroutes; adds service-client surface. | |
| Log only, full payload echo | log.warn dumps parsed body shape (event id, type, livemode); no DB. | |

**User's choice:** Skip the table

### Q3 — Disposition of existing test/helper files

| Option | Description | Selected |
|--------|-------------|----------|
| Delete all three, add tiny shim test (Recommended) | Delete index.test.ts, price-resolver.ts, price-resolver.test.ts; replace with 30-line shim test. | ✓ |
| Keep price-resolver.ts (cross-imported elsewhere?) | Verify no cross-imports first; if used by stripe-webhook-handler/, move to _shared/ first. | |
| Keep all files, just rewrite index.ts | Leave dead code; tests would fail or need skips. | |

**User's choice:** Delete all three, add tiny shim test
**Notes:** Planner must verify no cross-imports before delete. _shared/test-helpers/stripe-{fixtures,signature}.ts are likely still used by stripe-webhook-handler — leave alone.

### Q4 — req_id source

| Option | Description | Selected |
|--------|-------------|----------|
| Generate via crypto.randomUUID() (Recommended) | Fresh UUID per request; included in BOTH warn log AND response body for triangulation. | ✓ |
| Read X-Request-Id / Stripe-Signature timestamp | Pull inbound id-ish header; fallback to randomUUID. | |
| Omit req_id from response, log-only | createLogger emits ts; req_id only in warn line. | |

**User's choice:** Generate via crypto.randomUUID()

### Q5 — Test depth

| Option | Description | Selected |
|--------|-------------|----------|
| Deno unit test only (Recommended) | POST 410, body shape, log.warn called with legacy_endpoint_hit + req_id. Operator manually curls in D1 if desired. | ✓ |
| Unit test + manual smoke step in D1 | Add Write-Step that curl-POSTs the legacy URL pre-flip. | |
| Unit test + sc5-probe.ps1 hits legacy URL too | Extend probe to verify 410 during soak. | |

**User's choice:** Deno unit test only

---

## Runbook prompt severity

### Q1 — D1 Stripe URL pin enforcement

| Option | Description | Selected |
|--------|-------------|----------|
| Confirm-Or-Exit typed phrase (Recommended) | New Confirm-Or-Exit "Type 'STRIPE URL VERIFIED'" before existing checklist confirm. Typo-protected; matches FLIP PROD pattern. | ✓ |
| Y/N Confirm-Or-Exit | Plain default-y Confirm-Or-Exit; easier to muscle-memory through. | |
| Self-tick checkbox in 21-CUTOVER-LOG.md | Append [ ] line to the existing Pre-Flip Checklist template. | |

**User's choice:** Confirm-Or-Exit typed phrase

### Q2 — D2 rollback caveat surface

| Option | Description | Selected |
|--------|-------------|----------|
| Separate Confirm-Or-Exit ack BEFORE FLIP PROD (Recommended) | New typed-phrase ack distinct from FLIP PROD; two decisions = two acks; clean transcript audit. | ✓ |
| Extra red-banner lines in existing prompt | Bake caveat into existing red banner; single FLIP PROD confirm. | |
| Write-Note informational only | Print caveat as Write-Note before red banner; rely on operator to read. | |

**User's choice:** Separate Confirm-Or-Exit ack BEFORE FLIP PROD

### Q3 — D4-Finalize delete reminder

| Option | Description | Selected |
|--------|-------------|----------|
| Confirm-Or-Exit ack (run-or-deferred-OK) (Recommended) | Operator may ack without running if Phase 25 covers it; explicit acknowledgement either way. | ✓ |
| Write-Note informational only | Just print reminder; operator reads, moves on. | |
| Auto-detect: skip note if Phase 25 ran the delete | Query supabase functions list; skip if interview-prep-coach already gone. | |

**User's choice:** Confirm-Or-Exit ack (run-or-deferred-OK)

### Q4 — D2 caveat ack shape

| Option | Description | Selected |
|--------|-------------|----------|
| Single typed ack, no choice (Recommended) | One phrase like 'ACK INTERVIEW PREP ROLLBACK BRICKS 503'; rollback decisions belong to rollback moment. | ✓ |
| Two phrases: ACCEPT vs ROLL FORWARD | Operator picks one; persisted as stated stance. | |
| Append free-text rationale to cutover log | Plus a free-text "why are you proceeding" line. | |

**User's choice:** Single typed ack, no choice

---

## 21-CUTOVER-NOTES.md format

### Q1 — Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Per-concern markdown memo (Recommended) | Four short sections, ~5-10 lines each: legacy webhook risk, IP rollback caveat, Stripe URL pin, Phase 25 dependency. | ✓ |
| Operator-checklist-style | One [ ] line per concern operator ticks during cutover. | |
| Cross-ref pointer doc | Short doc pointing to file:line in phase21-runbook.ps1 and v2.0-MILESTONE-AUDIT.md. | |

**User's choice:** Per-concern markdown memo

### Q2 — Source / mutability

| Option | Description | Selected |
|--------|-------------|----------|
| Hand-written, ships in PR (Recommended) | Static documentation glue; never mutated by runbook; consistent with how SUMMARY-style docs ship. | ✓ |
| Hand-written skeleton + runbook appends timestamps | Mixes static doc with mutable evidence. | |
| Pure template, runbook fills it | Empty skeleton in Phase 27; runbook generates body at D1. | |

**User's choice:** Hand-written, ships in PR

### Q3 — Linkage from runbook

| Option | Description | Selected |
|--------|-------------|----------|
| Runbook prints relative path in D1/D2/D4 (Recommended) | Each new prompt includes Write-Note "see .planning/phases/27/.../21-CUTOVER-NOTES.md §<concern>". | ✓ |
| Standalone, no in-runbook reference | Operators discover via phase directory or audit doc. | |
| Inline content directly into runbook prompts | Skip separate file; embed concern blurbs inline (violates SC-5). | |

**User's choice:** Runbook prints relative path in D1/D2/D4

### Q4 — Cross-references

| Option | Description | Selected |
|--------|-------------|----------|
| Cross-ref both with full relative paths (Recommended) | Header lists 21-CUTOVER-LOG.md, v2.0-MILESTONE-AUDIT.md §Top concerns, and phase21-runbook.ps1 (D1/D2/D4). | ✓ |
| Self-contained memo, no cross-refs | Just the four concerns as plain text. | |
| Cross-ref only to phase21-runbook.ps1 | Reference runbook only; treat audit as upstream context, log as downstream evidence. | |

**User's choice:** Cross-ref both with full relative paths

---

## Deploy + deprecation surface

### Q1 — Deploy script entries

| Option | Description | Selected |
|--------|-------------|----------|
| Keep both, no script changes (Recommended) | SC-1 says "function continues to deploy". Zero script changes. | ✓ |
| Add a comment marker in both scripts | Keep entries plus '# DEPRECATED 410 shim — see ...' comment. | |
| Move to a separate 'legacy_functions' array | Refactor to declare LEGACY_410_FUNCTIONS array. | |

**User's choice:** Keep both, no script changes

### Q2 — DEPLOY_RUNBOOK.md disposition

| Option | Description | Selected |
|--------|-------------|----------|
| Replace with deprecation notice (Recommended) | Overwrite with ~10-line deprecation pointer to stripe-webhook-handler and 21-CUTOVER-NOTES.md. | ✓ |
| Add a banner at top, keep existing content | Prepend warning; preserve obsolete Phase 07 deploy notes. | |
| Delete DEPLOY_RUNBOOK.md | Remove file; risk: future operator has no readme. | |

**User's choice:** Replace with deprecation notice

### Q3 — Follow-up cleanup

| Option | Description | Selected |
|--------|-------------|----------|
| Plant seed via /gsd-plant-seed (Recommended) | Trigger: 30 consecutive days zero legacy_endpoint_hit warnings post-cutover → delete legacy stripe-webhook/ + deploy entries. | ✓ |
| Inline TODO comment in shim source | // TODO: delete this whole function once log shows zero hits for 30d. | |
| Skip — cleanup is a future operator concern | Next milestone audit will spot it. | |

**User's choice:** Plant seed via /gsd-plant-seed

### Q4 — supabase/config.toml changes

| Option | Description | Selected |
|--------|-------------|----------|
| No config.toml changes (Recommended) | Webhooks already disable JWT verify; shim doesn't read auth so default behavior is fine. Planner verifies no per-function block constrains stripe-webhook. | ✓ |
| Set verify_jwt = false explicitly for the shim | Belt-and-suspenders against future Supabase default changes. | |
| You decide | Defer to planner/executor based on current state. | |

**User's choice:** No config.toml changes

---

## Claude's Discretion

- Exact phrase wording for the D2 typed ack (e.g., `ACK INTERVIEW PREP ROLLBACK BRICKS 503` vs shorter alternatives).
- Exact phrase wording for the D4 delete-reminder ack.
- Where in `Stage-D1-Preflip` the URL-pin prompt slots (before vs after secrets-state print).
- Whether the D2 caveat ack lives inside `Stage-D2-Flip` or as a new helper function.
- H1 + H2 vs H2 + H3 heading hierarchy in `21-CUTOVER-NOTES.md`.
- Whether to add a one-line summary of the safety-net to `21-CUTOVER-LOG.md` template.

## Deferred Ideas

- Full deletion of legacy `stripe-webhook/` directory + deploy-script entries. Captured via `/gsd-plant-seed`; trigger condition: 30 consecutive days zero `legacy_endpoint_hit` warnings post-cutover.
- `stripe_webhook_events` audit query for legacy hits — additive Phase 28+ work; not Phase 27.
- Two-phrase ACCEPT / ROLL FORWARD ack for D2 — rejected in favor of single-phrase ack.
- Auto-detect-and-skip for D4 delete reminder — rejected; unconditional ack is cheaper.
- sc5-probe.ps1 extension to verify the 410 shim — rejected; unit test is sufficient for a 30-line file.
- `# DEPRECATED` comment markers in deploy-{staging,production}.ps1 — rejected; `DEPLOY_RUNBOOK.md` notice + cross-ref are sufficient.
