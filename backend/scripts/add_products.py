"""Add real products from other stores to the catalog by reading their product pages.

Give it product page URLs (with the catalog category for each). It opens each
page, reads name / SKU / price / image from the page's schema.org Product data,
and appends an entry to frontend/src/data/realProductCatalog.js. Nothing is
typed by hand except the category, so price/name/image come from the store.

    cd backend && venv/Scripts/python scripts/add_products.py <category>=<url> ...
    e.g. add_products.py chair=https://www.homepro.co.th/p/1200696

Currently reads HomePro (`/p/<id>` pages). Skips ids already in the catalog.
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

STYLE_RULES = [
    (("wood", "oak", "ไม้", "walnut", "natural"), ["minimal", "japandi", "scandinavian", "contemporary"]),
    (("rattan", "หวาย", "jute", "ปอ"), ["bohemian", "japandi", "wabi-sabi", "coastal"]),
    (("black", "dark", "เทาเข้ม", "ดำ", "metal", "steel"), ["modern", "industrial", "contemporary"]),
]
COLOR_TAGS = {
    "ขาว": "white", "เทา": "grey", "เทาอ่อน": "light grey", "เทาเข้ม": "dark grey", "ดำ": "black", "เบจ": "beige",
    "ครีม": "cream", "น้ำตาล": "brown", "ไม้": "wood", "โอ๊ค": "oak", "โอ๊ก": "oak", "ทอง": "gold", "เขียว": "green",
}


def product_from_page(html: str) -> dict | None:
    for block in re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', html, re.S):
        try:
            data = json.loads(block)
        except json.JSONDecodeError:
            continue
        for node in data if isinstance(data, list) else [data]:
            if isinstance(node, dict) and node.get("@type") == "Product":
                offers = node.get("offers") or {}
                offers = offers[0] if isinstance(offers, list) and offers else offers
                image = node.get("image")
                image = image[0] if isinstance(image, list) and image else image
                if offers.get("price") and image:
                    return {"name": node.get("name", ""), "sku": str(node.get("sku", "")), "price": round(float(offers["price"])), "image": image}
    return None


def og_title(html: str) -> str | None:
    match = re.search(r'<meta property="og:title" content="([^"]+)"', html)
    return match.group(1).strip() if match else None


def styles_for(name: str) -> list[str]:
    text = name.lower()
    for keywords, styles in STYLE_RULES:
        if any(keyword in text for keyword in keywords):
            return styles
    return ["minimal", "modern", "contemporary"]


def js_str(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def main() -> None:
    pairs = [arg.split("=", 1) for arg in sys.argv[1:] if "=" in arg]
    if not pairs:
        print(__doc__)
        return
    source = CATALOG.read_text(encoding="utf-8")
    entries = []
    with httpx.Client(headers=HEADERS, follow_redirects=True, timeout=30) as client:
        for category, url in pairs:
            product_id = "homepro-" + url.rstrip("/").split("/p/")[-1].split("?")[0]
            if f"'{product_id}'" in source:
                print(f"skip  {product_id}: already in catalog")
                continue
            try:
                response = client.get(url)
                response.raise_for_status()
            except httpx.HTTPError as error:
                print(f"skip  {url}: {error}")
                continue
            product = product_from_page(response.text)
            if not product:
                print(f"skip  {url}: no product data on page")
                continue
            title = og_title(response.text) or product["name"]
            tags = sorted({english for thai, english in COLOR_TAGS.items() if thai in title} | {english for thai, english in COLOR_TAGS.items() if english in product["name"].lower()})
            clean_url = url.split("?")[0]
            entries.append(
                "  {\n"
                f"    id: {js_str(product_id)}, sku: {js_str(product['sku'])}, category: {js_str(category)},\n"
                f"    name: {js_str(title)}, store: 'HomePro', price: {product['price']}, match: 85,\n"
                f"    size: {js_str(product['name'])}, styles: {json.dumps(styles_for(title + ' ' + product['name']))}, tags: {json.dumps(tags, ensure_ascii=False)},\n"
                f"    url: {js_str(clean_url)},\n"
                f"    image_url: {js_str(product['image'])},\n"
                "  },\n"
            )
            print(f"add   {product_id}: {title} — ฿{product['price']}")
            time.sleep(1.0)

    if entries:
        updated = re.sub(r"\n\]\n", "\n" + "".join(entries) + "]\n", source, count=1)
        updated = re.sub(r"CATALOG_VERIFIED_AT = '[^']*'", f"CATALOG_VERIFIED_AT = '{date.today().isoformat()}'", updated)
        CATALOG.write_text(updated, encoding="utf-8")
    print(f"\n{len(entries)} product(s) added")


if __name__ == "__main__":
    main()
