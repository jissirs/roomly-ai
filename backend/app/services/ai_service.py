"""AI-backed vision, generation, and reasoning — all on OpenAI.

Three capabilities (see app/core/openai_client.py):

- detect_objects_in_room(): VISION + SEGMENTATION — compares the original
  and generated room semantically, then traces the new furniture locally.

- generate_room(): the before/after room IMAGE for the "AI Generate" step
  (gpt-image-1). When the user's original room photo is available, this
  edits that photo directly (images.edit) instead of generating an
  unrelated new image from text alone.

- suggest_object_decisions(): TEXT reasoning — scoring each detected object
  and recommending keep/replace/remove (gpt-4o-mini).
"""

import re
from typing import Any

import cv2
import httpx
import numpy as np
import random

from app.core.config import get_settings
from app.core.openai_client import ask_json, ask_vision_json, edit_image, edit_image_region, generate_image
from app.services.object_segmentation import segment_detected_objects

SCORE_LABELS = ["Function", "Space", "Budget", "Style", "Availability"]
SCORE_MAX = [30, 25, 20, 15, 10]

_HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")

ROOM_STYLE_IDS = (
    "minimal",
    "japandi",
    "modern",
    "scandinavian",
    "contemporary",
    "luxury",
    "industrial",
    "mid-century",
    "classic",
    "bohemian",
    "coastal",
    "wabi-sabi",
)


async def recommend_room_styles(image: str, room_type: str | None = None) -> dict[str, Any]:
    """Score the source room, then return one relevant but varied set of six styles."""

    system_prompt = (
        "You are an interior design style analyst. Inspect the ORIGINAL room photo, "
        "including its daylight, room scale, architecture, fixed finishes, existing "
        "colours and materials. Score how feasible each allowed style would be for a "
        "redesign that keeps the architecture unchanged. Return all 12 styles exactly "
        "once. Give each a fit score from 1 to 100 and a concise Thai reason grounded "
        "in something visible in this specific photo. Do not invent dimensions.\n\n"
        "For each style, also propose a palette and materials suited to redesigning "
        "THIS specific room (not a generic textbook palette for the style) — pick "
        "colours that would actually work with this room's existing light, fixed "
        "finishes (walls, floor) and scale: \"palette\": exactly 3 hex colour codes "
        "(e.g. \"#a68a64\") ordered primary, secondary, accent; \"materials\": "
        "exactly 2 short material/texture names (English, e.g. \"Light oak\", "
        "\"Linen\").\n\n"
        "Allowed style ids: "
        + ", ".join(ROOM_STYLE_IDS)
        + '. Respond ONLY as JSON: {"analysis": str (one concise Thai sentence), '
        '"styles": [{"id": str, "fit": int, "reason": str, "palette": [str, str, str], '
        '"materials": [str, str]}]}.'
    )
    user_prompt = f"Analyze this original {room_type or 'room'} photo and score the allowed styles."
    result = await ask_vision_json(
        system_prompt,
        user_prompt,
        image,
        model=get_settings().openai_vision_model,
        temperature=0.45,
    )

    allowed = set(ROOM_STYLE_IDS)
    scored_by_id: dict[str, dict[str, Any]] = {}
    for candidate in result.get("styles", []):
        style_id = str(candidate.get("id", "")).strip().lower()
        if style_id not in allowed or style_id in scored_by_id:
            continue
        try:
            fit = max(1, min(100, int(candidate.get("fit", 1))))
        except (TypeError, ValueError):
            fit = 1

        palette = candidate.get("palette")
        valid_palette = (
            [str(color) for color in palette]
            if isinstance(palette, list) and len(palette) == 3 and all(_HEX_COLOR_RE.match(str(c)) for c in palette)
            else None
        )
        materials = candidate.get("materials")
        valid_materials = (
            [str(material) for material in materials[:2]]
            if isinstance(materials, list) and len(materials) >= 2
            else None
        )

        scored_by_id[style_id] = {
            "id": style_id,
            "fit": fit,
            "reason": str(candidate.get("reason") or "เหมาะสำหรับทดลองกับพื้นที่นี้"),
            "palette": valid_palette,
            "materials": valid_materials,
        }

    # Keep the endpoint useful if the model omitted an id, while making it
    # explicit that the fallback entry has no image-grounded confidence.
    # No palette/materials here — frontend falls back to that style's own
    # generic defaults when these are absent.
    for style_id in ROOM_STYLE_IDS:
        scored_by_id.setdefault(
            style_id,
            {"id": style_id, "fit": 25, "reason": "ตัวเลือกสำรองสำหรับทดลองเปรียบเทียบ", "palette": None, "materials": None},
        )

    ranked = sorted(scored_by_id.values(), key=lambda item: item["fit"], reverse=True)
    selected = [ranked[0]]
    pool = ranked[1:]
    randomizer = random.SystemRandom()
    while pool and len(selected) < 6:
        # Cubing the score strongly favours image-compatible styles without
        # making every request return the same fixed top-six list.
        weights = [max(1, item["fit"]) ** 3 for item in pool]
        chosen = randomizer.choices(pool, weights=weights, k=1)[0]
        selected.append(chosen)
        pool.remove(chosen)

    return {
        "analysis": str(result.get("analysis") or "สุ่มสไตล์จากองค์ประกอบที่มองเห็นในภาพต้นฉบับ"),
        "styles": selected,
    }


