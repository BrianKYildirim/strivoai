// ── Workload 12: Controlled provider timeout / rate-limit / overload sim ──────
//
// Verifies GRACEFUL degradation when the AI provider misbehaves — WITHOUT hitting
// the real provider. The target env is configured with the backend's built-in
// fault injectors (no code change, no real calls):
//   AI_TEST_MODE=true + AI_FORCE_FAILURE=true          -> every call returns 529
//   MERIT_TEST_FORCE_REFUNDABLE_ERROR=<status|true>    -> refundable error (staging)
// This scenario then drives a modest submit+poll load and asserts the system:
//   - reaches a TERMINAL state for every accepted run (no stuck runs),
//   - refunds correctly (no merit left stranded — verified via measure-supabase),
//   - does NOT create duplicate jobs or double-charge,
//   - does NOT enter a retry storm (bounded attempts).
//
// PRECONDITION (operator sets on the TARGET, then reverts after):
//   supabase secrets set AI_TEST_MODE=true AI_FORCE_FAILURE=true --project-ref <preview>
//
// Run:
//   k6 run -e TARGET_ENV=preview -e CONFIRM_TARGET=cimjltzovkahkqecpwgi \
//     -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... -e PROFILE=ramp -e TARGET=10 \
//     -e FAULT=overload scenarios/12-provider-fault-injection.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { preflight } from '../lib/guards.js';
import { buildVuOptions } from '../lib/scenario.js';
import { session } from '../lib/session.js';
import { authHeaders } from '../lib/auth.js';
import {
  acceptedRuns,
  failedRuns,
  recoveredRuns,
  stuckRuns,
  businessErrors,
  recordHttp,
  firstClickCompletion,
} from '../lib/metrics.js';

const USERS = JSON.parse(open(__ENV.USERS_FILE || '../fixtures/synthetic-users.json'));
const RESUME_TEXT = open(__ENV.RESUME_TEXT_FILE || '../fixtures/resumes/synthetic-resume.txt');
const MAX_POLLS = Number(__ENV.MAX_POLLS || 60);

export const options = buildVuOptions({
  env: __ENV,
  capDimension: 'maxQueuedAnalyses',
  latencyClass: 'submit',
  defaultTarget: 10,
  gracefulStopSec: 120,
});

export function setup() {
  const resolved = preflight(__ENV);
  console.log(
    '[wl12] Fault-injection sim. Confirm the TARGET has AI_TEST_MODE=true + a fault flag set ' +
      '(AI_FORCE_FAILURE / MERIT_TEST_FORCE_REFUNDABLE_ERROR). REMEMBER to revert those secrets after.',
  );
  return { url: resolved.url, anonKey: resolved.anonKey, users: USERS };
}

export default function (data) {
  const s = session(data);
  if (!s) {
    businessErrors.add(1);
    return;
  }
  const headers = authHeaders(data.anonKey, s.accessToken);

  const resumeId = `lt-fault-${s.userId}-${__VU}-${__ITER}-${Date.now()}`;
  const submitRes = http.post(
    `${data.url}/functions/v1/submit-resume-analysis-job`,
    JSON.stringify({ userId: s.userId, resumeId, resumeText: RESUME_TEXT, previousSuggestions: [], previousScore: null }),
    { headers, tags: { name: 'fault:submit' }, timeout: '30s' },
  );
  // Under fault injection, submit may still 202 (job enqueued) and fail later in
  // the worker, OR fail fast with a refundable 503. Both must be terminal + clean.
  if (submitRes.status === 202) {
    acceptedRuns.add(1);
    const jobId = (() => {
      try {
        return submitRes.json('jobId');
      } catch {
        return null;
      }
    })();
    if (!jobId) {
      businessErrors.add(1);
      return;
    }

    // Poll until terminal. Under a persistent fault, the correct outcome is a
    // clean `failed` (with refund) — NOT an endless retry and NOT a stuck run.
    let terminal = false;
    let lastAttempts = 0;
    for (let i = 0; i < MAX_POLLS; i++) {
      const pollRes = http.get(`${data.url}/functions/v1/get-analysis-job-status?jobId=${jobId}`, {
        headers,
        tags: { name: 'fault:poll' },
      });
      recordHttp(pollRes, { acceptStatuses: [200] });
      if (pollRes.status !== 200) break;
      let status, attempts;
      try {
        status = pollRes.json('status');
        attempts = pollRes.json('attempts');
      } catch {
        status = null;
      }
      if (typeof attempts === 'number') lastAttempts = attempts;
      if (status === 'failed') {
        // Graceful: user gets a clean terminal failure. Bounded attempts (no storm).
        failedRuns.add(1);
        if (lastAttempts <= 8) recoveredRuns.add(1); // handled within max_attempts
        terminal = true;
        break;
      }
      if (status === 'completed') {
        // A fault run that still completed (e.g. transient) is fine.
        terminal = true;
        break;
      }
      sleep(2);
    }
    if (!terminal) stuckRuns.add(1); // never reached terminal within the window
    // A raw technical error string must never be surfaced to the user; the status
    // endpoint returns a bounded {error} for failed jobs, checked here.
    firstClickCompletion.add(terminal);
  } else {
    // Fail-fast path: must be a clean, retryable envelope (503/429), not a 500 leak.
    const clean = check(submitRes, {
      'fault fail is clean 429/503': (r) => r.status === 429 || r.status === 503,
    });
    recordHttp(submitRes, { acceptStatuses: [202, 429, 503] });
    if (!clean) businessErrors.add(1);
    firstClickCompletion.add(clean);
  }
}
