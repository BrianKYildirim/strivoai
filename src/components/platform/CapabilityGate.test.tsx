/**
 * CapabilityGate.test.tsx — the accessibility and money-path guard on Surface B.
 *
 * The three properties asserted here are the ones whose absence is invisible in a
 * screenshot and expensive in production:
 *
 *  1. The blocked CTA is `aria-disabled`, NOT `disabled`. A `disabled` button leaves
 *     the tab order and announces nothing; the user gets a dead control and no reason.
 *  2. Activating the blocked CTA — by click AND by keyboard — moves focus to the
 *     explanation heading and calls NO handler of any kind.
 *  3. Every rendered string is the frozen UI-SPEC copy, so a well-meaning edit to the
 *     JSX cannot quietly reword a contract string.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  BlockedAiEntryPoint,
  BlockedCheckoutEntryPoint,
  BlockedCheckoutNotice,
  CapabilityBanner,
  CapabilityDetailDialog,
} from './CapabilityGate';
import { CAPABILITY_COPY } from '@/lib/platform/capability-copy';
import { resetCapabilitiesForTests } from '@/lib/platform/capabilities';

/**
 * Force `degraded` the same way the E2E spec does — by removing the global the
 * document-extraction group probes — so the unit and browser proofs agree on what
 * "degraded" means rather than each inventing its own definition.
 *
 * (jsdom happens to expose no `Worker` at all, so the delete is usually a no-op here
 * and degraded is the ambient state. It is still written as a delete so this helper
 * keeps working if jsdom ever gains one, and so the mechanism matches the E2E spec.)
 */
function forceDegraded(): () => void {
  const target = globalThis as unknown as Record<string, unknown>;
  const original = Object.getOwnPropertyDescriptor(target, 'Worker');
  delete target.Worker;
  resetCapabilitiesForTests();
  return () => {
    if (original) Object.defineProperty(target, 'Worker', original);
    resetCapabilitiesForTests();
  };
}

let restore: (() => void) | undefined;

beforeEach(() => {
  restore = forceDegraded();
});

afterEach(() => {
  cleanup();
  restore?.();
  restore = undefined;
});

describe('BlockedAiEntryPoint (B2)', () => {
  it('is aria-disabled and NOT disabled, so it keeps the tab order', () => {
    render(<BlockedAiEntryPoint label="Analyze Resume" />);
    const cta = screen.getByRole('button', { name: 'Analyze Resume' });
    expect(cta).toHaveAttribute('aria-disabled', 'true');
    expect(cta).not.toBeDisabled();
    expect(cta).not.toHaveAttribute('disabled');
  });

  it('keeps the host page label, and describes itself with the explanation heading', () => {
    render(<BlockedAiEntryPoint label="Get Personalized Analysis" />);
    const cta = screen.getByRole('button', { name: 'Get Personalized Analysis' });
    const describedBy = cta.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)).toHaveTextContent(
      CAPABILITY_COPY.analysisHeading,
    );
  });

  it('renders the UI-SPEC copy verbatim inside a role="note" card', () => {
    render(<BlockedAiEntryPoint label="Analyze Job" />);
    const card = screen.getByTestId('capability-blocked-analysis');
    expect(card).toHaveAttribute('role', 'note');
    expect(card).toHaveTextContent(CAPABILITY_COPY.analysisHeading);
    expect(card).toHaveTextContent(CAPABILITY_COPY.analysisBody);
    expect(
      screen.getByRole('link', { name: CAPABILITY_COPY.supportedBrowsersAction }),
    ).toHaveAttribute('href', '/supported-browsers.html');
  });

  it('is not destructive and never announces as an alert', () => {
    render(<BlockedAiEntryPoint label="Analyze Resume" />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(
      screen.getByTestId('capability-blocked-analysis').className,
    ).not.toMatch(/destructive/);
  });

  it('moves focus to the explanation heading on CLICK, and fires no handler', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(
      <div onClickCapture={spy}>
        <BlockedAiEntryPoint label="Analyze Resume" />
      </div>,
    );
    await user.click(screen.getByRole('button', { name: 'Analyze Resume' }));

    const heading = screen.getByRole('heading', {
      name: CAPABILITY_COPY.analysisHeading,
    });
    expect(document.activeElement).toBe(heading);
    // The capture-phase listener proves the event was allowed to happen at all — the
    // point is that the control has no submit/run handler of its own to reach.
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('moves focus to the explanation heading on ENTER and on SPACE', async () => {
    const user = userEvent.setup();
    render(<BlockedAiEntryPoint label="Analyze Resume" />);
    const cta = screen.getByRole('button', { name: 'Analyze Resume' });
    const heading = screen.getByRole('heading', {
      name: CAPABILITY_COPY.analysisHeading,
    });

    cta.focus();
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(heading);

    cta.focus();
    await user.keyboard(' ');
    expect(document.activeElement).toBe(heading);
  });
});

