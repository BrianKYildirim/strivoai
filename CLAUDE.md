See @README.md for project overview and @package.json for available npm commands.

# Strivio Project Memory

## Working Agreement

* Make changes directly in the workspace when the user asks for implementation work.
* Prefer small, reversible changes over broad rewrites unless a structural migration is explicitly requested.
* Keep production reliability ahead of experimental scaling changes.
* When debugging deploy/runtime issues, verify the current deployed path before adding retries or abstractions.
* IMPORTANT NOTE: NEVER COMMIT ANYTHING WITHIN THE `.gitignore` FILE.

## Stack

* Frontend: Vite + React + TypeScript + shadcn/ui + Tailwind CSS
* Backend services in this repo: Supabase (Auth, Postgres, Storage, Edge Functions)
* AI provider: Anthropic Claude

## Important Commands

* Install dependencies: `npm i`
* Start dev server: `npm run dev`
* Build production frontend: `npm run build`
* Lint: `npm run lint`
* Preview production build: `npm run preview`

## Repository Conventions

* Commit-message + branch-naming conventions: see `CONTRIBUTING.md`
* Frontend app code lives in `src/`
* Supabase config, migrations, and functions live in `supabase/`
* Deployment and utility scripts live in `scripts/`
* Prefer `rg` for searching files and text
* Prefer `apply_patch` for focused edits

## Reliability Priorities

* Resume Analysis and Career Compass are business-critical user flows.
* Restore a working synchronous path before layering on queueing or fallback complexity.
* Treat repeated `OPTIONS`/preflight `503` responses as platform routing failures, not prompt/model failures.
* Avoid retry loops that create bad UX if the upstream route is consistently unavailable.

## Environment Notes

* Frontend feature flags use `VITE_*` variables.
* Backend secrets for deployed services must be set in the target environment; local `.env` values do not automatically deploy.
* Keep staging and production settings separate and explicit.

## Coding Style

* Preserve existing TypeScript and React patterns used in the repo.
* Avoid adding unnecessary abstractions when a single helper function is enough.
* Keep user-facing error messages specific and operationally useful.
* Playwright CLI via \`playwright-cli\` (Chromium/Chrome installed).
* SUPABASE MCP is connected to preview and production environments. Here are general rules:
  1. Claude may inspect production advisories/logs/schema.

  2. Claude may generate SQL/migrations.

  3. Claude may not run destructive SQL on production without explicit approval.

  4. Claude may not drop tables, delete columns, alter RLS, rotate secrets, or deploy Edge Functions without confirmation.

  5. Claude should test changes against preview/staging first.

  6. Claude should create rollback SQL for every migration.

  7. Claude should never print or store Supabase service role keys.

  8. Access policy:
     * Preview/test: Claude can inspect, query, apply migrations, deploy edge functions, and test.
     * Production:
       Claude can inspect logs/advisors/schema read-only.
       Claude can generate proposed SQL/migrations.
       Claude cannot apply destructive changes.
       You manually approve production migrations/deploys.

## Testing

* See `TESTING-STRATEGY.md` (repo root) for the layered testing model (vitest / deno / Playwright / promptfoo), the `verify:baseline` blocking gate, coverage philosophy, and the quarantine register. Run `npm run verify:baseline` to prove zero functional change before merge.

<!-- GSD:project-start source:PROJECT.md -->

## Project

**Strivo AI — Feature Overhaul & Platform Hardening**

Strivo AI is a career intelligence platform that helps job seekers optimize their resumes, prepare for interviews, and accelerate their career search. This milestone overhauls three AI-powered features (Interview Prep Coach, LinkedIn Grader, Recruiting Lens), redesigns the navigation bar for consistency and responsiveness, migrates payment processing from Paddle to Stripe, and performs a comprehensive security audit across the entire platform.

**Core Value:** Every feature must work reliably end-to-end — users who pay for Pro/Elite access must get a polished, functional experience with no broken flows, inconsistent navigation, or security risks.

### Constraints

* **Stack**: Supabase Edge Functions (Deno) + React frontend — no new infrastructure
* **AI Models**: Claude Haiku 4.5 for LinkedIn Grader, Claude model (TBD cost-effective) for Interview Prep Coach
* **Behavior**: All existing features (Resume Analysis, Career Compass, Job Match) must remain functional
* **Conventions**: Follow existing TypeScript, React, and project patterns. Use semantic design tokens, not hardcoded colors
* **Git**: Do not commit anything in `.planning/` or modify `.gitignore`

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

* TypeScript 5.8.3 - All frontend application code in `src/`, strict mode enabled
* TypeScript 5.8.3 - All Supabase Edge Functions in `supabase/functions/`, strict mode enabled
* SQL - Database schema and migrations in `supabase/migrations/`
* JavaScript (via ESM) - Build configuration and utilities in `vite.config.ts`, `eslint.config.js`, scripts

## Runtime

* Node.js 22+ (as specified in `package.json` and project requirements)
* Browser runtime (Vite SPA, ES2020 target)
* Deno 2+ - Runtime for Supabase Edge Functions via `deno.json` imports
* Deno standard library: `https://deno.land/std@0.168.0/` (HTTP server, crypto utilities)
* npm - Primary package manager for frontend dependencies
* Lockfile: `package-lock.json` (present)

