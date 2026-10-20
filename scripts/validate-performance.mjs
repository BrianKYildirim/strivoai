#!/usr/bin/env node
/**
 * Performance Validation Script for Phase 6
 *
 * Runs a structured benchmark suite against the deployed analyze-resume edge function.
 * Measures wall-clock time from request sent to final SSE 'complete' event received.
 * Estimates per-run cost from CALL_CONFIGS maxTokens and Anthropic Sonnet 4 pricing.
 * Generates a markdown report at the specified output path.
 *
 * Usage:
 *   node scripts/validate-performance.mjs --env staging --runs 3 --cooldown 8 --warmup
 *
 * Required env vars:
 *   SUPABASE_URL_STAGING / SUPABASE_URL_PRODUCTION
 *   SUPABASE_ANON_KEY_STAGING / SUPABASE_ANON_KEY_PRODUCTION
 *   PERF_TEST_EMAIL
 *   PERF_TEST_PASSWORD
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ── Anthropic Sonnet 4 Pricing (verified 2026-03-22) ──────────────────────
const PRICING = {
  inputPerMTok: 3.0,
  outputPerMTok: 15.0,
  cacheWritePerMTok: 3.75,
  cacheReadPerMTok: 0.30,
};

// ── CALL_CONFIGS mirror from analyze-resume/index.ts ───────────────────────
const CALL_CONFIGS = [
  { callType: 'criteria-1', maxTokensFree: 1800, maxTokensElite: 2200 },
  { callType: 'criteria-2', maxTokensFree: 1800, maxTokensElite: 2200 },
  { callType: 'summary',    maxTokensFree: 2500, maxTokensElite: 3200 },
];

// ── Environment configs ────────────────────────────────────────────────────
const ENV_CONFIGS = {
  staging: {
    urlVar: 'SUPABASE_URL_STAGING',
    keyVar: 'SUPABASE_ANON_KEY_STAGING',
    defaultUrl: 'https://cimjltzovkahkqecpwgi.supabase.co',
  },
  production: {
    urlVar: 'SUPABASE_URL_PRODUCTION',
    keyVar: 'SUPABASE_ANON_KEY_PRODUCTION',
    defaultUrl: 'https://zjpjapgraoxdukdvpjes.supabase.co',
  },
};

// ── Speed thresholds ───────────────────────────────────────────────────────
const SPEED_MIN_SEC = 35;
const SPEED_MAX_SEC = 50;
const PASS_RATE_THRESHOLD = 0.80;
const COST_CEILING = 0.10;
const SUSPICIOUS_FAST_SEC = 5;

// ── CLI Argument Parsing ───────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    env: null,
    runs: 3,
    cooldown: 8,
    warmup: false,
    output: path.join(PROJECT_ROOT, '.planning/phases/06-performance-validation/06-VALIDATION.md'),
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
      case '--output':
        config.output = args[++i];
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

  if (!config.env || !['staging', 'production'].includes(config.env)) {
    console.error('Error: --env must be "staging" or "production"');
    printUsage();
    process.exit(1);
  }

  if (isNaN(config.runs) || config.runs < 1) {
    console.error('Error: --runs must be a positive integer');
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
Usage: node scripts/validate-performance.mjs [options]

Options:
  --env staging|production   Target environment (required)
  --runs N                   Number of runs per resume/tier combination (default: 3)
  --cooldown N               Seconds between runs (default: 8)
  --warmup                   Run 1 warm-up per tier before measurement
  --output PATH              Report output path (default: .planning/phases/06-performance-validation/06-VALIDATION.md)
  --help, -h                 Show this help message

Required environment variables:
  SUPABASE_URL_STAGING          Staging Supabase URL
  SUPABASE_ANON_KEY_STAGING     Staging anon key
  SUPABASE_URL_PRODUCTION       Production Supabase URL
  SUPABASE_ANON_KEY_PRODUCTION  Production anon key
  PERF_TEST_EMAIL               Test user email
  PERF_TEST_PASSWORD            Test user password
`);
}

// ── Environment Variable Validation ────────────────────────────────────────

function validateEnvVars(envName) {
  const envConfig = ENV_CONFIGS[envName];
  const required = [envConfig.keyVar, 'PERF_TEST_EMAIL', 'PERF_TEST_PASSWORD'];
  const missing = required.filter(v => !process.env[v]);

  // URL has a default fallback, but key and credentials are required
  if (missing.length > 0) {
    console.error(`Error: Missing required environment variables for ${envName}:`);
    missing.forEach(v => console.error(`  - ${v}`));
    console.error('\nSet these variables before running the validation script.');
    process.exit(1);
  }

  const url = process.env[envConfig.urlVar] || envConfig.defaultUrl;
  const anonKey = process.env[envConfig.keyVar];

  return { url, anonKey };
}

// ── Authentication ─────────────────────────────────────────────────────────

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

// ── SSE Measurement ────────────────────────────────────────────────────────

async function measureRun(endpoint, accessToken, anonKey, resumeText, tier, resumeName, userId) {
  const resumeId = `perf-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startMs = Date.now();

  let response;
  try {
    response = await fetch(`${endpoint}/functions/v1/analyze-resume`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'apikey': anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        resumeId,
        resumeText,
        userId,
        tier,
        stream: true,
      }),
    });
  } catch (err) {
    const durationMs = Date.now() - startMs;
    return {
      resumeName,
      tier,
      durationMs,
      durationSec: durationMs / 1000,
      overallScore: null,
      mergeSource: null,
      error: `Fetch failed: ${err.message}`,
    };
  }

  if (!response.ok) {
    const durationMs = Date.now() - startMs;
    let errorMsg = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (body?.error) errorMsg += `: ${body.error}`;
    } catch { /* ignore */ }
    return {
      resumeName,
      tier,
      durationMs,
      durationSec: durationMs / 1000,
      overallScore: null,
      mergeSource: null,
      error: errorMsg,
    };
  }

  // Parse SSE response line-by-line
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = null;
  let sseError = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;

        try {
          const event = JSON.parse(jsonStr);

          if (event.type === 'error') {
            sseError = event.message || 'Unknown SSE error';
            break;
          }

          if (event.type === 'complete') {
            result = event.result;
          }
        } catch {
          // Ignore malformed SSE lines
        }
      }

      if (sseError) break;
    }

    // Process any remaining buffer content
    if (!result && !sseError && buffer.trim()) {
      const line = buffer.trim();
      if (line.startsWith('data: ')) {
        try {
          const event = JSON.parse(line.slice(6).trim());
          if (event.type === 'complete') result = event.result;
          if (event.type === 'error') sseError = event.message;
        } catch { /* ignore */ }
      }
    }
  } catch (err) {
    if (!result) {
      sseError = `Stream read error: ${err.message}`;
    }
  }

  const durationMs = Date.now() - startMs;

  if (sseError) {
    return {
      resumeName,
      tier,
      durationMs,
      durationSec: durationMs / 1000,
      overallScore: null,
      mergeSource: null,
      error: sseError,
    };
  }

  if (!result) {
    return {
      resumeName,
      tier,
      durationMs,
      durationSec: durationMs / 1000,
      overallScore: null,
      mergeSource: null,
      error: 'Stream ended without complete event',
    };
  }

  // Validate parallel path
  const mergeSource = result._mergeSource || 'unknown';
  if (mergeSource !== 'parallel-3') {
    console.warn(`  WARNING: Run used '${mergeSource}' path, not 'parallel-3'`);
  }

  return {
    resumeName,
    tier,
    durationMs,
    durationSec: durationMs / 1000,
    overallScore: result.overallScore ?? null,
    mergeSource,
    error: null,
  };
}

