import { sanitizeMessages } from './prompt-sanitizer.ts';
import { createLogger } from './logger.ts';
// Phase 02 (TOK-01). `ai-telemetry.ts` imports ONLY ./logger.ts at module load and
// resolves the Supabase client via a dynamic import — deliberately, so this file stays
// dependency-free at load and the offline Deno suites never pull in supabase-js.
import { recordAiTelemetry } from './ai-telemetry.ts';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// Absolute platform OUTPUT ceiling per SINGLE Anthropic call (quick task 260608-p5k).
// Equals the largest single-call budget in the system: interviewPrepCoach (single
// call, 12000) and the resume `summary` call (8000) both sit under it. Parallel
// features (resumeAnalysis 20000, recruitingLens 15000) have larger PER-FEATURE
// aggregates, but each individual call stays ≤ this ceiling. The helper clamps
// max_tokens to min(caller, ABSOLUTE_MAX_TOKENS) at every send site so no caller —
// present or future — can exceed this per-call ceiling regardless of what it passes.
const ABSOLUTE_MAX_TOKENS = 12000;

const _sanitizerLog = createLogger('anthropic');

export type AnthropicInvokeParams = {
  apiKey?: string;  // Optional — falls back to ANTHROPIC_API_KEY env var
  model: string;
  system?: string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;
  messages: Array<{ role: 'user' | 'assistant'; content: string | any[] }>;
  /** Opt-in constrained JSON output. Omitted calls preserve the existing wire body. */
  outputSchema?: Record<string, unknown>;
  maxTokens?: number;
  temperature?: number;
  fixtureKey?: 'analyze_resume' | 'analyze_career' | 'plain_text' | 'grade_linkedin' | 'match_job' | 'match_jobs_skills' | 'ocr' | 'recruiting_lens' | 'interview_prep';
  timeoutMs?: number;
  /**
   * Phase 02 (TOK-01): per-call token telemetry context. OPTIONAL — omitting it
   * disables telemetry for that call and preserves today's behavior exactly, which
   * is what keeps all existing call sites compiling and unchanged.
   */
  telemetry?: {
    /** 'resume_analysis' | 'career_compass' | 'linkedin_grader' | 'recruiting_lens' | 'interview_prep' | 'util' */
    feature: string;
    /** Server-resolved tier: 'free' | 'pro' | 'elite'. NEVER read from a request body. */
    tier: string;
    /** 'free-single' | 'criteria-1' | 'summary' | 'rewrites' | 'base' | 'rl-call-1' | … */
    callName: string;
    /** The caller's existing 8-char reqId — correlates all calls of ONE analysis. */
    reqId?: string;
    userId?: string;
    /** 1 = first attempt, 2 = retry. Retries are common and must not be conflated. */
    attempt?: number;
    featureRunId?: string;
    costingSubjectId?: string;
    /** Stable operation within one feature run; parallel operations use distinct names. */
    operationName?: string;
    attemptNumber?: number;
    isRetry?: boolean;
    environment?: 'production' | 'staging' | 'development' | 'test';
    excludeFromCostingAtTime?: boolean;
    telemetryVersion?: string;
    costingEpoch?: string;
  };
};

export type AnthropicInvokeResult =
  | { ok: true; text: string; raw: any; model: string; telemetryId?: number }
  | { ok: false; status: number; error: string; telemetryId?: number };

