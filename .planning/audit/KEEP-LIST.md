# KEEP-LIST — Enumerated False-Positive Register (D-07)

**Phase:** 03 — Cross-Domain Inventory & Audit
**Plan:** 03-01 (the gate; cross-referenced by every domain catalog)
**Compiled:** 2026-06-13
**HEAD SHA:** `1d4051e` (branch `staging`)
**Scope:** Records names / paths / evidence ONLY — **never a secret value** (the ENV-INVENTORY no-values rule applies here too).

---

## Verdict / Gate Rule

> **Every domain catalog (`DEAD-CODE.md`, `DEPENDENCIES.md`, `ENV-INVENTORY.md`, `DATABASE.md`, `PERF-HOTSPOTS.md`) MUST cross-reference this file and apply it AFTER every static pass.**
> A finding that matches any keep-class below is **gated-but-live → NEVER `safe`.** It is classified `unsafe` (documented-gated) or `needs-investigation`, never `safe`, regardless of what knip / `deno info` say. A static tool flagging it "unreferenced" is the EXPECTED false positive this register exists to neutralize.

---

## Why static analysis wrongly flags these dead (rationale)

The two static engines this audit uses each have a blind spot that this register corrects:

- **knip** sees only the React/`src/**` import graph. It cannot see: code reached at runtime behind a feature flag (the importer exists but the UI is gated off), components reachable only via a string/template-literal-keyed lookup, or anything an edge function / webhook / cron invokes. It also cannot read `supabase/functions/**` at all (Deno `https://`/`npm:`/`jsr:` imports are unresolvable to it) — which is why `knip.json` deliberately excludes that tree.
- **`deno info --json` reachability** roots from deployed edge-function `index.ts` entrypoints. It is correct for `_shared` module reachability, but it says NOTHING about whether a *function* is live — a function is reached by HTTP-invoke / webhook / cron / internal-job-worker, never by an `import`, so "not imported anywhere" is meaningless for an entrypoint.

A live signal (feature flag, template-literal key, `config.toml` registration, `cron.job` schedule, a routed sandbox) overrides the static "dead" reading every time. The five classes below enumerate exactly where that happens.

---

## Keep-Class 1 — Feature-flagged Interview Prep (`VITE_FEATURE_INTERVIEW_PREP`)

- **What:** The Interview Prep feature is gated behind `VITE_FEATURE_INTERVIEW_PREP`, centralized in `src/config/feature-flags.ts` (`isInterviewPrepEnabled()`). It renders "Coming Soon" on prod and is live on staging/preview.
- **Live signal:** the flag is read at runtime; the components/prompts and the `interview-prep-analyze` + `interview-prep-evaluate` edge functions (both have source: `supabase/functions/interview-prep-analyze/`, `supabase/functions/interview-prep-evaluate/`) are exercised when the flag is on. knip flags several Interview Prep components (`InterviewPrepInput.tsx`, `InterviewQuiz.tsx`, `InterviewFlashcards.tsx`, etc.) as unused FILES because the prod render path is gated — that is the false positive.
- **CRITICAL distinction (RESEARCH Pitfall 7):**
  - `interview-prep-analyze` and `interview-prep-evaluate` → **gated-but-live → NEVER `safe`** (keep).
  - `interview-prep-coach` → **RETIRED, no repo source** (verified: `supabase/functions/interview-prep-coach/` does NOT exist). This is the opposite verdict — it is a **Phase-4 CLEAN-03 removal candidate** (confirm deployment via `supabase functions list`), **NOT a keep.** Do not conflate the two.
- **Verdict:** `interview-prep-analyze` / `interview-prep-evaluate` + the gated UI/prompts = **gated-but-live → NEVER `safe`.** `interview-prep-coach` = retired remove-candidate (NOT in this keep-list).

## Keep-Class 2 — Paddle-gated remnants

- **What:** Payment processing migrated Paddle → Stripe, but Paddle remnants remain gated on the last in-flight Paddle subscription expiring.
- **Live signal / verified surfaces (current HEAD):**
  - `supabase/functions/paddle-webhook/index.ts` — registered in `supabase/config.toml [functions.paddle-webhook]` (line 79), so it is deployed/live, not orphaned.
  - `supabase/functions/_shared/auth.ts` — carries the Paddle webhook auth type (`paddle` in the auth-type union).
  - `src/pages/Profile.tsx` — surfaces `paddle_customer_id` / `paddle_subscription_id`.
  - DB columns `profiles.paddle_customer_id` / `profiles.paddle_subscription_id` (to be confirmed in the live DB introspection, DATABASE.md).
  - **Wave-2 note:** v3.0-era research also named `Settings/Billing.tsx`, `Refund.tsx`, and `types.ts` as paddle surfaces; those paths were not confirmed at this HEAD (`Settings/` dir absent) — the DEAD-CODE / DATABASE catalogs must do the full current-HEAD paddle call-site sweep before any verdict.
- **Verdict:** **gated-but-live → NEVER `safe`.** Document as gated (removable only when the last Paddle subscription expires); this is Phase-8 DB-04 input, not a Phase-4 removal.

## Keep-Class 3 — Edge functions invoked by name / webhook / cron (not frontend-imported but live)

