# PERF-01 — Inefficiency-Hotspot Catalog (STATIC code review only)

**Phase:** 03 — Cross-Domain Inventory & Audit
**Plan:** 03-06 (PERF-01)
**Audit run-date:** 2026-06-14
**Branch / HEAD at review:** `staging` @ `a10aa38`
**Tooling:** `rg` (ripgrep) call-site sweeps + manual code read of the business-critical flows. **No profiler, no benchmark harness, no runtime instrumentation.**
**Scope:** Read-only static review of `supabase/functions/**` and `src/**`. Records suspected inefficiency hotspots with re-confirmed `file:line` anchors, a category, and a three-tier classification. **No product code was edited; no measurement was run.**

---

> ## ⚠ STATIC CATALOG ONLY — NO MEASUREMENT (D-12)
>
> This is a **suspected-hotspot catalog produced from static code review**. It records *where* a potential inefficiency lives and *what kind* it is — it does **NOT** measure cost, latency, query plans, payload bytes, or call counts. **Before/after measurement is Phase 9 (PERF-04)**; the behavior-preserving refactors are Phase 9 (PERF-02) and the clarity work is Phase 9 (PERF-03).
>
> **Nothing in this file is an instruction to refactor or to benchmark.** A row marked `safe`-to-refactor-candidate means "static review found no obvious behavior-change risk in *triaging* it" — Phase 9 still owns the measured, behavior-preserving change. Pulling a perf-measurement harness forward into Phase 3 violates the D-12 boundary and the Phase 3 ↔ Phase 9 split (threat T-3-13).

---

## Verdict / Summary

**5 suspected hotspots catalogued** (the verified PERF-01 seeds, each re-confirmed against current code).

By category:

| Category | Count | Hotspots |
| -------- | ----- | -------- |
| recomputation / oversized-payload | 1 | H1 — analyze-career repeated `resumeText` slicing + hardcoded `?? 12000` fallback |
| redundant-work | 1 | H2 — `usage_tracking` dual-write across every merit-path feature |
| repeated / ill-timed data access | 1 | H3 — merit-balance refetch (`staleTime: 5_000` + invalidate-driven reconcile polls) |
| recomputation | 1 | H4 — parallel-call merge redundant JSON parse/repair passes |
| N+1 / repeated-query | 1 | H5 — per-feature latest-row `.order('created_at', desc).limit(1)` across ~10 pages |

By classification (D-05):

| Classification | Count | Why |
| -------------- | ----- | --- |
| `safe`-to-refactor-candidate | 1 | H4 (pure server-side merge utility, no behavior contract change in triaging) |
| `needs-investigation` | 4 | H1, H2, H3, H5 — all touch a business-critical reliability path (Resume Analysis / Career Compass / merits) or a gated-but-live surface; KEEP-LIST gate forces caution |
| `unsafe` | 0 | none flatly unfixable; the 4 above are gated to Phase-9 measurement, not "never touch" |

**Important re-confirmation (line drift + behavior drift since the v3.0 maps):** the v3.0 `MAX_CONTEXT_CHARS=12000` lead has moved — the cap is now per-tier via `getMaxInputChars('careerCompass', tier)` with `?? 12000` only as a fallback (it is no longer a flat hardcode), and the merit-balance race (CONCERNS.md §9 / INTEGRATIONS.md §4) has been **substantially remediated** since v3.0 — `useMerits` now ships bounded reconcile polls. Both seeds are recorded with their CURRENT shape below, not the stale lead.

---

## Review Commands Run (each read-only — `rg` + code read; NO benchmark)

### 1. analyze-career `resumeText` slicing + the `MAX_CONTEXT_CHARS` cap

```bash
rg -n "MAX_CONTEXT_CHARS" supabase/functions/analyze-career/index.ts
```

**Result (re-confirmed anchors):**
- `supabase/functions/analyze-career/index.ts:90` — `const CAREER_CACHE_MAX_CONTEXT_CHARS = 12000;` (cache-key normalization constant)
- `:127` — used inside `normalizeCareerCacheText()` (`.slice(0, CAREER_CACHE_MAX_CONTEXT_CHARS)`)
- `:1173-1176` — short-circuit branch: `getMaxInputChars('careerCompass', resolvedTier) ?? 12000` then `resumeText.slice(...)` + `linkedInData.slice(...)`
- `:1539-1541` — full PDF-parse / parallel fan-out branch: the SAME per-tier cap recomputed and the SAME two `.slice(...)` calls repeated

Read of these spans confirms: the per-tier cap is **re-derived** at two sites and the resume/LinkedIn text is **re-sliced** at each. (Static observation only — no byte/latency measurement.)