// ── Cost Estimation ────────────────────────────────────────────────────────

function estimateCost(tier) {
  const isElite = tier === 'elite';

  // Estimated token counts per call
  const systemPromptTokens = 2500; // Shared system prompt (estimated)
  const avgUserMessageTokens = 1000; // Average across short/medium/long resumes

  let totalWorstCase = 0;

  for (let i = 0; i < CALL_CONFIGS.length; i++) {
    const config = CALL_CONFIGS[i];
    const maxTokens = isElite ? config.maxTokensElite : config.maxTokensFree;

    // Input cost: user message is always base-rate input
    const userInputCost = (avgUserMessageTokens / 1_000_000) * PRICING.inputPerMTok;

    // System prompt caching: call 0 = cache write, calls 1+ = cache read
    let systemCost;
    if (i === 0) {
      // First call: cache write for system prompt
      systemCost = (systemPromptTokens / 1_000_000) * PRICING.cacheWritePerMTok;
    } else {
      // Subsequent calls: cache read for system prompt
      systemCost = (systemPromptTokens / 1_000_000) * PRICING.cacheReadPerMTok;
    }

    // Output cost: worst case = all maxTokens consumed
    const outputCost = (maxTokens / 1_000_000) * PRICING.outputPerMTok;

    totalWorstCase += userInputCost + systemCost + outputCost;
  }

  // Typical: actual output is 60-70% of maxTokens
  const typical = totalWorstCase * 0.65;

  return {
    tier,
    totalMaxOutputTokens: CALL_CONFIGS.reduce((sum, c) => sum + (isElite ? c.maxTokensElite : c.maxTokensFree), 0),
    worstCase: totalWorstCase,
    typical,
  };
}

