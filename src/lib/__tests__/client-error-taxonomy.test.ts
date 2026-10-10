/**
 * client-error-taxonomy.test.ts — Phase 03 · 03-12 · XRUN-06.
 *
 * The exhaustive frozen-table test for UI-SPEC Surface C, in the same shape as
 * `analysisError.test.ts` (the server taxonomy's test), plus a LEAK GUARD run
 * over the table's own content.
 *
 * The point of the leak-guard half is that a bad copy string cannot even be
 * COMMITTED: the Playwright spec proves nothing raw reached a rendered page,
 * and this proves nothing raw exists in the source of truth to reach one.
 *
 * PROVEN ABLE TO FAIL. Recorded in 03-12-SUMMARY.md: adding `TypeError` to a
 * copy string turns the leak-guard case red; marking a terminal code retryable
 * turns the retry-partition case red; deleting a code turns the exhaustive case
 * red. A test that has never been seen to fail is not evidence.
 */
import { describe, it, expect } from 'vitest';
import {
  CLIENT_ERROR_CODES,
  CLIENT_CODE_FOR_DIAGNOSTIC_CATEGORY,
  DEFAULT_CLIENT_ERROR_CODE,
  LEAK_GUARD_PATTERN,
  SURFACE_C_VERBATIM,
  containsLeak,
  getClientErrorCopy,
  isClientSurfaceSuppressed,
  isStaleReloadInProgress,
  mapClientError,
  type ClientErrorCode,
} from '../client-error-taxonomy';
import { ANALYSIS_ERROR_CODES, getSafeStreamErrorMessage } from '../analysisError';
import { DIAGNOSTIC_CATEGORIES } from '../diagnostics/categories';
import { CAPABILITY_COPY } from '../platform/capability-copy';

/**
 * The nine members, written out LITERALLY rather than imported into a loop, so
 * that adding, removing or renaming a code fails here instead of silently
 * widening the user-facing vocabulary.
 */
const EXPECTED_CODES: readonly ClientErrorCode[] = [
  'CLIENT_OFFLINE',
  'CLIENT_REALTIME_DEGRADED',
  'CLIENT_CHUNK_LOAD_FAILED',
  'CLIENT_STORAGE_BLOCKED',
  'CLIENT_BROWSER_UNSUPPORTED',
  'CLIENT_SESSION_EXPIRED',
  'CLIENT_UPLOAD_FAILED',
  'CLIENT_RENDER_FAILED',
  'CLIENT_UNEXPECTED',
];

/** UI-SPEC § Copywriting Contract → Forbidden copy. */
const FORBIDDEN_WORDS: readonly RegExp[] = [
  /\bcrash\b/i,
  /\bexception\b/i,
  /\bstack\b/i,
  /\bnull\b/i,
  /\bundefined\b/i,
  /\btoken\b/i,
  /\bpayload\b/i,
  /\b500\b/,
  /\b502\b/,
  /\b529\b/,
];

/** UI-SPEC § Copywriting Contract → no provider or infrastructure name. */
const FORBIDDEN_PROVIDERS: readonly RegExp[] = [
  /\banthropic\b/i,
  /\bclaude\b/i,
  /\bsupabase\b/i,
  /\bpostgres\b/i,
  /\bdeno\b/i,
  /\bvercel\b/i,
];

/** UI-SPEC § Forbidden copy → no ETA, no countdown, no percentage. */
const FORBIDDEN_TIME_CLAIMS: readonly RegExp[] = [
  /%/,
  /\busually takes\b/i,
  /\bseconds? remaining\b/i,
  /\bestimated\b/i,
  /\b\d+\s*(seconds?|minutes?|mins?|secs?)\b/i,
];

/** Every user-facing string a code can put on screen. */
function stringsOf(code: ClientErrorCode): string[] {
  const entry = getClientErrorCopy(code);
  return [
    entry.heading,
    entry.body,
    entry.affordance.primary?.label,
    entry.affordance.secondary?.label,
    entry.affordance.link?.label,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);
}

