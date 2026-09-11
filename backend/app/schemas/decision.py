from typing import Any, Literal

from pydantic import BaseModel


class RoomDimensions(BaseModel):
    # Stored/typed as strings on the frontend (raw <input> values, e.g. "3.0"
    # or "" when left blank) — kept as str here rather than float so an
    # empty string doesn't fail validation.
    width: str | None = None
    length: str | None = None
    height: str | None = None


class DecisionSuggestRequest(BaseModel):
    room_type: str
    style: str
    budget: int
    dimensions: RoomDimensions | None = None
    requirements: list[str] | None = None
    ai_instructions: str | None = None
    detected_objects: list[dict[str, Any]]


class ObjectDecision(BaseModel):
    id: str
    score: int
    scores: list[int]
    decision: str
    reason: str


class DecisionSuggestResponse(BaseModel):
    objects: list[ObjectDecision]


class DetectObjectsRequest(BaseModel):
    image_url: str
    original_image_url: str | None = None


class DetectedObject(BaseModel):
    id: str
    name: str
    category: str
    price: int
    x: float
    y: float
    # Bounding box (0-100% of image width/height), kept as a fallback for
    # placing the decision badge and for items with no outline.
    box_x_min: float | None = None
    box_x_max: float | None = None
    box_y_min: float | None = None
    box_y_max: float | None = None
    # Rough polygon (0-100% of image width/height per point) tracing the
    # object's silhouette, for a shape-hugging outline instead of a plain
    # rectangle. Still a VLM guess, not a pixel-precise segmentation mask —
    # a real segmentation model would be needed for that.
    outline: list[list[float]] | None = None
    outlines: list[list[list[float]]] | None = None
    detection_confidence: float | None = None
    visual_tags: list[str] | None = None
    # Approximate VLM location is used only to choose the correct same-class
    # segmentation instance. The frontend still draws the pixel mask outline.
    anchor: list[float] | None = None
    coarse_box: list[float] | None = None


class DetectObjectsResponse(BaseModel):
    objects: list[DetectedObject]


class RegenerateObjectRequest(BaseModel):
    image_url: str
    object_name: str
    category: str
    outlines: list[list[list[float]]]
    action: Literal["replace", "remove"]
    instruction: str | None = None
    style: str | None = None
    budget: int | None = None
