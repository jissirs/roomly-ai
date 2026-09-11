from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/core/config.py -> backend/
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    """App configuration, loaded from environment variables / .env.

    This backend only handles AI (OpenAI) now — auth, projects, images and
    the product catalog all live in Supabase, called directly from the
    frontend. See backend/README.md.
    """

    model_config = SettingsConfigDict(env_file=str(BACKEND_DIR / ".env"), env_file_encoding="utf-8", extra="ignore")

    cors_origins: str = "http://localhost:5173,http://localhost:5190"

    supabase_url: str = ""
    supabase_publishable_key: str = ""

    # gpt-4o-mini: cheapest OpenAI model that still reads images and does
    # text reasoning. gpt-image-1: supports images.edit, so it redesigns the
    # user's actual uploaded room photo instead of generating an unrelated
    # image from text alone (dall-e-2/3 can't edit a source photo).
    # quality="low" is gpt-image-1's cheapest tier (~$0.01/image at
    # 1024x1024, vs ~$0.04 at "medium" and ~$0.17 at "high" — OpenAI pricing,
    # check platform.openai.com/docs/pricing for current numbers).
    openai_api_key: str | None = None
    openai_vision_model: str = "gpt-4o-mini"
    # Bounding-box localization (Object Decision hotspots) needs sharper
    # spatial reasoning than gpt-4o-mini reliably gives — worth the extra
    # cost of the full gpt-4o here since a wildly misplaced box is worse
    # than a slightly pricier one that actually lands on the object.
    openai_detection_model: str = "gpt-4o"
    openai_image_model: str = "gpt-image-1"
    openai_image_size: str = "1024x1024"
    openai_image_quality: str = "low"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