## Frameworks

* React 18.3.1 - UI framework in `src/`
* React Router 6.30.1 - SPA routing and navigation (multi-page flows)
* Vite 5.4.19 - Build tool and dev server with React SWC plugin, configured in `vite.config.ts`
* shadcn/ui - Component library built on Radix UI primitives
* Radix UI - 35+ components including accordion, alert-dialog, checkbox, dialog, dropdown-menu, hover-card, label, menubar, navigation-menu, popover, progress, radio-group, scroll-area, select, separator, slider, switch, tabs, toast, toggle, tooltip
* Tailwind CSS 3.4.17 - Utility-first CSS framework with theme in `tailwind.config.ts`
* Tailwind CSS Animate 1.0.7 - Animation utilities
* Tailwind CSS Typography 0.5.16 - Typography plugin
* Framer Motion 12.23.26 - Animation and motion effects for complex UI interactions
* next-themes 0.3.0 - Theme management (light/dark mode switching)
* Lucide React 0.462.0 - Icon library for UI components
* React Hook Form 7.61.1 - Form state management with minimal re-renders
* @hookform/resolvers 3.10.0 - Validation resolver support for multiple schema libraries
* Zod 3.25.76 - Type-safe schema validation for forms and API responses
* TanStack React Query 5.83.0 - Server state management and API caching (`useQuery`, `useInfiniteQuery`)
* React Helmet Async 2.0.5 - Document head management (titles, metas)
* Sonner 1.7.4 - Toast notification system in `src/components/ui/sonner`
* @radix-ui/react-toast 1.2.14 - Underlying toast provider
* recharts 2.15.4 - Chart and data visualization components
* react-markdown 10.1.0 - Markdown rendering for display content
* react-pdf 10.2.0 - PDF viewer component for resume preview
* pdfjs-dist 5.4.394 - PDF.js worker library for client-side PDF parsing
* embla-carousel-react 8.6.0 - Carousel component for image/content sliders
* react-resizable-panels 2.1.9 - Resizable panel layout for dashboard views
* vaul 0.9.9 - Drawer component (built on Radix Dialog)
* cmdk 1.1.1 - Command/search palette for navigation
* class-variance-authority 0.7.1 - Utility for component class composition and variants
* clsx 2.1.1 - Classname composition utility
* tailwind-merge 2.6.0 - Merge conflicting Tailwind classes safely
* canvas-confetti 1.9.4 - Confetti animation effects for celebrations
* html2canvas 1.4.1 - HTML to canvas/image conversion
* jspdf 4.0.0 - PDF generation for exporting results
* date-fns 3.6.0 - Date formatting and manipulation utilities
* No npm packages for business logic; shared utilities are colocated in `supabase/functions/_shared/`

## Key Dependencies

