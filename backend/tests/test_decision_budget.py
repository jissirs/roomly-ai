import asyncio

from app.services import ai_service


def test_decision_suggestions_never_exceed_room_budget(monkeypatch):
    async def fake_ask_json(*_args, **_kwargs):
        return {
            "objects": [
                {"id": "sofa", "score": 80, "scores": [20, 20, 15, 15, 10], "decision": "keep", "reason": "เหมาะกับห้อง"},
                {"id": "table", "score": 35, "scores": [10, 10, 5, 5, 5], "decision": "replace", "reason": "ควรเปลี่ยน"},
                {"id": "lamp", "score": 20, "scores": [5, 5, 5, 3, 2], "decision": "keep", "reason": "พอใช้ได้"},
            ]
        }

    monkeypatch.setattr(ai_service, "ask_json", fake_ask_json)
    detected = [
        {"id": "sofa", "name": "โซฟา", "category": "sofa", "price": 7000},
        {"id": "table", "name": "โต๊ะ", "category": "table", "price": 4000},
        {"id": "lamp", "name": "โคมไฟ", "category": "lamp", "price": 2000},
    ]

    result = asyncio.run(ai_service.suggest_object_decisions("living-room", "minimal", 8000, None, detected))
    price_by_id = {item["id"]: item["price"] for item in detected}
    total = sum(price_by_id[item["id"]] for item in result if item["decision"] != "remove")

    assert total <= 8000
    assert next(item for item in result if item["id"] == "sofa")["decision"] == "keep"

