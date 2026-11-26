import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TopHeader } from "../TopHeader";

describe("TopHeader theme toggle", () => {
  it("renders the dark/light mode toggle and invokes onToggleTheme", () => {
    const onToggleTheme = vi.fn();
    render(
      <TopHeader
        isDesktop={true}
        showSidebar={true}
        onToggleSidebar={vi.fn()}
        showRightPanel={true}
        onToggleRightPanel={vi.fn()}
        summary={null}
        listingsCount={0}
        allListings={[]}
        searchQuery=""
        onSearchChange={vi.fn()}
        onSelectListing={vi.fn()}
        onSelectNeighborhood={vi.fn()}
        savedCount={0}
        activeList={null}
        onSelectList={vi.fn()}
        tab="map"
        onTabChange={vi.fn()}
        mobilePane="map"
        onMobilePaneChange={vi.fn()}
        polling={false}
        onPoll={vi.fn()}
        theme="dark"
        onToggleTheme={onToggleTheme}
      />
    );

    const btn = screen.getByRole("button", { name: /Switch to light mode/i });
    fireEvent.click(btn);
    expect(onToggleTheme).toHaveBeenCalledTimes(1);
  });
});
