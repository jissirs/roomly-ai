from fastapi.testclient import TestClient

from app.main import app


def test_local_vite_origin_can_call_api():
    response = TestClient(app).options(
        "/health",
        headers={
            "Origin": "http://127.0.0.1:5173",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"