* @supabase/supabase-js 2.81.1 - Client library for auth, Postgres database, and storage operations
* Supabase CLI 2.76.9 - Local development and deployment of edge functions
* Anthropic Claude API - LLM model calls via HTTP (no SDK; direct fetch via `supabase/functions/_shared/anthropic.ts`)
* Firecrawl API - Web scraping for LinkedIn profile data (optional, `supabase/functions/analyze-career/index.ts`)
* Resend - Email delivery service (HTTP API calls from edge functions)
* @vercel/analytics 1.6.1 - Analytics integration in `src/App.tsx`
* @vercel/speed-insights 1.3.1 - Web performance monitoring in `src/App.tsx`
* cobe 2.0.1 - 3D globe visualization (for landing page or features)
* input-otp 1.4.2 - OTP input component for auth flows
* react-day-picker 8.10.1 - Date picker component

## Configuration

* `tsconfig.json` - Base TypeScript settings with @ path alias mapping to `./src/*`
* `tsconfig.app.json` - Frontend app TypeScript settings (ES2020 target, strict mode, DOM lib)
* `tsconfig.node.json` - Node/build tool TypeScript settings
* `vite.config.ts` - Vite configuration with React SWC plugin, path aliases (@/), and react-pdf optimization
* `vite.config.ts` also sets up dev server on port 8080 with CORS enabled
* `tailwind.config.ts` - Tailwind theme with custom colors (primary via CSS vars, accent color configuration)
* `postcss.config.js` - PostCSS with Tailwind and autoprefixer
* `eslint.config.js` - ESLint FlatConfig with React hooks and refresh plugins
* Base configs: `@eslint/js.configs.recommended` + `typescript-eslint.configs.recommended`
* React-specific: `react-hooks.configs.recommended` + `react-refresh` plugin
* Rule overrides: `@typescript-eslint/no-unused-vars` is off
* No dedicated Prettier config; ESLint rules enforce style
* `supabase/functions/deno.json` - Deno task definitions for testing and import mappings
* `supabase/functions/deno.lock` - Deno dependency lockfile for reproducible builds
* The canonical, secret-free reference for every live environment variable (names,
  consumers, required/optional, and which surface sets each) lives in `docs/ENVIRONMENT.md`.
  Copy-paste skeletons: `.env.example` (production-runtime) and `.env.test.local.example`
  (test/CI + E2E). Values are never recorded in the repo (names-not-values).
* Frontend `VITE_*` (public build vars): Supabase URL + publishable/anon key, Stripe
  publishable key, `VITE_ANALYZE_CAREER_FUNCTION` (optional), `VITE_DEBUG_PERF` (optional),
  feature flags.
* Supabase edge secrets (backend-only): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY` (+ optional `ANTHROPIC_MODEL_TEXT` /
  `ANTHROPIC_MODEL_FALLBACK`), `INTERNAL_JOB_SECRET`, `RESEND_API_KEY`, `APP_URL`
  (fail-closed CORS), Stripe secret/webhook/price IDs, admin emails, and optional
  `FIRECRAWL_API_KEY` + OCR fallbacks. Paddle has been fully retired (Phase 8) —
  there is no `PADDLE_WEBHOOK_SECRET` or `paddle-webhook` function.
* See `docs/ENVIRONMENT.md` for the authoritative per-name matrix and which surface
  (Vercel / Supabase prod / Supabase preview-test / GitHub Actions / local) sets each.

## Platform Requirements

* Node.js 22+
* npm (or equivalent Node package manager)
* Supabase CLI 2.76.9+ (for local development and function deployments)
* Deno 2+ (for running edge function tests locally via `deno test`)
* Vercel - Frontend hosting (SPA with rewrites configured in `vercel.json`)
* Supabase - Backend services (PostgreSQL, Auth, Edge Functions, Storage)
* Deno runtime - Executes edge functions on Supabase infrastructure
* Anthropic Claude API - LLM inference (via HTTPS, `https://api.anthropic.com/v1/messages`)
* Firecrawl API - Web scraping for LinkedIn profiles
* Resend - Transactional email delivery
* Stripe - Payment processing and subscription management
* RapidAPI/JSearch - Job search API (infrastructure in place but not active)

