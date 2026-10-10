#!/usr/bin/env node
/**
 * Generate synthetic load-test fixtures — NO real student data, NO secrets.
 *
 * Produces:
 *   - fixtures/synthetic-users.json    (emails-only pool; NOT secret)
 *   - fixtures/resumes/synthetic-resume.pdf  (valid text-bearing PDF, no PII)
 *   - fixtures/resumes/synthetic-resume.txt  (extracted text mirror)
 *
 * And (with --provision) CREATES the synthetic auth users on a NON-PRODUCTION
 * target via the service-role admin API, all sharing one password supplied via
 * env (LOADTEST_PASSWORD) so the password is never written to disk.
 *
 * Usage:
 *   node fixtures/generate-fixtures.mjs --count 200            # files only
 *   node fixtures/generate-fixtures.mjs --count 200 --provision
 *
 * Provision requires (env; never hardcoded):
 *   SUPABASE_URL                 non-prod project URL (production ref is REFUSED)
 *   SUPABASE_SERVICE_ROLE_KEY    service role key (used in-memory only, never logged)
 *   LOADTEST_PASSWORD            shared password for the synthetic pool
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESUME_DIR = path.join(__dirname, 'resumes');

// Production project ref is hard-blocked for provisioning (mirror of config/environments.js).
const PRODUCTION_REF = 'zjpjapgraoxdukdvpjes';

function parseArgs() {
  const args = process.argv.slice(2);
  const cfg = { count: 100, provision: false, domain: 'loadtest.strivio.invalid' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count') cfg.count = parseInt(args[++i], 10);
    else if (args[i] === '--provision') cfg.provision = true;
    else if (args[i] === '--domain') cfg.domain = args[++i];
  }
  if (!Number.isInteger(cfg.count) || cfg.count < 1) throw new Error('--count must be a positive integer');
  return cfg;
}

// ── Synthetic PDF (dependency-free, mirrors scripts/make-e2e-fixture-pdf.cjs) ──
const RESUME_LINES = [
  'Synthetic Loadtest Candidate',
  'Senior Software Engineer',
  'Portland, OR',
  'candidate@loadtest.strivio.invalid  |  github.com/synthetic-loadtest',
  '',
  'PROFESSIONAL SUMMARY',
  'Senior software engineer with eight years of experience building reliable,',
  'scalable web platforms and leading cross-functional engineering teams.',
  '',
  'EXPERIENCE',
  'Synthetic Systems Inc., Portland, OR',
  'Senior Software Engineer (2020 - 2024)',
  '- Built and shipped scalable web services in TypeScript, Node, and Postgres.',
  '- Led a team of four engineers and improved deployment reliability by forty percent.',
  '- Reduced average API latency from ninety to forty milliseconds through caching.',
  '- Mentored junior engineers and established the team code-review standards.',
  '',
  'Placeholder Labs, Remote',
  'Software Engineer (2016 - 2020)',
  '- Designed and delivered customer-facing React features used by many users.',
  '- Automated the continuous integration pipeline, cutting release time in half.',
  '',
  'EDUCATION',
  'Bachelor of Science in Computer Science, State University, 2016',
  '',
  'SKILLS',
  'TypeScript, JavaScript, React, Node, Postgres, Supabase, Playwright, CI/CD, AWS.',
];

function escapePdfText(s) {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildPdf(lines) {
  let y = 760;
  let textOps = 'BT\n/F1 11 Tf\n';
  for (const line of lines) {
    textOps += `1 0 0 1 56 ${y} Tm (${escapePdfText(line)}) Tj\n`;
    y -= 22;
  }
  textOps += 'ET';
  const stream = textOps;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((off) => {
    pdf += String(off).padStart(10, '0') + ' 00000 n \n';
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

function writeResumeFixtures() {
  fs.mkdirSync(RESUME_DIR, { recursive: true });
  const pdf = buildPdf(RESUME_LINES);
  fs.writeFileSync(path.join(RESUME_DIR, 'synthetic-resume.pdf'), pdf);
  fs.writeFileSync(path.join(RESUME_DIR, 'synthetic-resume.txt'), RESUME_LINES.join('\n'), 'utf8');
  console.log(`Wrote synthetic-resume.pdf (${pdf.length} bytes) + synthetic-resume.txt`);
}

function buildUserPool(count, domain) {
  const users = [];
  for (let i = 0; i < count; i++) {
    // Deterministic, obviously-synthetic emails. `.invalid` TLD can never route.
    users.push({ email: `loadtest+${String(i).padStart(5, '0')}@${domain}` });
  }
  return users;
}

async function provision(users) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const password = process.env.LOADTEST_PASSWORD;
  if (!url || !serviceKey || !password) {
    throw new Error('provision requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LOADTEST_PASSWORD env vars.');
  }
  if (url.includes(PRODUCTION_REF)) {
    throw new Error(`REFUSING to provision against production (${PRODUCTION_REF}). Use a non-prod target.`);
  }
  // Lazy import so the files-only path needs no dependency.
  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  let created = 0;
  let existed = 0;
  for (const u of users) {
    const { error } = await admin.auth.admin.createUser({
      email: u.email,
      password,
      email_confirm: true,
      user_metadata: { synthetic: true, purpose: 'load-test' },
    });
    if (error) {
      if (/already/i.test(error.message)) existed++;
      else console.warn(`  createUser failed for ${u.email}: ${error.message}`);
    } else {
      created++;
    }
  }
  console.log(`Provisioned synthetic users: ${created} created, ${existed} already existed.`);
  console.log('NOTE: password used from LOADTEST_PASSWORD env — not written to any file.');
}

async function main() {
  const cfg = parseArgs();
  writeResumeFixtures();

  const users = buildUserPool(cfg.count, cfg.domain);
  const outPath = path.join(__dirname, 'synthetic-users.json');
  fs.writeFileSync(outPath, JSON.stringify(users, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${users.length} synthetic user emails -> ${path.relative(process.cwd(), outPath)} (emails only, no secrets).`);

  if (cfg.provision) await provision(users);
  else console.log('Skipping provisioning (pass --provision to create the users on a non-prod target).');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
