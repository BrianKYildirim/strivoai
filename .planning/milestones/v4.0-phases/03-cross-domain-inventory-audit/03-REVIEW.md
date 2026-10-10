---
phase: 03-cross-domain-inventory-audit
reviewed: 2026-06-14T01:18:17Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - scripts/audit/deno-reachability.mjs
  - scripts/audit/run-deadcode.mjs
  - scripts/audit/run-deps.mjs
  - knip.json
  - package.json
findings:
  critical: 0
  warning: 3
  info: 5
  total: 8
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-06-14T01:18:17Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Reviewed the Phase 3 cross-domain audit tooling: three dev-only Node ESM runners
(`deno-reachability.mjs`, `run-deadcode.mjs`, `run-deps.mjs`), the `knip.json`
config, and the `audit:*` script entries in `package.json`. These are
non-production, manually-invoked inventory scripts, so severity is calibrated to
dev-tooling context per the review brief (a crash here is at most a Warning).

The cross-platform launch handling is genuinely careful and mostly correct — I
verified the live `deno info --json` output on this Windows machine (Deno 2.7.1)
and confirmed the central assumptions hold: `modules[].specifier` is always a
forward-slash `file://` URL, `--no-lock` is a valid `deno info` flag, and the
`SHARED_URL_MARKER` matches real specifiers. The directory-filtering logic
correctly excludes `supabase/functions/node_modules/` and `_tests/` because
neither contains an `index.ts`.

The substantive concerns are about **soundness of the dead-code verdict**, not
crashes. The audit is a deletion-recommendation tool, so false positives (live
code reported as a dead candidate) and silent under-counting of the reachability
union are the failure modes that matter. I found three such issues. None are
Critical because the tooling never runs in production and every output is
explicitly labelled "candidates are NOT verdicts," but they degrade the
reliability of the audit's primary output and should be fixed.

## Warnings

### WR-01: Partial `deno info` failure silently shrinks the reachability union, producing false-positive dead candidates

**File:** `scripts/audit/deno-reachability.mjs:171-198`
**Issue:** When `deno info` fails on an entrypoint (network hiccup on a cold
cache, a transient syntax/dependency error, JSON parse failure), that
entrypoint's whole module subgraph is dropped from `reachable` (lines 175-177,
182-184 `continue`), yet `dead` is still computed against the now-incomplete
union (line 198) and the script still exits 0 (line 222). A `_shared` module
that is live but reachable *only* through the failed entrypoint will be reported
as a dead-code CANDIDATE. The failure is printed (lines 215-219) but *after* and
visually disconnected from the dead list, and with no machine-detectable signal
(exit code stays 0). For a tool whose output drives deletion decisions, a
silently-truncated reachability set is the worst failure mode: it biases toward
recommending live code for removal. The header comment (lines 26-28) even
promises "Non-zero only on an internal/tooling error" — an entrypoint that
cannot be analyzed is exactly such an error, but it is not treated as one.
**Fix:** Make the dead list untrustworthy-by-default when any entrypoint failed.
At minimum, suppress / clearly invalidate the dead-candidate list when
`failed.length > 0`, and exit non-zero so a CI or scripted re-run cannot mistake
a partial graph for a clean one:
```js
if (failed.length > 0) {
  console.log('');
  console.error(
    `[deno-reachability] ${failed.length} entrypoint(s) failed — reachability ` +
    `union is INCOMPLETE; dead-candidate list above may contain false positives.`
  );
  for (const f of failed) console.error(`  ! ${f.ep}: ${f.msg}`);
  process.exit(2); // distinct from "clean run with findings"
}
process.exit(0);
```

### WR-02: `test-helpers/` (and any non-`__tests__` support dir) are collected as source and reported as dead candidates

**File:** `scripts/audit/deno-reachability.mjs:113-127`
**Issue:** `collectSharedTsFiles` excludes only directories literally named
`__tests__` (line 118) and files ending in `.test.ts` (line 123). It does **not**
exclude test-support directories. The repo has
`supabase/functions/_shared/test-helpers/stripe-fixtures.ts` and
`stripe-signature.ts` (verified present) — neither is `*.test.ts` nor under
`__tests__`, so both are collected into `allShared`. They are imported only by
tests, never by a production `index.ts` entrypoint (verified: no `index.ts`
references `test-helpers`), so they will appear in the dead-candidate list as
false positives on every run. The same trap applies to the sibling
`tier-validation-fixtures/` dir (currently empty of `.ts`, but the structure
exists and will mis-classify the moment a `.ts` is added). This inflates the
candidate list with noise that a reviewer must manually filter against the
KEEP-LIST, undermining the audit's signal.
**Fix:** Exclude known test-support directories by name (mirroring the
`__tests__` skip), or invert to an allow-list of production dirs:
```js
const TEST_DIRS = new Set(['__tests__', 'test-helpers', 'tier-validation-fixtures']);
// ...
if (entry.isDirectory()) {
  if (TEST_DIRS.has(entry.name)) continue;
  out.push(...collectSharedTsFiles(full));
}
```
Also consider excluding `*.fixtures.ts` / files under any `*fixtures*` dir.

