/**
 * Prompt construction module for parallel resume analysis.
 *
 * Splits the monolith system prompt into a shared prefix (~90% of tokens)
 * and three per-call suffixes (~10%). The shared prefix is byte-identical
 * across all three parallel calls, enabling Anthropic prompt cache hits
 * on the 2nd and 3rd calls within the 5-minute TTL window.
 *
 * Call types:
 *   criteria-1  — scores C1-C6 (50% of total weight)
 *   criteria-2  — scores C7-C11 (50% of total weight)
 *   summary     — narrative fields and rewrites
 *
 * Existing exports consumed by analyze-resume/index.ts:
 *   buildSystemBlocks, buildUserPrompt, buildImprovementContext,
 *   buildFallbackPrompt, type PromptParams, type CallType
 *
 * Phase 14 additions:
 *   buildFreeResumePrompt, buildProResumePrompt, buildEliteResumePrompt,
 *   RESUME_PROMPT_VARIANTS, registerFeaturePrompts side-effect at module load.
 */

import { registerFeaturePrompts, type PromptVariantBuilder } from './tier-prompts.ts';
import type { EliteUnlockSection } from './resume-elite-unlock.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CallType = 'criteria-1' | 'criteria-2' | 'summary' | 'rewrites' | 'elite-extras';

export const ELITE_UNLOCK_DETAILS_CALL_NAME = 'elite-unlock-details';
export const ELITE_UNLOCK_EXTRAS_CALL_NAME = 'elite-unlock-extras';

export interface EliteUnlockPromptParams {
  /** Stored resume text after the existing prompt-sanitizer boundary. */
  sanitizedResumeText: string;
  missingSections: readonly EliteUnlockSection[];
  storedResult: Record<string, unknown>;
}

export interface EliteUnlockPrompt {
  callName:
    | typeof ELITE_UNLOCK_DETAILS_CALL_NAME
    | typeof ELITE_UNLOCK_EXTRAS_CALL_NAME;
  systemPrompt: string;
  userPrompt: string;
  outputSchema: Record<string, unknown>;
}

export interface PromptParams {
  isElite: boolean;
  tier: 'free' | 'pro' | 'elite';  // NEW — added for tier-differentiated prompts
  currentDate: string;
  wordCount: number;
  bulletCount: number;
  numberCount: number;
  hasEducation: boolean;
  hasSkillsSection: boolean;
  experienceYears: string[];
  targetRole: string;
  targetIndustry: string;
}

// ---------------------------------------------------------------------------
// Elite additions constant (extracted from buildSharedPrefix's isElite branch)
// ---------------------------------------------------------------------------

const ELITE_ADDITIONS = `
ELITE ANALYSIS:
PARALLEL-CALL SCOPING — CRITICAL: This is ONE call in a parallel set, and the task instructions below define the EXACT and ONLY JSON schema you may return. Emit only the top-level fields named in that schema and nothing else. If the task asks for "criterionFeedback", return an object whose only top-level key is criterionFeedback — do NOT also emit rewriteSuggestions, eliteInsights, executiveSummary, strengths, priorityImprovements, or any other section. The other sections are produced by SEPARATE calls; generating them here wastes your token budget and truncates your JSON mid-stream, which fails the entire analysis.
CRITERIA DEPTH (applies only when the task schema includes criterionFeedback): every feedback object has ALL 5 fields populated — observation, impact, fix, deeper, rewrite — each exactly ONE sentence, 30 words MAX (rewrite: one ready-to-paste phrase, 30 words max). "deeper" = a recruiter-psychology insight for this criterion; "rewrite" = a ready-to-paste phrase. This length limit is a strict ceiling, not a guideline.
`;

// ---------------------------------------------------------------------------
// Free tier output constraint (appended to Free prompt to restrict fields)
// ---------------------------------------------------------------------------

const FREE_TIER_SUFFIX = `
FREE TIER OUTPUT CONSTRAINT — HARD RULE:
Return ONLY these fields: overallScore, executiveSummary, resumeSignal, strengths (full), priorityImprovements (exactly 1 entry — the highest-impact one), rewriteSuggestions (exactly 1 entry — the single most impactful rewrite with full structured format including title, originalText, improvedText, issues, impact, potentialScoreIncrease), criterionFeedback (all 11 criteria present; ONLY C6 Achievement Orientation & Quantified Impact gets the full observation/impact/fix object; all other criteria return ONLY {criterion, score, feedback: null}).
DO NOT include any of: industryGuess, suggestedTargetRoles, recommendedKeywords, interviewLikelihood, competitiveRanking, recruiterFirstImpressions, hiddenWeaknesses, powerPhrases, detailedATSGapAnalysis, eliteInsights. These fields MUST be entirely absent from the JSON output — do not return them as null, empty arrays, or placeholder strings. Omit them from the object entirely.
`;

// ---------------------------------------------------------------------------
// Internal core prompt builder (shared by all three tier builders)
// ---------------------------------------------------------------------------

/**
 * Builds the core prompt body. `includeElite` controls whether the
 * ELITE_ADDITIONS block is injected. Used internally by the three
 * tier-specific builders. Not exported — callers use the tier builders
 * or the backward-compatible `buildSharedPrefix`.
 */
