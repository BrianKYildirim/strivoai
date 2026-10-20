// ── Workload 11: Mixed realistic user journey ────────────────────────────────
//
// One VU = one active user doing the WHOLE flow end-to-end:
//   sign in -> dashboard read -> validate a resume -> submit analysis job ->
//   poll until complete -> retrieve result -> think.
// This is the realistic blend the other 10 workloads isolate. It surfaces
// cross-feature contention (e.g. polling amplification competing with submits)
// that single-workload tests miss. first-click completion = did the user get
// their result within the journey.
//
// Run:
//   k6 run -e TARGET_ENV=preview -e CONFIRM_TARGET=cimjltzovkahkqecpwgi \
//     -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... -e PROFILE=ramp -e TARGET=100 \
//     scenarios/11-mixed-user-journey.js

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { preflight } from '../lib/guards.js';
import { buildVuOptions } from '../lib/scenario.js';
import { session } from '../lib/session.js';
import { authHeaders } from '../lib/auth.js';
import {
  acceptedRuns,
  completedRuns,
  failedRuns,
  lostAcceptedRuns,
  dbLatencyMs,
  analysisCompletionMs,
  businessErrors,
  recordHttp,
  firstClickCompletion,
} from '../lib/metrics.js';

const USERS = JSON.parse(open(__ENV.USERS_FILE || '../fixtures/synthetic-users.json'));
const RESUME_TEXT = open(__ENV.RESUME_TEXT_FILE || '../fixtures/resumes/synthetic-resume.txt');
const PDF = open(__ENV.PDF_FILE || '../fixtures/resumes/synthetic-resume.pdf', 'b');
const MAX_POLLS = Number(__ENV.MAX_POLLS || 40);

export const options = buildVuOptions({
  env: __ENV,
  capDimension: 'maxBrowsingVUs',
  latencyClass: 'analysis', // journey includes the async analysis wait
  defaultTarget: 100,
  gracefulStopSec: 90,
});

export function setup() {
  const resolved = preflight(__ENV);
  return { url: resolved.url, anonKey: resolved.anonKey, users: USERS };
}

export default function (data) {
  const s = session(data);
  if (!s) {
    businessErrors.add(1);
    firstClickCompletion.add(false);
    return;
  }
  const headers = authHeaders(data.anonKey, s.accessToken);
  const rest = `${data.url}/rest/v1`;
  let journeyOk = true;

  // 1) Land on dashboard.
  group('journey:dashboard', () => {
    const res = http.get(`${rest}/analysis_jobs?select=id,status&order=created_at.desc&limit=10`, {
      headers,
      tags: { name: 'journey:dashboard' },
    });
    dbLatencyMs.add(res.timings.duration, { step: 'dashboard' });
    if (!recordHttp(res, { acceptStatuses: [200, 206] })) journeyOk = false;
  });
  sleep(2);

  // 2) Validate the resume they picked.
  group('journey:validate', () => {
    const res = http.post(`${data.url}/functions/v1/validate-document`, PDF, {
      headers: { ...headers, 'Content-Type': 'application/pdf', 'x-document-type': 'resume', 'x-file-name': 'synthetic-resume.pdf' },
      tags: { name: 'journey:validate' },
    });
    if (!recordHttp(res, { acceptStatuses: [200] })) journeyOk = false;
  });
  sleep(1);

  // 3) Submit the analysis job.
  const resumeId = `lt-journey-${s.userId}-${__VU}-${__ITER}-${Date.now()}`;
  const submitRes = http.post(
    `${data.url}/functions/v1/submit-resume-analysis-job`,
    JSON.stringify({ userId: s.userId, resumeId, resumeText: RESUME_TEXT, previousSuggestions: [], previousScore: null }),
    { headers, tags: { name: 'journey:submit' }, timeout: '30s' },
  );
  if (submitRes.status !== 202) {
    recordHttp(submitRes, { acceptStatuses: [202] });
    failedRuns.add(1);
    firstClickCompletion.add(false);
    return;
  }
  acceptedRuns.add(1);
  const jobId = (() => {
    try {
      return submitRes.json('jobId');
    } catch {
      return null;
    }
  })();
  if (!jobId) {
    lostAcceptedRuns.add(1);
    firstClickCompletion.add(false);
    return;
  }

  // 4) Poll until the result is ready, then retrieve it.
  const start = Date.now();
  let got = false;
  for (let i = 0; i < MAX_POLLS; i++) {
    const pollRes = http.get(`${data.url}/functions/v1/get-analysis-job-status?jobId=${jobId}`, {
      headers,
      tags: { name: 'journey:poll' },
    });
    recordHttp(pollRes, { acceptStatuses: [200] });
    if (pollRes.status !== 200) break;
    let status;
    try {
      status = pollRes.json('status');
    } catch {
      status = null;
    }
    if (status === 'completed') {
      got = check(pollRes, { 'result retrievable': (r) => r.json('result') !== undefined });
      if (got) {
        completedRuns.add(1);
        analysisCompletionMs.add(Date.now() - start);
      } else {
        lostAcceptedRuns.add(1);
      }
      break;
    }
    if (status === 'failed') {
      failedRuns.add(1);
      break;
    }
    sleep(1.5);
  }

  firstClickCompletion.add(journeyOk && got);
  sleep(Number(__ENV.THINK_SEC || 3));
}