function getMockFixtureText(key?: AnthropicInvokeParams['fixtureKey']): string {
  switch (key) {
    case 'analyze_resume':
      return JSON.stringify({
        overallScore: 79,
        executiveSummary: 'Competitive early-career resume with clear internship impact and project depth. The biggest gap is keyword specificity for target roles — ATS systems will parse the content but miss some critical alignment signals. Strongest differentiator is the combination of quantified business outcomes and technical project breadth. Immediate next step: rewrite 2-3 experience bullets to lead with the method/stack, not just the result. [Preview mode — full analysis available after deployment]',
        strengths: [
          'Quantified internship impact with clear business outcomes (e.g. sales +14%, traffic +8%).',
          'Strong systems/project portfolio including performance-focused and backend projects.',
          'Clear technical breadth across Python, C++, JavaScript, and cloud tooling.'
        ],
        priorityImprovements: [
          'Increase ATS keyword alignment for target roles by tailoring the skills and experience language.',
          'Condense less critical bullets so the strongest impact appears earlier in each section.',
          'Strengthen role targeting with a clearer top-line focus for software engineering internships.'
        ],
        criterionFeedback: [
          { id: 'c1_visual_clarity', label: 'Visual Clarity & Layout', weight: 6, score: 82, feedback: [
            'Clean single-column layout creates a readable visual hierarchy that recruiter scan paths follow naturally.',
            'Section headers are clearly differentiated from body text, reducing the cognitive load of a 6-second scan.',
            'Whitespace usage is balanced — not too dense, but a few experience sections could benefit from tighter spacing to keep the strongest content above the fold.'
          ]},
          { id: 'c2_formatting_consistency', label: 'Formatting Consistency', weight: 4, score: 85, feedback: [
            'Bullet punctuation is consistent throughout — all bullets end without periods or all end with them, which signals attention to detail.',
            'Date formats are uniform (Mon. YYYY – Mon. YYYY style) across all experience entries.',
            'One minor inconsistency: capitalization style for job titles varies between entries — standardize to title case throughout.'
          ]},
          { id: 'c3_ats_parseability', label: 'ATS Parseability', weight: 8, score: 80, feedback: [
            'Standard section headers (Experience, Education, Skills, Projects) are used — ATS systems will correctly categorize content.',
            'No tables, text boxes, or images detected, which means the full resume text will be extracted cleanly.',
            'Contact information appears in the document body (not in a header/footer), which ensures it is captured by ATS parsers that skip header/footer regions.'
          ]},
          { id: 'c4_professional_tone', label: 'Professional Tone & Grammar', weight: 5, score: 88, feedback: [
            'Active voice is used consistently — bullets lead with strong action verbs rather than passive constructions.',
            'No first-person pronouns, casual language, or filler phrases detected.',
            'Grammar and spelling are clean throughout — no credibility-damaging errors that would cause a recruiter to pause.'
          ]},
          { id: 'c5_conciseness', label: 'Conciseness & Value Density', weight: 7, score: 76, feedback: [
            'Most bullets are 1-2 lines, which is the correct length for recruiter scanning speed.',
            'A few bullets use filler phrases ("responsible for", "worked on") that add length without adding signal — these should be replaced with direct action verbs.',
            'The skills section lists several broad technologies without grouping; recruiters scan for specific clusters and may miss key strengths buried in a flat list.'
          ]},
          { id: 'c6_achievement_orientation', label: 'Achievement Orientation & Quantified Impact', weight: 20, score: 80, feedback: [
            'Internship bullets include measurable business outcomes (e.g. +14% sales, +8% traffic) which is the gold standard for achievement-oriented writing.',
            'Project bullets demonstrate applied technical skills but lean toward describing what was built rather than the outcome — adding a "so what" metric to 2-3 project bullets would significantly improve this score.',
            'Some responsibility-style bullets remain (describing the task rather than the result) — identify the 2 weakest and rewrite them using the [Action + Method + Measurable Result] formula.'
          ]},
          { id: 'c7_relevance_targeting', label: 'Relevance & Role Alignment', weight: 10, score: 78, feedback: [
            'Experience and project content is broadly relevant to software engineering roles, with appropriate technology stack coverage.',
            'Role-specific keyword alignment is moderate — the resume would benefit from 4-6 additional keywords that appear in target job descriptions (e.g. "API design", "system design", "scalability").',
            'Older or less relevant experience could be de-emphasized to give more visual weight to the strongest, most recent content.'
          ]},
          { id: 'c8_skills_presentation', label: 'Skills Section Quality', weight: 10, score: 83, feedback: [
            'Technical skills are listed with good breadth — covers languages, frameworks, and tools relevant to the target domain.',
            'Skills are not grouped by category (e.g. Languages / Frameworks / Tools / Cloud), which makes it harder for a recruiter to quickly identify depth in a specific area.',
            'A few generic skills ("Microsoft Office", "Git") could be upgraded to more specific and defensible alternatives that appear in job postings for target roles.'
          ]},
          { id: 'c9_projects_portfolio', label: 'Projects & Extracurriculars', weight: 7, score: 81, feedback: [
            'Projects demonstrate applied technical skills beyond coursework, which is critical for candidates with limited full-time experience.',
            'Most projects include a technology stack listing, helping recruiters quickly assess technical depth.',
            'Project descriptions focus on what was built rather than the outcome — adding a quantified result (e.g. "reduced load time by 40%") or a scale indicator (e.g. "serving 200+ users") to the top 2 projects would significantly strengthen this section.'
          ]},
          { id: 'c10_education_credentials', label: 'Education Strength', weight: 5, score: 84, feedback: [
            'Degree, major, institution, and expected graduation date are all clearly stated.',
            'If GPA is 3.3 or above, it should be listed — omitting it when it is strong is a missed opportunity.',
            'Relevant coursework is listed, which helps bridge the gap between academic background and job requirements for early-career candidates.'
          ]},
          { id: 'c11_career_narrative', label: 'Career Narrative, Differentiation & Keywords', weight: 18, score: 74, feedback: [
            'The resume shows a logical progression from coursework to internship to leadership/project roles, which tells a coherent early-career story.',
            'There is no summary or objective statement to anchor the narrative — adding a 2-line positioning statement at the top would help recruiters immediately understand the candidate\'s target and strongest differentiator.',
            'Keyword density for target software engineering roles is moderate — a focused keyword pass based on 3-5 target job descriptions would improve ATS ranking without changing the overall content.'
          ]}
        ],
        rewriteSuggestions: [
          {
            criterionId: 'c6_achievement_orientation',
            title: 'Strengthen Backend Impact Language',
            originalText: 'Shipped backend features for a marketing email tool using website activity data to production, raising sales by 14%.',
            issues: ['Leads with the output (shipped) rather than the method and scale — recruiters want to see the technical decision, not just the deployment action.'],
            improvedText: 'Architected and deployed backend personalization engine (Python, REST APIs, event-driven segmentation) for a marketing email platform serving 10,000+ users, driving 14% increase in sales conversion.',
            impact: 'Adds ATS keywords for backend/software roles, quantifies scale, and leads with the architectural decision — the signal recruiters look for.',
            potentialScoreIncrease: 7
          }
        ],
        industryGuess: 'Technology',
        suggestedTargetRoles: ['Software Engineer Intern', 'Backend Engineer Intern', 'Full-Stack Developer Intern', 'Platform Engineer Intern'],
        recommendedKeywords: ['REST APIs', 'backend development', 'distributed systems', 'performance optimization', 'CI/CD', 'unit testing', 'SQL', 'cloud services', 'API design', 'system design']
      });
    case 'analyze_career':
      return JSON.stringify({
        detectedDomain: 'Technology & Engineering',
        domainEvidence: ['computer science', 'software', 'python', 'c++', 'aws'],
        roleReadinessScore: 82,
        targetRole: 'Software Engineer',
        careerDNA: 'Brian is an early-career software builder with a strong systems and backend orientation. His internship results show real business impact, while his projects demonstrate performance engineering and API/service design skills. He stands out because he combines measurable product outcomes with technical depth in Python and C++. The next step is sharpening role-specific positioning for target engineering teams.',
        whatYouHave: ['Quantified internship outcomes in production environments', 'Strong systems/backend project portfolio', 'Relevant CS degree and coursework'],
        skillGaps: [
          { skill: 'Production-scale distributed systems experience', priority: 'High', action: 'Build one portfolio project with queueing, caching, and observability instrumentation.' },
          { skill: 'Testing depth and coverage storytelling', priority: 'Medium', action: 'Add explicit unit/integration/performance test metrics to project bullets.' }
        ],
        roleReadinessBreakdown: {
          overallScore: 82,
          targetRole: 'Entry-Level Software Engineer',
          industryBenchmark: 'Entry-level software engineering roles at product-oriented companies',
          strengths: [
            'Demonstrated production impact during internship with measurable outcomes',
            'Strong portfolio with systems/performance projects',
            'Backend and API development experience in Python'
          ],
          gaps: [
            'Less evidence of large-team production engineering workflows',
            'Needs stronger explicit testing and reliability language',
            'Could improve role-targeted keyword coverage'
          ],
          skillAssessments: [
            { skill: 'Backend Development', yourLevel: 'Advanced', industryExpectation: 'Intermediate', gap: 'Exceeds' },
            { skill: 'Systems Programming', yourLevel: 'Intermediate', industryExpectation: 'Intermediate', gap: 'None' },
            { skill: 'Testing & QA', yourLevel: 'Intermediate', industryExpectation: 'Intermediate', gap: 'Minor' },
            { skill: 'Cloud / Deployment', yourLevel: 'Intermediate', industryExpectation: 'Intermediate', gap: 'Minor' },
            { skill: 'Distributed Systems', yourLevel: 'Beginner', industryExpectation: 'Intermediate', gap: 'Moderate' }
          ],
          readinessVerdict: 'You are competitive for many software engineering internships and some entry-level roles, but stronger distributed systems/reliability evidence would materially improve top-tier interview odds.'
        },
        careerFields: [
          {
            title: 'Software Development',
            matchScore: 90,
            whyMatch: 'Strong fit due to backend, systems, and measurable project/internship impact.',
            whyMatchDetails: ['Python/C++ projects with performance focus', 'Production internship results with metrics'],
            requiredSkills: ['Backend Development', 'Data Structures', 'Testing'],
            salaryRange: '$95,000 - $135,000',
            industryOutlook: 'Strong demand across product and infrastructure teams',
            timeline: '0-6 months preparation',
            recommendedRoles: ['Software Engineer', 'Backend Engineer']
          },
          {
            title: 'Data Science & Analytics',
            matchScore: 78,
            whyMatch: 'Data analysis and metrics-oriented work suggests analytics-adjacent potential.',
            whyMatchDetails: ['Pandas usage in operations reporting', 'Quantitative experimentation and reporting'],
            requiredSkills: ['Python', 'SQL', 'Statistics'],
            salaryRange: '$85,000 - $125,000',
            industryOutlook: 'Continued demand with strong competition',
            timeline: '3-9 months preparation',
            recommendedRoles: ['Data Analyst', 'Analytics Engineer']
          }
        ],
        // 260713-hrd: TWO entries, deliberately. Surprise Fits is contractually 2-3 and the
        // server now REFUSES to persist a 1-item section (CAREER_SURPRISE_FITS_MIN). A fixture
        // that violates the production contract is worse than no fixture: it made every
        // AI_TEST_MODE Career Compass run fail with 422 incomplete_output. A fixture must be a
        // VALID example of the contract it stands in for.
        surpriseFits: [
          {
            role: 'Technical Product Manager',
            readinessScore: 77,
            whySurprising: 'Your mix of technical depth and measurable product/business outcomes translates well to technical product work.',
            transferableSkills: ['Cross-functional collaboration', 'Metrics analysis', 'Technical systems understanding']
          },
          {
            role: 'Solutions Engineer',
            readinessScore: 76,
            whySurprising: 'Your backend depth plus a track record of explaining measurable business outcomes maps directly onto pre-sales technical work.',
            transferableSkills: ['Technical communication', 'Systems troubleshooting', 'Stakeholder-facing demos']
          }
        ],
        roles: [
          {
            title: 'Software Engineer',
            description: 'Build and maintain application and backend systems.',
            averageSalary: '$115,000',
            skillAlignmentScore: 86,
            skillGaps: ['Distributed systems depth', 'Reliability/observability examples'],
            qualificationSteps: ['Strengthen role-targeted resume bullets', 'Build one production-style backend project']
          }
        ],
        roleRoadmaps: [
          {
            role: 'Software Engineer',
            steps: [
              { phase: 'Months 1-2', category: 'Foundation & Quick Wins', items: ['Rewrite internship and project bullets with role-targeted backend keywords', 'Reorder projects to highlight systems/backend work first'] },
              { phase: 'Months 3-5', category: 'Skill Building & Projects', items: ['Build a service with caching, queues, and metrics', 'Add integration and load tests with reported results'] },
              { phase: 'Months 6-8', category: 'Experience & Portfolio', items: ['Publish architecture write-up and benchmark results for one project'] },
              { phase: 'Months 9-10', category: 'Networking & Applications', items: ['Target product and infrastructure internship pipelines with tailored resumes'] },
              { phase: 'Months 11-12', category: 'Interview Prep & Launch', items: ['Practice DS&A and backend system design for new-grad/intern roles'] }
            ]
          }
        ],
        roadmap: [
          { category: 'Courses & Education', items: ['Distributed systems fundamentals', 'Databases and system design refresh'] },
          { category: 'Projects & Portfolio', items: ['Production-style backend service with observability and tests'] },
          { category: 'Certifications', items: ['Optional cloud fundamentals certification if targeting cloud-heavy roles'] },
          { category: 'Soft Skills', items: ['Technical communication and concise project storytelling'] },
          { category: 'Networking Strategy', items: ['Target alumni and engineering recruiters with project-specific outreach'] },
          { category: 'Resume Optimization', items: ['Tailor keywords and lead with measurable impact'] }
        ],
        compensationIntelligence: {
          salaryBands: [
            { role: 'Software Engineer', entryLevel: '$95,000 - $135,000', midLevel: '$140,000 - $190,000', seniorLevel: '$190,000 - $280,000', yourEstimate: '$112,000', percentile: 58 }
          ],
          roleTransitionROI: [
            { from: 'Student / Intern', to: 'Software Engineer', salaryIncrease: '+120%', timeToTransition: '0-1 years', roi: 'High', difficulty: 'Moderate' }
          ],
          applicationStrategy: [
            { title: 'Backend Engineer', company: 'Mid-size product companies', matchScore: 84, recommendation: 'apply', reason: 'Strong backend and systems project alignment', competitiveness: 'Medium', timeToApply: '< 72 hours' }
          ],
          fiveYearEarnings: '$750,000 total projected',
          earningsInsight: 'Your upside increases materially if you build stronger evidence of production-scale reliability and distributed systems work.'
        }
      });
    case 'grade_linkedin':
      return JSON.stringify({
        rawScore: 62,
        scoreJustification: 'The profile demonstrates solid technical breadth and a quantified internship, but lacks an optimized headline, an About section with value propositions, skills endorsements, and recommendations — all of which significantly limit recruiter discoverability.',
        // 09-07: the 08.1/08.3 FOUR-section contract. This fixture previously emitted the
        // retired `overall_score` + `categories[]` shape, which grade-linkedin/schema.ts now
        // hard-rejects (sectionBreakdown, length 4, positional names, catalogue-pinned
        // maxScore). Every AI_TEST_MODE run of grade-linkedin therefore 500'd. Sections MUST
        // stay in catalogue order with the catalogue maxScore, or the superRefine fails.
        sectionBreakdown: [
          {
            name: 'Headline',
            applicable: true,
            maxScore: 15,
            score: 9,
            evidence: 'Headline lists a degree and graduation year rather than a target role.',
            strengths: ['Includes university and graduation year for context'],
            weaknesses: ['No target role keywords', 'Reads as a student descriptor, not a candidate brand'],
            improvements: ['Lead with your strongest technical identity (e.g. "Full-Stack & Systems Engineer")', 'Add 2-3 high-search keywords relevant to your target roles']
          },
          {
            name: 'About',
            applicable: true,
            maxScore: 15,
            score: 6,
            evidence: 'No About section is present on the profile.',
            strengths: ['Profile is otherwise complete enough to support an About section'],
            weaknesses: ['Missing About section removes the strongest keyword surface on the profile'],
            improvements: ['Write a 3-4 sentence About section leading with your target role and two quantified outcomes']
          },
          {
            name: 'Experience',
            applicable: true,
            maxScore: 45,
            score: 32,
            evidence: 'Internship bullets include quantified outcomes (sales +14%, traffic +8%).',
            strengths: ['Two quantified impact bullets', 'Relevant tech stack mentioned', 'Agile process mention'],
            weaknesses: ['No explicit stack keywords in each bullet', 'Missing ownership/scope language'],
            improvements: ['Add explicit technologies to each bullet', 'Frame each bullet as [action] + [tool] + [result]']
          },
          {
            name: 'Search Alignment, Skills & Credentials',
            applicable: true,
            maxScore: 25,
            score: 15,
            evidence: 'Skills section lists technologies but carries no endorsements or credentials.',
            strengths: ['Core technical skills are listed and relevant to target roles'],
            weaknesses: ['No endorsements', 'No certifications or credentials', 'Skills are not ordered by target-role relevance'],
            improvements: ['Reorder skills so the top three match your target role', 'Request endorsements from your internship manager']
          }
        ],
        topFixes: [
          {
            title: 'Rewrite Your Headline',
            currentText: 'Computer Science @ UCI | June 2027 Graduation | Full-Stack & Systems Developer | Building Scalable Software in Python | C++ | JavaScript | AWS',
            suggestedFix: 'Full-Stack & Systems Engineer | Python · C++ · React · AWS | UCI CS 2027 | Building Scalable, Production-Grade Software',
            whyItWorks: 'Leads with your engineering identity, front-loads 5 searchable keywords, and still communicates your timeline — in 12 fewer words.',
            pointsGain: '+5-7 points',
            priority: 1
          },
          {
            title: 'Add an About Section',
            currentText: '[No About section present]',
            suggestedFix: "I'm a CS student at UC Irvine building production-grade backend systems and full-stack applications. At Toros Tile, I shipped features that raised sales 14% and redesigned infrastructure that lifted monthly traffic 8%. I'm seeking software engineering internships where I can apply Python, C++, and AWS to real infrastructure challenges.",
            whyItWorks: 'About sections are indexed by LinkedIn search and recruiter filters. A 3-sentence value statement converts profile views to connection requests.',
            pointsGain: '+8-10 points',
            priority: 2
          }
        ],
        keyStrengths: [
          'Quantified internship impact at career stage (sales +14%, traffic +8%) is genuinely competitive',
          'Systems and backend project portfolio demonstrates technical ownership beyond coursework',
          'Multi-language depth (Python, C++, JS) is a differentiator for engineering roles'
        ],
        nextBestAction: {
          action: 'Add an About section and request one LinkedIn recommendation from your internship manager',
          reason: 'These two changes have the highest per-effort score impact and directly affect recruiter click-through rates',
          expectedImpact: 'Estimated +10-12 profile score points and significantly higher recruiter InMail response rate'
        }
      });
    case 'match_job':
      return JSON.stringify({
        matchScore: 71,
        industry: 'Technology / Software Engineering',
        matchedKeywords: ['Python', 'backend', 'full-stack', 'AWS', 'JavaScript', 'REST APIs', 'agile'],
        missingKeywords: ['CI/CD', 'Docker', 'Kubernetes', 'system design', 'distributed systems', 'SQL at scale', 'microservices'],
        intelligenceSummary: 'Your profile was evaluated against this role using ATS keyword matching and recruiter pattern analysis. You have strong overlap on the core engineering stack and demonstrate quantified production impact, which stands out. The primary gap is operational tooling (CI/CD, containers, observability) and explicit distributed systems experience that senior SWE roles increasingly require.',
        roadmap: [
          {
            step: 1,
            title: 'Add Missing ATS Keywords to Resume',
            description: 'Weave CI/CD, Docker, and system design language into your existing bullets and skills section.',
            whyMatters: 'ATS systems for this role will filter for CI/CD and containerization keywords before a human ever sees your resume. Missing these terms costs you automatic shortlisting regardless of actual fit.',
            atsInsight: 'Recruiters and ATS for software engineering roles at this level scan for Docker, CI/CD pipeline ownership, and observability keywords within the first 6 seconds.',
            successTip: 'Adding 3-4 missing keywords to existing bullets (not as a generic list) increases ATS pass rate by an estimated 40%.',
            timeframe: '1-2 days',
            priority: 'critical',
            type: 'resume'
          },
          {
            step: 2,
            title: 'Build One Distributed Systems Project',
            description: 'Create a small project demonstrating message queuing, caching, or service-to-service communication.',
            whyMatters: 'This role explicitly requires experience with distributed or large-scale systems. A portfolio project with a Redis cache layer or a Kafka-based event stream directly addresses this gap with evidence.',
            atsInsight: 'Hiring managers for backend/full-stack roles at growth-stage companies prioritize candidates who have shipped services that communicate across process boundaries.',
            successTip: 'One well-documented project with architecture notes and a live demo URL converts more interviews than multiple small scripts.',
            timeframe: '2-4 weeks',
            priority: 'high',
            type: 'skill'
          }
        ],
        resumeRewrites: [
          {
            original: 'Shipped backend features for a marketing email tool using website activity data to production, raising sales by 14%.',
            rewritten: 'Designed and shipped backend personalization features (Python, REST APIs, event-driven data pipeline) for a production marketing platform, increasing sales conversion by 14% — deployed via CI/CD with zero downtime.',
            whyBetter: 'Adds CI/CD, REST APIs, and event-driven keywords the JD explicitly lists. "Zero downtime" signals production reliability awareness that hiring managers filter for.'
          },
          {
            original: 'Automated inventory and sales data cleansing with Pandas, cutting manual errors and accelerating reporting.',
            rewritten: 'Built automated data quality pipeline (Python, Pandas, SQL) to cleanse and normalize inventory and sales datasets, reducing manual errors by ~90% and cutting reporting cycle from 2 days to 4 hours.',
            whyBetter: 'Quantifies both the error reduction and time savings — two metrics this role\'s JD emphasizes. Adds SQL keyword and pipeline framing preferred by backend-focused JDs.'
          }
        ],
        recommendations: [
          'Add Docker and CI/CD tooling to your skills section and mention in at least one bullet',
          'Include a GitHub link with pinned repos for your systems projects — this role values portfolio evidence',
          'Tailor your resume summary/objective to call out backend and distributed systems experience explicitly'
        ],
        jobTitle: 'Software Engineer',
        company: 'Tech Company'
      });
      return 'Python, JavaScript, React, AWS, SQL';
    case 'recruiting_lens':
      return JSON.stringify({
        overallMatch: { score: 72, label: 'Moderate Match', summary: 'Moderate match with clear growth areas.' },
        subScores: {
          experienceAlignment: { score: 70, rationale: 'Mock fixture.' },
          skillAlignment: { score: 75, rationale: 'Mock fixture.' },
          impactStrength: { score: 68, rationale: 'Mock fixture.' },
          keywordAndLanguageMatch: { score: 74, rationale: 'Mock fixture.' },
          credibilityAndSeniorityFit: { score: 73, rationale: 'Mock fixture.' },
        },
        recruiterVerdict: 'Mock fixture — candidate shows moderate alignment.',
        preAnalysis: { jdKeywords: ['mock'], dealBreakers: ['mock'], industry: 'Technology', culture: 'Collaborative' },
        scoreRationale: [{ category: 'Technical Skills', strengths: ['mock'], weaknesses: ['mock'] }],
        topGaps: [{ title: 'Mock gap', severity: 'medium', whyItMatters: 'Mock.', howItShowsUp: 'Mock.', fixPriority: 'immediate' }],
        roadmap: [
          { stage: 'immediate', action: 'Mock.', why: 'Mock.', expectedImpact: 'Mock.' },
          { stage: 'short-term', action: 'Mock.', why: 'Mock.', expectedImpact: 'Mock.' },
          { stage: 'medium-term', action: 'Mock.', why: 'Mock.', expectedImpact: 'Mock.' },
          { stage: 'long-term', action: 'Mock.', why: 'Mock.', expectedImpact: 'Mock.' },
        ],
        resumeEdits: [{ rewritten: 'Mock rewritten bullet.', qualityGates: { jdVocab: true, achievementTransform: true, signalDensity: true, jdTargeting: true, pasteReady: true } }],
        keywords: { matched: ['mock'], missing: ['mock'] },
        quickFixes: ['Mock quick fix.'],
        strategicAdvice: { applyNow: true, summary: 'Mock.', biggestScoreMover: 'Mock.' },
      });
    case 'ocr':
      return `Jane Doe
jane.doe@email.com | (555) 123-4567 | linkedin.com/in/janedoe

EDUCATION
University of California, Berkeley — B.S. Computer Science, May 2025
GPA: 3.7/4.0

EXPERIENCE
Software Engineering Intern — Acme Corp, San Francisco, CA (Jun 2024 – Aug 2024)
- Designed and implemented REST API endpoints serving 50,000+ daily requests
- Reduced API response latency by 35% through query optimization and caching
- Collaborated with a cross-functional team of 8 engineers on microservices architecture

SKILLS
Python, TypeScript, React, Node.js, PostgreSQL, AWS, Docker, Git`;
    case 'plain_text':
    default:
      return 'Mock Claude response for test mode.';
  }
}

