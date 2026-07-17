"""
Regression tests for the 2026-07 security audit fix package (P0–P2).

Covers, one block per finding:
  P0-1  FinTS SSRF guard on ``fints_url``
  P0-2  Backtest job BOLA/IDOR (owner scoping + auth)
  P1-1  Telegram webhook secret-token derivation
  P1-2  settings /credentials is admin-only
  P1-3  report access gate (auth-or-token in hardened env)
  P1-4  signal quota fails CLOSED on DB error
  P1-5  webhook delivery re-validates URL (DNS-rebinding TOCTOU)
  P2-9  CSV formula-injection neutralisation + learning batch cap
"""
import os
import tempfile
import uuid

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# App / client fixtures (module-scoped, isolated throwaway DB)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def app_module():
    db_fd, db_path = tempfile.mkstemp(suffix=".db", prefix="test_audit_")
    os.close(db_fd)
    os.environ["TRADING_DB_PATH"] = db_path
    os.environ.pop("DATABASE_URL", None)

    from app.main import app
    app.state.limiter.enabled = False
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.state.limiter.enabled = True
    try:
        os.remove(db_path)
    except OSError:
        pass


@pytest.fixture
def client(app_module):
    app_module.cookies.clear()
    yield app_module
    app_module.cookies.clear()


