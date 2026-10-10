---
id: 260717-0fo
slug: enable-deno-type-checking-for-extract-an
date: 2026-07-17
status: complete
---

# Summary: Enable Deno type checking for extract-analysis-structure

Closed the type-checking gap for `extract-analysis-structure` and wired a proven gate.
12 module errors -> 0, with zero suppressions added (and one pre-existing suppression removed).

## Task 1 — Deno config

Added `compilerOptions.lib = ["deno.ns","deno.window","dom","esnext"]` to
`supabase/functions/deno.json`. `deno.json` wins over the stray `tsconfig.json`, so the
TS5095/TS5109/TS2304 config noise disappears without deleting it (left in place per plan;
still referenced by nothing — landmine remains recorded).

## Task 2 — The 12 module errors

Root cause was one design flaw, not 12 independent bugs: `index.ts` and each `extract-*.ts`
declared their own structurally-different copies of `SupabaseClientLike`/`QueryBuilderLike`.
Extracted shared types into a new `extract-analysis-structure/types.ts`.

**Key finding (deviation from the plan's suggested shape).** The plan proposed keeping a
hand-rolled structural client type and modelling the awaited `{data,error}` terminal result.
That cannot be made honest. The old shape declared `eq()/order()/limit()` directly on the
value returned by `from()`, which PostgREST does not do. Fixing that shape was still not
enough: PostgREST builders are self-recursive AND heavily generic, so assigning a real
`SupabaseClient` to ANY chainable mimic makes the compiler bail with **TS2589** ("type
instantiation is excessively deep"). Proven by bisection with minimal probes:

- `from(t): unknown` -> clean
- `from(t).select(c): unknown` -> clean
- `from(t).select(c): FB` where `interface FB { eq(...): FB }` -> **TS2589**

So the mimic could only survive via `as unknown as` or a suppression — asserting a
relationship the compiler cannot verify. Instead `SupabaseClientLike` is now an alias for
the real `SupabaseClient`, i.e. exactly what `getServiceClient()` returns and what every
call site actually passes. No assertions anywhere.

**Recorded trade-off (honest):** `getServiceClient()` is un-parameterised (no generated
`Database` generic), so supabase-js types query results as `any`. Row fields are therefore
unchecked at the DB boundary. The module already compensates by narrowing every raw value
through `asRecord/asString/asNumber`. Wiring a generated `Database` type into
`getServiceClient()` would make row access checked with no change to the alias — worth a
follow-up task.

Also fixed honestly:
- `extract-linkedin.ts`: `grade.data?.id ?? null` typed `{} | null`; now `asString(grade.data?.id)`.
  Behaviour-preserving for any row the query can return (`linkedin_grades.id` is a uuid).

**Bonus — pre-existing suppression removed.** `extract-recruiting-lens.ts` carried a
`@ts-ignore` ("`.is()` supported at runtime; type stubs may not expose it") plus three
`as any` casts and an `as unknown as Promise<...>`. That comment was wrong: `.is()` types
fine against the real client. The whole cluster was collateral damage from the broken mimic
type and is now gone. `backfillResult.error/.count` are read directly off the real
`PostgrestResponse`. Runtime identical.

`grep` for `ts-ignore|ts-expect-error|as any|: any` across the module returns **zero hits**.

All changes are type-only. No control flow touched (module is live on prod, fn v102).
The 24 out-of-scope errors in 11 other files were not touched.

## Task 3 — Gate, proven in both directions

Added a `check` task to `deno.json` covering all five module files; `test:ci` now runs
`deno task check && deno test ...`. This inherits `verify:baseline` -> `deploy.ps1`'s hard
precondition with no change to `package.json` or `deploy.ps1`.

**Regression injected** (`const __regressionProbe: string = asNumber(42);` in extract-resume.ts):

```
Task check deno check extract-analysis-structure/types.ts ...
TS2322 [ERROR]: Type 'number | null' is not assignable to type 'string'.
  Type 'null' is not assignable to type 'string'.
const __regressionProbe: string = asNumber(42);
      ~~~~~~~~~~~~~~~~~
    at .../extract-analysis-structure/extract-resume.ts:42:7
error: Type checking failed.
EXIT=1
```

`&&` short-circuits — the test suite never ran. **Reverted:**

```
ok | 1356 passed | 0 failed | 12 ignored (25s)
EXIT=0
```

## Verification (actual)

| Gate | Result |
|---|---|
| `npm run lint` | PASS — exit 0 (159 warnings, 0 errors; pre-existing) |
| `npm run type-check` | PASS — exit 0 |
| `npm run test` | PASS — 98 files, 659 tests, exit 0 |
| `npm run test:edge` | PASS — 1356 passed, 0 failed, 12 ignored, exit 0 |
| `npm run build` | PASS — built in 5.35s, exit 0 |

No deploy performed.

## Follow-ups

1. The 24 errors in 11 other files — 11 are `'userContext' is possibly 'null'` (the
   260713-hrd bug class that caused real refunds) and `ocr-pdf/index.ts:247`. Reserved.
2. `supabase/functions/tsconfig.json` — referenced by nothing, now fully shadowed by
   `deno.json`. Deletion still unverified against the Supabase CLI bundling path.
3. Test mocks (`__tests__/*.ts`) pass duck-typed `MockSupabase` objects that no longer
   match the real `SupabaseClient` param type. They run fine (tests use `--no-check` and
   are outside the `check` task), but they would need `as unknown as SupabaseClient` casts
   if test files are ever added to the gate.
4. Wire a generated `Database` generic into `getServiceClient()` to make row access typed.
