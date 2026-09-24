from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.api.deps import get_access_token, get_current_user_id
from app.core.supabase_storage import upload_generated_image
from app.services import ai_service

router = APIRouter(prefix="/projects/{project_id}/generate", tags=["generate"])


class ProductRef(BaseModel):
    id: str
    name: str
    category: str
    image_url: str


class GenerateBody(BaseModel):
    products: list[ProductRef] | None = None


@router.post("")
async def generate(
    project_id: str,
    style: str,
    ai_instructions: str | None = None,
    source_image_url: str | None = None,
    requirements: list[str] | None = Query(None),
    budget: int | None = None,
    body: GenerateBody | None = None,
    _owner_id: str = Depends(get_current_user_id),
    access_token: str = Depends(get_access_token),
):
    image_bytes = await ai_service.generate_room(style, ai_instructions, source_image_url, requirements, budget, [item.model_dump() for item in body.products] if body and body.products else None)
    image_url = await upload_generated_image(access_token, project_id, image_bytes)
    return {"image_url": image_url}
