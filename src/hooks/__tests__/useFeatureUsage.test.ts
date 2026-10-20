import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ── Mocks ─────────────────────────────────────────────────────────

const rpcMock = vi.fn();

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    rpc: (name: string, args: unknown) => rpcMock(name, args),
  },
}));

import { useFeatureUsage } from "../useFeatureUsage";

// ── Tests ─────────────────────────────────────────────────────────

beforeEach(() => {
  rpcMock.mockReset();
  // Default: RPC resolves with no error
  rpcMock.mockResolvedValue({ data: null, error: null });
});

describe("useFeatureUsage", () => {
  it("recordEvent calls supabase.rpc with correct params", async () => {
    const { result } = renderHook(() => useFeatureUsage("resume_analysis"));

    await act(async () => {
      result.current.recordEvent("open");
    });

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("record_feature_usage", {
      p_feature: "resume_analysis",
      p_action: "open",
    });
  });

  it("calling same (feature, action) pair twice only invokes rpc once", async () => {
    const { result } = renderHook(() => useFeatureUsage("linkedin_grading"));

    await act(async () => {
      result.current.recordEvent("submit");
      result.current.recordEvent("submit");
    });

    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("different actions invoke rpc independently", async () => {
    const { result } = renderHook(() => useFeatureUsage("career_compass"));

    await act(async () => {
      result.current.recordEvent("open");
      result.current.recordEvent("view_results");
      result.current.recordEvent("export");
    });

    expect(rpcMock).toHaveBeenCalledTimes(3);
    const calls = rpcMock.mock.calls.map((c) => (c[1] as { p_action: string }).p_action);
    expect(calls).toContain("open");
    expect(calls).toContain("view_results");
    expect(calls).toContain("export");
  });

  it("rpc error is logged not thrown", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: new Error("DB error") });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { result } = renderHook(() => useFeatureUsage("recruiting_lens"));

    await act(async () => {
      result.current.recordEvent("submit");
    });

    expect(warnSpy).toHaveBeenCalledWith(
      "[useFeatureUsage]",
      "recruiting_lens",
      "submit",
      expect.any(Error),
    );

    warnSpy.mockRestore();
    // Verify no throw by checking hook is still mounted
    expect(result.current.recordEvent).toBeDefined();
  });
});
