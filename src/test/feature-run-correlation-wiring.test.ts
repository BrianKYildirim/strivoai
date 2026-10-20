import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Static wiring guard for browser-assisted costing correlation.
 *
 * The opaque `featureRunToken` must be obtained before browser document extraction,
 * forwarded unchanged through extraction/OCR and the final feature request, released at
 * terminal state, and NEVER persisted or logged. Text-only surfaces are allowed to let
 * the backend create the run at its own trusted boundary.
 */

const read = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

const BROWSER_EXTRACTION_SURFACES = [
  'src/pages/Onboarding.tsx',
  'src/pages/Upload.tsx',
  'src/pages/Profile.tsx',
  'src/components/MinimalHero.tsx',
  'src/pages/LinkedInGrader.tsx',
  'src/pages/CareerCompass.tsx',
];

const TEXT_ONLY_SURFACES = [
  'src/pages/RecruitingLens.tsx',
  'src/pages/InterviewPrep.tsx',
];

const ALL_SURFACES = [
  ...BROWSER_EXTRACTION_SURFACES,
  ...TEXT_ONLY_SURFACES,
  'src/hooks/useResumeStream.ts',
  'src/components/ActionFirstHero.tsx',
  'src/lib/feature-run-correlation.ts',
  'src/lib/document-extraction.ts',
];

describe('feature-run correlation wiring', () => {
  it('begins the deliberate action before browser document extraction', () => {
    for (const surface of BROWSER_EXTRACTION_SURFACES) {
      const source = read(surface);
      expect(source, `${surface} must obtain a token`).toContain('getFeatureRunToken(');
      const begin = source.indexOf('getFeatureRunToken(');
      const extraction = Math.min(
        ...['extractDocumentFromFile(', 'extractDocumentFromPdf(', 'extractLinkedInPdfText(']
          .map((call) => source.indexOf(call, begin))
          .filter((index) => index > 0),
      );
      expect(extraction, `${surface} must extract after correlation`).toBeGreaterThan(begin);
    }
  });

  it('forwards the opaque token into extraction and the final feature request', () => {
    for (const surface of BROWSER_EXTRACTION_SURFACES) {
      const source = read(surface);
      expect(source, `${surface} must forward the token`).toContain('featureRunToken');
    }
    // The resume stream reuses the SAME in-memory action so one run owns document
    // evidence and the analysis request.
    const stream = read('src/hooks/useResumeStream.ts');
    expect(stream).toContain('getFeatureRunToken(correlationEnvelope)');
    expect(stream).toContain('...(featureRunToken ? { featureRunToken } : {})');
  });

  it('releases the correlation at terminal success, failure, or cancel', () => {
    for (const surface of [...BROWSER_EXTRACTION_SURFACES, 'src/hooks/useResumeStream.ts']) {
      const source = read(surface);
      expect(source, `${surface} must release the token`).toContain('clearFeatureRunToken(');
    }
  });

  it('never stores, logs, or URL-exposes the opaque token', () => {
    const persistence =
      /(?:localStorage|sessionStorage)\.(?:setItem|getItem)\([^)]*featureRunToken/i;
    const logging = /console\.(?:log|warn|error|info)\([^)]*featureRunToken/i;
    const urlExposure = /(?:searchParams\.set|URLSearchParams)\([^)]*featureRunToken/i;
    for (const surface of ALL_SURFACES) {
      const source = read(surface);
      expect(persistence.test(source), `${surface} must not persist the token`).toBe(false);
      expect(logging.test(source), `${surface} must not log the token`).toBe(false);
      expect(urlExposure.test(source), `${surface} must not expose the token in a URL`).toBe(false);
    }
  });

  it('keeps a correlation failure from becoming a product failure', () => {
    for (const surface of [...BROWSER_EXTRACTION_SURFACES, 'src/hooks/useResumeStream.ts']) {
      const source = read(surface);
      // Anchored on the CALL, not on `await` + the call. What this guards is that a failed
      // correlation degrades to a backend-created run instead of failing the product — which
      // is a property of the error handling, not of whether the call blocks. Onboarding fires
      // this non-blocking and guards it with `.catch(() => undefined)` at creation
      // (quick 260805-8ni: the awaited form cost 4.21s of a measured 11.57s pre-dispatch
      // window against an endpoint returning 503 on 100% of prod calls); the other surfaces
      // still await it inside a try/catch. Both shapes satisfy this invariant.
      const begin = source.indexOf('getFeatureRunToken(');
      expect(begin, `${surface} must request a correlation token`).toBeGreaterThan(-1);
      const guarded = source.slice(Math.max(0, begin - 200), begin + 260);
      expect(guarded, `${surface} must degrade to a backend-created run`).toContain('catch');
    }
  });

  it('lets text-only surfaces rely on the backend boundary without client tokens', () => {
    for (const surface of TEXT_ONLY_SURFACES) {
      const source = read(surface);
      expect(source).not.toContain('getFeatureRunToken(');
    }
  });

  it('keeps the correlation envelope opaque and free of costing authority', () => {
    const correlation = read('src/lib/feature-run-correlation.ts');
    expect(correlation).not.toContain('tier');
    expect(correlation).not.toContain('environment');
    expect(correlation).not.toContain('merits');
    expect(correlation).toContain('serverActionNonce');
  });
});
