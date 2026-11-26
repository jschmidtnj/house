"""Command-line interface for house (poll, rank, show, run, import-file, status, test-discord)."""

from __future__ import annotations

import argparse
import contextlib
import copy
import fcntl
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

from house.config import AppConfig, load_config
from house.db import Database
from house.finance import calculate_cost_breakdown
from house.notify.discord import DiscordNotifier
from house.scoring import rank_listings
from house.sources import poll_all_sources
from house.sources.local_import import load_file


def _apply_knob_overrides(config: AppConfig, args: argparse.Namespace) -> AppConfig:
    """Return a copy of config with any ad-hoc CLI budget/search knob overrides applied."""
    cfg = copy.deepcopy(config)
    if getattr(args, "max_monthly", None) is not None:
        cfg.budget.max_monthly_cost = float(args.max_monthly)
    if getattr(args, "max_price", None) is not None:
        cfg.budget.max_price = float(args.max_price)
    if getattr(args, "rate", None) is not None:
        cfg.budget.interest_rate_pct = float(args.rate)
    if getattr(args, "down", None) is not None:
        cfg.budget.down_payment_pct = float(args.down)
    if getattr(args, "max_cash", None) is not None:
        cfg.budget.max_cash_down = float(args.max_cash)
    if getattr(args, "term", None) is not None:
        cfg.budget.loan_term_years = int(args.term)
    if getattr(args, "after_tax", False):
        cfg.budget.use_after_tax_for_filter = True
    if getattr(args, "min_beds", None) is not None:
        cfg.search.min_beds = float(args.min_beds)
    if getattr(args, "min_sqft", None) is not None:
        cfg.search.min_sqft = int(args.min_sqft)
    if getattr(args, "property_type", None):
        cfg.search.property_types = [t.strip().lower() for t in args.property_type.split(",") if t.strip()]
    if getattr(args, "borough", None):
        cfg.search.boroughs = [b.strip() for b in args.borough.split(",") if b.strip()]
    return cfg


def _print_ranked_table(scored: list, cfg: AppConfig, top: int = 20) -> None:
    b = cfg.budget
    mode = "after-tax" if b.use_after_tax_for_filter else "gross"
    print(
        f"Knobs | Max Monthly: ${b.max_monthly_cost:,.0f}/mo ({mode}) | "
        f"Max Price: ${b.max_price:,.0f} | Down: {b.down_payment_pct:.0f}% | "
        f"Rate: {b.interest_rate_pct:.2f}% ({b.loan_term_years}y)"
    )
    print("-" * 116)
    print(
        f"{'ID':>3} {'SCORE':>5} {'FIT':>3} {'MONTHLY':>9} {'PRICE':>11} "
        f"{'TYPE':<6} {'BD/BA':<6} {'SQFT':>5} {'FEES+TAX':>9} {'NEIGHBORHOOD':<18} {'ADDRESS'}"
    )
    print("-" * 116)
    shown = scored[:top]
    for s in shown:
        l = s.listing
        c = s.costs
        fit = "YES" if s.passes_filters else " NO"
        bd_ba = f"{l.beds:g}/{l.baths:g}"
        sqft_str = f"{l.sqft}" if l.sqft else "-"
        fees_tax = c.monthly_hoa_or_maint + c.monthly_tax
        unit_str = f" #{l.unit}" if l.unit else ""
        hood = (l.neighborhood or l.borough or "NYC")[:18]
        addr = f"{l.address}{unit_str}"
        drop_tag = f" (-{s.price_drop_pct:.1f}%)" if s.price_drop_pct >= 1.0 else ""
        print(
            f"{s.listing_id:>3} {s.score:>5.1f} {fit:>3} ${c.total_monthly_cost:>8,.0f} "
            f"${l.price:>10,.0f} {l.property_type:<6} {bd_ba:<6} {sqft_str:>5} "
            f"${fees_tax:>8,.0f} {hood:<18} {addr}{drop_tag}"
        )
        if not s.passes_filters and s.rejection_reasons:
            print(f"      -> Rejected: {'; '.join(s.rejection_reasons)}")

    passing_count = sum(1 for s in scored if s.passes_filters)
    print("-" * 116)
    print(f"Showing {len(shown)} of {len(scored)} listings ({passing_count} matching current knobs).")


