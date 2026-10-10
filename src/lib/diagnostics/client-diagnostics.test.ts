/**
 * The XLOG-02 guard — BOTH HALVES — plus the four never-fail guarantees of D-11.
 *
 * This file exists because "diagnostics never log user documents" is a promise
 * until something can make it go red. Two independent halves are asserted:
 *
 *   CLIENT half — a record built from an input deliberately stuffed with a resume
 *   body, an email, a LinkedIn URL, a filename, a stack trace and a SIGNED storage
 *   URL must not carry any of it. Proven with distinctive needles, so a partial
 *   copy (a substring, a stripped-punctuation smuggle) is caught, not just a
 *   wholesale one.
 *
 *   SERVER half — a client-only assertion would not be a guarantee: the endpoint
 *   is the enforcement point. This file PARSES
 *   `supabase/functions/log-client-diagnostic/index.ts` and asserts the two
 *   allowlists and the two category sets are equal, so client/server drift is red
 *   here rather than silent in production. The parse itself is guarded by a
 *   non-empty-walk assertion, so a regex that stops matching fails loudly instead
 *   of passing vacuously (the `phase9-pii-guard.test.ts` precedent).
 *
 * Mutation-proof for this guard is recorded in `03-06-SUMMARY.md`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DIAGNOSTIC_CATEGORIES,
  coerceDiagnosticCategory,
} from './categories';
import {
  DIAGNOSTIC_ALLOWED_KEYS,
  MAX_DIAGNOSTICS_PER_SESSION,
  buildDiagnosticRecord,
  parsePlatform,
  reportDiagnostic,
  resetDiagnosticsForTests,
  setDiagnosticAuthTokenProvider,
  type DiagnosticInput,
} from './client-diagnostics';

// ── Test doubles ─────────────────────────────────────────────────────────────

const ENDPOINT_BASE = 'https://diagnostics.test';

type BeaconImpl = (url: string, data?: unknown) => boolean;

function setSendBeacon(impl: BeaconImpl | undefined): void {
  if (impl === undefined) {
    delete (navigator as unknown as { sendBeacon?: unknown }).sendBeacon;
    return;
  }
  Object.defineProperty(navigator, 'sendBeacon', {
    value: impl,
    configurable: true,
    writable: true,
  });
}

function baseInput(overrides: Partial<DiagnosticInput> = {}): DiagnosticInput {
  return { surface: 'resume-analysis', stage: 'stream', ...overrides };
}

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', ENDPOINT_BASE);
  resetDiagnosticsForTests();
});

afterEach(() => {
  setSendBeacon(undefined);
  resetDiagnosticsForTests();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── XLOG-02, client half ─────────────────────────────────────────────────────

describe('XLOG-02 — the record builder cannot carry user content', () => {
  /** Distinctive so a PARTIAL copy is caught, not only a wholesale one. */
  const NEEDLES = {
    resumeBody:
      'NEEDLEZQ1RESUMEBODY Senior Platform Engineer\n\nLed the migration of a 40-service estate.\n\nNEEDLEZQ1RESUMEBODY second paragraph.',
    linkedin: 'https://www.linkedin.com/in/needlezq2-profile',
    email: 'needlezq3.person@example.com',
    filename: 'needlezq4_resume_final.pdf',
    stack:
      'Error: NEEDLEZQ5MESSAGE\n    at needleZq5Frame (https://app.example.com/assets/index-abc123.js:1:2)',
    signedUrl:
      'https://proj.supabase.co/storage/v1/object/sign/resumes/needlezq6.pdf?token=NEEDLEZQ7TOKEN',
  };

  function stuffedInput(): DiagnosticInput {
    const error = new Error(
      `${NEEDLES.resumeBody} ${NEEDLES.linkedin} ${NEEDLES.email} ${NEEDLES.filename} ${NEEDLES.signedUrl}`,
    );
    error.stack = NEEDLES.stack;

    // Deliberately smuggles forbidden keys past the type system — exactly what a
    // careless future caller would do.
    return {
      ...baseInput({
        error,
        // Non-identifier values must be DROPPED, not stripped-and-kept: stripping
        // the punctuation out of the signed URL would leave NEEDLEZQ7TOKEN intact.
        runId: NEEDLES.signedUrl,
        capabilityTier: NEEDLES.email,
      }),
      message: NEEDLES.resumeBody,
      stack: NEEDLES.stack,
      filename: NEEDLES.filename,
      file: { name: NEEDLES.filename, text: NEEDLES.resumeBody },
      resumeText: NEEDLES.resumeBody,
      linkedinUrl: NEEDLES.linkedin,
      email: NEEDLES.email,
      user_id: '00000000-0000-4000-8000-000000000000',
    } as unknown as DiagnosticInput;
  }

  it('emits only allowlisted keys', () => {
    const record = buildDiagnosticRecord(stuffedInput());
    const allowed = new Set<string>(DIAGNOSTIC_ALLOWED_KEYS);
    const keys = Object.keys(record);

    expect(keys.length).toBeGreaterThan(0); // non-vacuous
    for (const key of keys) expect(allowed.has(key)).toBe(true);
  });

  it('never lets a planted needle reach the serialized payload', () => {
    const serialized = JSON.stringify(buildDiagnosticRecord(stuffedInput()));
    for (const [name, needle] of Object.entries(NEEDLES)) {
      expect(serialized, `needle "${name}" leaked`).not.toContain(needle);
    }
    // The distinctive tokens on their own, in case a value was partially copied.
    for (const token of [
      'NEEDLEZQ1RESUMEBODY',
      'needlezq2',
      'needlezq3',
      'needlezq4',
      'NEEDLEZQ5MESSAGE',
      'needlezq6',
      'NEEDLEZQ7TOKEN',
      '.pdf',
      '@example.com',
    ]) {
      expect(serialized, `token "${token}" leaked`).not.toContain(token);
    }
  });

  it('never emits a client-asserted identity or address', () => {
    const record = buildDiagnosticRecord(stuffedInput()) as Record<string, unknown>;
    for (const key of ['user_id', 'ip', 'ip_hash', 'message', 'stack', 'filename']) {
      expect(record[key]).toBeUndefined();
    }
  });

  it('records the error CONSTRUCTOR NAME only', () => {
    class UploadTimeoutError extends Error {}
    const record = buildDiagnosticRecord(
      baseInput({ error: new UploadTimeoutError('secret detail NEEDLEZQ8') }),
    );
    expect(record.error_name).toBe('UploadTimeoutError');
    expect(JSON.stringify(record)).not.toContain('NEEDLEZQ8');
  });

  it('keeps an identifier-shaped run id but drops a URL-shaped one', () => {
    const uuid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    expect(buildDiagnosticRecord(baseInput({ runId: uuid })).run_id).toBe(uuid);
    expect(
      buildDiagnosticRecord(baseInput({ runId: 'https://x.test/a?token=SECRET' })).run_id,
    ).toBeUndefined();
  });

  it('always populates the four NOT NULL columns', () => {
    const record = buildDiagnosticRecord(baseInput());
    for (const key of ['app_version', 'surface', 'lifecycle_stage', 'error_category'] as const) {
      expect(typeof record[key]).toBe('string');
      expect(String(record[key]).length).toBeGreaterThan(0);
    }
  });
});

