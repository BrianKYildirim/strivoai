/**
 * Tier-output validation harness for resume (and future features).
 *
 * Opt-in via `RUN_TIER_VALIDATION=1`. Without the env flag, all tests
 * are silently ignored -- no Anthropic calls, no cost.
 *
 * Estimated cost per run: ~$0.05 (two live Anthropic calls: Free + Elite).
 *
 * Closes TEST-09 (field-presence on live model) and TEST-10 (Free token
 * count < 50 % of Elite). The snapshot fixture file is populated on the
 * first successful live run -- the developer must commit that snapshot.
 *
 * @see D-14 (tier-output validation harness)
 * @see D-15 (cost-protection: env-gated skip)
 * @see D-16 (snapshot fixture for trend tracking)
 */

import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { loadPromptVariant } from './tier-prompts.ts';
import './resume-prompts.ts'; // side-effect: registers 'resume' feature
import './career-prompts.ts'; // side-effect: registers 'career' feature
import { getTimeout, getModel } from './tier-config.ts';
import { invokeAnthropicText } from './anthropic.ts';
import type { PromptParams } from './resume-prompts.ts';
import type { CareerPromptParams } from './career-prompts.ts';

// ---------------------------------------------------------------------------
// Env gate (D-15 cost protection)
// ---------------------------------------------------------------------------

const RUN_LIVE = Deno.env.get('RUN_TIER_VALIDATION') === '1';
const skip = !RUN_LIVE;

// ---------------------------------------------------------------------------
// Resume fixture text
// ---------------------------------------------------------------------------

const resumeText = await Deno.readTextFile(
  new URL('../../../scripts/test-resumes/medium.txt', import.meta.url),
);

// ---------------------------------------------------------------------------
// Common PromptParams (deterministic -- no dynamic fields)
// ---------------------------------------------------------------------------

const wordCount = resumeText.split(/\s+/).length;
const bulletCount = (resumeText.match(/^[\s]*[-*]/gm) || []).length;
const numberCount = (resumeText.match(/\d+/g) || []).length;

const params: PromptParams = {
  isElite: false,
  tier: 'free',
  currentDate: new Date().toISOString().slice(0, 10),
  wordCount,
  bulletCount,
  numberCount,
  hasEducation: /education/i.test(resumeText),
  hasSkillsSection: /skills/i.test(resumeText),
  experienceYears: [],
  targetRole: '',
  targetIndustry: '',
};

// ---------------------------------------------------------------------------
// Fixture persistence (D-16 snapshot)
// ---------------------------------------------------------------------------

const fixturePath = new URL(
  './tier-validation-fixtures/resume.json',
  import.meta.url,
);

interface FixtureEntry {
  freeTokens: number;
  eliteTokens: number;
  ratio: number;
  timestamp: string;
}

async function readFixture(): Promise<Record<string, FixtureEntry>> {
  try {
    return JSON.parse(await Deno.readTextFile(fixturePath));
  } catch {
    return {};
  }
}

async function writeFixture(data: unknown): Promise<void> {
  await Deno.writeTextFile(fixturePath, JSON.stringify(data, null, 2));
}

// ---------------------------------------------------------------------------
// Locked fields for Free tier (RES-02)
// ---------------------------------------------------------------------------

const FREE_LOCKED_FIELDS = [
  'rewriteSuggestions',
  'industryGuess',
  'suggestedTargetRoles',
  'recommendedKeywords',
  'interviewLikelihood',
  'competitiveRanking',
  'recruiterFirstImpressions',
  'hiddenWeaknesses',
  'powerPhrases',
  'detailedATSGapAnalysis',
  'eliteInsights',
];

// ---------------------------------------------------------------------------
// Rough token estimator (fallback when usage metadata is unavailable)
// ---------------------------------------------------------------------------

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// TEST-09: Free variant omits all locked fields (live Anthropic call)
// ---------------------------------------------------------------------------

Deno.test({
  name: 'TEST-09 resume Free variant omits all locked fields (live)',
  ignore: skip,
  async fn() {
    const freeParams: PromptParams = { ...params, tier: 'free', isElite: false };
    const prompt = loadPromptVariant('resume', 'free', freeParams);
    const response = await invokeAnthropicText({
      model: getModel('free', 'resume'),
      system: prompt,
      messages: [{ role: 'user', content: resumeText }],
      maxTokens: 6000,
      timeoutMs: getTimeout('free', 'core'),
    });

    assert(response.ok, `Anthropic call failed: ${'error' in response ? response.error : 'unknown'}`);
    if (!response.ok) return; // type narrowing

    const parsed = JSON.parse(response.text);
    for (const field of FREE_LOCKED_FIELDS) {
      assertEquals(
        parsed[field],
        undefined,
        `Free response must not include '${field}'`,
      );
    }
  },
});

// ---------------------------------------------------------------------------
// TEST-10: Free token count < 50% of Elite (live, snapshot)
// ---------------------------------------------------------------------------