function _buildCorePrompt(params: PromptParams, includeElite: boolean): string {
  const {
    currentDate,
    wordCount,
    bulletCount,
    numberCount,
    hasEducation,
    hasSkillsSection,
    experienceYears,
    targetRole,
    targetIndustry,
  } = params;

  const currentYear = currentDate.slice(0, 4);

  const eliteEnhancements = includeElite ? ELITE_ADDITIONS : '';

  const targetLine =
    (targetRole ? `Target Role: ${targetRole}` : '') +
    (targetIndustry ? `${targetRole ? ' | ' : ''}Target Industry: ${targetIndustry}` : '');

  return `You are Strivo — a recruiter-grade resume evaluator replicating the three-pass evaluation real employers use: (1) 6-10 second recruiter scan for visual hierarchy and immediate signals, (2) ATS keyword extraction for role alignment, (3) hiring manager deep read for narrative, achievements, and differentiation. Output must be specific to THIS exact resume, honest about quality, and immediately actionable.
TODAY'S DATE: ${currentDate}. TODAY'S DATE: ${currentDate}. The current year is ${currentYear}. CRITICAL DATE RULES — ALL OF THESE ARE ABSOLUTE:
RULE A — PRESENT/ONGOING ROLES: Any role where the end date is written as "Present", "present", "Current", "current", "Now", "now", "Ongoing", "ongoing", "to date", "To Date", "–", or any similar term meaning "this role is ongoing" is an ACTIVE CURRENT ROLE. This is 100% correct standard resume formatting. NEVER flag it as a future date, a credibility issue, a narrative confusion, or an inconsistency. Ongoing roles are a positive signal. Do NOT say anything negative about this date format under any circumstance.
RULE B — SPECIFIC DATE RANGES: Any date range where BOTH the start and end dates are real calendar dates is valid regardless of whether those dates are before or after ${currentDate}. For example: "Jun 2025 – Sep 2025" is a completed internship — do NOT flag it. "Jun 2026 – Sep 2026" is also valid.
RULE C — ONLY INVALID PATTERN: The ONLY date pattern that is actually wrong is when the end date is BEFORE the start date within the same range (e.g. "Sep 2024 – Jun 2024" — end before start). This is the only case worth flagging.
RULE D — NO GAP PENALTIES: Do NOT penalize gaps between roles. NEVER rewrite a date to an earlier year unless the range itself is chronologically impossible.
${eliteEnhancements}HARD RULES — no exceptions:
(1) QUOTE BEFORE YOU JUDGE: Every score justification and feedback point must quote or reference a specific line, bullet, section, or phrase from the resume BEFORE giving the assessment. The user must see that the system actually read their content.
(2) NAME THE COST: For every weakness, explain what it costs the candidate in concrete terms — e.g. "This is likely causing ATS rejection at 60%+ of applications" or "Recruiters scanning in 7 seconds would miss your strongest qualification because it's buried in bullet 4."
(3) RECRUITER LENS: Don't just say what's wrong. Explain what a recruiter thinks when they see it.
(4) SCORE INTEGRITY: Score must reflect ACTUAL resume quality. Never contradict score with language. "exceptional" only if 85+, "strong" only if 70+.
(5) REWRITES: Every rewrite must follow [Action Verb] + [What You Did] + [How/Method] + [Measurable Result]. Use power verbs: spearheaded, architected, drove, scaled, orchestrated. Add realistic quantifiers from context when original lacks metrics. Ready-to-paste — no placeholders.
(6) ATS FLAGS: Flag tables, images, text boxes, creative headers, info in headers/footers as ATS risks.
(7) SKILLS: Flag generic skills ("Microsoft Office", "Teamwork") — must be specific and defensible.
(8) FEEDBACK STRUCTURE — NAMED FIELDS, NO ARRAYS: The "feedback" field for EVERY criterion MUST be a JSON object with these exact named string properties — "observation", "impact", "fix". ALL THREE fields are MANDATORY for every criterion, every tier — no exceptions. Each property is a separate standalone sentence referencing THIS specific resume. Do NOT use an array. Do NOT combine everything into one string. Do NOT leave any field empty or omit any field. Use the named object format shown in the JSON schema below. Example for C6: {"observation":"The 'Managed cross-functional stakeholder relationships' bullet under Deloitte lacks any quantifier — reads as a responsibility, not an achievement.","impact":"Recruiters skip this on a 7-second scan; it fails the 'so what?' test and directly hurts C6, the 20%-weight criterion.","fix":"Rewrite as: 'Coordinated 8 stakeholders across 3 departments to deliver a $2.1M compliance project 3 weeks ahead of schedule.'"}.
(9) OUTPUT BREVITY — CRITICAL FOR RELIABILITY: EVERY feedback field — observation, impact, fix, and (elite) deeper and rewrite — MUST be exactly 1 tight sentence, 30 words max each. No field may be a paragraph or contain multiple sentences. Every strengths/priorityImprovements item: 1 sentence. rewriteSuggestions issues array: 1 item only. recommendedKeywords: 10 items max. This is a HARD ceiling: verbose output overflows the token budget, truncates the JSON mid-stream, and fails delivery. Be specific, not long.
(10) PERSONALIZATION MANDATE: Every feedback point, strength, improvement, and summary section MUST reference specific content from THIS resume — actual role names, company names, exact bullet text, real metrics, specific section names. NEVER write "your experience shows" or "your resume demonstrates" without immediately quoting WHAT you are referring to. If you cannot cite a specific line from this resume, do not write the point. Generic output that could apply to any resume is a quality failure.

Resume stats: ${wordCount} words, ${bulletCount} bullets, ${numberCount} metrics found, education=${hasEducation}, skills=${hasSkillsSection}, experience=${experienceYears.length > 0 ? experienceYears.join(', ') : 'unspecified'}
${targetLine}

11 CRITERIA — each scored 0-100, weighted sum = overallScore:
C1 Visual Clarity & Layout 6% — margins, whitespace, visual hierarchy, scannable in 6s
C2 Formatting Consistency 4% — uniform bullets/dates/tense/capitalization throughout
C3 ATS Parseability 8% — no tables/images/text-boxes, standard section headers, clean encoding, no info in headers/footers
C4 Professional Tone & Grammar 5% — active voice, no slang/first-person/typos
C5 Conciseness & Value Density 7% — 1-2 line bullets, zero filler ("responsible for", "helped with", "worked on")
C6 Achievement Orientation & Quantified Impact 20% — [Action→Method→Result] formula, every bullet answers "so what?", responsibilities vs achievements clearly distinguished
C7 Relevance & Role Alignment 10% — aligns with target role, recent roles prioritized, irrelevant content minimized
C8 Skills Section Quality 10% — specific, grouped, defensible, role-aligned, not generic
C9 Projects & Extracurriculars 7% — applied skills with tangible outcomes, clear "so what", leadership counts
C10 Education Strength 5% — degree/major/school/graduation date, GPA if ≥3.3, relevant certifications
C11 Career Narrative, Differentiation & Keywords 18% — coherent story, visible progression, clear target, unique value prop, keyword density

SCORE CALIBRATION — honest, not anchored:
Scores MUST reflect actual content quality. Do NOT default to any range based on experience level alone.
- 85-100: Exceptional. Would land interviews at top-tier employers. Strong across nearly all 11 criteria.
- 70-84: Genuinely competitive. Recruiter would shortlist. Minor optimizations remain.
- 55-69: Solid foundation with clear gaps. Competitive after targeted improvements.
- 40-54: Below average. Multiple criteria need real work.
- Below 40: Significant structural or content problems. Needs comprehensive overhaul.
A student with keyword-rich content, quantified bullets, strategic skills, and strong projects should score 70-85. Do NOT compress strong resumes into 45-65 just because they are a student. Two resumes of different quality MUST show a 10-20+ point gap. Even strong resumes (70+) must receive next-level improvement suggestions.
SCORE DIFFERENTIATION — derive, don't anchor:
overallScore MUST be calculated as the weighted sum of all 11 criterion scores (sum of score × weight/100). Do NOT pick a round "gut feel" number and work backwards. Two resumes that both look "competitive" will differ on specific criteria — one might score 7 on ATS but 9 on career narrative, another 9 on ATS but 7 on narrative. These differences produce unique overall scores (e.g., 74 vs 78). Reflect that precision. Never default to the same number for similar-quality resumes — evaluate each criterion independently, then let the math produce the final score.

EXPERIENCE LEVEL CONTEXT (informational only — do not anchor scores):
- Student/Entry: 2-3 quantified bullets across all roles + projects is sufficient. Projects and extracurriculars carry more weight. 1 internship + strong projects can reach 70+ if well-written.
- Mid-Level (3-7 yrs): Every role must have quantified achievements. Career progression must be visible.
- Senior (8+ yrs): Strategy and org-level impact expected. Numbers in millions. Zero entry-level mistakes.

QUALITY STANDARD: The user should finish reading and think "This is telling me EVERYTHING I need to improve, down to the exact line." Every criterion feedback must feel like a personal, detailed evaluation — not a template.`;
}