// ── Report Generation ──────────────────────────────────────────────────────

function generateReport(runs, config, costEstimates, warnings) {
  const timestamp = new Date().toISOString();
  const totalRuns = runs.length;

  // Speed pass/fail
  const validRuns = runs.filter(r => !r.error);
  const speedPassing = validRuns.filter(r => r.durationSec >= SPEED_MIN_SEC && r.durationSec <= SPEED_MAX_SEC);
  const speedPassCount = speedPassing.length;
  const speedThreshold = Math.ceil(totalRuns * PASS_RATE_THRESHOLD);
  const speedPass = speedPassCount >= speedThreshold;

  // Cost pass/fail
  const freeCost = costEstimates.find(c => c.tier === 'free');
  const eliteCost = costEstimates.find(c => c.tier === 'elite');
  const costPassFree = freeCost.typical < COST_CEILING;
  const costPassElite = eliteCost.typical < COST_CEILING;
  const costPass = costPassFree && costPassElite;

  // Average duration
  const avgDuration = validRuns.length > 0
    ? (validRuns.reduce((sum, r) => sum + r.durationSec, 0) / validRuns.length).toFixed(1)
    : 'N/A';

  // Min/max duration
  const minDuration = validRuns.length > 0
    ? Math.min(...validRuns.map(r => r.durationSec)).toFixed(1)
    : 'N/A';
  const maxDuration = validRuns.length > 0
    ? Math.max(...validRuns.map(r => r.durationSec)).toFixed(1)
    : 'N/A';

  // Build speed results table
  let speedTable = '| # | Resume | Tier | Duration (s) | Score | _mergeSource | In Range |\n';
  speedTable += '|---|--------|------|-------------|-------|--------------|----------|\n';
  runs.forEach((r, i) => {
    const inRange = r.error
      ? 'ERROR'
      : (r.durationSec >= SPEED_MIN_SEC && r.durationSec <= SPEED_MAX_SEC ? 'YES' : 'NO');
    const score = r.overallScore !== null ? r.overallScore : (r.error || 'N/A');
    const source = r.mergeSource || 'N/A';
    const duration = r.error ? `${r.durationSec.toFixed(1)} (ERR)` : r.durationSec.toFixed(1);
    speedTable += `| ${i + 1} | ${r.resumeName} | ${r.tier} | ${duration} | ${score} | ${source} | ${inRange} |\n`;
  });

  // Build cost table
  let costTable = '| Tier | Max Output Tokens | Worst Case | Typical (65%) | Under $0.10 |\n';
  costTable += '|------|-------------------|-----------|---------------|-------------|\n';
  costEstimates.forEach(c => {
    const underBudget = c.typical < COST_CEILING ? 'YES' : 'NO';
    costTable += `| ${c.tier} | ${c.totalMaxOutputTokens} | $${c.worstCase.toFixed(4)} | $${c.typical.toFixed(4)} | ${underBudget} |\n`;
  });

  // Build warnings section
  let warningsSection = '';
  if (warnings.length === 0) {
    warningsSection = 'None';
  } else {
    warningsSection = warnings.map(w => `- ${w}`).join('\n');
  }

  const report = `# Phase 6: Performance Validation Report

**Generated:** ${timestamp}
**Environment:** ${config.env}
**Runs per config:** ${config.runs}
**Cooldown:** ${config.cooldown}s
**Warm-up:** ${config.warmup ? 'yes' : 'no'}

## Summary

| Metric | Target | Actual | Pass/Fail |
|--------|--------|--------|-----------|
| Speed (80% within ${SPEED_MIN_SEC}-${SPEED_MAX_SEC}s) | ${speedThreshold}/${totalRuns} | ${speedPassCount}/${totalRuns} | ${speedPass ? 'PASS' : 'FAIL'} |
| Cost estimate (typical under $${COST_CEILING.toFixed(2)}) | both tiers | free=$${freeCost.typical.toFixed(4)}, elite=$${eliteCost.typical.toFixed(4)} | ${costPass ? 'PASS' : 'FAIL'} |

**Speed stats:** avg=${avgDuration}s, min=${minDuration}s, max=${maxDuration}s
**Valid runs:** ${validRuns.length}/${totalRuns} (${totalRuns - validRuns.length} errors)

## Speed Results

${speedTable}

## Cost Estimates

${costTable}

Note: Cost estimates are based on CALL_CONFIGS maxTokens and Anthropic Sonnet 4 pricing ($3/MTok input, $15/MTok output, cache write $3.75/MTok, cache read $0.30/MTok). Cross-reference with Anthropic dashboard for actual token usage. Typical estimate assumes actual output is 65% of maxTokens budget.

## Warnings

${warningsSection}

## Raw Data

\`\`\`json
${JSON.stringify(runs, null, 2)}
\`\`\`
`;

  // Ensure output directory exists
  const outputDir = path.dirname(config.output);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(config.output, report, 'utf8');
  console.log(`\nReport written to: ${config.output}`);

  return { speedPass, costPass, speedPassCount, speedThreshold, totalRuns };
}

