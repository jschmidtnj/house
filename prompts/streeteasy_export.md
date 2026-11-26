# StreetEasy / Redfin Search Export Prompt (Zero-Cost Ingestion)

Open your filtered StreetEasy (or Redfin / Compass) search results page in Chrome and paste this prompt into Gemini in Chrome. Save the output as `data/imports/streeteasy_YYYY-MM-DD.json`, then run `house poll` or `house run`.

```text
Extract all visible for-sale apartment listings on this page as a valid JSON array.
Use these exact keys for each listing (omit or use null if not visible on the page):
- source: "streeteasy" (or "redfin" / "compass")
- address: street address without unit (e.g. "245 West 75th Street")
- unit: unit/apt number (e.g. "6B")
- borough: "Manhattan", "Brooklyn", "Queens", etc.
- neighborhood: neighborhood name (e.g. "Upper West Side")
- property_type: "condo", "coop", "condop", or "townhouse"
- price: numeric asking price in USD (e.g. 1295000)
- beds: number (e.g. 2)
- baths: number (e.g. 1.5)
- sqft: integer or null
- monthly_hoa: numeric condo common charges (null for co-ops)
- monthly_maintenance: numeric co-op maintenance (null for condos)
- monthly_tax: numeric monthly property tax (null for co-ops)
- url: full listing URL
- amenities: array of strings (e.g. ["elevator", "doorman", "laundry_in_unit", "dishwasher", "outdoor_space"])

Return ONLY raw JSON with no markdown commentary.
```