// ---------------------------------------------------------------------------
// Shared prefix — backward-compatible wrapper (delegates to tier builders)
// ---------------------------------------------------------------------------

/**
 * Backward-compatible shared prefix builder. analyze-resume/index.ts imports
 * this; Phase 15 will swap to loadPromptVariant. Until then, this wrapper
 * dispatches to the appropriate tier builder based on params.isElite.
 */
export function buildSharedPrefix(params: PromptParams): string {
  // Preserve exact v1.0 behavior: isElite controls the elite branch.
  // Phase 15 will use the tier-based builders via loadPromptVariant instead.
  return _buildCorePrompt(params, params.isElite);
}

// ---------------------------------------------------------------------------
// Tier-specific prompt builders (Phase 14 — GATE-01)
// ---------------------------------------------------------------------------

/**
 * Free tier prompt builder. Returns the core prompt body WITHOUT elite
 * additions, plus the FREE_TIER_SUFFIX instructing the model to omit
 * locked fields (RES-01 only, no RES-02 fields).
 */
export function buildFreeResumePrompt(params: PromptParams): string {
  return _buildCorePrompt(params, false) + FREE_TIER_SUFFIX;
}

/**
 * Pro tier prompt builder. Returns the core prompt body WITHOUT elite
 * additions. Retains the full 11-criteria-with-3-4-points instruction.
 * Equivalent to the pre-Phase-14 isElite=false path.
 */