async def detect_objects_in_room(image_url: str, original_image_url: str | None = None) -> list[dict[str, Any]]:
    """Asks gpt-4o-mini to list the furniture/decor to show as hotspots.

    Returns items shaped like frontend's OBJECTS array in DecisionPage.jsx.
    GPT supplies semantic labels/prices; local YOLOE instance segmentation
    supplies the 0-100 outline, centre, and derived bounding box on the AFTER
    image actually shown on the Decision page.

    When `original_image_url` (the user's pre-redesign photo) is given,
    this compares both photos and returns ONLY items gpt-image-1 newly
    added during the redesign — furniture that was already in the original
    room is skipped, since the point of this screen is deciding what to do
    with what the AI just introduced, not re-litigating existing items.
    Without it, falls back to listing everything visible in `image_url`.

    Objects for which the segmenter cannot produce a mask are omitted instead
    of showing a guessed outline on the wrong region.
    """
    if original_image_url:
        system_prompt = (
            "You are an interior design assistant reviewing an AI room "
            "redesign for a hotspot UI. You are given two photos of the same "
            "room: image 1 is the BEFORE (original, empty or lightly "
            "furnished), image 2 is the AFTER (AI-redesigned). Compare them "
            "and list ONLY the furniture/decor items that are newly present "
            "in the AFTER image and were NOT in the BEFORE image (sofa, "
            "table, chair, cabinet, curtain, plant, rug, lamp, mirror, etc). "
            "Do not list anything that was already visible in the BEFORE "
            "image, even if it moved or looks slightly different. Inspect the "
            "entire AFTER image, including its edges and smaller decor, and "
            "list every clearly new distinct item, up to 10 items. Skip anything "
            "you're not confident is genuinely new. For each item estimate its centre "
            "as anchor [x,y] and loose extent as coarse_box [left,top,right,bottom], "
            "all in percentages from 0 to 100 of the AFTER image. These approximate "
            "locations are only used to choose the right segmentation instance.\n\n"
            "Also estimate a reasonable market price in Thai Baht for each item. "
            "For product matching, describe what is visibly present with 3-6 short "
            "visual tags covering colour, material, shape or finish (for example "
            "beige, wood, curved, linen). Do not invent a hidden property.\n\n"
            "Respond ONLY as JSON: {\"objects\": [{\"id\": str (short slug, e.g. "
            "\"sofa\"), \"name\": str (Thai), \"category\": str (English, e.g. "
            "\"Sofa\"), \"price\": int, \"visual_tags\": [str], "
            "\"anchor\": [number, number], \"coarse_box\": [number, number, number, number]}]}"
        )
        user_prompt = "Image 1 (BEFORE) and image 2 (AFTER) of the same room — list what's new:"
        image_urls = [original_image_url, image_url]
    else:
        system_prompt = (
            "You are an interior design assistant analyzing a room photo for a "
            "hotspot UI. Identify the distinct furniture and decor items clearly "
            "visible in this photo (sofa, table, chair, cabinet, curtain, plant, "
            "rug, lamp, mirror, etc). Inspect the full image and list at most 10 items, most prominent first, "
            "and skip anything you're not confident is really in the photo. For each "
            "item estimate its centre as anchor [x,y] and loose extent as coarse_box "
            "[left,top,right,bottom], all in percentages from 0 to 100. These locations "
            "are only used to choose the correct segmentation instance.\n\n"
            "Also estimate a reasonable market price in Thai Baht for each item. "
            "For product matching, describe what is visibly present with 3-6 short "
            "visual tags covering colour, material, shape or finish (for example "
            "beige, wood, curved, linen). Do not invent a hidden property.\n\n"
            "Respond ONLY as JSON: {\"objects\": [{\"id\": str (short slug, e.g. "
            "\"sofa\"), \"name\": str (Thai), \"category\": str (English, e.g. "
            "\"Sofa\"), \"price\": int, \"visual_tags\": [str], "
            "\"anchor\": [number, number], \"coarse_box\": [number, number, number, number]}]}"
        )
        user_prompt = "Detect the furniture in this room:"
        image_urls = image_url

    result = await ask_vision_json(
        system_prompt,
        user_prompt,
        image_urls,
        model=get_settings().openai_detection_model,
        temperature=0,
    )
    objects = result.get("objects", [])

    if objects:
        try:
            async with httpx.AsyncClient(timeout=30) as http_client:
                after_response = await http_client.get(image_url)
                after_response.raise_for_status()
            import asyncio

            objects = await asyncio.to_thread(
                segment_detected_objects,
                after_response.content,
                objects,
            )
        except (httpx.HTTPError, ImportError, OSError, RuntimeError, ValueError):
            # Wrong shapes are more harmful than missing ones in this UI.  The
            # frontend will show its demo fallback when local segmentation is
            # unavailable instead of drawing guessed coordinates over the room.
            return []
    return objects


