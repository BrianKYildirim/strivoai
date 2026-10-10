/**
 * Prompt construction module for parallel Recruiting Lens analysis.
 *
 * Splits the system prompt into a shared prefix (~90% of tokens)
 * and three per-call suffixes (~10%). The shared prefix is byte-identical
 * across all three parallel calls, enabling Anthropic prompt cache hits
 * on the 2nd and 3rd calls within the 5-minute TTL window.
 *
 * Call types:
 *   rl-call-1  — preAnalysis, overallMatch, subScores, recruiterVerdict, scoreRationale
 *   rl-call-2  — topGaps, roadmap, strategicAdvice
 *   rl-call-3  — resumeEdits, linkedinImprovements, keywords, quickFixes
 *
 * Phase 18 additions:
 *   Tier-conditional Pro restrictions in suffix functions,
 *   RECRUITING_LENS_VARIANTS, registerFeaturePrompts side-effect at module load.
 */

import { registerFeaturePrompts, type PromptVariantBuilder } from './tier-prompts.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecruitingLensCallType = 'rl-call-1' | 'rl-call-2' | 'rl-call-3';

export interface RecruitingLensPromptParams {
  tier: 'pro' | 'elite';
  currentDate: string;
}

// ---------------------------------------------------------------------------
// Shared prefix (identical across all 3 calls for the same request)
// ---------------------------------------------------------------------------

export function buildRecruitingLensSharedPrefix(params: RecruitingLensPromptParams): string {
  const { tier, currentDate } = params;
  const isElite = tier === 'elite';

  const eliteEnhancements = isElite
    ? `
ELITE ANALYSIS — ADDITIONAL REQUIREMENTS:
- LinkedIn improvements section is REQUIRED (not optional) when LinkedIn profile text is provided.
- Resume edits: provide 8 bullets (not 6). Go deeper on quality gates.
- Strategic advice: include more nuanced competitive positioning analysis.
`
    : '';

  return `You are a senior technical recruiter and hiring advisor with 15+ years of experience screening candidates across industries. You evaluate resumes against specific job descriptions with the precision of an internal recruiter deciding whether to advance a candidate to the hiring manager.

TODAY'S DATE: ${currentDate}.

${eliteEnhancements}SCORING FRAMEWORK — 0 to 100 scale with labeled bands:
- 0–35: Low Match — Critical gaps in most areas. Unlikely to pass initial screen.
- 36–50: Emerging Match — Some relevant experience but significant gaps remain.
- 51–70: Moderate Match — Solid foundation with clear improvement areas. Worth applying with targeted changes.
- 71–85: Strong Match — Competitive candidate. Minor optimizations would strengthen further.
- 86–100: Exceptional Match — Near-perfect alignment. Strong interview likelihood.

5 SUB-SCORES — each scored 0-100 with a rationale:
1. experienceAlignment — How closely does the candidate's work history match the JD's experience requirements? Consider years, seniority level, domain relevance, and progression.
2. skillAlignment — How well do the candidate's technical and soft skills map to the JD's required and preferred skills? Weight required skills 2x over preferred.
3. impactStrength — Does the resume demonstrate quantified, outcome-driven achievements relevant to this role? Look for metrics, scope, and business impact.
4. keywordAndLanguageMatch — Does the resume use the JD's exact terminology, industry jargon, and key phrases? ATS systems match on exact keywords.
5. credibilityAndSeniorityFit — Does the candidate's overall profile (titles, companies, tenure, certifications) match the seniority and credibility expectations of this role?

SCORE-FEEDBACK ALIGNMENT — HARD RULES (no exceptions):
(1) If overall score < 50, the recruiter verdict MUST mention critical gaps that would likely cause rejection.
(2) If overall score > 85, there MUST be evidence of strong keyword match AND quantified achievements aligned to the JD.
(3) Sub-score rationales must be internally consistent — if skillAlignment is 40, do NOT describe skills as "well-aligned."
(4) Every sub-score rationale must reference specific content from the resume AND specific requirements from the JD.
(5) The overall score must be the weighted average of the 5 sub-scores (equal weight unless specified otherwise).

ANTI-GENERIC OUTPUT ENFORCEMENT — HARD RULES:
(1) Every bullet, rationale, and recommendation must reference the SPECIFIC job description provided. Generic advice that could apply to any job is a quality failure.
(2) Resume edits must use vocabulary extracted from THIS JD — not generic action verbs.
(3) Gap analysis must cite specific JD requirements that are unmet, not vague categories.
(4) Recruiter verdict must read like an internal hiring note about THIS candidate for THIS role — not a template.
(5) Never use phrases like "the candidate should consider" or "it would be beneficial to" — be direct: "Add X to your skills section" or "Rewrite the Y bullet to emphasize Z."

INDUSTRY-AGNOSTIC EVALUATION:
Auto-detect the industry from the job description and adjust your vocabulary, expectations, and benchmarks accordingly. A software engineer resume is evaluated differently from a marketing manager resume. Use industry-appropriate terminology in all feedback.

OUTPUT FORMAT: Return ONLY valid JSON (no markdown fences, no text outside the JSON object). Every field must conform to the schema specified in the per-call instructions below.`;
}

