# Strivo AI

Strivo is an AI-powered career platform focused on resume and job-readiness outcomes:

* Resume analysis with rubric-based scoring, ATS-focused feedback, and rewrite suggestions
* Career Compass analysis
* LinkedIn profile grading
* Job matching
* Credit/tiered paywall flow (Free/Pro/Elite)

The frontend is a Vite + React + TypeScript app, and backend workloads run on Supabase Edge Functions with Anthropic models.

## Current Project Status

The repository includes a full planning/execution trail under `.planning/` and Claude workflow assets under `.claude/`.

Latest milestone (completed 2026-03-23):

* Resume analysis performance optimization shipped
* Architecture moved from single large API response to a parallel 3-call merge path
* Target/observed outcome: reduced analysis latency from \~110s baseline to \~42s average (35-56s observed range by tier/length)
* Estimated cost remains under the \$0.10 ceiling for both free and elite tiers

## Tech Stack

* Frontend: React 18, TypeScript, Vite, Tailwind, shadcn/ui, React Router
* Backend: Supabase (Auth, Postgres, Storage, Edge Functions on Deno)
* AI: Anthropic Claude models via shared edge-function utilities
* Observability: Vercel Analytics + Speed Insights

## Repository Layout

```text
src/                    React app (pages, hooks, components, contexts, utilities)
supabase/functions/     Edge functions for AI analysis, jobs, webhooks, email
supabase/migrations/    Database schema migrations
scripts/                Validation and deploy scripts
.planning/              Project planning, research, roadmap, phase artifacts
.claude/                Claude/GSD command, workflow, and agent definitions
```

## Local Development

### Prerequisites

* Node.js 22+
* npm
* Supabase project credentials (frontend vars + backend secrets)

### Run Frontend

```Shell
npm i
npm run dev
```

# Other scripts:



**Use Claude Code**

You can also work with this repo in Claude Code. Recommended setup:

```Shell
# Step 1: Install dependencies
npm i

# Step 2: Open the repo in Claude Code
cd strive-ai-hired
claude
```

This repo includes a project-level `CLAUDE.md` file. Claude Code will use that file as the project memory/instructions source for this workspace.

Recommended environment for this project:

* Keep frontend feature flags in your local or hosted env (`VITE_*`)
* Keep backend secrets in Supabase secrets, not only in local `.env`
* Use `npm run build` before shipping frontend changes

**Edit a file directly in GitHub**

```Shell
npm run build
npm run preview
npm run lint
```

## Environment Variables

The canonical, secret-free reference for every live environment variable —
names, consumers, required/optional status, and which surface sets each — lives in
[`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md). The copy-paste skeletons are
`.env.example` (production-runtime: frontend `VITE_*` + Supabase edge secrets) and
`.env.test.local.example` (test/CI + E2E). Values are never recorded in the repo.

At a high level:

* **Frontend (`.env` / `.env.local`)** — public `VITE_*` build vars (Supabase URL +
  publishable/anon key, Stripe publishable key, optional feature flags).
* **Supabase Edge Function secrets** — backend-only secrets (Supabase service role,
  Anthropic, internal job secret, Resend, Stripe secret + webhook + price IDs, CORS
  `APP_URL`, admin emails, optional OCR fallbacks). Set per target environment in
  Supabase secrets — local `.env` values do not deploy automatically.

See `docs/ENVIRONMENT.md` for the authoritative per-name matrix, including which
surface (Vercel / Supabase prod / Supabase preview-test / GitHub Actions / local) sets
each name.

## Testing and Validation

* Frontend lint: `npm run lint`
* Edge utility tests (Deno):

```PowerShell
.\scripts\run-edge-tests.ps1
```

* Performance validation benchmark (Phase 6 artifact):

```Shell
node scripts/validate-performance.mjs --env staging --runs 3 --cooldown 8 --warmup
```

Test fixtures are in `scripts/test-resumes/`.

## Deployment

Deployment is done via the unified Supabase CLI deploy script `scripts/deploy.ps1`,
parameterized by target environment:

* `.\scripts\deploy.ps1 -Env staging`
* `.\scripts\deploy.ps1 -Env production`
* `.\scripts\deploy.ps1 -Env test`

`deploy-staging.ps1` / `deploy-production.ps1` are thin shims that forward into
`deploy.ps1` with the matching `-Env`.

The deploy target is selected by an **explicit `supabase link --project-ref <ref>`**
inside `scripts/deploy.ps1` (the single source of truth for which project is targeted)
— it is NOT driven by copying or overwriting the `supabase/config.toml` project id
(that earlier footgun was intentionally removed). Before any project is linked or any
function is deployed, the script runs `npm run verify:baseline` (vitest + offline-deno +
Playwright) as a HARD precondition gate: a red suite aborts the deploy (exit 1) before
`supabase link`. The `-SkipVerify` switch is a documented emergency-only escape hatch
(default OFF).
