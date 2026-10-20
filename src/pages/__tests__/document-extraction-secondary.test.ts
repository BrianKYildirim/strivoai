import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

const productionRoots = ['src/pages', 'src/components'];
const directImportPattern = /from\s+["']@\/lib\/extract-pdf-text["']/;
const providerMetadataPattern = /ollama|claude_ocr|attemptedProviders|provider used/i;
const tokenPersistencePattern = /(?:localStorage|sessionStorage)\.(?:setItem|getItem)\([^\n]*featureRunToken/i;

const secondaryFiles = [
  'src/pages/CareerCompass.tsx',
  'src/pages/Profile.tsx',
  'src/pages/RecruitingLens.tsx',
  'src/pages/Jobs.tsx',
  'src/components/ActionFirstHero.tsx',
  'src/components/MinimalHero.tsx',
];

const allowedDirectImports = new Set<string>([
  // Low-level implementation files and source assertion tests are intentionally outside
  // the production page/component scan below.
]);

function source(path: string): string {
  return readFileSync(resolve(path), 'utf8').replace(/\r\n/g, '\n');
}

function walkSourceFiles(root: string): string[] {
  const entries = readdirSync(resolve(root), { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolute = join(resolve(root), entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      files.push(...walkSourceFiles(absolute));
      continue;
    }

    if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      files.push(relative(resolve(), absolute).replace(/\\/g, '/'));
    }
  }

  return files;
}

describe('secondary document extraction facade', () => {
  it('aligns Career Compass and Profile LinkedIn/resume extraction to accepted shared text', () => {
    const careerCompassSource = source('src/pages/CareerCompass.tsx');
    const profileSource = source('src/pages/Profile.tsx');

    expect(careerCompassSource).toContain('serializeDocumentExtractionMetadata');
    expect(careerCompassSource).not.toMatch(directImportPattern);
    expect(careerCompassSource).not.toContain('const renderPdfPagesToImages');
    expect(careerCompassSource).toContain("documentType: 'resume'");
    expect(careerCompassSource).toContain("documentType: 'linkedin_profile'");
    expect(careerCompassSource).toContain('linkedin_pdf_content: linkedinPdfContent');
    expect(careerCompassSource).toContain('linkedin_pdf_text_hash: linkedinPdfMetadata.textHash');
    expect(careerCompassSource).toContain('linkedin_pdf_extraction_metadata: serializeDocumentExtractionMetadata(linkedinPdfMetadata)');
    expect(careerCompassSource).toContain('setSavedLinkedinContent(linkedinPdfContent)');

    const failedExtractionIndex = careerCompassSource.indexOf('Failed to extract LinkedIn PDF');
    const profileUpdateIndex = careerCompassSource.indexOf('linkedin_pdf_content: linkedinPdfContent');
    expect(failedExtractionIndex).toBeGreaterThan(profileUpdateIndex);

    expect(profileSource).toContain('serializeDocumentExtractionMetadata');
    expect(profileSource).not.toMatch(directImportPattern);
    expect(profileSource).toContain("documentType: 'linkedin_profile'");
    expect(profileSource).toContain('linkedin_pdf_content: linkedinPdfContent');
    expect(profileSource).toContain('linkedin_pdf_text_hash: linkedinExtraction.metadata.textHash');
    expect(profileSource).toContain('linkedin_pdf_extraction_metadata: serializeDocumentExtractionMetadata(linkedinExtraction.metadata)');
    expect(profileSource).toContain('.eq("id", user.id)');
  });

  it('aligns remaining secondary resume and LinkedIn PDF entry points to the shared facade', () => {
    for (const filePath of ['src/pages/RecruitingLens.tsx']) {
      const fileSource = source(filePath);
      expect(fileSource).toContain('extractDocumentFromPdf');
      expect(fileSource).not.toMatch(directImportPattern);
    }

    for (const filePath of [
      'src/pages/Jobs.tsx',
      'src/components/ActionFirstHero.tsx',
      'src/components/MinimalHero.tsx',
    ]) {
      const fileSource = source(filePath);
      expect(fileSource).toContain('extractDocumentFromFile');
      expect(fileSource).not.toMatch(directImportPattern);
    }

    expect(source('src/pages/RecruitingLens.tsx')).toContain("documentType: 'linkedin_profile'");
    expect(source('src/pages/Jobs.tsx')).toContain("documentType: 'resume'");
    expect(source('src/components/ActionFirstHero.tsx')).toContain("documentType: 'resume'");
    expect(source('src/components/MinimalHero.tsx')).toContain("documentType: 'resume'");
    expect(source('src/components/MinimalHero.tsx')).toContain('resumeId: resume.id');
  });

  it('keeps production pages/components from importing the low-level pdfjs text helper directly', () => {
    const offenders = productionRoots
      .flatMap(walkSourceFiles)
      .filter((filePath) => !allowedDirectImports.has(filePath))
      .filter((filePath) => directImportPattern.test(source(filePath)));

    expect(offenders).toEqual([]);
  });

  it('does not render provider metadata labels in normal secondary UI', () => {
    const combinedSource = secondaryFiles.map(source).join('\n');
    expect(combinedSource).not.toMatch(providerMetadataPattern);
  });

  it('does not persist opaque feature-run correlation in secondary UI storage', () => {
    const combinedSource = secondaryFiles.map(source).join('\n');
    expect(combinedSource).not.toMatch(tokenPersistencePattern);
  });
});
