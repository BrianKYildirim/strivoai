import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractDocumentText } from "./document-extraction.ts";
import { DOCUMENT_EXTRACTION_VERSION, type DocumentType, type ExtractionPolicy } from "./document-extraction-types.ts";

// NOTE: The Ollama extraction leg was removed in Phase 04 plan 04-04 (CLEAN-03,
// operator-confirmed dead in prod). The cheap-OCR fallback chain is now
// pdf_parser -> mistral -> textract -> claude_ocr (no ollama). These cases were
// reconciled to that chain in the Phase 04 code-review closeout.

const resumeText = `
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

Education
University of Washington, Bachelor of Science in Computer Science

Skills
TypeScript, React, Deno, Supabase, PostgreSQL, testing, accessibility, observability,
technical leadership, API design, product analytics, security reviews, and documentation.
`;

const alternateResumeText = `
Alex Morgan
Engineering Manager
alex.morgan@example.com | linkedin.com/in/alexmorgan | Austin, TX

Summary
Engineering leader with deep experience in platform delivery, workflow products, and
document automation. Builds practical systems for customer operations, candidate review,
and analytics teams while keeping reliability, accessibility, and maintainability visible.

Experience
Engineering Manager, Meridian Labs, 2020 to Present
- Managed seven engineers shipping React, Deno, Supabase, and PostgreSQL services.
- Improved document review operations with resilient extraction and structured reporting.
- Led roadmap planning, production support, incident review, and stakeholder communication.

Education
University of Texas, Bachelor of Science in Computer Science

Skills
TypeScript, React, Deno, Supabase, PostgreSQL, API design, testing, leadership, security,
accessibility, analytics, documentation, incident response, and product strategy.
`;

function policy(tier: string, allowClaudeOcr: boolean): ExtractionPolicy {
  return {
    userId: "user-1",
    tier,
    allowClaudeOcr,
    documentType: "resume",
    documentHash: "d".repeat(64),
    extractionVersion: DOCUMENT_EXTRACTION_VERSION,
  };
}

Deno.test("extractDocumentText accepts parser text and stops before OCR providers", async () => {
  let mistralCalls = 0;
  let textractCalls = 0;
  let claudeCalls = 0;

  const result = await extractDocumentText({
    documentType: "resume",
    policy: policy("free", false),
    pdfjsText: resumeText,
    images: ["page-one"],
    mistralOcr: async () => {
      mistralCalls += 1;
      return { ok: true, text: alternateResumeText };
    },
    textractOcr: async () => {
      textractCalls += 1;
      return { ok: true, text: alternateResumeText };
    },
    claudeOcr: async () => {
      claudeCalls += 1;
      return alternateResumeText;
    },
  });

  assert(result.ok);
  assertEquals(result.metadata.provider, "pdf_parser");
  assertEquals(result.metadata.attemptedProviders, ["pdf_parser"]);
  assertEquals(result.metadata.documentHash, "d".repeat(64));
  assertEquals(result.metadata.extractionVersion, DOCUMENT_EXTRACTION_VERSION);
  assertEquals(mistralCalls, 0);
  assertEquals(textractCalls, 0);
  assertEquals(claudeCalls, 0);
});

Deno.test("extractDocumentText accepts configured cheap OCR after rejected parser text", async () => {
  let claudeCalls = 0;

  const result = await extractDocumentText({
    documentType: "resume",
    policy: policy("pro", false),
    pdfjsText: "Education. Skills.",
    images: ["page-one"],
    mistralOcr: async () => ({ ok: true, text: resumeText }),
    textractOcr: async () => ({ ok: false, reason: "textract_config_missing" }),
    claudeOcr: async () => {
      claudeCalls += 1;
      return alternateResumeText;
    },
  });

  assert(result.ok);
  assertEquals(result.metadata.provider, "mistral");
  assertEquals(result.metadata.attemptedProviders, ["pdf_parser", "mistral"]);
  assertMatch(result.metadata.fallbackReason ?? "", /pdf_parser_too_short/);
  assertEquals(claudeCalls, 0);
});

Deno.test("extractDocumentText blocks Claude OCR for non-Elite users after cheap providers fail", async () => {
  let claudeCalls = 0;

  const result = await extractDocumentText({
    documentType: "resume",
    policy: policy("pro", false),
    pdfjsText: "Education. Skills.",
    images: ["page-one"],
    mistralOcr: async () => ({ ok: false, reason: "mistral_config_missing" }),
    textractOcr: async () => ({ ok: false, reason: "textract_config_missing" }),
    claudeOcr: async () => {
      claudeCalls += 1;
      return alternateResumeText;
    },
  });

  assert(!result.ok);
  if (result.ok) throw new Error("expected extraction failure");
  assertEquals(result.reason, "all_providers_failed");
  assertEquals(result.attemptedProviders, ["pdf_parser", "mistral", "textract"]);
  assertEquals(claudeCalls, 0);
});

