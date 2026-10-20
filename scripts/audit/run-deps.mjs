// Dependency-inventory audit orchestrator (DEP-01): runs both npm passes cross-platform.
//
// Usage:
//   node scripts/audit/run-deps.mjs      (wired as `npm run audit:deps`)
//
// Why a node orchestrator: `npm outdated` and `npm audit` BOTH exit non-zero by design
// (npm outdated exits 1 when anything is outdated; npm audit exits non-zero when vulns
// exist). On Windows npm runs scripts via cmd.exe where `;` is not a separator and `&&`
// aborts on the first non-zero exit — so a plain chained string would either mis-parse
// or stop after `npm outdated`. Driving both from node runs each to completion, prints
// its JSON, and treats the non-zero exits as the EXPECTED inventory signal (D-02:
// online registry lookup allowed for the one-time inventory). Zero new dependencies.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const isWin = process.platform === 'win32';

function runNpm(args, label) {
  console.log(`======== ${label} ========`);
  const r = spawnSync('npm', args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: isWin, // npm is a .cmd shim on Windows
  });
  if (r.error) {
    console.error(`[run-deps] ${label} could not be launched: ${r.error.message}`);
    return;
  }
  console.log(`[run-deps] ${label} exited ${r.status} (non-zero is the normal inventory signal)`);
  console.log('');
}

runNpm(['outdated', '--json'], 'npm outdated (current/wanted/latest)');
runNpm(['audit', '--json'], 'npm audit (vulnerability signal)');

// Inventory passes always "succeed" — their non-zero exits are findings, not errors.
process.exit(0);
