"""Free saved-search email alert parser via IMAP (StreetEasy, Redfin, Zillow, Compass)."""

from __future__ import annotations

import email
import imaplib
import logging
import re
from email.header import decode_header
from html import unescape

from house.config import EmailAlertsSourceConfig, EnvSecrets
from house.models import ListingData
from house.sources.base import ListingSource, normalize_amenities, normalize_property_type, parse_currency

logger = logging.getLogger(__name__)

_PRICE_RE = re.compile(r"\$\s*([0-9]{1,3}(?:,[0-9]{3})+)")
_BEDS_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(?:bd|bed|beds|br)\b", re.IGNORECASE)
_BATHS_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(?:ba|bath|baths)\b", re.IGNORECASE)
_SQFT_RE = re.compile(r"([0-9,]{3,6})\s*(?:sq\.?\s*ft\.?|sqft|ft²)\b", re.IGNORECASE)
_URL_RE = re.compile(
    r"https?://(?:www\.)?(?:streeteasy|redfin|zillow|compass)\.com/[^\s\"'<>]+",
    re.IGNORECASE,
)
_ADDR_RE = re.compile(
    r"\b(\d{1,5}\s+(?:[NSEW]\.?\s+)?[A-Za-z0-9.\-'\s]{2,40}?"
    r"\b(?:Street|St|Avenue|Ave|Boulevard|Blvd|Place|Pl|Road|Rd|Drive|Dr|Parkway|Pkwy|Broadway|Way)\b)"
    r"(?:\s*(?:#|Apt\.?|Unit)\s*([A-Za-z0-9\-]+))?",
    re.IGNORECASE,
)


def _strip_html(text: str) -> str:
    cleaned = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", text, flags=re.DOTALL | re.IGNORECASE)
    cleaned = re.sub(r"<[^>]+>", " ", cleaned)
    return re.sub(r"\s+", " ", unescape(cleaned)).strip()


def parse_alert_email_text(
    subject: str,
    body_text: str,
    sender: str = "",
) -> list[ListingData]:
    """
    Extract one or more listing alerts from a StreetEasy / Redfin / Zillow / Compass email.
    Works on both plain-text and stripped HTML email bodies.
    """
    text = f"{subject}\n{_strip_html(body_text)}"
    source = "email_alert"
    sender_lower = sender.lower()
    for domain in ("streeteasy", "redfin", "zillow", "compass"):
        if domain in sender_lower or domain in text.lower():
            source = f"email_{domain}"
            break

    prices = [parse_currency(m.group(1)) for m in _PRICE_RE.finditer(text)]
    prices = [p for p in prices if p and p >= 100_000]
    urls = _URL_RE.findall(text)
    addr_match = _ADDR_RE.search(text)

    if not prices or not addr_match:
        return []

    address = addr_match.group(1).strip()
    unit = (addr_match.group(2) or "").strip()
    beds_m = _BEDS_RE.search(text)
    baths_m = _BATHS_RE.search(text)
    sqft_m = _SQFT_RE.search(text)

    # Extract maintenance / HOA / taxes if mentioned in the email
    maint_m = re.search(r"maintenance[:\s]*\$([0-9,]+)", text, re.IGNORECASE)
    hoa_m = re.search(r"(?:common charges|hoa)[:\s]*\$([0-9,]+)", text, re.IGNORECASE)
    tax_m = re.search(r"(?:monthly )?tax(?:es)?[:\s]*\$([0-9,]+)", text, re.IGNORECASE)

    ptype = normalize_property_type(text)
    if maint_m and not hoa_m:
        ptype = "coop"

    return [
        ListingData(
            source=source,
            external_id=urls[0] if urls else f"{address}:{unit}:{prices[0]}",
            address=address,
            unit=unit,
            property_type=ptype,
            price=prices[0],
            beds=float(beds_m.group(1)) if beds_m else 0.0,
            baths=float(baths_m.group(1)) if baths_m else 0.0,
            sqft=int(sqft_m.group(1).replace(",", "")) if sqft_m else None,
            monthly_maintenance=parse_currency(maint_m.group(1)) if maint_m else None,
            monthly_hoa=parse_currency(hoa_m.group(1)) if hoa_m else None,
            monthly_tax=parse_currency(tax_m.group(1)) if tax_m else None,
            url=urls[0] if urls else "",
            amenities=normalize_amenities([], text),
            description=subject[:240],
        )
    ]


class EmailAlertsSource(ListingSource):
    """Connect via IMAP to read free saved-search alert emails from listing sites."""

    name = "email_alerts"

    def __init__(self, secrets: EnvSecrets, source_cfg: EmailAlertsSourceConfig) -> None:
        self.secrets = secrets
        self.source_cfg = source_cfg

    @staticmethod
    def _decode_str(raw: str | None) -> str:
        if not raw:
            return ""
        parts = decode_header(raw)
        out: list[str] = []
        for chunk, enc in parts:
            if isinstance(chunk, bytes):
                out.append(chunk.decode(enc or "utf-8", errors="replace"))
            else:
                out.append(str(chunk))
        return "".join(out)

    def fetch(self) -> list[ListingData]:
        if not self.secrets.imap_user or not self.secrets.imap_password:
            logger.info("Skipping %s: IMAP_USER / IMAP_PASSWORD not set in .env", self.name)
            return []

        results: list[ListingData] = []
        try:
            with imaplib.IMAP4_SSL(self.secrets.imap_host, self.secrets.imap_port) as conn:
                conn.login(self.secrets.imap_user, self.secrets.imap_password)
                conn.select(self.secrets.imap_folder, readonly=True)
                status, data = conn.search(None, "ALL")
                if status != "OK" or not data or not data[0]:
                    return []

                msg_ids = data[0].split()[-self.source_cfg.max_emails_per_poll :]
                for mid in reversed(msg_ids):
                    st, msg_data = conn.fetch(mid, "(RFC822)")
                    if st != "OK" or not msg_data or not isinstance(msg_data[0], tuple):
                        continue
                    msg = email.message_from_bytes(msg_data[0][1])
                    sender = self._decode_str(msg.get("From"))
                    if self.source_cfg.sender_filters and not any(
                        f.lower() in sender.lower() for f in self.source_cfg.sender_filters
                    ):
                        continue

                    subject = self._decode_str(msg.get("Subject"))
                    body = ""
                    if msg.is_multipart():
                        for part in msg.walk():
                            ctype = part.get_content_type()
                            if ctype in ("text/plain", "text/html"):
                                payload = part.get_payload(decode=True)
                                if payload:
                                    body += "\n" + payload.decode(errors="replace")
                    else:
                        payload = msg.get_payload(decode=True)
                        if payload:
                            body = payload.decode(errors="replace")

                    results.extend(parse_alert_email_text(subject, body, sender))
        except Exception as exc:
            logger.error("IMAP email alerts fetch failed: %s", exc)
        return results
