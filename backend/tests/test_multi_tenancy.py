"""
Multi-Tenancy & Endpoint-Isolation Tests — P0-3 / P0-4.

Covers:
  - /api/portfolio/* (8 GET endpoints) now require authentication.
  - /api/brokers/* and /api/p2p/* require the ADMIN role (real broker/P2P
    account data), not just "any logged-in user".
  - /api/execution/orders order history is scoped to the submitting user.

Uses its own isolated app + throwaway SQLite DB (same bootstrap pattern as
test_billing_webhook.py). Unlike tests/test_routes.py's `client` fixture,
this one does NOT mock get_execution_client — order-history isolation needs
the real paper-trading singleton + DB persistence. Only the yfinance price
lookup is mocked (via app.services.nautilus.client._fetch_price) so no
network calls happen.

Run:
    cd dashboard/backend
    pytest tests/test_multi_tenancy.py -v
"""
import asyncio
import os
import tempfile
import uuid
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def app_module():
    db_fd, db_path = tempfile.mkstemp(suffix=".db", prefix="test_tenancy_")
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


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

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


def _trader_auth(client) -> dict:
    uname = f"trader_{uuid.uuid4().hex[:10]}"
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
# Portfolio — must require auth
# ---------------------------------------------------------------------------

_PORTFOLIO_PATHS = [
    "/api/portfolio/prices",
    "/api/portfolio/snapshot",
    "/api/portfolio/",
    "/api/portfolio/positions",
    "/api/portfolio/analytics",
    "/api/portfolio/candles",
    "/api/portfolio/equity-curve",
    "/api/portfolio/performance",
]


class TestPortfolioRequiresAuth:
    @pytest.mark.parametrize("path", _PORTFOLIO_PATHS)
    def test_401_without_auth(self, client, path):
        resp = client.get(path)
        assert resp.status_code == 401, f"{path} must require auth, got {resp.status_code}: {resp.text[:200]}"

    def test_snapshot_200_with_auth(self, client):
        headers = _admin_auth(client)
        resp = client.get("/api/portfolio/snapshot", headers=headers)
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Brokers — admin-only
# ---------------------------------------------------------------------------

class TestBrokersAdminOnly:
    def test_status_401_without_auth(self, client):
        resp = client.get("/api/brokers/status")
        assert resp.status_code == 401

    def test_status_403_for_non_admin(self, client):
        headers, _uname = _trader_auth(client)
        resp = client.get("/api/brokers/status", headers=headers)
        assert resp.status_code == 403, f"Expected 403 for non-admin, got {resp.status_code}: {resp.text}"

    def test_status_200_for_admin(self, client):
        headers = _admin_auth(client)
        resp = client.get("/api/brokers/status", headers=headers)
        assert resp.status_code == 200

    def test_summary_403_for_non_admin(self, client):
        headers, _uname = _trader_auth(client)
        resp = client.get("/api/brokers/summary", headers=headers)
        assert resp.status_code == 403

    def test_flatex_sync_403_for_non_admin(self, client):
        """The PIN-carrying Flatex sync endpoint must be admin-only."""
        headers, _uname = _trader_auth(client)
        resp = client.post("/api/brokers/flatex/sync", json={"pin": "1234"}, headers=headers)
        assert resp.status_code == 403

    def test_flatex_sync_401_without_auth(self, client):
        resp = client.post("/api/brokers/flatex/sync", json={"pin": "1234"})
        assert resp.status_code == 401

    def test_bitpanda_403_for_non_admin(self, client):
        headers, _uname = _trader_auth(client)
        resp = client.get("/api/brokers/bitpanda", headers=headers)
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# P2P — admin-only
# ---------------------------------------------------------------------------

class TestP2PAdminOnly:
    def test_summary_401_without_auth(self, client):
        resp = client.get("/api/p2p/summary")
        assert resp.status_code == 401

    def test_summary_403_for_non_admin(self, client):
        headers, _uname = _trader_auth(client)
        resp = client.get("/api/p2p/summary", headers=headers)
        assert resp.status_code == 403, f"Expected 403 for non-admin, got {resp.status_code}: {resp.text}"

    def test_summary_200_for_admin(self, client):
        headers = _admin_auth(client)
        resp = client.get("/api/p2p/summary", headers=headers)
        assert resp.status_code == 200

    def test_mintos_403_for_non_admin(self, client):
        headers, _uname = _trader_auth(client)
        resp = client.get("/api/p2p/mintos", headers=headers)
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Execution — order history is scoped to the submitting user
# ---------------------------------------------------------------------------

class TestOrderHistoryIsolation:
    def test_orders_are_scoped_per_user(self, client):
        admin_headers = _admin_auth(client)
        trader_headers, trader_uname = _trader_auth(client)

        with patch("app.services.nautilus.client._fetch_price", return_value=123.45):
            admin_order = client.post(
                "/api/execution/order",
                json={"ticker": "TENANTTEST_ADMIN", "side": "buy", "quantity": 1.0, "order_type": "market"},
                headers=admin_headers,
            )
            trader_order = client.post(
                "/api/execution/order",
                json={"ticker": "TENANTTEST_TRADER", "side": "buy", "quantity": 1.0, "order_type": "market"},
                headers=trader_headers,
            )

        assert admin_order.status_code == 200, admin_order.text
        assert trader_order.status_code == 200, trader_order.text
        assert admin_order.json()["status"] == "filled"
        assert trader_order.json()["status"] == "filled"

        admin_history = client.get("/api/execution/orders?limit=500", headers=admin_headers).json()
        trader_history = client.get("/api/execution/orders?limit=500", headers=trader_headers).json()

        admin_tickers = {o["ticker"] for o in admin_history}
        trader_tickers = {o["ticker"] for o in trader_history}

        assert "TENANTTEST_ADMIN" in admin_tickers, "Admin must see their own order"
        assert "TENANTTEST_TRADER" not in admin_tickers, "Admin must NOT see the trader's order"

        assert "TENANTTEST_TRADER" in trader_tickers, "Trader must see their own order"
        assert "TENANTTEST_ADMIN" not in trader_tickers, "Trader must NOT see the admin's order"

    def test_orders_require_auth(self, client):
        resp = client.get("/api/execution/orders")
        assert resp.status_code == 401
