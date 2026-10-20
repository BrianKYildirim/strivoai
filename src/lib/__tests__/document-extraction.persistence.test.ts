/**
 * Regression guard for the 2026-08-04 production Career Compass outage.
 *
 * PRODUCTION FAILURE REPRODUCED HERE
 * ----------------------------------
 * A brand-new Free account completed onboarding, then Career Compass returned
 * "Analysis hit a server error — your Merits were refunded".
 *
 * Chain (all links verified against production):
 *   1. `begin-feature-run` returned 503 `feature_run_unavailable` on 100% of calls
 *      (prod `feature_runs` + `costing_subjects` were empty — the table had never
 *      taken a row), so the browser held `featureRunToken = undefined`.
 *   2. Onboarding still extracted the resume with pdf.js and the quality gate ACCEPTED it,
 *      then handed it to `persistAcceptedPdfjsResumeText`, which persists through `ocr-pdf`.
 *   3. `ocr-pdf` hard-requires a feature-run token (ocr-pdf/index.ts:343-353) and answered
 *      400 `invalid_feature_run_token`. The helper only `console.warn`ed and returned null,
 *      so `resumes.extracted_text` stayed NULL. Prod: every resume row created on
 *      2026-08-03/04 had no text, while every row through 2026-07-30 had it.
 *   4. Resume Analysis and LinkedIn Grader still passed — the first gets the text inline in
 *      the SAME session, the second never reads resume text.
 *   5. Career Compass, in a LATER session on the saved resume, had no source at all:
 *      backend raw-byte PDF parsing is intentionally a no-op
 *      (supabase/functions/_shared/pdf-parser.ts). analyze-career:1876 returned 400
 *      → taxonomy INPUT_MISSING → refund → generic error toast.
 *
 * The invariant these tests pin: an ACCEPTED browser extraction is DURABLY PERSISTED even
 * when the costing/telemetry route is unavailable. Telemetry is best-effort; user data is not.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeWithTimeout = vi.fn();
const extractPDFText = vi.fn();
const calculateFileHash = vi.fn();
const resumesUpdate = vi.fn();
const resumesEq = vi.fn();

vi.mock('@/lib/fetchWithTimeout', () => ({
  invokeWithTimeout: (...args: unknown[]) => invokeWithTimeout(...args),
}));
vi.mock('@/lib/extract-pdf-text', () => ({
  extractPDFText: (...args: unknown[]) => extractPDFText(...args),
}));
vi.mock('@/lib/fileHash', () => ({
  calculateFileHash: (...args: unknown[]) => calculateFileHash(...args),
}));
vi.mock('@/lib/pdf-worker', () => ({ pdfjs: { getDocument: vi.fn() } }));
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => {
      if (table !== 'resumes') throw new Error(`unexpected table ${table}`);
      return {
        update: (payload: Record<string, unknown>) => {
          resumesUpdate(payload);
          return { eq: (col: string, val: string) => resumesEq(col, val) };
        },
      };
    },
  },
}));

// A text-based resume that clears the browser quality gate
// (>= 65 words, >= 320 chars, has document signals).
const ACCEPTED_RESUME_TEXT = [
  'SARAH CHEN',
  '(949) 555-7823 | sarah.chen@example.com | Irvine, CA 92612',
  'EDUCATION',
  'University of California, Irvine — Bachelor of Science, Software Engineering, GPA 3.45',
  'TECHNICAL SKILLS',
  'Languages: Java, Python, C++, JavaScript, TypeScript, HTML, CSS, SQL',
  'Frameworks: React, Node.js, Express, Spring Boot, Django, Bootstrap',
  'EXPERIENCE',
  'TechFlow Solutions, Irvine, CA — Software Engineering Intern',
  '- Developed three full-stack web applications using React and Node.js serving 200 daily users.',
  '- Optimized PostgreSQL queries and reduced API response time by 30 percent across services.',
  'DataLink Corporation, Remote — Backend Development Intern',
  '- Built REST APIs with Spring Boot and Java supporting mobile features for 1000 users.',
  '- Implemented automated testing with JUnit and achieved 85 percent code coverage overall.',
  'PROJECTS',
  'EcoTracker — led a team of four building a React Native carbon footprint tracking app.',
].join('\n');

function makeResumeFile(): File {
  return new File([new Uint8Array([1, 2, 3])], 'resume.pdf', { type: 'application/pdf' });
}

async function importModule() {
  return await import('@/lib/document-extraction');
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  extractPDFText.mockResolvedValue(ACCEPTED_RESUME_TEXT);
  calculateFileHash.mockResolvedValue('doc-hash-abc123');
  resumesEq.mockResolvedValue({ error: null });
});

describe('accepted browser resume text survives a telemetry outage', () => {
  it('persists directly to resumes when ocr-pdf rejects the call with invalid_feature_run_token', async () => {
    // Exactly what production returned once begin-feature-run started 503ing.
    invokeWithTimeout.mockResolvedValue({
      data: null,
      error: { message: 'invalid_feature_run_token' },
    });

    const { extractDocumentFromPdf } = await importModule();
    const result = await extractDocumentFromPdf({
      file: makeResumeFile(),
      documentType: 'resume',
      resumeId: 'resume-row-1',
      // No featureRunToken — begin-feature-run was unavailable.
    });

    // The durable write happened, on the sanctioned client-write columns only.
    expect(resumesUpdate).toHaveBeenCalledTimes(1);
    const payload = resumesUpdate.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.extracted_text).toContain('SARAH CHEN');
    expect(payload.text_hash).toEqual(expect.any(String));
    expect(payload.document_hash).toBe('doc-hash-abc123');
    expect(payload.extraction_version).toBe('phase51-v1');
    expect(payload.extraction_metadata).toBeTruthy();
    expect(resumesEq).toHaveBeenCalledWith('id', 'resume-row-1');

    // Server-owned analysis columns must never be written from the browser.
    for (const serverOwned of [
      'analyzed_tier',
      'grading_data',
      'overall_score',
      'analyzed_at',
      'archive_path',
    ]) {
      expect(payload).not.toHaveProperty(serverOwned);
    }

    // The caller still receives usable text — behavior for THIS session is unchanged.
    expect(result.text).toContain('SARAH CHEN');
  });

  it('does not double-write when ocr-pdf persistence succeeds', async () => {
    invokeWithTimeout.mockResolvedValue({
      data: { text: ACCEPTED_RESUME_TEXT, pageCount: 1 },
      error: null,
    });

    const { extractDocumentFromPdf } = await importModule();
    await extractDocumentFromPdf({
      file: makeResumeFile(),
      documentType: 'resume',
      resumeId: 'resume-row-1',
      featureRunToken: 'tok-live',
    });

    expect(resumesUpdate).not.toHaveBeenCalled();
  });

  it('degrades to the previous behavior when the direct write also fails', async () => {
    invokeWithTimeout.mockResolvedValue({ data: null, error: { message: 'boom' } });
    resumesEq.mockResolvedValue({ error: { message: 'permission denied' } });

    const { extractDocumentFromPdf } = await importModule();
    const result = await extractDocumentFromPdf({
      file: makeResumeFile(),
      documentType: 'resume',
      resumeId: 'resume-row-1',
    });

    // No throw, no fabricated success — the session still gets its text.
    expect(result.text).toContain('SARAH CHEN');
  });

  it('never writes resume columns for a LinkedIn document', async () => {
    invokeWithTimeout.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const { extractDocumentFromPdf } = await importModule();
    await extractDocumentFromPdf({
      file: new File([new Uint8Array([1])], 'linkedin.pdf', { type: 'application/pdf' }),
      documentType: 'linkedin_profile',
      // linkedin_profile never carries a resumeId; featureRunToken alone opens the branch.
      featureRunToken: 'tok-live',
    }).catch(() => undefined);

    expect(resumesUpdate).not.toHaveBeenCalled();
  });
});