async def generate_room(
    style: str,
    ai_instructions: str | None,
    image_url: str | None = None,
    requirements: list[str] | None = None,
    budget: int | None = None,
    products: list[dict[str, str]] | None = None,
) -> bytes:
    """Generates a redesigned version of the room and returns raw PNG bytes.

    `products` — real catalog items ({name, category, image_url}) to furnish
    the room with. Their photos are sent as reference images so the result
    shows those exact products (no after-the-fact "closest match" needed).

    When `image_url` (the user's uploaded room photo) is given, this edits
    that photo directly with gpt-image-1 so the result reflects the user's
    actual room. Without it, falls back to generating a new image from the
    text prompt alone. The caller is expected to persist the bytes (see
    app/core/supabase_storage.py) and hand the frontend a URL back.

    `requirements` — the checkboxes the user picked when creating the
    project (e.g. "เพิ่มพื้นที่จัดเก็บ", "มีมุมทำงาน") — folded into the
    prompt so the redesign actually reflects what the room needs to do, not
    just its style.
    """
    prompt = (
        f"Redesign the furniture and decor of this exact room in {style} style, "
        f"tastefully furnished, high quality, photorealistic. Keep this specific "
        f"room recognizably the same: preserve the room's walls, windows, doors, "
        f"floor, ceiling, wall color, room shape and proportions, and the exact "
        f"camera angle and perspective of the original photo. Match the original "
        f"photo's lighting direction and color temperature. Only change movable "
        f"furniture and decor items — do not alter the architecture or add/remove "
        f"windows or doors."
        if image_url
        else (
            f"A photorealistic interior design photo of a living space redesigned "
            f"in {style} style, tastefully furnished, natural lighting, high quality."
        )
    )
    if requirements:
        prompt += f" The room must also satisfy: {', '.join(requirements)}."
    reference_images: list[tuple[str, bytes, str]] = []
    if image_url and products:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as product_client:
            for index, product in enumerate(products[:8], start=1):
                try:
                    reply = await product_client.get(product["image_url"])
                    reply.raise_for_status()
                except (httpx.HTTPError, KeyError):
                    continue
                mime = reply.headers.get("content-type", "image/jpeg").split(";")[0]
                extension = "png" if "png" in mime else "webp" if "webp" in mime else "jpg"
                reference_images.append((f"product{index}.{extension}", reply.content, mime))
                product["_ref"] = str(len(reference_images) + 1)
        used = [item for item in products[:8] if item.get("_ref")]
        listing = "; ".join(f"image {item['_ref']} = {item['name']} ({item['category']})" for item in used)
        prompt += (
            " IMPORTANT: image 1 is the room. The other images are REAL products for sale. "
            f"Furnish the room using exactly these products: {listing}. Reproduce each product's "
            "exact shape, colour, material and proportions faithfully and place each one naturally "
            "and at realistic scale. Do not invent other major furniture that is not in this list."
        )
    elif budget is not None:
        prompt += (
            f" HARD BUDGET LIMIT: the complete furniture and decor concept must be "
            f"realistically achievable within THB {budget:,}; use fewer, practical, "
            "budget-appropriate items and never propose a concept whose total cost "
            "would exceed this amount."
        )
    if ai_instructions:
        prompt += f" Additional requirements: {ai_instructions}."

    if image_url:
        async with httpx.AsyncClient(timeout=30) as http_client:
            response = await http_client.get(image_url)
            response.raise_for_status()
            image_bytes = response.content
        return await edit_image(prompt, image_bytes, reference_images or None)

    return await generate_image(prompt)


