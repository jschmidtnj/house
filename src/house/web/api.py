"""FastAPI backend serving ranked NYC listings, interactive knob recalculation, and static UI."""

from __future__ import annotations

import copy
import json
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from house.config import AppConfig, load_config
from house.db import Database
from house.finance import calculate_buy_vs_rent, calculate_cost_breakdown
from house.models import ScoredListing
from house.scoring import rank_listings
from house.sources import poll_all_sources


class CreateListRequest(BaseModel):
    name: str


class RankRequest(BaseModel):
    """Live knob overrides from the Web UI."""

    annual_income: float | None = None
    max_monthly_cost: float | None = None
    max_price: float | None = None
    down_payment_pct: float | None = None
    max_cash_down: float | None = None
    interest_rate_pct: float | None = None
    loan_term_years: int | None = None
    use_after_tax_for_filter: bool | None = None
    est_rent_per_unit: float | None = None
    rental_net_factor: float | None = None
    use_net_rental_for_filter: bool | None = None
    current_monthly_rent: float | None = None
    hold_years: int | None = None
    home_appreciation_pct: float | None = None
    rent_growth_pct: float | None = None
    investment_return_pct: float | None = None
    min_beds: float | None = None
    min_baths: float | None = None
    min_sqft: int | None = None
    min_units: int | None = None
    max_units: int | None = None
    max_commute_minutes: int | None = None
    nj_max_walk_to_path_min: int | None = None
    property_types: list[str] | None = None
    boroughs: list[str] | None = None
    neighborhoods: list[str] | None = None
    exclude_hdfc: bool | None = None
    exclude_land_lease: bool | None = None
    show_rejected: bool = False
    search_query: str = ""


def _serialize_scored(item: ScoredListing, budget: Any = None) -> dict[str, Any]:
    l = item.listing
    c = item.costs
    ppsf = round(l.price / l.sqft, 0) if l.sqft and l.sqft > 0 else None
    bvr = asdict(calculate_buy_vs_rent(l, c, budget)) if budget is not None else None
    return {
        "id": item.listing_id,
        "canonical_key": item.canonical_key,
        "score": item.score,
        "passes_filters": item.passes_filters,
        "rejection_reasons": item.rejection_reasons,
        "score_components": item.score_components,
        "price_drop_pct": item.price_drop_pct,
        "initial_price": item.initial_price,
        "sources": item.sources,
        "price_per_sqft": ppsf,
        "commute_minutes": item.commute_minutes,
        "commute_mode": item.commute_mode,
        "nearest_station": item.nearest_station,
        "nearest_routes": item.nearest_routes,
        "walk_to_station_min": item.walk_to_station_min,
        "buy_vs_rent": bvr,
        "listing": {
            "address": l.address,
            "unit": l.unit,
            "borough": l.borough,
            "neighborhood": l.neighborhood,
            "zip_code": l.zip_code,
            "property_type": l.property_type,
            "num_units": l.num_units,
            "price": l.price,
            "beds": l.beds,
            "baths": l.baths,
            "sqft": l.sqft,
            "monthly_hoa": l.monthly_hoa,
            "monthly_maintenance": l.monthly_maintenance,
            "monthly_tax": l.monthly_tax,
            "status": l.status,
            "days_on_market": l.days_on_market,
            "url": l.url,
            "latitude": l.latitude,
            "longitude": l.longitude,
            "photo_url": l.photo_url,
            "amenities": l.amenities,
            "description": l.description,
        },
        "costs": asdict(c),
    }