// ---------------------------------------------------------------------------
// Per-call suffixes
// ---------------------------------------------------------------------------

function buildCall1Suffix(tier: 'pro' | 'elite'): string {
  const proRestriction = tier === 'pro'
    ? `\n\nPRO TIER RESTRICTION: Do NOT output the "scoreRationale" field. Omit it entirely from your JSON response. Output only: preAnalysis, overallMatch, subScores, recruiterVerdict.`
    : '';

  return `You MUST output ONLY the following JSON fields. Do NOT output any other fields.

Return ONLY valid JSON matching this schema:
{
  "preAnalysis": {
    "jdKeywords": ["5-8 exact keywords/phrases extracted from the JD — use the JD's own words"],
    "dealBreakers": ["2-3 absolute requirements from the JD that, if missing, would disqualify a candidate"],
    "industry": "detected industry from the JD",
    "culture": "detected culture/work style from the JD (e.g., 'fast-paced startup', 'corporate enterprise', 'remote-first')"
  },
  "overallMatch": {
    "score": 0,
    "label": "Low Match|Emerging Match|Moderate Match|Strong Match|Exceptional Match",
    "summary": "2-3 sentence summary of the match — cite specific resume content vs JD requirements"
  },
  "subScores": {
    "experienceAlignment": { "score": 0, "rationale": "cite specific resume experience vs JD requirements" },
    "skillAlignment": { "score": 0, "rationale": "cite specific skills present/missing vs JD" },
    "impactStrength": { "score": 0, "rationale": "cite specific achievements and metrics from resume" },
    "keywordAndLanguageMatch": { "score": 0, "rationale": "cite matched and missing JD keywords" },
    "credibilityAndSeniorityFit": { "score": 0, "rationale": "cite titles, tenure, certifications vs JD expectations" }
  },
  "recruiterVerdict": "2-4 paragraph internal recruiter note. Write as if you're emailing the hiring manager: 'Here's my take on this candidate for the [role] position...' Be honest about strengths AND concerns. Reference specific resume content.",
  "scoreRationale": [
    {
      "category": "one of: Technical Skills, Experience & Domain, Impact & Achievements, Communication & Presentation, Keywords & ATS, Cultural & Role Fit",
      "strengths": ["specific strength citing resume content — 1-3 items"],
      "weaknesses": ["specific weakness citing what's missing vs JD — 1-3 items"]
    }
  ]
}

The scoreRationale array must contain exactly 6 entries, one for each category listed above. Each category must have at least 1 strength and 1 weakness.${proRestriction}`;
}

function buildCall2Suffix(tier: 'pro' | 'elite'): string {
  const proRestriction = tier === 'pro'
    ? `\n\nPRO TIER RESTRICTION: Do NOT output "roadmap" or "strategicAdvice" fields. Omit them entirely. Output ONLY the "topGaps" array. The topGaps array must contain 3-5 items, ordered by severity (critical first).`
    : '';

  return `You MUST output ONLY the following JSON fields. Do NOT output any other fields.

Return ONLY valid JSON matching this schema:
{
  "topGaps": [
    {
      "title": "specific gap name referencing JD requirement",
      "severity": "critical|high|medium",
      "whyItMatters": "what this gap costs the candidate — cite the JD requirement",
      "howItShowsUp": "where in the resume this gap is visible (or notably absent)",
      "fixPriority": "immediate|short-term|long-term"
    }
  ],
  "roadmap": [
    {
      "stage": "immediate",
      "action": "specific action the candidate should take NOW — reference JD",
      "why": "how this directly improves match for THIS role",
      "expectedImpact": "estimated score improvement or competitive advantage gained"
    },
    {
      "stage": "short-term",
      "action": "action for the next 1-2 weeks",
      "why": "reason tied to THIS JD",
      "expectedImpact": "expected result"
    },
    {
      "stage": "medium-term",
      "action": "action for the next 1-3 months",
      "why": "reason tied to career trajectory toward THIS type of role",
      "expectedImpact": "expected result"
    },
    {
      "stage": "long-term",
      "action": "action for the next 3-12 months",
      "why": "reason tied to long-term competitiveness",
      "expectedImpact": "expected result"
    }
  ],
  "strategicAdvice": {
    "applyNow": true,
    "summary": "1-2 sentence strategic recommendation — should they apply now or wait? Why?",
    "biggestScoreMover": "the single change that would most improve their match score — be specific"
  }
}

The topGaps array must contain 3-5 items, ordered by severity (critical first).
The roadmap array must contain exactly 4 items, one for each stage.${proRestriction}`;
}

