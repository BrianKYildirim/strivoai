# Testing

> Generated: 2026-04-11 | Focus: Test framework, structure, and coverage

## Test Framework

### Backend (Deno)
- **Runtime**: Deno built-in test runner (`Deno.test`)
- **Assertions**: `https://deno.land/std@0.224.0/assert/mod.ts` (`assertEquals`, `assert`)
- **Runner command**: `deno test --no-check`
- **Script**: `scripts/run-edge-tests.ps1`

### Frontend
- **No test framework configured** — no Jest, Vitest, or similar found in dependencies
- **Linting only**: `npm run lint` (ESLint)

## Test Files

All tests are in `supabase/functions/_shared/`:

| Test File | Module Under Test | Purpose |
|-----------|-------------------|---------|
| `auth.test.ts` | `auth.ts` | Auth guard helpers (requireAuth, requireInternalOrUserAuth) |
| `cors.test.ts` | `cors.ts` | CORS header generation and OPTIONS handling |
| `json-repair.test.ts` | `json-repair.ts` | Truncated JSON repair heuristics |
| `logger.test.ts` | `logger.ts` | Structured logging output format |
| `prompt-sanitizer.test.ts` | `prompt-sanitizer.ts` | Injection phrase stripping |
| `rate-limiter.test.ts` | `rate-limiter.ts` | Per-user rate limiting logic |
| `result-merger.test.ts` | `result-merger.ts` | Parallel result merge correctness |

**Total: 7 test files**, all covering shared utility modules.

## Test Runner Configuration

The PowerShell script (`scripts/run-edge-tests.ps1`) currently runs only a subset:

```powershell
deno test _shared/json-repair.test.ts _shared/logger.test.ts --no-check
```

Other test files (`auth.test.ts`, `cors.test.ts`, `prompt-sanitizer.test.ts`, `rate-limiter.test.ts`, `result-merger.test.ts`) exist but are **not included** in the default runner script.

## Test Patterns

### Mocking Strategy
- **Console capture**: Tests capture `console.log`/`console.error` to verify logging output
- **Request mocking**: Tests construct `new Request()` objects directly
- **No external mocks**: Tests avoid mocking Supabase or Anthropic — they test pure utility functions only

Example pattern from `auth.test.ts`:
```typescript
function captureConsole(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => lines.push(args.map(String).join(" "));
  return { lines, restore: () => { console.log = origLog; } };
}
```

### Test Organization
- Tests colocated with source files in `_shared/` (same directory)
- Named with `.test.ts` suffix
- Each file covers one module
- Tests use `Deno.test("descriptive name", async () => { ... })` format

## Coverage Gaps

### No Frontend Tests
- Zero test files in `src/`
- No component tests, hook tests, or integration tests
- No E2E testing framework (no Playwright, Cypress, etc.)

### Untested Backend Modules
- `anthropic.ts` — Anthropic API client wrapper
- `pdf-parser.ts` — PDF parsing logic
- `handler.ts` — Request handler wrapper
- `errors.ts` — Error response builders
- `supabase-client.ts` — Service-role client creation
- `usage-checker.ts` — Usage limit enforcement
- `recruiting-lens-merger.ts` — Recruiting lens result merge
- `recruiting-lens-prompts.ts` — Recruiting lens prompt construction
- `resume-prompts.ts` — Resume analysis prompt construction

### No Edge Function Integration Tests
- Individual function handlers (`analyze-resume`, `analyze-career`, etc.) have no tests
- No tests for streaming behavior, parallel call orchestration, or fallback paths
- No tests for webhook signature verification

## Performance Validation

A separate performance benchmark exists (not a test suite):
- `scripts/validate-performance.mjs` — Measures analysis latency against staging
- Invoked manually: `node scripts/validate-performance.mjs --env staging --runs 3 --cooldown 8 --warmup`
- Test resume fixtures in `scripts/test-resumes/`

## Quality Tooling

| Tool | Purpose | Config |
|------|---------|--------|
| ESLint 9 | Code linting | `eslint.config.js` (FlatConfig) |
| TypeScript strict | Type checking | `tsconfig.app.json` |
| `npm run build` | Build validation | Vite production build |
| `npm run lint` | Lint check | ESLint with React hooks/refresh plugins |
