# Deferred Items — quick-260719-qth

Out-of-scope discoveries found during execution. NOT fixed by this plan (per GSD SCOPE BOUNDARY: only auto-fix issues directly caused by the current task's changes).

## D-01: Pre-existing `deno task check` failure in `recruiting-lens/index.ts` (blocks `npm run test:edge`)

- **What:** `deno task check` (the first step of the `test:edge` / `test:ci` gate) fails with 2× `TS2345` errors at `supabase/functions/recruiting-lens/index.ts:180-181`. The `applications` table insert/update passes an `analysis_id` field that the Deno-side generated Database types resolve to `never` (`Type 'string' is not assignable to type 'never'`).
- **Root cause:** Introduced by commit `c736de9f` ("durable analysis_id FK for saved-job -> Recruiting Lens link"). The migration added the `applications.analysis_id` column but the Deno-side generated Database types consumed by `recruiting-lens/index.ts` were not regenerated to include it.
- **Proven pre-existing:** Reproduced at parent commit `eb89e369` (before this plan's chat-agent removal) via `deno check recruiting-lens/index.ts` — identical 2 errors. `recruiting-lens/index.ts` was NOT touched by this plan.
- **Out of scope:** Unrelated to chat-agent removal; in a file this plan did not modify.
- **Impact on this plan's verification:** Because `deno task check` runs before the test list in `test:ci`, the full `npm run test:edge` gate cannot reach the test bodies. This plan's two affected guards were therefore verified by running them directly with `--no-check`: `deno test --allow-all --no-check _shared/cors-audit.test.ts _shared/retired-feature-surface.test.ts` → **53 passed / 0 failed** (CORS-05 count now 17; retired-feature-surface now guards chat-agent).
- **Owner/follow-up:** Regenerate the Deno-side generated Database types to include `applications.analysis_id` (or cast at the insert site). Operator/CI concern — restores the green `npm run test:edge` gate.
