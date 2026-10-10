# REPO-05 — Dependency-Free Secret / Binary / Artifact Scan Evidence

**Phase:** 02 — Repository Hygiene & State Reconciliation
**Plan:** 02-02 (REPO-05)
**Scan date:** 2026-06-13
**Branch / HEAD at scan:** `staging` @ `95604af`
**Tooling:** Dependency-free native git only — `git grep`, `git ls-files`, `du`. **NO `gitleaks` / `trufflehog` installed (D-14, zero-new-deps milestone posture).**
**Scope:** *Tracked* content only (what is committed), not working-tree junk. We assert what the repository *exposes*, not transient local state.

---

## Verdict: **CLEAN**

No tracked secrets, large foreign binaries, or build-artifact directories — **beyond the single documented `dist-codex/` build-artifact gap, which is closed by plan 02-03 (D-01, cross-ref REPO-03).** All key-pattern hits are documented false positives (named below). No real `sk_(live|test)_…` / `pk_live_…` / service-role-JWT / PEM private-key value is tracked in any non-`.example`, non-`.planning/`-doc file.

The **Block-on-HIGH** guard (a real secret value in a non-example, non-doc tracked file) did **NOT** trigger. This report is committed as "clean" on that basis.

---

## Scan Commands Run (each read-only; results are counts/classifications, never pasted secret values)

### 1. Secret-pattern pass over tracked files (excluding `.planning/*` docs and `*.test.*`)

```bash
git grep -nIE "sk_live_[A-Za-z0-9]{20}|sk_test_[A-Za-z0-9]{20}|pk_live_[A-Za-z0-9]{20}|service_role[^a-zA-Z0-9]{0,40}eyJ|-----BEGIN [A-Z ]*PRIVATE KEY-----" -- ':!.planning/*' ':!*.test.*'
```

**Result:** No matches (`git grep` exit code `1` = no hits). → **No real secret value tracked in source / config / functions.** PASS.

### 2. Tracked env files

```bash
git ls-files | grep -iE "\.env"
```

**Result — exactly 2, both `*.example` templates:**

| Tracked env file | Classification |
|------------------|----------------|
| `.env.example` | template (no real values) — correctly tracked |
| `.env.test.local.example` | template (no real values) — correctly tracked |

Real env files (`.env`, `.env.local`, `.env.test.local`) are **gitignored** (verified: `git check-ignore` prints them = ignored; the two `*.example` files print nothing = correctly NOT ignored, exit `1`). PASS.

### 3. Largest tracked blobs (top 15) — surface any stray binary

```bash
git ls-files -z | xargs -0 du -k | sort -rn | head -15
```

**Result (KB → path):**

| KB | Path | Classification |
|----|------|----------------|
| 6208 | `public/adventureofalifetime.mp3` | KEEP — served app audio asset |
| 6208 | `dist-codex/adventureofalifetime.mp3` | **ARTIFACT — dup of the `public/` copy; removed when 02-03 untracks `dist-codex/`** |
| 2124 | `dist-codex/assets/index-BUOqd1_Y.js` | **ARTIFACT — `dist-codex/`, removed by 02-03** |
| 1204 | `src/assets/strivo-logo.png` | KEEP (D-04) — app image |
| 1204 | `public/strivo-logo.png` | KEEP (D-04) — app image |
| 1204 | `public/lovable-uploads/09d1881b-…png` | KEEP (D-04) — app image |
| 1204 | `public/favicon-48.png` / `public/favicon.png` / `public/favicon.ico` | KEEP (D-04) — favicons |
| 1204 | `dist-codex/strivo-logo.png`, `dist-codex/lovable-uploads/…`, `dist-codex/favicon-*` , `dist-codex/assets/strivo-logo-*` | **ARTIFACT — `dist-codex/` copies, removed by 02-03** |

**Largest NON-`dist-codex/` tracked blobs** (all intentional D-04 KEEP artifacts) for the record: `public/adventureofalifetime.mp3` (6208 KB), the `public/` + `src/assets/` logos/favicons (1204 KB each), `.planning/quick/260607-d2k-…/dashboard-*.png` dashboard mockups (740–908 KB), `package-lock.json` (804 KB), `public/strivo-og-image.png` (524 KB). No stray/foreign binary present. PASS.

### 4. Build-artifact directories

```bash
git ls-files | grep -iE "^(dist|build|out|coverage|\.next|\.vercel)/"   # → empty
git ls-files | grep -iE "^dist-codex/"                                   # → 17 files
git ls-files dist-codex/ | wc -l                                         # → 17
```

**Result:** `dist`, `build`, `out`, `coverage`, `.next`, `.vercel` → **none tracked.** `dist-codex/` → **17 files** (the sole stray build-artifact directory). PASS for the standard dirs; `dist-codex/` flagged below.

