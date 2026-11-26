"""End-to-end offline CLI smoke tests."""

from __future__ import annotations

from pathlib import Path

from house.cli import main


def test_cli_end_to_end_synthetic(tmp_path: Path, capsys):
    cfg_path = tmp_path / "test.yaml"
    db_path = tmp_path / "house.db"
    cfg_path.write_text(
        f"database:\n  path: {db_path}\n"
        f"budget:\n  max_price: 2000000\n  max_monthly_cost: 9000\n",
        encoding="utf-8",
    )

    assert main(["--config", str(cfg_path), "poll", "--synthetic"]) == 0
    assert main(["--config", str(cfg_path), "rank", "--max-monthly", "8500", "--rate", "6.25"]) == 0
    out = capsys.readouterr().out
    assert "Max Monthly: $8,500/mo" in out
    assert "matching current knobs" in out

    assert main(["--config", str(cfg_path), "show", "1"]) == 0
    show_out = capsys.readouterr().out
    assert "TOTAL MONTHLY:" in show_out

    assert main(["--config", str(cfg_path), "run", "--synthetic", "--no-notify", "--force"]) == 0
    assert main(["--config", str(cfg_path), "status"]) == 0
    status_out = capsys.readouterr().out
    assert '"listings_active": 10' in status_out
