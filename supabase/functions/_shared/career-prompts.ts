/**
 * Prompt construction module for career compass analysis.
 *
 * Provides per-tier prompt builders for the career readiness evaluator:
 *   - Free: core analysis with restricted output fields + FREE_TIER_SUFFIX
 *   - Pro/Elite core: identity, role, field, and surprise-fit analysis
 *   - Paid growth: skill gaps, readiness detail, and roadmap views
 *   - Elite-extras: compensationIntelligence + smartApplicationStrategy (separate call)
 *
 * Follows the resume-prompts.ts registration pattern (Phase 14).
 * STRIVO_GLOBAL_AI_PRINCIPLES is auto-prepended by the Phase 14 loader
 * for Pro/Elite variants -- NOT manually injected here (D-06).
 *
 * @see D-04 (prompt extraction into shared module)
 * @see D-06 (auto-prepend handled by loader)
 * @see D-07 (defense-in-depth: prompt + server-side shaper)
 */

import { registerFeaturePrompts, type PromptVariantBuilder } from './tier-prompts.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CareerPromptParams {
  currentDate: string;
  domain: string;
  domainConfidence: number;
  domainEvidence: string[];
  secondaryDomains: Array<{ domain: string; confidence: number }>;
  uniqueRoles: string[];
  uniqueFields: string[];
  domainConfig: { roles: string[]; fields: string[] };
}

// ---------------------------------------------------------------------------
// Free tier output constraint (D-07: prompt-level defense)
// ---------------------------------------------------------------------------

const FREE_TIER_SUFFIX = `

IMPORTANT - FREE TIER RESTRICTIONS (quick task 260419-35x):
- Return ONLY: careerDNA (full), ONE careerFields entry, ONE roles entry, surpriseFits (aim for 2, 1 acceptable), roleReadinessBreakdown with ONLY overallScore and targetRole, whatYouHave, roleReadinessScore, targetRole, detectedDomain, domainEvidence.
- DO NOT include: skillGaps, salaryProgression, compensationIntelligence, smartApplicationStrategy.
- DO NOT include readinessVerdict, strengths, gaps, skillAssessments inside roleReadinessBreakdown.
- Keep response under 2500 tokens.`;
// surpriseFits was in this "DO NOT include" list (260419-35x) while the completeness gate
// REQUIRES it for Free (260713-hrd: CAREER_REQUIRED_SECTIONS.free includes 'surpriseFits').
// Two locked decisions in direct conflict: the model was ordered NOT to produce the exact
// section the server then rejected the report for lacking, so Free Career Compass 422'd on
// EVERY real-AI run. Operator decision (2026-07-15) resolves it in favor of producing the
// section: Free keeps surpriseFits (the validator's source of truth), everything else in the
// narrower Free scope is unchanged. Verified live on Preview.

// ---------------------------------------------------------------------------
// Shared core prompt builder
// ---------------------------------------------------------------------------

/**
 * Builds the core career readiness evaluator system prompt.
 * Extracted from analyze-career/index.ts lines 831-851.
 *
 * @param params - Domain classification results and date
 * @param jsonSkeleton - Tier-specific JSON skeleton string
 * @param brevityBlock - Tier-specific brevity instructions
 * @returns The system prompt body (without GLOBAL_AI_PRINCIPLES -- loader handles that)
 */