@contextlib.contextmanager
def _run_lock(lock_path: Path) -> Iterator[bool]:
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    fh = lock_path.open("w")
    try:
        fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        fh.close()
        yield False
        return
    try:
        yield True
    finally:
        fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
        fh.close()


def _minutes_since(iso_ts: str | None) -> float | None:
    if not iso_ts:
        return None
    try:
        dt = datetime.fromisoformat(iso_ts)
        return (datetime.now(timezone.utc) - dt).total_seconds() / 60.0
    except ValueError:
        return None


def cmd_poll(config: AppConfig, args: argparse.Namespace) -> int:
    items, by_source = poll_all_sources(config, synthetic=args.synthetic)
    with Database(config.database_path) as db:
        summary = db.upsert_listings(items)
        db.set_bot_state("last_poll_at", datetime.now(timezone.utc).isoformat())
    print("Sources polled:", json.dumps(by_source, indent=2))
    print("Database upsert:", json.dumps(summary, indent=2))
    return 0


def cmd_rank(config: AppConfig, args: argparse.Namespace) -> int:
    cfg = _apply_knob_overrides(config, args)
    with Database(cfg.database_path) as db:
        rows = db.get_listings(status="active")
    if not rows:
        print("No active listings in database. Run `house poll --synthetic` or `house poll` first.")
        return 0
    scored = rank_listings(rows, cfg.budget, cfg.search, include_rejected=args.show_rejected)
    _print_ranked_table(scored, cfg, top=args.top)
    return 0


def cmd_show(config: AppConfig, args: argparse.Namespace) -> int:
    cfg = _apply_knob_overrides(config, args)
    with Database(cfg.database_path) as db:
        row = db.get_listing(args.listing_id)
        if row is None:
            print(f"Listing ID {args.listing_id} not found.")
            return 1
        history = db.get_price_history(args.listing_id)

    item = Database.to_listing_data(row)
    c = calculate_cost_breakdown(item, cfg.budget)
    unit_str = f" #{item.unit}" if item.unit else ""
    print(f"\n[{row.id}] {item.address}{unit_str} — {item.neighborhood or item.borough or 'NYC'}")
    print(f"Type: {item.property_type.upper()} | {item.beds:g} bd / {item.baths:g} ba | {item.sqft or 'N/A'} sqft | Status: {item.status}")
    if item.url:
        print(f"URL:  {item.url}")
    print(f"Sources: {', '.join(json.loads(row.sources_json or '[]'))}")
    if item.amenities:
        print(f"Amenities: {', '.join(item.amenities)}")

    print("\n--- Monthly Cost Breakdown ---")
    print(f"  Asking Price:       ${c.purchase_price:>12,.0f}")
    print(f"  Down Payment:       ${c.down_payment_amount:>12,.0f} ({c.down_payment_pct:.1f}%)")
    print(f"  Loan Amount:        ${c.loan_amount:>12,.0f} @ {c.interest_rate_pct:.2f}% ({c.loan_term_years}y)")
    print(f"  Mortgage (P&I):     ${c.monthly_mortgage_pi:>12,.2f}/mo")
    fee_lbl = "Co-op Maintenance" if item.property_type == "coop" else "Common Charges"
    print(f"  {fee_lbl + ':':<20}${c.monthly_hoa_or_maint:>12,.2f}/mo")
    print(f"  Monthly Tax:        ${c.monthly_tax:>12,.2f}/mo")
    print(f"  Insurance (est.):   ${c.monthly_insurance:>12,.2f}/mo")
    print(f"  ------------------------------------")
    print(f"  TOTAL MONTHLY:      ${c.total_monthly_cost:>12,.2f}/mo  (Target max: ${cfg.budget.max_monthly_cost:,.0f}/mo)")
    print(f"  After-Tax (est.):   ${c.effective_after_tax_monthly:>12,.2f}/mo")
    print(f"  Fees Ratio:         {c.monthly_fees_ratio * 100:>11.1f}%")

    print("\n--- Upfront Cash Estimate (NYC) ---")
    print(f"  Closing Costs:      ${c.estimated_closing_costs:>12,.0f} (incl. Mansion Tax: ${c.mansion_tax:,.0f})")
    print(f"  Total Cash Needed:  ${c.estimated_cash_to_close:>12,.0f}")

    if c.warnings:
        print("\nWarnings:")
        for w in c.warnings:
            print(f"  - {w}")

    if history:
        print("\n--- Price History ---")
        for h in history:
            print(f"  {h.recorded_at[:19]} | ${h.price:,.0f} | {h.status} | {h.source}")
    print()
    return 0