// ── XLOG-02, server half ─────────────────────────────────────────────────────

describe('XLOG-02 — the client and server halves agree', () => {
  const EDGE_SOURCE_PATH = join(
    process.cwd(),
    'supabase',
    'functions',
    'log-client-diagnostic',
    'index.ts',
  );
  const source = readFileSync(EDGE_SOURCE_PATH, 'utf8');

  function parseStringList(pattern: RegExp): string[] {
    const block = source.match(pattern);
    if (!block || !block[1]) return [];
    return Array.from(block[1].matchAll(/'([^']+)'/g)).map((m) => m[1]);
  }

  const serverAllowedFields = parseStringList(
    /export const ALLOWED_FIELDS = \[([\s\S]*?)\] as const;/,
  );
  const serverCategories = parseStringList(
    /export const CATEGORIES: ReadonlySet<string> = new Set\(\[([\s\S]*?)\]\);/,
  );

  it('parsed something — the guard cannot pass by scanning nothing', () => {
    expect(source.length).toBeGreaterThan(500);
    expect(serverAllowedFields.length).toBeGreaterThan(10);
    expect(serverCategories.length).toBeGreaterThan(5);
  });

  it('server ALLOWED_FIELDS equals client DIAGNOSTIC_ALLOWED_KEYS', () => {
    expect(serverAllowedFields).toEqual([...DIAGNOSTIC_ALLOWED_KEYS]);
  });

  it('server CATEGORIES equals client DIAGNOSTIC_CATEGORIES', () => {
    expect(serverCategories).toEqual([...DIAGNOSTIC_CATEGORIES]);
  });

  it('the server allowlist drops every key the client must never send', () => {
    for (const forbidden of [
      'message',
      'stack',
      'filename',
      'detail',
      'resume_text',
      'email',
      'user_id',
      'ip',
    ]) {
      expect(serverAllowedFields).not.toContain(forbidden);
    }
  });
});

