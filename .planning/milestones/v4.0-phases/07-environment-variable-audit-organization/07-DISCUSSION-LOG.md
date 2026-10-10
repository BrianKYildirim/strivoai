# Phase 7: Environment Variable Audit & Organization - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-20
**Phase:** 7-environment-variable-audit-organization
**Areas discussed:** Canonical env-ref home (ENV-03), Removal scope (ENV-02), Separation proof (ENV-04), Fail-closed depth (ENV-05)

---

## Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Canonical env-ref home (ENV-03) | Where the canonical env reference lives; dangling .gitignore whitelist | ✓ |
| Removal scope (ENV-02) | How aggressive on removal under zero-functional-change; live-store access | ✓ |
| Separation proof (ENV-04) | Verify staging/prod separation + no cross-env leakage | ✓ |
| Fail-closed depth (ENV-05) | Confirm-only vs add-where-missing for critical-secret validation | ✓ |

**User's choice:** All four areas selected.

---

## Canonical env-ref home (ENV-03)

### Q1 — Where should the canonical env reference live?

| Option | Description | Selected |
|--------|-------------|----------|
| Templates + docs file | Re-create .env.example + .env.test.local.example AS source, PLUS narrative docs/ENVIRONMENT.md; README/CLAUDE.md point at them | ✓ |
| Templates only | Re-create only the two templates as single source of truth, with inline which-env matrix; no separate docs file | |
| Docs file only | Honor the removal: leave templates deleted, remove the dangling .gitignore whitelist, docs/ENVIRONMENT.md canonical | |

**User's choice:** Templates + docs file.
**Notes:** Resolves the dangling `!.env.example` / `!.env.test.local.example` whitelist by re-validating it. The templates were deliberately removed at `0d5b1eff` (2026-06-13); Phase 7 reverses that with a complete canonical version.

### Q2 — How to split content across the three artifacts?

| Option | Description | Selected |
|--------|-------------|----------|
| 3-way clean split | .env.example = prod runtime; .env.test.local.example = test/CI + E2E; docs/ENVIRONMENT.md = full matrix | ✓ |
| Single template, test section | One .env.example with a delimited TEST/CI block; .env.test.local.example for E2E subset | |
| Lock buckets, planner places | Operator locks 4 buckets + status; planner decides file placement + matrix format | |

**User's choice:** 3-way clean split.
**Notes:** Also satisfies ENV-04's "split the 27 test names out of the production bucket."

### Q3 — How to keep the reference aligned over time?

| Option | Description | Selected |
|--------|-------------|----------|
| Re-runnable command, no gate | Build via the ENV-INVENTORY.md rg enumeration; embed command in docs for on-demand re-verify; no CI gate | ✓ |
| Add audit:env script (off-gate) | scripts/audit/check-env-docs.mjs diffing code reads vs docs; manual/optional CI, off verify:baseline | |
| audit:env + block in CI | Same script wired as a failing check | |

**User's choice:** Re-runnable command, no gate.
**Notes:** Mirrors the existing audit-script/re-runnable-inventory pattern; lowest risk under zero-functional-change.

---

## Removal scope (ENV-02)

### Q1 — What surface does ENV-02 remove/consolidate act on?

| Option | Description | Selected |
|--------|-------------|----------|
| Code + docs; store = operator list | Act on the repo; live-store un-sets are an operator action list (names only); never write prod secrets | ✓ |
| Also clean preview store via MCP | Same, plus un-set confirmed-dead secrets in the writable preview/test store | |
| Docs-reconcile only | Pure documentation reconciliation; defer all actual removals | |

**User's choice:** Code + docs; store = operator list.
**Notes:** MCP prod is read-only and the secrets store is not MCP-reachable; preview mutation risks the shared staging/test E2E env.

### Q2 — How to resolve the needs-investigation set?

| Option | Description | Selected |
|--------|-------------|----------|
| Evidence-based, KEEP on doubt | Re-run at HEAD; OCR fallbacks KEEP; orphans grepped; test seams documented; nothing removed unless provably dead | ✓ |
| Aggressive: remove if not live | Flag orphans + unconfirmed OCR for removal unless positively proven live | |
| Defer all to RESIDUAL-REGISTER | Document the whole set as carried-forward unknowns | |

**User's choice:** Evidence-based, KEEP on doubt.
**Notes:** OLLAMA_* confirmed code-dead post-Phase-4 (only a test-file ref remains; prod OLLAMA_BASE_URL unset) → operator un-set list. MISTRAL_OCR_*/TEXTRACT_OCR_* clients code-live → KEEP.

---

## Separation proof (ENV-04)

### Q1 — How to verify separation + no cross-env leakage?

| Option | Description | Selected |
|--------|-------------|----------|
| Static doc + operator secret-list diff | Topology from deploy.ps1 + operator-run secret-name diff (prod + preview) | |
| Static repo-only | Verify purely from repo evidence; no live read | |
| Full cross-surface audit | Operator lists names from both Supabase projects + GitHub Actions + Vercel; reconcile full matrix | ✓ |

**User's choice:** Full cross-surface audit.
**Notes:** Topology reality documented honestly — staging≡test share `cimjltzovkahkqecpwgi`; prod is `zjpjapgraoxdukdvpjes`. Operator-gated checkpoint (`autonomous:false`); names-only.

### Q2 — Action when a leakage / misplaced secret is found?

| Option | Description | Selected |
|--------|-------------|----------|
| Document + operator fix list | Classified findings + operator action list (names only); we mutate no store | ✓ |
| Operator fixes in-phase, we re-verify | Operator executes fixes during the phase under guidance; re-audit before close | |
| We fix preview, operator fixes prod | Remediate writable preview findings; prod = operator list | |

**User's choice:** Document + operator fix list.
**Notes:** Thoroughness in evidence, conservatism in action — both inside zero-functional-change.

---

## Fail-closed depth (ENV-05)

### Q1 — What depth should ENV-05 validation go to?

| Option | Description | Selected |
|--------|-------------|----------|
| Confirm + add only where missing | Audit critical secrets; add a narrow guard ONLY where one fails open; each deploy-smoked | ✓ |
| Confirm + document ONLY | Pure audit; no code change; gaps flagged/deferred | |
| Central required-env helper | Shared assertRequiredEnv()/getRequiredEnv() wired into 27+ functions | |

**User's choice:** Confirm + add only where missing.
**Notes:** Edge-change blast-radius constraint (each addition needs a staging deploy-smoke); central helper deferred.

---

## Claude's Discretion

- Plan/commit slicing and wave structure.
- `docs/ENVIRONMENT.md` matrix format/columns; template grouping + comment style.
- Exact wording of the operator action lists (ENV-02 un-set list; ENV-04 cross-surface listing instructions).
- `OLLAMA_*` test-file reference handling (KEEP-on-doubt unless it asserts removed behavior).
- Whether the operator secret-name listings are gathered in one checkpoint or split.

## Deferred Ideas

- Central required-env assertion helper across all 27+ functions — rejected for blast radius; later-phase maintainability candidate.
- Automated env-docs drift-check (`scripts/audit/check-env-docs.mjs` / `npm run audit:env`) — rejected in favor of a documented re-runnable command; revisit if drift recurs.
- Aggressive removal / writable-preview-store cleanup by us — rejected; all live-store changes stay operator-confirmed.
