/**
 * error-boundary-leak-guard.test.tsx — Phase 03 · 03-12 · XRUN-06 + XDEV-08.
 *
 * THE ADVERSARIAL HALF of the leak guard. The Playwright spec proves nothing
 * raw reached the states it can force in a real browser; this proves that when
 * a boundary is handed the four classes of text that actually leak in
 * production, none of it reaches the DOM:
 *
 *   1. a raw `Error.message` from the JS engine,
 *   2. a Postgres / PostgREST error string,
 *   3. an AI-provider error string,
 *   4. a stack fragment.
 *
 * Each is thrown through BOTH boundaries and the UI-SPEC leak-guard regex is run
 * over `document.body.textContent`. The test is non-vacuous in two directions:
 * it also asserts that the expected FROZEN-TABLE copy rendered (so it cannot
 * pass on an empty document) and that the leak guard itself fires on the same
 * strings when they are not passed through a boundary.
 *
 * PROVEN ABLE TO FAIL — recorded in 03-12-SUMMARY.md: rendering `error.message`
 * in either boundary turns every one of the eight cases below red.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import AnalysisErrorBoundary from './AnalysisErrorBoundary';
import HomepageErrorBoundary from './HomepageErrorBoundary';
import {
  LEAK_GUARD_PATTERN,
  containsLeak,
  getClientErrorCopy,
} from '@/lib/client-error-taxonomy';

const reportDiagnostic = vi.hoisted(() => vi.fn());
vi.mock('@/lib/diagnostics/client-diagnostics', () => ({
  reportDiagnostic,
}));

/**
 * The four leak classes, in the exact shape each source produces. Every string
 * is asserted to trip the guard on its own, so a case that "passes" because the
 * regex is blind to it cannot exist.
 */
const LEAK_CLASSES = [
  {
    id: 'raw Error.message',
    message: "Cannot read properties of undefined (reading 'score')",
    name: 'TypeError',
    stack: "TypeError: Cannot read properties of undefined\n    at Results (index-a1b2.js:9241:18)",
  },
  {
    id: 'Postgres / PostgREST',
    message:
      'PGRST116: JSON object requested, multiple (or no) rows returned — 22P02 invalid input syntax for type uuid',
    name: 'PostgrestError',
    stack: 'PostgrestError\n    at postgrest-js:44:12',
  },
  {
    id: 'AI provider',
    message:
      'Deno.errors.Http: anthropic api returned 529 overloaded_error for model claude-haiku',
    name: 'Error',
    stack: 'Error\n    at invokeAnthropicText (node_modules/.deno/std/http.js:88:3)',
  },
  {
    id: 'stack fragment',
    message: 'boom',
    name: 'Error',
    stack:
      'Error: boom\n    at renderCriteria (chunk-DkG9zQxP.js:1401:22)\n    at commitWork (chunk-DkG9zQxP.js:900:4)',
  },
] as const;

function makeError(spec: (typeof LEAK_CLASSES)[number]): Error {
  const error = new Error(spec.message);
  error.name = spec.name;
  error.stack = spec.stack;
  return error;
}

function bombFor(error: Error): () => JSX.Element {
  return function Bomb(): JSX.Element {
    throw error;
  };
}

beforeEach(() => {
  reportDiagnostic.mockClear();
  // React logs the caught error itself; silencing it keeps the run readable and
  // does NOT affect what reaches the DOM, which is what is under test.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the leak guard is not blind (anti-vacuity)', () => {
  it.each(LEAK_CLASSES)('fires on the raw text of: $id', (spec) => {
    expect(containsLeak(spec.message) || containsLeak(spec.stack)).toBe(true);
  });
});

describe('AnalysisErrorBoundary — no raw text reaches the DOM (XRUN-06)', () => {
  it.each(LEAK_CLASSES)('renders only frozen-table copy for: $id', (spec) => {
    const Bomb = bombFor(makeError(spec));
    render(
      <AnalysisErrorBoundary>
        <Bomb />
      </AnalysisErrorBoundary>,
    );

    const rendered = document.body.textContent ?? '';

    // Non-vacuity: SOMETHING rendered, and it is the right something.
    expect(rendered.length).toBeGreaterThan(0);
    const copy = getClientErrorCopy('CLIENT_RENDER_FAILED');
    expect(screen.getByText(copy.heading)).toBeInTheDocument();
    expect(screen.getByText(copy.body)).toBeInTheDocument();

    // THE assertion.
    expect(
      LEAK_GUARD_PATTERN.test(rendered),
      `${spec.id}: raw text reached the DOM`,
    ).toBe(false);
    expect(rendered).not.toContain(spec.message);
    expect(rendered).not.toContain(spec.stack);
  });

  it('keeps the CLIENT_RENDER_FAILED copy byte-identical to what shipped', () => {
    const Bomb = bombFor(makeError(LEAK_CLASSES[0]));
    render(
      <AnalysisErrorBoundary>
        <Bomb />
      </AnalysisErrorBoundary>,
    );
    // The two LOCKED strings and the two LOCKED affordances, asserted literally
    // rather than through the table, so a table edit cannot silently reword the
    // one error surface that already worked.
    expect(screen.getByText("We couldn't display this analysis")).toBeInTheDocument();
    expect(
      screen.getByText(
        'Something went wrong showing your results. Your analysis may still be safe — refresh to reload it.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh page' })).toBeInTheDocument();
  });
});