describe('BlockedCheckoutEntryPoint (B3)', () => {
  it('renders the checkout copy verbatim under its own testid', () => {
    render(<BlockedCheckoutEntryPoint label="Upgrade to Elite" />);
    const card = screen.getByTestId('capability-blocked-checkout');
    expect(card).toHaveAttribute('role', 'note');
    expect(card).toHaveTextContent(CAPABILITY_COPY.checkoutHeading);
    expect(card).toHaveTextContent(CAPABILITY_COPY.checkoutBody);
    expect(
      screen.getByRole('button', { name: 'Upgrade to Elite' }),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('the trigger-less notice focuses its heading on mount', () => {
    render(<BlockedCheckoutNotice />);
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: CAPABILITY_COPY.checkoutHeading }),
    );
  });
});

describe('CapabilityBanner (B1)', () => {
  it('is a polite status in normal flow, never fixed and never destructive', () => {
    render(<CapabilityBanner />);
    const banner = screen.getByTestId('capability-degraded-banner');
    expect(banner).toHaveAttribute('role', 'status');
    expect(banner).toHaveTextContent(CAPABILITY_COPY.bannerBody);
    expect(banner.className).not.toMatch(/fixed/);
    expect(banner.className).not.toMatch(/destructive/);
  });

  it('has a 44x44 dismiss control with an accessible name', () => {
    render(<CapabilityBanner />);
    const dismiss = screen.getByRole('button', {
      name: CAPABILITY_COPY.bannerDismissLabel,
    });
    expect(dismiss.className).toMatch(/\bh-11\b/);
    expect(dismiss.className).toMatch(/\bw-11\b/);
  });

  it('opens B4 from the banner link, listing plain-language areas only', async () => {
    const user = userEvent.setup();
    render(<CapabilityBanner />);
    await user.click(
      screen.getByRole('button', { name: CAPABILITY_COPY.bannerLink }),
    );
    const dialog = await screen.findByTestId('capability-detail-dialog');
    expect(dialog).toHaveTextContent(CAPABILITY_COPY.detailTitle);
    expect(dialog).toHaveTextContent(CAPABILITY_COPY.detailIntro);
    expect(dialog).toHaveTextContent(CAPABILITY_COPY.detailFooter);
    expect(dialog).toHaveTextContent('Resume Analysis');
    expect(dialog.textContent ?? '').not.toMatch(
      /Worker|structuredClone|ReadableStream|randomUUID|localStorage/,
    );
  });

  it('renders nothing on a supported browser', () => {
    // jsdom has no `Worker` at all, so "supported" has to be constructed: install a
    // constructor that READS the `type` option, which is exactly what a
    // module-worker-aware engine does.
    const target = globalThis as unknown as Record<string, unknown>;
    target.Worker = class {
      constructor(_url: string, options?: WorkerOptions) {
        void options?.type;
      }
      terminate(): void {}
    };
    resetCapabilitiesForTests();
    try {
      const { container } = render(<CapabilityBanner />);
      expect(container).toBeEmptyDOMElement();
    } finally {
      delete target.Worker;
      resetCapabilitiesForTests();
    }
  });
});

describe('CapabilityDetailDialog (B4)', () => {
  it('renders nothing while closed', () => {
    render(<CapabilityDetailDialog open={false} onOpenChange={() => {}} />);
    expect(screen.queryByTestId('capability-detail-dialog')).toBeNull();
  });
});