Deno.test({
  name: 'TEST-10 resume Free token count < 50% of Elite (live, snapshot)',
  ignore: skip,
  async fn() {
    const freeParams: PromptParams = { ...params, tier: 'free', isElite: false };
    const eliteParams: PromptParams = { ...params, tier: 'elite', isElite: true };

    const freePrompt = loadPromptVariant('resume', 'free', freeParams);
    const elitePrompt = loadPromptVariant('resume', 'elite', eliteParams);

    const [freeResp, eliteResp] = await Promise.all([
      invokeAnthropicText({
        model: getModel('free', 'resume'),
        system: freePrompt,
        messages: [{ role: 'user', content: resumeText }],
        maxTokens: 6000,
        timeoutMs: getTimeout('free', 'core'),
      }),
      invokeAnthropicText({
        model: getModel('elite', 'resume'),
        system: elitePrompt,
        messages: [{ role: 'user', content: resumeText }],
        maxTokens: 20000,
        timeoutMs: getTimeout('elite', 'core'),
      }),
    ]);

    assert(freeResp.ok, `Free Anthropic call failed: ${'error' in freeResp ? freeResp.error : 'unknown'}`);
    assert(eliteResp.ok, `Elite Anthropic call failed: ${'error' in eliteResp ? eliteResp.error : 'unknown'}`);
    if (!freeResp.ok || !eliteResp.ok) return; // type narrowing

    const freeTokens = (freeResp.raw?.usage?.output_tokens as number | undefined) ?? estimateTokens(freeResp.text);
    const eliteTokens = (eliteResp.raw?.usage?.output_tokens as number | undefined) ?? estimateTokens(eliteResp.text);

    // Write snapshot (D-16)
    const fixture = await readFixture();
    fixture['resume'] = {
      freeTokens,
      eliteTokens,
      ratio: freeTokens / eliteTokens,
      timestamp: new Date().toISOString(),
    };
    await writeFixture(fixture);

    assert(
      freeTokens < 0.5 * eliteTokens,
      `GATE-09: Free ${freeTokens} must be < 50% of Elite ${eliteTokens} (ratio: ${(freeTokens / eliteTokens).toFixed(3)})`,
    );
  },
});

// ---------------------------------------------------------------------------
// Locked fields for Career Free tier (CC-02)
// ---------------------------------------------------------------------------

const CAREER_FREE_LOCKED_FIELDS = [
  'skillGaps',
  'salaryProgression',
  'compensationIntelligence',
  'smartApplicationStrategy',
];

// ---------------------------------------------------------------------------
// Career fixture params (deterministic -- no dynamic fields)
// ---------------------------------------------------------------------------

const careerParams: CareerPromptParams = {
  currentDate: new Date().toISOString().slice(0, 10),
  domain: 'Technology',
  domainConfidence: 0.85,
  domainEvidence: ['software', 'engineering', 'development'],
  secondaryDomains: [{ domain: 'Data Science', confidence: 0.45 }],
  uniqueRoles: ['Software Engineer', 'Senior Developer'],
  uniqueFields: ['Software Engineering', 'Web Development'],
  domainConfig: {
    roles: ['Software Engineer', 'Senior Developer', 'Tech Lead'],
    fields: ['Software Engineering', 'Web Development', 'Cloud Computing'],
  },
};

// ---------------------------------------------------------------------------
// TEST-09 career: Free variant omits all locked fields (live)
// ---------------------------------------------------------------------------

Deno.test({
  name: 'TEST-09 career Free variant omits all locked fields (live)',
  ignore: skip,
  async fn() {
    const prompt = loadPromptVariant('career', 'free', careerParams);
    const response = await invokeAnthropicText({
      model: getModel('free', 'career'),
      system: prompt,
      messages: [{ role: 'user', content: resumeText }],
      maxTokens: 6000,
      timeoutMs: getTimeout('free'),
    });

    assert(response.ok, `Anthropic call failed: ${'error' in response ? response.error : 'unknown'}`);
    if (!response.ok) return; // type narrowing

    const parsed = JSON.parse(response.text);
    for (const field of CAREER_FREE_LOCKED_FIELDS) {
      assertEquals(
        parsed[field],
        undefined,
        `Career Free response must not include '${field}'`,
      );
    }
  },
});

// ---------------------------------------------------------------------------
// TEST-10 career: Free token count < 50% of Elite (live, snapshot)
// ---------------------------------------------------------------------------

Deno.test({
  name: 'TEST-10 career Free token count < 50% of Elite (live, snapshot)',
  ignore: skip,
  async fn() {
    const freePrompt = loadPromptVariant('career', 'free', careerParams);
    const elitePrompt = loadPromptVariant('career', 'elite', careerParams);

    const [freeResp, eliteResp] = await Promise.all([
      invokeAnthropicText({
        model: getModel('free', 'career'),
        system: freePrompt,
        messages: [{ role: 'user', content: resumeText }],
        maxTokens: 6000,
        timeoutMs: getTimeout('free'),
      }),
      invokeAnthropicText({
        model: getModel('elite', 'career'),
        system: elitePrompt,
        messages: [{ role: 'user', content: resumeText }],
        maxTokens: 20000,
        timeoutMs: getTimeout('elite'),
      }),
    ]);

    assert(freeResp.ok, `Career Free Anthropic call failed: ${'error' in freeResp ? freeResp.error : 'unknown'}`);
    assert(eliteResp.ok, `Career Elite Anthropic call failed: ${'error' in eliteResp ? eliteResp.error : 'unknown'}`);
    if (!freeResp.ok || !eliteResp.ok) return; // type narrowing

    const freeTokens = (freeResp.raw?.usage?.output_tokens as number | undefined) ?? estimateTokens(freeResp.text);
    const eliteTokens = (eliteResp.raw?.usage?.output_tokens as number | undefined) ?? estimateTokens(eliteResp.text);

    // Write career snapshot (D-16)
    const fixture = await readFixture();
    fixture['career'] = {
      freeTokens,
      eliteTokens,
      ratio: freeTokens / eliteTokens,
      timestamp: new Date().toISOString(),
    };
    await writeFixture(fixture);

    assert(
      freeTokens < 0.5 * eliteTokens,
      `GATE-09 career: Free ${freeTokens} must be < 50% of Elite ${eliteTokens} (ratio: ${(freeTokens / eliteTokens).toFixed(3)})`,
    );
  },
});
