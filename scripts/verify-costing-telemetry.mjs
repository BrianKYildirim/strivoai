#!/usr/bin/env node
/**
 * verify-costing-telemetry.mjs - Phase 04.2 / Plan 05
 *
 * A BOUNDED, READ-ONLY, NON-SECRET operator verification of the costing telemetry
 * substrate on a NON-PRODUCTION Supabase project.
 *
 * WHY THIS EXISTS
 * -----------------------------------------------------------------------------
 * After the preview schema push, someone has to answer "is it actually there, and is it
 * actually locked down?" without opening a SQL console and without pasting a service-role
 * key into a chat window. That is this script. It is the operator-facing counterpart to
 * the Deno remote lane: the lane proves BEHAVIOR by writing rows, this proves PRESENCE and
 * POSTURE by reading them.
 *
 * THREE HARD RULES
 * -----------------------------------------------------------------------------
 * 1. NON-PRODUCTION ONLY. The target URL must positively resolve to the preview/test
 *    project ref. If it resolves to the production ref -- or to anything unrecognized --
 *    the script exits non-zero before issuing a single request. `--env production` is not
 *    a supported value and never will be: production is inspected through the read-only
 *    MCP surface and changed only by the operator at the explicit activation gate.
 *
 * 2. READ-ONLY. Every request below is a GET (PostgREST select / HEAD count) or an OPTIONS
 *    preflight. There is no INSERT, UPDATE, DELETE, RPC, or DDL anywhere in this file.
 *
 * 3. NOTHING SENSITIVE IS PRINTED. Output is counts, booleans, HTTP statuses, and object
 *    names. Never a UUID, a prompt, document text, an email address, a token value, a
 *    provider response body, an API key, or any part of one. The service-role key is read
 *    from the environment, used as a header, and never echoed -- not even truncated.
 *
 * USAGE
 * -----------------------------------------------------------------------------
 *   npm run verify:costing-telemetry -- --env test
 *   npm run verify:costing-telemetry -- --env test --schema-and-functions
 *   node scripts/verify-costing-telemetry.mjs --env test --schema-and-functions
 *
 *   --env test | preview        Required. The only accepted values (aliases for the ONE
 *                               non-production project).
 *   --schema-and-functions      Additionally probe that the Phase 04.2 Edge Functions are
 *                               deployed and reachable on the same ref (status only).
 *   --json                      Emit the machine-readable summary instead of the report.
 *
 * CREDENTIALS
 * -----------------------------------------------------------------------------
 * Read from the ambient environment first, then from the gitignored `.env.test.local`
 * (same precedence contract as scripts/with-preview-env.mjs: existing env always wins).
 * Names only are ever mentioned in output.
 *
 * EXIT CODES
 * -----------------------------------------------------------------------------
 *   0  every required assertion passed
 *   1  at least one assertion failed
 *   2  misuse (bad/missing --env, missing credentials, unrecognized target)
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The ONE non-production project. staging == test == preview. */
const PREVIEW_PROJECT_REF = 'cimjltzovkahkqecpwgi';
/** Production. This script must be structurally unable to target it. */
const PROD_PROJECT_REF = 'zjpjapgraoxdukdvpjes';

const URL_NAMES = ['SUPABASE_URL_STAGING', 'STAGING_SUPABASE_URL', 'SUPABASE_TEST_URL'];
const SERVICE_KEY_NAMES = [
  'SUPABASE_SERVICE_ROLE_KEY_STAGING',
  'STAGING_SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_TEST_SERVICE_ROLE_KEY',
];
const ANON_KEY_NAMES = ['SUPABASE_ANON_KEY_STAGING', 'SUPABASE_TEST_ANON_KEY', 'STAGING_SUPABASE_ANON_KEY'];

// The Phase 04.2 objects that must exist on the target.
const COSTING_TABLES = [
  'costing_subjects',
  'costing_account_classifications',
  'provider_pricing',
  'feature_runs',
  'document_processing_runs',
  'costing_monthly_aggregates',
  'ai_call_telemetry',
];

const COSTING_VIEWS = [
  'costing_monthly_product_mau',
  'costing_monthly_feature_usage',
  'costing_monthly_ai_usage',
  'costing_monthly_document_usage',
  'costing_monthly_ai_legacy_partial',
  'costing_monthly_ai_current_rate_revaluation',
];

