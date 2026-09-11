"""Uploads AI-generated room images to Supabase Storage.

Reuses the same `room-images` bucket the frontend uploads original room
photos to (see frontend/src/lib/imageStore.js), so no new bucket or secret
key is needed. Forwards the caller's own Supabase access token rather than
a service-role key, so uploads respect the same auth/RLS model the
frontend's direct uploads already do.
"""

import uuid

import httpx

from app.core.config import get_settings

BUCKET = "room-images"


async def upload_generated_image(access_token: str, project_id: str, image_bytes: bytes) -> str:
    """Uploads one PNG and returns its public URL.

    Stored under `generated/{project_id}/{uuid}.png` — a sibling of the
    `{project_id}/...` prefix the frontend uses for uploaded photos, so a
    generated result never shows up when the frontend lists a project's
    original room images (frontend/src/lib/imageStore.js lists a project's
    photos with a flat, non-recursive `storage.list(project_id)`).
    """
    settings = get_settings()
    path = f"generated/{project_id}/{uuid.uuid4()}.png"

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            f"{settings.supabase_url}/storage/v1/object/{BUCKET}/{path}",
            content=image_bytes,
            headers={
                "apikey": settings.supabase_publishable_key,
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "image/png",
            },
        )
        response.raise_for_status()

    return f"{settings.supabase_url}/storage/v1/object/public/{BUCKET}/{path}"