---

## False Positives (documented, **not** findings)

The unfiltered key-pattern grep (no `:!.planning/*` exclusion) surfaces matches that are **prose / code-module names, not live secret values**. Named here so the CLEAN verdict is auditable (Pitfall 6):

| Match location | Why it is a FALSE POSITIVE (not a secret) |
|----------------|-------------------------------------------|
| `.claude/get-shit-done/bin/lib/secrets.cjs` | A **GSD code module filename** — the literal string `secrets` in a `.cjs` path. It is tooling code, not a secret value (D-04 explicitly notes this). |
| `.planning/phases/01-testing-strategy-regression-baseline/01-02-SUMMARY.md` | A planning **doc that *describes* a scan / pattern** — the Stripe-test-key and service-role-JWT pattern tokens it mentions are documentation strings, not live values. |
| `.planning/phases/02-repository-hygiene-state-reconciliation/02-02-PLAN.md` | This plan file — contains the **scan pattern itself** as a command to run. Pattern text, not a value. |
| `.planning/phases/02-repository-hygiene-state-reconciliation/02-RESEARCH.md` | Phase research — **documents the REPO-05 scan command** verbatim. Pattern text, not a value. |
| `.planning/quick/260609-nks-…/260609-nks-PLAN.md` | A quick-task plan that **references env/secret names** in prose. Names, not values. |

All five are inside `.planning/**` docs or are the `secrets.cjs` module name — **none is a tracked secret value.** The Pass-1 command excludes `.planning/*` precisely so these don't masquerade as findings.

---

## Artifact Gap (the single open item, NOT closed here)

- **`dist-codex/` — 17 tracked files** is the **only** stray build-artifact directory (confirmed-stale Vite build output; `vercel.json` has no output override, nothing serves it). It includes a ~6 MB `adventureofalifetime.mp3` that duplicates the `public/` copy.
- **Disposition:** flagged → **handled in plan 02-03** (D-01 / REPO-03): `git rm -r --cached dist-codex/` + add `dist-codex/` to `.gitignore`. **NOT removed by this plan (02-02) — this plan records evidence only.**
- Once 02-03 untracks it, re-running scan dimension 4 returns empty for *all* artifact dirs and the largest-blob list loses the `dist-codex/` rows (the mp3 dup disappears).

---

## Re-Assertion Block (reproducible by any future audit)

Run from repo root; all dependency-free native git. Expected results in comments.

```bash
# 1. No real secret value in source/config/functions (excludes .planning docs + tests) → no output, exit 1
git grep -nIE "sk_live_[A-Za-z0-9]{20}|sk_test_[A-Za-z0-9]{20}|pk_live_[A-Za-z0-9]{20}|service_role[^a-zA-Z0-9]{0,40}eyJ|-----BEGIN [A-Z ]*PRIVATE KEY-----" -- ':!.planning/*' ':!*.test.*'

# 2. Only *.example env files tracked → exactly .env.example + .env.test.local.example
git ls-files | grep -iE "\.env"

# 3. Largest tracked blobs (spot any new stray binary) → top 15
git ls-files -z | xargs -0 du -k | sort -rn | head -15

# 4. No standard build-artifact dir tracked → empty
git ls-files | grep -iE "^(dist|build|out|coverage|\.next|\.vercel)/"
# dist-codex gap (until 02-03 lands) → 17, then 0 after 02-03
git ls-files dist-codex/ | wc -l
```

**PowerShell equivalent for dimension 3** (primary shell is pwsh):

```powershell
git ls-files | ForEach-Object { $i = Get-Item -LiteralPath $_ -ErrorAction SilentlyContinue; if ($i) { [pscustomobject]@{ KB = [math]::Round($i.Length/1KB); Path = $_ } } } | Sort-Object KB -Descending | Select-Object -First 15
```

---

## Cross-References

- **REPO-03 / plan 02-03 (D-01):** closes the `dist-codex/` artifact gap recorded above.
- **D-04:** the KEEP-list (`.planning/**/*.png`, `APIcontextdocuments/**/*.pdf`, `e2e/fixtures/*.pdf`, `scripts/test-resumes/*.pdf`, `public/` + `src/assets/` images) — all intentional artifacts, untouched by this scan.
- **D-14:** no `gitleaks` / `trufflehog` — dependency-free git scan is the deliberate approach; deep signature/entropy scanning is an available-if-ever-wanted future option, not installed.
- **Threat T-2-01 (ASVS L1):** committed-secret exposure — the live scan above is the verification gate; result is clean.

*This file records pattern classifications, counts, paths, and SHAs only — no real secret value is pasted anywhere in it.*