### WR-03: knip `entry` omits the vitest setup file and any `*.spec.{ts,tsx}` test naming, risking false "unused file" reports

**File:** `knip.json:3-12`
**Issue:** Two coverage gaps in the entry globs against the actual repo layout:
1. `vitest.config.ts` declares `setupFiles: ['./src/test-setup.ts']` (verified),
   but `src/test-setup.ts` is not listed in `entry`. It is in `project`
   (`src/**/*.{ts,tsx}`) and is imported by nothing except the vitest config
   string. Whether it is flagged "unused" depends entirely on knip's vitest
   plugin auto-resolving `setupFiles` — which works only if the plugin activates
   and parses the config. This is a fragile, implicit dependency for a file the
   audit must never delete; it should be pinned explicitly.
2. The test entry globs cover `*.test.{ts,tsx}` and `__tests__/**` but not
   `*.spec.{ts,tsx}`. No `src/**/*.spec.ts(x)` files exist today, so there is no
   active false positive, but the convention drift means any future `.spec`
   test (the repo already uses `.spec.ts` under `e2e/`) would not be recognized
   as an entry, causing production files used only by that spec to be reported
   as unused.
**Fix:** Add the setup file and broaden the test glob to match repo conventions:
```jsonc
"entry": [
  "src/main.tsx",
  "index.html",
  "vite.config.ts",
  "vitest.config.ts",
  "playwright.config.ts",
  "src/test-setup.ts",
  "e2e/**/*.ts",
  "src/**/*.{test,spec}.{ts,tsx}",
  "src/**/__tests__/**/*.{ts,tsx}"
]
```

## Info

### IN-01: Redundant `path` import (default + named `delimiter`)

**File:** `scripts/audit/deno-reachability.mjs:32-33`
**Issue:** `import path from 'node:path'` and
`import { delimiter } from 'node:path'` both pull from the same module;
`delimiter` is already available as `path.delimiter` (used once at line 58).
Harmless but redundant and slightly inconsistent with the single-import style in
the sibling scripts.
**Fix:** Drop line 33 and use `path.delimiter` at line 58.

### IN-02: `npm audit` JSON intermixed with human log lines is not cleanly machine-parseable

**File:** `scripts/audit/run-deps.mjs:21-37` (and `run-deadcode.mjs:25-34`)
**Issue:** Child output uses `stdio: 'inherit'`, so the tool's JSON
(`npm outdated --json`, `npm audit --json`, `knip --reporter json`) is
interleaved on the same stream with the `======== label ========` and
`[run-deps] ... exited N` log lines. The `--json` reporters imply a consumer
expects parseable output, but the result on stdout is not valid JSON. Fine for a
human reading the console; a problem if anything ever tries to pipe/parse it.
**Fix:** If machine-readability is intended, capture child stdout
(`stdio: ['ignore','pipe','inherit']`), write the JSON to a file or print it on a
clean stream, and send the human log lines to stderr.

### IN-03: `npm outdated`/`npm audit` non-zero `r.error` vs non-zero `r.status` conflation

**File:** `scripts/audit/run-deps.mjs:28-32`
**Issue:** The comment block correctly explains that non-zero *exit status* is
the expected inventory signal, and the code handles `r.error` (spawn failure)
separately — good. But there is no distinction between "npm exited non-zero
because it found outdated/vulnerable packages" (expected) and "npm exited
non-zero because the command itself errored, e.g. registry auth/network failure"
(a real tooling failure that should be surfaced). Both are reported identically
as "non-zero is the normal inventory signal," so a genuinely failed `npm audit`
(e.g. ENOTFOUND to the registry) is silently presented as a successful inventory
with no findings.
**Fix:** Inspect captured stderr or known npm error markers, or at least note in
the printed summary that a non-zero exit *with empty JSON* may indicate a
command failure rather than zero findings.

### IN-04: `maxBuffer` only set on the shell path's `execFileSync`, relied upon implicitly elsewhere

**File:** `scripts/audit/deno-reachability.mjs:89-102`
**Issue:** Both `execFileSync` calls set `maxBuffer: 64 * 1024 * 1024`, which is
correct and generous. Minor note: the two call sites duplicate the full options
object (lines 89-95 and 97-102), so a future change to one (e.g. raising
`maxBuffer` or adding `env`) can silently diverge from the other.
**Fix:** Extract a shared `const opts = { cwd: repoRoot, encoding: 'utf8',
maxBuffer: 64*1024*1024, stdio: ['ignore','pipe','pipe'] }` and spread it into
both calls (`{ ...opts, shell: true }` for the shell path).

### IN-05: `knip.json` `ignoreDependencies: []` is an empty no-op placeholder

**File:** `knip.json:15`
**Issue:** `"ignoreDependencies": []` has no effect and is dead config. Not
harmful, but it reads as if exclusions were intended and forgotten. Devs relying
on knip's default devDependency detection should confirm `cross-env`,
`promptfoo`, `supabase`, and `playwright` (used only via npm scripts / external
configs) are not false-flagged as unused; if they are, this is where to suppress
them.
**Fix:** Remove the empty key, or populate it once a knip run confirms which
script-only devDependencies need suppressing.

---

_Reviewed: 2026-06-14T01:18:17Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
