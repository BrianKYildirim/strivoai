# Phase 9 — Fixture Provenance Record (D-15 / VER-04)

**Plan:** 09-02
**Created:** 2026-07-11
**Answers:** `09-RESEARCH.md` Open Question 3 — *"Is `scripts/test-resumes/Profile.pdf` genuinely synthetic?"*

D-15 makes `scripts/test-resumes/` the **only** permitted input for the VER-04
real-account production runs (plan 09-11) and for the live smokes (plan 09-10). This
document is the on-the-record proof that every one of those inputs is synthetic. It is
a **precondition for 09-11**: no production run may use an input that is not enrolled
here with a `SYNTHETIC` verdict.

Enrollment is machine-enforced. `src/test/security/phase9-pii-guard.test.ts` asserts
that every file in `scripts/test-resumes/` appears in this document — a new fixture
cannot be added without a provenance entry, and it runs inside `verify:baseline`.

## Markers checked (every fixture)

| Marker | What would make it a finding |
|---|---|
| Personal name | A real, identifiable individual rather than a fabricated persona |
| Email address | A routable address belonging to a real person |
| Phone number | A number outside a reserved-fictional range |
| Employer + dates | A real employer paired with a real, verifiable tenure for a real person |
| LinkedIn URL | A vanity URL that resolves to a real profile |

## Summary

| Fixture | Type | Verdict | Origin |
|---|---|---|---|
| `short.txt` | text | **SYNTHETIC** | Fabricated persona, authored as a test fixture |
| `medium.txt` | text | **SYNTHETIC** | Fabricated persona, authored as a test fixture |
| `long.txt` | text | **SYNTHETIC** | Fabricated persona, authored as a test fixture |
| `Profile.pdf` | binary | **REAL -> REMEDIATED (now SYNTHETIC)** | Was a real person's LinkedIn export; **replaced** in 09-02 |

---

## `short.txt`

- **Origin:** Fabricated entry-level CS-undergraduate resume, authored as a test fixture.
- **Verdict: SYNTHETIC**
- **Markers checked:**
  - *Name* — "Alex Chen", a generic fabricated persona. No corroborating identity signal.
  - *Email* — local part matches the fabricated persona; domain is a generic placeholder (`university.edu`). Not attributable to a real individual.
  - *Phone* — in the `(555) 1xx-xxxx` reserved-fictional range. Non-routable.
  - *Employer + dates* — "TechStart Solutions", an invented company, with fabricated future-dated tenure (2025).
  - *LinkedIn URL* — vanity handle matches the fabricated persona; does not resolve to a real profile.
- **Notes:** Contains a deliberate typo (`daAtabase`) consistent with authored test content.

## `medium.txt`

- **Origin:** Fabricated business-economics undergraduate resume, authored as a test fixture.
- **Verdict: SYNTHETIC**
- **Markers checked:**
  - *Name* — "Priya Sharma", a generic fabricated persona.
  - *Email* — local part matches the fabricated persona at a real university domain (see residual nit below).
  - *Phone* — `(555) 2xx-xxxx` reserved-fictional range.
  - *Employer + dates* — "BrandWave Digital" and "Pacific Coast Capital" are invented companies; tenures fabricated.
  - *LinkedIn URL* — vanity handle matches the fabricated persona; does not resolve.
- **Notes:** This is the fixture loaded by `supabase/functions/_shared/tier-validation.test.ts` — the only fixture with a live test-code consumer besides `Profile.pdf`.

## `long.txt`

- **Origin:** Fabricated senior/high-achiever engineering resume, authored as a test fixture.
- **Verdict: SYNTHETIC**
- **Markers checked:**
  - *Name* — "Jordan Mitchell", a generic fabricated persona.
  - *Email* — local part matches the fabricated persona at a real university domain (see residual nit below).
  - *Phone* — `(555) 3xx-xxxx` reserved-fictional range.
  - *Employer + dates* — names **real** companies (Stripe, Figma) as internship employers. This is the intended stress-shape for the grader (a strong resume), and the *persona* holding those internships is fabricated. No real individual is implied.
  - *LinkedIn URL / portfolio* — vanity handle and portfolio domain match the fabricated persona; neither resolves to a real profile.

### Residual nit (all three text fixtures)

`medium.txt` and `long.txt` place fabricated local parts at **real** university domains
(`uci.edu`, `stanford.edu`). The addresses are not attributable to any real person and
are not routable to one, so the verdict stands at SYNTHETIC. Preference for any *future*
fixture: use RFC 2606 reserved domains (`example.com`) so the address is provably
fictional by construction. Not worth a rewrite of three passing fixtures today; recorded
here so the next fixture author does the right thing.

---

## `Profile.pdf`

**This fixture was a finding, not a fixture.**

