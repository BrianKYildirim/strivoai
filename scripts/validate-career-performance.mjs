#!/usr/bin/env node
/**
 * Phase 9 - 09-04 - PERF-04 -- Career Compass (analyze-career) latency probe.
 *
 * The JSON sibling of scripts/validate-performance.mjs. Career Compass
 * (`analyze-career`) returns a PLAIN JSON Response (index.ts:1074-1077 /
 * :1280-1283 / the cache precheck at :255-258) -- NOT an SSE stream -- so the
 * resume harness's line-by-line SSE reader does not fit. This probe POSTs the
 * analyze-career request contract and reads `await response.json()`, timing the
 * wall-clock from request-sent to JSON-received.
 *
 * Reuse map (per 09-PATTERNS.md "validate-career-performance.mjs (NEW sibling)"):
 *   - ENV_CONFIGS / parseArgs (--env/--runs/--cooldown/--warmup) / authenticate()
 *     / loadResumes() / sleep()  ........  from scripts/validate-performance.mjs
 *   - percentile() / stats()  ............  from scripts/staging-cache-perf-probe.mjs
 *   - SSE reader  ........................  REPLACED with response.json()
 *
 * Measurement methodology (09-RESEARCH Pattern 3 + Pitfall 4, D-02):
 *   - STAGING ONLY. Refuses --env production (prod is read-only + near-empty +
 *     off-limits per CLAUDE.md MCP rules). measuring prod is meaningless.
 *   - Median (p50) + p95 over >= 5 runs per tier; warmup discarded; cooldown
 *     between runs.
 *   - Two modes:
 *       end-to-end (default) -- fresh AI call each run (real Anthropic cost);
 *                              satisfies the user-facing-flow no-regression mandate.
 *       --deterministic      -- short-circuit / cache-hit: the SAME input is sent
 *                              repeatedly so the analyze-career cache precheck
 *                              (index.ts:1286 precheck_cache -> readCareerAnalysisCache
 *                              :231-261) serves a cached JSON Response. This is the
 *                              CLEAN regression signal -- the ~35-56s AI-call variance
 *                              is isolated out so the few-ms H4/H5/RLS delta is visible.
 *
 * Names-not-values: every credential is read from an env-var NAME; no secret
 * VALUE is written into this file or any report it emits. The markdown report
 * records timings/counts only, never a token.
 *
 * Usage:
 *   node scripts/validate-career-performance.mjs --env staging --runs 5 --cooldown 8 --warmup
 *   node scripts/validate-career-performance.mjs --env staging --runs 5 --deterministic --warmup
 *   node scripts/validate-career-performance.mjs --help
 *
 * Required env vars (staging):
 *   SUPABASE_URL_STAGING        Staging Supabase project URL (has a default fallback)
 *   SUPABASE_ANON_KEY_STAGING   Staging anon key
 *   PERF_TEST_EMAIL             Test user email (password-auth seam reused from resume harness)
 *   PERF_TEST_PASSWORD          Test user password
 *
 * 09-04 plan reference: .planning/phases/09-performance-maintainability-refactoring/09-04-PLAN.md
 * Report destination (Task 3): .planning/audit/PERF-MEASUREMENT.md
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// -- Environment configs (mirror scripts/validate-performance.mjs:45-56) ------
// NOTE (D-02 / Pitfall 4): `production` is intentionally absent. This probe is
// staging-only by construction -- there is no production config to select, and
// --env production is refused below. Prod is read-only + near-empty + off-limits.
const ENV_CONFIGS = {
  staging: {
    urlVar: 'SUPABASE_URL_STAGING',
    keyVar: 'SUPABASE_ANON_KEY_STAGING',
    defaultUrl: 'https://cimjltzovkahkqecpwgi.supabase.co',
  },
};

const DEFAULT_OUTPUT = path.join(PROJECT_ROOT, '.planning/audit/PERF-MEASUREMENT.md');

// Tiers measured. Career request tier is resolved SERVER-SIDE from the auth'd
// profile (analyze-career/index.ts:803-809 -- rawBody.tier is never trusted), so
// the probe cannot force a tier per-request; it labels runs by the profile tier
// the PERF_TEST_* user actually has. Operators wanting a per-tier matrix run the
// probe once per test user (one Free, one Elite) -- see the report notes.
const TIERS = ['profile-resolved'];

const MIN_RUNS = 5; // PERF-04: median + p95 over >= 5 runs/tier (warmup discarded).

// -- CLI Argument Parsing (mirror validate-performance.mjs:67-123) ------------

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    env: 'staging',
    runs: 5,
    cooldown: 8,
    warmup: false,
    deterministic: false,
    label: null,
    output: DEFAULT_OUTPUT,
    resumePath: null,
    linkedinText: null,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--env':
        config.env = args[++i];
        break;
      case '--runs':
        config.runs = parseInt(args[++i], 10);
        break;
      case '--cooldown':
        config.cooldown = parseInt(args[++i], 10);
        break;
      case '--warmup':
        config.warmup = true;
        break;
      case '--deterministic':
      case '--short-circuit':
        // Deterministic / cache-hit mode: re-run the SAME input so the
        // analyze-career cache precheck serves a cached JSON Response. This is
        // the clean regression signal (the AI-call variance is isolated out).
        config.deterministic = true;
        break;
      case '--label':
        // Optional capture label for the report (e.g. "before" / "after").
        config.label = args[++i];
        break;
      case '--output':
        config.output = args[++i];
        break;
      case '--resume-path':
        // REQUIRED for a live run: a staging `resumes`-bucket storage path the
        // analyze-career validation gate downloads (index.ts:1095). File-based.
        config.resumePath = args[++i];
        break;
      case '--linkedin-text':
        // Optional LinkedIn text; omit if the auth'd user has a persisted LinkedIn.
        config.linkedinText = args[++i];
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        console.error(`Unknown argument: ${args[i]}`);
        printUsage();
        process.exit(1);
    }
  }

  // STAGING-ONLY guard (D-02 / Pitfall 4). Refuse production explicitly so the
  // failure mode is loud, not a silent prod measurement.
  if (config.env === 'production') {
    console.error('Error: this probe is STAGING-ONLY (D-02). Production is read-only,');
    console.error('near-empty, and off-limits -- measuring it is meaningless. Refusing --env production.');
    process.exit(1);
  }

  if (!config.env || !ENV_CONFIGS[config.env]) {
    console.error(`Error: --env must be one of: ${Object.keys(ENV_CONFIGS).join(', ')}`);
    printUsage();
    process.exit(1);
  }

  if (isNaN(config.runs) || config.runs < MIN_RUNS) {
    console.error(`Error: --runs must be an integer >= ${MIN_RUNS} (PERF-04 needs median + p95 over >= ${MIN_RUNS} runs)`);
    process.exit(1);
  }

  if (isNaN(config.cooldown) || config.cooldown < 0) {
    console.error('Error: --cooldown must be a non-negative integer');
    process.exit(1);
  }

  return config;
}

function printUsage() {
  console.log(`
Usage: node scripts/validate-career-performance.mjs [options]

PERF-04 Career Compass (analyze-career) latency probe -- reads JSON (NOT SSE).
Sibling of scripts/validate-performance.mjs (resume). STAGING ONLY.

Options:
  --env staging              Target environment (default: staging; production REFUSED)
  --runs N                   Measured runs per tier (default: ${MIN_RUNS}, min: ${MIN_RUNS})
  --cooldown N               Seconds between runs (default: 8)
  --warmup                   Run 1 warm-up before measurement (discarded)
  --deterministic            Cache-hit / short-circuit mode (clean regression signal):
                             re-run the SAME input so the analyze-career cache precheck
                             serves a cached JSON response (near-zero Anthropic cost)
  --label TEXT               Capture label for the report (e.g. before / after)
  --output PATH              Report destination (default: ${DEFAULT_OUTPUT})
  --help, -h                 Show this help

Required environment variables (staging):
  SUPABASE_URL_STAGING       Staging Supabase URL (default fallback present)
  SUPABASE_ANON_KEY_STAGING  Staging anon key
  PERF_TEST_EMAIL            Test user email
  PERF_TEST_PASSWORD         Test user password

Notes:
  - analyze-career resolves tier SERVER-SIDE from the auth'd profile; rawBody.tier
    is never trusted. For a per-tier matrix, run once per test user (Free, Elite).
  - end-to-end runs incur real Anthropic cost; --deterministic runs do not.
  - Median (p50) + p95 over >= ${MIN_RUNS} runs; warmup discarded; cooldown between runs.
`);
}

// -- Environment Variable Validation (mirror validate-performance.mjs:149-166) -

function validateEnvVars(envName) {
  const envConfig = ENV_CONFIGS[envName];
  const required = [envConfig.keyVar, 'PERF_TEST_EMAIL', 'PERF_TEST_PASSWORD'];
  const missing = required.filter((v) => !process.env[v]);

  if (missing.length > 0) {
    console.error(`Error: Missing required environment variables for ${envName}:`);
    missing.forEach((v) => console.error(`  - ${v}`));
    console.error('\nSet these variables before running the probe (names-not-values).');
    process.exit(1);
  }

  const url = process.env[envConfig.urlVar] || envConfig.defaultUrl;
  const anonKey = process.env[envConfig.keyVar];

  return { url, anonKey };
}

// -- Authentication (reuse validate-performance.mjs:170-190 password seam) -----

async function authenticate(supabaseUrl, anonKey) {
  const supabase = createClient(supabaseUrl, anonKey);

  const { data, error } = await supabase.auth.signInWithPassword({
    email: process.env.PERF_TEST_EMAIL,
    password: process.env.PERF_TEST_PASSWORD,
  });

  if (error || !data.session) {
    console.error('Authentication failed. Check PERF_TEST_EMAIL and PERF_TEST_PASSWORD.');
    if (error) console.error(`  Detail: ${error.message}`);
    process.exit(1);
  }

  console.log(`Authenticated as ${data.user.email} (user ID: ${data.user.id})`);

  return {
    accessToken: data.session.access_token,
    userId: data.user.id,
  };
}

// -- JSON Measurement (replaces validate-performance.mjs SSE reader :246-301) --

/**
 * POST the analyze-career request contract (index.ts:790) and read the PLAIN
 * JSON response (index.ts:1074-1077 / cache precheck :255-258). Wall-clock from
 * request-sent to JSON-received. No SSE line parser -- career is request/response.
 *
 * Request fields sent: { resumeFilePath, linkedinPdfContent, resumeTextContent, userId }.
 * IMPORTANT: analyze-career is FILE-BASED. Its validation gate (index.ts:931-942)
 * REQUIRES a non-empty `resumeFilePath` (a path in the `resumes` storage bucket it
 * downloads at :1095) AND LinkedIn content, unless the free-single-call
 * paths apply. Unlike analyze-resume, raw `resumeTextContent` alone does NOT pass
 * validation (HTTP 400 "Resume file is required"). The caller must pass --resume-path
 * (a staging-seeded storage path); --linkedin-text is optional if the auth'd user has a
 * persisted LinkedIn (readPersistedLinkedInText :797). Tier resolves server-side.
 */
