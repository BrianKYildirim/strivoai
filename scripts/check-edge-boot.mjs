#!/usr/bin/env node
/**
 * Edge-function BOOT gate.
 *
 * Why this exists (quick task 260713-hrd, second pass):
 * `analyze-career` shipped to Preview with a duplicate `const` in one scope. Deno rejects
 * that at MODULE LOAD, so the function returned `503 / sb-error-code: BOOT_ERROR` on every
 * request — including OPTIONS. Career Compass and onboarding were both dead. The whole
 * `verify:baseline` suite stayed GREEN through it, because the edge tests are source-PROBE
 * tests: they read `index.ts` as TEXT and assert on substrings. Nothing in the pipeline ever
 * PARSED the module, so nothing could see a SyntaxError.
 *
 * Cheaper tools were tried first and all three MISS this class of bug:
 *   - `deno lint --rules-include=no-redeclare` → exit 0 on the broken file
 *   - `deno info` (module graph)               → exit 0 on the broken file
 *   - `deno check`                             → catches it, but is ALREADY red on unrelated
 *                                                pre-existing type errors, so it cannot gate
 *
 * The only thing that reliably catches a module-load failure is loading the module — which is
 * exactly what the edge runtime does on deploy. So that is what this does. As a bonus it also
 * catches module-level THROWS (e.g. the `CAREER_CALL_CONFIGS` vs `getMaxOutput` boot invariant
 * at the top of analyze-career), which is the other way this function can fail to start.
 *
 * PASS/FAIL contract:
 *   FAIL  → the process printed `error: Uncaught ...` (SyntaxError, TDZ, module-level throw,
 *           unresolvable import). This is precisely a BOOT_ERROR on Supabase.
 *   PASS  → module evaluated. We then kill it; we do NOT care whether it serves traffic.
 *           `AddrInUse` is a PASS: it is raised at listen() time, i.e. AFTER module evaluation
 *           succeeded, and only happens because we boot several functions concurrently.
 */
import { readdirSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FUNCTIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'functions');
const CONCURRENCY = 6;
const BOOT_WINDOW_MS = 20_000;

// Stub values only. Never real secrets: this gate proves the module LOADS, not that it works.
const STUB_ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'stub',
  SUPABASE_ANON_KEY: 'stub',
  ANTHROPIC_API_KEY: 'stub',
  INTERNAL_JOB_SECRET: 'stub',
  RESEND_API_KEY: 'stub',
  APP_URL: 'https://example.com',
  STRIPE_SECRET_KEY: 'stub',
  STRIPE_WEBHOOK_SECRET: 'stub',
  // Deno colorizes stderr even when it is a pipe, which would hide `error: Uncaught` behind
  // ANSI escapes. We belt-and-brace it: NO_COLOR here AND an escape-stripper below.
  NO_COLOR: '1',
};

const ANSI = /\x1b\[[0-9;]*m/g;

function bootOne(slug) {
  return new Promise((resolve) => {
    const entry = join(FUNCTIONS_DIR, slug, 'index.ts');
    const child = spawn('deno', ['run', '-A', '--no-lock', '--quiet', entry], {
      cwd: FUNCTIONS_DIR,
      env: { ...process.env, ...STUB_ENV },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.stdout.on('data', () => {});

    const timer = setTimeout(() => child.kill('SIGKILL'), BOOT_WINDOW_MS);

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ slug, ok: false, detail: `could not spawn deno: ${err.message}` });
    });

    child.on('close', () => {
      clearTimeout(timer);
      const clean = stderr.replace(ANSI, '');
      const uncaught = clean.match(/error: Uncaught .*/);
      // listen() failures happen AFTER the module evaluated — not a boot error.
      const isPortClash = /AddrInUse|Address already in use/i.test(clean);
      if (uncaught && !isPortClash) {
        resolve({ slug, ok: false, detail: uncaught[0].trim() });
      } else {
        resolve({ slug, ok: true });
      }
    });
  });
}

const slugs = readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.'))
  .map((e) => e.name)
  .filter((slug) => existsSync(join(FUNCTIONS_DIR, slug, 'index.ts')))
  .sort();

console.log(`[edge-boot] loading ${slugs.length} edge functions the way the runtime does...`);

const results = [];
const queue = [...slugs];
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const slug = queue.shift();
      const r = await bootOne(slug);
      results.push(r);
      if (!r.ok) console.log(`  BOOT_ERROR  ${r.slug}`);
    }
  }),
);

const failed = results.filter((r) => !r.ok).sort((a, b) => a.slug.localeCompare(b.slug));

if (failed.length === 0) {
  console.log(`[edge-boot] PASS — all ${results.length} functions evaluated cleanly.`);
  process.exit(0);
}

console.error(`\n[edge-boot] FAIL — ${failed.length} function(s) would return 503 BOOT_ERROR on deploy:\n`);
for (const f of failed) console.error(`  ${f.slug}\n    ${f.detail}\n`);
process.exit(1);
