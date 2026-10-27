from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.api.deps import get_access_token, require_project_owner, require_storage_url
from app.core.supabase_storage import upload_generated_image
from app.services import ai_service, price_service

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
    room_width: float | None = Query(None, gt=0, le=100),
    room_length: float | None = Query(None, gt=0, le=100),
    room_height: float | None = Query(None, gt=0, le=20),
    reference_room_url: str | None = None,
    body: GenerateBody | None = None,
    _owner_id: str = Depends(require_project_owner),
    access_token: str = Depends(get_access_token),
):
    require_storage_url(source_image_url, "source_image_url")
    require_storage_url(reference_room_url, "reference_room_url")
    for item in (body.products if body and body.products else []):
        if not price_service.is_allowed_product_image_url(item.image_url):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "product image_url must be a product photo from IKEA or HomePro")
    image_bytes = await ai_service.generate_room(style, ai_instructions, source_image_url, requirements, budget, [item.model_dump() for item in body.products] if body and body.products else None, {"width": room_width, "length": room_length, "height": room_height}, reference_room_url)
    image_url = await upload_generated_image(access_token, project_id, image_bytes)
    return {"image_url": image_url}