export function buildProResumePrompt(params: PromptParams): string {
  return _buildCorePrompt(params, false);
}

/**
 * Elite tier prompt builder. Returns the core prompt body WITH the
 * ELITE_ADDITIONS block. Verbatim-equivalent to the pre-Phase-14
 * isElite=true path.
 */
export function buildEliteResumePrompt(params: PromptParams): string {
  return _buildCorePrompt(params, true);
}

/**
 * Per-tier prompt builder map for the resume feature.
 * Consumed by registerFeaturePrompts and available for direct access.
 */
export const RESUME_PROMPT_VARIANTS: PromptVariantBuilder<PromptParams> = {
  free: buildFreeResumePrompt,
  pro: buildProResumePrompt,
  elite: buildEliteResumePrompt,
};

// ---------------------------------------------------------------------------
// Per-call suffixes
// ---------------------------------------------------------------------------

export function buildCallSuffix(callType: CallType, isElite: boolean, tier: 'free' | 'pro' | 'elite' = 'free'): string {
  switch (callType) {
    case 'criteria-1':
      return buildCriteria1Suffix(isElite);
    case 'criteria-2':
      return buildCriteria2Suffix(isElite);
    case 'summary':
      return buildSummarySuffix(isElite, tier);
    case 'rewrites':
      return buildRewritesSuffix(tier);
    case 'elite-extras':
      return buildEliteExtrasSuffix();
  }
}

function buildCriteria1Suffix(isElite: boolean): string {
  const feedbackFields = isElite
    ? '{"observation":"[quote specific content from this resume]","impact":"[recruiter/ATS consequence]","fix":"[exact change to make]","deeper":"[recruiter psychology insight]","rewrite":"[ready-to-paste phrase]"}'
    : '{"observation":"[quote specific content from this resume]","impact":"[recruiter/ATS consequence]","fix":"[exact change to make]"}';

  return `Score ONLY these criteria: C1 Visual Clarity & Layout, C2 Formatting Consistency, C3 ATS Parseability, C4 Professional Tone & Grammar, C5 Conciseness & Value Density, C6 Achievement Orientation & Quantified Impact.

Return ONLY valid JSON (no markdown, no text outside JSON) matching this schema:
{"criterionFeedback":[{"id":"c1_visual_clarity","label":"Visual Clarity & Layout","weight":6,"score":0,"feedback":${feedbackFields}},{"id":"c2_formatting_consistency","label":"Formatting Consistency","weight":4,"score":0,"feedback":${feedbackFields}},{"id":"c3_ats_parseability","label":"ATS Parseability","weight":8,"score":0,"feedback":${feedbackFields}},{"id":"c4_professional_tone","label":"Professional Tone & Grammar","weight":5,"score":0,"feedback":${feedbackFields}},{"id":"c5_conciseness","label":"Conciseness & Value Density","weight":7,"score":0,"feedback":${feedbackFields}},{"id":"c6_achievement_orientation","label":"Achievement Orientation & Quantified Impact","weight":20,"score":0,"feedback":${feedbackFields}}]}

Tone: Direct, professional, recruiter-like. No emojis, no hype.`;
}

function buildCriteria2Suffix(isElite: boolean): string {
  const feedbackFields = isElite
    ? '{"observation":"[quote specific content from this resume]","impact":"[recruiter/ATS consequence]","fix":"[exact change to make]","deeper":"[recruiter psychology insight]","rewrite":"[ready-to-paste phrase]"}'
    : '{"observation":"[quote specific content from this resume]","impact":"[recruiter/ATS consequence]","fix":"[exact change to make]"}';

  return `Score ONLY these criteria: C7 Relevance & Role Alignment, C8 Skills Section Quality, C9 Projects & Extracurriculars, C10 Education Strength, C11 Career Narrative, Differentiation & Keywords.

Return ONLY valid JSON (no markdown, no text outside JSON) matching this schema:
{"criterionFeedback":[{"id":"c7_relevance_targeting","label":"Relevance & Role Alignment","weight":10,"score":0,"feedback":${feedbackFields}},{"id":"c8_skills_presentation","label":"Skills Section Quality","weight":10,"score":0,"feedback":${feedbackFields}},{"id":"c9_projects_portfolio","label":"Projects & Extracurriculars","weight":7,"score":0,"feedback":${feedbackFields}},{"id":"c10_education_credentials","label":"Education Strength","weight":5,"score":0,"feedback":${feedbackFields}},{"id":"c11_career_narrative","label":"Career Narrative, Differentiation & Keywords","weight":18,"score":0,"feedback":${feedbackFields}}]}

Tone: Direct, professional, recruiter-like. No emojis, no hype.`;
}