## Build & Deployment Commands

* `supabase functions deploy` - Deploy all functions
* `supabase functions deploy [function-name]` - Deploy specific function
* `supabase migration up` - Apply pending migrations

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

* Components: PascalCase (e.g., `ProFeatureBlur.tsx`, `ProtectedRoute.tsx`)
* Utilities/hooks: camelCase (e.g., `useResumeStream.ts`, `fetchWithTimeout.ts`)
* Hooks follow `use*` pattern (e.g., `useAiCredits`, `useTierAccess`)
* Test files: Same as source with `.test.ts` or `.spec.ts` suffix (e.g., `json-repair.test.ts`)
* camelCase for all function declarations
* Prefix utilities with verb or noun: `invokeWithTimeout`, `extractPartialSummary`, `repairTruncatedJSON`
* React hooks begin with `use`: `useResumeStream`, `usePaywallGuard`, `useAiCredits`
* Private/internal helpers may use underscore prefix: `_sanitizerLog`, `_invokeStart`
* camelCase for local variables and parameters
* SCREAMING\_SNAKE\_CASE for constants: `SUPABASE_URL`, `STAGE_LABELS`, `ALLOWED_FIELDS`
* Boolean variables prefix with `is`, `has`, `should`, `can`: `isDragging`, `hasInternalSecret`, `shouldRefreshSessionBeforeInvoke`, `canAnalyze`
* Refs in React end with `Ref`: `cancelRef`, `paramsRef`
* PascalCase for all types: `StreamState`, `StreamParams`, `StreamStage`, `ParallelResult`, `UserContext`, `AnthropicInvokeParams`
* Union types use discriminated unions with `ok` field for fallible operations: `{ ok: true; text: string } | { ok: false; error: string }`
* Type exports for external use, interface-first for internal contracts

## Code Style

* 2-space indentation (enforced by ESLint)
* Semicolons required (no ASI)
* Trailing commas in multiline structures
* Max line length is guided by readability (no hard limit enforced)
* Tool: ESLint with FlatConfig (via `eslint.config.js`)
* Base configs: `@eslint/js.configs.recommended` + `typescript-eslint.configs.recommended`
* React-specific: `react-hooks.configs.recommended` + `react-refresh` plugin
* `@typescript-eslint/no-unused-vars` is off (allows intentional unused parameters)
* Run with: `npm run lint`
* Target: ES2020
* Module: ESNext
* Strict mode enabled in `tsconfig.app.json`
* JSX: react-jsx (automatic runtime — no `import React` needed)
* Module resolution: bundler
* Path aliases: `@/*` maps to `./src/*` for frontend
* Frontend strict mode: `true` (in `tsconfig.app.json`)
* Edge functions: Deno runtime with strict TypeScript checking

## Import Organization

* Frontend: `@/*` resolves to `./src/*`
* Examples:

## Error Handling

* Try-catch blocks for async operations
* Errors logged to `console.error()` with bracket-prefixed function name: `console.error('[ResumeStream] message')`
* Error state stored in component state (e.g., `error: string | null` in `StreamState`)
* Toast notifications via `sonner` for user-facing errors:
* Graceful fallbacks: render error state or null rather than crashing
* Null/undefined checks with optional chaining `?.` and nullish coalescing `??`
* Error messages are specific and operationally useful to users
* Structured error responses with HTTP status codes and JSON error objects
* Usage limit errors trigger 402/429 responses with metadata: `{ error: 'message', resetDate?, tier? }`
* Overload detection: check for 529 status or "overloaded" in error text
* Exponential backoff with jitter for retries: `computeBackoffMs(attempt)` returns base 1000ms, max 3000ms + 0-400ms jitter
* Type guards checking error shape before accessing properties
* JSON validation via `repairTruncatedJSON()` for malformed/truncated JSON from streaming
* Authorization failures return 401 with no detail leakage: `{ error: 'Unauthorized' }`

## Logging

