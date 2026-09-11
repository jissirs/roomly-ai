import asyncio

from app.core.config import get_settings
from app.services import ai_service


def test_object_detection_uses_the_configured_spatial_model(monkeypatch):
    captured = {}

    async def fake_ask_vision_json(_system_prompt, _user_prompt, _image_urls, model=None, temperature=0.2):
        captured["model"] = model
        captured["temperature"] = temperature
        return {"objects": []}

    monkeypatch.setattr(ai_service, "ask_vision_json", fake_ask_vision_json)

    asyncio.run(ai_service.detect_objects_in_room("https://example.com/room.png"))

    assert captured["model"] == get_settings().openai_detection_model
    assert captured["temperature"] == 0
