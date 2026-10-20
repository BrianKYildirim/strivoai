/**
 * Tests for the structured, leak-free analysis error logger.
 * Covers the exact diagnostics this ticket requires — browser + version,
 * script origin (first-party / extension / third-party), stack, lifecycle
 * stage, run/resume id — and proves no resume content is captured.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseBrowser,
  classifyScriptOrigin,
  isExtensionError,
  logAnalysisError,
} from './analysis-error-log';

const UA = {
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  chromePrev: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.61',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
};

afterEach(() => vi.restoreAllMocks());

describe('parseBrowser', () => {
  it('identifies Chrome + version (current and previous major)', () => {
    expect(parseBrowser(UA.chrome)).toMatchObject({ browser: 'Chrome', version: '120.0.0.0' });
    expect(parseBrowser(UA.chromePrev)).toMatchObject({ browser: 'Chrome', version: '119.0.0.0' });
  });
  it('identifies Edge (not misreported as Chrome despite the Chrome token)', () => {
    expect(parseBrowser(UA.edge)).toMatchObject({ browser: 'Edge', version: '120.0.2210.61' });
  });
  it('identifies Firefox', () => {
    expect(parseBrowser(UA.firefox)).toMatchObject({ browser: 'Firefox', version: '121.0' });
  });
  it('identifies Safari', () => {
    expect(parseBrowser(UA.safari)).toMatchObject({ browser: 'Safari', version: '17.1' });
  });
});

describe('classifyScriptOrigin', () => {
  const appOrigin = 'https://app.strivo.ai';
  it('flags chrome-extension frames as browser-extension', () => {
    const stack = 'Error: boom\n  at f (chrome-extension://abcdef/inject.js:1:1)';
    expect(classifyScriptOrigin(stack, appOrigin)).toBe('browser-extension');
  });
  it('flags moz-extension frames as browser-extension', () => {
    const stack = 'Error\n  at moz-extension://uuid/content.js:2:3';
    expect(classifyScriptOrigin(stack, appOrigin)).toBe('browser-extension');
  });
  it('classifies our own bundle as first-party', () => {
    const stack = `Error\n  at x (${appOrigin}/assets/index-abc.js:10:20)`;
    expect(classifyScriptOrigin(stack, appOrigin)).toBe('first-party');
  });
  it('classifies an unrelated https host as third-party', () => {
    const stack = 'Error\n  at y (https://cdn.evil.example/x.js:1:1)';
    expect(classifyScriptOrigin(stack, appOrigin)).toBe('third-party');
  });
  it('returns unknown with no stack', () => {
    expect(classifyScriptOrigin(undefined, appOrigin)).toBe('unknown');
  });
});

describe('isExtensionError', () => {
  it('detects extension origin from the stack', () => {
    const e = new Error('getOrInsertComputed is not a function');
    e.stack = 'TypeError\n  at chrome-extension://abc/hook.js:9:1';
    expect(isExtensionError(e)).toBe(true);
  });
  it('is false for a normal first-party error', () => {
    const e = new Error('boom');
    e.stack = 'Error\n  at https://app.strivo.ai/assets/index.js:1:1';
    expect(isExtensionError(e)).toBe(false);
  });
});

describe('logAnalysisError', () => {
  it('captures the required diagnostics and never logs resume content', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('navigator', { userAgent: UA.chrome });

    const err = new Error('this.#t.getOrInsertComputed is not a function');
    err.stack = 'TypeError\n  at messageHandler.sendWithPromise (https://app.strivo.ai/assets/index.js:1:1)';

    const record = logAnalysisError(err, {
      stage: 'extraction',
      runId: 'run-123',
      resumeId: 'resume-abc',
      tags: { path: 'worker-extract' },
    });

    expect(record).toMatchObject({
      event: 'analysis_lifecycle_error',
      stage: 'extraction',
      runId: 'run-123',
      resumeId: 'resume-abc',
      errorMessage: 'this.#t.getOrInsertComputed is not a function',
      browser: 'Chrome',
      browserVersion: '120.0.0.0',
    });
    expect(record.stack).toContain('sendWithPromise');
    // Leak posture: only technical diagnostics are present — no free-form content
    // field that could carry resume text.
    const keys = Object.keys(record);
    expect(keys).not.toContain('resumeText');
    expect(keys).not.toContain('content');
    expect(keys).not.toContain('prompt');
    expect(spy).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('never throws, even on a non-Error value', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => logAnalysisError('a raw string', { stage: 'unknown' })).not.toThrow();
  });
});