def build_object_edit_mask(
    image_bytes: bytes,
    outlines: list[list[list[float]]],
) -> tuple[bytes, bytes]:
    """Returns a PNG source and same-sized mask transparent at the selection."""
    image = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_UNCHANGED)
    if image is None:
        raise ValueError("The generated room image could not be decoded")

    height, width = image.shape[:2]
    editable = np.zeros((height, width), dtype=np.uint8)
    for outline in outlines:
        if len(outline) < 3:
            continue
        points = np.array([
            [
                int(np.clip(float(point[0]), 0, 100) * (width - 1) / 100),
                int(np.clip(float(point[1]), 0, 100) * (height - 1) / 100),
            ]
            for point in outline
            if len(point) >= 2
        ], dtype=np.int32)
        if len(points) >= 3:
            cv2.fillPoly(editable, [points], 255)

    if not np.any(editable):
        raise ValueError("The selected object does not contain a usable outline")

    # Give the image model a small context margin to avoid visible seams.
    kernel_size = max(5, int(min(width, height) * 0.025))
    if kernel_size % 2 == 0:
        kernel_size += 1
    editable = cv2.dilate(editable, np.ones((kernel_size, kernel_size), np.uint8))
    alpha = 255 - editable
    mask = np.dstack((np.full((height, width, 3), 255, dtype=np.uint8), alpha))

    source_ok, source_png = cv2.imencode(".png", image)
    mask_ok, mask_png = cv2.imencode(".png", mask)
    if not source_ok or not mask_ok:
        raise ValueError("Could not prepare the selected image area")
    return source_png.tobytes(), mask_png.tobytes()


async def regenerate_selected_object(
    image_url: str,
    object_name: str,
    category: str,
    outlines: list[list[list[float]]],
    action: str,
    instruction: str | None = None,
    style: str | None = None,
    budget: int | None = None,
) -> bytes:
    """Regenerates or removes one selected object without redesigning the room."""
    async with httpx.AsyncClient(timeout=30) as http_client:
        response = await http_client.get(image_url)
        response.raise_for_status()
    source_png, mask_png = build_object_edit_mask(response.content, outlines)

    if action == "remove":
        requested_change = (
            f"Remove the selected {category} named {object_name} completely and "
            "reconstruct the wall, floor, shadows and any background naturally. "
            "Do not add a replacement object."
        )
    else:
        requested_change = (
            f"Replace only the selected {category} named {object_name} with a new "
            f"version. User direction: {instruction or 'a practical piece that fits the room'}. "
            f"Keep it consistent with the {style or 'existing'} interior style"
            + (f" and visually plausible for a budget up to {budget:,} Thai Baht." if budget else ".")
        )

    prompt = (
        f"Edit only the transparent selected area of this room image. {requested_change} "
        "Preserve the camera, architecture, lighting, composition, all unselected "
        "furniture, and every opaque pixel as faithfully as possible. Blend the edited "
        "area photorealistically with correct perspective and contact shadows."
    )
    return await edit_image_region(prompt, source_png, mask_png)