async function measureRun(endpoint, accessToken, anonKey, resumeText, resumeName, userId, resumeFilePath, linkedinText) {
  const startMs = performance.now();

  let response;
  try {
    response = await fetch(`${endpoint}/functions/v1/analyze-career`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        resumeFilePath,
        linkedinPdfContent: linkedinText || undefined,
        resumeTextContent: resumeText,
        userId,
      }),
    });
  } catch (err) {
    const durationMs = performance.now() - startMs;
    return {
      resumeName,
      durationMs,
      durationSec: durationMs / 1000,
      status: null,
      cacheHit: null,
      error: `Fetch failed: ${err.message}`,
    };
  }

  // PLAIN JSON read -- the key difference from the resume SSE harness.
  let body = null;
  let parseError = null;
  try {
    body = await response.json();
  } catch (err) {
    parseError = `JSON parse failed: ${err.message}`;
  }

  const durationMs = performance.now() - startMs;

  if (!response.ok) {
    let errorMsg = `HTTP ${response.status}`;
    if (body && typeof body === 'object' && body.error) errorMsg += `: ${body.error}`;
    return {
      resumeName,
      durationMs,
      durationSec: durationMs / 1000,
      status: response.status,
      cacheHit: null,
      error: errorMsg,
    };
  }

  if (parseError) {
    return {
      resumeName,
      durationMs,
      durationSec: durationMs / 1000,
      status: response.status,
      cacheHit: null,
      error: parseError,
    };
  }

  // Heuristic cache-hit detector for the deterministic mode: a cached career
  // response carries reuse markers (reusedLinkedinGrade / linkedinGradeDate) and
  // returns far faster than a fresh AI call. We surface the markers and let the
  // duration distribution speak -- the deterministic probe's value is the timing,
  // not a server-asserted cache flag (the cache hit is invisible in the JSON body
  // shape, only in latency).
  const cacheHit =
    body && typeof body === 'object'
      ? Boolean(body.reusedLinkedinGrade) || body.linkedinGradeDate != null
      : null;

  return {
    resumeName,
    durationMs,
    durationSec: durationMs / 1000,
    status: response.status,
    cacheHit,
    error: null,
  };
}

