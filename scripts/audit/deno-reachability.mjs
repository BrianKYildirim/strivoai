// Deno edge-function reachability audit (CLEAN-01, the Deno half).
//
// Usage:
//   node scripts/audit/deno-reachability.mjs
//
// What it does: knip/ts-prune cannot read Deno's https://, npm:, jsr: imports, so
// they would flag every supabase/functions file "unreferenced" (false positives).
// This runner builds the TRUE reachability set instead: for every deployed edge
// function entrypoint (supabase/functions/*/index.ts) it shells out to
//   deno info --json <entrypoint>
// and unions the module graphs. Any supabase/functions/_shared/**/*.ts file (minus
// tests) NOT in that union is a DEAD-CODE CANDIDATE for DEAD-CODE.md.
//
// Why entrypoints, not frontend imports: edge functions are reached by HTTP-invoke /
// webhook / cron / internal-job-worker, never by a frontend `import`. The entrypoint
// is always supabase/functions/<fn>/index.ts.
//
// CROSS-PLATFORM NOTE (Windows/PowerShell): `deno info` emits Windows `\` paths in
// `modules[].local` but forward-slash `file://` URLs in `modules[].specifier`. We
// union on `specifier` (always forward-slash) and NEVER on `local`.
//
// WARM-CACHE CAVEAT: the FIRST `deno info` on a cold machine may fetch remote deps
// (e.g. https://deno.land/std@...) into the Deno cache. That network step is fine for
// a one-time inventory (audit decision D-02 allows online lookups). Re-runs are fast.
//
// Exit codes: 0 on a clean run (a non-empty dead-candidate list is a finding, not an
// error). Non-zero only on an internal/tooling error (e.g. no entrypoints found, or
// `deno` missing).

import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const functionsDir = path.join(repoRoot, 'supabase', 'functions');
const sharedDir = path.join(functionsDir, '_shared');

// A specifier (forward-slash URL) is a _shared module if its path contains this.
const SHARED_URL_MARKER = '/supabase/functions/_shared/';

/**
 * Resolve the `deno` launcher for child_process. Cross-platform launch is the one
 * real gotcha here (RESEARCH Pitfall 6):
 *  - On Windows `deno` is frequently an npm-global `.cmd`/`.ps1` shim, not a bare
 *    `deno.exe` on PATH. Node 22 (post CVE-2024-27980) REFUSES to execFileSync a
 *    `.cmd`/`.bat` without a shell → throws EINVAL; and execFileSync of a bare
 *    `deno` name when only a `.cmd` exists → ENOENT.
 *  - Fix: prefer a real `deno.exe` if one is on PATH (run via execFileSync, no
 *    shell, no quoting issues). Otherwise fall back to running the resolved `.cmd`
 *    THROUGH the shell (shell:true), which lets cmd.exe resolve+run the shim. With
 *    shell:true we must quote any arg that can contain spaces (the entrypoint path).
 * Returns: { cmd, useShell }.
 */
function resolveDeno() {
  const isWin = process.platform === 'win32';
  const pathDirs = (process.env.PATH || '').split(delimiter).filter(Boolean);
  const find = (name) => {
    for (const dir of pathDirs) {
      const candidate = path.join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
    return null;
  };
  if (!isWin) return { cmd: 'deno', useShell: false };
  const exe = find('deno.exe');
  if (exe) return { cmd: exe, useShell: false };
  const shim = find('deno.cmd') || find('deno.bat');
  if (shim) return { cmd: shim, useShell: true };
  // Last resort: let the shell resolve `deno` from PATH (PATHEXT picks the shim).
  return { cmd: 'deno', useShell: true };
}

const DENO = resolveDeno();

/** Run `deno info --json <entrypoint>` and return raw stdout (throws on failure). */
function runDenoInfo(entrypoint) {
  // Pass a repo-relative, forward-slash path (cwd=repoRoot). Backslashes in an
  // absolute Windows path get mangled by cmd.exe under shell:true; a relative
  // forward-slash path is safe on every platform.
  const rel = path.relative(repoRoot, entrypoint).split(path.sep).join('/');
  // `--no-lock`: this is a READ-ONLY audit — never let `deno info` reconcile/mutate
  // the repo's deno.lock (that would be an out-of-scope, non-zero-functional-change
  // side effect on every run).
  if (DENO.useShell) {
    // shell:true joins args with spaces → quote the path so spaces survive.
    const cmdline = `"${DENO.cmd}" info --json --no-lock "${rel}"`;
    return execFileSync(cmdline, {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });
  }
  return execFileSync(DENO.cmd, ['info', '--json', '--no-lock', rel], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** List immediate child directories of a dir (absolute paths). */
function listDirs(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(dir, e.name));
}

/** Recursively collect *.ts files under a dir, excluding tests and __tests__/. */
function collectSharedTsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      out.push(...collectSharedTsFiles(full));
    } else if (entry.isFile()) {
      if (!entry.name.endsWith('.ts')) continue;
      if (entry.name.endsWith('.test.ts')) continue;
      out.push(full);
    }
  }
  return out;
}

