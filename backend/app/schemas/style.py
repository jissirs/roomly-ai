from pydantic import BaseModel


class StyleRecommendRequest(BaseModel):
    image: str
    room_type: str | None = None


class StyleRecommendation(BaseModel):
    id: str
    fit: int
    reason: str
    # Grounded in the actual photo (existing light, finishes, colours) —
    # not the style's generic textbook palette/materials.
    palette: list[str] | None = None
    materials: list[str] | None = None


class StyleRecommendResponse(BaseModel):
    analysis: str
    styles: list[StyleRecommendation]
