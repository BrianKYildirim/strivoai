import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { PriorAnalysisSelector } from "@/components/PriorAnalysisSelector";

const { getUserMock, fromMock, tableData } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  fromMock: vi.fn(),
  tableData: {
    resumes: [] as Array<Record<string, unknown>>,
  },
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: { getUser: getUserMock },
    from: fromMock,
  },
}));

function setupSupabase() {
  getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
  fromMock.mockImplementation((table: string) => {
    if (table === "resumes") {
      return {
        select: () => ({
          eq: () => ({
            not: () => ({
              order: () => ({
                limit: async () => ({ data: tableData.resumes, error: null }),
              }),
            }),
          }),
        }),
      };
    }
    throw new Error(`Unexpected table ${table}`);
  });
}

describe("PriorAnalysisSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tableData.resumes = [];
    setupSupabase();
  });

  it("auto-selects the newest prior and displays file name and score metadata", async () => {
    tableData.resumes = [
      {
        id: "resume-new",
        file_name: "senior-product-manager-resume.pdf",
        analyzed_at: "2026-05-20T12:00:00Z",
        created_at: "2026-05-20T12:00:00Z",
        overall_score: 88,
        grading_data: { overallScore: 88 },
        file_path: "user-1/resume-new.pdf",
      },
    ];
    const onSelect = vi.fn();

    render(
      <MemoryRouter>
        <PriorAnalysisSelector onSelect={onSelect} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledTimes(1);
    });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
      id: "resume-new",
      fileName: "senior-product-manager-resume.pdf",
      overallScore: 88,
    }));
    expect(screen.getByText("Use a prior resume analysis")).toBeInTheDocument();
    expect(screen.getByText(/senior-product-manager-resume/)).toBeInTheDocument();
  });

  it("renders an empty-state CTA to upload when no priors exist", async () => {
    render(
      <MemoryRouter>
        <PriorAnalysisSelector onSelect={vi.fn()} />
      </MemoryRouter>,
    );

    const link = await screen.findByRole("link", { name: "Analyze My Resume" });
    expect(link).toHaveAttribute("href", "/upload");
  });
});