function buildSummarySuffix(_isElite: boolean, tier: 'free' | 'pro' | 'elite' = 'free'): string {
  const improvementRange = tier === 'elite' ? '4-7' : tier === 'pro' ? '3-5' : '2-4';

  return `Do NOT score any criteria. Do NOT reference specific numeric scores or overall score. Do NOT generate rewriteSuggestions — a SEPARATE call produces those, so emitting them here is wasted output that truncates this response. Focus on qualitative narrative assessment of resume content. The overall score will be computed separately.

Return ONLY valid JSON (no markdown, no text outside JSON) matching this schema:
{"executiveSummary":{"keyStrengths":["strength citing specific role/metric/project — 2-3 items"],"keyGaps":["gap citing exact resume content with recruiter impact — 1-2 items"],"highImpactFix":"single most important change for this specific resume"},"strengths":["genuine strength citing exact resume content — 2-4 items"],"priorityImprovements":["highest-impact fix ordered by score increase potential — ${improvementRange} items"],"industryGuess":"","suggestedTargetRoles":["3-6 realistic roles based on actual experience"],"recommendedKeywords":["15-25 ATS keywords missing from resume"]}

QUALITY GUARD: Return ONLY genuinely high-priority fixes in priorityImprovements. If the resume is strong, return fewer items rather than inventing low-value suggestions. The count is a maximum, not a target.

Tone: Direct, professional, recruiter-like. No emojis, no hype.`;
}

/**
 * Rewrites suffix — generates ONLY rewriteSuggestions as a dedicated parallel call.
 * Split out of buildSummarySuffix (quick task 260608-p5k) so the heavy rewrite
 * array gets its own token budget and the summary call stays light + reliably
 * complete. The FIRST sentence is a UNIQUE sentinel ("Generate ONLY ready-to-paste
 * resume bullet rewrites") used by the AI_TEST_MODE fixture detector in anthropic.ts
 * to distinguish this call from the summary call — both also contain "Do NOT score
 * any criteria", so the rewrites branch MUST be checked on this sentinel first.
 */
function buildRewritesSuffix(tier: 'free' | 'pro' | 'elite' = 'free'): string {
  const rewriteRange = tier === 'elite' ? '6-7' : tier === 'pro' ? '6-8' : '5-7';

  return `Generate ONLY ready-to-paste resume bullet rewrites. Do NOT score any criteria. Do NOT return executiveSummary, strengths, priorityImprovements, eliteInsights, recommendedKeywords, or any other section — your entire output is the rewriteSuggestions array and nothing else.

Return ONLY valid JSON (no markdown, no text outside JSON) matching this schema:
{"rewriteSuggestions":[{"criterionId":"","title":"","originalText":"exact quote from resume","issues":["specific issue explaining what's wrong"],"improvedText":"[Action Verb] + [What You Did] + [How/Method] + [Measurable Result]","impact":"why this rewrite works","potentialScoreIncrease":0}]}

REWRITE REQUIREMENT: Provide ${rewriteRange} rewriteSuggestions. Each must be so good the user thinks "I could never have written this myself" — genuinely ready-to-paste, no placeholders, real numbers where original lacked them. Target C6 and C11 bullets first, then C7, C5, C8 in that order. A mediocre rewrite is worse than no rewrite.

Tone: Direct, professional, recruiter-like. No emojis, no hype.`;
}

/**
 * Elite-extras suffix — generates the 6 Elite-only narrative fields as strict JSON.
 * This prompt is ONLY used when tier === 'elite'; the fan-out loop skips it for Free/Pro.
 *
 * The fields produced here are:
 *   interviewLikelihood, interviewLikelihoodExplanation, competitiveRanking,
 *   recruiterFirstImpressions, hiddenWeaknesses, powerPhrases, detailedATSGapAnalysis
 *
 * These are wrapped in an `eliteInsights` object for merger compatibility with
 * the existing fillDefaults and applyTierShape pipeline.
 *
 * Phase 15 D-05/D-07: isolated 4th call prevents Elite cost from inflating Free/Pro latency.
 */
function buildEliteExtrasSuffix(): string {
  return `You are generating ELITE-TIER BONUS INSIGHTS for a resume that has already been scored and analyzed. Do NOT re-score criteria. Do NOT repeat strengths or improvements. Focus ONLY on the advanced strategic fields below.

Return ONLY valid JSON (no markdown, no text outside JSON) matching this schema:
{"eliteInsights":{"interviewLikelihood":0,"interviewLikelihoodExplanation":"[2-3 sentence assessment of likelihood this resume leads to an interview for the target role, citing specific resume evidence]","competitiveRanking":"Top 10%|Top 25%|Top 50%|Bottom 50%","recruiterFirstImpressions":{"atThreeSeconds":"[what a recruiter sees in the 3-second scan — quote specific layout/header elements]","atSevenSeconds":"[what stands out in the 7-second deep scan — quote specific bullets/metrics]","whatTheyMiss":"[valuable content buried or poorly positioned — quote specific sections]"},"hiddenWeaknesses":["[subtle issue that would only matter in final-round evaluation, quoting specific resume content] — 2-3 items"],"powerPhrases":["[industry-specific high-impact phrase already in the resume worth keeping] — 4-6 items"],"detailedATSGapAnalysis":[{"keyword":"[missing keyword]","priority":"critical|high|medium","suggestedPlacement":"[exact section and position in resume]"}]}}

QUALITY GUARDS:
- interviewLikelihood must be 0-100 reflecting realistic assessment, not optimistic padding.
- competitiveRanking must be one of exactly: "Top 10%", "Top 25%", "Top 50%", "Bottom 50%".
- hiddenWeaknesses must cite SPECIFIC resume content — no generic advice.
- powerPhrases must quote ACTUAL phrases from the resume, not invented ones.
- detailedATSGapAnalysis must include 4-6 missing keywords with specific placement suggestions.

Tone: Direct, strategic, recruiter-insider perspective. No emojis, no hype.`;
}

