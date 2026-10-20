/**
 * TierCardV2.interviewPrep.test.tsx — Phase 47 Plan 04 Task 1.
 *
 * Verifies the TierCardV2 pricing component honors the
 * `isInterviewPrepEnabled()` feature flag per CONTEXT D-01 / D-03 / D-04:
 *   - Flag off → bullets whose text matches /interview prep/i are decorated
 *     with a <ComingSoonBadge />. Free + Elite tiers each have exactly one
 *     such bullet.
 *   - Flag on  → no badge appears anywhere; bullets render byte-identical
 *     to today.
 *
 * D-04 lock: this test file does NOT modify `src/config/pricing-config.ts`.
 * The UI is the only thing decorating; pricing-config is the source of
 * truth for cost and stays untouched.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TierCardV2 } from '../TierCardV2';

describe('TierCardV2 — Interview Prep flag gate', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('when VITE_FEATURE_INTERVIEW_PREP is off', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_FEATURE_INTERVIEW_PREP', 'false');
    });

    it('renders a ComingSoonBadge on the Free tier IP bullet ("Interview Prep + Recruiting Lens locked")', () => {
      render(
        <TierCardV2
          tier="free"
          interval="monthly"
          status="scheduled"
          onCta={() => {}}
        />,
      );
      expect(screen.getByText(/Interview Prep \+ Recruiting Lens locked/i)).toBeInTheDocument();
      const badges = screen.getAllByText(/coming soon/i);
      expect(badges).toHaveLength(1);
      expect(screen.getByRole('button', { name: 'Scheduled' })).toBeDisabled();
    });

    it('renders a ComingSoonBadge on the Elite tier IP bullet', () => {
      render(
        <TierCardV2
          tier="elite"
          interval="monthly"
          status="current"
          onCta={() => {}}
        />,
      );
      expect(screen.getByText(/Richest outputs, premium support, and Interview Prep Quiz/i)).toBeInTheDocument();
      const badges = screen.getAllByText(/coming soon/i);
      expect(badges).toHaveLength(1);
      expect(screen.getByRole('button', { name: 'Current plan' })).toBeDisabled();
    });
  });

  describe('when VITE_FEATURE_INTERVIEW_PREP is on', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_FEATURE_INTERVIEW_PREP', 'true');
    });

    it('renders no ComingSoonBadge on the Free tier card', () => {
      render(<TierCardV2 tier="free" interval="monthly" onCta={() => {}} />);
      expect(screen.queryByText(/coming soon/i)).toBeNull();
    });

    it('renders no ComingSoonBadge on the Elite tier card', () => {
      render(<TierCardV2 tier="elite" interval="monthly" onCta={() => {}} />);
      expect(screen.queryByText(/coming soon/i)).toBeNull();
    });

    it('keeps the existing Interview Prep bullet text intact (D-01: retained, just tagged)', () => {
      render(<TierCardV2 tier="elite" interval="monthly" onCta={() => {}} />);
      expect(screen.getByText(/Richest outputs, premium support, and Interview Prep Quiz/i)).toBeInTheDocument();
    });
  });
});