* Native `console.log()` and `console.error()`
* Bracket prefix for filtering: `console.log('[ComponentName] message')` or `console.error('[FunctionName] error')`
* Example: `console.log('[ResumeStream] Stream reader acquired')`
* Performance logging via conditional `perf.start/mark/end()` when `VITE_DEBUG_PERF=true`
* Custom `createLogger('function-name', reqId?)` utility (in `_shared/logger.ts`)
* Structured JSON output to stdout (captured by Supabase function logs)
* Log levels: `debug`, `info`, `warn`, `error`
* Each entry includes: `level`, `msg`, `fn`, `ts`, optional `reqId`, custom data fields
* Example:
* Timer utility: `log.timer('operation')` returns function logging elapsed time
* Timing attacks prevented: secrets never logged (use reason codes instead)

## Comments

* Complex business logic or non-obvious algorithms
* Trade-offs and intentional design choices (e.g., why exponential backoff, why this validation strategy)
* Section headers with dashes for visual grouping: `// ── Parallel execution types ──────`
* Explain intent and "why", not mechanics (code is self-documenting)
* Not systematic; type annotations serve as inline documentation
* Only add when explaining non-obvious parameter contracts
* Example: `/** Verifies the incoming request is authenticated for the given auth type. */`

## Function Design

* Most functions 10-50 lines; complex logic may extend to 50-80 lines
* Helpers extracted when logic is reused (e.g., `repairTruncatedJSON`, `extractPartialSummary`, `detectStage`)
* Named parameters via objects when 3+ arguments needed
* Destructuring in function signature for clarity
* Type annotations on all parameters (strict mode enforced)
* Explicit return types on all functions
* Discriminated union types for fallible operations
* Example: `Promise<{ data: T | null; error: Error | null }>`
* Pattern: `{ ok: true; result: X } | { ok: false; error: string }`

## Module Design

* Named exports for utilities and helpers
* Default export for React pages and top-level components
* Supabase client exported as singleton: `export const supabase = createClient<Database>(...)`
* React hooks: colocated with component or extracted to `src/hooks/` if reused
* Types/interfaces: defined at top of file or in shared type files (e.g., `resume-prompts.ts` exports `type PromptParams`)
* Contexts: stored in `src/contexts/`, provide value via custom hook
* Services: collected in `src/integrations/` or `src/lib/`
* Shared edge function utilities: in `supabase/functions/_shared/`
* Not systematically used; prefer direct imports
* Component-specific exports in `index.ts` only when necessary

## Security Patterns

* `timingSafeEqual` for token/secret comparison (prevents timing attacks)
* Zod validation with react-hook-form for frontend input
* Prompt injection defense via `prompt-sanitizer.ts` (regex-based phrase stripping)
* No secrets in `.env` files at deployment; Supabase secrets for backend
* CORS restricted by `APP_URL` env var (fail-closed)
* `requireAuth` / `requireInternalOrUserAuth` helpers for all endpoints
* Secrets never logged; use reason codes instead: `log.warn('auth-failure', { reason: 'secret-mismatch' })`

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## Pattern Overview

* Parallel AI reasoning: Multiple Anthropic API calls execute in parallel, results merge into unified schema
* Centralized shared utilities: `_shared/` layer reduces duplication across 20+ edge functions
* Module-level Supabase client singleton in edge functions to minimize initialization overhead
* Fine-grained job status polling with exponential backoff retry semantics
* Rate limiting, usage tracking, and tier-based access control built into every analysis function

## Layers