async def suggest_object_decisions(
    room_type: str,
    style: str,
    budget: int,
    ai_instructions: str | None,
    detected_objects: list[dict[str, Any]],
    dimensions: dict[str, Any] | None = None,
    requirements: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Asks OpenAI to score each detected object and recommend keep/replace/remove.

    `detected_objects` — one dict per item, at minimum {id, name, category, price}
    (from detect_objects_in_room() above).

    `dimensions` — {width, length, height} in metres, as typed on Create
    Project (strings, any of them may be blank) — grounds the Space score in
    the room's actual floor area instead of a guess.

    `requirements` — the checkboxes the user picked on Create Project (e.g.
    "เพิ่มพื้นที่จัดเก็บ", "มีมุมทำงาน") — informs the Function score.

    Returns a list shaped like frontend's OBJECTS array in DecisionPage.jsx:
    {id, score (0-100), scores ([Function, Space, Budget, Style, Availability]),
    reason, decision ("keep" | "replace" | "remove")}.
    """
    system_prompt = (
        "You are an interior design assistant. For each furniture object given, "
        "score it on five criteria: Function (0-30) — how well it serves the "
        "room's stated requirements, Space (0-25) — how well it fits the room's "
        "actual floor area, Budget (0-20), Style (0-15), Availability (0-10) — "
        "these must sum to the object's overall score out of 100. Then recommend "
        "one decision: \"keep\", \"replace\", or \"remove\", and a one-sentence "
        "Thai reason. The room budget is a HARD LIMIT: the sum of every item marked "
        "keep or replace must never exceed the supplied budget, even by THB 1. If "
        "necessary, mark lower-scoring nonessential items remove until the estimated "
        "room total is within budget. "
        "Respond ONLY as JSON: {\"objects\": [{\"id\": str, \"score\": int, "
        "\"scores\": [int, int, int, int, int], \"decision\": str, \"reason\": str}]}"
    )

    width = (dimensions or {}).get("width")
    length = (dimensions or {}).get("length")
    height = (dimensions or {}).get("height")
    size_parts = [f"{width}m (width)" if width else None, f"{length}m (length)" if length else None, f"{height}m (height)" if height else None]
    size_line = ", ".join(part for part in size_parts if part) or "(not provided)"

    user_prompt = (
        f"Room type: {room_type}\nRoom size: {size_line}\nStyle: {style}\n"
        f"Budget: THB {budget}\nRequirements: {', '.join(requirements) if requirements else '(none)'}\n"
        f"Extra notes: {ai_instructions or '(none)'}\n"
        f"Objects: {detected_objects}"
    )

    result = await ask_json(system_prompt, user_prompt)
    suggestions = result.get("objects", [])

    # Enforce the hard limit in code as well as in the model prompt. Replacement
    # prices are not known yet, so reserve the detected item's estimated price.
    prices = {str(item.get("id")): max(0, int(item.get("price") or 0)) for item in detected_objects}
    estimated_total = sum(
        prices.get(str(item.get("id")), 0)
        for item in suggestions
        if item.get("decision") != "remove"
    )
    if estimated_total > budget:
        removable = sorted(
            (item for item in suggestions if item.get("decision") != "remove"),
            key=lambda item: int(item.get("score") or 0),
        )
        for item in removable:
            if estimated_total <= budget:
                break
            item_id = str(item.get("id"))
            item["decision"] = "remove"
            item["reason"] = "นำออกเพื่อให้งบรวมของทั้งห้องไม่เกินงบประมาณที่กำหนด"
            estimated_total -= prices.get(item_id, 0)

    return suggestions