// Every Edge Function Phase 04.2 created or changed. Probed for reachability only.
const PHASE_FUNCTIONS = [
  'begin-feature-run',
  'ocr-pdf',
  'analyze-resume',
  'analyze-career',
  'grade-linkedin',
  'recruiting-lens',
  'interview-prep-analyze',
  'interview-prep-evaluate',
  'submit-resume-analysis-job',
  'submit-career-analysis-job',
  'process-resume-analysis-job',
  'process-career-analysis-job',
];

// ── argument parsing ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};

const envArg = (value('--env') ?? '').toLowerCase();
const wantFunctions = flag('--schema-and-functions');
const asJson = flag('--json');

function fail(message, code = 2) {
  console.error(`\n[verify-costing-telemetry] ABORT: ${message}\n`);
  process.exit(code);
}

if (!envArg) {
  fail('--env is required. Accepted values: test, preview. (production is not supported here.)');
}
if (envArg === 'production' || envArg === 'prod') {
  fail(
    'production is not a supported target. This script never touches production. ' +
      'Production is inspected read-only through the Supabase MCP surface, and is changed ' +
      'only by the operator at the explicit activation gate.',
  );
}
if (envArg !== 'test' && envArg !== 'preview') {
  fail(`unrecognized --env "${envArg}". Accepted values: test, preview.`);
}

// ── credential resolution (names only are ever printed) ──────────────────────────────────
const envFile = path.join(repoRoot, '.env.test.local');
if (existsSync(envFile)) {
  for (const rawLine of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let raw = line.slice(eq + 1).trim();
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      raw = raw.slice(1, -1);
    }
    if (process.env[key] === undefined || process.env[key] === '') process.env[key] = raw;
  }
}

const firstSet = (names) => {
  for (const name of names) {
    const found = process.env[name];
    if (found) return { name, value: found };
  }
  return null;
};

const urlEntry = firstSet(URL_NAMES);
if (!urlEntry) fail(`no preview URL. Set one of: ${URL_NAMES.join(', ')}`);
const serviceEntry = firstSet(SERVICE_KEY_NAMES);
if (!serviceEntry) fail(`no preview service-role key. Set one of: ${SERVICE_KEY_NAMES.join(', ')}`);
const anonEntry = firstSet(ANON_KEY_NAMES);

const baseUrl = urlEntry.value.replace(/\/$/, '');

// RULE 1, enforced before ANY network call is made.
if (baseUrl.includes(PROD_PROJECT_REF)) {
  fail(
    `the configured URL resolves to the PRODUCTION project ref ${PROD_PROJECT_REF}. ` +
      'Refusing to run. Point it at the preview/test project instead.',
  );
}
if (!baseUrl.includes(PREVIEW_PROJECT_REF)) {
  fail(
    `the configured URL does not resolve to the expected preview/test project ref ` +
      `${PREVIEW_PROJECT_REF}. Refusing to run against an unrecognized project.`,
  );
}

// ── assertion plumbing ───────────────────────────────────────────────────────────────────
const results = [];
let failures = 0;

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
}

const TIMEOUT_MS = 15_000;

