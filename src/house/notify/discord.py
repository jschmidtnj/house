"""Discord webhook notifier with rich embeds and SQLite deduplication."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

import requests

from house.config import AppConfig
from house.db import Database
from house.models import ScoredListing

if TYPE_CHECKING:
    from house.alerts import AlertCandidate

logger = logging.getLogger(__name__)

COLOR_NEW_MATCH = 0x2ECC71     # Green
COLOR_PRICE_DROP = 0xF39C12    # Amber
COLOR_WATCHLIST = 0xE67E22     # Orange/Gold
COLOR_FAV_BUILDING = 0x9B59B6  # Purple
COLOR_INFO = 0x3498DB          # Blue


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
        web_base = (self.config.alerts.web_base_url or "").rstrip("/")

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
            house_url = f"{web_base}/?listing={item.listing_id}" if web_base else ""
            if house_url and l.url:
                description += f"\n[Open in House UI]({house_url}) • [Original Listing]({l.url})"
            elif house_url:
                description += f"\n[Open in House UI]({house_url})"

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
                url=house_url or l.url,
            )
            if ok:
                self.db.mark_alert_notified(alert_id)
                sent += 1
        return sent

    def notify_candidates(
        self,
        candidates: list[AlertCandidate],
        *,
        max_alerts: int | None = None,
    ) -> int:
        """
        Send deduplicated, prioritized Discord alerts from the smart alert engine
        (watchlist drops/status, favorite buildings, and named profile + Taste Match hits).
        """
        limit = max_alerts if max_alerts is not None else self.config.alerts.max_alerts_per_run
        sent = 0
        web_base = (self.config.alerts.web_base_url or "").rstrip("/")

        for cand in candidates:
            if limit > 0 and sent >= limit:
                break

            item = cand.scored
            alert_id, is_new = self.db.record_alert(
                listing_id=cand.listing_id,
                alert_type=cand.alert_type,
                dedupe_key=cand.dedupe_key,
                score=cand.taste_score if cand.taste_score is not None else item.score,
                total_monthly_cost=item.costs.total_monthly_cost,
            )
            if not is_new:
                continue

            l = item.listing
            c = item.costs
            unit_str = f" #{l.unit}" if l.unit else ""
            hood = l.neighborhood or l.borough or "NYC"

            if cand.alert_type == "WATCHLIST_PRICE_DROP":
                prefix = f"📉 Watchlist Drop ({cand.watch_list_name})"
                color = COLOR_WATCHLIST
            elif cand.alert_type == "WATCHLIST_BUDGET":
                prefix = f"✅ Watchlist In Budget ({cand.watch_list_name})"
                color = COLOR_NEW_MATCH
            elif cand.alert_type == "WATCHLIST_STATUS":
                prefix = f"🔔 Watchlist Status ({cand.watch_list_name})"
                color = COLOR_INFO
            elif cand.alert_type == "FAVORITE_BUILDING":
                prefix = "🏢 New Unit in Fav Building"
                color = COLOR_FAV_BUILDING
            elif cand.alert_type == "PRICE_DROP":
                prefix = f"📉 Price Drop (-{item.price_drop_pct:.1f}%)"
                color = COLOR_PRICE_DROP
            else:
                prof_tag = cand.matched_profiles[0] if cand.matched_profiles else "Match"
                prefix = f"🎯 {prof_tag}"
                color = COLOR_NEW_MATCH

            title = f"{prefix}: {l.address}{unit_str} ({hood})"

            sqft_str = f"{l.sqft:,} sqft" if l.sqft else "N/A sqft"
            yr_str = f" | Built {l.year_built}" if l.year_built else ""
            taste_str = f" | Taste Match: **{cand.taste_score:.0f}%**" if cand.taste_score is not None else ""
            lines = [
                f"**{l.property_type.upper()}** ({l.num_units}u) | {l.beds:g} bd / {l.baths:g} ba | {sqft_str}{yr_str} | Score: **{item.score:.1f}/100**{taste_str}",
                cand.summary_reason,
            ]
            if cand.taste_reasons:
                lines.append("✨ " + " • ".join(cand.taste_reasons))
            house_url = f"{web_base}/?listing={cand.listing_id}" if web_base else ""
            if house_url and l.url:
                lines.append(f"[Open in House UI]({house_url}) • [Original Listing]({l.url})")
            elif house_url:
                lines.append(f"[Open in House UI]({house_url})")
            description = "\n".join(ln for ln in lines if ln)

            is_multi = c.rentable_units > 0 and self.config.budget.use_net_rental_for_filter
            monthly_lbl = "Net Monthly" if is_multi else "All-In Monthly"
            monthly_val = (
                f"**${c.net_monthly_cost:,.0f}/mo** (gross ${c.total_monthly_cost:,.0f})"
                if is_multi
                else f"**${c.total_monthly_cost:,.0f}/mo**"
            )
            fee_label = "Maintenance" if l.property_type == "coop" else "HOA + Tax"
            fee_val = (
                f"${c.monthly_hoa_or_maint:,.0f}/mo ({c.monthly_fees_ratio * 100:.0f}%)"
                if l.property_type == "coop"
                else f"${c.monthly_hoa_or_maint + c.monthly_tax:,.0f}/mo ({c.monthly_fees_ratio * 100:.0f}%)"
            )
            commute_val = (
                f"{item.commute_minutes}m ({', '.join(item.nearest_routes[:4])})"
                if item.commute_minutes is not None
                else "N/A"
            )

            fields = [
                {"name": "Asking Price", "value": f"${l.price:,.0f}", "inline": True},
                {"name": monthly_lbl, "value": monthly_val, "inline": True},
                {"name": fee_label, "value": fee_val, "inline": True},
                {"name": "Commute", "value": commute_val, "inline": True},
                {
                    "name": "Est. Cash to Close",
                    "value": f"${c.estimated_cash_to_close:,.0f} ({c.down_payment_pct:.0f}% down)",
                    "inline": True,
                },
            ]

            ok = self.send_embed(
                title=title,
                description=description,
                fields=fields,
                color=color,
                url=house_url or l.url,
            )
            if ok:
                self.db.mark_alert_notified(alert_id)
                sent += 1
        return sent