describe('client error taxonomy — the closed set', () => {
  it('exposes exactly the closed set of 9 codes, in the declared order', () => {
    expect(CLIENT_ERROR_CODES).toHaveLength(9);
    expect(new Set(CLIENT_ERROR_CODES).size).toBe(9);
    expect([...CLIENT_ERROR_CODES]).toEqual([...EXPECTED_CODES]);
  });

  it('gives every code a non-empty heading, body, affordance and visual treatment', () => {
    for (const code of CLIENT_ERROR_CODES) {
      const entry = getClientErrorCopy(code);
      expect(typeof entry.heading, code).toBe('string');
      expect(entry.heading.length, code).toBeGreaterThan(0);
      expect(typeof entry.body, code).toBe('string');
      expect(entry.body.length, code).toBeGreaterThan(0);
      // `retryable` must be EXPLICIT — an absent flag would read as falsy and
      // silently make a retryable code terminal.
      expect(typeof entry.retryable, code).toBe('boolean');
      expect(entry.affordance, code).toBeTypeOf('object');
      expect(entry.visual.surface.length, code).toBeGreaterThan(0);
      expect(entry.visual.icon.length, code).toBeGreaterThan(0);
      expect(typeof entry.visual.destructiveAllowed, code).toBe('boolean');
      expect(entry.visual.placement, code).toBeTruthy();
    }
  });

  it('matches UI-SPEC § Surface C copy verbatim for every single-string row', () => {
    for (const [code, verbatim] of Object.entries(SURFACE_C_VERBATIM)) {
      const entry = getClientErrorCopy(code as ClientErrorCode);
      expect(`${entry.heading}. ${entry.body}`, code).toBe(verbatim);
    }
    // The two rows the spec defines BY REFERENCE rather than by literal.
    expect(getClientErrorCopy('CLIENT_BROWSER_UNSUPPORTED').heading).toBe(
      CAPABILITY_COPY.analysisHeading,
    );
    expect(getClientErrorCopy('CLIENT_BROWSER_UNSUPPORTED').body).toBe(
      CAPABILITY_COPY.analysisBody,
    );
    // The locked `AnalysisErrorBoundary` strings, byte-for-byte.
    expect(getClientErrorCopy('CLIENT_RENDER_FAILED').heading).toBe(
      "We couldn't display this analysis",
    );
    expect(getClientErrorCopy('CLIENT_RENDER_FAILED').body).toBe(
      'Something went wrong showing your results. Your analysis may still be safe — refresh to reload it.',
    );
  });

  it('reuses the locked CLIENT_SESSION_EXPIRED string from the server chokepoint', () => {
    // Byte-identity with `getSafeStreamErrorMessage('Not authenticated')`. If
    // either side is reworded, the two surfaces would tell the same user two
    // different things about the same condition.
    const entry = getClientErrorCopy('CLIENT_SESSION_EXPIRED');
    expect(`${entry.heading}. ${entry.body}`).toBe(getSafeStreamErrorMessage('Not authenticated'));
  });
});

describe('client error taxonomy — the leak guard (XRUN-06)', () => {
  it('no string in the table matches the UI-SPEC leak-guard regex', () => {
    for (const code of CLIENT_ERROR_CODES) {
      for (const value of stringsOf(code)) {
        expect(
          LEAK_GUARD_PATTERN.test(value),
          `${code}: "${value}" matched the leak guard`,
        ).toBe(false);
        expect(containsLeak(value), `${code}: containsLeak("${value}")`).toBe(false);
      }
    }
  });

  it('no string in the table contains a forbidden word or a provider name', () => {
    for (const code of CLIENT_ERROR_CODES) {
      for (const value of stringsOf(code)) {
        for (const pattern of [...FORBIDDEN_WORDS, ...FORBIDDEN_PROVIDERS]) {
          expect(pattern.test(value), `${code}: "${value}" matched ${pattern}`).toBe(false);
        }
      }
    }
  });

  it('no string in the table claims an elapsed time, a countdown or a percentage', () => {
    for (const code of CLIENT_ERROR_CODES) {
      for (const value of stringsOf(code)) {
        for (const pattern of FORBIDDEN_TIME_CLAIMS) {
          expect(pattern.test(value), `${code}: "${value}" matched ${pattern}`).toBe(false);
        }
      }
    }
  });

  it('the leak guard is not vacuous — it fires on all four raw-text classes', () => {
    // ANTI-VACUITY. A regex that matches nothing would make every assertion
    // above pass. These are the four leak classes the phase exists to stop.
    expect(containsLeak("TypeError: Cannot read properties of undefined")).toBe(true); // raw Error.message
    expect(containsLeak('PGRST116: JSON object requested, multiple rows returned')).toBe(true); // PostgREST
    expect(containsLeak('invalid input syntax for type uuid (22P02)')).toBe(true); // Postgres
    expect(containsLeak('Deno.errors.Http: upstream provider returned 529')).toBe(true); // provider/runtime
    expect(containsLeak('    at renderResult (chunk-A1b2C3.js:14:9)')).toBe(true); // stack fragment
    // And it does NOT fire on ordinary product copy.
    expect(containsLeak('Reload the page to continue — your saved work is unaffected.')).toBe(false);
  });
});

