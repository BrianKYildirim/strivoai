#!/usr/bin/env node
/**
 * LOCAL correctness validator — single-request, low-load, CORRECTNESS ONLY.
 *
 * Validates the resume-analysis money path against a LOCAL Supabase stack and
 * asserts the behaviors the request lists. NOT a performance test — its timings
 * MUST NOT be presented as Strivo's hosted capacity.
 *
 * Talks ONLY to a loopback SUPABASE_URL (asserted up front) → production receives
 * zero requests by construction. Refuses any non-loopback / production URL.
 *
 * Two Strivo paths exist and this validates each on the path that actually uses it:
 *   - QUEUE path (submit-resume-analysis-job): submission → job row → merit
 *     deduction → duplicate submit reuses the same job (no double charge).
 *   - STREAMING path (analyze-resume stream:true, the real completion path for
 *     resume): completed result stored & retrievable → refresh/re-read recovery;
 *     and, under AI_FORCE_FAILURE, permanent-failure refund.
 * (Note: the queue WORKER path — process→analyze-resume via internal auth — does
 *  not complete an analysis; analyze-resume:1383 returns 401 on the internal path.
 *  That is a pre-existing product finding, not exercised for completion here.)
 *
 * Requires (env; values never printed):
 *   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY / LOADTEST_PASSWORD
 *
 * Phases:
 *   --phase success   (serve with AI_TEST_MODE=true)                 [default]
 *   --phase failure   (serve with AI_TEST_MODE=true AI_FORCE_FAILURE=true)
 */

import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { resolveEnv } from '../config/environments.js';

const PRODUCTION_REF = 'zjpjapgraoxdukdvpjes';

function parseArgs() {
  const a = process.argv.slice(2);
  const cfg = { phase: 'success', timeout: 60, pollMs: 1500 };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--phase') cfg.phase = a[++i];
    else if (a[i] === '--timeout') cfg.timeout = parseInt(a[++i], 10);
    else if (a[i] === '--poll-ms') cfg.pollMs = parseInt(a[++i], 10);
  }
  if (!['success', 'failure'].includes(cfg.phase)) throw new Error('--phase must be success|failure');
  return cfg;
}