// ── Resume Loading ─────────────────────────────────────────────────────────

function loadResumes() {
  const resumeDir = path.join(PROJECT_ROOT, 'scripts/test-resumes');
  const resumeFiles = ['short.txt', 'medium.txt', 'long.txt'];
  const resumes = [];

  for (const file of resumeFiles) {
    const filePath = path.join(resumeDir, file);
    if (!fs.existsSync(filePath)) {
      console.error(`Missing test resume files. Expected scripts/test-resumes/${file}`);
      console.error('Run Task 1 of the plan first to create test resume files.');
      process.exit(1);
    }
    const text = fs.readFileSync(filePath, 'utf8');
    const name = path.basename(file, '.txt');
    resumes.push({ name, text });
    console.log(`Loaded resume: ${name} (${text.length} chars, ${text.split('\n').length} lines)`);
  }

  return resumes;
}

// ── Cooldown helper ────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Main Orchestration ─────────────────────────────────────────────────────

async function main() {
  console.log('=== Performance Validation Script ===\n');

  // Parse CLI args
  const config = parseArgs();
  console.log(`Environment: ${config.env}`);
  console.log(`Runs per config: ${config.runs}`);
  console.log(`Cooldown: ${config.cooldown}s`);
  console.log(`Warm-up: ${config.warmup ? 'yes' : 'no'}`);
  console.log(`Output: ${config.output}\n`);

  // Validate env vars
  const { url: supabaseUrl, anonKey } = validateEnvVars(config.env);
  console.log(`Supabase URL: ${supabaseUrl}\n`);

  // Load test resumes
  const resumes = loadResumes();
  console.log('');

  // Authenticate
  const { accessToken, userId } = await authenticate(supabaseUrl, anonKey);
  console.log('');

  const tiers = ['free', 'elite'];
  const warnings = [];

  // Warm-up runs (if enabled)
  if (config.warmup) {
    console.log('--- Warm-up Runs ---');
    const warmupResume = resumes[0]; // Use short resume for warm-up
    for (const tier of tiers) {
      console.log(`[Warm-up] ${warmupResume.name} / ${tier} ...`);
      const result = await measureRun(
        supabaseUrl, accessToken, anonKey,
        warmupResume.text, tier, warmupResume.name, userId
      );
      if (result.error) {
        console.log(`  -> Warm-up error: ${result.error}`);
      } else {
        console.log(`  -> ${result.durationSec.toFixed(1)}s, score=${result.overallScore}, source=${result.mergeSource}`);
      }
      await sleep(config.cooldown * 1000);
    }
    console.log('Warm-up complete.\n');
  }

  // Measurement runs
  console.log('--- Measurement Runs ---');
  const totalRuns = resumes.length * tiers.length * config.runs;
  const allResults = [];
  let runIndex = 0;

  for (const resume of resumes) {
    for (const tier of tiers) {
      for (let run = 1; run <= config.runs; run++) {
        runIndex++;
        console.log(`[Run ${runIndex}/${totalRuns}] ${resume.name} / ${tier} (run ${run}/${config.runs}) ...`);

        const result = await measureRun(
          supabaseUrl, accessToken, anonKey,
          resume.text, tier, resume.name, userId
        );

        allResults.push(result);

        if (result.error) {
          console.log(`  -> ERROR: ${result.error} (${result.durationSec.toFixed(1)}s)`);
        } else {
          console.log(`  -> ${result.durationSec.toFixed(1)}s, score=${result.overallScore}, source=${result.mergeSource}`);
        }

        // Check for suspiciously fast runs
        if (!result.error && result.durationSec < SUSPICIOUS_FAST_SEC) {
          const warning = `Run ${runIndex} (${resume.name}/${tier}) completed in ${result.durationSec.toFixed(1)}s - possible fixture mode`;
          console.warn(`  WARNING: ${warning}`);
          warnings.push(warning);
        }

        // Cooldown between runs (skip after the last run)
        if (runIndex < totalRuns) {
          await sleep(config.cooldown * 1000);
        }
      }
    }
  }

  console.log('\n--- Results Summary ---');

  // Check for all failures
  const allFailed = allResults.every(r => r.error);
  if (allFailed) {
    console.error('\nAll runs failed. Check authentication, environment, and edge function status.');
  }

  // Check for any fallback path usage
  const fallbackRuns = allResults.filter(r => r.mergeSource && r.mergeSource !== 'parallel-3' && r.mergeSource !== 'unknown');
  if (fallbackRuns.length > 0) {
    const warning = `${fallbackRuns.length} run(s) used fallback path instead of parallel-3`;
    warnings.push(warning);
    console.warn(`WARNING: ${warning}`);
  }

  // Generate cost estimates
  const costEstimates = tiers.map(tier => estimateCost(tier));

  // Generate report
  const { speedPass, costPass, speedPassCount, speedThreshold, totalRuns: total } = generateReport(
    allResults, config, costEstimates, warnings
  );

  // Console summary
  console.log('\n=== VALIDATION RESULTS ===');
  console.log(`Speed: ${speedPassCount}/${total} within ${SPEED_MIN_SEC}-${SPEED_MAX_SEC}s (need ${speedThreshold}) -> ${speedPass ? 'PASS' : 'FAIL'}`);
  console.log(`Cost (free typical):  $${costEstimates[0].typical.toFixed(4)} -> ${costEstimates[0].typical < COST_CEILING ? 'PASS' : 'FAIL'}`);
  console.log(`Cost (elite typical): $${costEstimates[1].typical.toFixed(4)} -> ${costEstimates[1].typical < COST_CEILING ? 'PASS' : 'FAIL'}`);
  console.log(`Overall: ${speedPass && costPass ? 'PASS' : 'FAIL'}`);

  if (warnings.length > 0) {
    console.log(`\nWarnings (${warnings.length}):`);
    warnings.forEach(w => console.log(`  - ${w}`));
  }

  // Exit with appropriate code
  if (allFailed) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
