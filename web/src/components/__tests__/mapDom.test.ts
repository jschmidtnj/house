import { describe, expect, it } from "vitest";
import {
  createClusterPinElement,
  createListingPinElement,
  createListingTooltipElement,
  createSubwayPopupElement,
} from "../mapDom";
import { makeListing, makeTwoUnitTownhouse } from "../../test/fixtures";

describe("mapDom builders", () => {
  it("builds a single-unit price pin with score-based colors", () => {
    const item = makeListing({ score: 74.5 });
    const el = createListingPinElement(item, false);
    expect(el.className).toBe("map-price-pin");
    expect(el.textContent).toBe("$7.7k");
  });

  it("prefixes multi-unit pins with 2U and uses net monthly cost", () => {
    const multi = makeTwoUnitTownhouse();
    const el = createListingPinElement(multi, true);
    expect(el.className).toContain("map-price-pin-selected");
    expect(el.textContent).toBe("2U $6.2k");
  });

  it("builds compact cluster bubbles when zoomed out and full pills at mid-zoom", () => {
    const bubble = createClusterPinElement(14, 4800, "#2dd4bf", true);
    expect(bubble.className).toBe("map-cluster-bubble");
    expect(bubble.textContent).toBe("14");

    const pill = createClusterPinElement(14, 4800, "#2dd4bf", false);
    expect(pill.className).toBe("map-cluster-pill");
    expect(pill.textContent).toContain("14");
    expect(pill.textContent).toContain("$4.8k+");
  });

  it("escapes untrusted address text safely via textContent (no raw HTML injection)", () => {
    const xss = makeListing({
      listing: {
        ...makeListing().listing,
        address: "<img src=x onerror=alert(1)>",
      },
    });
    const el = createListingTooltipElement(xss);
    expect(el.querySelector("img")).toBeNull();
    expect(el.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("renders MTA & PATH route badges in subway popups", () => {
    const el = createSubwayPopupElement("Grove St", ["PATH", "L"]);
    expect(el.textContent).toContain("Grove St");
    const badges = el.querySelectorAll(".map-mta-badge");
    expect(badges).toHaveLength(2);
    expect(badges[0].className).toContain("map-mta-badge-wide");
    expect(badges[0].textContent).toBe("PATH");
  });
});