def cmd_import_file(config: AppConfig, args: argparse.Namespace) -> int:
    path = Path(args.path)
    if not path.exists():
        print(f"File not found: {path}")
        return 1
    items = load_file(path)
    with Database(config.database_path) as db:
        summary = db.upsert_listings(items)
    print(f"Loaded {len(items)} listings from {path.name}: {json.dumps(summary)}")
    return 0


def cmd_run(config: AppConfig, args: argparse.Namespace) -> int:
    """Periodic all-in-one cycle: poll -> rank -> notify (with lock & cadence guardrails)."""
    cfg = _apply_knob_overrides(config, args)
    lock_path = Path(cfg.database_path).parent / ".house.lock"

    with _run_lock(lock_path) as acquired:
        if not acquired:
            print("Another `house run` process is already running; skipping.")
            return 0

        with Database(cfg.database_path) as db:
            if not args.force:
                mins_run = _minutes_since(db.get_bot_state("last_run_at"))
                if mins_run is not None and mins_run < cfg.scheduler.min_interval_minutes:
                    print(
                        f"Skipping `house run`: last run was {mins_run:.1f}m ago "
                        f"(min_interval={cfg.scheduler.min_interval_minutes}m). Use --force to override."
                    )
                    return 0

            mins_poll = _minutes_since(db.get_bot_state("last_poll_at"))
            should_poll = (
                args.force
                or args.synthetic
                or mins_poll is None
                or mins_poll >= cfg.scheduler.poll_interval_minutes
            )
            if should_poll:
                items, by_source = poll_all_sources(cfg, synthetic=args.synthetic)
                summary = db.upsert_listings(items)
                db.set_bot_state("last_poll_at", datetime.now(timezone.utc).isoformat())
                print("Polled:", json.dumps(by_source), "| Upsert:", json.dumps(summary))
            else:
                print(f"Reusing stored listings (last poll was {mins_poll:.0f}m ago).")

            rows = db.get_listings(status="active")
            scored = rank_listings(rows, cfg.budget, cfg.search, include_rejected=False)
            _print_ranked_table(scored, cfg, top=args.top)

            if not args.no_notify:
                notifier = DiscordNotifier(cfg, db)
                sent = notifier.notify_matches(scored)
                print(f"Discord alerts sent: {sent}")

            db.set_bot_state("last_run_at", datetime.now(timezone.utc).isoformat())
    return 0


def cmd_status(config: AppConfig, _args: argparse.Namespace) -> int:
    with Database(config.database_path) as db:
        counts = db.status_counts()
        last_poll = db.get_bot_state("last_poll_at") or "never"
        last_run = db.get_bot_state("last_run_at") or "never"
    print(f"Database: {config.database_path}")
    print(f"Last poll: {last_poll} | Last run: {last_run}")
    print(json.dumps(counts, indent=2))
    return 0


def cmd_test_discord(config: AppConfig, _args: argparse.Namespace) -> int:
    with Database(config.database_path) as db:
        notifier = DiscordNotifier(config, db)
        ok = notifier.send_embed(
            title="House Bot Test Alert",
            description="Your NYC apartment hunting bot Discord webhook is connected.",
            fields=[
                {"name": "Max Monthly Knob", "value": f"${config.budget.max_monthly_cost:,.0f}/mo", "inline": True},
                {"name": "Max Asking Price", "value": f"${config.budget.max_price:,.0f}", "inline": True},
            ],
        )
    print("Discord test sent!" if ok else "Discord webhook not configured (dry-run logged).")
    return 0


