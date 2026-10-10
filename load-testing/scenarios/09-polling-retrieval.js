// ── Workload 9: Polling & result retrieval (POLLING VOLUME) ──────────────────
//
// DIMENSION: polling volume — concurrent pollers hammering get-analysis-job-status
// while a job runs, then retrieving the completed result. Each VU submits ONE job,
// then polls it on the client's ~1.5-2.5s cadence until terminal, records the
// retrieval, and repeats. This is the read-amplification a queue path creates:
// one analysis => many status reads. Note get-analysis-job-status also nudges the
// worker when a job is due, so this exercises that fan-out too.
//
// Run:
//   k6 run -e TARGET_ENV=preview -e CONFIRM_TARGET=cimjltzovkahkqecpwgi \
//     -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... -e PROFILE=ramp -e TARGET=50 \
//     scenarios/09-polling-retrieval.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { preflight } from '../lib/guards.js';
import { buildVuOptions } from '../lib/scenario.js';
import { session } from '../lib/session.js';
import { authHeaders } from '../lib/auth.js';
import {
  pollLatencyMs,
  completedRuns,
  acceptedRuns,
  lostAcceptedRuns,
  businessErrors,
  recordHttp,
  firstClickCompletion,
} from '../lib/metrics.js';

const USERS = JSON.parse(open(__ENV.USERS_FILE || '../fixtures/synthetic-users.json'));
const RESUME_TEXT = open(__ENV.RESUME_TEXT_FILE || '../fixtures/resumes/synthetic-resume.txt');
const MAX_POLLS = Number(__ENV.MAX_POLLS || 40);

export const options = buildVuOptions({
  env: __ENV,
  capDimension: 'maxBrowsingVUs', // pollers are cheap, like browsing sessions
  latencyClass: 'fast',
  defaultTarget: 50,
});

export function setup() {
  const resolved = preflight(__ENV);
  return { url: resolved.url, anonKey: resolved.anonKey, users: USERS };
}

export default function (data) {
  const s = session(data);
  if (!s) {
    businessErrors.add(1);
    return;
  }
  const headers = authHeaders(data.anonKey, s.accessToken);

  // 1) Submit a job to have something to poll.
  const resumeId = `lt-poll-${s.userId}-${__VU}-${__ITER}-${Date.now()}`;
  const submitRes = http.post(
    `${data.url}/functions/v1/submit-resume-analysis-job`,
    JSON.stringify({ userId: s.userId, resumeId, resumeText: RESUME_TEXT, previousSuggestions: [], previousScore: null }),
    { headers, tags: { name: 'poll:submit' }, timeout: '30s' },
  );
  if (submitRes.status !== 202) {
    recordHttp(submitRes, { acceptStatuses: [202] });
    businessErrors.add(1);
    firstClickCompletion.add(false);
    return;
  }
  acceptedRuns.add(1);
  let jobId;
  try {
    jobId = submitRes.json('jobId');
  } catch {
    jobId = null;
  }
  if (!jobId) {
    lostAcceptedRuns.add(1); // accepted (202) but no id back == lost
    return;
  }

  // 2) Poll until terminal (or MAX_POLLS). Client cadence ~1.5s.
  let terminal = false;
  for (let i = 0; i < MAX_POLLS; i++) {
    const pollRes = http.get(`${data.url}/functions/v1/get-analysis-job-status?jobId=${jobId}`, {
      headers,
      tags: { name: 'poll:status' },
    });
    pollLatencyMs.add(pollRes.timings.duration);
    recordHttp(pollRes, { acceptStatuses: [200] });
    if (pollRes.status !== 200) break;

    let status;
    try {
      status = pollRes.json('status');
    } catch {
      status = null;
    }
    if (status === 'completed') {
      // 3) Retrieve the result — must be present, or the completed run is unretrievable.
      const hasResult = check(pollRes, { 'completed job has result': (r) => r.json('result') !== undefined });
      if (hasResult) completedRuns.add(1);
      else lostAcceptedRuns.add(1);
      terminal = true;
      break;
    }
    if (status === 'failed') {
      terminal = true;
      break;
    }
    sleep(1.5);
  }
  firstClickCompletion.add(terminal);
}