- **Extraction method:** text extracted with the repo's existing `pdfjs-dist` (`legacy/build/pdf.mjs`, `getTextContent()` per page) via a throwaway script. **No npm dependency was added** (`package.json` unchanged). The document's own metadata was also read directly from the uncompressed PDF header.
- **Verdict (as committed in `21925c88`): REAL** — remediated in 09-02, see below.

### What was found (redacted)

The file was a genuine LinkedIn **"Save to PDF"** profile export — `/Author (LinkedIn)`,
`/Producer (Apache FOP Version 2.3)`, `/Subject (Resume generated from profile)` — of a
**real, identifiable individual**, almost certainly the repository owner's own profile.

| Marker | Present in the committed fixture? |
|---|---|
| Personal name | **YES** — a real full name (redacted) |
| Email address | **YES** — a real, routable personal address (redacted) |
| Phone number | **YES** — a real 10-digit mobile number, *not* in any reserved-fictional range (redacted) |
| Employer + dates | **YES** — real employers with real tenures, including this project |
| LinkedIn URL | **YES** — a real vanity URL that resolves to a live profile (redacted) |

No real PII is quoted in this document, by design — pasting the finding here would itself
turn the 09-02 guard RED, which is precisely the invariant the guard exists to enforce.

Aggravating detail: the consuming test (`src/lib/__tests__/profile-pdf-reconstruct.test.ts`)
carried a comment asserting *"The fixture is a real LinkedIn export containing PII, so it is
intentionally NOT committed."* The file **was** committed (tracked since `21925c88`). The
belief that it was excluded is likely why it went unnoticed. That test also `console.log`ed
the first 200 characters of the extracted profile into CI output on every run.

### Remediation applied in 09-02

1. **Replaced** at the same path (`scripts/test-resumes/Profile.pdf`) with a synthetic LinkedIn export of the same shape — the export's own layout (Contact rail / Top Skills / Languages / Summary / Experience / Education, 2 pages) — so no test path breaks.
2. The replacement is **reproducible, not an opaque blob**: `scripts/test-resumes/generate-synthetic-linkedin-pdf.mjs` deterministically rebuilds it, with no npm dependency (hand-emitted PDF 1.4, uncompressed content streams so the text stays greppable by the PII guard). That script is this binary's provenance.
3. The synthetic persona is **fictional by construction**: `example.com` email domain (RFC 2606, can never route), `(555) 010-1234` phone (NANP `555-0100..555-0199` fictional range), and a non-existent vanity handle.
4. The stale/incorrect comment in `profile-pdf-reconstruct.test.ts` was corrected, its PII-echoing `console.log` of extracted content was removed (shape-only logging retained), and its identity assertion was retargeted from the real handle to the synthetic one. **The test's contract is unchanged** — a real text layer is recovered (keeping the file out of the OCR path), the `linkedin_profile` quality gate (>=420 chars / >=80 words) still clears, and a vanity URL + `TypeScript` skill still survive extraction. It passes (2/2).

- **Verdict (current, at HEAD): SYNTHETIC**
- **Markers checked (current):** name = fabricated persona; email = `example.com` (RFC 2606); phone = `555-01xx` reserved-fictional; employers = invented ("Northwind Systems", "Cobalt Analytics"); LinkedIn URL = non-resolving synthetic handle.

### -> report item 14 (remaining risks)

Two residual risks are handed off explicitly to **VER-05 report item 14**:

1. **The real profile remains in git history.** Replacing the file at HEAD does **not** purge it from the repository's object store — commit `21925c88` still contains the real export, and anyone with clone access can recover it. Fully removing it requires a history rewrite (`git filter-repo` / BFG) and a force-push, which rewrites every downstream clone. That is an operator decision with real blast radius, deliberately **not** taken unilaterally inside a verification phase. **Recommendation: do it** — the data is the repo owner's own name, personal email and mobile number, and the repo's exposure surface (contributors, CI, any future open-sourcing or repo transfer) only grows.
2. **How it got there is the real lesson.** A binary fixture entered the repo with no provenance record and a code comment that asserted the opposite of the truth for months. The 09-02 guard now makes the *class* of mistake gate-blocking (a new fixture with a non-allowlisted email/UUID turns `verify:baseline` RED, and an un-enrolled fixture fails the enrollment assertion), which is the durable fix.

---

## Enforcement

`src/test/security/phase9-pii-guard.test.ts` (vitest, auto-discovered — no allowlist
registration, cannot be dropped from the gate) asserts on every `verify:baseline` run:

1. No email address in `.planning/phases/09-final-verification-milestone-report/**` or `scripts/test-resumes/**` outside the declared allowlists.
2. No UUID outside the declared `ALLOWED_RUN_IDS` allowlist (empty today — 09-11 appends the `analysis_jobs.id` values it cites, so a production user's auth uid cannot ride along inside a log excerpt).
3. No secret-shaped value (the Phase-2 `SECRET_PATTERNS` table).
4. Every `scripts/test-resumes/` fixture is enrolled in this document.