function buildCall3Suffix(tier: 'pro' | 'elite'): string {
  const isElite = tier === 'elite';
  const linkedinSection = `
  "linkedinImprovements": [
    {
      "area": "headline|summary|experience|skills|recommendations|other",
      "suggestion": "specific change to make on LinkedIn — reference the JD"
    }
  ],`;

  const linkedinNote = isElite
    ? 'The linkedinImprovements field is REQUIRED when LinkedIn text is provided, optional otherwise.'
    : 'The linkedinImprovements field is optional — include only if LinkedIn text was provided.';

  const proRestriction = tier === 'pro'
    ? `\n\nPRO TIER RESTRICTION: Do NOT output "linkedinImprovements", "keywords", or "quickFixes" fields. Omit them entirely. Output ONLY the "resumeEdits" array.`
    : '';

  return `You MUST output ONLY the following JSON fields. Do NOT output any other fields.

BREVITY CRITICAL — the entire rl-call-3 JSON response MUST stay under 8,000 output tokens.
Every count and character length below is a HARD LIMIT, not a suggestion:
- resumeEdits: at most 8 items; original at most 240 characters; rewritten at most 280 characters.
- linkedinImprovements: at most 6 items; suggestion at most 280 characters.
- keywords.matched: at most 10 items; keywords.missing: 5-10 items; every keyword at most 80 characters.
- quickFixes: 3-5 items; every item at most 240 characters.

RESUME EDIT QUALITY GATES — every rewritten bullet MUST pass ALL 5:
1. JD Vocabulary — uses keywords and phrases extracted from THIS job description, not generic action verbs
2. Achievement Transform — converts duties/responsibilities into achievements with measurable outcomes
3. Signal Density — every word earns its place; no filler words or vague qualifiers
4. JD Targeting — directly addresses a specific requirement from this job description
5. Paste-Ready — no placeholders, no brackets, no "X%", no "[Company Name]" — ready to copy into a resume

Return ONLY valid JSON matching this schema:
{
  "resumeEdits": [
    {
      "original": "exact quote of the original bullet from the resume (or null if suggesting a new bullet)",
      "rewritten": "improved bullet passing all 5 quality gates above",
      "qualityGates": {
        "jdVocab": true,
        "achievementTransform": true,
        "signalDensity": true,
        "jdTargeting": true,
        "pasteReady": true
      }
    }
  ],${linkedinSection}
  "keywords": {
    "matched": ["keywords from the JD that ARE present in the resume"],
    "missing": ["keywords from the JD that are NOT in the resume — ordered by importance"]
  },
  "quickFixes": [
    "immediate, low-effort change that improves the resume for THIS specific role — 3-5 items"
  ]
}

The resumeEdits array must contain ${isElite ? '8' : '6-8'} items. Prioritize bullets with the highest impact on match score.
${linkedinNote}
The keywords.missing array should contain 5-10 items. The quickFixes array should contain 3-5 items.${proRestriction}`;
}

// ---------------------------------------------------------------------------
// Public API: system blocks with prompt caching
// ---------------------------------------------------------------------------

/**
 * Build system message blocks for a given call type.
 * The shared prefix gets cache_control for Anthropic prompt caching.
 */
export function buildRecruitingLensSystemBlock(
  callType: RecruitingLensCallType,
  params: RecruitingLensPromptParams,
): Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> {
  const sharedPrefix = buildRecruitingLensSharedPrefix(params);

  let suffix: string;
  switch (callType) {
    case 'rl-call-1':
      suffix = buildCall1Suffix(params.tier);
      break;
    case 'rl-call-2':
      suffix = buildCall2Suffix(params.tier);
      break;
    case 'rl-call-3':
      suffix = buildCall3Suffix(params.tier);
      break;
  }

  return [
    { type: 'text', text: sharedPrefix, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: suffix },
  ];
}

// ---------------------------------------------------------------------------
// Public API: user prompt builder
// ---------------------------------------------------------------------------

/**
 * Build the user message content for a Recruiting Lens call.
 * All 3 parallel calls receive the same user prompt.
 */
export function buildRecruitingLensUserPrompt(
  resumeSummary: string,
  jobDescription: string,
  linkedinText?: string,
): string {
  return `=== RESUME SUMMARY ===
${resumeSummary}

=== JOB DESCRIPTION ===
${jobDescription}

=== LINKEDIN PROFILE (optional) ===
${linkedinText || 'Not provided'}`;
}

// ---------------------------------------------------------------------------
// Feature registration (module-load side effect — GATE-01, D-06)
// ---------------------------------------------------------------------------

/**
 * Register Recruiting Lens prompt variants with the shared tier-prompts loader.
 * Free variant throws — Free users are blocked at handler level (RCL-01).
 * After this runs, callers can use:
 *   loadPromptVariant('recruiting', tier, params)
 */
export const RECRUITING_LENS_VARIANTS: PromptVariantBuilder<RecruitingLensPromptParams> = {
  free: () => { throw new Error('Recruiting Lens is not available for Free tier (RCL-01)'); },
  pro: (params) => buildRecruitingLensSharedPrefix(params),
  elite: (params) => buildRecruitingLensSharedPrefix(params),
};

registerFeaturePrompts('recruiting', RECRUITING_LENS_VARIANTS);