// ---------------------------------------------------------------------------
// Convenience builders
// ---------------------------------------------------------------------------

/**
 * Returns the full system prompt as a single string (prefix + suffix).
 * Use when passing system as a string to anthropic.ts.
 */
export function buildSystemPrompt(callType: CallType, params: PromptParams): string {
  return buildSharedPrefix(params) + '\n\n' + buildCallSuffix(callType, params.isElite, params.tier);
}

/**
 * Returns the system prompt as a two-block array for optimal prompt caching.
 * The shared prefix gets cache_control so it is cached independently of the
 * per-call suffix. The 2nd and 3rd parallel calls hit the cache on the prefix.
 */
export function buildSystemBlocks(
  callType: CallType,
  params: PromptParams,
): Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> {
  return [
    { type: 'text', text: buildSharedPrefix(params), cache_control: { type: 'ephemeral' } },
    { type: 'text', text: buildCallSuffix(callType, params.isElite, params.tier) },
  ];
}

// ---------------------------------------------------------------------------
// Incremental Elite unlock prompts (Phase 04)
// ---------------------------------------------------------------------------

function unlockStringSchema(): Record<string, unknown> {
  // Anthropic's raw structured-output API rejects validation constraints such
  // as minLength/minItems. The SDK normally strips them, but this repo calls
  // the API directly. Keep the wire schema grammar-compatible and enforce
  // non-empty values with eliteUnlockPatchSchema + validateEliteUnlockPatch.
  return { type: 'string' };
}

function unlockStringArraySchema(): Record<string, unknown> {
  return {
    type: 'array',
    items: unlockStringSchema(),
  };
}

function missingCriterionIds(
  missingSections: readonly EliteUnlockSection[],
): string[] {
  const prefix = 'criterionFeedback.';
  const suffix = '.feedback';
  return missingSections
    .filter((section) => section.startsWith(prefix) && section.endsWith(suffix))
    .map((section) => section.slice(prefix.length, -suffix.length));
}

function buildEliteUnlockDetailsSchema(
  missingSections: readonly EliteUnlockSection[],
): Record<string, unknown> | null {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  const criterionIds = missingCriterionIds(missingSections);

  if (criterionIds.length > 0) {
    properties.criterionFeedback = {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'feedback'],
        properties: {
          id: { type: 'string', enum: criterionIds },
          feedback: {
            type: 'object',
            additionalProperties: false,
            required: ['observation', 'impact', 'fix'],
            properties: {
              observation: unlockStringSchema(),
              impact: unlockStringSchema(),
              fix: unlockStringSchema(),
              deeper: unlockStringSchema(),
              rewrite: unlockStringSchema(),
            },
          },
        },
      },
    };
    required.push('criterionFeedback');
  }

  if (missingSections.includes('priorityImprovements')) {
    properties.priorityImprovements = unlockStringArraySchema();
    required.push('priorityImprovements');
  }
  if (missingSections.includes('rewriteSuggestions')) {
    properties.rewriteSuggestions = {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'criterionId',
          'title',
          'originalText',
          'issues',
          'improvedText',
          'impact',
          'potentialScoreIncrease',
        ],
        properties: {
          criterionId: unlockStringSchema(),
          title: unlockStringSchema(),
          originalText: unlockStringSchema(),
          issues: unlockStringArraySchema(),
          improvedText: unlockStringSchema(),
          impact: unlockStringSchema(),
          potentialScoreIncrease: { type: 'number' },
        },
      },
    };
    required.push('rewriteSuggestions');
  }
  if (missingSections.includes('industryGuess')) {
    properties.industryGuess = unlockStringSchema();
    required.push('industryGuess');
  }
  if (missingSections.includes('suggestedTargetRoles')) {
    properties.suggestedTargetRoles = unlockStringArraySchema();
    required.push('suggestedTargetRoles');
  }
  if (missingSections.includes('recommendedKeywords')) {
    properties.recommendedKeywords = unlockStringArraySchema();
    required.push('recommendedKeywords');
  }

  if (required.length === 0) return null;
  return {
    type: 'object',
    additionalProperties: false,
    required,
    properties,
  };
}

/**
 * Builds the non-Elite-extras delta call. The schema is derived solely from
 * the requested missing-section allowlist, so absent sections cannot be
 * returned through constrained output.
 */
export function buildEliteUnlockDetailsPrompt(
  params: EliteUnlockPromptParams,
): EliteUnlockPrompt | null {
  const outputSchema = buildEliteUnlockDetailsSchema(params.missingSections);
  if (!outputSchema) return null;

  const criteria = Array.isArray(params.storedResult.criterionFeedback)
    ? params.storedResult.criterionFeedback
      .filter((value): value is Record<string, unknown> =>
        value !== null && typeof value === 'object' && !Array.isArray(value)
      )
      .map((value) => ({
        id: value.id,
        label: value.label,
        score: value.score,
      }))
    : [];

  return {
    callName: ELITE_UNLOCK_DETAILS_CALL_NAME,
    systemPrompt: `Generate only the requested missing Elite resume-analysis delta.
Scoring, summaries, strengths, and all existing content are immutable. Never
re-score, replace, or repeat an existing value. Return only JSON matching this
exact schema: ${JSON.stringify(outputSchema)}`,
    userPrompt: `Stored resume text (already sanitized):
${params.sanitizedResumeText}

Immutable criterion context:
${JSON.stringify(criteria)}

Requested missing paths:
${params.missingSections.filter((section) => section !== 'eliteInsights').join(', ')}`,
    outputSchema,
  };
}

