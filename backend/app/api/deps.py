from functools import lru_cache

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import get_settings

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
