import type { ListingItem } from "../types";

const WORD_ORDINALS: Record<string, string> = {
  first: "1st",
  second: "2nd",
  third: "3rd",
  fourth: "4th",
  fifth: "5th",
  sixth: "6th",
  seventh: "7th",
  eighth: "8th",
  ninth: "9th",
  tenth: "10th",
  eleventh: "11th",
  twelfth: "12th",
};

export function cleanStreetEasyUnit(unit: string): string {
  return unit
    .trim()
    .replace(/^(?:apt\.?|apartment|unit|suite|ste\.?|no\.?|#)+\s*/i, "")
    .replace(/^#+\s*/, "")
    .replace(/\s+/g, "")
    .trim();
}

export function cleanStreetEasyAddress(address: string): string {
  let out = address
    .trim()
    // Remove "Aka ..." aliases that Realtor.com occasionally injects
    .replace(/\baka\s+\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  // Normalize spelled-out NYC avenues ("1834 Second Ave" -> "1834 2nd Ave")
  out = out.replace(
    /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\b(?=\s+(?:ave|avenue|st|street|pl|place)\b)/gi,
    (m) => WORD_ORDINALS[m.toLowerCase()] || m
  );

  return out;
}

export function buildStreetEasyUrl(listing: Pick<ListingItem, "address" | "unit" | "borough" | "zip_code">): string {
  const addr = cleanStreetEasyAddress(listing.address || "");
  const unit = cleanStreetEasyUnit(listing.unit || "");
  const isNj =
    listing.borough?.toLowerCase() === "jersey city" ||
    listing.borough?.toLowerCase() === "hoboken" ||
    (listing.zip_code || "").startsWith("07");

  const parts = ["site:streeteasy.com", addr];
  if (unit) parts.push(unit);
  if (isNj && listing.borough) parts.push(listing.borough);

  const query = parts.filter(Boolean).join(" ").trim();
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}
