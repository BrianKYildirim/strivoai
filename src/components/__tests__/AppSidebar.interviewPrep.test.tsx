/**
 * AppSidebar.interviewPrep.test.tsx — Phase 47 Plan 03 Task 1.
 *
 * Verifies the AppSidebar Interview Prep entry honors the
 * `isInterviewPrepEnabled()` feature flag per CONTEXT D-01 / D-03:
 *   - Flag off → Interview Prep link is disabled (pointer-events-none,
 *     aria-disabled), and the collapsed-icon tooltip shows "Coming Soon".
 *   - Flag on → Interview Prep link is a normal navigation target with no
 *     "Coming Soon" affordance (byte-identical to today on staging).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppSidebar } from '../AppSidebar';

// AppSidebar warms the dashboard cache on hover/focus of the Home link, so it now
// resolves a QueryClient. The real app always mounts it inside the app-root provider;
// the prefetch is deliberately NOT made defensive about a missing client, because a
// defensive guard would hide a real regression.
function renderSidebar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TooltipProvider delayDuration={0}>
          <AppSidebar />
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AppSidebar — Interview Prep flag gate', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('when VITE_FEATURE_INTERVIEW_PREP is off', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_FEATURE_INTERVIEW_PREP', 'false');
    });

    it('renders the Interview Prep link in a disabled state with a Coming Soon tooltip', async () => {
      const { container } = renderSidebar();

      // The "Interview Prep" label is in a sibling <span> of the link. Find the
      // <Link> whose label text is "Interview Prep" — that's the only entry the
      // gate touches regardless of href fallback ("#") or path.
      const labelSpans = Array.from(container.querySelectorAll('span')).filter(
        (s) => s.textContent === 'Interview Prep',
      );
      expect(labelSpans.length).toBeGreaterThan(0);
      const ipLink = labelSpans[0].closest('a');
      expect(ipLink, 'expected to find the Interview Prep <a> tag').toBeTruthy();

      expect(ipLink!.className).toMatch(/pointer-events-none/);
      expect(ipLink!.getAttribute('aria-disabled')).toBe('true');

      // Trigger tooltip via hover on the link.
      const user = userEvent.setup();
      await user.hover(ipLink!);

      // Tooltip content should mention "Coming Soon".
      const tooltipMatch = await screen.findAllByText(/Coming Soon/i);
      expect(tooltipMatch.length).toBeGreaterThan(0);
    });
  });

  describe('when VITE_FEATURE_INTERVIEW_PREP is on', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_FEATURE_INTERVIEW_PREP', 'true');
    });

    it('renders the Interview Prep link as a normal navigation target with no Coming Soon affordance', async () => {
      renderSidebar();

      const ipLink = document.querySelector<HTMLAnchorElement>(
        'a[href="/interview-prep"]',
      );
      expect(ipLink, 'expected an enabled /interview-prep link').toBeTruthy();
      expect(ipLink!.className).not.toMatch(/pointer-events-none/);
      expect(ipLink!.getAttribute('aria-disabled')).not.toBe('true');

      // Tooltip on hover should say exactly "Interview Prep", no "Coming Soon".
      const user = userEvent.setup();
      await user.hover(ipLink!);

      const tooltipLabels = await screen.findAllByText(/^Interview Prep$/);
      expect(tooltipLabels.length).toBeGreaterThan(0);
      expect(screen.queryByText(/Coming Soon/i)).toBeNull();
    });
  });
});
