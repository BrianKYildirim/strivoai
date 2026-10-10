# Coding Conventions

**Analysis Date:** 2026-04-11

## Naming Patterns

**Files:**
- Components: PascalCase (e.g., `ProFeatureBlur.tsx`, `ProtectedRoute.tsx`)
- Utilities/hooks: camelCase (e.g., `useResumeStream.ts`, `fetchWithTimeout.ts`)
- Hooks follow `use*` pattern (e.g., `useAiCredits`, `useTierAccess`)
- Test files: Same as source with `.test.ts` or `.spec.ts` suffix (e.g., `json-repair.test.ts`)

**Functions:**
- camelCase for all function declarations
- Prefix utilities with verb or noun: `invokeWithTimeout`, `extractPartialSummary`, `repairTruncatedJSON`
- React hooks begin with `use`: `useResumeStream`, `usePaywallGuard`, `useAiCredits`
- Private/internal helpers may use underscore prefix: `_sanitizerLog`, `_invokeStart`

**Variables:**
- camelCase for local variables and parameters
- SCREAMING_SNAKE_CASE for constants: `SUPABASE_URL`, `STAGE_LABELS`, `ALLOWED_FIELDS`
- Boolean variables prefix with `is`, `has`, `should`, `can`: `isDragging`, `hasInternalSecret`, `shouldRefreshSessionBeforeInvoke`, `canAnalyze`
- Refs in React end with `Ref`: `cancelRef`, `paramsRef`

**Types/Interfaces:**
- PascalCase for all types: `StreamState`, `StreamParams`, `StreamStage`, `ParallelResult`, `UserContext`, `AnthropicInvokeParams`
- Union types use discriminated unions with `ok` field for fallible operations: `{ ok: true; text: string } | { ok: false; error: string }`
- Type exports for external use, interface-first for internal contracts

## Code Style

**Formatting:**
- 2-space indentation (enforced by ESLint)
- Semicolons required (no ASI)
- Trailing commas in multiline structures
- Max line length is guided by readability (no hard limit enforced)

**Linting:**
- Tool: ESLint with FlatConfig (via `eslint.config.js`)
- Base configs: `@eslint/js.configs.recommended` + `typescript-eslint.configs.recommended`
- React-specific: `react-hooks.configs.recommended` + `react-refresh` plugin
- `@typescript-eslint/no-unused-vars` is off (allows intentional unused parameters)
- Run with: `npm run lint`

**TypeScript Settings:**
- Target: ES2020
- Module: ESNext
- Strict mode enabled in `tsconfig.app.json`
- JSX: react-jsx (automatic runtime — no `import React` needed)
- Module resolution: bundler
- Path aliases: `@/*` maps to `./src/*` for frontend
- Frontend strict mode: `true` (in `tsconfig.app.json`)
- Edge functions: Deno runtime with strict TypeScript checking

## Import Organization

**Order:**
1. External library imports (e.g., `import React`, `import { useState } from 'react'`)
2. Third-party packages (e.g., `import { supabase } from '@supabase/supabase-js'`, `import { toast } from 'sonner'`)
3. Project imports with path aliases (e.g., `import { useAiCredits } from '@/contexts/AiCreditsContext'`)
4. Relative imports (if used, e.g., `from './helper'`)
5. Type imports last (via `import type { ... }`)

**Path Aliases:**
- Frontend: `@/*` resolves to `./src/*`
- Examples:
  - `@/components/Button` → `src/components/Button`
  - `@/hooks/useResumeStream` → `src/hooks/useResumeStream`
  - `@/lib/utils` → `src/lib/utils`
  - `@/contexts/AiCreditsContext` → `src/contexts/AiCreditsContext`

## Error Handling

**Frontend Patterns:**
- Try-catch blocks for async operations
- Errors logged to `console.error()` with bracket-prefixed function name: `console.error('[ResumeStream] message')`
- Error state stored in component state (e.g., `error: string | null` in `StreamState`)
- Toast notifications via `sonner` for user-facing errors:
  - `toast.error('message')` for failures
  - `toast.success('message')` for success
  - `toast.info('message')` for info
- Graceful fallbacks: render error state or null rather than crashing
- Null/undefined checks with optional chaining `?.` and nullish coalescing `??`
- Error messages are specific and operationally useful to users

**Edge Function Patterns:**
- Structured error responses with HTTP status codes and JSON error objects
- Usage limit errors trigger 402/429 responses with metadata: `{ error: 'message', resetDate?, tier? }`
- Overload detection: check for 529 status or "overloaded" in error text
- Exponential backoff with jitter for retries: `computeBackoffMs(attempt)` returns base 1000ms, max 3000ms + 0-400ms jitter
- Type guards checking error shape before accessing properties
- JSON validation via `repairTruncatedJSON()` for malformed/truncated JSON from streaming
- Authorization failures return 401 with no detail leakage: `{ error: 'Unauthorized' }`

