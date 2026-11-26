import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CompareBar } from "../CompareBar";
import { makeListing, makeTwoUnitTownhouse } from "../../test/fixtures";

describe("CompareBar", () => {
  it("renders nothing when no listings are pinned", () => {
    const { container } = render(
      <CompareBar items={[]} onRemove={vi.fn()} onClear={vi.fn()} onSelect={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("opens full side-by-side modal and highlights row winners in teal", () => {
    const condo = makeListing();
    const townhouse = makeTwoUnitTownhouse();
    const onClear = vi.fn();

    render(
      <CompareBar
        items={[condo, townhouse]}
        onRemove={vi.fn()}
        onClear={onClear}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText("Compare (2/3)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Expand SxS/i }));

    expect(screen.getByText("Side-by-Side Comparison")).toBeInTheDocument();
    // Townhouse has lower net monthly ($6,240 vs $7,707) -> highlighted in teal
    const bestMonthlyCell = screen.getByText(/\$6,240\/mo/).closest("td");
    expect(bestMonthlyCell?.className).toContain("text-teal-300");

    fireEvent.click(screen.getByRole("button", { name: /Clear All/i }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
