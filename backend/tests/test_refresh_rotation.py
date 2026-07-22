"""
F-14 — refresh-token family rotation + replay detection (module-level).
Also smoke-tests the F-14 config flag default and the scan-cost admin endpoint.
"""
import os
import tempfile

import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    db_fd, db_path = tempfile.mkstemp(suffix=".db", prefix="test_refresh_")
    os.close(db_fd)
    os.environ["TRADING_DB_PATH"] = db_path
    os.environ.pop("DATABASE_URL", None)
    mock_nautilus = MagicMock()
    mock_nautilus.initialize = AsyncMock(return_value=None)
    mock_nautilus.get_positions = AsyncMock(return_value=[])
    with patch("app.services.nautilus.client.get_execution_client", return_value=mock_nautilus):
        from app.main import app
        app.state.limiter.enabled = False
        with TestClient(app, raise_server_exceptions=False) as c:
            yield c
        app.state.limiter.enabled = True
    try:
        os.remove(db_path)
    except OSError:
        pass


class TestRefreshRotation:
    async def test_rotate_invalidates_old_token(self, client):
        from app.core import refresh_tokens as rt
        raw = await rt.issue("rot_a")
        rotated = await rt.rotate(raw)
        assert rotated is not None
        new_raw, uname = rotated
        assert uname == "rot_a" and new_raw != raw
        # New token rotates fine.
        assert await rt.rotate(new_raw) is not None
        # Old token replayed → theft signal.
        with pytest.raises(rt.RefreshReplayError):
            await rt.rotate(raw)

    async def test_replay_revokes_entire_family(self, client):
        from app.core import refresh_tokens as rt
        raw1 = await rt.issue("rot_b")
        res = await rt.rotate(raw1)               # gen1 -> gen2
        assert res is not None
        new_raw = res[0]
        # Replay the consumed gen1 → whole family revoked.
        with pytest.raises(rt.RefreshReplayError):
            await rt.rotate(raw1)
        # The (previously valid) gen2 is now revoked too → replay/invalid.
        with pytest.raises((rt.RefreshReplayError, rt.RefreshInvalidError)):
            await rt.rotate(new_raw)

    async def test_unknown_token_returns_none(self, client):
        from app.core import refresh_tokens as rt
        assert await rt.rotate("this-is-not-a-real-token") is None
        assert await rt.rotate("") is None

    async def test_revoke_user_kills_tokens(self, client):
        from app.core import refresh_tokens as rt
        raw = await rt.issue("rot_c")
        await rt.revoke_user("rot_c")
        with pytest.raises(rt.RefreshReplayError):
            await rt.rotate(raw)


class TestFlagDefaultOff:
    def test_rotation_disabled_by_default(self):
        from app.core.config import settings
        # Safe default: deploying does not change /refresh behaviour.
        assert settings.REFRESH_ROTATION_ENABLED is False


_PW2 = "R0tateStr0ng!7"


class TestRefreshRotationE2E:
    """Full HTTP flow with the flag ON — proves it before flipping prod."""

    def _register_login(self, client, user):
        client.cookies.clear()
        client.post("/api/auth/register", json={
            "username": user, "email": f"{user}@example.com",
            "password": _PW2, "gdpr_consent": True,
        })
        r = client.post("/api/auth/token", data={"username": user, "password": _PW2})
        assert r.status_code == 200, r.text

    def test_rotation_and_replay_over_http(self, client, monkeypatch):
        from app.core.config import settings
        monkeypatch.setattr(settings, "REFRESH_ROTATION_ENABLED", True)

        self._register_login(client, "e2e_rot")
        # Login issued a refresh cookie.
        old_refresh = client.cookies.get("refresh_token")
        assert old_refresh, "login should set a refresh_token cookie when enabled"
        csrf = client.cookies.get("csrf_token") or ""

        # First /refresh rotates the token successfully.
        r1 = client.post("/api/auth/refresh", headers={"X-CSRF-Token": csrf})
        assert r1.status_code == 200, r1.text
        new_refresh = client.cookies.get("refresh_token")
        assert new_refresh and new_refresh != old_refresh  # rotated

        # Replaying the OLD (consumed) refresh cookie → 401 + family revoked.
        replay = client.post(
            "/api/auth/refresh",
            headers={"X-CSRF-Token": csrf},
            cookies={"refresh_token": old_refresh,
                     "access_token": client.cookies.get("access_token"),
                     "csrf_token": csrf},
        )
        assert replay.status_code == 401, replay.text


class TestScanCostEndpoint:
    def test_scan_cost_requires_admin(self, client):
        client.cookies.clear()
        r = client.get("/api/admin/scan-cost")
        assert r.status_code in (401, 403)

    def test_scan_cost_returns_shape_for_admin(self, client):
        client.cookies.clear()
        login = client.post("/api/auth/token", data={"username": "admin", "password": "neural123"})
        if login.status_code != 200:
            pytest.skip("demo admin not available in this environment")
        r = client.get("/api/admin/scan-cost")
        if r.status_code == 403:
            pytest.skip("demo admin lacks admin role in this environment")
        assert r.status_code == 200, r.text
        body = r.json()
        for key in ("date_utc", "scanner_enabled", "spent_usd", "cap_usd", "analyses_count", "recent_signals"):
            assert key in body
        assert isinstance(body["recent_signals"], list)
