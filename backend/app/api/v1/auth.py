"""Simple password reset: no email/OTP, just "does this email exist?" then set a new password.

INSECURE BY DESIGN — anyone who knows an email can take over that account.
Acceptable only for a prototype/demo. Uses Supabase's admin API, so it needs
SUPABASE_SERVICE_ROLE_KEY in backend/.env (never expose that key to the frontend).
"""

import time
from collections import defaultdict, deque

import httpx
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.core.config import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])

_RATE_LIMIT = 10
_RATE_WINDOW_SECONDS = 600
_attempts: dict[str, deque[float]] = defaultdict(deque)


class EmailPayload(BaseModel):
    email: str = Field(min_length=3, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class ResetPayload(EmailPayload):
    new_password: str = Field(min_length=8, max_length=72)


def _rate_limit(request: Request) -> None:
    client = request.client.host if request.client else "unknown"
    now = time.monotonic()
    window = _attempts[client]
    while window and now - window[0] > _RATE_WINDOW_SECONDS:
        window.popleft()
    if len(window) >= _RATE_LIMIT:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "ลองบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่")
    window.append(now)


def _admin_headers() -> dict[str, str]:
    settings = get_settings()
    if not settings.supabase_service_role_key:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY ที่ backend")
    key = settings.supabase_service_role_key
    return {"apikey": key, "Authorization": f"Bearer {key}"}


async def _find_user_id(client: httpx.AsyncClient, email: str) -> str | None:
    settings = get_settings()
    page = 1
    while True:
        response = await client.get(
            f"{settings.supabase_url}/auth/v1/admin/users",
            params={"page": page, "per_page": 200},
            headers=_admin_headers(),
        )
        response.raise_for_status()
        users = response.json().get("users", [])
        for user in users:
            if str(user.get("email", "")).lower() == email.lower():
                return user["id"]
        if len(users) < 200:
            return None
        page += 1


@router.post("/forgot/check")
async def check_email(payload: EmailPayload, request: Request):
    _rate_limit(request)
    async with httpx.AsyncClient(timeout=15) as client:
        exists = await _find_user_id(client, payload.email) is not None
    return {"exists": exists}


@router.post("/forgot/reset")
async def reset_password(payload: ResetPayload, request: Request):
    _rate_limit(request)
    settings = get_settings()
    async with httpx.AsyncClient(timeout=15) as client:
        user_id = await _find_user_id(client, payload.email)
        if user_id is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "ไม่พบอีเมลนี้ในระบบ")
        response = await client.put(
            f"{settings.supabase_url}/auth/v1/admin/users/{user_id}",
            json={"password": payload.new_password},
            headers=_admin_headers(),
        )
        if response.status_code >= 400:
            detail = response.json().get("msg") or response.json().get("message") or "ตั้งรหัสผ่านไม่สำเร็จ"
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail)
    return {"ok": True}
