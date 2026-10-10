---
phase: 04
slug: incremental-elite-unlock-for-previously-analyzed-free-tier-resumes
status: complete
created: 2026-07-30
context_file: false
research_mode: inline-fallback
---

# Phase 04 Research: Incremental Elite Unlock

## Research Outcome

The existing resume-analysis system can support incremental Elite unlock without a
parallel analysis stack. The smallest cohesive change is to add an
`elite_unlock` mode to the current `analyze-resume` flow, generate a strictly
allowlisted paid-field patch from the stored Free analysis, merge it without
assigning any Free-owned value, and atomically persist the merged result on the
same `resumes` record.

The configured `gsd-phase-researcher` could not run because its fixed
`gpt-5.3-spark` model is unsupported for this ChatGPT-backed Codex account.
This document records direct repository research instead; it does not claim the
configured researcher ran successfully.

## Current Flow

### Frontend

- `src/components/EliteRerunCta.tsx` shows a rerun affordance when the current
  account is Elite and the stored resume has `analyzed_tier = 'free'`.
- `src/hooks/useEliteRerun.ts` currently clones the Free `resumes` row, stores a
  local lease for the clone, and starts a normal Elite analysis against the
  clone. This intentionally produces a second history row and regenerates the
  complete result.
- `src/pages/Upload.tsx` identifies same-content uploads using `file_hash` and
  tier. A Free result viewed after an upgrade bypasses the current cache because
  the tiers differ.
- `src/hooks/useResumeStream.ts` sends the full resume text and normal analysis
  parameters to `analyze-resume`.
- `src/pages/Results.tsx` already supports the desired final display. It renders
  the Free-gated shape when `analyzed_tier = 'free'` and the full result when the
  stored tier becomes Elite. No parallel results page is needed.

### Backend and AI

- `supabase/functions/analyze-resume/index.ts` resolves the account tier on the
  server, performs either the Free single-call analysis or the full paid
  multi-call analysis, then updates `resumes` and inserts a mirror row in
  `analysis_results`.
- The full Elite path calls criteria, summary, rewrites, and extras prompts. It
  necessarily rescales or rewrites fields already generated for Free and cannot
  satisfy byte/deep-value preservation.
- `supabase/functions/_shared/result-merger.ts` applies tier shapes but is a
  full-result merger. Its Free shape preserves only one priority improvement,
  one rewrite, and detailed C6 feedback. A separate allowlisted delta merger is
  needed.
- `supabase/functions/_shared/resume-prompts.ts` already has an Elite extras
  instruction that forbids rescoring. It can be reused or factored, but the
  other missing paid fields need a dedicated conditional delta prompt.
- `supabase/functions/analyze-resume/resume-validation.ts` validates complete
  analysis results. The unlock path also needs a narrow patch validator before
  merge and the existing full validator after merge.
- `supabase/functions/_shared/anthropic.ts` and
  `supabase/functions/_shared/ai-telemetry.ts` already record model, call name,
  token counts, limits, duration, and status. Distinct incremental call names
  will make incremental cost observable without another telemetry system.

### Persistence and Identity

- `resumes` already contains the strongest source identity available to this
  flow: `id`, `user_id`, `file_hash`, `text_hash`, `document_hash`,
  `extracted_text`, `grading_data`, and `analyzed_tier`.
- `analysis_results` contains the immutable analysis mirror, owner,
  `source_reference`, `raw_response`, score, and metadata tier.
- `usage_tracking.analysis_id` can link the charged usage to the newly persisted
  merged analysis mirror.
- The existing analyzed-tier migration revokes client writes to
  analysis-owned fields. The server or a service-role-only RPC must remain the
  sole writer.
- Filename is unsuitable for eligibility and must not participate in the
  identity decision.

## Acceptance Behaviors

| ID | Required behavior |
|---|---|
| AC-01 | The exact stored Free-owned values survive unlock unchanged. |
| AC-02 | Only missing Elite-visible fields are requested from the model. |
| AC-03 | The patch is merged into the same stored resume and persists. |
| AC-04 | A later load or rerun makes zero additional model calls. |
| AC-05 | Eligibility requires owner, original Free tier, current Elite tier, valid base, matching stable identities, and at least one missing paid field. |
| AC-06 | Incremental model usage, tokens, call count, and merit usage are linked and logged accurately. |
| AC-07 | Generation, validation, or persistence failure cannot alter the Free result. |
| AC-08 | Changed content follows the existing new/full-analysis path. |
| AC-09 | Duplicate/concurrent unlock requests cannot double-generate, double-charge, or overwrite a newer result. |

