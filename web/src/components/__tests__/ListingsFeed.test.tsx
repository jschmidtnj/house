import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ListingsFeed } from "../ListingsFeed";
import { makeListing, makeTwoUnitTownhouse } from "../../test/fixtures";

describe("ListingsFeed", () => {
  it("renders ranked listings, shows net monthly for 2-unit homes, and isolates card vs button clicks", () => {
    const condo = makeListing();
    const townhouse = makeTwoUnitTownhouse();
    const onSelectListing = vi.fn();
    const onToggleSave = vi.fn();
    const onToggleHide = vi.fn();
    const onTogglePin = vi.fn();

    render(
      <ListingsFeed
        listings={[condo, townhouse]}
        allListings={[condo, townhouse]}
        loading={false}
        isDesktop={true}
        rightPanelWidth={370}
        selectedId={null}
        savedIds={[1]}
        hiddenIds={[]}
        pinnedIds={[]}
        useNetRental={true}
        searchQuery=""
        onSearchChange={vi.fn()}
        onSelectListing={onSelectListing}
        onSelectNeighborhood={vi.fn()}
        onToggleSave={onToggleSave}
        onToggleHide={onToggleHide}
        onTogglePin={onTogglePin}
      />
    );

    expect(screen.getByText("2 listings ranked")).toBeInTheDocument();
    expect(screen.getByText("100 Bedford Ave #4A")).toBeInTheDocument();
    expect(screen.getByText("$6,240")).toBeInTheDocument();
    expect(screen.getByText("/mo net")).toBeInTheDocument();

    // Clicking card selects listing
    fireEvent.click(screen.getByText("42 Java St"));
    expect(onSelectListing).toHaveBeenCalledWith(townhouse);

    // Clicking favorite / compare / hide buttons does not double-fire card selection
    onSelectListing.mockClear();
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]); // Favorite on first card
    expect(onToggleSave).toHaveBeenCalledWith(1);
    expect(onSelectListing).not.toHaveBeenCalled();

    fireEvent.click(buttons[1]); // Pin on first card
    expect(onTogglePin).toHaveBeenCalledWith(1);
    expect(onSelectListing).not.toHaveBeenCalled();

    fireEvent.click(buttons[2]); // Hide on first card
    expect(onToggleHide).toHaveBeenCalledWith(1);
    expect(onSelectListing).not.toHaveBeenCalled();
  });

  it("renders empty-state guidance when no listings match", () => {
    render(
      <ListingsFeed
        listings={[]}
        allListings={[]}
        loading={false}
        isDesktop={true}
        rightPanelWidth={370}
        selectedId={null}
        savedIds={[]}
        hiddenIds={[]}
        pinnedIds={[]}
        useNetRental={true}
        searchQuery=""
        onSearchChange={vi.fn()}
        onSelectListing={vi.fn()}
        onSelectNeighborhood={vi.fn()}
        onToggleSave={vi.fn()}
        onToggleHide={vi.fn()}
        onTogglePin={vi.fn()}
      />
    );

    expect(screen.getByText(/No listings match the current knobs/i)).toBeInTheDocument();
  });
});
