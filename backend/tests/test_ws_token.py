"""Tests für GET /api/auth/ws-token — kurzlebiges WebSocket-Handshake-JWT.

Der Browser kann den httpOnly-Cookie nicht an einen cross-origin WebSocket
anhängen; der Client holt dieses Ticket same-origin und übergibt es im
Handshake via Sec-WebSocket-Protocol.
"""
import os
import tempfile

import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from fastapi.testclient import TestClient
from jose import jwt


@pytest.fixture(scope="module")
def client():
    """Isolierter TestClient mit Wegwerf-DB (Muster aus test_routes.py)."""
    db_fd, db_path = tempfile.mkstemp(suffix=".db", prefix="test_ws_token_")
    os.close(db_fd)
    os.environ["TRADING_DB_PATH"] = db_path
    os.environ.pop("DATABASE_URL", None)

    mock_nautilus = MagicMock()
    mock_nautilus.initialize = AsyncMock(return_value=None)
    mock_nautilus.get_positions = AsyncMock(return_value=[])

    with patch(
        "app.services.nautilus.client.get_execution_client",
        return_value=mock_nautilus,
    ):
        from app.main import app
        app.state.limiter.enabled = False
        with TestClient(app, raise_server_exceptions=False) as c:
            yield c
        app.state.limiter.enabled = True

    try:
        os.remove(db_path)
    except OSError:
        pass


def _login(client):
    resp = client.post(
        "/api/auth/token",
        data={"username": "admin", "password": "neural123"},
    )
    assert resp.status_code == 200, resp.text


class TestWsToken:
    def test_requires_auth(self, client):
        client.cookies.clear()
        resp = client.get("/api/auth/ws-token")
        assert resp.status_code == 401

    def test_returns_short_lived_jwt_for_cookie_session(self, client):
        from app.core.config import settings

        _login(client)
        resp = client.get("/api/auth/ws-token")
        assert resp.status_code == 200
        body = resp.json()
        assert body["expires_in"] == 120
        payload = jwt.decode(
            body["token"], settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        assert payload["sub"] == "admin"
        assert payload["scope"] == "ws"

    def test_ws_token_accepted_by_websocket_endpoint(self, client):
        _login(client)
        token = client.get("/api/auth/ws-token").json()["token"]
        # Handshake via Sec-WebSocket-Protocol (Auth-Prio 1 des WS-Endpoints)
        with client.websocket_connect("/ws/prices", subprotocols=[token]) as ws:
            greeting = ws.receive_json()
            assert greeting.get("type") == "connected"
            assert greeting.get("channel") == "prices"


class TestWsOriginAndCookieHardening:
    def test_ws_rejects_foreign_origin(self, client):
        from starlette.websockets import WebSocketDisconnect

        _login(client)
        token = client.get("/api/auth/ws-token").json()["token"]
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(
                "/ws/prices",
                subprotocols=[token],
                headers={"Origin": "https://evil.example"},
            ) as ws:
                ws.receive_json()

    def test_ws_allows_allowlisted_origin(self, client):
        _login(client)
        token = client.get("/api/auth/ws-token").json()["token"]
        with client.websocket_connect(
            "/ws/prices",
            subprotocols=[token],
            headers={"Origin": "http://localhost:3000"},
        ) as ws:
            assert ws.receive_json().get("type") == "connected"

    def test_login_sets_samesite_lax_cookies(self, client):
        client.cookies.clear()
        resp = client.post(
            "/api/auth/token",
            data={"username": "admin", "password": "neural123"},
        )
        assert resp.status_code == 200
        set_cookies = [
            v for k, v in resp.headers.multi_items() if k.lower() == "set-cookie"
        ]
        assert set_cookies, "no Set-Cookie headers on login"
        for cookie in set_cookies:
            assert "samesite=lax" in cookie.lower(), cookie