function _buildCoreCareerPrompt(
  params: CareerPromptParams,
  jsonSkeleton: string,
  brevityBlock: string,
): string {
  const {
    currentDate,
    domain,
    domainConfidence,
    domainEvidence,
    secondaryDomains,
    uniqueRoles,
    uniqueFields,
  } = params;

  const secondaryLine = secondaryDomains.length > 0
    ? `Secondary: ${secondaryDomains.map(d => `${d.domain}(${d.confidence}%)`).join(', ')}`
    : '';

  return `You are Strivo — a recruiter-grade career readiness evaluator. Deliver accurate, personalized career guidance. No generic advice. No job URLs. Reference SPECIFIC resume/LinkedIn content.
TODAY'S DATE: ${currentDate}. Treat any dates up to today as past dates, not future.

RULES: (1) Return honest score no matter what. Don't overinflate or underinflate the score, it must give the user a reality check. An honest score is how we'll build trust. (2) Every recommendation cites actual resume/LinkedIn content — no generic advice. (3) surpriseFits = cross-domain roles ONLY, each >=75% readiness, exactly 3+ specific transferableSkills. (4) careerFields only if matchScore>=75 (up to 5 fields). (5) Roadmap steps name specific courses/certs/companies (e.g. "Google Data Analytics Certificate on Coursera", not "take a data course"). (6) Roles must match actual experience level — no VP/Senior roles for students with 0-1 internships. (7) Include at least 1 Critical-priority skill gap.

DOMAIN: ${domain} (${domainConfidence}%) | Evidence: ${domainEvidence.join(', ')}
${secondaryLine}
Fields: ${uniqueFields.join(', ')}
Roles: ${uniqueRoles.join(', ')}

Recommend roles from ALL relevant domains. Cross-domain discovery is mandatory.

${brevityBlock}

Return ONLY valid JSON:
${jsonSkeleton}

Tone: Direct, professional, recruiter-like. No emojis, no hype.`;
}

// ---------------------------------------------------------------------------
// JSON skeletons per tier
// ---------------------------------------------------------------------------

/**
 * Free skeleton: omits skillGaps, salaryProgression,
 * compensationIntelligence, smartApplicationStrategy.
 */
function _buildFreeJsonSkeleton(params: CareerPromptParams): string {
  const { domain, domainEvidence } = params;
  // surpriseFits restored to the skeleton (operator decision 2026-07-15): the completeness
  // gate requires it for Free (260713-hrd), so the shape must be here or the model has no
  // template to fill and Free 422s on every run. roleReadinessBreakdown stays narrowed to
  // {overallScore, targetRole}; the role includes the required qualification steps.
  return `{"detectedDomain":"${domain}","domainEvidence":${JSON.stringify(domainEvidence)},"roleReadinessScore":0,"targetRole":"","careerDNA":"4 sentences: identity, skills, achievements, differentiator. Personal, evidence-based.","whatYouHave":["from resume"],"roleReadinessBreakdown":{"overallScore":0,"targetRole":""},"careerFields":[{"title":"","matchScore":0,"whyMatch":"cite specific resume/LinkedIn evidence","whyMatchDetails":["evidence 1","evidence 2","evidence 3"],"requiredSkills":[""],"salaryRange":"","industryOutlook":"","timeline":"","recommendedRoles":[""]}],"surpriseFits":[{"role":"MUST be outside primary domain","readinessScore":0,"whySurprising":"cite specific cross-domain evidence","transferableSkills":["skill1","skill2","skill3"]}],"roles":[{"title":"","description":"","averageSalary":"","skillAlignmentScore":0,"qualificationSteps":[""]}]}`;
}

/**
 * Pro skeleton: includes skillGaps, salaryProgression, and a roleReadinessBreakdown
 * carrying the full paid readiness contract.
 * Omits compensationIntelligence, smartApplicationStrategy (Elite-only).
 * The retired Resume Improvements field has been removed entirely (D-06).
 */
function _buildProJsonSkeleton(params: CareerPromptParams): string {
  void params;
  return _buildPaidCoreJsonSkeleton();
}

/**
 * Elite base skeleton: same as Pro (elite-extras come from separate call).
 * compensationIntelligence + smartApplicationStrategy are NOT in this skeleton.
 */
function _buildEliteJsonSkeleton(params: CareerPromptParams): string {
  // Elite base call produces same fields as Pro -- the elite-extras call adds the rest
  return _buildProJsonSkeleton(params);
}

/** Paid core envelope after the provider rejected the 56-property base grammar. */
function _buildPaidCoreJsonSkeleton(): string {
  return `{"roleReadinessScore":0,"targetRole":"","careerDNA":"4 sentences: identity, skills, achievements, differentiator. Personal, evidence-based.","whatYouHave":["from resume"],"careerFields":[{"title":"","matchScore":0,"whyMatch":"cite specific resume/LinkedIn evidence","whyMatchDetails":["evidence 1","evidence 2","evidence 3"],"requiredSkills":[""],"salaryRange":"","industryOutlook":"","timeline":"","recommendedRoles":[""]}],"surpriseFits":[{"role":"MUST be outside primary domain","readinessScore":0,"whySurprising":"cite specific cross-domain evidence","transferableSkills":["skill1","skill2","skill3"]}],"roles":[{"title":"","description":"","averageSalary":"","skillAlignmentScore":0,"skillGaps":[""],"qualificationSteps":[""]}]}`;
}

