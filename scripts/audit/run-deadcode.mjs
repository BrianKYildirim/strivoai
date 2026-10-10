// Dead-code audit orchestrator (CLEAN-01): runs BOTH passes cross-platform.
//
// Usage:
//   node scripts/audit/run-deadcode.mjs      (wired as `npm run audit:deadcode`)
//
// Why a node orchestrator instead of chaining in the npm script string: on Windows
// npm runs scripts via cmd.exe, where `;` is NOT a statement separator and `&&`
// aborts on the first non-zero exit. knip intentionally exits non-zero when it finds
// issues, which would (a) be mis-parsed by cmd.exe or (b) abort the Deno leg. Driving
// both passes from node guarantees: knip runs first (its non-zero exit is a FINDING,
// not a failure — we capture and continue), then the Deno reachability pass always
// runs. Zero new dependencies — knip via `npx --yes`, the Deno pass via `node`.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');
const isWin = process.platform === 'win32';

console.log('======== React dead-code/exports/deps (knip) ========');
// knip exits non-zero when it finds issues — that is the normal, expected outcome of
// an audit, NOT a tooling error. We run it for its report and continue regardless.
const knip = spawnSync('npx', ['--yes', 'knip', '--reporter', 'json'], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: isWin, // npx is a .cmd shim on Windows → needs the shell to resolve
});
if (knip.error) {
  console.error(`[run-deadcode] knip could not be launched: ${knip.error.message}`);
} else {
  console.log(`[run-deadcode] knip exited ${knip.status} (non-zero = issues found, which is a finding, not an error)`);
}

console.log('');
console.log('======== Deno edge-function reachability ========');
const deno = spawnSync('node', [path.join(scriptDir, 'deno-reachability.mjs')], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: false, // `node` launches directly on all platforms
});

// The orchestrator succeeds as long as the Deno pass ran cleanly. knip's issue-exit
// is deliberately not propagated (it would make a clean audit look like a failure).
if (deno.error) {
  console.error(`[run-deadcode] deno-reachability could not be launched: ${deno.error.message}`);
  process.exit(1);
}
process.exit(deno.status ?? 0);
