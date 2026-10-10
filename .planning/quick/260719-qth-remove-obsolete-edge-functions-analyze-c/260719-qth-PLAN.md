---
phase: quick-260719-qth
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/functions/chat-agent/index.ts
  - supabase/functions/chat-agent/handler-config.test.ts
  - supabase/functions/deno.json
  - supabase/functions/_shared/cors-audit.test.ts
  - supabase/functions/_shared/retired-feature-surface.test.ts
  - scripts/deploy.ps1
  - docs/ENVIRONMENT.md
autonomous: true

must_haves:
  truths:
    - "The chat-agent edge function no longer exists in the repo"
    - "No non-.planning file references chat-agent, analyze-career-v2, analyze-skills-gap, or compare-jobs as a function/deploy/test target"
    - "npm run test:edge (offline Deno gate) passes with chat-agent removed"
    - "npm run build, lint, and type-check stay green"
  artifacts:
    - path: "supabase/functions/_shared/retired-feature-surface.test.ts"
      provides: "Drift guard asserting chat-agent (plus already-retired slugs) cannot be reintroduced"
      contains: "chat-agent"
  key_links:
    - from: "supabase/functions/_shared/cors-audit.test.ts"
      to: "USER_FUNCTIONS length assertion"
      via: "count lowered 18 -> 17 after chat-agent removed"
      pattern: "USER_FUNCTIONS.length, 17"
    - from: "scripts/deploy.ps1"
      to: "Functions deploy list"
      via: "chat-agent entry removed"
      pattern: "chat-agent"
---

<objective>
Remove the obsolete `chat-agent` edge function and scrub every remaining repo reference to the four named obsolete functions (`analyze-career-v2`, `analyze-skills-gap`, `chat-agent`, `compare-jobs`).

Purpose: Delete dead backend surface so it can no longer be deployed, tested, or accidentally restored, keeping the edge-function set aligned with the live product.

Output: `chat-agent/` deleted; deploy script, deno test registry, CORS audit, and environment docs updated; drift guard extended so the retirement is enforced by the offline test gate.

**CRITICAL SCOPE FINDING (verified during planning — the executor must NOT re-do the removal of the other three):**
- `analyze-career-v2` — **does not exist** and has **zero** references anywhere in the repo (never present in git history for that path). Nothing to remove.
- `analyze-skills-gap` — **already removed** (git `d10ab847`/related). It is actively guarded by `supabase/functions/_shared/retired-feature-surface.test.ts`. Do NOT touch its guard entry.
- `compare-jobs` — **already removed** (git `d10ab847`). Also guarded by `retired-feature-surface.test.ts`. Do NOT touch its guard entry.
- `chat-agent` — **STILL EXISTS** (`supabase/functions/chat-agent/index.ts` + `handler-config.test.ts`). This is the ONLY function to delete.

DO NOT confuse the `skillGaps` / "skills-gap analysis" **output field** in `supabase/functions/analyze-career/index.ts` and `analyze-career/paid-output-validation.test.ts` with the removed `analyze-skills-gap` function — those are the live Career Compass Elite output contract and MUST be left untouched.

DO NOT touch the live `analyze-career` function — it is Career Compass, not `analyze-career-v2`.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# The only function that still exists among the four
@supabase/functions/chat-agent/index.ts
@supabase/functions/chat-agent/handler-config.test.ts

# Reference touchpoints to edit
@supabase/functions/_shared/cors-audit.test.ts
@supabase/functions/_shared/retired-feature-surface.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Delete chat-agent and scrub all references</name>
  <files>supabase/functions/chat-agent/index.ts, supabase/functions/chat-agent/handler-config.test.ts, supabase/functions/deno.json, supabase/functions/_shared/cors-audit.test.ts, supabase/functions/_shared/retired-feature-surface.test.ts, scripts/deploy.ps1, docs/ENVIRONMENT.md</files>
  <action>
Remove the `chat-agent` edge function and every reference to it. Concrete edits:

1. **Delete the function directory** `supabase/functions/chat-agent/` (both `index.ts` and `handler-config.test.ts`). Use `git rm -r supabase/functions/chat-agent` (or delete the files) so the whole directory is gone.

2. **`supabase/functions/deno.json`** — in the `test:ci` task string, remove the ` chat-agent/handler-config.test.ts` token (delete exactly that one test path and the single surrounding space so the remaining test list stays valid on one line). Leave every other test path byte-identical.

