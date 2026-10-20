#!/usr/bin/env node
/**
 * Run a command with the local preview/test env loaded (Phase 09 - 09-09).
 *
 * Usage:  node scripts/with-preview-env.mjs <cwd> <command> [...args]
 * Example: node scripts/with-preview-env.mjs supabase/functions \
 *            cross-env DENO_TEST_SUPABASE_REMOTE=1 deno task test:remote
 *
 * WHY THIS EXISTS
 * ---------------
 * 09-09 folds the remote DATABASE lane (D-06) into the BLOCKING `verify:baseline` gate. That
 * lane needs the PREVIEW project's URL + service-role key. Those values live in the
 * gitignored `.env.test.local` on a developer host and in GitHub Actions secrets in CI --
 * but nothing was LOADING `.env.test.local` for a Deno process. `deno --env-file` is not an
 * option: it hard-fails (exit 9) when the file is absent, which is exactly the CI case.
 *
 * Without this shim the new gate would be RED on every operator machine, and an always-red
 * gate is a BYPASSED gate -- operators reach for `-SkipVerify` and the whole chain stops
 * meaning anything. So the shim exists to make the gate PASSABLE, never to make it weaker:
 * it injects nothing but env names, and it propagates the child's exit code byte-for-byte.
 *
 * CONTRACT
 * --------
 * 1. Existing process env ALWAYS wins. CI sets these from `secrets.*` at the job level, so a
 *    stray local file can never shadow a CI-provided value.
 * 2. A missing `.env.test.local` is NOT an error (the CI case) -- the command still runs and
 *    the lane's own fail-loud preflight decides whether the resulting config is valid.
 * 3. No value is ever printed. Only names, and only on the debug line below.
 * 4. The child's exit code is the exit code. No swallowing, no remapping to 0.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [cwdArg, ...command] = process.argv.slice(2);

if (!cwdArg || command.length === 0) {
  console.error('[with-preview-env] usage: node scripts/with-preview-env.mjs <cwd> <command> [...args]');
  process.exit(2);
}

/** Minimal KEY=VALUE parse. Never logs a value. */
function parseEnvFile(file) {
  const parsed = {};
  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

const envFile = path.join(repoRoot, '.env.test.local');
const injected = [];

if (existsSync(envFile)) {
  for (const [key, value] of Object.entries(parseEnvFile(envFile))) {
    // Existing env ALWAYS wins (contract 1) -- CI's secrets are never shadowed by a local file.
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = value;
      injected.push(key);
    }
  }
  console.log(`[with-preview-env] loaded ${injected.length} name(s) from .env.test.local: ${injected.join(', ')}`);
} else {
  console.log('[with-preview-env] no .env.test.local (expected in CI) - using the ambient environment.');
}

const child = spawn(command[0], command.slice(1), {
  cwd: path.resolve(repoRoot, cwdArg),
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

// Contract 4: the child's exit code IS the exit code. A signal-killed child is a FAILURE (1),
// never a silent 0 -- this shim sits inside a blocking gate and must not be able to fake green.
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
child.on('error', (error) => {
  console.error(`[with-preview-env] failed to spawn '${command[0]}': ${error.message}`);
  process.exit(1);
});