function hashContent(messages: AnthropicInvokeParams['messages']): number {
  const combined = messages.map(m => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('');
  let hash = 0;
  for (let i = 0; i < Math.min(combined.length, 2000); i++) {
    hash = (hash * 31 + combined.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function detectDomainFromContent(messages: AnthropicInvokeParams['messages']): {
  industry: string; roles: string[]; domain: string;
} {
  const text = messages.map(m => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join(' ').toLowerCase();
  if (/software|engineer|developer|python|javascript|react|backend|frontend|api|machine learning|data science|cloud|aws|devops/.test(text)) {
    return { industry: 'Technology', roles: ['Software Engineer Intern', 'Backend Engineer Intern', 'Full-Stack Developer Intern', 'Data Engineer Intern'], domain: 'Technology & Engineering' };
  }
  if (/finance|investment|banking|accounting|financial|equity|portfolio|analyst|cfa|bloomberg/.test(text)) {
    return { industry: 'Finance', roles: ['Financial Analyst Intern', 'Investment Banking Analyst', 'Equity Research Intern', 'Corporate Finance Intern'], domain: 'Business & Finance' };
  }
  if (/marketing|brand|content|social media|seo|campaign|advertising|growth|digital/.test(text)) {
    return { industry: 'Marketing', roles: ['Marketing Analyst Intern', 'Digital Marketing Intern', 'Brand Strategy Intern', 'Growth Marketing Intern'], domain: 'Marketing & Communications' };
  }
  if (/consulting|strategy|management|operations|business analyst|mckinsey|bain|bcg|deloitte/.test(text)) {
    return { industry: 'Consulting', roles: ['Business Analyst Intern', 'Strategy Consultant Intern', 'Operations Analyst Intern', 'Management Consulting Intern'], domain: 'Consulting & Strategy' };
  }
  return { industry: 'Business', roles: ['Business Analyst Intern', 'Operations Intern', 'Project Management Intern', 'Strategy Intern'], domain: 'Business & Operations' };
}

// Phase 31 (D-12/D-13): staging-gated refund fault-injection seam. Distinct from
// AI_FORCE_FAILURE above — that flag is the AI_TEST_MODE-paired, hardcoded-529 unit-test
// mock; this MERIT_TEST_FORCE_REFUNDABLE_ERROR flag yields a CONFIGURABLE status and is
// gated to STAGING hosts only, so it ships inert in production even if accidentally set.
// It is the single toggle Plan 31-04 drives across all 7 sync/async refund paths.
const STAGING_HOST = 'cimjltzovkahkqecpwgi'; // staging project ref (scripts/deploy-staging.ps1)
function refundableErrorOverride(): { status: number; error: string } | null {
  const flag = (Deno.env.get('MERIT_TEST_FORCE_REFUNDABLE_ERROR') ?? '').trim();
  if (!flag) return null;
  const url = Deno.env.get('SUPABASE_URL') ?? '';                       // D-13 staging gate
  const isStaging = url.includes(STAGING_HOST) || (Deno.env.get('STRIVO_ENV') ?? '') === 'staging';
  if (!isStaging) return null;                                          // inert in production
  const status = /^\d{3}$/.test(flag) ? Number(flag) : 529;            // 'true' -> 529 default
  return { status, error: 'forced-refundable-error' };
}

export async function invokeAnthropicText(params: AnthropicInvokeParams): Promise<AnthropicInvokeResult> {
  // Phase 31 (D-12): staging-gated refundable-error injection (see refundableErrorOverride).
  const forcedRefundable = refundableErrorOverride();
  if (forcedRefundable) {
    return { ok: false, status: forcedRefundable.status, error: forcedRefundable.error };
  }

  // Phase 13: compound-guarded failure injection for TEST-07.
  // Two-key defense (RESEARCH.md Pitfall 8): AI_FORCE_FAILURE only activates when
  // AI_TEST_MODE is ALSO true, so an accidental production flip of AI_FORCE_FAILURE
  // alone is a no-op.
  if (
    (Deno.env.get('AI_TEST_MODE') || '').toLowerCase() === 'true' &&
    (Deno.env.get('AI_FORCE_FAILURE') || '').toLowerCase() === 'true'
  ) {
    return { ok: false, status: 529, error: 'forced-failure' };
  }

  if ((Deno.env.get('AI_TEST_MODE') || '').toLowerCase() === 'true') {
    const text = getMockFixtureText(params.fixtureKey);
    if (params.fixtureKey === 'analyze_resume' || params.fixtureKey === 'analyze_career') {
      try {
        const parsed = JSON.parse(text);
        const hash = hashContent(params.messages);
        const offset = (hash % 17) - 8; // -8 to +8, deterministic per resume
        const { industry, roles, domain } = detectDomainFromContent(params.messages);

        if (params.fixtureKey === 'analyze_resume') {
          if (typeof parsed.overallScore === 'number') {
            parsed.overallScore = Math.min(99, Math.max(60, parsed.overallScore + offset));
          }
          // Handle both new field name (criterionFeedback) and legacy (criteria)
          const criteriaField = parsed.criterionFeedback ? 'criterionFeedback' : 'criteria';
          if (parsed[criteriaField]) {
            parsed[criteriaField] = parsed[criteriaField].map((c: any) => ({
              ...c,
              score: Math.min(99, Math.max(55, (c.score ?? 80) + offset)),
            }));
          }
          parsed.industryGuess = industry;
          parsed.suggestedTargetRoles = roles;

          // Detect parallel call type from system prompt and return only the expected slice
          const systemText = Array.isArray(params.system)
            ? params.system.map((b: any) => b.text || '').join(' ')
            : (params.system || '');
          const criteria = parsed[criteriaField] || [];
          if (systemText.includes('Generate only the requested missing Elite resume-analysis delta.')) {
            const properties = (params.outputSchema?.properties ?? {}) as Record<string, any>;
            const patch: Record<string, unknown> = {};
            if (properties.criterionFeedback) {
              const criterionIds = properties.criterionFeedback?.items?.properties?.id?.enum ?? [];
              patch.criterionFeedback = criterionIds.map((id: string) => ({
                id,
                feedback: {
                  observation: `Mock Elite observation for ${id}.`,
                  impact: `Mock Elite recruiter impact for ${id}.`,
                  fix: `Mock Elite corrective action for ${id}.`,
                  deeper: `Mock Elite strategic context for ${id}.`,
                  rewrite: `Mock Elite ready-to-paste rewrite for ${id}.`,
                },
              }));
            }
            if (properties.priorityImprovements) {
              patch.priorityImprovements = Array.from(
                { length: 6 },
                (_, index) => `Mock Elite priority improvement ${index + 1}.`,
              );
            }
            if (properties.rewriteSuggestions) {
              patch.rewriteSuggestions = Array.from({ length: 9 }, (_, index) => ({
                criterionId: `mock_elite_${index + 1}`,
                title: `Mock Elite rewrite ${index + 1}`,
                originalText: `Original mock resume bullet ${index + 1}.`,
                issues: [`Mock issue ${index + 1}.`],
                improvedText: `Improved mock Elite resume bullet ${index + 1}.`,
                impact: `Mock recruiter impact ${index + 1}.`,
                potentialScoreIncrease: index + 1,
              }));
            }
            if (properties.industryGuess) patch.industryGuess = industry;
            if (properties.suggestedTargetRoles) patch.suggestedTargetRoles = roles;
            if (properties.recommendedKeywords) {
              patch.recommendedKeywords = [
                'API design',
                'distributed systems',
                'performance optimization',
              ];
            }
            return {
              ok: true,
              text: JSON.stringify(patch),
              raw: { mock: true, fixtureKey: 'analyze_resume', callType: 'elite-unlock-details' },
              model: 'mock:analyze_resume',
            };
          }
          if (systemText.includes('Generate only the missing Elite strategic-insights delta.')) {
            return {
              ok: true,
              text: JSON.stringify({
                eliteInsights: {
                  recruiterVerdict: 'Mock Elite recruiter verdict for preview validation.',
                  competitivePosition: 'Mock Elite competitive-position guidance.',
                },
              }),
              raw: { mock: true, fixtureKey: 'analyze_resume', callType: 'elite-unlock-extras' },
              model: 'mock:analyze_resume',
            };
          }
          if (systemText.includes('Score ONLY these criteria: C1')) {
            // criteria-1: return only c1-c6
            const slice = criteria.filter((c: any) => /^c[1-6]_/.test(c.id));
            return { ok: true, text: JSON.stringify({ criterionFeedback: slice }), raw: { mock: true, fixtureKey: 'analyze_resume', callType: 'criteria-1' }, model: 'mock:analyze_resume' };
          }
          if (systemText.includes('Score ONLY these criteria: C7')) {
            // criteria-2: return only c7-c11
            const slice = criteria.filter((c: any) => /^c(7|8|9|10|11)_/.test(c.id));
            return { ok: true, text: JSON.stringify({ criterionFeedback: slice }), raw: { mock: true, fixtureKey: 'analyze_resume', callType: 'criteria-2' }, model: 'mock:analyze_resume' };
          }
          // 'rewrites' call (260608-p5k): MUST be checked before the summary branch —
          // both prompts contain "Do NOT score any criteria"; this unique sentinel
          // disambiguates. Returns only rewriteSuggestions.
          if (systemText.includes('Generate ONLY ready-to-paste resume bullet rewrites')) {
            const { rewriteSuggestions } = parsed;
            return { ok: true, text: JSON.stringify({ rewriteSuggestions: rewriteSuggestions || [] }), raw: { mock: true, fixtureKey: 'analyze_resume', callType: 'rewrites' }, model: 'mock:analyze_resume' };
          }
          if (systemText.includes('Do NOT score any criteria')) {
            // summary call: narrative + targeting fields only (rewriteSuggestions and
            // eliteInsights are produced by their own dedicated calls now).
            const { executiveSummary, strengths, priorityImprovements, recommendedKeywords } = parsed;
            return { ok: true, text: JSON.stringify({ executiveSummary, strengths, priorityImprovements, industryGuess: industry, suggestedTargetRoles: roles, recommendedKeywords: recommendedKeywords || [] }), raw: { mock: true, fixtureKey: 'analyze_resume', callType: 'summary' }, model: 'mock:analyze_resume' };
          }
        }

        if (params.fixtureKey === 'analyze_career') {
          if (typeof parsed.roleReadinessScore === 'number') {
            parsed.roleReadinessScore = Math.min(99, Math.max(50, parsed.roleReadinessScore + offset));
          }
          if (parsed.roleReadinessBreakdown) {
            parsed.roleReadinessBreakdown.overallScore = Math.min(99, Math.max(50, (parsed.roleReadinessBreakdown.overallScore ?? 80) + offset));
            parsed.roleReadinessBreakdown.targetRole = roles[0] ?? parsed.roleReadinessBreakdown.targetRole;
          }
          parsed.detectedDomain = domain;
          parsed.targetRole = roles[0] ?? parsed.targetRole;
          // Replace name-specific careerDNA with a generic version
          parsed.careerDNA = `This candidate shows a solid foundation relevant to ${domain}. Their experience and coursework demonstrate early-career potential in ${roles.slice(0, 2).join(' and ')} roles. Key differentiators include project-based experience and demonstrated initiative. The next step is sharpening role-specific positioning and quantifying impact in resume bullets. [Preview mode — scores and text are illustrative]`;
        }

        return { ok: true, text: JSON.stringify(parsed), raw: { mock: true, fixtureKey: params.fixtureKey }, model: `mock:${params.fixtureKey}` };
      } catch {
        // fall through to raw fixture
      }
    }
    return { ok: true, text, raw: { mock: true, fixtureKey: params.fixtureKey ?? null }, model: `mock:${params.fixtureKey ?? 'default'}` };
  }

  // Resolve API key: explicit param > env var > error
  const resolvedApiKey = params.apiKey ?? Deno.env.get('ANTHROPIC_API_KEY');
  if (!resolvedApiKey) {
    return { ok: false, status: 500, error: 'ANTHROPIC_API_KEY not configured' };
  }

  // Sanitize user-role message content before API call (D-07, D-10)
  const sanitizedMessages = sanitizeMessages(params.messages, 'anthropic', _sanitizerLog);

  // Hard ceiling: clamp to min(caller, ABSOLUTE_MAX_TOKENS) (quick task 260608-p5k).
  const clampedMaxTokens = Math.min(params.maxTokens ?? 4096, ABSOLUTE_MAX_TOKENS);

  // Hoisted out of the try so the catch branch below can still report a duration.
  const _startedAt = new Date().toISOString();
  const _t0 = performance.now();

  // Phase 02 (TOK-01): the context columns are identical on every write point.
  const _telemetryBase = params.telemetry
    ? {
        feature: params.telemetry.feature,
        tier: params.telemetry.tier,
        call_name: params.telemetry.callName,
        attempt: params.telemetry.attemptNumber ?? params.telemetry.attempt ?? 1,
        req_id: params.telemetry.reqId ?? null,
        user_id: params.telemetry.userId ?? null,
        model: params.model,
        // The CLAMPED value, never params.maxTokens — recording the unclamped
        // request would make every headroom calculation wrong.
        max_tokens: clampedMaxTokens,
        feature_run_id: params.telemetry.featureRunId ?? null,
        costing_subject_id: params.telemetry.costingSubjectId ?? null,
        operation_name: params.telemetry.operationName ?? params.telemetry.callName,
        attempt_number: params.telemetry.attemptNumber ?? params.telemetry.attempt ?? 1,
        is_retry: params.telemetry.isRetry ??
          (params.telemetry.attemptNumber ?? params.telemetry.attempt ?? 1) > 1,
        provider: 'anthropic',
        provider_request_id: null,
        environment: params.telemetry.environment ?? null,
        exclude_from_costing_at_time: params.telemetry.excludeFromCostingAtTime ?? null,
        telemetry_version: params.telemetry.telemetryVersion ?? null,
        costing_epoch: params.telemetry.costingEpoch ?? null,
        started_at: _startedAt,
      }
    : null;

  try {
    const controller = params.timeoutMs ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), params.timeoutMs) : null;

    let response: Response;
    try {
      response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'x-api-key': resolvedApiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'anthropic-beta': 'prompt-caching-2024-07-31',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: params.model,
          ...(params.system
            ? { system: typeof params.system === 'string'
                ? [{ type: 'text', text: params.system, cache_control: { type: 'ephemeral' } }]
                : params.system }
            : {}),
          messages: sanitizedMessages,
          max_tokens: clampedMaxTokens,
          ...(params.outputSchema
            ? {
                output_config: {
                  format: {
                    type: 'json_schema',
                    schema: params.outputSchema,
                  },
                },
              }
            : {}),
          ...(typeof params.temperature === 'number' ? { temperature: params.temperature } : {}),
        }),
        ...(controller ? { signal: controller.signal } : {}),
      });
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
    }

    const _tResponse = performance.now();
    const _providerRequestId = response.headers.get('request-id') ??
      response.headers.get('x-request-id');

    if (!response.ok) {
      const errorText = await response.text();
      let telemetryId: number | null = null;
      console.log(`[PERF] anthropic ${params.model} — FAILED ${response.status} in ${((_tResponse - _t0) / 1000).toFixed(2)}s`);
      if (_telemetryBase) {
        telemetryId = await recordAiTelemetry({
          ..._telemetryBase,
          provider_request_id: _providerRequestId,
          input_tokens: null,
          output_tokens: null,
          cache_creation_input_tokens: null,
          cache_read_input_tokens: null,
          stop_reason: null,
          ok: false,
          http_status: response.status,
          duration_ms: Math.round(_tResponse - _t0),
          ttfb_ms: Math.round(_tResponse - _t0),
          output_chars: null,
          completed_at: new Date().toISOString(),
          status: 'failed',
          error_code: `anthropic_http_${response.status}`,
          error_category: response.status === 408
            ? 'timeout'
            : response.status === 429
            ? 'rate_limit'
            : response.status >= 500
            ? 'provider'
            : 'request',
        });
      }
      return {
        ok: false,
        status: response.status,
        error: `Anthropic API error (${params.model}): ${response.status} - ${errorText}`,
        ...(telemetryId !== null ? { telemetryId } : {}),
      };
    }

    const data = await response.json();
    const _tParsed = performance.now();
    const textBlocks = Array.isArray(data?.content)
      ? data.content.filter((b: any) => b?.type === 'text' && typeof b?.text === 'string')
      : [];
    const text = textBlocks.map((b: any) => b.text).join('\n').trim();

    // Log timing + token usage
    const usage = data?.usage;
    const cacheInfo = usage?.cache_creation_input_tokens || usage?.cache_read_input_tokens
      ? ` | cache_create=${usage.cache_creation_input_tokens ?? 0} cache_read=${usage.cache_read_input_tokens ?? 0}`
      : '';
    console.log(`[PERF] anthropic ${params.model} — OK in ${((_tParsed - _t0) / 1000).toFixed(2)}s | TTFB=${((_tResponse - _t0) / 1000).toFixed(2)}s | in=${usage?.input_tokens ?? '?'} out=${usage?.output_tokens ?? '?'}${cacheInfo} | maxTokens=${clampedMaxTokens}`);

    // Phase 02 (TOK-01): the row this whole phase exists for. `stop_reason` is
    // TOP-LEVEL on the response object, not inside `usage` (analyze-career already
    // reads it there); `stop_reason === 'max_tokens'` is what the generated
    // `truncated` column keys off.
    let telemetryId: number | null = null;
    if (_telemetryBase) {
      const hasUsage = usage !== null && typeof usage === 'object';
      telemetryId = await recordAiTelemetry({
        ..._telemetryBase,
        provider_request_id: _providerRequestId,
        input_tokens: typeof usage?.input_tokens === 'number' ? usage.input_tokens : null,
        output_tokens: typeof usage?.output_tokens === 'number' ? usage.output_tokens : null,
        cache_creation_input_tokens: hasUsage
          ? (typeof usage.cache_creation_input_tokens === 'number'
            ? usage.cache_creation_input_tokens
            : 0)
          : null,
        cache_read_input_tokens: hasUsage
          ? (typeof usage.cache_read_input_tokens === 'number' ? usage.cache_read_input_tokens : 0)
          : null,
        stop_reason: data?.stop_reason ?? null,
        ok: true,
        http_status: null,
        duration_ms: Math.round(_tParsed - _t0),
        ttfb_ms: Math.round(_tResponse - _t0),
        output_chars: text.length,
        completed_at: new Date().toISOString(),
        status: 'completed',
        error_code: null,
        error_category: null,
      });
    }

    if (!text) {
      return {
        ok: false,
        status: 502,
        error: `Anthropic API returned no text content (${params.model})`,
        ...(telemetryId !== null ? { telemetryId } : {}),
      };
    }

    return {
      ok: true,
      text,
      raw: data,
      model: params.model,
      ...(telemetryId !== null ? { telemetryId } : {}),
    };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === 'AbortError';
    // Phase 02 (TOK-01): NOT optional. A timeout under a raised cap is a first-class
    // finding — a widened token budget without a widened wall clock produced a 408
    // mid-generation (quick task 260713-2ay). Losing that row would hide the failure
    // mode this phase is most likely to introduce.
    let telemetryId: number | null = null;
    if (_telemetryBase) {
      telemetryId = await recordAiTelemetry({
        ..._telemetryBase,
        input_tokens: null,
        output_tokens: null,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
        stop_reason: null,
        ok: false,
        http_status: isAbort ? 408 : 500,
        duration_ms: Math.round(performance.now() - _t0),
        ttfb_ms: null,
        output_chars: null,
        completed_at: new Date().toISOString(),
        status: 'failed',
        error_code: isAbort ? 'anthropic_timeout' : 'anthropic_transport_error',
        error_category: isAbort ? 'timeout' : 'network',
      });
    }
    return {
      ok: false,
      status: isAbort ? 408 : 500,
      error: isAbort ? 'Anthropic request timed out' : (error instanceof Error ? error.message : 'Anthropic request failed'),
      ...(telemetryId !== null ? { telemetryId } : {}),
    };
  }
}

