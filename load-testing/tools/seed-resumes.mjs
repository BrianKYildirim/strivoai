#!/usr/bin/env node
/**
 * Seed one resumes row per synthetic user via SERVICE ROLE, mirroring how the
 * product creates resumes (server-side upload edge function) — the client
 * (authenticated) does NOT hold INSERT on `resumes` under least-privilege grants.
 * Writes fixtures/resume-ids.json ({ "<email>": "<resumeId>" }) for scenario 10.
 *
 * Refuses a production URL. Env (values never printed): SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY. Optional: USERS_FILE, OUT_FILE, RESUME_TEXT_FILE.
 *
 * Usage: node load-testing/tools/seed-resumes.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const PRODUCTION_REF = 'zjpjapgraoxdukdvpjes';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
if (url.includes(PRODUCTION_REF)) throw new Error(`REFUSING: production URL (${PRODUCTION_REF}).`);

const usersFile = process.env.USERS_FILE || path.join(ROOT, 'fixtures', 'synthetic-users.json');
const outFile = process.env.OUT_FILE || path.join(ROOT, 'fixtures', 'resume-ids.json');
const resumeTextFile = process.env.RESUME_TEXT_FILE || path.join(ROOT, 'fixtures', 'resumes', 'synthetic-resume.txt');
const resumeText = fs.existsSync(resumeTextFile) ? fs.readFileSync(resumeTextFile, 'utf8') : 'Synthetic resume text for load testing, well over fifty characters long.';

const pool = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
const wantedEmails = new Set(pool.map((u) => u.email));

const admin = createClient(url, key, { auth: { persistSession: false } });

// Build email -> auth user id map (paginate all synthetic users).
const emailToId = new Map();
for (let page = 1; ; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw new Error(`listUsers: ${error.message}`);
  for (const u of data.users) if (u.email && wantedEmails.has(u.email)) emailToId.set(u.email, u.id);
  if (data.users.length < 200) break;
}

const map = {};
let created = 0;
let missing = 0;
for (const u of pool) {
  const userId = emailToId.get(u.email);
  if (!userId) {
    missing++;
    continue;
  }
  const resumeId = randomUUID();
  const { error } = await admin.from('resumes').insert({
    id: resumeId,
    user_id: userId,
    file_name: 'synthetic-resume.pdf',
    file_url: 'seed://synthetic-resume.pdf',
    file_size: 2274,
    extracted_text: resumeText,
  });
  if (error) {
    console.warn(`  seed failed for ${u.email}: ${error.message}`);
    continue;
  }
  map[u.email] = resumeId;
  created++;
}

fs.writeFileSync(outFile, JSON.stringify(map, null, 2) + '\n', 'utf8');
console.log(`Seeded ${created} resume rows via service role -> ${path.relative(process.cwd(), outFile)}.`);
if (missing) console.log(`(${missing} pool users not provisioned yet — run generate-fixtures.mjs --provision first.)`);
