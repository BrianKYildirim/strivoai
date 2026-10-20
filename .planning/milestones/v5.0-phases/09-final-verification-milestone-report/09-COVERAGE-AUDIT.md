# Phase 9 — VER-02 Coverage Audit (D-09 / D-11 / D-12)

**Produced:** 2026-07-11 (plan 09-01)
**Authority:** This document records the *decisions*. `src/test/coverage/ver02-matrix.test.ts` is the *enforcement*.
A cell is covered only if the registry maps it to a test whose verbatim name is present in its file **right now**.

---

## Scenario ID scheme (25 rows, not 23)

ROADMAP success criterion 2 lists 23 comma-delimited scenarios, but the first — "first / second /
five-consecutive" — is a bundle of three. Splitting it is mandatory: **five-consecutive is currently
uncovered for every feature**, and folding it into "first/second" is exactly how it would vanish.

| ID | Scenario | ID | Scenario |
|---|---|---|---|
| **S-01a** | First analysis | S-13 | Truncated model output |
| **S-01b** | Second analysis | S-14 | Schema-validation failure |
| **S-01c** | **Five consecutive analyses** | S-15 | Database-save failure |
| S-02 | Duplicate-click submission | S-16 | Insufficient Merits |
| S-03 | Refresh during analysis | S-17 | Merit-reservation failure |
| S-04 | Navigate away + return | S-18 | Settlement failure |
| S-05 | Missing input | S-19 | Refund / release handling |
| S-06 | Corrupted PDF | S-20 | Two simultaneous browser tabs |
| S-07 | Large PDF | S-21 | Previous-result preservation |
| S-08 | Reused input | S-22 | History correctness |
| S-09 | Replacement upload | S-23 | Approved/rejected cross-origin |
| S-10 | Provider timeout | | |
| S-11 | Provider rate limiting | | |
| S-12 | Invalid model JSON | | |

**Total = 25 scenario rows x 5 features (D-10: `resume`, `onboarding`, `linkedin`, `recruiting_lens`,
`career_compass`) = 125 cells.** Interview Prep, Skills Gap and Compare Jobs are OUT of the matrix.

**Onboarding is not a separate edge function.** It is `analyze-resume` with `origin: 'onboarding'`
(`analyze-resume/index.ts`). Its column is therefore the Resume column **plus** the dispatch assertion
`FEAT-01 (1d): the onboarding feature namespace shares the resume merit identity (same parts → same key)`.
There is no `onboarding/` test directory and none is invented.

---

## The five ambiguous-cell decisions

### S-06 — Corrupted PDF

No test in the repo is literally named "corrupted PDF". The de-facto coverage is the shared
document-extraction quality gate, which is where a corrupted PDF actually gets rejected.

**Decision:** MAP the existing shared extraction-quality tests as the covering tests for all five
features. Do **not** author a new corrupted-PDF fixture case.

