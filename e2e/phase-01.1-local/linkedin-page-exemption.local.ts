import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { buildResumePdfBytes } from '../fixtures/make-unique-resume';

test('LinkedIn picker remains PDF-only and uses its twelve-page extraction path', async () => {
  const linkedIn = readFileSync(resolve('src/pages/LinkedInGrader.tsx'), 'utf8');
  const extraction = readFileSync(resolve('src/lib/document-extraction.ts'), 'utf8');
  const fivePageBytes = buildResumePdfBytes({
    pageCount: 5,
    runToken: 'phase-01.1-linkedin-exemption',
  });

  expect(fivePageBytes.byteLength).toBeGreaterThan(0);
  expect(linkedIn).toContain('LINKEDIN_PDF_ACCEPT');
  expect(linkedIn).toContain("documentType: 'linkedin_profile'");
  expect(extraction).toContain("linkedin_profile: 12");
  expect(linkedIn).not.toContain('Maximum 2 pages.');
});