* Purpose: User interface for resume upload, feature access, result viewing, account management
* Location: `src/`
* Contains: Pages, components, hooks, contexts, utilities, integrations with Supabase
* Depends on: Supabase auth/client (JWT), Edge Functions (REST API), React Query for server state
* Used by: End users via browser
* Purpose: Business logic execution for AI analysis, job processing, email delivery, webhooks
* Location: `supabase/functions/`
* Contains: Feature-specific analysis functions (analyze-resume, analyze-career, grade-linkedin, etc.), async job processors, email handlers, webhook handlers
* Depends on: Supabase service client, Anthropic API, external APIs (Firecrawl, Stripe, Resend)
* Used by: Frontend (direct invoke via streaming or queue submission), internal job queue (via process-\*-job functions), external webhooks (Stripe)
* Purpose: Reusable helpers across all edge functions
* Location: `supabase/functions/_shared/`
* Contains: Anthropic client wrapper, PDF parser, result merger, JSON repair, sanitization, logging, auth, CORS, rate limiting
* Depends on: Anthropic API, Deno standard library, Supabase service client
* Used by: All edge functions
* Purpose: Persistent storage for user auth, resumes, analyses, jobs, usage tracking
* Location: Managed by Supabase; schema via `supabase/migrations/`
* Contains: `profiles`, `resumes`, `analysis_jobs`, `usage_tracking`, `subscriptions`, `linkedin_grades`, `saved_jobs`, `improvement_checklist` tables
* Depends on: None (lowest layer)
* Used by: Edge functions (service client for direct writes), Frontend (postgrest + auth for reads)

## Data Flow

* `AiCreditsContext`: Tracks credits available, usage limits (localStorage + context), reset dates per tier
* `AdminTierTestContext`: Allows admin override of subscription tier for testing
* Supabase Auth: JWT session stored in browser localStorage, auto-refreshed on near-expiry
* All edge functions validate Bearer token via `requireAuth()` helper
* React Query: Caches analysis results, job status, dashboard data with auto-refresh via `useQuery` and `useInfiniteQuery`
* localStorage: Persists credits depletion status, usage limit info, user preferences
* PostgreSQL tables: Persistent user profiles, resumes, analyses, job queue, usage logs
* All analysis functions call `checkAndRecordUsage()` before expensive operations
* Tier limits checked via `can_perform_ai_action()` SQL function
* 402 response blocks analysis, triggers `AiCreditsContext.markCreditsDepletedFromError()`
* Frontend displays `UpgradeModal` to prompt user to upgrade tier
* Usage resets on per-user billing cycle anniversary (day of month user created account)
* Streaming 529 (Anthropic overloaded) → automatic fallback to async queue path
* Network timeout → explicit error toast, allow user retry
* JWT invalid (401/403) → auto-refresh once via `invokeWithTimeout`, then error
* Anthropic rate limit (429) → usage\_limit error with resetDate, stored in localStorage
* Credits exhausted (402) → block analysis, show upgrade modal
* Rate limit per user (429 from rate-limiter) → wait message, re-enable after cooldown

## Key Abstractions

* Purpose: Abstracts immediate feedback (streaming) from non-blocking background (queue)
* Examples: `useResumeStream` (hook), `analyze-resume` (edge function, streaming path), `submit-resume-analysis-job` + `process-resume-analysis-job` (queue path)
* Pattern: Frontend accepts `stream: true/false` flag; conditionally awaits SSE vs. polls job status with `get-analysis-job-status`
* Purpose: Safely combines multiple parallel Anthropic outputs into consistent schema
* Examples: `result-merger.ts`, `recruiting-lens-merger.ts`, `executeParallelCalls` in `analyze-resume/index.ts`
* Pattern: Each call (criteria-1, criteria-2, summary) produces JSON; merger validates, repairs truncation, merges arrays, applies field precedence rules
* Used by: Resume analysis (3-call parallel), Recruiting Lens (3-call parallel), Career Compass
* Purpose: Single system/user prompt design powers resume, career, LinkedIn, recruiting lens, and job matching
* Examples: `resume-prompts.ts`, `recruiting-lens-prompts.ts` contain system blocks, user prompt builders, improvement context
* Pattern: Prompts reused across multiple feature functions with feature-specific configuration
* Parameterization: `PromptParams` includes resumeText, previousScore, previousSuggestions, tier, etc.
* Purpose: Authorization guard before expensive operations
* Examples: `usage-checker.ts` (edge utility), `AiCreditsContext` (frontend), `usePaywallGuard` (hook)
* Pattern: Query `usage_tracking` table, check against tier limit, return 402 if reached; frontend stores reset date in localStorage
* Tier limits: Free 10, Pro 100, Elite 500 per billing cycle
* Purpose: Single source of truth for all authentication and cross-origin policies
* Examples: `auth.ts` (requireAuth, requireInternalOrUserAuth), `cors.ts` (corsHeaders, handleOptionsRequest)
* Pattern: All functions import shared helpers instead of rolling their own validation
* Auth types: `user` (JWT), `internal` (secret header), `webhook` (Stripe HMAC)
* Purpose: Strip high-confidence multi-word injection phrases before LLM ingestion
* Examples: `prompt-sanitizer.ts` with regex patterns for "ignore instructions", "act as", "you are", etc.
* Pattern: Only user-role messages sanitized; single-word terms preserved to avoid corrupting legitimate text; logs all strips at warn level
* Purpose: Recover from truncated or malformed JSON in streaming responses
* Examples: `json-repair.ts` detects and fixes common truncation patterns
* Pattern: Attempts to restore valid JSON structure by inferring missing closing brackets/braces