### 2. `usage_tracking` dual-write — full writer call-site list

```bash
rg -n "record_ai_usage" supabase/functions
rg -n "recordUsageWithAnalysis" supabase/functions/**/index.ts
rg -n "rpc\('(record_ai_usage|check_and_record_ai_usage)'" supabase/functions/_shared
```

**Result — writer surface (re-confirmed):**
- Shared writer helpers (the actual `rpc('record_ai_usage')` / `check_and_record_ai_usage` calls):
  - `supabase/functions/_shared/usage-checker.ts:28` — `check_and_record_ai_usage` (atomic check+record variant)
  - `supabase/functions/_shared/usage-checker.ts:109` — `record_ai_usage` (post-success `recordUsageWithAnalysis`)
  - `supabase/functions/_shared/merit-gateway.ts:165` — `record_ai_usage` (cache-hit zero-credit audit row)
- Per-feature call-sites that funnel through `recordUsageWithAnalysis(...)`:
  - `analyze-resume/index.ts:103`
  - `analyze-career/index.ts:331` (plus the short-circuit + full-parse audit-row writes documented at `:1052` and `:1259`)
  - `recruiting-lens/index.ts:115`
  - `grade-linkedin/index.ts:518` (free-scan), `:555` (merit path), `:822`
  - `interview-prep-analyze/index.ts:660`

This is the "every merit-path feature writes a `usage_tracking` row in addition to the canonical per-feature row" dual-write surface.

### 3. Merit-balance refetch race (`staleTime` + invalidation timing)

```bash
rg -n "staleTime" src
# then read: src/hooks/useMerits.ts
```

**Result (re-confirmed against CURRENT code — behavior has drifted from the v3.0 lead):**
- `src/hooks/useMerits.ts:71` — `staleTime: 5_000` on the `['merit-balance', userId]` query (the seed)
- `src/hooks/useMerits.ts:96-121` — `optimisticDeduct` (per-submit optimistic write + invalidate-on-commit)
- `src/hooks/useMerits.ts:130-151` — `reconcileShopCredit`: a bounded poll (`POLL_INTERVAL_MS=1500`, `POLL_CEILING_MS=10000`) that **re-invalidates `['merit-balance']` on each interval** until `shop_balance` exceeds the at-submit snapshot
- `src/hooks/useMerits.ts:161-189` — `reconcileTierUpgrade`: same bounded-poll shape, stops on a tier change
- `src/hooks/useMerits.ts:208-211` — `useInvalidateMerits`

The v3.0 concern ("`useInvalidateMerits` exists but is not auto-called on Stripe-redirect return", CONCERNS.md §9) is now **largely remediated** — the post-checkout reconcile polls exist. The remaining static-observable cost is the **repeated full re-read** the polls drive (each interval invalidate re-runs the `get_merit_balance` RPC + a `profiles` select, lines 58-61) within the 10s window, plus the 5s `staleTime` window. This is repeated/ill-timed data access, not a correctness bug.

### 4. Parallel-call merge redundant parse/repair

```bash
# read: supabase/functions/_shared/result-merger.ts
rg -n "repairTruncatedJSON|parseAndValidate|JSON.parse" supabase/functions/_shared/recruiting-lens-merger.ts
```

**Result (re-confirmed):**
- `supabase/functions/_shared/result-merger.ts:290-332` — `parseAndValidateCall()` runs the full `repairTruncatedJSON` (`:298`) → `JSON.parse` (`:299`) → normalize → strip → validate pipeline **per call**, and is invoked once per call type inside `mergeAndValidateResults` (`:462-468`, plus the optional `rewrites` `:487` and `elite-extras` `:498` folds). For an elite run that is 3-5 separate repair+parse passes over already-streamed-and-accumulated buffers.
- `supabase/functions/_shared/recruiting-lens-merger.ts:131-132` — the sibling merge also does `repairTruncatedJSON(text.trim())` then `JSON.parse(...)`.

Static observation: the repair pass is re-run on each call's raw text; if a buffer was already validated upstream, the repair work may be redundant. (No measurement — Phase 9 confirms whether the repair is actually re-doing work or is necessary per-call.)

### 5. Per-feature latest-row `.order('created_at', desc).limit(1)` fetch

```bash
rg -n "\.order\('created_at', \{ ascending: false" src
rg -nU "\.order\(['\"]created_at['\"].*ascending: false[\s\S]*?\.limit\(1\)" src
```