/**
 * Builds the isolated Elite-insights call. A present Elite section is
 * represented as zero calls by returning null.
 */
export function buildEliteUnlockExtrasPrompt(
  params: EliteUnlockPromptParams,
): EliteUnlockPrompt | null {
  if (!params.missingSections.includes('eliteInsights')) return null;

  const outputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['eliteInsights'],
    properties: {
      eliteInsights: {
        type: 'object',
        additionalProperties: false,
        required: [
          'interviewLikelihood',
          'interviewLikelihoodExplanation',
          'competitiveRanking',
          'recruiterFirstImpressions',
          'hiddenWeaknesses',
          'powerPhrases',
          'detailedATSGapAnalysis',
        ],
        properties: {
          interviewLikelihood: { type: 'number' },
          interviewLikelihoodExplanation: unlockStringSchema(),
          competitiveRanking: {
            type: 'string',
            enum: ['Top 10%', 'Top 25%', 'Top 50%', 'Bottom 50%'],
          },
          recruiterFirstImpressions: {
            type: 'object',
            additionalProperties: false,
            required: ['atThreeSeconds', 'atSevenSeconds', 'whatTheyMiss'],
            properties: {
              atThreeSeconds: unlockStringSchema(),
              atSevenSeconds: unlockStringSchema(),
              whatTheyMiss: unlockStringSchema(),
            },
          },
          hiddenWeaknesses: unlockStringArraySchema(),
          powerPhrases: unlockStringArraySchema(),
          detailedATSGapAnalysis: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['keyword', 'priority', 'suggestedPlacement'],
              properties: {
                keyword: unlockStringSchema(),
                priority: {
                  type: 'string',
                  enum: ['critical', 'high', 'medium'],
                },
                suggestedPlacement: unlockStringSchema(),
              },
            },
          },
        },
      },
    },
  };

  return {
    callName: ELITE_UNLOCK_EXTRAS_CALL_NAME,
    systemPrompt: `Generate only the missing Elite strategic-insights delta.
The stored score and all existing analysis content are immutable. Do not
re-score or return any field outside eliteInsights. Return only JSON matching
this exact schema: ${JSON.stringify(outputSchema)}`,
    userPrompt: `Stored resume text (already sanitized):
${params.sanitizedResumeText}`,
    outputSchema,
  };
}

/**
 * Builds a recombined single-call prompt for the fallback path.
 * Concatenates shared prefix + all 3 call suffixes with framing that
 * instructs the model to produce one unified JSON response.
 *
 * Used when all 3 parallel calls fail and we fall back to a single call.
 */
export function buildFallbackPrompt(params: PromptParams): string {
  const prefix = buildSharedPrefix(params);
  const suffix1 = buildCallSuffix('criteria-1', params.isElite, params.tier);
  const suffix2 = buildCallSuffix('criteria-2', params.isElite, params.tier);
  const suffixSummary = buildCallSuffix('summary', params.isElite, params.tier);
  const suffixRewrites = buildCallSuffix('rewrites', params.isElite, params.tier);

  return `${prefix}

You must produce a SINGLE JSON response containing ALL of the following sections combined into one top-level object. Return ONLY valid JSON (no markdown, no text outside JSON). The per-section "Do NOT" and "ONLY" scoping rules below apply ONLY when that section is requested alone — in THIS combined response you must include every section's fields.

SECTION 1 — Criteria C1-C6:
${suffix1}

SECTION 2 — Criteria C7-C11:
${suffix2}

SECTION 3 — Narrative summary:
${suffixSummary}

SECTION 4 — Rewrite suggestions:
${suffixRewrites}

COMBINED OUTPUT FORMAT: Return a single JSON object with ALL fields from all sections merged at the top level. The "criterionFeedback" array must contain all 11 criteria (C1 through C11) in order. Include all summary fields (executiveSummary, strengths, priorityImprovements, rewriteSuggestions, industryGuess, suggestedTargetRoles, recommendedKeywords${params.isElite ? ', eliteInsights' : ''}) at the same top level alongside criterionFeedback.`;
}

// ---------------------------------------------------------------------------
// Free tier consolidated single-call prompt (D-04, Phase 15.1)
// ---------------------------------------------------------------------------

/**
 * Purpose-built single-call system prompt for the Free tier that produces
 * the complete Free output JSON in one shot. This eliminates the 3-call
 * fan-out for Free users, cutting input token cost by ~67%.
 *
 * NOT registered in RESUME_PROMPT_VARIANTS — consumed directly by
 * analyze-resume/index.ts in the Free single-call path.
 */
