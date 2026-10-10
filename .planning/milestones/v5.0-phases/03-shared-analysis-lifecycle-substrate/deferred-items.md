# Phase 03 — Deferred / Out-of-Scope Items

Items discovered during execution that are pre-existing, environment-driven, or
otherwise outside the current task's change scope. Logged for traceability; NOT fixed
here (SCOPE BOUNDARY — only auto-fix issues directly caused by the current task).

| ID | Item | Discovered | Disposition |
|----|------|------------|-------------|
| P03-E2E-SECRETS | `npm run verify:baseline` Playwright leg aborts in local sandbox: `e2e/global-setup.ts` requires `SUPABASE_TEST_URL`, `SUPABASE_TEST_SERVICE_ROLE_KEY`, `E2E_TEST_PASSWORD` (sourced from `.env.test.local` locally or CI secrets). `.env.test.local` is absent in this sandbox and all three vars are unset. | 03-07 Task 3 | Pre-existing environment gate, NOT a code regression. Unrelated to this plan's changes (a new Deno test file + a one-line `deno.json` edit — no Playwright/app/E2E code touched). The vitest (498 passed) and offline `deno task test:ci` (932 passed / 0 failed) legs are GREEN. Playwright runs green only under operator/CI with the E2E secrets present (historical baseline "Playwright 5+1skip"). No action owed by Phase 3. |
