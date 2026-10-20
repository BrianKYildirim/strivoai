---
id: 260717-3fr
slug: fix-the-24-remaining-deno-type-errors-ac
date: 2026-07-17
status: complete
commit: 946630b6
---

# Summary: Close the remaining 24 Deno type errors + gate every edge entrypoint

## Outcome

`deno check */index.ts`: **36 errors → 0**. The `check` gate now covers all 39 function
entrypoints and inherits `test:ci` → `test:edge` → `verify:baseline` → `deploy.ps1`'s hard
precondition. Type-only; no control flow touched. Nothing silenced — zero `any`,
`@ts-ignore`, `@ts-expect-error`, or `!` introduced.

## The load-bearing change: `requireAuth` overloads

The 11 `TS18047` possibly-null errors were not 11 bugs — they were ONE signature defect.
The three auth types have completely different real contracts:

| `opts.type` | Implementation | Real contract |
|---|---|---|
| `'user'` | `requireUserAuth(req): Promise<UserContext>` | **never null** — throws a Response on failure |
| `'internal'` | `requireInternalAuth(req): Promise<null>` | **always null** on success |
| `'webhook'` | returns `null` | always null |

One `Promise<UserContext \| null>` signature erased that in BOTH directions:
1. `'user'` callers had to dereference a value that provably is never null — 11 errors and
   standing pressure to reach for `!`.
2. `'internal'` callers got `UserContext | null`, so the value LOOKED like it might carry a
   user when it is **always null**. That is quick task 260713-hrd exactly: analyze-career's
   queued path (100% of Career Compass traffic is internal) resolved
   `tier = ctx?.tier ?? 'free'`, so Elite subscribers were analyzed as Free and refunded —
   and `?.` swallowed it silently.

Fixed with three overloads. `auth.ts`'s diff is **33 insertions, 0 deletions** — purely
additive, so the bodies of `requireAuth`/`requireUserAuth`/`requireInternalAuth` are
provably byte-for-byte unchanged. The third overload preserves today's behavior for a
widened `AuthType`; there are no dynamic call sites.

### Independently verified: the incident's bug class is now a COMPILE ERROR

Re-run by the orchestrator with its own probe, not taken on trust:

```
const ctx = await requireAuth(req, { type: 'internal' });
const tier = ctx?.tier ?? 'free';   // the 260713-hrd bug

TS2339 [ERROR]: Property 'tier' does not exist on type 'never'.
error: Type checking failed.          EXIT=1
```

`ctx` is now `null`, so `ctx?.` narrows to `never` — the `?.` swallow is unwriteable.
Positive control (must still compile, EXIT=0): a `'user'` caller derefs `ctx.tier` with no
null check and no `!`. Both probes deleted.

## Other findings

**`ocr-pdf` was NOT a live bug — suspicion disproven.** STATE.md flagged
`ocr-pdf/index.ts:247` (guards `if (reuse.ok && reuse.found)` then reads
`reuse.result.text`; the guard narrows the lookup, not the inner `ExtractionResult` union).
Traced to ground: `buildLookupResult` (`document-persistence.ts:196`) is the ONLY producer
of `found: true` and always builds `{ ok: true, text, metadata }`. The failure arm can never
reach that branch. Real defect was a too-loose declared type. Fixed by naming
`ExtractionSuccess` and narrowing the lookup's `found: true` arm.

**Supabase mimics (same root cause as 260717-0fo).** Hand-rolled structural mimics in
`document-persistence.ts` (`SupabaseClientLike`) and `terminalize-stuck-run.ts` (`SupaLike`)
replaced with the real `SupabaseClient`. A chainable mimic cannot be made honest —
PostgREST builders are self-recursive AND generic, so a real client yields TS2589. Same
remedy and recorded trade-off as `extract-analysis-structure/types.ts`.

**Seams.** `check-merit-alerts` now uses `typeof requireAuth` instead of a lossy
re-declaration (`{ type: string }` is not assignable to `AuthType`).
`lifecycle-archive-writer`'s source stream typed `BufferSource`; a now-provable cast dropped.

## Gate proof (both directions, independently re-verified)

- Error injected into the newly-gated `submit-career-analysis-job` → `npm run test:edge`
  **exit 1**; reverted → **exit 0**.
- The executor also caught a regression risk in its own work: the old `check` listed the
  extract module's non-`index.ts` files explicitly, which the `*/index.ts` glob drops. It
  proved they remain gated transitively by injecting into `extract-resume.ts` (exit 1) and
  reverting (exit 0).

## Gates

| Gate | Result |
|---|---|
| `deno check */index.ts` | **36 → 0** |
| `npm run lint` | PASS — 0 errors, 159 pre-existing warnings |
| `npm run type-check` | PASS |
| `npm run test` | PASS — 659 |
| `npm run test:edge` | PASS — exit 0 |
| `npm run build` | PASS |

## Note for whoever reads this next

During verification `test:edge` failed once on `analyze-career/index.ts:2205`
(`describeBufferShape`). This was NOT a defect in this task: the operator was concurrently
editing `_shared/json-repair.ts` / `json-repair.test.ts` / `analyze-career/index.ts` in the
same working tree (an uncommitted truncation-diagnostics WIP), and the check caught a
transient mid-edit state where the import landed before the export. It passed once the edit
settled. Deno test count rose 1356 → 1360 → 1363 across runs as the operator added tests.
Those files were deliberately left untouched and unstaged.

## Remaining (see STATE.md Deferred Items)

- `supabase/functions/tsconfig.json` — unreferenced landmine, neutralised but not removed.
- Test files stay OUT of the gate: `__tests__/` mocks pass duck-typed `MockSupabase` objects
  that no longer match the real `SupabaseClient`. Own task.
- `getServiceClient()` has no `Database` generic, so rows type as `any` at the DB boundary;
  modules compensate with runtime guards. Wiring it would make row access checked.
- Pre-existing `(supabase as any)` at `lifecycle-archive-writer/index.ts:164` — not erroring,
  left untouched, but a real unchecked boundary the gate will not catch.
