"""
F-23 — proxy-IP trust + request-body size limit (DoS / rate-limit-bypass).

client_ip_key must derive the rate-limit key from the trusted proxy's appended
address (right-most X-Forwarded-For hop), NOT the client-controllable left-most
entry — otherwise an attacker mints a fresh bucket per request by forging XFF.
Oversized request bodies must be rejected early with 413.
"""
import os
import tempfile

import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from starlette.requests import Request
from fastapi.testclient import TestClient


def _req(headers: dict) -> Request:
    raw = [(k.lower().encode(), v.encode()) for k, v in headers.items()]
    scope = {
        "type": "http", "method": "POST", "path": "/", "query_string": b"",
        "headers": raw, "client": ("10.0.0.1", 1234),
    }
    return Request(scope)


class TestClientIpKey:
    def test_rightmost_xff_is_used_not_spoofable_leftmost(self, monkeypatch):
        import app.core.rate_limits as rl
        monkeypatch.setattr(rl, "_TRUST_PROXY", True)
        monkeypatch.setattr(rl, "_TRUSTED_PROXY_HOPS", 1)
        # Attacker forges "1.2.3.4" as the left-most entry; the trusted edge
        # proxy appended the REAL client "203.0.113.9" as the right-most hop.
        key = rl.client_ip_key(_req({"x-forwarded-for": "1.2.3.4, 203.0.113.9"}))
        assert key == "203.0.113.9"

    def test_spoofed_prefix_cannot_change_bucket(self, monkeypatch):
        import app.core.rate_limits as rl
        monkeypatch.setattr(rl, "_TRUST_PROXY", True)
        monkeypatch.setattr(rl, "_TRUSTED_PROXY_HOPS", 1)
        # Same real client, different forged prefixes → SAME rate-limit key.
        k1 = rl.client_ip_key(_req({"x-forwarded-for": "9.9.9.9, 203.0.113.9"}))
        k2 = rl.client_ip_key(_req({"x-forwarded-for": "8.8.8.8, 203.0.113.9"}))
        assert k1 == k2 == "203.0.113.9"

    def test_single_value_still_works(self, monkeypatch):
        import app.core.rate_limits as rl
        monkeypatch.setattr(rl, "_TRUST_PROXY", True)
        monkeypatch.setattr(rl, "_TRUSTED_PROXY_HOPS", 1)
        assert rl.client_ip_key(_req({"x-forwarded-for": "203.0.113.9"})) == "203.0.113.9"

    def test_no_trust_ignores_xff(self, monkeypatch):
        import app.core.rate_limits as rl
        monkeypatch.setattr(rl, "_TRUST_PROXY", False)
        # With proxy trust off, forged XFF is ignored; falls back to peer.
        assert rl.client_ip_key(_req({"x-forwarded-for": "1.2.3.4"})) == "10.0.0.1"


@pytest.fixture(scope="module")
def client():
    db_fd, db_path = tempfile.mkstemp(suffix=".db", prefix="test_bodylimit_")
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


class TestBodySizeLimit:
    def test_oversized_body_rejected_413(self, client):
        big = "x" * (2 * 1024 * 1024)  # 2 MiB > 1 MiB default cap
        r = client.post("/api/auth/token", content=big,
                        headers={"Content-Type": "application/x-www-form-urlencoded"})
        assert r.status_code == 413, r.status_code

    def test_normal_body_passes(self, client):
        # A normal (wrong-credentials) login is not blocked by the size limit.
        r = client.post("/api/auth/token",
                        data={"username": "nobody", "password": "whatever"})
        assert r.status_code in (401, 422), r.status_code
