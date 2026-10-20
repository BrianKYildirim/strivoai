#!/usr/bin/env node
/**
 * Preflight — verify the environment is safe & complete BEFORE any stage runs.
 * Prints a checklist and exits non-zero on any failure. Never sends traffic.
 *
 * Checks: target resolves & is non-prod, CONFIRM_TARGET matches, required env
 * present, fixtures generated, k6 available, and (warn) merit/AI mode caveats.
 *
 * Usage:
 *   TARGET_ENV=preview CONFIRM_TARGET=cimjltzovkahkqecpwgi SUPABASE_URL=... \
 *   SUPABASE_ANON_KEY=... LOADTEST_PASSWORD=... node tools/preflight.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveEnv } from '../config/environments.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const results = [];
function ok(name) {
  results.push({ name, ok: true });
}
function fail(name, detail) {
  results.push({ name, ok: false, detail });
}
function warn(name, detail) {
  results.push({ name, ok: true, warn: true, detail });
}

// 1) Target resolves and is not production.
let resolved;
try {
  resolved = resolveEnv(process.env);
  ok(`target resolves: ${resolved.env} (${resolved.ref})`);
} catch (e) {
  fail('target resolves', e.message);
}

// 2) CONFIRM_TARGET matches.
if (resolved) {
  if (process.env.CONFIRM_TARGET === resolved.ref) ok('CONFIRM_TARGET matches resolved ref');
  else fail('CONFIRM_TARGET matches resolved ref', `set CONFIRM_TARGET="${resolved.ref}"`);
}

// 3) Required env present.
for (const v of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'LOADTEST_PASSWORD']) {
  if (process.env[v]) ok(`env ${v} present`);
  else fail(`env ${v} present`, `${v} is required`);
}

// 4) Fixtures generated.
const usersFile = path.join(ROOT, 'fixtures', 'synthetic-users.json');
const pdfFile = path.join(ROOT, 'fixtures', 'resumes', 'synthetic-resume.pdf');
const txtFile = path.join(ROOT, 'fixtures', 'resumes', 'synthetic-resume.txt');
for (const [label, f] of [['users pool', usersFile], ['resume pdf', pdfFile], ['resume text', txtFile]]) {
  if (fs.existsSync(f)) ok(`fixture ${label} exists`);
  else fail(`fixture ${label} exists`, `run: node fixtures/generate-fixtures.mjs --count 200`);
}

// 5) k6 available.
try {
  const v = execSync('k6 version', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  ok(`k6 available: ${v.split('\n')[0]}`);
} catch {
  fail('k6 available', 'install k6: https://k6.io/docs/get-started/installation/');
}

// 6) Caveat warnings.
if (resolved && resolved.env === 'preview') {
  warn('merit ledger', 'Preview has MERIT_SYSTEM_ENABLED=false — workload #6 charge assertions are inert here.');
  warn('AI mode', 'Preview runs AI_TEST_MODE fixtures — real-provider latency/cost are NOT measurable here.');
}

// ── Report ────────────────────────────────────────────────────────────────────
let failed = 0;
console.log('\nPreflight checklist:\n');
for (const r of results) {
  const mark = r.ok ? (r.warn ? 'WARN' : ' OK ') : 'FAIL';
  console.log(`  [${mark}] ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  if (!r.ok) failed++;
}
console.log('');
if (failed > 0) {
  console.error(`Preflight FAILED (${failed} check(s)). Fix the above before running any stage.`);
  process.exit(1);
}
console.log('Preflight PASSED. You may run a SINGLE stage via tools/run-stage.mjs (human-gated).');
