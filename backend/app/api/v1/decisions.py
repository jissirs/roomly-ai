from fastapi import APIRouter, Depends

from app.api.deps import get_access_token, get_current_user_id
from app.core.supabase_storage import upload_generated_image
from app.schemas.decision import (
    DecisionSuggestRequest,
    DecisionSuggestResponse,
    DetectObjectsRequest,
    DetectObjectsResponse,
    RegenerateObjectRequest,
)
from app.services import ai_service

router = APIRouter(prefix="/projects/{project_id}/decisions", tags=["decisions"])


@router.post("/detect", response_model=DetectObjectsResponse)
async def detect(
    project_id: str,
    payload: DetectObjectsRequest,
    _owner_id: str = Depends(get_current_user_id),
):
    objects = await ai_service.detect_objects_in_room(payload.image_url, payload.original_image_url)
    return {"objects": objects}


@router.post("/suggest", response_model=DecisionSuggestResponse)
async def suggest(
    project_id: str,
    payload: DecisionSuggestRequest,
    _owner_id: str = Depends(get_current_user_id),
):
    objects = await ai_service.suggest_object_decisions(
        room_type=payload.room_type,
        style=payload.style,
        budget=payload.budget,
        dimensions=payload.dimensions.model_dump() if payload.dimensions else None,
        requirements=payload.requirements,
        ai_instructions=payload.ai_instructions,
        detected_objects=payload.detected_objects,
    )
    return {"objects": objects}


@router.post("/regenerate")
async def regenerate_selected_object(
    project_id: str,
    payload: RegenerateObjectRequest,
    _owner_id: str = Depends(get_current_user_id),
    access_token: str = Depends(get_access_token),
):
    image_bytes = await ai_service.regenerate_selected_object(
        image_url=payload.image_url,
        object_name=payload.object_name,
        category=payload.category,
        outlines=payload.outlines,
        action=payload.action,
        instruction=payload.instruction,
        style=payload.style,
        budget=payload.budget,
    )
    image_url = await upload_generated_image(access_token, project_id, image_bytes)
    return {"image_url": image_url}
