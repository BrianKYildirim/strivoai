# Quick Task 260805-8ni — Measured Baseline & Bottleneck Analysis

**Date:** 2026-08-05
**Method:** production edge-function logs (read-only) + source trace of the submit handler.

---

## 1. Which code path is actually live

`src/pages/Onboarding.tsx:545` branches on `isAnalysisLifecycleEnabled()`.

`VITE_FEATURE_ANALYSIS_LIFECYCLE` is **OFF** — `docs/ENVIRONMENT.md` documents it as a
fail-closed build-time var, and `Onboarding.tsx:631` states plainly:

> DORMANT (`VITE_FEATURE_ANALYSIS_LIFECYCLE` off = 100% of traffic today)

So the **live** path is the `else` branch (`Onboarding.tsx:630-670`):
1. everything up to the dispatch runs **serially and blocks the user**
2. `analyze-resume` is fired **fire-and-forget**
3. `navigate('/results/:id')` happens **immediately**

**Consequence:** every millisecond before the `analyze-resume` dispatch is dead time the
user spends staring at the setup screen. That pre-dispatch window is the optimization target.
The 52s AI call itself is out of scope (no prompt/model/token changes permitted).

---

## 2. Measured production baseline

A single real onboarding trace from prod edge logs. Log `timestamp` is request **completion**;
start is derived as `timestamp - execution_time_ms`. The derived starts chain perfectly
end-to-end, which confirms the sequence is strictly serial.

| # | Step | Start (s) | End (s) | Duration | Result |
|---|------|-----------|---------|----------|--------|
| 1 | `OPTIONS validate-document` | 781.935 | 782.911 | **976 ms** | 200 (cold) |
| 2 | `POST validate-document` | 782.938 | 784.818 | **1880 ms** | 200 |
| 3 | `OPTIONS begin-feature-run` | 785.612 | 786.879 | **1267 ms** | 200 (cold) |
| 4 | `POST begin-feature-run` | 786.899 | 789.030 | **2131 ms** | **503** |
| 5 | `OPTIONS ocr-pdf` | 790.499 | 791.369 | **870 ms** | 200 |
| 6 | `POST ocr-pdf` | 791.393 | 792.329 | **936 ms** | **400** |
| 7 | `OPTIONS analyze-resume` | 792.683 | 793.474 | **791 ms** | 200 |
| 8 | `POST analyze-resume` | 793.500 | 846.085 | **52585 ms** | 500 |

### Segment totals

| Segment | Duration | Share of pre-dispatch |
|---|---|---|
| **Pre-dispatch overhead** (781.935 → 793.500) | **11.57 s** | 100% |
| ├─ `validate-document` (preflight + POST) | 2.88 s | 25% |
| ├─ **`begin-feature-run` (preflight + POST → 503)** | **4.21 s** | **36%** |
| ├─ `ocr-pdf` (preflight + POST → 400) | 3.30 s | 29% |
| └─ `analyze-resume` preflight | 1.17 s | 10% |
| **AI analysis** (`analyze-resume` POST) | 52.59 s | — (out of scope) |

Client-side work not visible in edge logs and additionally serialized inside the 11.57 s
window and around it: `auth.getUser()`, `calculateFileHash`, storage upload, `createSignedUrl`,
`resumes` insert, `career_targets` upsert, `profiles` update, pdfjs text extraction,
`invalidateMerits()`.

---

## 3. Confirmed bottlenecks

### B1 — `begin-feature-run` is a 4.2 s blocking call that returns 503 and produces nothing
**36% of all pre-dispatch overhead.** `Onboarding.tsx:430` does:

```ts
featureRunToken = await getFeatureRunToken(correlationEnvelope);
```

`src/lib/feature-run-correlation.ts:76` invokes `begin-feature-run` with a **30 s** timeout.
Per project memory and confirmed in the logs above, this endpoint returns **503 on 100% of
prod calls**.

The call site **already tolerates failure completely** — it is wrapped in `try/catch` that sets
`featureRunToken = undefined`, with the comment *"The backend still creates the run at its own
trusted boundary."* So the result is already optional; only the **await** is costly.

### B2 — Two critical-path functions are excluded from `keep-warm`, so they cold-start every time
`supabase/functions/keep-warm/index.ts:9` lists `WARM_FUNCTIONS`:

```
analyze-resume, analyze-career, grade-linkedin, submit-resume-analysis-job,
submit-career-analysis-job, get-analysis-job-status, ocr-pdf
```

