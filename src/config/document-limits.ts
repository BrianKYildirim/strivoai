/**
 * document-limits.ts — Single dual-imported source of truth for Phase 01.1.
 *
 * This module is imported by both the Vite frontend and Supabase Edge Functions
 * through the `_shared/document-limits.ts` re-export bridge.
 *
 * Zero edge-layer dependencies — safe to import without browser-only runtime
 * initialization.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type LimitedDocumentType = 'resume' | 'linkedin_profile';

// ── Document limits ──────────────────────────────────────────────────────────

export const MAX_PAGES: Record<LimitedDocumentType, number> = {
  resume: 2, // D-01: resume-class documents are limited to two pages.
  // D-02/D-03: unchanged — LinkedIn exports routinely span 3-8 pages and feed
  // two Elite-paid features.
  linkedin_profile: 12,
};

// D-06: conservative in the ACCEPT direction; rejecting a valid two-page
// resume is worse than accepting an occasional three-page export.
export const DOCX_WORD_COUNT_BACKSTOP = 1600;

// Mirrors the existing resumes bucket limit from migration 20251113102013.
// Bounding bytes before PDF parsing also protects the edge runtime's CPU budget.
export const MAX_UPLOAD_BYTES = 5242880;

export const ACCEPTED_RESUME_DOCUMENT_EXTENSIONS = ['.pdf', '.docx'] as const;
export const ACCEPTED_RESUME_DOCUMENT_ACCEPT =
  ACCEPTED_RESUME_DOCUMENT_EXTENSIONS.join(',');
export const RESUME_DOCUMENT_TYPE_LABEL = 'PDF or DOCX';

// D-02: LinkedIn PDF surfaces are exempt from the resume two-page cap and
// retain their existing PDF-only browser accept contract.
export const LINKEDIN_PDF_ACCEPT = '.pdf,application/pdf';

// ── Recruiting Lens limits ───────────────────────────────────────────────────

export const RECRUITING_LENS_JD_MAX_CHARS = 6000;
export const RECRUITING_LENS_JD_WARN_CHARS = Math.floor(
  RECRUITING_LENS_JD_MAX_CHARS * 0.9,
);

// ── Locked user-facing messages ──────────────────────────────────────────────

export const MSG_PAGE_LIMIT =
  'Your document is longer than the 2-page limit. Please upload a PDF or DOCX file containing no more than 2 pages.';
export const MSG_UNSUPPORTED_TYPE =
  'Unsupported file type. Please upload a PDF or DOCX file.';
export const MSG_VALIDATION_UNAVAILABLE =
  "We couldn't validate this document. Please try again or upload a different PDF or DOCX file.";
export const MSG_JD_TOO_LONG =
  'Job descriptions may contain up to 6,000 characters.';

export function getRecruitingLensJdLimitError(
  jobDescription: string,
): string | null {
  return jobDescription.length > RECRUITING_LENS_JD_MAX_CHARS
    ? MSG_JD_TOO_LONG
    : null;
}
