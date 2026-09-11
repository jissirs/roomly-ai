import asyncio

from app.services import ai_service


def test_style_recommendation_keeps_best_fit_and_returns_unique_allowed_styles(monkeypatch):
    async def fake_ask_vision_json(*_args, **_kwargs):
        return {
            "analysis": "ห้องสว่างและมีวัสดุไม้",
            "styles": [
                {"id": style_id, "fit": 100 - index * 5, "reason": f"reason-{style_id}"}
                for index, style_id in enumerate(ai_service.ROOM_STYLE_IDS)
            ],
        }

    monkeypatch.setattr(ai_service, "ask_vision_json", fake_ask_vision_json)

    result = asyncio.run(ai_service.recommend_room_styles("data:image/jpeg;base64,abc", "living-room"))

    ids = [item["id"] for item in result["styles"]]
    assert result["analysis"] == "ห้องสว่างและมีวัสดุไม้"
    assert ids[0] == "minimal"
    assert len(ids) == 6
    assert len(set(ids)) == 6
    assert set(ids).issubset(set(ai_service.ROOM_STYLE_IDS))
