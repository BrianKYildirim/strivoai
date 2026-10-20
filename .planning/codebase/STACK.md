# Technology Stack

**Analysis Date:** 2026-04-11

## Languages

**Primary:**
- TypeScript 5.8.3 - All frontend application code in `src/`, strict mode enabled
- TypeScript 5.8.3 - All Supabase Edge Functions in `supabase/functions/`, strict mode enabled

**Secondary:**
- SQL - Database schema and migrations in `supabase/migrations/`
- JavaScript (via ESM) - Build configuration and utilities in `vite.config.ts`, `eslint.config.js`, scripts

## Runtime

**Environment:**
- Node.js 22+ (as specified in `package.json` and project requirements)
- Browser runtime (Vite SPA, ES2020 target)
- Deno 2+ - Runtime for Supabase Edge Functions via `deno.json` imports
- Deno standard library: `https://deno.land/std@0.168.0/` (HTTP server, crypto utilities)

**Package Manager:**
- npm - Primary package manager for frontend dependencies
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- React 18.3.1 - UI framework in `src/`
- React Router 6.30.1 - SPA routing and navigation (multi-page flows)
- Vite 5.4.19 - Build tool and dev server with React SWC plugin, configured in `vite.config.ts`

**UI & Styling:**
- shadcn/ui - Component library built on Radix UI primitives
- Radix UI - 35+ components including accordion, alert-dialog, checkbox, dialog, dropdown-menu, hover-card, label, menubar, navigation-menu, popover, progress, radio-group, scroll-area, select, separator, slider, switch, tabs, toast, toggle, tooltip
- Tailwind CSS 3.4.17 - Utility-first CSS framework with theme in `tailwind.config.ts`
- Tailwind CSS Animate 1.0.7 - Animation utilities
- Tailwind CSS Typography 0.5.16 - Typography plugin
- Framer Motion 12.23.26 - Animation and motion effects for complex UI interactions
- next-themes 0.3.0 - Theme management (light/dark mode switching)
- Lucide React 0.462.0 - Icon library for UI components

**Forms & Validation:**
- React Hook Form 7.61.1 - Form state management with minimal re-renders
- @hookform/resolvers 3.10.0 - Validation resolver support for multiple schema libraries
- Zod 3.25.76 - Type-safe schema validation for forms and API responses

**State Management & Data:**
- TanStack React Query 5.83.0 - Server state management and API caching (`useQuery`, `useInfiniteQuery`)
- React Helmet Async 2.0.5 - Document head management (titles, metas)

**Notifications & UI:**
- Sonner 1.7.4 - Toast notification system in `src/components/ui/sonner`
- @radix-ui/react-toast 1.2.14 - Underlying toast provider

**Data Visualization & Content:**
- recharts 2.15.4 - Chart and data visualization components
- react-markdown 10.1.0 - Markdown rendering for display content
- react-pdf 10.2.0 - PDF viewer component for resume preview
- pdfjs-dist 5.4.394 - PDF.js worker library for client-side PDF parsing
- embla-carousel-react 8.6.0 - Carousel component for image/content sliders

**Layout & Utilities:**
- react-resizable-panels 2.1.9 - Resizable panel layout for dashboard views
- vaul 0.9.9 - Drawer component (built on Radix Dialog)
- cmdk 1.1.1 - Command/search palette for navigation
- class-variance-authority 0.7.1 - Utility for component class composition and variants
- clsx 2.1.1 - Classname composition utility
- tailwind-merge 2.6.0 - Merge conflicting Tailwind classes safely
- canvas-confetti 1.9.4 - Confetti animation effects for celebrations
- html2canvas 1.4.1 - HTML to canvas/image conversion
- jspdf 4.0.0 - PDF generation for exporting results
- date-fns 3.6.0 - Date formatting and manipulation utilities

**Testing & Development:**
- No npm packages for business logic; shared utilities are colocated in `supabase/functions/_shared/`

## Key Dependencies

**Backend Services:**
- @supabase/supabase-js 2.81.1 - Client library for auth, Postgres database, and storage operations
- Supabase CLI 2.76.9 - Local development and deployment of edge functions

**External APIs:**
- Anthropic Claude API - LLM model calls via HTTP (no SDK; direct fetch via `supabase/functions/_shared/anthropic.ts`)
- Firecrawl API - Web scraping for LinkedIn profile data (optional, `supabase/functions/analyze-career/index.ts`)
- Resend - Email delivery service (HTTP API calls from edge functions)
- Paddle - Payment processing and subscription webhooks (webhook verification in `supabase/functions/paddle-webhook/index.ts`)

