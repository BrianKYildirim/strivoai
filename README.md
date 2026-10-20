# StrivoAI

StrivoAI is an AI-powered career intelligence platform that helps users understand their professional positioning, improve their application materials, and make more informed career decisions.

Instead of providing generic resume suggestions, StrivoAI combines resume analysis, LinkedIn evaluation, career planning, recruiting signals, interview preparation, and job-search organization into one connected career workspace.

## Product Overview

StrivoAI is designed to answer questions such as:

- How strong is my resume from an ATS and recruiter perspective?
- Which roles am I currently competitive for?
- What skills or experience would help me move into a stronger role?
- Does my LinkedIn profile tell the same story as my resume?
- Which parts of my profile are reducing my chances of getting interviews?
- How should I position myself for a specific career direction?
- Which opportunities are worth pursuing?
- How can I prepare stronger answers for interviews?
- What should I work on next?

The platform turns these questions into structured analysis, prioritized recommendations, and concrete next steps.

## Core Features

### Resume Analysis

Users can upload their resume for an AI-powered evaluation that examines:

- Resume structure and readability
- ATS compatibility
- Recruiter first impressions
- Strength and clarity of professional positioning
- Quality of accomplishments and supporting evidence
- Use of measurable outcomes
- Role-specific keywords
- Missing or underdeveloped skills
- Weak, vague, or repetitive language
- Section-level improvements
- Suggested rewrites
- Overall readiness and positioning scores

The analysis is designed to produce actionable recommendations rather than only a numerical score.

### LinkedIn Profile Grading

StrivoAI evaluates a LinkedIn profile to identify how effectively it communicates a candidate's value to recruiters.

The LinkedIn workflow supports:

- Profile grading
- Headline analysis
- About-section feedback
- Experience-section analysis
- Skills and keyword review
- Recruiter-facing positioning
- Missing profile signals
- Profile improvement recommendations
- Alignment checks against the user's resume

LinkedIn profiles can be provided through profile data or supported document workflows. The platform can also use profile information as an input to broader career analysis.

### Career Compass

Career Compass helps users understand their current career direction and possible next moves.

It can provide:

- Best-fit roles
- Alternative or unexpected role matches
- Relevant career fields
- Role-readiness evaluations
- Skill and experience gaps
- Career transition recommendations
- A 12-month career roadmap
- Recommended actions for improving readiness
- Compensation intelligence for eligible users
- Role transition return-on-investment analysis
- Long-term earnings perspectives

Career Compass begins by classifying the user's professional domain and then generates recommendations that are specific to that domain rather than relying on generic career examples.

### Recruiting Lens

Recruiting Lens evaluates a profile from the perspective of a recruiter or hiring team.

It focuses on questions such as:

- What impression does the candidate make in the first few seconds?
- Is the candidate's direction clear?
- Are their accomplishments differentiated?
- Is their experience relevant to the roles they want?
- What evidence is missing?
- What would make the candidate more competitive?
- Which changes should be made first?

The feature produces recruiter-oriented strengths, weaknesses, positioning feedback, and prioritized fixes.

### Interview Preparation

StrivoAI includes an interview preparation workflow that helps users convert their background into stronger interview responses.

Interview preparation can include:

- Role-specific interview questions
- Competency-based prompts
- STAR-style answer scaffolds
- Resume-backed talking points
- Suggested situations, actions, and outcomes
- Feedback on response quality
- Missing evidence or weak signals
- Interview coaching notes
- Reusable preparation flashcards

The preparation workflow is designed to help users practice credible, evidence-based answers instead of memorizing generic responses.

### Job and Application Organization

The platform includes career-search organization features for managing opportunities and connecting analysis to actual applications.

These workflows support concepts such as:

- Saved jobs
- Job matching
- Application tracking
- Target roles
- Target companies
- Recommendations
- Application strategy
- Job-specific positioning

The dashboard connects career insights with practical actions so users can move from analysis to execution.

### Career Dashboard

The dashboard acts as a central career workspace.

It can combine signals from:

- Resume Analysis
- LinkedIn Grade
- Career Compass
- Saved Jobs
- Recruiting Lens
- Interview Preparation
- Application activity

Dashboard intelligence includes:

