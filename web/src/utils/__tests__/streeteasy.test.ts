import { describe, expect, it } from "vitest";
import { buildStreetEasyUrl, cleanStreetEasyAddress, cleanStreetEasyUnit } from "../streeteasy";

describe("streeteasy URL builder", () => {
  it("strips Apt/Unit/# prefixes from unit numbers", () => {
    expect(cleanStreetEasyUnit("Apt 310")).toBe("310");
    expect(cleanStreetEasyUnit("Unit 711")).toBe("711");
    expect(cleanStreetEasyUnit("# 1D")).toBe("1D");
    expect(cleanStreetEasyUnit("Apt. PH-2A")).toBe("PH-2A");
  });

  it("normalizes spelled-out avenues and strips Aka aliases", () => {
    expect(cleanStreetEasyAddress("1834 Second Ave")).toBe("1834 2nd Ave");
    expect(cleanStreetEasyAddress("200 Central Aka A2 Ave")).toBe("200 Central Ave");
  });

  it("builds a Google site:streeteasy.com search for NYC and NJ listings", () => {
    const nyc = buildStreetEasyUrl({
      address: "304 W 89th St",
      unit: "# 1D",
      borough: "Manhattan",
      zip_code: "10024",
    });
    expect(decodeURIComponent(nyc)).toBe(
      "https://www.google.com/search?q=site:streeteasy.com 304 W 89th St 1D"
    );

    const nj = buildStreetEasyUrl({
      address: "270 Harrison Ave",
      unit: "Apt 310",
      borough: "Jersey City",
      zip_code: "07304",
    });
    expect(decodeURIComponent(nj)).toBe(
      "https://www.google.com/search?q=site:streeteasy.com 270 Harrison Ave 310 Jersey City"
    );
  });
});