## Entry Points

* Location: `src/main.tsx` → `src/App.tsx`
* Triggers: Browser page load, user navigation via React Router
* Responsibilities:
* Location: `supabase/functions/analyze-resume/index.ts`
* Triggers: Frontend streaming request with `stream: true` flag
* Responsibilities:
* Location: `supabase/functions/process-resume-analysis-job/index.ts`
* Triggers: Internal job queue worker polling, scheduled execution
* Responsibilities:
* Location: `supabase/functions/stripe-webhook-handler/index.ts`, `supabase/functions/notify-upgrade-request/index.ts`, email functions
* Triggers: External events (Stripe subscription changes, admin actions, scheduled emails)
* Responsibilities: Verify secret/signature, update database state, send notifications
* Location: `src/components/ProtectedRoute.tsx`
* Triggers: Any navigation to protected route
* Responsibilities:
* Location: `src/pages/Upload.tsx`
* Triggers: User navigates to `/upload` after onboarding
* Responsibilities:
* Location: `src/pages/Results.tsx`
* Triggers: User navigates to `/results/:id` after analysis
* Responsibilities:

## Error Handling

* Pattern: `invokeAnthropicText` detects 529 status or "overloaded" in error
* Action: Frontend catches in `useResumeStream`, calls `submit-resume-analysis-job` to enter queue path
* See: `analyze-resume/index.ts` lines 16-18, `useResumeStream.ts` lines 140-148
* Pattern: `invokeWithTimeout` detects JWT-related errors (invalid token, expired)
* Action: Calls `supabase.auth.refreshSession()`, retries once
* See: `fetchWithTimeout.ts` lines 103-108
* Pattern: Backend returns 429 with `{ resetDate, tier }` in response body
* Action: Frontend's `AiCreditsContext.markCreditsDepletedFromError()` stores in localStorage
* UI: `UpgradeModal` displayed, blocking further analysis until upgrade or reset date
* See: `AiCreditsContext.tsx`, `usage-checker.ts` lines 70-89
* Pattern: `checkRateLimit` returns 429 with `retryAfterSeconds` if limit exceeded
* Action: User sees toast with cooldown message, auto-retry disabled
* See: `rate-limiter.ts`
* Pattern: `invokeWithTimeout` wraps Supabase calls with configurable timeout (default 2min)
* Action: Returns `{ data: null, error: 'Request timed out. Please try again.' }`
* UI: Toast notification, user can retry manually
* Pattern: `extractPartialSummary` finds unclosed quotes and escapes in accumulated buffer
* Action: Displays partial content to user while remaining data streams
* See: `useResumeStream.ts` lines 51-73
* Pattern: If stream closes without `complete` event, attempt to parse accumulated JSON
* Action: If valid JSON found, treat as result; otherwise error state
* See: `useResumeStream.ts` lines 231-250

## Cross-Cutting Concerns