## Recommended Design

### 1. Extend the existing request path

Change `useEliteRerun` to start `mode: 'elite_unlock'` against the existing
resume ID. Do not clone the row. Add only the stable identifiers needed by the
server contract, such as the source `resumeId` and an optional `baseAnalysisId`.
The client-provided tier, owner, text, and analysis blob are never authoritative.

The server should branch into the unlock path after authentication and
server-side tier resolution but before full-analysis cache lookup, full prompt
construction, or merit-backed generation.

### 2. Resolve and verify the base on the server

Load the `resumes` row with both `id = resumeId` and `user_id = authenticated
user`. Require:

- current server-resolved access is Elite;
- the row was analyzed as Free;
- `grading_data` and stored extracted text are present and validate;
- a Free `analysis_results` mirror belongs to the same user and has
  `source_reference = resume.id`;
- any supplied base analysis ID matches that mirror;
- stored file/text/document identity agrees with the base snapshot; and
- the missing-section detector reports at least one missing paid field.

For unlock, use the stored `extracted_text`; do not accept a replacement
`resumeText`. A content or identity mismatch returns a conflict and directs the
caller through the existing fresh-upload/full-analysis path.

### 3. Define immutable ownership and missing sections

Add a focused shared helper, for example
`supabase/functions/_shared/resume-elite-unlock.ts`, with pure functions for:

- validating the stored Free base;
- projecting the immutable Free-owned values;
- detecting missing paid fields;
- validating the model patch; and
- merging only allowlisted missing fields.

Free-owned values include the original overall score, executive summary, resume
signal, strengths, every original priority-improvement entry, every original
rewrite entry, and existing criterion identity/score/weight/feedback values.
Original array entries remain deep-equal prefixes of the merged arrays.

The paid delta may only:

- add feedback to criteria that do not already have feedback;
- append additional priority improvements and rewrites;
- set absent `industryGuess`, `suggestedTargetRoles`, and
  `recommendedKeywords`; and
- set absent `eliteInsights`.

The merger must never spread a model object over the base object. It should
construct the result from the base and assign only explicitly detected missing
paths. Existing paid values are also preserved.

### 4. Generate a conditional delta

Build the output schema from the missing-section set. A details call can cover
missing criterion feedback, appended improvements/rewrites, industry guess,
target roles, and keywords. An Elite-extras call should run only when
`eliteInsights` is missing.

Prompts must:

- use sanitized stored resume text;
- include only the base context needed to generate the missing values;
- state that scoring and existing content are immutable;
- return only the requested delta schema; and
- use explicit telemetry call names such as `elite-unlock-details` and
  `elite-unlock-extras`.

No call is made when the missing-section set is empty. The existing full result
validator runs after the allowlisted merge and before persistence.

### 5. Persist atomically and retain history

Use a new, additive, service-role-only database RPC or equivalent single
transaction. It should:

- lock the owner/resume identity;
- recheck owner, original tier, source analysis relation, expected content
  hashes, and the expected base `grading_data` value/fingerprint;
- treat an already-complete Elite row as an idempotent success;
- update that same `resumes` row with the merged blob and `analyzed_tier =
  'elite'`;
- insert a new merged `analysis_results` mirror with metadata containing
  `generation_mode = 'incremental_unlock'`, `base_analysis_id`, and generated
  section names; and
- associate existing usage accounting with the merged mirror.

Do not update or delete the original Free mirror. If compare-and-swap checks
fail, write nothing and return a conflict. Validate both patch and merged result
before entering this transaction.

### 6. Make generation and charging idempotent

Derive the unlock idempotency identity from authenticated user, source resume
ID, Free base analysis ID, base grading fingerprint, and normalized unlock
mode. Do not use filename, a clone ID, or a new random nonce as the durable
identity.

Reuse the existing analysis lifecycle and merit gateway. Preflight eligibility
before reservation; recheck before generation and persistence. Concurrent
requests must converge on one run/result. A replay after completion returns the
stored merged result with no model invocation or additional charge.

