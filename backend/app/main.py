import openai
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(title="Roomly AI — AI Service", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.exception_handler(RuntimeError)
async def missing_key_handler(_request: Request, error: RuntimeError):
    # Raised by app/core/openai_client.py when OPENAI_API_KEY isn't set.
    return JSONResponse(status_code=503, content={"detail": str(error)})


@app.exception_handler(openai.APIError)
async def openai_error_handler(_request: Request, error: openai.APIError):
    # Covers rate limits, insufficient quota, invalid key, etc. — surface as
    # 503 so the frontend can show "AI unavailable" instead of a raw 500.
    return JSONResponse(status_code=503, content={"detail": f"OpenAI error: {error}"})


@app.get("/health")
async def health():
    return {"status": "ok"}