export type StreamChunk =
  | { type: 'chunk'; text: string }
  | { type: 'error'; status: number; message: string };

/**
 * NOT INSTRUMENTED WITH TOKEN TELEMETRY — deliberately. Verified by
 * `rg -l streamAnthropicText`: only this file and `prompt-sanitizer.test.ts`
 * reference it, so no feature function calls it. Resume Analysis's "streaming path"
 * is SSE from the edge function to the BROWSER, not Anthropic SSE. Instrumenting
 * `invokeAnthropicText` alone therefore covers 100% of live Anthropic calls. It is
 * also structurally unable to report usage: the SSE `message_delta` events that
 * carry `usage` / `stop_reason` are discarded by the reader below. Please do not
 * "fix" this apparent gap without first re-checking that a live caller exists.
 */
export async function* streamAnthropicText(
  params: AnthropicInvokeParams
): AsyncGenerator<StreamChunk> {
  // Phase 31 (D-12/Pitfall 2): stream twin of the staging-gated refundable-error injection.
  // Resume analysis streams, so this chokepoint MUST also short-circuit before any network call.
  const forcedRefundable = refundableErrorOverride();
  if (forcedRefundable) {
    yield { type: 'error', status: forcedRefundable.status, message: forcedRefundable.error };
    return;
  }

  // Phase 13: compound-guarded failure injection for TEST-07 (streaming variant).
  // Two-key defense: AI_FORCE_FAILURE only activates when AI_TEST_MODE is ALSO true.
  if (
    (Deno.env.get('AI_TEST_MODE') || '').toLowerCase() === 'true' &&
    (Deno.env.get('AI_FORCE_FAILURE') || '').toLowerCase() === 'true'
  ) {
    yield { type: 'error', status: 529, message: 'forced-failure' };
    return;
  }

  // Test mode: emit mock fixture data as streaming chunks
  if ((Deno.env.get('AI_TEST_MODE') || '').toLowerCase() === 'true') {
    let mockText = getMockFixtureText(params.fixtureKey);
    // Apply hash-based variations for analyze_resume / analyze_career (same as invokeAnthropicText)
    if (params.fixtureKey === 'analyze_resume' || params.fixtureKey === 'analyze_career') {
      try {
        const parsed = JSON.parse(mockText);
        const hash = hashContent(params.messages);
        const offset = (hash % 17) - 8;
        const { industry, roles, domain } = detectDomainFromContent(params.messages);
        if (params.fixtureKey === 'analyze_resume') {
          if (typeof parsed.overallScore === 'number') {
            parsed.overallScore = Math.min(99, Math.max(60, parsed.overallScore + offset));
          }
          const criteriaField = parsed.criterionFeedback ? 'criterionFeedback' : 'criteria';
          if (parsed[criteriaField]) {
            parsed[criteriaField] = parsed[criteriaField].map((c: any) => ({
              ...c, score: Math.min(99, Math.max(55, (c.score ?? 80) + offset)),
            }));
          }
          parsed.industryGuess = industry;
          parsed.suggestedTargetRoles = roles;
        }
        if (params.fixtureKey === 'analyze_career') {
          if (typeof parsed.roleReadinessScore === 'number') {
            parsed.roleReadinessScore = Math.min(99, Math.max(50, parsed.roleReadinessScore + offset));
          }
          parsed.detectedDomain = domain;
          parsed.targetRole = roles[0] ?? parsed.targetRole;
        }
        mockText = JSON.stringify(parsed);
      } catch { /* use raw fixture */ }
    }
    // Emit in chunks to simulate streaming (allows client stage detection)
    const chunkSize = 120;
    for (let i = 0; i < mockText.length; i += chunkSize) {
      yield { type: 'chunk', text: mockText.slice(i, i + chunkSize) };
    }
    return;
  }

  // Resolve API key: explicit param > env var > error
  const resolvedApiKey = params.apiKey ?? Deno.env.get('ANTHROPIC_API_KEY');
  if (!resolvedApiKey) {
    yield { type: 'error', status: 500, message: 'ANTHROPIC_API_KEY not configured' };
    return;
  }

  // Sanitize user-role message content before streaming API call (D-07, D-10)
  const sanitizedMessages = sanitizeMessages(params.messages, 'anthropic', _sanitizerLog);

  // Hard ceiling: clamp to min(caller, ABSOLUTE_MAX_TOKENS) (quick task 260608-p5k).
  const clampedMaxTokens = Math.min(params.maxTokens ?? 4096, ABSOLUTE_MAX_TOKENS);

  const controller = params.timeoutMs ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), params.timeoutMs) : null;

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': resolvedApiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-beta': 'prompt-caching-2024-07-31',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: params.model,
        ...(params.system
            ? { system: typeof params.system === 'string'
                ? [{ type: 'text', text: params.system, cache_control: { type: 'ephemeral' } }]
                : params.system }
            : {}),
        messages: sanitizedMessages,
        max_tokens: clampedMaxTokens,
        ...(typeof params.temperature === 'number' ? { temperature: params.temperature } : {}),
        stream: true,
      }),
      ...(controller ? { signal: controller.signal } : {}),
    });

    if (!response.ok) {
      const errorText = await response.text();
      yield { type: 'error', status: response.status, message: errorText };
      return;
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        try {
          const event = JSON.parse(data);
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            yield { type: 'chunk', text: event.delta.text };
          } else if (event.type === 'message_stop') {
            return;
          }
        } catch {
          // skip malformed SSE event
        }
      }
    }
  } catch (error) {
    const isAbort = error instanceof Error && error.name === 'AbortError';
    yield {
      type: 'error',
      status: isAbort ? 408 : 500,
      message: isAbort ? 'Request timed out' : String(error),
    };
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
}
