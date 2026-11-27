"""SQLAlchemy 2.0 ORM models and repository for house persistence (SQLite by default)."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import (
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    func,
    select,
)
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from house.models import ListingData
from house.sources.base import detect_num_units


class Base(DeclarativeBase):
    pass


class Listing(Base):
    """Canonical deduplicated NYC apartment listing."""

    __tablename__ = "listings"
    __table_args__ = (
        Index("idx_listings_status_price", "status", "price"),
        Index("idx_listings_neighborhood", "neighborhood"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    canonical_key: Mapped[str] = mapped_column(String(256), nullable=False, unique=True)
    address: Mapped[str] = mapped_column(String(256), nullable=False)
    unit: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    borough: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    neighborhood: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    zip_code: Mapped[str] = mapped_column(String(16), nullable=False, default="")
    property_type: Mapped[str] = mapped_column(String(32), nullable=False, default="condo")

    price: Mapped[float] = mapped_column(Float, nullable=False)
    initial_price: Mapped[float] = mapped_column(Float, nullable=False)
    beds: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    baths: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    sqft: Mapped[int | None] = mapped_column(Integer, nullable=True)

    monthly_hoa: Mapped[float | None] = mapped_column(Float, nullable=True)
    monthly_maintenance: Mapped[float | None] = mapped_column(Float, nullable=True)
    monthly_tax: Mapped[float | None] = mapped_column(Float, nullable=True)

    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    days_on_market: Mapped[int | None] = mapped_column(Integer, nullable=True)
    primary_source: Mapped[str] = mapped_column(String(64), nullable=False)
    sources_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    url: Mapped[str] = mapped_column(Text, nullable=False, default="")
    amenities_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    raw_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")

    first_seen_at: Mapped[str] = mapped_column(String(64), nullable=False)
    last_seen_at: Mapped[str] = mapped_column(String(64), nullable=False)


class PriceHistory(Base):
    """Historical price and carrying-fee snapshots for tracking price drops."""

    __tablename__ = "price_history"
    __table_args__ = (Index("idx_price_history_listing", "listing_id", "recorded_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    listing_id: Mapped[int] = mapped_column(Integer, ForeignKey("listings.id"), nullable=False)
    recorded_at: Mapped[str] = mapped_column(String(64), nullable=False)
    price: Mapped[float] = mapped_column(Float, nullable=False)
    monthly_hoa: Mapped[float | None] = mapped_column(Float, nullable=True)
    monthly_maintenance: Mapped[float | None] = mapped_column(Float, nullable=True)
    monthly_tax: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    source: Mapped[str] = mapped_column(String(64), nullable=False)


class AlertRecord(Base):
    """Deduplicated notification log (new matches & price drops)."""

    __tablename__ = "alerts"
    __table_args__ = (UniqueConstraint("dedupe_key", name="uq_alert_dedupe_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    listing_id: Mapped[int] = mapped_column(Integer, ForeignKey("listings.id"), nullable=False)
    alert_type: Mapped[str] = mapped_column(String(32), nullable=False)  # NEW_MATCH | PRICE_DROP
    dedupe_key: Mapped[str] = mapped_column(String(256), nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    total_monthly_cost: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False)
    notified: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class BotState(Base):
    """Key-value state for polling cadence and operational metadata."""

    __tablename__ = "bot_state"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[str] = mapped_column(String(64), nullable=False)


_STREET_ABBREV = {
    "street": "st",
    "avenue": "ave",
    "boulevard": "blvd",
    "place": "pl",
    "road": "rd",
    "drive": "dr",
    "parkway": "pkwy",
    "square": "sq",
    "west": "w",
    "east": "e",
    "north": "n",
    "south": "s",
}


def make_canonical_key(address: str, unit: str = "", zip_code: str = "") -> str:
    """
    Build a stable deduplication key from NYC street address + unit so the same
    apartment appearing on StreetEasy, Redfin, and RentCast merges into one record.
    """
    addr = (address or "").lower().strip()
    # Strip trailing city/state/zip if embedded in address
    addr = re.split(r",|\bnew york\b|\bbrooklyn\b|\bmanhattan\b|\bqueens\b|\bny\b", addr)[0]
    tokens = re.findall(r"[a-z0-9]+", addr)
    norm_tokens = [_STREET_ABBREV.get(t, t) for t in tokens]
    norm_addr = " ".join(norm_tokens)

    norm_unit = re.sub(r"^(apt|unit|ste|suite|#)\s*", "", (unit or "").lower().strip())
    norm_unit = re.sub(r"[^a-z0-9]", "", norm_unit)

    norm_zip = re.sub(r"[^0-9]", "", zip_code or "")[:5]
    parts = [norm_addr]
    if norm_unit:
        parts.append(f"#{norm_unit}")
    elif norm_zip:
        parts.append(norm_zip)
    return "|".join(parts)


def _to_sqlalchemy_url(path_or_url: str | Path) -> str:
    raw = str(path_or_url)
    if "://" in raw:
        return raw
    if raw == ":memory:":
        return "sqlite:///:memory:"
    p = Path(raw)
    p.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{p}"


class Database:
    """SQLAlchemy ORM-backed repository for all house state."""

    def __init__(self, path_or_url: str | Path = "data/house.db") -> None:
        self.url = _to_sqlalchemy_url(path_or_url)
        self.engine = create_engine(self.url, future=True)
        Base.metadata.create_all(self.engine)
        self._session_factory = sessionmaker(bind=self.engine, expire_on_commit=False)

    def session(self) -> Session:
        return self._session_factory()

    def _upsert_insert(self, model: type[Base]) -> Any:
        if self.engine.dialect.name == "postgresql":
            return pg_insert(model)
        return sqlite_insert(model)

    def close(self) -> None:
        self.engine.dispose()

    def __enter__(self) -> Database:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()

    # ---- Listings & Price History ----

    def upsert_listing(self, item: ListingData) -> tuple[int, bool, float]:
        """
        Insert or update a listing by canonical (address, unit) key.

        Returns `(listing_id, is_new, price_drop_pct)` where `price_drop_pct > 0`
        if the new price is lower than the previously stored price.
        """
        now = datetime.now(timezone.utc).isoformat()
        ckey = make_canonical_key(item.address, item.unit, item.zip_code)
        if not ckey:
            ckey = f"{item.source}:{item.external_id}"

        with self.session() as sess:
            existing = sess.scalar(select(Listing).where(Listing.canonical_key == ckey))

            if existing is None:
                row = Listing(
                    canonical_key=ckey,
                    address=item.address.strip(),
                    unit=item.unit.strip(),
                    borough=item.borough.strip(),
                    neighborhood=item.neighborhood.strip(),
                    zip_code=item.zip_code.strip(),
                    property_type=(item.property_type or "condo").lower(),
                    price=float(item.price),
                    initial_price=float(item.price),
                    beds=float(item.beds),
                    baths=float(item.baths),
                    sqft=item.sqft,
                    monthly_hoa=item.monthly_hoa,
                    monthly_maintenance=item.monthly_maintenance,
                    monthly_tax=item.monthly_tax,
                    status=(item.status or "active").lower(),
                    days_on_market=item.days_on_market,
                    primary_source=item.source,
                    sources_json=json.dumps([item.source]),
                    url=item.url,
                    amenities_json=json.dumps(sorted(set(item.amenities))),
                    description=item.description,
                    raw_json=json.dumps(item.raw_json, default=str),
                    first_seen_at=now,
                    last_seen_at=now,
                )
                sess.add(row)
                sess.flush()

                sess.add(
                    PriceHistory(
                        listing_id=row.id,
                        recorded_at=now,
                        price=row.price,
                        monthly_hoa=row.monthly_hoa,
                        monthly_maintenance=row.monthly_maintenance,
                        monthly_tax=row.monthly_tax,
                        status=row.status,
                        source=item.source,
                    )
                )
                sess.commit()
                return row.id, True, 0.0

            # Merge into existing canonical listing
            prev_price = existing.price
            price_changed = abs(float(item.price) - prev_price) >= 1.0 and item.price > 0
            price_drop_pct = 0.0
            if price_changed and item.price < prev_price and prev_price > 0:
                price_drop_pct = ((prev_price - float(item.price)) / prev_price) * 100.0

            if item.price > 0:
                existing.price = float(item.price)
            if item.borough and not existing.borough:
                existing.borough = item.borough.strip()
            if item.neighborhood and not existing.neighborhood:
                existing.neighborhood = item.neighborhood.strip()
            if item.zip_code and not existing.zip_code:
                existing.zip_code = item.zip_code.strip()
            if item.beds > 0:
                existing.beds = float(item.beds)
            if item.baths > 0:
                existing.baths = float(item.baths)
            if item.sqft is not None and item.sqft > 0:
                existing.sqft = item.sqft
            if item.monthly_hoa is not None:
                existing.monthly_hoa = item.monthly_hoa
            if item.monthly_maintenance is not None:
                existing.monthly_maintenance = item.monthly_maintenance
            if item.monthly_tax is not None:
                existing.monthly_tax = item.monthly_tax
            if item.days_on_market is not None:
                existing.days_on_market = item.days_on_market
            if item.status:
                existing.status = item.status.lower()
            if item.url and (not existing.url or "streeteasy" in item.source):
                existing.url = item.url
            if item.description and len(item.description) > len(existing.description):
                existing.description = item.description

            # Merge sources & amenities
            sources = set(json.loads(existing.sources_json or "[]"))
            sources.add(item.source)
            existing.sources_json = json.dumps(sorted(sources))

            amenities = set(json.loads(existing.amenities_json or "[]"))
            amenities.update(item.amenities)
            existing.amenities_json = json.dumps(sorted(amenities))

            existing.last_seen_at = now

            if price_changed:
                sess.add(
                    PriceHistory(
                        listing_id=existing.id,
                        recorded_at=now,
                        price=existing.price,
                        monthly_hoa=existing.monthly_hoa,
                        monthly_maintenance=existing.monthly_maintenance,
                        monthly_tax=existing.monthly_tax,
                        status=existing.status,
                        source=item.source,
                    )
                )

            sess.commit()
            return existing.id, False, round(price_drop_pct, 2)

    def mark_stale_off_market(self, source: str, seen_canonical_keys: set[str]) -> int:
        """Mark previously active listings from `source` as `off_market` if missing from `seen_canonical_keys`."""
        now = datetime.now(timezone.utc).isoformat()
        marked = 0
        with self.session() as sess:
            stmt = select(Listing).where(
                Listing.primary_source == source,
                Listing.status == "active",
            )
            for row in sess.scalars(stmt).all():
                if row.canonical_key in seen_canonical_keys:
                    continue
                row.status = "off_market"
                sess.add(
                    PriceHistory(
                        listing_id=row.id,
                        recorded_at=now,
                        price=row.price,
                        monthly_hoa=row.monthly_hoa,
                        monthly_maintenance=row.monthly_maintenance,
                        monthly_tax=row.monthly_tax,
                        status="off_market",
                        source=source,
                    )
                )
                marked += 1
            if marked:
                sess.commit()
        return marked

    def upsert_listings(
        self,
        items: list[ListingData],
        *,
        reconcile_source: str | None = None,
        min_seen_to_reconcile: int = 20,
    ) -> dict[str, int]:
        """Upsert a batch of listings and optionally mark missing rows for `reconcile_source` as `off_market`."""
        inserted = 0
        updated = 0
        price_drops = 0
        seen_for_reconcile: set[str] = set()
        for item in items:
            if item.price <= 0:
                continue
            _, is_new, drop_pct = self.upsert_listing(item)
            if reconcile_source and item.source == reconcile_source:
                ckey = make_canonical_key(item.address, item.unit, item.zip_code)
                seen_for_reconcile.add(ckey or f"{item.source}:{item.external_id}")
            if is_new:
                inserted += 1
            else:
                updated += 1
            if drop_pct > 0:
                price_drops += 1

        marked_off_market = 0
        if reconcile_source and len(seen_for_reconcile) >= min_seen_to_reconcile:
            marked_off_market = self.mark_stale_off_market(reconcile_source, seen_for_reconcile)

        return {
            "inserted": inserted,
            "updated": updated,
            "price_drops": price_drops,
            "marked_off_market": marked_off_market,
        }

    def get_listings(self, status: str | None = "active") -> list[Listing]:
        stmt = select(Listing).order_by(Listing.price.asc())
        if status:
            stmt = stmt.where(Listing.status == status)
        with self.session() as sess:
            return list(sess.scalars(stmt).all())

    def get_listing(self, listing_id: int) -> Listing | None:
        with self.session() as sess:
            return sess.get(Listing, listing_id)

    def get_price_history(self, listing_id: int) -> list[PriceHistory]:
        stmt = (
            select(PriceHistory)
            .where(PriceHistory.listing_id == listing_id)
            .order_by(PriceHistory.recorded_at.asc())
        )
        with self.session() as sess:
            return list(sess.scalars(stmt).all())

    @staticmethod
    def to_listing_data(row: Listing) -> ListingData:
        raw = json.loads(row.raw_json or "{}")
        lat = raw.get("latitude") or raw.get("lat")
        lng = raw.get("longitude") or raw.get("lng") or raw.get("lon")
        try:
            lat_f = float(lat) if lat is not None else None
            lng_f = float(lng) if lng is not None else None
        except (TypeError, ValueError):
            lat_f, lng_f = None, None
        photo = str(raw.get("primary_photo") or raw.get("photo_url") or "")
        raw_yb = raw.get("year_built")
        year_built: int | None = None
        if raw_yb is not None and str(raw_yb).strip() not in ("", "None", "nan"):
            try:
                yb_int = int(float(raw_yb))
                if 1700 <= yb_int <= 2035:
                    year_built = yb_int
            except (TypeError, ValueError):
                pass
        num_units = detect_num_units(
            row.property_type,
            row.description,
            raw.get("units") or raw.get("num_units"),
        )
        return ListingData(
            source=row.primary_source,
            external_id=str(row.id),
            address=row.address,
            unit=row.unit,
            borough=row.borough,
            neighborhood=row.neighborhood,
            zip_code=row.zip_code,
            property_type=row.property_type,
            num_units=num_units,
            price=row.price,
            beds=row.beds,
            baths=row.baths,
            sqft=row.sqft,
            year_built=year_built,
            monthly_hoa=row.monthly_hoa,
            monthly_maintenance=row.monthly_maintenance,
            monthly_tax=row.monthly_tax,
            status=row.status,
            days_on_market=row.days_on_market,
            url=row.url,
            latitude=lat_f,
            longitude=lng_f,
            photo_url=photo,
            amenities=json.loads(row.amenities_json or "[]"),
            description=row.description,
        )

    # ---- Alerts & Deduplication ----

    def record_alert(
        self,
        listing_id: int,
        alert_type: str,
        dedupe_key: str,
        score: float,
        total_monthly_cost: float,
    ) -> tuple[int, bool]:
        """Record an alert if its dedupe_key has not been seen before. Returns `(id, is_new)`."""
        now = datetime.now(timezone.utc).isoformat()
        with self.session() as sess:
            existing = sess.scalar(select(AlertRecord).where(AlertRecord.dedupe_key == dedupe_key))
            if existing is not None:
                return existing.id, False
            rec = AlertRecord(
                listing_id=listing_id,
                alert_type=alert_type,
                dedupe_key=dedupe_key,
                score=score,
                total_monthly_cost=total_monthly_cost,
                created_at=now,
                notified=0,
            )
            sess.add(rec)
            sess.commit()
            return rec.id, True

    def mark_alert_notified(self, alert_id: int) -> None:
        with self.session() as sess:
            rec = sess.get(AlertRecord, alert_id)
            if rec is not None:
                rec.notified = 1
                sess.commit()

    # ---- Bot State ----

    def get_bot_state(self, key: str) -> str | None:
        with self.session() as sess:
            row = sess.get(BotState, key)
            return row.value if row else None

    def set_bot_state(self, key: str, value: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self.session() as sess:
            stmt = self._upsert_insert(BotState).values(key=key, value=value, updated_at=now)
            stmt = stmt.on_conflict_do_update(
                index_elements=["key"],
                set_={"value": stmt.excluded.value, "updated_at": stmt.excluded.updated_at},
            )
            sess.execute(stmt)
            sess.commit()

    def status_counts(self) -> dict[str, int]:
        with self.session() as sess:
            return {
                "listings_total": sess.scalar(select(func.count()).select_from(Listing)) or 0,
                "listings_active": sess.scalar(
                    select(func.count()).select_from(Listing).where(Listing.status == "active")
                )
                or 0,
                "price_history": sess.scalar(select(func.count()).select_from(PriceHistory)) or 0,
                "alerts": sess.scalar(select(func.count()).select_from(AlertRecord)) or 0,
            }