// ── Category coercion ────────────────────────────────────────────────────────

describe('category coercion', () => {
  it('passes every member of the frozen set through unchanged', () => {
    for (const category of DIAGNOSTIC_CATEGORIES) {
      expect(coerceDiagnosticCategory(category)).toBe(category);
      expect(buildDiagnosticRecord(baseInput({ category })).error_category).toBe(category);
    }
  });

  it('fails closed to `unexpected` for anything unknown', () => {
    for (const value of ['not_a_category', '', null, undefined, 42, {}, ['upload_failed']]) {
      expect(coerceDiagnosticCategory(value)).toBe('unexpected');
    }
    expect(buildDiagnosticRecord(baseInput({ category: 'sql_injection' })).error_category).toBe(
      'unexpected',
    );
  });
});

// ── Extension classification (XDEV-08) ───────────────────────────────────────

describe('extension classification', () => {
  for (const scheme of [
    'chrome-extension://',
    'moz-extension://',
    'safari-web-extension://',
  ]) {
    it(`classifies an error from ${scheme} as browser-extension`, () => {
      const error = new Error(`Injected failure at ${scheme}abcdef/content.js:10:5`);
      const record = buildDiagnosticRecord(baseInput({ error }));
      expect(record.script_origin).toBe('browser-extension');
      expect(record.is_extension).toBe(true);
    });
  }

  it('honours a caller-supplied classification', () => {
    const record = buildDiagnosticRecord(
      baseInput({ scriptOrigin: 'third-party', isExtension: false, error: new Error('x') }),
    );
    expect(record.script_origin).toBe('third-party');
    expect(record.is_extension).toBe(false);
  });
});

// ── Platform derivation (D-13: browser, OS, device type) ─────────────────────

describe('parsePlatform', () => {
  it('identifies an iPhone', () => {
    const p = parsePlatform(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
    );
    expect(p).toMatchObject({ os: 'iOS', osVersion: '17.1', deviceType: 'mobile', engine: 'WebKit' });
  });

  it('identifies an Android phone versus an Android tablet', () => {
    const phone =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
    const tablet =
      'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    expect(parsePlatform(phone)).toMatchObject({ os: 'Android', deviceType: 'mobile', engine: 'Blink' });
    expect(parsePlatform(tablet)).toMatchObject({ os: 'Android', deviceType: 'tablet' });
  });

  it('tells iPadOS from macOS using touch points, not the UA alone', () => {
    const macLike =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15';
    expect(parsePlatform(macLike, 0)).toMatchObject({ os: 'macOS', deviceType: 'desktop' });
    expect(parsePlatform(macLike, 5)).toMatchObject({ os: 'iPadOS', deviceType: 'tablet' });
  });

  it('identifies Windows desktop with Blink', () => {
    expect(
      parsePlatform(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.61',
      ),
    ).toMatchObject({ os: 'Windows', osVersion: '10.0', deviceType: 'desktop', engine: 'Blink' });
  });

  it('never throws on a hostile or empty UA', () => {
    expect(() => parsePlatform('')).not.toThrow();
    expect(parsePlatform('').os).toBe('unknown');
  });
});

