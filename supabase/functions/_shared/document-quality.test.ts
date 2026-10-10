import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
  DocumentType,
  ExtractionMetadata,
  ExtractionProvider,
  ExtractionResult,
  QualityStatus,
} from "./document-extraction-types.ts";
import {
  assessExtractionQuality,
  canonicalizeExtractedText,
  extractedTextHash,
} from "./document-quality.ts";

const HEX64 = /^[0-9a-f]{64}$/;

const resumeFixture = `
Jordan Rivera
Senior Product Engineer
jordan.rivera@example.com | linkedin.com/in/jordanrivera | Seattle, WA

Summary
Product-minded software engineer with eight years of experience building reliable hiring,
analytics, and workflow products for fast moving teams. Known for translating ambiguous
business needs into maintainable TypeScript services, measurable product outcomes, and
clear operational runbooks.

Experience
Staff Software Engineer, Northstar Systems, 2021 to Present
- Led a team of five engineers building React and Supabase workflows for enterprise users.
- Designed a document processing service that reduced manual review time by forty percent.
- Partnered with design, support, and customer success to improve activation and retention.
- Mentored engineers on incident response, code review quality, and pragmatic architecture.

Senior Frontend Engineer, ArcLight Labs, 2018 to 2021
- Built dashboard components, search tooling, and accessibility improvements in TypeScript.
- Improved performance budgets for reporting views and reduced p95 route load latency.
- Coordinated releases with product managers, QA, and data analysts.

Education
University of Washington, Bachelor of Science in Computer Science

Skills
TypeScript, React, Deno, Supabase, PostgreSQL, testing, accessibility, observability,
technical leadership, API design, product analytics, security reviews, and documentation.

Projects
Open source contributor for workflow automation tools and internal platform libraries.
`;

const linkedinFixture = `
LinkedIn
Morgan Chen
Principal Career Strategist
Greater New York City Area | 500+ connections

Headline
Helping product and engineering leaders build focused job search strategies with practical
market insight, interview coaching, and measurable weekly execution systems.

About
I work with senior professionals who need a clearer career narrative and a repeatable plan
for targeting roles. My background includes recruiting operations, candidate enablement,
resume review, interview training, and data-informed job search planning. I care about
specific evidence, honest positioning, and workflows that reduce friction for applicants.

Experience
Founder and Principal Consultant, North Loop Careers, 2020 to Present
- Built coaching programs for managers, staff engineers, and go-to-market leaders.
- Created career documents, networking plans, and interview preparation systems.
- Partnered with hiring teams to understand signals behind successful candidate profiles.

Director of Talent Programs, Vertex Cloud, 2015 to 2020
- Managed recruiter enablement, candidate experience, and executive hiring projects.
- Improved offer acceptance through better role calibration and interview feedback loops.

Education
New York University, Master of Arts in Organizational Psychology
Boston University, Bachelor of Arts in Communications

Skills
Career coaching, LinkedIn optimization, resume strategy, interviewing, recruiting operations,
talent analytics, leadership communication, stakeholder management, and program design.

Activity
Recent posts discuss market mapping, skills narratives, networking habits, and interview loops.
`;

Deno.test("document extraction types expose stable provider and result contracts", () => {
  const providers: ExtractionProvider[] = ['pdf_parser', 'ollama', 'mistral', 'textract', 'claude_ocr'];
  const documentTypes: DocumentType[] = ['resume', 'linkedin_profile'];
  const qualityStatuses: QualityStatus[] = ['accepted', 'rejected', 'failed'];
  const metadata: ExtractionMetadata = {
    provider: 'pdf_parser',
    attemptedProviders: providers,
    qualityStatus: 'accepted',
    documentType: 'resume',
    textHash: 'a'.repeat(64),
    documentHash: 'b'.repeat(64),
    extractionVersion: 'phase51-v1',
    extractedAt: '2026-06-05T00:00:00.000Z',
    reusedAcceptedText: false,
    fallbackReason: 'ollama_timeout',
  };
  const result: ExtractionResult = { ok: true, text: resumeFixture, metadata };

  assertEquals(providers, ['pdf_parser', 'ollama', 'mistral', 'textract', 'claude_ocr']);
  assertEquals(documentTypes, ['resume', 'linkedin_profile']);
  assertEquals(qualityStatuses, ['accepted', 'rejected', 'failed']);
  assert(result.ok);
});