def _admin_auth(client) -> dict:
    resp = client.post(
        "/api/auth/token",
        data={"username": "admin", "password": "neural123"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    client.cookies.clear()
    return {"Authorization": f"Bearer {token}"}


def _trader_auth(client) -> tuple[dict, str]:
    uname = f"aud_{uuid.uuid4().hex[:10]}"
    reg = client.post("/api/auth/register", json={
        "username": uname,
        "email": f"{uname}@example.com",
        "password": "Password1!",
        "gdpr_consent": True,
    })
    assert reg.status_code in (200, 201), reg.text
    tok = client.post(
        "/api/auth/token",
        data={"username": uname, "password": "Password1!"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert tok.status_code == 200, tok.text
    client.cookies.clear()
    return {"Authorization": f"Bearer {tok.json()['access_token']}"}, uname


# ---------------------------------------------------------------------------
# P0-2 — Backtest job BOLA/IDOR
# ---------------------------------------------------------------------------

class TestBacktestJobIsolation:
    def _start_job(self, client, headers) -> str:
        resp = client.post(
            "/api/backtest/run",
            json={
                "strategy_name": "Buy & Hold",
                "ticker": "AAPL",
                "start_date": "2023-01-01",
                "end_date": "2023-06-01",
                "initial_capital": 10000.0,
                "engine": "jesse",
                "params": {},
            },
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        return resp.json()["job_id"]

    def test_foreign_job_status_is_404(self, client):
        admin = _admin_auth(client)
        job_id = self._start_job(client, admin)
        trader, _ = _trader_auth(client)
        # Another user must not see the admin's job — treated as non-existent.
        assert client.get(f"/api/backtest/jobs/{job_id}", headers=trader).status_code == 404
        assert client.get(f"/api/backtest/results/{job_id}", headers=trader).status_code == 404
        assert client.get(f"/api/backtest/export/{job_id}", headers=trader).status_code == 404
        assert client.delete(f"/api/backtest/jobs/{job_id}", headers=trader).status_code == 404

    def test_job_list_is_owner_scoped(self, client):
        admin = _admin_auth(client)
        job_id = self._start_job(client, admin)
        trader, _ = _trader_auth(client)
        ids = [j["id"] for j in client.get("/api/backtest/jobs", headers=trader).json()]
        assert job_id not in ids

    def test_result_and_export_require_auth(self, client):
        # Previously fully anonymous — now must be 401 without credentials.
        assert client.get("/api/backtest/results/whatever").status_code == 401
        assert client.get("/api/backtest/export/whatever").status_code == 401
        assert client.get("/api/backtest/jobs/whatever").status_code == 401

    def test_owner_can_still_see_own_job(self, client):
        admin = _admin_auth(client)
        job_id = self._start_job(client, admin)
        assert client.get(f"/api/backtest/jobs/{job_id}", headers=admin).status_code == 200


# ---------------------------------------------------------------------------
# P1-2 — settings /credentials admin-only
# ---------------------------------------------------------------------------

class TestCredentialStatusAdminOnly:
    def test_trader_forbidden(self, client):
        trader, _ = _trader_auth(client)
        assert client.get("/api/settings/credentials", headers=trader).status_code == 403

    def test_admin_allowed(self, client):
        admin = _admin_auth(client)
        assert client.get("/api/settings/credentials", headers=admin).status_code == 200

    def test_anonymous_unauthorized(self, client):
        assert client.get("/api/settings/credentials").status_code == 401


# ---------------------------------------------------------------------------
# P2 — learning youtube_batch cap
# ---------------------------------------------------------------------------

class TestLearningBatchCap:
    def test_oversized_batch_rejected(self, client):
        admin = _admin_auth(client)
        resp = client.post(
            "/api/learning/jobs/trigger",
            json={"job_type": "youtube_batch", "video_ids": [f"v{i:05d}xxxxx" for i in range(21)]},
            headers=admin,
        )
        assert resp.status_code == 422, resp.text


# ---------------------------------------------------------------------------
# P0-1 — FinTS SSRF guard
# ---------------------------------------------------------------------------

class TestFinTSSSRFGuard:
    def test_metadata_url_rejected(self, client):
        admin = _admin_auth(client)
        resp = client.post(
            "/api/bank/sync",
            json={
                "blz": "12345678",
                "username": "user1",
                "pin": "1234",
                "fints_url": "http://169.254.169.254/latest/meta-data/",
            },
            headers=admin,
        )
        assert resp.status_code == 400, resp.text
        assert "nicht erlaubt" in resp.text.lower() or "url" in resp.text.lower()


# ---------------------------------------------------------------------------
# Pure-unit tests (no app / DB needed)
# ---------------------------------------------------------------------------

class TestCsvSafe:
    def test_neutralises_formula_prefixes(self):
        from app.core.csv_safety import csv_safe
        for danger in ("=cmd", "+1", "-1+1", "@SUM", "\ttab", "\rcr"):
            out = csv_safe(danger)
            assert out.startswith("'"), f"{danger!r} not neutralised"

    def test_leaves_safe_values_untouched(self):
        from app.core.csv_safety import csv_safe
        assert csv_safe("AAPL") == "AAPL"
        assert csv_safe("BUY") == "BUY"
        assert csv_safe(42) == 42
        assert csv_safe("") == ""


class TestFinTSValidateUnit:
    def test_internal_url_raises(self):
        from app.services.fints.client import _validate_fints_url
        from app.services.webhooks.client import WebhookURLError
        with pytest.raises(WebhookURLError):
            _validate_fints_url("http://169.254.169.254/")

    def test_public_https_ok(self):
        from app.services.fints.client import _validate_fints_url
        # comdirect production endpoint — resolves to a public address.
        _validate_fints_url("https://fints.comdirect.de/fints")


@pytest.mark.asyncio
class TestTelegramWebhookSecret:
    async def test_derived_secret_stable_and_nonempty(self, monkeypatch):
        import app.services.telegram.client as tc
        monkeypatch.setattr(tc, "_get_token", lambda: _async_return("BOT:TOKEN-123"))
        # No explicit setting → derived from token, deterministic.
        s1 = await tc.resolve_webhook_secret()
        s2 = await tc.resolve_webhook_secret()
        assert s1 and s1 == s2 and len(s1) == 64

    async def test_empty_without_token(self, monkeypatch):
        import app.services.telegram.client as tc
        monkeypatch.setattr(tc, "_get_token", lambda: _async_return(""))
        assert await tc.resolve_webhook_secret() == ""


@pytest.mark.asyncio
class TestReportAccessGate:
    async def test_hardened_anon_rejected(self, monkeypatch):
        import app.api.routes.report as rep
        monkeypatch.setattr(rep, "is_hardened_environment", lambda: True)
        monkeypatch.setattr(rep.settings, "REPORT_SHARE_TOKEN", "", raising=False)
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as ei:
            await rep.verify_report_access(key=None, x_report_key=None, current_user=None)
        assert ei.value.status_code == 401

    async def test_authenticated_user_ok(self, monkeypatch):
        import app.api.routes.report as rep
        from app.api.auth import UserInfo
        monkeypatch.setattr(rep, "is_hardened_environment", lambda: True)
        user = UserInfo(username="u", role="trader", tier="free")
        # Should NOT raise.
        await rep.verify_report_access(key=None, x_report_key=None, current_user=user)


@pytest.mark.asyncio
class TestQuotaFailClosed:
    async def test_db_error_raises_503(self, monkeypatch):
        import app.api.routes.signals as sig
        from app.api.auth import UserInfo
        from fastapi import HTTPException

        class _BoomSession:
            async def __aenter__(self):
                raise RuntimeError("db down")

            async def __aexit__(self, *a):
                return False

        # _check_signal_quota imports get_session from app.db.database inside the
        # function body, so patch it at the source module.
        monkeypatch.setattr("app.db.database.get_session", lambda: _BoomSession())
        user = UserInfo(username="quotauser", role="trader", tier="free")
        with pytest.raises(HTTPException) as ei:
            await sig._check_signal_quota(user)
        assert ei.value.status_code == 503


@pytest.mark.asyncio
class TestWebhookDeliveryTOCTOU:
    async def test_delivery_blocks_internal_target(self, monkeypatch):
        import app.services.webhooks.client as wh
        monkeypatch.setattr(wh, "is_hardened_environment", lambda: True, raising=False)
        reg = wh.WebhookRegistration(
            id="x", url="http://169.254.169.254/hook",
            events=["signal.generated"], secret="s",
        )
        status = await wh.WebhookManager()._deliver(reg, {"event": "signal.generated", "data": {}})
        assert status == 0
        assert reg.delivery_failures == 1


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _async_return(v):
    """Return a coroutine that yields v — for monkeypatching async funcs."""
    async def _coro(*a, **k):
        return v
    return _coro()