3. **`supabase/functions/_shared/cors-audit.test.ts`** — remove the `'chat-agent',` entry from the `USER_FUNCTIONS` array (it currently sits between `'interview-prep-evaluate'` and `'ocr-pdf'`). Then update the length guard: change `assertEquals(USER_FUNCTIONS.length, 18);` to `17`, and update the test name string `'CORS-05 audit covers exactly 18 user functions'` to `17`. (Note: the file's header comment says "20"/"21"; the load-bearing assertion is the numeric `18` → make it `17`. You may optionally correct the prose comment, but the numeric assertion + test-name are what must change.)

4. **`scripts/deploy.ps1`** — remove the `"chat-agent"` line from the default `$Functions` array (around line 37, the first entry). Keep PowerShell array syntax valid (entries are newline-separated with no commas in this array — just delete the whole `"chat-agent"` line).

5. **`docs/ENVIRONMENT.md`** — the `ANTHROPIC_MODEL_TEXT` row (line ~74) currently lists `chat-agent` as the consumer. The env var is still live (also consumed via `getModel` in `analyze-resume`/`analyze-career`), so DO NOT delete the row. Update the consumer cell to reflect the remaining consumers (e.g. `analyze-resume` / `analyze-career` via `getModel`), removing the `chat-agent` mention. Verify remaining consumers first with `rg -n 'ANTHROPIC_MODEL_TEXT' supabase/functions --glob '!*.test.ts'`.

6. **`supabase/functions/_shared/retired-feature-surface.test.ts`** — extend the drift guard so chat-agent cannot be reintroduced. Add `'chat-agent'` to the `retiredFunctionSlugs` array (it already contains the `analyze-skills-gap` and `compare-jobs` slugs, built via `.join('-')` to dodge the grep guard — follow the SAME construction style, e.g. `['chat', 'agent'].join('-')`, so this very test file does not trip the "zero references" check). This makes the guard assert `supabase/functions/chat-agent/index.ts` does not exist AND that `config.toml` / `deploy.ps1` do not include the slug. Do NOT alter the existing `analyze-skills-gap` / `compare-jobs` entries or the `SkillsGapAnalysis.tsx` / route assertions.

Do NOT touch: `supabase/functions/analyze-career/**` (Career Compass, live), the `skillGaps` output-field references, or the live `ANTHROPIC_MODEL_TEXT` consumers in analyze-resume/analyze-career.
  </action>
  <verify>
- `test ! -d supabase/functions/chat-agent` (directory gone).
- `rg -n 'chat-agent' --glob '!.planning/**'` returns ONLY the `.join('-')`-obfuscated construction inside `retired-feature-surface.test.ts` (no literal `chat-agent` string, no deploy/deno/cors-audit/docs hits).
- `rg -n 'analyze-career-v2|analyze-skills-gap|compare-jobs' --glob '!.planning/**'` returns only the already-existing obfuscated guard slugs in `retired-feature-surface.test.ts` and the unrelated `skillGaps`/"skills-gap analysis" OUTPUT-field references in `analyze-career` (which are NOT function-target references).
  </verify>
  <done>chat-agent directory deleted; deno.json, cors-audit.test.ts (count 17), deploy.ps1, and ENVIRONMENT.md updated; retired-feature-surface.test.ts now guards chat-agent too; no non-.planning file references chat-agent as a function/deploy/test target.</done>
</task>

<task type="auto">
  <name>Task 2: Verify baseline subset stays green</name>
  <files>(no edits — verification only)</files>
  <action>
Run the relevant `verify:baseline` subset to prove the removal caused zero functional regression, and confirm the reference scrub is complete.

Run in order and capture results:
1. `npm run lint`
2. `npm run type-check`
3. `npm run test` (vitest — frontend unaffected but proves no breakage)
4. `npm run test:edge` (offline Deno gate — this is the KEY gate; it runs the updated `deno.json` test:ci list and the extended `retired-feature-surface.test.ts` + `cors-audit.test.ts` count guard)
5. `npm run build`

Note: `npm run test:edge:remote` requires preview Supabase secrets and is out of scope for this offline removal — do not block on it (record as operator/CI concern if it is part of the merge gate).

If any step fails, fix the cause (most likely a stale `chat-agent` reference or the `USER_FUNCTIONS.length` count not matching) and re-run.
  </action>
  <verify>
- `npm run test:edge` passes (Deno test:ci green with chat-agent test removed and the two extended guards passing).
- `npm run lint`, `npm run type-check`, `npm run test`, `npm run build` all exit 0.
  </verify>
  <done>lint + type-check + vitest + test:edge + build all green; zero remaining non-.planning references to the four obsolete function names as deploy/test/function targets.</done>
</task>

</tasks>

<verification>
- `supabase/functions/chat-agent/` no longer exists.
- `rg -n 'chat-agent' --glob '!.planning/**'` → only the obfuscated `.join('-')` slug inside `retired-feature-surface.test.ts`.
- Offline edge gate (`npm run test:edge`) green, including the updated CORS-05 count (17) and the extended retired-surface guard.
- Frontend gates (lint, type-check, vitest, build) green.
</verification>

<success_criteria>
- Only `chat-agent` was removed as new work (the other three were already retired — confirmed during planning); no live function (`analyze-career`, `analyze-resume`, etc.) or the `skillGaps` output contract was touched.
- All deploy/test/config/doc references to the four obsolete function names are gone (outside historical `.planning/` artifacts).
- `verify:baseline` offline subset (lint, type-check, vitest, test:edge, build) is green.
</success_criteria>

<output>
After completion, create `.planning/quick/260719-qth-remove-obsolete-edge-functions-analyze-c/260719-qth-SUMMARY.md`.

In the SUMMARY, explicitly record for the orchestrator/operator:
- **Only `chat-agent` was removed from the repo**; `analyze-career-v2` (never existed), `analyze-skills-gap`, and `compare-jobs` were already retired and guarded — no code change owed for those three.
- **Hosted-project cleanup is a follow-up operator concern (NOT done by this plan):** if `chat-agent` (and any of the already-retired three) are still DEPLOYED on the preview and/or production Supabase projects, they should be deleted via `supabase functions delete <name>`. Preview can be done directly; **production deletion requires explicit operator approval** per the project MCP policy. The executor cannot reach Supabase MCP — surface this as a checklist item, do not attempt it.
- `npm run test:edge:remote` (preview-secret gate) was not run offline — note whether the merge gate requires it.
</output>
