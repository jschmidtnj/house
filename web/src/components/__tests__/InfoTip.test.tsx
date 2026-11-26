import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HoverTip, InfoTip } from "../InfoTip";

describe("InfoTip & HoverTip", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("InfoTip renders a portal tooltip on hover and closes on mouse leave", () => {
    render(<InfoTip text="Front-end DTI is housing divided by gross income." />);
    const btn = screen.getByRole("button", { name: /More info/i });

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.mouseEnter(btn);
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Front-end DTI is housing divided by gross income."
    );

    fireEvent.mouseLeave(btn);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("HoverTip opens after dwell time and cancels if mouse leaves early", () => {
    vi.useFakeTimers();
    render(
      <HoverTip text="Composite score explanation" delayMs={100}>
        <span>74.5</span>
      </HoverTip>
    );

    const badge = screen.getByText("74.5");
    fireEvent.mouseEnter(badge);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.mouseLeave(badge);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    // Now hover past the 100ms threshold
    fireEvent.mouseEnter(badge);
    act(() => {
      vi.advanceTimersByTime(110);
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Composite score explanation");
  });
});
