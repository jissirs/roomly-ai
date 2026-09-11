from fastapi import APIRouter

from app.api.v1 import decisions, generate, styles

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(decisions.router)
api_router.include_router(generate.router)
api_router.include_router(styles.router)
