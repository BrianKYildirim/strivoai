import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { PriorLinkedInSelector } from "@/components/PriorLinkedInSelector";

const { getUserMock, fromMock, tableData } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  fromMock: vi.fn(),
  tableData: {
    profile: null as Record<string, unknown> | null,
    grades: [] as Array<Record<string, unknown>>,
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
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: tableData.profile, error: null }),
          }),
        }),
      };
    }
    if (table === "linkedin_grades") {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: tableData.grades, error: null }),
            }),
          }),
        }),
      };
    }
    throw new Error(`Unexpected table ${table}`);
  });
}

describe("PriorLinkedInSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tableData.profile = null;
    tableData.grades = [];
    setupSupabase();
  });

  it("merges onboarding PDF with v3 grade rows, filters legacy rows, and auto-selects newest", async () => {
    tableData.profile = {
      linkedin_pdf_content: "stored profile content",
      linkedin_pdf_filename: "linkedin-export.pdf",
      linkedin_pdf_updated_at: "2026-05-19T12:00:00Z",
    };
    tableData.grades = [
      {
        id: "grade-new",
        overall_score: 91,
        created_at: "2026-05-21T12:00:00Z",
        profile_url: "linkedin.com/in/new",
        grading_data: { rawScore: 91, sectionBreakdown: [], profileContent: "graded content" },
      },
      {
        id: "legacy-grade",
        overall_score: 55,
        created_at: "2026-05-22T12:00:00Z",
        grading_data: { oldShape: true },
      },
    ];
    const onSelect = vi.fn();

    render(
      <MemoryRouter>
        <PriorLinkedInSelector onSelect={onSelect} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledTimes(1);
    });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
      id: "grade-new",
      sourceType: "linkedin_grade",
      overallScore: 91,
    }));
    expect(screen.getByText("Use a prior LinkedIn source")).toBeInTheDocument();
    expect(screen.getByText(/linkedin.com\/in\/new/)).toBeInTheDocument();
  });

  it("renders an empty-state CTA to LinkedIn Grader when no source exists", async () => {
    render(
      <MemoryRouter>
        <PriorLinkedInSelector onSelect={vi.fn()} />
      </MemoryRouter>,
    );

    const link = await screen.findByRole("link", { name: "Add LinkedIn" });
    expect(link).toHaveAttribute("href", "/linkedin-grader");
  });
});

