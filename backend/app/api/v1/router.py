from fastapi import APIRouter

from app.api.v1 import auth, decisions, generate, styles

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(decisions.router)
api_router.include_router(generate.router)
api_router.include_router(styles.router)
