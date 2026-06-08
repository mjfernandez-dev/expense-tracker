"""Optional FCI scraper for fondosonline.com.

Fetches the current valor cuota from fondosonline.com by parsing the HTML.
This is a best-effort service: returns None on any failure without raising.
"""
from decimal import Decimal, InvalidOperation
from typing import Optional
import logging
import re

import httpx

logger = logging.getLogger("finanzaapp")


def scrape_valor_cuota(ticker: str) -> Optional[Decimal]:
    """
    Fetch current valor cuota from fondosonline.com.

    Args:
        ticker: Bloomberg ticker (e.g. "SBSRPEA").

    Returns:
        Decimal valor cuota, or None if scraping fails.
    """
    url = f"https://www.fondosonline.com/Information/FundData?ticker={ticker}"

    try:
        response = httpx.get(url, timeout=15.0, follow_redirects=True)
        response.raise_for_status()

        text = response.text

        # Try hidden span first: <span id="fundLastPrice" style="display:none">1.421,56</span>
        match = re.search(r'id="fundLastPrice"[^>]*>([^<]+)', text)
        if not match:
            # Fallback to visible span: <span id="displayPrice">1.421,56</span>
            match = re.search(r'id="displayPrice"[^>]*>([^<]+)', text)

        if match:
            price_str = match.group(1).strip()
            # Argentine format: "1.421,56" → "1421.56"
            cleaned = price_str.replace(".", "").replace(",", ".")
            return Decimal(cleaned)

        logger.warning("Could not find price element for ticker %s", ticker)
        return None

    except Exception as e:
        logger.warning("Scraping failed for ticker %s: %s", ticker, str(e))
        return None