// -- Statistics helpers (reuse staging-cache-perf-probe.mjs:151-175) ----------

function percentile(sortedSamples, p) {
  // Nearest-rank percentile, 1-indexed (Wikipedia "nearest-rank method").
  if (sortedSamples.length === 0) return NaN;
  const rank = Math.ceil((p / 100) * sortedSamples.length);
  const idx = Math.min(Math.max(rank, 1), sortedSamples.length) - 1;
  return sortedSamples[idx];
}

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) {
    return { n: 0, min: NaN, max: NaN, mean: NaN, stddev: NaN, p50: NaN, p95: NaN, p99: NaN };
  }
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sum / n;
  const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
  return {
    n,
    min: sorted[0],
    max: sorted[n - 1],
    mean,
    stddev: Math.sqrt(variance),
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

function fmtSec(ms) {
  return (ms / 1000).toFixed(2);
}

// -- Resume Loading (reuse validate-performance.mjs:506-525) ------------------

function loadResumes() {
  const resumeDir = path.join(PROJECT_ROOT, 'scripts/test-resumes');
  const resumeFiles = ['short.txt', 'medium.txt', 'long.txt'];
  const resumes = [];

  for (const file of resumeFiles) {
    const filePath = path.join(resumeDir, file);
    if (!fs.existsSync(filePath)) {
      console.error(`Missing test resume file. Expected scripts/test-resumes/${file}`);
      process.exit(1);
    }
    const text = fs.readFileSync(filePath, 'utf8');
    const name = path.basename(file, '.txt');
    resumes.push({ name, text });
    console.log(`Loaded resume: ${name} (${text.length} chars, ${text.split('\n').length} lines)`);
  }

  return resumes;
}

// -- Cooldown helper (reuse validate-performance.mjs:529-531) -----------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// -- Markdown evidence append (shape per staging-cache-perf-probe.mjs:182-209) -

function appendEvidence(outputPath, payload) {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const { timestamp, env, mode, label, warmup, cooldown, runs, s, errorCount } = payload;
  const labelStr = label ? ` - ${label}` : '';

  const section = [
    '',
    `## Career Compass PERF-04 capture${labelStr} (${mode})`,
    '',
    `Probe run: ${timestamp}  (env: ${env}, mode: ${mode}, runs: ${s.n}, warmup: ${warmup}, cooldown: ${cooldown}s)`,
    `Errors: ${errorCount}/${runs}`,
    '',
    '| timestamp | env | mode | label | runs | warmup | min (s) | mean (s) | p50 (s) | p95 (s) | p99 (s) | max (s) |',
    '|-----------|-----|------|-------|------|--------|---------|----------|---------|---------|---------|---------|',
    `| ${timestamp} | ${env} | ${mode} | ${label || '-'} | ${s.n} | ${warmup} | ${fmtSec(s.min)} | ${fmtSec(s.mean)} | ${fmtSec(s.p50)} | ${fmtSec(s.p95)} | ${fmtSec(s.p99)} | ${fmtSec(s.max)} |`,
    '',
    `_Probe: \`node scripts/validate-career-performance.mjs --env ${env} --runs ${s.n}${mode === 'deterministic' ? ' --deterministic' : ''}${warmup ? ' --warmup' : ''}\`_`,
    '',
    '_AWAITING OPERATOR RUN: this row is appended by an actual staging run. No numbers are fabricated by the authoring agent._',
    '',
  ].join('\n');

  fs.appendFileSync(outputPath, section, 'utf8');
  console.log(`Evidence appended to ${outputPath}`);
}

// -- Main Orchestration -------------------------------------------------------

async function main() {
  console.log('=== Career Compass Performance Probe (PERF-04, JSON not SSE) ===\n');

  const config = parseArgs();
  const mode = config.deterministic ? 'deterministic' : 'end-to-end';
  console.log(`Environment:    ${config.env} (staging-only)`);
  console.log(`Mode:           ${mode}`);
  console.log(`Runs:           ${config.runs}`);
  console.log(`Cooldown:       ${config.cooldown}s`);
  console.log(`Warm-up:        ${config.warmup ? 'yes' : 'no'}`);
  console.log(`Label:          ${config.label || '(none)'}`);
  console.log(`Output:         ${config.output}\n`);

  const { url: supabaseUrl, anonKey } = validateEnvVars(config.env);
  console.log(`Supabase URL: ${supabaseUrl}\n`);

  const resumes = loadResumes();
  console.log('');

  const { accessToken, userId } = await authenticate(supabaseUrl, anonKey);
  console.log('');

  // analyze-career is FILE-BASED: a live run REQUIRES a seeded resumeFilePath.
  if (!config.resumePath) {
    console.error('ERROR: analyze-career is FILE-BASED -- it requires --resume-path <staging resumes-bucket path>.');
    console.error('Unlike analyze-resume (text input), raw resume text does NOT pass validation (HTTP 400 "Resume file is required").');
    console.error('Seed a resume file in the staging `resumes` bucket, then pass its path, e.g.:');
    console.error('  --resume-path "<user-id>/<file>.pdf" [--linkedin-text "<linkedin text>"]');
    console.error('Note: the deterministic cache-serving latency is otherwise represented by the shared analysis_cache');
    console.error('lookup (scripts/staging-cache-perf-probe.mjs) -- both analyze-resume and analyze-career read that table.');
    process.exit(1);
  }

  // In deterministic mode, re-run the SAME single input so the analyze-career
  // cache precheck serves a cached JSON response (the clean regression signal).
  // In end-to-end mode, cycle through short/medium/long for breadth.
  const fixedResume = resumes[0]; // short -- smallest fresh-cost footprint

  // Warm-up (discarded). In deterministic mode the warm-up ALSO primes the cache
  // so the measured runs are all cache hits.
  if (config.warmup) {
    console.log('--- Warm-up (discarded) ---');
    const warmupResume = config.deterministic ? fixedResume : resumes[0];
    const w = await measureRun(supabaseUrl, accessToken, anonKey, warmupResume.text, warmupResume.name, userId, config.resumePath, config.linkedinText);
    if (w.error) {
      console.log(`  -> Warm-up error: ${w.error}`);
    } else {
      console.log(`  -> ${w.durationSec.toFixed(2)}s (status ${w.status}, cacheHit=${w.cacheHit})`);
    }
    await sleep(config.cooldown * 1000);
    console.log('Warm-up complete.\n');
  }

  console.log('--- Measurement Runs ---');
  const allResults = [];
  const samplesMs = [];

  for (let run = 1; run <= config.runs; run++) {
    const resume = config.deterministic ? fixedResume : resumes[(run - 1) % resumes.length];
    console.log(`[Run ${run}/${config.runs}] ${resume.name} (${mode}) ...`);

    const result = await measureRun(supabaseUrl, accessToken, anonKey, resume.text, resume.name, userId, config.resumePath, config.linkedinText);
    allResults.push(result);

    if (result.error) {
      console.log(`  -> ERROR: ${result.error} (${result.durationSec.toFixed(2)}s)`);
    } else {
      console.log(`  -> ${result.durationSec.toFixed(2)}s (status ${result.status}, cacheHit=${result.cacheHit})`);
      samplesMs.push(result.durationMs);
    }

    if (run < config.runs) {
      await sleep(config.cooldown * 1000);
    }
  }

  console.log('\n--- Results Summary ---');

  const errorCount = allResults.filter((r) => r.error).length;
  if (samplesMs.length === 0) {
    console.error('\nAll runs failed. Check authentication, environment, and edge function status.');
    process.exit(1);
  }

  const s = stats(samplesMs);
  console.log('');
  console.log('| metric | seconds |');
  console.log('|--------|---------|');
  console.log(`| n      | ${s.n} |`);
  console.log(`| min    | ${fmtSec(s.min)} |`);
  console.log(`| mean   | ${fmtSec(s.mean)} |`);
  console.log(`| p50    | ${fmtSec(s.p50)} |`);
  console.log(`| p95    | ${fmtSec(s.p95)} |`);
  console.log(`| p99    | ${fmtSec(s.p99)} |`);
  console.log(`| max    | ${fmtSec(s.max)} |`);
  console.log('');
  console.log(`Errors: ${errorCount}/${config.runs}`);
  console.log('');
  console.log('NOTE: PERF-04 verdict (no-regression / claimable-gain) is decided in the');
  console.log('Task-3 report by comparing before vs after captures; a claimed gain must');
  console.log('clear the run-to-run variance band (Pitfall 4), else "no claimable gain".');

  appendEvidence(config.output, {
    timestamp: new Date().toISOString(),
    env: config.env,
    mode,
    label: config.label,
    warmup: config.warmup,
    cooldown: config.cooldown,
    runs: config.runs,
    s,
    errorCount,
  });
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