Keep the existing configured Resume Analysis merit price unless product policy
explicitly changes it. “Accurate incremental cost” should be satisfied by actual
incremental Anthropic token telemetry plus one existing usage transaction linked
to the merged analysis, not by inventing a new client-side price.

### 7. Keep the frontend on existing components

Update the rerun CTA and hook contract from “full rerun on a clone” to “unlock
Elite sections on this result.” Continue using the existing Results streaming
and reload behavior. Once the authoritative same-row update reports
`analyzed_tier = 'elite'`, the current full-results layout should render the
merged blob.

If the asynchronous resume-job fallback remains reachable for this request,
thread the additive mode and stable base identifiers through
`submit-resume-analysis-job`, `process-resume-analysis-job`, and their existing
payload validators rather than building another worker.

## Threat Model

| ID | Threat | Required mitigation |
|---|---|---|
| T-04-01 | IDOR through a foreign resume or analysis ID | Scope every lookup and RPC check to the authenticated user and verify source-reference linkage. |
| T-04-02 | Client tier forgery | Ignore the body tier; resolve current Elite access from authenticated server state. |
| T-04-03 | Model patch overwrites Free output | Validate an allowlisted delta and construct the merge path-by-path from the immutable base. |
| T-04-04 | Changed-document replay | Use resume/analysis IDs plus content hashes/fingerprint and stored text, never filename or replacement client text. |
| T-04-05 | Concurrent lost update or duplicate cost | Stable idempotency, lifecycle reuse, row/advisory lock, and compare-and-swap persistence. |
| T-04-06 | Prompt injection from stored resume | Pass stored text through the existing prompt sanitizer and keep output schema constrained. |
| T-04-07 | Partial persistence erases Free data | No write before validation; perform update, mirror insertion, and required accounting atomically. |
| T-04-08 | Privileged RPC abuse | Service-role-only execute grant, fixed search path, explicit predicates, and no public/authenticated grant. |
| T-04-09 | Sensitive content in telemetry | Log identifiers, section names, token/cost counts, and statuses only; never prompts or resume contents. |

## Validation Architecture

### Test layers

1. **Pure Deno unit tests**
   - Missing-section detection for complete, incomplete, and partially unlocked
     blobs.
   - Deep-freeze/deep-equality assertions for every Free-owned field.
   - Allowlist rejection for patches attempting to change score, summary,
     strengths, existing array items, or criterion scores.
   - Merge idempotency and no-op behavior.

2. **Analyze-resume contract tests**
   - Owner, original-tier, current-tier, base-analysis linkage, valid-data, and
     content-identity guards.
   - Conditional prompt/call selection and zero-call completed replay.
   - Stable idempotency, refund boundaries, validation failure, and persistence
     conflict.
   - Telemetry call names and actual incremental call counts.

3. **Frontend Vitest tests**
   - `useEliteRerun` updates the same resume instead of inserting a clone.
   - The request carries unlock mode and stable IDs.
   - CTA eligibility/copy and Results tier reconciliation.
   - Completed unlock clears the in-flight lease and reveals persisted sections.

4. **Remote database tests**
   - RPC ownership and grants.
   - Compare-and-swap and concurrent replay.
   - Original Free mirror remains byte/deep-value unchanged.
   - Same resume becomes Elite, merged mirror is inserted once, and usage links
     to it.

5. **Regression gates**
   - Focused Vitest and Deno commands after each task.
   - `npm run lint`, `npm run type-check`, `npm run build`, and finally
     `npm run verify:baseline`.

### Deployment validation

Any migration must be linked and pushed to the preview/staging Supabase project
through the repository deployment script and verified there first. The default
Supabase config references production, so raw unverified `supabase db push` is
unsafe. Production remains untouched until the operator explicitly says
`apply production`.

## Planning Boundaries

- Extend `analyze-resume`, its current lifecycle/merit/telemetry helpers, the
  existing resume tables, and the existing Results UI.
- Do not create a second analysis API, result table, page, or billing system.
- Do not modify `.gitignore` or commit `.planning` artifacts.
- Treat a missing UI contract as a planning safety gate because the phase
  changes a frontend CTA/loading interaction, even though it reuses the current
  layout.

