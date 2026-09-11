"""Thin wrapper around the OpenAI SDK — the only AI provider now.

gpt-4o-mini (cheapest OpenAI model with vision) handles both text
reasoning and vision; gpt-image-1 handles image generation/editing so the
redesign can be based on the user's actual uploaded room photo.
"""

import base64
import json
from functools import lru_cache
from typing import Any

from openai import AsyncOpenAI

from app.core.config import get_settings


@lru_cache
def get_openai_client() -> AsyncOpenAI | None:
    settings = get_settings()
    if not settings.openai_api_key:
        return None
    return AsyncOpenAI(api_key=settings.openai_api_key)


async def ask_json(system_prompt: str, user_prompt: str) -> dict[str, Any]:
    """Sends a text-only prompt to gpt-4o-mini and parses the response as JSON."""
    client = get_openai_client()
    if client is None:
        raise RuntimeError("OPENAI_API_KEY is not set")

    settings = get_settings()
    response = await client.chat.completions.create(
        model=settings.openai_vision_model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.4,
    )
    content = response.choices[0].message.content
    return json.loads(content) if content else {}


async def ask_vision_json(
    system_prompt: str,
    user_prompt: str,
    image_urls: str | list[str],
    model: str | None = None,
    temperature: float = 0.2,
) -> dict[str, Any]:
    """Sends one or more images + prompt to a vision model and parses the response as JSON.

    Multiple images are sent as one user message (e.g. "before" then
    "after") so the model can compare them, rather than one call per image.
    `model` defaults to settings.openai_vision_model (gpt-4o-mini); pass a
    stronger model explicitly for tasks that need sharper spatial reasoning
    (see settings.openai_detection_model).
    """
    client = get_openai_client()
    if client is None:
        raise RuntimeError("OPENAI_API_KEY is not set")

    urls = [image_urls] if isinstance(image_urls, str) else image_urls

    settings = get_settings()
    response = await client.chat.completions.create(
        model=model or settings.openai_vision_model,
        messages=[
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_prompt},
                    *[
                        {"type": "image_url", "image_url": {"url": url, "detail": "high"}}
                        for url in urls
                    ],
                ],
            },
        ],
        response_format={"type": "json_object"},
        temperature=temperature,
    )
    content = response.choices[0].message.content
    return json.loads(content) if content else {}


async def generate_image(prompt: str) -> bytes:
    """Generates one image from a text prompt and returns raw PNG bytes.

    gpt-image-1 only returns base64 (no hosted URL like dall-e did) — the
    caller is expected to store these bytes somewhere (see
    app/core/supabase_storage.py) rather than hand base64 to the frontend.
    """
    client = get_openai_client()
    if client is None:
        raise RuntimeError("OPENAI_API_KEY is not set")

    settings = get_settings()
    response = await client.images.generate(
        model=settings.openai_image_model,
        prompt=prompt,
        size=settings.openai_image_size,
        quality=settings.openai_image_quality,
        n=1,
    )
    return base64.b64decode(response.data[0].b64_json)


async def edit_image(prompt: str, image_bytes: bytes) -> bytes:
    """Edits an existing room photo (gpt-image-1) and returns raw PNG bytes.

    Unlike generate_image(), this actually redesigns the pixels of the
    uploaded photo rather than producing an unrelated new image.
    input_fidelity="high" tells gpt-image-1 to stay close to the source
    photo's structure/details instead of drifting into a generic room —
    costs a bit more than the default ("low") but matters here since the
    whole point of editing (vs. generating) is a recognizable result.
    """
    client = get_openai_client()
    if client is None:
        raise RuntimeError("OPENAI_API_KEY is not set")

    settings = get_settings()
    response = await client.images.edit(
        model=settings.openai_image_model,
        image=("room.png", image_bytes, "image/png"),
        prompt=prompt,
        size=settings.openai_image_size,
        quality=settings.openai_image_quality,
        input_fidelity="high",
        n=1,
    )
    return base64.b64decode(response.data[0].b64_json)


async def edit_image_region(prompt: str, image_bytes: bytes, mask_bytes: bytes) -> bytes:
    """Edits only the transparent area of an RGBA PNG mask."""
    client = get_openai_client()
    if client is None:
        raise RuntimeError("OPENAI_API_KEY is not set")

    settings = get_settings()
    response = await client.images.edit(
        model=settings.openai_image_model,
        image=("room.png", image_bytes, "image/png"),
        mask=("selection-mask.png", mask_bytes, "image/png"),
        prompt=prompt,
        size=settings.openai_image_size,
        quality=settings.openai_image_quality,
        input_fidelity="high",
        n=1,
    )
    return base64.b64decode(response.data[0].b64_json)