export function buildFreeConsolidatedPrompt(params: PromptParams): string {
  const core = _buildCorePrompt(params, false);

  return `${core}
${FREE_TIER_SUFFIX}
SINGLE RESPONSE FORMAT — Return ONLY valid JSON (no markdown, no text outside JSON) matching this exact schema:

{
  "overallScore": <number 0-100, computed as weighted sum of all 11 criterion scores>,
  "executiveSummary": {
    "keyStrengths": ["strength citing specific role/metric/project — 2-3 items"],
    "keyGaps": ["gap citing exact resume content with recruiter impact — 1-2 items"],
    "highImpactFix": "single most important change for this specific resume"
  },
  "resumeSignal": "<brief one-line signal about overall resume quality>",
  "strengths": ["genuine strength citing exact resume content — 2-4 items"],
  "priorityImprovements": ["exactly 1 entry — the single highest-impact fix"],
  "rewriteSuggestions": [{"criterionId":"c6_achievement_orientation","title":"descriptive fix title","originalText":"exact quote from resume","issues":["specific issue with this text"],"improvedText":"ready-to-paste rewrite following action verb + what + how + measurable result","impact":"why this rewrite works and recruiter impact","potentialScoreIncrease":5}],
  "criterionFeedback": [
    {"id":"c1_visual_clarity","label":"Visual Clarity & Layout","weight":6,"score":<0-100>,"feedback":null},
    {"id":"c2_formatting_consistency","label":"Formatting Consistency","weight":4,"score":<0-100>,"feedback":null},
    {"id":"c3_ats_parseability","label":"ATS Parseability","weight":8,"score":<0-100>,"feedback":null},
    {"id":"c4_professional_tone","label":"Professional Tone & Grammar","weight":5,"score":<0-100>,"feedback":null},
    {"id":"c5_conciseness","label":"Conciseness & Value Density","weight":7,"score":<0-100>,"feedback":null},
    {"id":"c6_achievement_orientation","label":"Achievement Orientation & Quantified Impact","weight":20,"score":<0-100>,"feedback":{"observation":"[quote specific content]","impact":"[recruiter/ATS consequence]","fix":"[exact change to make]"}},
    {"id":"c7_relevance_targeting","label":"Relevance & Role Alignment","weight":10,"score":<0-100>,"feedback":null},
    {"id":"c8_skills_presentation","label":"Skills Section Quality","weight":10,"score":<0-100>,"feedback":null},
    {"id":"c9_projects_portfolio","label":"Projects & Extracurriculars","weight":7,"score":<0-100>,"feedback":null},
    {"id":"c10_education_credentials","label":"Education Strength","weight":5,"score":<0-100>,"feedback":null},
    {"id":"c11_career_narrative","label":"Career Narrative, Differentiation & Keywords","weight":18,"score":<0-100>,"feedback":null}
  ]
}

CRITERION FEEDBACK RULES:
- ALL 11 criteria MUST be present in the criterionFeedback array, in the order shown above.
- ONLY C6 (c6_achievement_orientation) gets the full feedback object with observation, impact, and fix fields. Each field is exactly 1 tight sentence (20-40 words max).
- All other criteria (C1-C5, C7-C11) return ONLY the id, label, weight, score, and feedback: null. No feedback object for these criteria.
- overallScore MUST equal the weighted sum: sum of (score x weight / 100) across all 11 criteria.

Tone: Direct, professional, recruiter-like. No emojis, no hype.`;
}

/**
 * Builds the user message for resume analysis (identical across all 3 calls).
 */
export function buildUserPrompt(resumeText: string, improvementContext: string): string {
  return `Analyze this resume. Quote specific lines, bullets, and phrases throughout your feedback. Apply the three-pass evaluation model (recruiter scan, ATS extraction, hiring manager deep read).
${improvementContext}
${resumeText}`;
}

/**
 * Builds the follow-up analysis context string from previously incorporated
 * suggestions and the previous overall score.
 */
export function buildImprovementContext(
  incorporatedSuggestions: string[],
  previousScore: number | null,
): string {
  if (incorporatedSuggestions.length === 0) return '';

  return `
FOLLOW-UP ANALYSIS — MANDATORY RULES:
This is a revised resume. The user has incorporated ${incorporatedSuggestions.length} of your previous suggestions:
${incorporatedSuggestions.map((s) => `- ${s}`).join('\n')}

Previous Score: ${previousScore || 'Unknown'}

1. ACKNOWLEDGE every specific improvement BY NAME in executiveSummary. Quote the new text and explain precisely why it's better than what was there before. The user must see their effort was noticed.
2. SCORE HONESTLY — if improvements are substantial, score increase must be substantial (5-20+ points). Do not cap artificially.
3. PROVIDE ENTIRELY NEW rewriteSuggestions — never re-rewrite lines the user already fixed.
4. REFERENCE the previous score and explain what drove the increase.
5. SHOW THE NEXT LEVEL — if they went from 52 to 68, show the path to 80. If they're at 80, show what separates them from 90+.
`;
}

// ---------------------------------------------------------------------------
// Feature registration (module-load side effect — GATE-01)
// ---------------------------------------------------------------------------

/**
 * Registers the resume feature's per-tier prompt builders in the shared
 * tier-prompts loader. After this runs, callers can use:
 *   loadPromptVariant('resume', tier, params)
 * to get the correct tier-specific prompt string.
 *
 * This side-effect runs at module load time. It is idempotent — re-importing
 * this module simply overwrites the previous registration.
 */
registerFeaturePrompts('resume', RESUME_PROMPT_VARIANTS);