Deno.test("extractDocumentText allows literal Elite Claude OCR only after parser and cheap providers fail", async () => {
  const result = await extractDocumentText({
    documentType: "resume",
    policy: policy("elite", true),
    pdfjsText: "Education. Skills.",
    images: ["page-one"],
    mistralOcr: async () => ({ ok: false, reason: "mistral_config_missing" }),
    textractOcr: async () => ({ ok: false, reason: "textract_config_missing" }),
    claudeOcr: async () => alternateResumeText,
  });

  assert(result.ok);
  assertEquals(result.metadata.provider, "claude_ocr");
  assertEquals(result.metadata.attemptedProviders, ["pdf_parser", "mistral", "textract", "claude_ocr"]);
  assertMatch(result.metadata.fallbackReason ?? "", /pdf_parser_too_short/);
});

Deno.test("extractDocumentText treats legacy or admin Pro policy as non-Elite", async () => {
  for (const tier of ["pro", "legacy_pro", "admin_pro", "trial_pro"]) {
    let claudeCalls = 0;
    const result = await extractDocumentText({
      documentType: "resume",
      policy: policy(tier, false),
      pdfjsText: "",
      images: [],
      mistralOcr: async () => ({ ok: false, reason: "mistral_no_images" }),
      textractOcr: async () => ({ ok: false, reason: "textract_no_images" }),
      claudeOcr: async () => {
        claudeCalls += 1;
        return alternateResumeText;
      },
    });

    assert(!result.ok);
    if (result.ok) throw new Error(`expected ${tier} extraction failure`);
    assertEquals(claudeCalls, 0);
  }
});

Deno.test("extractDocumentText returns all_providers_failed with no accepted text", async () => {
  const result = await extractDocumentText({
    documentType: "resume",
    policy: policy("elite", true),
    pdfjsText: "Education. Skills.",
    images: ["page-one"],
    mistralOcr: async () => ({ ok: false, reason: "mistral_config_missing" }),
    textractOcr: async () => ({ ok: false, reason: "textract_config_missing" }),
    claudeOcr: async () => ({ ok: false, reason: "claude_ocr_failed" }),
  });

  assert(!result.ok);
  if (result.ok) throw new Error("expected extraction failure");
  assertEquals(result.reason, "all_providers_failed");
  assertEquals(result.attemptedProviders, ["pdf_parser", "mistral", "textract", "claude_ocr"]);
  assertEquals("text" in result, false);
  assertEquals(result.attempts?.map(attempt => attempt.reason), [
    "pdf_parser_too_short",
    "mistral_config_missing",
    "textract_config_missing",
    "claude_ocr_failed",
  ]);
});

Deno.test('extractDocumentText preserves safe provider evidence on accepted and failed OCR routes', async () => {
  const evidence = {
    provider: 'mistral' as const,
    modelOrApi: 'mistral-ocr-4-0',
    region: null,
    providerRequestId: 'request-1',
    billablePages: 2,
    attemptCount: 1,
    durationMs: 25,
    reportedCostUsd: 0.008,
  };
  const accepted = await extractDocumentText({
    documentType: 'resume',
    policy: policy('elite', true),
    pdfjsText: '',
    images: ['one', 'two'],
    mistralOcr: async () => ({ ok: true, text: resumeText, evidence }),
    textractOcr: async () => ({ ok: false, reason: 'textract_config_missing' }),
    claudeOcr: async () => ({ ok: false, reason: 'claude_ocr_failed' }),
  });
  assert(accepted.ok);
  assertEquals(accepted.providerEvidence, evidence);
  assertEquals(accepted.attempts?.[1].providerEvidence, evidence);

  const failureEvidence = { ...evidence, providerRequestId: 'request-2', billablePages: null, reportedCostUsd: null };
  const failed = await extractDocumentText({
    documentType: 'resume',
    policy: policy('pro', false),
    pdfjsText: '',
    images: ['one'],
    mistralOcr: async () => ({ ok: false, reason: 'mistral_http_503', evidence: failureEvidence }),
    textractOcr: async () => ({ ok: false, reason: 'textract_config_missing' }),
    claudeOcr: async () => ({ ok: false, reason: 'claude_ocr_failed' }),
  });
  assert(!failed.ok);
  if (failed.ok) throw new Error('expected failure');
  assertEquals(failed.attempts?.[1].providerEvidence, failureEvidence);
});
