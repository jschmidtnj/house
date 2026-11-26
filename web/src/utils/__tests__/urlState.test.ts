import { describe, expect, it } from "vitest";
import { DEFAULT_KNOBS } from "../../config";
import { applyUrlKnobs, buildUrlSearch, parseUrlUiState } from "../urlState";

describe("urlState", () => {
  it("omits default values to keep the URL clean", () => {
    const qs = buildUrlSearch(DEFAULT_KNOBS, DEFAULT_KNOBS, {
      selectedId: null,
      activeList: null,
      selectedBoroughs: [],
      selectedNeighborhoods: [],
      tab: "map",
    });
    expect(qs).toBe("");
  });

  it("round-trips non-default knobs, location filters, list, and selected listing", () => {
    const customKnobs = {
      ...DEFAULT_KNOBS,
      max_monthly_cost: 6200,
      min_beds: 2,
      exclude_hdfc: false,
      property_types: ["condo", "townhouse"],
      search_query: "bedford",
    };
    const ui = {
      selectedId: 42,
      activeList: "__favorites__",
      selectedBoroughs: ["Brooklyn", "Manhattan"],
      selectedNeighborhoods: ["Williamsburg", "East Village"],
      tab: "analytics" as const,
    };

    const qs = buildUrlSearch(customKnobs, DEFAULT_KNOBS, ui);
    expect(qs).toContain("max_mo=6200");
    expect(qs).toContain("beds=2");
    expect(qs).toContain("hdfc=0");
    expect(qs).toContain("types=condo%2Ctownhouse");
    expect(qs).toContain("listing=42");

    const parsedUi = parseUrlUiState(qs);
    expect(parsedUi).toEqual(ui);

    const parsedKnobs = applyUrlKnobs(DEFAULT_KNOBS, qs);
    expect(parsedKnobs).toEqual(customKnobs);
  });
});
