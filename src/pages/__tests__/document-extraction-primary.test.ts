import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const helperSource = readFileSync(resolve('src/lib/document-extraction.ts'), 'utf8').replace(/\r\n/g, '\n');
const uploadSource = readFileSync(resolve('src/pages/Upload.tsx'), 'utf8').replace(/\r\n/g, '\n');
const linkedInSource = readFileSync(resolve('src/pages/LinkedInGrader.tsx'), 'utf8').replace(/\r\n/g, '\n');
const recruitingLensSource = readFileSync(resolve('src/pages/RecruitingLens.tsx'), 'utf8').replace(/\r\n/g, '\n');
const onboardingSource = readFileSync(resolve('src/pages/Onboarding.tsx'), 'utf8').replace(/\r\n/g, '\n');
const profileSource = readFileSync(resolve('src/pages/Profile.tsx'), 'utf8').replace(/\r\n/g, '\n');
const careerCompassSource = readFileSync(resolve('src/pages/CareerCompass.tsx'), 'utf8').replace(/\r\n/g, '\n');
const minimalHeroSource = readFileSync(resolve('src/components/MinimalHero.tsx'), 'utf8').replace(/\r\n/g, '\n');
const actionFirstHeroSource = readFileSync(resolve('src/components/ActionFirstHero.tsx'), 'utf8').replace(/\r\n/g, '\n');
const limitsSource = readFileSync(resolve('src/config/document-limits.ts'), 'utf8').replace(/\r\n/g, '\n');
const resumeBucketMimeMigration = readFileSync(
  resolve('supabase/migrations/20260723120000_revoke_text_mime_types_from_resumes_bucket.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

describe('primary document extraction facade', () => {
  it('keeps pdfjs first and routes fallback through ocr-pdf with server-owned providers', () => {
    expect(helperSource).toContain("import { extractPDFText } from '@/lib/extract-pdf-text'");
    expect(helperSource).toContain("import { invokeWithTimeout } from '@/lib/fetchWithTimeout'");
    expect(helperSource).toContain('extractDocumentFromPdf');
    expect(helperSource).toContain("invokeWithTimeout<DocumentExtractionFallbackResponse>(");
    expect(helperSource).toContain("'ocr-pdf'");
    expect(helperSource).toContain('documentType');
    expect(helperSource).toContain('resumeId');
    expect(helperSource).toContain('pdfjsText');

    expect(helperSource).not.toContain('OLLAMA_BASE_URL');
    expect(helperSource).not.toContain('OLLAMA_MODEL');
    expect(helperSource).not.toContain('OLLAMA_AUTH');
  });

  it('serializes accepted extraction metadata with a concise DB-safe allowlist', () => {
    expect(helperSource).toContain('serializeDocumentExtractionMetadata');
    expect(helperSource).toContain('attempted_providers: [...metadata.attemptedProviders]');
    expect(helperSource).toContain('quality_status: metadata.qualityStatus');
    expect(helperSource).toContain('document_type: metadata.documentType');
    expect(helperSource).toContain('text_hash: metadata.textHash');
    expect(helperSource).toContain('document_hash: metadata.documentHash');
    expect(helperSource).toContain('extraction_version: metadata.extractionVersion');
    expect(helperSource).toContain('extracted_at: metadata.extractedAt');
    expect(helperSource).toContain('reused_accepted_text: metadata.reusedAcceptedText');
    expect(helperSource).toContain('fallback_reason: metadata.fallbackReason');
    expect(helperSource).not.toMatch(/prompt|messages|rawResponse|responseBody|transcript|sections/i);
  });

  it('passes document identity through the server-owned extraction endpoint', () => {
    expect(helperSource).toContain("import { calculateFileHash } from '@/lib/fileHash'");
    expect(helperSource).toContain('const documentHash = await calculateFileHash(params.file)');
    expect(helperSource).toContain('documentHash');
    expect(helperSource).toContain('extractionVersion: DOCUMENT_EXTRACTION_VERSION');
    expect(helperSource).toContain("attemptedProviders: ['pdf_parser']");
    expect(helperSource).toContain("provider: params.provider ?? 'pdf_parser'");
  });

  it('transports opaque correlation for parser success and OCR without persisting it', () => {
    expect(helperSource).toContain('featureRunToken?: string');
    expect(helperSource).toContain('if (params.resumeId || params.featureRunToken)');
    expect(helperSource).toContain('featureRunToken: params.featureRunToken');
    expect(helperSource).toContain('documentOrdinal: params.documentOrdinal');
    expect(helperSource).toContain('fileSizeBytes: params.file.size');

    const serializerBlock = helperSource.match(
      /export function serializeDocumentExtractionMetadata[\s\S]*?^}/m,
    );
    expect(serializerBlock).not.toBeNull();
    expect(serializerBlock?.[0]).not.toContain('featureRunToken');
  });

  it('keeps the resumes storage bucket MIME allowlist aligned with resume document support', () => {
    expect(limitsSource).toContain("export const ACCEPTED_RESUME_DOCUMENT_EXTENSIONS = ['.pdf', '.docx'] as const");
    expect(limitsSource).not.toContain("'.txt'");
    expect(limitsSource).not.toContain("'.md'");
    expect(helperSource).not.toContain(['extract', 'PlainText'].join(''));
    expect(helperSource).not.toContain("provider = 'plain_text'");
    expect(resumeBucketMimeMigration).toContain("WHERE id = 'resumes'");
    expect(resumeBucketMimeMigration).toContain("'application/pdf'");
    expect(resumeBucketMimeMigration).toContain("'application/vnd.openxmlformats-officedocument.wordprocessingml.document'");
    expect(resumeBucketMimeMigration).not.toContain("'text/plain'");
    expect(resumeBucketMimeMigration).not.toContain("'text/markdown'");
    expect(resumeBucketMimeMigration).not.toContain("'application/markdown'");
    expect(resumeBucketMimeMigration).not.toContain("'application/x-markdown'");
  });

  it('wires Resume Upload through shared extraction after the resume row exists', () => {
    expect(uploadSource).toContain('extractDocumentFromFile');
    expect(uploadSource).toContain('ACCEPTED_RESUME_DOCUMENT_ACCEPT');
    expect(uploadSource).not.toContain("import { pdfjs } from '@/lib/pdf-worker'");
    expect(uploadSource).not.toContain("import { extractPDFText } from '@/lib/extract-pdf-text'");
    expect(uploadSource).not.toContain('const renderPdfPagesToImages');
    expect(uploadSource).not.toContain('const extractTextWithOCR');
    expect(uploadSource).toContain("extractDocumentFromFile({");
    expect(uploadSource).toContain("documentType: 'resume'");
    expect(uploadSource).toContain('resumeId: resume.id');

    const insertIndex = uploadSource.indexOf(".from('resumes').insert");
    const extractionIndex = uploadSource.indexOf('extractDocumentFromFile({');
    expect(insertIndex).toBeGreaterThan(-1);
    expect(extractionIndex).toBeGreaterThan(insertIndex);
  });

  it('preserves LinkedIn replacement timing while using shared extraction', () => {
    expect(linkedInSource).toContain('serializeDocumentExtractionMetadata');
    expect(linkedInSource).not.toContain("import { extractPDFText } from '@/lib/extract-pdf-text'");
    expect(linkedInSource).toContain("documentType: 'linkedin_profile'");
    expect(linkedInSource).toContain('metadata: extraction.metadata');
    expect(linkedInSource).toContain('linkedin_pdf_text_hash = replacementLinkedInPdf.metadata.textHash');
    expect(linkedInSource).toContain('linkedin_pdf_extraction_metadata = serializeDocumentExtractionMetadata(');

    const invokeIndex = linkedInSource.indexOf("invokeWithTimeout<LinkedInGradeResponse>");
    const updateIndex = linkedInSource.indexOf(".update(updatePayload)");
    expect(invokeIndex).toBeGreaterThan(-1);
    expect(updateIndex).toBeGreaterThan(invokeIndex);
  });

  it('uses shared extraction in onboarding while keeping LinkedIn optional', () => {
    expect(onboardingSource).toContain('linkedin_pdf_content');
    expect(onboardingSource).toContain('serializeDocumentExtractionMetadata');
    expect(onboardingSource).not.toContain("import { extractPDFText } from '@/lib/extract-pdf-text'");
    expect(onboardingSource).toContain("documentType: 'resume'");
    expect(onboardingSource).toContain("documentType: 'linkedin_profile'");
    expect(onboardingSource).toContain('if (linkedinPdfFile) {');
    expect(onboardingSource).toContain('linkedin_pdf_text_hash?: string');
    expect(onboardingSource).toContain('linkedin_pdf_extraction_metadata?: ReturnType<typeof serializeDocumentExtractionMetadata>');
    expect(onboardingSource).toContain('profileUpdate.linkedin_pdf_text_hash = linkedinPdfMetadata.textHash');
    expect(onboardingSource).toContain('profileUpdate.linkedin_pdf_extraction_metadata = serializeDocumentExtractionMetadata(linkedinPdfMetadata)');
  });

  it('does not render provider metadata labels in normal primary UI', () => {
    const combinedPageSource = [uploadSource, linkedInSource, onboardingSource].join('\n');
    expect(combinedPageSource).not.toMatch(/ollama|claude_ocr|attemptedProviders|provider used/i);
  });

  it('keys the fast precheck on document type without changing OCR render budgets', () => {
    expect(helperSource).toContain('precheckResumeDocument');
    expect(helperSource).toContain('MAX_PAGES[documentType]');
    expect(helperSource).toContain("documentType === 'resume'");
    expect(helperSource).not.toContain('MAX_PAGES.resume');
    expect(helperSource).toMatch(
      /const PAGE_LIMITS:[\s\S]*?resume: 8,[\s\S]*?linkedin_profile: 12,/,
    );
  });

  it('preserves LINKEDIN_PDF_ACCEPT across all four LinkedIn pickers', () => {
    const linkedInPickers = [
      linkedInSource,
      recruitingLensSource,
      onboardingSource,
      profileSource,
    ];
    for (const source of linkedInPickers) {
      expect(source).toContain('LINKEDIN_PDF_ACCEPT');
      expect(source).not.toContain('MAX_PAGES.resume');
    }
  });

  it('validates every persisting resume flow before storage and preserves dedup-first reuse', () => {
    const persistingFlows = [
      ['Upload', uploadSource],
      ['Onboarding', onboardingSource],
      ['Profile', profileSource],
      ['CareerCompass', careerCompassSource],
      ['MinimalHero', minimalHeroSource],
    ] as const;

    for (const [name, source] of persistingFlows) {
      const validationIndex = source.search(/["']validate-document["']/);
      const uploadIndex = source.search(/storage(?:\n|\r|.){0,120}\.from\(["']resumes["']\)(?:\n|\r|.){0,120}\.upload/);
      expect(validationIndex, `${name}: validation seam`).toBeGreaterThan(-1);
      expect(uploadIndex, `${name}: storage upload`).toBeGreaterThan(validationIndex);
      expect(source, `${name}: local precheck`).toContain('precheckResumeDocument');
    }

    const uploadReuseIndex = uploadSource.indexOf('navigate(`/results/${existingResume.id}`)');
    expect(uploadReuseIndex).toBeGreaterThan(-1);
    expect(uploadSource.search(/["']validate-document["']/)).toBeGreaterThan(uploadReuseIndex);
  });

  it('gates anonymous replay state with the client precheck and no public validator seam', () => {
    const actionPrecheck = actionFirstHeroSource.indexOf('precheckResumeDocument(file');
    const actionReplay = actionFirstHeroSource.indexOf('sessionStorage.setItem("pendingResumeText"');
    expect(actionPrecheck).toBeGreaterThan(-1);
    expect(actionReplay).toBeGreaterThan(actionPrecheck);
    expect(actionFirstHeroSource).not.toContain("'validate-document'");

    const minimalPrecheck = minimalHeroSource.indexOf('precheckResumeDocument(file');
    const minimalReplay = minimalHeroSource.indexOf('sessionStorage.setItem("pendingResumeText"');
    expect(minimalPrecheck).toBeGreaterThan(-1);
    expect(minimalReplay).toBeGreaterThan(minimalPrecheck);
    expect(minimalHeroSource.match(/["']validate-document["']/g)).toHaveLength(1);
  });
});
