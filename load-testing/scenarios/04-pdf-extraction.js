// ── Workload 4: PDF extraction (server OCR path) ─────────────────────────────
//
// DIMENSION: requests/second against ocr-pdf. In the product, PDF text is first
// extracted client-side by pdf.js; ocr-pdf is the SERVER fallback. We drive it
// with a cheap `pdfjsText` payload (no images) so it exercises the extraction /
// persistence path WITHOUT invoking Claude OCR (which is elite-only and costs
// real provider money). For high volume, keep images empty + AI_TEST_MODE on.
//
// Run (one rung):
//   k6 run -e TARGET_ENV=preview -e CONFIRM_TARGET=cimjltzovkahkqecpwgi \
//     -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... -e TARGET=20 \
//     scenarios/04-pdf-extraction.js

import http from 'k6/http';
import { check } from 'k6';
import { preflight } from '../lib/guards.js';
import { buildRpsOptions } from '../lib/scenario.js';
import { session } from '../lib/session.js';
import { authHeaders } from '../lib/auth.js';
import { businessErrors, recordHttp, firstClickCompletion, edgeTimeouts } from '../lib/metrics.js';

const USERS = JSON.parse(open(__ENV.USERS_FILE || '../fixtures/synthetic-users.json'));
const RESUME_TEXT = open(__ENV.RESUME_TEXT_FILE || '../fixtures/resumes/synthetic-resume.txt');

export const options = buildRpsOptions({
  env: __ENV,
  latencyClass: 'medium',
  defaultRps: 10,
  preAllocatedVUs: 30,
  maxVUs: 200,
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

  // pdfjsText-only payload: exercises extraction/persistence, no Claude OCR.
  const body = JSON.stringify({
    images: [], // empty -> no vision model; ok because pdfjsText is present
    resumeId: `lt-${s.userId}-${__VU}-${__ITER}`,
    documentType: 'resume',
    pdfjsText: RESUME_TEXT,
    filename: 'synthetic-resume.pdf',
  });

  const res = http.post(`${data.url}/functions/v1/ocr-pdf`, body, {
    headers: authHeaders(data.anonKey, s.accessToken),
    tags: { name: 'ocr-pdf' },
    timeout: '120s',
  });

  recordHttp(res, { acceptStatuses: [200] });
  if (res.status === 504 || res.status === 408) edgeTimeouts.add(1);
  const ok = check(res, {
    'ocr-pdf 200': (r) => r.status === 200,
    'ocr-pdf has text': (r) => {
      try {
        return typeof r.json('text') === 'string';
      } catch {
        return false;
      }
    },
  });
  firstClickCompletion.add(ok);
}
