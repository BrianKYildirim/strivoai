/**
 * PricingTable.interviewPrep.test.tsx — Phase 47 Plan 04 Task 2.
 *
 * Verifies the PricingTable component honors the
 * `isInterviewPrepEnabled()` feature flag per CONTEXT D-01 / D-03 / D-04:
 *   - Flag off → bullets matching /interview (prep|quiz)/i are decorated
 *     with a <ComingSoonBadge />. Two IP-bearing bullets total:
 *       * Free excludedFeatures: "Interview Prep"
 *       * Elite features:        "Interactive interview quiz (5 Merits)"
 *   - Flag on  → no badge appears anywhere; bullets render byte-identical
 *     to today.
 *
 * D-04 lock: this test file does NOT modify `src/config/pricing-config.ts`.
 * The UI is the only thing decorating; pricing-config is the source of
 * truth for cost and stays untouched.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ── Heavy hook + supabase mocks so PricingTable mounts without network ──
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: { id: 'u1', email: 'a@b.test' } } }),
    },
  },
}));

vi.mock('@/hooks/useStripeCheckout', () => ({
  useStripeCheckout: () => ({
    isLoading: false,
    fetchClientSecret: vi.fn(),
  }),
}));

vi.mock('@/hooks/useTierAccess', () => ({
  useTierAccess: () => ({ tier: 'free', loading: false }),
}));

import PricingTable from '../PricingTable';

function renderTable() {
  return render(
    <MemoryRouter>
      <PricingTable />
    </MemoryRouter>,
  );
}

describe('PricingTable — Interview Prep flag gate', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  describe('when VITE_FEATURE_INTERVIEW_PREP is off', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_FEATURE_INTERVIEW_PREP', 'false');
    });

    it('renders a ComingSoonBadge next to every active Interview Prep bullet (Free excluded, Elite feature)', () => {
      renderTable();

      // Existing bullet text must remain visible (D-01: retained, just tagged).
      expect(screen.getByText('Interview Prep')).toBeInTheDocument();
      expect(screen.getByText(/Interactive interview quiz \(5 Merits\)/i)).toBeInTheDocument();

      // Exactly two ComingSoon affordances across the active IP-bearing bullets.
      const badges = screen.getAllByText(/coming soon/i);
      expect(badges).toHaveLength(2);
    });
  });

  describe('when VITE_FEATURE_INTERVIEW_PREP is on', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_FEATURE_INTERVIEW_PREP', 'true');
    });

    it('renders no ComingSoonBadge anywhere and bullets render with original text', () => {
      renderTable();

      // The same bullets must still be in the DOM (config untouched).
      expect(screen.getByText('Interview Prep')).toBeInTheDocument();
      expect(screen.getByText(/Interactive interview quiz \(5 Merits\)/i)).toBeInTheDocument();

      // No badges anywhere.
      expect(screen.queryByText(/coming soon/i)).toBeNull();
    });
  });
});