Deno.test("assessExtractionQuality accepts realistic resume text", () => {
  const quality = assessExtractionQuality({
    text: resumeFixture,
    documentType: 'resume',
    provider: 'pdf_parser',
  });

  assert(quality.ok, `expected resume fixture to pass, got ${quality.reason}`);
  assert(quality.wordCount >= 65);
  assert(quality.charCount >= 320);
  assert(quality.signalCount >= 1);
});

Deno.test("assessExtractionQuality accepts realistic LinkedIn profile text", () => {
  const quality = assessExtractionQuality({
    text: linkedinFixture,
    documentType: 'linkedin_profile',
    provider: 'ollama',
  });

  assert(quality.ok, `expected LinkedIn fixture to pass, got ${quality.reason}`);
  assert(quality.wordCount >= 80);
  assert(quality.charCount >= 420);
  assert(quality.signalCount >= 1);
});

Deno.test("assessExtractionQuality rejects short text", () => {
  const quality = assessExtractionQuality({
    text: "Experience. Education. Skills.",
    documentType: 'resume',
    provider: 'pdf_parser',
  });

  assert(!quality.ok);
  assertEquals(quality.reason, 'too_short');
});

Deno.test("assessExtractionQuality rejects symbol-heavy output", () => {
  const noisy = `${resumeFixture}\n${'@#$%^*~=|'.repeat(180)}`;
  const quality = assessExtractionQuality({
    text: noisy,
    documentType: 'resume',
    provider: 'ollama',
  });

  assert(!quality.ok);
  assertEquals(quality.reason, 'too_noisy');
});

Deno.test("assessExtractionQuality rejects repeated-line output", () => {
  const repeated = [
    "Experience",
    "Education",
    "Skills",
    ...Array.from({ length: 18 }, () => "This provider returned the same extracted line again and again."),
    "University degree project leadership analytics testing strategy platform reliability",
    "Product work customer research TypeScript React Supabase implementation support",
  ].join("\n");
  const quality = assessExtractionQuality({
    text: repeated,
    documentType: 'resume',
    provider: 'claude_ocr',
  });

  assert(!quality.ok);
  assertEquals(quality.reason, 'repetitive');
});

Deno.test("assessExtractionQuality rejects missing document signals", () => {
  const generic = `
The quarterly operations review described a facilities improvement program across several
offices. Managers discussed supply planning, vendor coordination, budget forecasting,
maintenance scheduling, customer service coverage, inventory checks, and communication
cadence. The narrative included many normal words and complete paragraphs so it should
not be rejected by length alone. It intentionally avoids the expected career document
signals and reads like a general business memo instead of a candidate profile or hiring
document. Teams agreed to clarify owners, publish a timeline, assign weekly updates,
review risks, collect feedback, improve reporting, and keep stakeholders aligned through
the next planning cycle. Additional paragraphs describe seating maps, procurement tasks,
meeting rooms, internal newsletters, and equipment refresh planning for regional offices.
The content is coherent, readable, and long enough to pass the length floor while still
lacking the section markers required for the declared source type.
`;
  const quality = assessExtractionQuality({
    text: generic,
    documentType: 'linkedin_profile',
    provider: 'pdf_parser',
  });

  assert(!quality.ok);
  assertEquals(quality.reason, 'missing_document_signals');
});

Deno.test("canonicalizeExtractedText preserves line breaks and normalizes whitespace", () => {
  const canonical = canonicalizeExtractedText("  Summary\t\ttext \r\n\r\n\r\n Skills   list  ");
  assertEquals(canonical, "Summary text\n\nSkills list");
});

Deno.test("extractedTextHash is stable for whitespace-equivalent text", async () => {
  const a = await extractedTextHash("Summary text\n\nSkills list");
  const b = await extractedTextHash(" Summary   text\r\n\r\n\r\nSkills\tlist ");

  assertEquals(a, b);
  assertMatch(a, HEX64);
});

Deno.test("extractedTextHash changes for materially different text", async () => {
  const a = await extractedTextHash("Summary text\n\nSkills list");
  const b = await extractedTextHash("Summary text\n\nExperience list");

  assert(a !== b);
});