function _buildGrowthJsonSkeleton(): string {
  return `{"skillGaps":[{"skill":"","priority":"Critical|High|Medium","action":"specific named resource or certification"}],"roleReadinessBreakdown":{"overallScore":0,"targetRole":"","industryBenchmark":"","strengths":["cite evidence from resume/LinkedIn"],"gaps":["vs industry standard"],"skillAssessments":[{"skill":"","yourLevel":"Beginner|Intermediate|Advanced","industryExpectation":"Basic|Intermediate|Advanced","gap":"None|Minor|Moderate|Major|Exceeds"}],"readinessVerdict":""},"roleRoadmaps":[{"role":"","steps":[{"phase":"Months 1-2","category":"Foundation & Quick Wins","items":["specific named course/cert/action 1","specific action 2","specific action 3"]},{"phase":"Months 3-4","category":"Skill Building & Projects","items":["specific action 1","specific action 2","specific action 3"]},{"phase":"Months 5-7","category":"Experience & Portfolio","items":["specific action 1","specific action 2","specific action 3"]},{"phase":"Months 8-10","category":"Networking & Applications","items":["specific action 1","specific action 2","specific action 3"]},{"phase":"Months 11-12","category":"Interview Prep & Launch","items":["specific action 1","specific action 2","specific action 3"]}]}],"roadmap":[{"category":"Courses & Education","items":[""]},{"category":"Projects & Portfolio","items":[""]},{"category":"Certifications","items":[""]},{"category":"Soft Skills","items":[""]},{"category":"Networking Strategy","items":[""]},{"category":"Resume Optimization","items":[""]}]}`;
}

// ---------------------------------------------------------------------------
// Brevity blocks per tier
// ---------------------------------------------------------------------------

const FREE_BREVITY = `BREVITY CRITICAL — keep ENTIRE response under 2500 tokens:
- careerDNA: 4 sentences | whatYouHave: 3 items
- careerFields: 1 entry (>=75% match) | surpriseFits: aim for 2 entries, 1 is acceptable if only one genuine cross-domain fit exists (all >=75% readiness, >=3 transferableSkills each)
- roleReadinessBreakdown: overallScore, targetRole, readinessVerdict ONLY`;
// surpriseFits originally said "1 entry" while the server floor was 2 — a guaranteed
// self-inflicted 422. The floor is now 1 (operator decision, see
// CAREER_SURPRISE_FITS_MIN), so ask the model to AIM for 2 but explicitly permit 1 rather
// than forcing a low-quality padded second fit. Verified live on Preview with real AI.

const PRO_BREVITY = `BREVITY CRITICAL — keep ENTIRE response under 3500 tokens:
- careerDNA: 4 sentences | whatYouHave: 3 items | skillGaps: 4 items (include 1 Critical)
- careerFields: 3-5 (all >=75% match) | surpriseFits: 2-3 (all >=75% readiness, >=3 transferableSkills each; 1 acceptable if only one genuine cross-domain fit exists) | roleRoadmaps: 3 roles, 5 phases x 3-5 items
- skillAssessments: 6 max
- salaryProgression: 3-5 roles with entry/mid/senior ranges`;

const ELITE_BREVITY = `BREVITY CRITICAL — keep ENTIRE response under 3500 tokens:
- careerDNA: 4 sentences | whatYouHave: 3 items | skillGaps: 4 items (include 1 Critical)
- careerFields: 3-5 (all >=75% match) | surpriseFits: 2-3 (all >=75% readiness, >=3 transferableSkills each; 1 acceptable if only one genuine cross-domain fit exists) | roleRoadmaps: 3 roles, 5 phases x 3-5 items
- skillAssessments: 6 max
- salaryProgression: 3-5 roles with entry/mid/senior ranges`;

