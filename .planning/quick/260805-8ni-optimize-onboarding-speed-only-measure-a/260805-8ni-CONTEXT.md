# Quick Task 260805-8ni: Optimize onboarding speed only - Context

**Gathered:** 2026-08-05
**Status:** Ready for planning

<domain>
## Task Boundary

Reduce **actual** wall-clock completion time of the onboarding path from client submit →
resume extraction → analysis → results ready.

**Hard non-goals (explicitly out of scope — do not touch):**
- Behavior changes of any kind
- AI prompts, model selection, token budgets, output quality
- Merit logic
- Persistence semantics
- Career Compass recovery
- UI flow
- Any unrelated functionality

**Explicitly forbidden:** faking faster progress, shortening/animating the loader to
*appear* faster. The real backend flow must become faster.

**Permitted optimization classes only:**
- unnecessary sequential waits
- duplicate parsing / duplicate requests
- blocking telemetry/analytics
- unnecessary DB reads/writes
- polling delays
- independent operations that can run in parallel

</domain>

<decisions>
## Implementation Decisions

### Measurement methodology — LOCKED
Instrument + split-measure.
- Preview/staging runs `AI_TEST_MODE` fixtures and **never calls Anthropic**, so real AI
  latency is not observable there.
- Therefore: measure **non-AI segments** (client parse, upload, edge invoke, DB reads/writes,
  telemetry, handoffs, polling) on staging where they are real.
- Measure **AI segments** from existing **production** edge-function logs (read-only).
- Optimize **only non-AI overhead**. AI call duration is out of scope by the task's own
  constraints (no prompt/model/token changes), so it is a fixed cost to be measured, not reduced.

### Path scope — LOCKED
**Client submit → results ready.** Includes:
- client-side PDF text extraction
- upload
- edge function invoke
- analysis execution
- persistence
- results render

Excludes the earlier onboarding wizard steps (goal input, profile setup).

### Telemetry handling — LOCKED
Fire-and-forget **with durability preserved**.
- Move telemetry off the critical path.
- Keep the write guaranteed via background/`waitUntil`-style completion so **no telemetry
  rows are lost**.
- Zero behavior change, zero data loss.

### Verification — LOCKED
- Staging only. **Do not deploy Production automatically.**
- Must test **Free + Elite** onboarding.
- Must confirm unchanged: Resume Analysis, saved-resume persistence, merits, and a
  subsequent Career Compass run.

### Claude's Discretion
- Which specific instrumentation mechanism to use (must reuse the existing
  `createLogger` / `log.timer` pattern rather than inventing a new one).
- Whether timing instrumentation is left in permanently or gated behind an existing debug flag.
- Ordering of the individual optimizations, provided each is independently revertible.

</decisions>

<specifics>
## Specific Ideas

Known-relevant prior findings from project memory that constrain or inform this work:

- **Preview runs AI_TEST_MODE fixtures** — AI content/latency cannot be QA'd on preview.
- **Preview merit system is OFF** (`MERIT_SYSTEM_ENABLED=false` on Preview, `true` on Prod) —
  merit charge/refund/idempotency is never exercised pre-prod. Any merit-adjacent timing
  change cannot be validated on staging; prefer not to touch merit call sites at all.
- **`begin-feature-run` returns 503 on 100% of prod calls** — costing telemetry is already
  broken in prod. This is a strong candidate for a *blocking* call that is costing real
  wall-clock time while producing nothing.
- **Career Compass needs persisted resume text** — backend PDF parsing is a permanent no-op;
  Resume Analysis masks this, Career Compass is the canary. Do not remove or reorder the
  resume-text persistence write.
- **`analyze-resume` queue/worker path 401s** — completion is streaming-only in practice.
  Measure the streaming path, not the queue path.
- **Stream ladder unreachable by bare URL** — Results strips `?stream=true` without the
  sessionStorage handoff. Any e2e timing check must seed sessionStorage or it silently
  measures the slower polling fallback.
- **Vercel Git link is disconnected** — merging to `preview` deploys nothing; staging
  frontend must be built by hand if a frontend change needs staging verification.

</specifics>

<canonical_refs>
## Canonical References

- `CLAUDE.md` — Reliability Priorities, Coding Style, Supabase access policy
- `TESTING-STRATEGY.md` — layered testing model, `verify:baseline` blocking gate
- `docs/ENVIRONMENT.md` — authoritative env var matrix
- `scripts/validate-performance.mjs` — existing performance validation benchmark harness
  (Phase 6 artifact); reuse rather than writing a new harness if it fits.

</canonical_refs>
</content>