/**
 * Convert a forward-slash `specifier` URL or an absolute local path to a
 * repo-relative, forward-slash key so the union and the file list compare equal
 * across OSes.
 */
function toSharedKey(spec) {
  const idx = spec.indexOf(SHARED_URL_MARKER);
  if (idx === -1) return null;
  // Everything after ".../_shared/" → "<rel>" under _shared.
  return spec.slice(idx + SHARED_URL_MARKER.length);
}

function localToSharedKey(absPath) {
  const rel = path.relative(sharedDir, absPath).split(path.sep).join('/');
  return rel;
}

function main() {
  // 1. Entrypoints = every supabase/functions/*/index.ts.
  const entrypoints = listDirs(functionsDir)
    .filter((d) => path.basename(d) !== '_shared')
    .map((d) => path.join(d, 'index.ts'))
    .filter((f) => {
      try {
        return statSync(f).isFile();
      } catch {
        return false;
      }
    });

  if (entrypoints.length === 0) {
    console.error('[deno-reachability] No supabase/functions/*/index.ts entrypoints found.');
    process.exit(1);
  }

  console.log(`[deno-reachability] Entrypoints: ${entrypoints.length}`);
  console.log(`[deno-reachability] Using deno: ${DENO.cmd}${DENO.useShell ? ' (via shell)' : ''}`);
  console.log('[deno-reachability] Building deno info --json graph union (first run may fetch remote deps)...');

  // 2. Union the reachable _shared modules across all entrypoint graphs.
  const reachable = new Set();
  const failed = [];
  for (const ep of entrypoints) {
    let raw;
    try {
      raw = runDenoInfo(ep);
    } catch (err) {
      failed.push({ ep: path.relative(repoRoot, ep).split(path.sep).join('/'), msg: String(err && err.message ? err.message : err) });
      continue;
    }
    let graph;
    try {
      graph = JSON.parse(raw);
    } catch {
      failed.push({ ep: path.relative(repoRoot, ep).split(path.sep).join('/'), msg: 'deno info JSON parse failed' });
      continue;
    }
    for (const m of graph.modules || []) {
      const spec = m.specifier;
      if (typeof spec !== 'string') continue;
      const key = toSharedKey(spec);
      if (key) reachable.add(key);
    }
  }

  // 3. All _shared *.ts files (minus tests / __tests__).
  const allShared = collectSharedTsFiles(sharedDir).map(localToSharedKey);

  // 4. dead_candidates = all_shared − reachable_union.
  const dead = allShared.filter((k) => !reachable.has(k)).sort();

  // 5. Report.
  console.log('');
  console.log('──────── Deno reachability (CLEAN-01) ────────');
  console.log(`Reachable _shared modules (in union): ${reachable.size}`);
  console.log(`Total _shared *.ts files (excl. tests): ${allShared.length}`);
  console.log(`Dead-code CANDIDATES (not in any entrypoint graph): ${dead.length}`);
  if (dead.length > 0) {
    for (const k of dead) console.log(`  - supabase/functions/_shared/${k}`);
    console.log('');
    console.log('NOTE: candidates are NOT verdicts. Each MUST pass the KEEP-LIST gate');
    console.log('(.planning/audit/KEEP-LIST.md) and the multi-signal bar before any "safe".');
  } else {
    console.log('  (none — every _shared module is reachable from some entrypoint)');
  }

  if (failed.length > 0) {
    console.log('');
    console.log(`[deno-reachability] WARNING: ${failed.length} entrypoint(s) could not be analyzed:`);
    for (const f of failed) console.log(`  ! ${f.ep}: ${f.msg}`);
  }

  // Clean run → exit 0 even when dead candidates exist (they are findings).
  process.exit(0);
}

main();