- **What:** Edge functions are reached by HTTP-invoke / webhook / external callers / scheduled `pg_cron`, never by a frontend `import`. They are invisible to a frontend-import audit and to "is this entrypoint imported?" reasoning.
- **Live signal / verified examples:**
  - **Stripe webhooks:** `supabase/functions/stripe-webhook/`, `supabase/functions/stripe-webhook-handler/` — invoked by Stripe servers.
  - **Internal job workers:** `process-resume-analysis-job`, `process-career-analysis-job`, `process-scheduled-emails`, etc. — invoked by the internal job queue (INTERNAL_JOB_SECRET auth).
  - **pg_cron jobs (scheduled in migrations):** `add_keep_warm_cron` (`20260310000000_add_keep_warm_cron.sql`), `phase42_layer2_extract_catchup_cron` (`20260525000003_…`), `phase42_layer4_benchmarks_cron` (`20260525000006_…`), `phase42_layer5_lifecycle_archive` (`20260525000007_…`) — these schedule edge functions (`keep-warm`, `extract-analysis-structure`, benchmarks, `lifecycle-archive-writer`) on a timer.
- **Verdict:** **live → NEVER `safe`** on the basis of "no frontend import" alone. A function is only a removal candidate when it is BOTH absent from `config.toml` / cron / webhook registration AND has no caller — confirm via `config.toml`, the migration `cron.job` schedules, and `supabase functions list`.

## Keep-Class 4 — Dynamic / string-keyed imports (incl. the Stripe price-ID template-literal trap)

- **What:** References a static tool cannot see because the key/specifier is constructed at runtime.
- **Live signal / verified landmine (RESEARCH Pitfall 2):**
  - `supabase/functions/_shared/price-resolver.ts:70` builds the env key dynamically:
    `` const key = `STRIPE_PRICE_${tier.toUpperCase()}_${interval.toUpperCase()}`; ``
    A literal grep for `STRIPE_PRICE_PRO_MONTHLY` / `_ANNUAL`, `STRIPE_PRICE_ELITE_*`, and the legacy `STRIPE_PRICE_PAID_*` family finds them **only in test files** → they would be falsely flagged "unused env var." They are LIVE — every concrete `(tier ∈ {pro, elite, paid}) × (interval ∈ {monthly, annual})` key must be expanded by hand.
  - React dynamic imports (`import()`, `React.lazy`, `import.meta.glob`) and string-name component lookups must be scanned with the Pattern-4 queries before any `safe`.
- **Verdict:** any var/module/component reachable only via a dynamic/template-literal key is **NEVER `safe`** on a literal-grep "no consumers" reading. The ENV-INVENTORY catalog must expand template-literal env keys to their concrete set.

## Keep-Class 5 — Deprecated-but-still-imported components

- **What:** Components marked deprecated but still reachable via a live (often DEV-gated) route or call site. "Deprecated" ≠ "unimported."
- **Live signal / verified surfaces:**
  - `LockedSection` / `LockedListItem` — reachable via `LockedSectionsSandbox`, which **is** imported and routed in `src/App.tsx` (`import LockedSectionsSandbox from "./pages/dev/LockedSectionsSandbox"` line 43; `<Route path="/dev/locked-sections" …>` line 88, DEV-gated). NOT dead while the sandbox route exists.
  - `ProFeatureBlur.tsx` — carries `@deprecated` (line 11: "Use `<LockedSection>` … instead"). knip flags it as an unused FILE — but a deprecated component is only `safe` once a FULL call-site sweep confirms zero importers (including non-DEV pages). Currently `needs-investigation`.
- **Verdict:** deprecated-but-imported = **NEVER `safe`** until ALL call sites are confirmed gone (call-site sweep is a DEAD-CODE.md task; removing the `/dev/locked-sections` route is a Phase-4 decision, not assumed here).

---

## How a catalog applies this gate

1. Run the static pass (knip and/or `deno info` reachability).
2. For each "dead"/"unused" candidate, check it against Keep-Classes 1–5 above AND the multi-signal bar (no dynamic ref, no external caller, not gated).
3. If ANY keep-signal fires → classify `unsafe` (gated) or `needs-investigation`. **Never `safe`.**
4. Only when the static flag AND every concurring signal agree does a candidate earn `safe` — and the row must inline-cite those signals.

---

## Cross-References

- **[`INDEX.md`](./INDEX.md)** — catalog entry point + how-to-re-run.
- **RESEARCH** `.planning/phases/03-cross-domain-inventory-audit/03-RESEARCH.md` — Pattern 3 (multi-signal gate), Pattern 4 (dynamic-reference detection), Pitfall 2 (Stripe price-ID template-literal trap), Pitfall 7 (`interview-prep-analyze` gated-live vs `interview-prep-coach` retired).
- **CONTEXT** `.planning/phases/03-cross-domain-inventory-audit/03-CONTEXT.md` §D-07 (the five keep-classes), §D-05/D-06 (three-tier classification + conservative bar).
- **STATE** `.planning/STATE.md` §"Carried-Forward Cleanup Targets" — Paddle remnants, retired `interview-prep-coach`, gated-but-live Interview Prep preservation rule.

*This file records names, paths, and evidence only — no secret value is pasted anywhere in it.*
