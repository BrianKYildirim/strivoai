// Plan 23-06a Task 3 — Free-gate tests (SC-1 / IPC-01).
// Confirms that Free tier sees ProFeatureGate and never calls invokeWithTimeout.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ── Mocks (hoisted so they are initialised before vi.mock runs) ─────────
const { invokeWithTimeoutMock, getUserMock, fromMock } = vi.hoisted(() => ({
  invokeWithTimeoutMock: vi.fn(),
  getUserMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/lib/fetchWithTimeout", () => ({
  invokeWithTimeout: invokeWithTimeoutMock,
}));
vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: { getUser: getUserMock },
    from: fromMock,
  },
}));

vi.mock("@/contexts/AdminTierTestContext", () => ({
  useAdminTierTest: () => ({
    isAdmin: false,
    testTier: null,
    setTestTier: () => {},
    getEffectiveTier: (realTier: string) => realTier,
  }),
}));

// UniversalAnalyzing depends on AnalysisLockProvider; we render a stub so the
// page-level state-machine tests can drive without the global provider tree.
vi.mock("@/components/UniversalAnalyzing", () => ({
  UniversalAnalyzing: ({ isAnalyzing }: { isAnalyzing: boolean }) =>
    isAnalyzing ? <div data-testid="universal-analyzing-stub" /> : null,
}));

vi.mock("@/hooks/useMerits", () => ({
  useMerits: () => ({ isZero: false, canAfford: () => true }),
  useInvalidateMerits: () => () => {},
}));
vi.mock("@/hooks/useFeatureCosts", () => ({
  useFeatureCosts: () => ({ data: null }),
  getCostForFeature: () => 0,
}));
vi.mock("@/hooks/usePaywallGuard", () => ({
  usePaywallGuard: () => ({
    canAnalyze: true,
    triggerPaywall: () => {},
    refresh: () => {},
  }),
}));
vi.mock("@/hooks/useAnalysisGuard", () => ({
  useAnalysisGuard: () => ({
    startAnalysis: async (fn: any) => {
      try {
        const data = await fn();
        return { success: true, data };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    },
    cancelAnalysis: () => {},
    isRunning: () => false,
  }),
}));

import InterviewPrep from "./InterviewPrep";

function mockFreeTier() {
  getUserMock.mockResolvedValue({ data: { user: { id: "u-free" } } });
  // Profile (subscription_tier=free) then resumes (maybe query chain)
  fromMock.mockImplementation((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { subscription_tier: "free" },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "resumes") {
      return {
        select: () => ({
          eq: () => ({
            not: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }),
      };
    }
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    };
  });
}

describe("InterviewPrep — Free-tier gate (SC-1 / IPC-01)", () => {
  beforeEach(() => {
    invokeWithTimeoutMock.mockReset();
    getUserMock.mockReset();
    fromMock.mockReset();
    mockFreeTier();
  });

  it("renders ProFeatureGate block for Free tier", async () => {
    render(
      <MemoryRouter>
        <InterviewPrep />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(/ELITE EXCLUSIVE/i)).toBeInTheDocument();
    });
    expect(screen.getByText("Interview Prep Coach")).toBeInTheDocument();
  });

  it("never calls invokeWithTimeout on Free tier", async () => {
    render(
      <MemoryRouter>
        <InterviewPrep />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(/ELITE EXCLUSIVE/i)).toBeInTheDocument();
    });
    expect(invokeWithTimeoutMock).not.toHaveBeenCalled();
  });

  it("shows the Elite feature benefits list on Free tier", async () => {
    render(
      <MemoryRouter>
        <InterviewPrep />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(/ELITE EXCLUSIVE/i)).toBeInTheDocument();
    });
    // ProFeatureGate is retained as a compatibility component but renders Elite copy.
    expect(screen.getByText(/Upgrade to Elite/i)).toBeInTheDocument();
  });
});