**Result — re-confirmed latest-row fetch anchors (the repeated-query pattern across feature pages):**
- `src/pages/LinkedInGrader.tsx:283-284`
- `src/pages/SkillsGapAnalysis.tsx:174-175`, `:292-293`
- `src/pages/CareerCompass.tsx:308-310`, `:318-319`
- `src/pages/RecruitingLens.tsx:363-365` (`analyzed_at`), `:383-384`
- `src/pages/Profile.tsx:140-141`
- `src/lib/analysisHelpers.ts:134` (shared latest-resume helper)
- `src/components/PriorLinkedInSelector.tsx:94`
- `src/components/DashboardHome.tsx:49`
- `src/components/AnalysisComparisonModal.tsx:269`, `:285`
- (plus the AnalysisHistory/Dashboard list reads at `AnalysisHistory.tsx:178..265` and `Dashboard.tsx:242..301`, which are list queries, not single-latest-row — noted for completeness, distinct from the `.limit(1)` latest-row class)

The same "fetch the user's latest resume / latest analysis row" shape is duplicated across pages rather than going through one shared accessor (`analysisHelpers.ts:134` is the only consolidated one). N+1 / repeated-query candidate.

---

## Classified Findings

Columns: **hotspot** | **file:line (re-confirmed)** | **category** | **classification** | **note**.

| # | Hotspot | file:line (re-confirmed @ `a10aa38`) | Category | Classification | Note |
|---|---------|--------------------------------------|----------|----------------|------|
| H1 | analyze-career repeated `resumeText` / `linkedInData` slicing; per-tier cap re-derived; `?? 12000` fallback | `supabase/functions/analyze-career/index.ts:90`, `:127`, `:1173-1176`, `:1539-1541` | recomputation / oversized-payload | **needs-investigation** | KEEP-LIST: Career Compass is a CLAUDE.md business-critical reliability path. The cap is now per-tier (`getMaxInputChars`), NOT the flat v3.0 `MAX_CONTEXT_CHARS=12000` hardcode — `12000` survives only as a `??` fallback. The slice is re-derived/re-applied at two branches (short-circuit + full-parse) plus a separate cache-key constant. Any change risks altering the AI input → output → cache key, so Phase 9 must measure + preserve behavior. NOT `safe`. |
| H2 | `usage_tracking` dual-write on every merit-path feature (`record_ai_usage` audit row in addition to the canonical per-feature row) | writers: `_shared/usage-checker.ts:28`, `:109`; `_shared/merit-gateway.ts:165`. call-sites: `analyze-resume/index.ts:103`, `analyze-career/index.ts:331`/`:1052`/`:1259`, `recruiting-lens/index.ts:115`, `grade-linkedin/index.ts:518`/`:555`/`:822`, `interview-prep-analyze/index.ts:660` | redundant-work | **needs-investigation** | KEEP-LIST: `usage_tracking` is the legacy table whose retirement is gated to Phase 8 (DB-04) — see DATABASE.md (03-05) writer/reader map. The dual-write is a *deliberate* History-visibility fix (22-04 Pitfall 2). It is a redundant-work *suspect* (every feature double-writes), but it is load-bearing for Activity History today. Phase 9 may only optimize the write path; the table-drop decision is Phase 8's, gated on the reader map. NOT `safe`. |
| H3 | merit-balance refetch: `staleTime: 5_000` + invalidate-driven reconcile polls re-reading `get_merit_balance` + `profiles` each interval | `src/hooks/useMerits.ts:71` (staleTime), `:58-61` (the re-read), `:130-151` (`reconcileShopCredit` poll), `:161-189` (`reconcileTierUpgrade` poll), `:96-121` (`optimisticDeduct`) | repeated / ill-timed data access | **needs-investigation** | KEEP-LIST: merits/Stripe is a business-critical path. **Behavior has drifted from the v3.0 lead** — the "invalidate not auto-called" gap (CONCERNS.md §9) is now remediated by the bounded polls. The remaining static-observed cost is the repeated full balance re-read within the ≤10s poll window. Touching `staleTime` or the poll bounds directly changes post-purchase balance correctness UX, so Phase 9 must measure first. NOT `safe`. |
| H4 | parallel-call merge re-runs `repairTruncatedJSON` + `JSON.parse` + validate per call | `_shared/result-merger.ts:290-332` (per-call pipeline), `:462-468`/`:487`/`:498` (invoked 3-5× per run); `_shared/recruiting-lens-merger.ts:131-132` (sibling) | recomputation | **safe**-to-refactor-candidate | Signals (D-06): (1) static — repair+parse is re-invoked per call type in a pure utility; (2) no dynamic ref — `parseAndValidateCall` is a plain exported function, called only from the mergers (rg-confirmed); (3) no external caller — server-side merge utility, not an entrypoint/webhook/cron; (4) not gated — no feature flag. **Caveat:** `safe` here means "low-risk to *triage/measure* in Phase 9" — it is NOT licence to refactor outside Phase 9's behavior-preserving + measured process (D-12). The merge feeds Resume Analysis output, so Phase 9 must still keep the merged-schema contract identical. |
| H5 | per-feature latest-row `.order('created_at', desc).limit(1)` duplicated across ~10 pages/components instead of one shared accessor | `LinkedInGrader.tsx:283-284`, `SkillsGapAnalysis.tsx:174-175`/`:292-293`, `CareerCompass.tsx:308-310`/`:318-319`, `RecruitingLens.tsx:363-365`/`:383-384`, `Profile.tsx:140-141`, `lib/analysisHelpers.ts:134`, `PriorLinkedInSelector.tsx:94`, `DashboardHome.tsx:49`, `AnalysisComparisonModal.tsx:269`/`:285` | N+1 / repeated-query | **needs-investigation** | Several of these sit on business-critical pages (Career Compass, Resume/LinkedIn flows). The pattern is duplicated rather than DRY (only `analysisHelpers.ts:134` is consolidated). Consolidating into a shared accessor is a clarity/perf candidate (Phase 9 PERF-03/PERF-02), but each call has slightly different `select(...)` columns and filters, so a naive merge could change what data a page receives. Phase 9 must reconcile the per-call column sets before consolidating. NOT `safe` as a blanket. |

