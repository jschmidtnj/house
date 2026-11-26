"""Tests for listing adapters (synthetic, local JSON/CSV, RapidAPI, RentCast, email alerts)."""

from __future__ import annotations

import json
from pathlib import Path

from house.sources.email_alerts import parse_alert_email_text
from house.sources.homeharvest_source import parse_homeharvest_row
from house.sources.local_import import LocalImportSource
from house.sources.rapidapi_streeteasy import parse_streeteasy_item
from house.sources.rentcast import parse_rentcast_item
from house.sources.synthetic import SyntheticNYCSource


def test_synthetic_source_returns_realistic_nyc_mix():
    items = SyntheticNYCSource().fetch()
    assert len(items) >= 8
    types = {i.property_type for i in items}
    assert {"condo", "coop"}.issubset(types)


def test_local_import_json_and_csv(tmp_path: Path):
    json_path = tmp_path / "streeteasy.json"
    json_path.write_text(
        json.dumps(
            [
                {
                    "address": "123 Atlantic Ave",
                    "unit": "4A",
                    "borough": "Brooklyn",
                    "neighborhood": "Cobble Hill",
                    "property_type": "Condo",
                    "price": "$1,350,000",
                    "beds": 2,
                    "baths": 2,
                    "sqft": 1000,
                    "common_charges": "$850",
                    "monthly_tax": "$720",
                    "amenities": ["Elevator", "In-Unit Laundry"],
                }
            ]
        ),
        encoding="utf-8",
    )
    csv_path = tmp_path / "redfin.csv"
    csv_path.write_text(
        "address,unit,borough,property_type,price,beds,baths,sqft,maintenance\n"
        "55 Pineapple St,2C,Brooklyn,Co-op,995000,1,1,780,1450\n",
        encoding="utf-8",
    )

    items = LocalImportSource(tmp_path).fetch()
    assert len(items) == 2
    by_addr = {i.address: i for i in items}
    assert by_addr["123 Atlantic Ave"].monthly_hoa == 850.0
    assert "laundry_in_unit" in by_addr["123 Atlantic Ave"].amenities
    assert by_addr["55 Pineapple St"].property_type == "coop"
    assert by_addr["55 Pineapple St"].monthly_maintenance == 1450.0


def test_rapidapi_and_rentcast_parsers():
    se_raw = {
        "id": "12345",
        "address": "200 West 79th Street",
        "unit": "5B",
        "borough": "Manhattan",
        "areaName": "Upper West Side",
        "propertyType": "coop",
        "price": 1250000,
        "bedrooms": 2,
        "bathrooms": 1,
        "sqft": 950,
        "monthlyHoa": 2100,
        "url": "/building/200-west-79-street/5b",
    }
    se = parse_streeteasy_item(se_raw)
    assert se is not None
    assert se.monthly_maintenance == 2100.0
    assert se.monthly_hoa is None
    assert se.url.startswith("https://streeteasy.com/")

    rc_raw = {
        "id": "rc-1",
        "addressLine1": "150 Joralemon St",
        "addressLine2": "3D",
        "county": "Kings",
        "propertyType": "Condo",
        "price": 1400000,
        "bedrooms": 2,
        "bathrooms": 2,
        "squareFootage": 1050,
        "hoa": {"fee": 900},
        "propertyTaxes": {"2025": {"total": 9600}},
    }
    rc = parse_rentcast_item(rc_raw)
    assert rc is not None
    assert rc.borough == "Brooklyn"
    assert rc.monthly_tax == 800.0


def test_email_alert_parser():
    subject = "New Listing on StreetEasy: 245 West 75th Street #6B - $1,295,000"
    body = (
        "<html><body>2 bed, 1.5 bath, 1,050 sq ft Co-op. Maintenance: $2,180/mo. "
        "Elevator, doorman. View at https://streeteasy.com/building/245-west-75-street/6b</body></html>"
    )
    parsed = parse_alert_email_text(subject, body, sender="alerts@streeteasy.com")
    assert len(parsed) == 1
    item = parsed[0]
    assert item.source == "email_streeteasy"
    assert item.price == 1_295_000.0
    assert item.unit == "6B"
    assert item.monthly_maintenance == 2_180.0
    assert "doorman" in item.amenities


def test_homeharvest_row_parser_condo_and_coop():
    condo_row = {
        "property_id": "hh-1",
        "street": "380 4th St",
        "unit": "3A",
        "city": "Brooklyn",
        "county": "Kings",
        "zip_code": "11215",
        "neighborhoods": "Park Slope, South Brooklyn",
        "style": "CONDOS",
        "list_price": 1425000,
        "beds": 2,
        "full_baths": 2,
        "half_baths": 0,
        "sqft": 1120,
        "hoa_fee": 790,
        "tax": 9840,
        "days_on_mls": 12,
        "property_url": "https://www.realtor.com/realestateandhomes-detail/380-4th-St",
        "text": "Bright Park Slope condo with elevator and in-unit laundry.",
    }
    condo = parse_homeharvest_row(condo_row)
    assert condo is not None
    assert condo.source == "homeharvest"
    assert condo.borough == "Brooklyn"
    assert condo.neighborhood == "Park Slope"
    assert condo.property_type == "condo"
    assert condo.monthly_hoa == 790.0
    assert condo.monthly_tax == 820.0
    assert "laundry_in_unit" in condo.amenities

    coop_row = {
        "property_id": "hh-2",
        "street": "245 W 75th St",
        "unit": "6B",
        "city": "New York",
        "county": "New York",
        "zip_code": "10023",
        "neighborhoods": "Upper West Side",
        "style": "CONDOS",
        "list_price": 1295000,
        "beds": 2,
        "full_baths": 1,
        "half_baths": 1,
        "sqft": 1050,
        "hoa_fee": 2180,
        "tax": 9000,
        "text": "Pre-war co-op with low maintenance and board approval required.",
    }
    coop = parse_homeharvest_row(coop_row)
    assert coop is not None
    assert coop.borough == "Manhattan"
    assert coop.property_type == "coop"
    assert coop.baths == 1.5
    assert coop.monthly_maintenance == 2180.0
    assert coop.monthly_hoa is None
    assert coop.monthly_tax is None


def test_homeharvest_baths_and_tax_fallbacks():
    row_missing_baths = {
        "property_id": "hh-bath-0",
        "street": "180 Park Row",
        "unit": "24A",
        "city": "New York",
        "county": "New York",
        "zip_code": "10038",
        "style": "CONDOS",
        "list_price": 975000,
        "beds": 1,
        "full_baths": 0,
        "half_baths": 0,
        "hoa_fee": 2334,
        "text": "Spacious Chatham Towers co-op with balcony.",
    }
    parsed = parse_homeharvest_row(row_missing_baths)
    assert parsed is not None
    assert parsed.baths == 1.0

    row_whole_building_tax = {
        "property_id": "hh-tax-bad",
        "street": "215 Calyer St",
        "unit": "3B",
        "city": "Brooklyn",
        "county": "Kings",
        "zip_code": "11222",
        "style": "CONDOS",
        "list_price": 1_000_000,
        "beds": 2,
        "full_baths": None,
        "hoa_fee": 750,
        "tax": 60_000,  # 6%/yr -> whole building tax error
        "text": "Bright condo with 2 bathrooms and roof deck.",
    }
    parsed2 = parse_homeharvest_row(row_whole_building_tax)
    assert parsed2 is not None
    assert parsed2.baths == 2.0
    assert parsed2.monthly_tax is None
