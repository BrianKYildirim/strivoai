import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  profileMaybeSingleMock: vi.fn(),
  targetsMaybeSingleMock: vi.fn(),
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getUser: () => mocks.getUserMock(),
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            table === "profiles"
              ? mocks.profileMaybeSingleMock()
              : mocks.targetsMaybeSingleMock(),
        }),
      }),
    }),
  },
}));

import { useUserTargets } from "../useUserTargets";

beforeEach(() => {
  mocks.getUserMock.mockReset();
  mocks.profileMaybeSingleMock.mockReset();
  mocks.targetsMaybeSingleMock.mockReset();
  mocks.getUserMock.mockResolvedValue({ data: { user: { id: "user-42" } }, error: null });
  mocks.profileMaybeSingleMock.mockResolvedValue({
    data: {
      id: "user-42",
      school: "Strivo University",
      major: "Finance",
      year: "senior",
      graduation_year: 2026,
      location_preference: "New York",
    },
    error: null,
  });
  mocks.targetsMaybeSingleMock.mockResolvedValue({
    data: {
      id: "target-42",
      user_id: "user-42",
      target_industries: ["Finance"],
      target_roles: ["Analyst"],
      target_companies: ["Strivo"],
      location_preference: null,
      career_goals: "Move into investment banking.",
      created_at: "2026-05-26T00:00:00Z",
      updated_at: "2026-05-26T00:00:00Z",
    },
    error: null,
  });
});

describe("useUserTargets", () => {
  it("starts in loading state", () => {
    const { result } = renderHook(() => useUserTargets());

    expect(result.current.loading).toBe(true);
    expect(result.current.profile).toBeNull();
    expect(result.current.targets).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("returns combined profile and career target data on success", async () => {
    const { result } = renderHook(() => useUserTargets());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.profile?.school).toBe("Strivo University");
    expect(result.current.targets?.target_roles).toEqual(["Analyst"]);
    expect(result.current.error).toBeNull();
  });

  it("sets error when profile fetch fails", async () => {
    mocks.profileMaybeSingleMock.mockResolvedValueOnce({
      data: null,
      error: new Error("profile failed"),
    });

    const { result } = renderHook(() => useUserTargets());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("profile failed");
    expect(result.current.profile).toBeNull();
    expect(result.current.targets).toBeNull();
  });

  it("refresh re-fetches user target data", async () => {
    const { result } = renderHook(() => useUserTargets());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.refresh();
    });

    await waitFor(() => expect(mocks.getUserMock).toHaveBeenCalledTimes(2));
    expect(mocks.profileMaybeSingleMock).toHaveBeenCalledTimes(2);
    expect(mocks.targetsMaybeSingleMock).toHaveBeenCalledTimes(2);
  });
});
