"""Discord webhook notifier with rich embeds and SQLite deduplication."""

from __future__ import annotations

import logging
from typing import Any

import requests

from house.config import AppConfig
from house.db import Database
from house.models import ScoredListing

logger = logging.getLogger(__name__)

COLOR_NEW_MATCH = 0x2ECC71   # Green
COLOR_PRICE_DROP = 0xF39C12  # Amber
COLOR_INFO = 0x3498DB        # Blue


class DiscordNotifier:
    """Sends formatted embeds to a Discord webhook (or logs cleanly in dry-run if unconfigured)."""

    def __init__(self, config: AppConfig, db: Database) -> None:
        self.config = config
        self.db = db

    def send_embed(
        self,
        title: str,
        description: str,
        fields: list[dict[str, Any]] | None = None,
        color: int = COLOR_INFO,
        url: str = "",
    ) -> bool:
        embed: dict[str, Any] = {
            "title": title,
            "description": description,
            "color": color,
            "fields": fields or [],
        }
        if url:
            embed["url"] = url

        payload = {
            "username": "House Bot (NYC)",
            "embeds": [embed],
        }
        webhook = self.config.secrets.discord_webhook_url
        if not webhook:
            logger.info("[DISCORD DRY-RUN] %s — %s", title, description)
            return False

        try:
            resp = requests.post(webhook, json=payload, timeout=10)
            resp.raise_for_status()
            return True
        except Exception as exc:
            logger.error("Failed to send Discord webhook: %s", exc)
            return False

    def notify_matches(self, matches: list[ScoredListing]) -> int:
        """
        Send deduplicated Discord alerts for:
        1. New qualifying listings scoring >= `search.min_score_to_notify`
        2. Significant price drops (>= `search.price_drop_notify_pct`) on qualifying listings
        """
        sent = 0
        min_score = self.config.search.min_score_to_notify
        min_drop = self.config.search.price_drop_notify_pct

        for item in matches:
            if not item.passes_filters or item.score < min_score:
                continue

            is_price_drop = item.price_drop_pct >= min_drop
            alert_type = "PRICE_DROP" if is_price_drop else "NEW_MATCH"
            price_bucket = int(round(item.listing.price / 1000.0))
            dedupe_key = (
                f"{alert_type}:{item.canonical_key}:{price_bucket}"
                if is_price_drop
                else f"NEW_MATCH:{item.canonical_key}"
            )

            alert_id, is_new = self.db.record_alert(
                listing_id=item.listing_id,
                alert_type=alert_type,
                dedupe_key=dedupe_key,
                score=item.score,
                total_monthly_cost=item.costs.total_monthly_cost,
            )
            if not is_new:
                continue

            l = item.listing
            c = item.costs
            unit_str = f" #{l.unit}" if l.unit else ""
            hood = l.neighborhood or l.borough or "NYC"
            prefix = f"📉 Price Drop (-{item.price_drop_pct:.1f}%)" if is_price_drop else "🏠 New Match"
            title = f"{prefix}: {l.address}{unit_str} ({hood})"

            sqft_str = f"{l.sqft:,} sqft" if l.sqft else "N/A sqft"
            description = (
                f"**{l.property_type.upper()}** | {l.beds:g} bd / {l.baths:g} ba | {sqft_str} | "
                f"Score: **{item.score:.1f}/100**"
            )
            if c.warnings:
                description += "\n⚠️ " + " • ".join(c.warnings)

            fee_label = "Maintenance" if l.property_type == "coop" else "Common Chg"
            fields = [
                {"name": "Asking Price", "value": f"${l.price:,.0f}", "inline": True},
                {"name": "All-In Monthly", "value": f"**${c.total_monthly_cost:,.0f}/mo**", "inline": True},
                {"name": "After-Tax Est.", "value": f"~${c.effective_after_tax_monthly:,.0f}/mo", "inline": True},
                {"name": "Mortgage (P&I)", "value": f"${c.monthly_mortgage_pi:,.0f}/mo", "inline": True},
                {"name": fee_label, "value": f"${c.monthly_hoa_or_maint:,.0f}/mo", "inline": True},
                {"name": "Monthly Tax", "value": f"${c.monthly_tax:,.0f}/mo", "inline": True},
                {
                    "name": "Est. Cash to Close",
                    "value": f"${c.estimated_cash_to_close:,.0f} ({c.down_payment_pct:.0f}% down + ${c.estimated_closing_costs:,.0f} closing)",
                    "inline": False,
                },
            ]

            ok = self.send_embed(
                title=title,
                description=description,
                fields=fields,
                color=COLOR_PRICE_DROP if is_price_drop else COLOR_NEW_MATCH,
                url=l.url,
            )
            if ok:
                self.db.mark_alert_notified(alert_id)
                sent += 1
        return sent