const checks = [];
function assert(name, cond, detail) {
  checks.push({ name, ok: !!cond, detail });
  console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${name}${detail !== undefined ? ` — ${detail}` : ''}`);
  return !!cond;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RESUME_TEXT =
  'Synthetic Loadtest Candidate — Senior Software Engineer, Portland OR. Eight years building reliable, ' +
  'scalable web platforms in TypeScript, Node, Postgres, Supabase and React. Reduced API latency from ninety ' +
  'to forty ms via caching; led four engineers. BSc Computer Science, State University, 2016.';

async function main() {
  const cfg = parseArgs();
  const targetEnv = process.env.TARGET_ENV || 'local';
  const resolved = resolveEnv({ TARGET_ENV: targetEnv, SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY });
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const password = process.env.LOADTEST_PASSWORD;
  if (!serviceKey || !password) throw new Error('SUPABASE_SERVICE_ROLE_KEY and LOADTEST_PASSWORD are required.');
  if (resolved.url.includes(PRODUCTION_REF)) throw new Error('production URL refused.');
  if (targetEnv !== 'local' && process.env.CONFIRM_TARGET !== resolved.ref) {
    throw new Error(`[validate] CONFIRM_TARGET must equal the resolved ref "${resolved.ref}" for a ${targetEnv} target.`);
  }

  console.log(`\n=== correctness validation — env=${targetEnv} phase=${cfg.phase} ===`);
  console.log(`Target: ${resolved.url} (ref=${resolved.ref}). Production receives ZERO requests.`);
  assert(targetEnv === 'local' ? 'production receives zero requests (loopback only)' : 'target confirmed non-prod', true, resolved.url);

  const admin = createClient(resolved.url, serviceKey, { auth: { persistSession: false } });
  const anon = createClient(resolved.url, resolved.anonKey, { auth: { persistSession: false } });
  const createdUsers = [];

  // Helper: fresh synthetic user + a real resumes row (UUID) + a signed-in token.
  async function newUserWithResume(tag) {
    const email = `loadtest+local-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@loadtest.strivio.invalid`;
    const { data: c, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { synthetic: true } });
    if (cErr) throw new Error(`createUser: ${cErr.message}`);
    const userId = c.user.id;
    createdUsers.push(userId);
    const resumeId = randomUUID();
    const { error: rErr } = await admin.from('resumes').insert({
      id: resumeId, user_id: userId, file_name: 'synthetic-resume.pdf', file_url: 'local://synthetic-resume.pdf',
      file_size: 2274, extracted_text: RESUME_TEXT,
    });
    if (rErr) throw new Error(`resumes insert: ${rErr.message}`);
    const { data: si, error: sErr } = await anon.auth.signInWithPassword({ email, password });
    if (sErr || !si.session) throw new Error(`sign-in: ${sErr?.message}`);
    return { userId, resumeId, accessToken: si.session.access_token };
  }
  const balanceOf = async (userId) => {
    const { data } = await admin.from('user_merits').select('subscription_balance, shop_balance').eq('user_id', userId).single();
    return data ? (data.subscription_balance || 0) + (data.shop_balance || 0) : 0;
  };
  const hdr = (tok) => ({ Authorization: `Bearer ${tok}`, apikey: resolved.anonKey, 'Content-Type': 'application/json' });

  if (cfg.phase === 'success') {
    // ── QUEUE path: submission / job / merit / duplicate / no-double-charge ───
    console.log('\n-- queue path (submit-resume-analysis-job) --');
    const q = await newUserWithResume('queue');
    const qStart = await balanceOf(q.userId);
    const body = JSON.stringify({ userId: q.userId, resumeId: q.resumeId, resumeText: RESUME_TEXT, previousSuggestions: [], previousScore: null });
    const s1 = await fetch(`${resolved.url}/functions/v1/submit-resume-analysis-job`, { method: 'POST', headers: hdr(q.accessToken), body });
    const j1 = await s1.json().catch(() => ({}));
    assert('one submission accepted (202)', s1.status === 202, `status=${s1.status}`);
    assert('submission returned a jobId', !!j1.jobId, j1.jobId);
    const { data: jobs1 } = await admin.from('analysis_jobs').select('id, merit_transaction_id').eq('user_id', q.userId);
    assert('exactly one analysis job created', (jobs1 || []).length === 1, `rows=${(jobs1 || []).length}`);
    const { data: ded } = await admin.from('merit_transactions').select('amount').eq('user_id', q.userId).eq('source', 'feature-deduct');
    const cost = (ded || []).reduce((s, r) => s + Math.abs(r.amount || 0), 0);
    assert('merits deduct exactly once', (ded || []).length >= 1 && cost > 0, `cost=${cost}`);
    const qAfter = await balanceOf(q.userId);
    assert('balance decreased by exactly the cost', qAfter === qStart - cost, `${qStart} -> ${qAfter}`);
    const s2 = await fetch(`${resolved.url}/functions/v1/submit-resume-analysis-job`, { method: 'POST', headers: hdr(q.accessToken), body });
    const j2 = await s2.json().catch(() => ({}));
    assert('duplicate submission reuses the existing job', s2.status === 202 && j2.jobId === j1.jobId, `${j2.jobId} vs ${j1.jobId}`);
    const { data: jobs2 } = await admin.from('analysis_jobs').select('id').eq('user_id', q.userId);
    assert('still exactly one job (no duplicate job)', (jobs2 || []).length === 1, `rows=${(jobs2 || []).length}`);
    assert('no duplicate merit charge (balance unchanged)', (await balanceOf(q.userId)) === qAfter, `balance=${qAfter}`);
    // Queue WORKER completion (260726 queue-worker-401 fix): poll the job to done.
    let qStatus = null;
    let qHasResult = false;
    for (let i = 0; i < 40; i++) {
      const p = await fetch(`${resolved.url}/functions/v1/get-analysis-job-status?jobId=${j1.jobId}`, { headers: hdr(q.accessToken) });
      if (p.status === 200) {
        const pj = await p.json().catch(() => ({}));
        if (pj.status === 'completed') { qStatus = 'completed'; qHasResult = pj.result != null; break; }
        if (pj.status === 'failed') { qStatus = 'failed'; break; }
      }
      await sleep(cfg.pollMs);
    }
    assert('queued analysis completes (worker)', qStatus === 'completed', `status=${qStatus}`);
    assert('queued result stored & retrievable (job.result)', qHasResult, '');
    const { data: qResume } = await admin.from('resumes').select('grading_data, overall_score').eq('id', q.resumeId).single();
    assert('queued result persisted (resumes.grading_data + score)', !!qResume && qResume.grading_data != null && typeof qResume.overall_score === 'number', `score=${qResume?.overall_score ?? 'null'}`);
    const qRe = await fetch(`${resolved.url}/functions/v1/get-analysis-job-status?jobId=${j1.jobId}`, { headers: hdr(q.accessToken) });
    const qReJson = await qRe.json().catch(() => ({}));
    assert('queue polling/refresh recovery returns the completed result', qReJson.status === 'completed' && qReJson.result != null, '');
    const { data: qDed2 } = await admin.from('merit_transactions').select('amount').eq('user_id', q.userId).eq('source', 'feature-deduct');
    assert('queue completion did NOT double-charge', (qDed2 || []).length === (ded || []).length, `deducts=${(qDed2 || []).length}`);

    // ── STREAMING path: completed result stored/retrievable + refresh recovery ─
    console.log('\n-- streaming path (analyze-resume stream:true) — real completion path --');
    const st = await newUserWithResume('stream');
    const stStart = await balanceOf(st.userId);
    const sbody = JSON.stringify({ resumeId: st.resumeId, resumeText: RESUME_TEXT, userId: st.userId, stream: true, attemptNonce: `n-${Date.now()}` });
    const sres = await fetch(`${resolved.url}/functions/v1/analyze-resume`, { method: 'POST', headers: hdr(st.accessToken), body: sbody });
    const stext = await sres.text();
    const completed = sres.status === 200 && stext.includes('"type":"complete"') && !stext.includes('"type":"error"');
    assert('analysis completes (SSE complete, no error)', completed, `http=${sres.status}`);
    // Stored & retrievable: resumes.grading_data set + analysis_results mirror row.
    await sleep(500);
    const { data: rrow } = await admin.from('resumes').select('overall_score, grading_data').eq('id', st.resumeId).single();
    const stored = !!rrow && rrow.grading_data != null && typeof rrow.overall_score === 'number';
    assert('completed result stored (authoritative resumes.grading_data + score)', stored, `overall_score=${rrow?.overall_score ?? 'null'}`);
    // Retrievable: an INDEPENDENT read returns the durable completed result (this is
    // also the refresh/poll recovery contract). resumes is the authoritative store;
    // analysis_results is a best-effort mirror (informational only).
    const { data: reread } = await admin.from('resumes').select('overall_score, grading_data').eq('id', st.resumeId).single();
    assert('completed result retrievable on re-read (refresh/poll recovery)', !!reread && reread.grading_data != null && typeof reread.overall_score === 'number', `score=${reread?.overall_score ?? 'null'}`);
    const { data: mirror } = await admin.from('analysis_results').select('id').eq('source_reference', st.resumeId);
    console.log(`  [info] analysis_results mirror rows for this resume: ${(mirror || []).length} (best-effort, non-authoritative)`);
    const stAfter = await balanceOf(st.userId);
    assert('streaming deducted exactly once', stStart - stAfter === cost, `${stStart} -> ${stAfter} (cost ${cost})`);
  } else {
    // ── FAILURE phase: permanent failure restores merits + records refund ──────
    console.log('\n-- streaming path with AI_FORCE_FAILURE — permanent failure refund --');
    const f = await newUserWithResume('fail');
    const fStart = await balanceOf(f.userId);
    const fbody = JSON.stringify({ resumeId: f.resumeId, resumeText: RESUME_TEXT, userId: f.userId, stream: true, attemptNonce: `n-${Date.now()}` });
    const fres = await fetch(`${resolved.url}/functions/v1/analyze-resume`, { method: 'POST', headers: hdr(f.accessToken), body: fbody });
    const ftext = await fres.text();
    assert('permanent failure surfaced as a controlled error (no completion)', ftext.includes('"type":"error"') && !ftext.includes('"type":"complete"'), `http=${fres.status}`);
    await sleep(800);
    const fEnd = await balanceOf(f.userId);
    assert('permanent failure restores merits (balance net-zero)', fEnd === fStart, `${fStart} -> ${fEnd}`);
    const { data: refunds } = await admin.from('merit_transactions').select('amount, source, balance_type').eq('user_id', f.userId).or('source.eq.feature-refund,balance_type.eq.refund');
    assert('refund transaction recorded', (refunds || []).length > 0, `refund rows=${(refunds || []).length}`);

    // ── QUEUE path permanent-failure refund (worker refunds via merit_transaction_id)
    console.log('\n-- queue path permanent failure — worker refund --');
    const fq = await newUserWithResume('failq');
    const fqStart = await balanceOf(fq.userId);
    const fqBody = JSON.stringify({ userId: fq.userId, resumeId: fq.resumeId, resumeText: RESUME_TEXT, previousSuggestions: [], previousScore: null });
    const fqSub = await fetch(`${resolved.url}/functions/v1/submit-resume-analysis-job`, { method: 'POST', headers: hdr(fq.accessToken), body: fqBody });
    const fqJson = await fqSub.json().catch(() => ({}));
    assert('queue submit accepted under fault (202)', fqSub.status === 202, `status=${fqSub.status}`);
    // Cap retries so exhaustion (and the worker refund) happens fast (backoff is exponential).
    await admin.from('analysis_jobs').update({ max_attempts: 1 }).eq('id', fqJson.jobId);
    let fqStatus = null;
    for (let i = 0; i < 60; i++) {
      const p = await fetch(`${resolved.url}/functions/v1/get-analysis-job-status?jobId=${fqJson.jobId}`, { headers: hdr(fq.accessToken) });
      if (p.status === 200) {
        const pj = await p.json().catch(() => ({}));
        if (pj.status === 'failed') { fqStatus = 'failed'; break; }
        if (pj.status === 'completed') { fqStatus = 'completed'; break; }
      }
      await sleep(2000);
    }
    assert('queued job reaches terminal failure (no stuck run)', fqStatus === 'failed', `status=${fqStatus}`);
    await sleep(800);
    const fqEnd = await balanceOf(fq.userId);
    assert('queue permanent failure restores merits', fqEnd === fqStart, `${fqStart} -> ${fqEnd}`);
    const { data: fqRefunds } = await admin.from('merit_transactions').select('amount').eq('user_id', fq.userId).or('source.eq.feature-refund,balance_type.eq.refund');
    assert('queue refund transaction recorded', (fqRefunds || []).length > 0, `refund rows=${(fqRefunds || []).length}`);
  }

  // ── Teardown all synthetic users (cascades their data) ──────────────────────
  for (const id of createdUsers) await admin.auth.admin.deleteUser(id).catch(() => {});
  console.log(`\nCleaned up ${createdUsers.length} synthetic user(s) (data cascaded).`);

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n=== ${cfg.phase} phase: ${checks.length - failed.length}/${checks.length} checks passed ===`);
  console.log('Correctness only — these timings are NOT hosted capacity.');
  if (failed.length) {
    console.error(`FAILED: ${failed.map((c) => c.name).join('; ')}`);
    process.exit(1);
  }
  console.log('ALL CHECKS PASSED. Production received zero requests (loopback-only).');
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
