/**
 * Navbar.interviewPrep.test.tsx — Phase 47 Plan 03 Task 3.
 *
 * Verifies every Navbar Interview Prep render site (desktop nav + mobile
 * drawer) honors the `isInterviewPrepEnabled()` feature flag per CONTEXT
 * D-01 / D-03:
 *   - Flag off → every <a href="/interview-prep"> (or its disabled variant)
 *     is in a disabled state AND at least one "Coming Soon" affordance
 *     (badge or tooltip text node) is present in the DOM.
 *   - Flag on  → no Interview Prep link is disabled AND no "Coming Soon"
 *     copy is present anywhere on the document (byte-identical to today).
 *
 * The test queries the whole document because Navbar renders the desktop
 * NavigationMenu and the mobile Popover drawer in parallel; either render
 * site missing the gate is a regression we must catch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';

// ── Heavy hook + supabase mocks so Navbar renders the authed link set ──
vi.mock('@/lib/supabaseClient', () => {
  const fakeUser = { id: 'u1', email: 'a@b.test' };
  return {
    supabase: {
      auth: {
        getSession: () =>
          Promise.resolve({ data: { session: { user: fakeUser } } }),
        onAuthStateChange: () => ({
          data: { subscription: { unsubscribe: () => {} } },
        }),
        signOut: () => Promise.resolve(),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: { full_name: 'Test User', subscription_tier: 'pro' },
              }),
          }),
        }),
      }),
      rpc: () =>
        Promise.resolve({ data: { current_usage: 1, limit: 75 } }),
    },
  };
});

vi.mock('@/hooks/useMerits', () => ({
  useMerits: () => ({ isZero: false, balance: 50, refresh: () => {} }),
}));

vi.mock('@/hooks/useThemeLogo', () => ({
  useThemeLogo: () => '/logo.svg',
}));

vi.mock('@/contexts/AdminTierTestContext', () => ({
  useAdminTierTest: () => ({
    isAdmin: false,
    testTier: null,
    setTestTier: () => {},
  }),
}));

vi.mock('@/contexts/AnalysisLockContext', () => ({
  useAnalysisLock: () => ({ isLocked: false }),
}));

import { Navbar } from '../Navbar';

function renderNavbar() {
  return render(
    <MemoryRouter>
      <TooltipProvider delayDuration={0}>
        <Navbar />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

/**
 * Collect every DOM node that represents an Interview Prep entry.
 *  - Links with href="/interview-prep" (enabled state)
 *  - Links with href="#" whose label is "Interview Prep" (disabled state)
 *  - <button> wrappers with "Interview Prep" label (alternative disabled rendering)
 */
function findInterviewPrepEntries(): Element[] {
  const out: Element[] = [];
  document.querySelectorAll<HTMLAnchorElement>('a[href="/interview-prep"]').forEach((a) => out.push(a));
  const labelSpans = Array.from(document.querySelectorAll('a, button')).filter(
    (el) => {
      // Only collect ones whose direct or descendant text is exactly "Interview Prep"
      return Array.from(el.querySelectorAll('*'))
        .concat([el])
        .some((n) => (n.textContent || '').trim() === 'Interview Prep');
    },
  );
  labelSpans.forEach((el) => {
    if (!out.includes(el)) out.push(el);
  });
  return out;
}

function isDisabledNode(el: Element): boolean {
  if (el.getAttribute('aria-disabled') === 'true') return true;
  if (el.tagName === 'BUTTON' && (el as HTMLButtonElement).disabled) return true;
  if ((el.getAttribute('class') || '').includes('pointer-events-none')) return true;
  return false;
}

describe('Navbar — Interview Prep flag gate', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  describe('when VITE_FEATURE_INTERVIEW_PREP is off', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_FEATURE_INTERVIEW_PREP', 'false');
    });

    it('renders every Interview Prep entry in a disabled state with a Coming Soon affordance', async () => {
      renderNavbar();

      // Wait for the authed link set to render (Navbar reads session async)
      await screen.findByText('Dashboard');

      // Open the mobile drawer so its inline <ComingSoonBadge /> mounts.
      // (Radix Tooltip portals are unreliable to open under jsdom; the mobile
      // drawer's inline badge is the deterministic affordance to assert on.)
      const user = userEvent.setup();
      const hamburger = screen.getByLabelText(/Open navigation menu/i);
      await user.click(hamburger);

      const ipEntries = findInterviewPrepEntries();
      expect(ipEntries.length, 'expected at least one Interview Prep entry').toBeGreaterThan(0);

      // Every collected entry must be in a disabled state.
      for (const el of ipEntries) {
        expect(
          isDisabledNode(el),
          `expected entry to be disabled but got: ${el.outerHTML.slice(0, 200)}`,
        ).toBe(true);
      }

      // At least one "Coming Soon" affordance should be present — the mobile
      // drawer renders <ComingSoonBadge /> inline next to each disabled entry.
      const comingSoonNodes = screen.queryAllByText(/Coming Soon/i);
      expect(comingSoonNodes.length).toBeGreaterThan(0);
    });
  });

  describe('when VITE_FEATURE_INTERVIEW_PREP is on', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_FEATURE_INTERVIEW_PREP', 'true');
    });

    it('renders every Interview Prep entry as a normal navigation target with no Coming Soon affordance', async () => {
      renderNavbar();
      await screen.findByText('Dashboard');

      const ipEntries = findInterviewPrepEntries();
      expect(ipEntries.length).toBeGreaterThan(0);

      for (const el of ipEntries) {
        expect(
          isDisabledNode(el),
          `expected entry NOT to be disabled but got: ${el.outerHTML.slice(0, 200)}`,
        ).toBe(false);
      }

      expect(screen.queryByText(/Coming Soon/i)).toBeNull();
    });
  });
});
