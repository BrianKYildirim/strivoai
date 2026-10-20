---
status: resolved
trigger: "How do I repair the Deno and Vitest runner failures blocking Phase 08.3 validation?"
created: 2026-07-10
updated: 2026-07-10
---

# Debug Session: Repair Local Test Runners

## Symptoms

- expected: Focused Deno and Vitest suites start and execute their assertions.
- actual: Both runners fail during startup before any assertion executes.
- errors: Deno 2.7.1 reports `Unexpected client pipe failure` and panics with `The handle is invalid.` Vitest cannot load `@swc/core-win32-x64-msvc` (`stream did not contain valid UTF-8`) and Vite reports `spawn EPERM`.
- timeline: Reproduced repeatedly on 2026-07-10 during two Phase 08.3 validation attempts; prior phase verification recorded both suites green.
- reproduction: Run the focused Phase 08.3 Deno tests or `npx.cmd vitest run src/pages/__tests__/LinkedInGrader.legacy-shape.test.tsx`.

## Current Focus

- hypothesis: Confirmed: the managed execution sandbox denies Vite's `net use` subprocess and Deno test-harness named-pipe access; the local installations are healthy.
- test: Re-run the exact focused Vitest test and representative Deno phase test outside the managed sandbox.
- expecting: Both suites execute and pass without reinstalling dependencies or changing repository files.
- next_action: Ask the user to confirm validation should be rerun with approval for unsandboxed test commands.
- reasoning_checkpoint:
    hypothesis: The managed sandbox causes both startup failures because it blocks the specific Windows subprocess and named-pipe operations used by Vite and Deno test.
    confirming_evidence:
      - Direct SWC loading, Deno eval, and runner version commands pass inside the sandbox.
      - `net use` spawned by Node fails with `spawn EPERM`, matching Vite's stack, and Deno test fails at its named pipe with Windows access code 5.
      - The same focused Vitest and Deno tests both pass outside the sandbox with no installation changes.
    falsification_test: Either focused runner still failing outside the sandbox would show a real installation or project problem.
    fix_rationale: No dependency repair is appropriate; execute test commands with explicit unsandboxed approval so required Windows process and IPC operations are permitted.
    blind_spots: Other full-suite tests may have independent failures not exercised by the two focused checks.
- tdd_checkpoint:

## Evidence

- timestamp: 2026-07-10
  checked: executable resolution and installed runner versions
  found: Deno 2.7.1 resolves through `C:\Users\yildi\AppData\Roaming\npm\deno.ps1`; Node is 22.16.0, npm 11.4.0, Vitest 4.1.9, Vite 8.0.16, and SWC 1.15.24.
  implication: Versions resolve successfully; Deno is installed through npm rather than a standalone system installer.

- timestamp: 2026-07-10
  checked: expected `@swc/core-win32-x64-msvc` native binary
  found: A first metadata probe appeared blank, but direct directory listing confirms the 25,754,624-byte native binary exists and `node -e "require('@swc/core')"` loads it successfully.
  implication: SWC is present and loadable; package corruption is not supported and the Vitest SWC text is likely secondary error aggregation.

- timestamp: 2026-07-10
  checked: minimal runner startup
  found: `deno eval` succeeds, `npx vitest --version` succeeds, and direct SWC loading succeeds; the focused Vitest run fails during config loading with `spawn EPERM` plus the aggregated unloadable-dependency message.
  implication: Core executables and native binding work until the runner enters a subprocess-dependent path.

- timestamp: 2026-07-10
  checked: Vite subprocess behavior and Deno test IPC inside the sandbox
  found: Node can spawn `cmd`, but spawning `net use` fails with `spawn EPERM`; Vite 8 invokes `exec("net use")` in `optimizeSafeRealPathSync`. Deno test fails opening its `\\.\pipe\deno_pipe_*` channel with Windows error code 5 and then invalid handle code 6.
  implication: The managed sandbox blocks the exact OS operations used by both test runners.

- timestamp: 2026-07-10
  checked: focused tests outside the managed sandbox
  found: `LinkedInGrader.legacy-shape.test.tsx` passed 2/2 and `grade-linkedin/prompts.test.ts` passed 15/15 without reinstalling or modifying dependencies.
  implication: The installations are healthy; sandbox restrictions fully explain the prior startup failures.

## Eliminated

- hypothesis: The SWC native package is missing or corrupt.
  evidence: The binary exists, direct `require('@swc/core')` succeeds, and the focused Vitest suite passes outside the sandbox without reinstalling it.
  timestamp: 2026-07-10

- hypothesis: The Deno executable itself is corrupt.
  evidence: `deno eval` succeeds and the focused Deno suite passes 15/15 outside the sandbox with the same executable.
  timestamp: 2026-07-10

## Resolution

- root_cause: Managed Codex shell sandbox restrictions deny Vite's Windows `net use` subprocess (`spawn EPERM`) and Deno test's named-pipe channel (access denied/invalid handle). The SWC unloadable-dependency text is a secondary aggregated error, not package corruption.
- fix: No local toolchain files need repair. Run Vitest and Deno test commands with explicit unsandboxed approval (or directly in a normal user PowerShell outside the managed Codex sandbox).
- verification: Outside the sandbox, the focused Vitest suite passed 2/2 and the representative Phase 08.3 Deno suite passed 15/15 using the existing installations. Confirmed on 2026-07-10 at full-suite scale during Phase 08.3 validation: unsandboxed `npm run test:edge` returned 1133 passed / 0 failed / 12 ignored and unsandboxed `npm run test` returned 88 files / 537 tests passed, with no dependency reinstall.
- files_changed:
  - .planning/debug/repair-local-test-runners.md
