from fastapi import APIRouter, Depends

from app.api.deps import get_current_user_id
from app.schemas.style import StyleRecommendRequest, StyleRecommendResponse
from app.services.ai_service import recommend_room_styles


router = APIRouter(prefix="/styles", tags=["styles"])


@router.post("/recommend", response_model=StyleRecommendResponse)
async def recommend(
    payload: StyleRecommendRequest,
    _owner_id: str = Depends(get_current_user_id),
):
    return await recommend_room_styles(payload.image, payload.room_type)
