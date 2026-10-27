"""Live price lookup straight from the stores' own product pages (no API).

Reads the schema.org `Offer` price (and availability) that IKEA Thailand and
HomePro publish on every product page. Only those two store domains are ever
fetched, results are cached for a short time, and failures are reported per
product so the caller can fall back to the catalog price.
"""

import asyncio
import json
import re
import time
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import httpx

ALLOWED_HOSTS = {"www.ikea.com", "ikea.com", "www.homepro.co.th", "homepro.co.th"}
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; RoomlyPriceCheck/1.0)", "Accept-Language": "th-TH,th;q=0.9"}
CACHE_SECONDS = 30 * 60
FAILURE_CACHE_SECONDS = 5 * 60

_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_limit = asyncio.Semaphore(4)


def is_allowed_product_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    return parsed.scheme == "https" and parsed.hostname in ALLOWED_HOSTS and "/p/" in parsed.path


def is_allowed_product_image_url(url: str) -> bool:
    """Product photos may only come from the two stores' own image hosts."""
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    host = parsed.hostname or ""
    return parsed.scheme == "https" and (host in {"www.ikea.com", "ikea.com"} or host.endswith(".homepro.co.th") or host == "homepro.co.th")


def parse_offer(html: str) -> dict[str, Any] | None:
    """Price (THB, whole baht), availability and currency from a product page, or None."""
    for block in re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', html, re.S):
        try:
            data = json.loads(block)
        except json.JSONDecodeError:
            continue
        stack = data if isinstance(data, list) else [data]
        while stack:
            node = stack.pop(0)
            if isinstance(node, list):
                stack.extend(node)
            elif isinstance(node, dict):
                if node.get("@type") == "Offer" and node.get("price") not in (None, ""):
                    availability = str(node.get("availability", ""))
                    return {
                        "price": round(float(node["price"])),
                        "currency": node.get("priceCurrency"),
                        "in_stock": None if not availability else "OutOfStock" not in availability and "SoldOut" not in availability,
                    }
                stack.extend(node.values())
    match = re.search(r'"@type":"Offer"[^}]*?"price":"?([0-9.]+)', html) or re.search(r'product:price:amount"\s+content="([0-9.]+)"', html)
    return {"price": round(float(match.group(1))), "currency": None, "in_stock": None} if match else None


async def _fetch(client: httpx.AsyncClient, url: str) -> dict[str, Any]:
    cached = _cache.get(url)
    if cached and cached[0] > time.monotonic():
        return cached[1]

    result: dict[str, Any]
    try:
        async with _limit:
            response = await client.get(url)
        response.raise_for_status()
        if response.url.host not in ALLOWED_HOSTS:
            raise httpx.HTTPError("redirected outside the store domain")
        offer = parse_offer(response.text)
        if offer is None:
            result = {"error": "ไม่พบราคาบนหน้าสินค้า"}
        else:
            result = {**offer, "checked_at": datetime.now(timezone.utc).isoformat(), "source": "live"}
    except httpx.HTTPError as error:
        result = {"error": f"ดึงราคาจากร้านไม่สำเร็จ ({type(error).__name__})"}

    ttl = CACHE_SECONDS if "error" not in result else FAILURE_CACHE_SECONDS
    _cache[url] = (time.monotonic() + ttl, result)
    return result


async def get_prices(items: list[tuple[str, str]]) -> dict[str, dict[str, Any]]:
    """`items` is [(product id, product page url)]. Returns {id: result-or-error}."""
    results: dict[str, dict[str, Any]] = {}
    allowed = []
    for product_id, url in items:
        if is_allowed_product_url(url):
            allowed.append((product_id, url))
        else:
            results[product_id] = {"error": "ลิงก์สินค้าไม่อยู่ในร้านที่รองรับ"}
    async with httpx.AsyncClient(headers=HEADERS, follow_redirects=True, timeout=15) as client:
        fetched = await asyncio.gather(*(_fetch(client, url) for _, url in allowed))
    for (product_id, _), result in zip(allowed, fetched):
        results[product_id] = result
    return results
