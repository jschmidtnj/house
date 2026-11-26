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


    # Test save / unsave persistence
    r_save = client.post(f"/api/saved/{first_id}")
    assert r_save.status_code == 200
    assert r_save.json()["saved"] is True
    assert first_id in client.get("/api/saved").json()["saved_ids"]

    r_unsave = client.post(f"/api/saved/{first_id}")
    assert r_unsave.json()["saved"] is False
    assert first_id not in client.get("/api/saved").json()["saved_ids"]

    # Test hide / unhide persistence
    r_hide = client.post(f"/api/hidden/{first_id}")
    assert r_hide.status_code == 200
    assert r_hide.json()["hidden"] is True
    assert first_id in client.get("/api/hidden").json()["hidden_ids"]

    r_unhide = client.post(f"/api/hidden/{first_id}")
    assert r_unhide.json()["hidden"] is False
    assert first_id not in client.get("/api/hidden").json()["hidden_ids"]


    # Test custom lists CRUD + toggle membership
    r_create = client.post("/api/lists", json={"name": "Tour Weekend"})
    assert r_create.status_code == 200
    assert "Tour Weekend" in r_create.json()["lists"]

    r_add = client.post(f"/api/lists/Tour%20Weekend/toggle/{first_id}")
    assert r_add.status_code == 200
    assert r_add.json()["in_list"] is True
    assert first_id in client.get("/api/lists").json()["lists"]["Tour Weekend"]

    r_del = client.delete("/api/lists/Tour%20Weekend")
    assert r_del.status_code == 200
    assert "Tour Weekend" not in r_del.json()["lists"]