// ── D-11 guarantee 1 + 2: returns void, never throws ─────────────────────────

describe('reportDiagnostic never throws and never returns a promise', () => {
  it('returns undefined, not a thenable', () => {
    setSendBeacon(() => true);
    const returned = reportDiagnostic(baseInput()) as unknown;
    expect(returned).toBeUndefined();
    expect((returned as { then?: unknown })?.then).toBeUndefined();
  });

  it('is a silent no-op when the endpoint URL cannot be resolved', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    resetDiagnosticsForTests();
    const beacon = vi.fn(() => true);
    setSendBeacon(beacon);
    expect(() => reportDiagnostic(baseInput())).not.toThrow();
    expect(beacon).not.toHaveBeenCalled();
  });

  it('does not throw when sendBeacon is absent', () => {
    setSendBeacon(undefined);
    expect(() => reportDiagnostic(baseInput())).not.toThrow();
  });

  it('does not throw when sendBeacon itself throws', () => {
    setSendBeacon(() => {
      throw new Error('beacon exploded');
    });
    expect(() => reportDiagnostic(baseInput())).not.toThrow();
  });

  it('does not throw when sendBeacon returns false and the fetch fallback rejects', async () => {
    setSendBeacon(() => false);
    setDiagnosticAuthTokenProvider(() => 'token-abc');
    const fetchMock = vi.fn(() => Promise.reject(new Error('network down')));
    vi.stubGlobal('fetch', fetchMock);

    expect(() => reportDiagnostic(baseInput())).not.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The rejection is handled inside the emitter — awaiting a tick here proves it
    // does not surface as an unhandled rejection.
    await Promise.resolve();
    await Promise.resolve();
  });

  it('does not attempt the fetch fallback without a token', () => {
    setSendBeacon(() => false);
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal('fetch', fetchMock);
    reportDiagnostic(baseInput());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not throw when serialization fails', () => {
    setSendBeacon(() => true);
    const stringify = vi.spyOn(JSON, 'stringify').mockImplementation(() => {
      throw new Error('circular');
    });
    expect(() => reportDiagnostic(baseInput())).not.toThrow();
    stringify.mockRestore();

    // The in-flight slot was released, so the next emit still works.
    const beacon = vi.fn(() => true);
    setSendBeacon(beacon);
    reportDiagnostic(baseInput());
    expect(beacon).toHaveBeenCalledTimes(1);
  });

  it('does not throw on a circular error value', () => {
    type Circular = Error & { self?: unknown };
    const circular: Circular = new Error('boom');
    circular.self = circular;
    setSendBeacon(() => true);
    expect(() => reportDiagnostic(baseInput({ error: circular }))).not.toThrow();
    expect(() => buildDiagnosticRecord(baseInput({ error: circular }))).not.toThrow();
  });

  it('does not throw when viewport properties are unreadable', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      get() {
        throw new Error('blocked by a hardened browser');
      },
    });
    try {
      expect(() => buildDiagnosticRecord(baseInput())).not.toThrow();
      expect(buildDiagnosticRecord(baseInput()).viewport_w).toBeUndefined();
    } finally {
      if (descriptor) Object.defineProperty(window, 'innerWidth', descriptor);
      else delete (window as unknown as { innerWidth?: unknown }).innerWidth;
    }
  });
});