**Example (Frontend):**
```typescript
try {
  response = await fetch(url, { headers, body });
} catch {
  if (!cancelRef.current) {
    setState(s => ({ ...s, error: 'Connection failed. Please try again.' }));
  }
  return;
}
```

**Example (Edge Function):**
```typescript
if (!resp.ok) {
  return { callType, ok: false, error: resp.error, status: resp.status, durationMs };
}
return { callType, ok: true, text: resp.text, durationMs };
```

## Logging

**Frontend:**
- Native `console.log()` and `console.error()`
- Bracket prefix for filtering: `console.log('[ComponentName] message')` or `console.error('[FunctionName] error')`
- Example: `console.log('[ResumeStream] Stream reader acquired')`
- Performance logging via conditional `perf.start/mark/end()` when `VITE_DEBUG_PERF=true`

**Edge Functions:**
- Custom `createLogger('function-name', reqId?)` utility (in `_shared/logger.ts`)
- Structured JSON output to stdout (captured by Supabase function logs)
- Log levels: `debug`, `info`, `warn`, `error`
- Each entry includes: `level`, `msg`, `fn`, `ts`, optional `reqId`, custom data fields
- Example:
  ```typescript
  const log = createLogger('analyze-resume');
  log.info('Processing started', { userId, resumeId });
  log.error('API call failed', { status: 500, errorMsg });
  ```
- Timer utility: `log.timer('operation')` returns function logging elapsed time
- Timing attacks prevented: secrets never logged (use reason codes instead)

## Comments

**When to Comment:**
- Complex business logic or non-obvious algorithms
- Trade-offs and intentional design choices (e.g., why exponential backoff, why this validation strategy)
- Section headers with dashes for visual grouping: `// ── Parallel execution types ──────`
- Explain intent and "why", not mechanics (code is self-documenting)

**JSDoc/TSDoc:**
- Not systematic; type annotations serve as inline documentation
- Only add when explaining non-obvious parameter contracts
- Example: `/** Verifies the incoming request is authenticated for the given auth type. */`

**Example Comment Pattern:**
```typescript
// ── Parallel execution types ────────────────────────────────────────────────
interface ParallelCallResult {
  callType: CallType;
  ok: true;
  text: string;
  durationMs: number;
}

// Retry failed calls once (PARA-03)
// Don't retry rate limit or payment errors (non-retriable)
const retryPromises = settled.map(async (result, i) => {
  if (result.ok) return result;
  if ('status' in result && (result.status === 429 || result.status === 402)) {
    return result;
  }
  // ... proceed with backoff retry
});
```

## Function Design

**Size:**
- Most functions 10-50 lines; complex logic may extend to 50-80 lines
- Helpers extracted when logic is reused (e.g., `repairTruncatedJSON`, `extractPartialSummary`, `detectStage`)

**Parameters:**
- Named parameters via objects when 3+ arguments needed
- Destructuring in function signature for clarity
- Type annotations on all parameters (strict mode enforced)

**Example:**
```typescript
export async function invokeWithTimeout<T = any>(
  functionName: string,
  options: {
    body?: Record<string, any>;
    headers?: Record<string, string>;
  } = {},
  timeoutMs: number = 120000,
): Promise<{ data: T | null; error: Error | null }> {
  // implementation
}
```

**Return Values:**
- Explicit return types on all functions
- Discriminated union types for fallible operations
- Example: `Promise<{ data: T | null; error: Error | null }>`
- Pattern: `{ ok: true; result: X } | { ok: false; error: string }`

## Module Design

**Exports:**
- Named exports for utilities and helpers
- Default export for React pages and top-level components
- Supabase client exported as singleton: `export const supabase = createClient<Database>(...)`

**Organization:**
- React hooks: colocated with component or extracted to `src/hooks/` if reused
- Types/interfaces: defined at top of file or in shared type files (e.g., `resume-prompts.ts` exports `type PromptParams`)
- Contexts: stored in `src/contexts/`, provide value via custom hook
- Services: collected in `src/integrations/` or `src/lib/`
- Shared edge function utilities: in `supabase/functions/_shared/`

**Example (Context + Hook):**
```typescript
// src/contexts/AiCreditsContext.tsx
export function AiCreditsProvider({ children }: { children: ReactNode }) { ... }
export function useAiCredits() { ... }
```

**Barrel Files:**
- Not systematically used; prefer direct imports
- Component-specific exports in `index.ts` only when necessary

## Security Patterns

- `timingSafeEqual` for token/secret comparison (prevents timing attacks)
- Zod validation with react-hook-form for frontend input
- Prompt injection defense via `prompt-sanitizer.ts` (regex-based phrase stripping)
- No secrets in `.env` files at deployment; Supabase secrets for backend
- CORS restricted by `APP_URL` env var (fail-closed)
- `requireAuth` / `requireInternalOrUserAuth` helpers for all endpoints
- Secrets never logged; use reason codes instead: `log.warn('auth-failure', { reason: 'secret-mismatch' })`

---

*Convention analysis: 2026-04-11*
