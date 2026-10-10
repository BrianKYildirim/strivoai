---
phase: 03-cross-device-reliability-and-compatibility
plan: 02
subsystem: infra
tags: [vite, rolldown, build-id, version-manifest, vercel, cache-control, vitest]

# Dependency graph
requires: []
provides:
  - "__STRIVO_BUILD_ID__ build-time define carrying a never-empty build identity"
  - "dist/version.json manifest emitted by an inline Vite plugin (strivo-version-manifest)"
  - "Cache-Control: no-store on /version.json in vercel.json"
  - "src/lib/platform/build-id.ts — getBuildId() / fetchDeployedBuildId() / isVersionCheckDue()"
  - "src/lib/platform/ as the home for platform-capability modules"
affects: [03-06 diagnostics ingest (app_version), 03-13 stale-bundle recovery, XLOG-01, XDEV-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Config-time build identity with a 4-step resolution chain ending in an unconditional timestamp"
    - "Inline Vite plugin using generateBundle + this.emitFile to ship a build-output manifest"
    - "Fail-closed never-throws accessor module (matches src/lib/analysis-error-log.ts posture)"

key-files:
  created:
    - src/lib/platform/build-id.ts
    - src/lib/platform/build-id.test.ts
  modified:
    - vite.config.ts
    - src/vite-env.d.ts
    - vercel.json

key-decisions:
  - "Created the plugins array with ONLY the version-manifest plugin — vite.config.ts has had no plugins array since before HEAD (react() is imported but unused; Vite 8/rolldown handles JSX via oxc). Adding react() would have changed build output for no in-scope reason."
  - "getBuildId() returns 'unknown', never '', for every degenerate value — an empty ID would make 03-13's comparison always match and silently disable stale-bundle recovery."
  - "Throttle state initialises to -Infinity so the first version check is always due regardless of the clock the caller passes."
  - "Did NOT add the /assets/* rewrite exclusion to vercel.json — unverified syntax, and it belongs with plan 03-13's chunk-load work."

patterns-established:
  - "Build identity: one value (BUILD_ID) resolved once at config time, exposed via define AND emitted as a manifest, consumed only through src/lib/platform/build-id.ts"
  - "Version poll is fail-closed: fetchDeployedBuildId() resolves to null for every unhappy outcome and never rejects into a user code path"

requirements-completed: [XDEV-07, XLOG-01]

# Metrics
duration: 22min
completed: 2026-07-28
---

# Phase 03 Plan 02: Build Identity and Version Manifest Summary

**A never-empty build ID stamped into the bundle via `__STRIVO_BUILD_ID__`, a `dist/version.json` manifest emitted by an inline Vite plugin and served `no-store`, plus a fail-closed accessor/poller module — the shared foundation plans 03-06 and 03-13 both consume. No user-visible behavior ships.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-07-28T02:47Z
- **Completed:** 2026-07-28T03:09Z
- **Tasks:** 3
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- `resolveBuildId()` in `vite.config.ts` with the full four-step chain, **all four steps empirically exercised** (see Verification Evidence) rather than assumed: `VITE_BUILD_ID` → `VERCEL_GIT_COMMIT_SHA` (12 chars) → `git rev-parse --short HEAD` → `String(Date.now())`.
- `define: { __STRIVO_BUILD_ID__: ... }` **proven to actually substitute** in built output, not merely present in config — the plan flagged this as unprovable until a consumer lands, but an isolated probe build against the real config closed it now.
- `strivo-version-manifest` inline plugin emits `dist/version.json` with a matching `buildId` on every build.
- `Cache-Control: no-store, must-revalidate` on `/version.json` in `vercel.json`, additive only.
- `src/lib/platform/build-id.ts` + 19 passing unit tests covering the accessor fallback, the swallow-on-failure contract, and both sides of the 60s throttle.

## Task Commits

1. **Task 1: Stamp the build ID and emit version.json** — `dee39c28` (feat)
2. **Task 2: Fail-closed accessor and no-store version poller** — `1eb12cff` (feat)
3. **Task 3: Serve version.json with no-store** — `c0a8a946` (chore)

## Files Created/Modified

- `vite.config.ts` — `resolveBuildId()` + `BUILD_ID` module constant, `versionManifestPlugin()`, `plugins` array, `define` block. `build.rollupOptions.output.manualChunks` untouched; the only removed line in the whole diff is the `import { defineConfig }` line, replaced to add `type Plugin`.
- `src/vite-env.d.ts` — ambient `declare const __STRIVO_BUILD_ID__: string;` so `type-check` resolves the global.
- `src/lib/platform/build-id.ts` — `getBuildId()`, `fetchDeployedBuildId()`, `isVersionCheckDue()`, `resetVersionCheckThrottleForTests()`, plus `UNKNOWN_BUILD_ID` / `VERSION_CHECK_MIN_INTERVAL_MS` constants. No listeners, no reload decision.
- `src/lib/platform/build-id.test.ts` — 19 vitest cases.
- `vercel.json` — new `headers` block for `/version.json`.

## Verification Evidence

Every step of the resolution chain was run against the real `vite.config.ts` using an isolated probe entry built into the scratchpad (repo working tree untouched):

| Condition | Resulting `buildId` |
| --- | --- |
| `VITE_BUILD_ID=explicit-override` | `explicit-override` |
| `VERCEL_GIT_COMMIT_SHA=0123…4567` (40 chars) | `0123456789ab` (truncated to 12) |
| neither set, git available | `c0a8a946` (short SHA) |
| `git` on PATH exits 127 | `1785187833937` (timestamp) — **build still exited 0, no stderr noise** |

The probe also proved substitution end to end: source `console.log("BUILDID_PROBE:" + __STRIVO_BUILD_ID__)` compiled to `BUILDID_PROBE:c0a8a946` in the output chunk, matching the emitted `version.json` byte for byte. In the real `dist/`, `__STRIVO_BUILD_ID__` appears **unsubstituted in zero chunks** and the literal ID appears in zero chunks — correct for this plan, because `build-id.ts` has no importer yet and is therefore tree-shaken. That flips to a positive assertion the moment 03-06 or 03-13 imports it.

Full-gate results: `npm run build` exit 0 · `npm run test` 123 files / 890 tests passed · `npm run type-check` exit 0 · `npm run lint` exit 0 (151 pre-existing warnings, 0 errors) · `vercel.json` node assertion exit 0.

## Decisions Made

- **`plugins` array created rather than appended to.** See Deviations — this is the one place the plan's stated precondition did not match HEAD.
- **`type Plugin` imported from `vite` and the plugin written as a factory** so `this.emitFile` inside `generateBundle` is typed, rather than relying on inference from a bare object literal in an array.
- **`UNKNOWN_BUILD_ID` and `VERSION_CHECK_MIN_INTERVAL_MS` exported as named constants** so 03-06/03-13 assert against the same symbols instead of duplicating `'unknown'` and `60_000` string/number literals.
- **`isVersionCheckDue()` records the check as a side effect** (call once per candidate poll, act on the boolean). Documented in its JSDoc because a caller that calls it twice per poll would silently never poll.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `vite.config.ts` has no `plugins` array at HEAD**

- **Found during:** Task 1
- **Issue:** The plan instructed "append one inline plugin to the `plugins` array, after `react()`", citing `plugins: [react()]` as the current state. That is not HEAD: `vite.config.ts` has carried **no `plugins` key at all** since commit `5988f92e`; `react` is imported at line 2 and never used. (Vite 8 / rolldown transforms JSX via oxc, so the build works without the SWC plugin; `vitest.config.ts` is the file that actually registers `react()`.) There was no array to append to.
- **Fix:** Created `plugins: [versionManifestPlugin()]` containing **only** the new plugin. Deliberately did **not** add `react()` — activating the SWC transform pipeline would change production build output, which is exactly the "config regression blast radius" the plan's own threat model warns against, and it is out of this plan's scope.
- **Files modified:** `vite.config.ts`
- **Verification:** `npm run build` exit 0, bundle chunk names/sizes consistent with pre-change output, `manualChunks` untouched, `version.json` emitted.
- **Committed in:** `dee39c28` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope creep. The deviation is a corrected plan precondition, not new work. Flagged for the phase: any later plan that assumes `react()` is active in `vite.config.ts` is working from the same stale assumption.

## Issues Encountered

- **Acceptance criterion "the literal build ID appears in `dist/assets/*.js`" cannot pass in this plan.** `build-id.ts` has no importer, so rolldown tree-shakes it out entirely — the ID is in no chunk. The plan anticipated this and offered a weaker fallback ("assert the `define` key is present and the build succeeded"), but that fallback would not have caught a genuinely broken `define`. Resolved by building an isolated probe entry against the real config in the scratchpad, which proves substitution directly. See Verification Evidence.
- **`rg -c "cache: 'no-store'" src/lib/platform/build-id.ts` returns 2, not the 1 the plan predicted.** The second occurrence is inside the JSDoc explaining why the header and the fetch option are belt-and-braces. Benign; the plan's intent (the fetch option is present) is satisfied.

## User Setup Required

None — no external service configuration required. `vercel.json`'s new header takes effect on the next Vercel deploy; nothing was deployed by this plan.

## Next Phase Readiness

- **Ready for 03-06 (diagnostics):** `getBuildId()` is the `app_version` source. It returns `'unknown'` under vitest — diagnostics tests must expect that, not a SHA.
- **Ready for 03-13 (stale-bundle recovery):** `fetchDeployedBuildId()` and `isVersionCheckDue()` are the poll primitives. 03-13 owns listener installation (`visibilitychange` → visible, route change), the `sessionStorage` loop guard, and the `/?_v=` CTA. It also owns the follow-up `vercel.json` edit adding the `/assets/*` rewrite exclusion, deliberately left out here.
- **Carry-forward note:** the moment either consumer imports `build-id.ts`, add the assertion this plan could not make — that the literal build ID appears in at least one `dist/assets/*.js` chunk. That is the cheapest permanent guard against a silently broken `define`.
- **No blockers.** Nothing user-visible changed; the change is inert until a consumer lands.

---
*Phase: 03-cross-device-reliability-and-compatibility*
*Completed: 2026-07-28*