describe('client error taxonomy — the six rules', () => {
  it('rule 2: no non-retryable code offers a `Try again` primary', () => {
    for (const code of CLIENT_ERROR_CODES) {
      const entry = getClientErrorCopy(code);
      if (!entry.retryable) {
        // Asserted on the ACTION KIND, not on the label — renaming the button
        // must not be able to smuggle a dead retry onto a terminal code.
        expect(entry.affordance.primary?.kind, `${code} is terminal`).not.toBe('retry');
        expect(entry.affordance.primary?.label, `${code} is terminal`).not.toBe('Try again');
      }
    }
    // The terminal codes, named explicitly so a future flip is caught here.
    expect(getClientErrorCopy('CLIENT_STORAGE_BLOCKED').retryable).toBe(false);
    expect(getClientErrorCopy('CLIENT_BROWSER_UNSUPPORTED').retryable).toBe(false);
    expect(getClientErrorCopy('CLIENT_SESSION_EXPIRED').retryable).toBe(false);
    expect(getClientErrorCopy('CLIENT_REALTIME_DEGRADED').retryable).toBe(false);
    // And the retryable ones.
    expect(getClientErrorCopy('CLIENT_UPLOAD_FAILED').retryable).toBe(true);
    expect(getClientErrorCopy('CLIENT_CHUNK_LOAD_FAILED').retryable).toBe(true);
    expect(getClientErrorCopy('CLIENT_RENDER_FAILED').retryable).toBe(true);
    expect(getClientErrorCopy('CLIENT_UNEXPECTED').retryable).toBe(true);
  });

  it('rule 4: CLIENT_REALTIME_DEGRADED is informational, silent and non-blocking', () => {
    const entry = getClientErrorCopy('CLIENT_REALTIME_DEGRADED');
    expect(entry.severity).toBe('informational');
    expect(entry.visual.destructiveAllowed).toBe(false);
    expect(entry.toastPermitted).toBe(false);
    expect(entry.blocking).toBe(false);
    expect(entry.affordance.primary).toBeNull();
    expect(entry.affordance.secondary).toBeNull();
    // It is the ONLY informational member; everything else is a real error.
    const informational = CLIENT_ERROR_CODES.filter(
      (code) => getClientErrorCopy(code).severity === 'informational',
    );
    expect(informational).toEqual(['CLIENT_REALTIME_DEGRADED']);
  });

  it('rule 4: no code in the table may fire a toast', () => {
    // A toast auto-dismisses before a failure message can be read, and the
    // informational row must never become one. UI-SPEC forbids it outright.
    for (const code of CLIENT_ERROR_CODES) {
      expect(getClientErrorCopy(code).toastPermitted, code).toBe(false);
    }
  });

  it('rule 5: only a pre-reservation code makes a credit claim', () => {
    const creditPhrasing = /\b(credit|credits|merit|merits|charged|charge|refund|refunded)\b/i;

    const preReservation = CLIENT_ERROR_CODES.filter(
      (code) => getClientErrorCopy(code).meritPhase === 'pre-reservation',
    );
    expect(preReservation).toEqual(['CLIENT_UPLOAD_FAILED']);

    // The one code that CAN truthfully say it must say it.
    expect(getClientErrorCopy('CLIENT_UPLOAD_FAILED').body).toContain('no credits were used');

    // Everything else says nothing at all about money — the server refund path
    // owns that sentence, and guessing it is a trust failure with financial
    // meaning in both directions.
    for (const code of CLIENT_ERROR_CODES) {
      if (getClientErrorCopy(code).meritPhase === 'pre-reservation') continue;
      for (const value of stringsOf(code)) {
        expect(creditPhrasing.test(value), `${code}: "${value}" makes a credit claim`).toBe(false);
      }
    }
  });

  it('rule 3: a server terminal state suppresses the client surface', () => {
    expect(isClientSurfaceSuppressed({ serverTerminalStateShown: true })).toBe(true);
    expect(isClientSurfaceSuppressed({ serverTerminalStateShown: false })).toBe(false);
    expect(isClientSurfaceSuppressed()).toBe(false);
    // The 03-13 seam is present and inert.
    expect(isStaleReloadInProgress()).toBe(false);
  });
});

