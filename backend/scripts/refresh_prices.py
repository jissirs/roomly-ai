"""Refresh catalog prices straight from each product's own page (no API needed).

Reads frontend/src/data/realProductCatalog.js, opens every product `url`, reads
the schema.org `Offer` price (falls back to og/product meta tags), and rewrites
the `price:` of that product in the catalog file. Also prints a summary of what
changed. Run occasionally; one request per product, with a polite delay.

    cd backend && venv/Scripts/python scripts/refresh_prices.py          # update file
    cd backend && venv/Scripts/python scripts/refresh_prices.py --dry-run

Affiliate links: if a product has `affiliate_url` (Supabase products table or
catalog entry), the UI uses it for the button; prices here still come from the
public product page in `url`.
"""

import json
import re
import sys
import time
from datetime import date
from pathlib import Path

import httpx

CATALOG = Path(__file__).resolve().parents[2] / "frontend" / "src" / "data" / "realProductCatalog.js"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; RoomlyPriceCheck/1.0)", "Accept-Language": "th-TH,th;q=0.9"}


def extract_price(html: str) -> int | None:
    for block in re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', html, re.S):
        try:
            data = json.loads(block)
        except json.JSONDecodeError:
            continue
        stack = data if isinstance(data, list) else [data]
        while stack:
            node = stack.pop()
            if isinstance(node, list):
                stack.extend(node)
            elif isinstance(node, dict):
                if node.get("@type") == "Offer" and node.get("price") not in (None, ""):
                    return round(float(node["price"]))
                stack.extend(node.values())
    match = re.search(r'"@type":"Offer"[^}]*?"price":"?([0-9.]+)', html) or re.search(
        r'product:price:amount"\s+content="([0-9.]+)"', html
    )
    return round(float(match.group(1))) if match else None


def main() -> None:
    dry_run = "--dry-run" in sys.argv
    source = CATALOG.read_text(encoding="utf-8")
    entries = re.findall(r"id: '([^']+)'.*?price: (\d+).*?url: '([^']+)'", source, re.S)
    updated = source
    changed = 0
    with httpx.Client(headers=HEADERS, follow_redirects=True, timeout=30) as client:
        for product_id, old_price, url in entries:
            try:
                response = client.get(url)
                response.raise_for_status()
                price = extract_price(response.text)
            except httpx.HTTPError as error:
                print(f"SKIP  {product_id}: {error}")
                continue
            if price is None:
                print(f"SKIP  {product_id}: price not found on page")
            elif price == int(old_price):
                print(f"same  {product_id}: {price}")
            else:
                print(f"NEW   {product_id}: {old_price} -> {price}")
                pattern = re.compile(rf"(id: '{re.escape(product_id)}'.*?price: )\d+", re.S)
                updated = pattern.sub(rf"\g<1>{price}", updated, count=1)
                changed += 1
            time.sleep(1.0)

    if changed and not dry_run:
        updated = re.sub(
            r"CATALOG_VERIFIED_AT = '[^']*'", f"CATALOG_VERIFIED_AT = '{date.today().isoformat()}'", updated
        )
        CATALOG.write_text(updated, encoding="utf-8")
    print(f"\n{changed} price(s) changed{' (dry run, file not written)' if dry_run else ''}")


if __name__ == "__main__":
    main()
