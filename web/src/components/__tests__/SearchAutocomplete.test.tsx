import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ScoredListing } from "../../types";
import { SearchAutocomplete } from "../SearchAutocomplete";
import { makeListing, makeTwoUnitTownhouse } from "../../test/fixtures";

function ControlledSearch({
  onSelectListing,
  onSelectNeighborhood,
}: {
  onSelectListing: (item: ScoredListing) => void;
  onSelectNeighborhood: (hood: string) => void;
}) {
  const [query, setQuery] = useState("");
  return (
    <SearchAutocomplete
      query={query}
      onQueryChange={setQuery}
      listings={[makeListing(), makeTwoUnitTownhouse()]}
      onSelectListing={onSelectListing}
      onSelectNeighborhood={onSelectNeighborhood}
    />
  );
}

describe("SearchAutocomplete", () => {
  it("shows top neighborhoods on focus and calls onSelectNeighborhood on click", () => {
    const onSelectListing = vi.fn();
    const onSelectNeighborhood = vi.fn();
    render(
      <ControlledSearch
        onSelectListing={onSelectListing}
        onSelectNeighborhood={onSelectNeighborhood}
      />
    );

    const input = screen.getByPlaceholderText(/Search address/i);
    fireEvent.focus(input);

    expect(screen.getByText("Top Neighborhoods")).toBeInTheDocument();
    const wburg = screen.getByText("Williamsburg");
    fireEvent.mouseDown(wburg);

    expect(onSelectNeighborhood).toHaveBeenCalledWith("Williamsburg");
  });

  it("matches subway stations and listings as user types and supports Enter selection", () => {
    const onSelectListing = vi.fn();
    const onSelectNeighborhood = vi.fn();
    render(
      <ControlledSearch
        onSelectListing={onSelectListing}
        onSelectNeighborhood={onSelectNeighborhood}
      />
    );

    const input = screen.getByPlaceholderText(/Search address/i);
    fireEvent.change(input, { target: { value: "Java" } });

    expect(screen.getByText("42 Java St")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelectListing).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
  });

  it("focuses search input when pressing '/' outside an input", () => {
    render(
      <ControlledSearch onSelectListing={vi.fn()} onSelectNeighborhood={vi.fn()} />
    );

    const input = screen.getByPlaceholderText(/Search address/i);
    expect(document.activeElement).not.toBe(input);

    fireEvent.keyDown(window, { key: "/" });
    expect(document.activeElement).toBe(input);
  });
});
