from fastapi import APIRouter, Depends

from app.api.deps import limit_ai_usage, require_ai_enabled
from app.api.v1 import decisions, generate, products, styles

api_router = APIRouter(prefix="/api/v1")
ai_guard = [Depends(require_ai_enabled), Depends(limit_ai_usage)]
api_router.include_router(decisions.router, dependencies=ai_guard)
api_router.include_router(generate.router, dependencies=ai_guard)
api_router.include_router(styles.router, dependencies=ai_guard)
api_router.include_router(products.router)