def _apply_rank_request(base_cfg: AppConfig, req: RankRequest) -> AppConfig:
    cfg = copy.deepcopy(base_cfg)
    if req.annual_income is not None:
        cfg.budget.annual_income = req.annual_income
    if req.max_monthly_cost is not None:
        cfg.budget.max_monthly_cost = req.max_monthly_cost
    if req.max_price is not None:
        cfg.budget.max_price = req.max_price
    if req.down_payment_pct is not None:
        cfg.budget.down_payment_pct = req.down_payment_pct
    if req.max_cash_down is not None:
        cfg.budget.max_cash_down = req.max_cash_down if req.max_cash_down > 0 else None
    if req.interest_rate_pct is not None:
        cfg.budget.interest_rate_pct = req.interest_rate_pct
    if req.loan_term_years is not None:
        cfg.budget.loan_term_years = req.loan_term_years
    if req.use_after_tax_for_filter is not None:
        cfg.budget.use_after_tax_for_filter = req.use_after_tax_for_filter
    if req.est_rent_per_unit is not None:
        cfg.budget.est_rent_per_unit = req.est_rent_per_unit
    if req.rental_net_factor is not None:
        cfg.budget.rental_net_factor = req.rental_net_factor
    if req.use_net_rental_for_filter is not None:
        cfg.budget.use_net_rental_for_filter = req.use_net_rental_for_filter
    if req.current_monthly_rent is not None:
        cfg.budget.current_monthly_rent = req.current_monthly_rent
    if req.hold_years is not None:
        cfg.budget.hold_years = req.hold_years
    if req.home_appreciation_pct is not None:
        cfg.budget.home_appreciation_pct = req.home_appreciation_pct
    if req.rent_growth_pct is not None:
        cfg.budget.rent_growth_pct = req.rent_growth_pct
    if req.investment_return_pct is not None:
        cfg.budget.investment_return_pct = req.investment_return_pct

    if req.min_beds is not None:
        cfg.search.min_beds = req.min_beds
    if req.min_baths is not None:
        cfg.search.min_baths = req.min_baths
    if req.min_sqft is not None:
        cfg.search.min_sqft = req.min_sqft
    if req.min_units is not None:
        cfg.search.min_units = req.min_units
    if req.max_units is not None:
        cfg.search.max_units = req.max_units
    if req.max_commute_minutes is not None:
        cfg.search.max_commute_minutes = req.max_commute_minutes if req.max_commute_minutes > 0 else None
    if req.nj_max_walk_to_path_min is not None:
        cfg.search.nj_max_walk_to_path_min = req.nj_max_walk_to_path_min if req.nj_max_walk_to_path_min > 0 else None
    if req.property_types is not None:
        cfg.search.property_types = req.property_types
    if req.boroughs is not None:
        cfg.search.boroughs = req.boroughs
    if req.neighborhoods is not None:
        cfg.search.neighborhoods = req.neighborhoods
    if req.exclude_hdfc is not None:
        cfg.search.exclude_hdfc = req.exclude_hdfc
    if req.exclude_land_lease is not None:
        cfg.search.exclude_land_lease = req.exclude_land_lease
    return cfg


