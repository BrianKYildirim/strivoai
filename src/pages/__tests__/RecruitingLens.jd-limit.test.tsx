/**
 * Phase 01.1 Plan 04 — Recruiting Lens job-description limit drift guard.
 *
 * This source contract intentionally fails if a future edit replaces the shared
 * constants with local numeric literals or drops the rejection-state guarantees.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MSG_JD_TOO_LONG,
  RECRUITING_LENS_JD_MAX_CHARS,
  RECRUITING_LENS_JD_WARN_CHARS,
} from '@/config/document-limits';

const source = readFileSync(resolve('src/pages/RecruitingLens.tsx'), 'utf8');
const jobDescriptionRegion = source.slice(
  source.indexOf('{/* Job Description */}'),
  source.indexOf('{/* LinkedIn collapsible */}'),
);
const invalidInputBranch = source.slice(
  source.indexOf("if (errCode === 'invalid_input')"),
  source.indexOf('// Check for timeout'),
);
const failureBranch = source.slice(
  source.indexOf('} else if (result.error) {'),
  source.indexOf('const handleAnalyze = async () => {'),
);

describe('RecruitingLens job-description limit contract', () => {
  it('derives the textarea cap, warning, and counter from shared constants', () => {
    expect(RECRUITING_LENS_JD_MAX_CHARS).toBe(6_000);
    expect(RECRUITING_LENS_JD_WARN_CHARS).toBe(5_400);
    expect(source).toContain('from "@/config/document-limits"');
    expect(jobDescriptionRegion).toContain(
      'maxLength={RECRUITING_LENS_JD_MAX_CHARS}',
    );
    expect(jobDescriptionRegion).toContain(
      'jobDescription.length > RECRUITING_LENS_JD_WARN_CHARS',
    );
    expect(jobDescriptionRegion).toContain(
      '{RECRUITING_LENS_JD_MAX_CHARS.toLocaleString()}',
    );
    expect(jobDescriptionRegion).not.toMatch(/\b(2700|3000|5400|6000|8000)\b/);
  });

  it('keeps the helper and counter accessible without a noisy live region', () => {
    expect(MSG_JD_TOO_LONG).toBe(
      'Job descriptions may contain up to 6,000 characters.',
    );
    expect(jobDescriptionRegion).toContain(
      'aria-describedby="job-description-help job-description-count"',
    );
    expect(jobDescriptionRegion).toContain('id="job-description-help"');
    expect(jobDescriptionRegion).toContain('{MSG_JD_TOO_LONG}');
    expect(jobDescriptionRegion).toContain('id="job-description-count"');
    expect(jobDescriptionRegion).toContain('tabular-nums');
    expect(jobDescriptionRegion).not.toContain('aria-live');
  });

  it('preserves every input and returns focus after a server invalid-input response', () => {
    expect(source).toContain('company: companyName.trim()');
    expect(source).toContain('roleTitle: roleTitle.trim()');
    expect(source).toContain('jobDescription: jobDescription.trim()');
    expect(source).toContain('resumeSummary: resumeSummary');
    expect(source).toContain(
      'linkedinText: linkedinText.trim() || undefined',
    );
    expect(invalidInputBranch).toContain('jobDescriptionRef.current?.focus()');
    expect(invalidInputBranch).toContain('errorData.message');
    expect(failureBranch).toContain('settle.rollback()');
    expect(failureBranch).not.toContain('setCompanyName(');
    expect(failureBranch).not.toContain('setRoleTitle(');
    expect(failureBranch).not.toContain('setJobDescription(');
    expect(failureBranch).not.toContain('setResumeSummary(');
    expect(failureBranch).not.toContain('setLinkedinText(');
  });

  it('does not apply the resume page cap to the optional LinkedIn source', () => {
    expect(source).toContain('LINKEDIN_PDF_ACCEPT');
  });
});