async function rest(pathname, { key = serviceEntry.value, method = 'GET', headers = {} } = {}) {
  const response = await fetch(`${baseUrl}/rest/v1/${pathname}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return response;
}

// ── THREE-STATE PROBING ──────────────────────────────────────────────────────────────────
//
// A probe has THREE outcomes, not two, and collapsing them is how this script produced a
// confidently wrong claim on 2026-08-02:
//
//   'present'     the relation answered. Dependent checks may run.
//   'absent'      the relation is genuinely not there (HTTP 404, or PostgREST's PGRST205
//                 schema-cache miss). Dependent checks are NOT EVALUATED, correctly.
//   'probe-error' the relation's status is UNKNOWN because our own request was rejected
//                 (400, 401, 5xx, a network failure). This must NEVER be reported as
//                 absence and must NEVER cause a security check to be quietly skipped --
//                 it is a defect in this script, and it is reported as one.
//
// The original bug: the probe hardcoded `?select=id`, but
// public.costing_account_classifications is keyed on costing_subject_id and has no `id`
// column at all. PostgREST answered 400 "column does not exist"; the code read "not 200"
// as "absent" and skipped the anon-deny check for that table. The single most consequential
// property in this file went UNPROVEN while the report claimed the table did not exist.
//
// Two fixes, both applied below: no request names a column that has not been verified to
// exist (every probe uses `select=*`), and the three states are kept distinct end to end.

const PRESENT = 'present';
const ABSENT = 'absent';
/** The role was refused (401/403). For an anon probe that is the DESIRED outcome. */
const DENIED = 'denied';
const PROBE_ERROR = 'probe-error';

/** PostgREST's code for "relation not found in the schema cache". */
const SCHEMA_CACHE_MISS = 'PGRST205';

/**
 * Probe a relation and (optionally) count matching rows, without naming any column.
 *
 * `select=*&limit=0` returns zero row bodies while still producing an exact count in the
 * Content-Range header, so this reads no user data at all. GET rather than HEAD because a
 * HEAD response carries no body, and the body is where PostgREST puts the error code that
 * distinguishes 'absent' from 'probe-error'.
 */
async function probeRelation(relation, query = '', key = serviceEntry.value) {
  let response;
  try {
    response = await rest(`${relation}?select=*&limit=0${query}`, {
      key,
      headers: { Prefer: 'count=exact' },
    });
  } catch (error) {
    return {
      state: PROBE_ERROR,
      status: 0,
      code: 'network',
      count: null,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  const status = response.status;
  const range = response.headers.get('content-range') ?? '';

  if (status === 200 || status === 206) {
    await response.body?.cancel();
    const total = range.split('/')[1];
    return {
      state: PRESENT,
      status,
      code: null,
      count: total === '*' || total === undefined ? null : Number(total),
      detail: '',
    };
  }

  // Read the error body ONCE; it carries the PostgREST code and message.
  let code = null;
  let message = '';
  try {
    const body = await response.json();
    code = body?.code ?? null;
    message = body?.message ?? '';
  } catch {
    await response.body?.cancel();
  }

  if (status === 404 || code === SCHEMA_CACHE_MISS) {
    return { state: ABSENT, status, code, count: null, detail: 'relation not present' };
  }

  // A refusal is a definite ANSWER, not a broken probe: the relation is reachable and the
  // role was denied. Kept distinct so the anon check can treat it as proof of a deny while
  // the service-role check still treats it as a failure.
  if (status === 401 || status === 403) {
    return { state: DENIED, status, code, count: null, detail: message };
  }

  // Anything else: our request was wrong, or the platform failed. Say so plainly. Never
  // translate this into a claim about whether the relation exists.
  return {
    state: PROBE_ERROR,
    status,
    code,
    count: null,
    // The message is PostgREST's own diagnostic (e.g. a column name). It contains no row
    // data, no secret, and no user content.
    detail: message,
  };
}

/** Human-readable tail for a probe result, used in every check detail line. */
function probeDetail(probe) {
  const parts = [`HTTP ${probe.status}`];
  if (probe.code) parts.push(`code=${probe.code}`);
  if (probe.count !== null) parts.push(`rows=${probe.count}`);
  if (probe.detail) parts.push(probe.detail);
  return parts.join(', ');
}

// ── the checks ───────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('[verify-costing-telemetry] Phase 04.2 costing telemetry verification');
  console.log(`[verify-costing-telemetry] target env      : ${envArg} (preview/test project ${PREVIEW_PROJECT_REF})`);
  console.log(`[verify-costing-telemetry] url name        : ${urlEntry.name}`);
  console.log(`[verify-costing-telemetry] service key name: ${serviceEntry.name} (value never printed)`);
  console.log(`[verify-costing-telemetry] anon key name   : ${anonEntry ? anonEntry.name : 'ABSENT'}`);
  console.log(`[verify-costing-telemetry] mode            : read-only${wantFunctions ? ' + function reachability' : ''}`);
  console.log('');

  // 1. Reachability. A paused project must fail loudly rather than produce confusing errors.
  try {
    const root = await rest('');
    await root.body?.cancel();
    // PostgREST answers its bare root with 200 (OpenAPI spec) or 404 depending on config;
    // both prove the project is UP. Anything else is reported with its status rather than a
    // guessed cause -- a 401 here is a bad key, a 503 is a paused/unrouted project, and this
    // check deliberately does not pretend to tell them apart.
    record(
      'project reachable',
      root.status === 200 || root.status === 404,
      `HTTP ${root.status}${root.status === 401 ? ' (check the service-role key name, not the project)' : ''}`,
    );
  } catch (error) {
    record('project reachable', false, error instanceof Error ? error.message : String(error));
  }

  // 2/3. Every Phase 04.2 relation is probed once, and its STATE is remembered so dependent
  //      checks below know whether they may run, must report NOT EVALUATED, or must report
  //      a probe error. Views and tables use the identical probe -- neither names a column.
  const tableCounts = {};
  const state = new Map();

  for (const relation of [...COSTING_TABLES, ...COSTING_VIEWS]) {
    const probe = await probeRelation(relation);
    state.set(relation, probe.state);
    const kind = COSTING_TABLES.includes(relation) ? 'table' : 'view';
    if (kind === 'table') tableCounts[relation] = probe.count;
    record(`${kind} public.${relation}`, probe.state === PRESENT, probeDetail(probe));
  }

  // 4. The reviewed pricing catalog is present. Counts only -- no rate is printed, because a
  //    rate is a reviewed contractual value that belongs in the source-of-truth review, not
  //    in an ad-hoc console dump.
  const pricing = await probeRelation('provider_pricing');
  record(
    'provider pricing seeded',
    pricing.state === PRESENT && (pricing.count ?? 0) > 0,
    `${probeDetail(pricing)} (append-only; a change is a NEW effective row)`,
  );

  // 5. RLS / grant posture. The single most consequential property: no browser client may
  //    read costing telemetry or fabricate token counts and AI costs.
  if (!anonEntry) {
    record(
      'anon client denied on costing tables',
      false,
      `no anon key (set one of ${ANON_KEY_NAMES.join(', ')}). An UNPROVEN deny is the same as NO deny.`,
    );
  } else {
    for (const relation of [...COSTING_TABLES, ...COSTING_VIEWS]) {
      const kind = COSTING_TABLES.includes(relation) ? '' : 'view ';
      const label = `anon denied on ${kind}public.${relation}`;

      // Only a genuine ABSENCE justifies not evaluating a security property. A probe error
      // means WE broke, and it is reported as a failure of this script -- never laundered
      // into a skipped check that reads as harmless.
      if (state.get(relation) === ABSENT) {
        record(label, false, 'NOT EVALUATED - the relation is absent from this project');
        continue;
      }
      if (state.get(relation) === PROBE_ERROR) {
        record(
          label,
          false,
          'NOT EVALUATED - the service-role probe for this relation FAILED, so its presence ' +
            'is unknown and this deny is UNPROVEN. Fix the probe; do not assume it is safe.',
        );
        continue;
      }

      const probe = await probeRelation(relation, '&limit=1', anonEntry.value);
      // A deny looks like exactly three things: a permission refusal (DENIED), the relation
      // not being exposed to the anon role at all (ABSENT for that role), or a readable
      // relation that returns ZERO rows because RLS filtered everything (PRESENT, count 0).
      // A PROBE ERROR is none of them, and must never be mistaken for one.
      if (probe.state === PROBE_ERROR) {
        record(label, false, `PROBE ERROR - ${probeDetail(probe)}. This deny is UNPROVEN.`);
        continue;
      }
      const denied = probe.state === DENIED || probe.state === ABSENT || probe.count === 0;
      record(label, denied, probeDetail(probe));
    }
  }

  // 6. Costing-evidence summary. COUNTS AND STATUSES ONLY.
  //    unknown_cost_attempts / unknown_cost_documents are printed DELIBERATELY and always,
  //    beside the known totals -- a cost figure without its unknown counter is a number that
  //    reads cheaper than reality (D-13).
  const evidence = {
    unknown_cost_attempts: null,
    unknown_cost_documents: null,
    complete_epoch_runs: null,
    legacy_partial_attempts: null,
    nonterminal_runs: null,
    orphaned_complete_epoch_attempts: null,
    referenced_ai_documents: null,
    detached_costing_subjects: null,
    monthly_aggregate_rows: null,
  };

  const probes = [
    ['unknown_cost_attempts', 'ai_call_telemetry', '&costing_epoch=eq.phase_04_2_complete&cost_known=not.eq.true'],
    [
      'unknown_cost_documents',
      'document_processing_runs',
      '&costing_epoch=eq.phase_04_2_complete&ocr_triggered=is.true&cost_known=not.eq.true&cost_confidence=neq.referenced_ai',
    ],
    ['complete_epoch_runs', 'feature_runs', '&costing_epoch=eq.phase_04_2_complete'],
    ['legacy_partial_attempts', 'ai_call_telemetry', '&costing_epoch=is.null'],
    ['nonterminal_runs', 'feature_runs', '&status=eq.started'],
    [
      'orphaned_complete_epoch_attempts',
      'ai_call_telemetry',
      '&costing_epoch=eq.phase_04_2_complete&feature_run_id=is.null',
    ],
    ['referenced_ai_documents', 'document_processing_runs', '&cost_confidence=eq.referenced_ai'],
    ['detached_costing_subjects', 'costing_subjects', '&detached_at=not.is.null'],
    ['monthly_aggregate_rows', 'costing_monthly_aggregates', ''],
  ];

  for (const [label, table, query] of probes) {
    if (state.get(table) !== PRESENT) continue; // stays null: absent/unknown is not zero.
    const probe = await probeRelation(table, query);
    if (probe.state === PRESENT) {
      evidence[label] = probe.count;
      continue;
    }
    // An evidence probe that fails is a defect in this filter, not a zero. Record it as a
    // failing check so it cannot slip by as a blank line in the summary.
    record(`evidence probe ${label}`, false, `PROBE ERROR - ${probeDetail(probe)}`);
  }

  // 7. The one read-side invariant this script can prove on its own: no document row may
  //    both reference an AI attempt and carry its own cost. That would double-count Claude
  //    vision spend (D-12).
  if (state.get('document_processing_runs') !== PRESENT) {
    record(
      'claude OCR counted exactly once',
      false,
      `NOT EVALUATED - document_processing_runs probe state is ${state.get('document_processing_runs')}`,
    );
  } else {
    const doubleCounted = await probeRelation(
      'document_processing_runs',
      '&ai_call_telemetry_id=not.is.null&incurred_cost_usd=not.is.null',
    );
    // A null count previously PASSED this invariant, which is the same vacuous-pass shape as
    // the bug above. The probe must succeed AND return an exact zero.
    record(
      'claude OCR counted exactly once',
      doubleCounted.state === PRESENT && doubleCounted.count === 0,
      doubleCounted.state === PRESENT
        ? `referenced-AI documents carrying their own cost: ${doubleCounted.count}`
        : `PROBE ERROR - ${probeDetail(doubleCounted)}. This invariant is UNPROVEN.`,
    );
  }

  // 8. Optional: Edge Function reachability on the SAME ref. OPTIONS preflight only -- it
  //    invokes no handler body, spends no Merits, and makes no paid provider call.
  if (wantFunctions) {
    for (const name of PHASE_FUNCTIONS) {
      let status = 0;
      try {
        const response = await fetch(`${baseUrl}/functions/v1/${name}`, {
          method: 'OPTIONS',
          headers: {
            Origin: 'https://strivoai.net',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'authorization,content-type',
          },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        status = response.status;
        await response.body?.cancel();
      } catch (error) {
        record(`function ${name} deployed`, false, error instanceof Error ? error.message : String(error));
        continue;
      }
      // A deployed function answers the preflight. 404 means NOT DEPLOYED on this ref;
      // 503 is the platform-routing failure signature called out in CLAUDE.md.
      record(`function ${name} deployed`, status !== 404 && status !== 503, `OPTIONS HTTP ${status}`);
    }
  }

  // ── report ─────────────────────────────────────────────────────────────────────────────
  if (asJson) {
    console.log(
      JSON.stringify(
        {
          env: envArg,
          project_ref: PREVIEW_PROJECT_REF,
          checks: results,
          evidence,
          table_row_counts: tableCounts,
          failures,
        },
        null,
        2,
      ),
    );
  } else {
    console.log('CHECKS');
    console.log('------');
    for (const result of results) {
      console.log(`  ${result.ok ? 'PASS' : 'FAIL'}  ${result.name}  [${result.detail}]`);
    }
    console.log('');
    console.log('EVIDENCE SUMMARY (counts only - no identifiers, no content, no secrets)');
    console.log('-----------------------------------------------------------------------');
    for (const [label, count] of Object.entries(evidence)) {
      console.log(`  ${label.padEnd(34)} ${count ?? 'n/a'}`);
    }
    console.log('');
    console.log('  NOTE: unknown_cost_attempts and unknown_cost_documents are NOT zero-cost.');
    console.log('        They are attempts/documents whose cost could not be established and');
    console.log('        must be reported BESIDE known totals, never folded into them (D-13).');
    console.log('');
    console.log(
      failures === 0
        ? `[verify-costing-telemetry] RESULT: PASS (${results.length} checks, 0 failures)`
        : `[verify-costing-telemetry] RESULT: FAIL (${failures}/${results.length} checks failed)`,
    );
    console.log('[verify-costing-telemetry] production was not contacted.');
  }

  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`[verify-costing-telemetry] unexpected failure: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