const PAID_CORE_BREVITY = `BREVITY CRITICAL — keep ENTIRE response under 2200 tokens:
- careerDNA: 4 sentences | whatYouHave: 3 items
- careerFields: EXACTLY 3 (all >=75% match) | surpriseFits: EXACTLY 2-3 | roles: EXACTLY 3
- Do NOT emit skillGaps, roleReadinessBreakdown, roadmap, roleRoadmaps, compensationIntelligence, or smartApplicationStrategy.`;

// ---------------------------------------------------------------------------
// Tier-specific prompt builders (Phase 17 -- CC-01..CC-04)
// ---------------------------------------------------------------------------

/**
 * Free tier prompt builder. Returns the core career analysis prompt with
 * a restricted JSON skeleton (no skillGaps, salaryProgression,
 * compensationIntelligence, smartApplicationStrategy) and FREE_TIER_SUFFIX
 * instructing the model to omit locked fields (CC-01/CC-02).
 */
export function buildFreeCareerPrompt(params: CareerPromptParams): string {
  return _buildCoreCareerPrompt(params, _buildFreeJsonSkeleton(params), FREE_BREVITY) + FREE_TIER_SUFFIX;
}

/**
 * Pro tier core prompt builder. Growth and compensation are generated by their
 * own constrained envelopes. CC-03.
 */
export function buildProCareerPrompt(params: CareerPromptParams): string {
  return _buildCoreCareerPrompt(params, _buildPaidCoreJsonSkeleton(), PAID_CORE_BREVITY);
}

/**
 * Elite tier core prompt builder. Growth and Elite extras are generated by their
 * own constrained envelopes. CC-04.
 */
export function buildEliteCareerPrompt(params: CareerPromptParams): string {
  return _buildCoreCareerPrompt(params, _buildPaidCoreJsonSkeleton(), PAID_CORE_BREVITY);
}

/** Paid growth envelope: readiness detail, skill gaps, and both roadmap views. */
export function buildCareerGrowthPrompt(params: CareerPromptParams): string {
  const { currentDate, domain, domainConfidence, domainEvidence, uniqueRoles } = params;
  return `You are Strivo — generating the paid Career Compass growth plan for a profile that is analyzed in a separate call. Do not repeat Career DNA, fields, roles, surprise fits, compensation, or application strategy.
TODAY'S DATE: ${currentDate}. Treat any dates up to today as past dates, not future.

DOMAIN: ${domain} (${domainConfidence}%) | Evidence: ${domainEvidence.join(', ')}
Candidate roles: ${uniqueRoles.join(', ')}

RULES:
- Every gap and action must cite or respond to specific resume/LinkedIn evidence.
- Include at least 1 Critical-priority skill gap.
- roleReadinessBreakdown must provide evidence-based strengths, gaps, and skill assessments.
- Roadmap steps must name specific courses, certifications, projects, or companies.

BREVITY CRITICAL — keep ENTIRE response under 1800 tokens:
- skillGaps: EXACTLY 4
- roleReadinessBreakdown: strengths/gaps 4 items each; skillAssessments 5 max
- roleRoadmaps: EXACTLY 2 roles, 5 phases each, EXACTLY 3 short items per phase
- roadmap: 6 categories, 2 items each

Return ONLY valid JSON:
${_buildGrowthJsonSkeleton()}

Tone: Direct, professional, recruiter-like. No emojis, no hype.`;
}

// ---------------------------------------------------------------------------
// Elite-extras prompt builder (separate parallel call -- D-01)
// ---------------------------------------------------------------------------

/**
 * Elite-extras prompt builder for the third parallel call.
 * Produces compensationIntelligence and smartApplicationStrategy only.
 * Extracted from analyze-career/index.ts lines 795-828.
 *
 * This is NOT part of the PromptVariantBuilder map since it is only used
 * by the elite-extras parallel call (not the primary tier-gated call).
 *
 * @param params - Domain classification results for domain-specific compensation data
 * @returns System prompt for the elite-extras call
 */