def cmd_web(_config: AppConfig, args: argparse.Namespace) -> int:
    try:
        import uvicorn
    except ImportError:
        print("Web dependencies not installed. Run: pip install -e '.[web]'")
        return 1
    from house.web.api import create_app

    app = create_app(args.config)
    print(f"Starting House Web UI at http://{args.host}:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")
    return 0


def _add_knob_args(p: argparse.ArgumentParser) -> None:
    p.add_argument("--max-monthly", type=float, help="Override max all-in monthly cost ($)")
    p.add_argument("--max-price", type=float, help="Override max asking price ($)")
    p.add_argument("--rate", type=float, help="Override mortgage interest rate (%)")
    p.add_argument("--down", type=float, help="Override down payment percentage (%)")
    p.add_argument("--max-cash", type=float, help="Override max cash down cap ($)")
    p.add_argument("--term", type=int, help="Override loan term in years (e.g. 30 or 15)")
    p.add_argument("--after-tax", action="store_true", help="Filter using estimated after-tax monthly cost")
    p.add_argument("--min-beds", type=float, help="Override minimum bedrooms")
    p.add_argument("--min-sqft", type=int, help="Override minimum square feet")
    p.add_argument("--type", dest="property_type", type=str, help="Comma-separated types (condo,coop,condop,townhouse)")
    p.add_argument("--borough", type=str, help="Comma-separated boroughs (Manhattan,Brooklyn,...)")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="house", description="NYC Apartment Hunting & Monthly-Cost Optimizer CLI")
    parser.add_argument("--config", default="config/default.yaml", help="Path to YAML config file")
    parser.add_argument("--verbose", action="store_true", help="Enable debug logging")

    sub = parser.add_subparsers(dest="command", required=True)

    p_poll = sub.add_parser("poll", help="Fetch and deduplicate listings from enabled sources")
    p_poll.add_argument("--synthetic", action="store_true", help="Load realistic synthetic NYC listings offline")
    p_poll.set_defaults(func=cmd_poll)

    p_rank = sub.add_parser("rank", help="Rank stored listings using budget knobs & search criteria")
    _add_knob_args(p_rank)
    p_rank.add_argument("--top", type=int, default=20, help="Number of results to display")
    p_rank.add_argument("--show-rejected", action="store_true", help="Include listings that failed filters")
    p_rank.set_defaults(func=cmd_rank)

    p_show = sub.add_parser("show", help="Show full monthly cost breakdown & price history for a listing ID")
    p_show.add_argument("listing_id", type=int, help="Database listing ID")
    _add_knob_args(p_show)
    p_show.set_defaults(func=cmd_show)

    p_imp = sub.add_parser("import-file", help="Import a single JSON or CSV listing export file")
    p_imp.add_argument("path", type=str, help="Path to .json or .csv file")
    p_imp.set_defaults(func=cmd_import_file)

    p_run = sub.add_parser("run", help="Periodic all-in-one cycle (poll -> rank -> Discord notify)")
    _add_knob_args(p_run)
    p_run.add_argument("--synthetic", action="store_true", help="Poll synthetic NYC listings offline")
    p_run.add_argument("--top", type=int, default=15, help="Number of top matches to print")
    p_run.add_argument("--no-notify", action="store_true", help="Skip Discord webhook notifications")
    p_run.add_argument("--force", action="store_true", help="Ignore scheduler cadence guardrails")
    p_run.set_defaults(func=cmd_run)

    p_status = sub.add_parser("status", help="Show SQLite database row counts and last run timestamps")
    p_status.set_defaults(func=cmd_status)

    p_disc = sub.add_parser("test-discord", help="Send a test embed to DISCORD_WEBHOOK_URL")
    p_disc.set_defaults(func=cmd_test_discord)

    p_web = sub.add_parser("web", help="Launch the interactive NYC map & monthly-cost Web UI")
    p_web.add_argument("--host", default="127.0.0.1", help="Bind host (default: 127.0.0.1)")
    p_web.add_argument("--port", type=int, default=8000, help="Bind port (default: 8000)")
    p_web.set_defaults(func=cmd_web)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    config = load_config(args.config)
    return args.func(config, args)


if __name__ == "__main__":
    sys.exit(main())