// ── D-11 guarantee 3 + 4: cap and single in-flight slot ──────────────────────

describe('the per-session cap and the single in-flight slot', () => {
  it('sends the transport with a text/plain Blob', () => {
    const beacon = vi.fn(() => true);
    setSendBeacon(beacon);
    reportDiagnostic(baseInput());

    expect(beacon).toHaveBeenCalledTimes(1);
    const [url, blob] = beacon.mock.calls[0] as unknown as [string, Blob];
    expect(url).toBe(`${ENDPOINT_BASE}/functions/v1/log-client-diagnostic`);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('text/plain');
  });

  it(`stops transporting after ${MAX_DIAGNOSTICS_PER_SESSION} emits in a session`, () => {
    const beacon = vi.fn(() => true);
    setSendBeacon(beacon);

    for (let i = 0; i < MAX_DIAGNOSTICS_PER_SESSION; i += 1) reportDiagnostic(baseInput());
    expect(beacon).toHaveBeenCalledTimes(MAX_DIAGNOSTICS_PER_SESSION);

    reportDiagnostic(baseInput()); // the 21st
    expect(beacon).toHaveBeenCalledTimes(MAX_DIAGNOSTICS_PER_SESSION);

    resetDiagnosticsForTests();
    vi.stubEnv('VITE_SUPABASE_URL', ENDPOINT_BASE);
    setSendBeacon(beacon);
    reportDiagnostic(baseInput());
    expect(beacon).toHaveBeenCalledTimes(MAX_DIAGNOSTICS_PER_SESSION + 1);
  });

  it('drops rather than queues while an emit is in flight', async () => {
    setSendBeacon(() => false);
    setDiagnosticAuthTokenProvider(() => 'token-abc');

    let release: (() => void) | undefined;
    const pending = new Promise<Response>((resolve) => {
      release = () => resolve(new Response(null, { status: 204 }));
    });
    const fetchMock = vi.fn(() => pending);
    vi.stubGlobal('fetch', fetchMock);

    reportDiagnostic(baseInput());
    reportDiagnostic(baseInput()); // dropped: the slot is occupied
    reportDiagnostic(baseInput()); // dropped
    expect(fetchMock).toHaveBeenCalledTimes(1);

    release?.();
    await pending;
    await Promise.resolve();

    reportDiagnostic(baseInput()); // the slot is free again
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// ── 03-02 handoff: the build identity now has a real importer ────────────────

describe('the build identity reaches the bundle', () => {
  /**
   * Plan 03-02 could not assert that `getBuildId()` survives into a built chunk
   * because `build-id.ts` had NO importer and was tree-shaken out. This plan is
   * its first real importer, and this static chain assertion is the permanent
   * guard: if any link is removed, `app_version` silently becomes dead code
   * again and every diagnostics row loses the field that identifies the build.
   */
  const read = (relative: string) => readFileSync(join(process.cwd(), relative), 'utf8');

  it('main.tsx -> install-global-handlers -> client-diagnostics -> build-id', () => {
    expect(read('src/main.tsx')).toContain('lib/diagnostics/install-global-handlers');
    expect(read('src/lib/diagnostics/install-global-handlers.ts')).toContain(
      "from './client-diagnostics'",
    );
    expect(read('src/lib/diagnostics/client-diagnostics.ts')).toContain(
      "from '../platform/build-id'",
    );
    expect(read('src/lib/diagnostics/client-diagnostics.ts')).toContain('getBuildId()');
  });

  it('installs the global handlers before the first render', () => {
    const main = read('src/main.tsx');
    const installIndex = main.indexOf('installGlobalDiagnosticHandlers()');
    const renderIndex = main.indexOf('createRoot(');
    expect(installIndex).toBeGreaterThan(-1);
    expect(renderIndex).toBeGreaterThan(-1);
    expect(installIndex).toBeLessThan(renderIndex);
  });
});
