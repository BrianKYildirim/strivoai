import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CharacterCounter } from "./CharacterCounter";

describe("CharacterCounter (D-15 / SC-6)", () => {
  it("renders muted color at 0/500", () => {
    render(<CharacterCounter value={0} />);
    const span = screen.getByTestId("char-counter");
    expect(span.className).toContain("text-muted-foreground");
    expect(span.textContent).toBe("0/500");
  });
  it("renders muted color at 499/500", () => {
    render(<CharacterCounter value={499} />);
    expect(screen.getByTestId("char-counter").className).toContain("text-muted-foreground");
  });
  it("renders primary color at exactly 500/500", () => {
    render(<CharacterCounter value={500} />);
    expect(screen.getByTestId("char-counter").className).toContain("text-primary");
  });
  it("renders destructive color + helper at 501/500", () => {
    render(<CharacterCounter value={501} />);
    expect(screen.getByTestId("char-counter").className).toContain("text-destructive");
    expect(screen.getByText(/Keep your answer to 500 characters or fewer\./)).toBeInTheDocument();
  });
  it("renders destructive color + helper at 800/500", () => {
    render(<CharacterCounter value={800} />);
    expect(screen.getByTestId("char-counter").className).toContain("text-destructive");
    expect(screen.getByText(/Keep your answer to 500 characters or fewer\./)).toBeInTheDocument();
    expect(screen.getByTestId("char-counter").textContent).toBe("800/500");
  });
});