**Rationale:** document extraction is a *shared* seam (`_shared/document-extraction.ts` →
`_shared/document-quality.ts`); every feature that ingests a document funnels through it. A corrupted
PDF surfaces as garbage/symbol-heavy/repeated-line/too-short extracted text or as
`all_providers_failed` — and each of those is already asserted. Writing five per-feature corrupted-PDF
fixtures would re-prove the same shared branch five times, which D-09 explicitly forbids ("do not
rebuild coverage that already exists").

**Registry consequence:** all five S-06 cells are `kind: 'test'`, mapping
`supabase/functions/_shared/document-quality.test.ts` (`assessExtractionQuality rejects symbol-heavy output`,
`assessExtractionQuality rejects repeated-line output`, `assessExtractionQuality rejects missing document signals`,
`assessExtractionQuality rejects short text`) and
`supabase/functions/_shared/document-extraction.test.ts` (`extractDocumentText returns all_providers_failed with no accepted text`).

---

### S-07 — Large PDF (RESEARCH Open Question 2)

Grep confirmed **no byte/file-size limit exists anywhere** in `src/lib`, `src/pages/Upload.tsx`, or
`_shared/document-extraction.ts`. What exists is a per-tier **character** cap (`getMaxInputChars`,
asserted in `recruiting-lens/handler-config.test.ts :: recruiting-lens: enforces the per-tier input cap
via getMaxInputChars`). A character cap truncates *after* extraction; it does not stop a 200 MB upload
from being read, parsed and OCR'd.

**Decision:** **WAIVER** on all five cells. "Large PDF" means a byte cap, and there is no upload
byte-size guard in the product. This is a genuine **product** gap, not a test gap — and a test phase
must not paper over it by re-labelling the character cap as the answer.

**Registry consequence:** all five S-07 cells are
`kind: 'waiver'`, `reason: "no upload byte-size guard exists in the product (grep-verified: no MAX_FILE_SIZE / maxSize / byte-cap logic in src/lib, src/pages/Upload.tsx, or _shared/document-extraction.ts). Per-tier CHARACTER caps (getMaxInputChars) exist but truncate AFTER extraction and are not a file-size guard. Tracked as a residual product risk, NOT as a test gap."`,
`approvedBy: '09-01 (D-11 registry decision)'`.

**Hand-off (explicit):** this finding is carried to **VER-05 report item 14 (remaining risks +
follow-ups)** as a residual product risk — "no upload byte-size guard; a pathologically large PDF is
bounded only by platform limits and per-tier character caps." Plan 09-12 (the report) must cite this
section. It is also a candidate for the RESIDUAL-REGISTER.

---

### S-16 — Insufficient Merits x Recruiting Lens

Recruiting Lens is **Elite-gated** (`403 elite_required`) rather than merit-gated in the same shape as
the other four features. The question is whether the Elite gate satisfies the cell.

**Decision:** the cell is **satisfied by three existing assertions in combination**, and does NOT need a
new Elite-with-zero-merits test:

1. `recruiting-lens/handler-config.test.ts :: recruiting-lens: rejects the Free tier with a 403 elite_required gate` — the tier gate that fires *before* any merit consideration.
2. `recruiting-lens/handler-config.test.ts :: recruiting-lens: wires withMerits for the recruiting_lens action` — proves an Elite user's spend goes through the shared gateway, i.e. RCL is not on a bespoke merit path.
3. `_shared/merit-gateway.test.ts :: insufficientMeritsResponse returns 402 with correct error code` — the shared insufficient-merits response is a property of `withMerits`, not of the calling feature.

**Rationale:** an Elite-with-zero-merits RCL test would be re-asserting `withMerits`'s own 402 behaviour
through a fifth caller. The load-bearing, feature-specific fact is *"RCL routes its spend through
withMerits"* — and that is asserted. Duplicating the gateway's 402 per feature is the coverage-theatre
D-09 was written to prevent.

**Registry consequence:** the `S-16 x recruiting_lens` cell is `kind: 'test'` with those three mappings.

---

### S-22 — The duplicate `history-persistence.test.ts` pair (RESEARCH Pitfall 6)

Five feature directories each carry **two** files:

| LIVE (keep) | DEAD (delete) |
|---|---|
| `analyze-resume/__tests__/history-persistence.test.ts` | `analyze-resume/history-persistence.test.ts` |
| `analyze-career/__tests__/history-persistence.test.ts` | `analyze-career/history-persistence.test.ts` |
| `grade-linkedin/__tests__/history-persistence.test.ts` | `grade-linkedin/history-persistence.test.ts` |
| `recruiting-lens/__tests__/history-persistence.test.ts` | `recruiting-lens/history-persistence.test.ts` |
| `interview-prep-analyze/__tests__/history-persistence.test.ts` | `interview-prep-analyze/history-persistence.test.ts` |

**Decision:** the **`__tests__/` copies are LIVE**; the bare `{feature}/history-persistence.test.ts`
copies are **DEAD**.

**Rationale (grep-verified):** only the `__tests__/` copies import
`_shared/__tests__/history-persistence-remote.ts` — the fail-loud remote harness (`skipRemote()`,
`provisionTestUser`, the placeholder-URL rejection). They carry the real `TEST-05 ...: successful staging
run writes ...` persistence contract. The bare copies are static-source greps against an older shape
(e.g. `resume history: persists resume_analysis rows with resume source reference`) and import nothing
from the remote harness. Shipping two divergent copies of the History contract is itself the risk.

**Registry consequence:** all five S-22 cells are seeded `kind: 'gap'`, `owner: '09-07'`. They are gaps
*today* not because tests are absent but because the live copies are **remote-gated AND absent from the
`test:ci` allowlist — they execute in no lane at all**. Plan **09-07** resurrects them (D-06 remote lane +
allowlist registration) **and executes the deletion of the five dead bare copies**. This plan deletes
nothing; it only records the disposition. The registry maps the `__tests__/` paths, so if 09-07 ever
deleted the wrong copy the matrix would go RED.

---

### D-11 — The fault-injection path (S-12 invalid model JSON / S-13 truncated output)

RESEARCH proved the Anthropic seam (`_shared/anthropic.ts`) can force a **status**
(`MERIT_TEST_FORCE_REFUNDABLE_ERROR` takes a configurable 3-digit status; `408` = provider timeout, `429`
= provider rate-limit; staging-host-gated, inert in prod) but **cannot force a malformed SUCCESS body**.
Every existing seam returns `{ ok: false }`. Neither can return `{ ok: true, text: '<garbage>' }`.
Therefore S-12 and S-13 are **not live-injectable** today.

**Decision: Path A — deterministic-only. NO source change to `supabase/functions/_shared/anthropic.ts`.**

Map the existing deterministic validation-boundary tests as the covering tests:

- Resume / Onboarding / Career Compass — `{analyze-resume,analyze-career}/__tests__/runtime-validation-convergence.test.ts` :: `... garbage (non-JSON) output → MODEL_INVALID_RESPONSE` and `... a TRUNCATED (clipped) body → MODEL_OUTPUT_TRUNCATED (rejected, never repaired-and-accepted)`.
- LinkedIn — `grade-linkedin/__tests__/runtime-validation-convergence.test.ts :: 04-GAP-01: garbage model output → TYPED error through the runtime seam (no 200-with-body)` and `grade-linkedin/__tests__/fixed-source-guard.test.ts :: fixed-source: truncated/clipped model output → typed MODEL_OUTPUT_TRUNCATED (never repaired-and-accepted)`.
- Recruiting Lens — **GAP** (owner 09-05): RCL has no `runtime-validation-convergence.test.ts` at all.

**Rationale:** Path B (adding an `AI_FORCE_BAD_BODY` fault-mode selector) would add a **new branch to a
production code path** — `anthropic.ts` is on every live AI request — inside a *verification* phase whose
entire purpose is to prove the milestone unchanged and green. A verification phase must not mutate the
surface it is verifying. The behaviour under test is *"the VALIDATION layer rejects a malformed body and
never repairs-and-accepts it"*, and that is a property of `validateModelOutput`, which the deterministic
tests call directly at the exact seam where the rejection happens. Path A satisfies VER-02 as written at
zero production risk; Path B buys a live end-to-end path we do not need to make a VER-* criterion true.

**Registry consequence:** S-12 and S-13 are `kind: 'test'` for resume / onboarding / linkedin /
career_compass, and `kind: 'gap'` (owner `09-05`) for recruiting_lens. S-10 (provider timeout) and S-11
(provider rate limiting) remain covered by the shared classifier tests, which are the deterministic twin
of the live `MERIT_TEST_FORCE_REFUNDABLE_ERROR=408|429` staging path.

---

## Registry rule for the "shared-substrate only" cells

RESEARCH flagged S-02 / S-03 / S-04 / S-21 as covered by *feature-agnostic* substrate tests
(`src/hooks/__tests__/useAnalysisRun.test.ts`) that prove the **substrate** but not that **each feature is
wired to it**. Career Compass is the only feature with a page-level wiring test
(`src/pages/__tests__/CareerCompass.recovery.test.tsx`).

**Rule adopted:** for S-02 / S-03 / S-04 / S-21 a cell is covered **iff** (shared-substrate test) **AND**
(per-feature wiring assertion). Career Compass passes. Resume (`Upload.tsx`), Onboarding
(`Onboarding.tsx`), LinkedIn (`LinkedInGrader.tsx`) and Recruiting Lens (`RecruitingLens.tsx`) are
therefore seeded as **gaps owned by 09-06** — four `*.recovery.test.tsx` files modeled directly on
`CareerCompass.recovery.test.tsx`.

For every other shared cell (S-05, S-06, S-10, S-11, S-14, S-17, S-18) the shared assertion IS the
coverage: the behaviour lives in one shared module with one branch, and re-proving it per feature is the
coverage theatre D-09 forbids.

---

## RED gap list (machine-generated)

The section below is the **verbatim** failing output of
`npx vitest run src/test/coverage/ver02-matrix.test.ts`, assertion 4
(`every waiver carries a non-empty reason + approver, and zero cells remain unclosed gaps`).

**This list — not the RESEARCH.md grid — is the authoritative work order for plans 09-05, 09-06 and
09-07.** It is expected RED at the end of this plan and MUST be GREEN by the end of wave 3 (09-08).

<!-- MACHINE-GENERATED: pasted verbatim from the vitest failure output. Do not hand-edit. -->

```
FAIL  src/test/coverage/ver02-matrix.test.ts > VER-02 scenario x feature coverage registry (D-12)
      > every waiver carries a non-empty reason + approver, and zero cells remain unclosed gaps (D-11 - no silent gaps)

AssertionError: 43 unclosed gap cells remain (D-11: no silent gaps). Each must become a test or a justified waiver:
  - S-01a first analysis x recruiting_lens (owner: 09-05)
  - S-01b second analysis x recruiting_lens (owner: 09-05)
  - S-01c five consecutive analyses x resume (owner: 09-06)
  - S-01c five consecutive analyses x onboarding (owner: 09-06)
  - S-01c five consecutive analyses x linkedin (owner: 09-06)
  - S-01c five consecutive analyses x recruiting_lens (owner: 09-06)
  - S-01c five consecutive analyses x career_compass (owner: 09-06)
  - S-02 duplicate-click submission x resume (owner: 09-06)
  - S-02 duplicate-click submission x onboarding (owner: 09-06)
  - S-02 duplicate-click submission x linkedin (owner: 09-06)
  - S-02 duplicate-click submission x recruiting_lens (owner: 09-06)
  - S-03 refresh during analysis x resume (owner: 09-06)
  - S-03 refresh during analysis x onboarding (owner: 09-06)
  - S-03 refresh during analysis x linkedin (owner: 09-06)
  - S-03 refresh during analysis x recruiting_lens (owner: 09-06)
  - S-04 navigate away and return x resume (owner: 09-06)
  - S-04 navigate away and return x onboarding (owner: 09-06)
  - S-04 navigate away and return x linkedin (owner: 09-06)
  - S-04 navigate away and return x recruiting_lens (owner: 09-06)
  - S-08 reused input x recruiting_lens (owner: 09-05)
  - S-09 replacement upload x resume (owner: 09-06)
  - S-09 replacement upload x onboarding (owner: 09-06)
  - S-09 replacement upload x linkedin (owner: 09-06)
  - S-09 replacement upload x recruiting_lens (owner: 09-06)
  - S-09 replacement upload x career_compass (owner: 09-06)
  - S-12 invalid model JSON x recruiting_lens (owner: 09-05)
  - S-13 truncated model output x recruiting_lens (owner: 09-05)
  - S-19 refund / release handling x recruiting_lens (owner: 09-05)
  - S-20 two simultaneous browser tabs x resume (owner: 09-06)
  - S-20 two simultaneous browser tabs x onboarding (owner: 09-06)
  - S-20 two simultaneous browser tabs x linkedin (owner: 09-06)
  - S-20 two simultaneous browser tabs x recruiting_lens (owner: 09-06)
  - S-20 two simultaneous browser tabs x career_compass (owner: 09-06)
  - S-21 previous-result preservation x resume (owner: 09-06)
  - S-21 previous-result preservation x onboarding (owner: 09-06)
  - S-21 previous-result preservation x linkedin (owner: 09-06)
  - S-21 previous-result preservation x recruiting_lens (owner: 09-06)
  - S-22 History correctness x resume (owner: 09-07)
  - S-22 History correctness x onboarding (owner: 09-07)
  - S-22 History correctness x linkedin (owner: 09-07)
  - S-22 History correctness x recruiting_lens (owner: 09-07)
  - S-22 History correctness x career_compass (owner: 09-07)
  - S-23 approved/rejected cross-origin x linkedin (owner: 09-05)

Tests  1 failed | 4 passed (5)
```

Assertions 1 (no silent omission), 2 (every mapped file exists), 3 (every mapped name appears verbatim
— the anti-drift check) and the 25x5 scope guard all **PASS**. Only assertion 4 fails. That is the
designed end-state of plan 09-01.

### Gap totals by owner

| Owner | Cells | Work |
|---|---|---|
| **09-05** | 7 | The Recruiting Lens column holes (S-01a, S-01b, S-08, S-12, S-13, S-19) — RCL needs an `idempotency-repeated-run.test.ts`, a `runtime-validation-convergence.test.ts` and a `refund-after-save.test.ts`. Plus `grade-linkedin/__tests__/cors-matrix.test.ts` (S-23), a 1-file copy of the existing per-feature pattern. |
| **09-06** | 31 | S-01c five-consecutive (5), S-09 replacement upload (5), S-20 two-tab Playwright `browser.newContext()` (5), and the per-feature wiring quartet S-02/S-03/S-04/S-21 x {resume, onboarding, linkedin, recruiting_lens} (16) — four `*.recovery.test.tsx` files modeled on `CareerCompass.recovery.test.tsx`. |
| **09-07** | 5 | S-22 History — resurrect the five remote-gated `__tests__/history-persistence.test.ts` files (allowlist + remote lane) and delete the five dead bare copies. |
| **waived** | 5 | S-07 large PDF x all five — residual product risk, carried to report item 14. |

**48 non-`test` cells of 125** (43 gaps + 5 waivers). **77 cells are mapped to live tests today.**

---

## Deviation from the plan's seed list (recorded, not silent)

The plan's task-2 seed list predicted the RCL column holes at `S-01a/b, S-08, S-12, S-13, S-19` and the
LinkedIn `cors-matrix` hole at S-23 — all confirmed. Two corrections were made against the live source,
because the registry is built from the files on disk, not from RESEARCH.md's transcription:

1. **RESEARCH.md attributed `FEAT-02: ... → MODEL_INVALID_RESPONSE` / `MODEL_OUTPUT_TRUNCATED` test names to `grade-linkedin/__tests__/runtime-validation-convergence.test.ts`. Those names do not exist in that file.** LinkedIn's actual S-12/S-13 coverage is `04-GAP-01: garbage model output → TYPED error through the runtime seam (no 200-with-body)` (same file) and `fixed-source: truncated/clipped model output → typed MODEL_OUTPUT_TRUNCATED (never repaired-and-accepted)` (`grade-linkedin/__tests__/fixed-source-guard.test.ts`). Mapped to the real names — LinkedIn S-12/S-13 are **covered**, not gaps.
2. **RESEARCH.md quoted the refund-boundary test names without their `refund-boundary: ` prefix.** The registry uses the on-disk names. This is precisely the drift class D-12 exists to kill — and it was caught by the machine on the first run, exactly as designed.

---

## GREEN — final disposition

**Closed by plan 09-08 (2026-07-11).** `npx vitest run src/test/coverage/ver02-matrix.test.ts` exits **0**,
6/6 assertions. **VER-02 is satisfied and machine-enforced.**

| | Cells |
|---|---|
| Mapped to a live, lane-registered test | **120** |
| Explicit, justified, approved waiver | **5** (S-07 x all five) |
| Unclosed gaps | **0** |
| **Total** | **125** |

`rg "kind: 'gap'"` → **0 matches.** The `gap` cell TYPE is deliberately retained so a future scenario can
still be seeded as a loud gap rather than quietly omitted.

### Closed-gap table (cell → closing test)

| Cells | Owner | Closing test(s) |
|---|---|---|
| S-01a, S-01b x recruiting_lens | 09-05 | `recruiting-lens/__tests__/idempotency-repeated-run.test.ts` — `FEAT-06 (1a)/(1b)/(2a)/(2b)` |
| S-08 x recruiting_lens | 09-05 | same file — `FEAT-06 (1c)/(1d)/(2c)` (Pitfall-8 identity stability) |
| S-12, S-13 x recruiting_lens | 09-05 | `recruiting-lens/__tests__/runtime-validation-convergence.test.ts` — garbage / empty / `{}` → `MODEL_INVALID_RESPONSE`; truncated + clipped-mid-string → `MODEL_OUTPUT_TRUNCATED` |
| S-19 x recruiting_lens | 09-05 | `recruiting-lens/__tests__/refund-after-save.test.ts` — see the **D9-02 disclosure** below |
| S-23 x linkedin | 09-05 | `grade-linkedin/__tests__/cors-matrix.test.ts` — the `withCors` static anchor + the Pitfall-7 thrown-401 case + the fail-closed evil-origin case |
| S-01c x all 5 | 09-06 | `_shared/__tests__/consecutive-runs.test.ts` (parameterized; each cell pins `label: '<feature>'`) |
| S-09 x all 5 | 09-06 | `_shared/__tests__/replacement-upload.test.ts` (parameterized; `career_compass` is a FULL member, **not** a waiver) |
| S-02, S-03, S-04, S-21 x {resume, onboarding, linkedin, recruiting_lens} | 09-06 | the four new `src/pages/__tests__/*.recovery.test.tsx` + the `useAnalysisRun.test.ts` substrate (the 09-01 rule: substrate **AND** per-feature wiring) |
| S-20 x all 5 | 09-06 | `e2e/two-tab-concurrency.spec.ts` — **the BLOCKING half only** + the per-feature dup-guard wiring |
| S-22 x all 5 | 09-07 | `{analyze-resume,analyze-career,grade-linkedin,recruiting-lens}/__tests__/history-persistence.test.ts` (the resurrected remote lane) + the `history-wiring.test.ts` offline guards |

### Final waiver list (the ONLY accepted gaps — all trace upstream)

| Cell | Reason | approvedBy | Traces to | Report item 14 |
|---|---|---|---|---|
| S-07 large PDF x **resume** | No upload byte-size guard exists in the PRODUCT (grep-verified absent from `src/lib`, `src/pages/Upload.tsx`, `_shared/document-extraction.ts`). The per-tier CHARACTER caps (`getMaxInputChars`) truncate AFTER extraction and are not a file-size guard. A product gap, not a test gap. | `09-01 (D-11 registry decision)` | this doc, § S-07 | **YES** |
| S-07 x **onboarding** | " | " | " | **YES** |
| S-07 x **linkedin** | " | " | " | **YES** |
| S-07 x **recruiting_lens** | " | " | " | **YES** |
| S-07 x **career_compass** | " | " | " | **YES** |

**Five waivers, one root cause, one upstream decision.** Every waiver carries a non-empty `reason` AND a
non-empty `approvedBy` (registry assertion 4 enforces this mechanically). **Zero waivers were invented by
09-08, and zero cells were downgraded from a real test to a waiver in order to green the phase.** Task 3's
BLOCK condition (a waiver that does not trace to an approved upstream decision) never triggered.

### Waivers that were CONSIDERED and REJECTED (the registry got stronger, not weaker)

| Candidate | Disposition |
|---|---|
| **S-09 x career_compass** | **NOT waived.** 09-06 verified career_compass IS document-ingesting — `buildCareerInputIdentity` hashes `resumeText` + `linkedinText` (the document CONTENTS), so a replacement re-keys it exactly like the other four. Covered as a full member. |
| **S-20 x all 5** | **NOT waived.** The blocking half of the two-tab spec runs on every gate and has real teeth (one submit + two live browser contexts ⇒ exactly ONE analysis, AT MOST ONE debit). |
| **S-16 x recruiting_lens** | **NOT waived** (09-01 decision): satisfied by the Elite `403` gate + `withMerits` routing + the shared gateway's own `402`. |

### Disclosures carried OUT of this matrix (report item 14)

1. **S-07 large PDF** — the five waivers above. Residual **product** risk.
2. **D9-02 / FINDING 09-05-F1** — the S-19 x recruiting_lens cell is mapped to real tests, but it is
   **NOT an unqualified pass**. `persistRecruitingLensResult` still throws `MeritRefundable` AFTER its
   durable insert on the LEGACY path. The cell maps only what is genuinely proven (the invariant on the
   MIGRATED lifecycle `save()`, plus the `[F1]` containment assertion that pins the ROUTING and stays true
   after the fix). The defect is **open, disclosed in-source, and deliberately NOT waived** — it must be
   resolved before D-02 flips Recruiting Lens on production.
3. **D9-05** — 32 further Deno test files run in NO lane. VER-02 is unaffected (assertion 5 proves every
   mapped test is lane-registered), but it is coverage-of-unknown-value outside the matrix.

### What now guards this matrix (assertions, not prose)

1. the matrix is exactly 25 x 5 (scope guard);
2. every cell is present (no silent omission);
3. every mapped file EXISTS;
4. every mapped test NAME appears verbatim — **and every parameterized cell's PARAMETER literal too**, so
   deleting a feature from a suite's `FEATURES` table turns its cells RED (new in 09-08);
5. every waiver has a reason + approver, and **zero gaps remain**;
6. **every mapped `supabase/functions` test is registered in a `deno.json` lane** (new in 09-08 — T-09-08-C).
   This is the loop-closer: assertions 3 and 4 prove a test exists and is named right; **only** assertion 6
   proves it ever RUNS. Its absence is what let the five history files rot.

All six were mutation-proven RED in 09-08: a renamed test title, a file dropped from `test:ci`, a feature
removed from a parameterized suite, and the preflight moved out of first position each turn the gate RED.