describe('HomepageErrorBoundary — no raw text reaches the DOM (XRUN-06)', () => {
  it.each(LEAK_CLASSES)('renders only frozen-table copy for: $id', (spec) => {
    const Bomb = bombFor(makeError(spec));
    render(
      <HomepageErrorBoundary>
        <Bomb />
      </HomepageErrorBoundary>,
    );

    const rendered = document.body.textContent ?? '';
    expect(rendered.length).toBeGreaterThan(0);

    const copy = getClientErrorCopy('CLIENT_UNEXPECTED');
    expect(screen.getByText(copy.heading)).toBeInTheDocument();
    expect(screen.getByText(copy.body)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload Strivo' })).toBeInTheDocument();

    expect(
      LEAK_GUARD_PATTERN.test(rendered),
      `${spec.id}: raw text reached the DOM`,
    ).toBe(false);
    expect(rendered).not.toContain(spec.message);
    expect(rendered).not.toContain(spec.stack);
  });
});

describe('extension isolation (XDEV-08)', () => {
  /** An error whose top frame points at an injected extension script. */
  function extensionError(): Error {
    const error = new Error('this.#t.getOrInsertComputed is not a function');
    error.stack = 'TypeError\n    at chrome-extension://abcdef/injected.js:1:1';
    return error;
  }

  it('AnalysisErrorBoundary reports is_extension true and never shows the extension message', () => {
    // The bomb throws TWICE, so the one auto-recovery is exhausted and the
    // controlled fallback is actually reached — the branch that would otherwise
    // never be exercised.
    let thrown = 0;
    function PersistentExtensionBomb(): JSX.Element {
      thrown += 1;
      throw extensionError();
    }

    render(
      <AnalysisErrorBoundary>
        <PersistentExtensionBomb />
      </AnalysisErrorBoundary>,
    );

    expect(thrown).toBeGreaterThan(1);

    // Reported to diagnostics, flagged as extension-origin.
    expect(reportDiagnostic).toHaveBeenCalled();
    const reported = reportDiagnostic.mock.calls.map(([input]) => input);
    expect(reported.some((input) => input?.isExtension === true)).toBe(true);
    expect(reported.some((input) => input?.scriptOrigin === 'browser-extension')).toBe(true);

    // NOT attributed to Strivo's own rendering, and not the extension's words.
    const rendered = document.body.textContent ?? '';
    const neutral = getClientErrorCopy('CLIENT_UNEXPECTED');
    expect(screen.getByText(neutral.heading)).toBeInTheDocument();
    expect(screen.queryByText(/couldn't display this analysis/i)).not.toBeInTheDocument();
    expect(rendered).not.toContain('getOrInsertComputed');
    expect(rendered).not.toContain('chrome-extension://');
    expect(LEAK_GUARD_PATTERN.test(rendered)).toBe(false);
  });

  it('HomepageErrorBoundary reports is_extension true for an injected throw', () => {
    const Bomb = bombFor(extensionError());
    render(
      <HomepageErrorBoundary>
        <Bomb />
      </HomepageErrorBoundary>,
    );

    expect(reportDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ isExtension: true, scriptOrigin: 'browser-extension' }),
    );
    const rendered = document.body.textContent ?? '';
    expect(rendered).not.toContain('getOrInsertComputed');
    expect(LEAK_GUARD_PATTERN.test(rendered)).toBe(false);
  });
});

describe('rule 3 — one error surface at a time', () => {
  it('renders nothing when a server terminal state is already shown', () => {
    const Bomb = bombFor(makeError(LEAK_CLASSES[0]));
    const { container } = render(
      <AnalysisErrorBoundary serverTerminalStateShown>
        <Bomb />
      </AnalysisErrorBoundary>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('HomepageErrorBoundary also defers to a server terminal state', () => {
    const Bomb = bombFor(makeError(LEAK_CLASSES[0]));
    const { container } = render(
      <HomepageErrorBoundary serverTerminalStateShown>
        <Bomb />
      </HomepageErrorBoundary>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('static source guard — the boundaries cannot render raw text', () => {
  const BOUNDARIES = [
    'src/components/AnalysisErrorBoundary.tsx',
    'src/components/HomepageErrorBoundary.tsx',
  ] as const;

  /** JSX text/expression sites only — comments and imports are not rendered. */
  function renderableSource(file: string): string {
    const source = readFileSync(path.resolve(process.cwd(), file), 'utf8');
    return source
      .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
      .replace(/^\s*\/\/.*$/gm, ''); // line comments
  }

  it.each(BOUNDARIES)('%s never references error.message / stack / String(err)', (file) => {
    const source = renderableSource(file);
    expect(source).not.toMatch(/error\.message/);
    expect(source).not.toMatch(/\.stack\b(?!\s*,)/);
    expect(source).not.toMatch(/String\(\s*err/);
    expect(source).not.toMatch(/JSON\.stringify\(\s*error/);
  });

  it.each(BOUNDARIES)('%s imports its copy from the frozen table', (file) => {
    const source = renderableSource(file);
    expect(source).toMatch(/from "@\/lib\/client-error-taxonomy"/);
    expect(source).toMatch(/getClientErrorCopy/);
  });

  it.each(BOUNDARIES)('%s contains no long user-facing string literal', (file) => {
    // UI-SPEC § Downstream Obligations: "no user-facing string literal inside a
    // Phase-3 component". Tailwind class strings are long but are not prose, so
    // the probe looks for a literal containing a SENTENCE — two or more words
    // ending in a full stop — which is what a leaked copy string looks like.
    const source = renderableSource(file);
    const sentenceLiteral = /["'`][^"'`\n]*\b[a-z]+\s+[a-z]+\b[^"'`\n]*\.\s*["'`]/;
    const match = source.match(sentenceLiteral);
    expect(match?.[0] ?? null, `${file} inlines prose: ${match?.[0]}`).toBeNull();
  });
});
