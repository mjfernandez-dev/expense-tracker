"""FCI scraper using Argentina Datos API (free, no auth required).

Fetches current valor cuota from https://api.argentinadatos.com/v1/finanzas/fci/
This is a best-effort service: returns None on any failure without raising.
"""
from decimal import Decimal, InvalidOperation
from typing import Optional, Any
import logging
import re
import unicodedata

import httpx

logger = logging.getLogger("finanzaapp")

CATEGORIES = ["rentaFija", "rentaMixta", "rentaVariable", "mercadoDinero"]
API_BASE = "https://api.argentinadatos.com/v1/finanzas/fci"


def _fetch_category(cat: str, client: httpx.Client) -> list[dict[str, Any]]:
    """Fetch all FCI entries for one category from the API."""
    try:
        resp = client.get(f"{API_BASE}/{cat}/ultimo", timeout=10.0)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.warning("FCI API error for %s: %s", cat, str(e))
        return []


def _normalize(name: str) -> str:
    """Strip class/ley suffixes, normalize diacritics (á→a), remove non-alpha, uppercase."""
    name = re.sub(r'\s*[-–—]\s*CLASE\s+[A-Z0-9\u00D1].*$', '', name, flags=re.IGNORECASE)
    # Remove Ley references: " - Ley N° 27260" or " Ley 27260" or " Ley N. 123"
    name = re.sub(r'\s*[-–—]?\s*LEY\s+N[°º.]?\s*[\d]+\s*\(?[\d/]*\)?.*$', '', name, flags=re.IGNORECASE)
    name = re.sub(r'\s+Ley\s+\d+.*$', '', name, flags=re.IGNORECASE)
    # NFD splits accented chars (e.g. Ó→O + combining acute), then strip combining marks
    name = unicodedata.normalize('NFD', name)
    name = re.sub(r'[\u0300-\u036f]', '', name)
    return re.sub(r'[^A-Z0-9]', '', name.upper())


def _match_fund(ticker: str, funds: list[dict[str, Any]]) -> Optional[dict[str, Any]]:
    """Match a ticker like 'SBSRPE' to a fund entry by normalized name.

    Matching strategies (in order):
    1. Exact: normalized ticker == normalized fund name
    2. Subsequence: all ticker chars appear in order in the name
    3. Prefix retry: drop last char and retry (handles class-letter suffix)
    """
    ticker = ticker.upper().strip()
    if not ticker:
        return None

    def _try_match(t: str) -> Optional[dict[str, Any]]:
        for fund in funds:
            clean = _normalize(fund.get("fondo", ""))
            if t == clean:
                return fund
            # Subsequence match: all chars of t appear in order in clean
            it = iter(clean)
            if all(c in it for c in t):
                return fund
        return None

    # Strategy 1: exact or subsequence match
    result = _try_match(ticker)
    if result:
        return result

    # Strategy 2: drop last char (class letter) and retry
    if len(ticker) > 4:
        result = _try_match(ticker[:-1])
        if result:
            return result

    return None


def scrape_valor_cuota(ticker: str) -> Optional[Decimal]:
    """Fetch the latest valor cuota for a given ticker.

    Uses the Argentina Datos API which covers all FCI categories.

    Args:
        ticker: Ticker (e.g. "SBSRPE" for SBS Renta Pesos Clase A).

    Returns:
        Decimal valor cuota, or None if matching or fetching fails.
    """
    try:
        with httpx.Client() as client:
            for cat in CATEGORIES:
                funds = _fetch_category(cat, client)
                if not funds:
                    continue
                match = _match_fund(ticker, funds)
                if match:
                    vcp = match.get("vcp")
                    if vcp is not None:
                        try:
                            # API reports VCP in thousandths of a peso (/1000)
                            return Decimal(str(vcp)) / Decimal("1000")
                        except InvalidOperation:
                            logger.warning("Invalid vcp value for %s: %s", ticker, vcp)
                            return None

            logger.warning("Could not find fund matching ticker %s", ticker)
            return None

    except Exception as e:
        logger.warning("FCI scraping failed for ticker %s: %s", ticker, str(e))
        return None
