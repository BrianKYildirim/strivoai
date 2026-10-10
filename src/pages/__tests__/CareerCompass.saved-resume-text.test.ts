/**
 * Regression guard — Career Compass must never submit a saved resume with no resume text.
 *
 * This is the surface that failed in production on 2026-08-04. `CareerCompass.tsx` only
 * produced `resumeTextContent` inside `if (resumeFile && isAcceptedResumeDocument(resumeFile))`,
 * so a freshly-onboarded Free user — who reuses their saved resume rather than re-uploading —
 * submitted a payload carrying `resumeFilePath` and NO `resumeTextContent`. The production job
 * payload for run 67b8e64f-22fd-44dd-916b-796d662d70d1 shows exactly that shape.
 *
 * The server cannot recover from it: backend raw-byte PDF parsing is intentionally a no-op
 * (supabase/functions/_shared/pdf-parser.ts pins pdfjsText:null / images:[] /
 * claude_ocr_blocked_by_policy), so `resumes.extracted_text` is the only other source.
 * With both empty, analyze-career:1876 returns 400 → INPUT_MISSING → refund.
 *
 * Source-contract guard, per the established CareerCompass vitest convention
 * (cf. CareerCompass.phase22.test.ts, CareerCompass.recovery.test.tsx).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve('src/pages/CareerCompass.tsx'), 'utf8').replace(/\r\n/g, '\n');
const pdfParserSource = readFileSync(
  resolve('supabase/functions/_shared/pdf-parser.ts'),
  'utf8',
).replace(/\r\n/g, '\n');
const analyzeCareerSource = readFileSync(
  resolve('supabase/functions/analyze-career/index.ts'),
  'utf8',
).replace(/\r\n/g, '\n');

describe('Career Compass saved-resume text source', () => {
  it('reads the saved resume id and persisted text so the empty-text case is detectable', () => {
    expect(source).toContain('columns: "id, file_path, file_name, extracted_text"');
    expect(source).toContain('setSavedResumeId');
    expect(source).toContain('setSavedResumeText');
  });

  it('resolves resume text on the saved-resume branch, not only on a fresh upload', () => {
    // The regression was a bare `if (resumeFile && ...)` with no else-branch.
    expect(source).toContain('} else if (savedResumeFilePath) {');
    expect(source).toContain('resumeTextContent = await resolveSavedResumeText(featureRunToken);');
  });

  it('prefers durable text and re-derives from the stored file only when it is missing', () => {
    const helper = source.match(/const resolveSavedResumeText[\s\S]*?\n {2}};/);
    expect(helper).not.toBeNull();
    const body = helper![0];

    // Durable text short-circuits — no download, no re-parse on the healthy path.
    expect(body).toContain('if (savedResumeText?.trim()) return savedResumeText;');
    // Recovery re-uses the SAME browser parser that produced the text originally.
    expect(body).toContain('.from("resumes")');
    expect(body).toContain('.download(savedResumeFilePath)');
    expect(body).toContain('extractDocumentFromFile({');
    // Threading resumeId is what makes the heal permanent instead of per-run.
    expect(body).toContain('resumeId: savedResumeId');
  });

  it('never fabricates resume text — an unrecoverable resume still submits empty', () => {
    const helper = source.match(/const resolveSavedResumeText[\s\S]*?\n {2}};/)![0];
    // Every failure branch returns "" and lets the server's own validation decide.
    expect(helper).toContain('return "";');
    expect(helper).not.toMatch(/placeholder|lorem|sample resume|dummy/i);
    // The submit body still passes undefined rather than an empty string.
    expect(source).toContain('resumeTextContent: resumeTextContent || undefined,');
  });

  it('pins the backend contract that makes client-side text mandatory', () => {
    // If backend parsing ever becomes real, this guard should be revisited deliberately.
    expect(pdfParserSource).toContain('pdfjsText: null');
    expect(pdfParserSource).toContain('images: []');
    expect(pdfParserSource).toContain('claude_ocr_blocked_by_policy');
  });

  it('keeps analyze-career failing CLOSED when no resume text is available', () => {
    // The fix must not weaken this validation — an unreadable resume must still 400.
    expect(analyzeCareerSource).toContain('const hasResume = resumeText && resumeText.length > 100;');
    expect(analyzeCareerSource).toContain("error: 'Unable to extract text from your resume.'");
    expect(analyzeCareerSource).toContain('status: 400');
    // And the persisted-extraction reuse path stays in place.
    expect(analyzeCareerSource).toContain('readPersistedResumeExtraction');
    expect(analyzeCareerSource).toContain('resume-persisted-extraction-reused');
  });
});
