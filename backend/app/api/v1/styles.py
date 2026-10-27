from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_current_user_id, require_storage_url
from app.schemas.style import StyleRecommendRequest, StyleRecommendResponse
from app.services.ai_service import recommend_room_styles


# A downscaled analysis photo is ~100-400 KB; anything near this is not one.
MAX_DATA_URL_CHARS = 6_000_000

router = APIRouter(prefix="/styles", tags=["styles"])


@router.post("/recommend", response_model=StyleRecommendResponse)
async def recommend(
    payload: StyleRecommendRequest,
    _owner_id: str = Depends(get_current_user_id),
):
    if payload.image.startswith("data:image/"):
        if len(payload.image) > MAX_DATA_URL_CHARS:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "image is too large")
    else:
        require_storage_url(payload.image, "image")
    return await recommend_room_styles(payload.image, payload.room_type)