export function buildEliteExtrasPrompt(params: CareerPromptParams): string {
  const { domain, domainConfig } = params;

  return `You are Strivo — generating ELITE-TIER COMPENSATION INTELLIGENCE for a career profile that has already been analyzed. Do NOT repeat career analysis. Focus ONLY on compensation and application strategy fields.

=== CRITICAL: DOMAIN-SPECIFIC COMPENSATION ===
ALL compensation, salary, and strategy data MUST be specific to "${domain}".
You MUST use roles from this domain: ${domainConfig.roles.slice(0, 6).join(', ')}
You MUST reference companies/organizations typical in: ${domainConfig.fields.join(', ')}

DO NOT use generic finance/business examples like "Goldman Sachs", "Financial Analyst", "Investment Banking" unless the detected domain is Business & Economics.

1. **Salary Intelligence**: For each recommended role IN ${domain}, provide:
   - Entry-level salary range (realistic for this domain)
   - Mid-level salary range
   - Senior-level salary range
   - User's estimated starting salary based on their profile
   - Percentile ranking (where they'd fall in the pay distribution)
   - ROLES MUST BE FROM: ${domainConfig.roles.slice(0, 4).join(', ')}

2. **Role Transition ROI**: For top 3 career moves WITHIN ${domain}, calculate:
   - Salary increase percentage
   - Time to transition (years)
   - ROI on upskilling investment
   - Difficulty rating (Easy/Moderate/Challenging)
   - Example transitions for ${domain}: ${domainConfig.roles[0] || 'Role A'} -> Senior ${domainConfig.roles[0] || 'Role A'}, ${domainConfig.roles[1] || 'Role B'} -> ${domainConfig.roles[2] || 'Role C'}

3. **Smart Application Strategy**: Analyze which roles to target (ALL must be in ${domain}):
   - APPLY: High match (70%+), good ROI
   - MAYBE: Moderate match (50-69%), needs some prep
   - SKIP: Low match (<50%), not worth time investment
   - Companies must be typical for ${domainConfig.fields.slice(0, 3).join(', ')}

4. **5-Year Earnings Projection**: Estimate career earnings trajectory for ${domain}

Return ONLY valid JSON (no markdown, no text outside JSON) matching this schema:
{"compensationIntelligence":{"salaryBands":[{"role":"","entryLevel":"","midLevel":"","seniorLevel":"","yourEstimate":"","percentile":0}],"roleTransitionROI":[{"from":"","to":"","salaryIncrease":"","timeToTransition":"","roi":"","difficulty":""}],"fiveYearEarnings":"","earningsInsight":""},"smartApplicationStrategy":[{"title":"","company":"","matchScore":0,"recommendation":"apply|maybe|skip","reason":"","competitiveness":"","timeToApply":""}]}

QUALITY GUARDS:
- salaryBands must use realistic domain-specific ranges for ${domain}, not generic numbers.
- roleTransitionROI must describe transitions between roles in ${domainConfig.roles.slice(0, 4).join(', ')}.
- smartApplicationStrategy must target companies and roles in ${domainConfig.fields.slice(0, 3).join(', ')}.
- fiveYearEarnings must be a realistic cumulative estimate for ${domain}.

Tone: Direct, strategic, data-driven. No emojis, no hype.`;
}

// ---------------------------------------------------------------------------
// Feature registration (module-load side effect -- D-04)
// ---------------------------------------------------------------------------

/**
 * Per-tier prompt builder map for the career feature.
 * Consumed by registerFeaturePrompts and available for direct access.
 */
export const CAREER_PROMPT_VARIANTS: PromptVariantBuilder<CareerPromptParams> = {
  free: buildFreeCareerPrompt,
  pro: buildProCareerPrompt,
  elite: buildEliteCareerPrompt,
};

/**
 * Registers the career feature's per-tier prompt builders in the shared
 * tier-prompts loader. After this runs, callers can use:
 *   loadPromptVariant('career', tier, params)
 * to get the correct tier-specific prompt string.
 *
 * This side-effect runs at module load time. It is idempotent.
 */
registerFeaturePrompts('career', CAREER_PROMPT_VARIANTS);

// ---------------------------------------------------------------------------
// 260419-35x: Free-tier single-call budget constant
// ---------------------------------------------------------------------------

/**
 * Max tokens for the free-tier Career Compass single-call path
 * (prior-analyses sourced). Must be <= TIER_MAX_TOKENS.free (6000) AND
 * <= 4000. Exported from this shared module so tests can import the
 * constant without pulling in analyze-career's top-level `serve(...)`
 * side effect.
 */
