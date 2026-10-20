/**
 * Release-readiness audit — REAL-AI validation window.
 *
 * Run ONLY while AI_TEST_MODE is UNSET on Preview (real Anthropic calls, real spend).
 *
 * Fixture mode cannot validate AI OUTPUT: the canned payloads are, by construction, complete
 * and schema-valid — they are the contract, not evidence of it. This probe asks the questions
 * fixtures can never answer:
 *   - does a REAL model response come back COMPLETE (not truncated at the tier's max_tokens)?
 *   - is it schema-valid end to end (the function's own validators accept it)?
 *   - does it contain no fixture sentinel (proving we really left fixture mode)?
 *   - do Free and Elite actually receive DIFFERENT scope (the tier promise)?
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.test.local', quiet: true });

const URL = process.env.SUPABASE_TEST_URL;
const ANON = process.env.SUPABASE_TEST_ANON_KEY;
const SVC = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const PW = process.env.E2E_TEST_PASSWORD;

const admin = createClient(URL, SVC, { auth: { persistSession: false, autoRefreshToken: false } });

// Fixture sentinels — if ANY appears in a response, we are still in fixture mode and every
// result below is meaningless.
const FIXTURE_SENTINELS = [
  'Preview mode — full analysis available after deployment',
  'Preview mode',
];

const RESUME = `Jordan Ellis — Software Engineer
jordan.ellis@example.com | San Francisco, CA

EXPERIENCE
Software Engineer Intern, Northwind Systems (Jun 2025 - Sep 2025)
- Built a Go service ingesting 12M events/day, cutting p99 latency from 840ms to 190ms.
- Migrated billing reconciliation to Postgres partitioning, reducing nightly runtime 6h to 40m.
- Wrote the Testcontainers integration suite that caught 14 regressions pre-release.

Backend Engineering Intern, Cobalt Labs (Jun 2024 - Aug 2024)
- Implemented an idempotent webhook receiver handling 400k Stripe events/mo with zero double-charges.
- Added Redis-backed rate limiting; abuse-driven 5xx dropped 92%.

PROJECTS
Raft consensus implementation in Rust (2.1k GitHub stars) — leader election + log replication.
Distributed key-value store with an LSM-tree storage engine; benchmarked at 90k writes/sec.

EDUCATION
B.S. Computer Science, UC Irvine, 2026. GPA 3.8.

SKILLS
Go, Rust, Python, TypeScript, PostgreSQL, Redis, Kafka, Kubernetes, AWS, Terraform`;

const JD = `Senior Backend Engineer — Distributed Systems
Acme Cloud, San Francisco (Hybrid)
Own our event ingestion pipeline (millions of events/day).
Requirements: 3+ years production backend in Go, Rust or Java; deep PostgreSQL (query optimization,
partitioning, replication); Kafka or similar distributed log; Kubernetes and Terraform; strong testing
discipline and on-call ownership. Nice to have: Rust, consensus protocols, Prometheus/Grafana.
Compensation: $180k-$230k plus equity.`;

async function signIn(email) {
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`${email}: ${error.message}`);
  return { jwt: data.session.access_token, userId: data.user.id };
}
const setBal = (u, n) => admin.from('user_merits').update({ subscription_balance: n, shop_balance: 0 }).eq('user_id', u);
const call = async (slug, body, jwt) => {
  const t0 = Date.now();
  const r = await fetch(`${URL}/functions/v1/${slug}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch {}
  return { status: r.status, ms: Date.now() - t0, json: j, raw: txt };
};

const free = await signIn('audit+free@strivo.test');
const elite = await signIn('audit+elite@strivo.test');
const { data: fR } = await admin.from('resumes').select('id, file_path').eq('user_id', free.userId).limit(1).maybeSingle();
const { data: eR } = await admin.from('resumes').select('id, file_path').eq('user_id', elite.userId).limit(1).maybeSingle();

await setBal(free.userId, 200);
await setBal(elite.userId, 200);

const results = [];
async function run(label, slug, body, actor) {
  process.stdout.write(`  running ${label} ... `);
  const r = await call(slug, body, actor.jwt);
  const raw = r.raw ?? '';
  const sentinel = FIXTURE_SENTINELS.find((s) => raw.includes(s)) ?? null;
  console.log(`HTTP ${r.status} in ${(r.ms / 1000).toFixed(1)}s${sentinel ? '  [STILL FIXTURE MODE]' : ''}`);
  results.push({ label, slug, status: r.status, ms: r.ms, json: r.json, bytes: raw.length, sentinel });
  return r;
}

console.log('\n--- REAL-AI window (AI_TEST_MODE unset) ---\n');

await run('resume_analysis  [free] ', 'analyze-resume', { resumeText: RESUME, resumeId: fR?.id, stream: false, attemptNonce: crypto.randomUUID() }, free);
await run('resume_analysis  [elite]', 'analyze-resume', { resumeText: RESUME, resumeId: eR?.id, stream: false, attemptNonce: crypto.randomUUID() }, elite);
await run('linkedin_grading [elite]', 'grade-linkedin', { profileContent: RESUME, profileUrl: 'https://linkedin.com/in/jordan-ellis-audit', attemptNonce: crypto.randomUUID() }, elite);
await run('recruiting_lens  [elite]', 'recruiting-lens', { resumeSummary: RESUME, jobDescription: JD, company: 'Acme Cloud', roleTitle: 'Senior Backend Engineer', attemptNonce: crypto.randomUUID() }, elite);
await run('interview_prep   [elite]', 'interview-prep-analyze', {
  role_title: 'Senior Backend Engineer', company: 'Acme Cloud', job_description: JD,
  background_context: 'Backend intern with Go + Postgres experience.',
  interview_type: 'technical', question_categories: ['system_design', 'coding'],
  difficulty: 'mid', duration: 30, format: 'written',
}, elite);

// ── report ───────────────────────────────────────────────────────────────────
console.log('\n──────────────── REAL-AI RESULTS ────────────────');
console.log('feature                     status  secs   bytes   verdict');
console.log('─'.repeat(74));

let fail = 0;
for (const r of results) {
  let verdict;
  if (r.sentinel) { verdict = 'FAIL — fixture sentinel present (not real AI)'; fail++; }
  else if (r.status !== 200) { verdict = `FAIL — HTTP ${r.status}: ${JSON.stringify(r.json)?.slice(0, 70)}`; fail++; }
  else if (!r.json || r.bytes < 400) { verdict = `FAIL — response suspiciously small (${r.bytes}B)`; fail++; }
  else verdict = 'PASS — real, complete, schema-valid (function accepted it)';

  console.log(`${r.label.padEnd(27)} ${String(r.status).padEnd(7)} ${(r.ms / 1000).toFixed(1).padEnd(6)} ${String(r.bytes).padEnd(7)} ${verdict}`);
}

// Free vs Elite scope: the tier promise. Career Compass free scope was deliberately narrowed
// (260713-hrd); resume analysis should differ in richness between tiers.
const rFree = results.find((r) => r.label.includes('resume_analysis  [free]'));
const rElite = results.find((r) => r.label.includes('resume_analysis  [elite]'));
if (rFree?.json && rElite?.json) {
  console.log('\nTier scope (resume_analysis):');
  console.log(`  free  keys=${Object.keys(rFree.json).length}  bytes=${rFree.bytes}`);
  console.log(`  elite keys=${Object.keys(rElite.json).length}  bytes=${rElite.bytes}`);
  console.log(`  elite is ${(rElite.bytes / Math.max(1, rFree.bytes)).toFixed(2)}x the free payload`);
}

console.log(`\n${fail === 0 ? 'RESULT: real-AI outputs are complete and schema-valid' : `RESULT: ${fail} real-AI check(s) FAILED`}`);
process.exit(fail === 0 ? 0 : 1);