---

## Re-Assertion Block (reproducible — static, read-only; NO benchmark)

Run from repo root. All are `rg` sweeps + code reads; none measures anything.

```bash
# H1 — analyze-career slicing + the per-tier cap (re-confirm anchors)
rg -n "MAX_CONTEXT_CHARS" supabase/functions/analyze-career/index.ts

# H2 — usage_tracking dual-write writer surface
rg -n "record_ai_usage" supabase/functions
rg -n "recordUsageWithAnalysis" supabase/functions/**/index.ts

# H3 — merit-balance refetch race (then read src/hooks/useMerits.ts)
rg -n "staleTime" src

# H4 — parallel-merge redundant parse/repair (then read result-merger.ts)
rg -n "repairTruncatedJSON|parseAndValidate|JSON.parse" supabase/functions/_shared/recruiting-lens-merger.ts

# H5 — per-feature latest-row fetch pattern
rg -nU "\.order\(['\"]created_at['\"].*ascending: false[\s\S]*?\.limit\(1\)" src
```

**PowerShell equivalent (primary shell) for the H5 multiline sweep:**

```powershell
rg -nU "\.order\(['`"]created_at['`"].*ascending: false[\s\S]*?\.limit\(1\)" src
```

**Zero-functional-change assertion (this plan):**

```bash
git diff --stat fa4ccb6..HEAD -- src supabase/functions   # → empty (no product code touched)
git show --stat HEAD                                       # → only .planning/audit/PERF-HOTSPOTS.md
```

---

## Cross-References

- **[`KEEP-LIST.md`](./KEEP-LIST.md)** — the D-07 gate applied AFTER the static pass. H1 (Career Compass) and H3 (merits/Stripe) sit on business-critical reliability paths (CLAUDE.md); H2 (`usage_tracking`) is the legacy table gated to Phase 8; the gated-but-live surfaces (Interview Prep) appear among the H2/H5 call-sites. A hotspot in any of these is **never `safe`** as a blanket — hence 4 of 5 are `needs-investigation`.
- **[`DATABASE.md`](./DATABASE.md)** (03-05) — the `usage_tracking` writer/reader dependency map that H2's redundant-write triage and the Phase-8 DB-04 table-drop decision both depend on.
- **[`INDEX.md`](./INDEX.md)** — catalog entry point + how-to-re-run.
- **Consumer = Phase 9 (PERF-02 / PERF-03 / PERF-04).** Phase 9 owns the **measurement** (PERF-04) and the behavior-preserving **refactors** (PERF-02) + clarity work (PERF-03). **Measurement is deferred to Phase 9 — none was performed here (D-12).** This catalog hands Phase 9 the triaged suspect list with locations so it measures and refactors only what is already classified.
- **`.planning/codebase/CONCERNS.md`** §3 (BUDGET-03 / analyze-career slicing) and §5 + §9 (`usage_tracking` dual read/write; merit refetch) — treated as v3.0 LEADS; re-confirmed above against current code (line numbers AND behavior had drifted; H1 cap is now per-tier, H3 race is largely remediated).
- **`.planning/phases/03-cross-domain-inventory-audit/03-RESEARCH.md`** §"Domain-Specific Verified Findings → Performance (PERF-01, static only — D-12)" — the seed list this catalog re-confirms.

*This file records `file:line` locations, categories, and classifications only — no secret value is pasted anywhere in it. No measurement, profiling, or benchmark was run (D-12).*
