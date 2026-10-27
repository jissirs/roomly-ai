import re
from functools import lru_cache

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import get_settings
from app.core.rate_limit import RateLimitExceeded, UserRateLimiter

_UUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")

_bearer_scheme = HTTPBearer()


@lru_cache
def _get_http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=10)


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
) -> str:
    """Validates the caller's Supabase access token by asking Supabase who it belongs to.

    Avoids needing Supabase's JWT signing secret in this service — one extra
    network hop per request, acceptable for this app's traffic.
    """
    settings = get_settings()
    client = _get_http_client()

    response = await client.get(
        f"{settings.supabase_url}/auth/v1/user",
        headers={
            "Authorization": f"Bearer {credentials.credentials}",
            "apikey": settings.supabase_publishable_key,
        },
    )
    if response.status_code != 200:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")

    return response.json()["id"]


def get_access_token(credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme)) -> str:
    """The caller's raw Supabase access token — e.g. to forward to Supabase
    Storage so an upload happens under the user's own auth/RLS context."""
    return credentials.credentials


def require_ai_enabled() -> None:
    """Maintenance switch: refuse every AI route while AI_ENABLED=false."""
    if not get_settings().ai_enabled:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "ระบบ AI ปิดปรับปรุงชั่วคราว กรุณาลองใหม่ภายหลัง")


@lru_cache
def get_ai_limiter() -> UserRateLimiter:
    settings = get_settings()
    return UserRateLimiter(settings.ai_requests_per_minute, settings.ai_requests_per_day)


def limit_ai_usage(user_id: str = Depends(get_current_user_id)) -> None:
    """Caps how many paid AI calls one account can trigger."""
    try:
        get_ai_limiter().check(user_id)
    except RateLimitExceeded as exceeded:
        message = "ใช้ AI ครบโควตาของวันนี้แล้ว กรุณาลองใหม่พรุ่งนี้" if exceeded.scope == "day" else "เรียก AI ถี่เกินไป กรุณารอสักครู่แล้วลองใหม่"
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, message, headers={"Retry-After": str(exceeded.retry_after)}) from exceeded


async def require_project_owner(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
    access_token: str = Depends(get_access_token),
) -> str:
    """The caller must own `project_id`; row-level security does the checking.

    Asks Supabase for the project under the caller's own token, so a project
    that belongs to someone else (or does not exist) comes back empty.
    """
    if not _UUID.match(project_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    settings = get_settings()
    response = await _get_http_client().get(
        f"{settings.supabase_url}/rest/v1/projects",
        params={"id": f"eq.{project_id}", "select": "id"},
        headers={"Authorization": f"Bearer {access_token}", "apikey": settings.supabase_publishable_key},
    )
    if response.status_code != 200 or not response.json():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return user_id


def require_storage_url(url: str | None, field: str = "image_url") -> None:
    """Only our own Supabase Storage URLs may be fetched or forwarded to OpenAI."""
    if url and not url.startswith(f"{get_settings().supabase_url}/storage/v1/object/public/"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{field} must be a Supabase Storage URL")