describe('mapClientError — rule 1, fail closed', () => {
  it('passes a known code straight through', () => {
    for (const code of CLIENT_ERROR_CODES) {
      expect(mapClientError(code)).toBe(code);
    }
  });

  it('collapses every one of the 13 diagnostic categories onto a real code', () => {
    // The relationship between the two vocabularies, asserted as TOTAL. This is
    // what stops a new diagnostic category from rendering `undefined` at a user.
    expect(Object.keys(CLIENT_CODE_FOR_DIAGNOSTIC_CATEGORY).sort()).toEqual(
      [...DIAGNOSTIC_CATEGORIES].sort(),
    );
    for (const category of DIAGNOSTIC_CATEGORIES) {
      const code = CLIENT_CODE_FOR_DIAGNOSTIC_CATEGORY[category];
      expect(CLIENT_ERROR_CODES, category).toContain(code);
      expect(mapClientError(category), category).toBe(code);
    }
  });

  it('returns CLIENT_UNEXPECTED for anything it does not recognise', () => {
    const unrecognised: unknown[] = [
      'SOME_FUTURE_CODE',
      '',
      undefined,
      null,
      0,
      42,
      true,
      Symbol('boom'),
      {},
      [],
      () => undefined,
      new Error('TypeError: Cannot read properties of undefined'),
      new RangeError('index out of range'),
      // A non-Error throw, which is what a badly-behaved library does.
      'PGRST301',
    ];
    for (const condition of unrecognised) {
      expect(mapClientError(condition), String(condition?.toString?.() ?? condition)).toBe(
        DEFAULT_CLIENT_ERROR_CODE,
      );
    }
    expect(DEFAULT_CLIENT_ERROR_CODE).toBe('CLIENT_UNEXPECTED');
  });

  it('recognises the three engines’ dynamic-import failure shapes', () => {
    // Non-vacuity partner to the case above: the mapper is not simply returning
    // CLIENT_UNEXPECTED for everything.
    const chunkFailures = [
      Object.assign(new Error('Loading chunk 42 failed.'), { name: 'ChunkLoadError' }),
      new Error('Failed to fetch dynamically imported module: /assets/index-a1b2.js'),
      new Error('error loading dynamically imported module'),
      new Error('Importing a module script failed.'),
      new Error('Unable to preload CSS for /assets/index-a1b2.css'),
    ];
    for (const error of chunkFailures) {
      expect(mapClientError(error), error.message).toBe('CLIENT_CHUNK_LOAD_FAILED');
    }
  });

  it('never returns caller-supplied text, only a member of the closed set', () => {
    const hostile = new Error('SUPER_SECRET_RAW_TEXT at internal/module.js:42:9');
    const code = mapClientError(hostile);
    expect(CLIENT_ERROR_CODES).toContain(code);
    expect(JSON.stringify(getClientErrorCopy(code))).not.toContain('SUPER_SECRET_RAW_TEXT');
  });
});

describe('the SERVER taxonomy is untouched by Phase 3', () => {
  it('still exposes exactly its frozen 13 codes', () => {
    // Scope guard. 03-12 adds a SIBLING table; if this plan ever edits
    // `analysisError.ts`, this is what says so.
    expect(ANALYSIS_ERROR_CODES).toHaveLength(13);
    expect(new Set(ANALYSIS_ERROR_CODES).size).toBe(13);
  });

  it('is a different vocabulary from the 9 client codes — no member is shared', () => {
    const server = new Set<string>(ANALYSIS_ERROR_CODES);
    for (const code of CLIENT_ERROR_CODES) {
      expect(server.has(code), `${code} collides with the server taxonomy`).toBe(false);
    }
  });
});