**`validate-document` and `begin-feature-run` are both missing** — and both sit on the
onboarding critical path. The cold-start penalty is directly measurable in the same log set:

| Function | Cold preflight | Warm preflight |
|---|---|---|
| `begin-feature-run` | **1267 ms** | **218 ms** |
| `validate-document` | **976 ms** | (never warm) |
| `get-analysis-run-status` (hot) | — | 204–230 ms |

Warm preflights sit at ~200–230 ms; cold ones at ~800–2000 ms.

### B3 — Three independent operations run strictly sequentially
`Onboarding.tsx:497 → 502 → 537`:

```ts
const writeResults = await Promise.all(writes);          // career_targets + profiles (network)
const resumeExtraction = await extractDocumentFromFile(…); // pdfjs parse       (CPU)
await invalidateMerits();                                  // entitlement refetch (network)
```

These touch **disjoint state** — `career_targets`/`profiles` rows, the local `File`, and the
merits cache. Two are network-bound and one is CPU-bound, so they overlap essentially for free.
Nothing between them consumes an earlier result.

### B4 (observed, NOT in scope) — `ocr-pdf` 400s as a downstream effect of B1
`ocr-pdf` is only reached when pdfjs text quality fails. It returned **400** here, consistent
with the recorded memory that the `begin-feature-run` 503 *"kills costing telemetry +
scanned-PDF OCR"*. This is a **correctness** bug, not a latency bug. Fixing it would change
behavior, which this task forbids. **Left untouched and reported.**

---

## 4. Rejected optimizations (deliberately not doing these)

| Candidate | Why rejected |
|---|---|
| Replace `supabase.auth.getUser()` with `getSession()` | `getUser()` validates the token server-side; `getSession()` reads local storage. This is a **security semantics change**, not a perf cleanup. |
| Dedupe `calculateFileHash` (computed at `Onboarding.tsx:367` and again at `document-extraction.ts:318`) | Real but tiny (~10–50 ms). Would require widening `ExtractDocumentFromPdfParams`, a shared type used by 5 pages. Risk/benefit is bad; keeping the change surface minimal. |
| Fold `validate-document` into the extraction pass to kill the duplicate server-side parse | Genuine duplicate work (~2.9 s), but merging a **validation gate** into the extraction path changes rejection semantics and error surfaces. Out of bounds for "no behavior change". |
| Fire `begin-feature-run` before `validate-document` for a larger overlap window | Would call it on paths where validation later fails, creating orphan costing rows that are never created today. Behavior change — rejected in favour of firing it *after* the validation gate. |
| Touch the merit charge/refund path | Project memory: merits are **OFF on Preview**, so any change there is unverifiable pre-prod. |
| Reduce `analyze-resume`'s 52.6 s | Requires prompt/model/token changes — explicitly forbidden. |

---

## 5. Selected optimizations

| ID | Change | File | Est. saving |
|---|---|---|---|
| **OPT-1** | Fire `getFeatureRunToken()` **non-blocking** right after the validation gate; `await` the already-settled promise just before it is consumed. Overlaps the token round-trip with upload → signed URL → insert. | `src/pages/Onboarding.tsx` | **~2.3 s** |
| **OPT-2** | Add `validate-document` and `begin-feature-run` to `WARM_FUNCTIONS`. | `supabase/functions/keep-warm/index.ts` | **~1.8 s** |
| **OPT-3** | Run `writes`, `extractDocumentFromFile`, and `invalidateMerits()` concurrently via `Promise.allSettled`, preserving exact error precedence. | `src/pages/Onboarding.tsx` | **~0.8–1.5 s** |

**Projected pre-dispatch overhead: 11.57 s → ~6.0 s (≈48% faster).**
AI analysis time is unchanged by construction.

---

## 6. Invariants that must survive

- `validate-document` still gates everything; a rejected document still never uploads.
- Upload → signed URL → `resumes` insert stays awaited and ordered (`FEAT-01`/`D-07`).
- `resumeRecordRef` reuse (one resumes row per logical attempt → one charge) unchanged.
- `sessionStorage['onboarding_wait_<id>']` written once, before every `/results` navigation
  (quick 260803-t6v).
- Resume text persistence via `persistAcceptedPdfjsResumeText` unchanged — **Career Compass
  depends on it** (project memory).
- Error precedence in the parallelized block must stay: writes-rejection → writes-error →
  extraction-error → merits-error.
- `clearFeatureRunToken(correlationEnvelope)` still runs on every terminal path.
- No unhandled promise rejections introduced by the non-blocking/parallel work.
