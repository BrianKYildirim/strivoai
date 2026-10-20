// Plan 23-06a Task 1 — StreakDisplay (D-19) 5-variant tests.
// Locked copy per UI-SPEC §13.4.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StreakDisplay } from "./StreakDisplay";

describe("StreakDisplay (D-19)", () => {
  it("renders 'Start your streak' for first-time user", () => {
    render(
      <StreakDisplay
        lastQuizAt={null}
        currentStreak={0}
        longestStreak={0}
        quizzesToday={0}
        dailyCap={3}
      />,
    );
    expect(screen.getByText("Start your streak")).toBeInTheDocument();
    expect(screen.getByTestId("streak-display")).toHaveAttribute(
      "data-variant",
      "first-time",
    );
  });

  it("renders active variant with n-day streak copy + 'Quiz today to keep it going.'", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    render(
      <StreakDisplay
        lastQuizAt={fiveMinAgo}
        currentStreak={3}
        longestStreak={5}
        quizzesToday={1}
        dailyCap={3}
      />,
    );
    expect(screen.getByText("3-day streak")).toBeInTheDocument();
    expect(
      screen.getByText("Quiz today to keep it going."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("streak-display")).toHaveAttribute(
      "data-variant",
      "active",
    );
  });

  it("renders cold variant when 24h < lastQuizAt < 48h", () => {
    const thirtyHoursAgo = new Date(
      Date.now() - 30 * 3_600_000,
    ).toISOString();
    render(
      <StreakDisplay
        lastQuizAt={thirtyHoursAgo}
        currentStreak={2}
        longestStreak={3}
        quizzesToday={0}
        dailyCap={3}
      />,
    );
    expect(screen.getByText("2-day streak — cooling off")).toBeInTheDocument();
    expect(screen.getByTestId("streak-display")).toHaveAttribute(
      "data-variant",
      "cold",
    );
  });

  it("renders expired variant when lastQuizAt > 48h", () => {
    const threeDaysAgo = new Date(Date.now() - 72 * 3_600_000).toISOString();
    render(
      <StreakDisplay
        lastQuizAt={threeDaysAgo}
        currentStreak={4}
        longestStreak={4}
        quizzesToday={0}
        dailyCap={3}
      />,
    );
    expect(screen.getByText("Streak ended")).toBeInTheDocument();
    expect(screen.getByTestId("streak-display")).toHaveAttribute(
      "data-variant",
      "expired",
    );
  });

  it("renders cap-reached variant when quizzesToday >= dailyCap", () => {
    render(
      <StreakDisplay
        lastQuizAt={new Date().toISOString()}
        currentStreak={2}
        longestStreak={4}
        quizzesToday={3}
        dailyCap={3}
      />,
    );
    expect(screen.getByText("You've hit today's cap")).toBeInTheDocument();
    expect(screen.getByTestId("streak-display")).toHaveAttribute(
      "data-variant",
      "cap-reached",
    );
  });

  it("renders a Flame icon in all variants", () => {
    const { container, rerender } = render(
      <StreakDisplay
        lastQuizAt={null}
        currentStreak={0}
        longestStreak={0}
        quizzesToday={0}
        dailyCap={3}
      />,
    );
    expect(container.querySelector("svg")).toBeInTheDocument();

    rerender(
      <StreakDisplay
        lastQuizAt={new Date().toISOString()}
        currentStreak={2}
        longestStreak={2}
        quizzesToday={3}
        dailyCap={3}
      />,
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
