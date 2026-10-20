/**
 * ExploreFeatures.interviewPrep.test.tsx — Phase 47 Plan 03 Task 2.
 *
 * Verifies the ExploreFeatures popover Interview Prep tile honors the
 * `isInterviewPrepEnabled()` feature flag per CONTEXT D-01 / D-03:
 *   - Flag off → Interview Prep button is disabled, renders inline
 *     <ComingSoonBadge />, and clicking does NOT navigate.
 *   - Flag on → Interview Prep button is a normal navigation target with
 *     no badge (byte-identical to today on staging).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom',
  );
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

// Mutable session the supabase mock reads from. Default: SIGNED-OUT, because
// signed-out users DO see the floating button — that keeps the Interview Prep
// flag-gate tests below able to reach the popover exactly as before. The auth
// visibility-gate tests override this per-test.
let currentSession: { user: { id: string } } | null = null;

vi.mock('@/lib/supabaseClient', () => {
  return {
    supabase: {
      auth: {
        getSession: () =>
          Promise.resolve({ data: { session: currentSession } }),
        onAuthStateChange: () => ({
          data: { subscription: { unsubscribe: () => {} } },
        }),
      },
    },
  };
});

import ExploreFeatures from '../ExploreFeatures';

async function openPopoverAndFindIPButton(user: ReturnType<typeof userEvent.setup>) {
  const trigger = await screen.findByRole('button', { name: /Explore Features/i });
  await user.click(trigger);

  // Each feature renders as a <button> with the feature label inside.
  // The popover is in a portal — query the whole document.
  const ipLabel = await screen.findByText('Interview Prep');
  const ipButton = ipLabel.closest('button');
  if (!ipButton) throw new Error('Interview Prep button not found');
  return ipButton;
}

describe('ExploreFeatures — Interview Prep flag gate', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    // Signed-out so the floating button (and thus the popover) is reachable.
    currentSession = null;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('when VITE_FEATURE_INTERVIEW_PREP is off', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_FEATURE_INTERVIEW_PREP', 'false');
    });

    it('renders the Interview Prep tile disabled with a ComingSoonBadge and does not navigate on click', async () => {
      render(<ExploreFeatures />);
      const user = userEvent.setup();

      const ipButton = await openPopoverAndFindIPButton(user);

      expect(ipButton).toBeDisabled();

      // The ComingSoonBadge is the span we ship in plan 47-01 with aria-label.
      const badge = within(ipButton).queryByText(/Coming Soon/i);
      expect(badge, 'expected a ComingSoonBadge inside the Interview Prep button').not.toBeNull();

      await user.click(ipButton);
      expect(navigateMock).not.toHaveBeenCalled();
    });
  });

  describe('when VITE_FEATURE_INTERVIEW_PREP is on', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_FEATURE_INTERVIEW_PREP', 'true');
    });

    it('renders the Interview Prep tile enabled with no badge and navigates on click', async () => {
      render(<ExploreFeatures />);
      const user = userEvent.setup();

      const ipButton = await openPopoverAndFindIPButton(user);

      expect(ipButton).not.toBeDisabled();
      expect(within(ipButton).queryByText(/Coming Soon/i)).toBeNull();

      await user.click(ipButton);
      // The button now renders only for signed-out visitors, so an enabled tile
      // routes to /auth (handleFeatureClick's else branch) rather than being a
      // no-op. Intent preserved: an enabled Interview Prep tile navigates.
      expect(navigateMock).toHaveBeenCalledWith('/auth');
    });
  });
});

describe('ExploreFeatures — auth visibility gate', () => {
  beforeEach(() => {
    navigateMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    currentSession = null;
  });

  it('hides the floating button when a user is authenticated', async () => {
    currentSession = { user: { id: 'u1' } };
    render(<ExploreFeatures />);

    // Allow the async getSession() resolve to flush, then assert the trigger
    // button is never rendered for a signed-in user.
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /Explore Features/i }),
      ).toBeNull();
    });
  });

  it('shows the floating button when signed out', async () => {
    currentSession = null;
    render(<ExploreFeatures />);

    expect(
      await screen.findByRole('button', { name: /Explore Features/i }),
    ).toBeInTheDocument();
  });
});