* Frontend: Native `console.log('[ComponentName] message')` with bracket prefix for filtering
* Edge Functions: Custom `createLogger('function-name', reqId?)` utility, structured JSON to stdout
* Log levels: `info`, `error`, `warn`, `debug`
* Each entry includes: `level`, `msg`, `fn`, `ts`, optional `reqId`, custom fields
* Timer utility: `log.timer('operation')` returns function logging elapsed time
* See: `logger.ts`
* Frontend: Zod schemas for form inputs; react-hook-form integration
* Edge Functions: Manual type checks, length/format validation (e.g., resumeText min 50 chars)
* Zod validator in `handleRequest` wrapper strips unknown fields, provides field-level error details
* See: `handler.ts` lines 96-114
* Mechanism: Supabase Auth (email/password or OAuth)
* Token Storage: Browser localStorage, auto-refreshed on near-expiry
* Edge Function Verification: `getUser()` call with Bearer token; service role key for system operations
* See: `auth.ts`, `supabaseClient.ts`
* Mechanism: `can_perform_ai_action()` SQL function queries `usage_tracking` table
* Frontend Guard: `AiCreditsContext` checks credits before submission
* Edge Function Guard: `usage-checker` verifies before expensive operations, returns 402 if limit reached
* Tier limits: Free 10, Pro 100, Elite 500 per billing cycle
* See: `usage-checker.ts`, `AiCreditsContext.tsx`
* Mechanism: `rate-limiter.ts` edge function utility (per-user sliding window counters)
* Strategy: Returns 429 if window limit exceeded, includes `retryAfterSeconds`
* Purpose: Prevent abuse of expensive operations (analysis, LinkedIn grading)
* See: `rate-limiter.ts`
* Frontend Endpoints: Origin restricted via `APP_URL` env var (fail-closed)
* Internal Endpoints: No CORS headers (not browser-accessible)
* Webhook Endpoints: No CORS headers (called by Stripe servers)
* See: `cors.ts`, `handler.ts` line 55
* Frontend: `perf` module logs analysis duration, first-byte time, score to Speed Insights
* Edge Functions: Logs call duration, response size, error status via structured logger
* Goal: Monitor latency, identify bottlenecks, track regression
* See: `perf.ts`, `logger.ts`

<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

* `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
* `/gsd-debug` for investigation and bug fixing
* `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.

<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.

<!-- GSD:profile-end -->

* Make changes directly in the workspace when the user asks for implementation work.
* Prefer small, reversible changes over broad rewrites unless a structural migration is explicitly requested.
* Keep production reliability ahead of experimental scaling changes.
* When debugging deploy/runtime issues, verify the current deployed path before adding retries or abstractions.

## Stack

* Frontend: Vite + React + TypeScript + shadcn/ui + Tailwind CSS
* Backend services in this repo: Supabase (Auth, Postgres, Storage, Edge Functions)
* AI provider: Anthropic Claude

## Important Commands

* Install dependencies: `npm i`
* Start dev server: `npm run dev`
* Build production frontend: `npm run build`
* Lint: `npm run lint`
* Preview production build: `npm run preview`

## Repository Conventions

* Frontend app code lives in `src/`
* Supabase config, migrations, and functions live in `supabase/`
* Deployment and utility scripts live in `scripts/`
* Prefer `rg` for searching files and text
* Prefer `apply_patch` for focused edits

## Reliability Priorities

* Resume Analysis and Career Compass are business-critical user flows.
* Restore a working synchronous path before layering on queueing or fallback complexity.
* Treat repeated `OPTIONS`/preflight `503` responses as platform routing failures, not prompt/model failures.
* Avoid retry loops that create bad UX if the upstream route is consistently unavailable.

## Environment Notes

* Frontend feature flags use `VITE_*` variables.
* Backend secrets for deployed services must be set in the target environment; local `.env` values do not automatically deploy.
* Keep staging and production settings separate and explicit.

## Coding Style

* Preserve existing TypeScript and React patterns used in the repo.
* Avoid adding unnecessary abstractions when a single helper function is enough.
* Keep user-facing error messages specific and operationally useful.

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.

<!-- GSD:skills-end -->