**Observability:**
- @vercel/analytics 1.6.1 - Analytics integration in `src/App.tsx`
- @vercel/speed-insights 1.3.1 - Web performance monitoring in `src/App.tsx`

**Authentication:**
- @lovable.dev/cloud-auth-js 0.0.3 - Custom authentication integration (optional)

**Miscellaneous:**
- cobe 2.0.1 - 3D globe visualization (for landing page or features)
- input-otp 1.4.2 - OTP input component for auth flows
- react-day-picker 8.10.1 - Date picker component

## Configuration

**TypeScript:**
- `tsconfig.json` - Base TypeScript settings with @ path alias mapping to `./src/*`
- `tsconfig.app.json` - Frontend app TypeScript settings (ES2020 target, strict mode, DOM lib)
- `tsconfig.node.json` - Node/build tool TypeScript settings

**Build & Dev:**
- `vite.config.ts` - Vite configuration with React SWC plugin, path aliases (@/), and react-pdf optimization
- `vite.config.ts` also sets up dev server on port 8080 with CORS enabled

**Styling:**
- `tailwind.config.ts` - Tailwind theme with custom colors (primary via CSS vars, accent color configuration)
- `postcss.config.js` - PostCSS with Tailwind and autoprefixer

**Linting & Formatting:**
- `eslint.config.js` - ESLint FlatConfig with React hooks and refresh plugins
- Base configs: `@eslint/js.configs.recommended` + `typescript-eslint.configs.recommended`
- React-specific: `react-hooks.configs.recommended` + `react-refresh` plugin
- Rule overrides: `@typescript-eslint/no-unused-vars` is off
- No dedicated Prettier config; ESLint rules enforce style

**Edge Functions:**
- `supabase/functions/deno.json` - Deno task definitions for testing and import mappings
- `supabase/functions/deno.lock` - Deno dependency lockfile for reproducible builds

**Frontend Environment:**
- `VITE_SUPABASE_URL` - Supabase project URL (required)
- `VITE_SUPABASE_PUBLISHABLE_KEY` or `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key (required)
- `VITE_ANALYZE_CAREER_FUNCTION` - Optional override for career analysis function name (defaults to "analyze-career")
- `VITE_DEBUG_PERF` - Optional performance logging toggle

**Edge Function Secrets (set in Supabase environment):**
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for unrestricted database access
- `SUPABASE_ANON_KEY` - Anonymous key for frontend-like calls
- `ANTHROPIC_API_KEY` - Anthropic API key for Claude model calls
- `ANTHROPIC_MODEL_TEXT` - Optional override for primary LLM model name (defaults per function)
- `ANTHROPIC_MODEL_FALLBACK` - Optional fallback model name for overload scenarios
- `INTERNAL_JOB_SECRET` - Secret for internal job queue authentication
- `RESEND_API_KEY` - Resend email service API key
- `PADDLE_WEBHOOK_SECRET` - Paddle webhook signature verification secret
- `APP_URL` - Application base URL for CORS and redirect validation
- `FIRECRAWL_API_KEY` - Optional API key for LinkedIn profile scraping
- `RAPIDAPI_KEY` - Optional API key for job search integrations (not currently used)

## Platform Requirements

**Development:**
- Node.js 22+
- npm (or equivalent Node package manager)
- Supabase CLI 2.76.9+ (for local development and function deployments)
- Deno 2+ (for running edge function tests locally via `deno test`)

**Production:**
- Vercel - Frontend hosting (SPA with rewrites configured in `vercel.json`)
- Supabase - Backend services (PostgreSQL, Auth, Edge Functions, Storage)
- Deno runtime - Executes edge functions on Supabase infrastructure
- Anthropic Claude API - LLM inference (via HTTPS, `https://api.anthropic.com/v1/messages`)

**Optional Services:**
- Firecrawl API - Web scraping for LinkedIn profiles
- Resend - Transactional email delivery
- Paddle - Payment processing and subscription management
- RapidAPI/JSearch - Job search API (infrastructure in place but not active)

## Build & Deployment Commands

```bash
npm i                    # Install dependencies
npm run dev              # Start local dev server (port 8080)
npm run build            # Build production frontend
npm run build:dev        # Build in development mode
npm run lint             # Run ESLint
npm run preview          # Preview production build locally
```

Edge function deployment via Supabase CLI:
- `supabase functions deploy` - Deploy all functions
- `supabase functions deploy [function-name]` - Deploy specific function
- `supabase migration up` - Apply pending migrations

---

*Stack analysis: 2026-04-11*
