"""Offline FastAPI endpoint tests for house web backend."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from house.db import Database
from house.sources.synthetic import SyntheticNYCSource
from house.web.api import create_app


def test_web_api_config_rank_and_detail(tmp_path: Path):
    db_path = tmp_path / "house.db"
    cfg_path = tmp_path / "config.yaml"
    cfg_path.write_text(
        f"database:\n  path: {db_path}\n"
        f"budget:\n  annual_income: 300000\n  max_price: 2000000\n  max_monthly_cost: 9000\n",
        encoding="utf-8",
    )

    with Database(db_path) as db:
        db.upsert_listings(SyntheticNYCSource().fetch())

    client = TestClient(create_app(cfg_path))

    r_cfg = client.get("/api/config")
    assert r_cfg.status_code == 200
    cfg_data = r_cfg.json()
    assert cfg_data["budget"]["annual_income"] == 300000
    assert cfg_data["status"]["listings_active"] == 10

    r_rank = client.post("/api/rank", json={"max_monthly_cost": 8000, "down_payment_pct": 20})
    assert r_rank.status_code == 200
    rank_data = r_rank.json()
    assert rank_data["summary"]["matching_count"] >= 1
    first_id = rank_data["listings"][0]["id"]

    r_detail = client.get(f"/api/listings/{first_id}")
    assert r_detail.status_code == 200
    assert r_detail.json()["costs"]["total_monthly_cost"] <= 8000
