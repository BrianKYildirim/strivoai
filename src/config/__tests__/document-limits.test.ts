import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAX_PAGES,
  MSG_JD_TOO_LONG,
  MSG_PAGE_LIMIT,
  MSG_UNSUPPORTED_TYPE,
  MSG_VALIDATION_UNAVAILABLE,
  RECRUITING_LENS_JD_MAX_CHARS,
  RECRUITING_LENS_JD_WARN_CHARS,
} from '../document-limits';

describe('Phase 01.1 document limits', () => {
  it('preserves the locked user-facing messages byte-for-byte', () => {
    expect(MSG_PAGE_LIMIT).toBe(
      'Your document is longer than the 2-page limit. Please upload a PDF or DOCX file containing no more than 2 pages.',
    );
    expect(MSG_UNSUPPORTED_TYPE).toBe(
      'Unsupported file type. Please upload a PDF or DOCX file.',
    );
    expect(MSG_VALIDATION_UNAVAILABLE).toBe(
      "We couldn't validate this document. Please try again or upload a different PDF or DOCX file.",
    );
    expect(MSG_JD_TOO_LONG).toBe(
      'Job descriptions may contain up to 6,000 characters.',
    );
  });

  it('keeps resume, LinkedIn, and Recruiting Lens limits distinct', () => {
    expect(MAX_PAGES.resume).toBe(2);
    expect(MAX_PAGES.linkedin_profile).toBe(12);
    expect(RECRUITING_LENS_JD_MAX_CHARS).toBe(6000);
    expect(RECRUITING_LENS_JD_WARN_CHARS).toBe(5400);
  });

  it('remains import-free for the Deno re-export bridge', () => {
    const source = readFileSync(
      join(process.cwd(), 'src', 'config', 'document-limits.ts'),
      'utf8',
    );

    expect(source).not.toMatch(/^\s*import\s/m);
  });
});