export const FREE_SINGLE_CALL_MAX_TOKENS = 4000;

// ---------------------------------------------------------------------------
// 260419-35x: Free-tier prior-analyses prompt builder
// ---------------------------------------------------------------------------

export interface FreePriorAnalysesParams {
  resumeAnalysisJson: unknown;
  linkedinGradeJson: unknown;
  currentDate: string;
}

/**
 * Builds the system + user prompts for the free-tier Career Compass single-call
 * path sourced from prior Resume Analysis and LinkedIn Grader results.
 *
 * Unlike the standard free path (which operates off raw resume+linkedin text and
 * runs domain classification), this builder consumes the already-structured
 * prior analysis outputs and instructs the model to emit the locked-down free
 * whitelist only.
 */
export function buildFreePriorAnalysesPrompt(
  params: FreePriorAnalysesParams,
): { system: string; user: string } {
  const { resumeAnalysisJson, linkedinGradeJson, currentDate } = params;

  const MAX_CHARS = 6000;
  const resumeJsonStr = JSON.stringify(resumeAnalysisJson ?? {}, null, 0).slice(0, MAX_CHARS);
  const linkedinJsonStr = JSON.stringify(linkedinGradeJson ?? {}, null, 0).slice(0, MAX_CHARS);

  const system = `You are Strivo — a recruiter-grade career readiness evaluator. You will be given the user's most recent structured Resume Analysis JSON and LinkedIn Grader JSON. Derive Career Compass output from those structured inputs. Do not invent facts not supported by them.
TODAY'S DATE: ${currentDate}. Treat any dates up to today as past dates, not future.

RULES:
(1) Return an honest, calibrated score — do not inflate.
(2) Every careerField / role / roadmap step cites specific evidence from the provided Resume Analysis or LinkedIn JSON.
(3) Roles must match the user's actual experience level per those analyses.
(4) Roadmap steps name specific courses/certs/actions, not generic advice.

Return ONLY valid JSON matching this skeleton:
{"detectedDomain":"","domainEvidence":["evidence from inputs"],"roleReadinessScore":0,"targetRole":"","careerDNA":"4 sentences: identity, skills, achievements, differentiator.","whatYouHave":["from resume"],"roleReadinessBreakdown":{"overallScore":0,"targetRole":""},"careerFields":[{"title":"","matchScore":0,"whyMatch":"cite evidence","whyMatchDetails":["e1","e2","e3"],"requiredSkills":[""],"salaryRange":"","industryOutlook":"","timeline":"","recommendedRoles":[""]}],"roles":[{"title":"","description":"","averageSalary":"","skillAlignmentScore":0}],"roleRoadmaps":[{"role":"","steps":[{"phase":"Months 1-2","category":"Foundation & Quick Wins","items":["specific 1","specific 2","specific 3"]},{"phase":"Months 3-4","category":"Skill Building & Projects","items":["specific 1","specific 2","specific 3"]}]}],"roadmap":[{"category":"Courses & Education","items":[""]},{"category":"Projects & Portfolio","items":[""]},{"category":"Certifications","items":[""]},{"category":"Soft Skills","items":[""]},{"category":"Networking Strategy","items":[""]},{"category":"Resume Optimization","items":[""]}]}

BREVITY CRITICAL — keep ENTIRE response under 2500 tokens:
- careerDNA: 4 sentences | whatYouHave: 3 items
- careerFields: EXACTLY 1 entry (>=75% match)
- roles: EXACTLY 1 entry
- roleRoadmaps: EXACTLY 1 role, first 2 phases x 3-5 items
- roleReadinessBreakdown: overallScore + targetRole ONLY${FREE_TIER_SUFFIX}

Tone: Direct, professional, recruiter-like. No emojis, no hype.`;

  const user = `=== PRIOR RESUME ANALYSIS (JSON, trimmed) ===
${resumeJsonStr}

=== PRIOR LINKEDIN GRADER (JSON, trimmed) ===
${linkedinJsonStr}

Generate Career Compass output strictly per the FREE TIER RESTRICTIONS in the system prompt, sourced from the prior Resume Analysis and LinkedIn Grader results above.`;

  return { system, user };
}
