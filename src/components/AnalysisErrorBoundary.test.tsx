/**
 * AnalysisErrorBoundary — proves the two guarantees for this ticket:
 *  1. A render crash shows a CONTROLLED message; the raw error/stack is never
 *     rendered to the user (only logged).
 *  2. A browser-extension-originated error is ISOLATED: the subtree auto-recovers
 *     so the analysis flow is not broken by injected extension noise.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import AnalysisErrorBoundary from './AnalysisErrorBoundary';

afterEach(() => vi.restoreAllMocks());

function FirstPartyBomb(): JSX.Element {
  throw new Error('SUPER_SECRET_RAW_STACK_TEXT at internal/module.js:42');
}

describe('AnalysisErrorBoundary', () => {
  it('renders children normally when nothing throws', () => {
    render(
      <AnalysisErrorBoundary>
        <div>healthy analysis ui</div>
      </AnalysisErrorBoundary>,
    );
    expect(screen.getByText('healthy analysis ui')).toBeInTheDocument();
  });

  it('shows a controlled message and never renders the raw error text', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {}); // silence React's boundary log

    render(
      <AnalysisErrorBoundary>
        <FirstPartyBomb />
      </AnalysisErrorBoundary>,
    );

    expect(screen.getByText(/couldn't display this analysis/i)).toBeInTheDocument();
    // The raw stack / message must NOT reach the DOM.
    expect(screen.queryByText(/SUPER_SECRET_RAW_STACK_TEXT/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('internal/module.js');
  });

  it('auto-recovers from a browser-extension-originated error (isolation)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Throw exactly once, then render successfully — this proves the boundary
    // recovered on remount. Toggling an outer flag during render is a deliberate
    // test-only side effect (that's the whole point of a "bomb" component), so
    // the React-purity lint is disabled just for this line.
    const bomb = { armed: true };
    function ExtensionBombThenRecover(): JSX.Element {
      if (bomb.armed) {
        // eslint-disable-next-line react-hooks/immutability -- test-only one-shot throw
        bomb.armed = false;
        const err = new Error('this.#t.getOrInsertComputed is not a function');
        // Injected by an extension → boundary should isolate + recover, not fail.
        err.stack = 'TypeError\n  at chrome-extension://abc123/injected.js:1:1';
        throw err;
      }
      return <div>analysis recovered</div>;
    }

    render(
      <AnalysisErrorBoundary>
        <ExtensionBombThenRecover />
      </AnalysisErrorBoundary>,
    );

    // The extension error was isolated: the subtree remounted and rendered,
    // rather than surfacing the controlled failure screen.
    expect(screen.getByText('analysis recovered')).toBeInTheDocument();
    expect(screen.queryByText(/couldn't display this analysis/i)).not.toBeInTheDocument();
  });
});