- Next recommended actions
- Career readiness information
- Recruiter first-impression summaries
- Resume and LinkedIn profile alignment
- Profile staleness indicators
- Goal-readiness insights
- Cross-feature recommendations
- Feature-specific calls to action

The goal is to help users understand not only what is wrong, but what to do next.

## Analysis Workflow

A typical analysis follows this general flow:

```text
User document or profile
        │
        ▼
Document validation and extraction
        │
        ▼
Structured profile data
        │
        ▼
Domain and role classification
        │
        ▼
AI analysis with feature-specific schemas
        │
        ▼
Stored analysis result and score
        │
        ▼
Dashboard insights, recommendations, and next actions
```

Long-running analyses use job-oriented workflows so the frontend can display progress and recover from interrupted or delayed requests.

The system includes separate submission, processing, and status paths for major analysis types, including resume and career analysis.

## AI-Powered Analysis Services

The backend is organized around Supabase Edge Functions and feature-specific AI workflows.

Major analysis functions include:

- `analyze-resume`
- `analyze-career`
- `grade-linkedin`
- `recruiting-lens`
- `interview-prep-analyze`
- `interview-prep-evaluate`

Supporting functions handle:

- Document validation
- PDF and document extraction
- OCR fallback processing
- Analysis job submission
- Analysis job processing
- Analysis status polling
- Result structure extraction
- Lifecycle archive writing
- Stale analysis cleanup
- Warm-up and operational tasks

AI responses use structured output schemas so that results can be rendered consistently by the frontend.

## Domain-Aware Career Intelligence

Career analysis is domain-aware.

Rather than giving every user the same recommendations, StrivoAI attempts to identify the user's primary and secondary professional domains from their resume and profile content.

The detected domain influences:

- Recommended roles
- Relevant career fields
- Skill-gap analysis
- Career readiness comparisons
- Compensation estimates
- Role transition recommendations
- Application strategy
- Company and industry examples

This helps prevent generic recommendations that do not match the user's actual background.

## Compensation and Application Intelligence

Eligible Career Compass experiences include additional career-planning intelligence.

### Compensation Intelligence

The platform can provide domain-specific compensation analysis, including:

- Entry-level salary bands
- Mid-level salary bands
- Senior-level salary bands
- Estimated starting compensation
- Percentile positioning
- Role-specific earning context
- Five-year earnings projections

### Role Transition ROI

The platform can compare potential career moves based on:

- Expected salary increase
- Estimated transition time
- Upskilling investment
- Difficulty
- Potential return on investment
- Role-to-role progression

### Smart Application Strategy

Recommended opportunities can be grouped into categories such as:

- **Apply** — strong match and attractive opportunity
- **Maybe** — reasonable match that may require additional preparation
- **Skip** — weak match or poor use of application effort

These recommendations are intended to help users prioritize their job-search time.

## Feature Access and Tiers

StrivoAI supports feature access controls and tier-aware experiences.

The application includes:

- Free access paths
- Elite feature access
- Feature locks and upgrade prompts
- Usage limits
- Input and output token ceilings
- Analysis usage tracking
- Credit and merit-related infrastructure
- Stripe checkout and subscription management
- Payment intent and customer portal flows

Free users can see selected locked feature surfaces and previews, while eligible paid experiences expose deeper analysis and additional career intelligence.

Feature access is enforced across both the frontend and backend rather than relying only on UI visibility.

## Architecture

StrivoAI uses a modern web application architecture:

```text
React + TypeScript frontend
          │
          ▼
Supabase Auth, Database, and Storage
          │
          ▼
Supabase Edge Functions on Deno
          │
          ├── Anthropic AI workflows
          ├── Document extraction and OCR
          ├── Stripe billing
          ├── Email notifications
          ├── LinkedIn profile retrieval
          └── Analysis jobs and lifecycle processing
```

### Frontend

The frontend is a Vite-powered React and TypeScript single-page application.

It includes:

- React Router navigation
- Protected routes
- Authentication-aware UI
- React Query data management
- Typed feature models
- Form validation with React Hook Form and Zod
- Tailwind CSS styling
- Radix UI primitives
- Recharts visualizations
- Framer Motion animations
- Responsive dashboard layouts
- Error boundaries and recovery states
- Loading and analysis-progress experiences

### Backend

Backend functionality is implemented using Supabase Edge Functions running on Deno.

