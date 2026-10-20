// ── Workload 3: Resume / PDF upload (concurrent UPLOADS) ─────────────────────
//
// DIMENSION: concurrent uploads. Two sub-steps the real flow performs:
//   (a) validate-document — raw PDF bytes POSTed with x-document-type/x-file-name
//       headers (server-side size/format gate).
//   (b) Storage PUT to the `resumes` bucket at <userId>/<file>.
// AI is NOT involved here (extraction is workload 4, analysis is workload 10).
//
// Uses a small synthetic PDF fixture (fixtures/resumes/synthetic-resume.pdf).
// Run (one rung):
//   k6 run -e TARGET_ENV=preview -e CONFIRM_TARGET=cimjltzovkahkqecpwgi \
//     -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... -e PROFILE=ramp -e TARGET=25 \
//     scenarios/03-resume-upload.js

import http from 'k6/http';
import { check } from 'k6';
import { preflight } from '../lib/guards.js';
import { buildVuOptions } from '../lib/scenario.js';
import { session } from '../lib/session.js';
import { uploadDurationMs, businessErrors, recordHttp, firstClickCompletion } from '../lib/metrics.js';

const USERS = JSON.parse(open(__ENV.USERS_FILE || '../fixtures/synthetic-users.json'));
// Binary open — a valid, text-bearing synthetic PDF (no real personal data).
const PDF = open(__ENV.PDF_FILE || '../fixtures/resumes/synthetic-resume.pdf', 'b');
const PDF_NAME = __ENV.PDF_NAME || 'synthetic-resume.pdf';

export const options = buildVuOptions({
  env: __ENV,
  capDimension: 'maxConcurrentUploads',
  latencyClass: 'medium',
  defaultTarget: 25,
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
  let ok = true;
  const start = Date.now();

  // (a) Server-side document validation — raw bytes + metadata headers.
  const valRes = http.post(`${data.url}/functions/v1/validate-document`, PDF, {
    headers: {
      Authorization: `Bearer ${s.accessToken}`,
      apikey: data.anonKey,
      'Content-Type': 'application/pdf',
      'x-document-type': 'resume',
      'x-file-name': encodeURIComponent(PDF_NAME),
    },
    tags: { name: 'upload:validate-document' },
  });
  recordHttp(valRes, { acceptStatuses: [200] });
  if (!check(valRes, { 'validate-document 200': (r) => r.status === 200 })) ok = false;

  // (b) Storage upload to the resumes bucket (owner-scoped path).
  const objectPath = `${s.userId}/${__VU}-${__ITER}-${PDF_NAME}`;
  const putRes = http.put(
    `${data.url}/storage/v1/object/resumes/${objectPath}`,
    PDF,
    {
      headers: {
        Authorization: `Bearer ${s.accessToken}`,
        apikey: data.anonKey,
        'Content-Type': 'application/pdf',
        'x-upsert': 'true',
      },
      tags: { name: 'upload:storage-put' },
    },
  );
  recordHttp(putRes, { acceptStatuses: [200, 201] });
  if (!check(putRes, { 'storage put ok': (r) => r.status === 200 || r.status === 201 })) ok = false;

  uploadDurationMs.add(Date.now() - start);
  firstClickCompletion.add(ok);

  // NOTE: uploaded objects accumulate in the resumes bucket. tools/cleanup runs
  // after a stage to purge synthetic <userId>/ prefixes. See README "Teardown".
}
