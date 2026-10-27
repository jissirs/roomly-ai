from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.deps import get_current_user_id
from app.services import price_service

router = APIRouter(prefix="/products", tags=["products"])


class PriceItem(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    url: str = Field(min_length=1, max_length=400)


class PriceRequest(BaseModel):
    items: list[PriceItem] = Field(max_length=12)


@router.post("/prices")
async def live_prices(payload: PriceRequest, _owner_id: str = Depends(get_current_user_id)):
    """Current price/availability of catalog products, read from the store's own page."""
    return {"prices": await price_service.get_prices([(item.id, item.url) for item in payload.items])}