The backend provides:

- Authenticated analysis endpoints
- AI model orchestration
- Structured result validation
- Database persistence
- Background analysis jobs
- Subscription and billing workflows
- Email notifications
- Admin operations
- Metrics and operational utilities

### Database and Storage

Supabase provides:

- Authentication
- PostgreSQL data storage
- Row-level security
- Resume and document storage
- Analysis history
- Job state persistence
- Subscription state
- Usage tracking
- Role and permission data

Database changes are managed through the migration files in `supabase/migrations`.

## AI Request Architecture

Resume and career analysis are designed to avoid a single oversized AI request.

The current architecture supports parallelized analysis and merging workflows, allowing complex analysis to be divided into smaller feature-specific calls.

This approach helps with:

- Lower response latency
- More focused prompts
- More predictable response sizes
- Feature-specific output schemas
- Better failure isolation
- Tier-specific analysis depth
- More precise usage and cost telemetry

Career analysis can include separate base, growth, and elite-enhancement paths depending on the active tier.

## Document Processing

StrivoAI includes document-processing utilities for extracting useful content from uploaded files.

The document workflow supports:

- Resume uploads
- PDF extraction
- LinkedIn export processing
- Document validation
- Text normalization
- OCR fallback paths
- Image-based or difficult-to-parse documents
- Pre-analysis validation
- File size and format controls

OCR integrations can include fallback providers when the primary extraction path cannot recover usable text.

## Integrations

The repository includes integrations for several external services.

### Anthropic

Anthropic models power the primary AI analysis workflows.

Shared utilities handle:

- Model selection
- Fallback models
- Prompt invocation
- Structured output
- Retry behavior
- Timeouts
- Usage telemetry
- Feature and tier metadata

### Supabase

Supabase provides:

- Authentication
- PostgreSQL
- Storage
- Edge Functions
- Database migrations
- Row-level security
- Server-side secrets
- Analysis persistence

### Stripe

Stripe supports the paid product experience through:

- Checkout sessions
- Payment intents
- Subscription management
- Customer portals
- Webhook processing
- Subscription renewal and cancellation
- Tier and entitlement updates

### Email Delivery

Email-related Edge Functions support:

- Welcome messages
- Feature notifications
- Upgrade notifications
- Administrative notifications
- Credits-exhausted notifications
- Scheduled emails
- Transactional application messages

### LinkedIn Retrieval

The career analysis workflow can use a LinkedIn scraping integration to retrieve profile information when a supported LinkedIn URL is provided.

### Analytics and Performance Monitoring

The frontend includes:

- Vercel Analytics
- Vercel Speed Insights
- Request and performance instrumentation
- Feature-level timing
- Analysis telemetry

## Security and Reliability Patterns

The repository includes several safeguards for a production-oriented AI application:

- Supabase authentication
- Protected application routes
- Server-side secret handling
- Row-level security tests
- Request-aware CORS handling
- Internal job authentication
- Request IDs for tracing
- Structured logging
- Error boundaries
- Analysis recovery states
- Input validation
- Document validation
- Upload limits
- Retry and timeout handling
- Explicit environment separation
- Feature flags
- Backend entitlement checks
- Prompt-injection evaluation fixtures
- Stale-job cleanup
- Analysis lifecycle controls

AI-generated content is treated as structured application data rather than being rendered as arbitrary unvalidated output.

## Testing and Quality Gates

The repository contains multiple testing layers.

### Frontend Tests

Frontend tests use Vitest and Testing Library to cover:

- React components
- Feature gates
- Pricing behavior
- Dashboard rendering
- Analysis recovery states
- Interview preparation
- LinkedIn grading
- Career Compass
- Results pages
- Document extraction
- Billing components
- Error boundaries

Run the frontend test suite with:

```bash
npm run test
```

### Edge Function Tests

Deno tests cover shared backend utilities and Edge Function behavior.

```bash
npm run test:edge
```

Remote Supabase test paths are also available:

```bash
npm run test:edge:remote
```

### End-to-End Tests

Playwright tests validate key user journeys and authenticated application behavior.

```bash
npm run test:e2e
```

Additional suites support development and production targets:

```bash
npm run test:e2e:xdev
npm run test:e2e:prod
```

### Static Validation

```bash
npm run lint
npm run type-check
npm run build
```

