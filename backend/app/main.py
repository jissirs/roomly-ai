import logging

import openai
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def check_production_settings() -> None:
    """Refuses to start in production with settings that would be unsafe or broken."""
    problems = []
    if not settings.supabase_url or not settings.supabase_publishable_key:
        problems.append("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set")
    if settings.ai_enabled and not settings.openai_api_key:
        problems.append("OPENAI_API_KEY must be set while AI_ENABLED is true")
    if not settings.cors_origin_list or any("localhost" in origin or "127.0.0.1" in origin for origin in settings.cors_origin_list):
        problems.append("CORS_ORIGINS must list only the deployed site origin(s), not localhost")
    if problems:
        raise RuntimeError("Unsafe production configuration: " + "; ".join(problems))


if settings.is_production:
    check_production_settings()

app = FastAPI(
    title="Roomly AI — AI Service",
    version="0.2.0",
    # The interactive docs list every route; keep them to development.
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    openapi_url=None if settings.is_production else "/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Cache-Control", "no-store")
    return response

app.include_router(api_router)


@app.exception_handler(RuntimeError)
async def missing_key_handler(_request: Request, error: RuntimeError):
    # Raised by app/core/openai_client.py when OPENAI_API_KEY isn't set.
    return JSONResponse(status_code=503, content={"detail": str(error)})


@app.exception_handler(openai.APIError)
async def openai_error_handler(_request: Request, error: openai.APIError):
    # Covers rate limits, insufficient quota, invalid key, etc. — surface as
    # 503 so the frontend can show "AI unavailable" instead of a raw 500.
    logger.warning("OpenAI request failed: %s", error)
    detail = str(error) if not settings.is_production else "บริการ AI ใช้งานไม่ได้ชั่วคราว กรุณาลองใหม่ภายหลัง"
    return JSONResponse(status_code=503, content={"detail": detail})


@app.get("/health")
async def health():
    return {"status": "ok", "ai_enabled": settings.ai_enabled}
