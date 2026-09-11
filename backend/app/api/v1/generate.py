from fastapi import APIRouter, Depends, Query

from app.api.deps import get_access_token, get_current_user_id
from app.core.supabase_storage import upload_generated_image
from app.services import ai_service

router = APIRouter(prefix="/projects/{project_id}/generate", tags=["generate"])


@router.post("")
async def generate(
    project_id: str,
    style: str,
    ai_instructions: str | None = None,
    source_image_url: str | None = None,
    requirements: list[str] | None = Query(None),
    budget: int | None = None,
    _owner_id: str = Depends(get_current_user_id),
    access_token: str = Depends(get_access_token),
):
    image_bytes = await ai_service.generate_room(style, ai_instructions, source_image_url, requirements, budget)
    image_url = await upload_generated_image(access_token, project_id, image_bytes)
    return {"image_url": image_url}
