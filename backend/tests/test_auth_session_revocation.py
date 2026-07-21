"""
F-14 (server-side session revocation) + F-16 (CORS/CSRF Origin allow-list).

F-14: bumping a user's token_version (logout, password change/reset, account
deletion) must invalidate ALL previously issued tokens — HTTP and WebSocket —
on their next use. Old cookie → 401; old ws-token → rejected.

F-16: cookie-authenticated state-changing requests must reject look-alike /
null / foreign Origins even when a valid CSRF Double-Submit token is present.
"""
import os
import tempfile

import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from fastapi.testclient import TestClient
from starlette.requests import Request


@pytest.fixture(scope="module")
def client():
    db_fd, db_path = tempfile.mkstemp(suffix=".db", prefix="test_sess_revoke_")
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


_PW = "Str0ngPass!23"
_NEW_PW = "N3wStr0ng!45"


def _register(client, username, email, password=_PW):
    return client.post(
        "/api/auth/register",
        json={
            "username": username,
            "email": email,
            "password": password,
            "gdpr_consent": True,
        },
    )


def _login(client, username, password=_PW):
    return client.post("/api/auth/token", data={"username": username, "password": password})


def _csrf(client) -> str:
    return client.cookies.get("csrf_token") or ""


# ---------------------------------------------------------------------------
# F-14 — HTTP session revocation
# ---------------------------------------------------------------------------

class TestHttpRevocation:
    def test_password_change_invalidates_old_session(self, client):
        client.cookies.clear()
        assert _register(client, "revoke_a", "revoke_a@example.com").status_code in (201, 409)
        assert _login(client, "revoke_a").status_code == 200
        # Session is valid.
        assert client.get("/api/auth/me").status_code == 200

        # Change password (bumps token_version → revokes all prior tokens).
        r = client.post(
            "/api/auth/change-password",
            json={"current_password": _PW, "new_password": _NEW_PW},
            headers={"X-CSRF-Token": _csrf(client)},
        )
        assert r.status_code == 200, r.text

        # The still-held old cookie is now from a revoked generation → 401.
        assert client.get("/api/auth/me").status_code == 401

    def test_logout_revokes_session_server_side(self, client):
        client.cookies.clear()
        assert _register(client, "revoke_b", "revoke_b@example.com").status_code in (201, 409)
        assert _login(client, "revoke_b").status_code == 200
        old_auth = client.cookies.get("access_token")
        assert client.get("/api/auth/me").status_code == 200

        # Logout bumps token_version server-side.
        assert client.post("/api/auth/logout", headers={"X-CSRF-Token": _csrf(client)}).status_code == 200

        # Re-present the OLD access token cookie explicitly (logout cleared the jar).
        r = client.get("/api/auth/me", cookies={"access_token": old_auth})
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# F-14 — WebSocket token revocation (server-side)
# ---------------------------------------------------------------------------

class TestWsRevocation:
    async def test_ws_token_rejected_after_revocation(self, client):
        from app.api.auth import _verify_ws_token

        client.cookies.clear()
        assert _register(client, "revoke_ws", "revoke_ws@example.com").status_code in (201, 409)
        assert _login(client, "revoke_ws").status_code == 200
        ws_token = client.get("/api/auth/ws-token").json()["token"]

        # Valid before revocation.
        assert await _verify_ws_token(ws_token) == "revoke_ws"

        # Change password → bump version.
        client.post(
            "/api/auth/change-password",
            json={"current_password": _PW, "new_password": _NEW_PW},
            headers={"X-CSRF-Token": _csrf(client)},
        )
        # Old ws-token now rejected (fail-closed).
        assert await _verify_ws_token(ws_token) is None


# ---------------------------------------------------------------------------
# F-16 — Origin/Referer allow-list
# ---------------------------------------------------------------------------

def _req(headers: dict, method: str = "POST") -> Request:
    raw = [(k.lower().encode(), v.encode()) for k, v in headers.items()]
    scope = {"type": "http", "method": method, "headers": raw, "path": "/", "query_string": b""}
    return Request(scope)


class TestOriginAllowlist:
    def _patch_allow(self, monkeypatch):
        monkeypatch.setattr(
            "app.core.config.cors_allowed_origins",
            lambda: ["https://app.example", "https://neuraltrading.io"],
        )

    def test_rejects_null_origin(self, monkeypatch):
        from app.api.auth import _check_origin_allowlist
        self._patch_allow(monkeypatch)
        with pytest.raises(Exception) as e:
            _check_origin_allowlist(_req({"origin": "null"}))
        assert e.value.status_code == 403

    def test_rejects_foreign_origin(self, monkeypatch):
        from app.api.auth import _check_origin_allowlist
        self._patch_allow(monkeypatch)
        with pytest.raises(Exception) as e:
            _check_origin_allowlist(_req({"origin": "https://evil.example"}))
        assert e.value.status_code == 403

    def test_rejects_lookalike_suffix_origin(self, monkeypatch):
        from app.api.auth import _check_origin_allowlist
        self._patch_allow(monkeypatch)
        for bad in ("https://neuraltrading.io.evil.com", "https://evil-neuraltrading.io"):
            with pytest.raises(Exception) as e:
                _check_origin_allowlist(_req({"origin": bad}))
            assert e.value.status_code == 403

    def test_accepts_allowlisted_origin(self, monkeypatch):
        from app.api.auth import _check_origin_allowlist
        self._patch_allow(monkeypatch)
        _check_origin_allowlist(_req({"origin": "https://app.example"}))  # no raise

    def test_missing_origin_falls_back(self, monkeypatch):
        from app.api.auth import _check_origin_allowlist
        self._patch_allow(monkeypatch)
        _check_origin_allowlist(_req({}))  # no raise → double-submit token governs

    def test_referer_origin_checked(self, monkeypatch):
        from app.api.auth import _check_origin_allowlist
        self._patch_allow(monkeypatch)
        with pytest.raises(Exception) as e:
            _check_origin_allowlist(_req({"referer": "https://evil.example/some/path"}))
        assert e.value.status_code == 403
        _check_origin_allowlist(_req({"referer": "https://app.example/dashboard"}))  # no raise


class TestOriginAllowlistEndToEnd:
    def test_state_change_with_evil_origin_blocked(self, client):
        client.cookies.clear()
        assert _register(client, "origin_e2e", "origin_e2e@example.com").status_code in (201, 409)
        assert _login(client, "origin_e2e").status_code == 200
        # Valid CSRF token but a foreign Origin → must be blocked (403).
        r = client.post(
            "/api/auth/change-password",
            json={"current_password": _PW, "new_password": _NEW_PW},
            headers={"X-CSRF-Token": _csrf(client), "Origin": "https://evil.example"},
        )
        assert r.status_code == 403, r.text
