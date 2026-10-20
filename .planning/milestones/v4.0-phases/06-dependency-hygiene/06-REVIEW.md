---
phase: 06-dependency-hygiene
reviewed: 2026-06-20T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - eslint.config.js
  - src/components/applications/AddApplicationDialog.tsx
  - src/components/applications/ReportOutcomeDialog.tsx
findings:
  critical: 0
  warning: 0
  info: 2
  total: 2
status: clean
---

# Phase 6: Code Review Report

**Reviewed:** 2026-06-20T00:00:00Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** clean

## Summary

Phase 6 is dependency-hygiene; the entire source delta is three files, each a narrow
adaptation to a coupled dependency bump. I reviewed adversarially with the starting
hypothesis that the eslint downgrade silently weakened the lint gate and that the
form retypes carried a hidden runtime/validation behavior change. Both hypotheses were
falsified by direct evidence (installed-plugin introspection, repo-wide lint, `tsc`,
and resolver runtime inspection). No BLOCKER or WARNING defects were found. Two INFO
observations are recorded for traceability; neither is a defect introduced by this phase.

### eslint.config.js — downgrade verified sound

Introspected the *installed* `eslint-plugin-react-hooks@7.1.1`: its `recommended` config
ships 16 rules, 14 at `error`. The config spreads `...recommended.rules` first (line 36),
then downgrades 12 of them to `warn`. Programmatic diff confirms:

- Exactly **one** `error`-level recommended rule survives the merge: `react-hooks/rules-of-hooks`
  (stays `error`, as documented and intended). It was **not** silently disabled.
- All 12 downgrade keys map to real rules present in `recommended` — zero dead/no-op
  overrides, zero typo'd rule names that would silently fail to apply.
- `exhaustive-deps`, `incompatible-library`, `unsupported-syntax` correctly retain their
  pre-existing `warn` severity inherited from `recommended` (not touched).
- Repo-wide `eslint .` = **0 errors / 155 warnings** → gate stays exit-0. The gate is not
  weakened beyond the documented D-12 tracked-baseline mechanism; no source was edited and
  no new inline suppressions were added (`git diff` confirms additions only in the rules block).
- The comment's cited evidence file `.planning/audit/RESIDUAL-REGISTER.md` exists and
  accurately tables all 12 downgraded rules.

### AddApplicationDialog.tsx / ReportOutcomeDialog.tsx — retype verified type-only

`@hookform/resolvers@5.4.0` splits resolver input/output generics. Each `useForm` moved
from `useForm<z.infer<schema>>` to `useForm<z.input<schema>, unknown, z.output<schema>>`,
with a new `FormInput`/`FormValues` alias pair. Verified this is genuinely behavior-neutral:

- The zodResolver **runtime** calls `parse`/`parseAsync` and returns `values: <parsed output>`
  regardless of the TypeScript generics. `.default()` application and `z.coerce` are runtime
  schema behavior, untouched by the generic change. `onSubmit` receives identical
  defaulted/coerced values before and after the bump.
- Both files type-check clean under `tsc -p tsconfig.app.json` (zero errors in either file;
  the 10 repo-wide tsc errors are all pre-existing recharts/chart typing issues in unrelated
  files, and `type-check` is not part of the `verify:baseline` gate).
- The `register`/`setValue`/`watch`/`handleSubmit` wiring, `defaultValues`, and Supabase
  insert/upsert payloads are byte-identical to the base commit — only the two type-alias
  lines and the one `useForm` generic line changed per file.
- Completeness check: the third zodResolver consumer in the repo, `IntakeForm.tsx`, was
  correctly left untouched because `IntakeFormSchema` has **no `.default()` fields** (only
  `.optional()`/required), so `z.input` === `z.output` and the single-generic form still
  type-checks. The phase delta is therefore complete and internally consistent — no missed
  call site.

All reviewed files meet quality standards for a zero-functional-change dependency bump.

## Info

### IN-01: New `react-hooks/incompatible-library` warning surfaces on `watch()` (expected bump fallout)

**File:** `src/components/applications/AddApplicationDialog.tsx:72`, `src/components/applications/ReportOutcomeDialog.tsx:75`
**Issue:** The react-hooks v7 `recommended` rule `react-hooks/incompatible-library` (which
ships at `warn` and is intentionally *not* downgraded by the config) now fires on the
`watch(...)` calls in both dialogs. This is expected, correct fallout from the plugin bump
and does not affect the exit-0 gate (it is a warning, classified by the React Compiler as a
manual-memoization incompatibility in react-hook-form). It is not a defect and not introduced
by the source edits in this phase — flagged only so it is not mistaken for a regression later.
**Fix:** None required for this phase. Fold into the documented "React-Compiler-readiness pass"
clearance criterion in `RESIDUAL-REGISTER.md` if/when `watch()` usage is reworked. The
`RESIDUAL-REGISTER.md` table does not list this specific rule (because it was never downgraded —
it inherits `warn` from `recommended`); optionally add a one-line note there to pre-empt the
"why isn't this in the table?" question during the future re-tighten pass.

### IN-02: Pre-existing UI/schema gaps in the reviewed dialogs (out of phase scope, unchanged)

**File:** `src/components/applications/AddApplicationDialog.tsx:32,165-177`; `src/components/applications/ReportOutcomeDialog.tsx:230`
**Issue:** Two pre-existing patterns live in the reviewed files but are byte-identical to the
base commit (confirmed via `git show 1e64ca77:...`), so they are not defects introduced by
Phase 6: (a) the `application_source` zod enum includes `"recruiting_lens"` but the
`<Select>` renders only 5 of the 6 options (the `recruiting_lens` source is unreachable via
this manual dialog — likely intentional, since it denotes machine-sourced rows); (b) the
confidence `Slider`'s `onValueChange={([val]) => ...}` destructures the first array element
without a guard, which would be `undefined` if Radix ever emitted an empty array (it does not
in practice for a single-thumb slider).
**Fix:** Out of scope for a dependency-hygiene phase — do not touch as part of this change. If
addressed later: add the `recruiting_lens` `<SelectItem>` only if manual entry of that source
is desired (otherwise leave as-is and document), and use `onValueChange={(vals) => { const val = vals[0]; if (val === undefined) return; ... }}`
for defensive symmetry. Recorded here purely for traceability; no action required to ship Phase 6.

---

_Reviewed: 2026-06-20T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