The repository also defines a full baseline verification command:

```bash
npm run verify:baseline
```

This combines linting, type checking, frontend tests, Edge Function tests, end-to-end tests, and a production build.

### Adversarial AI Testing

Prompt-injection evaluation suites are included for major AI workflows:

```bash
npm run test:adversarial:resume
npm run test:adversarial:career
npm run test:adversarial:linkedin
npm run test:adversarial:recruiting
npm run test:adversarial
```

These tests help validate that user-provided document content cannot improperly override system instructions or alter the intended analysis behavior.

## Deployment and Environment Design

The application separates frontend deployment configuration from backend Edge Function secrets.

### Frontend configuration

Frontend variables use the `VITE_` prefix and are consumed by the Vite build.

Examples include:

- Supabase URL
- Supabase publishable or anonymous key
- Stripe publishable key
- Feature flags
- Optional analysis function overrides
- Debugging and performance toggles

### Backend configuration

Supabase Edge Functions use server-side secrets for:

- Anthropic access
- Supabase service-role access
- Stripe secrets
- Stripe webhook verification
- Email delivery
- LinkedIn retrieval
- OCR fallbacks
- Internal job authentication
- CORS configuration
- Application URLs
- Price identifiers

The repository documents the environment-variable names, consumers, required status, and deployment surface in [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md).

## Repository Structure

```text
strivoai/
├── src/
│   ├── components/                 # Shared UI and feature components
│   ├── config/                     # Feature, pricing, and environment configuration
│   ├── contexts/                   # Authentication, analysis, and application state
│   ├── hooks/                      # Reusable data and feature hooks
│   ├── lib/                        # API clients, analysis logic, utilities, and intelligence models
│   ├── pages/                      # Product routes and page-level experiences
│   ├── test/                       # Frontend test support
│   └── main.tsx                    # Frontend entry point
├── supabase/
│   ├── functions/
│   │   ├── _shared/                # Shared Edge Function utilities
│   │   ├── analyze-career/         # Career Compass analysis
│   │   ├── analyze-resume/         # Resume analysis
│   │   ├── grade-linkedin/         # LinkedIn grading
│   │   ├── recruiting-lens/        # Recruiter-perspective analysis
│   │   ├── interview-prep-analyze/ # Interview preparation generation
│   │   ├── interview-prep-evaluate/# Interview response evaluation
│   │   ├── submit-*-job/           # Analysis job submission
│   │   ├── process-*-job/          # Background analysis processing
│   │   ├── get-*-status/            # Analysis status retrieval
│   │   ├── stripe-*/                # Billing and subscription workflows
│   │   ├── send-*/                  # Email delivery workflows
│   │   └── _tests/                  # Deno and backend tests
│   ├── migrations/                 # PostgreSQL schema migrations
│   └── config.toml                 # Supabase configuration
├── docs/
│   └── ENVIRONMENT.md              # Environment and deployment reference
├── e2e/                            # Playwright end-to-end tests
├── scripts/                        # Validation, deployment, test, and audit tools
├── public/                         # Public static assets
├── package.json                    # Scripts and dependencies
├── vite.config.ts                  # Vite configuration
├── vitest.config.ts                # Vitest configuration
├── playwright.config.ts            # Playwright configuration
├── tailwind.config.ts              # Tailwind configuration
└── README.md
```

## Engineering Characteristics

StrivoAI is built around several engineering priorities:

- Typed feature contracts between the UI and backend
- Structured AI output rather than free-form parsing
- Domain-specific career recommendations
- Feature-level usage tracking
- Tier-aware analysis depth
- Recoverable asynchronous jobs
- Persistent analysis history
- Strong frontend and backend test coverage
- Explicit deployment environments
- Prompt-injection evaluation
- Observable AI request performance
- Clear separation between public frontend configuration and backend secrets

## Project Direction

The platform is evolving toward a unified career operating system where users can:

1. Understand their current professional positioning.
2. Identify realistic target roles.
3. Improve their resume and LinkedIn profile.
4. Track opportunities.
5. Prepare for interviews.
6. Measure progress over time.
7. Receive prioritized recommendations for their next career actions.

StrivoAI is intended to connect career analysis with execution: not just explaining how a profile could improve, but helping users decide what to change, which opportunities to pursue, and what to do next.
