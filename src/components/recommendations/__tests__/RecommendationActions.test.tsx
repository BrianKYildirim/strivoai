import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

// ── Mocks ─────────────────────────────────────────────────────────

const insertMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: (_table: string) => ({
      insert: (data: unknown) => insertMock(data),
    }),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: (msg: string) => toastSuccessMock(msg),
    error: (msg: string) => toastErrorMock(msg),
  },
}));

import RecommendationActions, {
  type Recommendation,
} from "../RecommendationActions";

// ── Fixtures ──────────────────────────────────────────────────────

const mockRec: Recommendation = {
  id: "rec-1",
  feature: "resume_analysis",
  user_id: "user-1",
  source_version_id: null,
  suggestion_text: "Quantify your impact in each bullet point.",
  suggestion_type: "bullet",
  target_ref_id: null,
  target_ref_type: null,
  shown_at: null,
  created_at: "2026-05-26T00:00:00Z",
};

// ── Tests ─────────────────────────────────────────────────────────

beforeEach(() => {
  insertMock.mockReset();
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
  // Default happy-path
  insertMock.mockResolvedValue({ data: null, error: null });
});

describe("RecommendationActions", () => {
  it("renders 3 action buttons given a valid recommendation", () => {
    render(<RecommendationActions recommendation={mockRec} />);

    expect(screen.getByRole("button", { name: /accept/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
  });

  it("returns null when recommendation prop is undefined", () => {
    const { container } = render(<RecommendationActions recommendation={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("clicking Accept calls supabase.from('user_edits').insert with action='accepted'", async () => {
    render(<RecommendationActions recommendation={mockRec} />);
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));

    await waitFor(() => {
      expect(insertMock).toHaveBeenCalledTimes(1);
      const insertArg = insertMock.mock.calls[0][0] as { action: string; rec_id: string };
      expect(insertArg.action).toBe("accepted");
      expect(insertArg.rec_id).toBe("rec-1");
    });
  });

  it("clicking Reject calls insert with action='rejected'", async () => {
    render(<RecommendationActions recommendation={mockRec} />);
    fireEvent.click(screen.getByRole("button", { name: /reject/i }));

    await waitFor(() => {
      const insertArg = insertMock.mock.calls[0][0] as { action: string };
      expect(insertArg.action).toBe("rejected");
    });
  });

  it("clicking Edit opens inline textarea", () => {
    render(<RecommendationActions recommendation={mockRec} />);
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));

    expect(screen.getByRole("textbox", { name: /edit suggestion/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("Save with edited text writes action='edited' and includes final_user_text", async () => {
    render(<RecommendationActions recommendation={mockRec} />);
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));

    const textarea = screen.getByRole("textbox", { name: /edit suggestion/i });
    fireEvent.change(textarea, { target: { value: "My custom bullet text." } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      const insertArg = insertMock.mock.calls[0][0] as {
        action: string;
        final_user_text: string;
      };
      expect(insertArg.action).toBe("edited");
      expect(insertArg.final_user_text).toBe("My custom bullet text.");
    });
  });

  it("network error shows toast and does not throw", async () => {
    insertMock.mockResolvedValueOnce({ data: null, error: new Error("DB write failed") });
    render(<RecommendationActions recommendation={mockRec} />);
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        expect.stringContaining("Could not save"),
      );
    });
    // Component should not throw — it's still in the DOM
    expect(screen.getByRole("button", { name: /accept/i })).toBeInTheDocument();
  });
});