def create_app(config_path: str | Path = "config/default.yaml") -> FastAPI:
    app = FastAPI(title="House NYC Apartment Optimizer API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    cfg_path = Path(config_path)

    @app.get("/api/config")
    def get_config() -> dict[str, Any]:
        cfg = load_config(cfg_path)
        with Database(cfg.database_path) as db:
            counts = db.status_counts()
            last_poll = db.get_bot_state("last_poll_at")
            last_run = db.get_bot_state("last_run_at")
        return {
            "budget": asdict(cfg.budget),
            "search": asdict(cfg.search),
            "status": {
                **counts,
                "last_poll_at": last_poll,
                "last_run_at": last_run,
            },
        }

    @app.post("/api/rank")
    def post_rank(req: RankRequest) -> dict[str, Any]:
        base_cfg = load_config(cfg_path)
        cfg = _apply_rank_request(base_cfg, req)
        with Database(cfg.database_path) as db:
            rows = db.get_listings(status="active")

        scored = rank_listings(rows, cfg.budget, cfg.search, include_rejected=req.show_rejected)
        q = (req.search_query or "").strip().lower()
        if q:
            scored = [
                s
                for s in scored
                if q in s.listing.address.lower()
                or q in s.listing.neighborhood.lower()
                or q in s.listing.borough.lower()
                or q in s.listing.zip_code.lower()
                or q in s.listing.description.lower()
            ]

        matching = [s for s in scored if s.passes_filters]
        avg_monthly = (
            round(sum(s.costs.total_monthly_cost for s in matching) / len(matching), 0)
            if matching
            else 0.0
        )
        avg_price = (
            round(sum(s.listing.price for s in matching) / len(matching), 0)
            if matching
            else 0.0
        )
        with_coords = sum(1 for s in scored if s.listing.latitude and s.listing.longitude)

        return {
            "summary": {
                "total_active": len(rows),
                "total_returned": len(scored),
                "matching_count": len(matching),
                "with_coordinates": with_coords,
                "avg_monthly_cost": avg_monthly,
                "avg_price": avg_price,
            },
            "listings": [_serialize_scored(s, cfg.budget) for s in scored],
        }

    @app.get("/api/listings/{listing_id}")
    def get_listing_detail(listing_id: int) -> dict[str, Any]:
        cfg = load_config(cfg_path)
        with Database(cfg.database_path) as db:
            row = db.get_listing(listing_id)
            if row is None:
                raise HTTPException(status_code=404, detail="Listing not found")
            history = db.get_price_history(listing_id)

        item = Database.to_listing_data(row)
        scored = rank_listings([row], cfg.budget, cfg.search, include_rejected=True)[0]
        return {
            **_serialize_scored(scored, cfg.budget),
            "price_history": [
                {
                    "recorded_at": h.recorded_at,
                    "price": h.price,
                    "monthly_hoa": h.monthly_hoa,
                    "monthly_maintenance": h.monthly_maintenance,
                    "monthly_tax": h.monthly_tax,
                    "status": h.status,
                    "source": h.source,
                }
                for h in history
            ],
        }

    @app.get("/api/saved")
    def get_saved() -> dict[str, Any]:
        cfg = load_config(cfg_path)
        with Database(cfg.database_path) as db:
            raw = db.get_bot_state("saved_listing_ids")
        ids = sorted({int(x) for x in json.loads(raw or "[]") if str(x).isdigit()})
        return {"saved_ids": ids}

    @app.post("/api/saved/{listing_id}")
    def toggle_saved(listing_id: int) -> dict[str, Any]:
        cfg = load_config(cfg_path)
        with Database(cfg.database_path) as db:
            raw = db.get_bot_state("saved_listing_ids")
            ids = {int(x) for x in json.loads(raw or "[]") if str(x).isdigit()}
            if listing_id in ids:
                ids.remove(listing_id)
                saved = False
            else:
                ids.add(listing_id)
                saved = True
            sorted_ids = sorted(ids)
            db.set_bot_state("saved_listing_ids", json.dumps(sorted_ids))
        return {"listing_id": listing_id, "saved": saved, "saved_ids": sorted_ids}

    @app.get("/api/hidden")
    def get_hidden() -> dict[str, Any]:
        cfg = load_config(cfg_path)
        with Database(cfg.database_path) as db:
            raw = db.get_bot_state("hidden_listing_ids")
        ids = sorted({int(x) for x in json.loads(raw or "[]") if str(x).isdigit()})
        return {"hidden_ids": ids}

    @app.post("/api/hidden/{listing_id}")
    def toggle_hidden(listing_id: int) -> dict[str, Any]:
        cfg = load_config(cfg_path)
        with Database(cfg.database_path) as db:
            raw = db.get_bot_state("hidden_listing_ids")
            ids = {int(x) for x in json.loads(raw or "[]") if str(x).isdigit()}
            if listing_id in ids:
                ids.remove(listing_id)
                hidden = False
            else:
                ids.add(listing_id)
                hidden = True
            sorted_ids = sorted(ids)
            db.set_bot_state("hidden_listing_ids", json.dumps(sorted_ids))
        return {"listing_id": listing_id, "hidden": hidden, "hidden_ids": sorted_ids}

    def _load_custom_lists(db: Database) -> dict[str, list[int]]:
        raw = db.get_bot_state("custom_lists")
        data = json.loads(raw or "{}")
        if not isinstance(data, dict):
            return {}
        out: dict[str, list[int]] = {}
        for k, v in data.items():
            name = str(k).strip()
            if name and isinstance(v, list):
                out[name] = sorted({int(x) for x in v if str(x).isdigit()})
        return out

    @app.get("/api/lists")
    def get_lists() -> dict[str, Any]:
        cfg = load_config(cfg_path)
        with Database(cfg.database_path) as db:
            lists = _load_custom_lists(db)
        return {"lists": lists}

    @app.post("/api/lists")
    def create_list(req: CreateListRequest) -> dict[str, Any]:
        name = req.name.strip()[:48]
        if not name:
            raise HTTPException(status_code=400, detail="List name cannot be empty")
        cfg = load_config(cfg_path)
        with Database(cfg.database_path) as db:
            lists = _load_custom_lists(db)
            lists.setdefault(name, [])
            db.set_bot_state("custom_lists", json.dumps(lists))
        return {"name": name, "lists": lists}

    @app.delete("/api/lists/{list_name}")
    def delete_list(list_name: str) -> dict[str, Any]:
        cfg = load_config(cfg_path)
        with Database(cfg.database_path) as db:
            lists = _load_custom_lists(db)
            lists.pop(list_name, None)
            db.set_bot_state("custom_lists", json.dumps(lists))
        return {"lists": lists}

    @app.post("/api/lists/{list_name}/toggle/{listing_id}")
    def toggle_list_item(list_name: str, listing_id: int) -> dict[str, Any]:
        name = list_name.strip()[:48]
        if not name:
            raise HTTPException(status_code=400, detail="Invalid list name")
        cfg = load_config(cfg_path)
        with Database(cfg.database_path) as db:
            lists = _load_custom_lists(db)
            cur = set(lists.get(name, []))
            if listing_id in cur:
                cur.remove(listing_id)
                in_list = False
            else:
                cur.add(listing_id)
                in_list = True
            lists[name] = sorted(cur)
            db.set_bot_state("custom_lists", json.dumps(lists))
        return {"name": name, "listing_id": listing_id, "in_list": in_list, "lists": lists}

    @app.post("/api/poll")
    def post_poll(synthetic: bool = False) -> dict[str, Any]:
        cfg = load_config(cfg_path)
        items, by_source = poll_all_sources(cfg, synthetic=synthetic)
        with Database(cfg.database_path) as db:
            summary = db.upsert_listings(items)
            db.set_bot_state("last_poll_at", datetime.now(timezone.utc).isoformat())
        return {"sources": by_source, "upsert": summary}

    # Serve built Vite SPA if web/dist exists
    dist_dir = Path("web/dist")
    if dist_dir.exists():
        assets_dir = dist_dir / "assets"
        if assets_dir.exists():
            app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

        @app.get("/{full_path:path}")
        def serve_spa(full_path: str) -> FileResponse:
            candidate = dist_dir / full_path
            if full_path and candidate.is_file():
                return FileResponse(str(candidate))
            return FileResponse(
                str(dist_dir / "index.html"),
                headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
            )

    return app
